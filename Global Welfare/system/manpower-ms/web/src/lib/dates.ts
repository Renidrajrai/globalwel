export function displayDate(value: string | Date | null | undefined, dateOnly = false): string {
  if (!value) return '—';
  const date = dateOnly ? new Date(`${String(value).slice(0, 10)}T00:00:00Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: dateOnly ? 'UTC' : 'Asia/Kathmandu' }).format(date);
}

export const dateInputValue = (value: string | Date | null | undefined, dateOnly = false) => {
  if (!value) return '';
  if (dateOnly) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
};
