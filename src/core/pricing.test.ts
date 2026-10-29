import { describe, expect, it } from 'vitest';
import { DEFAULT_VIDEO_PRICES_FCFA, estimateRealCost, formatFcfa, formatSignedFcfa, videoPriceFcfa, videoPricesFromRow } from './pricing';

describe('pricing',()=>{
  it('O01 · bills one flat price per video and tier, whatever the duration up to 30 s',()=>{
    const prices = { standard: 13000, pro: 18000, premium: 19000 };
    for (const seconds of [5, 10, 15, 20, 25, 30]) {
      expect(videoPriceFcfa(seconds, 'standard', prices)).toBe(13000);
      expect(videoPriceFcfa(seconds, 'pro', prices)).toBe(18000);
    }
    expect(videoPriceFcfa(20, 'premium', prices)).toBe(19000);
    expect(videoPriceFcfa(20, 'test', prices)).toBe(19000);
  });
  it('O01 · refuses a duration beyond the 30 s covered by the flat price',()=>{
    expect(()=>videoPriceFcfa(31, 'standard', DEFAULT_VIDEO_PRICES_FCFA)).toThrow(/30 s/);
  });
  it('O01 · reads the flat prices of a pricing_settings row',()=>{
    expect(videoPricesFromRow({ video_price_fcfa_standard: '13000', video_price_fcfa_pro: 18000, video_price_fcfa_premium: 19000 })).toEqual({ standard: 13000, pro: 18000, premium: 19000 });
    expect(DEFAULT_VIDEO_PRICES_FCFA).toEqual({ standard: 13000, pro: 18000, premium: 19000 });
  });
  it('converts real provider cost to EUR and FCFA',()=>{
    expect(estimateRealCost(5,.1,.9,655.957)).toEqual({costUsd:.5,costEur:.45,costRealFcfa:.45*655.957});
  });
  it('formats FCFA without decimals and with a non-breaking thousands separator',()=>{
    expect(formatFcfa(1234567)).toBe('1\u00a0234\u00a0567 FCFA');
    expect(formatFcfa(3500)).toBe('3\u00a0500 FCFA');
  });
  it('formats a negative margin instead of crashing the cost page (24/10)',()=>{
    expect(formatSignedFcfa(-13)).toBe('\u221213 FCFA');
    expect(formatSignedFcfa(-1234.4)).toBe('\u22121\u00a0234 FCFA');
    expect(formatSignedFcfa(2300)).toBe('2\u00a0300 FCFA');
    expect(()=>formatFcfa(-1)).toThrow();
  });
  it('rejects invalid inputs at the pricing boundary',()=>{
    expect(()=>videoPriceFcfa(0,'standard',DEFAULT_VIDEO_PRICES_FCFA)).toThrow();
    expect(()=>videoPriceFcfa(10,'standard',{ standard: -1, pro: 1, premium: 1 })).toThrow();
    expect(()=>estimateRealCost(5,-.1,.9,655.957)).toThrow();
  });
});
