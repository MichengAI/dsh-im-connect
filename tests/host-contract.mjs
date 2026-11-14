// 真实宿主契约测试的两代适配。
// 1) 0.2.2 起上传凭据的 resolve 返回 { type, attachment } 信封，0.2.1 返回裸引用。
// 2) 0.2.2 起会话级模型选择由 Agent 自己暴露 model.current()，0.2.1 由 controller 的 selectionFor 承载。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * 读取隔离宿主的版本号。
 * @returns {string | undefined} 宿主版本，未安装隔离宿主时为 undefined。
 */
export function hostContractVersion() {
  const root = process.env.DSH_CHAT_CONTRACT_ROOT;
  if (!root) return undefined;
  try {
    return JSON.parse(readFileSync(join(dirname(root), 'dsh-api-session-controller/package.json'), 'utf8')).version;
  } catch {
    return undefined;
  }
}

/**
 * 把 resolve() 的返回值归一到文件/图片引用本身，兼容两代返回形状。
 * @param {unknown} staged - resolve() 的返回值。
 * @returns {any} 裸引用。
 */
export function stagedAttachment(staged) {
  return staged && typeof staged === 'object' && 'attachment' in staged ? staged.attachment : staged;
}

/**
 * 取得会话级模型选择的读写句柄，兼容两代宿主。
 * @param {any} owner - ApiSessionAgentController 实例。
 * @param {any} agent - 目标 Agent。
 * @param {{ provider?: string, model?: string, reasoningEffort?: string }} [initial] - 需要立即写入的选择。
 * @returns {{ current: any }} 可读写的选择句柄。
 */
export function sessionSelection(owner, agent, initial) {
  if (typeof owner?.selectionFor === 'function') {
    const installed = owner.selectionFor(agent);
    if (initial !== undefined) installed.current = initial;
    return {
      get current() {
        return installed.current;
      },
      set current(next) {
        installed.current = next;
      },
    };
  }
  // 0.2.2：Agent 自己持有选择；保留宿主装配的读取实现，只在其上覆盖。
  const original = typeof agent.model?.current === 'function' ? agent.model.current.bind(agent.model) : undefined;
  let override = initial;
  agent.model = { ...agent.model, current: () => (override !== undefined ? override : original?.()) };
  return {
    get current() {
      return override !== undefined ? override : original?.();
    },
    set current(next) {
      override = next;
    },
  };
}
