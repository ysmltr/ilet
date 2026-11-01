<p align="center"><img src="branding/ilet-icon.svg" width="128" alt="ilet icon"></p>

# ilet: Send Files to Your PC

Share a photo on your iPhone, tap **ilet**, and the file is in a folder on your PC: directly
over your Wi-Fi, with no accounts, no cloud and no analytics.

> **Status:** Phase 4 of 7. Windows: the server, QR pairing and the Bonjour announcement are
> done. iPhone: pairing and sending build and pass their unit tests on GitHub's Macs, but have
> not run on an iPhone yet; its half of Phase 4 (finding the PC again) is not written yet.

## Security first

- [PROTOCOL.md](PROTOCOL.md): the wire protocol both apps follow (TLS, pinning, pairing, endpoints,
  error codes).
- [THREAT_MODEL.md](THREAT_MODEL.md): what we protect, from whom, and how.

In short: HTTPS only, with a self-signed certificate that the iPhone pins by its SHA-256
fingerprint; pairing only by QR code; 256-bit tokens stored only as hashes; received files are
sanitized, never overwrite anything, are marked with Mark-of-the-Web and are never opened
automatically.

## Repository layout

| Path               | Contents                                              |
| ------------------ | ----------------------------------------------------- |
| `desktop/`         | Windows app: Electron + TypeScript                    |
| `ios/`             | iPhone app: Swift + SwiftUI (Share Extension: Phase 5) |
| `branding/`        | App icon (SVG master)                                 |
| `.github/`         | CI: checks the iPhone app on GitHub's Macs            |
| `PROTOCOL.md`      | Wire protocol                                         |
| `THREAT_MODEL.md`  | Threat model                                          |

### Desktop modules (`desktop/src`)

| Module       | Responsibility                                                                     |
| ------------ | ---------------------------------------------------------------------------------- |
| `protocol/`  | Wire constants, matching PROTOCOL.md                                               |
| `identity/`  | Self-signed TLS certificate, encrypted private key storage                         |
| `auth/`      | Access tokens, paired devices, rate limiting                                       |
| `files/`     | File name sanitizing, safe saving (`.part` → rename), Mark-of-the-Web, disk checks |
| `settings/`  | Settings with validation                                                           |
| `pairing/`   | One-time pairing codes, QR code payload, which addresses to advertise              |
| `server/`    | HTTPS server, request rules, routes                                                |
| `discovery/` | Announces the PC on the local network (Bonjour), so phones find its new address    |
| `ipc/`       | The contract between the window and the main process                               |
| `ui/`        | Window, `ilet://` protocol, Electron security guards, IPC handlers                 |
| `preload/`   | The three functions the window may call (`window.ilet`)                            |
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
npm start           # the real app: server + pairing window
```

Electron downloads its runtime the first time it starts (about 110 MB).

The phone can reach ilet only on a network that Windows treats as **Private** (Settings →
Network & Internet → your Wi-Fi or Ethernet connection → Network profile). On a Public network
the firewall blocks it, which is what you want in a café. The first `npm start` makes Windows
Firewall ask whether Electron may use the network: allow **Private networks** only.

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
cd ios && xcrun swift-format lint --strict --recursive Ilet IletKit
```

### Without a Mac

**Checking the code.** [`.github/workflows/ios.yml`](.github/workflows/ios.yml) runs the checks
above on one of GitHub's Macs whenever `ios/` changes: lint, the unit tests and a full build of
the app for the simulator. It needs the repository on GitHub. Public repositories get these Mac
minutes for free; private ones get a limited number of free minutes each month.

**Installing on an iPhone.** Every app on an iPhone must be signed with an Apple certificate.
Without a Mac there are two ways:

| Route | Cost | How it works | Watch out |
| ----- | ---- | ------------ | --------- |
| TestFlight (recommended) | Apple Developer Program, 99 USD a year (local prices vary) | A release workflow, added once you choose this route, signs the app on GitHub's Mac with an App Store Connect API key kept as an encrypted GitHub secret, and uploads it. You install it with Apple's TestFlight app. | Apple's official route. The key can be revoked at any time in App Store Connect. |
| Sideloading with a free Apple ID | Free | A Windows tool (for example AltStore or Sideloadly) signs an unsigned build with your Apple ID and installs it over USB. | You type an Apple ID password into a third-party program: use a separate Apple ID for this, never your main one. The app stops opening after 7 days until you sign it again. |

### iOS modules

| Path                       | Responsibility                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `IletKit/Sources/IletCore` | Protocol constants, certificate pinning, HTTPS client, pairing, Keychain and App Group storage, preparing files. No UI; the Share Extension will reuse it. |
| `Ilet/App`                 | Composition root, configuration from Info.plist                                     |
| `Ilet/Pairing`             | QR scanner and pairing flow                                                         |
| `Ilet/Sending`             | Picking photos and files, uploads with progress                                     |
| `Ilet/Home`                | Main screen and the list of PCs                                                     |
| `Ilet/Shared`              | Error messages, the security warning, layout values                                 |
| `Ilet/Resources`           | English and Turkish texts, privacy manifest                                         |

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
