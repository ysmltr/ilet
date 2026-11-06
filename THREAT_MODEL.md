# ilet threat model

ilet moves files from an iPhone to a Windows PC on the same local network, **without a
confirmation dialog on the PC**. That convenience is the main security risk: anything a paired
device sends lands on the PC's disk. This document lists what we protect, from whom, and how.
It was reviewed against the code in Phase 7, and what came later (the Share Extension, T40 and
T41, the app's background uploads and the conversion of videos) had a review of its own on
6 November 2026: see [SECURITY_REVIEW.md](SECURITY_REVIEW.md). The iPhone's half of Phase 4
(finding the PC again, T3), written after both, was checked against this model as it was
written.

The wire protocol is specified in [PROTOCOL.md](PROTOCOL.md).

## 1. System overview

| Component                  | Role                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Desktop app (Electron)     | HTTPS server on the LAN. Stores its TLS identity, paired devices and settings. Writes received files into the receive folder. |
| iOS app                    | Scans the pairing QR code, stores the access token, sends photos and files with background uploads that carry on when the user switches apps or locks the phone. |
| iOS Share Extension        | Sends files from other apps' share sheet to a paired PC, with background uploads that carry on after the sheet closes. |

### 1.1 Data flows

1. **Pairing:** the desktop screen shows a QR code → the phone camera reads it → the phone calls
   `POST /api/v1/pair` over pinned HTTPS.
2. **Upload:** the app or the Share Extension copies each file into the App Group and gives it to
   iOS's background transfer service, which calls `POST /api/v1/files` over pinned HTTPS with the
   access token. The upload carries on when the user switches apps, locks the phone or closes the
   sheet.
3. **Discovery:** the desktop advertises `_ilet._tcp` over mDNS; the phone uses it to find the
   PC's new address.
4. **Sharing:** another app hands items to the Share Extension, which sends them as in 2.

### 1.2 Trust boundaries

| ID  | Boundary                                                                              |
| --- | ------------------------------------------------------------------------------------- |
| TB1 | The local network between phone and PC. Untrusted: shared Wi-Fi, other devices, spoofing. |
| TB2 | Received bytes → the PC's file system and Windows shell. Received files are untrusted content. |
| TB3 | The QR code on the screen. Anyone who can see the screen during pairing can read it.  |
| TB4 | Other apps on the iPhone and other processes on the PC.                               |
| TB5 | Web browsers on the PC or LAN. Web pages can send requests to LAN addresses.           |

## 2. Assets

| ID  | Asset                                         | Why it matters                                           |
| --- | --------------------------------------------- | -------------------------------------------------------- |
| A1  | Content of transferred files                  | Photos are very personal (faces, documents, locations)   |
| A2  | Desktop TLS private key                       | With it, an attacker can impersonate the PC and receive the user's photos |
| A3  | Access tokens                                 | With one, anyone can write files to the PC               |
| A4  | Pairing secret                                | With it, an attacker can obtain an access token          |
| A5  | Integrity of the PC and the user account      | Files outside the receive folder, Windows credentials (NTLM hashes) |
| A6  | Availability                                  | Disk space, the desktop app staying responsive           |
| A7  | Metadata                                      | Device names, IP addresses, the fact that ilet is running |

## 3. Adversaries

| ID   | Adversary                                                                                 |
| ---- | ----------------------------------------------------------------------------------------- |
| ADV1 | Passive observer on the same network (records traffic)                                    |
| ADV2 | Active attacker on the same network: ARP or DHCP spoofing, rogue access point, fake mDNS services, man-in-the-middle |
| ADV3 | Malicious web page opened in a browser on the PC or another LAN device (CSRF, DNS rebinding) |
| ADV4 | Someone who sees the screen during pairing (shoulder surfing, screen sharing, a camera)   |
| ADV5 | Malicious app on the iPhone (URL scheme or pasteboard injection, crafted items shared with ilet) |
| ADV6 | A paired device that is lost, stolen, compromised or malicious                            |
| ADV7 | Internet attacker, if the port is ever reachable from outside (port forwarding, UPnP, public network) |

**Out of scope:** malware already running as the same Windows user (it can call DPAPI and read
every file anyway), a jailbroken or compromised iOS, and physical access to an unlocked PC.

## 4. Threats and mitigations

### 4.1 Network

| ID  | Threat                                                     | Mitigation                                                                                                   | Phase |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----- |
| T1  | ADV1 reads files in transit                                | HTTPS only, no plaintext port. TLS 1.3 preferred; TLS 1.2 only with ECDHE + AEAD suites (forward secrecy).   | 1 |
| T2  | ADV2 impersonates the PC (man-in-the-middle) and receives the photos | Certificate pinning by SHA-256 fingerprint. The pin arrives out of band in the QR code, so there is no "trust on first use". A mismatch aborts before the token or any data is sent; no override. The app's other requests (info, pairing, status) never follow redirects, so they cannot leave the pinned connection. Uploads, from the app and from the Share Extension, go through background sessions whose tasks carry the pin and check it on each connection. iOS follows their redirects itself, which ilet cannot prevent, but only a server that presents the pinned certificate can send one, and a redirected upload counts as failed (section 6). ATS stays on: the app and the extension set only `NSAllowsLocalNetworking`, because a PC on the LAN cannot have a certificate from a public CA, and the pin replaces that check. | 1 (server), 3, 5 |
| T3  | ADV2 advertises a fake `_ilet._tcp` service to redirect the phone | Discovery is only a hint for the address. The phone looks for announcements only when no known address has answered within a second, and only at services whose TXT `id` is the paired PC's. It looks up their addresses without connecting (DNS-SD), and only for host names in `.local`, so a fake announcement cannot send a lookup beyond the local network. It connects only to addresses that pass the QR code rules (local-network IP literals), and the fingerprint must still match, so the worst case is a failed connection, with the security warning if a fake address presents another certificate. A new address is remembered only after the pinned PC answered there. At most 4 services and 8 addresses are used per search, which bounds the work that a flood of fake announcements causes; hiding the real PC that way is an accepted denial of service (section 6). | 4 |
| T4  | ADV3 makes the browser send requests to the PC (CSRF, DNS rebinding) | Requests with an `Origin` header are rejected. `Host` must be an IP literal or `localhost`, which defeats DNS rebinding. The self-signed certificate makes browsers fail the TLS handshake anyway, and the `Authorization` and custom headers would need a CORS preflight, which is never allowed. | 1 |
| T5  | ADV7 reaches the server from the internet, or a stranger on public Wi-Fi reaches it | Connections from addresses outside local-network ranges are dropped before the TLS handshake. The firewall rule allows only the Private profile. The installer adds these rules: allow on Private networks, block on Public and Domain networks. ilet also reads the category of each connected network (Windows PowerShell, `Get-NetConnectionProfile`) and itself accepts connections only on its addresses on Private networks, so a firewall rule that allows more (for example one clicked by accident) changes nothing, and a network Windows has not classified yet is refused; the window explains how to switch a trusted Public network to Private, and that Domain networks stay blocked. If the categories cannot be read, the firewall alone decides. | 1, 6, 7 |
| T6  | ADV2/ADV7 exhausts connections (slowloris)                 | TLS handshake, header and idle timeouts; a connection limit; authentication before the body is read; error responses close the connection. | 1 |
| T7  | ADV2 replays a recorded upload                             | TLS prevents replay of recorded traffic.                                                                     | 1 |
| T34 | ADV2 sends hostile mDNS packets to the responder, which runs in the app's main process | The responder (`@homebridge/ciao`) is plain JavaScript, so malformed packets cannot corrupt memory; it handles errors per packet and passes Apple's Bonjour Conformance Test. One check came before that handling and threw while an adapter had no IPv4 address, as for a moment while Windows joins a network; ilet has ciao leave such adapters out (`excludeIpv6Only`), so that check always has the adapter's IPv4 netmask (SECURITY_REVIEW.md S11). A received packet can only make it answer, or rename the announcement after a name conflict (RFC 6762 §9); it never changes what the server accepts. Names are prepared so that ciao's checks pass (no dots, short enough for a rename); a name it still rejects only turns discovery off. Forcing endless renames only stops discovery (accepted denial of service, section 6). | 4 |

### 4.2 Authentication and pairing

| ID  | Threat                                                     | Mitigation                                                                                                   | Phase |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----- |
| T8  | Guessing an access token                                   | 256-bit random tokens; constant-time hash comparison; per-address rate limit on failures.                    | 1 |
| T9  | Stealing tokens from the PC's disk                         | Only SHA-256 hashes are stored. A hash cannot be used to authenticate, and a 256-bit random value cannot be recovered from its hash. | 1 |
| T10 | Stealing the token from the phone                          | Keychain only (after first unlock, this device only), shared with the Share Extension through a Keychain access group. Never in UserDefaults, App Group files or logs. During a background upload, iOS's transfer service keeps the request, token included, until the upload ends; what ilet attaches to the task, and reads back later, holds only an ID, the pin and a folder name. | 3, 5 |
| T11 | ADV4 reads the QR code and pairs first                     | The secret exists only after an explicit click, expires after 120 s, works once and is invalidated when the window is hidden or closed. The window warns against showing the code in screen shares or photos and shows which device paired, so the user can revoke it from the list of paired devices. | 2, 6 |
| T12 | Guessing the pairing secret                                | 256-bit secret, single active secret, rate-limited failures.                                                 | 2 |
| T13 | ADV5 injects a fake pairing (attacker's address and fingerprint) | No URL scheme for pairing. The pairing payload is accepted only from the in-app camera scanner and is validated strictly (a PC name with invisible or control characters is refused, so it cannot imitate another name); its addresses must be private IPv4 or unique local IPv6 literals, so a forged code cannot point the app at the internet. The user sees the PC's name and confirms before anything is sent. | 3 |
| T14 | A revoked device keeps sending                             | Revocation is saved first, then removes the token hash at once and aborts that device's uploads in progress; if saving fails, nothing changes and the window says so, so a restart cannot bring a removed phone back. The main process asks for confirmation in its own dialog, so not even a compromised page can remove devices silently. | 1, 6 |
| T15 | Stealing the TLS private key from the PC's disk            | The key is encrypted with Electron `safeStorage` (DPAPI, bound to the Windows user). The app refuses to store it if encryption is unavailable. On load, the key must match the certificate. | 1 |
| T31 | Abusing the unauthenticated pairing endpoint (slow or large bodies, probing) | The endpoint is closed unless a code is on screen and then answers without reading the body; JSON bodies are limited to 4 KiB and must arrive within 10 s; every failure counts towards the rate limit. | 2 |
| T32 | The pairing secret leaks on the PC                         | Only its hash is kept for checking; the plaintext exists only to draw the QR code and is never written to disk or logged. Use, expiry, a new code or closing the window discards it. | 2 |

### 4.3 Received files (the PC's file system and shell)

| ID  | Threat                                                     | Mitigation                                                                                                   | Phase |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----- |
| T16 | Path traversal (`..\..\Windows\evil.dll`)                  | The client's name is never trusted: only the last path segment is kept, separators and invalid characters are replaced, and the final path must be a direct child of the receive folder (assertion). | 1 |
| T17 | Windows name tricks: device names (`CON`, `NUL.txt`), alternate data streams (`a.jpg:evil`), trailing dots and spaces | Device names get a `_` prefix; `:` and other invalid characters are replaced; trailing dots and spaces are removed. | 1 |
| T18 | Disguised file types (right-to-left override: `invoice‮gpj.exe` looks like `invoiceexe.jpg`), invisible characters | All Unicode control, format and line separator characters are removed; names are NFC-normalized. | 1 |
| T19 | Overwriting existing files                                 | The final name is claimed with an exclusive create (fails if anything exists), then ` (1)`, ` (2)`, … are tried. Nothing is ever replaced except the empty placeholder ilet just created. | 1 |
| T20 | A malicious executable or document is opened              | Every file gets Mark-of-the-Web (`Zone.Identifier`, ZoneId=3, Internet zone) before it appears under its final name, so SmartScreen and Office Protected View treat it like a browser download. ilet never opens or runs received files; the notification only reveals the file in Explorer. | 1, 6 |
| T21 | Passive credential leak: a `.url`, `.lnk`, `.scf`, `.library-ms`, `.searchConnector-ms`, `.theme` file, `desktop.ini` or `autorun.inf` (at a drive's root) points its icon to `\\attacker\share`, and Windows sends the user's NTLM hash as soon as Explorer shows the folder | These types get `.txt` appended, so Explorer treats them as plain text. | 1 |
| T22 | Disk exhaustion                                            | Configurable maximum file size; free space check that keeps a reserve and counts uploads in progress; concurrent upload limit. | 1 |
| T23 | Partial or corrupted files                                 | Uploads stream to a `.part` file, the byte count is checked against `Content-Length`, then the file is renamed. Partial files are deleted on error, abort or revocation, and leftovers are removed at startup. | 1 |

### 4.4 Desktop application

| ID  | Threat                                                     | Mitigation                                                                                                   | Phase |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----- |
| T24 | Information leaks through errors or logs                   | Error bodies contain only a code. Logs never contain tokens, secrets, `Authorization` headers or file content; logged values are escaped so they cannot forge log lines. On the iPhone, errors are logged only by their domain and code, so not even file names reach the log (SECURITY_REVIEW.md, S9). | 1, 5 |
| T25 | A compromised renderer (XSS) reaches Node.js or the network | `contextIsolation`, `sandbox`, no `nodeIntegration`. The page is served from a custom `ilet://` protocol with a fixed list of bundled files and a strict CSP (`default-src 'none'`). The preload exposes only the functions of the IPC contract; the main process accepts IPC only from the top frame of its own window and checks every argument against what its channel takes (for example, a device ID must be a UUID). The page never sends a path: the receive folder is picked in a system dialog that the main process opens. Navigation, new windows, `<webview>`, all permission requests and all http(s)/ws requests are blocked. Text from outside (device names, paths, adapter names) is only ever set with `textContent`, and Trusted Types in the CSP make the browser refuse any attempt to write HTML. | 2, 6 |
| T26 | Code injection into the app binary (`ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, edited ASAR) | Electron fuses: RunAsNode and NODE_OPTIONS disabled, app loaded only from ASAR, ASAR integrity validation, set in `electron-builder.yml` and checked in the built `.exe`. Code signing later. | 7 |
| T27 | The dev-only token script ships in the product, or its token is used from the network | It is a separate entry point, compiled to a separate folder (`dist-dev/`) that the installer never includes; it uses a separate data folder, listens only on `127.0.0.1` and refuses to run in a packaged app. | 1 |
| T35 | The receive folder is set to a place from which Windows or programs run or read files by themselves (the Startup folder, a drive's root, a folder on PATH, AppData, ilet's own program folder, hidden settings folders such as `.ssh`), so a paired phone gets code executed without anyone opening a file | The folder is picked in a system dialog and checked before use: these locations are refused (AppData also where Windows says it is, in case it was moved or redirected), and a test file must take Mark-of-the-Web (which also refuses FAT32 and exFAT drives, where files would lose it). Links, junctions and short names (8.3) are resolved both in the chosen folder and in the forbidden ones, so no forbidden folder can be reached under another name (SECURITY_REVIEW.md S8). A stored folder that is no longer allowed falls back to `Downloads\ilet` at startup; it is checked the same way, through its nearest existing parent if it does not exist yet. A folder changed during an upload does not affect that upload. | 6 |
| T36 | A paired phone floods the PC with notifications            | At most one notification every 3 seconds; files arriving in between are counted in the next one. Clicking reveals the file in Explorer and never opens it. | 6 |
| T37 | The network check runs PowerShell                           | It is started by its full path in the Windows folder, never found through PATH, with a fixed command that contains no outside text, a 10 s timeout and a limit on its output. A failed check keeps what was known. | 6 |
| T28 | Supply-chain attack through npm packages                   | Two runtime dependencies: `qr` (no dependencies of its own) and `@homebridge/ciao` for mDNS (seven small, widely used packages of its own); every package justified in the README; exact versions and a committed lock file; install scripts disabled; only releases at least 14 days old. In CI, GitHub Actions are pinned to commit hashes and the build tools (XcodeGen, SwiftLint) to exact versions with checked SHA-256 sums; the workflows get a read-only token, except the job that makes Windows releases (T39), and only the TestFlight workflow gets secrets (T38). | 1, 2, 4 |
| T38 | The secrets of the TestFlight workflow are stolen: the App Store Connect API key, which has Admin access because the workflow makes provisioning profiles, and the private key of the team's Apple Distribution certificate. With them someone could publish their own build of ilet from this account | Both are encrypted repository secrets, so pull requests (also from forks) never get them, and the workflow runs only when the owner starts it or pushes a `testflight-*` tag. Apart from a first check of their format, only the steps that need them get them: the key files are written after the downloaded build tool (XcodeGen) has run, only the runner's user can read them, the signing key sits in a keychain of its own with a random password, everything is deleted at the end, and nothing prints a key or a token. Besides Apple's tools, the steps that see the keys run only the repository's own App Store Connect helper (tested in the iOS checks); the workflow's only action is checkout, pinned to a commit. If a key may have leaked, the API key is revoked in App Store Connect and the certificate on developer.apple.com. | 7 |
| T39 | Users download a tampered Windows installer: someone swaps the file on a release, or gets their own code into a release build (through a pull request, a cache or a compromised action) | Releases come only from `.github/workflows/desktop.yml`, which builds on GitHub's Windows PCs from a fresh checkout, without caches, and makes a release only when the owner starts it on `main`. The build job runs the repository's code and npm packages (T28) with a read-only token and no secrets. The only job that can write runs none of them: it takes the built installer, attests it and makes a draft release, using only GitHub's own actions, pinned to commits. The owner checks the draft and publishes it. Each release gives the installer's SHA-256 and a GitHub attestation, signed through Sigstore and publicly recorded, of the workflow and commit that built it, which `gh attestation verify` checks. With release immutability turned on in the repository settings, a published release's files and tag cannot change. | 7 |

### 4.5 Privacy

| ID  | Threat                                                     | Mitigation                                                                                                   | Phase |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----- |
| T29 | Leaking information to the network                         | mDNS TXT records and `/api/info` contain only the device ID and display name (plus the protocol version). The iPhone announces nothing; it sends a query for `_ilet._tcp` only when none of the PC's known addresses answers. No accounts, cloud, analytics or tracking. | 1, 4 |
| T30 | iOS privacy rules                                          | Local network, Bonjour and camera usage descriptions; `PrivacyInfo.xcprivacy`; no third-party SDKs.          | 3 |
| T33 | Announcements tell everyone on the same network that ilet runs on this PC, with its name and device ID, also on public Wi-Fi | Only the device ID and display name are announced. The ID is random (UUID v4), not derived from the hardware or the user. mDNS uses a link-local multicast address that routers never forward. ilet announces only on networks that Windows classifies as Private; on Public and Domain networks it stays silent. | 4, 6 |

### 4.6 Share Extension and preparing files

| ID  | Threat                                                     | Mitigation                                                                                                   | Phase |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----- |
| T40 | ADV5 shares crafted items with ilet, or leaves them in Files for the user to pick in the app: a name with a path or invisible characters, a link posing as a file, a file that is not the type its name says, or a photo or video too large to convert in the extension's little memory | Only files are taken (types that conform to `public.data`, never `public.url`). A name from outside ilet, shared or picked in the app, keeps only its last path component, loses control, format and line separator characters, and is cut to 200 bytes between characters, keeping its extension; the PC cleans it again on arrival (T16–T18). Only Apple's frameworks read files for conversion (Image I/O for photos, AVFoundation for videos), one file at a time, and only files whose extension names a HEIC photo or a video; every other file is sent as it is, unread. A video is converted only if its video track really is HEVC. In the extension, a HEIC photo is converted to JPG only if it fits in 48 MiB once decoded, and an HEVC video to H.264 (MP4) only up to 1920 × 1080 pixels per frame; larger ones are sent as they are, with a note. A conversion that fails sends the original. | 5 |
| T41 | Copies of shared or picked files stay on the phone, or ilet deletes files that are not its own | Each copy, from the app or the extension, is made in a folder of its own in the App Group, only to be sent; a converted file replaces it in the same folder. The folder is deleted when its upload ends or cannot start, and folders older than 48 hours are removed whenever the app or the extension starts. A folder's name comes back from iOS with each finished upload, so ilet deletes only folders whose names it could have made (a time and a UUID, checked exactly). | 5 |

## 5. Security invariants

These must always be true. The Phase 7 review checks each one against the code.

1. Received data is never written outside the receive folder.
2. A received file never appears under its final name without Mark-of-the-Web.
3. Plaintext tokens and pairing secrets are never written to disk on the PC, and never logged on
   either side.
4. Every request except `GET /api/info` and `POST /api/v1/pair` is authenticated with a token
   before its body is read.
5. The phone never sends a token or file data to a server whose certificate fingerprint differs
   from the pin.
6. ilet never opens or executes a received file.
7. Existing files are never overwritten.
8. The pairing endpoint reads no request body unless a pairing code is on screen.
9. The window can load only the bundled files and has no direct access to Node.js.

## 6. Accepted risks

| Risk                                                                                     | Why it is accepted                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A paired device can send any file type without confirmation, including a DLL that a program started from the receive folder could load (Windows does not check Mark-of-the-Web for DLLs). | This is the product's purpose. Mitigated by T19–T21, no auto-open and revocation. |
| A lost phone can send files until the user revokes it on the PC.                         | It can only add files; it cannot read anything from the PC.              |
| Someone who sees the QR code within 120 s could pair before the user.                    | Visible pairing confirmation and revocation (T11).                       |
| An active LAN attacker can block the connection (denial of service), for example by hiding the PC's announcement among fake ones. | No application can prevent this on a shared network.                    |
| Per-address rate limits can be bypassed by changing IP addresses on the LAN.             | Guessing a 256-bit token or secret stays infeasible; the limit is defense in depth. |
| A user tricked into scanning an attacker's QR code pairs with the attacker's PC.         | The app shows the PC's name and the user chooses the default PC; this is social engineering. |
| TLS 1.2 is accepted (restricted suites).                                                 | Windows 10 tools such as curl cannot use TLS 1.3. The iPhone uses TLS 1.3, and TLS 1.3's downgrade protection prevents forcing it to 1.2. |
| Same-user malware can decrypt the TLS key through DPAPI.                                  | Out of scope (section 3).                                                |
| In background uploads (from the app and from the Share Extension), iOS follows a redirect itself, before ilet can refuse it, even to plain `http://` on the local network. | Only a server with the pinned certificate's private key (A2) can send one, and with that key it could receive the upload directly anyway (T2, T15). The PC never sends redirects, and ilet reports a redirected upload as failed. |
| The Windows installer is not code-signed, so SmartScreen warns before it runs and Windows cannot show who made it. | Signing needs a paid certificate, or the Microsoft Store, which signs the packages it distributes (planned). Until then, each release's attestation proves which workflow and commit built the file (T39). |
