import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { transaction, withDatabase } from './database.ts';
import { NotFoundError } from './errors.ts';
import { fitKindSchema, fitKindsInputSchema, fitWeightSchema } from './fit-schema.ts';
import type { FitKind } from './fit-schema.ts';

const kindRow = z.object({
  key: z.string(), label: z.string(), question: z.string(), anchors: z.string(), evidence: z.string(), weight: z.number(), position: z.number(),
});

function insertKinds(db: DatabaseSync, kinds: readonly FitKind[]): void {
  kinds.forEach((kind, position) => {
    db.prepare('INSERT INTO fit_kinds (key, label, question, anchors, evidence, weight, position) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(kind.key, kind.label, kind.question, kind.anchors, kind.evidence, kind.weight, position);
  });
}

export function readKinds(db: DatabaseSync): FitKind[] {
  return z.array(kindRow).parse(db.prepare('SELECT * FROM fit_kinds ORDER BY position, key').all()).map((row) => fitKindSchema.parse({
    key: row.key, label: row.label, question: row.question, anchors: row.anchors, evidence: row.evidence, weight: row.weight,
  }));
}

export function listFitKinds(workspace: string): FitKind[] {
  return withDatabase(workspace, (db) => transaction(db, () => readKinds(db)));
}

export function configureFitKinds(workspace: string, input: unknown): FitKind[] {
  const { kinds } = fitKindsInputSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    db.prepare('DELETE FROM fit_kinds').run();
    insertKinds(db, kinds);
    return readKinds(db);
  }, 'BEGIN IMMEDIATE'));
}

export function setFitWeight(workspace: string, input: unknown): FitKind[] {
  const { key, weight } = fitWeightSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    if (db.prepare('UPDATE fit_kinds SET weight = ? WHERE key = ?').run(weight, key).changes === 0) {
      throw new NotFoundError(`No kind of fit called “${key}”.`);
    }
    return readKinds(db);
  }, 'BEGIN IMMEDIATE'));
}
