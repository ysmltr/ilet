import { areValidSettings, loadOrCreateSettings, saveSettings, type Settings } from './settings';

/** The settings while the app runs. Changes are checked and saved before they take effect. */
export class SettingsStore {
  private constructor(
    private readonly filePath: string,
    private settings: Settings,
  ) {}

  static async open(filePath: string, defaults: Settings): Promise<SettingsStore> {
    return new SettingsStore(filePath, await loadOrCreateSettings(filePath, defaults));
  }

  get current(): Settings {
    return this.settings;
  }

  /** Callers validate what users enter; an invalid change here is a bug, so it throws. */
  async update(changes: Partial<Settings>): Promise<Settings> {
    const updated = { ...this.settings, ...changes };
    if (!areValidSettings(updated)) {
      throw new Error('invalid settings change');
    }
    await saveSettings(this.filePath, updated);
    this.settings = updated;
    return updated;
  }
}
