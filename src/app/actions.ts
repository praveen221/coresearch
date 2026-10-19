'use server';

import { z } from 'zod';
import { ConflictError, NotFoundError } from '../lib/errors.ts';
import { updateProfile } from '../lib/profile.ts';
import type { Profile } from '../lib/profile-schema.ts';
import { targetInputSchema } from '../lib/target-schema.ts';
import type { Target } from '../lib/target-schema.ts';
import { addTarget, removeTarget, targetIdSchema, updateTarget } from '../lib/targets.ts';
import { workspacePath } from '../lib/database.ts';
import { addIdea, decideTrack, removeIdea } from '../lib/research.ts';
import { ideaInputSchema } from '../lib/research-schema.ts';
import type { Idea, Track } from '../lib/research-schema.ts';

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

export async function createIdea(input: unknown): Promise<ActionResult<Idea>> {
  try {
    return { ok: true, value: addIdea(workspacePath(), await ideaInputSchema.parseAsync(input)) };
  } catch (error) { return failure(error); }
}

export async function deleteIdea(id: unknown): Promise<ActionResult<{ removed: number }>> {
  try {
    return { ok: true, value: removeIdea(workspacePath(), await targetIdSchema.parseAsync(id)) };
  } catch (error) { return failure(error); }
}

export async function decide(id: unknown, decision: unknown, note: unknown): Promise<ActionResult<Track>> {
  try {
    const choice = await z.enum(['continue', 'pause', 'drop']).parseAsync(decision);
    const reason = z.string().max(4000).nullable().parse(note);
    return { ok: true, value: decideTrack(workspacePath(), targetIdSchema.parse(id), choice, reason) };
  } catch (error) { return failure(error); }
}
