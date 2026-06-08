import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load the root .env file so tests have access to the credentials
dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:3030',
    trace: 'on-first-retry',
    // Set a longer timeout for navigation since we're using dev server
    navigationTimeout: 15000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run the local dev server before starting the tests
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3030',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
