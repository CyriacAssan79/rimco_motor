import { createFalClient } from '@fal-ai/client';
import { z } from 'zod';
import { env } from '@/env';
import { shotRevisionSchema, type ShotRevision } from '@/core/verification/loop';
import { buildFalLlmInput, FAL_LLM_ENDPOINT, llmResponseCost, parseLlmFields } from './fal-llm';

/** Upper bound reserved for one shot correction (short JSON answer; the storyboard costs about 0,02 USD). */
export const SHOT_REVISION_RESERVE_USD = 0.05;

function fal(apiKey: string) {
  if (!apiKey) throw new Error('Aucune clé fal active n’est configurée.');
  return createFalClient({ credentials: apiKey });
}

/**
 * The director's correction goes through fal's queue, like the checks: the refresh route (60 s) never waits for
 * a language model. Same endpoint and model as the storyboard.
 */
export async function submitShotRevision(input: { prompt: string; systemPrompt: string }, apiKey: string) {
  if (!env.LLM_MODEL) throw new Error('Le modèle de rédaction n’est pas configuré.');
  const result = await fal(apiKey).queue.submit(FAL_LLM_ENDPOINT, { input: buildFalLlmInput(input.prompt, input.systemPrompt, env.LLM_MODEL) as never });
  return { requestId: result.request_id };
}

export type ShotRevisionState =
  | { status: 'pending' }
  | { status: 'failed'; costUsd: null }
  | { status: 'ready'; costUsd: number | null; revision: ShotRevision | null; feedbackConflicts: string[] };

/** The shot fields, plus the director's French sentences when the user's request was adapted (read apart, never applied). */
const conflictsSchema = z.object({ feedbackConflicts: z.array(z.string().max(400)).max(5).optional().catch(undefined) }).passthrough();

/** `revision: null` = the director answered (and was paid) but not with a valid shot: the shot keeps its text. */
export async function readShotRevision(requestId: string, apiKey: string): Promise<ShotRevisionState> {
  const client = fal(apiKey);
  const status = await client.queue.status(FAL_LLM_ENDPOINT, { requestId, logs: false });
  const value = String(status.status);
  if (value === 'FAILED') return { status: 'failed', costUsd: null };
  if (value !== 'COMPLETED') return { status: 'pending' };
  const result = await client.queue.result(FAL_LLM_ENDPOINT, { requestId });
  return { status: 'ready', costUsd: llmResponseCost(result), revision: parseLlmFields(result, shotRevisionSchema), feedbackConflicts: parseLlmFields(result, conflictsSchema)?.feedbackConflicts ?? [] };
}
