export function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : /(s|x|ch|sh)$/.test(word) ? 'es' : 's'}`;
}
