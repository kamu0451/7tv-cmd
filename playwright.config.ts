import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/browser',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  reporter: 'list',
});
