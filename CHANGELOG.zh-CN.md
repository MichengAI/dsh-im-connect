# 更新日志

[English](CHANGELOG.md)

以下记录最近发布的五个版本。Git 标签与 GitHub Release 现已和这些条目同步；历史条目继续保留原始发布提交链接。

## 0.1.30 — 2026-09-01

- 修复账号切换模型时沿用旧 Low、Medium 或 High 推理等级的问题；无推理等级模型不再携带该字段，并会自动清理旧版本已保存的无效值。

发布包：[`@michengai/dsh-im-connect@0.1.30`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.30)。

## 0.1.29 — 2026-09-01

- 补齐多账号设置全流程的宿主语言本地化，覆盖账号配置、选择器、状态、操作、空状态、确认提示与可执行的服务端错误。
- 自动生成的账号名现在会随宿主语言显示，无需迁移已有数据；自定义账号名保持原样。
- 修复狭窄账号详情栏的英文操作按钮布局：精简连接操作文案并保持单行对齐，极窄宽度下按整颗按钮换行。

发布包：[`@michengai/dsh-im-connect@0.1.29`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.29)。

## 0.1.28 — 2026-09-01

- 微信、企业微信、QQ、钉钉、飞书、Lark 与 Telegram 现可接入多个相互隔离的账号；每个账号独立保存工作区、模型、权限、私聊准入、凭据、白名单与会话状态。
- 重新设计 IM 助理设置：按渠道添加账号、记住账号选择、独立编辑账号配置，并补齐空状态、按需二维码与桌面窄窗口响应式布局。
- 加强公开私聊安全边界：未批准用户不能审批本机工具调用；旧版审批接口在账号不明确时安全失败；账号重载会主动取消仍在等待的工具审批和结构化问题。

发布包：[`@michengai/dsh-im-connect@0.1.28`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.28)。

## 0.1.27 — 2026-08-31

- 将 DSH 工具审批和结构化用户问题路由到发起任务的 IM 会话，通过文字回复完成审批、单选、多选和自定义回答。
- 同时兼容 DSH 当前及旧版交互契约；同一会话的提示按顺序处理，群聊只允许发起用户作答。
- 加强提示发送与取消处理，避免分片发送、投递失败、任务中止、会话重置或插件卸载后留下仍可响应的过期交互。

发布包：[`@michengai/dsh-im-connect@0.1.27`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.27)。

## 0.1.26 — 2026-08-28

- 启用仓库 GitHub Actions 发布工作流的 npm Trusted Publishing。

发布包：[`@michengai/dsh-im-connect@0.1.26`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.26)。

## 0.1.25 — 2026-08-27

- 修复侧栏包装逻辑：官方工作区树继续使用宿主翻译器，频道页签只显示一个，注册表标签随语言实时刷新且不会残留订阅。
- 完全移除外部二维码兜底。配对数据只在本地生成二维码，本地生成失败时安全终止配对。
- 删除渠道时立即撤销运行时授权，并清理已存凭据以及微信身份、上下文和二维码状态。
- 将 IM 助理多字段设置改为原子更新，非法请求不会再部分修改当前配置。
- 新增回归测试和 Pull Request CI，自动执行测试与打包验证。

发布包：[`@michengai/dsh-im-connect@0.1.25`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.25)。

## 0.1.24 — 2026-08-26

- 恢复 IM 助理设置中内置权限预设的中文显示，不再暴露缺失的 `preset.*` 翻译键。
- 完全访问风险确认继续使用宿主管理的权限翻译域，显示名称则改用 IM Connect 自己的中英文词典。
- 将中英文 README 的更新日志入口从底部移到顶部导航。

发布包：[`@michengai/dsh-im-connect@0.1.24`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.24)。

## 0.1.23 — 2026-08-23

- 新增中英文更新日志，展示最近五个发布版本。
- 在中英文 README 中加入更新日志入口，并将日志纳入 npm 包。

发布包：[`@michengai/dsh-im-connect@0.1.23`](https://www.npmjs.com/package/@michengai/dsh-im-connect/v/0.1.23)。

## 0.1.22 — 2026-08-23

- 刷新审批状态处理。
- 放行当前登录流程需要的 QQ 连接器扫码器。

发布提交：[`47d1936`](https://github.com/MichengAI/dsh-im-connect/commit/47d1936)。

## 0.1.21 — 2026-08-23

- 信任已经校验的企业微信群回调。
- 加强 IM 频道运行时处理。

发布提交：[`be07643`](https://github.com/MichengAI/dsh-im-connect/commit/be07643)。
