/** 把扫码内容画成本地 data URL，避免前端把链接当成图片。 */
export async function renderQrDataUrl(payload) {
    const QRCode = await import('qrcode');
    const toDataURL = QRCode.toDataURL ?? QRCode.default?.toDataURL;
    if (!toDataURL)
        throw new Error('缺少二维码生成库 qrcode');
    return toDataURL(payload, { width: 240, margin: 1, errorCorrectionLevel: 'M' });
}
//# sourceMappingURL=render.js.map