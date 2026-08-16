/** IM 助理页选择的模型。 */
export interface AssistantModel {
  provider: string
  model: string
  reasoningEffort?: string
}

export type PermissionPreset = 'read-only' | 'workspace-write' | 'full-access'

export function normalizeAssistantModel(input: { provider?: unknown; model?: unknown; reasoningEffort?: unknown }): AssistantModel | undefined {
  const provider = typeof input.provider === 'string' ? input.provider.trim() : ''
  const model = typeof input.model === 'string' ? input.model.trim() : ''
  if (!provider || !model) return undefined
  const reasoningEffort = normalizeEffort(input.reasoningEffort)
  return reasoningEffort ? { provider, model, reasoningEffort } : { provider, model }
}

export function pickAssistantModel(...candidates: Array<AssistantModel | undefined>): AssistantModel | undefined {
  for (const item of candidates) {
    if (item?.provider && item.model) return item
  }
  return undefined
}

export function normalizeWorkspacePath(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const cwd = input.trim()
  return cwd === '' ? undefined : cwd
}

export function normalizePermission(input: unknown): PermissionPreset | undefined {
  if (input === 'read-only' || input === 'workspace-write' || input === 'full-access') return input
  return undefined
}

export function normalizeEffort(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const effort = input.trim()
  if (!effort || effort === 'none' || effort === 'default') return undefined
  return effort
}
