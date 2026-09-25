// Local Profile (plan §4.6): device-only details used to pre-fill resumes.
// Not an account: no login, password, remote identity or sync.

export interface LocalProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  linkedin: string;
  website: string;
  updatedAt: number;
}

export const LOCAL_PROFILE_FIELDS = [
  'name',
  'email',
  'phone',
  'location',
  'headline',
  'linkedin',
  'website',
] as const;

export type LocalProfileField = (typeof LOCAL_PROFILE_FIELDS)[number];

export function emptyLocalProfile(): LocalProfile {
  return { name: '', email: '', phone: '', location: '', headline: '', linkedin: '', website: '', updatedAt: 0 };
}

/** Repairs a stored profile: non-string fields become empty strings. */
export function normalizeLocalProfile(value: unknown): LocalProfile {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const profile = emptyLocalProfile();
  for (const field of LOCAL_PROFILE_FIELDS) {
    const raw = source[field];
    profile[field] = typeof raw === 'string' ? raw : '';
  }
  const updatedAt = source.updatedAt;
  profile.updatedAt = typeof updatedAt === 'number' && Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0;
  return profile;
}
