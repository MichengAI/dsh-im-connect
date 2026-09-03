/** 解析 IM 会话要用的模型，禁止把空字符串传给 agents.create。 */
export function resolveImAgentOptions(input) {
    const provider = input.provider?.trim() || input.fallback?.provider?.trim() || '';
    const model = input.model?.trim() || input.fallback?.model?.trim() || '';
    if (!provider || !model) {
        throw new Error('请先在设置 → IM助理 页面选择模型。');
    }
    return { provider, model };
}
/** 用 ctx.get 读默认模型，避免未 inject 时直接访问属性抛错。 */
export function readHostDefaultModel(ctx) {
    try {
        return ctx.get?.('agentDefaultModel')?.currentSelection?.();
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=agent-options.js.map