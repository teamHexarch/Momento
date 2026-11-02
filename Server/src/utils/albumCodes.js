import crypto from 'node:crypto';

// No 0/O, 1/I/L or 5/S, so a code read off a printed card is hard to get wrong
const ALPHABET = '2346789ABCDEFGHJKMNPQRTUVWXYZ';

export function newAlbumCode() {
  let s = '';
  for (const b of crypto.randomBytes(7)) s += ALPHABET[b % ALPHABET.length];
  return s;
}

// "k7q-48dm", "K7Q 48DM" and "K7Q48DM" all become "K7Q48DM"
export function normaliseCode(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
