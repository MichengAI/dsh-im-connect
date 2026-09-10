// 复用各版宿主的真实附件准入实现，补齐契约夹具的 Agent 输入队列与文件服务。
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function promptAdmission(root, store, content) {
  const attachment = await import(pathToFileURL(join(dirname(root), 'dsh-attachment/lib/index.js')).href)
  if (typeof attachment.admitPromptContent === 'function') return attachment.admitPromptContent(store, content)
  return attachment.AttachmentStore.prototype.admitPromptContent.call(store, content)
}

export function preparePromptAgent(agent) {
  agent.inbox = { nextTurn: [], nextStep: [] }
  agent.session.snapshotEvents = () => agent.session.events ?? []
}

export function promptServices(root, attachments) {
  return {
    attachments: { ...attachments, admitPromptContent: content => promptAdmission(root, attachments, content) },
    fileUploads: {
      bindPrompt(agent, receipts) {
        // 图片不应生成文件回执；文件回传不属于这组图片契约测试。
        assert.deepEqual(receipts, [])
        return { commit() {}, [Symbol.dispose]() {} }
      },
    },
  }
}
