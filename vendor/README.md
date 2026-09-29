# vendor/

Third-party artifacts committed so the repository is self-contained. Nothing here
is ours; each entry names its upstream, its license, and how to regenerate it.

## `heliuslabs-zolana-0.3.0-alpha.tgz`

The **`@heliuslabs/zolana`** TypeScript SDK — the Zolana "Privacy Rings" client
that backs Shield / Shadow / Ghost.

| | |
|---|---|
| Upstream | <https://github.com/helius-labs/zolana> |
| Version | `0.3.0-alpha` (tag `v0.3.0-alpha`) |
| Commit | `efed2ff` — *chore(release): pin the v0.3.0-alpha localnet artifacts* |
| Package inside a monorepo | `sdk-libs/ts` |
| License | **Apache-2.0** (see `dist/LICENSE` inside the tarball, and `LICENSE.zolana.txt` beside it) |
| sha256 | `ac435d0c7e6b5e27857dd5cb13e11632cc3ff65db1d2280437d32d34062cf67d` |
| Size | 371 KB |

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

Pack the published artifact **without** running the upstream build (`prepack`
invokes a full `tsc` build, which we do not want to depend on):

```bash
git clone --depth 1 --branch v0.3.0-alpha https://github.com/helius-labs/zolana.git /tmp/zolana
COPYFILE_DISABLE=1 npm pack /tmp/zolana/sdk-libs/ts --ignore-scripts \
  --pack-destination ./vendor
```

`COPYFILE_DISABLE=1` stops macOS resource forks from being packed. Confirm the
sha256 still matches the table above before committing a replacement.
