# ZOLANA_INTEGRATION.md — Vanta × Helius Privacy Rings

> Status: SDK installed (`@heliuslabs/zolana@0.2.0-alpha`, `@solana/kit@7.1.1`),
> API surface verified from README + .d.ts. Integration scaffolded in App.jsx.
> **BLOCKED ON: Helius API key from dashboard.helius.dev (free tier).**

## Architecture (verified against SDK README)

```
SHADOW SEND (Vanta → Vanta)          GHOST SEND (Vanta → public)
buildTransferTransaction             buildWithdrawalTransaction
─────────────────────────            ─────────────────────────────
recipient MUST be registered         any Solana wallet, no registration
funds move privately, encrypted      funds arrive FROM THE POOL
zero on-chain sender trace           sender→recipient link severed
recipient sees private balance grow  recipient sees pool → them
```

## Verified flow (from zolana README quickstart)

1. Derive shielded keypair from wallet seed:
   `ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(seedBytes32))`
   ⚠️ shielded keypair and Solana signer MUST share the same owner seed.
2. `new Wallet({ identity: keypair.shieldedAddress() })`
3. `LocalKeys.fromKeypair(keypair, client.proofService)`
4. `syncWallet({ client, wallet, keys })` on load + after every tx
5. Persist with `loadPersistedWallet` / `syncPersistedWallet` +
   `walletSnapshotCipher(keypair)` + a localStorage-backed `WalletStateStore`
6. Register once: `buildRegistrationTransaction({ client, owner, address: keypair.shieldedAddress() })`
   — required before ANYONE can Shadow-Send TO you. `undefined` = already registered.
7. Build + submit + confirm + sync:
   ```
   const tx = await buildTransferTransaction({ client, wallet, keys, feePayer, recipient, amount, asset })
   submit via signTransactionWithSigners + sendAndConfirmTransactionFactory
   client.confirmTransaction(sig) → slot
   syncWallet({ ..., config: { requireSlot: slot } })
   ```

## Devnet endpoints (README table)

| Service | URL |
|---|---|
| Solana RPC | `https://devnet.helius-rpc.com/?api-key=<KEY>` |
| Indexer | `https://d2xah7tnhdhcom.cloudfront.net` |
| Prover | `https://d21ni15goiip6l.cloudfront.net` |

## Hard rules learned

- Withdraw (public recipient) ≠ Transfer (registered recipient). Wrong one throws
  `WALLET_RECIPIENT_NOT_REGISTERED`.
- Do NOT build a private spend before a sync after the previous confirmed tx.
- Tx format is **version 1**, up to 4096 bytes; RPC must accept v1 (Helius devnet does).
- Persist wallet state encrypted (snapshot cipher) — it contains UTXO data.
- Seed → zero-fill after deriving signer + shielded keypair (README hygiene).
- Anonymous/relayer transfers: NOT supported on custom rings; default ring =
  confidential. The "relayer" idea from the old plan is moot — feePayer is the
  user's own wallet by design ("fee payer is also the shielded owner").
- Umbra + PM code: fully removed. MagicBlock API code: fully removed.

## TODO (next agent)

1. Paste Helius key into `RPC_URL` in App.jsx (one constant).
2. Wire localStorage WalletStateStore + snapshot cipher.
3. Auto-register on first load if `buildRegistrationTransaction` returns non-undefined.
4. Shadow Send button → buildTransferTransaction (recipient must be Vanta user).
5. Ghost Send button → buildWithdrawalTransaction (any address).
6. Test matrix: shield → shadow → sync → ghost → verify on explorer that ghost
   leg shows POOL → recipient, never user → recipient.
