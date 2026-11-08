# Microsoft Store package

The Desktop workflow builds ilet for the Microsoft Store too: `ilet-Store-<version>.appx`, from
the same code as the installer. Windows installs, runs and updates a Store app in its own way, so
a few things work differently. The package is not signed: the Store signs it when it accepts it.
Before that, Windows installs it only in Developer Mode, for a test (see
[Trying the package](#trying-the-package)).

## What is different

|                          | Installer (`ilet-Setup-<version>.exe`)                                          | Microsoft Store                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Updates                  | Download the new installer from Releases                                        | The Store installs them by itself; users can only pause them. ilet has no updater of its own.                             |
| Firewall                 | The installer's rules allow ilet on Private networks and block it on the others | The package's rules allow ilet on Private networks. A package cannot block, so ilet does not listen on any other network. |
| Bonjour (finding the PC) | On Private networks                                                             | Only while no other network is connected (see below); without it, the iPhone tries the addresses it knows                 |
| Start with Windows       | The checkbox in ilet's settings                                                 | Off at first. It is switched on in Windows Settings › Apps › Startup, which a button in ilet's settings opens.            |
| Send to › iPhone (ilet)  | In File Explorer's right-click menu                                             | Not there: drop files on ilet's window, or use Send to iPhone in it                                                       |
| Data in AppData          | `%APPDATA%\ilet`, kept after uninstalling                                       | Windows keeps what ilet creates there in a folder of the package and deletes it when ilet is uninstalled                  |

**Why ilet listens differently.** Windows Firewall asks the user whether an app may use a network
when the app listens there and no rule decides. The installer's block rules answer that question
for Public and Domain networks. A Store package can only allow, so the Store version must not
listen on those networks at all: its server listens only on the addresses that the PC has on
Private networks, and on `127.0.0.1`, and follows them when networks change. Until it knows which
networks are Private, it listens on `127.0.0.1` only, and asks Windows again every 30 seconds for
the first five minutes. Bonjour's port (UDP 5353) is
opened on every network at once, so the Store version announces itself only while every
connected network is Private. A second network that is not, such as a VPN or the virtual network
of WSL or Hyper-V, turns the announcement off.

**Why there is no Send to.** Windows keeps the files that a Store app creates in AppData private
to that app, and Explorer's Send to folder is in AppData, so Explorer would never see the entry.

**Data.** Windows keeps the files that the Store version creates in AppData in a folder of the
package (in `%LOCALAPPDATA%\Packages`), shows them to ilet as if they were in `%APPDATA%\ilet`,
and deletes them when ilet is uninstalled. Files that were already there, from the installer
version, stay where they are, and the Store version can read and change them. Received files go to
the folder chosen in the settings, `Downloads\ilet` at first, as in the installer version, and stay
there after uninstalling.

Use one version per PC: both use the same data folder name, so only one of them can run at a time,
and Windows may keep what the Store version changes away from the installer version. To move to
the Store version, turn off Start with Windows in the installer version, then uninstall it
(Settings › Apps).

## Trying the package

Do this before the first submission, and after changes to the Store version's own parts (the
manifest, the firewall rules, where ilet listens). You need the PC that has the installer version
and the paired iPhone.

1. Turn on Developer Mode: Settings › Update & Security › For developers › Developer Mode. It lets
   Windows install an app from a folder without a signature. Turn it off again at the end.
2. Quit the installer version: right-click ilet's icon next to the clock › Quit ilet.
3. On GitHub: Actions › Desktop › the newest run on `main` › **store-package**, at the bottom of the
   run's page (it is kept for 7 days). It downloads as `store-package.zip`.
4. In Windows PowerShell, in the folder where the zip is (`cd $HOME\Downloads`), unpack it twice
   (an `.appx` is a zip file too) and install it from the folder. Keep the folder while the test
   version is installed: Windows runs it from there.

   ```powershell
   Expand-Archive .\store-package.zip -DestinationPath .\ilet-store-test
   Copy-Item .\ilet-store-test\ilet-Store-*.appx .\ilet-store-test\package.zip
   Expand-Archive .\ilet-store-test\package.zip -DestinationPath .\ilet-store-test\package
   Add-AppxPackage -Register .\ilet-store-test\package\AppxManifest.xml
   ```

5. Start it from the Start menu, where it is **ilet: Files Between Phone & PC** (the installer
   version is ilet), or with this command, which finds it by its package name (`identityName` in
   `electron-builder.yml`). Its settings show **Open startup settings** instead of the Start with
   Windows checkbox.

   ```powershell
   explorer.exe "shell:AppsFolder\$((Get-AppxPackage -Name landroapps.iletFilesBetweenPhonePC).PackageFamilyName)!ilet"
   ```

What to check:

- **Startup:** Open startup settings opens Windows' Startup page, where ilet is listed and off. If
  you switch it on and sign out and in again, ilet starts in the tray without its window.
- **Pairing and receiving:** send a photo from the iPhone. It should arrive without pairing again,
  because the Store version reads the installer version's data. The notification appears, and
  clicking it shows the file in Explorer.
- **Sending:** drop a file on ilet's window and confirm; with ilet open on the iPhone, it arrives
  there.
- **No firewall question:** with ilet running, set the Wi-Fi to Public (Settings › Network &
  Internet › Wi-Fi › your network › Network profile). The iPhone can no longer reach the PC, and
  **Windows must not ask about the firewall**, also not a few minutes later. ilet reads the
  network categories every 5 minutes and whenever its window opens, so close the window and open
  it again from the tray: it shows the Public network warning. Set the Wi-Fi back to Private and
  click **Check again**: the iPhone reaches the PC again. Then quit ilet, set the Wi-Fi to Public
  and start ilet: again no question; set it back to Private. If you have a second network at hand
  (Ethernet, a phone's hotspot over USB, a VPN), connect it while ilet runs on the Private Wi-Fi:
  no question either. If Windows does ask, choose **Cancel**, never Allow, and stop the test.
- **Two versions:** rename the iPhone in the list of paired devices, quit the Store version from
  the tray, then start the installer version: its list shows whether it sees the Store version's
  change. Quit the installer version again.

Then remove the test version, delete the folder and turn Developer Mode off:

```powershell
Get-AppxPackage -Name landroapps.iletFilesBetweenPhonePC | Remove-AppxPackage
Remove-Item -Recurse .\ilet-store-test
```

Start the installer version again from the Start menu.

## Submitting

The Store offers ilet to users only after Microsoft's certification. Without the iPhone app, ilet
on Windows can do little, so submit it once the iPhone app is in the App Store. That order works:
App Review gets the Windows app from Releases ([ios/APP_STORE.md](../ios/APP_STORE.md)).

1. **A developer account.** Your own step: sign up for the Microsoft Store in Partner Center
   (<https://partner.microsoft.com>) as an individual. Microsoft checks your identity with an ID
   document and a photo of you; Partner Center shows the fee, if there is one. Turn on two-step
   verification for the Microsoft account: whoever signs in can upload a package that Windows
   installs on every user's PC by itself (THREAT_MODEL.md T49).
2. **Reserve the name.** Apps and games › New product › **MSIX or PWA app**. The name must be free
   in the whole Store, so have a second one ready; it may differ from the iPhone app's name.
   ilet's is **ilet: Files Between Phone & PC**. The Store Policies (10.1.1) say that a name must
   not contain marketing or descriptive text; if certification objects to it, reserve a shorter
   one under Product management › Manage app names and build again with it.
3. **Product identity.** The app › Product management › Product identity shows
   `Package/Identity/Name`, `Package/Identity/Publisher` and
   `Package/Properties/PublisherDisplayName`. They and the reserved name are in the `appx` section
   of `electron-builder.yml` (`identityName`, `publisher`, `publisherDisplayName`, `displayName`),
   exactly as Partner Center shows them. None of them is secret (every installed copy shows them),
   and the Store shows the publisher's display name to everyone.
4. **The package.** Raise `version` in `desktop/package.json` and push, then start a release
   (Actions › Desktop › Run workflow, on `main`; see Releases in the README). Upload the
   `store-package` of that run: GitHub attests it like the installer, so it is provably the build
   of that commit (`gh attestation verify ilet-Store-<version>.appx --repo ysmltr/ilet` checks
   it). Never upload a package built anywhere else.
5. **The submission.** The app › Start your submission:

| Section                  | What to enter                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pricing and availability | Free; the markets you want; public                                                                                                                       |
| Properties               | Category: Utilities & tools; privacy policy: <https://github.com/ysmltr/ilet/blob/main/PRIVACY.md>; support: <https://github.com/ysmltr/ilet/issues>     |
| Age ratings              | The questionnaire: no for every kind of content, for sharing with other people, location and purchases (ilet moves files between the user's own devices) |
| Packages                 | The `.appx` from step 4                                                                                                                                  |
| Store listings           | English (United States) and Turkish, as in the package: the texts below and at least one screenshot of ilet's window (1366 × 768 pixels or larger)       |
| Submission options       | Why runFullTrust, and the notes for certification, below                                                                                                 |

**Why runFullTrust** (every packaged desktop app needs it):

> ilet is a desktop app (Electron) packaged as MSIX. It runs a local HTTPS server that the user's
> paired iPhone connects to over the local network, shows an icon in the notification area and
> notifications, and saves received files in a folder that the user chooses.

**Notes for certification:**

> ilet receives files from its iPhone app over the local Wi-Fi network; there is no account and no
> online service. The iPhone app: <App Store link>. To try it, click "Pair new device" in ilet's
> window, scan the code with the iPhone app, then share a photo with ilet on the iPhone: it arrives
> in Downloads\ilet, with a notification. Without an iPhone, you can still open the window, show a
> pairing code and choose the receive folder in Settings. ilet accepts connections only on networks
> that Windows treats as Private; on a Public network its window says how to change that.

### Store texts

| Field                  | English                                                           | Türkçe                                                          |
| ---------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Name                   | ilet: Files Between Phone & PC                                    | ilet: Files Between Phone & PC                                  |
| Search terms (up to 7) | iphone, file transfer, photos, videos, wifi, local network, share | iphone, dosya aktarımı, fotoğraf, video, wifi, yerel ağ, paylaş |

**Description (English)**

Share a photo on your iPhone, tap ilet, and it is on your PC.

ilet receives photos, videos and files from your iPhone straight into a folder on this PC, over
your own Wi-Fi. No account, no cloud, no ads, no tracking.

- Pair once: scan the code in ilet's window with the ilet app on your iPhone.
- Files arrive in a folder you choose, and a notification shows each one. ilet never opens them by
  itself.
- iPhone photos arrive as JPG and videos as MP4, so Windows opens them without extra apps.
- Send files to your iPhone too: drop them on ilet's window.
- Works only on networks that Windows treats as Private, such as your home Wi-Fi.
- Every connection is encrypted and tied to your own devices.

Needs the free ilet app on your iPhone.

**Açıklama (Türkçe)**

iPhone’unuzda bir fotoğrafı paylaşın, ilet’e dokunun; fotoğraf bilgisayarınızda.

ilet, iPhone’unuzdaki fotoğraf, video ve dosyaları kendi Wi-Fi ağınız üzerinden doğrudan bu
bilgisayardaki bir klasöre alır. Hesap yok, bulut yok, reklam yok, izleme yok.

- Bir kez eşleştirin: ilet’in penceresindeki kodu iPhone’unuzdaki ilet uygulamasıyla tarayın.
- Dosyalar seçtiğiniz klasöre gelir ve her biri için bir bildirim görünür. ilet onları hiçbir
  zaman kendiliğinden açmaz.
- iPhone fotoğrafları JPG, videoları MP4 olarak gelir; Windows bunları ek uygulama olmadan açar.
- iPhone’unuza da dosya gönderin: dosyaları ilet’in penceresine bırakın.
- Yalnızca Windows’un Özel olarak gördüğü ağlarda, örneğin ev Wi-Fi’nizde çalışır.
- Her bağlantı şifrelidir ve kendi cihazlarınıza bağlıdır.

iPhone’unuzda ücretsiz ilet uygulaması gerekir.

## Updating

1. Raise `version` in `desktop/package.json` (the Store, like Releases, takes each version once)
   and push.
2. Start a release as in step 4 above, and publish the GitHub release as usual.
3. Partner Center › the app › Update: replace the package with that run's `store-package` and
   submit. After certification, Windows updates installed copies by itself.
