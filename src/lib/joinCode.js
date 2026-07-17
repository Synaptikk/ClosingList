// Generates a 6-char join code from an unambiguous alphabet.
// Excludes 0/O/1/I/L to reduce read/type errors on mobile.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateJoinCode(len = 6) {
  let out = '';
  const arr = new Uint32Array(len);
  (globalThis.crypto || window.crypto).getRandomValues(arr);
  for (let i = 0; i < len; i++) out += ALPHABET[arr[i] % ALPHABET.length];
  return out;
}

export function normalizeJoinCode(input) {
  if (!input) return '';
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
