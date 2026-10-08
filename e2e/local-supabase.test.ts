import { describe, expect, it } from 'vitest';
import { isLocalSupabaseUrl } from './local-supabase';

describe('local Supabase E2E guard', () => {
  it.each([
    'http://localhost:54321',
    'http://127.0.0.1:54321',
    'http://[::1]:54321',
  ])('accepts the local Supabase URL %s', (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(true);
  });

  it.each([
    'https://localhost:54321',
    'http://supabase.example.com',
    'http://127.0.0.1.attacker.test:54321',
    'not a URL',
  ])('rejects non-local Supabase URLs %s', (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(false);
  });
});
