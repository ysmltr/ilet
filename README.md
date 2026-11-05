<p align="center"><img src="branding/ilet-icon.svg" width="128" alt="ilet icon"></p>

# ilet: Send Files to Your PC

Share a photo on your iPhone, tap **ilet**, and the file is in a folder on your PC: directly
over your Wi-Fi, with no accounts, no cloud and no analytics.

> **Status:** Phase 7 of 7. Windows: the server, QR pairing, the Bonjour announcement, the
> desktop app (tray, notifications, settings, paired devices) and the installer are done, and the
> whole codebase passed a security review ([SECURITY_REVIEW.md](SECURITY_REVIEW.md)). iPhone:
> pairing and sending work on a real iPhone, installed through TestFlight. The Share Extension
> (Phase 5: Share → ilet in other apps) is written and builds, but has not been tried on an iPhone
> yet, and it came after the security review. Not written yet: the iPhone's half of Phase 4
> (finding the PC again after it changes networks).

## Download

- **Windows 10 or 11:** download `ilet-Setup-<version>.exe` from
  [Releases](https://github.com/ysmltr/ilet/releases) and open it. It is not code-signed yet, so
  Windows SmartScreen may warn first: More info → Run anyway. Each release lists the file's
  SHA-256 and how to check that GitHub built it from this code.
- **iPhone:** in testing with TestFlight; the App Store comes later.

ilet works only on networks that Windows treats as **Private**, such as your home Wi-Fi. On a
Public network (a café, an airport) it stays closed on purpose, because anyone on that network
could reach it.

## Security first

- [PROTOCOL.md](PROTOCOL.md): the wire protocol both apps follow (TLS, pinning, pairing, endpoints,
  error codes).
- [THREAT_MODEL.md](THREAT_MODEL.md): what we protect, from whom, and how.
- [SECURITY_REVIEW.md](SECURITY_REVIEW.md): the Phase 7 review of the code against the threat
  model, and its fixes.
- [PRIVACY.md](PRIVACY.md): the privacy policy (ilet collects nothing).

In short: HTTPS only, with a self-signed certificate that the iPhone pins by its SHA-256
fingerprint; pairing only by QR code; 256-bit tokens stored only as hashes; received files are
sanitized, never overwrite anything, are marked with Mark-of-the-Web and are never opened
automatically.

## Repository layout

| Path               | Contents                                                     |
| ------------------ | ------------------------------------------------------------ |
| `desktop/`         | Windows app: Electron + TypeScript                           |
| `ios/`             | iPhone app and its Share Extension: Swift + SwiftUI          |
| `branding/`        | App and tray icons: SVG masters and the .ico files           |
| `.github/`         | GitHub Actions: checks, TestFlight uploads, Windows releases |
| `PROTOCOL.md`      | Wire protocol                                                |
| `THREAT_MODEL.md`  | Threat model                                                 |

### Desktop modules (`desktop/src`)

| Module       | Responsibility                                                                     |
| ------------ | ---------------------------------------------------------------------------------- |
| `protocol/`  | Wire constants, matching PROTOCOL.md                                               |
| `identity/`  | Self-signed TLS certificate, encrypted private key storage                         |
| `auth/`      | Access tokens, paired devices, rate limiting                                       |
| `files/`     | File name sanitizing, safe saving (`.part` → rename), Mark-of-the-Web, disk checks |
| `settings/`  | Settings, which folders may receive files, starting with Windows                   |
| `pairing/`   | One-time pairing codes, QR code payload, which addresses to advertise              |
| `server/`    | HTTPS server, request rules, routes                                                |
| `discovery/` | Announces the PC on the local network (Bonjour), so phones find its new address    |
| `network/`   | Which networks Windows treats as Public: no connections or announcements there     |
| `ipc/`       | The contract between the window and the main process                               |
| `ui/`        | Window, tray, notifications, `ilet://` protocol, security guards, IPC handlers      |
| `preload/`   | The functions the window may call (`window.ilet`)                                  |
| `renderer/`  | The window's page: HTML, CSS and a script with no access to Node.js                |
| `i18n/`      | English and Turkish texts                                                          |
| `app/`       | Composition root: wires the modules together                                       |
| `shared/`    | Errors, logging, text helpers, JSON files                                          |

## Desktop development

Requirements: Windows 10 or 11, [Node.js](https://nodejs.org) 22.12 or later, Git.

```bash
cd desktop
npm ci              # install exact versions from package-lock.json
npm run check       # type check + lint (zero warnings) + tests
npm run dev:token   # DEVELOPMENT ONLY: server + a test token for curl
npm run dev:pair    # DEVELOPMENT ONLY: server + a pairing code that curl can use
npm run dev:app     # DEVELOPMENT ONLY: the whole app with a paired test phone, on this PC only
npm start           # the real app: tray, window, server
npm run package     # the installer: desktop/release/ilet-Setup-<version>.exe
```

The installer installs for all users (Windows asks for administrator rights) and adds Windows
Firewall rules that allow ilet on **Private** networks only and block it on Public and Domain
networks; uninstalling removes them. The app's Electron fuses are set in
`desktop/electron-builder.yml`: it cannot be run as plain Node.js, ignores `NODE_OPTIONS` and
debugging flags, and loads only its own checked app archive. The installer is not code-signed
yet, so Windows SmartScreen warns before it runs (More info → Run anyway). To sign it later, set
`CSC_LINK` (the certificate file) and `CSC_KEY_PASSWORD` before `npm run package`.

**Releases.** [`.github/workflows/desktop.yml`](.github/workflows/desktop.yml) runs `npm run check`
and builds the installer on one of GitHub's Windows PCs whenever `desktop/` or `branding/`
changes. To release a version:

1. Raise `version` in `desktop/package.json` (each version is released once) and push.
2. On GitHub: Actions → Desktop → Run workflow, on `main`.
3. The run makes a draft release with the installer, its SHA-256 and a GitHub attestation that
   records which workflow and commit built it. Drafts are visible only to people who can push to
   the repository. Check it, then publish it (the pencil → Publish release).

The job that makes the release runs none of the repository's code or npm packages; the build job
that runs them has a read-only token (THREAT_MODEL.md T39). With release immutability turned on
(Settings → General → Releases), a published release's files and tag can never change.

Electron downloads its runtime the first time it starts (about 110 MB).

Closing the window keeps ilet running in the notification area next to the clock; quit it
from its icon there. The icon files in `branding/` are made from the SVGs with `npm run icons`,
which uses Microsoft Edge (part of Windows).

The phone can reach ilet only on a network that Windows treats as **Private** (Settings →
Network & Internet → your Wi-Fi or Ethernet connection → Network profile). On a Public network
ilet refuses connections and does not announce itself, and its window says so: that is what you
want in a café. The same holds on a Domain network (one managed by an organization). The first `npm start` makes Windows Firewall ask whether Electron may use the
network: allow **Private networks** only.

The dev scripts keep their data in `%APPDATA%\ilet-dev`, apart from the real app, listen only on
`127.0.0.1`, and print ready-to-paste `curl.exe` commands. They are compiled to `dist-dev/`, which
the installer never includes, and they refuse to run in a packaged app.

## iPhone development

Requirements: a Mac with Xcode 16 or later, an iPhone with iOS 16 or later, and the build tools
below (`brew install xcodegen swiftlint`; swift-format comes with Xcode). No Mac? See
[Without a Mac](#without-a-mac).

1. In `ios/Config/Shared.xcconfig`, set `ILET_BUNDLE_ID_PREFIX` to a reverse-DNS name you own
   (for example `com.yourname.ilet`) and `DEVELOPMENT_TEAM` to your Apple team ID.
2. Generate the Xcode project (it is not committed; `ios/project.yml` is the source):
   ```bash
   cd ios && xcodegen generate
   ```
3. Open `ios/Ilet.xcodeproj`, choose your iPhone and run. Pairing needs the camera, so use a real
   iPhone rather than the simulator.

Checks:

```bash
cd ios/IletKit && swift test                              # unit tests, run on the Mac itself
cd ios && swiftlint --strict                               # lint, zero warnings
cd ios && xcrun swift-format lint --strict --recursive Ilet IletShare IletKit
```

### Without a Mac

**Checking the code.** [`.github/workflows/ios.yml`](.github/workflows/ios.yml) runs the checks
above on one of GitHub's Macs whenever `ios/` changes: lint, the unit tests, a full build of the
app for the simulator, and the unsigned archive that the TestFlight workflow would sign. It needs
the repository on GitHub. Public repositories get these Mac
minutes for free; private ones get a limited number of free minutes each month.

**Installing on an iPhone.** Every app on an iPhone must be signed with an Apple certificate.
Without a Mac there are two ways:

| Route | Cost | How it works | Watch out |
| ----- | ---- | ------------ | --------- |
| TestFlight (recommended) | Apple Developer Program, 99 USD a year (local prices vary) | [`.github/workflows/testflight.yml`](.github/workflows/testflight.yml) builds the app on GitHub's Mac, signs it with your Apple Distribution certificate and uploads it. An App Store Connect API key and the certificate's private key are kept as encrypted GitHub secrets ([ios/APP_STORE.md](ios/APP_STORE.md#testflight) explains how to set them up and start a build). You install it with Apple's TestFlight app. | Apple's official route. The API key needs Admin access, because the workflow makes the provisioning profiles; the key and the certificate can be revoked at any time. |
| Sideloading with a free Apple ID | Free | A Windows tool (for example AltStore or Sideloadly) signs an unsigned build with your Apple ID and installs it over USB. | You type an Apple ID password into a third-party program: use a separate Apple ID for this, never your main one. The app stops opening after 7 days until you sign it again. |

### iOS modules

| Path                       | Responsibility                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `IletKit/Sources/IletCore` | Protocol constants, certificate pinning, HTTPS client, pairing, Keychain and App Group storage, preparing files, background uploads, checking shared names and types. No UI; the app and the Share Extension both use it. |
| `IletShare`                | The Share Extension (Share → ilet): its sheet, copying the shared items and handing them to background uploads |
| `Ilet/App`                 | Composition root, configuration from Info.plist, the start screen, and the upload events iOS sends after the share sheet has closed |
| `Ilet/Pairing`             | QR scanner and pairing flow                                                         |
| `Ilet/Sending`             | Picking photos and files, uploads with progress                                     |
| `Ilet/Home`                | Main screen, welcome page, info page and the list of PCs                            |
| `Ilet/Shared`              | Error messages, the security warning, the Settings button, layout values            |
| `Ilet/Resources`           | English and Turkish texts, app icon, logo and launch colour, privacy manifest       |

## Dependencies

### Desktop

Runtime (shipped with the app):

| Package            | Why                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `qr`               | Encodes the pairing QR code. Zero dependencies, actively maintained, by the author of the audited `noble` crypto libraries. |
| `@homebridge/ciao` | Announces the PC with Bonjour (DNS-SD over mDNS), which iPhones browse with Apple's own APIs. It only announces and never browses, follows RFC 6762 and RFC 6763, passes Apple's Bonjour Conformance Test and is maintained by the Homebridge project. A self-written mDNS responder (probing, name conflicts, goodbyes, network changes) would be riskier. It brings seven small, widely used packages: `debug`, `ms`, `fast-deep-equal`, `source-map-support`, `source-map`, `buffer-from` and `tslib`. `source-map-support` changes only how error stack traces are printed. |

Development tools:

| Package                  | Why                                                                          |
| ------------------------ | ---------------------------------------------------------------------------- |
| `electron`               | The desktop runtime (required by the tech stack).                            |
| `electron-builder`       | Packages the NSIS installer; its file whitelist keeps dev code out of builds. |
| `esbuild`                | Bundles the sandboxed preload script and the page, which cannot load other files at run time. |
| `typescript`             | Type checking in strict mode (6.0: the newest version typescript-eslint supports). |
| `@types/node`            | Type definitions for the Node.js 24 runtime inside Electron 44.              |
| `vitest`                 | Test runner that runs TypeScript directly, without a separate build step.    |
| `eslint`                 | Linter.                                                                      |
| `@eslint/js`             | ESLint's recommended JavaScript rules.                                       |
| `typescript-eslint`      | Type-aware lint rules (strict and stylistic presets).                        |
| `prettier`               | Code formatter.                                                              |
| `eslint-config-prettier` | Turns off lint rules that would conflict with Prettier.                      |

Supply-chain rules:

- Exact versions (`save-exact`) and a committed `package-lock.json`.
- `ignore-scripts=true`: no package can run code while it is installed.
- Releases are at least 14 days old when added (`npm install --before=<date>`). Newly published
  versions are where most npm supply-chain attacks happen.

### iPhone

The app uses only Apple's frameworks: no third-party code and no SDKs. Build tools on the Mac:

| Tool           | Why                                                                                  |
| -------------- | ------------------------------------------------------------------------------------ |
| `xcodegen`     | Generates the Xcode project from the readable `ios/project.yml`, so no hand-edited project file is committed. |
| `swiftlint`    | Lint rules, run with zero warnings allowed.                                          |
| `swift-format` | Code formatting.                                                                     |
