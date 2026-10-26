import { KEYFRAME_QUALITY_RESERVE_USD } from '@/core/providers/fal-keyframes';
import type { PlaceProfile } from '@/core/motion/place-motion';

/**
 * Proposed place sheet (26/10), once per uploaded place: the cost is reserved in usage_ledger before the call
 * (same reserve as a judge check), settled at its real cost, released when fal did not bill. The calls are injected
 * so that the sequence is tested without any paid call.
 */
export const PLACE_PROPOSAL_RESERVE_USD = KEYFRAME_QUALITY_RESERVE_USD;
/** No answer after this delay: the proposal is dropped, billed at most its reservation (like a director correction). */
export const PLACE_PROPOSAL_TIMEOUT_MS = 10 * 60_000;

export type PlaceProposalStatus = 'pending' | 'ready' | 'failed';
/** Columns of `assets` written by the proposal (migration 0035). */
export type PlaceProposalPatch = {
  place_profile_proposal_status: PlaceProposalStatus;
  place_profile_proposal?: PlaceProfile | null;
  place_profile_request_id?: string | null;
  place_profile_ledger_id?: string | null;
  place_profile_requested_at?: string | null;
};
export type PlaceProposalRow = {
  place_profile_proposal_status?: string | null;
  place_profile_request_id?: string | null;
  place_profile_ledger_id?: string | null;
  place_profile_requested_at?: string | null;
};
export const PLACE_PROPOSAL_COLUMNS = 'id,kind,place_profile_proposal,place_profile_proposal_status,place_profile_request_id,place_profile_ledger_id,place_profile_requested_at';

export type StartProposalDeps = {
  /** False before migration 0035: nothing is reserved nor called, the admin fills the sheet by hand. */
  canStore: () => Promise<boolean>;
  reserve: () => Promise<string | null>;
  signImage: () => Promise<string | null>;
  submit: (imageUrl: string) => Promise<string>;
  release: (ledgerId: string) => Promise<void>;
  save: (patch: PlaceProposalPatch) => Promise<void>;
  now?: () => Date;
};

/** Starts the single proposal of a place. Never throws: the upload itself never fails because of it. */
export async function startPlaceProposal(row: PlaceProposalRow, deps: StartProposalDeps): Promise<PlaceProposalStatus | 'skipped'> {
  try {
    if (row.place_profile_proposal_status || row.place_profile_request_id) return 'skipped';
    if (!(await deps.canStore())) return 'skipped';
    const ledgerId = await deps.reserve();
    if (!ledgerId) {
      await deps.save({ place_profile_proposal_status: 'failed' });
      return 'failed';
    }
    const imageUrl = await deps.signImage();
    if (!imageUrl) {
      await deps.release(ledgerId);
      await deps.save({ place_profile_proposal_status: 'failed' });
      return 'failed';
    }
    let requestId: string;
    try { requestId = await deps.submit(imageUrl); }
    catch (cause) {
      console.warn('place_proposal_submit_failed', cause instanceof Error ? cause.message : 'unknown');
      await deps.release(ledgerId);
      await deps.save({ place_profile_proposal_status: 'failed' });
      return 'failed';
    }
    await deps.save({ place_profile_proposal_status: 'pending', place_profile_request_id: requestId, place_profile_ledger_id: ledgerId, place_profile_requested_at: (deps.now?.() ?? new Date()).toISOString() });
    return 'pending';
  } catch (cause) {
    console.warn('place_proposal_unavailable', cause instanceof Error ? cause.message : 'unknown');
    return 'failed';
  }
}

export type PollProposalDeps = {
  read: (requestId: string) => Promise<{ status: 'pending' } | { status: 'failed' } | { status: 'ready'; costUsd: number | null; proposal: PlaceProfile | null }>;
  settle: (ledgerId: string, outcome: 'charged' | 'released', costUsd: number) => Promise<void>;
  save: (patch: PlaceProposalPatch) => Promise<void>;
  now?: () => number;
};

/** Advances a pending proposal; the stored proposal is shown to the admin, never applied without validation. */
export async function pollPlaceProposal(row: PlaceProposalRow, deps: PollProposalDeps): Promise<PlaceProposalStatus | null> {
  const status = row.place_profile_proposal_status as PlaceProposalStatus | null | undefined;
  if (status !== 'pending' || !row.place_profile_request_id) return status ?? null;
  const ledgerId = row.place_profile_ledger_id ?? null;
  let state: Awaited<ReturnType<PollProposalDeps['read']>>;
  try { state = await deps.read(row.place_profile_request_id); }
  catch { state = { status: 'pending' }; }
  const startedAt = row.place_profile_requested_at ? Date.parse(row.place_profile_requested_at) : NaN;
  const timedOut = Number.isFinite(startedAt) && (deps.now?.() ?? Date.now()) - startedAt > PLACE_PROPOSAL_TIMEOUT_MS;
  if (state.status === 'pending') {
    if (!timedOut) return 'pending';
    if (ledgerId) await deps.settle(ledgerId, 'charged', PLACE_PROPOSAL_RESERVE_USD);
    await deps.save({ place_profile_proposal_status: 'failed' });
    return 'failed';
  }
  if (state.status === 'failed') {
    if (ledgerId) await deps.settle(ledgerId, 'released', 0);
    await deps.save({ place_profile_proposal_status: 'failed' });
    return 'failed';
  }
  // The model answered: it is billed even when its sheet cannot be read.
  if (ledgerId) await deps.settle(ledgerId, 'charged', state.costUsd ?? PLACE_PROPOSAL_RESERVE_USD);
  await deps.save(state.proposal ? { place_profile_proposal_status: 'ready', place_profile_proposal: state.proposal } : { place_profile_proposal_status: 'failed' });
  return state.proposal ? 'ready' : 'failed';
}
