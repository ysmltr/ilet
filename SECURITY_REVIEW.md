# ilet security reviews

1. [Phase 7](#phase-7-review-the-whole-codebase), 2 November 2026: the whole codebase,
   findings S1 to S8, and S11, found later in the same code.
2. [Phase 5](#phase-5-review-the-share-extension-background-uploads-and-video-conversion),
   6 November 2026: the Share Extension, background uploads and video conversion, all written
   after Phase 7; findings S9 and S10.

Every finding is fixed, with tests.

## Phase 7 review: the whole codebase
*2 November 2026.* The whole codebase (`desktop/`, `ios/`, the installer script and the CI
workflow) was checked against every threat in [THREAT_MODEL.md](THREAT_MODEL.md) (T1–T37) and its
nine security invariants. Every finding below is fixed, with tests. S8 was found afterwards, on
4 November 2026, by the first run of the Windows checks on GitHub, and S11 on 6 November 2026,
when the PC showed an error dialog during the first test of the iPhone's half of Phase 4.

### Summary

No critical or high findings. All nine invariants hold. One medium and eight low findings:

| ID | Severity          | Area    | Finding                                                               | Status |
| -- | ----------------- | ------- | --------------------------------------------------------------------- | ------ |
| S1 | Medium            | Desktop | Domain networks: the firewall blocks ilet, but the app trusts them     | Fixed  |
| S2 | Low               | Desktop | A phone removal that could not be saved is undone by a restart         | Fixed  |
| S3 | Low               | Desktop | `autorun.inf` is not neutralized, and a drive root can be the receive folder | Fixed |
| S4 | Low               | iPhone  | `NSBonjourServices` is missing from Info.plist                          | Fixed  |
| S5 | Low (hardening)   | iPhone  | The app follows HTTP redirects                                         | Fixed  |
| S6 | Low (hardening)   | iPhone  | The PC name from the QR code may contain invisible characters          | Fixed  |
| S7 | Low (hardening)   | Desktop | The "text only, never HTML" rule for the window is not enforced by the browser | Fixed |
| S8 | Low               | Desktop | A forbidden receive folder can be reached under another name (a junction, a short name) | Fixed |
| S11 | Low              | Desktop | While Windows joins a network, a packet can make the Bonjour library throw, which shows an error dialog | Fixed |

### Findings

#### S1 · Medium · Domain networks are trusted by the app but blocked by the firewall (T5, T33)

The installer allows ilet only on Private networks and blocks it on Public and Domain networks.
The app itself (`network/networkExposure.ts`) blocks only Public networks: on a Domain network
(an organization's network) it announces the PC's name and device ID over mDNS and accepts
connections whenever another firewall rule lets them through. An adapter that has no network
category yet (while Windows is still identifying the network) is not blocked either.

**Fix:** trust only Private networks, the same rule as the firewall. Connections are accepted only
on this PC's addresses on Private networks (plus loopback), so an unknown adapter is blocked until
Windows classifies it. Domain networks get their own explanation in the window, because the user
cannot switch them to Private.

#### S2 · Low · A removal that could not be saved is undone by a restart (T14)

`DeviceRegistry.revoke` removes the phone in memory and from the window's list, then writes
`devices.json`. If that write fails (an antivirus scanner holding the file, a full disk), the page
ignores the error (`devicesView.ts`), the phone looks removed, and after the next start its token
works again. A failed pairing write similarly leaves a device in memory that nobody has a token
for (harmless, but wrong).

**Fix:** every change to the list is saved first and takes effect only once saved; then the
phone's uploads are aborted. If saving fails, nothing changes, the phone stays in the list, and the
window says the removal failed.

#### S3 · Low · `autorun.inf` and drive roots (T21, T35)

Explorer reads `autorun.inf` at the root of a drive to show that drive's icon and name, and a
receive folder may be a drive root such as `D:\`. A drive root is also where Windows first looks
for programs whose installed path contains spaces but no quotes (`D:\Program.exe` for
`D:\Program Files\…`).

**Fix:** append `.txt` to `autorun.inf` like the other shell-parsed files, and refuse a drive's
top folder as the receive folder.

#### S4 · Low · `NSBonjourServices` is missing (T30)

The spec and T30 require `NSBonjourServices` with `_ilet._tcp` in the iPhone app's Info.plist.
Without it, iOS 14 and later block browsing for the PC, so finding the PC again (Phase 4) cannot
work.

**Fix:** add the key in `ios/project.yml`.

#### S5 · Low (hardening) · The iPhone app follows redirects (invariant 5)

URLSession follows HTTP redirects unless the delegate refuses them. A redirect could carry a
request with the token or a file away from the pinned connection, even to plain `http://` on
the local network, which `NSAllowsLocalNetworking` permits. Only the pinned PC can send a
redirect, so nobody else can exploit this today; the protocol never uses redirects.

**Fix:** `PinningTaskDelegate` refuses every redirect.

*Later (Phase 5):* background uploads cannot refuse redirects, because iOS follows them itself in
background sessions. The Share Extension sends only that way, and so does the app now, so that its
uploads carry on when the user switches apps or locks the phone. `PinningTaskDelegate` still
refuses redirects for the app's other requests (info, pairing, status). THREAT_MODEL.md, section
6, says why that is accepted.

#### S6 · Low (hardening) · Invisible characters in the PC name (T13, T18)

The confirmation screen, which shows the PC name from the QR code, is the user's defense
against a forged code. The name is checked only for length, so a forged code could use a
right-to-left override or line breaks to imitate another name. The PC never puts such characters
into a name (`sanitizeDisplayName`).

**Fix:** a code whose name contains control, format or line separator characters is refused.

#### S7 · Low (hardening) · HTML in the window (T25)

The page sets outside text only with `textContent`, but that is a coding rule, not something the
browser enforces.

**Fix:** add Trusted Types to the window's Content Security Policy
(`require-trusted-types-for 'script'; trusted-types 'none'`): any attempt to write HTML into the
page then fails.

#### S8 · Low · Forbidden receive folders under another name (T35)

The receive-folder check resolved the chosen folder to its real path (links, junctions and short
8.3 names such as `C:\PROGRA~1` written out), but compared it with the forbidden folders as they
were written. A forbidden folder written differently from its real path then did not match: a home
folder that is a junction to another drive, a folder on PATH written with a short name or through
a link. AppData redirected away from the home folder was not covered at all, and the check at
startup compared the stored folder only as written. The user would still have had to pick such a
folder. GitHub's Windows PCs showed it, because their temporary folder has a short name
(`C:\Users\RUNNER~1`).

**Fix:** the forbidden folders are compared both as written and by their real paths, and so is the
stored folder at startup, through its nearest existing parent if it does not exist yet. AppData is
also forbidden where `APPDATA` and `LOCALAPPDATA` say it is.

#### S11 · Low · The Bonjour library throws while Windows joins a network (T34)

While Windows joins a network, the adapter has its link-local IPv6 address for a moment, but no
IPv4 address yet. ciao 1.3.12 looks at the adapters every 15 seconds, and if it looks just then,
it keeps the adapter without an IPv4 address. If the adapter had one before, ciao leaves its IPv4
socket open, and the next packet there is compared with the IPv4 netmask that is now missing. An
assertion then throws before ciao's per-packet error handling, and Electron shows "A JavaScript
error occurred in the main process". If the adapter had no IPv4 address yet, ciao never opens a
socket for it, so the PC is not announced on that network, and an iPhone whose known addresses
fail cannot find it there. Nothing leaked and no file was touched. Someone on the network who can
make the PC join it again (by knocking it off the Wi-Fi, for example) could bring the dialog back.
It showed up when the PC moved between the iPhone's hotspot and the home Wi-Fi.

**Fix:** ilet asks ciao to leave out an adapter while it has no IPv4 address (`excludeIpv6Only`,
in `responderOptions`). ciao then closes the adapter's socket, and opens a new one and announces
again once the adapter has an IPv4 address. Tests take ciao itself through such a network change,
without opening sockets; without the option they fail with the dialog's error. ciao 1.4.0, out
since 1 November 2026, is too new for ilet's 14-day rule (T28), so it is not used yet.

### Invariants

| # | Invariant                                               | Where it is enforced                                                  |
| - | ------------------------------------------------------- | --------------------------------------------------------------------- |
| 1 | Data only in the receive folder                         | `resolveInsideFolder` for the `.part` file and the final name          |
| 2 | Mark-of-the-Web before the final name                   | `FileReceiver.store`: mark, then rename; a failed mark deletes the file |
| 3 | No plaintext tokens or secrets on disk or in logs       | `issueSecret` keeps hashes only; JSON errors are not logged; iOS `Log` |
| 4 | Authentication before any body                          | `routing.ts` order; upload route reads the body last                   |
| 5 | No token or data to an unpinned server                  | `PinningTaskDelegate` per request, one URLSession per pin (see S5)    |
| 6 | Received files are never opened                        | Only `shell.showItemInFolder`                                          |
| 7 | No overwrites                                           | `claimUniqueFile` (exclusive create), `.part` with `wx`               |
| 8 | Pairing reads no body without a code on screen          | `pairRoute` checks `codes.isActive()` first                            |
| 9 | Window loads only bundled files, no Node.js             | `ilet://` with a fixed file list, CSP, sandbox, IPC sender checks     |

### Notes

- **Windows 10 no longer gets security updates** (support ended in October 2025; the consumer
  Extended Security Updates programme ended in October 2026). ilet relies on Windows' own
  protections, such as SmartScreen, Mark-of-the-Web and the fixes for NTLM leaks. Windows 11 is
  recommended for the PC that receives files.
- **Don't run programs from the receive folder.** Windows does not check Mark-of-the-Web for DLLs,
  so an installer started there could load a DLL that a paired phone put next to it. This is part
  of the accepted risk "a paired device can send any file type".
- Checked without findings: TLS settings and timeouts, token and secret handling, rate limits,
  file name rules, disk space checks, the receive-folder rules (but see S8), PowerShell use, the IPC guard,
  certificate creation and storage, the Keychain attributes, the QR address rules and the
  iPhone's temporary files.

## Phase 5 review: the Share Extension, background uploads and video conversion

*6 November 2026.* Everything written after the Phase 7 review was checked against the threat
model (T2, T10, T18, T29, T30, T38, T40, T41) and its nine invariants: the Share Extension
(`ios/IletShare`), the background uploads that the app and the extension share
(`BackgroundUploads`, `BackgroundUploadDelegate`, `TemporaryFiles`), the app's sending
(`AppUploads`, `SendViewModel`, `PickedFile`), the conversion of photos and videos
(`FilePreparer`, `VideoConverter`) and the TestFlight workflow's signing of the extension. The
review came after the extension had worked on an iPhone (build 10.1).

### Summary

No critical, high or medium findings. All nine invariants hold, with the accepted risk that iOS
follows redirects in background uploads (THREAT_MODEL.md, section 6). Two low findings, both
fixed, with tests:

| ID  | Severity        | Area   | Finding                                                           | Status |
| --- | --------------- | ------ | ----------------------------------------------------------------- | ------ |
| S9  | Low (hardening) | iPhone | Error messages in the iPhone's log can contain file names         | Fixed  |
| S10 | Low (hardening) | iPhone | Names of files picked in the app are not cleaned like shared ones | Fixed  |

### Findings

#### S9 · Low (hardening) · File names in the iPhone's log (invariant 3, A1)

Some errors were logged with their localized description, marked public so that it stays
readable. For a file, that description names the file, for example "IMG_0001.HEIC couldn't be
copied". Tokens, secrets and file contents never reached the log, but file names are personal
too, and public log entries go into the diagnostic reports that a user may send to Apple.

**Fix:** every error is logged only by its domain and code (`Error.logSummary`), which tell what
failed without naming anything.

#### S10 · Low (hardening) · Names of picked files are not cleaned (T18, T40)

The share sheet cleans the names that other apps give shared items (`SharedFileName`): no path,
no invisible characters, at most 200 bytes. The app used the name of a file picked in Files as it
was, although any app can name a file there. A right-to-left override could then disguise the
file in ilet's list: `invoice`, the override and `gpj.exe` show as `invoiceexe.jpg`. The PC
cleans every name again (T18), so no saved file was ever disguised; only the iPhone's list could
mislead.

**Fix:** the app cleans the names of picked files and photos the same way.

### Invariants

As in Phase 7, except where invariant 5 is enforced. The app's other requests (info, pairing,
status) still go through `PinningTaskDelegate`. Every upload, from the app or the extension, goes
through a background session whose delegate checks the pin from the task's record on every new
connection (`BackgroundUploadDelegate.accepts`); a task without a readable record is refused.

### Notes

- **Checked without findings:** the pin travels with each task, and the record holds only an ID,
  the pin and a folder name (T10); the PC's answer is read up to 64 KiB; background uploads never
  use mobile data and keep no cookies, cache or credentials; copies are deleted only by exact
  folder names, and after 48 hours at the latest (T41); file names in the upload header are
  percent-encoded, so no name can add a header; the share sheet takes only files, never links;
  the extension's entitlements hold only the App Group and the Keychain group, its only ATS
  exception is `NSAllowsLocalNetworking`, and it has its own privacy manifest; the TestFlight
  workflow's secrets still reach only the steps that need them (T38).
- **Converting means parsing.** With "Send photos as JPG, videos as MP4" on, photos and videos
  from other apps are opened by Apple's Image I/O and AVFoundation, the frameworks Photos uses
  for the same files; before Phase 5 only photos were. A file is opened only if its extension
  says it is a photo or a video, and with the setting off every file is sent unread.
- **Not security, fixed along the way:** the app opens its background session as soon as it
  starts, so iOS may deliver all of the session's events before it hands over the handler that
  the app must call once they are in. In that case the app now calls the handler as soon as it
  arrives, instead of never.
