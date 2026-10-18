# releasing

Notes for maintainers: how a version of tuck goes from code to people's computers.

## versions

We use simple version numbers: `0.1.0`, `0.2.0`, `1.0.0`.

- **patch** (0.1.**1**): bug fixes only
- **minor** (0.**2**.0): new features, nothing breaks
- **major** (**1**.0.0): big changes, or when we decide it's "done"

The number lives in two places and they must match:
`src-tauri/tauri.conf.json` → `version`, and `package.json` → `version`.

## one-time setup

1. **update address:** `src-tauri/tauri.conf.json` → `plugins.updater.endpoints`
   points at this repo's latest release. change it if the repo moves
2. **signing secrets** (repo → Settings → Secrets and variables → Actions):
   - `TAURI_SIGNING_PRIVATE_KEY`: the updater's private key
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password (empty if none)
3. **keep a backup of the private key** outside the repo. if it's lost, existing
   installs can't verify new updates and people have to reinstall by hand
4. **website:** repo → Settings → Pages → Source: **GitHub Actions**

The public half of the key is already in `tauri.conf.json`. That's fine to be public.

## making a release

1. update [CHANGELOG.md](../CHANGELOG.md)
2. bump the version in both files
3. run the checks: `npm run build`, `npm run test:ui`, and the manual list in [quality.md](quality.md)
4. commit, then tag and push:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
5. GitHub Actions ([`release.yml`](../.github/workflows/release.yml)) builds the
   installer, signs the update, and creates a **draft release** with:
   - `tuck_0.2.0_x64-setup.exe`: what people download
   - `latest.json` + `.sig`: what the auto-updater reads
6. open the draft on GitHub, write human release notes (copy from the changelog), and **publish**
7. within ~12 hours, everyone on the old version sees "restart to update"

**rolling back:** publish a new patch version with the fix. don't delete a
release that people may already have downloaded.

## getting rid of the "Windows protected your PC" warning

Windows shows this for any new, unsigned app. Options:

| option | cost | effect |
| --- | --- | --- |
| do nothing | free | warning stays; README explains "More info → Run anyway" |
| [Azure Artifact Signing](https://v2.tauri.app/distribute/sign/windows/) (formerly Trusted Signing) | paid Azure subscription, low monthly cost | signed by Microsoft's service; warning fades as downloads build reputation |
| OV certificate | yearly fee | signed; reputation builds over time |
| EV certificate | higher yearly fee, hardware key | strongest trust |

When ready, add the signing command to `bundle.windows.signCommand` in
`tauri.conf.json` and the credentials as GitHub secrets. The Tauri docs linked
above have the exact steps.

## where people can get it

| channel | when | notes |
| --- | --- | --- |
| **GitHub Releases** | v0.1 | the source of truth; the updater reads from here |
| **winget** | after v0.1 is stable | lets people run `winget install tuck`. submit a manifest to [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs); NSIS installs silently with `/S`, scope `user` |
| **the website** | now | `site/`, built with `npm run site` and published to GitHub Pages by [`site.yml`](../.github/workflows/site.yml) on every push |
| **Microsoft Store** | later | needs code signing and a store listing; widest reach on Windows |
| **Mac / Linux** | later | the code is cross-platform; needs testing, Apple notarisation, and Linux packages |

## feedback

tuck has no tracking, on purpose. Feedback comes through
[GitHub Issues](../../../issues) (bug reports and ideas both have a short form)
and download counts on the releases page.

## roadmap (ideas, not promises)

| next | why |
| --- | --- |
| code signing | removes the scary warning, the biggest drop-off |
| winget listing | one-line install for developers |
| more buddies, including seasonal ones | picking a buddy is half the fun |
| reminders on a thought | "remember to…" thoughts are common |
| Mac build | many designers are on Mac |
| optional sync (bring your own folder, e.g. OneDrive) | keeps it local-first |
| opt-in AI suggestions | only if people ask, and only with clear consent |
| switch storage to SQLite, if someone gets past ~50,000 thoughts | today the whole file is rewritten on each save. that's instant for normal use (10 a day is ~1 MB a year), but a database would only write what changed |
