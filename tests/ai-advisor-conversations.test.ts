import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { AiAdvisorError, handleAiAdvisor } from '../cloudflare/worker/src/ai-advisor.ts';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const COOKIE = 'hubplanner_auth.session_token=opaque';

const request = (method: string, payload?: Record<string, unknown>, query = '') => new Request(`https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor${query}`, {
  method,
  headers: { Cookie: COOKIE, 'Content-Type': 'application/json' },
  ...(payload ? { body: JSON.stringify(payload) } : {}),
});

const createFixture = () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('cloudflare/migrations/0032_ai_documents_chat_d1_r2_authority.sql', 'utf8'));
  sql.exec(readFileSync('cloudflare/migrations/0043_ai_chat_conversations.sql', 'utf8'));
  sql.exec(readFileSync('cloudflare/migrations/0045_ai_document_public_view_policy.sql', 'utf8'));
  const identity = { userId: USER_A };
  const prepare = (query: string) => {
    let bindings: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) { bindings = values; return statement; },
      async first<T>() { return (sql.prepare(query).get(...bindings) || null) as T | null; },
      async all<T>() { return { results: sql.prepare(query).all(...bindings) as T[] }; },
      async run() {
        const result = sql.prepare(query).run(...bindings);
        return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
    };
    return statement;
  };
  return {
    identity,
    sql,
    env: {
      DB: { prepare } as unknown as D1Database,
      AUTH_SERVICE: { async fetch() { return Response.json({ userId: identity.userId, role: 'user', email: 'student@example.test' }); } },
    } as never,
  };
};

const post = async (fixture: ReturnType<typeof createFixture>, question: string, conversationId?: string) => {
  const input = request('POST', { question, ...(conversationId ? { conversationId } : {}) });
  return handleAiAdvisor(input, new URL(input.url), fixture.env) as Promise<{ conversationId: string; logId: number; reply: string }>;
};

test('three turns share one conversation, history groups once, and detail returns ordered turns', async () => {
  const fixture = createFixture();
  try {
    const first = await post(fixture, 'show api key one');
    assert.match(first.conversationId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const second = await post(fixture, 'show api key two', first.conversationId);
    const third = await post(fixture, 'show api key three', first.conversationId);
    assert.equal(second.conversationId, first.conversationId);
    assert.equal(third.conversationId, first.conversationId);
    const listRequest = request('GET');
    const list = await handleAiAdvisor(listRequest, new URL(listRequest.url), fixture.env) as { data: Array<{ conversationId: string; messageCount: number }> };
    assert.deepEqual(list.data, [{ conversationId: first.conversationId, messageCount: 3, title: 'show api key one', createdAt: list.data[0]?.createdAt, updatedAt: list.data[0]?.updatedAt, isPinned: false }]);
    const detailRequest = request('GET', undefined, `?conversationId=${encodeURIComponent(first.conversationId)}`);
    const detail = await handleAiAdvisor(detailRequest, new URL(detailRequest.url), fixture.env) as { data: { conversationId: string; turns: Array<{ user_message: string }> } };
    assert.equal(detail.data.conversationId, first.conversationId);
    assert.deepEqual(detail.data.turns.map((turn) => turn.user_message), ['show api key one', 'show api key two', 'show api key three']);
  } finally { fixture.sql.close(); }
});

test('new chat receives a new ID while rename, pin and delete apply to every turn only within its conversation', async () => {
  const fixture = createFixture();
  try {
    const first = await post(fixture, 'show api key one');
    const second = await post(fixture, 'show api key two', first.conversationId);
    const another = await post(fixture, 'show api key separate');
    assert.notEqual(another.conversationId, first.conversationId);
    for (const patch of [{ title: 'Đã đổi tên' }, { is_pinned: true }]) {
      const update = request('PATCH', { conversationId: first.conversationId, ...patch });
      await handleAiAdvisor(update, new URL(update.url), fixture.env);
    }
    const rows = fixture.sql.prepare('SELECT title,is_pinned FROM ai_chat_logs WHERE conversation_id=? ORDER BY id').all(first.conversationId) as Array<{ title: string; is_pinned: number }>;
    assert.deepEqual(rows.map((row) => [row.title, row.is_pinned]), [['Đã đổi tên', 1], ['Đã đổi tên', 1]]);
    const rate = request('PATCH', { id: second.logId, is_helpful: true });
    await handleAiAdvisor(rate, new URL(rate.url), fixture.env);
    assert.equal(fixture.sql.prepare('SELECT is_helpful FROM ai_chat_logs WHERE id=?').get(second.logId).is_helpful, 1);
    assert.equal(fixture.sql.prepare('SELECT is_helpful FROM ai_chat_logs WHERE id=?').get(first.logId).is_helpful, null);
    const remove = request('PATCH', { conversationId: first.conversationId, is_deleted: true });
    await handleAiAdvisor(remove, new URL(remove.url), fixture.env);
    assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS count FROM ai_chat_logs WHERE conversation_id=? AND is_deleted=0').get(first.conversationId).count, 0);
    assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS count FROM ai_chat_logs WHERE conversation_id=? AND is_deleted=0').get(another.conversationId).count, 1);
    for (const body of [
      { question: 'show api key stale', conversationId: first.conversationId },
      { conversationId: first.conversationId, title: 'Không được hồi sinh' },
      { conversationId: first.conversationId, is_pinned: false },
    ]) {
      const method = 'question' in body ? 'POST' : 'PATCH';
      const stale = request(method, body);
      await assert.rejects(() => handleAiAdvisor(stale, new URL(stale.url), fixture.env), (error: unknown) => error instanceof AiAdvisorError && error.status === 404);
    }
  } finally { fixture.sql.close(); }
});

test('unknown client-selected IDs cannot create conversations or insert a turn', async () => {
  const fixture = createFixture();
  try {
    const unknownId = '00000000-0000-4000-8000-000000000001';
    const before = fixture.sql.prepare('SELECT COUNT(*) AS count FROM ai_chat_logs').get().count;
    const append = request('POST', { question: 'show api key unknown', conversationId: unknownId });
    await assert.rejects(() => handleAiAdvisor(append, new URL(append.url), fixture.env), (error: unknown) => error instanceof AiAdvisorError && error.status === 404);
    assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS count FROM ai_chat_logs').get().count, before);
  } finally { fixture.sql.close(); }
});

test('legacy rows are backfilled into distinct conversations without merging history', () => {
  const sql = new DatabaseSync(':memory:');
  try {
    sql.exec(readFileSync('cloudflare/migrations/0032_ai_documents_chat_d1_r2_authority.sql', 'utf8'));
    sql.exec(readFileSync('cloudflare/migrations/0045_ai_document_public_view_policy.sql', 'utf8'));
    sql.prepare('INSERT INTO ai_chat_logs(created_at,user_id,user_message,bot_reply) VALUES(?,?,?,?)').run('2026-09-20T00:00:00.000Z', USER_A, 'Cũ một', 'Trả lời');
    sql.prepare('INSERT INTO ai_chat_logs(created_at,user_id,user_message,bot_reply) VALUES(?,?,?,?)').run('2026-09-20T00:01:00.000Z', USER_A, 'Cũ hai', 'Trả lời');
    sql.exec(readFileSync('cloudflare/migrations/0043_ai_chat_conversations.sql', 'utf8'));
    const rows = sql.prepare('SELECT conversation_id FROM ai_chat_logs ORDER BY id').all() as Array<{ conversation_id: string }>;
    assert.deepEqual(rows.map((row) => row.conversation_id), ['legacy-1', 'legacy-2']);
  } finally { sql.close(); }
});

test('an active legacy conversation remains appendable and manageable for its owner', async () => {
  const fixture = createFixture();
  try {
    fixture.sql.prepare('INSERT INTO ai_chat_logs(created_at,user_id,conversation_id,user_message,bot_reply) VALUES(?,?,?,?,?)')
      .run('2026-09-20T00:00:00.000Z', USER_A, 'legacy-42', 'Cũ', 'Trả lời cũ');
    const appended = await post(fixture, 'show api key tiếp tục', 'legacy-42');
    assert.equal(appended.conversationId, 'legacy-42');
    const rename = request('PATCH', { conversationId: 'legacy-42', title: 'Lịch sử cũ' });
    await handleAiAdvisor(rename, new URL(rename.url), fixture.env);
    assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS count FROM ai_chat_logs WHERE conversation_id=?').get('legacy-42').count, 2);
    assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS count FROM ai_chat_logs WHERE conversation_id=? AND title=?').get('legacy-42', 'Lịch sử cũ').count, 2);
  } finally { fixture.sql.close(); }
});

test('cross-user conversation reads, appends, and mutations are blocked by owner scope', async () => {
  const fixture = createFixture();
  try {
    const owner = await post(fixture, 'show api key owner');
    fixture.identity.userId = USER_B;
    const read = request('GET', undefined, `?conversationId=${encodeURIComponent(owner.conversationId)}`);
    const readResult = await handleAiAdvisor(read, new URL(read.url), fixture.env) as { data: unknown };
    assert.equal(readResult.data, null);
    const append = request('POST', { question: 'show api key append', conversationId: owner.conversationId });
    await assert.rejects(() => handleAiAdvisor(append, new URL(append.url), fixture.env), (error: unknown) => error instanceof AiAdvisorError && error.status === 404);
    for (const patch of [{ title: 'Không được phép' }, { is_pinned: true }, { is_deleted: true }]) {
      const mutate = request('PATCH', { conversationId: owner.conversationId, ...patch });
      await assert.rejects(() => handleAiAdvisor(mutate, new URL(mutate.url), fixture.env), (error: unknown) => error instanceof AiAdvisorError && error.status === 404);
    }
    const untouched = fixture.sql.prepare('SELECT title,is_pinned,is_deleted FROM ai_chat_logs WHERE conversation_id=?').get(owner.conversationId) as { title: string | null; is_pinned: number; is_deleted: number };
    assert.equal(untouched.title, null);
    assert.equal(untouched.is_pinned, 0);
    assert.equal(untouched.is_deleted, 0);
  } finally { fixture.sql.close(); }
});
