const english = {
  windowTitle: 'ilet',
  tagline: 'Send Files to Your PC',
  pairIntro:
    'Pair your iPhone once. After that, files you share with ilet go straight to a folder on this PC.',
  pairNewDevice: 'Pair new device',
  scanInstruction: 'Open ilet on your iPhone and scan this code.',
  qrCodeLabel: 'Pairing QR code',
  expiresIn: 'Expires in {time}',
  screenWarning:
    'Anyone who scans this code can send files to this PC. Do not show it in screen shares or photos.',
  cancel: 'Cancel',
  pairedWith: 'Paired with {name}.',
  pairAnother: 'Pair another device',
  codeExpired: 'The code has expired.',
  createNewCode: 'Create a new code',
  noNetwork:
    'This PC is not connected to a local network. Connect it to Wi-Fi or Ethernet and try again.',
  unexpectedError: 'Something went wrong. Please try again.',
  tryAgain: 'Try again',
  done: 'Done',

  devicesTitle: 'Paired devices',
  pairedOn: 'Paired {date}',
  rename: 'Rename',
  save: 'Save',
  remove: 'Remove',
  deviceNameLabel: 'Device name',
  deviceNameEmpty: 'Enter a name.',
  deviceGone: 'This device is no longer paired.',
  removeDeviceTitle: 'Remove device',
  removeDeviceQuestion: 'Remove “{name}”?',
  removeDeviceDetail: 'It can no longer send files to this PC. To use it again, pair it again.',

  settingsTitle: 'Settings',
  receiveFolderLabel: 'Received files are saved in',
  changeFolder: 'Change…',
  openFolder: 'Open',
  chooseFolderTitle: 'Choose where received files are saved',
  folderNotAFolder: 'This folder cannot be used. Choose another one.',
  folderSystem:
    'Choose another folder. Windows or other programs use the files in this one by themselves, so files from a phone must not go there.',
  folderNotWritable: 'ilet cannot save files in this folder. Choose another one.',
  folderCannotMark:
    'This drive cannot mark files as downloaded from the internet (a FAT32 USB stick, for example). Choose a folder on another drive.',
  startWithWindows: 'Start ilet when Windows starts',
  startWithWindowsUnavailable: 'Available once ilet is installed.',
  trayNote:
    'Closing this window keeps ilet running next to the clock, so files keep arriving. To quit, right-click its icon there.',

  publicNetworkTitle: 'Phones cannot reach this PC',
  publicNetworkBody:
    'Windows treats {networks} as a Public network, so ilet accepts no files there. If you trust this network (at home, for example), set its network profile to Private.',
  openNetworkSettings: 'Open network settings',
  checkAgain: 'Check again',

  trayTooltip: 'ilet: ready to receive files',
  trayTooltipPublicNetwork: 'ilet: phones are blocked on a Public network',
  trayOpen: 'Open ilet',
  trayOpenFolder: 'Open received files',
  trayQuit: 'Quit ilet',

  fileReceivedTitle: 'File received',
  fileReceivedBody: '{file} from {device}',
  oneMoreFileReceivedTitle: '1 more file received',
  moreFilesReceivedTitle: '{count} more files received',
  latestFileBody: 'Latest: {file} from {device}',

  startupFailedTitle: 'ilet could not start',
  startupPortInUse:
    'Another program is using the network port ilet needs. Close that program and start ilet again.',
  startupSecureStorageUnavailable:
    'Windows cannot protect ilet’s private key right now, and ilet does not start without that protection.',
  startupDataFileInvalid: 'One of ilet’s data files is damaged.',
  startupUnsupportedPlatform: 'ilet cannot run on this system yet.',
  startupUnexpectedError: 'Something went wrong while ilet was starting.',
} as const;

export type MessageKey = keyof typeof english;
type Messages = Readonly<Record<MessageKey, string>>;

const turkish: Messages = {
  windowTitle: 'ilet',
  tagline: 'Dosyaları bilgisayarınıza gönderin',
  pairIntro:
    'iPhone’unuzu bir kez eşleştirin. Ardından ilet ile paylaştığınız dosyalar doğrudan bu bilgisayardaki bir klasöre gelir.',
  pairNewDevice: 'Yeni cihaz eşleştir',
  scanInstruction: 'iPhone’unuzda ilet’i açın ve bu kodu tarayın.',
  qrCodeLabel: 'Eşleştirme QR kodu',
  expiresIn: 'Kalan süre: {time}',
  screenWarning:
    'Bu kodu tarayan herkes bu bilgisayara dosya gönderebilir. Kodu ekran paylaşımında veya fotoğraflarda göstermeyin.',
  cancel: 'İptal',
  pairedWith: '{name} eşleştirildi.',
  pairAnother: 'Başka bir cihaz eşleştir',
  codeExpired: 'Kodun süresi doldu.',
  createNewCode: 'Yeni kod oluştur',
  noNetwork:
    'Bu bilgisayar yerel bir ağa bağlı değil. Wi-Fi’ye veya Ethernet’e bağlanıp tekrar deneyin.',
  unexpectedError: 'Bir sorun oluştu. Lütfen tekrar deneyin.',
  tryAgain: 'Tekrar dene',
  done: 'Tamam',

  devicesTitle: 'Eşleştirilmiş cihazlar',
  pairedOn: 'Eşleştirme: {date}',
  rename: 'Yeniden adlandır',
  save: 'Kaydet',
  remove: 'Kaldır',
  deviceNameLabel: 'Cihaz adı',
  deviceNameEmpty: 'Bir ad girin.',
  deviceGone: 'Bu cihaz artık eşleştirilmiş değil.',
  removeDeviceTitle: 'Cihazı kaldır',
  removeDeviceQuestion: '“{name}” kaldırılsın mı?',
  removeDeviceDetail:
    'Bu cihaz artık bu bilgisayara dosya gönderemez. Yeniden kullanmak için tekrar eşleştirin.',

  settingsTitle: 'Ayarlar',
  receiveFolderLabel: 'Gelen dosyaların kaydedildiği klasör',
  changeFolder: 'Değiştir…',
  openFolder: 'Aç',
  chooseFolderTitle: 'Gelen dosyaların kaydedileceği klasörü seçin',
  folderNotAFolder: 'Bu klasör kullanılamıyor. Başka bir klasör seçin.',
  folderSystem:
    'Başka bir klasör seçin. Windows veya diğer programlar bu klasördeki dosyaları kendiliğinden kullanır; telefondan gelen dosyalar buraya gitmemeli.',
  folderNotWritable: 'ilet bu klasöre dosya kaydedemiyor. Başka bir klasör seçin.',
  folderCannotMark:
    'Bu sürücü dosyaları internetten indirilmiş olarak işaretleyemiyor (örneğin FAT32 bir USB bellek). Başka bir sürücüde klasör seçin.',
  startWithWindows: 'Windows başlarken ilet’i başlat',
  startWithWindowsUnavailable: 'ilet yüklendiğinde kullanılabilir.',
  trayNote:
    'Bu pencereyi kapatınca ilet saatin yanında çalışmaya devam eder ve dosyalar gelmeye devam eder. Çıkmak için oradaki simgesine sağ tıklayın.',

  publicNetworkTitle: 'Telefonlar bu bilgisayara ulaşamıyor',
  publicNetworkBody:
    'Windows {networks} ağını Ortak ağ olarak görüyor, bu yüzden ilet orada dosya kabul etmiyor. Bu ağa güveniyorsanız (örneğin evde), ağ profilini Özel olarak ayarlayın.',
  openNetworkSettings: 'Ağ ayarlarını aç',
  checkAgain: 'Tekrar kontrol et',

  trayTooltip: 'ilet: dosya almaya hazır',
  trayTooltipPublicNetwork: 'ilet: Ortak ağda telefonlar engelleniyor',
  trayOpen: 'ilet’i aç',
  trayOpenFolder: 'Gelen dosyaları aç',
  trayQuit: 'ilet’ten çık',

  fileReceivedTitle: 'Dosya alındı',
  fileReceivedBody: '{device} cihazından {file}',
  oneMoreFileReceivedTitle: '1 dosya daha alındı',
  moreFilesReceivedTitle: '{count} dosya daha alındı',
  latestFileBody: 'Son gelen: {device} cihazından {file}',

  startupFailedTitle: 'ilet başlatılamadı',
  startupPortInUse:
    'ilet’in kullandığı ağ bağlantı noktasını başka bir program kullanıyor. O programı kapatıp ilet’i yeniden başlatın.',
  startupSecureStorageUnavailable:
    'Windows şu anda ilet’in özel anahtarını koruyamıyor; ilet bu koruma olmadan başlamaz.',
  startupDataFileInvalid: 'ilet’in veri dosyalarından biri bozuk.',
  startupUnsupportedPlatform: 'ilet henüz bu sistemde çalışamıyor.',
  startupUnexpectedError: 'ilet başlatılırken bir sorun oluştu.',
};

const MESSAGES = { en: english, tr: turkish } as const satisfies Record<string, Messages>;

export type Language = keyof typeof MESSAGES;

const DEFAULT_LANGUAGE: Language = 'en';
const LANGUAGE_TAG_SEPARATOR = '-';
const PLACEHOLDER = /\{(\w+)\}/g;

export type Translate = (key: MessageKey, values?: Readonly<Record<string, string>>) => string;

/** The first supported language in the user's preference list ("tr-TR" → "tr"). */
export function resolveLanguage(preferredLanguages: readonly string[]): Language {
  for (const tag of preferredLanguages) {
    const primarySubtag = (tag.split(LANGUAGE_TAG_SEPARATOR)[0] ?? '').toLowerCase();
    if (isLanguage(primarySubtag)) {
      return primarySubtag;
    }
  }
  return DEFAULT_LANGUAGE;
}

/** Messages with `{name}`-style placeholders filled in from `values`. */
export function createTranslator(language: Language): Translate {
  const messages: Messages = MESSAGES[language];
  return (key, values = {}) =>
    messages[key].replace(PLACEHOLDER, (placeholder, name: string) => values[name] ?? placeholder);
}

export function isMessageKey(value: string): value is MessageKey {
  return Object.hasOwn(english, value);
}

export function messagesFor(language: Language): Messages {
  return MESSAGES[language];
}

function isLanguage(value: string): value is Language {
  return Object.hasOwn(MESSAGES, value);
}
