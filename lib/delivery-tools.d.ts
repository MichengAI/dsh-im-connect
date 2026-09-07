/** 向本机 Chat 和独立任务提供投递工具及随插件注册的 Skill。 */
import type { Context } from '@deepseek-ai/cordis';
import { type ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { ChannelManager } from './manager.js';
export declare const DELIVERY_SKILL: {
    readonly name: "im-send";
    readonly source: "bundled";
    readonly description: "通过已允许主动投递的 IM 账号发送文字、总结或报告；查询账号与接收目标，并保存用户指定的目标。";
    readonly invocation: {
        readonly modelInvocable: true;
        readonly userInvocable: true;
    };
    readonly content: string;
};
/** 外部 IM 用户不能因能与机器人聊天而获得整个 Host 的投递账号权限。 */
export declare function assertDeliveryCaller(exec: Pick<ToolRunContext, 'agent' | 'signal'>): void;
export declare function registerDeliveryTools(ctx: Context, manager: ChannelManager): () => void;
//# sourceMappingURL=delivery-tools.d.ts.map