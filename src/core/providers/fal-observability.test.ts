import { describe, expect, it, vi } from 'vitest';
import { logFalStatusFailure } from './fal-observability';

describe('logFalStatusFailure', () => {
  it('logs useful provider context while redacting credentials, URLs, and prompts', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      logFalStatusFailure({
        stage: 'storyboard_shot_status', versionId: 'version-1', shotNumber: 2,
        providerRequestId: 'request-1', endpoint: 'fal-ai/kling/test', adapterFamily: 'kling',
        apiKey: 'private-key', cause: Object.assign(new Error('HTTP 403 token: private-key https://assets.example/photo.jpg {"prompt":"secret campaign brief"}'), { status: 403, code: 'AUTH_REJECTED' }),
      });
      const line = String(log.mock.calls[0]?.[0]);
      expect(line).toContain('"event":"fal_status_poll_failed"');
      expect(line).toContain('"statusCode":403');
      expect(line).toContain('"errorCode":"AUTH_REJECTED"');
      expect(line).toContain('"shotNumber":2');
      expect(line).not.toContain('private-key');
      expect(line).not.toContain('assets.example');
      expect(line).not.toContain('secret campaign brief');
    } finally {
      log.mockRestore();
    }
  });
});
