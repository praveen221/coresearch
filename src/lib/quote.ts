interface Normalized { text: string; map: number[]; ends: number[] }

const unreadable = '￿';
const ligature = /ffi|ffl|ff|fi|fl|￿/y;

function foldLigatures(source: Normalized): Normalized {
  let text = '';
  const map: number[] = [];
  const ends: number[] = [];
  for (let index = 0; index < source.text.length;) {
    ligature.lastIndex = index;
    const length = ligature.exec(source.text)?.[0].length ?? 0;
    const span = Math.max(length, 1);
    text += length === 0 ? source.text.charAt(index) : '\u0001';
    map.push(source.map[index] ?? 0);
    ends.push(source.ends[index + span - 1] ?? 0);
    index += span;
  }
  return { text, map, ends };
}

function normalize(input: string): Normalized {
  let text = '';
  const map: number[] = [];
  const ends: number[] = [];
  let space = true;
  for (let index = 0; index < input.length; index += 1) {
    const char = input.charAt(index);
    if (/[-\u00ad\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/.test(char)) {
      const rest = /^-?\s*/.exec(input.slice(index + 1));
      if (rest !== null) index += rest[0].length;
      continue;
    }
    const folded = char.normalize('NFKC').toLowerCase()
      .replace(/[\u2018\u2019\u201a\u201b\u2032`]/g, '\'').replace(/[\u201c\u201d\u201e\u2033]/g, '"');
    for (const part of folded) {
      if (/\s/.test(part)) {
        if (!space) { text += ' '; map.push(index); ends.push(index + 1); space = true; }
      } else { text += part; map.push(index); ends.push(index + 1); space = false; }
    }
  }
  if (text.endsWith(' ')) { text = text.slice(0, -1); map.pop(); ends.pop(); }
  return foldLigatures({ text, map, ends });
}

export interface Located {
  page: number | null;
  quote: string;
  before: string;
  after: string;
}

const contextLength = 280;

function locateIn(text: string, needle: string): { start: number; end: number } | null {
  const haystack = normalize(text);
  const at = haystack.text.indexOf(needle);
  if (at === -1) return null;
  const start = haystack.map[at];
  const end = haystack.ends[at + needle.length - 1];
  if (start === undefined || end === undefined) return null;
  return { start, end };
}

function clean(value: string): string { return value.replace(/-[ \t]*\r?\n\s*/g, '-').replace(/\s+/g, ' ').trim(); }

function cleanLines(value: string, side: 'before' | 'after'): string {
  const lines = value.replace(/-[ \t]*\r?\n\s*/g, '-').replace(/[ \t]+/g, ' ').replace(/ *\r?\n */g, '\n').replace(/\n{2,}/g, '\n');
  return side === 'before' ? lines.trimStart() : lines.trimEnd();
}

export function locateQuote(pages: readonly string[], quote: string, paged: boolean): Located | null {
  const needle = normalize(quote).text.trim();
  if (needle.length === 0) return null;
  for (let index = 0; index < pages.length; index += 1) {
    const current = pages[index] ?? '';
    const text = index + 1 < pages.length ? `${current}\n${pages[index + 1] ?? ''}` : current;
    const found = locateIn(text, needle);
    if (found === null || found.start >= current.length + 1) continue;
    const matched = text.slice(found.start, found.end);
    return {
      page: paged ? index + 1 : null,
      quote: clean(matched.includes(unreadable) ? quote : matched),
      before: cleanLines(text.slice(Math.max(0, found.start - contextLength), found.start), 'before'),
      after: cleanLines(text.slice(found.end, found.end + contextLength), 'after'),
    };
  }
  return null;
}

const edgeLines = 3;

export function stripRunningLines(pages: readonly string[]): string[] {
  const split = pages.map((page) => page.split('\n'));
  const key = (line: string): string => line.trim().replace(/\d+/g, '#');
  const counts = new Map<string, number>();
  for (const lines of split) {
    const edges = new Set([...lines.slice(0, edgeLines), ...lines.slice(-edgeLines)].map(key).filter((line) => line !== ''));
    for (const line of edges) counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.3));
  const running = new Set([...counts].filter(([, count]) => count >= threshold).map(([line]) => line));
  return split.map((lines) => lines.filter((line, index) => {
    const edge = index < edgeLines || index >= lines.length - edgeLines;
    return !(edge && running.has(key(line)));
  }).join('\n'));
}
