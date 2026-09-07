type TokenResponse = {
    accessToken?: unknown;
    expireIn?: unknown;
};
/** 缓存归固定凭据的单个适配器所有，不按 clientId 跨实例共享。 */
export declare class DingtalkTokenCache {
    private readonly load;
    private readonly now;
    private cached?;
    private pending?;
    private generation;
    clear(): void;
    constructor(load: (signal: AbortSignal) => Promise<TokenResponse>, now?: () => number);
    get(signal: AbortSignal): Promise<string>;
    private fetch;
}
export {};
//# sourceMappingURL=dingtalk-token-cache.d.ts.map