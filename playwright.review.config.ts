import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir: './e2e', testMatch: '**/workspace.spec.ts', fullyParallel: false, workers: 1,
  globalSetup: './e2e/global-setup.ts', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3017', ...devices['Desktop Chrome'], ...(process.platform === 'win32' && existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? { channel: 'chrome' } : {}), trace: 'retain-on-failure' },
  webServer: { command: 'node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3017', cwd: process.env.RIMCO_REVIEW_RUNTIME, url: 'http://127.0.0.1:3017/connexion', reuseExistingServer: false, timeout: 120_000 },
});
