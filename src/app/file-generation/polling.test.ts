import { describe, expect, it } from 'vitest';
import { isGenerationActive, refreshDelayMs } from '@/core/versions/client-polling';

describe('isGenerationActive', () => {
  it('treats queued, generating and postprocessing as running', () => {
    expect(isGenerationActive({ status: 'ready' })).toBe(false);
    expect(isGenerationActive({ status: 'failed' })).toBe(false);
    expect(isGenerationActive({ status: 'ready', versionStatus: 'queued' })).toBe(true);
    expect(isGenerationActive({ status: 'generating' })).toBe(true);
  });
});

describe('refreshDelayMs', () => {
  it('follows the server delay within 10 s and 180 s', () => {
    expect(refreshDelayMs(60)).toBe(60_000);
    expect(refreshDelayMs(1)).toBe(10_000);
    expect(refreshDelayMs(900)).toBe(180_000);
  });

  it('uses 15 s without a valid server delay', () => {
    expect(refreshDelayMs(null)).toBe(15_000);
    expect(refreshDelayMs('invalid')).toBe(15_000);
  });
});
