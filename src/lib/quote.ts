interface Normalized { text: string; map: number[] }

function normalize(input: string): Normalized {
  let text = '';
  const map: number[] = [];
  let space = true;
  for (let index = 0; index < input.length; index += 1) {
    const char = input.charAt(index);
    if (/[-\u00ad\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/.test(char)) {
      const rest = /^-?[ \t]*\r?\n[ \t]*/.exec(input.slice(index + 1));
      if (rest !== null) index += rest[0].length;
      continue;
    }
    const folded = char.normalize('NFKC').toLowerCase()
      .replace(/[\u2018\u2019\u201a\u201b\u2032`]/g, '\'').replace(/[\u201c\u201d\u201e\u2033]/g, '"');
    for (const part of folded) {
      if (/\s/.test(part)) {
        if (!space) { text += ' '; map.push(index); space = true; }
      } else { text += part; map.push(index); space = false; }
    }
  }
  if (text.endsWith(' ')) { text = text.slice(0, -1); map.pop(); }
  return { text, map };
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
  const last = haystack.map[at + needle.length - 1];
  if (start === undefined || last === undefined) return null;
  return { start, end: last + 1 };
}

function clean(value: string): string { return value.replace(/\s+/g, ' ').trim(); }

export function locateQuote(pages: readonly string[], quote: string, paged: boolean): Located | null {
  const needle = normalize(quote).text.trim();
  if (needle.length === 0) return null;
  for (let index = 0; index < pages.length; index += 1) {
    const current = pages[index] ?? '';
    const text = index + 1 < pages.length ? `${current}\n${pages[index + 1] ?? ''}` : current;
    const found = locateIn(text, needle);
    if (found === null || found.start >= current.length + 1) continue;
    return {
      page: paged ? index + 1 : null,
      quote: clean(text.slice(found.start, found.end)),
      before: clean(text.slice(Math.max(0, found.start - contextLength), found.start)),
      after: clean(text.slice(found.end, found.end + contextLength)),
    };
  }
  return null;
}
