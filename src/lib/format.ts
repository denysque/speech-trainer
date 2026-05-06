export function formatDurationSec(s: number): string {
  const n = Number(s) || 60;
  const last = n % 10, last2 = n % 100;
  let word = 'секунд';
  if (last2 < 11 || last2 > 14) {
    if (last === 1) word = 'секунду';
    else if (last >= 2 && last <= 4) word = 'секунды';
  }
  return `${n} ${word}`;
}

export function pluralWords(n: number): string {
  const last = n % 10, last2 = n % 100;
  if (last2 >= 11 && last2 <= 14) return 'слов';
  if (last === 1) return 'слово';
  if (last >= 2 && last <= 4) return 'слова';
  return 'слов';
}

export function formatRelativeDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
