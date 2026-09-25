import type { LocalProfileRepository } from '../../../domain/ports/repositories';
import { emptyLocalProfile, normalizeLocalProfile, type LocalProfile } from '../../../domain/profile/local-profile';
import type { SqlDatabase } from './sql';

type ProfileRow = Omit<LocalProfile, 'updatedAt'> & { updated_at: number };

/** Single-row table: the device's Local Profile (id is always 1). */
export class SqliteLocalProfileRepository implements LocalProfileRepository {
  constructor(private readonly db: SqlDatabase) {}

  async get(): Promise<LocalProfile> {
    const row = await this.db.get<ProfileRow>(
      'SELECT name, email, phone, location, headline, linkedin, website, updated_at FROM local_profile WHERE id = 1',
    );
    if (!row) return emptyLocalProfile();
    return normalizeLocalProfile({ ...row, updatedAt: row.updated_at });
  }

  async save(profile: LocalProfile): Promise<void> {
    const p = normalizeLocalProfile(profile);
    await this.db.run(
      `INSERT INTO local_profile (id, name, email, phone, location, headline, linkedin, website, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name, email = excluded.email, phone = excluded.phone, location = excluded.location,
         headline = excluded.headline, linkedin = excluded.linkedin, website = excluded.website,
         updated_at = excluded.updated_at`,
      [p.name, p.email, p.phone, p.location, p.headline, p.linkedin, p.website, p.updatedAt],
    );
  }
}
