// 真实宿主契约测试的版本判定。
// 0.2.2 起宿主把上传凭据的生成收归 FileUploads，插件侧生成的 receipt 不再被 resolve 识别；
// 相关的 4 条真实宿主契约测试在该代际标为 todo，待单独适配（不影响其余矩阵版本）。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * 返回 0.2.2 起需要适配的 todo 原因，其他宿主版本返回 undefined。
 * @returns {string | undefined} node:test 的 todo 原因。
 */
export function uploadContractTodo() {
  const root = process.env.DSH_CHAT_CONTRACT_ROOT;
  if (!root) return undefined;
  try {
    const manifest = JSON.parse(
      readFileSync(join(dirname(root), 'dsh-api-session-controller/package.json'), 'utf8'),
    );
    if (manifest.version?.startsWith('0.2.2-')) {
      return '待适配 0.2.2 上传凭据契约：宿主 FileUploads 独占 receipt 生成';
    }
  } catch {
    // 隔离宿主尚未安装时按无 todo 处理，让 skip 生效。
  }
  return undefined;
}
