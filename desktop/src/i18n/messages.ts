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
