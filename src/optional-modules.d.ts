declare module '@larksuiteoapi/node-sdk'
declare module '@wecom/aibot-node-sdk'
declare module 'dingtalk-stream'
declare module 'qrcode'
declare module '@deepseek-ai/dsh-sandbox-policy' {
  export function setSandboxMode(session: unknown, mode: 'read-only' | 'workspace-write' | 'danger-full-access'): void
}
declare module '@deepseek-ai/dsh-agent' {
  export function installModelSelection(agentCtx: unknown, selection: {
    current: { provider: string; model: string; reasoningEffort?: string }
    assembled: undefined
  }): void
}
