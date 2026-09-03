export interface CredentialService {
    set(ref: string, value: string): Promise<unknown>;
    resolve(ref: string): Promise<{
        value?: string;
    } | string | undefined>;
    unset(ref: string): Promise<unknown>;
}
export interface CredentialVault {
    set(ref: string, value: string): Promise<void>;
    resolve(ref: string): Promise<string | undefined>;
    unset(ref: string): Promise<void>;
}
export declare function createFileVault(file: string): CredentialVault;
export declare function createServiceVault(credentials: CredentialService): CredentialVault;
/** DSH credentials 只接受 POSIX 标识符，不能带斜杠或连字符。 */
export declare function credentialRef(channelId: string, key: string): string;
//# sourceMappingURL=credentials.d.ts.map