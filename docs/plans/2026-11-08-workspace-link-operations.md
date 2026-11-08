# IM Connect 单一工作区部署 · 操作手册

2026-11-08 起，web profile 的 `@michengai/dsh-im-connect` 直接链接本仓库
（`node_modules/@michengai/dsh-im-connect` 是指向这里的 junction），不再从 tgz 安装副本加载。

## 唯一流程

```
# 1. 改代码：只改本仓库 src/、client.js 等源码
# 2. 构建 + 生成凭据（必做；只改源码不生效）
node scripts/workspace-dev.mjs build
# 3. 查看状态：源码是否比构建新、产物是否变化、正在运行的进程加载的是不是这份构建
node scripts/workspace-dev.mjs status --profile <profile 目录> --pid <dshw-web 的 PID>
# 4. 按现有 full-stack 维护流程重启（暂停看门狗）
```

`build` 会写 `.local/workspace-build.json`（含源码/产物逐文件 SHA256、Git 修订与 dirty 状态）。
插件 `apply` 时写启动凭据 `$DSH_HOME/logs/im-connect-workspace-runtime.json`（PID、模块真实路径、构建号、产物哈希）。

## 判读

- `buildCurrent: true` — 源码与上次构建一致。
- `runtime.current: true` — 正在运行的进程加载的正是当前产物（PID/路径/哈希都对上）。
- `sourceAheadOfBuild: true` — 有人改了源码还没 build；运行中的代码仍是上次构建，需要 build + 重启。
- 这两个状态相互独立：不要把“源码较新”误读成“运行中的代码不对”。

## 变更与回滚

- 安装形式的一次性切换/回滚由 `scripts/workspace-link-maintenance.py` 执行，回执在
  `ingress-private/im-workspace-link/<日期>/receipt.json`，`phase: verified` 为成功。
- 插件自更新已关闭（`updater: false`、`onlineUpdate: false`），不会把链接换回发布包。
- 回滚保留旧安装副本与前后 profile 元数据；不触碰聊天状态、账号与凭据。

## 维护注意事项

- 维护窗口必须创建 `ingress-private/dev-switch/watchdog.pause`（脚本会自动做并恢复）。
- `ready.json` 早于插件启动；判断插件是否就绪要看 `dsh-home/dsh-im-connect/gateway.log`
  里的 `[manager] API 已注册`。
- 一次性登录令牌只够一次探测：不要在插件 API 注册前消耗它。
