# vendor/

Third-party artifacts committed so the repository is self-contained. Nothing here
is ours; each entry names its upstream, its license, and how to regenerate it.

## `heliuslabs-zolana-0.4.0-alpha.tgz`

The **`@heliuslabs/zolana`** TypeScript SDK — the Zolana "Privacy Rings" client
that backs Shield / Shadow / Ghost.

| | |
|---|---|
| Upstream | <https://github.com/helius-labs/zolana> |
| Version | `0.4.0-alpha` (tag `v0.4.0-alpha`) |
| Commit | `0fde5f1` — *chore(release): date the TypeScript SDK 0.4.0-alpha release* |
| Package inside a monorepo | `sdk-libs/ts` |
| License | **Apache-2.0** (see `dist/LICENSE` inside the tarball, and `LICENSE.zolana.txt` beside it) |
| sha256 | `6d091b2c15240139ca05343608637f068ac7e5e2cc939d8dcdd11bcc294c4c49` |
| Size | 416 KB |

### Why 0.4.0 and not 0.3.0

0.3.0-alpha pinned **49** proving keys. The hosted prover this app talks to
(`VITE_PROVER_URL`, `d21ni15goiip6l.cloudfront.net`) has since rotated its key
set: **22 of those 49 keys are no longer served at all, and 22 more come back
with a different sha256**. A proof request built on the old table is rejected by
the prover with a non-2xx status, which surfaces to the user as
`CLIENT_PROVER_HTTP` on Shield, Shadow and Ghost alike — the SDK's own error
translation has no message for it, so the code reaches the screen verbatim.

0.4.0-alpha pins **130** keys and matches the live prover **exactly** (0 missing,
0 digest mismatches), which is the property to re-check before every release:

```bash
node scripts/zolana-prover-keys-check.mjs
```

Program IDs and the `ZolanaClientConfig` shape are unchanged between the two
versions, so this is a drop-in swap and the relayer's `RELAYER_ALLOWED_PROGRAMS`
list stays valid.

### Why it is vendored instead of referenced

`package.json` used to declare:

```json
"@heliuslabs/zolana": "file:../zolana-sdk-v0.3.0/sdk-libs/ts"
```

That path is a **sibling of the repository**, so it resolves on the machine that
built the app and nowhere else. Anyone cloning this repo got a failed
`pnpm install` — the repo was not reproducible, which CLOCK IN explicitly
requires ("a repository someone else can clone and run"). `docs/zolana-integration.md`
had already flagged it.

It cannot be fixed by pointing at the git tag either, for two independent reasons:

1. npm/pnpm cannot install a **subdirectory** of a git repository, and the package
   lives at `sdk-libs/ts` inside a Rust monorepo — a `github:` spec would install
   the repository root, which has no `package.json`.
2. The npm registry's published `0.2.0-alpha` is **broken against devnet**, which
   is why the build was pinned to the source tag in the first place.

So the built artifact is committed. Apache-2.0 permits redistribution provided the
license and notices travel with it, which they do — `dist/LICENSE` ships inside
the tarball and is also copied to `LICENSE.zolana.txt` here.

### Regenerating

`v0.4.0-alpha` does **not** commit `dist/` — the tag holds `src/` and `test/`
only, and `prepack` builds the package before it is published. So unlike
0.3.0-alpha (whose tag pinned its build output, and which was packed from the tag
with `--ignore-scripts`), this artifact is taken from the **published** package,
which is the same bytes upstream's release CI built and signed:

```bash
COPYFILE_DISABLE=1 npm pack @heliuslabs/zolana@0.4.0-alpha --pack-destination ./vendor
```

`COPYFILE_DISABLE=1` stops macOS resource forks from being packed. A re-pack of
the 0.3.0-alpha tag was byte-identical in *content* to its registry tarball
(`diff -rq` clean; only gzip metadata differs), so the registry artifact is a
faithful stand-in for the tag build. Confirm the sha256 still matches the table
above before committing a replacement.

## `ring/custom-ring-program-v0.4.0-alpha.so`

The **custom ring program** deployed at `8aMW8MPHBn4oGsss2NuB4QNvFx6iBSB8RHHkMAHrZduU`
on devnet. It is upstream's release artifact, not a local build: the ring circuits,
prover and CLI are Helius's, and rebuilding the program would only make the
binary differ from the audited one.

| | |
|---|---|
| Upstream | <https://github.com/helius-labs/zolana> |
| Release | `v0.4.0-alpha` |
| Asset | `custom-ring-program-v0.4.0-alpha.so` |
| Size | 429,304 bytes |
| sha256 | `46a890a2b001a92baf269f161a7819e02e6de89d5dd0df873799615ffaa78c6e` |
| License | Apache-2.0 (same upstream, see `LICENSE.zolana.txt`) |

Why it is committed: `scripts/ring-check.mjs` verifies the **deployed** program
against these exact bytes (`verifyRingProgram` checks the loader's deployed hash),
so the check needs the artifact beside the code that trusts it. The operator
config for the deployed ring is in `rings/vanta-v2/ring.toml`; its keypairs are
not in git.

### Regenerating

The release publishes no `SHA256SUMS` for this asset, so the digest above is the
one this repository measured from the downloaded release asset. If upstream
republishes the tag, re-download and compare before replacing:

```bash
curl -L -o vendor/ring/custom-ring-program-v0.4.0-alpha.so \
  https://github.com/helius-labs/zolana/releases/download/v0.4.0-alpha/custom-ring-program-v0.4.0-alpha.so
shasum -a 256 vendor/ring/custom-ring-program-v0.4.0-alpha.so
```

A changed digest is not automatically a bad build, but it is a different program:
publish a new ring program id and re-run `scripts/ring-check.mjs` rather than
upgrading an existing ring in place without saying so.
