package com.vanta.privacywallet

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.concurrent.Executor
import org.json.JSONObject

/**
 * "Is this the person who owns this wallet?" — asked with the system prompt,
 * before a spend is signed.
 *
 * Why this is here at all: the app signs with a key it holds itself, and until now
 * anyone holding the unlocked phone could move a private balance by tapping twice.
 * The device screen lock does not help — the app is already open past it. The
 * biometric prompt is the one gate that asks the person holding the phone rather
 * than the phone itself.
 *
 * Why the PLATFORM prompt and not `androidx.biometric`: that artifact is still on
 * 1.4.0-alphaXX, and its `BiometricPrompt` requires a `FragmentActivity` while
 * this app's only Activity is a `ComponentActivity`. The platform class has
 * shipped since API 28, needs zero new dependencies, and shows the same system UI
 * the androidx wrapper would.
 *
 * Why there is no user-facing toggle (deliberate): a settings switch would turn
 * this into "a feature you can turn off", and an extra control is exactly what
 * this app is trying not to add. The gate is not optional once the device can
 * answer it — see [request] for the one thing it CAN do, which is get out of the
 * way.
 *
 * The answer arrives asynchronously, on the system's own schedule, so the shape is
 * request/response: [request] reports what happened to the PROMPT, and the
 * caller's callback carries what happened to the PERSON. `VantaShellBridge`
 * forwards that callback back into the WebView.
 */
object BiometricGate {
    private const val TAG = "WebShell"

    private val mainHandler = Handler(Looper.getMainLooper())
    private val mainExecutor = Executor { command -> mainHandler.post(command) }

    // The prompt is a dialog the system shows on our behalf; it has to stay
    // referenced for as long as it is up or it can be collected mid-flow.
    @Volatile private var promptRef: BiometricPrompt? = null
    @Volatile private var signalRef: CancellationSignal? = null

    /**
     * Can this device answer the question at all? The test is "is there a secure
     * screen lock", and that is the whole of it.
     *
     * Android refuses to enroll a fingerprint or a face until a screen lock
     * exists, so a lock screen is a necessary condition for every biometric. It is
     * also a SUFFICIENT one here, because the prompt is built with
     * `DEVICE_CREDENTIAL` allowed: on a phone whose biometrics are not enrolled,
     * or whose sensor will not read a wet finger today, the system falls back to
     * the PIN/pattern screen and the gate still answers.
     *
     * Which means: no `BiometricManager` availability query, no enrollment check,
     * and no API-level branch for either — the one fact that matters is one call.
     * A phone with no screen lock has nothing to check against, so it reports
     * unavailable and the spend proceeds; an emulator is exactly that phone, which
     * is what keeps the gate from hard-blocking testing.
     */
    private fun hasSomethingToCheckAgainst(context: Context): Boolean {
        val keyguard = context.getSystemService(KeyguardManager::class.java)
        return keyguard?.isDeviceSecure == true
    }

    /**
     * The immediate answer to the JS call. `unavailable: true` is the one case the
     * caller must read as "carry on" rather than "refuse" — see
     * `src/lib/biometric.js`, which owns that policy.
     */
    private fun unavailable(reason: String): String =
        JSONObject()
            .put("ok", false)
            .put("unavailable", true)
            .put("error", reason)
            .toString()

    /** The payload handed back to the WebView once the prompt has closed. */
    private fun payload(
        requestId: String,
        ok: Boolean,
        cancelled: Boolean,
        error: String?,
    ): String =
        JSONObject()
            .put("id", requestId)
            .put("ok", ok)
            .put("cancelled", cancelled)
            .put("error", error ?: "")
            .toString()

    /**
     * @return JSON — either `{ok:true}` (the prompt is up; the outcome arrives
     *         through [onResult]), or `{ok:false, unavailable:true, error:"…"}`
     *         when there is nothing on this device to prompt with.
     */
    fun request(
        activityContext: Context,
        requestId: String,
        title: String,
        subtitle: String,
        onResult: (String) -> Unit,
    ): String {
        val activity =
            activityContext as? Activity
                ?: return unavailable("this build has no activity to prompt from")
        if (!hasSomethingToCheckAgainst(activity)) {
            return unavailable("this phone has no screen lock to check against")
        }

        val builder =
            BiometricPrompt.Builder(activity)
                .setTitle(title.ifBlank { "Confirm" })
                .setSubtitle(subtitle)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Biometric OR device credential. WEAK rather than STRONG on purpose:
            // a face unlock the device itself trusts is a legitimate "it is you",
            // and STRONG would silently disable the gate on every phone whose only
            // enrolled factor is a weaker one. The credential half is the escape
            // hatch described above.
            builder.setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_WEAK or
                    BiometricManager.Authenticators.DEVICE_CREDENTIAL,
            )
        } else {
            // API 29 only: the same intent, through the method it had instead.
            @Suppress("DEPRECATION")
            builder.setDeviceCredentialAllowed(true)
        }

        val cancellation = CancellationSignal()
        signalRef = cancellation

        val callback =
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult?) {
                    deliver(onResult, payload(requestId, ok = true, cancelled = false, error = null))
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence?) {
                    Log.i(TAG, "[biometric] error $errorCode: ${errString ?: ""}")
                    deliver(
                        onResult,
                        payload(
                            requestId = requestId,
                            ok = false,
                            cancelled = isCancellation(errorCode),
                            error = describe(errorCode),
                        ),
                    )
                }

                override fun onAuthenticationFailed() {
                    // One unreadable finger. The prompt stays up and the system
                    // owns the retry, so reporting here would abort a spend the
                    // user is still in the middle of confirming.
                }
            }

        // authenticate() has to run on the main thread, and the JS call that got
        // us here is on the WebView's bridge thread.
        mainHandler.post {
            try {
                val prompt = builder.build()
                promptRef = prompt
                prompt.authenticate(cancellation, mainExecutor, callback)
            } catch (err: Exception) {
                Log.w(TAG, "biometric prompt failed: ${err.message}", err)
                deliver(
                    onResult,
                    payload(
                        requestId = requestId,
                        ok = false,
                        cancelled = false,
                        error = err.message ?: "the system refused to show the prompt",
                    ),
                )
            }
        }

        return JSONObject().put("ok", true).toString()
    }

    private fun deliver(
        onResult: (String) -> Unit,
        body: String,
    ) {
        promptRef = null
        signalRef = null
        onResult(body)
    }

    /** A cancel is a decision, not a failure, and the UI should stay quiet for it. */
    private fun isCancellation(errorCode: Int): Boolean =
        errorCode == BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED ||
            errorCode == BiometricPrompt.BIOMETRIC_ERROR_CANCELED

    /**
     * Our own copy, not the system's. `errString` is written for developers
     * ("Fingerprint operation canceled.") and it was the toast text before this
     * existed. It is still logged above, where it is useful.
     */
    private fun describe(errorCode: Int): String =
        when (errorCode) {
            BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED,
            BiometricPrompt.BIOMETRIC_ERROR_CANCELED -> "Cancelled"
            BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT,
            BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT_PERMANENT ->
                "Too many failed attempts. Unlock the phone and try again."
            BiometricPrompt.BIOMETRIC_ERROR_NO_DEVICE_CREDENTIAL ->
                "This phone has no screen lock, so there is nothing to check against."
            BiometricPrompt.BIOMETRIC_ERROR_HW_UNAVAILABLE ->
                "The biometric sensor is busy or unavailable right now."
            BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS,
            BiometricPrompt.BIOMETRIC_ERROR_HW_NOT_PRESENT -> "No enrolled biometrics on this device"
            else -> "Could not confirm it is you."
        }
}
