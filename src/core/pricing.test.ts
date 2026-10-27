import { describe, expect, it } from 'vitest';
import { estimateGridPriceFcfa, estimatePriceFcfa, estimateRealCost, formatFcfa, formatSignedFcfa } from './pricing';

describe('pricing',()=>{
  it('applies the fixed five-second client price by tier',()=>{
    expect(estimatePriceFcfa(5,'standard')).toBe(2300);
    expect(estimatePriceFcfa(5,'pro')).toBe(3500);
    expect(estimatePriceFcfa(5,'premium')).toBe(4750);
    expect(estimatePriceFcfa(5,'test')).toBe(4750);
  });
  it('uses the active brand grid for Standard and Premium client prices',()=>{
    const grid = { standard: 460, pro: 700, premium: 950 };
    expect(estimateGridPriceFcfa(20, 'premium', grid)).toBe(19000);
    expect(estimateGridPriceFcfa(20, 'standard', grid)).toBe(9200);
    expect(estimateGridPriceFcfa(20, 'pro', grid)).toBe(14000);
    expect(estimateGridPriceFcfa(20, 'test', grid)).toBe(19000);
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
    expect(()=>estimatePriceFcfa(0,'standard')).toThrow();
    expect(()=>estimateRealCost(5,-.1,.9,655.957)).toThrow();
  });
});
