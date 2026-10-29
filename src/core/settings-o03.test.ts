import { describe, expect, it } from 'vitest';
import { BILLING_COLUMNS, billingSettingsPatchSchema, DEFAULT_BILLING_SETTINGS, settingsFromRow } from './billing/settings';

describe('O03 · réglage « validation des vidéos » du client (migration 0045)', () => {
  it('is off by default, and off when the column is missing (0045 not applied)', () => {
    expect(DEFAULT_BILLING_SETTINGS.videoValidationEnabled).toBe(false);
    expect(settingsFromRow(null).videoValidationEnabled).toBe(false);
    expect(settingsFromRow({ credits_enforced: true }).videoValidationEnabled).toBe(false);
  });
  it('reads and writes the column video_validation_enabled', () => {
    expect(settingsFromRow({ video_validation_enabled: true }).videoValidationEnabled).toBe(true);
    expect(BILLING_COLUMNS.videoValidationEnabled).toBe('video_validation_enabled');
    expect(billingSettingsPatchSchema.parse({ clientId: '00000000-0000-4000-8000-000000000001', videoValidationEnabled: true }).videoValidationEnabled).toBe(true);
  });
});
