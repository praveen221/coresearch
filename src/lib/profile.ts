import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { transaction, withDatabase, workspacePath } from './database.ts';
import { ConflictError } from './errors.ts';
import { profilePatchSchema, profileSchema } from './profile-schema.ts';
import type { Profile, ProfilePatch } from './profile-schema.ts';

const rowSchema = z.object({
  name: z.string().nullable(),
  background: z.string().nullable(),
  needs_funding: z.union([z.literal(0), z.literal(1)]).nullable(),
  funding_notes: z.string().nullable(),
  website: z.string().nullable(),
  cv_file: z.string().nullable(),
  cv_pages: z.number().nullable(),
  cv_added_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
const itemRowsSchema = z.array(z.object({ description: z.string() }));

export function readProfile(db: DatabaseSync): Profile {
  const row = rowSchema.parse(db.prepare('SELECT * FROM profile WHERE id = 1').get());
  const interests = itemRowsSchema.parse(db.prepare('SELECT description FROM interests ORDER BY id').all());
  const constraints = itemRowsSchema.parse(db.prepare('SELECT description FROM constraints ORDER BY id').all());
  const collaborators = itemRowsSchema.parse(db.prepare('SELECT description FROM collaborators ORDER BY id').all());
  return profileSchema.parse({
    name: row.name,
    background: row.background,
    needsFunding: row.needs_funding === null ? null : row.needs_funding === 1,
    fundingNotes: row.funding_notes,
    website: row.website,
    interests: interests.map((item) => item.description),
    constraints: constraints.map((item) => item.description),
    collaborators: collaborators.map((item) => item.description),
    cv: row.cv_file === null || row.cv_pages === null || row.cv_added_at === null ? null
      : { filePath: row.cv_file, pageCount: row.cv_pages, addedAt: row.cv_added_at },
    updatedAt: row.updated_at,
  });
}

export function getProfile(workspace = workspacePath()): Profile {
  return withDatabase(workspace, (db) => transaction(db, () => readProfile(db)));
}

function updateItems(db: DatabaseSync, table: 'interests' | 'constraints' | 'collaborators', changes: ProfilePatch['interests']): void {
  if (changes === undefined) return;
  for (const description of changes.remove ?? []) {
    db.prepare(`DELETE FROM ${table} WHERE description = ?`).run(description);
  }
  for (const description of changes.add ?? []) {
    db.prepare(`INSERT OR IGNORE INTO ${table} (description) VALUES (?)`).run(description);
  }
}

export function updateProfile(input: unknown, workspace = workspacePath(),
  expected?: { updatedAt: string | null }): Profile {
  const patch = profilePatchSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const current = readProfile(db);
    if (expected !== undefined && expected.updatedAt !== current.updatedAt) throw new ConflictError('profile');
    const needsFunding = patch.needsFunding === undefined ? current.needsFunding : patch.needsFunding;
    db.prepare(`UPDATE profile SET name = ?, background = ?, needs_funding = ?,
      funding_notes = ?, website = ?, updated_at = ? WHERE id = 1`).run(
      patch.name === undefined ? current.name : patch.name,
      patch.background === undefined ? current.background : patch.background,
      needsFunding === null ? null : Number(needsFunding),
      patch.fundingNotes === undefined ? current.fundingNotes : patch.fundingNotes,
      patch.website === undefined ? current.website : patch.website,
      new Date().toISOString(),
    );
    updateItems(db, 'interests', patch.interests);
    updateItems(db, 'constraints', patch.constraints);
    updateItems(db, 'collaborators', patch.collaborators);
    return readProfile(db);
  }, 'BEGIN IMMEDIATE'));
}
