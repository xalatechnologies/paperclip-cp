import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  syncAgents,
  syncRoutines,
  syncGoalsFromPaperclip,
  pushPendingGoals,
} from '../sync-engine';
import { convex, callInternalMutation } from '../convex-client';

// Mock the Convex client
vi.mock('../convex-client', () => ({
  convex: {
    mutation: vi.fn(),
    query: vi.fn(),
  },
  convexAdmin: {
    mutation: vi.fn(),
    query: vi.fn(),
  },
  callInternalMutation: vi.fn(),
  api: {
    agents: { heartbeat: 'api:agents:heartbeat' },
    goals: { listPendingPush: 'api:goals:listPendingPush' },
    memory: { listByAgent: 'api:memory:listByAgent' },
  },
  internal: {
    routines: { upsertFromVps: 'internal:routines:upsertFromVps' },
    goals: { upsertFromPaperclip: 'internal:goals:upsertFromPaperclip', markPushed: 'internal:goals:markPushed' },
  },
}));

describe('Sync Engine', () => {
  let fetchMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.spyOn(global, 'fetch');
  });

  it('syncAgents handles network failures gracefully', async () => {
    fetchMock.mockRejectedValue(new Error('Network failure'));
    const result = await syncAgents();
    expect(result).toBe(0);
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  it('syncAgents fetches and pushes to Convex', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        agents: [
          { id: 'agent-1', status: 'active', name: 'Agent 1' },
          { id: 'agent-2', status: 'idle', name: 'Agent 2' },
        ],
      }),
    });

    const result = await syncAgents();
    expect(result).toBe(2);
    expect(convex.mutation).toHaveBeenCalledTimes(2);
  });

  it('syncGoalsFromPaperclip processes goals', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        goals: [
          { id: 'goal-1', title: 'Goal 1', status: 'planned' },
        ],
      }),
    });

    const result = await syncGoalsFromPaperclip();
    expect(result).toBe(1);
    expect(callInternalMutation).toHaveBeenCalledWith(
      'internal:goals:upsertFromPaperclip',
      expect.objectContaining({
        goals: expect.arrayContaining([
          expect.objectContaining({ paperclip_goal_id: 'goal-1' }),
        ]),
      })
    );
  });

  it('pushPendingGoals posts to Paperclip and marks pushed', async () => {
    // Mock convex.query to return a pending goal
    (convex.query as any).mockResolvedValue([
      { _id: 'convex-goal-id', title: 'New Goal', status: 'planned' },
    ]);

    // Mock fetch to simulate Paperclip API response
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'paperclip-goal-123' }),
    });

    const result = await pushPendingGoals();
    expect(result).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/goals'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(callInternalMutation).toHaveBeenCalledWith(
      'internal:goals:markPushed',
      expect.objectContaining({
        _id: 'convex-goal-id',
        paperclip_goal_id: 'paperclip-goal-123',
      })
    );
  });
});
