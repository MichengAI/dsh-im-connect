import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
const updates = [], messages = [], calls = []
let nextUpdate = 1, nextMessage = 1
const json = (res, value) => { res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify(value)) }
const server = createServer(async (req,res) => {
  const path = new URL(req.url,'http://localhost').pathname
  let raw = ''; for await (const chunk of req) raw += chunk
  const body = raw ? JSON.parse(raw) : {}
  if (path === '/test/incoming') {
    updates.push({update_id:nextUpdate++, message:{message_id:nextMessage++,date:Math.floor(Date.now()/1000),chat:{id:123,type:'private'},from:{id:456,username:'e2e_user',first_name:'E2E'},text:body.text}})
    return json(res,{ok:true})
  }
  if (path === '/test/messages') return json(res,{messages,calls})
  if (path === '/v1/models') return json(res,{object:'list',data:[{id:'e2e-model',object:'model',created:0,owned_by:'local-test'}]})
  if (path === '/v1/chat/completions') {
    const reply = 'E2E 助手已收到消息并完成回复。'
    calls.push({kind:'model',messages:body.messages?.length,stream:body.stream})
    if (!body.stream) return json(res,{id:'e2e',object:'chat.completion',created:0,model:'e2e-model',choices:[{index:0,message:{role:'assistant',content:reply},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}})
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'})
    const event = (delta,finish_reason) => ({id:'e2e',object:'chat.completion.chunk',created:0,model:'e2e-model',choices:[{index:0,delta,finish_reason}]})
    res.write('data: '+JSON.stringify(event({role:'assistant',content:reply},null))+'\n\n')
    res.end('data: '+JSON.stringify(event({},'stop'))+'\n\ndata: [DONE]\n\n')
    return
  }
  const method = path.split('/').at(-1)
  if (method === 'getUpdates') {
    if (!updates.length) await new Promise(resolve=>setTimeout(resolve,500))
    return json(res,{ok:true,result:updates.splice(0)})
  }
  if (method === 'getWebhookInfo') return json(res,{ok:true,result:{url:'',pending_update_count:0}})
  if (method === 'getMe') return json(res,{ok:true,result:{id:999,is_bot:true,first_name:'E2E Bot',username:'im_regression_bot'}})
  if (method === 'sendMessage' || method === 'editMessageText') {
    const entry = {message_id:body.message_id??nextMessage++,chat:{id:body.chat_id},text:body.text}
    messages.push({method,...entry})
    return json(res,{ok:true,result:entry})
  }
  if (method === 'sendChatAction' || method === 'deleteWebhook') return json(res,{ok:true,result:true})
  calls.push({kind:'unhandled',path})
  res.writeHead(404);res.end('unhandled test endpoint')
})
server.listen(9853,'127.0.0.1',()=>writeFileSync(join(process.argv[2],'mock-port.txt'),String(server.address().port)))