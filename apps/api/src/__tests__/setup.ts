import { beforeAll, vi } from 'vitest';
import * as path from 'path';
import * as dotenv from 'dotenv';

beforeAll(() => {
  // Load .env explicitly if it exists, though we'll mock most network stuff
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
  
  // Set predictable environment variables for testing
  process.env.CONTROL_CENTER_API_KEY = 'TEST_API_KEY';
  process.env.PAPERCLIP_BASE_URL = 'https://mock.paperclip.test';
  process.env.PAPERCLIP_API_KEY = 'TEST_PAPERCLIP_KEY';
  process.env.PAPERCLIP_EMAIL = 'test@example.com';
  process.env.PAPERCLIP_PASSWORD = 'password';
  process.env.VPS_API_BASE = 'http://mock.vps.test';
  process.env.VPS_API_KEY = 'TEST_VPS_KEY';
});
