import { explicitlyNoPeople, shouldExcludePeople, type CabinRule } from '@/core/providers/fal-keyframes';
import type { StoryboardShot } from '@/core/storyboard';
import { needsDriver, storedMovingDriver } from './moving-driver';

export type StoredCastMember = { id: string; title: string; path: string };

export function storedCast(brief: Record<string, unknown>): StoredCastMember[] {
  return Array.isArray(brief.castAssets)
    ? (brief.castAssets as unknown[]).filter((entry): entry is StoredCastMember => Boolean(entry) && typeof (entry as StoredCastMember).id === 'string' && typeof (entry as StoredCastMember).path === 'string').map((entry) => ({ id: entry.id, title: String(entry.title ?? ''), path: entry.path }))
    : [];
}

type ShotPeople = { excludePeople: boolean; castMembers: StoredCastMember[]; castTitles: string[]; castDescription: string | null; cabin?: CabinRule };

/**
 * People policy of one shot. With a selected casting, only the people listed in the shot appear
 * (none = unoccupied vehicle); without casting, the historical brief rule applies, plus the director's text sheet.
 * 27/10: a car that drives (or has just stopped after driving) is never empty, see moving-driver.ts. `shotNumber`
 * (1-based) finds the previous shot; without it, only the shot's own motion counts.
 */
export function peopleForShot(brief: Record<string, unknown>, shot: StoryboardShot | undefined, shotNumber?: number): ShotPeople {
  const people = shotPeople(brief, shot);
  const driver = storedMovingDriver(brief);
  if (!driver || !shot || !needsDriver(brief, shot, shotNumber)) return people;
  // People already shown (casting or the director's sheet) are the occupants: they sit inside while the car drives.
  if (people.castMembers.length || people.castDescription) return people;
  if (explicitlyNoPeople(String(brief.character ?? ''), String(brief.user_direction ?? ''))) return { ...people, excludePeople: true, cabin: 'hidden' };
  return { excludePeople: false, castMembers: [], castTitles: [], castDescription: driver.description, cabin: 'driver' };
}

function shotPeople(brief: Record<string, unknown>, shot: StoryboardShot | undefined): ShotPeople {
  const cast = storedCast(brief);
  if (cast.length) {
    const members = [...new Set(shot?.castIds ?? [])].map((id) => cast.find((member) => member.id === id)).filter((member): member is StoredCastMember => Boolean(member));
    return { excludePeople: members.length === 0, castMembers: members, castTitles: members.map((member) => member.title), castDescription: null as string | null };
  }
  const sheet = typeof brief.castDescription === 'string' && brief.castDescription.trim() ? brief.castDescription : null;
  // Patch v3.2 (F9): people appear only through the casting or the director's sheet, written when the brief asks for
  // people. Versions created before keep the historical keyword detection.
  const excludePeople = brief.promptRules === 'v3.2' ? !sheet : shouldExcludePeople(String(brief.character ?? ''), String(brief.user_direction ?? ''));
  // 26/10: the director says shot by shot where the described people appear; versions before keep them everywhere.
  const shown = !excludePeople && shot?.withPeople !== false;
  return { excludePeople: !shown, castMembers: [] as StoredCastMember[], castTitles: [] as string[], castDescription: shown ? sheet : null };
}

/** Reference order sent to the image model and the judge: vehicle views, casting photos, place last. */
export function withCastReferences(referenceIds: string[], castIds: string[], locationPhotoId: string | null | undefined): string[] {
  const vehicleIds = referenceIds.filter((id) => id !== locationPhotoId && !castIds.includes(id));
  const hasLocation = Boolean(locationPhotoId && referenceIds.includes(locationPhotoId));
  return [...vehicleIds, ...castIds, ...(hasLocation ? [locationPhotoId!] : [])];
}
