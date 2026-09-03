/**
 * dsh-im-connect 浏览器端：IM助理设置页 + 工作区频道槽。
 */
window.__ModuleLoader__.load({
  id: "@michengai/dsh-im-connect",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");
    const { useState, useEffect, useLayoutEffect, useCallback, useRef, useSyncExternalStore } = React;
    const ReactDOM = require("react-dom");
    const { RiskConfirmation, IconListPenOutline16 } = require("@deepseek-ai/dsh-client-ui-primitives");
    const EMPTY_EXTRA_TABS = [];
    const inject = ["slots", "sessions", "workspaces", "locale"];
    const API_BASE = "/dsh-im-connect/api";
    const TAB_KEY = "dsh-im-connect.sidebar-tab";
    const ACCOUNT_SELECTION_KEY = "dsh-im-connect.settings.selected-account";
    const IM_LOCALE_NS = "im-connect";
    const IM_LOCALES = {
      zh: {
        "settings.label": "IM助理", "settings.title": "IM机器人", "settings.description": "管理各渠道账号。每个账号独立选择工作区、模型和权限，配置仅保存在本机。", "settings.viewProject": "GitHub", "settings.feedback": "问题反馈",
        "settings.aria": "IM助理", "settings.selectAccountTitle": "选择一个账号", "settings.selectAccountDescription": "从左侧选择账号，查看并修改工作区、模型和权限配置。", "settings.noAccountsTitle": "还没有接入账号", "settings.noAccountsDescription": "请在左侧选择对应渠道，然后点击“添加账号”。", "settings.publicChatNotice": "未批准用户可以发起聊天，但不能批准工具调用。", "pending.notice": "有访问请求。批准后该用户才能驱动本机助手。", "action.approve": "批准", "action.deny": "拒绝", "loading": "加载中…",
        "account.workspace": "工作区", "account.currentWorkspace": "当前工作区", "account.selectWorkspace": "请选择工作区", "account.selectModel": "请选择模型", "account.selectPermission": "请选择权限", "account.privateAccess": "私聊准入", "account.privateApproved": "仅已批准用户", "account.privateAll": "允许所有私聊用户", "account.autoNameNote": "绑定成功后会自动生成账号名，无需手动填写。", "account.defaultName": "{channel}账号 {count}",
        "account.countZero": "0 个账号", "account.countOnline": "{online} / {total} 在线", "account.countOffline": "{total} / {total} 离线", "account.statusProcessing": "处理中…", "account.statusOnline": "在线", "account.statusOffline": "离线", "account.statusRunning": "运行正常", "account.statusNotConnected": "未连接", "account.receive": "接收消息", "account.receiveDescription": "关闭后保留账号配置，但不接收新消息", "account.removeConfirm": "确定移除这个账号？本机保存的配置和凭据将一并删除。",
        "action.addAccount": "添加账号", "action.generateQr": "生成二维码", "action.checkConnection": "检查连接", "action.reconnectAccount": "重新连接", "action.removeAccount": "移除接入", "status.saving": "保存中…", "status.saved": "已保存",
        "channel.dingtalk": "钉钉", "channel.feishu": "飞书", "channel.lark": "Lark", "channel.weixin": "微信", "channel.wecom": "企业微信", "channel.qq": "QQ", "channel.telegram": "Telegram",
        "field.dingtalk.clientId": "Client ID（原 AppKey）", "field.dingtalk.clientSecret": "Client Secret（原 AppSecret）",
        "bind.title": "配置 {channel}", "bind.close": "关闭", "bind.quick": "快捷绑定（推荐）", "bind.manual": "手动配置", "bind.saving": "正在保存账号…", "bind.success": "绑定成功，频道已连接", "bind.newIdentity": "检测到新的账号身份，已创建新账号", "bind.qrAlt": "{channel} 绑定二维码", "bind.generating": "正在生成…", "bind.expire": "二维码 {time} 后过期", "bind.scanned": "已扫码，请在手机上确认", "bind.retry": "请重新生成二维码", "bind.refresh": "重新生成二维码", "action.saving": "保存中…", "action.confirm": "确认",
        "qr.weixin": "请使用微信扫描二维码完成绑定", "qr.feishu": "请使用飞书扫描二维码，将自动创建机器人", "qr.lark": "请使用 Lark 扫描二维码完成配对", "qr.wecom": "请使用企业微信扫描二维码，快捷绑定机器人", "qr.dingtalk": "请使用钉钉扫描二维码，自动创建机器人", "qr.qq": "请使用手机 QQ 扫描二维码，创建开放平台机器人", "qr.default": "请使用对应 App 扫描二维码",
        "status.unconfigured": "未配置", "status.connected": "已连接", "status.connecting": "接入中…", "action.configure": "配置", "action.more": "{channel} 更多", "action.reconnect": "重新接入", "action.disconnect": "断开", "action.removeConfig": "删除配置", "action.receive": "接收消息",
        "error.loadAssistant": "无法加载账号配置", "error.noModels": "当前 Host 还没有可用模型，请先在网页里配置提供商", "error.save": "保存失败", "error.chooseWorkspace": "请选择工作区目录", "error.workspaceUnavailable": "当前 Host 无法新增工作区", "error.addWorkspace": "新增工作区失败", "error.load": "加载失败", "error.connection": "无法连接本机 IM 助理接口", "error.request": "请求失败", "error.action": "操作失败", "error.qr": "无法生成二维码", "error.detailsInLog": "操作失败，请查看服务器日志。",
        "composer.aria": "全局会话配置", "composer.project": "选择项目", "composer.projectAria": "项目", "composer.noWorkspaces": "暂无工作区", "composer.addWorkspace": "添加工作区…", "composer.permission": "权限", "composer.noModels": "暂无模型", "composer.workspacePath": "工作区路径", "action.cancel": "取消", "action.adding": "添加中…",
        "permission.readOnly": "只读", "permission.workspaceWrite": "工作区写入", "permission.fullAccess": "完全访问",
        "rail.workspace": "工作区", "rail.search": "搜索", "rail.searchPlaceholder": "搜索会话...", "rail.clearSearch": "清除搜索", "rail.filter": "筛选", "rail.group": "分组方式", "rail.byWorkspace": "按工作区", "rail.list": "单列表", "rail.sort": "排序方式", "rail.manual": "手动排序", "rail.recent": "最近更新", "rail.running": "运行中", "rail.idle": "空闲", "rail.renameAria": "重命名会话", "rail.rename": "重命名", "rail.fork": "分叉会话", "rail.archive": "归档会话", "rail.empty": "还没有频道会话。先在设置 → IM助理 里连接渠道，并给机器人发一条消息。", "rail.noTasks": "暂无网页任务", "rail.ungrouped": "未分组", "rail.tabsAria": "工作区分类", "rail.tasks": "任务", "rail.channels": "频道",
        "time.now": "刚刚", "time.minutes": "{count}分钟前", "time.hours": "{count}小时前", "time.days": "{count}天前",
        "server.unknownChannel": "未知渠道", "server.channelUnconfigured": "渠道未配置", "server.sessionMissing": "会话不存在", "server.accountMissing": "账号不存在", "server.accountConnectFailed": "账号连接失败，请查看本机日志", "server.accountReconnectFailed": "重新连接失败，请查看本机日志", "server.selectAccountSettings": "请选择提供商、模型、工作区或权限", "server.selectModel": "请选择提供商和模型", "server.selectWorkspace": "请选择工作区", "server.selectPermission": "请选择权限", "server.missingCredentials": "凭据不足，无法启动渠道", "server.qrUnsupported": "该渠道不支持扫码绑定", "server.qrExpired": "二维码已过期", "server.qrIncomplete": "扫码未完成", "server.accessDenied": "未授权：请管理员在设置 → IM助理 中批准你的访问。",
        "status.disconnected": "已断开", "status.reconnectFailed": "重连失败", "status.connectingSocket": "连接中", "status.waitHandshake": "等待网关握手", "status.authenticating": "鉴权中", "status.reconnecting": "重连中", "status.connectionError": "连接错误", "status.connectionFailed": "连接失败", "status.streamConnected": "Stream 已连接", "status.stopped": "已停止", "status.longConnection": "长连接已建立", "status.polling": "轮询中", "status.notLoggedIn": "未登录", "status.waitQr": "等待扫码", "status.loggedIn": "已登录", "status.loggedInRecovered": "已登录（自动恢复）", "status.loggingIn": "登录中",
      },
      en: {
        "settings.label": "IM Assistant", "settings.title": "IM Bots", "settings.description": "Manage accounts across channels. Each account has its own workspace, model, and permission settings, stored only on this machine.", "settings.viewProject": "GitHub", "settings.feedback": "Issues",
        "settings.aria": "IM Assistant", "settings.selectAccountTitle": "Select an account", "settings.selectAccountDescription": "Choose an account on the left to view and edit its workspace, model, and permissions.", "settings.noAccountsTitle": "No accounts connected", "settings.noAccountsDescription": "Choose a channel on the left, then select Add account.", "settings.publicChatNotice": "Unapproved users can start chats, but they cannot approve tool calls.", "pending.notice": "There are access requests. Approve a user before they can control the local assistant.", "action.approve": "Approve", "action.deny": "Deny", "loading": "Loading…",
        "account.workspace": "Workspace", "account.currentWorkspace": "Current workspace", "account.selectWorkspace": "Select a workspace", "account.selectModel": "Select a model", "account.selectPermission": "Select a permission", "account.privateAccess": "Private chat access", "account.privateApproved": "Approved users only", "account.privateAll": "Allow all DM users", "account.autoNameNote": "The account name is generated automatically after setup.", "account.defaultName": "{channel} account {count}",
        "account.countZero": "0 accounts", "account.countOnline": "{online} / {total} online", "account.countOffline": "{total} / {total} offline", "account.statusProcessing": "Processing…", "account.statusOnline": "Online", "account.statusOffline": "Offline", "account.statusRunning": "Running normally", "account.statusNotConnected": "Not connected", "account.receive": "Receive messages", "account.receiveDescription": "Turn this off to keep the account settings without receiving new messages", "account.removeConfirm": "Remove this account? Its saved settings and credentials will also be deleted.",
        "action.addAccount": "Add account", "action.generateQr": "Generate QR code", "action.checkConnection": "Check", "action.reconnectAccount": "Reconnect", "action.removeAccount": "Remove", "status.saving": "Saving…", "status.saved": "Saved",
        "channel.dingtalk": "DingTalk", "channel.feishu": "Feishu", "channel.lark": "Lark", "channel.weixin": "WeChat", "channel.wecom": "WeCom", "channel.qq": "QQ", "channel.telegram": "Telegram",
        "field.dingtalk.clientId": "Client ID (formerly AppKey)", "field.dingtalk.clientSecret": "Client Secret (formerly AppSecret)",
        "bind.title": "Set up {channel}", "bind.close": "Close", "bind.quick": "Quick setup (recommended)", "bind.manual": "Manual setup", "bind.saving": "Saving account…", "bind.success": "Connected successfully", "bind.newIdentity": "A new account identity was detected and a new account was created", "bind.qrAlt": "{channel} setup QR code", "bind.generating": "Generating…", "bind.expire": "QR code expires in {time}", "bind.scanned": "Scanned. Confirm on your phone.", "bind.retry": "Generate a new QR code", "bind.refresh": "Generate a new QR code", "action.saving": "Saving…", "action.confirm": "Confirm",
        "qr.weixin": "Scan the QR code with WeChat to connect", "qr.feishu": "Scan with Feishu; a bot will be created automatically", "qr.lark": "Scan with Lark to pair", "qr.wecom": "Scan with WeCom to quickly connect a bot", "qr.dingtalk": "Scan with DingTalk; a bot will be created automatically", "qr.qq": "Scan with mobile QQ to create an Open Platform bot", "qr.default": "Scan the QR code with the corresponding app",
        "status.unconfigured": "Not configured", "status.connected": "Connected", "status.connecting": "Connecting…", "action.configure": "Configure", "action.more": "More options for {channel}", "action.reconnect": "Reconnect", "action.disconnect": "Disconnect", "action.removeConfig": "Remove configuration", "action.receive": "Receive messages",
        "error.loadAssistant": "Could not load account settings", "error.noModels": "No models are available in the Host. Configure a provider in the web app first.", "error.save": "Could not save", "error.chooseWorkspace": "Choose a workspace directory", "error.workspaceUnavailable": "This Host cannot create workspaces", "error.addWorkspace": "Could not add workspace", "error.load": "Could not load", "error.connection": "Could not connect to the local IM Assistant API", "error.request": "Request failed", "error.action": "Action failed", "error.qr": "Could not generate a QR code", "error.detailsInLog": "The operation failed. Check the server logs for details.",
        "composer.aria": "Global session settings", "composer.project": "Select project", "composer.projectAria": "Project", "composer.noWorkspaces": "No workspaces", "composer.addWorkspace": "Add workspace…", "composer.permission": "Permission", "composer.noModels": "No models", "composer.workspacePath": "Workspace path", "action.cancel": "Cancel", "action.adding": "Adding…",
        "permission.readOnly": "Read Only", "permission.workspaceWrite": "Workspace Write", "permission.fullAccess": "Full access",
        "rail.workspace": "Workspaces", "rail.search": "Search", "rail.searchPlaceholder": "Search sessions...", "rail.clearSearch": "Clear search", "rail.filter": "Filter", "rail.group": "Group by", "rail.byWorkspace": "By workspace", "rail.list": "Single list", "rail.sort": "Sort by", "rail.manual": "Manual", "rail.recent": "Recently updated", "rail.running": "Running", "rail.idle": "Idle", "rail.renameAria": "Rename session", "rail.rename": "Rename", "rail.fork": "Fork session", "rail.archive": "Archive session", "rail.empty": "No channel sessions yet. Connect a channel in Settings → IM Assistant, then send the bot a message.", "rail.noTasks": "No web tasks", "rail.ungrouped": "Ungrouped", "rail.tabsAria": "Workspace categories", "rail.tasks": "Tasks", "rail.channels": "Channels",
        "time.now": "Just now", "time.minutes": "{count} min ago", "time.hours": "{count} hr ago", "time.days": "{count} days ago",
        "server.unknownChannel": "Unknown channel", "server.channelUnconfigured": "Channel is not configured", "server.sessionMissing": "Session does not exist", "server.accountMissing": "Account does not exist", "server.accountConnectFailed": "Could not connect the account. Check the local logs.", "server.accountReconnectFailed": "Could not reconnect the account. Check the local logs.", "server.selectAccountSettings": "Select a provider, model, workspace, or permission setting", "server.selectModel": "Select a provider and model", "server.selectWorkspace": "Select a workspace", "server.selectPermission": "Select a permission", "server.missingCredentials": "The channel cannot start because credentials are missing", "server.qrUnsupported": "This channel does not support QR setup", "server.qrExpired": "QR code has expired", "server.qrIncomplete": "QR setup was not completed", "server.accessDenied": "Access denied: ask an administrator to approve you in Settings → IM Assistant.",
        "status.disconnected": "Disconnected", "status.reconnectFailed": "Reconnect failed", "status.connectingSocket": "Connecting", "status.waitHandshake": "Waiting for gateway handshake", "status.authenticating": "Authenticating", "status.reconnecting": "Reconnecting", "status.connectionError": "Connection error", "status.connectionFailed": "Connection failed", "status.streamConnected": "Stream connected", "status.stopped": "Stopped", "status.longConnection": "Long connection established", "status.polling": "Polling", "status.notLoggedIn": "Not signed in", "status.waitQr": "Waiting for scan", "status.loggedIn": "Signed in", "status.loggedInRecovered": "Signed in (restored)", "status.loggingIn": "Signing in",
      },
    };
    const fallbackT = (key) => key;
    const h = React.createElement;

    const CSS = `
.ima-page{--ima-text:var(--dsw-alias-label-primary,var(--dsh-text,#e6edf3));--ima-muted:var(--dsw-alias-label-tertiary,var(--dsh-text-muted,#8b949e));--ima-line:var(--dsw-alias-border-l2,var(--dsh-border,rgba(255,255,255,.1)));--ima-card:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04));--ima-card-hover:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));--ima-ok:var(--dsw-alias-state-success-primary,#3fb950);--ima-warning:var(--dsw-alias-state-warning-primary,#d29922);--ima-danger:var(--dsw-alias-state-error-primary,#f85149);--ima-accent:var(--dsw-alias-brand-primary,#4b7cff);box-sizing:border-box;max-width:760px;width:100%;margin:0 auto;padding:0 0 32px;color:var(--ima-text)}
.ima-deco{display:flex;justify-content:center;align-items:flex-end;gap:10px;min-height:56px;margin:8px 0 14px}
.ima-bubble{font-size:12px;line-height:1.4;padding:6px 10px;border-radius:12px;max-width:220px;border:1px solid var(--ima-line)}
.ima-bubble.left{background:rgba(46,160,67,.14);color:#7ee787}
.ima-bubble.right{background:rgba(255,255,255,.05);color:var(--ima-muted)}
.ima-avatars{display:flex;align-items:center}
.ima-avatar{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;border:2px solid #111}
.ima-avatar.bot{background:#123524;margin-right:-8px;z-index:1}
.ima-avatar.user{background:#3d3428}
.ima-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}.ima-title{margin:0;font-size:20px;line-height:28px;font-weight:650;letter-spacing:-.2px;text-align:left}
.ima-sub{margin:4px 0 0;max-width:42em;color:var(--ima-muted);font-size:13px;line-height:1.5;text-align:left}
.ima-composer-wrap{margin:0 0 16px}
.ima-composer{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:center;gap:4px;padding:4px 6px;border:1px solid var(--ima-line);border-radius:14px;background:var(--ima-card)}
.ima-composer-left,.ima-composer-right{display:contents}
.ima-composer .ima-chip{width:100%;min-width:0}
.ima-composer .ima-chip-btn{width:100%;justify-content:center}
.ima-chip{position:relative;min-width:0;z-index:1}
.ima-chip.is-open{z-index:30}
.ima-chip-btn{display:inline-flex;align-items:center;gap:6px;min-height:28px;height:28px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:var(--ima-muted);font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer}
.ima-chip-btn:hover,.ima-chip.is-open .ima-chip-btn{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));color:var(--ima-text)}
.ima-chip-label{min-width:0;overflow:hidden;text-overflow:ellipsis}
.ima-chip-btn em{width:6px;height:6px;margin-left:2px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translateY(-2px);opacity:.55;flex:none}
.ima-chip-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:30;min-width:260px;max-height:280px;overflow:auto;padding:6px;border:1px solid var(--ima-line);border-radius:14px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,#fff));box-shadow:var(--dsw-shadow-lv3,0 16px 40px rgba(0,0,0,.18))}
.ima-chip-menu.is-end{left:auto;right:0}
.ima-chip-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:8px 10px;border:0;border-radius:10px;background:transparent;color:inherit;text-align:left;cursor:pointer;font-size:13px}
.ima-chip-row:hover,.ima-chip-row.is-on{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.ima-chip-row-main{display:inline-flex;align-items:center;gap:8px;min-width:0}
.ima-chip-tick{width:6px;height:12px;border-right:1.6px solid var(--ima-accent);border-bottom:1.6px solid var(--ima-accent);transform:rotate(45deg) translateY(-2px);flex:none}
.ima-chip-empty{padding:14px 12px;color:var(--ima-muted);font-size:12px;text-align:center}
.ima-composer-hint{margin-top:8px;color:var(--ima-muted);font-size:12px;text-align:center}
.ima-chip svg{flex:none}
.ima-chip-row.is-kv .ima-chip-row-main{flex:none}
.ima-chip-row-side{display:inline-flex;align-items:center;gap:8px;color:var(--ima-muted);font-size:12px;min-width:0}
.ima-chip-next{width:7px;height:7px;border-right:1.6px solid currentColor;border-bottom:1.6px solid currentColor;transform:rotate(-45deg);opacity:.55;flex:none}
.ima-chip-split{height:1px;margin:6px 8px;background:var(--ima-line)}
.ima-chip-effort{color:var(--ima-muted);font-weight:500}
.ima-model-select .ima-chip-btn{border-radius:24px;gap:4px}
.ima-model-select .ima-chip-menu{width:min(240px,calc(100vw - 32px));min-width:240px;max-height:min(360px,calc(100vh - 96px));padding:4px;border-radius:12px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-base,#fff))}
.ima-model-select .ima-chip-row{min-height:40px;padding:0 10px;font-size:14px}
.ima-model-select .ima-chip-row-side{font-size:13px;color:var(--dsw-alias-label-tertiary,var(--ima-muted))}
.ima-model-group+.ima-model-group{margin-top:4px}
.ima-model-group-title{position:sticky;top:0;z-index:1;padding:5px 8px 3px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-base,#fff));color:var(--dsw-alias-label-tertiary,var(--ima-muted));font-size:12px;font-weight:500;line-height:18px}
.ima-model-option{display:flex;width:100%;min-height:38px;align-items:center;gap:8px;padding:6px 8px;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary,var(--ima-text));text-align:left;cursor:pointer}
.ima-model-option:hover,.ima-model-option:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));outline:none}
.ima-model-option-copy{display:flex;min-width:0;flex:1;flex-direction:column}.ima-model-name{overflow:hidden;font-size:14px;font-weight:500;line-height:20px;text-overflow:ellipsis;white-space:nowrap}.ima-model-description{overflow:hidden;color:var(--dsw-alias-label-tertiary,var(--ima-muted));font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}.ima-model-check{display:grid;flex:0 0 18px;place-items:center;color:var(--dsw-alias-label-primary,var(--ima-text))}
.ima-chip-dialog{margin-top:10px;padding:12px;border:1px solid var(--ima-line);border-radius:12px;background:var(--dsw-alias-bg-layer-3,transparent)}
.ima-chip-dialog strong{display:block;margin:0 0 8px;font-size:13px}
.ima-chip-dialog input{width:100%;min-height:36px;padding:8px 10px;border-radius:8px;border:1px solid var(--ima-line);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-button-elevated-fill,transparent));color:var(--ima-text);box-sizing:border-box}
.ima-chip-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}

.ima-list{display:flex;flex-direction:column;gap:10px}
.ima-card{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;min-height:52px;padding:13px 16px;border:1px solid var(--ima-line);border-radius:12px;background:var(--ima-card)}
.ima-card:hover{background:var(--ima-card-hover)}
.ima-card-main{min-width:0}
.ima-name-row{display:flex;align-items:center;gap:10px;min-height:28px}
.ima-status{margin-left:auto;color:var(--ima-muted);font-size:12px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42%}
.ima-name{font-size:15px;font-weight:650}
.ima-badge{font-size:11px;line-height:18px;padding:0 7px;border-radius:8px;background:rgba(46,160,67,.16);color:var(--ima-ok)}
.ima-desc,.ima-meta{margin-top:3px;margin-left:38px;color:var(--ima-muted);font-size:12px;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:17px}
.ima-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-height:36px;position:relative}
.ima-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));background:transparent;color:var(--dsw-alias-label-primary,inherit);border-radius:8px;min-width:72px;min-height:32px;padding:0 12px;font:inherit;font-size:13px;cursor:pointer}
.ima-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}
.ima-btn:focus-visible,.ima-more:focus-visible,.ima-switch:focus-visible,.ima-link:focus-visible,.ima-x:focus-visible{outline:2px solid var(--ima-accent);outline-offset:2px}
.ima-btn:disabled{opacity:.5;cursor:not-allowed}
.ima-btn.primary{background:var(--dsw-alias-button-primary-fill,var(--ima-accent));border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#fff)}
.ima-more{width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:var(--ima-text);cursor:pointer;font-size:18px;line-height:1}
.ima-more:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.ima-menu{position:absolute;right:0;top:36px;min-width:128px;padding:6px;border:1px solid var(--ima-line);border-radius:10px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,#fff));z-index:5;box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.18))}
.ima-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--ima-text);padding:8px 10px;border-radius:6px;cursor:pointer;min-height:36px}
.ima-menu button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.ima-switch{width:40px;height:22px;border-radius:11px;border:0;background:var(--ima-ok);position:relative;cursor:pointer;flex:none}
.ima-switch.off{background:var(--dsw-alias-label-tertiary,#8b8f98)}
.ima-switch i{position:absolute;top:2px;left:20px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .16s ease}
.ima-switch.off i{left:2px}
.ima-error{color:var(--ima-danger);font-size:12px;margin:0 0 12px}
.ima-pending{margin:0 0 14px;padding:10px 12px;border:1px solid rgba(210,153,34,.35);border-radius:12px}
.ima-pending-row{display:flex;gap:8px;align-items:center;margin-top:8px}
.ima-wrap{display:flex;flex-direction:column;min-height:0;flex:1;height:100%;overflow:hidden}.ima-official-tree{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}.ima-native,.ima-rail.ima-native,.ima-rail.dcu-wb{box-sizing:border-box;padding-right:var(--dsh-sidebar-inline-padding,12px)}
.ima-tabs{display:flex;gap:18px;padding:4px 12px 0;border-bottom:1px solid var(--ima-line)}
.ima-tab{appearance:none;border:0;background:transparent;color:var(--ima-muted);padding:8px 0;font-size:13px;cursor:pointer}
.ima-tab.on{color:var(--ima-text);box-shadow:inset 0 -2px 0 currentColor}
.ima-tabs{flex:none}
.ima-rail{flex:1 1 auto;min-height:180px;overflow:auto}
.ima-item{display:flex;align-items:center;gap:6px;padding:0 8px 0 18px;border-radius:8px;cursor:pointer;font-size:13px;min-height:32px;position:relative}
.ima-item-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ima-item:hover,.ima-item.on{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.ima-sess-actions{display:none;flex:none;align-items:center;gap:2px}
.ima-item:hover .ima-sess-actions,.ima-item.menu-on .ima-sess-actions{display:flex}
.ima-sess-btn{width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:16px;line-height:1}
.ima-sess-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.ima-sess-menu{position:absolute;right:8px;top:30px;min-width:132px;padding:6px;border:1px solid var(--ima-line);border-radius:10px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,#fff));z-index:8;box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.18))}
.ima-sess-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--ima-text);padding:7px 10px;border-radius:6px;cursor:pointer}
.ima-sess-menu button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.ima-sess-menu button.danger{color:var(--ima-danger)}
.ima-rename{flex:1;min-width:0;min-height:28px;padding:2px 8px;border-radius:6px;border:1px solid var(--ima-line);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-button-elevated-fill,transparent));color:var(--ima-text);font-size:13px}
.ima-empty{color:var(--ima-muted);font-size:12px;padding:12px 8px}
.ima-logo{width:28px;height:28px;flex:none;display:block;line-height:0;background:transparent}
.ima-logo svg{width:28px;height:28px;display:block}
.ima-logo.sm{width:16px;height:16px;overflow:hidden;display:grid;place-items:center}
.ima-logo.sm svg{width:16px;height:16px;transform:none}
.ima-logo[data-brand="wecom"]{border-radius:6px;box-shadow:inset 0 0 0 1px rgba(15,23,42,.12);overflow:hidden;background:#fff}
.ima-logo.sm[data-brand="wecom"]{border-radius:4px;box-shadow:none;background:transparent}
.ima-mask{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));backdrop-filter:var(--dsw-mask-blur,blur(8px));display:grid;place-items:center;z-index:80;padding:24px}
.ima-modal{width:min(440px,100%);background:var(--dsw-alias-bg-layer-2,#fff);color:var(--ima-text);border:1px solid var(--ima-line);border-radius:16px;padding:20px 22px 22px;text-align:left;box-shadow:var(--dsw-shadow-lv3,0 16px 48px rgba(0,0,0,.18))}
.ima-modal-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.ima-modal-h h2{margin:0;font-size:16px;font-weight:650}
.ima-x{border:0;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:var(--ima-muted);width:32px;height:32px}
.ima-seg{display:flex;gap:0;border-bottom:1px solid var(--ima-line);margin:0 -22px 16px;padding:0 22px}
.ima-seg button{flex:1;border:0;background:transparent;padding:10px 0;font-size:13px;color:var(--ima-muted);cursor:pointer}
.ima-seg button.on{color:var(--ima-accent);box-shadow:inset 0 -2px 0 var(--ima-accent);font-weight:600}
.ima-qrbox{display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px 0 4px}
.ima-qrbox img{width:200px;height:200px;background:#fff;border:1px solid var(--ima-line);border-radius:12px;object-fit:contain}
.ima-bind-ready{display:flex;flex-direction:column;align-items:center;gap:14px;padding:12px 0 4px}.ima-bind-ready .ima-btn{min-width:136px}.ima-bind-status{min-height:40px;display:grid;place-items:center;color:var(--ima-muted);font-size:13px;text-align:center}
.ima-hint{margin:0;color:var(--ima-muted);font-size:13px;text-align:center;line-height:1.6}
.ima-link{border:0;background:transparent;color:var(--ima-accent);cursor:pointer;font-size:13px;min-height:32px}
.ima-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-size:13px}
.ima-field input{padding:8px 10px;border-radius:8px;border:1px solid var(--ima-line);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-button-elevated-fill,transparent));color:var(--ima-text);min-height:36px}
.ima-radio{display:flex;flex-direction:column;gap:8px;margin:8px 0 14px}
.ima-radio label{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--ima-text)}
.ima-radio small{display:block;color:var(--ima-muted);margin-top:2px}
.ima-ok{color:var(--ima-ok);font-size:14px;text-align:center;padding:24px 0}
.ima-modal .ima-error{color:var(--ima-danger)}
.ima-page.ima-account-page{max-width:1120px;padding-bottom:40px}
.ima-account-shell{display:grid;grid-template-columns:minmax(330px,390px) minmax(360px,1fr);min-height:650px;border:1px solid var(--ima-line);border-radius:16px;overflow:hidden;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.018))}
.ima-platforms{padding:0;border-right:1px solid var(--ima-line);background:var(--dsw-alias-bg-base,transparent)}
.ima-platform{border:0;border-bottom:1px solid var(--ima-line);border-radius:0;margin:0;overflow:visible;background:transparent}.ima-platform:last-child{border-bottom:0}.ima-platform.open{background:transparent}
.ima-platform-head{display:flex;align-items:center;gap:10px;width:100%;min-height:64px;padding:10px 18px;border:0;border-radius:0;background:transparent;color:inherit;text-align:left;cursor:pointer}
.ima-platform:not(.open):not(.empty) .ima-platform-head:hover{background:var(--ima-card-hover)}.ima-platform.empty .ima-platform-head{cursor:default}.ima-platform-title{min-width:0;flex:1;font-size:14px;font-weight:650}.ima-platform-count{color:var(--ima-muted);font-size:12px;white-space:nowrap}.ima-platform-count.online{color:var(--ima-ok)}.ima-platform-count.offline,.ima-platform-count.partial{color:var(--ima-warning)}
.ima-platform-add{min-height:34px;padding:0 10px;border:1px solid var(--ima-line);border-radius:8px;background:transparent;color:var(--ima-text);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}.ima-platform-add:hover{background:var(--ima-card-hover)}
.ima-platform-caret{display:grid;width:18px;height:18px;margin:0 1px;place-items:center;color:var(--ima-muted);transition:transform .15s ease}.ima-platform-caret.empty{visibility:hidden}.ima-platform.open .ima-platform-caret{transform:rotate(90deg)}
.ima-account-list{display:flex;flex-direction:column;gap:8px;padding:0 14px 14px}.ima-account-row{display:flex;align-items:center;gap:10px;width:100%;min-height:72px;padding:10px 12px;border:1px solid var(--ima-line);border-radius:9px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.025));color:inherit;text-align:left;cursor:pointer}.ima-account-row:hover{background:var(--ima-card-hover);border-color:color-mix(in srgb,var(--ima-text) 22%,var(--ima-line))}.ima-account-row.on{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));border-color:color-mix(in srgb,var(--ima-text) 18%,var(--ima-line))}
.ima-platform-head:focus-visible,.ima-platform-add:focus-visible,.ima-account-row:focus-visible{outline:2px solid var(--ima-accent);outline-offset:2px}
.ima-account-row .ima-logo,.ima-account-row .ima-logo svg{width:38px;height:38px}.ima-account-row .ima-logo{border-radius:9px}.ima-account-copy{min-width:0;flex:1}.ima-account-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600}.ima-account-id{display:block;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ima-muted);font-size:11px}.ima-account-state{font-size:12px;white-space:nowrap;color:var(--ima-muted)}.ima-account-state.online{color:var(--ima-ok)}.ima-account-state.offline{color:var(--ima-warning)}.ima-account-next{display:grid;width:16px;height:16px;place-items:center;color:var(--ima-text);opacity:.8}.ima-dot{width:7px;height:7px;border-radius:50%;background:var(--ima-warning);flex:none}.ima-dot.on{background:var(--ima-ok);box-shadow:0 0 0 3px color-mix(in srgb,var(--ima-ok) 15%,transparent)}
.ima-inspector{padding:22px 24px 26px;min-width:0}.ima-inspector-empty{display:grid;min-height:580px;padding:32px;place-items:center;text-align:center}.ima-inspector-empty-copy{max-width:300px}.ima-inspector-empty-title{margin:0;color:var(--ima-text);font-size:16px;font-weight:650;line-height:24px}.ima-inspector-empty-description{margin:8px 0 0;color:var(--ima-muted);font-size:13px;line-height:20px}.ima-inspector-head{display:flex;align-items:flex-start;gap:12px;padding-bottom:18px;border-bottom:1px solid var(--ima-line)}.ima-inspector-head-copy{min-width:0;flex:1}.ima-inspector-title{margin:1px 0 3px;font-size:17px;line-height:24px}.ima-inspector-status{color:var(--ima-muted);font-size:12px}.ima-inspector-status.ok{color:var(--ima-ok)}
.ima-form{display:flex;flex-direction:column;gap:16px;padding-top:20px}.ima-control{display:flex;flex-direction:column;gap:7px}.ima-control>span{color:var(--ima-muted);font-size:12px;font-weight:550}.ima-control input,.ima-control select{box-sizing:border-box;width:100%;min-height:44px;padding:0 12px;border:1px solid var(--ima-line);border-radius:9px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04));color:var(--ima-text);font:13px inherit;outline:none}.ima-control input:focus,.ima-control select:focus{border-color:var(--ima-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--ima-accent) 18%,transparent)}.ima-control option{background:#202124;color:#f2f3f5}
.ima-switch-row{display:flex;align-items:center;justify-content:space-between;min-height:48px;padding:0 2px}.ima-switch-copy strong{display:block;font-size:13px}.ima-switch-copy small{display:block;margin-top:2px;color:var(--ima-muted);font-size:11px}
.ima-inspector-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px;padding-top:18px;border-top:1px solid var(--ima-line)}.ima-inspector-actions .ima-btn{flex:none;min-width:0;min-height:36px;padding:0 8px;font-size:12px;white-space:nowrap}.ima-inspector-actions .danger{margin-left:auto;color:var(--ima-danger);border-color:color-mix(in srgb,var(--ima-danger) 35%,transparent)}
.ima-save-note{min-height:18px;color:var(--ima-muted);font-size:11px}.ima-save-note.ok{color:var(--ima-ok)}
.ima-modal.ima-account-modal{width:min(560px,100%);max-height:min(760px,calc(100vh - 48px));overflow:auto}.ima-setup-section{margin:4px 0 14px;padding-bottom:14px;border-bottom:1px solid var(--ima-line)}
.ima-account-settings{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ima-account-settings.compact{grid-template-columns:1fr}.ima-picker-field{display:flex;min-width:0;flex-direction:column;gap:7px}.ima-picker-field.wide{grid-column:1/-1}.ima-picker-label{color:var(--ima-muted);font-size:12px;font-weight:550}.ima-account-picker{width:100%}.ima-account-picker .ima-chip-btn{width:100%;height:auto;min-height:44px;justify-content:flex-start;padding:8px 12px;border:1px solid var(--ima-line);border-radius:9px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04));color:var(--ima-text);font-size:13px;text-align:left}.ima-account-picker .ima-chip-btn:hover,.ima-account-picker.is-open .ima-chip-btn{border-color:var(--ima-accent);background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04));box-shadow:0 0 0 2px color-mix(in srgb,var(--ima-accent) 18%,transparent)}.ima-account-picker .ima-chip-label{flex:1}.ima-account-picker .ima-chip-btn em{margin-left:auto}.ima-account-picker .ima-chip-menu{width:100%;min-width:100%;max-height:min(320px,calc(100vh - 120px))}.ima-account-picker.ima-model-select .ima-chip-btn{border-radius:9px}.ima-account-picker.ima-model-select .ima-chip-menu{width:max(100%,320px);min-width:100%}.ima-account-settings .ima-chip-dialog{grid-column:1/-1;margin-top:0}.ima-picker-note{grid-column:1/-1;color:var(--ima-muted);font-size:11px;line-height:1.5}.ima-picker-note.warning{color:var(--ima-warning)}
@media(max-width:1280px){[role="dialog"][aria-labelledby]:has(.ima-account-page){width:min(920px,calc(100vw - 48px));max-width:min(920px,calc(100vw - 48px))}.ima-account-shell{grid-template-columns:minmax(300px,340px) minmax(320px,1fr)}}
@media(max-width:850px){[role="dialog"][aria-labelledby]:has(.ima-account-page){width:calc(100vw - 32px);max-width:calc(100vw - 32px)}.ima-account-shell{grid-template-columns:1fr}.ima-platforms{border-right:0;border-bottom:1px solid var(--ima-line)}.ima-inspector{padding:18px}}
@media(max-width:620px){.ima-account-settings{grid-template-columns:1fr}.ima-picker-field.wide{grid-column:auto}.ima-account-picker.ima-model-select .ima-chip-menu{width:100%}}
@media (prefers-reduced-motion:reduce){.ima-switch i{transition:none}}
`;

    const TITLE_LINK_CSS = ".ima-title-row{display:flex;align-items:center;gap:8px;min-width:0}.ima-title-links{display:flex;align-items:center;gap:4px}.ima-title-link{display:inline-flex;align-items:center;gap:5px;min-height:28px;padding:0 8px;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;font-size:12px;font-weight:500;line-height:18px;text-decoration:none;white-space:nowrap}.ima-title-link:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.ima-title-link:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary);outline-offset:2px}.ima-title-link svg{flex:none}@media(max-width:720px){.ima-title-row{flex-wrap:wrap}}";

    let styleEl = null;
    const ensureStyle = () => {
      if (styleEl && styleEl.isConnected) return;
      styleEl = document.createElement("style");
      styleEl.textContent = CSS + TITLE_LINK_CSS;
      document.head.appendChild(styleEl);
    };

    const api = (path, opts) => {
      const request = Object.assign({}, opts || {});
      const method = String(request.method || "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        request.headers = Object.assign({ "content-type": "application/json" }, request.headers || {}, { "x-dsh-im-connect-client": "1" });
        if (request.body === undefined) request.body = "{}";
      }
      return fetch(API_BASE + path, request).then((r) => r.json());
    };

    const storedAccountSelection = () => {
      try { return window.localStorage.getItem(ACCOUNT_SELECTION_KEY) || ""; }
      catch { return ""; }
    };
    const rememberAccountSelection = (id) => {
      try {
        if (id) window.localStorage.setItem(ACCOUNT_SELECTION_KEY, id);
        else window.localStorage.removeItem(ACCOUNT_SELECTION_KEY);
      } catch { /* Local storage can be unavailable in restricted browser contexts. */ }
    };

    function BrandMark({ id, compact }) {
      const svg = (viewBox, children) => h("svg", {
        viewBox,
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        "aria-hidden": "true",
      }, children);

      if (id === "dingtalk") {
        return svg("6 6 36 36", [
          h("rect", { key: "bg", x: 6, y: 6, width: 36, height: 36, rx: 8, fill: "#0285fc" }),
          h("path", { key: "mark", d: "m20.178 37.577 3.5-6h-3l2-3c-5.5-1-6.281-3.938-6-4.5.162-.325 2.5 1 6.281 1-8.281-.5-8.281-7-7.781-7.5.423-.424 2.44 1.666 6.564 3.53-9.126-4.314-6.453-11.956-5.064-11.03 3.344 3 9.5 8.5 15 13 .658.538 1 2 0 3.25s-2.5 2.75-3 3.25h2.5z", fill: "#fff" }),
        ]);
      }

      if (id === "feishu" || id === "lark") {
        return svg("0 0 48 48", [
          h("path", { key: "wing", d: "M10 8c0 1 7 3.5 14.745 16.744 0 0 4.184-4.363 6.255-5.744 1.5-1 2.712-1.332 2.712-1.332C33.712 15.156 29.5 8 28 8z", fill: "#00d6b9" }),
          h("path", { key: "head", d: "M43.5 18.5c-1-.667-3.65-1.771-6.5-1.5a15 15 0 0 0-3.288.668S32.5 18 31 19c-2.07 1.38-6.255 5.744-6.255 5.744-1.428 1.397-3.05 2.732-5.245 3.756 0 0 7 3 11.5 3 5.063 0 7-3.5 7-3.5 1.5-3.305 3.5-7 5.5-9.5", fill: "#163c9a" }),
          h("path", { key: "body", d: "M4 17.5v17c0 1 6 5.5 15 5.5 10 0 17.05-7.705 19-12 0 0-1.937 3.5-7 3.5-4.5 0-11.5-3-11.5-3-5.117-2.239-10.03-6.577-12.906-9.117C4.974 17.953 4 17.093 4 17.5", fill: "#3370ff" }),
        ]);
      }

      if (id === "weixin") {
        return svg("0 0 48 48", [
          h("path", { key: "left", fillRule: "evenodd", clipRule: "evenodd", d: "M32.8 18.003 32.5 18C25.732 18 20 22.798 20 29c0 1.007.151 1.976.433 2.894A18 18 0 0 1 18.5 32c-1.809 0-3.54-.274-5.137-.775-.394-.123-1.828.696-3.039 1.389-.927.53-1.724.986-1.824.886-.094-.094.169-.718.476-1.448.446-1.06.986-2.346.664-2.552C6.21 27.305 4 23.866 4 20c0-6.627 6.492-12 14.5-12 7.186 0 13.151 4.326 14.3 10.003M16 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0m7 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4", fill: "#07C160" }),
          h("path", { key: "right", fillRule: "evenodd", clipRule: "evenodd", d: "M44 29c0 3.362-1.908 6.336-4.833 8.149-.13.08.169.858.446 1.583.237.618.459 1.196.387 1.268-.075.075-.802-.327-1.571-.752-.829-.458-1.706-.942-1.871-.888-1.262.413-2.63.64-4.058.64C26.149 39 21 34.523 21 29s5.149-10 11.5-10S44 23.477 44 29m-6-3.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0M28.5 27a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3", fill: "#07C160" }),
        ]);
      }

      if (id === "wecom") {
        return svg(compact ? "4 6 39 34" : "0 0 46 46", [
          !compact && h("path", { key: "bg", d: "M39.743 0H6.257A6.257 6.257 0 0 0 0 6.257v33.487A6.257 6.257 0 0 0 6.257 46h33.487A6.257 6.257 0 0 0 46 39.743V6.257A6.257 6.257 0 0 0 39.743 0", fill: "#fff" }),
          h("path", { key: "orange", d: "M28.856 31.647a.483.483 0 0 0 .06.738 6.2 6.2 0 0 1 1.911 3.725 2.02 2.02 0 1 0 2.16-2.54 6.2 6.2 0 0 1-3.448-1.922.483.483 0 0 0-.683-.001", fill: "#fb6500" }),
          h("path", { key: "blueDot", d: "M37.057 28.448a2 2 0 0 0-.58 1.215 6.2 6.2 0 0 1-1.918 3.454.484.484 0 1 0 .738.616 6.2 6.2 0 0 1 3.725-1.91 2.02 2.02 0 1 0-1.96-3.376z", fill: "#0082ef" }),
          h("path", { key: "green", d: "M31.366 22.75a2.02 2.02 0 0 0 1.215 3.435 6.2 6.2 0 0 1 3.454 1.918.483.483 0 0 0 .829-.27.48.48 0 0 0-.212-.468 6.2 6.2 0 0 1-1.911-3.726 2.02 2.02 0 0 0-3.375-.889", fill: "#2dbc00" }),
          h("path", { key: "yellow", d: "m30.374 25.907-.037.037a6.2 6.2 0 0 1-3.78 1.978 2.007 2.007 0 0 0-.895 3.374 2.02 2.02 0 0 0 3.435-1.216 6.2 6.2 0 0 1 1.923-3.453.484.484 0 0 0-.646-.72", fill: "#fc0" }),
          h("path", { key: "bubble", d: "M18.17 8.471c-3.624.4-6.908 1.948-9.266 4.367-.938.956-1.7 2.032-2.262 3.182a11.08 11.08 0 0 0 .78 11.188c.64.968 1.693 2.178 2.654 3.037l-.435 3.423-.048.145c-.012.042-.012.09-.018.133l-.012.108.012.11a1.1 1.1 0 0 0 1.657.852h.018l.067-.049 1.04-.52 3.102-1.56a16 16 0 0 0 4.537.623c1.897.004 3.78-.323 5.564-.968a2.014 2.014 0 0 1-1.373-2.11 13.7 13.7 0 0 1-5.721.568l-.309-.042a14 14 0 0 1-2.056-.43 1.4 1.4 0 0 0-1.1.116l-.085.042-2.552 1.5-.109.066c-.06.036-.09.048-.12.048a.176.176 0 0 1-.164-.181l.097-.393.115-.43.181-.707.212-.787a1.07 1.07 0 0 0-.387-1.19 11.2 11.2 0 0 1-2.577-2.686 8.73 8.73 0 0 1-.629-8.818c.46-.92 1.065-1.773 1.815-2.54 1.935-1.997 4.657-3.267 7.669-3.593a14.3 14.3 0 0 1 3.132 0c2.994.344 5.704 1.633 7.627 3.617a10 10 0 0 1 1.796 2.551 8.7 8.7 0 0 1 .901 3.84c0 .14-.012.279-.018.412a2.015 2.015 0 0 1 2.48.29l.09.109a11 11 0 0 0-1.1-5.733 12.3 12.3 0 0 0-2.238-3.182 15.18 15.18 0 0 0-9.229-4.397 17 17 0 0 0-3.739-.01", fill: "#0082ef" }),
        ]);
      }

      if (id === "qq") {
        return svg("0 0 24 24", [
          h("path", { key: "mark", fill: "#12B7F5", d: "M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673" }),
        ]);
      }

      if (id === "telegram") {
        return svg("0 0 24 24", [
          h("path", { key: "mark", fill: "#26A5E4", d: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" }),
        ]);
      }

      return svg("0 0 24 24", [
        h("circle", { key: "bg", cx: 12, cy: 12, r: 12, fill: "#8b949e" }),
      ]);
    }

    function Logo({ id, small }) {
      return h("div", { className: small ? "ima-logo sm" : "ima-logo", "data-brand": id, "aria-hidden": "true" }, h(BrandMark, { id, compact: small }));
    }

    function isRasterQr(value) {
      return typeof value === "string" && (/^data:image\//i.test(value) || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(value));
    }

    function qrSrc(pairing) {
      if (!pairing) return "";
      if (isRasterQr(pairing.qrImage)) return pairing.qrImage;
      return "";
    }

    const SERVER_TEXT_KEYS = new Map([
      ["未知渠道", "server.unknownChannel"], ["渠道未配置", "server.channelUnconfigured"], ["会话不存在", "server.sessionMissing"],
      ["账号不存在", "server.accountMissing"], ["账号连接失败，请查看本机日志", "server.accountConnectFailed"], ["重新连接失败，请查看本机日志", "server.accountReconnectFailed"],
      ["请选择提供商、模型、工作区或权限", "server.selectAccountSettings"], ["请选择提供商和模型", "server.selectModel"], ["请选择工作区", "server.selectWorkspace"], ["请选择权限", "server.selectPermission"], ["凭据不足，无法启动渠道", "server.missingCredentials"],
      ["该渠道不支持扫码绑定", "server.qrUnsupported"], ["二维码已过期", "server.qrExpired"], ["扫码未完成", "server.qrIncomplete"],
      ["未授权：请管理员在设置 → IM助理 中批准你的访问。", "server.accessDenied"],
      ["未连接", "account.statusNotConnected"], ["已断开", "status.disconnected"], ["重连失败", "status.reconnectFailed"], ["连接中", "status.connectingSocket"], ["等待网关握手", "status.waitHandshake"],
      ["鉴权中", "status.authenticating"], ["已连接", "status.connected"], ["重连中", "status.reconnecting"], ["连接错误", "status.connectionError"], ["连接失败", "status.connectionFailed"],
      ["Stream 已连接", "status.streamConnected"], ["已停止", "status.stopped"], ["长连接已建立", "status.longConnection"], ["轮询中", "status.polling"],
      ["未登录", "status.notLoggedIn"], ["等待扫码", "status.waitQr"], ["已登录", "status.loggedIn"], ["已登录（自动恢复）", "status.loggedInRecovered"], ["登录中", "status.loggingIn"],
    ]);
    function serverText(value, t) {
      const text = value == null ? "" : String(value);
      const key = SERVER_TEXT_KEYS.get(text);
      if (key) return t(key);
      // Server adapters return diagnostics, not locale keys. Do not leak a
      // Chinese diagnostic into an English UI; the detailed value remains in
      // the server log while the browser gets a usable localized fallback.
      if (/[\u3400-\u9fff]/.test(text) && t("settings.label") === "IM Assistant") return t("error.detailsInLog");
      return value;
    }
    function channelLabel(ch, t) {
      const key = "channel." + ch.id;
      const translated = t(key);
      return translated === key ? (ch.label || ch.id) : translated;
    }
    function accountLabel(account, t) {
      if (!account || !account.autoName) return account && (account.name || account.id) || "";
      return t("account.defaultName", {
        channel: channelLabel({ id: account.platform, label: account.platform }, t),
        count: account.nameOrdinal || 1,
      });
    }
    function fieldLabel(ch, field, t) {
      const key = "field." + ch.id + "." + field.key;
      const translated = t(key);
      return translated === key ? field.label : translated;
    }
    function hintOf(ch, t) {
      const key = "qr." + ch.id;
      const translated = t(key);
      return translated === key ? t("qr.default") : translated;
    }

    let openImSession = (id) => {
      try {
        if (window.__dshSessionsOpen) { window.__dshSessionsOpen(id); return true; }
      } catch { /* ignore */ }
      return false;
    };
    const openListedSession = (id, hostOpen) => {
      if (!id) return;
      if (String(id).startsWith("im:")) {
        api("/sessions/ensure", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: id }),
        }).then((data) => {
          if (!data.ok) { console.warn("[dsh-im-connect] 无法恢复会话", data.error || id); return; }
          const tryOpen = (left) => {
            if (openImSession(id) || left <= 0) return;
            setTimeout(() => tryOpen(left - 1), 80);
          };
          tryOpen(20);
        }).catch((error) => console.warn("[dsh-im-connect] 无法恢复会话", id, error));
        return;
      }
      if (typeof hostOpen === "function") hostOpen(id);
      else openImSession(id);
    };
    let channelSkin = "native";

    function BindModal({ ch, onClose, onConnected, catalog, permissions, workspaces, defaults, createWorkspace, pickDirectory, modelT, permissionT, t = fallbackT }) {
      const hasQr = ch.kind === "qr" || ch.kind === "qr-or-credentials";
      const hasManual = ch.kind === "credentials" || ch.kind === "qr-or-credentials";
      const [tab, setTab] = useState(hasQr ? "qr" : "manual");
      const [pairing, setPairing] = useState(null);
      const [qrStarted, setQrStarted] = useState(false);
      const [draft, setDraft] = useState({});
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState("");
      const [success, setSuccess] = useState("");
      const [settings, setSettings] = useState(() => ({
        cwd: defaults && defaults.cwd || "",
        provider: defaults && defaults.assistant && defaults.assistant.provider || "",
        model: defaults && defaults.assistant && defaults.assistant.model || "",
        reasoningEffort: defaults && defaults.assistant && defaults.assistant.reasoningEffort || "",
        permission: defaults && defaults.permission || "",
        privateAccess: "approved",
      }));
      const alive = useRef(true);

      const startQr = useCallback((refresh) => {
        if (!hasQr) return;
        setQrStarted(true);
        setBusy(true);
        setError("");
        setSuccess("");
        api(`/channels/${ch.id}/qr/${refresh ? "refresh" : "start"}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ settings }),
        }).then((data) => {
          if (!alive.current) return;
          if (!data.ok && !data.pairing) setError(serverText(data.error, t) || t("error.qr"));
          setPairing(data.pairing || null);
        }).catch(() => { if (alive.current) setError(t("error.qr")); })
          .finally(() => { if (alive.current) setBusy(false); });
      }, [ch.id, hasQr, settings]);

      useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
      }, []);

      const finished = useRef(false);
      const onConnectedRef = useRef(onConnected);
      onConnectedRef.current = onConnected;
      const finish = (delayMs) => {
        if (finished.current) return;
        finished.current = true;
        alive.current = false;
        window.setTimeout(() => onConnectedRef.current(), delayMs);
      };

      useEffect(() => {
        if (tab !== "qr" || !qrStarted) return undefined;
        const timer = setInterval(() => {
          api(`/channels/${ch.id}/qr/status`).then((data) => {
            if (finished.current || !alive.current || !data.ok) return;
            setPairing(data.pairing);
            if (data.pairing && data.pairing.status === "success") finish(800);
          }).catch(() => undefined);
        }, 2000);
        return () => clearInterval(timer);
      }, [tab, ch.id, qrStarted]);

      const status = qrStarted && pairing && pairing.status;
      const saving = status === "saving";
      const close = () => {
        if (finished.current || saving) return;
        alive.current = false;
        if (hasQr) api("/channels/" + ch.id + "/qr/cancel", { method: "POST" }).catch(() => undefined);
        onClose();
      };
      const onCloseRef = useRef(onClose);
      onCloseRef.current = onClose;
      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
          if (saving) return;
          alive.current = false;
          if (hasQr) api("/channels/" + ch.id + "/qr/cancel", { method: "POST" }).catch(() => undefined);
          onCloseRef.current();
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
      }, [hasQr, ch.id, saving]);

      const saveManual = () => {
        const config = { ...draft };
        setBusy(true);
        setError("");
        setSuccess("");
        api(`/channels/${ch.id}/connect`, {
          method: "POST",
          headers: { "content-type": "application/json" },
           body: JSON.stringify({ config, settings }),
        }).then((data) => {
          if (!data.ok) setError(serverText(data.error, t) || t("error.save"));
          else {
            setSuccess(data.newIdentity ? t("bind.newIdentity") : t("bind.success"));
            finish(data.newIdentity ? 1400 : 500);
          }
        }).catch(() => setError(t("error.save"))).finally(() => setBusy(false));
      };

      const switchTab = (next) => {
        if (saving) return;
        setTab(next);
        setError("");
        setSuccess("");
        if (next !== "qr") {
          setQrStarted(false);
          setPairing(null);
          api(`/channels/${ch.id}/qr/cancel`, { method: "POST" }).catch(() => undefined);
        }
      };

      const src = qrStarted ? qrSrc(pairing) : "";
      const remain = qrStarted && pairing && pairing.remainingSeconds;

      return h("div", { className: "ima-mask", role: "presentation", onMouseDown: (event) => event.stopPropagation(), onClick: (event) => { event.stopPropagation(); close(); }, onKeyDown: (event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } } },
        h("div", { className: "ima-modal ima-account-modal", onClick: (e) => e.stopPropagation() },
          h("div", { className: "ima-modal-h" },
            h("h2", null, t("bind.title", { channel: channelLabel(ch, t) })),
            h("button", { className: "ima-x", disabled: saving, onClick: close, "aria-label": t("bind.close") }, "×"),
          ),
          hasQr && hasManual && h("div", { className: "ima-seg" },
            h("button", { className: tab === "qr" ? "on" : "", disabled: saving, onClick: () => switchTab("qr") }, t("bind.quick")),
            h("button", { className: tab === "manual" ? "on" : "", disabled: saving, onClick: () => switchTab("manual") }, t("bind.manual")),
          ),
          error && h("div", { className: "ima-error" }, error),
          success && h("div", { className: "ima-ok" }, success),
          h("div", { className: "ima-setup-section" },
            h(AccountSettingsPicker, {
              value: settings,
              onChange: (patch) => setSettings((current) => ({ ...current, ...patch })),
              catalog,
              permissions,
              workspaces,
              createWorkspace,
              pickDirectory,
              modelT,
              permissionT,
              showAutoNameNote: true,
              t,
            }),
          ),
          tab === "qr" && hasQr && (
            status === "success"
              ? h("div", { className: "ima-ok" }, t("bind.success"))
              : status === "saving"
                ? h("div", { className: "ima-bind-status" }, t("bind.saving"))
              : src
                ? h("div", { className: "ima-qrbox" },
                  h("p", { className: "ima-hint" }, hintOf(ch, t)),
                  h("img", { src, alt: t("bind.qrAlt", { channel: channelLabel(ch, t) }) }),
                  remain > 0 && h("p", { className: "ima-hint" }, t("bind.expire", { time: Math.floor(remain / 60) + ":" + String(remain % 60).padStart(2, "0") })),
                  status === "scanned" && h("p", { className: "ima-hint" }, t("bind.scanned")),
                  (status === "expired" || status === "failed") && h("p", { className: "ima-error" }, serverText(pairing && pairing.error, t) || t("bind.retry")),
                  h("button", { className: "ima-btn", disabled: busy, onClick: () => startQr(true) }, t("bind.refresh")),
                )
                : h("div", { className: "ima-bind-ready" },
                    h("p", { className: "ima-hint" }, hintOf(ch, t)),
                    (busy || status === "starting") && h("div", { className: "ima-bind-status" }, t("bind.generating")),
                    (status === "expired" || status === "failed") && h("div", { className: "ima-error" }, serverText(pairing && pairing.error, t) || t("bind.retry")),
                    h("button", { className: "ima-btn primary", disabled: busy || !settings.cwd || !settings.provider || !settings.model || !settings.permission, onClick: () => startQr(qrStarted) }, busy ? t("bind.generating") : qrStarted ? t("bind.refresh") : t("action.generateQr")),
                  )
          ),
          tab === "manual" && hasManual && h("div", null,
            ...ch.fields.map((f) => h("label", { key: f.key, className: "ima-field" },
              fieldLabel(ch, f, t),
              h("input", {
                type: f.secret ? "password" : "text",
                value: draft[f.key] || "",
                placeholder: fieldLabel(ch, f, t),
                onChange: (e) => setDraft({ ...draft, [f.key]: e.target.value }),
              }),
            )),
            h("div", { style: { display: "flex", justifyContent: "flex-end" } },
              h("button", { className: "ima-btn primary", disabled: busy, onClick: saveManual }, busy ? t("action.saving") : t("action.confirm")),
            ),
          ),
        ),
      );
    }

    function ChannelCard({ ch, busy, onAction, onConfigure, t = fallbackT }) {
      const [menu, setMenu] = useState(false);
      const menuRoot = useRef(null);
      useEffect(() => {
        if (!menu) return undefined;
        const close = (event) => {
          if (menuRoot.current && menuRoot.current.contains(event.target)) return;
          setMenu(false);
        };
        const onKey = (event) => {
          if (event.key === "Escape") setMenu(false);
        };
        document.addEventListener("pointerdown", close, true);
        document.addEventListener("keydown", onKey);
        return () => {
          document.removeEventListener("pointerdown", close, true);
          document.removeEventListener("keydown", onKey);
        };
      }, [menu]);

      const configuring = !ch.connected;
      const meta = configuring ? t("status.unconfigured") : (ch.status && ch.status !== "未连接" ? serverText(ch.status, t) : t("status.connected"));
      const right = h("div", { className: "ima-actions", ref: menuRoot },
        configuring
          ? h("button", { className: "ima-btn", disabled: busy, onClick: onConfigure }, busy ? t("status.connecting") : t("action.configure"))
          : [
            h("button", { key: "more", className: "ima-more", "aria-label": t("action.more", { channel: channelLabel(ch, t) }), "aria-expanded": menu, onClick: (event) => { event.stopPropagation(); setMenu(!menu); } }, "…"),
            menu && h("div", { key: "menu", className: "ima-menu", "data-ima-card-menu": "", onClick: (event) => event.stopPropagation() },
              h("button", { onClick: () => { setMenu(false); onConfigure(); } }, t("action.reconnect")),
              h("button", { onClick: () => { setMenu(false); onAction(ch.id, "disconnect"); } }, t("action.disconnect")),
              h("button", { onClick: () => { setMenu(false); onAction(ch.id, "remove"); } }, t("action.removeConfig")),
            ),
            h("button", {
              key: "sw",
              className: ch.receiveEnabled ? "ima-switch" : "ima-switch off",
              role: "switch",
              "aria-checked": ch.receiveEnabled,
              "aria-label": t("action.receive"),
              onClick: () => onAction(ch.id, "receive", { receiveEnabled: !ch.receiveEnabled }),
            }, h("i")),
          ],
      );

      return h("div", { className: "ima-card", title: channelLabel(ch, t) },
        h("div", { className: "ima-card-main" },
          h("div", { className: "ima-name-row" },
            h(Logo, { id: ch.id }),
            h("span", { className: "ima-name" }, channelLabel(ch, t)),
            ch.connected && h("span", { className: "ima-badge" }, t("status.connected")),
            h("span", { className: "ima-status" }, meta),
          ),
        ),
        right,
      );
    }

    const BUILT_IN_PERMISSION_LABELS = new Map([
      ["read-only", ["permission.readOnly", "Read Only"]],
      ["workspace-write", ["permission.workspaceWrite", "Workspace Write"]],
      ["danger-full-access", ["permission.fullAccess", "Full access"]],
    ]);

    function permissionLabel(option, t) {
      const builtIn = BUILT_IN_PERMISSION_LABELS.get(option.value);
      if (builtIn && (option.name === option.value || option.name === builtIn[1])) return t(builtIn[0]);
      return option.name || option.value;
    }
    function FolderIcon() {
      return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", "aria-hidden": "true" },
        h("path", { d: "M5.196 1.571c.615 0 1.19.308 1.532.819l.471.708c.086.128.23.205.383.205h4.588A2.666 2.666 0 0 1 14.586 5.72v.907c.683.4 1.074 1.223.852 2.06l-1.053 3.971A2.666 2.666 0 0 1 12.05 14.453H2.917A2.416 2.416 0 0 1 .502 11.952V3.987A2.416 2.416 0 0 1 2.918 1.571h2.278Z", fill: "currentColor" }),
      );
    }

    function ShieldIcon() {
      return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", "aria-hidden": "true" },
        h("path", { d: "M8 1.25 14.1 3.15v4.25c0 3.55-2.18 6.15-6.1 7.5-3.92-1.35-6.1-3.95-6.1-7.5V3.15L8 1.25Z", stroke: "currentColor", strokeWidth: "1.4", strokeLinejoin: "round" }),
        h("path", { d: "m5.55 8.05 1.55 1.55 3.35-3.55", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }),
      );
    }

    function PlusIcon() {
      return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", "aria-hidden": "true" },
        h("path", { d: "M8 3v10M3 8h10", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }),
      );
    }

    function ChipMenu(props) {
      const root = useRef(null);
      useEffect(() => {
        if (!props.open) return undefined;
        const close = (event) => {
          if (root.current && root.current.contains(event.target)) return;
          props.onToggle(false);
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
      }, [props.open]);
      return h("div", { className: "ima-chip" + (props.className ? " " + props.className : "") + (props.open ? " is-open" : ""), ref: root },
        h("button", {
          type: "button",
          className: "ima-chip-btn",
          title: props.title || undefined,
          "aria-label": props.ariaLabel,
          "aria-expanded": Boolean(props.open),
          onMouseDown: (event) => event.stopPropagation(),
          onClick: () => props.onToggle(!props.open),
        },
          props.icon,
          h("span", { className: "ima-chip-label" }, props.label),
          props.suffix && h("span", { className: "ima-chip-effort" }, props.suffix),
          h("em"),
        ),
        props.open && h("div", { className: "ima-chip-menu" + (props.menuClassName ? " " + props.menuClassName : "") + (props.align === "end" ? " is-end" : ""), role: "menu", "aria-label": props.menuAria }, props.children),
      );
    }

    function ModelChoiceRow(props) {
      return h("button", {
        type: "button",
        className: "ima-model-option",
        role: "menuitemradio",
        "aria-checked": props.active,
        onClick: props.onClick,
      },
        h("span", { className: "ima-model-option-copy" },
          h("span", { className: "ima-model-name" }, props.label),
          props.description && h("span", { className: "ima-model-description" }, props.description),
        ),
        h("span", { className: "ima-model-check" }, props.active && h("i", { className: "ima-chip-tick" })),
      );
    }

    function ChipRow(props) {
      return h("button", {
        type: "button",
        className: "ima-chip-row" + (props.active ? " is-on" : "") + (props.kv ? " is-kv" : ""),
        role: "menuitem",
        onClick: props.onClick,
      },
        h("span", { className: "ima-chip-row-main" },
          props.icon,
          h("span", null, props.label),
        ),
        h("span", { className: "ima-chip-row-side" },
          props.hint && h("span", null, props.hint),
          props.active && !props.chevron && h("i", { className: "ima-chip-tick" }),
          props.chevron && h("i", { className: "ima-chip-next" }),
        ),
      );
    }

    function AccountSettingsPicker(props) {
      const t = props.t || fallbackT;
      const modelT = props.modelT || ((key) => key);
      const permissionT = props.permissionT || ((key) => key);
      const value = props.value || {};
      const [open, setOpen] = useState("");
      const [modelPane, setModelPane] = useState("root");
      const [adding, setAdding] = useState(false);
      const [addPath, setAddPath] = useState("");
      const [addBusy, setAddBusy] = useState(false);
      const [hint, setHint] = useState("");
      const [confirmingFullAccess, setConfirmingFullAccess] = useState(false);
      const [fullAccessAcknowledged, setFullAccessAcknowledged] = useState(false);
      const items = props.workspaces || [];
      const providers = props.catalog || [];
      const permissions = props.permissions || [];
      const provider = value.provider || (value.assistant && value.assistant.provider) || "";
      const model = value.model || (value.assistant && value.assistant.model) || "";
      const effort = value.reasoningEffort || (value.assistant && value.assistant.reasoningEffort) || "";
      const cwd = value.cwd || "";
      const permission = value.permission || "";
      const privateAccess = value.privateAccess === "all" ? "all" : "approved";
      const workspace = items.find((item) => item.path === cwd);
      const modelGroups = providers.map((item) => ({
        id: item.id,
        name: item.name || item.id,
        models: (item.models || []).map((entry) => ({
          value: item.id + "::" + entry.id,
          provider: item.id,
          providerName: item.name || item.id,
          model: entry.id,
          label: entry.name || entry.id,
          description: entry.description,
          reasoning: entry.reasoning,
        })),
      })).filter((item) => item.models.length > 0);
      const models = modelGroups.flatMap((item) => item.models);
      const currentModel = models.find((item) => item.provider === provider && item.model === model);
      const reasoning = currentModel && currentModel.reasoning;
      const effectiveEffort = effort || (reasoning && reasoning.defaultEffort) || "";
      const efforts = reasoning
        ? [
            ...(reasoning.defaultEffort ? [] : [{ id: "", name: modelT("effort.providerDefault") }]),
            ...((reasoning.efforts || []).map((item) => ({ id: item.id, name: item.name || item.id, description: item.description }))),
          ]
        : [];
      const effortLabel = reasoning
        ? ((efforts.find((item) => item.id === effectiveEffort) || {}).name || effectiveEffort || modelT("effort.providerDefault"))
        : "";
      const permissionOptions = permissions.map((item) => ({ ...item, label: permissionLabel(item, t) }));
      const currentPermission = permissionOptions.find((item) => item.value === permission);
      const update = (patch) => {
        setHint("");
        if (typeof props.onChange === "function") props.onChange(patch);
      };

      const addWorkspace = (path) => {
        const next = (path || "").trim();
        if (!next) { setHint(t("error.chooseWorkspace")); return Promise.resolve(); }
        if (typeof props.createWorkspace !== "function") { setHint(t("error.workspaceUnavailable")); return Promise.resolve(); }
        setAddBusy(true);
        return Promise.resolve(props.createWorkspace({ path: next })).then((created) => {
          const cwdPath = (created && (created.path || created.cwd)) || next;
          update({ cwd: cwdPath });
          setAdding(false);
          setAddPath("");
          setOpen("");
        }).catch((error) => setHint((error && error.message) || t("error.addWorkspace")))
          .finally(() => setAddBusy(false));
      };
      const onAddWorkspace = () => {
        setOpen("");
        if (typeof props.pickDirectory === "function") {
          Promise.resolve(props.pickDirectory()).then((picked) => picked && addWorkspace(picked)).catch(() => {
            setAdding(true);
            setAddPath("");
          });
          return;
        }
        setAdding(true);
        setAddPath("");
      };
      const selectPermission = (next) => {
        setOpen("");
        if (next === permission) return;
        if (next === "danger-full-access") {
          setFullAccessAcknowledged(false);
          setConfirmingFullAccess(true);
          return;
        }
        update({ permission: next });
      };
      const field = (key, label, picker, wide) => h("div", { key, className: "ima-picker-field" + (wide ? " wide" : "") },
        h("span", { className: "ima-picker-label" }, label),
        picker,
      );

      return h("div", { className: "ima-account-settings" + (props.compact ? " compact" : "") },
        field("workspace", props.workspaceLabel || t("account.workspace"), h(ChipMenu, {
          open: open === "workspace",
          onToggle: (next) => setOpen(next ? "workspace" : ""),
          icon: h(FolderIcon),
          label: (workspace && (workspace.title || workspace.path)) || cwd || t("account.selectWorkspace"),
          ariaLabel: props.workspaceLabel || t("account.workspace"),
          className: "ima-account-picker",
        },
          items.length === 0 && h("div", { className: "ima-chip-empty" }, t("composer.noWorkspaces")),
          ...items.map((item) => h(ChipRow, {
            key: item.path,
            icon: h(FolderIcon),
            label: item.title || item.path,
            hint: item.title ? item.path : "",
            active: item.path === cwd,
            onClick: () => { update({ cwd: item.path }); setOpen(""); },
          })),
          h("div", { className: "ima-chip-split" }),
          h(ChipRow, { icon: h(PlusIcon), label: t("composer.addWorkspace"), onClick: onAddWorkspace }),
        ), true),
        field("model", modelT("menu.model"), h(ChipMenu, {
          open: open === "model",
          onToggle: (next) => { setOpen(next ? "model" : ""); if (next) setModelPane("root"); },
          icon: null,
          label: (currentModel && currentModel.label) || t("account.selectModel"),
          title: currentModel && currentModel.label,
          suffix: effortLabel,
          ariaLabel: modelT("trigger.selectAria"),
          menuAria: modelT("menu.aria"),
          className: "ima-account-picker ima-model-select",
          menuClassName: "ima-model-menu",
        },
          modelPane === "root" && [
            h(ChipRow, { key: "model", kv: true, label: modelT("menu.model"), hint: (currentModel && currentModel.label) || t("account.selectModel"), chevron: true, onClick: () => setModelPane("model") }),
            reasoning && h(ChipRow, { key: "effort", kv: true, label: modelT("menu.effort"), hint: effortLabel || modelT("effort.providerDefault"), chevron: true, onClick: () => setModelPane("effort") }),
          ],
          modelPane === "model" && (models.length === 0
            ? h("div", { className: "ima-chip-empty" }, modelT("empty.models"))
            : modelGroups.map((group) => h("section", { key: group.id, className: "ima-model-group", role: "group", "aria-label": group.name },
                h("div", { className: "ima-model-group-title" }, group.name),
                ...group.models.map((item) => h(ModelChoiceRow, {
                  key: item.value,
                  label: item.label,
                  description: item.description,
                  active: item.provider === provider && item.model === model,
                  onClick: () => {
                    const nextEffort = (item.reasoning && item.reasoning.defaultEffort) || "";
                    update({ provider: item.provider, model: item.model, reasoningEffort: nextEffort });
                    setOpen("");
                  },
                })),
              ))),
          modelPane === "effort" && efforts.map((item) => h(ModelChoiceRow, {
            key: item.id,
            label: item.name,
            description: item.description,
            active: item.id === effectiveEffort,
            onClick: () => { update({ provider, model, reasoningEffort: item.id }); setOpen(""); },
          })),
        )),
        field("permission", t("composer.permission"), h(ChipMenu, {
          open: open === "permission",
          onToggle: (next) => setOpen(next ? "permission" : ""),
          icon: h(ShieldIcon),
          label: (currentPermission && currentPermission.label) || t("account.selectPermission"),
          ariaLabel: t("composer.permission"),
          className: "ima-account-picker",
        },
          ...permissionOptions.map((item) => h(ChipRow, {
            key: item.value,
            icon: h(ShieldIcon),
            label: item.label,
            active: item.value === permission,
            onClick: () => selectPermission(item.value),
          })),
        )),
        field("private", t("account.privateAccess"), h(ChipMenu, {
          open: open === "private",
          onToggle: (next) => setOpen(next ? "private" : ""),
          icon: h(ShieldIcon),
          label: privateAccess === "all" ? t("account.privateAll") : t("account.privateApproved"),
          ariaLabel: t("account.privateAccess"),
          className: "ima-account-picker",
        },
          h(ChipRow, { icon: h(ShieldIcon), label: t("account.privateApproved"), active: privateAccess === "approved", onClick: () => { update({ privateAccess: "approved" }); setOpen(""); } }),
          h(ChipRow, { icon: h(ShieldIcon), label: t("account.privateAll"), active: privateAccess === "all", onClick: () => { update({ privateAccess: "all" }); setOpen(""); } }),
        ), true),
        privateAccess === "all" && h("div", { className: "ima-picker-note warning" }, t("settings.publicChatNotice")),
        adding && h("div", { className: "ima-chip-dialog" },
          h("strong", null, t("composer.addWorkspace")),
          h("input", { value: addPath, placeholder: t("composer.workspacePath"), "aria-label": t("composer.workspacePath"), onChange: (event) => setAddPath(event.target.value) }),
          h("div", { className: "ima-chip-dialog-actions" },
            h("button", { className: "ima-btn", onClick: () => { setAdding(false); setAddPath(""); } }, t("action.cancel")),
            h("button", { className: "ima-btn primary", disabled: addBusy || !addPath.trim(), onClick: () => addWorkspace(addPath) }, addBusy ? t("action.adding") : t("action.confirm")),
          ),
        ),
        hint && h("div", { className: "ima-picker-note" }, hint),
        props.showAutoNameNote && h("div", { className: "ima-picker-note" }, t("account.autoNameNote")),
        h(RiskConfirmation, {
          open: confirmingFullAccess,
          title: permissionT("confirm.title"),
          description: permissionT("confirm.description"),
          acknowledgeLabel: permissionT("confirm.acknowledge"),
          cancelLabel: permissionT("confirm.cancel"),
          confirmLabel: permissionT("confirm.enable"),
          acknowledged: fullAccessAcknowledged,
          onAcknowledgedChange: setFullAccessAcknowledged,
          onCancel: () => { setFullAccessAcknowledged(false); setConfirmingFullAccess(false); },
          onConfirm: () => {
            update({ permission: "danger-full-access" });
            setFullAccessAcknowledged(false);
            setConfirmingFullAccess(false);
          },
        }),
      );
    }

    function ComposerBar(props) {
      const t = props.t || fallbackT;
      const items = typeof props.useWorkspaces === "function"
        ? (props.useWorkspaces((state) => (state && state.items) || []) || [])
        : [];
      const [providers, setProviders] = useState([]);
      const [permissions, setPermissions] = useState([]);
      const [provider, setProvider] = useState("");
      const [model, setModel] = useState("");
      const [effort, setEffort] = useState("");
      const [cwd, setCwd] = useState("");
      const [permission, setPermission] = useState("");
      const [confirmingFullAccess, setConfirmingFullAccess] = useState(false);
      const [fullAccessAcknowledged, setFullAccessAcknowledged] = useState(false);
      const [open, setOpen] = useState("");
      const [modelPane, setModelPane] = useState("root");
      const [hint, setHint] = useState("");
      const [adding, setAdding] = useState(false);
      const [addPath, setAddPath] = useState("");
      const [addBusy, setAddBusy] = useState(false);

      useEffect(() => {
        api("/assistant").then((data) => {
          if (!data.ok) { setHint(serverText(data.error, t) || t("error.loadAssistant")); return; }
          const list = data.providers || [];
          setProviders(list);
          setPermissions(data.permissions || []);
          const current = data.assistant || {};
          const nextProvider = current.provider || (list[0] && list[0].id) || "";
          const models = ((list.find((item) => item.id === nextProvider) || {}).models) || [];
          const nextModel = current.model || (models[0] && models[0].id) || "";
          const found = models.find((item) => item.id === nextModel) || models[0];
          setProvider(nextProvider);
          setModel(nextModel);
          setEffort(current.reasoningEffort || (found && found.reasoning && found.reasoning.defaultEffort) || "");
          setCwd(data.cwd || "");
          setPermission(data.permission || "");
          if (!list.length) setHint(t("error.noModels"));
        }).catch(() => setHint(t("error.loadAssistant")));
      }, []);

      const save = (body) => {
        api("/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }).then((data) => {
          if (!data.ok) setHint(serverText(data.error, t) || t("error.save"));
          else setHint("");
        }).catch(() => setHint(t("error.save")));
      };

      const workspace = items.find((item) => item.path === cwd);
      const modelGroups = providers.map((item) => ({
        id: item.id,
        name: item.name || item.id,
        models: (item.models || []).map((entry) => ({
        value: item.id + "::" + entry.id,
        provider: item.id,
        providerName: item.name || item.id,
        model: entry.id,
        label: entry.name || entry.id,
        description: entry.description,
        reasoning: entry.reasoning,
        })),
      })).filter((item) => item.models.length > 0);
      const models = modelGroups.flatMap((item) => item.models);
      const currentModel = models.find((item) => item.provider === provider && item.model === model);
      const reasoning = currentModel && currentModel.reasoning;
      const effectiveEffort = effort || (reasoning && reasoning.defaultEffort) || "";
      const efforts = reasoning
        ? [
            ...(reasoning.defaultEffort ? [] : [{ id: "", name: props.modelT("effort.providerDefault") }]),
            ...((reasoning.efforts || []).map((item) => ({ id: item.id, name: item.name || item.id, description: item.description }))),
          ]
        : [];
      const effortLabel = reasoning
        ? ((efforts.find((item) => item.id === effectiveEffort) || {}).name || effectiveEffort || props.modelT("effort.providerDefault"))
        : "";
      const permissionOptions = permissions.map((item) => ({
        ...item,
        label: permissionLabel(item, t),
      }));
      const perm = permissionOptions.find((item) => item.value === permission) || { label: permission || t("composer.permission") };
      const modelFallback = props.modelT("trigger.fallback");

      const addWorkspace = (path) => {
        const next = (path || "").trim();
        if (!next) { setHint(t("error.chooseWorkspace")); return Promise.resolve(); }
        if (typeof props.createWorkspace !== "function") { setHint(t("error.workspaceUnavailable")); return Promise.resolve(); }
        setAddBusy(true);
        return Promise.resolve(props.createWorkspace({ path: next })).then((created) => {
          const cwdPath = (created && (created.path || created.cwd)) || next;
          setCwd(cwdPath);
          save({ cwd: cwdPath });
          setAdding(false);
          setAddPath("");
          setOpen("");
        }).catch((error) => {
          setHint((error && error.message) || t("error.addWorkspace"));
        }).finally(() => setAddBusy(false));
      };

      const selectPermission = (next) => {
        setOpen("");
        if (next === permission) return;
        if (next === "danger-full-access") {
          setFullAccessAcknowledged(false);
          setConfirmingFullAccess(true);
          return;
        }
        setPermission(next);
        save({ permission: next });
      };

      const onAddWorkspace = () => {
        setOpen("");
        if (typeof props.pickDirectory === "function") {
          Promise.resolve(props.pickDirectory()).then((picked) => {
            if (!picked) return;
            return addWorkspace(picked);
          }).catch(() => {
            setAdding(true);
            setAddPath("");
          });
          return;
        }
        setAdding(true);
        setAddPath("");
      };

      return h("div", { className: "ima-composer-wrap" },
        h("div", { className: "ima-composer", "aria-label": t("composer.aria") },
          h("div", { className: "ima-composer-left" },
            h(ChipMenu, {
              open: open === "ws",
              onToggle: (next) => setOpen(next ? "ws" : ""),
              icon: h(FolderIcon),
              label: (workspace && (workspace.title || workspace.path)) || cwd || t("composer.project"),
              ariaLabel: t("composer.projectAria"),
            },
              items.length === 0 && h("div", { className: "ima-chip-empty" }, t("composer.noWorkspaces")),
              ...items.map((item) => h(ChipRow, {
                key: item.path,
                icon: h(FolderIcon),
                label: item.title || item.path,
                active: item.path === cwd,
                onClick: () => { setCwd(item.path); save({ cwd: item.path }); setOpen(""); },
              })),
              h("div", { className: "ima-chip-split" }),
              h(ChipRow, {
                icon: h(PlusIcon),
                label: t("composer.addWorkspace"),
                onClick: onAddWorkspace,
              }),
            ),
            h(ChipMenu, {
              open: open === "perm",
              onToggle: (next) => setOpen(next ? "perm" : ""),
              icon: h(ShieldIcon),
              label: perm.label,
              ariaLabel: t("composer.permission"),
            },
              ...permissionOptions.map((item) => h(ChipRow, {
                key: item.value,
                icon: h(ShieldIcon),
                label: item.label,
                active: item.value === permission,
                onClick: () => selectPermission(item.value),
              })),
            ),
          ),
          h("div", { className: "ima-composer-right" },
            h(ChipMenu, {
              open: open === "model",
              onToggle: (next) => {
                setOpen(next ? "model" : "");
                if (next) setModelPane("root");
              },
              align: "end",
              className: "ima-model-select",
              menuClassName: "ima-model-menu",
              menuAria: props.modelT("menu.aria"),
              label: (currentModel && currentModel.label) || modelFallback,
              suffix: effortLabel,
              ariaLabel: props.modelT("trigger.selectAria"),
            },
              modelPane === "root" && [
                h(ChipRow, {
                  key: "model",
                  kv: true,
                  label: props.modelT("menu.model"),
                  hint: (currentModel && currentModel.label) || modelFallback,
                  chevron: true,
                  onClick: () => setModelPane("model"),
                }),
                reasoning && h(ChipRow, {
                  key: "effort",
                  kv: true,
                  label: props.modelT("menu.effort"),
                  hint: effortLabel || props.modelT("effort.providerDefault"),
                  chevron: true,
                  onClick: () => setModelPane("effort"),
                }),
              ],
              modelPane === "model" && (
                models.length === 0
                  ? h("div", { className: "ima-chip-empty" }, props.modelT("empty.models"))
                  : modelGroups.map((group) => h("section", { key: group.id, className: "ima-model-group", role: "group", "aria-label": group.name },
                      h("div", { className: "ima-model-group-title" }, group.name),
                      ...group.models.map((item) => h(ModelChoiceRow, {
                        key: item.value,
                        label: item.label,
                        description: item.description,
                        active: item.provider === provider && item.model === model,
                        onClick: () => {
                          const nextEffort = (item.reasoning && item.reasoning.defaultEffort) || "";
                          setProvider(item.provider);
                          setModel(item.model);
                          setEffort(nextEffort);
                          save({ provider: item.provider, model: item.model, reasoningEffort: nextEffort || null });
                          setOpen("");
                        },
                      })),
                    ))
              ),
              modelPane === "effort" && efforts.map((item) => h(ModelChoiceRow, {
                key: item.id,
                label: item.name,
                description: item.description,
                active: item.id === effectiveEffort,
                onClick: () => {
                  setEffort(item.id);
                  if (provider && model) save({ provider, model, reasoningEffort: item.id || null });
                  setOpen("");
                },
              })),
            ),
          ),
        ),
        adding && h("div", { className: "ima-chip-dialog" },
          h("strong", null, t("composer.addWorkspace")),
          h("input", {
            value: addPath,
            placeholder: t("composer.workspacePath"),
            "aria-label": t("composer.workspacePath"),
            onChange: (event) => setAddPath(event.target.value),
          }),
          h("div", { className: "ima-chip-dialog-actions" },
            h("button", { className: "ima-btn", onClick: () => { setAdding(false); setAddPath(""); } }, t("action.cancel")),
            h("button", {
              className: "ima-btn primary",
              disabled: addBusy || !addPath.trim(),
              onClick: () => addWorkspace(addPath),
            }, addBusy ? t("action.adding") : t("action.confirm")),
          ),
        ),
        hint && h("div", { className: "ima-composer-hint" }, hint),
        h(RiskConfirmation, {
          open: confirmingFullAccess,
          title: props.permissionT("confirm.title"),
          description: props.permissionT("confirm.description"),
          acknowledgeLabel: props.permissionT("confirm.acknowledge"),
          cancelLabel: props.permissionT("confirm.cancel"),
          confirmLabel: props.permissionT("confirm.enable"),
          acknowledged: fullAccessAcknowledged,
          onAcknowledgedChange: setFullAccessAcknowledged,
          onCancel: () => { setFullAccessAcknowledged(false); setConfirmingFullAccess(false); },
          onConfirm: () => {
            setPermission("danger-full-access");
            save({ permission: "danger-full-access" });
            setFullAccessAcknowledged(false);
            setConfirmingFullAccess(false);
          },
        }),
      );
    }

    function AccountInspector({ account, catalog, permissions, workspaces, createWorkspace, pickDirectory, modelT, permissionT, t, onAction, onSave }) {
      const [draft, setDraft] = useState(account);
      const [note, setNote] = useState("");
      const saveSeq = useRef(0);
      useEffect(() => {
        saveSeq.current += 1;
        setDraft(account);
        setNote("");
      }, [account.id, account.cwd, account.permission, account.privateAccess, account.receiveEnabled, account.assistant && account.assistant.provider, account.assistant && account.assistant.model, account.assistant && account.assistant.reasoningEffort]);
      const save = (patch) => {
        const seq = ++saveSeq.current;
        const next = { ...draft, ...patch };
        setDraft(next);
        setNote("status.saving");
        return onSave(account.id, {
          name: next.name,
          cwd: next.cwd,
          provider: next.assistant.provider,
          model: next.assistant.model,
          reasoningEffort: next.assistant.reasoningEffort || null,
          permission: next.permission,
          privateAccess: next.privateAccess,
        }).then((ok) => {
          if (seq === saveSeq.current) setNote(ok ? "status.saved" : "error.save");
          return ok;
        });
      };
      const applySettings = (patch) => {
        const hasAssistant = Object.prototype.hasOwnProperty.call(patch, "provider") || Object.prototype.hasOwnProperty.call(patch, "model") || Object.prototype.hasOwnProperty.call(patch, "reasoningEffort");
        if (!hasAssistant) return save(patch);
        const assistant = {
          ...(draft.assistant || {}),
          ...(Object.prototype.hasOwnProperty.call(patch, "provider") ? { provider: patch.provider } : {}),
          ...(Object.prototype.hasOwnProperty.call(patch, "model") ? { model: patch.model } : {}),
          ...(Object.prototype.hasOwnProperty.call(patch, "reasoningEffort") ? { reasoningEffort: patch.reasoningEffort || undefined } : {}),
        };
        return save({ assistant });
      };
      return h("div", { className: "ima-inspector" },
        h("div", { className: "ima-inspector-head" },
          h(Logo, { id: account.platform }),
          h("div", { className: "ima-inspector-head-copy" },
            h("h3", { className: "ima-inspector-title" }, accountLabel(account, t)),
            h("div", { className: account.connected ? "ima-inspector-status ok" : "ima-inspector-status" }, "● " + (account.connected ? t("account.statusRunning") : (serverText(account.status, t) || t("account.statusNotConnected")))),
            h("div", { className: "ima-account-id" }, account.id),
          ),
        ),
        h("div", { className: "ima-form" },
          h(AccountSettingsPicker, {
            value: draft,
            onChange: applySettings,
            catalog,
            permissions,
            workspaces,
            createWorkspace,
            pickDirectory,
            modelT,
            permissionT,
            compact: true,
            workspaceLabel: t("account.currentWorkspace"),
            t,
          }),
          h("div", { className: "ima-switch-row" },
            h("div", { className: "ima-switch-copy" }, h("strong", null, t("account.receive")), h("small", null, t("account.receiveDescription"))),
            h("button", { type: "button", className: draft.receiveEnabled ? "ima-switch" : "ima-switch off", role: "switch", "aria-checked": Boolean(draft.receiveEnabled), "aria-label": t("account.receive"), onClick: () => onAction(account.id, "receive", { receiveEnabled: !draft.receiveEnabled }) }, h("i")),
          ),
          h("div", { className: note === "status.saved" ? "ima-save-note ok" : "ima-save-note" }, note && t(note)),
          h("div", { className: "ima-inspector-actions" },
            h("button", { className: "ima-btn", onClick: () => onAction(account.id, "check") }, t("action.checkConnection")),
            h("button", { className: "ima-btn", onClick: () => onAction(account.id, "reconnect") }, t("action.reconnectAccount")),
            h("button", { className: "ima-btn danger", onClick: () => { if (window.confirm(t("account.removeConfirm"))) onAction(account.id, "remove"); } }, t("action.removeAccount")),
          ),
        ),
      );
    }

    /** GitHub 品牌图标未由宿主图标库提供，内联后可保持主题适配。 */
    function GithubMark16() {
      return h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": true, focusable: "false" },
        h("path", { fill: "currentColor", d: "M8 0a8 8 0 0 0-2.53 15.59c.4.074.547-.173.547-.385 0-.19-.007-.693-.01-1.36-2.226.484-2.695-1.073-2.695-1.073-.364-.924-.89-1.17-.89-1.17-.726-.496.055-.486.055-.486.803.056 1.225.824 1.225.824.714 1.223 1.872.87 2.328.665.072-.517.28-.87.508-1.07-1.777-.202-3.645-.888-3.645-3.956 0-.874.31-1.588.823-2.148-.083-.202-.357-1.017.078-2.12 0 0 .672-.215 2.2.82A7.65 7.65 0 0 1 8 4.8c.68.003 1.365.092 2.004.27 1.527-1.035 2.197-.82 2.197-.82.437 1.103.162 1.918.08 2.12.513.56.822 1.274.822 2.148 0 3.076-1.872 3.752-3.654 3.95.288.248.544.735.544 1.482 0 1.07-.01 1.932-.01 2.195 0 .214.144.463.55.384A8.001 8.001 0 0 0 8 0Z" }),
      );
    }

    function SettingsPage(props) {
      const t = props.t || fallbackT;
      const [channels, setChannels] = useState(null);
      const [pending, setPending] = useState([]);
      const [error, setError] = useState("");
      const [busy, setBusy] = useState({});
      const [editing, setEditing] = useState(null);
      const [selected, setSelected] = useState(storedAccountSelection);
      const [expanded, setExpanded] = useState({ weixin: true });
      const [catalog, setCatalog] = useState({ providers: [], permissions: [], assistant: null, cwd: "", permission: "" });
      const workspaces = props.useWorkspaces ? (props.useWorkspaces((state) => state && state.items || []) || []) : [];
      const refreshSeq = useRef(0);
      const selectAccount = useCallback((id) => {
        const next = id || "";
        setSelected(next);
        rememberAccountSelection(next);
      }, []);

      const refresh = useCallback(() => {
        const seq = ++refreshSeq.current;
        api("/channels").then((data) => {
          if (seq !== refreshSeq.current) return;
          if (data.ok) {
            setChannels(data.channels);
            setPending(data.pending || []);
            setError("");
            const all = (data.channels || []).flatMap((channel) => channel.accounts || []);
            setSelected((current) => {
              const next = all.some((item) => item.id === current) ? current : "";
              if (next !== current) rememberAccountSelection(next);
              return next;
            });
          } else setError(serverText(data.error, t) || t("error.load"));
        }).catch(() => { if (seq === refreshSeq.current) setError(t("error.connection")); });
      }, []);

      useEffect(() => {
        ensureStyle();
        refresh();
        api("/assistant").then((data) => {
          if (data.ok) setCatalog({ providers: data.providers || [], permissions: data.permissions || [], assistant: data.assistant || null, cwd: data.cwd || "", permission: data.permission || "" });
        }).catch(() => undefined);
      }, [refresh]);
      useEffect(() => { const timer = setInterval(refresh, 4000); return () => clearInterval(timer); }, [refresh]);

      const onAction = (id, action, body) => {
        const removalFallback = action === "remove"
          ? (() => {
              const owner = (channels || []).find((channel) => (channel.accounts || []).some((account) => account.id === id));
              const ownerAccounts = owner && owner.accounts || [];
              const removedIndex = ownerAccounts.findIndex((account) => account.id === id);
              const adjacent = ownerAccounts[removedIndex + 1] || ownerAccounts[removedIndex - 1];
              if (adjacent) return adjacent.id;
              return (channels || []).flatMap((channel) => channel.accounts || []).find((account) => account.id !== id)?.id || "";
            })()
          : "";
        setBusy((prev) => ({ ...prev, [id]: true }));
        return api("/accounts/" + id + "/" + action, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body || {}),
        }).then((data) => {
          if (!data.ok) { setError(serverText(data.error, t) || t("error.action")); return false; }
          setError("");
          if (action === "remove" && selected === id) selectAccount(removalFallback);
          refresh();
          return true;
        }).catch(() => { setError(t("error.request")); return false; }).finally(() => setBusy((prev) => ({ ...prev, [id]: false })));
      };
      const saveAccount = (id, body) => onAction(id, "settings", body);
      const allAccounts = (channels || []).flatMap((channel) => channel.accounts || []);
      const selectedAccount = allAccounts.find((item) => item.id === selected);

      return h("section", { className: "ima-page ima-account-page", "aria-label": t("settings.aria") },
        h("header", { className: "ima-head" },
          h("div", null,
            h("div", { className: "ima-title-row" },
              h("h2", { className: "ima-title" }, t("settings.title")),
              h("div", { className: "ima-title-links" },
                h("a", { className: "ima-title-link", href: "https://github.com/MichengAI/dsh-im-connect", target: "_blank", rel: "noreferrer", "aria-label": t("settings.viewProject") }, h(GithubMark16), t("settings.viewProject")),
                h("a", { className: "ima-title-link", href: "https://github.com/MichengAI/dsh-im-connect/issues", target: "_blank", rel: "noreferrer", "aria-label": t("settings.feedback") }, h(IconListPenOutline16), t("settings.feedback")),
              ),
            ),
            h("p", { className: "ima-sub" }, t("settings.description")),
          ),
        ),
        error && h("div", { className: "ima-error" }, error),
        pending.length > 0 && h("div", { className: "ima-pending" },
          h("div", null, t("pending.notice")),
          ...pending.map((p) => h("div", { key: p.channelId + p.userId, className: "ima-pending-row" },
            h("span", { style: { flex: 1 } }, (p.username || p.userId) + " · " + (accountLabel(allAccounts.find((item) => item.id === p.channelId), t) || p.channelId)),
            h("button", { className: "ima-btn", onClick: () => onAction(p.channelId, "approve", { userId: p.userId }) }, t("action.approve")),
            h("button", { className: "ima-btn", onClick: () => onAction(p.channelId, "deny", { userId: p.userId }) }, t("action.deny")),
          )),
        ),
        channels == null
          ? h("div", { className: "ima-empty" }, t("loading"))
          : h("div", { className: "ima-account-shell" },
              h("div", { className: "ima-platforms" },
                ...channels.map((ch) => {
                  const canExpand = (ch.accounts || []).length > 0;
                  const open = canExpand && Boolean(expanded[ch.id]);
                  const toggleExpanded = canExpand ? () => setExpanded({ ...expanded, [ch.id]: !open }) : undefined;
                  const channelStatus = ch.total === 0
                    ? { label: t("account.countZero"), tone: "muted" }
                    : ch.online === ch.total
                      ? { label: t("account.countOnline", { online: ch.online, total: ch.total }), tone: "online" }
                      : ch.online === 0
                        ? { label: t("account.countOffline", { total: ch.total }), tone: "offline" }
                        : { label: t("account.countOnline", { online: ch.online, total: ch.total }), tone: "partial" };
                  return h("div", { key: ch.id, className: "ima-platform" + (open ? " open" : "") + (canExpand ? "" : " empty") },
                    h("div", { className: "ima-platform-head", role: canExpand ? "button" : undefined, tabIndex: canExpand ? 0 : undefined, "aria-expanded": canExpand ? open : undefined, onClick: toggleExpanded, onKeyDown: canExpand ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(); } } : undefined },
                      h(Logo, { id: ch.id }),
                      h("span", { className: "ima-platform-title" }, channelLabel(ch, t)),
                      h("span", { className: "ima-platform-count " + channelStatus.tone }, channelStatus.label),
                      h("button", { className: "ima-platform-add", type: "button", onClick: (e) => { e.stopPropagation(); setEditing(ch.id); } }, "＋ " + t("action.addAccount")),
                      h("span", { className: canExpand ? "ima-platform-caret" : "ima-platform-caret empty", "aria-hidden": "true" }, canExpand && h(IconChevron)),
                    ),
                    open && h("div", { className: "ima-account-list" },
                      ...(ch.accounts || []).map((account) => h("button", { key: account.id, type: "button", className: account.id === selected ? "ima-account-row on" : "ima-account-row", onClick: () => selectAccount(account.id) },
                        h("span", { className: account.connected ? "ima-dot on" : "ima-dot" }),
                        h(Logo, { id: ch.id }),
                        h("span", { className: "ima-account-copy" }, h("span", { className: "ima-account-name" }, accountLabel(account, t)), h("span", { className: "ima-account-id" }, account.id)),
                        h("span", { className: busy[account.id] ? "ima-account-state" : account.connected ? "ima-account-state online" : "ima-account-state offline" }, busy[account.id] ? t("account.statusProcessing") : account.connected ? t("account.statusOnline") : t("account.statusOffline")),
                        h("span", { className: "ima-account-next", "aria-hidden": "true" }, h(IconChevron)),
                      )),
                    ),
                  );
                }),
              ),
              selectedAccount
                ? h(AccountInspector, {
                    account: selectedAccount,
                    catalog: catalog.providers,
                    permissions: catalog.permissions,
                    workspaces,
                    createWorkspace: props.createWorkspace,
                    pickDirectory: props.pickDirectory,
                    modelT: props.modelT,
                    permissionT: props.permissionT,
                    t,
                    onAction,
                    onSave: saveAccount,
                  })
                : h("div", { className: "ima-inspector-empty", role: "status" },
                    h("div", { className: "ima-inspector-empty-copy" },
                      h("h3", { className: "ima-inspector-empty-title" }, allAccounts.length ? t("settings.selectAccountTitle") : t("settings.noAccountsTitle")),
                      h("p", { className: "ima-inspector-empty-description" }, allAccounts.length ? t("settings.selectAccountDescription") : t("settings.noAccountsDescription")),
                    ),
                  ),
            ),
        editing && h(BindModal, {
          ch: (channels || []).find((item) => item.id === editing) || { id: editing, label: editing, kind: "qr", fields: [] },
          catalog: catalog.providers,
          permissions: catalog.permissions,
          workspaces,
          createWorkspace: props.createWorkspace,
          pickDirectory: props.pickDirectory,
          modelT: props.modelT,
          permissionT: props.permissionT,
          defaults: catalog,
          onClose: () => setEditing(null),
          onConnected: () => { setEditing(null); setExpanded((prev) => ({ ...prev, [editing]: true })); refresh(); },
          t,
        }),
      );
    }
    const WB_CSS = `.dcu-wb,.ima-native{display:flex;flex:1;min-height:0;flex-direction:column;padding:0;padding-right:var(--dsh-sidebar-inline-padding,12px);box-sizing:border-box;color:var(--dsw-alias-label-primary,var(--ima-text));font:14px/20px inherit}.ima-n-toolbar{box-sizing:border-box;flex:none;height:36px;margin:2px -4px 4px 0;padding-left:4px;display:flex;justify-content:flex-end;align-items:center;gap:4px;overflow:visible;position:relative;z-index:2;color:var(--dsw-alias-label-tertiary,#81858C);border-radius:12px}.ima-n-head-label{white-space:nowrap;min-width:0;max-width:45%;flex:none;line-height:20px;font-size:14px;overflow:hidden;transition:max-width .18s var(--ds-ease-in-out,ease),margin-right .18s var(--ds-ease-in-out,ease),opacity .12s var(--ds-ease-in-out,ease),transform .18s var(--ds-ease-in-out,ease),visibility 0s linear}.ima-n-toolbar.is-search .ima-n-head-label{opacity:0;visibility:hidden;max-width:0;margin-right:-4px;transform:translate(-4px);transition-delay:0s,0s,0s,0s,.18s}.ima-n-search-slot{box-sizing:border-box;min-width:28px;max-width:28px;transition:max-width .18s var(--ds-ease-in-out,ease);flex:none;align-items:center;margin-left:auto;display:flex;position:relative;z-index:2}.ima-n-toolbar.is-search .ima-n-search-slot{flex:1;min-width:0;max-width:100%}.ima-n-search{box-sizing:border-box;cursor:text;width:100%;height:28px;color:var(--dsw-alias-label-secondary);transition:width .18s var(--ds-ease-in-out,ease),padding .18s var(--ds-ease-in-out,ease),border-color .18s var(--ds-ease-in-out,ease);background:transparent;border:none;border-radius:50%;flex:none;align-items:center;margin:0;padding:0;display:flex;overflow:hidden}.ima-n-toolbar.is-search .ima-n-search{border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.10));width:calc(100% + 4px);height:30px;border-radius:10px;margin-inline:-2px;padding:0 4px 0 0}.ima-n-search-btn,.ima-n-head-btn{cursor:pointer;width:28px;height:28px;min-width:28px;min-height:28px;position:relative;z-index:1;color:var(--dsw-alias-label-secondary);background:transparent;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.ima-n-toolbar.is-search .ima-n-search-btn{width:28px;height:30px}.ima-n-search-btn:hover,.ima-n-head-btn:hover,.ima-n-head-btn.on{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-label-primary,var(--ima-text))}.ima-n-toolbar.is-search .ima-n-search-btn:hover{background:transparent}.ima-n-head-acts{opacity:1;visibility:visible;max-width:32px;transition:max-width .18s var(--ds-ease-in-out,ease),opacity .12s var(--ds-ease-in-out,ease),transform .18s var(--ds-ease-in-out,ease),visibility 0s linear;flex:none;align-items:center;gap:4px;display:flex;overflow:visible;position:relative}.ima-n-toolbar.is-search .ima-n-head-acts{opacity:0;visibility:hidden;pointer-events:none;max-width:0;transform:translate(4px);transition-delay:0s,0s,0s,.18s}.ima-n-head-filter{position:relative}.ima-n-search-input{display:none;opacity:0;pointer-events:none;width:0;min-width:0;flex:none;color:var(--dsw-alias-label-primary,var(--ima-text));transition:opacity .12s var(--ds-ease-in-out,ease);background:transparent;border:none;outline:none;flex:1;font-size:13px;line-height:18px}.ima-n-toolbar.is-search .ima-n-search-input{display:block;opacity:1;pointer-events:auto;margin-left:-2px;width:auto;flex:1;min-width:0}.ima-n-search-input::placeholder{color:var(--dsw-alias-label-tertiary,#81858C)}.ima-n-search-clear{cursor:pointer;width:24px;height:24px;color:var(--dsw-alias-label-secondary);background:transparent;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.ima-n-search-clear:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}@media (prefers-reduced-motion:reduce){.ima-n-head-label,.ima-n-search-slot,.ima-n-search,.ima-n-head-acts,.ima-n-search-input{transition:none}}.ima-n-filter-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:30;min-width:196px;padding:8px 6px;border:1px solid var(--dsw-alias-border-inverted,rgba(255,255,255,.12));border-radius:12px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,#1c2128));box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.36))}.ima-n-filter-label{padding:6px 10px 4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858C)}.ima-n-filter-split{height:1px;margin:6px 8px;background:var(--dsw-alias-border-l2,rgba(255,255,255,.1))}.ima-n-filter-menu button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:36px;padding:6px 10px;border:0;border-radius:8px;background:transparent;color:inherit;font:14px/20px inherit;cursor:pointer;text-align:left}.ima-n-filter-menu button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}.ima-n-filter-tick{width:16px;height:16px;flex:none}.ima-native-tree,.dcu-wb-tree{padding:0 0 16px;scrollbar-gutter:stable}.ima-native-project+.ima-native-project,.dcu-wb-project+.dcu-wb-project{margin-top:4px}.ima-native-project>*+*,.dcu-wb-project>*+*{margin-top:2px}
.dcu-wb *,.ima-native *{box-sizing:border-box}
.dcu-wb-tree,.ima-native-tree{flex:1;min-height:0;overflow-y:auto;padding-bottom:16px;user-select:none}
.dcu-wb-project-head,.ima-native-head,.dcu-wb-session,.ima-native-session{display:flex;align-items:center;gap:6px;width:100%;border:0;border-radius:8px;padding:0 8px;background:transparent;color:inherit;cursor:pointer;font:inherit;text-align:left}
.dcu-wb-project-head,.ima-native-head{height:34px}
.dcu-wb-project-head:hover,.dcu-wb-session:hover,.dcu-wb-session.dcu-wb-selected,.ima-native-head:hover,.ima-native-session:hover,.ima-native-session.on{background:var(--dsw-alias-interactive-bg-hover,var(--dcu-sidebar-hover,rgba(255,255,255,.06)))}
.dcu-wb-folder,.ima-native-folder{display:grid;place-items:center;flex:none;width:16px;height:20px}
.dcu-wb-project-title,.dcu-wb-session-title,.ima-native-title,.ima-n-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;flex:1;font-weight:400}
.dcu-wb-session-title,.ima-native-session .ima-native-title{font-weight:400}
.dcu-wb-session,.ima-native-session{position:relative;min-height:32px;padding-left:32px}
.dcu-wb-actions,.ima-native-actions{display:none;align-items:center;flex:none}
.dcu-wb-session:hover .dcu-wb-actions,.dcu-wb-session.dcu-wb-menu-open .dcu-wb-actions,.ima-native-session:hover .ima-native-actions,.ima-native-session.menu-on .ima-native-actions{display:flex}
.dcu-wb-more,.ima-native-more{display:grid;place-items:center;width:20px;height:20px;border:0;border-radius:4px;padding:0;background:transparent;color:var(--dsw-alias-label-secondary,var(--ima-muted));cursor:pointer}
.dcu-wb-empty,.ima-native-empty{padding:14px 8px;color:var(--dsw-alias-label-tertiary,var(--ima-muted));font-size:13px}
.ima-sess-menu{position:fixed;right:auto;top:auto;min-width:132px;padding:6px;border:1px solid var(--dsw-alias-stroke-primary,var(--ima-line));border-radius:10px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2));z-index:4000}
.ima-sess-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:7px 10px;border-radius:6px;cursor:pointer;font:13px/18px inherit}
.ima-sess-menu button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}
.ima-sess-menu button.danger{color:var(--dsw-alias-state-error-primary,var(--ima-danger))}
.ima-rename{flex:1;min-width:0;min-height:28px;padding:2px 8px;border-radius:6px;border:1px solid var(--dsw-alias-stroke-primary,var(--ima-line));background:transparent;color:inherit;font:inherit}
.ima-n-row,.ima-n-sess{display:flex;align-items:center;gap:6px;border-radius:8px;padding:0 8px 0 12px;cursor:pointer;user-select:none;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-primary,var(--ima-text));font:14px/20px inherit;text-align:left;box-sizing:border-box}
.ima-n-row{height:34px}
.ima-n-sess{height:32px;gap:0;position:relative}
.ima-n-row:hover,.ima-n-sess:hover,.ima-n-sess.on,.ima-n-row.menu-on,.ima-n-sess.menu-on{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}
.ima-n-slot{flex:none;width:16px;height:20px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary,#81858C)}.ima-run-dot{flex:none;color:var(--dsw-static-deepseek-450,#4c8dff)}.ima-run-dot-cell{fill:currentColor;opacity:.15;animation:ima-run-chase 1s infinite}@keyframes ima-run-chase{0%,12.4%{opacity:1}12.5%,24.9%{opacity:.6}25%,37.4%{opacity:.35}37.5%,100%{opacity:.15}}
.ima-n-folder{color:var(--dsw-alias-label-secondary,#9ca39f)}
.ima-n-lead{color:var(--dsw-alias-label-tertiary,#81858C)}
.ima-n-corner{color:var(--dsw-alias-label-caption,#ADB2B8);width:8px}
.ima-n-hover{position:fixed;z-index:4100;min-width:188px;max-width:280px;padding:12px 14px;border:1px solid var(--dsw-alias-border-inverted,rgba(255,255,255,.12));border-radius:12px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,#1c2128));box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.36));color:var(--dsw-alias-label-primary,var(--ima-text))}
.ima-n-hover-title{font-size:14px;line-height:20px;font-weight:500}
.ima-n-hover-time{margin-top:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858C)}
.ima-n-hover-state{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#9ca39f)}
.ima-n-hover-dot{width:8px;height:8px;border-radius:50%;background:#34c759;flex:none}
.ima-n-hover-dot.is-run{background:#4c8dff}
.ima-n-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;flex:1;font-weight:400}
.ima-n-sess .ima-n-title{margin:0 6px 0 4px}
.ima-n-time{flex:none;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary,#81858C)}
.ima-n-acts{flex:none;display:none;align-items:center;gap:12px}
.ima-n-row:hover .ima-n-acts,.ima-n-sess:hover .ima-n-acts,.ima-n-row.menu-on .ima-n-acts,.ima-n-sess.menu-on .ima-n-acts{display:inline-flex}
.ima-n-sess:hover .ima-n-time,.ima-n-sess.menu-on .ima-n-time{display:none}
.ima-n-ico{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:0;border-radius:4px;padding:0;background:transparent;cursor:pointer;color:var(--dsw-alias-label-tertiary,#81858C)}
.ima-n-ico:hover{color:var(--dsw-alias-label-primary,var(--ima-text))}
.ima-n-menu{position:fixed;right:auto;top:auto;z-index:4000;min-width:218px;max-width:360px;box-sizing:border-box;padding:4px;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-inverted,rgba(255,255,255,.12));border-radius:12px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2));box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.36))}
.ima-n-menu button{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:8px 10px;border:0;border-radius:10px;background:transparent;cursor:pointer;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary,var(--ima-text));text-align:left}
.ima-n-menu button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}
.ima-n-mi{display:inline-flex;flex:none;width:16px;height:16px;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary,#81858C)}
.ima-n-menu button.danger{color:var(--dsw-alias-state-error-primary,#f85149)}
.ima-n-menu button.danger .ima-n-mi{color:inherit}
.ima-n-menu button.danger:hover{background:var(--dsw-alias-interactive-bg-hover-danger,rgba(248,81,73,.12))}`;

    function NativeSvg(viewBox, size, children) {
      return h("svg", { viewBox, width: size, height: size, fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true" }, children);
    }
    function NativePath(d, extra) {
      return h("path", Object.assign({ d, fill: "currentColor" }, extra || {}));
    }
    function IconEllipsis() {
      return NativeSvg("0 0 16 16", 16, [
        NativePath("M4.55146 8.00001C4.55146 8.63513 4.03659 9.15001 3.40146 9.15001C2.76634 9.15001 2.25146 8.63513 2.25146 8.00001C2.25146 7.36488 2.76634 6.85001 3.40146 6.85001C4.03659 6.85001 4.55146 7.36488 4.55146 8.00001Z"),
        NativePath("M9.1476 8.00001C9.1476 8.63513 8.63273 9.15001 7.9976 9.15001C7.36248 9.15001 6.8476 8.63513 6.8476 8.00001C6.8476 7.36488 7.36248 6.85001 7.9976 6.85001C8.63273 6.85001 9.1476 7.36488 9.1476 8.00001Z"),
        NativePath("M13.7486 8.00001C13.7486 8.63513 13.2338 9.15001 12.5986 9.15001C11.9635 9.15001 11.4486 8.63513 11.4486 8.00001C11.4486 7.36488 11.9635 6.85001 12.5986 6.85001C13.2338 6.85001 13.7486 7.36488 13.7486 8.00001Z"),
      ]);
    }
    function IconEdit() {
      return NativeSvg("0 0 16 16", 16, NativePath("M9.941 1.349a2.54 2.54 0 0 1 2.473 0c.292.171.555.442.897.784.341.341.612.604.783.896a2.54 2.54 0 0 1 0 2.473c-.171.292-.442.555-.784.896L6.659 13.05c-.378.378-.652.661-.994.86-.341.199-.722.298-1.238.44l-1.183.326c-.469.13-.899.25-1.243.292-.349.043-.821.033-1.19-.336-.369-.369-.379-.841-.336-1.19.042-.344.163-.774.292-1.243l.326-1.183c.143-.516.242-.897.44-1.238.199-.342.482-.615.86-.994l6.652-6.651c.341-.342.604-.613.896-.784Zm1.759 1.222a1.16 1.16 0 0 0-1.045 0c-.095.056-.206.158-.61.562L9.456 3.721l2.265 2.265.589-.588c.404-.403.507-.515.562-.61a1.16 1.16 0 0 0 0-1.045c-.056-.095-.158-.206-.562-.61-.404-.404-.515-.507-.61-.562ZM3.394 9.784c-.429.429-.551.56-.637.706-.085.147-.138.318-.3.903l-.326 1.183c-.129.468-.209.766-.242.978.212-.033.51-.112.979-.241l1.183-.327c.585-.161.756-.214.902-.3.147-.085.277-.208.706-.636l5.062-5.063-2.265-2.265-5.062 5.062Z"));
    }
    function IconBranch() {
      return NativeSvg("0 0 16 16", 16, NativePath("M13.076 1.372c1.008 0 1.826.819 1.826 1.827s-.818 1.826-1.826 1.826c-.78 0-1.444-.488-1.706-1.175H4.355c.439.415.804.915 1.062 1.485l1.69 3.733a4.83 4.83 0 0 0 4.312 2.97c.29-.626.923-1.061 1.658-1.061 1.008 0 1.826.818 1.826 1.826s-.818 1.826-1.826 1.826c-.823 0-1.519-.545-1.747-1.293a6.34 6.34 0 0 1-5.406-3.731L4.232 5.871A3.83 3.83 0 0 0 1.098 3.85V2.549h10.272c.263-.687.927-1.177 1.706-1.177Zm0 10.904a.525.525 0 1 0 0 1.052.525.525 0 0 0 0-1.052Zm0-9.603a.526.526 0 1 0 0 1.053.526.526 0 0 0 0-1.053Z", { fillRule: "evenodd", clipRule: "evenodd" }));
    }
    function IconArchive() {
      return NativeSvg("0 0 20 20", 16, [
        NativePath("M15.866 2.06a2.526 2.526 0 0 1 2.525 2.525v.902c0 .54-.172 1.04-.461 1.45l.009.085v5.866c0 .746 0 1.35-.039 1.837-.035.434-.106.825-.262 1.189l-.072.154a3.03 3.03 0 0 1-1.262 1.366l-.236.132c-.408.208-.848.294-1.344.334-.488.04-1.091.04-1.837.04H7.111c-.746 0-1.35 0-1.837-.04-.434-.035-.825-.105-1.189-.261l-.154-.073a3.03 3.03 0 0 1-1.366-1.262l-.132-.235a2.53 2.53 0 0 1-.335-1.344c-.04-.487-.039-1.091-.039-1.837V7.022c0-.029.005-.057.008-.086A2.48 2.48 0 0 1 1.609 5.487v-.902A2.526 2.526 0 0 1 4.134 2.06h11.732Zm.632 5.87a2.48 2.48 0 0 1-.632.083H4.134a2.48 2.48 0 0 1-.634-.083v4.959c0 .77 0 1.304.034 1.72.034.406.095.635.182.806l.076.137c.191.311.465.565.792.731l.141.061c.156.055.361.096.666.121.415.034.95.035 1.72.035h5.775c.77 0 1.305 0 1.72-.035.407-.033.636-.095.807-.182l.138-.077c.311-.191.565-.464.731-.791l.06-.142c.056-.155.097-.36.122-.665.034-.415.034-.95.034-1.72V7.93ZM4.134 3.5a1.086 1.086 0 0 0-1.085 1.085v.902c0 .599.486 1.085 1.085 1.085h11.732c.599 0 1.085-.486 1.085-1.085v-.902A1.086 1.086 0 0 0 15.866 3.5H4.134Z", { fillRule: "evenodd", clipRule: "evenodd" }),
        NativePath("M12.796 12.566v-1.483H7.205v1.483h5.591Z"),
      ]);
    }
    function IconTrash() {
      return NativeSvg("0 0 16 16", 16, NativePath("M14.478 4.841 14.214 10.115c-.104 2.072-.147 2.896-.827 3.846a3.53 3.53 0 0 1-1.044.993c-.519.333-1.101.478-1.784.546-.671.067-1.509.066-2.559.066s-1.887.001-2.558-.066c-.683-.068-1.266-.213-1.784-.546a3.53 3.53 0 0 1-1.044-.993c-.681-.95-.724-1.774-.828-3.846L1.522 4.841l1.368-.068.263 5.273c.109 2.176.171 2.556.573 3.117a2.16 2.16 0 0 0 .673.64c.263.169.603.277 1.179.334.587.059 1.345.06 2.422.06s1.834-.001 2.422-.06c.575-.057.916-.165 1.179-.335.262-.168.49-.386.672-.64.402-.56.464-.94.573-3.116l.263-5.273 1.369.068ZM5.43 6.228h1.37v5.163H5.43V6.228Zm3.77 0h1.37v5.163H9.2V6.228ZM8.536.434c.644 0 1.116-.007 1.56.137.14.045.276.101.406.168.416.212.745.552 1.2 1.007l.796.795h2.876v1.37H.626V2.541h2.876l.796-.795c.456-.455.784-.795 1.2-1.007.13-.067.266-.123.405-.168C6.348.427 6.82.434 7.464.434h1.072Zm-1.072 1.37c-.732 0-.948.008-1.138.07a2.2 2.2 0 0 0-.206.085c-.156.08-.296.204-.678.583h5.117c-.382-.379-.522-.503-.679-.583a2.2 2.2 0 0 0-.205-.085c-.191-.062-.406-.07-1.138-.07H7.464Z"));
    }
    function IconFolderClose() {
      return NativeSvg("0 0 16 16", 16, h("path", { fill: "currentColor", transform: "translate(1.5 2.429)", d: "M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573ZM0 9.4837L-0.65 9.4837C-0.65 10.767 0.390308 11.8073 1.67359 11.8073L1.67359 11.1573L1.67359 10.5073C1.10828 10.5073 0.65 10.049 0.65 9.4837L0 9.4837ZM1.67359 5.00699e-14L1.67359 -0.65C0.390307 -0.65 -0.65 0.390309 -0.65 1.67359L0 1.67359L0.65 1.67359C0.65 1.10828 1.10828 0.65 1.67359 0.65L1.67359 5.00699e-14ZM5.05582 0.518756L5.60495 0.170972C5.28121 -0.340193 4.71829 -0.65 4.11323 -0.65L4.11323 1.23058e-13L4.11323 0.65C4.27282 0.65 4.4213 0.731715 4.50669 0.86654L5.05582 0.518756ZM6.52313 1.86603L6.52313 1.21603C6.36354 1.21603 6.21507 1.13431 6.12968 0.999489L5.58054 1.34727L5.03141 1.69506C5.35515 2.20622 5.91808 2.51603 6.52313 2.51603L6.52313 1.86603ZM13 3.53962L13.65 3.53962C13.65 2.25634 12.6097 1.21603 11.3264 1.21603L11.3264 1.86603L11.3264 2.51603C11.8917 2.51603 12.35 2.97431 12.35 3.53962L13 3.53962ZM13 9.4837L12.35 9.4837C12.35 10.049 11.8917 10.5073 11.3264 10.5073L11.3264 11.1573L11.3264 11.8073C12.6097 11.8073 13.65 10.767 13.65 9.4837L13 9.4837Z" }));
    }
    function IconFolderOpen() {
      return NativeSvg("0 0 16 16", 16, [
        NativePath("M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z"),
        h("path", { fill: "currentColor", opacity: "0.2", d: "M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z" }),
      ]);
    }
    function IconChevron() {
      return NativeSvg("0 0 14 14", 14, NativePath("M4.25 2.828v8.344c0 .49.592.735.939.389l4.172-4.172a.55.55 0 0 0 0-.778L5.189 2.439c-.347-.347-.939-.101-.939.389Z"));
    }
    function IconSearchOutline(props) {
      const size = props && props.size ? props.size : 16;
      return NativeSvg("0 0 16 16", size, [
        NativePath("M11.894845 6.647401C11.894845 3.725463 9.534486 1.356779 6.623219 1.35657C3.711786 1.35657 1.351635 3.725338 1.351635 6.647401C1.351843 9.569296 3.711911 11.938273 6.623219 11.938273C9.534361 11.938064 11.894637 9.569171 11.894845 6.647401ZM13.245462 6.647401C13.245254 10.317935 10.280401 13.293613 6.623219 13.293821C2.965871 13.293821 0.000204 10.31806 0 6.647401C0 2.976574 2.965746 0 6.623219 0C10.280526 0.000205 13.245462 2.9767 13.245462 6.647401Z"),
        NativePath("M16.000417 15.041079L15.044449 16.000433L11.530434 12.473588L12.486298 11.514234L16.000417 15.041079Z"),
      ]);
    }
    function IconSliders() {
      return NativeSvg("0 0 16 16", 16, NativePath("M2.2 3.4h6.05a1.85 1.85 0 0 0 3.5 0H13.8v1.3H11.75a1.85 1.85 0 0 0-3.5 0H2.2V3.4Zm8.6 1.15A.75.75 0 1 1 10.05 4.55.75.75 0 0 1 10.8 4.55ZM2.2 7.35h2.35a1.85 1.85 0 0 0 3.5 0H13.8v1.3H8.05a1.85 1.85 0 0 0-3.5 0H2.2V7.35Zm4.1 1.15A.75.75 0 1 1 5.55 8.5a.75.75 0 0 1 .75-.75ZM2.2 11.3h7.35a1.85 1.85 0 0 0 3.5 0H13.8v1.3h-.75a1.85 1.85 0 0 0-3.5 0H2.2v-1.3Zm9.9 1.15a.75.75 0 1 1-.75-.75.75.75 0 0 1 .75.75Z"));
    }
    function IconCloseOutline(props) {
      const size = props && props.size ? props.size : 16;
      return NativeSvg("0 0 16 16", size, [
        NativePath("M14.1168 13.197L13.197 14.1167L1.8833 2.80303L2.80309 1.88324L14.1168 13.197Z"),
        NativePath("M13.197 1.88326L14.1168 2.80305L2.80309 14.1168L1.8833 13.197L13.197 1.88326Z"),
      ]);
    }
    function IconCheckOutline() {
      return NativeSvg("0 0 16 16", 16, NativePath("M15.0498 3.92579L8.49512 12.3818C8.25774 12.6881 8.04517 12.9645 7.84668 13.1689C7.63957 13.3823 7.38732 13.5841 7.04492 13.6719C6.86373 13.7183 6.6757 13.7346 6.48926 13.7197C6.13666 13.6915 5.8528 13.5355 5.6123 13.3604C5.38201 13.1926 5.12573 12.9567 4.83984 12.6953L1.03125 9.21289L1.96875 8.1875L5.77734 11.6699C6.08684 11.9529 6.27773 12.1249 6.43066 12.2363C6.50183 12.2882 6.54699 12.3135 6.57324 12.3252C6.58525 12.3305 6.59269 12.3322 6.5957 12.333C6.59802 12.3336 6.59961 12.334 6.59961 12.334C6.63317 12.3367 6.66758 12.3335 6.7002 12.3252C6.7002 12.3252 6.70211 12.3251 6.7041 12.3242C6.70698 12.3229 6.71348 12.319 6.72461 12.3115C6.74849 12.2956 6.78843 12.2642 6.84961 12.2012C6.98138 12.0654 7.13957 11.8628 7.39648 11.5313L13.9502 3.07422L15.0498 3.92579Z"));
    }
    function FilterRow({ label, selected, onSelect }) {
      return h("button", { type: "button", className: selected ? "on" : undefined, onClick: onSelect },
        h("span", null, label),
        selected ? h(IconCheckOutline) : h("span", { className: "ima-n-filter-tick" }),
      );
    }
    function ChannelWorkspaceHead({ query, sort, groupMode, onQuery, onSort, onGroupMode, t = fallbackT }) {
      const [searching, setSearching] = useState(!!query);
      const [open, setOpen] = useState(false);
      const searchSize = searching ? 11 : 14;
      return h("div", { className: searching ? "ima-n-toolbar is-search" : "ima-n-toolbar" },
        h("span", { className: "ima-n-head-label" }, t("rail.workspace")),
        h("div", { className: "ima-n-search-slot" },
          h("div", { className: "ima-n-search", onClick: () => { setOpen(false); setSearching(true); } },
            h("button", { type: "button", className: "ima-n-search-btn", "aria-label": t("rail.search"), "aria-expanded": searching, onClick: () => { setOpen(false); setSearching(true); } }, h(IconSearchOutline, { size: searchSize })),
            h("input", { className: "ima-n-search-input", value: query, placeholder: t("rail.searchPlaceholder"), "aria-label": t("rail.search"), tabIndex: searching ? 0 : -1, onChange: (e) => onQuery(e.target.value), onKeyDown: (e) => { if (e.key === "Escape") { onQuery(""); setSearching(false); } } }),
            searching && h("button", { type: "button", className: "ima-n-search-clear", "aria-label": t("rail.clearSearch"), onClick: (e) => { e.stopPropagation(); onQuery(""); setSearching(false); } }, h(IconCloseOutline, { size: 14 })),
          ),
        ),
        h("div", { className: "ima-n-head-acts" },
          h("div", { className: "ima-n-head-filter" },
            h("button", { type: "button", className: open ? "ima-n-head-btn on" : "ima-n-head-btn", "aria-label": t("rail.filter"), onClick: () => setOpen(!open) }, h(IconSliders)),
            open && h("div", { className: "ima-n-filter-menu" },
              h("div", { className: "ima-n-filter-label" }, t("rail.group")),
              h(FilterRow, { label: t("rail.byWorkspace"), selected: groupMode === "workspace", onSelect: () => { onGroupMode("workspace"); setOpen(false); } }),
              h(FilterRow, { label: t("rail.list"), selected: groupMode === "list", onSelect: () => { onGroupMode("list"); setOpen(false); } }),
              h("div", { className: "ima-n-filter-split" }),
              h("div", { className: "ima-n-filter-label" }, t("rail.sort")),
              h(FilterRow, { label: t("rail.manual"), selected: sort === "manual", onSelect: () => { onSort("manual"); setOpen(false); } }),
              h(FilterRow, { label: t("rail.recent"), selected: sort === "time", onSelect: () => { onSort("time"); setOpen(false); } }),
            ),
          ),
        ),
      );
    }
    function IconPlayOutline() {
      return NativeSvg("0 0 16 16", 16, [
        NativePath("M14.1446 8C14.1446 4.6062 11.3938 1.85539 8 1.85539C4.6062 1.85539 1.85539 4.6062 1.85539 8C1.85539 11.3938 4.6062 14.1446 8 14.1446C11.3938 14.1446 14.1446 11.3938 14.1446 8ZM15.511 8C15.511 12.148 12.148 15.511 8 15.511C3.85202 15.511 0.489014 12.148 0.489014 8C0.489014 3.85202 3.85202 0.489014 8 0.489014C12.148 0.489014 15.511 3.85202 15.511 8Z"),
        NativePath("M10.5617 8.42578C10.852 8.21614 10.852 7.78386 10.5617 7.57422L7.25708 5.18751C6.90974 4.93666 6.42436 5.18484 6.42436 5.61329V10.3867C6.42436 10.8152 6.90974 11.0633 7.25708 10.8125L10.5617 8.42578Z"),
      ]);
    }
    function IconTreeCorner() {
      return h("svg", { viewBox: "-0.5 0 8.5 10.5", width: 8, height: 10, fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true" },
        NativePath("M0 0L-0.5 0L-0.5 7L0 7L0.5 7L0.5 0L0 0ZM3 10L3 10.5L8 10.5L8 10L8 9.5L3 9.5L3 10ZM0 7L-0.5 7C-0.5 8.933 1.067 10.5 3 10.5L3 10L3 9.5C1.61929 9.5 0.5 8.38071 0.5 7L0 7Z"),
      );
    }
    function SessionHoverCard({ title, time, running, style, cardRef, t = fallbackT }) {
      return h("div", { className: "ima-n-hover", style, ref: cardRef },
        h("div", { className: "ima-n-hover-title" }, title),
        time ? h("div", { className: "ima-n-hover-time" }, time) : null,
        h("div", { className: "ima-n-hover-state" },
          h("span", { className: running ? "ima-n-hover-dot is-run" : "ima-n-hover-dot" }),
          running ? t("rail.running") : t("rail.idle"),
        ),
      );
    }
    function MoreIcon() {
      return h(IconEllipsis);
    }
    const RUN_CELLS = [[0,0],[4,0],[8,0],[8,4],[8,8],[4,8],[0,8],[0,4]];
    function RunningStateDot() {
      return h("svg", { className: "ima-run-dot", width: 10, height: 10, viewBox: "0 0 10 10", shapeRendering: "crispEdges", "aria-hidden": "true" },
        RUN_CELLS.map(function (cell, index) {
          return h("rect", { key: cell[0] + "-" + cell[1], className: "ima-run-dot-cell", x: cell[0], y: cell[1], width: "2", height: "2", style: { animationDelay: ((index - RUN_CELLS.length) * 125) + "ms" } });
        })
      );
    }
    function relativeTime(value, t = fallbackT) {
      const ts = Date.parse(value || "");
      if (!Number.isFinite(ts)) return "";
      const delta = Math.max(0, Date.now() - ts);
      const min = Math.floor(delta / 60000);
      if (min < 1) return t("time.now");
      if (min < 60) return t("time.minutes", { count: min });
      const hour = Math.floor(min / 60);
      if (hour < 24) return t("time.hours", { count: hour });
      return t("time.days", { count: Math.floor(hour / 24) });
    }


    function pointerPoint(event) {
      const x = Number(event && event.clientX);
      const y = Number(event && event.clientY);
      return {
        x: Number.isFinite(x) ? x : 8,
        y: Number.isFinite(y) ? y : 8,
      };
    }
    function clampMenuPoint(x, y, width, height) {
      const pad = 8;
      const vw = window.innerWidth || width + pad * 2;
      const vh = window.innerHeight || height + pad * 2;
      return {
        x: Math.max(pad, Math.min(x, Math.max(pad, vw - width - pad))),
        y: Math.max(pad, Math.min(y, Math.max(pad, vh - height - pad))),
      };
    }
    function SessionPointerMenu({ native, x, y, items, onPick }) {
      const ref = useRef(null);
      const [pos, setPos] = useState(() => clampMenuPoint(x, y, native ? 218 : 132, native ? 176 : 140));
      useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setPos(clampMenuPoint(x, y, rect.width, rect.height));
      }, [x, y]);
      const node = h("div", {
        ref,
        className: native ? "ima-n-menu" : "ima-sess-menu",
        "data-ima-session-menu": "",
        style: { left: pos.x + "px", top: pos.y + "px" },
        onClick: (event) => event.stopPropagation(),
      }, items.map((item) => h("button", {
        key: item.id,
        type: "button",
        className: item.danger ? "danger" : undefined,
        onClick: () => onPick(item),
      }, native && h("span", { className: "ima-n-mi" }, item.icon), item.label)));
      return ReactDOM.createPortal(node, document.body);
    }

    function ChannelSessionRow({ sess, selected, onOpen, onChanged, skin, sessionActions, sessionById, menuOpen, onMenuChange }) {
      const t = arguments[0].t || fallbackT;
      const menu = !!menuOpen;
      const setMenu = (next) => onMenuChange(!!next);
      const [renaming, setRenaming] = useState(false);
      const [draft, setDraft] = useState(sess.title || sess.chatId || "");
      const rowRef = useRef(null);
      const hoverRef = useRef(null);
      const hoverTimer = useRef(null);
      const [hoverOpen, setHoverOpen] = useState(false);
      const [hoverStyle, setHoverStyle] = useState({});
      const title = sess.title || sess.chatId;
      const native = skin !== "codex";
      const running = !!(sess.running || (sessionById && sessionById[sess.sessionId] && sessionById[sess.sessionId].running));
      const showHover = () => {
        if (menu || !native) return;
        if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
        hoverTimer.current = window.setTimeout(() => setHoverOpen(true), 500);
      };
      const hideHover = () => {
        if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
        setHoverOpen(false);
      };
      useLayoutEffect(() => {
        if (!hoverOpen || menu || !rowRef.current) return;
        const row = rowRef.current.getBoundingClientRect();
        const card = hoverRef.current;
        const height = card && card.offsetHeight ? card.offsetHeight : 96;
        const top = row.top + height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - height - 8) : Math.max(8, row.top);
        setHoverStyle({ position: "fixed", zIndex: 4100, left: Math.round(row.right + 8) + "px", top: Math.round(top) + "px" });
      }, [hoverOpen, menu, title, running]);
      useEffect(() => () => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current); }, []);
      const rowClass = native
        ? ("ima-native-session" + (selected ? " on" : "") + (menu ? " menu-on" : ""))
        : ("dcu-wb-session" + (selected ? " dcu-wb-selected" : "") + (menu ? " dcu-wb-menu-open" : ""));
      const syncList = (groups) => { if (groups) onChanged(groups); };
      const run = (action, extra) => {
        setMenu(false);
        if (action === "copy-title") { try { navigator.clipboard.writeText(title); } catch { /* ignore */ } return; }
        if (action === "copy-id") { try { navigator.clipboard.writeText(sess.sessionId); } catch { /* ignore */ } return; }
        if (action === "copy-link") {
          try { navigator.clipboard.writeText(location.origin + "/?session=" + encodeURIComponent(sess.sessionId)); } catch { /* ignore */ }
          return;
        }
        const acts = sessionActions || {};
        const afterHost = () => api("/sessions/" + (action === "archive" || action === "delete" || action === "fork" ? "remove" : action), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.assign({ sessionId: sess.sessionId }, extra || {})),
        }).then((data) => { if (data.ok) syncList(data.groups); }).catch(() => undefined);
        if (action === "rename" && typeof acts.renameSession === "function") {
          Promise.resolve(acts.renameSession(sess.sessionId, (extra && extra.title) || title)).then(afterHost).catch(afterHost);
          return;
        }
        if (action === "archive") {
          if (typeof acts.archiveSession === "function") {
            Promise.resolve(acts.archiveSession(sess.sessionId)).then(afterHost).catch(afterHost);
          } else {
            afterHost();
          }
          return;
        }
        if ((action === "delete" || action === "remove") && typeof acts.deleteSession === "function") {
          Promise.resolve(acts.deleteSession(sess.sessionId)).then(() => afterHost()).catch(() => afterHost());
          return;
        }
        if (action === "fork" && typeof acts.forkSession === "function") {
          Promise.resolve(acts.forkSession(sess.sessionId)).catch(() => undefined);
          return;
        }
        const localAction = action === "delete" ? "remove" : action;
        api("/sessions/" + localAction, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.assign({ sessionId: sess.sessionId }, extra || {})),
        }).then((data) => { if (data.ok) syncList(data.groups); }).catch(() => undefined);
      };
      if (renaming) {
        return h("div", { className: rowClass },
          h("input", {
            className: "ima-rename",
            value: draft,
            autoFocus: true,
            "aria-label": t("rail.renameAria"),
            onChange: (e) => setDraft(e.target.value),
            onClick: (e) => e.stopPropagation(),
            onKeyDown: (e) => {
              if (e.key === "Enter") { e.preventDefault(); setRenaming(false); run("rename", { title: draft.trim() || title }); }
              if (e.key === "Escape") { e.preventDefault(); setRenaming(false); setDraft(title); }
            },
            onBlur: () => { setRenaming(false); if (draft.trim() && draft.trim() !== title) run("rename", { title: draft.trim() }); },
          }),
        );
      }
      const menuItems = [
        { id: "rename", label: t("rail.rename"), icon: h(IconEdit), go: () => { setRenaming(true); } },
        { id: "fork", label: t("rail.fork"), icon: h(IconBranch), go: () => run("fork") },
        { id: "archive", label: t("rail.archive"), icon: h(IconArchive), go: () => run("archive") },
      ];
      return h("div", {
        ref: rowRef,
        className: native ? ("ima-n-sess" + (selected ? " on" : "") + (menu ? " menu-on" : "")) : rowClass,
        role: "treeitem",
        tabIndex: 0,
        "aria-selected": selected,
        onClick: () => { setMenu(false); hideHover(); onOpen(sess.sessionId); },
        onMouseEnter: showHover,
        onMouseLeave: hideHover,
        onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMenu(false); onOpen(sess.sessionId); } },
        onContextMenu: (e) => { e.preventDefault(); e.stopPropagation(); hideHover(); onMenuChange(true, e); },
      },
        native && h("span", { className: "ima-n-slot" }, running ? h(RunningStateDot) : null),
        h("span", { className: native ? "ima-n-title" : "dcu-wb-session-title" }, title),
        native && h("span", { className: "ima-n-time" }, relativeTime(sess.updatedAt, t)),
        h("span", { className: native ? "ima-n-acts" : "dcu-wb-actions" },
          h("button", {
            type: "button",
            className: native ? "ima-n-ico" : "dcu-wb-more",
            "data-ima-session-more": "",
            "aria-expanded": menu,
            "aria-label": t("action.more", { channel: title }),
            onClick: (e) => { e.stopPropagation(); onMenuChange(!menu, e); },
          }, native ? h(IconEllipsis) : h(MoreIcon)),
        ),
        hoverOpen && !menu && native && h(SessionHoverCard, {
          title,
          time: relativeTime(sess.updatedAt, t),
          running,
          t,
          style: hoverStyle,
          cardRef: hoverRef,
        }),
        menu && h(SessionPointerMenu, {
          native,
          x: menuOpen && menuOpen.x,
          y: menuOpen && menuOpen.y,
          items: menuItems,
          onPick: (item) => { setMenu(false); item.go(); },
        }),
      );
    }

    function ChannelRail(props) {
      if (typeof props.useSessions === "function" || typeof props.useWorkspaces === "function") return h(ChannelRailWithSessions, props);
      return h(ChannelRailView, props);
    }

    function ChannelRailWithSessions(props) {
      const selectedId = typeof props.useSessions === "function"
        ? props.useSessions((state) => (state && state.current) || null)
        : (props.selectedId || null);
      const archivedIds = typeof props.useWorkspaces === "function"
        ? props.useWorkspaces((state) => (state && state.archivedSessionIds) || [])
        : (props.archivedIds || []);
      const sessionById = typeof props.useSessions === "function"
        ? props.useSessions((state) => (state && state.byId) || {})
        : {};
      return h(ChannelRailView, Object.assign({}, props, {
        selectedId: selectedId || props.selectedId || null,
        archivedIds,
        sessionById,
      }));
    }

    function ChannelRailView(props) {
      const t = props.t || fallbackT;
      const [groups, setGroups] = useState([]);
      const [folded, setFolded] = useState({});
      const [error, setError] = useState("");
      const [openMenu, setOpenMenu] = useState(null);
      const [query, setQuery] = useState("");
      const [sort, setSort] = useState("time");
      const [groupMode, setGroupMode] = useState("workspace");
      const selectedId = props.selectedId;
      const archived = new Set(props.archivedIds || []);
      const skin = props.skin || channelSkin;
      const native = skin !== "codex";
      const open = (id) => openListedSession(id, props.openSession || props.open);
      useEffect(() => {
        ensureStyle();
        const load = () => api("/channels").then((data) => {
          if (data.ok) { setGroups(data.groups || []); setError(""); }
          else setError(serverText(data.error, t) || t("error.load"));
        }).catch(() => setError(t("error.connection")));
        load();
        const timer = setInterval(load, 4000);
        return () => clearInterval(timer);
      }, []);
      useEffect(() => {
        if (!openMenu) return undefined;
        const onPointerDown = (event) => {
          const target = event.target;
          if (target && target.closest && target.closest("[data-ima-session-menu],[data-ima-session-more]")) return;
          setOpenMenu(null);
        };
        const onKeyDown = (event) => {
          if (event.key === "Escape") setOpenMenu(null);
        };
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown);
        return () => {
          document.removeEventListener("pointerdown", onPointerDown, true);
          document.removeEventListener("keydown", onKeyDown);
        };
      }, [openMenu]);
      const needle = query.trim().toLowerCase();
      const visibleGroups = groups.map((g) => {
        const sessions = (g.sessions || []).filter((sess) => !archived.has(sess.sessionId));
        if (!needle) return Object.assign({}, g, { sessions });
        const nameHit = String(channelLabel(g, t)).toLowerCase().includes(needle);
        return Object.assign({}, g, { sessions: nameHit ? sessions : sessions.filter((sess) => String(sess.title || sess.chatId || "").toLowerCase().includes(needle)) });
      }).filter((g) => (g.sessions || []).length > 0);
      if (sort === "time") {
        visibleGroups.sort((a, b) => {
          const latest = (g) => Math.max(0, ...(g.sessions || []).map((sess) => Date.parse(sess.updatedAt || "") || 0));
          return latest(b) - latest(a);
        });
      }
      if (groupMode === "list") {
        const sessions = visibleGroups.flatMap((g) => g.sessions || []);
        if (sort === "time") sessions.sort((a, b) => (Date.parse(b.updatedAt || "") || 0) - (Date.parse(a.updatedAt || "") || 0));
        visibleGroups.splice(0, visibleGroups.length);
        if (sessions.length) visibleGroups.push({ id: "__flat__", label: "", sessions });
      }
      return h("div", { className: native ? "ima-native ima-rail" : "dcu-wb ima-rail" },
        h("style", null, WB_CSS),
        h(ChannelWorkspaceHead, { query, sort, groupMode, onQuery: setQuery, onSort: setSort, onGroupMode: setGroupMode, t }),
        h("div", { className: native ? "ima-native-tree" : "dcu-wb-tree", role: "tree" },
          error && h("div", { className: native ? "ima-native-empty" : "dcu-wb-empty" }, error),
          !error && visibleGroups.length === 0 && h("div", { className: native ? "ima-native-empty" : "dcu-wb-empty" }, t("rail.empty")),
          ...visibleGroups.map((g) => {
            const visible = g.sessions || [];
            const expanded = !folded[g.id];
            return h("div", { key: g.id, className: native ? "ima-native-project" : "dcu-wb-project" },
            groupMode !== "list" && h("button", {
              className: native ? "ima-n-row" : "dcu-wb-project-head",
              type: "button",
              role: "treeitem",
              "aria-expanded": expanded,
              onClick: () => setFolded({ ...folded, [g.id]: !folded[g.id] }),
            },
              native
                ? [
                  h("span", { key: "folder", className: "ima-n-slot ima-n-folder" }, h(Logo, { id: g.id, small: true })),
                  h("span", { key: "title", className: "ima-n-title" }, channelLabel(g, t)),
                ]
                : [
                  h("span", { key: "folder", className: "dcu-wb-folder" }, h(Logo, { id: g.id, small: true })),
                  h("span", { key: "title", className: "dcu-wb-project-title" }, channelLabel(g, t)),
                ],
            ),
            (groupMode === "list" || !folded[g.id]) && visible.length > 0 && visible.map((sess) => h(ChannelSessionRow, {
                key: sess.sessionId,
                sess,
                selected: selectedId === sess.sessionId,
                sessionById: props.sessionById,
                menuOpen: openMenu && openMenu.id === sess.sessionId ? openMenu : null,
                onMenuChange: (open, event) => setOpenMenu((cur) => {
                  if (!open) return cur && cur.id === sess.sessionId ? null : cur;
                  const point = pointerPoint(event);
                  return { id: sess.sessionId, x: point.x, y: point.y };
                }),
                onOpen: open,
                onChanged: (next) => setGroups(next),
                skin,
                sessionActions: {
                  renameSession: props.renameSession,
                  archiveSession: props.archiveSession,
                  deleteSession: props.deleteSession,
                  forkSession: props.forkSession,
                  openPath: props.openPath,
                },
                t,
              })),
          );
          }),
        ),
      );
    }

    function isTaskSessionItem(item) {
      if (!item) return false;
      if (item.blank) return false;
      if (item.origin === "im" || item.origin === "subagent") return false;
      return !String(item.id || "").startsWith("im:");
    }

    function TaskList(props) {
      if (typeof props.useSessions === "function") return h(TaskListWithSessions, props);
      return h(TaskListView, { groups: [], current: null, openSession: props.openSession, t: props.t });
    }

    function TaskListWithSessions(props) {
      const t = props.t || fallbackT;
      const snap = props.useSessions((state) => state || { ids: [], byId: {}, current: null });
      const workspaces = typeof props.useWorkspaces === "function"
        ? props.useWorkspaces((state) => state || { items: [], archivedSessionIds: [] })
        : { items: [], archivedSessionIds: [] };
      const archived = new Set(workspaces.archivedSessionIds || []);
      const assigned = new Set();
      const groups = [];
      for (const ws of workspaces.items || []) {
        const sessions = (ws.sessionIds || [])
          .map((id) => snap.byId[id])
          .filter((item) => isTaskSessionItem(item) && !archived.has(item.id));
        sessions.forEach((item) => assigned.add(item.id));
        if (sessions.length) {
          groups.push({ id: ws.workspaceId || ws.id, label: ws.title || ws.path || t("rail.workspace"), sessions });
        }
      }
      const ungrouped = (snap.ids || [])
        .map((id) => snap.byId[id])
        .filter((item) => item && !assigned.has(item.id) && isTaskSessionItem(item) && !archived.has(item.id));
      if (ungrouped.length) groups.push({ id: "", label: t("rail.ungrouped"), sessions: ungrouped });
      return h(TaskListView, { groups, current: snap.current, openSession: props.openSession, t });
    }

    function TaskListView({ groups, current, openSession, t = fallbackT }) {
      if (!groups.length) return h("div", { className: "ima-empty" }, t("rail.noTasks"));
      return h("div", { className: "ima-native ima-rail" },
        h("div", { className: "ima-native-tree" },
          ...groups.map((group) => h("div", { key: group.id || "ungrouped", className: "ima-native-project" },
            h("div", { className: "ima-native-head" },
              h("span", { className: "ima-native-title" }, group.label),
            ),
            ...group.sessions.map((item) => h("div", {
              key: item.id,
              className: current === item.id ? "ima-native-session on" : "ima-native-session",
              role: "treeitem",
              tabIndex: 0,
              onClick: () => openSession && openSession(item.id),
              onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSession && openSession(item.id); } },
            }, h("span", { className: "ima-native-title" }, item.title || item.id))),
          )),
        ),
      );
    }

    const imSessionFilterCache = new WeakMap();
    const registryFilterCache = new WeakMap();
    function cacheFilteredSessions(src, ids) {
      if (ids.length === (src.ids || []).length) return src;
      const byId = {};
      for (const id of ids) {
        if (src.byId && src.byId[id]) byId[id] = src.byId[id];
      }
      return Object.assign({}, src, { ids, byId });
    }
    function filterSessionsByIm(state, keepIm) {
      const src = state || { ids: [], byId: {}, current: null };
      const key = keepIm ? "im" : "task";
      if (src && typeof src === "object") {
        const hit = imSessionFilterCache.get(src);
        if (hit && hit[key]) return hit[key];
      }
      const ids = (src.ids || []).filter((id) => String(id).startsWith("im:") === keepIm);
      const result = cacheFilteredSessions(src, ids);
      if (src && typeof src === "object") {
        const bucket = imSessionFilterCache.get(src) || {};
        bucket[key] = result;
        imSessionFilterCache.set(src, bucket);
      }
      return result;
    }

    function filterTaskSessions(state) {
      return filterSessionsByIm(state, false);
    }

    function filterChannelSessions(state) {
      return filterSessionsByIm(state, true);
    }

    function createNativeTabRegistry(officialTree) {
      const tabs = new Map();
      const sessionFilters = [];
      const listeners = new Set();
      let cachedTabs = [];
      const rebuild = () => { cachedTabs = [...tabs.values()].sort((a, b) => (a.order || 0) - (b.order || 0)); };
      const emit = () => { for (const listener of listeners) listener(); };
      return {
        version: 1,
        officialTree,
        sessionFilters,
        getTabs() { return cachedTabs; },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        insert(tab) {
          if (!tab || !tab.id) return () => {};
          tabs.set(tab.id, tab);
          rebuild();
          emit();
          return () => { tabs.delete(tab.id); rebuild(); emit(); };
        },
        addSessionFilter(filter) {
          sessionFilters.push(filter);
          emit();
          return () => {
            const index = sessionFilters.indexOf(filter);
            if (index >= 0) sessionFilters.splice(index, 1);
            emit();
          };
        },
      };
    }

    function attachNativeTabRegistry(target, registry) {
      try { target.__dshNativeTabs = registry; } catch { /* ignore */ }
      return registry;
    }

    function findNativeTabRegistry(entry) {
      return entry?.__dshNativeTabs || entry?.component?.__dshNativeTabs || null;
    }

    function applyRegistryFilters(state, registry) {
      const src = state || { ids: [], byId: {}, current: null };
      const filters = registry && registry.sessionFilters ? registry.sessionFilters : [];
      if (!filters.length) return src;
      if (src && typeof src === "object") {
        const hit = registryFilterCache.get(src);
        if (hit && hit.filters === filters) return hit.result;
      }
      const ids = (src.ids || []).filter((id) => filters.every((fn) => fn(String(id))));
      const result = cacheFilteredSessions(src, ids);
      if (src && typeof src === "object") registryFilterCache.set(src, { filters, result });
      return result;
    }

    function SessionSwitcher(props) {
      const t = props.t || fallbackT;
      const officialT = props.officialT || t;
      const Official = props.officialTree;
      const rawUseSessions = props.useSessions;
      const nativeTabs = props.nativeTabs;
      const extraTabs = useSyncExternalStore(
        (listener) => (nativeTabs && nativeTabs.subscribe ? nativeTabs.subscribe(listener) : () => {}),
        () => (nativeTabs && nativeTabs.getTabs ? nativeTabs.getTabs() : EMPTY_EXTRA_TABS),
        () => EMPTY_EXTRA_TABS,
      );
      const [tab, setTab] = useState(() => {
        try { return localStorage.getItem(TAB_KEY) || "tasks"; } catch { return "tasks"; }
      });
      const currentId = typeof rawUseSessions === "function"
        ? rawUseSessions((state) => (state && state.current) || null)
        : (props.selectedId || null);
      const useTaskSessions = useCallback((selector, eq) => {
        if (typeof rawUseSessions !== "function") return selector({ ids: [], byId: {}, current: null });
        return rawUseSessions((state) => selector(applyRegistryFilters(filterTaskSessions(state), nativeTabs)), eq);
      }, [rawUseSessions, nativeTabs]);
      const useChannelSessions = useCallback((selector, eq) => {
        if (typeof rawUseSessions !== "function") return selector({ ids: [], byId: {}, current: null });
        return rawUseSessions((state) => selector(filterChannelSessions(state)), eq);
      }, [rawUseSessions]);
      useEffect(() => { ensureStyle(); }, []);
      useEffect(() => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ } }, [tab]);
      const previousCurrentId = useRef(currentId);
      const tabFollowReady = useRef(false);
      useEffect(() => {
        if (!tabFollowReady.current) {
          tabFollowReady.current = true;
          previousCurrentId.current = currentId;
          return;
        }
        const previous = previousCurrentId.current;
        previousCurrentId.current = currentId;
        if (typeof currentId !== "string" || currentId === "" || currentId === previous) return;
        if (currentId.startsWith("im:")) setTab("channels");
        const matched = extraTabs.find((item) => item.matchSession && item.matchSession(currentId));
        if (matched && matched.id !== "schedule") setTab(matched.id);
      }, [currentId, extraTabs]);
      const openSession = (id) => openListedSession(id, props.openSession || props.open);
      const officialProps = Object.assign({}, props, { useSessions: useTaskSessions, t: officialT });
      const channelRail = h(ChannelRail, {
        openSession,
        open: openSession,
        useSessions: rawUseSessions,
        useWorkspaces: props.useWorkspaces,
        selectedId: currentId || props.selectedId || null,
        skin: "native",
        renameSession: props.renameSession,
        archiveSession: props.archiveSession,
        deleteSession: props.deleteSession,
        forkSession: props.forkSession,
        openPath: props.openPath,
        t,
      });
      if (props.wide === false) return Official ? h(Official, officialProps) : null;
      const officialTree = Official
        ? h("div", { className: "ima-official-tree" }, h(Official, officialProps))
        : null;
      const extra = extraTabs.find((item) => item.id === tab);
      const hasChannelTab = extraTabs.some((item) => item.id === "channels");
      return h("div", { className: "ima-wrap" },
        h("div", { className: "ima-tabs", role: "tablist", "aria-label": t("rail.tabsAria") },
          h("button", { type: "button", role: "tab", "aria-selected": tab === "tasks", className: tab === "tasks" ? "ima-tab on" : "ima-tab", onClick: () => setTab("tasks") }, t("rail.tasks")),
          !hasChannelTab && h("button", { type: "button", role: "tab", "aria-selected": tab === "channels", className: tab === "channels" ? "ima-tab on" : "ima-tab", onClick: () => setTab("channels") }, t("rail.channels")),
          ...extraTabs.map((item) => h("button", {
            key: item.id,
            type: "button",
            role: "tab",
            "aria-selected": tab === item.id,
            className: tab === item.id ? "ima-tab on" : "ima-tab",
            onClick: () => setTab(item.id),
          }, item.label)),
        ),
        tab === "tasks"
          ? (officialTree || h(TaskList, { useSessions: useTaskSessions, useWorkspaces: props.useWorkspaces, openSession }))
          : extra
            ? extra.render(Object.assign({}, props, { openSession, open: openSession }))
            : channelRail,
      );
    }

    function sidebarOccupantName(item) {
      return String(
        item?.options?.locale ??
        item?.options?.id ??
        item?.options?.name ??
        item?.options?.registrant ??
        item?.component?.displayName ??
        item?.component?.name ??
        item?.id ??
        item?.name ??
        "",
      );
    }

    /** 只认真正占用 sidebar 槽的主人。包在注册表里但没接管侧栏时，必须走原生页签。 */
    function hasDshCodexUiSidebar(ctx) {
      try {
        const read = ctx.slots && (ctx.slots.entriesOfSlot || ctx.slots.entries);
        const sidebar = read && read.call(ctx.slots, "sidebar");
        if (!sidebar) return false;
        for (const item of sidebar) {
          if (/dsh-codex-ui|michengai-codex-ui|michengai\.codexUi|codex-ui/i.test(sidebarOccupantName(item))) return true;
        }
      } catch { /* ignore */ }
      return false;
    }

    function pickOfficialWorkspaces(ctx) {
      const entries = (ctx.slots.entries && ctx.slots.entries("sidebar.workspaces")) || [];
      for (const item of entries) {
        if (!item || !item.component) continue;
        if (item.component.__imConnectWrapped) continue;
        if (item.component.__imConnectOriginal) continue;
        if (item.component.__dshNativeTabHost) continue;
        if (item.component.__dshAutomationWrapped) continue;
        return item;
      }
      return null;
    }

    function apply(ctx) {
      ensureStyle();
      ctx.effect(() => ctx.locale.register(IM_LOCALE_NS, IM_LOCALES), "im-connect: dictionaries");
      const t = ctx.locale.bind(IM_LOCALE_NS);
      const permissionT = ctx.locale.bind("permission.access");
      const modelT = ctx.locale.bind("model");
      const subscribeLocale = (listener) => ctx.locale.subscribe(listener);
      const localeSnapshot = () => ctx.locale.getSnapshot();
      function LocalizedChannelRail(props) {
        useSyncExternalStore(subscribeLocale, localeSnapshot, localeSnapshot);
        return h(ChannelRail, Object.assign({}, props, { t }));
      }
      function LocalizedSessionSwitcher(props) {
        useSyncExternalStore(subscribeLocale, localeSnapshot, localeSnapshot);
        return h(SessionSwitcher, Object.assign({}, props, { t, officialT: props.t }));
      }
      function LocalizedSettingsPage(props) {
        useSyncExternalStore(subscribeLocale, localeSnapshot, localeSnapshot);
        return h(SettingsPage, Object.assign({}, props, { t, permissionT, modelT }));
      }
      openImSession = (id) => {
        try { ctx.sessions.open(id); return true; }
        catch (error) { console.warn("[dsh-im-connect] 无法打开会话", id, error); return false; }
      };
      ctx.slots.inject("settings.section", () => ctx.slots.register({
          name: "settings.section",
          id: "im-assistant",
          order: 28,
          label: () => t("settings.label"),
          icon: "chat",
          locale: IM_LOCALE_NS,
        inject: () => ({
          createWorkspace: (input) => ctx.workspaces.create(input),
          pickDirectory: () => ctx.workspaces.pickDirectory(),
          permissionT,
          modelT,
        }),
      }, LocalizedSettingsPage));

      ctx.slots.inject("sidebar.channels", () => ctx.slots.register({
          name: "sidebar.channels",
          id: "im-connect-channels",
          locale: IM_LOCALE_NS,
        inject: () => ({
          openSession: (id) => { ctx.sessions.open(id); },
          open: (id) => { ctx.sessions.open(id); },
          archiveSession: (id) => ctx.workspaces.archiveSession(id),
          forkSession: (id) => {
            ctx.sessions.fork({ sessionId: id, increaseTitle: true })
              .then((childId) => { ctx.sessions.open(childId); })
              .catch(() => undefined);
          },
          renameSession: async (sessionId, title) => {
            const session = ctx.sessions.binding && ctx.sessions.binding(sessionId)?.session;
            if (!session) throw new Error("unknown session");
            const result = await session.rename(title);
            if (!result.ok) throw new Error(result.error.message);
          },
        }),
        }, ChannelRail));

      // 只包一层官方任务树，绝不在通知回调里再 register，否则会把启动卡在 Loading plugins。
      ctx.slots.inject("sidebar.workspaces", () => {
        let wrappedEntry = null;
        let originalComp = null;
        let removeInsertedTab = () => {};
        let stopInsertedTabLocale = () => {};
        let insertedTabRegistry = null;
        let syncing = false;
        const clearInsertedTab = () => {
          stopInsertedTabLocale();
          stopInsertedTabLocale = () => {};
          removeInsertedTab();
          removeInsertedTab = () => {};
          insertedTabRegistry = null;
        };
        const unwrap = () => {
          clearInsertedTab();
          if (wrappedEntry && originalComp) {
            try { wrappedEntry.component = originalComp; } catch { /* ignore */ }
          }
          wrappedEntry = null;
          originalComp = null;
        };
        const insertChannelTab = (entry) => {
          const registry = findNativeTabRegistry(entry);
          if (!registry) return false;
          if (registry.getTabs().some((item) => item.id === "channels")) {
            if (insertedTabRegistry && insertedTabRegistry !== registry) clearInsertedTab();
            return true;
          }
          clearInsertedTab();
          insertedTabRegistry = registry;
          const refreshInsertedTab = () => {
            removeInsertedTab = registry.insert({
              id: "channels",
              label: t("rail.channels"),
              order: 20,
              matchSession: (id) => String(id).startsWith("im:"),
              render: (props) => h(LocalizedChannelRail, Object.assign({}, props, {
                skin: "native",
                openSession: (id) => openListedSession(id, props.openSession || props.open),
                open: (id) => openListedSession(id, props.openSession || props.open),
              })),
            });
          };
          refreshInsertedTab();
          stopInsertedTabLocale = subscribeLocale(refreshInsertedTab);
          return true;
        };
        const sync = () => {
          if (syncing) return;
          syncing = true;
          try {
            const combo = hasDshCodexUiSidebar(ctx);
            channelSkin = combo ? "codex" : "native";
            if (combo) {
              unwrap();
              return;
            }
            const entries = (ctx.slots.entries && ctx.slots.entries("sidebar.workspaces")) || [];
            const occupant = entries.find((item) => item && item.component);
            if (occupant && (occupant.component.__dshNativeTabHost || occupant.component.__dshAutomationWrapped || findNativeTabRegistry(occupant))) {
              insertChannelTab(occupant);
              return;
            }
            if (wrappedEntry && wrappedEntry.component && wrappedEntry.component.__imConnectWrapped) {
              insertChannelTab(wrappedEntry);
              return;
            }
            const official = pickOfficialWorkspaces(ctx);
            if (!official || official.component.__imConnectWrapped || official.component.__dshNativeTabHost) return;
            originalComp = official.component;
            const registry = createNativeTabRegistry(originalComp);
            attachNativeTabRegistry(official, registry);
            function ImNativeWorkspaceShell(innerProps) {
              return h(LocalizedSessionSwitcher, Object.assign({}, innerProps, { officialTree: originalComp, nativeTabs: registry }));
            }
            ImNativeWorkspaceShell.displayName = "ImNativeWorkspaceShell";
            ImNativeWorkspaceShell.__imConnectWrapped = true;
            ImNativeWorkspaceShell.__imConnectOriginal = originalComp;
            ImNativeWorkspaceShell.__dshNativeTabHost = true;
            attachNativeTabRegistry(ImNativeWorkspaceShell, registry);
            official.component = ImNativeWorkspaceShell;
            wrappedEntry = official;
          } catch (error) {
            console.warn("[dsh-im-connect] 包裹官方任务树失败", error);
          } finally {
            syncing = false;
          }
        };
        sync();
        const unsub = typeof ctx.slots.subscribe === "function" ? ctx.slots.subscribe("sidebar.workspaces", sync) : () => {};
        return () => { unsub(); unwrap(); };
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
