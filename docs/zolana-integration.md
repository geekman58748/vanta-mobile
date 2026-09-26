# ZOLANA_INTEGRATION — Vanta × Helius Privacy Rings

> Status: **integrated and verified end-to-end on devnet** (2026-09-26), on both the
> in-app key path and the **MWA device-wallet path** (emulator + physical phone).
> SDK: **`@heliuslabs/zolana@0.3.0-alpha`**, built from the git tag and linked via
> `file:` — npm's `0.2.0-alpha` is **stale and broken against devnet** (see
> `docs/zolana-status-2026-09-25.md`).
> Companion docs: `HANDOFF.md` (environment + MWA), `PLAN.md` (status + priorities),
> `docs/vanta-privacy-architecture.md` (threat model + live evidence).

## Architecture (verified against devnet, not just the README)

```
SHADOW SEND (Vanta → Vanta)          GHOST SEND (Vanta → public)
buildTransferTransaction             buildWithdrawalTransaction
─────────────────────────            ─────────────────────────────
recipient MUST be registered         any Solana wallet, no registration
amount not derivable on-chain        funds arrive FROM THE POOL
recipient absent from the tx         amount is PUBLIC by definition
⚠️ sender identity X is the          ⚠️ sender identity X is the
   fee payer and is reused              fee payer and is reused
```

⚠️ **Do not write "zero on-chain sender trace."** That phrase used to live in this file
and it is false. The fee payer is the shielded owner by SDK design, so every spend has a
public, reusable initiator pseudonym. What is hidden is the **amount** and the
**recipient**; the earlier doc's blanket "sender hidden" claim is contradicted by the
on-chain diff in `docs/vanta-privacy-architecture.md` §8.

## Verified flow

1. Derive the shielded keypair from the wallet seed:
   `ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(seedBytes32))`
   ⚠️ The shielded keypair and the Solana signer **must share the same owner seed**.
2. `await zk.initializePoseidon()` — **must** run before any `shieldedAddress()` call,
   or you get `KEYPAIR_POSEIDON` / `HasherFailure`.
3. `new Wallet({ identity: keypair.shieldedAddress() })`
4. `LocalKeys.fromKeypair(keypair, client.proofService)`
5. `syncWallet({ client, wallet, keys })` on load **and after every confirmed tx**
6. Persist with `loadPersistedWallet` / `syncPersistedWallet` + `walletSnapshotCipher`
   + a localStorage-backed `WalletStateStore`
7. Register once:
   `buildRegistrationTransaction({ client, owner, address: keypair.shieldedAddress(), payer })`
   — required before **anyone** can Shadow-Send to you. Signers are **relayer + owner**;
   `payer` sponsors rent, so a 0-SOL owner can register.
8. Build + submit + confirm + sync:
   ```js
   const tx = await buildTransferTransaction({ client, wallet, keys, feePayer, recipient, amount, asset })
   // sign only your own slots, submit the v1 wire bytes
   const slot = await client.confirmTransaction(sig)
   await syncWallet({ ..., config: { requireSlot: BigInt(slot) } })   // MUST be a bigint
   ```

## 0.3.0-alpha API deltas (from 0.2.0-alpha)

| Change | Detail |
|---|---|
| `buildRegistrationTransaction` | takes **`payer`** (was `feePayer`); internally `feePayer = input.payer ?? input.owner`. Passing `payer: relayerAddress` makes the relayer pay rent + fee. |
| `requireSlot` | must be a **bigint**. A JS number throws `CLIENT_INVALID_POLL_CONFIG { field: 'requireSlot' }`. |
| Prover routes | moved under a `/v1/zolana` gateway prefix — the SDK handles this; the configured `proverUrl` is unchanged. |
| Instruction data / account lists / proving keys | all changed — clients built against 0.2.0-alpha **cannot** talk to the current devnet programs. |
| Custom-ring surface | breaking changes there do not affect Vanta (we use the default confidential ring). |

**Why the version matters:** Helius redeployed the devnet programs in place on
2026-09-24 17:19 UTC (shielded-pool) / 17:21 UTC (user-registry). With 0.2.0-alpha that
showed up as `TrailingBytes` on deposit and `NotEnoughAccountKeys` on register — not as a
version error. See `docs/zolana-status-2026-09-25.md` for the investigation and
`scripts/program-deploy-times.mjs` to re-check the deploy slots.

```bash
# install the working SDK
git clone --depth 1 --branch v0.3.0-alpha https://github.com/helius-labs/zolana.git ~/zolana-sdk-v0.3.0
cd ~/zolana-sdk-v0.3.0/sdk-libs/ts && npm install && npm run build
cd ~/vanta-mobile && pnpm add file:../zolana-sdk-v0.3.0/sdk-libs/ts
```

⚠️ `package.json` currently points at `file:../zolana-sdk-v0.3.0/sdk-libs/ts` — a fresh
clone of Vanta **cannot build** until the SDK is vendored or published to npm.

## Devnet endpoints

| Service | URL |
|---|---|
| Solana RPC | `https://devnet.helius-rpc.com/?api-key=<VITE_HELIUS_API_KEY>` |
| Indexer (Photon) | `https://d2xah7tnhdhcom.cloudfront.net` |
| Prover | `https://d21ni15goiip6l.cloudfront.net` |

Programs: shielded-pool `sppU489D7A4U1exNo1oeMGZtLEofq3a6o2fR7UeoWB6`,
user-registry `regyS5rkAcw2YzDJCmTwCTHs2s246FXxbmuRZ42u2PD`.

## Hard rules learned

- Withdraw (public recipient) ≠ Transfer (registered recipient). Wrong one throws
  `WALLET_RECIPIENT_NOT_REGISTERED`. The app falls back to Ghost when a name/address
  is not registered.
- **Do NOT build a private spend without a `syncWallet` after the previous confirmed tx.**
  This is why the post-send path polls until the note set changes.
- Tx format is **version 1**, up to 4096 bytes. The RPC must accept v1 —
  `maxSupportedTransactionVersion: 1`, or every Zolana tx reads as unverified forever.
- `zk.SOL_MINT` is the **system program id** (`1111…1111`), **not** wrapped SOL.
  `App.jsx` normalises balances against `zk.SOL_MINT`; a `?? 0` against `So1111…` once
  rendered a full private balance as zero.
- `zk.approveIntent` exists but is **not exported** — import the intent module
  (`dist/transaction/wallet/intent.js`) directly if you need the approval hook.
- Anonymous/relayer transfers are **not supported**. The fee payer is the shielded
  owner, so a relayer can never pay for a spend — this is structural, not a config flag.
- Umbra + MPC code: fully removed. MagicBlock API code: fully removed.

## MWA wire format (hard-won — do not regress)

zolana emits **v1** transactions, and v1 changes how a payload must be serialized for a
wallet. `src/lib/mwa.js`'s `serializeCompiledTx` must emit:

```
[ messageBytes ][ signature slots, 64 bytes each ]
```

and **never** the legacy layout `[sigCount][sigs][message]`. Wallet parsers dispatch on
byte 0: `0x81` selects the v1 branch (signatures at the tail,
`signaturesOffset = size - 64*numSignatures`); anything else selects legacy. Prepending a
count byte puts `0x01` first, so the wallet takes the legacy path, reads `0x81` as a
compact-u16 length, computes an absurd offset and dies with
`ArrayIndexOutOfBoundsException` / `Accounts array extends beyond buffer bounds`. That
failure mode looks like a session or approval problem and is not one.

Concrete evidence (fakewallet in the AVD):

```
length=361; index=8258   // 8258 = 2 + 64*129, 129 = compact-u16 read of [0x81,0x01]
```

Correct shape, verified against a real deposit:

```
messageBytes[0]      = 0x81        // v1 version byte
messageBytes[1]      = 1           // signature count
messageBytes[41]     = 5           // numAccounts (v1 parser reads this here)
messageBytes[42..]   = account addresses
```

`scripts/mwa-wire-check.mjs` reproduces both encodings and runs fakewallet's own bounds
checks against them, so this can be re-verified without a device.

### Wallet v1 support is a real dependency

v1 shipped with Agave 4.2 (Sept 2026) and support "is per-wallet and may vary". The stock
`fakewallet` **release** APKs are the legacy flavor (published byte-identical under the
`legacy` and `v1` names) and cannot sign these payloads at all. A v1-capable wallet must be
built from source (procedure in `HANDOFF.md` §6.4). Vanta should treat a v1 parse failure
as a first-class, user-visible message — `mwa.js` partially does this today.

## Status

| Item | State |
|---|---|
| Shield / Shadow / Ghost on devnet | ✅ verified |
| In-app key path | ✅ |
| MWA device-wallet path | ✅ emulator + physical phone |
| Registration with a sponsored `payer` | ✅ (relayer pays rent + fee) |
| Post-send sync (poll until notes change) | ✅ |
| Spend-identity rotation per send | ⬜ unlinkability only; needs a pre-funded identity pool (`PLAN.md` §3.1) |
| Merge / split UTXO hygiene | ⬜ not built |
| Vendored SDK / npm publish | ⬜ `file:` link only — blocks a fresh clone |

There is no pending "paste the Helius key" or "wire the WalletStateStore" TODO any more —
both are done. For what is actually next, see `PLAN.md` §17.
