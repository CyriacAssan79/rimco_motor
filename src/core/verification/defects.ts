/**
 * Defects of the vision judges, for the user (26/10). The judge writes each defect in English (kept for the director
 * and in « Détail technique ») and adds a code from this closed list; the French sentence comes from the code, so no
 * translation call is ever paid. A defect without a code (verdicts written before the codes) reads as « other ».
 */
export const DEFECT_CODES = [
  'identity', 'framing', 'cut_off', 'wrong_direction', 'floating', 'sliding', 'treadmill', 'place', 'foreign_setting',
  'pasted_on', 'extra_vehicle', 'people', 'steering', 'traffic_side', 'lighting', 'text', 'other',
] as const;
export type DefectCode = typeof DEFECT_CODES[number];

export const DEFECT_LABELS_FR: Record<DefectCode, string> = {
  identity: 'Le véhicule ne correspond pas à sa photo (couleur, calandre, logo, jantes ou feux)',
  framing: 'Le cadrage ne correspond pas au plan prévu',
  cut_off: 'La voiture est coupée par le bord de l’image',
  wrong_direction: 'La voiture va dans le mauvais sens ou quitte sa trajectoire',
  floating: 'La voiture flotte au-dessus du sol',
  sliding: 'La voiture glisse sans que ses roues tournent',
  treadmill: 'Les roues tournent mais la voiture n’avance pas',
  place: 'Le lieu ne correspond pas à la photo du lieu',
  foreign_setting: 'Le décor ne ressemble pas au lieu choisi (autre pays, autre ville)',
  pasted_on: 'La voiture semble collée sur le décor (lumière ou ombres incohérentes)',
  extra_vehicle: 'Un véhicule en trop apparaît dans l’image',
  people: 'Les personnes ne correspondent pas à la demande',
  steering: 'Le volant ou le conducteur est du mauvais côté',
  traffic_side: 'La voiture roule du mauvais côté de la route',
  lighting: 'La lumière ne correspond pas au moment de la journée du lieu ou change pendant le clip',
  text: 'Un texte ou un logo lisible apparaît dans l’image',
  other: 'Autre défaut signalé par le contrôle automatique',
};

/** English list given to the judges (prompt): same codes, same order. */
export const DEFECT_CODES_FOR_JUDGE = DEFECT_CODES.join(', ');

export function normalizeDefectCode(value: unknown): DefectCode {
  const code = typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  return (DEFECT_CODES as readonly string[]).includes(code) ? code as DefectCode : 'other';
}

/** Codes read back from a stored verdict, aligned on its issues; anything unknown becomes « other ». */
export function storedDefectCodes(value: unknown, issueCount: number): DefectCode[] {
  const codes = Array.isArray(value) ? value : [];
  return Array.from({ length: issueCount }, (_, index) => normalizeDefectCode(codes[index]));
}

export type DefectView = {
  code: DefectCode;
  /** French sentence shown to the user. */
  label: string;
  severity: 'bloquant' | 'mineur' | null;
  /** « vers 2,5 s » for a defect seen in a clip. */
  at: string | null;
  /** The judge's own words (English), for « Détail technique ». */
  detail: string;
};

/** Text written by the code when the judge's answer could not be read: already French, shown as it is. */
const FRENCH_NOTE = /^Contrôle automatique illisible/;

export function describeDefects(issues: string[], codes?: unknown): DefectView[] {
  const aligned = storedDefectCodes(codes, issues.length);
  return issues.map((issue, index) => {
    const detail = issue.trim();
    const time = detail.match(/^t\s*=\s*(\d+(?:\.\d+)?)\s*s\b/i);
    const rest = time ? detail.slice(time[0].length).trim() : detail;
    const severity = /^blocking\b/i.test(rest) ? 'bloquant' : /^minor\b/i.test(rest) ? 'mineur' : null;
    const code = aligned[index];
    return {
      code,
      label: FRENCH_NOTE.test(detail) ? 'Le contrôle automatique n’a pas pu se prononcer : vérifiez ce plan à l’œil' : DEFECT_LABELS_FR[code],
      severity,
      at: time ? `vers ${time[1].replace('.', ',')} s` : null,
      detail,
    };
  });
}
