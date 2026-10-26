/**
 * Views of an approved vehicle photo (24/10, repris le 26/10). The view says which side of the car is seen; for side and
 * three-quarter views it also says where the nose points on screen, so a moving shot never has to mirror or
 * re-orient the photographed car (mirroring swaps the steering wheel side and the badges).
 */
export type PhotoAngle = 'front_three_quarter' | 'front' | 'profile' | 'rear_three_quarter' | 'rear' | 'interior' | 'detail';
export type NoseSide = 'left' | 'right';
export type VehicleView = { angle?: PhotoAngle; nose?: NoseSide };

/** Choices of the media library « Vue de la photo » list; the nose side is read from the label. */
export const vehicleViewOptions = [
  '3/4 avant · nez à gauche',
  '3/4 avant · nez à droite',
  'Profil · nez à gauche',
  'Profil · nez à droite',
  '3/4 arrière · nez à gauche',
  '3/4 arrière · nez à droite',
  'Avant',
  'Arrière',
  'Habitacle',
  'Détail extérieur',
] as const;

const plain = (value: string | null | undefined) => (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Reads the free « angle » text of a photo (« Avant trois-quarts », « 3/4 avant », « Profil »…); undefined = unknown. */
export function normalizePhotoAngle(value: string | null | undefined): PhotoAngle | undefined {
  const text = plain(value).replace(/\bnez\s+(?:a|vers\s+la)\s+(?:gauche|droite)\b/g, ' ');
  if (!text.trim()) return undefined;
  if (/interieur|interior|cockpit|habitacle|tableau de bord|dashboard/.test(text)) return 'interior';
  if (/detail|gros plan|close/.test(text)) return 'detail';
  const threeQuarter = /trois.?quarts?|3\/4|three.?quarter/.test(text);
  const rear = /arriere|rear|back/.test(text);
  const front = /avant|front|face/.test(text);
  if (threeQuarter && rear) return 'rear_three_quarter';
  if (threeQuarter) return 'front_three_quarter';
  if (/profil|profile|cote|side|lateral/.test(text)) return 'profile';
  if (rear) return 'rear';
  if (front) return 'front';
  return undefined;
}

/** Screen side the nose points to (« nez à gauche » = towards the left edge of the photo); undefined = not stated. */
export function parseNoseSide(value: string | null | undefined): NoseSide | undefined {
  const text = plain(value);
  if (/\bnez\s+(?:a|vers\s+la)\s+gauche\b|\bnose\s+(?:to\s+the\s+)?left\b/.test(text)) return 'left';
  if (/\bnez\s+(?:a|vers\s+la)\s+droite\b|\bnose\s+(?:to\s+the\s+)?right\b/.test(text)) return 'right';
  return undefined;
}

export function parseVehicleView(value: string | null | undefined): VehicleView {
  const angle = normalizePhotoAngle(value);
  const nose = angle && viewHasNoseSide(angle) ? parseNoseSide(value) : undefined;
  return { ...(angle ? { angle } : {}), ...(nose ? { nose } : {}) };
}

/** Side and three-quarter views show the nose on one side of the frame; front, rear, interior and detail do not. */
export function viewHasNoseSide(angle: PhotoAngle): boolean {
  return angle === 'profile' || angle === 'front_three_quarter' || angle === 'rear_three_quarter';
}

/** True when the photo still lacks the nose side that its view needs (shown to the admin as « à préciser »). */
export function vehicleViewIncomplete(value: string | null | undefined): boolean {
  const view = parseVehicleView(value);
  return !view.angle || (viewHasNoseSide(view.angle) && !view.nose);
}
