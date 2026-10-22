import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const reserved = ['blind.json', 'key.json', 'ranking.json'];
const shown = ['title', 'question', 'rationale', 'researchQuestions', 'contribution', 'killCriterion', 'closestPrior', 'labPaperIds', 'paperIds'] as const;
const cardSchema = z.looseObject({ title: z.string() });

function scrub(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\(?\b[Ss]eeds?\s*#?\d+(?:\s*(?:,|and|&)\s*#?\d+)*\)?/g, '[ref]').replace(/#\d+/g, '[ref]')
      .replace(/\b[Ss]eed(s|ed)?\b/g, 'source');
  }
  return Array.isArray(value) ? value.map(scrub) : value;
}

function order(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

export function blindDrafts(folder: string): number {
  const cards = readdirSync(folder).filter((name) => name.endsWith('.json') && !reserved.includes(name)).sort().flatMap((file) => {
    const parsed: unknown = JSON.parse(readFileSync(join(folder, file), 'utf8'));
    return z.array(cardSchema).parse(parsed).map((card, index) => ({ key: `${file.slice(0, -5)}-${String(index + 1)}`, card }));
  }).sort((a, b) => order(a.card.title).localeCompare(order(b.card.title)));
  const blind = cards.map(({ card }, index) => ({ id: `X${String(index + 1)}`, ...Object.fromEntries(shown.map((field) => [field, scrub(card[field])])) }));
  writeFileSync(join(folder, 'blind.json'), JSON.stringify(blind, null, 1), { mode: 0o600 });
  writeFileSync(join(folder, 'key.json'), JSON.stringify(Object.fromEntries(cards.map(({ key }, index) => [`X${String(index + 1)}`, key])), null, 1),
    { mode: 0o600 });
  return cards.length;
}
