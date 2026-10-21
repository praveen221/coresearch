'use server';

import { z } from 'zod';
import { ConflictError, NotFoundError, RuleError } from '../lib/errors.ts';
import { updateProfile } from '../lib/profile.ts';
import type { Profile } from '../lib/profile-schema.ts';
import { pathways, regions, targetInputSchema } from '../lib/target-schema.ts';
import type { Target } from '../lib/target-schema.ts';
import { attachCvBytes } from '../lib/cv.ts';
import { importList, previewList, readList } from '../lib/import.ts';
import { editPitch, setPitchStatus } from '../lib/outreach.ts';
import type { ListPreview, Pitch } from '../lib/outreach-schema.ts';
import { addTarget, removeTarget, targetIdSchema, updateTarget } from '../lib/targets.ts';
import { workspacePath } from '../lib/database.ts';
import { attachPdfBytes } from '../lib/library.ts';
import { addIdea, decideTrack, removeIdea, startBatch, updateSettings } from '../lib/research.ts';
import { ideaInputSchema } from '../lib/research-schema.ts';
import type { Batch, Idea, Settings, Source, Track } from '../lib/research-schema.ts';

export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; conflict: boolean; errors: string[] };

function failure(error: unknown): { ok: false; conflict: boolean; errors: string[] } {
  if (error instanceof ConflictError) return { ok: false, conflict: true, errors: [error.message] };
  if (error instanceof NotFoundError || error instanceof RuleError) return { ok: false, conflict: false, errors: [error.message] };
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

export async function setTrackLimit(limit: unknown): Promise<ActionResult<Settings>> {
  try {
    return { ok: true, value: updateSettings(workspacePath(), { trackLimit: await z.number().int().parseAsync(limit) }) };
  } catch (error) { return failure(error); }
}

export async function approveBatch(targetId: unknown, input: unknown): Promise<ActionResult<Batch>> {
  try {
    return { ok: true, value: startBatch(workspacePath(), await targetIdSchema.parseAsync(targetId), input) };
  } catch (error) { return failure(error); }
}

export async function uploadPaper(form: FormData): Promise<ActionResult<Source>> {
  try {
    const id = targetIdSchema.parse(form.get('sourceId'));
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new RuleError('Choose a PDF file first.');
    return { ok: true, value: await attachPdfBytes(workspacePath(), id, new Uint8Array(await file.arrayBuffer())) };
  } catch (error) { return failure(error); }
}

export async function uploadCv(form: FormData): Promise<ActionResult<Profile>> {
  try {
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new RuleError('Choose a PDF file first.');
    return { ok: true, value: await attachCvBytes(workspacePath(), new Uint8Array(await file.arrayBuffer())) };
  } catch (error) { return failure(error); }
}

export async function previewProfessorList(link: unknown): Promise<ActionResult<ListPreview>> {
  try {
    const url = await z.url({ protocol: /^https?$/, error: 'Paste a full link to the sheet.' }).parseAsync(link);
    return { ok: true, value: previewList(workspacePath(), await readList({ url })) };
  } catch (error) { return failure(error); }
}

export async function importProfessorList(input: unknown): Promise<ActionResult<{ created: number; skipped: number }>> {
  try {
    const result = importList(workspacePath(), await z.unknown().parseAsync(input));
    return { ok: true, value: { created: result.created.length, skipped: result.skipped.length } };
  } catch (error) { return failure(error); }
}

export async function setTargetPath(id: unknown, patch: unknown): Promise<ActionResult<Target>> {
  try {
    const fields = await z.strictObject({ region: z.enum(regions).nullable().optional(), pathway: z.enum(pathways).nullable().optional() })
      .parseAsync(patch);
    return { ok: true, value: updateTarget(targetIdSchema.parse(id), fields) };
  } catch (error) { return failure(error); }
}

export async function savePitchEdit(id: unknown, input: unknown): Promise<ActionResult<Pitch>> {
  try {
    return { ok: true, value: editPitch(workspacePath(), await targetIdSchema.parseAsync(id), input) };
  } catch (error) { return failure(error); }
}

export async function markPitch(id: unknown, status: unknown): Promise<ActionResult<Pitch>> {
  try {
    return { ok: true, value: setPitchStatus(workspacePath(), await targetIdSchema.parseAsync(id), { status }) };
  } catch (error) { return failure(error); }
}
