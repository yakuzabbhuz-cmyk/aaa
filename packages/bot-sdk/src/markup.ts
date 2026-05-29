// ============================================
// DL Chat Bot SDK — Message Markup Helpers
// DEATH LEGION Team — Proprietary Software
// ============================================

/** Bold text */
export const bold = (text: string): string => `**${text}**`;

/** Italic text */
export const italic = (text: string): string => `_${text}_`;

/** Underline text */
export const underline = (text: string): string => `__${text}__`;

/** Strikethrough text */
export const strikethrough = (text: string): string => `~~${text}~~`;

/** Inline code */
export const code = (text: string): string => `\`${text}\``;

/** Code block with optional language */
export const pre = (text: string, language = ''): string =>
  `\`\`\`${language}\n${text}\n\`\`\``;

/** Spoiler text */
export const spoiler = (text: string): string => `||${text}||`;

/** Mention a user by ID */
export const mention = (userId: string, displayText: string): string =>
  `[@${displayText}](dlchat://user/${userId})`;

/** Inline URL */
export const link = (text: string, url: string): string => `[${text}](${url})`;

/** Hashtag */
export const hashtag = (tag: string): string =>
  tag.startsWith('#') ? tag : `#${tag}`;

/** Format a number with commas */
export const formatNumber = (n: number): string =>
  n.toLocaleString('en-US');

/** Format file size */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

/** Format duration in seconds */
export const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/** Escape markdown special characters */
export const escapeMarkdown = (text: string): string =>
  text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');

/** Build a clean text table */
export const table = (headers: string[], rows: string[][]): string => {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] || '').length)));
  const pad = (s: string, w: number): string => s.padEnd(w);
  const sep = widths.map((w) => '-'.repeat(w)).join(' | ');
  const header = headers.map((h, i) => pad(h, widths[i])).join(' | ');
  const body = rows.map((row) => row.map((cell, i) => pad(cell || '', widths[i])).join(' | ')).join('\n');
  return pre(`${header}\n${sep}\n${body}`);
};

/** Build a progress bar */
export const progressBar = (current: number, total: number, width = 20): string => {
  const pct = Math.min(Math.max(current / total, 0), 1);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${Math.round(pct * 100)}%`;
};

/** Truncate text with ellipsis */
export const truncate = (text: string, maxLength: number, suffix = '...'): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
};
