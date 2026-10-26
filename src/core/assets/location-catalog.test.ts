import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { locationCatalog, placeDescription } from '@/core/assets/location-catalog';
import { PLACE_TIMES_OF_DAY } from '@/core/motion/place-motion';

const file = (path: string) => join(process.cwd(), 'public', path);
/** English and French words that state a time of day: the light comes from the light block only. */
const TIME_OF_DAY = /\b(?:day\w*|night\w*|morning|evening|sunset|sunrise|dusk|dawn|golden|noon|afternoon|twilight|jour\w*|nuit|soir\w*|coucher|lever|matin)\b/i;

/** Width of a WebP file read from its header (VP8, VP8L and VP8X variants). */
function webpWidth(bytes: Buffer): number | null {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return 1 + bytes.readUIntLE(24, 3);
  if (chunk === 'VP8L') return 1 + (bytes.readUInt16LE(21) & 0x3fff);
  if (chunk === 'VP8 ') return bytes.readUInt16LE(26) & 0x3fff;
  return null;
}

describe('catalogue des lieux (26/10)', () => {
  it('chaque lieu a un moment de la journée, un texte anglais sans moment de la journée et un fichier existant', () => {
    for (const location of locationCatalog) {
      expect(PLACE_TIMES_OF_DAY, location.title).toContain(location.profile.timeOfDay);
      expect(location.profile.promptEn.length, location.title).toBeGreaterThan(10);
      expect(location.profile.promptEn, location.title).not.toMatch(TIME_OF_DAY);
      expect(placeDescription(location), location.title).not.toMatch(TIME_OF_DAY);
      expect(existsSync(file(location.path)), location.path).toBe(true);
    }
  });

  it('garde les identifiants des lieux existants (les vidéos passées y font référence)', () => {
    const ids = locationCatalog.map((location) => location.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let suffix = 201; suffix <= 219; suffix += 1) expect(ids).toContain(`d55c82b1-95d3-4d2e-a2d2-25068739d${suffix}`);
  });

  it('les lieux réintégrés sont en WebP d’au moins 1280 px de large', () => {
    const reintegrated = locationCatalog.filter((location) => Number(location.id.slice(-3)) >= 212);
    expect(reintegrated).toHaveLength(8);
    for (const location of reintegrated) {
      expect(location.path, location.title).toMatch(/\.webp$/);
      expect(webpWidth(readFileSync(file(location.path))), location.title).toBeGreaterThanOrEqual(1280);
    }
  });
});
