# ilet security review (Phase 7)

*2 November 2026.* The whole codebase (`desktop/`, `ios/`, the installer script and the CI
workflow) was checked against every threat in [THREAT_MODEL.md](THREAT_MODEL.md) (T1–T37) and its
nine security invariants. Every finding below is fixed, with tests. S8 was found afterwards, on
4 November 2026, by the first run of the Windows checks on GitHub.

## Summary

No critical or high findings. All nine invariants hold. One medium and seven low findings:

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

## Findings

### S1 · Medium · Domain networks are trusted by the app but blocked by the firewall (T5, T33)

The installer allows ilet only on Private networks and blocks it on Public and Domain networks.
The app itself (`network/networkExposure.ts`) blocks only Public networks: on a Domain network
(an organization's network) it announces the PC's name and device ID over mDNS and accepts
connections whenever another firewall rule lets them through. An adapter that has no network
category yet (while Windows is still identifying the network) is not blocked either.

**Fix:** trust only Private networks, the same rule as the firewall. Connections are accepted only
on this PC's addresses on Private networks (plus loopback), so an unknown adapter is blocked until
Windows classifies it. Domain networks get their own explanation in the window, because the user
cannot switch them to Private.

### S2 · Low · A removal that could not be saved is undone by a restart (T14)

`DeviceRegistry.revoke` removes the phone in memory and from the window's list, then writes
`devices.json`. If that write fails (an antivirus scanner holding the file, a full disk), the page
ignores the error (`devicesView.ts`), the phone looks removed, and after the next start its token
works again. A failed pairing write similarly leaves a device in memory that nobody has a token
for (harmless, but wrong).

**Fix:** every change to the list is saved first and takes effect only once saved; then the
phone's uploads are aborted. If saving fails, nothing changes, the phone stays in the list, and the
window says the removal failed.

### S3 · Low · `autorun.inf` and drive roots (T21, T35)

Explorer reads `autorun.inf` at the root of a drive to show that drive's icon and name, and a
receive folder may be a drive root such as `D:\`. A drive root is also where Windows first looks
for programs whose installed path contains spaces but no quotes (`D:\Program.exe` for
`D:\Program Files\…`).

**Fix:** append `.txt` to `autorun.inf` like the other shell-parsed files, and refuse a drive's
top folder as the receive folder.

### S4 · Low · `NSBonjourServices` is missing (T30)

The spec and T30 require `NSBonjourServices` with `_ilet._tcp` in the iPhone app's Info.plist.
Without it, iOS 14 and later block browsing for the PC, so finding the PC again (Phase 4) cannot
work.

**Fix:** add the key in `ios/project.yml`.

### S5 · Low (hardening) · The iPhone app follows redirects (invariant 5)

URLSession follows HTTP redirects unless the delegate refuses them. A redirect could carry a
request with the token or a file away from the pinned connection, even to plain `http://` on
the local network, which `NSAllowsLocalNetworking` permits. Only the pinned PC can send a
redirect, so nobody else can exploit this today; the protocol never uses redirects.

**Fix:** `PinningTaskDelegate` refuses every redirect.

*Later (Phase 5):* the Share Extension's background uploads cannot refuse redirects, because iOS
follows them itself in background sessions. THREAT_MODEL.md, section 6, says why that is accepted.

### S6 · Low (hardening) · Invisible characters in the PC name (T13, T18)

The confirmation screen, which shows the PC name from the QR code, is the user's defense
against a forged code. The name is checked only for length, so a forged code could use a
right-to-left override or line breaks to imitate another name. The PC never puts such characters
into a name (`sanitizeDisplayName`).

**Fix:** a code whose name contains control, format or line separator characters is refused.

### S7 · Low (hardening) · HTML in the window (T25)

The page sets outside text only with `textContent`, but that is a coding rule, not something the
browser enforces.

**Fix:** add Trusted Types to the window's Content Security Policy
(`require-trusted-types-for 'script'; trusted-types 'none'`): any attempt to write HTML into the
page then fails.

### S8 · Low · Forbidden receive folders under another name (T35)

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

## Invariants

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

## Notes

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
