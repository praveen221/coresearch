const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function shortDate(iso: string, today: string): string {
  const [year = '', month = '', day = ''] = iso.split('-');
  return `${String(Number(day))} ${months[Number(month) - 1] ?? month}${year === today.slice(0, 4) ? '' : ` ${year}`}`;
}
