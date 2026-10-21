# Ring v2 — the custom ring Vanta spends on

> **Status.** Deployed, configured, and exercised end to end on devnet. The client
> path is shipped behind `VITE_RING_PROGRAM_ID`; with it unset every ring branch is
> unreachable and the app behaves exactly as the v1 default-ring client. This is
> v2.1 of `vanta-v2-roadmap.md`, restricted to Pillar A1/A2: a ring that lets the
> **relayer pay the fee** on a private send. Burner-mediated deposits (B1), policy
> tiers (A3) and the auditor-key product surface (A4) are **not** in this change.

## The deployed ring

| | |
|---|---|
| Program | `8aMW8MPHBn4oGsss2NuB4QNvFx6iBSB8RHHkMAHrZduU` |
| Cluster | devnet |
| Authority | `AQ3T2eBduTxP4efJEJ6dASnFj3REBVyZEKLdT58xCatr` (single key, devnet only) |
| Binary | `custom-ring-program-v0.4.0-alpha.so`, sha256 `46a890a2…a78c6e` |
| Vendor copy | `vendor/ring/custom-ring-program-v0.4.0-alpha.so` |
| Config | created, **audit-only** (no policy table) |
| Auditor key | `0229b86878a81d1fb93c1b1f67294f36317bb03cce558fad28f60cde399ce8a9de` |
| Deposit audit proof | off |
| SPP registration | yes |
| Ring RPC | `https://d24brah9h1i4q9.cloudfront.net` (pinned service key `C8TeRC…zVSs`) |
| Prover / indexer | the same Helius devnet services the app already used |

`rings/vanta-v2/ring.toml` records the operator config. The keypair files stay out
of git (`rings/vanta-v2/.gitignore`), so this file is a record, not a wallet.

Verify all of the above in one command, including that the deployed bytes are the
vendored bytes:

```bash
RING_RPC_URL=https://devnet.helius-rpc.com/?api-key=... \
  npm run ring:check -- 8aMW8MPHBn4oGsss2NuB4QNvFx6iBSB8RHHkMAHrZduU
```

Use a dedicated RPC: the public devnet endpoint rate-limits the program-account
reads fast enough to turn this into a false failure.

## What actually changes in a send

| | v1 (default ring) | v2 (custom ring) |
|---|---|---|
| Shield | public wallet → SPP note | public wallet → **ring** note |
| Shadow | owner X pays the fee | **relayer pays**, X co-signs |
| Ghost | owner X pays the fee | **relayer pays**, X co-signs |
| Per-user spend identity on chain | yes, reused (`account[0]`) | **no**; a shared relayer address pays |
| X needs SOL | yes (`/fund` float) | no |
| Ring auditor can open the transfer | n/a | **yes, permanently** |

The ring path is used only when the wallet actually holds an unspent note bound to
the ring (`Utxo.ringProgramId === VITE_RING_PROGRAM_ID`). A pre-ring balance keeps
working through the v1 builders instead of failing against an empty ring:

- **Shield** always deposits into the ring when the build has one.
- **Shadow** uses `inputs: 'ring-or-default'`, so a note that predates the ring
  migrates into it instead of being stranded.
- **Ghost** needs ring-bound inputs (the SDK's withdrawal builder only spends
  them). A wallet with only v1 notes stays on the v1 withdrawal path until a
  Shadow migrates the balance. The receipt records which rail ran, not which one
  was configured.

## Verified on devnet

| Step | Evidence |
|---|---|
| Ring deposit from the app's builder | `4hnT78rV…BnPDAC` (also `sf9RZDBb…gAEo7R`, `5ZyZMs3L…T7n2hq`) |
| Sync of ring-bound notes | 3 notes, all tagged with the ring program id |
| Direct ring transfer, relayer fee payer | `3wqSWVYE…YXB` — `err: null`, fee payer `FhV7cyfV…uRk7`, owner co-signs |
| Same transfer through the app's `/relay` wire | `2qJFj5CW…Vkbq` — 200, `err: null`, fee payer is the relayer |
| Shadow from the APK (emulator), relayer-paid | `4ucu98jH…Ptgpap` — finalized, `err: null`, slot 512979955 |
| Ghost from the APK (emulator), relayer-paid | `4aiLF66u…VxYajQ` — finalized, `err: null`, slot 512980998 |

The `/relay` run caught two real defects that would have blocked every ring send,
both fixed in `relayer/server.js`:

1. **Message size.** A ring transfer is a 2552-byte v1 message, and the endpoint
   refused anything over 1400 bytes. The cap rises to 4096 only when
   `RELAYER_RING_PROGRAM` is set, which is the size the devnet RPC accepted for a
   landed ring transfer.
2. **Address lookup tables.** The program allowlist only read static keys. A ring
   transfer loads the ring and pool program ids from lookup tables, so the check
   saw no allowed program and refused the send. The relayer now resolves the
   message's lookups (and only then) before rejecting.

A third defect showed up only when the app itself sent: **`hasRingNotes()` could
never be true.** It read `wallet.utxos()`, and the SDK hands back copies without
the `ringProgramId` field — the ring binding is only visible through
`ringBalances()`. So a funded ring wallet took the v1 branch and Shadow/Ghost died
with `WALLET_BUILD_TRANSFER`. It now asks `ringBalances()`, and the private-state
signature includes ring totals so the post-send poll can see a ring spend land.

### Known gap: the program allowlist does not actually run

The lookup parser (`v1MessageLookups`) assumes a legacy instruction layout and
throws on real v1 messages (`truncated compact-u16`, `message too short for its
instructions`). The `/relay` handler catches that and **fails open**, so every one
of the four relayed transactions above was sponsored with the allowlist skipped —
logged as `⚠ program check skipped`. The size cap, fee-payer check and token check
still run; the "only these programs" check does not. Fixing it means decoding the
message with `@solana/kit` in the relayer (which it does not currently depend on)
and failing closed, so it is deliberately left for its own change rather than
smuggled into this one.

## The trade this ships with, stated plainly

Every custom ring has an auditor key, and it can open every transfer on that ring.
That is not a policy tier we left switched off; it is how the ring program works.
For this deployment the key belongs to the hosted Helius ring RPC, whose public key
is pinned in `ring.toml`.

So a v2 receipt says, on the receipt and in the "What leaks" sheet:

- the amount and recipient stay hidden on a Shadow,
- the spend no longer carries a reusable per-user identity,
- and the ring auditor can still open the transfer.

The Shield leg is unchanged: the funding wallet and amount are public, on purpose.
None of this is "anonymous", and `src/lib/honesty.js` is the single place the copy
lives.

## Enabling it

Client (build-time, because the ring is where the notes live):

```bash
VITE_RING_PROGRAM_ID=8aMW8MPHBn4oGsss2NuB4QNvFx6iBSB8RHHkMAHrZduU
```

Relayer (must match, or `/relay` refuses every ring spend):

```bash
RELAYER_RING_PROGRAM=8aMW8MPHBn4oGsss2NuB4QNvFx6iBSB8RHHkMAHrZduU
```

Both empty is the v1 deployment. A client with the ring set against a relayer
without it will fail at submission, by design: the relayer only co-signs for
programs it sponsors.

## Rebuilding the ring from scratch

The release ships a matching operator CLI and program binary. The repository keeps
the binary (`vendor/ring/`) and the resulting config, not a build toolchain, because
the ring program is Helius's artifact, not ours.

```bash
# 1. operator directory (program keypair + ring.toml)
zolana-ring new vanta-v2 --silent --dest .
zolana-ring target devnet

# 2. deploy the released binary at the ring's own program id
zolana-ring deploy --program-so vendor/ring/custom-ring-program-v0.4.0-alpha.so

# 3. create the config, pin the auditor key from the ring RPC, register with SPP
zolana-ring init --target devnet

# 4. check it against the vendor copy and this document
npm run ring:check -- <program-id>
```

`zolana-ring` is not on npm. Download the `zolana-ring-darwin-arm64-v0.4.0-alpha`
(or linux-x64) asset from the `v0.4.0-alpha` GitHub release. Deploying needs roughly
6 SOL on devnet for the 429 KB program plus its upload buffer; the buffer is
reclaimable with `solana program close --buffers` if an upload is interrupted.

## Limits

- **Devnet only.** No mainnet claim, and the authority is a single key. The
  timelocked multisig from A2 is *not* done.
- **Unaudited.** The ring program is Helius's released binary, and this integration
  has not had a third-party audit. An audited custom ring is still the gate on
  mainnet.
- **Hosted auditor.** The auditor key is the ring RPC's, not ours. Running our own
  ring RPC with `--local-auditor` is the next custody step.
- **No policy tier yet.** Audit-only ring: no rules, no compliance tier, no
  auditor-key product surface. A3/A4 are the next ring release.
- **Relayer sponsorship is uncapped per-request.** `/relay` pays ring fees under
  the shared token, as it already does for registration. The per-IP and global
  budgets cover `/fund`, not relayed fees; watch that before opening a public ring
  build.
- **Run on an emulator, not a phone.** On an Android emulator with the flag set,
  a ring deposit landed, a cold launch synced it (`private balances Array(1)`,
  screen `0.050 SOL`), and Shadow and Ghost both completed from the APK against a
  local relayer with `RELAYER_RING_PROGRAM` set — reached over `http://localhost:3011`
  plus `adb reverse`, because the shell blocks cleartext to anything else. That is
  an emulator, not a phone: no biometric gate ran (the emulator has no screen
  lock, which is the documented `unavailable` path) and no MWA wallet was
  involved. Run the same sequence on a physical phone before shipping.
- **The indexer transport drops connections.** One in three `curl` probes to the
  indexer timed out at the TCP layer while the rest answered in under a second,
  and `syncWallet` surfaced that as `API_REQUEST`. `syncPrivate` used to abort on
  the first throw, so a blip at load time left a funded wallet showing zero; it
  now retries inside the same six-attempt window and only reports failure when
  every attempt fails. `syncAfterSend` does the same, so a post-send blip cannot
  turn a landed payment into an error. A per-call deadline in
  `createZolanaClient` is still missing and is the proper fix for a hard hang.
- **The relayer is in the liveness path** for every ring send, on top of the
  prover and indexer it already depended on.
