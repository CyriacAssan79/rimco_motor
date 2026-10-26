import { env } from '@/env';
import { reserveLlmCost, settleUsageCost } from '@/core/billing/ledger';
import { createStorageAdminClient } from '@/core/storage/supabase';
import { createSignedStorageObjectUrl } from '@/core/storage/signed-video';
import { getActiveFalCredential } from '@/core/providers/fal-credential-vault';
import { readPlaceProposal, submitPlaceProposal } from '@/core/providers/fal-place-profile';
import { defaultPlaceProfile } from '@/core/motion/place-motion';
import { PLACE_PROPOSAL_COLUMNS, PLACE_PROPOSAL_RESERVE_USD, pollPlaceProposal, startPlaceProposal, type PlaceProposalPatch, type PlaceProposalRow, type PlaceProposalStatus } from './place-proposal';

/** Server wiring of the place proposal (service-role client: never exposed to the browser). */
export async function proposePlaceSheet(input: { assetId: string; path: string; title?: string | null; actor: { id: string; department: string } }): Promise<PlaceProposalStatus | 'skipped'> {
  const admin = createStorageAdminClient();
  const save = async (patch: PlaceProposalPatch) => {
    const { error } = await admin.from('assets').update(patch).eq('id', input.assetId);
    if (error) console.warn('place_proposal_not_saved', error.message);
  };
  // Simulation: a fixed proposal, without any call.
  if (env.PROVIDERS_MODE === 'mock') {
    const { error } = await admin.from('assets').select('place_profile_proposal_status').eq('id', input.assetId).maybeSingle();
    if (error) return 'skipped';
    await save({ place_profile_proposal_status: 'ready', place_profile_proposal: { ...defaultPlaceProfile({ title: input.title }), promptEn: 'Simulated place: a road between buildings and trees' } });
    return 'ready';
  }
  return startPlaceProposal({}, {
    canStore: async () => !(await admin.from('assets').select('place_profile_proposal_status').eq('id', input.assetId).maybeSingle()).error,
    reserve: async () => (await reserveLlmCost(admin, { userId: input.actor.id, department: input.actor.department, maxCostUsd: PLACE_PROPOSAL_RESERVE_USD, usdToEur: env.USD_TO_EUR_RATE, eurToFcfa: env.EUR_TO_FCFA })).data,
    signImage: () => createSignedStorageObjectUrl((path, expiresIn) => admin.storage.from('assets').createSignedUrl(path, expiresIn), 'assets', input.path),
    submit: async (imageUrl) => submitPlaceProposal(imageUrl, (await getActiveFalCredential(admin)).apiKey),
    release: async (ledgerId) => { await settleUsageCost(admin, { entryId: ledgerId, outcome: 'released', actualCostUsd: 0, usdToEur: env.USD_TO_EUR_RATE, eurToFcfa: env.EUR_TO_FCFA, billable: false }); },
    save,
  });
}

/** Advances the pending proposal of a place (called by the media library while a proposal is pending). */
export async function refreshPlaceProposal(assetId: string): Promise<PlaceProposalStatus | null> {
  const admin = createStorageAdminClient();
  const { data, error } = await admin.from('assets').select(PLACE_PROPOSAL_COLUMNS).eq('id', assetId).eq('kind', 'place').maybeSingle();
  if (error || !data) return null;
  const row = data as PlaceProposalRow;
  if (row.place_profile_proposal_status !== 'pending') return (row.place_profile_proposal_status as PlaceProposalStatus | null) ?? null;
  const apiKey = (await getActiveFalCredential(admin)).apiKey;
  return pollPlaceProposal(row, {
    read: (requestId) => readPlaceProposal(requestId, apiKey),
    settle: async (ledgerId, outcome, costUsd) => {
      const { error: settleError } = await settleUsageCost(admin, { entryId: ledgerId, outcome, actualCostUsd: costUsd, usdToEur: env.USD_TO_EUR_RATE, eurToFcfa: env.EUR_TO_FCFA, billable: false });
      if (settleError) console.warn('place_proposal_settle_failed', settleError.message);
    },
    // Only a still-pending row is written: two refreshes at once never record two outcomes.
    save: async (patch) => { await admin.from('assets').update(patch).eq('id', assetId).eq('place_profile_proposal_status', 'pending'); },
  });
}
