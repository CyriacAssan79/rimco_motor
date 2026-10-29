import { z } from 'zod';
import { REVISION_REASON_IDS, REVISION_REASONS, USER_FEEDBACK_MAX_LENGTH, cleanUserFeedback, type RevisionReason } from '@/core/verification/loop';

/**
 * 29/10 · S01 / S03 simple · plan non conforme, avant le montage (planches des images clés et des clips).
 * - Reprise créative : un commentaire, puis la génération est relancée (dans la limite de reprises réglée par KÔMIAN).
 * - Erreur technique : un ou plusieurs motifs de la liste fermée (les 10 motifs de « Modifier ce plan »), puis
 *   accepter le plan, relancer la génération (même limite, jamais facturée) ou rejeter le plan (clip désactivé).
 * Chaque déclaration est inscrite dans shot_reports (migration 0046) ; l'opérateur KÔMIAN les suit et recrédite
 * à la main les erreurs techniques.
 */
export const NON_CONFORMITY_KINDS = ['creative', 'technical'] as const;
export type NonConformityKind = typeof NON_CONFORMITY_KINDS[number];
export const REPORT_DECISIONS = ['accept', 'relaunch', 'reject'] as const;
export type ReportDecision = typeof REPORT_DECISIONS[number];
export type ReportStage = 'keyframe' | 'video';

export const KIND_LABELS: Record<NonConformityKind, string> = { creative: 'Reprise créative', technical: 'Erreur technique' };
export const DECISION_LABELS: Record<ReportDecision, string> = { accept: 'Plan accepté', relaunch: 'Génération relancée', reject: 'Plan rejeté' };
export const STAGE_LABELS: Record<ReportStage, string> = { keyframe: 'Image clé', video: 'Clip' };
export const REPORT_STATUS_LABELS = { open: 'À traiter', credited: 'Recrédité', refused: 'Refusé' } as const;

export const shotReportSchema = z.object({
  stage: z.enum(['keyframe', 'video']),
  kind: z.enum(NON_CONFORMITY_KINDS),
  reasons: z.array(z.enum(REVISION_REASON_IDS as [RevisionReason, ...RevisionReason[]])).max(REVISION_REASON_IDS.length).default([]),
  comment: z.string().max(USER_FEEDBACK_MAX_LENGTH * 2).optional(),
  decision: z.enum(REPORT_DECISIONS),
}).strict().superRefine((value, context) => {
  if (value.kind === 'technical' && !value.reasons.length) context.addIssue({ code: 'custom', path: ['reasons'], message: 'Cochez au moins une erreur technique.' });
  if (value.kind === 'creative' && !cleanUserFeedback(value.comment)) context.addIssue({ code: 'custom', path: ['comment'], message: 'Dites ce que vous voulez changer.' });
  if (value.kind === 'creative' && value.decision !== 'relaunch') context.addIssue({ code: 'custom', path: ['decision'], message: 'Une reprise créative relance la génération du plan.' });
  if (value.stage === 'keyframe' && value.decision === 'reject') context.addIssue({ code: 'custom', path: ['decision'], message: 'Un plan se rejette à l’étape des clips.' });
});
export type ShotReportInput = z.infer<typeof shotReportSchema>;

/** Row written in shot_reports: a creative report keeps its comment only, a technical one its reasons (comment optional). */
export function shotReportRow(input: ShotReportInput) {
  const comment = cleanUserFeedback(input.comment) || null;
  return {
    stage: input.stage, kind: input.kind, decision: input.decision,
    reasons: input.kind === 'technical' ? [...new Set(input.reasons)] : [],
    comment,
  };
}

/** What the user can do on a non-conforming shot, from the board's context. */
export function nonConformityActions(input: { kind: NonConformityKind; stage: ReportStage; canRelaunch: boolean; canAccept: boolean; canReject: boolean }) {
  if (input.kind === 'creative') return { accept: false, relaunch: input.canRelaunch, reject: false };
  return { accept: input.canAccept, relaunch: input.canRelaunch, reject: input.stage === 'video' && input.canReject };
}

export function reasonLabels(reasons: readonly string[]): string[] {
  return reasons.map((reason) => (REVISION_REASONS as Record<string, { fr: string }>)[reason]?.fr ?? reason);
}

export const handleReportSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['credited', 'refused']),
  creditedFcfa: z.number().int().min(0).max(100_000_000).optional(),
  note: z.string().trim().min(3).max(400),
}).strict().superRefine((value, context) => {
  if (value.status === 'credited' && value.creditedFcfa === undefined) context.addIssue({ code: 'custom', path: ['creditedFcfa'], message: 'Indiquez le montant recrédité.' });
});
