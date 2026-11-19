// 真实宿主契约测试的 0.2.2+ 适配。
// 1) 0.2.2 起上传凭据的 resolve 返回 { type, attachment } 信封。
// 2) 0.2.2 起会话级模型选择由 Agent 自己暴露 model.current()。

/**
 * 把 resolve() 的返回值归一到文件/图片引用本身。
 * @param {unknown} staged - resolve() 的返回值。
 * @returns {any} 裸引用。
 */
export function stagedAttachment(staged) {
  return staged && typeof staged === 'object' && 'attachment' in staged ? staged.attachment : staged;
}

/**
 * 取得会话级模型选择的读写句柄（0.2.2+）。
 * @param {any} _owner - ApiSessionAgentController 实例。
 * @param {any} agent - 目标 Agent。
 * @param {{ provider?: string, model?: string, reasoningEffort?: string }} [initial] - 需要立即写入的选择。
 * @returns {{ current: any }} 可读写的选择句柄。
 */
export function sessionSelection(_owner, agent, initial) {
  // 0.2.2+：Agent 自己持有选择；保留宿主装配的读取实现，只在其上覆盖。
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
