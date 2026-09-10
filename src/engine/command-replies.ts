import { replyText } from './command-locale.js'
/** 命令回复的文字排版与扩展命令指引；不推断宿主执行结果。 */
export function oneLine(value: string, limit = 160): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > limit ? text.slice(0, limit) + '…' : text
}

export function related(...items: string[]): string { return items.some(Boolean) ? '\n\n' + items.filter(Boolean).join('\n') : '' }

export const extensionHelp = (): Record<string, string> => ({
  compact: replyText("压缩较早上下文：/compact"),
  goal: replyText("管理长期目标：/goal；暂停：/goal pause；恢复：/goal resume"),
  plan: replyText("进入计划模式：/plan；退出：/plan off"),
  permission: replyText("查看当前权限及可选项：/permission"),
  feedback: replyText("记录会话反馈：/feedback 反馈内容"),
  simplify: replyText("提交代码简化审查：/simplify"),
  export: replyText("需在网页 Chat 中导出，IM 暂不回传文件"),
})

export function extensionReply(command: string, result: { kind: string; text?: string }, goal?: { phase?: string; activation?: string }): string {
  // 宿主自然语言不是稳定协议，保留正文及反馈共享披露，不按英文子串猜测成功。
  const body = result.text?.trim() ? result.text : (result.kind === 'success' ? replyText("命令已返回，但未提供结果说明。请在网页核对当前状态。") : replyText("命令执行失败，未提供具体原因。请在网页检查后重试。"))
  const tips: Record<string, string[]> = {
    compact: [replyText("最近记录：/history"), replyText("查看运行状态：/status")],
    permission: [replyText("查看可选权限：/permission"), replyText("切换方式：/permission 权限ID")],
    plan: [replyText("进入计划模式：/plan"), replyText("退出计划模式：/plan off"), replyText("查看任务状态：/status")],
    feedback: [replyText("补充反馈：/feedback 补充内容"), replyText("查看最近对话：/history")],
    simplify: [replyText("查看状态：/status"), replyText("补充要求：/steer 保留现有接口")],
    goal: goal?.phase === 'active'
      ? [goal.activation === 'armed' ? replyText("暂停目标：/goal pause") : replyText("恢复推进：/goal resume"), replyText("修改目标：/goal edit 新目标"), replyText("查看进度：/goal")]
      : goal?.phase === 'paused' || goal?.phase === 'blocked'
        ? [replyText("恢复目标：/goal resume"), replyText("修改目标：/goal edit 新目标"), replyText("清除目标：/goal clear")]
        : [replyText("查看目标：/goal"), replyText("设置目标：/goal 目标内容")],
  }
  if (!extensionHelp()[command]) return body
  return `/${command} · ${result.kind === 'success' ? replyText("返回结果") : replyText("未能完成")}\n${body}` + related(...(tips[command] || []))
}
