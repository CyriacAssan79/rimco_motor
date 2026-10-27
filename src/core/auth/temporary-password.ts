import { randomInt } from 'node:crypto';

/** No ambiguous characters (0/O, 1/l/I): the password is read aloud or copied by hand. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const SYMBOLS = '!@#$%*?';

/**
 * Temporary password generated on the server (27/10): it is shown once to the administrator, then the person must
 * choose their own at first sign-in (app_metadata.must_change_password).
 */
export function generateTemporaryPassword(length = 16): string {
  if (!Number.isInteger(length) || length < 12) throw new Error('Un mot de passe provisoire compte au moins 12 caractères.');
  const chars = Array.from({ length: length - 1 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  chars.splice(randomInt(chars.length + 1), 0, SYMBOLS[randomInt(SYMBOLS.length)]);
  return chars.join('');
}
