export type Appearance = 'light' | 'dark';

export const appearanceCookie = 'coresearch-appearance';

export function parseAppearance(value: string | undefined): Appearance | null {
  return value === 'dark' || value === 'light' ? value : null;
}

export const systemAppearance = `(() => {
  const root = document.documentElement;
  const query = matchMedia('(prefers-color-scheme: dark)');
  const chosen = () => document.cookie.split('; ').some((item) => item.startsWith('${appearanceCookie}='));
  const follow = () => { if (!chosen()) { root.classList.toggle('dark', query.matches); root.classList.toggle('light', !query.matches); } };
  follow();
  query.addEventListener('change', follow);
})();`;
