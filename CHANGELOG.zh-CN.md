# 更新日志

[English](CHANGELOG.md)

以下记录最近发布的五个版本。Git 标签与 GitHub Release 现已和这些条目同步；历史条目继续保留原始发布提交链接。

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
