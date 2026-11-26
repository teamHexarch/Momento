import { HttpError } from './httpError.js';

// Character limits for what people type (checked here and shown as counters on the pages), so user text can't waste
// database space. Text is trimmed and runs of spaces collapsed first; anything still over the limit is refused with
// 400 TEXT_TOO_LONG.
export const LIMITS = {
  comment: 50,           // photo comments
  reviewBody: 300,       // the review page's comment
  featureOther: 100,     // a review's "Other" feature request
  displayName: 40,       // a person's name or guest nickname
  title: 60,             // album, event and group names, mini-game competition names
  description: 160,      // event and group descriptions, trivia questions, scavenger prompts
};

// Trims, turns tabs and runs of spaces into one space, and allows at most one empty line in a row
// (multiline) or none (single line). Characters are counted as people see them (an emoji is one).
export function tidy(value, { multiline = false } = {}) {
  let s = String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\t\f\v  ]+/g, ' ');
  s = multiline ? s.replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n') : s.replace(/\s*\n\s*/g, ' ');
  return s.trim();
}
export const lengthOf = (s) => [...String(s)].length;

/**
 * The tidied text, or a 400: cleanText(req.body.text, { max: LIMITS.comment, what: 'Your comment', required: true })
 */
export function cleanText(value, { max, what = 'That text', required = false, multiline = false } = {}) {
  if (value != null && typeof value !== 'string') throw new HttpError(400, `${what} must be text.`, 'TEXT_INVALID');
  const s = tidy(value, { multiline });
  if (required && !s) throw new HttpError(400, `${what} can’t be empty.`, 'TEXT_EMPTY');
  if (max && lengthOf(s) > max) throw new HttpError(400, `${what} can be up to ${max} characters.`, 'TEXT_TOO_LONG', { max });
  return s;
}
