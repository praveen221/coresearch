import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { withDatabase, workspacePath } from './database.ts';
import { profilePatchSchema, profileSchema } from './profile-schema.ts';
import type { Profile, ProfilePatch } from './profile-schema.ts';

const rowSchema = z.object({
  name: z.string().nullable(),
  background: z.string().nullable(),
  needs_funding: z.union([z.literal(0), z.literal(1)]).nullable(),
  funding_notes: z.string().nullable(),
  updated_at: z.string().nullable(),
});
const itemRowsSchema = z.array(z.object({ description: z.string() }));

function read(db: DatabaseSync): Profile {
  const row = rowSchema.parse(db.prepare('SELECT * FROM profile WHERE id = 1').get());
  const interests = itemRowsSchema.parse(db.prepare('SELECT description FROM interests ORDER BY id').all());
  const constraints = itemRowsSchema.parse(db.prepare('SELECT description FROM constraints ORDER BY id').all());
  return profileSchema.parse({
    name: row.name,
    background: row.background,
    needsFunding: row.needs_funding === null ? null : row.needs_funding === 1,
    fundingNotes: row.funding_notes,
    interests: interests.map((item) => item.description),
    constraints: constraints.map((item) => item.description),
    updatedAt: row.updated_at,
  });
}

export function getProfile(workspace = workspacePath()): Profile {
  return withDatabase(workspace, (db) => {
    db.exec('BEGIN');
    try {
      const profile = read(db);
      db.exec('COMMIT');
      return profile;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}

function updateItems(db: DatabaseSync, table: 'interests' | 'constraints', changes: ProfilePatch['interests']): void {
  if (changes === undefined) return;
  // Table names are restricted to this internal union, never user input.
  for (const description of changes.remove ?? []) {
    db.prepare(`DELETE FROM ${table} WHERE description = ?`).run(description);
  }
  for (const description of changes.add ?? []) {
    db.prepare(`INSERT OR IGNORE INTO ${table} (description) VALUES (?)`).run(description);
  }
}

export function updateProfile(input: unknown, workspace = workspacePath()): Profile {
  const patch = profilePatchSchema.parse(input);
  return withDatabase(workspace, (db) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = read(db);
      const needsFunding = patch.needsFunding === undefined ? current.needsFunding : patch.needsFunding;
      db.prepare(`UPDATE profile SET name = ?, background = ?, needs_funding = ?,
        funding_notes = ?, updated_at = ? WHERE id = 1`).run(
        patch.name === undefined ? current.name : patch.name,
        patch.background === undefined ? current.background : patch.background,
        needsFunding === null ? null : Number(needsFunding),
        patch.fundingNotes === undefined ? current.fundingNotes : patch.fundingNotes,
        new Date().toISOString(),
      );
      updateItems(db, 'interests', patch.interests);
      updateItems(db, 'constraints', patch.constraints);
      const profile = read(db);
      db.exec('COMMIT');
      return profile;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}
