# App Store preparation

## Ready in this repository

- App icon and launch screen: `Ilet/Resources/Assets.xcassets`, made from `branding/ilet-icon.svg`
  by `desktop/scripts/render-icons.mjs`. The icon is 1024 × 1024 without transparency (iOS rounds
  the corners); the launch screen shows the drawing without its tile.
- Privacy manifests (`PrivacyInfo.xcprivacy`, in the app and in the Share Extension): no
  tracking, no collected data.
- Permission texts for the camera and the local network, in English and Turkish.
- Export compliance: `ITSAppUsesNonExemptEncryption = NO`, because ilet uses only the system's
  HTTPS and hashing.
- Privacy policy: [PRIVACY.md](../PRIVACY.md), at
  <https://github.com/ysmltr/ilet/blob/main/PRIVACY.md>.

## TestFlight

[`testflight.yml`](../.github/workflows/testflight.yml) builds the app on one of GitHub's Macs,
signs it with your Apple Distribution certificate and uploads it to TestFlight. It needs four
repository secrets (Settings → Secrets and variables → Actions):

| Secret                   | Value                                                  |
| ------------------------ | ------------------------------------------------------ |
| `ASC_KEY_ID`             | The App Store Connect API key's Key ID (10 characters) |
| `ASC_ISSUER_ID`          | The Issuer ID shown above the list of keys             |
| `ASC_KEY_P8`             | The whole downloaded `AuthKey_<Key ID>.p8` file        |
| `APPLE_DISTRIBUTION_KEY` | The whole `ilet-distribution.key` file (see below)     |

The API key is a Team Key with Admin access (App Store Connect → Users and Access →
Integrations). The workflow uses it to find your certificate, to make the App Store provisioning
profiles the first time, and to upload. Whoever has the key can act as an Admin of your App Store
Connect account, so if it may have leaked, revoke it there, then make a new one and update the
secrets.

### The distribution certificate

Apple can also sign the app itself ("cloud signing", without a certificate of yours), but that
fails when the account holder's name has letters such as ş or İ: Apple writes the name into the
signature in a different Unicode form than the certificate has, and App Store Connect rejects the
build with error 90035 ([Apple forum](https://developer.apple.com/forums/thread/848968)). So the
workflow signs with a certificate of your own. It is made once, and Windows is enough:

1. In PowerShell, make a private key and a certificate request with the OpenSSL that comes with
   Git for Windows:

   ```powershell
   New-Item -ItemType Directory -Force "$HOME\ilet-signing" | Out-Null; Set-Location "$HOME\ilet-signing"; & "C:\Program Files\Git\usr\bin\openssl.exe" req -new -newkey rsa:2048 -nodes -keyout ilet-distribution.key -out ilet-distribution.csr -subj "/CN=ilet"
   ```

2. On developer.apple.com: Certificates, Identifiers & Profiles → Certificates → **+** → **Apple
   Distribution** → upload `ilet-distribution.csr`. A team can have only a few distribution
   certificates; if the choice is greyed out, revoke one that nothing uses any more.
3. Open `ilet-distribution.key` in Notepad and copy all of it into the secret
   `APPLE_DISTRIBUTION_KEY`. Nobody else gets this file. Once a build has worked, delete the
   `ilet-signing` folder; a new certificate can be made the same way at any time.

The workflow finds the certificate by its key and keeps one App Store provisioning profile with it
for each App ID (the app's and the Share Extension's), named
`<bundle ID> TestFlight <certificate ID>`. The certificate is valid for a year; then make a new
one the same way and replace the secret. If the key may have leaked, revoke the certificate on
developer.apple.com.

### The Share Extension's App ID

The Share Extension is a bundle of its own inside the app, so it needs its own App ID, with the
app's App Group: that is how it reads the paired PCs. Register it once, before the first build
that has the extension:

1. On developer.apple.com: Certificates, Identifiers & Profiles → Identifiers → **+** →
   **App IDs** → Continue → **App** → Continue.
2. Description: `ilet Share Extension`. Bundle ID: **Explicit**, `com.ysmltr.ilet.share` (the
   app's bundle ID followed by `.share`).
3. Under Capabilities, tick **App Groups**, then Continue → Register.
4. Open the new App ID, click **Configure** next to App Groups, tick `group.com.ysmltr.ilet` →
   Continue → Save, and confirm.

The workflow makes the extension's provisioning profile the first time it runs. If an App ID lacks
the App Group, the workflow stops before signing and says what to fix. Changing an App ID's
capabilities makes Apple mark its profiles invalid, and the next run replaces them.

### Uploading a build

**Actions → TestFlight → Run workflow**, or push a tag that starts with `testflight-`. The build
number is the run number (`7.1` for run 7, `7.2` when it runs again), so every upload is new.
Apple then processes the build for a few minutes before it appears under **TestFlight** in App
Store Connect.

## Before submitting

- [x] The iPhone half of Phase 4 (finding the PC again) is written.
- [x] Phase 5: the Share Extension is written.
- [x] `ILET_BUNDLE_ID_PREFIX` in `Config/Shared.xcconfig` is a reverse-DNS name you own:
      `com.ysmltr.ilet`.
- [x] Apple Developer Program (99 USD a year): register the app's App ID with the App Group
      `group.<prefix>`. The Keychain group needs no registration.
- [ ] Register the Share Extension's App ID `<prefix>.share` with the same App Group (see
      [The Share Extension's App ID](#the-share-extensions-app-id)).
- [x] App Store Connect: create the app.
- [ ] App Store Connect: fill in the answers below.
- [x] Build and upload with the TestFlight workflow (see [TestFlight](#testflight)).
- [ ] Test the TestFlight build on a real iPhone: pairing, sending, the warning for a wrong
      certificate, and Share → ilet from Photos and Files.
- [ ] Screenshots for the 6.9-inch iPhone (1320 × 2868 pixels), in English and Turkish.
- [ ] Publish the Windows installer as a GitHub release, so reviewers and users can get it (the
      Desktop workflow makes the draft; see Releases in the README).

## Answers for App Store Connect

| Question                 | Answer                                                         |
| ------------------------ | -------------------------------------------------------------- |
| App Privacy              | Data Not Collected                                             |
| Age rating               | 4+                                                             |
| Category                 | Utilities (secondary: Productivity)                            |
| Encryption               | Exempt: only the system's HTTPS (set in Info.plist)            |
| Privacy policy URL       | <https://github.com/ysmltr/ilet/blob/main/PRIVACY.md>          |

**Notes for App Review** (they may not have a Windows PC, so add a short video):

> ilet sends files to the free ilet app for Windows on a PC in the same Wi-Fi network. Install it
> from <the release link>, click "Pair new device" and scan the code with ilet on the iPhone, then
> share a photo with ilet. A video of these steps: <link>.

## Store texts

| Field (limit)          | English                                   | Türkçe                                   |
| ---------------------- | ----------------------------------------- | ---------------------------------------- |
| Name (30)              | ilet: Send Files to Your PC               | ilet: Dosyaları PC’ye Gönder             |
| Subtitle (30)          | Photos to Windows over Wi-Fi              | Fotoğrafları Wi-Fi ile PC’ye             |
| Keywords (100)         | transfer,windows,pc,photos,videos,share,wifi,local,send,files,heic,hevc,jpg,mp4,desktop | aktarım,windows,bilgisayar,fotoğraf,video,paylaş,wifi,yerel,gönder,dosya,heic,hevc,jpg,mp4 |

**Description (English)**

Share a photo, tap ilet, and it is on your PC.

ilet sends photos, videos and files from your iPhone straight to a folder on your Windows PC,
over your own Wi-Fi. No account, no cloud, no ads, no tracking.

- Pair once by scanning a code on your PC's screen.
- Send from the share sheet in Photos, Files and other apps.
- Sending carries on when you switch apps or lock your iPhone.
- iPhone photos arrive as JPG and videos as MP4, so Windows opens them without extra apps (you can
  turn this off).
- Every connection is encrypted and tied to your own PC, so nobody else on the network can
  receive your files.

Needs the free ilet app for Windows.

**Açıklama (Türkçe)**

Bir fotoğrafı paylaşın, ilet’e dokunun; fotoğraf bilgisayarınızda.

ilet, fotoğraf, video ve dosyaları iPhone’unuzdan doğrudan Windows bilgisayarınızdaki bir
klasöre, kendi Wi-Fi ağınız üzerinden gönderir. Hesap yok, bulut yok, reklam yok, izleme yok.

- Bilgisayar ekranındaki kodu tarayarak bir kez eşleştirin.
- Fotoğraflar, Dosyalar ve diğer uygulamalardaki paylaşım menüsünden gönderin.
- Başka bir uygulamaya geçseniz ya da iPhone’u kilitleseniz de gönderim sürer.
- iPhone fotoğrafları JPG, videoları MP4 olarak gelir; Windows bunları ek uygulama olmadan açar
  (bunu kapatabilirsiniz).
- Her bağlantı şifrelidir ve kendi bilgisayarınıza bağlıdır; ağdaki başka biri dosyalarınızı
  alamaz.

Windows için ücretsiz ilet uygulaması gerekir.
