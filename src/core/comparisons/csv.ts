export type ComparisonCsvRow = {
  comparisonId: string;
  createdAt: string;
  brief: string;
  format: string;
  model: string;
  status: string;
  fidelity?: number;
  realism?: number;
  brandFit?: number;
  comment?: string;
  elapsedSeconds?: number;
  costUsd?: number;
  costEur?: number;
  costRealFcfa?: number;
  priceFcfa?: number;
};

function cell(value: unknown) {
  let text = value === undefined || value === null ? '' : String(value);
  if (/^[\s\u0000-\u001f]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildComparisonCsv(rows: ComparisonCsvRow[]) {
  const columns: Array<[string, keyof ComparisonCsvRow]> = [
    ['Comparaison', 'comparisonId'], ['Date', 'createdAt'], ['Brief', 'brief'], ['Format', 'format'], ['Modèle', 'model'],
    ['État', 'status'], ['Fidélité véhicule / 5', 'fidelity'], ['Réalisme / 5', 'realism'], ['Charte RIMCO / 5', 'brandFit'],
    ['Commentaire', 'comment'], ['Délai (secondes)', 'elapsedSeconds'], ['Coût réel (USD)', 'costUsd'],
    ['Coût réel (EUR)', 'costEur'], ['Coût réel (FCFA)', 'costRealFcfa'], ['Prix facturé (FCFA)', 'priceFcfa'],
  ];
  return [columns.map(([label]) => cell(label)).join(';'), ...rows.map((row) => columns.map(([, key]) => cell(row[key])).join(';'))].join('\r\n');
}
