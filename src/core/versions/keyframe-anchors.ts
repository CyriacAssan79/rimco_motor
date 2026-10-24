/**
 * Étape 3b (24/10/2026) · continuity of a place across shots. The first shot filmed in a place is its anchor;
 * every later shot in the same place waits for the anchor's accepted keyframe and receives it as an extra
 * reference (24/10: a two-way bridge became « closed » behind the car in the next shot).
 */

/** Shot number → anchor shot number (1-based), for the shots that follow an earlier shot in the same place. */
export function keyframeAnchors(shots: Array<{ locationPhotoId?: string | null }>): Record<number, number> {
  const firstByPlace = new Map<string, number>();
  const anchors: Record<number, number> = {};
  shots.forEach((shot, index) => {
    const shotNumber = index + 1;
    if (!shot.locationPhotoId) return;
    const first = firstByPlace.get(shot.locationPhotoId);
    if (first) anchors[shotNumber] = first;
    else firstByPlace.set(shot.locationPhotoId, shotNumber);
  });
  return anchors;
}

/** Anchor of a shot, read from `brief_json.keyframeAnchors` (undefined for versions made before 3b). */
export function storedKeyframeAnchor(brief: Record<string, unknown>, shotNumber: number): number | undefined {
  const anchors = brief.keyframeAnchors && typeof brief.keyframeAnchors === 'object' ? brief.keyframeAnchors as Record<string, unknown> : {};
  const anchor = Number(anchors[String(shotNumber)]);
  return Number.isInteger(anchor) && anchor >= 1 && anchor < shotNumber ? anchor : undefined;
}

/** Reference order expected by the keyframe prompt: …, anchor keyframe, location photo last. */
export function withAnchorReference(referenceUrls: string[], anchorUrl: string, hasLocationReference: boolean): string[] {
  return hasLocationReference && referenceUrls.length
    ? [...referenceUrls.slice(0, -1), anchorUrl, referenceUrls.at(-1)!]
    : [...referenceUrls, anchorUrl];
}

/**
 * What a deferred keyframe does on this refresh. Any failed keyframe fails the whole version, so a deferred one is
 * then cancelled without being paid for; otherwise it waits for its anchor and uses it once accepted.
 */
export function anchoredKeyframeAction(anchorStatus: string | null | undefined, anyKeyframeFailed: boolean): 'wait' | 'with_anchor' | 'without_anchor' | 'cancel' {
  if (anyKeyframeFailed) return 'cancel';
  if (anchorStatus === 'ready') return 'with_anchor';
  if (anchorStatus === 'queued' || anchorStatus === 'generating' || anchorStatus === 'checking') return 'wait';
  // A missing anchor (data from before 3b, deleted file) never blocks the shot: it is made from its own references.
  return 'without_anchor';
}
