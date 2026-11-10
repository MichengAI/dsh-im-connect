import assert from 'node:assert/strict';
import test from 'node:test';
import { ImEngine } from '../lib/engine/gateway.js';
import { MessageProgress } from '../lib/engine/message-progress.js';

// All session state and platform I/O are in memory; exercise the package engine.
function fixture(t, beginReply) {
  const id = 'offline-final-race';
  const chatId = '-100123:22';
  const record = { sessionId: id, channel: 'telegram', kind: 'group', chatId, title: 'test' };
  const store = { findSession: key => key === record.sessionId ? record : undefined,
    get: key => key === `telegram:group:${chatId}` ? record : undefined, list: () => [record] };
  const ctx = { on: () => () => {}, get: () => undefined };
  const sent = [];
  const logs = [];
  const engine = new ImEngine(ctx, store, { has: () => false }, {
    cwd: '.', provider: 'offline', model: 'offline', mergeTimeoutSecs: 1,
    agentPreset: 'standard', permissionPreset: 'read-only',
  }, line => logs.push(line));
  const channel = { id: 'telegram', label: 'offline', maxMessageLength: 4000,
    start() {}, stop() {}, setMessageHandler() {}, status: () => 'connected',
    send: async (_, text) => sent.push(text), ...(beginReply ? { beginReply } : {}) };
  engine.register(channel);
  const item = new MessageProgress(channel, { kind: 'group', chatId, userId: 'offline', messageId: 'm' }, ctx, () => {});
  engine.progress.begin(id, 'request', [item]);
  t.after(() => engine.dispose());
  const session = { id, snapshotEvents: () => [] };
  const emit = event => engine.onSessionEvent(session, event);
  return { engine, emit, sent, logs, channel, id, item, record };
}

const answer = '这条也收到了：**“那这条呢！”** ✅';
const final = { type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, step: 1,
  message: { role: 'assistant', content: [{ type: 'reasoning', text: '' }, { type: 'text', text: answer }] } } };
const end = { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } };
async function begin(emit) {
  await emit({ type: 'turn/start', data: { turn: 1 } });
  await emit({ type: 'user/message', surfaceOp: 'append', data: { id: 'request' } });
}

test('fast final survives turn/end while Telegram stream creation is pending', async t => {
  let release;
  const opened = new Promise(resolve => { release = resolve; });
  const finishes = [];
  const stream = { update: async () => {}, finish: async text => finishes.push(text), discard: async () => {} };
  const f = fixture(t, () => opened);
  await begin(f.emit);
  await f.emit({ type: 'assistant/chunk', data: { turn: 1, chunk: { type: 'text-delta', text: answer } } });
  // Host observers do not await delivery: final and end are committed back-to-back.
  const replyWork = f.emit(final);
  const endWork = f.emit(end);
  release(stream);
  await Promise.all([replyWork, endWork]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([...finishes, ...f.sent], [answer], `must deliver body exactly once, not empty fallback; logs=${JSON.stringify(f.logs)}`);
  assert.equal(f.item.state, 'success');
});

test('non-streamed final and repeated turn/end deliver only the answer', async t => {
  const f = fixture(t);
  await begin(f.emit);
  await Promise.all([f.emit(final), f.emit(end), f.emit(end)]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.sent, [answer]);
  assert.equal(f.item.state, 'success');
});

test('an actual empty turn still reports empty instead of fabricating content', async t => {
  const f = fixture(t);
  await begin(f.emit);
  await f.emit(end);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.sent.length, 1);
  assert.match(f.sent[0], /未返回可投递的结果/);
  assert.equal(f.item.state, 'ended');
});

test('pending status-only stream does not erase a non-streamed authoritative final', async t => {
  let release;
  const opening = new Promise(resolve => { release = resolve; });
  const finishes = [];
  const f = fixture(t, () => opening);
  f.channel.replyStatus = true;
  await begin(f.emit);
  await f.emit({ type: 'assistant/chunk', data: { turn: 1, chunk: { type: 'reasoning-delta', text: 'thinking' } } });
  const replyWork = f.emit(final);
  const endWork = f.emit(end);
  release({ update: async () => {}, setStatus: async () => {}, finish: async text => finishes.push(text), discard: async () => {} });
  await Promise.all([replyWork, endWork]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([...finishes, ...f.sent], [answer]);
  assert.equal(f.item.state, 'success');
});

test('true reset and rebind still invalidate a pending old reply', async t => {
  let release;
  const opening = new Promise(resolve => { release = resolve; });
  const finishes = [];
  const f = fixture(t, () => opening);
  await begin(f.emit);
  await f.emit({ type: 'assistant/chunk', data: { turn: 1, chunk: { type: 'text-delta', text: answer } } });
  const replyWork = f.emit(final);
  f.engine.streams.reset(`telegram:${f.record.chatId}`, f.id);
  f.record.sessionId = 'replacement-session';
  const endWork = f.emit(end);
  release({ update: async () => {}, finish: async text => finishes.push(text), discard: async () => {} });
  await Promise.all([replyWork, endWork]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([...finishes, ...f.sent], []);
});

test('old end cleanup does not discard a newer turn stream', async t => {
  let release;
  const finishGate = new Promise(resolve => { release = resolve; });
  const f = fixture(t, async () => ({ update: async () => {}, finish: async () => finishGate, discard: async () => {} }));
  await begin(f.emit);
  await f.emit({ type: 'assistant/chunk', data: { turn: 1, chunk: { type: 'text-delta', text: answer } } });
  const replyWork = f.emit(final);
  const endWork = f.emit(end);
  await f.emit({ type: 'turn/start', data: { turn: 2 } });
  const key = `telegram:${f.record.chatId}`;
  f.engine.streams.reset(key, f.id);
  let discarded = false;
  await f.engine.streams.onStatus(key, 'new turn', async () => ({ update: async () => {}, discard: async () => { discarded = true; } }), f.id);
  release();
  await Promise.all([replyWork, endWork]);
  assert.equal(discarded, false);
  assert.ok(f.engine.streams.peek(key, f.id));
});

test('turn/end observer does not block new turns while a platform send is pending', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture(t);
  await begin(f.emit);
  f.channel.send = () => gate;
  const reply = f.emit(final);
  await new Promise(resolve => setImmediate(resolve));
  let returned = false;
  const ending = f.emit(end).then(() => { returned = true; });
  await new Promise(resolve => setImmediate(resolve));
  try {
    assert.equal(returned, true, 'end observer must enqueue cleanup, not block the event producer');
  } finally {
    release();
    await Promise.all([reply, ending]);
  }
});

test('eager reply rejection is handled while an older finalization barrier waits', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture(t);
  await begin(f.emit);
  let calls = 0;
  f.engine.processSessionEvent = () => ++calls === 1 ? gate : Promise.reject(new Error('isolated-delivery-failure'));
  const first = f.emit(final);
  const second = f.emit(final);
  await new Promise(resolve => setImmediate(resolve));
  release();
  await Promise.all([first, second]);
  assert.ok(f.logs.some(line => line.includes('会话回复失败')));
});
