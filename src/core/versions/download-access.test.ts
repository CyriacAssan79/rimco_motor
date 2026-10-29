import { describe, expect, it } from 'vitest';
import { canDownloadVideo } from './download-access';

const base = { videoStatus: 'ready', isOwner: true, adminRights: false, operator: false, validationEnabled: false };

describe('O03 · téléchargement direct', () => {
  it('lets a contributor download their ready video when validation is off (default)', () => {
    expect(canDownloadVideo(base)).toBe(true);
  });
  it('lets the Manager download a ready video of the client, not another contributor', () => {
    expect(canDownloadVideo({ ...base, isOwner: false, adminRights: true })).toBe(true);
    expect(canDownloadVideo({ ...base, isOwner: false })).toBe(false);
  });
  it('keeps the former lock when the client turns validation on', () => {
    expect(canDownloadVideo({ ...base, validationEnabled: true })).toBe(false);
    expect(canDownloadVideo({ ...base, validationEnabled: true, adminRights: true })).toBe(false);
    expect(canDownloadVideo({ ...base, validationEnabled: true, videoStatus: 'approved' })).toBe(true);
    expect(canDownloadVideo({ ...base, validationEnabled: true, isOwner: false, operator: true })).toBe(true);
  });
  it('never offers a video that is not finished', () => {
    for (const videoStatus of ['generating', 'review', 'rejected', 'failed', 'cancelled', 'draft']) {
      expect(canDownloadVideo({ ...base, videoStatus, operator: true, adminRights: true })).toBe(false);
    }
  });
});
