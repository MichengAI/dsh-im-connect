export interface HashManifest {
    hash: string;
    files: {
        path: string;
        hash: string;
    }[];
}
export interface BuildReceipt {
    schemaVersion: 1;
    root: string;
    buildId: string;
    revision: string | null;
    dirty: boolean | null;
    timestamp: string;
    source: HashManifest;
    artifact: HashManifest;
}
export interface RuntimeReceipt {
    schemaVersion: 1;
    root: string;
    pid: number;
    modulePath: string;
    revision: string | null;
    buildId: string | null;
    artifactHash: string;
    timestamp: string;
}
export declare const buildReceiptPath: (root: string) => string;
export declare const runtimeReceiptPath: (env?: NodeJS.ProcessEnv) => string;
export declare function hashSources(root: string): HashManifest;
export declare function hashArtifacts(root: string): HashManifest;
export declare function readBuildReceipt(root: string): BuildReceipt | null;
export declare function writeReceipt(path: string, value: unknown): void;
/** Called at actual plugin apply, not import time. Error details/paths can contain secrets, so never log them. */
export declare function captureWorkspaceRuntime(moduleUrl: string, log?: (line: string) => void, env?: NodeJS.ProcessEnv): RuntimeReceipt | undefined;
//# sourceMappingURL=workspace-runtime.d.ts.map