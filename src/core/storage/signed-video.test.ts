import { describe, expect, it, vi } from 'vitest';
import { createSignedVideoDownloadUrl } from './signed-video';

describe('createSignedVideoDownloadUrl', () => {
  it('requests a signed URL with download disposition', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.example/video.mp4?download=' }, error: null });

    await expect(createSignedVideoDownloadUrl(createSignedUrl, 'video-id/version-id/final.mp4')).resolves.toBe('https://storage.example/video.mp4?download=');
    expect(createSignedUrl).toHaveBeenCalledWith('video-id/version-id/final.mp4', 3600, { download: true });
  });

  it('returns null when Storage does not provide a signed link', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: new Error('Storage unavailable') });

    await expect(createSignedVideoDownloadUrl(createSignedUrl, 'video-id/version-id/final.mp4')).resolves.toBeNull();
  });
});
