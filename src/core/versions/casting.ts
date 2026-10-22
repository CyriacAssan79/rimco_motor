import { shouldExcludePeople } from '@/core/providers/fal-keyframes';
import type { StoryboardShot } from '@/core/storyboard';

export type StoredCastMember = { id: string; title: string; path: string };

export function storedCast(brief: Record<string, unknown>): StoredCastMember[] {
  return Array.isArray(brief.castAssets)
    ? (brief.castAssets as unknown[]).filter((entry): entry is StoredCastMember => Boolean(entry) && typeof (entry as StoredCastMember).id === 'string' && typeof (entry as StoredCastMember).path === 'string').map((entry) => ({ id: entry.id, title: String(entry.title ?? ''), path: entry.path }))
    : [];
}

/**
 * People policy of one shot. With a selected casting, only the people listed in the shot appear
 * (none = unoccupied vehicle); without casting, the historical brief rule applies, plus the director's text sheet.
 */
export function peopleForShot(brief: Record<string, unknown>, shot: StoryboardShot | undefined) {
  const cast = storedCast(brief);
  if (cast.length) {
    const members = [...new Set(shot?.castIds ?? [])].map((id) => cast.find((member) => member.id === id)).filter((member): member is StoredCastMember => Boolean(member));
    return { excludePeople: members.length === 0, castMembers: members, castTitles: members.map((member) => member.title), castDescription: null as string | null };
  }
  const sheet = typeof brief.castDescription === 'string' && brief.castDescription.trim() ? brief.castDescription : null;
  // Patch v3.2 (F9): people appear only through the casting or the director's sheet, written when the brief asks for
  // people. Versions created before keep the historical keyword detection.
  const excludePeople = brief.promptRules === 'v3.2' ? !sheet : shouldExcludePeople(String(brief.character ?? ''), String(brief.user_direction ?? ''));
  const description = excludePeople ? null : sheet;
  return { excludePeople, castMembers: [] as StoredCastMember[], castTitles: [] as string[], castDescription: description };
}

/** Reference order sent to the image model and the judge: vehicle views, casting photos, place last. */
export function withCastReferences(referenceIds: string[], castIds: string[], locationPhotoId: string | null | undefined): string[] {
  const vehicleIds = referenceIds.filter((id) => id !== locationPhotoId && !castIds.includes(id));
  const hasLocation = Boolean(locationPhotoId && referenceIds.includes(locationPhotoId));
  return [...vehicleIds, ...castIds, ...(hasLocation ? [locationPhotoId!] : [])];
}
