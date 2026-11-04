# App Store preparation

## Ready in this repository

- App icon: `Ilet/Resources/Assets.xcassets`, made from `branding/ilet-icon.svg` by
  `desktop/scripts/render-icons.mjs` (1024 × 1024, no transparency; iOS rounds the corners).
- Privacy manifest (`PrivacyInfo.xcprivacy`): no tracking, no collected data.
- Permission texts for the camera and the local network, in English and Turkish.
- Export compliance: `ITSAppUsesNonExemptEncryption = NO`, because ilet uses only the system's
  HTTPS and hashing.
- Privacy policy: [PRIVACY.md](../PRIVACY.md), at
  <https://github.com/ysmltr/ilet/blob/main/PRIVACY.md>.

## TestFlight

[`testflight.yml`](../.github/workflows/testflight.yml) builds the app on one of GitHub's Macs, has
Apple sign it for the App Store and uploads it to TestFlight. Apple keeps the distribution
certificate and signs with it ("cloud signing"), so no certificate file is needed, only an App
Store Connect API key in three repository secrets (Settings → Secrets and variables → Actions):

| Secret          | Value                                              |
| --------------- | -------------------------------------------------- |
| `ASC_KEY_ID`    | The key's Key ID (10 characters)                   |
| `ASC_ISSUER_ID` | The Issuer ID shown above the list of keys         |
| `ASC_KEY_P8`    | The whole downloaded `AuthKey_<Key ID>.p8` file    |

The key is a Team Key with Admin access (App Store Connect → Users and Access → Integrations),
because cloud signing needs Admin. Whoever has the key can act as an Admin of your App Store
Connect account, so if it may have leaked, revoke it there, then make a new one and update the
secrets.

To upload a build: **Actions → TestFlight → Run workflow**, or push a tag that starts with
`testflight-`. The build number is the run number (`7.1` for run 7, `7.2` when it runs again), so
every upload is new. Apple then processes the build for a few minutes before it appears under
**TestFlight** in App Store Connect.

## Before submitting

- [ ] The iPhone half of Phase 4 (finding the PC again) and Phase 5 (the Share Extension) are done.
- [x] `ILET_BUNDLE_ID_PREFIX` in `Config/Shared.xcconfig` is a reverse-DNS name you own:
      `com.ysmltr.ilet`.
- [x] Apple Developer Program (99 USD a year): register the App ID with the App Group
      `group.<prefix>`. The Keychain group needs no registration.
- [x] App Store Connect: create the app.
- [ ] App Store Connect: fill in the answers below.
- [ ] Build and upload with the TestFlight workflow (see [TestFlight](#testflight)).
- [ ] Test the TestFlight build on a real iPhone: pairing, sending, and the warning for a wrong
      certificate.
- [ ] Screenshots for the 6.9-inch iPhone (1320 × 2868 pixels), in English and Turkish.
- [ ] Publish the Windows installer as a GitHub release, so reviewers and users can get it.

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
| Keywords (100)         | transfer,windows,pc,photos,share,wifi,local,send,files,heic,jpg,desktop | aktarım,windows,bilgisayar,fotoğraf,paylaş,wifi,yerel,gönder,dosya,heic,jpg |

**Description (English)**

Share a photo, tap ilet, and it is on your PC.

ilet sends photos and files from your iPhone straight to a folder on your Windows PC, over your
own Wi-Fi. No account, no cloud, no ads, no tracking.

- Pair once by scanning a code on your PC's screen.
- Send from the share sheet in Photos, Files and other apps.
- iPhone photos arrive as JPG, so Windows opens them (you can turn this off).
- Every connection is encrypted and tied to your own PC, so nobody else on the network can
  receive your files.

Needs the free ilet app for Windows.

**Açıklama (Türkçe)**

Bir fotoğrafı paylaşın, ilet’e dokunun; fotoğraf bilgisayarınızda.

ilet, fotoğraf ve dosyaları iPhone’unuzdan doğrudan Windows bilgisayarınızdaki bir klasöre, kendi
Wi-Fi ağınız üzerinden gönderir. Hesap yok, bulut yok, reklam yok, izleme yok.

- Bilgisayar ekranındaki kodu tarayarak bir kez eşleştirin.
- Fotoğraflar, Dosyalar ve diğer uygulamalardaki paylaşım menüsünden gönderin.
- iPhone fotoğrafları Windows’un açabilmesi için JPG olarak gelir (bunu kapatabilirsiniz).
- Her bağlantı şifrelidir ve kendi bilgisayarınıza bağlıdır; ağdaki başka biri dosyalarınızı
  alamaz.

Windows için ücretsiz ilet uygulaması gerekir.
