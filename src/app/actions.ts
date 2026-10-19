'use server';

import { z } from 'zod';
import { ConflictError, NotFoundError } from '../lib/errors.ts';
import { updateProfile } from '../lib/profile.ts';
import type { Profile } from '../lib/profile-schema.ts';
import { targetInputSchema } from '../lib/target-schema.ts';
import type { Target } from '../lib/target-schema.ts';
import { addTarget, removeTarget, targetIdSchema, updateTarget } from '../lib/targets.ts';

export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; conflict: boolean; errors: string[] };

function failure(error: unknown): { ok: false; conflict: boolean; errors: string[] } {
  if (error instanceof ConflictError) return { ok: false, conflict: true, errors: [error.message] };
  if (error instanceof NotFoundError) return { ok: false, conflict: false, errors: [error.message] };
  if (error instanceof z.ZodError) {
    return { ok: false, conflict: false, errors: error.issues.map((issue) =>
      issue.path.length === 0 ? issue.message : `${issue.path.join(' → ')}: ${issue.message}`) };
  }
  console.error(error);
  return { ok: false, conflict: false, errors: ['Could not save. Check the local server log.'] };
}

// Server Actions are public endpoints: every argument is validated, never trusted.
export async function saveProfile(patch: unknown, expectedUpdatedAt: unknown): Promise<ActionResult<Profile>> {
  try {
    const updatedAt = await z.iso.datetime().nullable().parseAsync(expectedUpdatedAt);
    return { ok: true, value: updateProfile(patch, undefined, { updatedAt }) };
  } catch (error) { return failure(error); }
}

export async function createTarget(input: unknown): Promise<ActionResult<Target>> {
  try {
    return { ok: true, value: addTarget(await targetInputSchema.parseAsync(input)) };
  } catch (error) { return failure(error); }
}

export async function saveTarget(id: unknown, patch: unknown, expectedUpdatedAt: unknown): Promise<ActionResult<Target>> {
  try {
    const updatedAt = await z.iso.datetime().parseAsync(expectedUpdatedAt);
    return { ok: true, value: updateTarget(targetIdSchema.parse(id), patch, undefined, { updatedAt }) };
  } catch (error) { return failure(error); }
}

export async function deleteTarget(id: unknown): Promise<ActionResult<{ removed: number }>> {
  try {
    return { ok: true, value: removeTarget(await targetIdSchema.parseAsync(id)) };
  } catch (error) { return failure(error); }
}
