import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramChannel } from '../lib/channels/telegram.js';
import { ReplyStreamHub } from '../lib/engine/reply-stream.js';
import { retryTelegram, isTelegramTransient } from '../lib/channels/telegram-retry.js';
import { ImEngine } from '../lib/engine/gateway.js';
const network = () => new TypeError('fetch failed', { cause: Object.assign(new Error('socket'), { code: 'ECONNRESET' }) });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
async function mock(run, intercept = () => undefined) {
  const original = globalThis.fetch, calls = [], logs = []; let id = 0;
  globalThis.fetch = async (url, init) => {
    const method = String(url).split('/').at(-1);
    const body = init.body instanceof FormData ? Object.fromEntries(init.body) : JSON.parse(init.body);
    const call = { method, body, init }; calls.push(call);
    const custom = await intercept(call, calls);
    if (custom) return custom;
    return response({ ok: true, result: { message_id: ++id } });
  };
  const channel = createTelegramChannel({ token: 'mock-token' }, l => logs.push(l));
  try { await run(channel, calls, logs); } finally { await channel.stop(); globalThis.fetch = original; }
}
for (const kind of ['status', 'text']) test(`take is atomic against queued ${kind} and next reply owns its message`, async () => {
  await mock(async (channel, calls) => {
    const hub = new ReplyStreamHub(), start = () => channel.beginReply('42:7'), key = 'tg:42:7';
    await hub.onTextDelta(key, 'first', start, 'session');
    const taking = hub.take(key, 'session');
    const next = kind === 'status' ? hub.onStatus(key, 'next step', start, 'session') : hub.onTextDelta(key, 'second', start, 'session');
    const first = await taking;
    await first.stream.finish('first final'); await next;
    const second = await hub.take(key, 'session');
    await second.stream.finish('second final');
    assert.equal(calls.filter(c => c.method === 'sendMessage').length, 2);
    const finals = calls.filter(c => c.method === 'editMessageText');
    assert.equal(new Set(finals.map(c => c.body.message_id)).size, 2);
    assert.ok(finals.some(c => JSON.stringify(c.body).includes('second final')));
    assert.ok(calls.filter(c => c.method === 'sendMessage').every(c => c.body.message_thread_id === 7));
  });
});
test('新建文字的网络结果未知时不自动重发', async () => {
  let n = 0;
  await mock(async (channel, calls, logs) => {
    await assert.rejects(channel.send('42:7', 'answer'));
    assert.equal(n, 1); assert.equal(calls.length, 1);
    assert.ok(logs.every(l => !l.includes('mock-token')));
  }, () => { if (++n === 1) throw network(); });
});
test('新建文件的网络结果未知时不自动重传', async () => {
  let n = 0;
  await mock(async (channel, calls) => {
    await assert.rejects(channel.sendFile('42:7', { name: 'result.txt', data: Buffer.from('payload') }));
    assert.equal(n, 1); assert.equal(calls.length, 1);
    assert.equal(await calls[0].body.document.text(), 'payload');
    assert.equal(calls[0].body.message_thread_id, '7');
  }, () => { if (++n === 1) throw network(); });
});
test('a slow healthy upload retains the original 120-second budget instead of restarting at 45 seconds', async () => {
  const originalTimeout = AbortSignal.timeout;
  // Scale only AbortSignal deadlines: a 60-second upload completes in 60ms.
  AbortSignal.timeout = milliseconds => originalTimeout(Math.max(1, Math.ceil(milliseconds / 1000)));
  try {
    await mock(async (channel, calls) => {
      await channel.sendFile('42', { name: 'slow.txt', data: Buffer.from('complete') });
      assert.equal(calls.length, 1);
    }, call => new Promise((resolve, reject) => {
      const aborted = () => { clearTimeout(timer); reject(call.init.signal.reason); };
      const timer = setTimeout(() => {
        call.init.signal.removeEventListener('abort', aborted);
        resolve(response({ ok: true, result: { message_id: 1 } }));
      }, 60);
      call.init.signal.addEventListener('abort', aborted, { once: true });
    }));
  } finally { AbortSignal.timeout = originalTimeout; }
});
test('HTML 503 在新建文字时保留送达未知且不重发', async () => {
  let n = 0;
  await mock(async (channel, calls) => { await assert.rejects(channel.send('42', 'answer')); assert.equal(n, 1); assert.equal(calls.length, 1); }, () => ++n === 1 ? new Response('unavailable', { status: 503 }) : undefined);
});
test('占位创建响应丢失时不自动再创建一条', async () => {
  let attempts = 0;
  await mock(async (channel, calls) => {
    await assert.rejects(channel.beginReply('42'));
    assert.equal(attempts, 1);
    assert.deepEqual(calls.map(c => c.method), ['sendMessage']);
  }, () => { attempts++; throw network(); });
});
test('已知消息的编辑遇到网络异常时重试同一消息', async () => {
  let edits = 0;
  await mock(async (channel, calls) => {
    const stream = await channel.beginReply('42');
    await stream.finish('最终正文');
    const requests = calls.filter(c => c.method === 'editMessageText');
    assert.equal(requests.length, 2);
    assert.equal(requests[0].body.message_id, requests[1].body.message_id);
    assert.equal(calls.filter(c => c.method === 'sendMessage').length, 1);
  }, c => { if (c.method === 'editMessageText' && ++edits === 1) throw network(); });
});
test('编辑结果未知后占位不可编辑时不再创建新消息', async () => {
  let edits = 0;
  await mock(async (channel, calls) => {
    const stream = await channel.beginReply('42');
    await assert.rejects(stream.finish('最终正文'));
    assert.equal(calls.filter(c => c.method === 'sendMessage').length, 1);
    assert.equal(calls.filter(c => c.method === 'editMessageText').length, 2);
  }, c => {
    if (c.method !== 'editMessageText') return;
    if (++edits === 1) throw network();
    return response({ ok: false, error_code: 400, description: "Bad Request: message can't be edited" }, 400);
  });
});
test('限流后创建结果未知时停止并保持未知', async () => {
  let attempts = 0;
  await mock(async (channel, calls) => {
    await assert.rejects(channel.send('42', '正文'), e => e.name !== 'DeliveryRejected');
    assert.equal(attempts, 2);
    assert.equal(calls.length, 2);
  }, () => { if (++attempts === 1) return response({ ok: false, error_code: 429, parameters: { retry_after: 1 } }, 429); throw network(); });
});
test('文件明确限流后使用完整的新 multipart 请求重试', async () => {
  let n = 0;
  await mock(async (channel, calls) => {
    await channel.sendFile('42:7', { name: 'a.txt', data: Buffer.from('内容') });
    assert.equal(n, 2);
    assert.notEqual(calls[0].init.body, calls[1].init.body);
    assert.equal(await calls[1].body.document.text(), '内容');
    assert.equal(calls[1].body.message_thread_id, '7');
  }, () => ++n === 1 ? response({ ok: false, error_code: 429, parameters: { retry_after: 1 } }, 429) : undefined);
});
for (const status of [400, 401, 403]) test(`permanent ${status} file error is not retried`, async () => {
  await mock(async (channel, calls) => {
    await assert.rejects(channel.sendFile('42', { name: 'a.txt', data: Buffer.from('a') })); assert.equal(calls.length, 1);
  }, () => response({ ok: false, error_code: status }, status));
});
test('pre-aborted file delivery never touches network', async () => {
  await mock(async (channel, calls) => {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(channel.sendFile('42', { name: 'a.txt', data: Buffer.from('a') }, controller.signal));
    assert.equal(calls.length, 0);
  });
});
test('abort during backoff stops retries', async () => {
  const controller = new AbortController();
  await mock(async (channel, calls) => {
    await assert.rejects(channel.sendFile('42', { name: 'a.txt', data: Buffer.from('a') }, controller.signal));
    assert.equal(calls.length, 1);
  }, () => { controller.abort(); throw network(); });
});
test('status-only tool steps reuse one placeholder and double finish fails honestly', async () => {
  await mock(async (channel, calls) => {
    const hub = new ReplyStreamHub(), start = () => channel.beginReply('42');
    await hub.onStatus('key', 'tool 1', start, 's'); await hub.onStatus('key', 'tool 2', start, 's');
    assert.equal(calls.length, 1);
    await hub.onTextDelta('key', 'body', start, 's');
    const { stream } = await hub.take('key', 's'); await stream.finish('done');
    const count = calls.length; await assert.rejects(stream.finish('done'), /closed/); assert.equal(calls.length, count);
  });
});
test('长回复后续分片被明确限流时只重试该分片', async () => {
  let failed = false;
  await mock(async (channel, calls) => {
    const stream = await channel.beginReply('42'); await stream.finish('a'.repeat(4000) + 'tail');
    assert.equal(calls.filter(c => c.method === 'editMessageText').length, 1);
    assert.equal(calls.filter(c => c.method === 'sendRichMessage').length, 2);
    assert.ok(calls.filter(c => c.method === 'sendRichMessage').every(c => c.body.rich_message.markdown === 'tail'));
  }, c => { if (c.method === 'sendRichMessage' && !failed) { failed = true; return response({ ok: false, error_code: 429, parameters: { retry_after: 1 } }, 429); } });
});
test('HTML 429 honors header retry-after and succeeds on retry', async () => {
  let n = 0;
  await mock(async channel => { await channel.send('42', 'answer'); assert.equal(n, 2); }, () => ++n === 1 ? new Response('rate limited', { status: 429, headers: { 'retry-after': '1' } }) : undefined);
});
test('edit rate limit beyond budget is not bypassed through plain or send fallback', async () => {
  await mock(async (channel, calls) => {
    const stream = await channel.beginReply('42');
    await assert.rejects(stream.finish('final'), /limited/);
    assert.deepEqual(calls.map(c => c.method), ['sendMessage', 'editMessageText']);
  }, c => c.method === 'editMessageText' ? response({ ok: false, error_code: 429, description: 'limited', parameters: { retry_after: 120 } }, 429) : undefined);
});
for (const status of [401, 403]) test(`permanent ${status} text error does not switch format to resend`, async () => {
  await mock(async (channel, calls) => {
    await assert.rejects(channel.send('42', 'answer')); assert.equal(calls.length, 1);
  }, () => response({ ok: false, error_code: status }, status));
});
test('stop during a pending final edit cannot trigger uncancelled fallback sends', async () => {
  let fail, started;
  const editing = new Promise(r => { started = r; });
  await mock(async (channel, calls) => {
    const stream = await channel.beginReply('42');
    const finish = stream.finish('final'); await editing;
    await channel.stop(); fail(new DOMException('cancelled', 'AbortError'));
    await assert.rejects(finish, /cancelled/);
    assert.deepEqual(calls.map(c => c.method), ['sendMessage', 'editMessageText']);
  }, c => c.method === 'editMessageText' ? new Promise((_, reject) => { fail = reject; started(); }) : undefined);
});
test('abort after entering backoff sleep cancels immediately without another attempt', async () => {
  const controller = new AbortController(); let entered, n = 0;
  const waiting = new Promise(r => { entered = r; });
  const pending = retryTelegram(async () => { n++; throw network(); }, { signal: controller.signal, edit: true, delaysMs: [60_000], log: () => entered() });
  await waiting; controller.abort(new DOMException('cancel waiting', 'AbortError'));
  await assert.rejects(pending, /cancel waiting/); assert.equal(n, 1);
});
for (const status of [401, 403]) test(`permanent ${status} final edit does not send fallback messages`, async () => {
  await mock(async (channel, calls) => {
    const stream = await channel.beginReply('42'); await assert.rejects(stream.finish('final'));
    assert.deepEqual(calls.map(c => c.method), ['sendMessage', 'editMessageText']);
  }, c => c.method === 'editMessageText' ? response({ ok: false, error_code: status }, status) : undefined);
});
test('429 from timer-driven edit remains enforced when finalization starts', async () => {
  let seen;
  const edited = new Promise(r => { seen = r; });
  await mock(async (channel, calls) => {
    const stream = await channel.beginReply('42'); await stream.update('body');
    await edited;
    await assert.rejects(stream.finish('final'), /limited/);
    assert.deepEqual(calls.map(c => c.method), ['sendMessage', 'editMessageText']);
  }, c => {
    if (c.method === 'editMessageText') {
      seen(); return response({ ok: false, error_code: 429, parameters: { retry_after: 120 } }, 429);
    }
  });
});
test('actual gateway outer retries cannot submit before adapter cooldown expires', async () => {
  await mock(async (channel, calls) => {
    const engine = Object.create(ImEngine.prototype);
    Object.assign(engine, { sendRetryDelaysMs: [0, 0, 0], disposed: false, recoveryScope: new AbortController(), log: () => {} });
    const result = await engine.sendChunk(channel, '42', 'answer', Date.now() + 1000);
    assert.equal(result.ok, false); assert.equal(calls.length, 1);
  }, () => response({ ok: false, error_code: 429, parameters: { retry_after: 120 } }, 429));
});
test('long reply with rate-limited continuation never replays confirmed prefix or later parts', async () => {
  await mock(async (channel, calls) => {
    const stream = await channel.beginReply('42');
    await assert.rejects(stream.finish('a'.repeat(4000) + 'b'.repeat(4000) + 'last'));
    assert.deepEqual(calls.map(c => c.method), ['sendMessage', 'editMessageText', 'sendRichMessage']);
    assert.equal(calls[2].body.rich_message.markdown, 'b'.repeat(4000));
  }, c => c.method === 'sendRichMessage' ? response({ ok: false, error_code: 429, parameters: { retry_after: 120 } }, 429) : undefined);
});
test('cancelling a stalled upload aborts its fetch without retrying', async () => {
  const controller = new AbortController(); let began;
  const uploading = new Promise(r => { began = r; });
  await mock(async (channel, calls) => {
    const pending = channel.sendFile('42', { name: 'a.txt', data: Buffer.from('a') }, controller.signal);
    await uploading; controller.abort(); await assert.rejects(pending); assert.equal(calls.length, 1);
  }, c => new Promise((_, reject) => { began(); c.init.signal.addEventListener('abort', () => reject(c.init.signal.reason), { once: true }); }));
});
test('retry helper stops at finite attempt limit and preserves original network error', async () => {
  let n = 0; const error = network();
  await assert.rejects(retryTelegram(async () => { n++; throw error; }, { edit: true, delaysMs: [0, 0, 0] }), e => e === error);
  assert.equal(n, 4);
});
test('retry helper respects retry_after beyond remaining budget without early resend', async () => {
  let n = 0; const error = Object.assign(new Error('rate limit'), { status: 429, retryAfterMs: 5000 });
  await assert.rejects(retryTelegram(async () => { n++; throw error; }, { delaysMs: [0], budgetMs: 1000 }), e => e === error);
  assert.equal(n, 1);
});
test('classification excludes permanent, arbitrary, TLS and explicit cancellation errors', () => {
  for (const status of [400, 401, 403, 404, 413]) assert.equal(isTelegramTransient({ status, cause: network() }), false);
  for (const error of [new Error('local bug'), new DOMException('cancelled', 'AbortError'), { code: 'CERT_HAS_EXPIRED' }, new TypeError('fetch failed', { cause: Object.assign(new Error('expired certificate'), { code: 'CERT_HAS_EXPIRED' }) })]) assert.equal(isTelegramTransient(error), false);
  for (const error of [network(), { status: 429 }, { status: 502 }, new DOMException('timed out', 'TimeoutError')]) assert.equal(isTelegramTransient(error), true);
});
test('sealed old stream can finish after next stream opens without touching its message', async () => {
  await mock(async (channel, calls) => {
    const hub = new ReplyStreamHub(), start = () => channel.beginReply('42');
    await hub.onTextDelta('k', 'first', start, 's');
    const first = await hub.take('k', 's');
    await hub.onTextDelta('k', 'second', start, 's');
    const second = await hub.take('k', 's');
    await second.stream.finish('second final'); await first.stream.finish('first final');
    const edits = calls.filter(c => c.method === 'editMessageText');
    assert.equal(edits.length, 2); assert.notEqual(edits[0].body.message_id, edits[1].body.message_id);
  });
});
test('concurrent takes never hand the same stream to two finishers', async () => {
  const hub = new ReplyStreamHub(); let seals = 0;
  const stream = { update: async () => {}, finish: async () => {}, seal: () => seals++ };
  await hub.onTextDelta('k', 'body', async () => stream, 's');
  const result = await Promise.all([hub.take('k', 's'), hub.take('k', 's')]);
  assert.equal(result.filter(r => r.stream === stream).length, 1); assert.equal(seals, 1);
});
test('reset while start is pending invalidates extracted stream and discards stale placeholder', async () => {
  const hub = new ReplyStreamHub(); let resolve, started;
  const began = new Promise(r => { started = r; }); let discarded = 0;
  const p = hub.onTextDelta('k', 'old', () => { started(); return new Promise(r => { resolve = r; }); }, 'old-session');
  await began;
  const taking = hub.take('k', 'old-session'); hub.reset('k');
  resolve({ update: async () => {}, finish: async () => {}, discard: async () => { discarded++; } });
  await p; assert.equal((await taking).invalidated, true); assert.equal(discarded, 1);
});
