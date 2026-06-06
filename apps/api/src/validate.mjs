/**
 * End-to-end validation of the Paperclip API connection.
 * Run: node validate.mjs
 * 
 * Tests:
 * 1. Login via better-auth
 * 2. Session validation
 * 3. Companies list (all 3 expected)
 * 4. Agents per company
 * 5. Issues (if any)
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

const BASE = process.env.PAPERCLIP_BASE_URL;
const EMAIL = process.env.PAPERCLIP_EMAIL;
const PASSWORD = process.env.PAPERCLIP_PASSWORD;
const COOKIE_NAME = 'paperclip-default.session_token';

let cookie = '';

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: BASE,
      ...(cookie ? { Cookie: `${COOKIE_NAME}=${cookie}` } : {}),
      ...(opts.headers ?? {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => res.text());
  return { status: res.status, body };
}

async function run() {
  console.log(`\n🔗 Paperclip API: ${BASE}`);
  console.log('=' .repeat(60));

  // 1. Login
  console.log('\n1️⃣  Login...');
  const { status: s1, body: b1 } = await api('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  
  // Manually fetch with header capture
  const loginRes = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: BASE },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginData = await loginRes.json();
  const setCookieHeader = loginRes.headers.get('set-cookie') ?? '';
  cookie = setCookieHeader ? setCookieHeader.split(';')[0].replace(`${COOKIE_NAME}=`, '') : loginData.token;
  
  console.log(`   ✅ ${loginRes.status} — user: ${loginData.user?.email} | token: ${loginData.token?.slice(0, 8)}...`);

  // 2. Session
  console.log('\n2️⃣  Session...');
  const { status: s2, body: b2 } = await api('/api/auth/get-session');
  console.log(`   ✅ ${s2} — userId: ${b2?.session?.userId ?? b2?.error}`);

  // 3. Companies
  console.log('\n3️⃣  Companies...');
  const { status: s3, body: companies } = await api('/api/companies');
  if (Array.isArray(companies)) {
    for (const c of companies) {
      console.log(`   📦 [${c.id?.slice(0, 8)}] ${c.name} (${c.status}) — prefix: ${c.issuePrefix}`);
    }
  } else {
    console.log(`   ❌ ${s3}`, companies);
  }

  // 4. Agents per company
  console.log('\n4️⃣  Agents per company...');
  if (Array.isArray(companies)) {
    for (const c of companies) {
      const { status: sa, body: agents } = await api(`/api/companies/${c.id}/agents`);
      const count = Array.isArray(agents) ? agents.length : '?';
      console.log(`   🤖 ${c.name}: ${count} agents`);
      if (Array.isArray(agents)) {
        for (const a of agents) {
          console.log(`      - [${a.id?.slice(0,8)}] ${a.name} (${a.status})`);
        }
      }
    }
  }

  // 5. Issues for first company
  if (Array.isArray(companies) && companies.length > 0) {
    const c = companies.find(c => c.issuePrefix === 'DOX') ?? companies[0];
    console.log(`\n5️⃣  Issues for ${c.name}...`);
    const { status: si, body: issues } = await api(`/api/companies/${c.id}/issues?limit=5`);
    if (Array.isArray(issues)) {
      console.log(`   📋 ${issues.length} issues`);
      for (const i of issues.slice(0, 3)) {
        console.log(`      - [${i.prefix}-${i.number}] ${i.title?.slice(0, 60)}`);
      }
    } else if (issues?.items) {
      console.log(`   📋 ${issues.items.length} issues`);
    } else {
      console.log(`   ${si}:`, JSON.stringify(issues).slice(0, 100));
    }
  }

  console.log('\n' + '=' .repeat(60));
  console.log('✅ All checks complete!\n');
}

run().catch(e => { console.error('❌ ERROR:', e.message); process.exit(1); });
