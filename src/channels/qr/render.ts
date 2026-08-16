/** 把扫码内容画成本地 data URL，避免前端把链接当成图片。 */
export async function renderQrDataUrl(payload: string): Promise<string> {
  const QRCode = await import('qrcode') as { default?: { toDataURL(text: string, opts?: object): Promise<string> }; toDataURL?(text: string, opts?: object): Promise<string> }
  const toDataURL = QRCode.toDataURL ?? QRCode.default?.toDataURL
  if (!toDataURL) throw new Error('缺少二维码生成库 qrcode')
  return toDataURL(payload, { width: 240, margin: 1, errorCorrectionLevel: 'M' })
}
