import assert from 'node:assert/strict'
import test from 'node:test'
import { registerDeliveryTools } from '../lib/delivery-tools.js'

test('工具与 Skill 同生命周期，IM 入站和子 Agent 无法列出或操作本机投递账号', async () => {
  const tools = new Map()
  let skill
  let called = 0
  const ctx = {
    tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name) } },
    skills: { register(value) { skill = value; return () => { skill = undefined } } },
  }
  const manager = { deliveryAccounts() { called++; return [{ accountId: 'account1' }] }, deliveryTargets: () => ({ targets: [] }),
    sendDelivery: async () => ({ status: 'sent' }) }
  const dispose = registerDeliveryTools(ctx, manager)
  assert.equal(skill.name, 'im-send')
  assert.equal(tools.size, 4)
  const call = (id, origin) => ({ signal: new AbortController().signal, agent: { session: { id, header: { origin } } } })
  for (const caller of [call('im:telegram:dm:123'), call('child', 'subagent'), { signal: new AbortController().signal }]) {
    assert.equal((await tools.get('im_accounts').execute({}, caller)).error.code, 'caller-forbidden')
    assert.equal((await tools.get('im_send').execute({ accountId: 'account1', targetId: 't', text: 'x' }, caller)).error.code, 'caller-forbidden')
  }
  assert.equal(called, 0)
  assert.equal((await tools.get('im_accounts').execute({}, call('web-task'))).accounts[0].accountId, 'account1')
  assert.equal((await tools.get('im_targets').execute({ accountId: 'unknown' }, call('automation-run'))).error.code, 'delivery-disabled')
  dispose()
  assert.equal(tools.size, 0)
  assert.equal(skill, undefined)
})
