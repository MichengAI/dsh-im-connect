/** 解析 IM 会话要用的模型，禁止把空字符串传给 agents.create。 */
export function resolveImAgentOptions(input: {
  provider?: string
  model?: string
  fallback?: { provider?: string; model?: string }
}): { provider: string; model: string } {
  const provider = input.provider?.trim() || input.fallback?.provider?.trim() || ''
  const model = input.model?.trim() || input.fallback?.model?.trim() || ''
  if (!provider || !model) {
    throw new Error('当前 Host 没有默认模型。请先在网页里选好模型，或在 IM 助理配置里填写 provider 和 model。')
  }
  return { provider, model }
}
