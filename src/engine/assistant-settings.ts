/** IM 助理页选择的模型。 */
export interface AssistantModel {
  provider: string
  model: string
}

export function normalizeAssistantModel(input: { provider?: unknown; model?: unknown }): AssistantModel | undefined {
  const provider = typeof input.provider === 'string' ? input.provider.trim() : ''
  const model = typeof input.model === 'string' ? input.model.trim() : ''
  if (!provider || !model) return undefined
  return { provider, model }
}

export function pickAssistantModel(...candidates: Array<AssistantModel | undefined>): AssistantModel | undefined {
  for (const item of candidates) {
    if (item?.provider && item.model) return item
  }
  return undefined
}
