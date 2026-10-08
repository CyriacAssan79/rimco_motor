export type ComparisonRecord = {
  id: string;
  user_id: string;
  created_at: string;
  brief_json: Record<string, unknown>;
};

const records = new Map<string, ComparisonRecord>();

export function saveComparison(record: ComparisonRecord) {
  records.set(record.id, record);
  return record;
}

export function listComparisons() {
  return [...records.values()].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export function updateComparison(id: string, update: (record: ComparisonRecord) => ComparisonRecord) {
  const current = records.get(id);
  if (!current) return null;
  const next = update(current);
  records.set(id, next);
  return next;
}
