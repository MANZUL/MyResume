import type { SettingsRepository } from '../../../domain/ports/repositories';
import { isLanguage, type Language } from '../../../domain/i18n/languages';
import type { SqlDatabase } from './sql';

const APP_LANGUAGE = 'app_language';

export class SqliteSettingsRepository implements SettingsRepository {
  constructor(
    private readonly db: SqlDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  /** An unknown stored value counts as "not chosen", so the device language applies again. */
  async getAppLanguage(): Promise<Language | null> {
    const row = await this.db.get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [APP_LANGUAGE]);
    return row && isLanguage(row.value) ? row.value : null;
  }

  async setAppLanguage(language: Language): Promise<void> {
    await this.db.run(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [APP_LANGUAGE, language, this.now()],
    );
  }
}
