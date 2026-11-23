import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ImEngine } from '../lib/engine/gateway.js'
import { SessionMapStore } from '../lib/engine/session-store.js'
import { SeenStore } from '../lib/engine/seen-store.js'
import { sourceText, sourceBlock, replyBinding } from '../lib/engine/channel-context.js'

test('Telegram input carries compact sender and reply facts, without repeated routing data', async t => {
 const dir=mkdtempSync(join(tmpdir(),'im-source-pr-')); const ctx=new Context(); const messages=[]
 ctx.provide('agents'); ctx.set('agents',{get:()=>({followup:m=>messages.push(m)})})
 const store=new SessionMapStore(join(dir,'sessions.json')); store.upsert('tg:group:-100:42',{sessionId:'s',channel:'tg',kind:'group',chatId:'-100:42',title:'test',updatedAt:new Date().toISOString()})
 const engine=new ImEngine(ctx,store,new SeenStore(join(dir,'seen.json')),{cwd:dir,provider:'p',model:'m',agentPreset:'standard',mergeTimeoutSecs:1,permissionPreset:'',sendMode:'queue'},()=>{})
 const channel={id:'tg',platform:'telegram',label:'tg',maxMessageLength:4096,skipMerge:true,start(){},stop(){},status:()=> 'on',authorizes:()=>true,setMessageHandler(){},async send(){}}
 engine.register(channel); t.after(()=>{engine.dispose();rmSync(dir,{recursive:true,force:true})})
 await engine.handleInbound('tg',{chatId:'-100:42',kind:'group',text:'hello',userId:'7',username:'alice',platformMessageId:'101',messageId:'u1',channelContext:{platform:'telegram',chatId:'-100',threadId:42,senderDisplayName:'Alice',senderUsername:'alice',replyToMessageId:'88'}})
 assert.equal(messages.length,1); const text=messages[0].content[0].text; const match=/\[IM_SOURCE_DATA\]\n([^\n]+)\n\[\/IM_SOURCE_DATA\]\nhello/.exec(text); assert.ok(match)
 assert.deepEqual(JSON.parse(match[1]),{platform:'telegram',senderId:'7',senderDisplayName:'Alice',senderUsername:'alice',messageId:'101',replyToMessageId:'88'})
})

test('media-only Telegram input reaches Chat with source marker and image',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'im-source-media-')); const ctx=new Context(); const prompts=[]
 ctx.provide('agents'); ctx.provide('sessionController'); ctx.set('agents',{get:()=>({followup(){}})}); ctx.set('sessionController',{async prompt(request){prompts.push(request);return {accepted:true}}})
 const store=new SessionMapStore(join(dir,'sessions.json')); store.upsert('tg:group:-100:42',{sessionId:'s',channel:'tg',kind:'group',chatId:'-100:42',title:'test',updatedAt:new Date().toISOString()})
 const engine=new ImEngine(ctx,store,new SeenStore(join(dir,'seen.json')),{cwd:dir,provider:'p',model:'m',agentPreset:'standard',mergeTimeoutSecs:1,permissionPreset:'',sendMode:'queue'},()=>{})
 const channel={id:'tg',platform:'telegram',label:'tg',maxMessageLength:4096,skipMerge:true,start(){},stop(){},status:()=> 'on',authorizes:()=>true,setMessageHandler(){},async send(){}}
 engine.register(channel); t.after(()=>{engine.dispose();rmSync(dir,{recursive:true,force:true})})
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4z8AAAAMBAQCc479ZAAAAAElFTkSuQmCC','base64')
 await engine.handleInbound('tg',{chatId:'-100:42',kind:'group',text:'',userId:'7',platformMessageId:'101',messageId:'u1',media:[{kind:'image',data:png,mediaType:'image/png'}]})
 assert.equal(prompts.length,1); assert.equal(JSON.parse(prompts[0].content[0].text.split('\n')[1]).senderId,'7'); assert.ok(prompts[0].content.some(part=>part.type==='image'))
})
test('merged messages preserve text and UTF-16 attribution, suspicious route fails closed',()=>{
 const c={id:'tg',platform:'telegram'}; const a={chatId:'-100:42',kind:'group',text:'😀',userId:'7',platformMessageId:'11'}; const b={...a,text:'word',userId:'8',platformMessageId:'12'}
 const text=sourceText(c,{...b,text:'😀word'},[a,b]); const records=[...text.matchAll(/\[IM_SOURCE_DATA\]\n([^\n]+)/g)].map(x=>JSON.parse(x[1])); assert.deepEqual(records.map(x=>x.bodySpan),[{start:0,end:2,unit:'utf16'},{start:2,end:6,unit:'utf16'}]); assert.ok(text.endsWith('😀word'))
 const suspect=sourceText(c,{...b,text:'😀word'},[a,{...b,chatId:'-200:42'}]); assert.deepEqual(JSON.parse(suspect.split('\n')[1]),{platform:'telegram'}); assert.ok(suspect.endsWith('😀word'))
})
test('Telegram first name fallback is not presented as a username',()=>{
 const c={id:'tg',platform:'telegram'}; const m={chatId:'-100:42',text:'hello',userId:'7',username:'Alice',channelContext:{platform:'telegram',chatId:'-100',threadId:42,senderDisplayName:'Alice'}}
 const source=JSON.parse(sourceBlock(c,m).split('\n')[1]); assert.equal(source.senderDisplayName,'Alice'); assert.equal(source.senderUsername,undefined)
})
test('media marker and binding do not conflate Web input with Telegram origin',()=>{
 const c={id:'tg',platform:'telegram'}; const m={chatId:'-100:42',kind:'group',text:'',userId:'7',platformMessageId:'11'}; assert.equal(JSON.parse(sourceBlock(c,m).split('\n')[1]).senderId,'7'); assert.match(replyBinding(c,{chatId:m.chatId,kind:'group'}),/Web inputs may also occur/); assert.equal(replyBinding({...c,platform:'other'},{chatId:m.chatId,kind:'group'}),'')
})
