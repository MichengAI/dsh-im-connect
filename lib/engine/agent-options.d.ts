/** 解析 IM 会话要用的模型，禁止把空字符串传给 agents.create。 */
export declare function resolveImAgentOptions(input: {
    provider?: string;
    model?: string;
    fallback?: {
        provider?: string;
        model?: string;
    };
}): {
    provider: string;
    model: string;
};
/** 用 ctx.get 读默认模型，避免未 inject 时直接访问属性抛错。 */
export declare function readHostDefaultModel(ctx: {
    get?(name: string): {
        currentSelection?: () => {
            provider?: string;
            model?: string;
        };
    } | undefined;
}): {
    provider?: string;
    model?: string;
} | undefined;
//# sourceMappingURL=agent-options.d.ts.map