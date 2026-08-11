import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 60000,
  retries: 0,
  reporter: 'list',
  use: {
    headless: true,
  },
  projects: [
    {
      name: 'e2e',
      testMatch: 'e2e/**/*.test.ts',
    },
    {
      name: 'integration',
      testMatch: 'integration/**/*.test.ts',
    },
    {
      name: 'performance',
      testMatch: 'performance/**/*.test.ts',
    },
    {
      name: 'preload-artifact',
      testMatch: 'artifact/preload/**/*.test.ts',
      // Valid empty project until Todo 7 adds the built-CJS fixture.
      passWithNoTests: true,
    },
  ],
});
