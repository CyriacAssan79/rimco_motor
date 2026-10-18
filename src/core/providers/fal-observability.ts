import { safeProviderError } from './fal-reference-video';

type FalStatusFailure = {
  stage: 'generation_status' | 'storyboard_shot_status';
  versionId: string;
  providerRequestId: string;
  endpoint: string;
  adapterFamily: string | null;
  shotNumber?: number;
  cause: unknown;
  apiKey?: string;
};

function safeCode(value: unknown) {
  return typeof value === 'string' && /^[a-z\d._-]{1,48}$/i.test(value) ? value : undefined;
}

/** Emit enough sanitized Fal status context to diagnose polling failures without logging request payloads or credentials. */
export function logFalStatusFailure(input: FalStatusFailure) {
  const cause = input.cause && typeof input.cause === 'object' ? input.cause as Record<string, unknown> : {};
  const statusCode = [cause.status, cause.statusCode, cause.status_code].find((value) => typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599);
  const errorCode = safeCode(cause.code) ?? safeCode(cause.name);
  console.error(JSON.stringify({
    event: 'fal_status_poll_failed',
    stage: input.stage,
    versionId: input.versionId,
    ...(input.shotNumber == null ? {} : { shotNumber: input.shotNumber }),
    providerRequestId: input.providerRequestId,
    endpoint: input.endpoint,
    adapterFamily: input.adapterFamily,
    ...(statusCode == null ? {} : { statusCode }),
    ...(errorCode ? { errorCode } : {}),
    error: safeProviderError(input.cause, input.apiKey),
  }));
}
