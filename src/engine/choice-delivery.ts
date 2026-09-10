/** 平台已拒绝与网络结果未知必须区分，后者不能自动补发相同卡片。 */
export class ChoiceSendError extends Error {
  constructor(readonly reason: 'permission-denied' | 'rejected' | 'delivery-unknown') {
    super(reason)
    this.name = 'ChoiceSendError'
  }
}

export function choiceSendError(error: unknown): ChoiceSendError {
  if (error instanceof ChoiceSendError) return error
  const value = error as { status?: number; response?: { status?: number }; rejected?: boolean } | undefined
  const status = value?.status ?? value?.response?.status
  if (status === 401 || status === 403) return new ChoiceSendError('permission-denied')
  if (value?.rejected || (typeof status === 'number' && status >= 400 && status < 500 && status !== 408)) return new ChoiceSendError('rejected')
  return new ChoiceSendError('delivery-unknown')
}
