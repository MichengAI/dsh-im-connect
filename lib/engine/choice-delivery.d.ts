/** 平台已拒绝与网络结果未知必须区分，后者不能自动补发相同卡片。 */
export declare class ChoiceSendError extends Error {
    readonly reason: 'permission-denied' | 'rejected' | 'delivery-unknown';
    constructor(reason: 'permission-denied' | 'rejected' | 'delivery-unknown');
}
export declare function choiceSendError(error: unknown): ChoiceSendError;
//# sourceMappingURL=choice-delivery.d.ts.map