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

## Before submitting

- [ ] The iPhone half of Phase 4 (finding the PC again) and Phase 5 (the Share Extension) are done.
- [ ] `ILET_BUNDLE_ID_PREFIX` in `Config/Shared.xcconfig` is a reverse-DNS name you own, for example
      `com.ysmltr.ilet`.
- [ ] Apple Developer Program (99 USD a year): register the App ID with the App Group
      `group.<prefix>` and Keychain Sharing.
- [ ] App Store Connect: create the app and fill in the answers below.
- [ ] Build and upload, from a Mac or with a TestFlight workflow on GitHub's Macs.
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
