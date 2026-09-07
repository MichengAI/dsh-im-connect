import { readFile } from 'node:fs/promises';
export class ImageInputError extends Error {
}
/** Safe feedback: never forward raw host errors (paths, tokens, or bytes) to IM. */
export function imageInputFailure(error) {
    if (error instanceof ImageInputError)
        return error.message;
    const reason = error?.details?.reason;
    if (reason === 'MODEL_DOES_NOT_SUPPORT_IMAGES')
        return '当前会话模型不支持图片输入，请在 Chat 中切换支持视觉的模型后重新发送。';
    return '图片输入失败，消息未提交。请检查图片格式、大小或当前会话模型后重新发送；详情见本机日志。';
}
/** Encode a channel download for Chat's public prompt API. Host owns validation. */
export async function imagePromptPart(media) {
    const data = media.data ? Buffer.from(media.data) : media.path ? await readFile(media.path).catch(() => { throw new ImageInputError('图片读取失败，请重新发送。'); }) : Buffer.alloc(0);
    if (data.length === 0)
        throw new ImageInputError('图片下载失败或内容为空，请重新发送。');
    let mediaType = media.mediaType;
    // Encrypted CDNs may report octet-stream or the adapter may guess from a
    // filename. Actual image bytes take precedence; Host still fully decodes them.
    if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        mediaType = 'image/png';
    else if (data[0] === 255 && data[1] === 216 && data[2] === 255)
        mediaType = 'image/jpeg';
    else if (['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii')))
        mediaType = 'image/gif';
    else if (data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP')
        mediaType = 'image/webp';
    return { type: 'image', data: data.toString('base64'), mediaType, ...(media.name ? { name: media.name } : {}) };
}
//# sourceMappingURL=image-input.js.map