export type Appearance = 'light' | 'dark';

export const appearanceCookie = 'coresearch-appearance';

export function parseAppearance(value: string | undefined): Appearance {
  return value === 'dark' ? 'dark' : 'light';
}
