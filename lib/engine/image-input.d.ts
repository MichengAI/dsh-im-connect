import type { ImMedia } from './types.js';
export declare class ImageInputError extends Error {
}
/** Safe feedback: never forward raw host errors (paths, tokens, or bytes) to IM. */
export declare function imageInputFailure(error: unknown): string;
/** Encode a channel download for Chat's public prompt API. Host owns validation. */
export declare function imagePromptPart(media: ImMedia): Promise<Record<string, unknown>>;
//# sourceMappingURL=image-input.d.ts.map