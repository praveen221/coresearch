'use server';

import { z } from 'zod';
import { ProfileConflictError, updateProfile } from '../lib/profile.ts';
import type { Profile } from '../lib/profile-schema.ts';

export type SaveProfileResult =
  | { ok: true; profile: Profile }
  | { ok: false; conflict: boolean; errors: string[] };

// Server Actions are public endpoints: both arguments are validated, never trusted.
export async function saveProfile(patch: unknown, expectedUpdatedAt: unknown): Promise<SaveProfileResult> {
  try {
    const updatedAt = await z.iso.datetime().nullable().parseAsync(expectedUpdatedAt);
    return { ok: true, profile: updateProfile(patch, undefined, { updatedAt }) };
  } catch (error) {
    if (error instanceof ProfileConflictError) {
      return { ok: false, conflict: true, errors: ['Your agent saved changes while you were editing. Load the latest profile, then reapply your edits.'] };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, conflict: false, errors: error.issues.map((issue) =>
        issue.path.length === 0 ? issue.message : `${issue.path.join(' → ')}: ${issue.message}`) };
    }
    console.error(error);
    return { ok: false, conflict: false, errors: ['Could not save. Check the local server log.'] };
  }
}
