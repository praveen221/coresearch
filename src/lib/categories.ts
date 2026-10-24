import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { transaction, withDatabase } from './database.ts';
import { NotFoundError, RuleError } from './errors.ts';
import { categoryInputSchema, categorySchema, sourceCategoriesSchema } from './research-schema.ts';
import type { Category } from './research-schema.ts';
import { requireTarget } from './targets.ts';

const categoryRow = z.object({
  id: z.number(), target_id: z.number(), parent_id: z.number().nullable(), kind: z.string(), name: z.string(),
  description: z.string().nullable(), created_at: z.string(),
});

export function readCategories(db: DatabaseSync, targetId: number): Category[] {
  const links = z.array(z.object({ source_id: z.number(), category_id: z.number() })).parse(db.prepare(`SELECT source_id, category_id
    FROM source_categories JOIN categories ON categories.id = source_categories.category_id WHERE categories.target_id = ?`).all(targetId));
  return z.array(categoryRow).parse(db.prepare('SELECT * FROM categories WHERE target_id = ? ORDER BY name').all(targetId))
    .map((row) => categorySchema.parse({
      id: row.id, targetId: row.target_id, parentId: row.parent_id, kind: row.kind, name: row.name, description: row.description,
      sourceIds: links.filter((link) => link.category_id === row.id).map((link) => link.source_id), createdAt: row.created_at,
    }));
}

export function listCategories(workspace: string, targetId: number): Category[] {
  return withDatabase(workspace, (db) => transaction(db, () => {
    requireTarget(db, targetId);
    return readCategories(db, targetId);
  }));
}

export function addCategory(workspace: string, input: unknown): Category {
  const category = categoryInputSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    if (db.prepare('SELECT 1 FROM targets WHERE id = ?').get(category.targetId) === undefined) {
      throw new NotFoundError(`No target with id ${String(category.targetId)}.`);
    }
    const existing = readCategories(db, category.targetId);
    const parent = existing.find((item) => item.id === category.parentId);
    if (category.parentId !== null && parent === undefined) throw new RuleError('The parent category belongs to another target.');
    if (parent !== undefined && parent.parentId !== null) throw new RuleError('Categories go two levels deep: a category and its subcategories.');
    const same = existing.find((item) => item.parentId === category.parentId && item.name.toLowerCase() === category.name.toLowerCase());
    if (same !== undefined) return same;
    const id = Number(db.prepare(`INSERT INTO categories (target_id, parent_id, kind, name, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(category.targetId, category.parentId, category.kind, category.name, category.description,
      new Date().toISOString()).lastInsertRowid);
    const saved = readCategories(db, category.targetId).find((item) => item.id === id);
    if (saved === undefined) throw new NotFoundError('The category was not saved.');
    return saved;
  }, 'BEGIN IMMEDIATE'));
}

export function categorizeSource(workspace: string, sourceId: number, input: unknown): Category[] {
  const { categoryIds } = sourceCategoriesSchema.parse(input);
  return withDatabase(workspace, (db) => transaction(db, () => {
    const source = z.object({ target_id: z.number() }).optional().parse(db.prepare('SELECT target_id FROM sources WHERE id = ?').get(sourceId));
    if (source === undefined) throw new NotFoundError(`No source with id ${String(sourceId)}.`);
    const categories = readCategories(db, source.target_id);
    const unknown = categoryIds.filter((id) => !categories.some((category) => category.id === id));
    if (unknown.length > 0) throw new RuleError(`No category ${unknown.join(', ')} for this target (category:list).`);
    db.prepare('DELETE FROM source_categories WHERE source_id = ?').run(sourceId);
    for (const id of new Set(categoryIds)) db.prepare('INSERT INTO source_categories (source_id, category_id) VALUES (?, ?)').run(sourceId, id);
    return readCategories(db, source.target_id).filter((category) => category.sourceIds.includes(sourceId));
  }, 'BEGIN IMMEDIATE'));
}
