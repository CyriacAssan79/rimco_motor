import type { ProviderStatus, VideoProvider, LlmProvider } from './contracts';
import { buildBrief } from '../brief';
const started = new Map<string, number>();
export const mockVideoProvider: VideoProvider = {
  async submit() { const requestId = crypto.randomUUID(); started.set(requestId, Date.now()); return { requestId }; },
  async status(requestId) {
    if (!started.has(requestId)) return { status: 'failed', error: 'Demande de génération introuvable.' };
    const elapsed = Date.now() - started.get(requestId)!;
    const status: ProviderStatus = elapsed < 7000 ? 'queued' : elapsed < 18000 ? 'generating' : 'ready';
    return { status, ...(status === 'ready' ? { videoUrl: '/mock/mock-video.mp4' } : {}) };
  },
};
export const mockLlmProvider: LlmProvider = {
  async buildBrief(description, options) { return buildBrief(description, { vehicle_asset_id: options.vehicle_asset_id || 'mock-vehicle' }); },
};
