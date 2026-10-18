# shipping

How a version of tuck goes from code to people's computers, and how we get it
in front of people.

## versions

We use simple version numbers: `0.1.0`, `0.2.0`, `1.0.0`.

- **patch** (0.1.**1**): bug fixes only
- **minor** (0.**2**.0): new features, nothing breaks
- **major** (**1**.0.0): big changes, or when we decide it's "done"

The number lives in two places and they must match:
`src-tauri/tauri.conf.json` → `version`, and `package.json` → `version`.

## one-time setup

1. **GitHub repo:** create `tuck` on your personal account and push the code
2. **the update address** is set in `src-tauri/tauri.conf.json` →
   `plugins.updater.endpoints` (currently `saanviv812/tuck`). change it if the repo moves
3. **add the signing key as secrets** (repo → Settings → Secrets and variables → Actions):
   - `TAURI_SIGNING_PRIVATE_KEY`: the contents of `~/.tauri/thoughtcatcher.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: leave empty (the key has no password)
4. **back up the private key** somewhere safe (a password manager). If it's
   lost, existing users can't receive updates and have to reinstall manually

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

**Rolling back:** publish a new patch version with the fix. Don't delete a
release that people may have already downloaded.

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
| **the website** | now | `site/`, built with `npm run site` and published to GitHub Pages by [`site.yml`](../.github/workflows/site.yml) on every push. turn it on once: repo → Settings → Pages → Source: **GitHub Actions**. lives at `https://saanviv812.github.io/tuck/` |
| **Microsoft Store** | later | needs code signing and a store listing; widest reach on Windows |
| **Mac / Linux** | later | the code is cross-platform; needs testing, Apple notarisation, and Linux packages |

## launch plan

**Before:**

- [ ] record a 10-second clip: shortcut → type → Enter → hop → gone
- [ ] screenshots (already in `docs/images/`)
- [ ] the website page
- [ ] test the installer on a friend's computer
- [ ] write one short honest post: why you made it, what it does, link

**Launch day (pick 2–3, don't spam):**

- Product Hunt (best on a Tuesday–Thursday)
- Reddit: r/productivity, r/windows, r/pixelart (show the buddies), r/SideProject
- Twitter/X, LinkedIn, Threads with the clip
- Hacker News "Show HN" (lead with the tiny size and the local-only data)
- design communities (Figma community, Dribbble shots of the buddies)

**After:**

- reply to every comment and issue in the first week
- collect "what would make you use it every day?" answers
- ship a small fix release within a week, so people see it's alive

## listening to people

There's no tracking in the app, on purpose. Feedback comes from:

- **GitHub Issues**: bugs and ideas (an issue template with "what did you click
  right before?" and "attach app.log" helps a lot)
- **GitHub Discussions**: questions, buddy requests
- **release download counts** on GitHub
- an optional short survey linked from the README (3 questions: how often do you
  use it, what's missing, would you recommend it)

## support

- the README's FAQ answers the common questions
- `app.log` next to the data file has the errors
- response goal: first reply within 2 days

## roadmap (ideas, not promises)

| next | why |
| --- | --- |
| code signing | removes the scary warning, the biggest drop-off |
| winget listing | one-line install for developers |
| more buddies + seasonal ones | the most-requested type of thing for apps like this |
| reminders on a thought | "remember to…" thoughts are common |
| Mac build | many designers are on Mac |
| optional sync (bring your own folder, e.g. OneDrive) | keeps it local-first |
| opt-in AI suggestions | only if people ask, and only with clear consent |
