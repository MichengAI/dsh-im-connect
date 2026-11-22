import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createChannelAdapter } from '../lib/channels/factory.js'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
async function fixture(t, { events = [{type:'turn/start', data:{turn:7}}, {type:'user/message',data:{id:'request'}}], entry = {}, allow = true, second = false, blocked = false, stale = false, historyMode = 'snapshot' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'question-actor-'))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  store.upsert('account:group:chat', {sessionId:'session',channel:'account',kind:'group',chatId:'chat',title:'test',updatedAt:new Date().toISOString()})
  const ctx = {on(){return () => {}},get(){}}
  const make = () => new ImEngine(ctx,store,new SeenStore(join(dir,'seen.json')), {cwd:dir,provider:'p',model:'m',agentPreset:'',mergeTimeoutSecs:1,permissionPreset:''},()=>{},undefined,undefined,undefined,undefined,join(dir,'delivery.json'))
  const first = make()
  first.deferred.begin('request', entry.sessionId ?? 'session', entry.channelId ?? 'account', {chatId:entry.chatId ?? 'chat',kind:entry.kind ?? 'group',userId:entry.userId ?? 'alice',text:''})
  if (entry.turn !== undefined) first.deferred.patch('request',{turn:entry.turn})
  if (second) first.deferred.begin('request2','session','account',{chatId:'chat',kind:'group',userId:'bob',text:''})
  if (blocked) first.deferred.block('account')
  first.dispose()
  const engine = make(), cards = [], sent = []
  const channel = createChannelAdapter('telegram', {token:'offline-fixture'}, () => {}, dir, {accountId:'account'})
  channel.send = async (_chat,text)=>sent.push(text)
  channel.sendChoices = async (_msg,text,buttons)=>cards.push({text,buttons})
  channel.authorizes = id => id === 'alice' ? allow : id === 'bob'
  channel.sendAction = undefined
  channel.stopAction = undefined
  engine.register(channel)
  if (allow) engine.addAllowed('account','alice')
  engine.addAllowed('account','bob')
  if (stale) { engine.sessionActors.set('session','bob'); engine.chatActors.set('account:group:chat','bob') }
  t.after(()=>{engine.dispose();rmSync(dir,{recursive:true,force:true})})
  const history = historyMode === 'throw' ? {snapshotEvents:()=>{throw new Error('unavailable')}} : historyMode === 'events' ? {events} : historyMode === 'legacy' ? {} : {snapshotEvents:()=>events}
  const pending = engine.onUserQuestions({agent:{session:{id:'session',...history}},questions:[{id:'q',question:'Choose',options:[{label:'A'},{label:'B'}]}]},async()=>assert.fail('fallback'))
  void pending.catch(()=>{})
  for(let i=0;i<100 && !engine.questions.isReady('session');i++) await tick()
  assert.equal(engine.questions.isReady('session'),true)
  return {engine,cards,sent,pending}
}

test('reconstructed engine restores exact active requester and accepts only their button',async t=>{
  const f = await fixture(t)
  assert.equal(f.cards.length,1,'native question buttons must be delivered')
  const token = f.cards[0].buttons[1].token
  await f.engine.handleInbound('account',{chatId:'chat',kind:'group',userId:'bob',text:'',addressed:true,actionToken:token})
  assert.equal(f.engine.questions.isReady('session'),true)
  await f.engine.handleInbound('account',{chatId:'chat',kind:'group',userId:'alice',text:'',addressed:true,actionToken:token})
  assert.deepEqual(await f.pending,{answers:[{id:'q',selected:['B']}]})
})

test('current request overrides stale session and chat actors', async t => {
  const f = await fixture(t, {stale:true})
  assert.equal(f.cards.length,1)
  const token = f.cards[0].buttons[1].token
  await f.engine.handleInbound('account',{chatId:'chat',kind:'group',userId:'bob',text:'',addressed:true,actionToken:token})
  assert.equal(f.engine.questions.isReady('session'),true,'stale actor cannot answer')
  await f.engine.handleInbound('account',{chatId:'chat',kind:'group',userId:'alice',text:'',addressed:true,actionToken:token})
  assert.deepEqual(await f.pending,{answers:[{id:'q',selected:['B']}]})
})

test('ambiguous current request does not use stale actors', async t => {
  const f = await fixture(t,{stale:true,second:true,events:[{type:'turn/start',data:{turn:7}},{type:'user/message',data:{id:'request'}},{type:'user/message',data:{id:'request2'}}]})
  assert.equal(f.cards.length,0)
  assert.equal(f.sent.length,1)
})

for (const [name, config] of Object.entries({
  'snapshot error':{historyMode:'throw'},
  'empty snapshot':{events:[]},
  'incomplete snapshot':{events:[{type:'turn/start',data:{turn:7}}]},
  'empty events':{historyMode:'events',events:[]},
})) test(`history unavailable ignores stale actor: ${name}`, async t => {
  const f=await fixture(t,{...config,stale:true})
  assert.equal(f.cards.length,0)
  assert.equal(f.sent.length,1)
})
test('unknown history keeps existing text-answer behavior without stale restriction', async t => {
  const f=await fixture(t,{events:[],stale:true})
  await f.engine.handleInbound('account',{chatId:'chat',kind:'group',userId:'alice',text:'1',addressed:true})
  assert.deepEqual(await f.pending,{answers:[{id:'q',selected:['A']}]})
})
test('legacy host without history API retains actor compatibility', async t => {
  const f=await fixture(t,{historyMode:'legacy',stale:true})
  assert.equal(f.cards.length,1)
})

test('blocked journal identity restores buttons without unblocking delivery', async t => {
  const f = await fixture(t, {blocked:true,entry:{turn:7}})
  assert.equal(f.cards.length,1,'blocked journal must still identify active requester')
  assert.equal(f.engine.deferred.list()[0].status,'blocked')
  await f.engine.handleInbound('account',{chatId:'chat',kind:'group',userId:'alice',text:'',addressed:true,actionToken:f.cards[0].buttons[0].token})
  assert.deepEqual(await f.pending,{answers:[{id:'q',selected:['A']}]})
  assert.equal(f.engine.deferred.list()[0].status,'blocked')
})

test('source.rpcId identifies the active request', async t => {
  const f = await fixture(t, {events:[{type:'turn/start',data:{turn:7}},{type:'user/message',data:{id:'message',source:{rpcId:'request'}}}]})
  assert.equal(f.cards.length,1)
})

for (const [name, config] of Object.entries({
  'ambiguous users':{second:true,events:[{type:'turn/start',data:{turn:7}},{type:'user/message',data:{id:'request'}},{type:'user/message',data:{id:'request2'}}]},
  'previous turn':{events:[{type:'turn/start',data:{turn:6}},{type:'user/message',data:{id:'request'}},{type:'turn/end',data:{turn:6}},{type:'turn/start',data:{turn:7}}]},
  'wrong session':{entry:{sessionId:'other'}}, 'wrong channel':{entry:{channelId:'other'}}, 'wrong chat':{entry:{chatId:'other'}}, 'wrong kind':{entry:{kind:'dm'}}, 'wrong turn':{entry:{turn:8}}, 'unauthorized':{allow:false}, 'no history':{events:[]}, 'ended turn':{events:[{type:'turn/start',data:{turn:7}},{type:'user/message',data:{id:'request'}},{type:'turn/end',data:{turn:7}}]}, 'other request':{events:[{type:'turn/start',data:{turn:7}},{type:'user/message',data:{id:'other'}}]},
})) test(`does not guess actor: ${name}`,async t=>{const f=await fixture(t,config);assert.equal(f.cards.length,0);assert.equal(f.sent.length,1)})

test('dm session preserves choice buttons even when session history has no matched journal entry', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'question-dm-actor-'))
  const store = new SessionMapStore(join(dir, 'sessions.json'))
  store.upsert('account:dm:dm-chat', { sessionId: 'dm-session', channel: 'account', kind: 'dm', chatId: 'dm-chat', title: 'test-dm', updatedAt: new Date().toISOString() })
  const ctx = { on() { return () => {} }, get() {} }
  const engine = new ImEngine(ctx, store, new SeenStore(join(dir, 'seen.json')), { cwd: dir, provider: 'p', model: 'm', agentPreset: '', mergeTimeoutSecs: 1, permissionPreset: '' }, () => {}, undefined, undefined, undefined, undefined, join(dir, 'delivery.json'))
  const cards = [], sent = []
  const channel = createChannelAdapter('telegram', { token: 'offline-fixture' }, () => {}, dir, { accountId: 'account' })
  channel.send = async (_chat, text) => sent.push(text)
  channel.sendChoices = async (_msg, text, buttons) => cards.push({ text, buttons })
  channel.authorizes = () => true
  channel.sendAction = undefined
  channel.stopAction = undefined
  engine.register(channel)
  engine.addAllowed('account', 'dm-chat')
  t.after(() => { engine.dispose(); rmSync(dir, { recursive: true, force: true }) })

  // 会话有历史，但没有当前请求的匹配 journal 记录
  const events = [{ type: 'turn/start', data: { turn: 1 } }, { type: 'user/message', data: { id: 'unmatched-id' } }]
  const pending = engine.onUserQuestions({
    agent: { session: { id: 'dm-session', snapshotEvents: () => events } },
    questions: [{ id: 'q', question: 'Choose', options: [{ label: 'A' }, { label: 'B' }] }],
  }, async () => assert.fail('fallback'))
  void pending.catch(() => {})

  for (let i = 0; i < 100 && !engine.questions.isReady('dm-session'); i++) await tick()
  assert.equal(engine.questions.isReady('dm-session'), true)
  // 私聊场景下即便无 journal 匹配，也必须兜底将 buttons 发出，不能退化为纯文本
  assert.equal(cards.length, 1, 'DM question must deliver choice buttons')
  assert.equal(sent.length, 0)
})
