import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const bundled = buildSync({stdin:{contents:"export { createTelegramChannel } from './src/channels/telegram.ts'; export { createTelegramThinkingControls } from './src/channels/telegram-thinking-controls.ts'",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent'})
const module = { exports:{} }
new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports)
const {createTelegramChannel,createTelegramThinkingControls}=module.exports
const options={previewMode:'latest',streamId:'budget-stream',isViewCurrent:()=>true}
const flush=()=>new Promise(resolve=>setImmediate(resolve))
const rejected=()=>Object.assign(new Error('rate limited'),{status:429,rejected:true})

test('latest thinking skips depleted group budget promptly and next snapshot reuses message',async t=>{
  let now=Date.now(); const calls=[]
  t.mock.method(Date,'now',()=>now)
  t.mock.method(globalThis,'fetch',async (url,init)=>{
    const method=String(url).split('/').pop(),body=JSON.parse(init.body);calls.push({method,body})
    return Response.json({ok:true,result:method==='sendMessage'?{message_id:1}:true})
  })
  const channel=createTelegramChannel({token:'synthetic-budget-test'},()=>{})
  let pending
  try {
    for(let i=0;i<4;i++) await channel.sendThinking('-991','snapshot '+i,options)
    assert.equal(calls.length,4)
    pending=channel.sendThinking('-991','dropped snapshot',options)
    let timer
    const outcome=await Promise.race([pending.then(()=> 'done',()=> 'rejected'),new Promise(resolve=>{timer=setTimeout(()=>resolve('waiting'),80)})]).finally(()=>clearTimeout(timer))
    assert.equal(outcome,'done','decorative thinking must not wait essential 15s budget or poison the view')
    assert.equal(calls.length,4)
    now+=5000
    await channel.sendThinking('-991','latest recovered',options)
    assert.equal(calls.length,5)
    assert.equal(calls.at(-1).method,'editMessageText')
    assert.equal(calls.at(-1).body.message_id,1)
    assert.match(calls.at(-1).body.text,/latest recovered/)
  } finally { await channel.stop(); if(pending)await pending.catch(()=>{}) }
})

test('explicit creation 429 drops only one frame and later creation can recover',async()=>{
  const calls=[];let first=true
  const controls=createTelegramThinkingControls(async (method,body)=>{
    calls.push({method,body});if(first){first=false;throw rejected()};return {message_id:7}
  },chatId=>({chatId}),()=>{})
  try {
    await assert.doesNotReject(controls.publish('1','first rejected',options))
    await controls.publish('1','latest accepted',options)
    assert.equal(calls.length,2)
    assert.equal(calls.at(-1).method,'sendMessage')
    assert.match(calls.at(-1).body.text,/latest accepted/)
  }finally{controls.clear()}
})

test('final edit 429 preserves completed view and callback can recover later',async()=>{
  const calls=[];let rejectEdit=true
  const controls=createTelegramThinkingControls(async(method,body)=>{
    calls.push({method,body});if(method==='editMessageText'&&rejectEdit){rejectEdit=false;throw rejected()};return {message_id:9}
  },chatId=>({chatId}),()=>{})
  try{
    await controls.publish('1','old\na\nb\nc',options)
    const token=calls[0].body.reply_markup.inline_keyboard[0][0].callback_data
    await assert.doesNotReject(controls.publish('1','earlier\nlatest1\nlatest2\nlatest3',{...options,final:true}))
    assert.equal(controls.consume({data:token,message:{message_id:9,chat:{id:1}}}),true)
    await flush();await flush()
    assert.equal(calls.length,3)
    assert.equal(calls.at(-1).body.message_id,9)
    assert.match(calls.at(-1).body.text,/earlier.*latest1.*latest2.*latest3/s)
  }finally{controls.clear()}
})
