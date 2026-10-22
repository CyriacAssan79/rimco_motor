/**
 * Patch v3.1 · decision rules of the automatic quality gate.
 *
 * `warn` (default, temporary): a keyframe or clip still rejected after its automatic retry is kept with
 * warnings and the video goes on; the RIMCO validator (step 8) remains the final barrier.
 * `block`: historical behaviour (a rejected shot fails), to restore once a verification orchestration exists.
 * Readable text alone never blocks: it is retried once on keyframes, then reported as a warning.
 */
export type QualityGateMode = 'warn' | 'block';
export type QualityStage = 'keyframe' | 'video';
export type QualityVerdict = { approved: boolean; issues: string[]; reason: string; readableText?: boolean };
export type QualityDecision = 'accept' | 'accept_with_warning' | 'retry' | 'reject';

/** Automatic retries per keyframe or clip (database constraint: 0..1). */
export const MAX_AUTOMATIC_RETRIES = 1;

export function qualityDecision(verdict: QualityVerdict, retryCount: number, input: { stage: QualityStage; mode: QualityGateMode }): QualityDecision {
  const canRetry = retryCount < MAX_AUTOMATIC_RETRIES;
  if (verdict.approved) {
    if (verdict.readableText) {
      // A clip is never paid twice for text alone; a keyframe gets one cheap retry with « blank signs ».
      return input.stage === 'keyframe' && canRetry ? 'retry' : 'accept_with_warning';
    }
    // On clips, the judge lists minor defects while approving: kept as warnings.
    return input.stage === 'video' && verdict.issues.length ? 'accept_with_warning' : 'accept';
  }
  if (canRetry) return 'retry';
  return input.mode === 'warn' ? 'accept_with_warning' : 'reject';
}

/** Short, user-facing list of defects recorded on a shot accepted with warnings. */
export function warningIssues(verdict: QualityVerdict): string[] {
  const issues = verdict.issues.length ? [...verdict.issues] : verdict.approved ? [] : [verdict.reason];
  if (verdict.readableText && !issues.some((issue) => /texte|text|lettre|enseigne|panneau|sign/i.test(issue))) issues.push('Texte visible dans le décor');
  return issues.slice(0, 5);
}

export type QualityWarning = { shotNumber: number; title: string; stage: QualityStage; issues: string[] };

function storedWarning(value: unknown): string[] | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { warning?: unknown; warningIssues?: unknown };
  if (record.warning !== true || !Array.isArray(record.warningIssues)) return null;
  return record.warningIssues.filter((issue): issue is string => typeof issue === 'string');
}

/** Warnings frozen in brief_json.qualityWarnings before the montage (read by the Studio and the validator). */
export function storedQualityWarnings(briefJson: unknown): QualityWarning[] {
  const value = briefJson && typeof briefJson === 'object' ? (briefJson as { qualityWarnings?: unknown }).qualityWarnings : null;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    if (record.stage !== 'keyframe' && record.stage !== 'video') return [];
    const issues = Array.isArray(record.issues) ? record.issues.filter((issue): issue is string => typeof issue === 'string') : [];
    return [{ shotNumber: Number(record.shotNumber) || 0, title: typeof record.title === 'string' ? record.title : '', stage: record.stage, issues }];
  });
}

/** Warnings read back from video_shots.keyframe_quality / video_quality (jsonb, no migration). */
export function collectQualityWarnings(shots: Array<{ shot_number: unknown; title?: unknown; keyframe_quality?: unknown; video_quality?: unknown }>): QualityWarning[] {
  return shots.flatMap((shot) => {
    const base = { shotNumber: Number(shot.shot_number), title: String(shot.title ?? '') };
    const keyframe = storedWarning(shot.keyframe_quality);
    const video = storedWarning(shot.video_quality);
    return [
      ...(keyframe ? [{ ...base, stage: 'keyframe' as const, issues: keyframe }] : []),
      ...(video ? [{ ...base, stage: 'video' as const, issues: video }] : []),
    ];
  });
}
