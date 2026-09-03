/** IM 助理页选择的模型。 */
export interface AssistantModel {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
export type PermissionPreset = string;
export declare function normalizeAssistantModel(input: {
    provider?: unknown;
    model?: unknown;
    reasoningEffort?: unknown;
}): AssistantModel | undefined;
export declare function pickAssistantModel(...candidates: Array<AssistantModel | undefined>): AssistantModel | undefined;
export declare function normalizeWorkspacePath(input: unknown): string | undefined;
export declare function normalizePermission(input: unknown, officialNames?: readonly string[]): PermissionPreset | undefined;
export declare function normalizeEffort(input: unknown): string | undefined;
//# sourceMappingURL=assistant-settings.d.ts.map