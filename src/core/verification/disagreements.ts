import { appendVerification, cleanUserFeedback, storedVerdict, type VerificationEntry, type Verdict } from './loop';

export type DisagreementContext = { versionId: string; videoId?: string; shotNumber: number; tier: string; placeId: string | null; shotType: string; judge: Verdict };
export function recordDisagreement(history: unknown, context: { versionId: string; videoId?: string; shotNumber: number; stage: 'keyframe' | 'video'; brief: Record<string, unknown>; verdict: Verdict; at: string; attempt: number; reasons: string[]; feedback: string }): VerificationEntry[] {
  const entries = Array.isArray(history) ? history as VerificationEntry[] : [];
  if (!context.verdict.approved) return entries;
  const drafts = Array.isArray(context.brief.storyboard) ? context.brief.storyboard as Array<{ locationPhotoId?: string; shotType?: string }> : [];
  const draft = drafts[context.shotNumber - 1];
  return appendVerification(entries, { stage: context.stage, attempt: context.attempt, at: context.at, approved: true, issues: context.verdict.issues, reason: 'Plan accepté par le juge puis modifié par l’utilisateur', decision: 'human_disagree', by: 'human', feedback: cleanUserFeedback(context.feedback), reasons: context.reasons,
    disagreement: { versionId: context.versionId, videoId: context.videoId, shotNumber: context.shotNumber, tier: String(context.brief.generationTier ?? context.brief.storyMode ?? context.brief.tier ?? ''), placeId: draft?.locationPhotoId ?? null, shotType: draft?.shotType ?? '', judge: context.verdict } });
}

export type DisagreementShot = { version_id: string; shot_number: number; keyframe_quality?: unknown; video_quality?: unknown; verification_history?: unknown };
export type DisagreementEvent = DisagreementContext & { stage: 'keyframe' | 'video'; at: string; reasons: string[]; feedback: string };
export function disagreementReport(shots: DisagreementShot[]) {
  const accepted = { keyframe: new Set<string>(), video: new Set<string>() };
  const changed = { keyframe: new Set<string>(), video: new Set<string>() };
  const events: DisagreementEvent[] = [];
  const groups = new Map<string, { stage: 'keyframe' | 'video'; reason: string; shots: Set<string> }>();
  for (const shot of shots) {
    const id = `${shot.version_id}:${shot.shot_number}`;
    const history = Array.isArray(shot.verification_history) ? shot.verification_history as VerificationEntry[] : [];
    for (const stage of ['keyframe', 'video'] as const) {
      const quality = (stage === 'keyframe' ? shot.keyframe_quality : shot.video_quality) as { approved?: boolean } | null;
      if (quality?.approved === true || history.some((entry) => entry.stage === stage && entry.by === 'verifier' && entry.approved === true)) accepted[stage].add(id);
    }
    for (const entry of history) {
      if (entry.by !== 'human' || entry.decision !== 'human_disagree' || entry.approved !== true || !entry.disagreement) continue;
      const stage = entry.stage;
      accepted[stage].add(id); changed[stage].add(id);
      const reasons = [...new Set(entry.reasons?.length ? entry.reasons : [cleanUserFeedback(entry.feedback) ? 'comment' : 'redo'])];
      events.push({ ...entry.disagreement, judge: storedVerdict(entry.disagreement.judge) ?? { approved: true, issues: [], reason: '' }, stage, at: entry.at, reasons, feedback: cleanUserFeedback(entry.feedback) });
      for (const reason of reasons) {
        const key = `${stage}:${reason}`;
        const group = groups.get(key) ?? { stage, reason, shots: new Set<string>() };
        group.shots.add(id); groups.set(key, group);
      }
    }
  }
  const stages = (['keyframe', 'video'] as const).map((stage) => ({ stage, accepted: accepted[stage].size, disagreed: changed[stage].size, rate: accepted[stage].size ? changed[stage].size / accepted[stage].size : 0 }));
  return { stages, groups: [...groups.values()].map((group) => ({ stage: group.stage, reason: group.reason, count: group.shots.size, accepted: accepted[group.stage].size, rate: accepted[group.stage].size ? group.shots.size / accepted[group.stage].size : 0 })), events };
}

export function disagreementsCsv(events: DisagreementEvent[]): string {
  const cell = (value: unknown) => { const text = String(value ?? ''); return `"${(/^[\s]*[=+@-]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`; };
  const columns = ['video_id', 'version_id', 'plan', 'etape', 'niveau', 'lieu', 'type_plan', 'juge', 'avertissements', 'motifs', 'commentaire', 'date'];
  return '\ufeff' + [columns, ...events.map((event) => [event.videoId, event.versionId, event.shotNumber, event.stage === 'keyframe' ? 'Image clé' : 'Clip', event.tier, event.placeId, event.shotType, event.judge.issues.length ? 'Avec avertissements' : 'Approuvé', event.judge.issues.join(' | '), event.reasons.join(' | '), event.feedback, event.at])].map((row) => row.map(cell).join(';')).join('\r\n');
}
