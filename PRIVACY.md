# ilet privacy policy

*Last updated: 6 November 2026 · [Türkçe aşağıda](#ilet-gizlilik-politikası)*

ilet sends files between your iPhone and your own PC over your own Wi-Fi network.

## What ilet collects

**Nothing.** ilet has no accounts, no servers, no analytics, no advertising and no tracking.
Your files go directly between your iPhone and your PC on your local network. They never pass
through the internet or through anyone else's computer.

So that your iPhone can find it again when its address changes, your PC announces its name and
a random ID on your local network, only on networks set to Private. Your iPhone looks for that
announcement only when it cannot reach your PC at an address it already knows.

## What stays on your devices

On your iPhone:

- The PCs you paired: their names, network addresses and certificate fingerprints, and an
  access token for each, which is kept in the iOS Keychain.
- Your settings, such as "Send photos as JPG, videos as MP4".
- The camera is used only to scan the pairing code on your PC's screen. No image is kept.
- The photos and files you choose to send are read only when you choose them.
- The files you send, from ilet itself or by sharing them with ilet from another app, are copied
  (and converted to JPG or MP4, if that setting is on) only until they are sent. Each copy is
  deleted when its upload ends; a copy left from an upload that did not finish is deleted after
  48 hours, the next time ilet opens.
- The files your PC sends you, in Files › On My iPhone › ilet, until you delete them. ilet never
  opens them by itself. For two days it also remembers which of them it saved (a random ID for
  each, not the file name), so that none arrives twice.
- Photos: ilet asks only for permission to add, and only when you tap Save to Photos for a photo
  or video from your PC. It cannot see your library.

On your PC:

- The phones you paired: the name you gave them, when they were paired, and a one-way hash of
  their access token (not the token itself).
- ilet's certificate and its private key, which Windows encrypts for your user account.
- Your settings, and the files you received, in the folder you chose.
- The files you send to your iPhone: a copy of each waits in `%APPDATA%\ilet\outbox` for at most
  24 hours. It is deleted as soon as your iPhone has the file, or when you cancel it.

## Sharing

ilet shares nothing with anyone. There is no one to share with: ilet has no servers.

## Deleting your data

- iPhone: delete received files in Files › On My iPhone › ilet. Deleting the ilet app deletes
  its data, the received files and its Keychain entries; move the files you want to keep first.
- PC: remove a phone in ilet's list of paired devices, or uninstall ilet and delete the folder
  `%APPDATA%\ilet`. Received files stay in your folder until you delete them.

## Questions

Open an issue at <https://github.com/ysmltr/ilet/issues>.

---

# ilet gizlilik politikası

*Son güncelleme: 6 Kasım 2026*

ilet, dosyaları iPhone’unuz ile kendi bilgisayarınız arasında, kendi Wi-Fi ağınız üzerinden
gönderir.

## ilet’in topladıkları

**Hiçbir şey.** ilet’te hesap, sunucu, analiz, reklam ya da izleme yoktur. Dosyalarınız yerel
ağınızda doğrudan iPhone’unuz ile bilgisayarınız arasında gider; internetten ya da başka birinin
bilgisayarından geçmez.

Adresi değiştiğinde iPhone’unuz onu yeniden bulabilsin diye bilgisayarınız, adını ve rastgele
bir kimliği yerel ağınızda duyurur; bunu yalnızca Özel olarak ayarlanmış ağlarda yapar.
iPhone’unuz bu duyuruyu yalnızca bilgisayarınıza zaten bildiği bir adresten ulaşamadığında arar.

## Cihazlarınızda kalanlar

iPhone’unuzda:

- Eşleştirdiğiniz bilgisayarlar: adları, ağ adresleri ve sertifika parmak izleri, ayrıca her
  biri için iOS Anahtar Zinciri’nde saklanan bir erişim anahtarı.
- “Fotoğrafları JPG, videoları MP4 olarak gönder” gibi ayarlarınız.
- Kamera yalnızca bilgisayar ekranındaki eşleştirme kodunu taramak için kullanılır; hiçbir
  görüntü saklanmaz.
- Göndermek için seçtiğiniz fotoğraf ve dosyalar yalnızca siz seçtiğinizde okunur.
- ilet’in kendisinden gönderdiğiniz ya da başka bir uygulamadan ilet ile paylaştığınız
  dosyaların kopyası (bu ayar açıksa JPG ya da MP4’e dönüştürülmüş hâli) yalnızca gönderilene
  kadar tutulur. Her kopya, gönderimi bitince silinir; bitmeyen bir gönderimden kalan kopya ise
  48 saat sonra, ilet bir sonraki açıldığında silinir.
- Bilgisayarınızın size gönderdiği dosyalar, siz silene kadar Dosyalar › iPhone’umda › ilet
  klasöründe. ilet bunları hiçbir zaman kendiliğinden açmaz. Hangilerini kaydettiğini de iki gün
  boyunca hatırlar (dosya adını değil, her biri için rastgele bir kimliği); böylece hiçbiri iki
  kez gelmez.
- Fotoğraflar: ilet yalnızca ekleme izni ister, o da yalnızca bilgisayarınızdan gelen bir fotoğraf
  ya da video için Fotoğraflar’a kaydet’e dokunduğunuzda. Arşivinizi göremez.

Bilgisayarınızda:

- Eşleştirdiğiniz telefonlar: verdiğiniz ad, eşleştirme tarihi ve erişim anahtarlarının tek yönlü
  bir özeti (anahtarın kendisi değil).
- ilet’in sertifikası ve Windows’un kullanıcı hesabınız için şifrelediği özel anahtarı.
- Ayarlarınız ve seçtiğiniz klasördeki gelen dosyalar.
- iPhone’unuza gönderdiğiniz dosyalar: her birinin kopyası en fazla 24 saat
  `%APPDATA%\ilet\outbox` klasöründe bekler. iPhone’unuz dosyayı alır almaz ya da siz iptal
  ettiğinizde silinir.

## Paylaşım

ilet hiçbir şeyi kimseyle paylaşmaz; paylaşacağı bir yer de yoktur, çünkü sunucusu yoktur.

## Verilerinizi silme

- iPhone: gelen dosyaları Dosyalar › iPhone’umda › ilet klasöründen silin. ilet uygulamasını
  silmek, verilerini, gelen dosyaları ve Anahtar Zinciri kayıtlarını da siler; saklamak
  istediğiniz dosyaları önce başka bir yere taşıyın.
- Bilgisayar: telefonu ilet’in eşleştirilmiş cihazlar listesinden kaldırın ya da ilet’i kaldırıp
  `%APPDATA%\ilet` klasörünü silin. Gelen dosyalar siz silene kadar klasörünüzde kalır.

## Sorular

<https://github.com/ysmltr/ilet/issues> adresinde bir konu açın.
