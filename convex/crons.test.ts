import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { anyApi } from 'convex/server';
// We would ideally import internal too, but tests often use anyApi for internals
// Or we can just test the public mutations

test('agent heartbeat updates status and last_seen', async () => {
  const t = convexTest(schema);
  
  // Try to heartbeat a non-existent agent
  await t.mutation(api.agents.heartbeat, {
    paperclip_agent_id: 'agent-999',
    status: 'active',
    last_seen: new Date().toISOString(),
    paperclip_company_id: 'company-1',
    metadata: '{"name":"Test Agent"}',
  });

  // Verify it was created
  const statuses = await t.query(api.agents.listStatuses, {});
  expect(statuses).toHaveLength(1);
  expect(statuses[0].paperclip_agent_id).toBe('agent-999');
  expect(statuses[0].status).toBe('active');
  expect(statuses[0].paperclip_company_id).toBe('company-1');
  
  // Verify metadata extraction
  const md = JSON.parse(statuses[0].metadata ?? '{}');
  expect(md.name).toBe('Test Agent');
});
