<p align="center"><img src="branding/ilet-icon.svg" width="128" alt="ilet icon"></p>

# ilet: Send Files to Your PC

Share a photo on your iPhone, tap **ilet**, and the file is in a folder on your PC: directly
over your Wi-Fi, with no accounts, no cloud and no analytics.

> **Status:** Phase 1 of 7: wire protocol, threat model and the desktop server core (no UI yet).

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
| `ios/`             | iPhone app and Share Extension (from Phase 3)         |
| `branding/`        | App icon (SVG master)                                 |
| `PROTOCOL.md`      | Wire protocol                                         |
| `THREAT_MODEL.md`  | Threat model                                          |

### Desktop modules (`desktop/src`)

| Module      | Responsibility                                                                        |
| ----------- | ------------------------------------------------------------------------------------- |
| `protocol/` | Wire constants, matching PROTOCOL.md                                                  |
| `identity/` | Self-signed TLS certificate, encrypted private key storage                            |
| `auth/`     | Access tokens, paired devices, rate limiting                                          |
| `files/`    | File name sanitizing, safe saving (`.part` → rename), Mark-of-the-Web, disk checks    |
| `settings/` | Settings with validation                                                              |
| `server/`   | HTTPS server, request rules, routes                                                   |
| `app/`      | Composition root: wires the modules together                                          |
| `shared/`   | Errors, logging, text helpers, JSON files                                             |

## Desktop development

Requirements: Windows 10 or 11, [Node.js](https://nodejs.org) 22.12 or later, Git.

```bash
cd desktop
npm ci              # install exact versions from package-lock.json
npm run check       # type check + lint (zero warnings) + tests
npm run dev:token   # DEVELOPMENT ONLY: server + a test token for curl
npm start           # the real app (Phase 1: server only, no window)
```

Electron downloads its runtime the first time it starts (about 110 MB).

`npm run dev:token` keeps its data in `%APPDATA%\ilet-dev`, apart from the real app, listens only
on `127.0.0.1`, and prints ready-to-paste `curl.exe` commands. It is compiled to `dist-dev/`,
which the installer never includes, and it refuses to run in a packaged app.

## Dependencies

The desktop app has **no runtime dependencies**: it uses only Node.js and Electron built-ins.
Development tools:

| Package                  | Why                                                                          |
| ------------------------ | ---------------------------------------------------------------------------- |
| `electron`               | The desktop runtime (required by the tech stack).                            |
| `electron-builder`       | Packages the NSIS installer; its file whitelist keeps dev code out of builds. |
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
