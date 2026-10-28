import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import ffmpegStatic from 'ffmpeg-static';
import { animationStarted, keyframeInProgress, keyframeSettled, mergeKeyframeOverlay, readyForAnimation } from '@/core/versions/shot-pipeline';
import { approvalBoard, keyframeApprovalGate, type GateShot } from '@/core/versions/keyframe-gate';
import { fixedClipVerdict, parseClipInspection } from '@/core/verification/fixed-checks';
import { directRetryInstruction, keyframeLoopDecision } from '@/core/verification/loop';
import { hasCriticalDefect } from '@/core/verification/defects';
import { falWebhookUrl, isFalRequestId } from '@/core/providers/fal-webhook';
import { downscaleImage, inspectClip } from '@/core/postproduction/pipeline';
import { judgeCopyPath } from '@/core/verification/judge-references';

const approve = { stage: 'keyframe', attempt: 0, at: '2026-10-28T10:00:00Z', approved: true, issues: [], reason: '', decision: 'human_approve', by: 'human' };

describe('28/10 · chaque plan à son rythme', () => {
  it('un plan part dès que son image clé est prête, sans attendre les autres', () => {
    const ready = { keyframe_status: 'ready', end_keyframe_status: 'skipped' };
    expect(readyForAnimation(ready, { required: false })).toBe(true);
    expect(readyForAnimation({ keyframe_status: 'generating' }, { required: false })).toBe(false);
    // Rolling shot whose end frame is still being made: it waits for it (or for its failure).
    expect(readyForAnimation({ keyframe_status: 'ready', end_keyframe_status: 'checking' }, { required: false })).toBe(false);
    expect(readyForAnimation({ keyframe_status: 'ready', end_keyframe_status: 'failed' }, { required: false })).toBe(true);
  });

  it('avec la validation humaine, seul le plan validé part', () => {
    const required = { required: true, requestedAt: '2026-10-28T10:00:00Z' };
    expect(readyForAnimation({ keyframe_status: 'ready' }, required)).toBe(false);
    expect(readyForAnimation({ keyframe_status: 'ready', verification_history: [approve] }, required)).toBe(true);
    expect(readyForAnimation({ keyframe_status: 'ready' }, { ...required, approvedAt: '2026-10-28T10:05:00Z' })).toBe(true);
    expect(readyForAnimation({ keyframe_status: 'ready', verification_history: [approve] }, { ...required, expiredAt: '2026-10-30T10:00:00Z' })).toBe(false);
  });

  it('distingue une image en cours, une décision humaine et un clip déjà engagé', () => {
    expect(keyframeInProgress({ keyframe_status: 'revising' })).toBe(true);
    expect(keyframeInProgress({ keyframe_status: 'awaiting_review' })).toBe(false);
    expect(keyframeSettled({ keyframe_status: 'ready' })).toBe(true);
    expect(animationStarted([{ animation_submit_state: 'queued' }])).toBe(false);
    expect(animationStarted([{ animation_submit_state: 'queued' }, { provider_request_id: 'req-123456789' }])).toBe(true);
  });

  it('garde le tableau des images clés à l’écran pendant que les premiers clips se font', () => {
    const clipSide = { id: 'v', status: 'generating' as const, processingStage: 'generating' as const, reviewRequired: [{ shotNumber: 1, stage: 'video' }], nextPollInSeconds: 15 };
    const merged = mergeKeyframeOverlay(clipSide, { keyframes: [{ number: 2 }], completedKeyframes: 1, totalKeyframes: 2, reviewRequired: [{ shotNumber: 2, stage: 'keyframe' }], keyframeApproval: { shots: [] }, nextPollInSeconds: 60 });
    expect(merged).toMatchObject({ processingStage: 'generating', completedKeyframes: 1, keyframeApproval: { shots: [] }, nextPollInSeconds: 15 });
    expect(merged.reviewRequired).toHaveLength(2);
    // A finished video is never mixed with the keyframe side.
    expect(mergeKeyframeOverlay({ id: 'v', status: 'ready' as const }, { keyframes: [], completedKeyframes: 2, totalKeyframes: 2, reviewRequired: [] })).toEqual({ id: 'v', status: 'ready' });
  });
});

/** In-memory Supabase for the gate (same as keyframe-approval.test.ts). */
function fakeAdmin() {
  const writes: Array<{ table: string; values: Record<string, unknown> }> = [];
  const admin = {
    from(table: string) {
      let operation = 'select';
      let payload: unknown;
      const query = {
        select: () => query, eq: () => query, is: () => query, in: () => query,
        update: (values: Record<string, unknown>) => { operation = 'update'; payload = values; return query; },
        upsert: () => { operation = 'upsert'; return query; },
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (value: unknown) => void) => { if (operation === 'update') writes.push({ table, values: payload as Record<string, unknown> }); resolve({ data: null, error: null }); },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { admin, writes };
}
const draft = () => ({ title: 'Plan', scene: 's', framing: 'f', location: 'l', action: 'a', camera: 'c', durationSeconds: 5, vehiclePhotoId: 'p', shotType: 'rolling' as const, travelDirection: 'left_to_right' as const, travelSpeed: 'cruise' as const });

describe('28/10 · tableau progressif des images clés', () => {
  it('montre « Image en préparation » pour un plan pas encore prêt et signale un défaut important', () => {
    const shots: GateShot[] = [
      { shot_number: 1, keyframe_status: 'ready', keyframe_quality: { approved: true, issues: ['minor: grille badge colour differs'], codes: ['identity'], reason: 'ok' } },
      { shot_number: 2, keyframe_status: 'generating', keyframe_retry_count: 0 },
      { shot_number: 3, keyframe_status: 'generating', keyframe_retry_count: 1 },
    ];
    const board = approvalBoard({ shots, keyframes: [], draftFor: draft }, { required: true, requestedAt: '2026-10-28T10:00:00Z' });
    expect(board?.shots.map((shot) => shot.state)).toEqual(['to_approve', 'pending', 'correcting']);
    expect(board?.shots[0].alerts?.[0]).toMatch(/ne correspond pas à sa photo/);
    expect(board?.shots[1].alerts).toBeUndefined();
  });

  it('ne fait jamais expirer une vidéo dont des clips sont déjà payés (rappel seulement)', async () => {
    const T0 = Date.parse('2026-10-28T10:00:00Z');
    const brief: Record<string, unknown> = { keyframeApproval: { required: true, requestedAt: new Date(T0).toISOString() } };
    const fake = fakeAdmin();
    const shots: GateShot[] = [{ shot_number: 1, keyframe_status: 'ready', verification_history: [approve] }, { shot_number: 2, keyframe_status: 'ready' }];
    const result = await keyframeApprovalGate({ admin: fake.admin, version: { id: 'v1', video_id: 'video1' }, video: { user_id: 'u1' }, brief, shots, keyframes: [], draftFor: draft, clipsPaid: true, now: T0 + 49 * 3_600_000 });
    expect(result).toMatchObject({ status: 'generating', processingStage: 'keyframe_approval' });
    expect(fake.writes.some((write) => write.values.status === 'cancelled')).toBe(false);
  });
});

describe('28/10 · vérificateurs', () => {
  it('reprend directement l’image pour un défaut de l’image, et passe par le réalisateur sinon', () => {
    const floating = { approved: false, issues: ['blocking: car floats'], codes: ['floating'], reason: 'floats' };
    expect(keyframeLoopDecision(floating, 0, 2)).toBe('retry_image');
    expect(directRetryInstruction(floating)).toMatch(/tyres rest on the ground/);
    const framing = { approved: false, issues: ['blocking: car floats', 'blocking: wrong framing'], codes: ['floating', 'framing'], reason: 'x' };
    expect(keyframeLoopDecision(framing, 0, 2)).toBe('revise');
    // Verdicts written before the codes (26/10): the director, as before.
    expect(keyframeLoopDecision({ approved: false, issues: ['blocking: car floats'], reason: 'x' }, 0, 2)).toBe('revise');
    expect(keyframeLoopDecision(floating, 2, 2)).toBe('review');
  });

  it('signale les défauts importants sans ajouter de reprise', () => {
    expect(hasCriticalDefect(['framing', 'identity'])).toBe(true);
    expect(hasCriticalDefect(['framing', 'lighting'])).toBe(false);
    expect(keyframeLoopDecision({ approved: true, issues: ['minor: badge colour'], codes: ['identity'], reason: 'ok' }, 0, 2)).toBe('accept_with_warning');
  });

  it('lit les mesures FFmpeg et ne retient que des défauts francs', () => {
    const stderr = 'Duration: 00:00:05.04, start: 0\n[blackdetect] black_start:0 black_end:0.8 black_duration:0.8\n[freezedetect] lavfi.freezedetect.freeze_start: 1.2\n[freezedetect] lavfi.freezedetect.freeze_duration: 3.4\n';
    const inspection = parseClipInspection(stderr);
    expect(inspection).toEqual({ durationS: 5.04, blackSeconds: 0.8, longestFreezeSeconds: 3.4 });
    expect(fixedClipVerdict(inspection, { expectedSeconds: 5, moving: true })?.codes).toEqual(['black_frames', 'frozen']);
    // A still shot may stay still; a short freeze is not a defect.
    expect(fixedClipVerdict({ durationS: 5, blackSeconds: 0, longestFreezeSeconds: 4.8 }, { expectedSeconds: 5, moving: false })).toBeNull();
    expect(fixedClipVerdict({ durationS: 5, blackSeconds: 0, longestFreezeSeconds: 1.8 }, { expectedSeconds: 5, moving: true })).toBeNull();
    expect(fixedClipVerdict({ durationS: 3.2, blackSeconds: 0, longestFreezeSeconds: 0 }, { expectedSeconds: 5, moving: true })?.codes).toEqual(['duration']);
    // A freeze lasting until the end of the clip has no printed duration.
    expect(parseClipInspection('Duration: 00:00:05.00\nfreeze_start: 0.5\n').longestFreezeSeconds).toBe(4.5);
  });

  it('mesure un vrai clip avec FFmpeg en quelques centaines de millisecondes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'rimco-test-'));
    try {
      const file = join(directory, 'frozen.mp4');
      spawnSync(String(ffmpegStatic), ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=640x360:r=24:d=5', '-pix_fmt', 'yuv420p', file]);
      const started = Date.now();
      const inspection = await inspectClip(readFileSync(file));
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(inspection?.longestFreezeSeconds).toBeGreaterThan(4);
      expect(fixedClipVerdict(inspection!, { expectedSeconds: 5, moving: true })?.codes).toContain('frozen');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it('réduit une photo de référence pour le juge, sans toucher l’original', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'rimco-test-'));
    try {
      const file = join(directory, 'photo.jpg');
      spawnSync(String(ffmpegStatic), ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=4000x3000', '-frames:v', '1', file]);
      const small = await downscaleImage(readFileSync(file));
      const probe = spawnSync(String(ffmpegStatic), ['-hide_banner', '-i', 'pipe:0'], { input: small! });
      expect(String(probe.stderr)).toMatch(/1024x768/);
      expect(judgeCopyPath('user/abc/photo.png')).toBe('judge-1024/user/abc/photo.png.jpg');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 20_000);
});

describe('28/10 · webhook fal', () => {
  const production = { appUrl: 'https://studio.example.com/', vercelEnv: 'production', secret: 's3cret', live: true };
  it('n’est envoyé que depuis la production, en mode réel, avec le secret', () => {
    expect(falWebhookUrl(production)).toBe('https://studio.example.com/api/fal/webhook?token=s3cret');
    expect(falWebhookUrl({ ...production, vercelEnv: 'preview' })).toBeUndefined();
    expect(falWebhookUrl({ ...production, secret: undefined })).toBeUndefined();
    expect(falWebhookUrl({ ...production, live: false })).toBeUndefined();
    expect(falWebhookUrl({ ...production, appUrl: 'http://localhost:3000' })).toBeUndefined();
    expect(falWebhookUrl({ ...production, appUrl: undefined, productionHost: 'rimco.vercel.app' })).toBe('https://rimco.vercel.app/api/fal/webhook?token=s3cret');
  });
  it('refuse un identifiant de tâche qui pourrait détourner le filtre de la base', () => {
    expect(isFalRequestId('7b1d2c3e-1111-4222-8333-444455556666')).toBe(true);
    expect(isFalRequestId('abc,status.eq.ready')).toBe(false);
    expect(isFalRequestId('')).toBe(false);
  });
});
