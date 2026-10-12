import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

describe('proxy local simulation access', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('allows the local mock workspace without Supabase credentials', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('PROVIDERS_MODE', 'mock');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');

    const response = await proxy(new NextRequest('http://localhost/studio'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('does not bypass Supabase access checks in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PROVIDERS_MODE', 'mock');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');

    const response = await proxy(new NextRequest('https://rimco.example/studio'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/connexion?configuration=supabase');
  });
});
