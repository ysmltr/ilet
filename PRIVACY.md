# ilet privacy policy

*Last updated: 2 November 2026 · [Türkçe aşağıda](#ilet-gizlilik-politikası)*

ilet sends files from your iPhone to your own PC over your own Wi-Fi network.

## What ilet collects

**Nothing.** ilet has no accounts, no servers, no analytics, no advertising and no tracking.
Your files go directly from your iPhone to your PC on your local network. They never pass
through the internet or through anyone else's computer.

## What stays on your devices

On your iPhone:

- The PCs you paired: their names, network addresses and certificate fingerprints, and an
  access token for each, which is kept in the iOS Keychain.
- Your settings, such as "Send as JPG".
- The camera is used only to scan the pairing code on your PC's screen. No image is kept.
- The photos and files you choose to send are read only when you choose them.

On your PC:

- The phones you paired: the name you gave them, when they were paired, and a one-way hash of
  their access token (not the token itself).
- ilet's certificate and its private key, which Windows encrypts for your user account.
- Your settings, and the files you received, in the folder you chose.

## Sharing

ilet shares nothing with anyone. There is no one to share with: ilet has no servers.

## Deleting your data

- iPhone: delete the ilet app; iOS deletes its data and Keychain entries with it.
- PC: remove a phone in ilet's list of paired devices, or uninstall ilet and delete the folder
  `%APPDATA%\ilet`. Received files stay in your folder until you delete them.

## Questions

Open an issue at <https://github.com/ysmltr/ilet/issues>.

---

# ilet gizlilik politikası

*Son güncelleme: 2 Kasım 2026*

ilet, dosyaları iPhone’unuzdan kendi bilgisayarınıza, kendi Wi-Fi ağınız üzerinden gönderir.

## ilet’in topladıkları

**Hiçbir şey.** ilet’te hesap, sunucu, analiz, reklam ya da izleme yoktur. Dosyalarınız yerel
ağınızda doğrudan iPhone’unuzdan bilgisayarınıza gider; internetten ya da başka birinin
bilgisayarından geçmez.

## Cihazlarınızda kalanlar

iPhone’unuzda:

- Eşleştirdiğiniz bilgisayarlar: adları, ağ adresleri ve sertifika parmak izleri, ayrıca her
  biri için iOS Anahtar Zinciri’nde saklanan bir erişim anahtarı.
- “JPG olarak gönder” gibi ayarlarınız.
- Kamera yalnızca bilgisayar ekranındaki eşleştirme kodunu taramak için kullanılır; hiçbir
  görüntü saklanmaz.
- Göndermek için seçtiğiniz fotoğraf ve dosyalar yalnızca siz seçtiğinizde okunur.

Bilgisayarınızda:

- Eşleştirdiğiniz telefonlar: verdiğiniz ad, eşleştirme tarihi ve erişim anahtarlarının tek yönlü
  bir özeti (anahtarın kendisi değil).
- ilet’in sertifikası ve Windows’un kullanıcı hesabınız için şifrelediği özel anahtarı.
- Ayarlarınız ve seçtiğiniz klasördeki gelen dosyalar.

## Paylaşım

ilet hiçbir şeyi kimseyle paylaşmaz; paylaşacağı bir yer de yoktur, çünkü sunucusu yoktur.

## Verilerinizi silme

- iPhone: ilet uygulamasını silin; iOS verilerini ve Anahtar Zinciri kayıtlarını da siler.
- Bilgisayar: telefonu ilet’in eşleştirilmiş cihazlar listesinden kaldırın ya da ilet’i kaldırıp
  `%APPDATA%\ilet` klasörünü silin. Gelen dosyalar siz silene kadar klasörünüzde kalır.

## Sorular

<https://github.com/ysmltr/ilet/issues> adresinde bir konu açın.
