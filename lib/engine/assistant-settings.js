export function normalizeAssistantModel(input) {
    const provider = typeof input.provider === 'string' ? input.provider.trim() : '';
    const model = typeof input.model === 'string' ? input.model.trim() : '';
    if (!provider || !model)
        return undefined;
    const reasoningEffort = normalizeEffort(input.reasoningEffort);
    return reasoningEffort ? { provider, model, reasoningEffort } : { provider, model };
}
export function pickAssistantModel(...candidates) {
    for (const item of candidates) {
        if (item?.provider && item.model)
            return item;
    }
    return undefined;
}
export function normalizeWorkspacePath(input) {
    if (typeof input !== 'string')
        return undefined;
    const cwd = input.trim();
    return cwd === '' ? undefined : cwd;
}
export function normalizePermission(input, officialNames) {
    if (typeof input !== 'string')
        return undefined;
    // 兼容 0.1.13 及更早版本保存的旧值，读取后统一迁移到 Chat 标准值。
    const permission = input.trim() === 'full-access' ? 'danger-full-access' : input.trim();
    if (!permission || (officialNames !== undefined && !officialNames.includes(permission)))
        return undefined;
    return permission;
}
export function normalizeEffort(input) {
    if (typeof input !== 'string')
        return undefined;
    const effort = input.trim();
    if (!effort || effort === 'none' || effort === 'default')
        return undefined;
    return effort;
}
//# sourceMappingURL=assistant-settings.js.map