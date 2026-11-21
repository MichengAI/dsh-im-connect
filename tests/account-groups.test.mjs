import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { extractBlock } from './sidebar-lifecycle-harness.mjs'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const membership = source.slice(source.indexOf('    let requestHostSessionRefresh'), source.indexOf('    const api ='))
const targetCode = source.slice(source.indexOf('    function parseChannelSettingsRequest('), source.indexOf('    function pickSettingsSectionButton('))
const groupsCode = extractBlock(source, '    function channelGroupsFromSessionState(', '    function channelGroupCreatedAt(', '频道会话分组')
const workspaceCode = extractBlock(source, '    function syntheticChannelWorkspaceState(', '    function channelRealWorkspaceState(', '合成工作区')

test('多账号分组时 channelIdOfSession 保持平台标识别，accountIdOfSession 精确识别账号', () => {
  const f = new Function(`${membership}; return { updateChannelMembership, channelIdOfSession, accountIdOfSession };`)()
  f.updateChannelMembership([
    { id: 'feishu_dept_a', platform: 'feishu', label: '飞书 · 研发组', sessions: [{ sessionId: 's-dev-1' }, { sessionId: 's-dev-2' }] },
    { id: 'feishu_dept_b', platform: 'feishu', label: '飞书 · 客服组', sessions: [{ sessionId: 's-kf-1' }] },
    { id: 'weixin_main', platform: 'weixin', label: '微信', sessions: [{ sessionId: 's-wx-1' }] },
  ])

  // 会话行首彩色 Logo 依赖 channelIdOfSession 返回平台名
  assert.equal(f.channelIdOfSession('s-dev-1'), 'feishu')
  assert.equal(f.channelIdOfSession('s-dev-2'), 'feishu')
  assert.equal(f.channelIdOfSession('s-kf-1'), 'feishu')
  assert.equal(f.channelIdOfSession('s-wx-1'), 'weixin')

  // 分组与设置依赖 accountIdOfSession 返回具体账号
  assert.equal(f.accountIdOfSession('s-dev-1'), 'feishu_dept_a')
  assert.equal(f.accountIdOfSession('s-dev-2'), 'feishu_dept_a')
  assert.equal(f.accountIdOfSession('s-kf-1'), 'feishu_dept_b')
  assert.equal(f.accountIdOfSession('s-wx-1'), 'weixin_main')
})

test('前端按账号动态合成官方工作区分组，标题使用计算好的多账号备注', () => {
  const env = new Function(`
    ${membership}
    ${groupsCode}
    ${workspaceCode}
    const CHANNEL_WORKSPACE_PREFIX = "dsh-im-channel:";
    function channelWorkspaceId(id) { return CHANNEL_WORKSPACE_PREFIX + String(id || ""); }
    function channelGroupCreatedAt(group) { return "2026-10-20T00:00:00.000Z"; }
    const channelSyntheticWorkspaceCache = new WeakMap();
    return {
      updateChannelMembership,
      channelGroupsFromSessionState,
      syntheticChannelWorkspaceState,
    };
  `)()

  env.updateChannelMembership([
    { id: 'feishu_1', platform: 'feishu', label: '飞书 · 运维组', sessions: [{ sessionId: 'sess-1' }] },
    { id: 'feishu_2', platform: 'feishu', label: '飞书 · 销售组', sessions: [{ sessionId: 'sess-2' }] },
    { id: 'qq_solo', platform: 'qq', label: 'QQ', sessions: [{ sessionId: 'sess-3' }] },
  ])

  const sessionSource = {
    ids: ['sess-1', 'sess-2', 'sess-3'],
    byId: {
      'sess-1': { id: 'sess-1', updatedAt: '2026-10-20T10:00:00.000Z' },
      'sess-2': { id: 'sess-2', updatedAt: '2026-10-20T11:00:00.000Z' },
      'sess-3': { id: 'sess-3', updatedAt: '2026-10-20T12:00:00.000Z' },
    },
  }

  const t = (key) => key
  const groups = env.channelGroupsFromSessionState(sessionSource, t)
  assert.equal(groups.length, 3)

  const groupMap = new Map(groups.map((g) => [g.id, g]))
  assert.equal(groupMap.get('feishu_1')?.label, '飞书 · 运维组')
  assert.deepEqual(groupMap.get('feishu_1')?.sessions.map((s) => s.sessionId), ['sess-1'])

  assert.equal(groupMap.get('feishu_2')?.label, '飞书 · 销售组')
  assert.deepEqual(groupMap.get('feishu_2')?.sessions.map((s) => s.sessionId), ['sess-2'])

  assert.equal(groupMap.get('qq_solo')?.label, 'QQ')
  assert.deepEqual(groupMap.get('qq_solo')?.sessions.map((s) => s.sessionId), ['sess-3'])

  const workspaceState = env.syntheticChannelWorkspaceState({ items: [] }, groups, t)
  assert.equal(workspaceState.items.length, 3)
  assert.equal(workspaceState.items[0].id, 'dsh-im-channel:feishu_1')
  assert.equal(workspaceState.items[0].title, '飞书 · 运维组')
  assert.equal(workspaceState.items[1].id, 'dsh-im-channel:feishu_2')
  assert.equal(workspaceState.items[1].title, '飞书 · 销售组')
  assert.equal(workspaceState.items[2].id, 'dsh-im-channel:qq_solo')
  assert.equal(workspaceState.items[2].title, 'QQ')
})

test('右键分组菜单时精准解析目标账号并打开设置弹窗', () => {
  const { parseChannelSettingsRequest, resolveChannelSettingsTarget } = new Function(`
    ${targetCode};
    return { parseChannelSettingsRequest, resolveChannelSettingsTarget };
  `)()

  const channels = [
    {
      id: 'feishu',
      label: '飞书',
      accounts: [
        { id: 'feishu_acc_1', name: '研发组' },
        { id: 'feishu_acc_2', name: '测试组' },
      ],
    },
    {
      id: 'weixin',
      label: '微信',
      accounts: [
        { id: 'weixin_acc', name: '默认微信' },
      ],
    },
  ]

  // 多账号场景：通过 accountId 精确打开目标账号
  const target1 = resolveChannelSettingsTarget({ channelId: 'feishu', accountId: 'feishu_acc_2' }, channels)
  assert.deepEqual(target1, { channelId: 'feishu', accountId: 'feishu_acc_2' })

  // 单账号场景：即使只传 channelId 也自动定位到该唯一账号
  const target2 = resolveChannelSettingsTarget({ channelId: 'weixin' }, channels)
  assert.deepEqual(target2, { channelId: 'weixin', accountId: 'weixin_acc' })

  // 兼容老调用：直接把 accountId 作为 channelId 传入也能命中
  const target3 = resolveChannelSettingsTarget({ channelId: 'feishu_acc_1' }, channels)
  assert.deepEqual(target3, { channelId: 'feishu', accountId: 'feishu_acc_1' })
})
