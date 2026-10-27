// Never apply .env.local provider credentials in build/browser verification.
import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
const task = process.argv[2];
if (!['build', 'e2e'].includes(task)) throw new Error('Choisissez build ou e2e.');
const env = { ...process.env, PROVIDERS_MODE: 'mock', E2E_MOCK_NO_SUPABASE: '1', __NEXT_PROCESSED_ENV: 'true', APP_URL: 'http://127.0.0.1:3017' };
for (const key of Object.keys(env)) if (/^(?:NEXT_PUBLIC_SUPABASE_|SUPABASE_|FAL_|ANTHROPIC_|LLM_|STORYBOARD_SIGNING_KEY|CRON_SECRET)/.test(key)) delete env[key];
delete env.NODE_ENV;
const args = task === 'build' ? ['node_modules/next/dist/bin/next', 'build', '--webpack'] : ['node_modules/@playwright/test/cli.js', 'test', '--config=playwright.review.config.ts', '--grep=images clés puis clips'];
let runtime;
if (task === 'e2e') {
  runtime = await mkdtemp(join(tmpdir(), 'rimco-review-'));
  env.RIMCO_REVIEW_RUNTIME = runtime;
  // An independent project directory avoids the user's running Next dev server and its lock/cache.
  await cp('src', join(runtime, 'src'), { recursive: true });
  for (const name of ['package.json', 'next.config.ts', 'tsconfig.json', 'next-env.d.ts', 'postcss.config.mjs']) await cp(name, join(runtime, name));
  for (const name of ['node_modules', 'public']) await symlink(join(process.cwd(), name), join(runtime, name), 'junction');
}
if (task === 'build') {
  const preparation = spawn(process.execPath, ['scripts/prepare-ffmpeg.mjs'], { env, stdio: 'inherit' });
  const code = await new Promise((resolve) => preparation.on('close', resolve));
  if (code) process.exit(code);
}
const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('close', async (code) => {
  if (runtime) {
    const target = relative(tmpdir(), runtime);
    if (target.startsWith('rimco-review-') && !target.includes('..')) await rm(runtime, { recursive: true, force: true });
  }
  process.exitCode = code ?? 1;
});
