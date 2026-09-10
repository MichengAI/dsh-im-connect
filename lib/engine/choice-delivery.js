/** 平台已拒绝与网络结果未知必须区分，后者不能自动补发相同卡片。 */
export class ChoiceSendError extends Error {
    reason;
    constructor(reason) {
        super(reason);
        this.reason = reason;
        this.name = 'ChoiceSendError';
    }
}
export function choiceSendError(error) {
    if (error instanceof ChoiceSendError)
        return error;
    const value = error;
    const status = value?.status ?? value?.response?.status;
    if (status === 401 || status === 403)
        return new ChoiceSendError('permission-denied');
    if (value?.rejected || (typeof status === 'number' && status >= 400 && status < 500 && status !== 408))
        return new ChoiceSendError('rejected');
    return new ChoiceSendError('delivery-unknown');
}
//# sourceMappingURL=choice-delivery.js.map