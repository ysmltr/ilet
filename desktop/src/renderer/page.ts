import { createTranslator, isMessageKey, resolveLanguage } from '../i18n/messages';

export const language = resolveLanguage(navigator.languages);
export const translate = createTranslator(language);

export function requireElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`missing element #${id}`);
  }
  return element;
}

/** Text from outside the app (device names, paths) only ever goes in as text, never as HTML. */
export function createElement<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className: string,
  text?: string,
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

export function createButton(
  className: string,
  text: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = createElement('button', className, text);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

export function showProblem(element: HTMLElement, message: string): void {
  element.textContent = message;
  element.hidden = false;
}

const views = {
  home: requireElement('home-view', HTMLElement),
  code: requireElement('code-view', HTMLElement),
  result: requireElement('result-view', HTMLElement),
};

export function showView(visible: keyof typeof views): void {
  for (const [name, view] of Object.entries(views)) {
    view.hidden = name !== visible;
  }
}

export function translatePage(): void {
  document.documentElement.lang = language;
  document.title = translate('windowTitle');
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset['i18n'];
    if (key !== undefined && isMessageKey(key)) {
      element.textContent = translate(key);
    }
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) {
    const key = element.dataset['i18nLabel'];
    if (key !== undefined && isMessageKey(key)) {
      element.setAttribute('aria-label', translate(key));
    }
  }
}
