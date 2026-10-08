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
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const HostMenu = typeof primitives.Menu === "function" ? primitives.Menu : function MissingHostMenu(props) { return props.anchor || null; };
    const HostModal = typeof primitives.Modal === "function" ? primitives.Modal : function MissingHostModal() { return null; };
    const HostButton = typeof primitives.Button === "function" ? primitives.Button : function MissingHostButton(props) { return h("button", { type: "button", className: props && props.className, disabled: props && props.disabled, onClick: props && props.onClick }, props && props.children); };
    // 0.1.7 把尺寸从图标名里拿掉了（IconEditOutlineRegular）。旧宿主仍导出 *16/*20。
    function pickHostIcon(...names) {
      for (const name of names) {
        const icon = primitives[name];
        if (typeof icon === "function") return icon;
      }
      return function MissingHostIcon() { return null; };
    }
    function hostOrFallback(icon, Fallback) {
      return function HostOrFallback(props) {
        const node = icon(props);
        return node == null ? Fallback(props) : node;
      };
    }
    // 0.1.7 的 Menu 会渲染 children。更早的 Menu 只认 items。样式和列表功能不再按宿主版本分叉。
    function hostMenuRendersChildren() {
      return typeof primitives.IconEllipsisOutlineRegular === "function";
    }
    /**
     * 宿主 renderer 对「调用本 entry 未声明的子槽位」是直接抛 SlotOwnershipError 的，抛点在调用瞬间。
     * sidebar.workspaces.session.menu.item 和 row.action 都是 0.1.7 才声明的子槽位，旧宿主
     * （0.1.2 / 0.1.5）没有：一旦抛到宿主，宿主的槽位错误边界只会给这块画一个空的 crash div，
     * 整块会话列表跟着消失（Issue #13）。这里统一兜住，失败只当该槽位没有内容。
     */
    const skippedHostSlotKeys = new Set();
    function renderHostSlot(renderSlot, key, slotProps, options) {
      if (typeof renderSlot !== "function") return undefined;
      try {
        return renderSlot(key, slotProps, options);
      } catch (error) {
        if (!skippedHostSlotKeys.has(key)) {
          skippedHostSlotKeys.add(key);
          console.warn("[dsh-im-connect] 宿主未声明槽位 " + key + "，已跳过该槽位", error);
        }
        return undefined;
      }
    }
    const IconListPenOutline16 = pickHostIcon("IconListPenOutlineRegular", "IconListPenOutline16");
    const IconEditOutline16 = pickHostIcon("IconEditOutlineRegular", "IconEditOutline16");
    const IconBranchOutline16 = pickHostIcon("IconBranchOutlineRegular", "IconBranchOutline16");
    const IconArchiveOutline20 = pickHostIcon("IconArchiveOutlineRegular", "IconArchiveOutline20");
    const IconArchiveCheckHost = pickHostIcon("IconArchiveCheckOutlineRegular");
    const IconTrashOutline16 = pickHostIcon("IconTrashOutlineRegular", "IconTrashOutline16");
    const IconEllipsisOutline16 = pickHostIcon("IconEllipsisOutlineRegular", "IconEllipsisOutline16");
    const IconSearchHost = pickHostIcon("IconSearchOutlineRegular", "IconSearchOutline16");
    const IconCloseFillHost = pickHostIcon("IconCloseFillRegular", "IconCloseOutline16");
    const IconSlidersHost = pickHostIcon("IconSlidersTwoOutlineRegular", "IconSlidersOutline16");
    const IconFolderClose = pickHostIcon("IconFolderCloseRegular", "IconFolderClose16", "IconFolderClose");
    const IconClockOutline = pickHostIcon("IconClockOutlineRegular", "IconClockOutline16");
    const IconFlatListOutline = pickHostIcon("IconFlatListOutlineRegular");
    const antd = require("antd");
    const { ConfigProvider, theme, Modal, Select, Switch, Button: AntdButton, Input, Progress, Checkbox, Segmented, Tag, Alert } = antd;
    function Button(props) {
      return React.createElement(AntdButton, Object.assign({ shape: "round", size: "middle" }, props));
    }
    const zhCN = require("antd/locale/zh_CN");
    const enUS = require("antd/locale/en_US");
    const antdZh = zhCN && zhCN.default ? zhCN.default : zhCN;
    const antdEn = enUS && enUS.default ? enUS.default : enUS;
    const HoverCard = primitives.HoverCard;
    const StateDot = primitives.StateDot;
    const IconSettingsOutline16 = pickHostIcon("IconSettingsOutlineRegular", "IconSettingsOutline16");
    const ARCHIVE_MANAGER_PLUGIN = "@michengai/dsh-archive-manager";
    function hasArchiveManagerPlugin(root) {
      return !!(root && typeof root.querySelector === "function" && root.querySelector('[data-plugin="' + ARCHIVE_MANAGER_PLUGIN + '"]'));
    }
    function canDeleteChannelSession(archiveManagerInstalled, deleteSession) {
      return archiveManagerInstalled && typeof deleteSession === "function";
    }
    function canArchiveChannelGroup(archiveManagerInstalled, archiveSession) {
      return archiveManagerInstalled && typeof archiveSession === "function";
    }
    function folderPath(path) {
      return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }
    function owningParentFolder(path, candidates) {
      const child = folderPath(path);
      let owner;
      let length = -1;
      for (const parent of candidates) {
        const root = folderPath(parent);
        if (root.length > length && child !== root && child.startsWith(root + "/")) {
          owner = parent;
          length = root.length;
        }
      }
      return owner;
    }
    function workspaceKey(workspace) {
      return workspace.workspaceId || workspace.id || workspace.path || "";
    }
    /** 0.1.7 宿主的按工作区树：子目录挂到路径最长的已打开工作区下面。 */
    function groupChannelSessionsByWorkspaceTree(sessions, workspaces, ungroupedLabel) {
      const bySession = new Map();
      for (const workspace of workspaces || []) {
        for (const sessionId of workspace.sessionIds || []) bySession.set(sessionId, workspace);
      }
      const buckets = new Map();
      const ungrouped = [];
      for (const session of sessions) {
        const workspace = bySession.get(session.sessionId);
        const key = workspace ? workspaceKey(workspace) : "";
        if (!workspace || !key) { ungrouped.push(session); continue; }
        const bucket = buckets.get(key) || [];
        bucket.push(session);
        buckets.set(key, bucket);
      }
      const byPath = new Map();
      for (const workspace of workspaces || []) {
        if (workspace.path) byPath.set(folderPath(workspace.path), workspace);
      }
      const included = new Map();
      for (const workspace of workspaces || []) {
        const key = workspaceKey(workspace);
        if (!key || !buckets.has(key)) continue;
        included.set(key, workspace);
        let path = workspace.path;
        const seen = new Set();
        while (path && !seen.has(path)) {
          seen.add(path);
          const parentPath = owningParentFolder(path, [...byPath.keys()]);
          if (!parentPath) break;
          const parent = byPath.get(folderPath(parentPath));
          const parentKey = parent ? workspaceKey(parent) : "";
          if (!parent || !parentKey) break;
          included.set(parentKey, parent);
          path = parent.path;
        }
      }
      const present = [...included.values()];
      const paths = present.map((workspace) => workspace.path).filter(Boolean);
      const children = new Map();
      const roots = [];
      for (const workspace of present) {
        const parentPath = workspace.path ? owningParentFolder(workspace.path, paths) : undefined;
        const parent = parentPath ? present.find((item) => item.path && folderPath(item.path) === folderPath(parentPath)) : undefined;
        const parentKey = parent ? workspaceKey(parent) : "";
        if (!parent || !parentKey) roots.push(workspace);
        else {
          const list = children.get(parentKey) || [];
          list.push(workspace);
          children.set(parentKey, list);
        }
      }
      const byName = (left, right) => String(left.title || left.path || "").localeCompare(String(right.title || right.path || ""));
      const groups = [];
      const walk = (workspace, depth) => {
        const key = workspaceKey(workspace);
        const sessionsInWorkspace = buckets.get(key) || [];
        const channelIds = [...new Set(sessionsInWorkspace.map((session) => session.channelId).filter(Boolean))];
        groups.push({
          id: key,
          label: workspace.title || workspace.path || ungroupedLabel,
          depth,
          keep: sessionsInWorkspace.length === 0,
          channelId: channelIds.length === 1 ? channelIds[0] : "",
          sessions: sessionsInWorkspace,
        });
        for (const child of (children.get(key) || []).slice().sort(byName)) walk(child, depth + 1);
      };
      for (const root of roots.slice().sort(byName)) walk(root, 0);
      if (ungrouped.length) groups.push({ id: "", label: ungroupedLabel, depth: 0, channelId: "", sessions: ungrouped });
      return groups;
    }
    function channelSessionHoverStatuses(input, t) {
      const count = input.runningSubagentCount || 0;
      const subagents = count === 0 ? undefined : { state: "ongoing", label: t("rail.subagents", { n: count, count }) };
      let pending;
      if (input.pendingKind === "approval") pending = { state: "warning", label: t("rail.waitingApproval"), trailing: t("rail.compactApproval") };
      else if (input.pendingKind === "plan-review") pending = { state: "warning", label: t("rail.planReview"), trailing: t("rail.compactPlan") };
      else if (input.pendingKind === "question") pending = { state: "warning", label: t("rail.waitingAnswer"), trailing: t("rail.compactAnswer") };
      let statuses;
      if (pending) statuses = subagents ? [pending, subagents] : [pending];
      else if (input.running) statuses = subagents ? [{ state: "ongoing", label: t("rail.running") }, subagents] : [{ state: "ongoing", label: t("rail.running") }];
      else if (subagents) statuses = [subagents];
      else if (input.completed) statuses = [{ state: "done", label: t("rail.completed") }];
      else statuses = [{ state: "idle", label: t("rail.idle") }];
      const visible = statuses.filter((status) => !(input.archived && (status.state === "done" || status.state === "idle")));
      if (input.archived) visible.push({ state: "archived", label: t("rail.archived") });
      return visible;
    }
    function placeSessionTitle(title, left, range) {
      title.scrollLeft = left;
      if (left > 0) title.dataset.scrolled = "";
      else delete title.dataset.scrolled;
      if (left < range) title.dataset.clipped = "";
      else delete title.dataset.clipped;
    }
    function restSessionTitle(title) {
      title.scrollLeft = 0;
      delete title.dataset.scrolled;
      delete title.dataset.clipped;
    }
    function startSessionTitleMarquee(title, frame) {
      if (!title) return;
      const range = title.scrollWidth - title.clientWidth;
      if (range <= 8) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        placeSessionTitle(title, range, range);
        return;
      }
      cancelAnimationFrame(frame.id);
      let previous;
      let position = 0;
      const step = (now) => {
        position += previous === undefined ? 0 : (now - previous) * 0.03;
        previous = now;
        placeSessionTitle(title, Math.min(position, range), range);
        if (position < range) frame.id = requestAnimationFrame(step);
      };
      frame.id = requestAnimationFrame(step);
    }
    function stopSessionTitleMarquee(title, frame) {
      cancelAnimationFrame(frame.id);
      if (title) restSessionTitle(title);
    }
    function channelSessionVisible(sessionId, archived, filter) {
      if (!sessionId) return false;
      const isArchived = archived.has(sessionId);
      if (filter === "only") return isArchived;
      if (filter === "show") return true;
      return !isArchived;
    }
    async function archiveChannelGroup(sessionIds, archiveSession, options) {
      for (const sessionId of sessionIds) await archiveSession(sessionId, options);
    }
    function openStopArchive(error, target, open) {
      if (typeof open !== "function" || !activeSessionRefusal(error)) return false;
      open(target);
      return true;
    }
    async function finishStopArchive(target, archiveSession) {
      if (!target || typeof archiveSession !== "function") return "unavailable";
      if (target.sessionIds) {
        await archiveChannelGroup(target.sessionIds, archiveSession, { stopActivity: true });
        return "group";
      }
      await archiveSession(target.id, { stopActivity: true });
      return "session";
    }
    const CHANNEL_SETTINGS_EVENT = "dsh-im-connect:open-channel-settings";
    const CHANNEL_SETTINGS_STORAGE_KEY = "dsh-im-connect:pending-channel-settings";
    const SETTINGS_CODEX_TRIGGER_SELECTOR = "[data-dcu-settings-trigger]";
    const SETTINGS_CODEX_PAGE_SELECTOR = "[data-dcu-settings-page]";
    const SETTINGS_OPEN_SECTION_EVENT = "dcu-settings-open-section";
    function parseChannelSettingsRequest(value) {
      if (!value || typeof value !== "object") return undefined;
      const channelId = typeof value.channelId === "string" ? value.channelId.trim() : "";
      if (!channelId) return undefined;
      return { channelId, name: typeof value.name === "string" ? value.name : "" };
    }
    function writeChannelSettingsRequest(storage, request) {
      try { storage && storage.setItem(CHANNEL_SETTINGS_STORAGE_KEY, JSON.stringify(request)); } catch { /* ignore */ }
    }
    function requestChannelSettings(request) {
      if (typeof window === "undefined") return;
      writeChannelSettingsRequest(window.sessionStorage, request);
      window.dispatchEvent(new CustomEvent(CHANNEL_SETTINGS_EVENT, { detail: request }));
    }
    function readChannelSettingsRequest(storage) {
      if (!storage) return undefined;
      try {
        const raw = storage.getItem(CHANNEL_SETTINGS_STORAGE_KEY);
        return raw == null ? undefined : parseChannelSettingsRequest(JSON.parse(raw));
      } catch { return undefined; }
    }
    function clearChannelSettingsRequest(storage) {
      try { storage && storage.removeItem(CHANNEL_SETTINGS_STORAGE_KEY); } catch { /* ignore */ }
    }
    function resolveChannelSettingsTarget(request, channels) {
      const parsed = parseChannelSettingsRequest(request);
      if (!parsed || !Array.isArray(channels)) return undefined;
      const channel = channels.find((item) => item && item.id === parsed.channelId);
      if (!channel) return undefined;
      const accounts = channel.accounts || [];
      return { channelId: channel.id, accountId: accounts.length === 1 ? accounts[0].id : undefined };
    }
    function pickSettingsSectionButton(buttons, labels) {
      for (const label of labels) {
        const target = String(label || "").trim();
        if (!target) continue;
        const match = buttons.find((button) => String(button.textContent || "").replace(/\s+/g, " ").trim() === target);
        if (match) return match;
      }
      return undefined;
    }
    function pickSettingsLauncher(buttons) {
      const named = buttons.find((button) => {
        const label = `${button.textContent || ""} ${typeof button.getAttribute === "function" ? button.getAttribute("aria-label") || "" : ""}`.trim();
        return /(^|\s)(设置|settings)(\s|$)/i.test(label);
      });
      return named || (buttons.length === 1 ? buttons[0] : undefined);
    }
    function requestCodexSettingsSection(labels) {
      const trigger = typeof document !== "undefined" && document.querySelector(SETTINGS_CODEX_TRIGGER_SELECTOR);
      if (!trigger) return false;
      const request = new CustomEvent(SETTINGS_OPEN_SECTION_EVENT, { detail: { labels: [...labels] }, cancelable: true });
      return !trigger.dispatchEvent(request);
    }
    function openSettingsSection(labels, onSelected, onMissing) {
      if (typeof document === "undefined" || typeof window === "undefined") {
        if (onMissing) onMissing();
        return;
      }
      if (requestCodexSettingsSection(labels)) {
        if (onSelected) onSelected();
        return;
      }
      const launchers = [...document.querySelectorAll('button[aria-haspopup="dialog"]')];
      const launcher = pickSettingsLauncher(launchers);
      const pageTrigger = document.querySelector(SETTINGS_CODEX_TRIGGER_SELECTOR);
      const dialogOpen = document.querySelector('[role="dialog"]') !== null;
      const pageOpen = document.querySelector(SETTINGS_CODEX_PAGE_SELECTOR) !== null;
      if (!dialogOpen && !pageOpen && !launcher && !pageTrigger) {
        if (onMissing) onMissing();
        return;
      }
      if (!dialogOpen && !pageOpen) (pageTrigger || launcher).click();
      let frame;
      let finished = false;
      const observer = new MutationObserver(() => { schedule(); });
      const cleanup = () => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        window.clearTimeout(timeout);
        if (frame !== undefined) window.cancelAnimationFrame(frame);
      };
      const select = () => {
        const buttons = [
          ...document.querySelectorAll('[role="dialog"] nav button'),
          ...document.querySelectorAll(SETTINGS_CODEX_PAGE_SELECTOR + " nav button"),
        ];
        const target = pickSettingsSectionButton(buttons, labels);
        if (!target) return false;
        cleanup();
        target.click();
        if (onSelected) onSelected();
        return true;
      };
      const schedule = () => {
        if (finished || frame !== undefined) return;
        frame = window.requestAnimationFrame(() => { frame = undefined; select(); });
      };
      const timeout = window.setTimeout(() => {
        if (select()) return;
        cleanup();
        if (onMissing) onMissing();
      }, 1500);
      observer.observe(document.body, { childList: true, subtree: true });
      schedule();
    }
    const EMPTY_EXTRA_TABS = [];
    const inject = ["slots", "sessions", "workspaces", "locale"];
    const API_BASE = "/api/dsh-im-connect";
    const TAB_KEY = "dsh-im-connect.sidebar-tab";
    const ACCOUNT_SELECTION_KEY = "dsh-im-connect.settings.selected-account";
    const IM_LOCALE_NS = "im-connect";
    const UPDATE_ICON_PATHS = {
      refresh: ["M13.5 5.5V2.5m0 0h-3m3 0-2.1 2.1A5.5 5.5 0 1 0 13.2 12"],
      download: ["M8 2v8m0 0 3-3m-3 3-3-3M3 13v2h10v-2"],
      copy: ["M5 5h8v8H5z", "M3 3h8"],
      close: ["m4 4 8 8M12 4 4 12"],
    };
    function createPluginUpdateIcon(name) {
      const element = document.createElement("span");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 16 16");
      svg.setAttribute("width", "16");
      svg.setAttribute("height", "16");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.5");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.setAttribute("aria-hidden", "true");
      UPDATE_ICON_PATHS[name].forEach((d) => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        svg.append(path);
      });
      element.append(svg);
      return element;
    }
    const IM_LOCALES = {
      zh: {
        "diagnostic.title": "连接诊断", "diagnostic.scope": "以下为本次平台接口或心跳检查结果。未发送测试消息，消息投递权限仍未验证。", "diagnostic.credentials": "应用凭据验证", "diagnostic.bot": "机器人身份查询", "diagnostic.webhook": "Webhook 冲突检查", "diagnostic.gateway": "网关查询", "diagnostic.config": "微信配置查询（getconfig）", "diagnostic.heartbeat": "企微连接心跳（ping）", "diagnostic.passed": "通过", "diagnostic.failed": "失败", "diagnostic.unverified": "未验证",
        "diagnostic.local-state": "无法读取凭据或初始化本地账号状态，请检查本机配置及文件访问权限。", "diagnostic.cancelled": "诊断已取消，未确认连接状态。", "diagnostic.ok": "平台已返回有效响应", "diagnostic.auth": "凭据缺失或失效，请重新配置或扫码绑定。", "diagnostic.permission": "平台拒绝访问，请检查应用权限。", "diagnostic.rate-limit": "平台限流，请稍后再试。", "diagnostic.server": "平台服务异常，请稍后再试。", "diagnostic.network": "网络请求失败，请检查网络或代理。", "diagnostic.timeout": "诊断超时，请检查网络后重试。", "diagnostic.invalid-response": "平台响应不完整或格式不符，无法确认可用。", "diagnostic.rejected": "平台拒绝请求，请核对应用配置和权限。", "diagnostic.webhook-conflict": "已设置 Webhook，与当前轮询方式冲突；请在其他服务停用该机器人的 Webhook。", "diagnostic.missing-context": "缺少原聊天上下文，请用扫码账号先发送一条消息后重试。", "diagnostic.not-connected": "当前没有可验证的连接，请先重新连接。", "diagnostic.unsupported": "当前 SDK 或配置不支持此诊断，未判定为通过。", "diagnostic.changed": "账号状态已变化，请重新诊断。", "connection.restartRequired": "前后端版本不一致。请完整重启 DSH 并刷新页面后重新诊断。", "connection.receiveUnknown": "无法读取接收开关，请重启 DSH 并刷新页面。",
        "connection.checkFailed": "状态检查未完成，请重试；仍失败时查看本机日志。",
        "connection.connected": "已连接", "connection.connecting": "连接中", "connection.reconnecting": "重连中", "connection.disconnected": "未连接", "connection.stopped": "已停止", "connection.error": "连接异常", "connection.unknown": "状态未知", "connection.paused": "接收已暂停",
        "connection.title": "本次状态检查", "connection.scope": "仅检查本机渠道运行状态，未验证平台凭据或消息收发。", "connection.checkedAt": "检查时间", "connection.receiveOn": "接收开关已开启", "connection.receiveOff": "接收开关已关闭；请在账号列表开启后再发送消息。", "connection.checking": "检查中…",
        "connection.next.connected": "可在原聊天发送消息验证收发；私聊仍需符合准入设置。", "connection.next.connecting": "请稍后再次检查；等待扫码时请完成手机确认。", "connection.next.reconnecting": "渠道正在尝试恢复，请稍后再次检查。", "connection.next.disconnected": "请重新连接；需要扫码的渠道可重新添加绑定。", "connection.next.stopped": "请点击重新连接以启动账号。", "connection.next.error": "请尝试重新连接；仍有异常时查看本机日志。", "connection.next.unknown": "暂时无法确认状态，请稍后再检查或查看本机日志。",
        "settings.label": "IM助理", "settings.title": "IM助理", "settings.description": "管理各渠道账号。每个账号独立选择工作区、模型和权限，配置仅保存在本机。", "settings.viewProject": "GitHub", "settings.feedback": "问题反馈",
        "settings.aria": "IM助理", "settings.publicChatNotice": "未批准用户可以发起聊天，但不能批准工具调用。", "pending.notice": "有访问请求。批准后该用户才能驱动本机助手。", "action.approve": "批准", "action.deny": "拒绝", "loading": "加载中…",
        "account.presetUnavailable": "预设不可用", "account.presetNote": "更改后使用新会话，旧会话保留。", "action.settings": "设置", "command.dm": "私聊命令", "command.group": "群聊命令", "command.enabled": "可以执行命令", "command.disabled": "仅正常对话",
        "account.workspace": "工作区", "account.currentWorkspace": "当前工作区", "account.selectWorkspace": "请选择工作区", "account.selectModel": "请选择模型", "account.selectPermission": "请选择权限", "account.privateAccess": "私聊准入", "account.privateApproved": "仅已批准用户", "account.privateAll": "允许所有私聊用户", "account.autoNameNote": "绑定成功后会自动生成账号名，无需手动填写。需要区分使用者时，可在账号行填写备注。", "account.defaultName": "{channel}账号 {count}",
        "account.remark": "名称备注", "account.remarkNote": "只在本机设置页区分账号，留空恢复自动名称。", "account.rename": "修改名称备注",
        "account.count": "{count} 个账号", "account.statusProcessing": "处理中…", "account.statusNotConnected": "未连接", "account.receive": "接收消息", "account.receiveDescription": "关闭后保留账号配置，但不接收新消息", "account.removeConfirm": "确定移除这个账号？本机保存的配置和凭据将一并删除。",
        "action.addAccount": "添加账号", "action.generateQr": "生成二维码", "action.checkConnection": "诊断连接", "action.reconnectAccount": "重新连接", "action.removeAccount": "移除接入", "status.saving": "保存中…", "status.saved": "已保存",
        "channel.dingtalk": "钉钉", "channel.feishu": "飞书", "channel.lark": "Lark", "channel.weixin": "微信", "channel.wecom": "企业微信", "channel.qq": "QQ", "channel.telegram": "Telegram", "channel.discord": "Discord", "channel.slack": "Slack",
        "field.dingtalk.clientId": "Client ID（原 AppKey）", "field.dingtalk.clientSecret": "Client Secret（原 AppSecret）",
        "field.wecom.botId": "Bot ID", "field.wecom.secret": "Secret", "field.qq.appId": "AppID", "field.qq.appSecret": "AppSecret", "field.telegram.token": "Bot Token", "field.discord.token": "Bot Token", "field.slack.token": "Bot Token（xoxb- 开头）", "field.slack.appToken": "App Token（xapp- 开头）",
        "bind.title": "配置 {channel}", "bind.quick": "快捷绑定（推荐）", "bind.manual": "手动配置", "bind.saving": "正在保存账号…", "bind.success": "绑定成功，频道已连接", "bind.newIdentity": "检测到新的账号身份，已创建新账号", "bind.qrAlt": "{channel} 绑定二维码", "bind.generating": "正在生成…", "bind.expire": "二维码 {time} 后过期", "bind.scanned": "已扫码，请在手机上确认", "bind.retry": "请重新生成二维码", "bind.refresh": "重新生成二维码", "action.saving": "保存中…", "action.confirm": "确认",
        "qr.weixin": "请使用微信扫描二维码完成绑定", "qr.feishu": "请使用飞书扫描二维码，将自动创建机器人", "qr.lark": "请使用 Lark 扫描二维码完成配对", "qr.wecom": "请使用企业微信扫描二维码，快捷绑定机器人", "qr.dingtalk": "请使用钉钉扫描二维码，自动创建机器人", "qr.qq": "请使用手机 QQ 扫描二维码，创建开放平台机器人", "qr.default": "请使用对应 App 扫描二维码",
        "status.connected": "已连接", "action.more": "{channel} 更多",
        "error.loadAssistant": "无法加载账号配置", "error.noModels": "当前 Host 还没有可用模型，请先在网页里配置提供商", "error.save": "保存失败", "error.chooseWorkspace": "请选择工作区目录", "error.workspaceUnavailable": "当前 Host 无法新增工作区", "error.addWorkspace": "新增工作区失败", "error.load": "加载失败", "error.connection": "无法连接本机 IM 助理接口", "error.request": "请求失败", "error.action": "操作失败", "error.qr": "无法生成二维码", "error.detailsInLog": "操作失败，请查看服务器日志。",
        "composer.noWorkspaces": "暂无工作区", "composer.addWorkspace": "添加工作区…", "composer.permission": "权限", "composer.noModels": "暂无模型", "composer.workspacePath": "工作区路径", "action.cancel": "取消", "action.adding": "添加中…",
        "permission.readOnly": "只读", "permission.workspaceWrite": "工作区写入", "permission.fullAccess": "完全访问",
        "rail.workspace": "工作区", "rail.sessions": "会话", "rail.search": "搜索", "rail.searchPlaceholder": "搜索会话...", "rail.clearSearch": "清除搜索", "rail.filter": "筛选", "rail.group": "分组方式", "rail.byWorkspace": "按工作区", "rail.list": "单列表", "rail.byWorkspaceTree": "按工作区树", "rail.sort": "排序方式", "rail.recent": "最近更新", "rail.showArchived": "显示已归档", "rail.onlyArchived": "仅显示已归档", "rail.running": "运行中", "rail.idle": "空闲", "rail.waitingApproval": "等待审批", "rail.planReview": "计划待审", "rail.waitingAnswer": "等待回答", "rail.subagents": "{n} 个子代理运行中", "rail.completed": "已完成", "rail.archived": "已归档", "rail.compactApproval": "待审批", "rail.compactPlan": "计划待审", "rail.compactAnswer": "待回答", "rail.renameAria": "重命名会话", "rail.rename": "重命名", "rail.fork": "分叉会话", "rail.archive": "归档会话", "rail.unarchive": "恢复会话", "rail.stopArchive": "停止并归档", "rail.stopArchiveDescription": "会话“{name}”仍在运行。停止后才能归档。", "rail.stopArchiveConfirm": "停止并归档", "rail.stopArchivePending": "正在停止并归档…", "rail.stopArchiveGroupDescription": "“{name}”下仍有运行中的会话。停止这些会话后才能归档整组。", "rail.archiveFailed": "归档失败，未移除会话。请稍后重试或检查宿主日志。", "rail.deleteSession": "删除会话", "rail.deleteSessionConfirm": "删除会话", "rail.deleteSessionDescription": "将永久删除会话“{name}”及其子代理（含正在运行的）和全部记录（对话内容、统计、缓存），此操作不可恢复。", "rail.deleteSessionPending": "正在删除会话…", "rail.deleteSessionFailed": "删除会话失败：{message}", "rail.deleteSessionClose": "关闭", "rail.deleteSessionCancel": "取消", "rail.groupActions": "“{name}”的频道操作", "rail.channelSettings": "渠道设置", "rail.archiveGroup": "归档整组会话", "rail.archiveGroupConfirm": "确认归档", "rail.archiveGroupDescription": "将归档“{name}”下的 {count} 个会话。归档后可以在“设置 → 已归档”中恢复。", "rail.archiveGroupPending": "正在归档整组会话…", "rail.archiveGroupFailed": "部分会话归档失败：{message}", "rail.archiveGroupClose": "关闭", "rail.archiveGroupCancel": "取消", "rail.empty": "还没有频道会话。先在设置 → IM助理 里连接渠道，并给机器人发一条消息。", "rail.noTasks": "暂无网页任务", "rail.ungrouped": "未分组", "rail.tabsAria": "工作区分类", "rail.tasks": "任务", "rail.channels": "频道",
        "time.now": "刚刚", "time.minutes": "{n}分钟", "time.hours": "{n}小时", "time.days": "{n}天", "time.months": "{n}个月", "time.years": "{n}年", "time.ago": "{t}前",
        "copy": "复制", "hover.copied": "已复制",
        "server.unknownChannel": "未知渠道", "server.channelUnconfigured": "渠道未配置", "server.sessionMissing": "会话不存在", "server.accountMissing": "账号不存在", "server.accountConnectFailed": "账号连接失败，请查看本机日志", "server.accountReconnectFailed": "重新连接失败，请查看本机日志", "server.selectAccountSettings": "请选择提供商、模型、工作区或权限", "server.selectModel": "请选择提供商和模型", "server.selectWorkspace": "请选择工作区", "server.selectPermission": "请选择权限", "server.missingCredentials": "凭据不足，无法启动渠道", "server.qrUnsupported": "该渠道不支持扫码绑定", "server.qrExpired": "二维码已过期", "server.qrIncomplete": "扫码未完成", "server.accessDenied": "未授权：请管理员在设置 → IM助理 中批准你的访问。", "server.remarkTooLong": "账号备注不能超过 40 个字符", "server.remarkControl": "账号备注不能包含换行或控制字符",
        "status.disconnected": "已断开", "status.reconnectFailed": "重连失败", "status.connectingSocket": "连接中", "status.waitHandshake": "等待网关握手", "status.authenticating": "鉴权中", "status.reconnecting": "重连中", "status.connectionError": "连接错误", "status.connectionFailed": "连接失败", "status.streamConnected": "Stream 已连接", "status.stopped": "已停止", "status.longConnection": "长连接已建立", "status.polling": "轮询中", "status.notLoggedIn": "未登录", "status.waitQr": "等待扫码", "status.loggedIn": "已登录", "status.loggedInRecovered": "已登录（自动恢复）", "status.loggingIn": "登录中",
      },
      en: {
        "diagnostic.title": "Connection diagnostics", "diagnostic.scope": "Results from platform queries or a connection heartbeat in this check. No test messages were sent; message delivery permissions remain unverified.", "diagnostic.credentials": "Application credentials", "diagnostic.bot": "Bot identity query", "diagnostic.webhook": "Webhook conflict check", "diagnostic.gateway": "Gateway query", "diagnostic.config": "WeChat configuration (getconfig)", "diagnostic.heartbeat": "WeCom heartbeat (ping)", "diagnostic.passed": "Passed", "diagnostic.failed": "Failed", "diagnostic.unverified": "Unverified",
        "diagnostic.local-state": "Could not read credentials or initialize local account state. Check local configuration and file permissions.", "diagnostic.cancelled": "The check was cancelled. Connection status was not verified.", "diagnostic.ok": "The platform returned a valid response", "diagnostic.auth": "Credentials are missing or invalid. Configure or pair the account again.", "diagnostic.permission": "Access was denied. Check application permissions.", "diagnostic.rate-limit": "The platform rate limit was reached. Retry later.", "diagnostic.server": "The platform service failed. Retry later.", "diagnostic.network": "The request failed. Check your network or proxy.", "diagnostic.timeout": "The check timed out. Check your network and retry.", "diagnostic.invalid-response": "The platform response was incomplete or invalid. Availability could not be confirmed.", "diagnostic.rejected": "The platform rejected the request. Check application settings and permissions.", "diagnostic.webhook-conflict": "A Webhook is configured and conflicts with polling. Disable this bot's Webhook in the other service.", "diagnostic.missing-context": "The original chat context is missing. Send a message from the paired account and retry.", "diagnostic.not-connected": "No active connection is available to verify. Reconnect first.", "diagnostic.unsupported": "The current SDK or configuration does not support this check. It has not passed.", "diagnostic.changed": "The account state changed. Run diagnostics again.", "connection.restartRequired": "The frontend and backend versions do not match. Fully restart DSH, refresh this page, and retry.", "connection.receiveUnknown": "The receiving setting is unavailable. Restart DSH and refresh this page.",
        "connection.checkFailed": "The status check could not be completed. Retry, or check the local logs if it keeps failing.",
        "connection.connected": "Connected", "connection.connecting": "Connecting", "connection.reconnecting": "Reconnecting", "connection.disconnected": "Disconnected", "connection.stopped": "Stopped", "connection.error": "Connection error", "connection.unknown": "Status unknown", "connection.paused": "Receiving paused",
        "connection.title": "Status check result", "connection.scope": "Checks local channel runtime only. Platform credentials and message delivery have not been verified.", "connection.checkedAt": "Checked at", "connection.receiveOn": "Receiving is enabled", "connection.receiveOff": "Receiving is disabled. Enable it in the account list before sending messages.", "connection.checking": "Checking…",
        "connection.next.connected": "Send a message in the original chat to verify delivery. Private chats still follow access settings.", "connection.next.connecting": "Check again shortly. Complete confirmation on your phone if a QR scan is pending.", "connection.next.reconnecting": "The channel is attempting to recover. Check again shortly.", "connection.next.disconnected": "Reconnect the account. QR channels may need to be added again.", "connection.next.stopped": "Select Reconnect to start the account.", "connection.next.error": "Try reconnecting. If the issue persists, check the local logs.", "connection.next.unknown": "The current state could not be confirmed. Check again later or inspect the local logs.",
        "settings.label": "IM Assistant", "settings.title": "IM Assistant", "settings.description": "Manage accounts across channels. Each account has its own workspace, model, and permission settings, stored only on this machine.", "settings.viewProject": "GitHub", "settings.feedback": "Issues",
        "settings.aria": "IM Assistant", "settings.publicChatNotice": "Unapproved users can start chats, but they cannot approve tool calls.", "pending.notice": "There are access requests. Approve a user before they can control the local assistant.", "action.approve": "Approve", "action.deny": "Deny", "loading": "Loading…",
        "account.presetUnavailable": "Preset unavailable", "account.presetNote": "Changes start a new session; previous sessions are kept.", "action.settings": "Settings", "command.dm": "DM commands", "command.group": "Group commands", "command.enabled": "Commands enabled", "command.disabled": "Conversation only",
        "account.workspace": "Workspace", "account.currentWorkspace": "Current workspace", "account.selectWorkspace": "Select a workspace", "account.selectModel": "Select a model", "account.selectPermission": "Select a permission", "account.privateAccess": "Private chat access", "account.privateApproved": "Approved users only", "account.privateAll": "Allow all DM users", "account.autoNameNote": "The account name is generated automatically after setup. Add a remark on the account row if you need to tell users apart.", "account.defaultName": "{channel} account {count}",
        "account.remark": "Name remark", "account.remarkNote": "Shown only in settings to tell accounts apart. Leave blank to restore the automatic name.", "account.rename": "Edit name remark",
        "account.count": "{count} accounts", "account.statusProcessing": "Processing…", "account.statusNotConnected": "Not connected", "account.receive": "Receive messages", "account.receiveDescription": "Turn this off to keep the account settings without receiving new messages", "account.removeConfirm": "Remove this account? Its saved settings and credentials will also be deleted.",
        "action.addAccount": "Add account", "action.generateQr": "Generate QR code", "action.checkConnection": "Diagnose connection", "action.reconnectAccount": "Reconnect", "action.removeAccount": "Remove", "status.saving": "Saving…", "status.saved": "Saved",
        "channel.dingtalk": "DingTalk", "channel.feishu": "Feishu", "channel.lark": "Lark", "channel.weixin": "WeChat", "channel.wecom": "WeCom", "channel.qq": "QQ", "channel.telegram": "Telegram", "channel.discord": "Discord", "channel.slack": "Slack",
        "field.dingtalk.clientId": "Client ID (formerly AppKey)", "field.dingtalk.clientSecret": "Client Secret (formerly AppSecret)",
        "field.wecom.botId": "Bot ID", "field.wecom.secret": "Secret", "field.qq.appId": "AppID", "field.qq.appSecret": "AppSecret", "field.telegram.token": "Bot Token", "field.discord.token": "Bot Token", "field.slack.token": "Bot Token (starts with xoxb-)", "field.slack.appToken": "App Token (starts with xapp-)",
        "bind.title": "Set up {channel}", "bind.quick": "Quick setup (recommended)", "bind.manual": "Manual setup", "bind.saving": "Saving account…", "bind.success": "Connected successfully", "bind.newIdentity": "A new account identity was detected and a new account was created", "bind.qrAlt": "{channel} setup QR code", "bind.generating": "Generating…", "bind.expire": "QR code expires in {time}", "bind.scanned": "Scanned. Confirm on your phone.", "bind.retry": "Generate a new QR code", "bind.refresh": "Generate a new QR code", "action.saving": "Saving…", "action.confirm": "Confirm",
        "qr.weixin": "Scan the QR code with WeChat to connect", "qr.feishu": "Scan with Feishu; a bot will be created automatically", "qr.lark": "Scan with Lark to pair", "qr.wecom": "Scan with WeCom to quickly connect a bot", "qr.dingtalk": "Scan with DingTalk; a bot will be created automatically", "qr.qq": "Scan with mobile QQ to create an Open Platform bot", "qr.default": "Scan the QR code with the corresponding app",
        "status.connected": "Connected", "action.more": "More options for {channel}",
        "error.loadAssistant": "Could not load account settings", "error.noModels": "No models are available in the Host. Configure a provider in the web app first.", "error.save": "Could not save", "error.chooseWorkspace": "Choose a workspace directory", "error.workspaceUnavailable": "This Host cannot create workspaces", "error.addWorkspace": "Could not add workspace", "error.load": "Could not load", "error.connection": "Could not connect to the local IM Assistant API", "error.request": "Request failed", "error.action": "Action failed", "error.qr": "Could not generate a QR code", "error.detailsInLog": "The operation failed. Check the server logs for details.",
        "composer.noWorkspaces": "No workspaces", "composer.addWorkspace": "Add workspace…", "composer.permission": "Permission", "composer.noModels": "No models", "composer.workspacePath": "Workspace path", "action.cancel": "Cancel", "action.adding": "Adding…",
        "permission.readOnly": "Read Only", "permission.workspaceWrite": "Workspace Write", "permission.fullAccess": "Full access",
        "rail.workspace": "Workspaces", "rail.sessions": "Sessions", "rail.search": "Search", "rail.searchPlaceholder": "Search sessions...", "rail.clearSearch": "Clear search", "rail.filter": "Filter", "rail.group": "Group by", "rail.byWorkspace": "By workspace", "rail.list": "Single list", "rail.byWorkspaceTree": "Workspace Tree", "rail.sort": "Sort by", "rail.recent": "Recently updated", "rail.showArchived": "Show archived", "rail.onlyArchived": "Archived only", "rail.running": "Running", "rail.idle": "Idle", "rail.waitingApproval": "Waiting for approval", "rail.planReview": "Plan to review", "rail.waitingAnswer": "Waiting for an answer", "rail.subagents": "{n} subagents running", "rail.completed": "Completed", "rail.archived": "Archived", "rail.compactApproval": "Approval", "rail.compactPlan": "Plan review", "rail.compactAnswer": "Answer", "rail.renameAria": "Rename session", "rail.rename": "Rename", "rail.fork": "Fork session", "rail.archive": "Archive session", "rail.unarchive": "Restore session", "rail.stopArchive": "Stop and archive", "rail.stopArchiveDescription": "Session “{name}” is still running. Stop it before archiving.", "rail.stopArchiveConfirm": "Stop and archive", "rail.stopArchivePending": "Stopping and archiving…", "rail.stopArchiveGroupDescription": "Some conversations in “{name}” are still running. Stop them before archiving the group.", "rail.archiveFailed": "Archive failed. The session was kept. Retry or check the Host logs.", "rail.deleteSession": "Delete session", "rail.deleteSessionConfirm": "Delete session", "rail.deleteSessionDescription": "This permanently deletes session “{name}”, its child agents (including any that are still running), and all of its records (conversation, stats, cache). This cannot be undone.", "rail.deleteSessionPending": "Deleting session…", "rail.deleteSessionFailed": "Could not delete the session: {message}", "rail.deleteSessionClose": "Close", "rail.deleteSessionCancel": "Cancel", "rail.groupActions": "Actions for {name}", "rail.channelSettings": "Channel settings", "rail.archiveGroup": "Archive all conversations", "rail.archiveGroupConfirm": "Archive all", "rail.archiveGroupDescription": "Archive all {count} conversations for “{name}”. You can restore them later in Settings → Archived.", "rail.archiveGroupPending": "Archiving conversations…", "rail.archiveGroupFailed": "Some conversations could not be archived: {message}", "rail.archiveGroupClose": "Close", "rail.archiveGroupCancel": "Cancel", "rail.empty": "No channel sessions yet. Connect a channel in Settings → IM Assistant, then send the bot a message.", "rail.noTasks": "No web tasks", "rail.ungrouped": "Ungrouped", "rail.tabsAria": "Workspace categories", "rail.tasks": "Tasks", "rail.channels": "Channels",
        "time.now": "now", "time.minutes": "{n}min", "time.hours": "{n}h", "time.days": "{n}d", "time.months": "{n}mo", "time.years": "{n}y", "time.ago": "{t} ago",
        "copy": "Copy", "hover.copied": "Copied",
        "server.unknownChannel": "Unknown channel", "server.channelUnconfigured": "Channel is not configured", "server.sessionMissing": "Session does not exist", "server.accountMissing": "Account does not exist", "server.accountConnectFailed": "Could not connect the account. Check the local logs.", "server.accountReconnectFailed": "Could not reconnect the account. Check the local logs.", "server.selectAccountSettings": "Select a provider, model, workspace, or permission setting", "server.selectModel": "Select a provider and model", "server.selectWorkspace": "Select a workspace", "server.selectPermission": "Select a permission", "server.missingCredentials": "The channel cannot start because credentials are missing", "server.qrUnsupported": "This channel does not support QR setup", "server.qrExpired": "QR code has expired", "server.qrIncomplete": "QR setup was not completed", "server.accessDenied": "Access denied: ask an administrator to approve you in Settings → IM Assistant.", "server.remarkTooLong": "Account remark cannot exceed 40 characters", "server.remarkControl": "Account remark cannot contain line breaks or control characters",
        "status.disconnected": "Disconnected", "status.reconnectFailed": "Reconnect failed", "status.connectingSocket": "Connecting", "status.waitHandshake": "Waiting for gateway handshake", "status.authenticating": "Authenticating", "status.reconnecting": "Reconnecting", "status.connectionError": "Connection error", "status.connectionFailed": "Connection failed", "status.streamConnected": "Stream connected", "status.stopped": "Stopped", "status.longConnection": "Long connection established", "status.polling": "Polling", "status.notLoggedIn": "Not signed in", "status.waitQr": "Waiting for scan", "status.loggedIn": "Signed in", "status.loggedInRecovered": "Signed in (restored)", "status.loggingIn": "Signing in",
      },
    };
    const fallbackT = (key) => key;
    const h = React.createElement;
    function currentUiLang() {
      try {
        if (typeof document !== "undefined" && document.documentElement && document.documentElement.lang) {
          if (/^en/i.test(document.documentElement.lang)) return "en";
          if (/^zh/i.test(document.documentElement.lang)) return "zh";
        }
      } catch { /* ignore */ }
      return "zh";
    }
    function hostIsDark() {
      if (typeof document === "undefined") return false;
      return document.documentElement.hasAttribute("data-ds-dark-theme")
        || (document.body && document.body.hasAttribute("data-ds-dark-theme") === true);
    }
    function useHostDark() {
      const [dark, setDark] = useState(hostIsDark);
      useEffect(() => {
        const update = () => setDark(hostIsDark());
        update();
        const observer = new MutationObserver(update);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
        if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
        return () => observer.disconnect();
      }, []);
      return dark;
    }
    function AntdProvider({ children, locale }) {
      const dark = useHostDark();
      const lang = locale || currentUiLang();
      return h(ConfigProvider, {
        locale: lang === "en" ? antdEn : antdZh,
        theme: {
          algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: { fontFamily: "inherit" },
          components: { Button: { borderRadius: 8 } },
        },
        button: { autoInsertSpace: false },
      }, children);
    }

    const CSS = `
.ima-page,.ima-account-modal,.ima-bind-modal,.ima-inspector{--ima-text:var(--dsw-alias-label-primary,var(--dsh-text,#e6edf3));--ima-muted:var(--dsw-alias-label-tertiary,var(--dsh-text-muted,#8b949e));--ima-line:var(--dsw-alias-border-l2,var(--dsh-border,rgba(255,255,255,.1)));--ima-card:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04));--ima-card-hover:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));--ima-ok:var(--dsw-alias-state-success-primary,#3fb950);--ima-warning:var(--dsw-alias-state-warning-primary,#d29922);--ima-danger:var(--dsw-alias-state-error-primary,#f85149);--ima-accent:var(--dsw-alias-brand-primary,#4b7cff)}
.ima-page{box-sizing:border-box;max-width:none;width:100%;margin:0;padding:0 0 32px;color:var(--ima-text)}
.ima-head{display:flex;flex-direction:column;align-items:stretch;gap:12px;margin-bottom:12px}
.ima-heading h2,.ima-title{margin:0;font-size:24px;line-height:32px;font-weight:600;letter-spacing:-.4px;white-space:nowrap;text-align:left}
.ima-title-row{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.ima-title-links{display:inline-flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.ima-title-links .ant-btn{flex:none}
.ima-sub{margin:12px 0 0;max-width:none;color:var(--ima-muted);font-size:14px;line-height:22px;text-align:left}
.ima-error{color:var(--ima-danger);font-size:12px;margin:0 0 12px}
.ima-pending,.ima-page>.ant-alert,.ima-inspector .ant-alert{margin:0 0 12px}
.ima-pending-row{display:flex;gap:8px;align-items:center;margin-top:8px}
.ima-wrap{display:flex;flex-direction:column;min-height:0;flex:1;height:100%;overflow:hidden}.ima-official-tree{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}.ima-native.ima-rail,.ima-rail.dcu-wb{box-sizing:border-box;overflow:hidden}
.ima-tabs{display:flex;gap:18px;padding:4px 12px 0;border-bottom:1px solid var(--ima-line)}
.ima-tab{appearance:none;border:0;background:transparent;color:var(--ima-muted);padding:8px 0;font-size:13px;cursor:pointer}
.ima-tab.on{color:var(--ima-text);box-shadow:inset 0 -2px 0 currentColor}
.ima-tabs{flex:none}
.ima-rail{flex:1 1 auto;min-height:180px;overflow:auto}
.ima-rename{flex:1;min-width:0;min-height:28px;padding:2px 8px;border-radius:6px;border:1px solid var(--ima-line);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-button-elevated-fill,transparent));color:var(--ima-text);font-size:13px}
.ima-empty{color:var(--ima-muted);font-size:12px;padding:12px 8px}
.ima-logo{width:28px;height:28px;flex:none;display:block;line-height:0;background:transparent}
.ima-logo svg{width:28px;height:28px;display:block}
.ima-logo img.ima-brand-file{width:100%;height:100%;display:block;object-fit:contain;pointer-events:none}
.ima-logo.sm{width:16px;height:16px;overflow:hidden;display:grid;place-items:center}
.ima-logo.sm svg{width:16px;height:16px;transform:none}
.ima-logo[data-brand="wecom"]{border-radius:6px;box-shadow:inset 0 0 0 1px rgba(15,23,42,.12);overflow:hidden;background:#fff}
.ima-logo.sm[data-brand="wecom"]{border-radius:4px;box-shadow:none;background:transparent}
.ima-qrbox{display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px 0 4px}
.ima-qrbox img{width:200px;height:200px;background:#fff;border:1px solid var(--ima-line);border-radius:12px;object-fit:contain}
.ima-bind-ready{display:flex;flex-direction:column;align-items:center;gap:14px;padding:12px 0 4px}.ima-bind-ready .ant-btn{min-width:136px}.ima-bind-status{min-height:40px;display:grid;place-items:center;color:var(--ima-muted);font-size:13px;text-align:center}
.ima-hint{margin:0;color:var(--ima-muted);font-size:13px;text-align:center;line-height:1.6}
.ima-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-size:13px}
.ima-field .ant-input,.ima-field input{width:100%}
.ima-page.ima-account-page{container-type:inline-size;min-width:0;max-width:1080px;width:100%;margin:0 auto;padding:0 0 32px}
.ima-account-shell,.ima-account-shell *{box-sizing:border-box}
.ima-account-shell{display:block;min-height:0;border:0;border-radius:0;overflow:visible;background:transparent}
.ima-platforms{display:flex;flex-direction:column;gap:12px;padding:0;border:0;background:transparent;min-width:0}
.ima-platform{border:1px solid color-mix(in srgb,var(--ima-text) 16%,transparent);border-radius:12px;margin:0;overflow:hidden;background:var(--dsw-alias-bg-layer-1,color-mix(in srgb,var(--ima-text) 4%,transparent))}.ima-platform.open{border-color:color-mix(in srgb,var(--ima-text) 24%,transparent)}
.ima-platform-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;min-height:56px;padding:10px 16px;border:0;border-radius:0;background:transparent;color:inherit;text-align:left;cursor:pointer}
.ima-platform:not(.open):not(.empty) .ima-platform-head:hover{background:var(--ima-card-hover)}.ima-platform.empty .ima-platform-head{cursor:default}
.ima-platform-head>.ima-logo,.ima-platform-head>.ima-logo svg{width:24px;height:24px}
.ima-platform-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600}
.ima-platform-meta{display:inline-flex;align-items:center;gap:10px}
.ima-platform-count{color:var(--ima-muted);font-size:12px;white-space:nowrap}
.ima-platform-caret{display:grid;width:18px;height:18px;place-items:center;color:var(--ima-muted);transition:transform .15s ease}.ima-platform-caret.empty{visibility:hidden}.ima-platform.open .ima-platform-caret{transform:rotate(90deg)}
.ima-account-list{display:flex;flex-direction:column;gap:8px;padding:0 14px 14px}
.ima-account-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;align-items:center;gap:12px;width:100%;min-height:48px;padding:10px 12px;border:0;border-radius:8px;background:color-mix(in srgb,var(--ima-text) 7%,transparent);color:inherit;text-align:left}
.ima-account-row:hover{background:var(--ima-card-hover)}
.ima-platform-head:focus-visible,.ima-account-row:focus-visible{outline:2px solid var(--ima-accent);outline-offset:2px}
.ima-account-copy{min-width:0}.ima-account-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500}.ima-account-rename-button{width:100%;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:text}.ima-account-rename-button:hover,.ima-account-rename-button:focus-visible{color:var(--ima-accent)}.ima-account-rename,.ima-account-remark-input{box-sizing:border-box;width:100%;height:32px;padding:4px 8px;border:1px solid var(--ima-line);border-radius:6px;background:transparent;color:inherit;font:inherit}.ima-account-id{display:block;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ima-muted);font-size:11px}.ima-account-row .ant-tag{margin-inline-end:0}
.ima-account-receive{display:inline-flex;align-items:center;justify-content:flex-end;gap:8px;white-space:nowrap;font-size:12px;color:var(--ima-muted)}
.ima-inspector{padding:22px 24px 26px;min-width:0}.ima-inspector-head{display:flex;align-items:flex-start;gap:12px;padding-bottom:18px;border-bottom:1px solid var(--ima-line)}.ima-inspector-head-copy{min-width:0;flex:1}.ima-inspector-title{margin:1px 0 3px;font-size:17px;line-height:24px}.ima-inspector-title-row{display:flex;align-items:center;gap:12px;min-width:0}.ima-inspector-title-row .ima-inspector-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0}.ima-inspector-title-row .ima-inspector-status{flex:none;white-space:nowrap;font-size:11px}.ima-inspector-head-copy>.ima-account-id{margin-top:5px}
.ima-inspector-status{flex:none}
.ima-form{display:flex;flex-direction:column;gap:16px;padding-top:20px}
.ima-command-permissions{min-width:0;margin:0;padding:0;border:0}
.ima-diagnostic-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ima-inspector-title-row .ant-tag{margin-inline-end:0}.ima-bind-modal .ant-segmented{width:100%;margin:0 0 16px}.ima-bind-modal .ant-alert{margin-bottom:12px}.ima-connection-check{display:grid;gap:6px;padding:12px;border:1px solid var(--ima-line);border-radius:8px;font-size:12px;line-height:1.6;overflow-wrap:anywhere;color:var(--ima-muted)}.ima-connection-check strong{color:var(--ima-text)}.ima-diagnostic-item{padding:8px 0;border-top:1px solid var(--ima-line)}
.ima-inspector-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px;padding-top:18px;border-top:1px solid var(--ima-line)}.ima-inspector-actions .ant-btn{flex:none;white-space:nowrap}.ima-inspector-actions .ant-btn-dangerous{margin-left:auto}
.ima-account-settings{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}.ima-account-settings.compact{grid-template-columns:1fr}.ima-account-settings .ant-select{width:100%;min-width:0}.ima-account-settings .ant-select-selector{min-height:36px}
.ima-picker-field{display:flex;min-width:0;flex-direction:column;gap:6px}.ima-picker-field.wide,.ima-picker-note,.ima-model-effort{grid-column:1/-1}.ima-model-effort{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;min-width:0}.ima-account-settings.compact .ima-model-effort{grid-template-columns:1fr}.ima-picker-label{color:var(--ima-muted);font-size:12px;font-weight:550}.ima-picker-note{color:var(--ima-muted);font-size:11px;line-height:1.5}.ima-picker-note.warning{color:var(--ima-warning)}
.ima-save-note{color:var(--ima-muted);font-size:11px}.ima-save-note.ok{color:var(--ima-ok)}
.ima-account-modal .ima-inspector,.ima-bind-modal .ima-setup-section{padding:0}.ima-setup-section{margin:0 0 14px;padding-bottom:14px;border-bottom:1px solid var(--ima-line)}
.ima-account-picker{width:100%}
@container (max-width:480px){.ima-account-row{grid-template-columns:minmax(0,1fr) auto auto;gap:8px;padding:10px}.ima-account-receive>span{display:none}.ima-platform-head{padding:10px 12px}.ima-account-list{padding:0 12px 12px}}

`;

    const TITLE_LINK_CSS = "@media(max-width:720px){.ima-title-row{flex-wrap:wrap}}";

    let styleEl = null;
    const ensureStyle = () => {
      if (styleEl && styleEl.isConnected) {
        styleEl.setAttribute("data-plugin", "@michengai/dsh-im-connect");
        return;
      }
      styleEl = document.createElement("style");
      styleEl.setAttribute("data-plugin", "@michengai/dsh-im-connect");
      styleEl.textContent = CSS + TITLE_LINK_CSS;
      document.head.appendChild(styleEl);
    };

    let channelSessionIds = new Set();
    let channelMembershipRevision = 0;
    const channelMembershipListeners = new Set();
    function updateChannelMembership(groups) {
      const next = new Set(groups.flatMap(group => (group.sessions || []).map(session => session.sessionId)));
      if (next.size === channelSessionIds.size && [...next].every(id => channelSessionIds.has(id))) return;
      channelSessionIds = next;
      channelMembershipRevision += 1;
      for (const listener of channelMembershipListeners) listener();
    }
    const isChannelSession = (id) => String(id).startsWith("im:") || channelSessionIds.has(String(id));
    const subscribeChannelMembership = (listener) => {
      channelMembershipListeners.add(listener);
      return () => channelMembershipListeners.delete(listener);
    };
    const channelMembershipSnapshot = () => channelMembershipRevision;

    /** 频道不能新建普通会话。当前会话决定侧栏该停在哪一页；定时页签自己认领的不抢。 */
    function sidebarTabForSession(currentId, extraTabs) {
      if (typeof currentId !== "string" || currentId === "") return null;
      const matched = (extraTabs || []).find((item) => item && item.matchSession && item.matchSession(currentId));
      if (matched && matched.id !== "schedule") return matched.id;
      if (isChannelSession(currentId)) return "channels";
      if (matched) return null;
      return "tasks";
    }

    function followSidebarTab(state, currentId, extraTabs) {
      const ready = !!(state && state.ready);
      const next = sidebarTabForSession(currentId, extraTabs);
      if (!ready) return { ready: true, previousId: currentId, tab: next };
      if (typeof currentId !== "string" || currentId === "") return { ready: true, previousId: currentId, tab: null };
      if (currentId === state.previousId && !isChannelSession(currentId)) return { ready: true, previousId: currentId, tab: null };
      return { ready: true, previousId: currentId, tab: next };
    }

    function isHostNewSessionControl(label) {
      return /新会话|新建任务|New chat|New session/i.test(String(label || ""));
    }

    const api = (path, opts) => {
      // 管理路由复用宿主登录 Cookie，不缓存账号状态或认证错误。
      const request = Object.assign({}, opts || {}, { credentials: "same-origin", cache: "no-store" });
      const method = String(request.method || "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        request.headers = Object.assign({ "content-type": "application/json" }, request.headers || {}, { "x-dsh-im-connect-client": "1" });
        if (request.body === undefined) request.body = "{}";
      }
      return fetch(API_BASE + path, request).then((r) => r.json()).then((data) => {
        if (!request.signal?.aborted && data.ok && Array.isArray(data.groups)) updateChannelMembership(data.groups);
        return data;
      });
    };

    // One request and timer for all channel consumers. Schedule only after settlement.
    function createChannelRefreshStore(load) {
      const listeners = new Set();
      let flight = null, timer = null, latest = null, failures = 0, epoch = 0;
      const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
      const clearTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
      const notify = (data, error) => { for (const listener of listeners) listener(data, error); };
      const schedule = () => {
        clearTimer();
        if (listeners.size && visible()) timer = setTimeout(() => {
          timer = null;
          refresh().catch(() => undefined);
        }, Math.min(4000 * 2 ** failures, 60000));
      };
      function refresh() {
        if (flight) return flight.promise;
        clearTimer();
        const current = { controller: new AbortController(), promise: null };
        flight = current;
        current.promise = Promise.resolve().then(() => {
          current.controller.signal.throwIfAborted();
          return load(current.controller.signal);
        }).then(data => {
          if (flight !== current || current.controller.signal.aborted) return data;
          failures = data.ok ? 0 : failures + 1;
          latest = { data, error: null };
          notify(data, null);
          return data;
        }).catch(error => {
          if (flight === current && !current.controller.signal.aborted) {
            failures++;
            latest = { data: null, error };
            notify(null, error);
          }
          throw error;
        }).finally(() => {
          if (flight !== current) return;
          flight = null;
          schedule();
        });
        return current.promise;
      }
      // A mutation must fetch again after any pre-mutation request has settled.
      function invalidate() {
        const generation = epoch;
        return (flight ? flight.promise.catch(() => undefined) : Promise.resolve()).then(() => {
          if (generation === epoch) return refresh();
        });
      }
      const onVisibility = () => {
        clearTimer();
        if (visible() && listeners.size) refresh().catch(() => undefined);
      };
      function subscribe(listener) {
        listeners.add(listener);
        if (latest) listener(latest.data, latest.error);
        if (listeners.size === 1) {
          if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
          if (visible()) refresh().catch(() => undefined);
        }
        return () => {
          listeners.delete(listener);
          if (listeners.size) return;
          epoch++;
          clearTimer();
          if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
          if (flight) flight.controller.abort();
          flight = null;
          latest = null;
          failures = 0;
        };
      }
      return { subscribe, refresh, invalidate };
    }
    const channelRefresh = createChannelRefreshStore(signal => api("/channels", { signal }));

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

      if (id === "discord" || id === "slack") {
        return h("img", {
          className: "ima-brand-file",
          alt: "",
          draggable: false,
          src: id === "discord"
            ? "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjUiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA2NSA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQxLjIzNTEgMEM0MC42MTY0IDEuMDk4NjYgNDAuMDYwNyAyLjIzNTIgMzkuNTU1NiAzLjM5N0MzNC43NTY5IDIuNjc3MTkgMjkuODY5NyAyLjY3NzE5IDI1LjA1ODQgMy4zOTdDMjQuNTY1OCAyLjIzNTIgMjMuOTk3NiAxLjA5ODY2IDIzLjM3ODggMEMxOC44NzA1IDAuNzcwMzI0IDE0LjQ3NTkgMi4xMjE1NSAxMC4zMDg1IDQuMDI4NDFDMi4wNDk2NyAxNi4yNjUyIC0wLjE4NTUzMSAyOC4xODYzIDAuOTI1NzU1IDM5Ljk0MzJDNS43NjIzOCA0My41MTcgMTEuMTc5OSA0Ni4yNDQ3IDE2Ljk1MSA0Ny45ODc0QzE4LjI1MTcgNDYuMjQ0NyAxOS40MDA5IDQ0LjM4ODMgMjAuMzg1OSA0Mi40NTYyQzE4LjUxNjkgNDEuNzYxNiAxNi43MTExIDQwLjg5MDMgMTQuOTgxIDM5Ljg4QzE1LjQzNTYgMzkuNTUxNyAxNS44Nzc2IDM5LjIxMDcgMTYuMzA3IDM4Ljg4MjRDMjYuNDQ3NSA0My42NTU5IDM4LjE5MTcgNDMuNjU1OSA0OC4zNDQ5IDM4Ljg4MjRDNDguNzc0MiAzOS4yMzYgNDkuMjE2MiAzOS41NzcgNDkuNjcwOCAzOS44OEM0Ny45NDA4IDQwLjkwMjkgNDYuMTM0OSA0MS43NjE2IDQ0LjI1MzMgNDIuNDY4OEM0NS4yMzgzIDQ0LjQwMDkgNDYuMzg3NSA0Ni4yNTczIDQ3LjY4ODIgNDhDNTMuNDU5MyA0Ni4yNTczIDU4Ljg3NjggNDMuNTQyMiA2My43MTM0IDM5Ljk2ODRDNjUuMDI2OCAyNi4zMjk5IDYxLjQ2NTYgMTQuNTA5OSA1NC4zMDU0IDQuMDQxMDRDNTAuMTUwNyAyLjEzNDE4IDQ1Ljc1NjEgMC43ODI5NTIgNDEuMjQ3OCAwLjAyNTI1NjVMNDEuMjM1MSAwWk0yMS44MDAzIDMyLjcwNzJDMTguNjgxMSAzMi43MDcyIDE2LjA5MjMgMjkuODc4NSAxNi4wOTIzIDI2LjM4MDRDMTYuMDkyMyAyMi44ODI0IDE4LjU4MDEgMjAuMDQxIDIxLjc4NzYgMjAuMDQxQzI0Ljk5NTIgMjAuMDQxIDI3LjU0NjEgMjIuODk1IDI3LjQ5NTYgMjYuMzgwNEMyNy40NDUxIDI5Ljg2NTggMjQuOTgyNiAzMi43MDcyIDIxLjgwMDMgMzIuNzA3MlpNNDIuODM4OSAzMi43MDcyQzM5LjcwNzEgMzIuNzA3MiAzNy4xNDM2IDI5Ljg3ODUgMzcuMTQzNiAyNi4zODA0QzM3LjE0MzYgMjIuODgyNCAzOS42MzE0IDIwLjA0MSA0Mi44Mzg5IDIwLjA0MUM0Ni4wNDY1IDIwLjA0MSA0OC41ODQ4IDIyLjg5NSA0OC41MzQzIDI2LjM4MDRDNDguNDgzOCAyOS44NjU4IDQ2LjAyMTMgMzIuNzA3MiA0Mi44Mzg5IDMyLjcwNzJaIiBmaWxsPSIjNTg2NUYyIi8+Cjwvc3ZnPgo="
            : "data:image/png;base64,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",
        });
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
      ["账号备注不能超过 40 个字符", "server.remarkTooLong"], ["账号备注不能包含换行或控制字符", "server.remarkControl"],
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

    // 有 reflect 时只 probe，不能硬读未注入的官方导航服务，否则 Cordis 会挡住插件激活。
    function probeService(ctx, name) {
      if (!ctx) return undefined;
      const reflect = ctx.reflect;
      if (reflect && typeof reflect.get === "function") {
        try {
          const found = reflect.get(name);
          if (found !== undefined) return found;
        } catch { /* 未注入时不硬读 ctx[name]，改走 get */ }
      }
      if (typeof ctx.get === "function") {
        try {
          const found = ctx.get(name);
          if (found !== undefined) return found;
        } catch { return undefined; }
      }
      if (reflect && typeof reflect.get === "function") return undefined;
      try { return ctx[name]; } catch { return undefined; }
    }
    // 旧宿主读 list.current；alpha.2 主视图改由 retainedBy.mainView 标记。
    function currentSessionId(state) {
      if (!state) return null;
      if (typeof state.current === "string" && state.current) return state.current;
      const byId = state.byId || {};
      const ids = Array.isArray(state.ids) && state.ids.length ? state.ids : Object.keys(byId);
      const pick = (id, row) => {
        if (!row || !row.retainedBy || (row.retainedBy.mainView ?? 0) <= 0) return null;
        const explicit = row.id && String(row.id).trim();
        return explicit || id;
      };
      for (let i = 0; i < ids.length; i++) {
        const found = pick(ids[i], byId[ids[i]]);
        if (found) return found;
      }
      for (const id in byId) {
        if (ids.indexOf(id) !== -1) continue;
        const found = pick(id, byId[id]);
        if (found) return found;
      }
      return null;
    }
    function resolveHostSessionId(sessionId, sessionById) {
      if (!sessionId) return sessionId;
      const listed = sessionById && sessionById[sessionId];
      const fromKey = listed && (listed.id || listed.sessionId);
      if (fromKey && String(fromKey).trim()) return String(fromKey).trim();
      return sessionId;
    }
    function isCurrentListedSession(selectedId, sessionId, sessionById) {
      if (!selectedId || !sessionId) return false;
      if (selectedId === sessionId) return true;
      const listed = sessionById && sessionById[sessionId];
      if (listed && (listed.id === selectedId || listed.sessionId === selectedId)) return true;
      const selected = sessionById && sessionById[selectedId];
      if (selected && (selected.id === sessionId || selected.sessionId === sessionId)) return true;
      return false;
    }
    function mainSessionModel(state) {
      const id = currentSessionId(state);
      const row = id && state && state.projectionsBySession && state.projectionsBySession[id];
      const selection = row && row.values && row.values.modelSelection;
      const next = selection && (selection.next || selection.lastUsed);
      if (!next || !next.provider || !next.model) return null;
      return { provider: next.provider, model: next.model, reasoningEffort: next.reasoningEffort || "" };
    }
    function readMainSessionModel(ctx) {
      const sessions = probeService(ctx, "sessions");
      const list = sessions && sessions.list;
      if (!list || typeof list.getSnapshot !== "function") return null;
      try { return mainSessionModel(list.getSnapshot()); } catch { return null; }
    }
    function openHostSession(ctx, id) {
      if (!id) return false;
      const uiWorkspace = probeService(ctx, "uiWorkspace");
      if (uiWorkspace && typeof uiWorkspace.openSession === "function") {
        uiWorkspace.openSession(id);
        return true;
      }
      // alpha.2 有 retain：旧的 sessions.open 即使还在也不会写入 mainView，点了等于没打开。
      if (ctx.sessions && typeof ctx.sessions.retain === "function") return false;
      if (ctx.sessions && typeof ctx.sessions.open === "function") {
        ctx.sessions.open(id);
        return true;
      }
      return false;
    }
    function pickHostDirectory(ctx) {
      const uiWorkspace = probeService(ctx, "uiWorkspace");
      if (uiWorkspace && typeof uiWorkspace.pickDirectory === "function") return uiWorkspace.pickDirectory();
      if (ctx.workspaces && typeof ctx.workspaces.pickDirectory === "function") return ctx.workspaces.pickDirectory();
    }
    function activeSessionRefusal(error) {
      const reason = error && (error.reason || error);
      if (reason && reason.name === "WorkspaceArchiveError") return true;
      const rpc = error && (error.rpcError || error);
      if (rpc && (rpc.code === "workspace/session-active" || (rpc.details && rpc.details.activity))) return true;
      return /workspace\/session-active|WorkspaceArchiveError|still running|still active/i.test(String((error && error.message) || ""));
    }
    function hostWorkspaceApi(ctx) {
      return probeService(ctx, "uiWorkspace") || ctx.workspaces || {};
    }
    function archiveHostSession(ctx, id, options) {
      const api = hostWorkspaceApi(ctx);
      if (typeof api.archiveSession !== "function") return;
      return options ? api.archiveSession(id, options) : api.archiveSession(id);
    }
    function unarchiveHostSession(ctx, id) {
      const api = hostWorkspaceApi(ctx);
      if (typeof api.unarchiveSession === "function") return api.unarchiveSession(id);
      if (typeof api.restoreSession === "function") return api.restoreSession(id);
    }
    function forkHostSession(ctx, id) {
      const uiWorkspace = probeService(ctx, "uiWorkspace");
      if (uiWorkspace && typeof uiWorkspace.forkSession === "function") return Promise.resolve(uiWorkspace.forkSession(id));
      if (!ctx.sessions || typeof ctx.sessions.fork !== "function") return Promise.resolve();
      return ctx.sessions.fork({ sessionId: id, increaseTitle: true })
        .then((childId) => { openHostSession(ctx, childId); })
        .catch(() => undefined);
    }
    async function renameHostSession(ctx, sessionId, title) {
      const sessions = ctx.sessions;
      if (!sessions) throw new Error("unknown session");
      const renameBound = async (session) => {
        if (!session || typeof session.rename !== "function") throw new Error("unknown session");
        const result = await session.rename(title);
        if (result && result.ok === false) throw new Error((result.error && result.error.message) || "rename failed");
      };
      if (typeof sessions.using === "function") {
        return sessions.using(sessionId, { source: "controllerOperation" }, async (reference) => {
          if (reference && reference.ready) await reference.ready;
          return renameBound(reference && reference.binding && reference.binding.session);
        });
      }
      const existing = sessions.binding && sessions.binding(sessionId);
      if (existing && existing.session) return renameBound(existing.session);
      if (typeof sessions.retain !== "function") throw new Error("unknown session");
      const ref = sessions.retain(sessionId, { source: "controllerOperation" });
      try {
        if (ref && ref.ready) await ref.ready;
        return renameBound(ref && ref.binding && ref.binding.session);
      } finally {
        if (ref && typeof ref.release === "function") ref.release();
      }
    }

    let openImSession = (id) => {
      try {
        if (window.__dshSessionsOpen) { window.__dshSessionsOpen(id); return true; }
      } catch { /* ignore */ }
      return false;
    };
    const tryOpenListedSession = (id, hostOpen) => {
      if (openImSession(id)) return true;
      if (typeof hostOpen !== "function") return false;
      try { hostOpen(id); return true; } catch { return false; }
    };
    const openListedSession = (id, hostOpen) => {
      if (!id) return;
      if (isChannelSession(id)) {
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
      tryOpenListedSession(id, hostOpen);
    };
    let channelSkin = "native";

    function preferredAssistant(defaults, readModel) {
      const main = typeof readModel === "function" ? readModel() : null;
      if (main && main.provider && main.model) return main;
      const assistant = defaults && defaults.assistant;
      return assistant && assistant.provider && assistant.model ? assistant : null;
    }
    function selectableWorkspace(preferred, workspaces) {
      const items = Array.isArray(workspaces) ? workspaces : [];
      const key = (path) => String(path || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
      const wanted = key(preferred);
      const matched = wanted && items.find((item) => item && key(item.path) === wanted);
      if (matched && matched.path) return matched.path;
      const first = items.find((item) => item && item.path);
      return first ? first.path : "";
    }
    function BindModal({ ch, onClose, onConnected, catalog, permissions, agentPresets, workspaces, defaults, readMainSessionModel, createWorkspace, pickDirectory, modelT, permissionT, presetT, t = fallbackT }) {
      const hasQr = ch.kind === "qr" || ch.kind === "qr-or-credentials";
      const hasManual = ch.kind === "credentials" || ch.kind === "qr-or-credentials";
      const [tab, setTab] = useState(hasQr ? "qr" : "manual");
      const [pairing, setPairing] = useState(null);
      const [qrStarted, setQrStarted] = useState(false);
      const [draft, setDraft] = useState({});
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState("");
      const [success, setSuccess] = useState("");
      const modelTouched = useRef(false);
      const workspaceTouched = useRef(false);
      const [settings, setSettings] = useState(() => {
        const assistant = preferredAssistant(defaults, readMainSessionModel);
        return {
          cwd: selectableWorkspace(defaults && defaults.cwd, workspaces),
          provider: assistant && assistant.provider || "",
          model: assistant && assistant.model || "",
          reasoningEffort: assistant && assistant.reasoningEffort || "",
          permission: defaults && defaults.permission || "",
          privateAccess: "approved",
          agentPreset: defaults && defaults.agentPreset || "standard",
        };
      });
      const alive = useRef(true);
      useEffect(() => {
        if (modelTouched.current) return;
        const assistant = preferredAssistant(defaults, readMainSessionModel);
        if (!assistant) return;
        setSettings((current) => current.provider === assistant.provider && current.model === assistant.model
          ? current
          : { ...current, provider: assistant.provider, model: assistant.model, reasoningEffort: assistant.reasoningEffort || "" });
      }, [defaults, readMainSessionModel]);
      useEffect(() => {
        if (workspaceTouched.current) return;
        const next = selectableWorkspace(defaults && defaults.cwd, workspaces);
        setSettings((current) => current.cwd === next ? current : { ...current, cwd: next });
      }, [defaults, workspaces]);

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

      return h(Modal, {
        open: true,
        className: "ima-bind-modal",
        title: t("bind.title", { channel: channelLabel(ch, t) }),
        width: 640,
        zIndex: 1100,
        destroyOnHidden: true,
        maskClosable: !saving,
        keyboard: false,
        onCancel: close,
        footer: tab === "manual" && hasManual
          ? [h(Button, { key: "save", type: "primary", disabled: busy, onClick: saveManual }, busy ? t("action.saving") : t("action.confirm"))]
          : null,
      },
        hasQr && hasManual && h(Segmented, {
          block: true,
          value: tab,
          disabled: saving,
          options: [
            { value: "qr", label: t("bind.quick") },
            { value: "manual", label: t("bind.manual") },
          ],
          onChange: (next) => switchTab(next),
        }),
        error && h(Alert, { type: "error", showIcon: true, message: error }),
        success && h(Alert, { type: "success", showIcon: true, message: success }),
        h("div", { className: "ima-setup-section" },
          h(AccountSettingsPicker, {
            value: settings,
            onChange: (patch) => {
              if (patch && patch.cwd !== undefined) workspaceTouched.current = true;
              if (patch && (patch.provider !== undefined || patch.model !== undefined)) modelTouched.current = true;
              setSettings((current) => ({ ...current, ...patch }));
            },
            catalog,
            permissions,
            agentPresets,
            workspaces,
            createWorkspace,
            pickDirectory,
            modelT,
            permissionT,
            presetT,
            showAutoNameNote: true,
            t,
          }),
          h(CommandPermissionSettings, { value: settings.commandPermissions, onSave: commandPermissions => setSettings(current => ({ ...current, commandPermissions })), t }),
        ),
        tab === "qr" && hasQr && (
          status === "success"
            ? h(Alert, { type: "success", showIcon: true, message: t("bind.success") })
            : status === "saving"
              ? h("div", { className: "ima-bind-status" }, t("bind.saving"))
            : src
              ? h("div", { className: "ima-qrbox" },
                h("p", { className: "ima-hint" }, hintOf(ch, t)),
                h("img", { src, alt: t("bind.qrAlt", { channel: channelLabel(ch, t) }) }),
                remain > 0 && h("p", { className: "ima-hint" }, t("bind.expire", { time: Math.floor(remain / 60) + ":" + String(remain % 60).padStart(2, "0") })),
                status === "scanned" && h("p", { className: "ima-hint" }, t("bind.scanned")),
                (status === "expired" || status === "failed") && h("p", { className: "ima-error" }, serverText(pairing && pairing.error, t) || t("bind.retry")),
                h(Button, { disabled: busy, onClick: () => startQr(true) }, t("bind.refresh")),
              )
              : h("div", { className: "ima-bind-ready" },
                  h("p", { className: "ima-hint" }, hintOf(ch, t)),
                  (busy || status === "starting") && h("div", { className: "ima-bind-status" }, t("bind.generating")),
                  (status === "expired" || status === "failed") && h("div", { className: "ima-error" }, serverText(pairing && pairing.error, t) || t("bind.retry")),
                  h(Button, { type: "primary", disabled: busy || !settings.cwd || !settings.provider || !settings.model || !settings.permission, onClick: () => startQr(qrStarted) }, busy ? t("bind.generating") : qrStarted ? t("bind.refresh") : t("action.generateQr")),
                )
        ),
        tab === "manual" && hasManual && h("div", null,
          ...ch.fields.map((f) => h("label", { key: f.key, className: "ima-field" },
            fieldLabel(ch, f, t),
            h(Input, {
              type: f.secret ? "password" : "text",
              value: draft[f.key] || "",
              placeholder: fieldLabel(ch, f, t),
              onChange: (e) => setDraft({ ...draft, [f.key]: e.target.value }),
            }),
          )),
        ),
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

    // 与宿主 settings.agentPreset 一致：内置预设没有自报名称时走官方词条。
    const BUILT_IN_PRESET_KEYS = {
      standard: { name: "presetStandardName", description: "presetStandardDescription" },
      ptc: { name: "presetPtcName", description: "presetPtcDescription" },
      minimal: { name: "presetMinimalName", description: "presetMinimalDescription" },
      cordis: { name: "presetCordisName", description: "presetCordisDescription" },
    };
    function presetDisplayText(preset, presetT) {
      const keys = BUILT_IN_PRESET_KEYS[preset.id];
      if (keys && (preset.name === undefined || preset.name === "" || preset.name === preset.id)) {
        return { name: presetT(keys.name), description: presetT(keys.description) };
      }
      return { name: preset.name || preset.id, description: preset.description };
    }
    function PlusIcon() {
      return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", "aria-hidden": "true" },
        h("path", { d: "M8 3v10M3 8h10", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }),
      );
    }

    function AccountSettingsPicker(props) {
      const t = props.t || fallbackT;
      const modelT = props.modelT || ((key) => key);
      const permissionT = props.permissionT || ((key) => key);
      const presetT = props.presetT || ((key) => key);
      const value = props.value || {};
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
        }).catch((error) => setHint((error && error.message) || t("error.addWorkspace")))
          .finally(() => setAddBusy(false));
      };
      const onAddWorkspace = () => {
        setHint("");
        setAdding(true);
        setAddPath("");
        if (typeof props.pickDirectory === "function") {
          // Web 宿主可能返回空路径；始终保留可见的手动输入入口。
          return Promise.resolve().then(() => props.pickDirectory()).then(picked => {
            if (typeof picked === "string" && picked.trim()) return addWorkspace(picked);
          }).catch(() => { setAdding(true); });
        }
      };
      const selectPermission = (next) => {
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
        field("workspace", props.workspaceLabel || t("account.workspace"), h(Select, {
          className: "ima-account-picker ima-workspace-picker",
          value: cwd || undefined,
          placeholder: t("account.selectWorkspace"),
          "aria-label": props.workspaceLabel || t("account.workspace"),
          popupMatchSelectWidth: false,
          options: items.map((item) => ({ value: item.path, label: item.title || item.path })),
          notFoundContent: t("composer.noWorkspaces"),
          onChange: (next) => update({ cwd: next }),
          dropdownRender: (menu) => h("div", null,
            menu,
            h("div", { style: { height: 1, margin: "6px 8px", background: "var(--dsw-alias-border-l2,rgba(255,255,255,.1))" } }),
            h(Button, { type: "link", icon: h(PlusIcon), onClick: onAddWorkspace }, t("composer.addWorkspace")),
          ),
        })),
        field("agentPreset", presetT("nav"), h(Select, {
          className: "ima-account-picker",
          value: value.agentPreset || undefined,
          "aria-label": presetT("nav"),
          options: (props.agentPresets || []).map((item) => {
            const copy = presetDisplayText(item, presetT);
            return {
              value: item.id,
              label: copy.name,
              disabled: !!item.broken,
              title: item.broken ? t("account.presetUnavailable") : copy.description,
            };
          }),
          onChange: (next) => update({ agentPreset: next }),
        })),
        h("div", { key: "model-effort", className: "ima-model-effort" },
          field("model", modelT("menu.model"), h(Select, {
            className: "ima-account-picker ima-model-select",
            value: currentModel ? currentModel.value : undefined,
            placeholder: t("account.selectModel"),
            title: currentModel && currentModel.label,
            "aria-label": modelT("trigger.selectAria"),
            popupMatchSelectWidth: false,
            options: modelGroups.map((group) => ({
              label: group.name,
              options: group.models.map((item) => ({ value: item.value, label: item.label })),
            })),
            notFoundContent: modelT("empty.models"),
            onChange: (next) => {
              const item = models.find((entry) => entry.value === next);
              if (!item) return;
              update({ provider: item.provider, model: item.model, reasoningEffort: (item.reasoning && item.reasoning.defaultEffort) || "" });
            },
          })),
          reasoning && field("effort", modelT("menu.effort"), h(Select, {
            className: "ima-account-picker",
            value: effectiveEffort,
            "aria-label": modelT("menu.effort"),
            options: efforts.map((item) => ({ value: item.id, label: item.name })),
            onChange: (next) => update({ provider, model, reasoningEffort: next }),
          })),
        ),
        field("permission", t("composer.permission"), h(Select, {
          className: "ima-account-picker",
          value: permission || undefined,
          placeholder: t("account.selectPermission"),
          "aria-label": t("composer.permission"),
          options: permissionOptions.map((item) => ({ value: item.value, label: item.label })),
          onChange: selectPermission,
        })),
        field("private", t("account.privateAccess"), h(Select, {
          className: "ima-account-picker",
          value: privateAccess,
          "aria-label": t("account.privateAccess"),
          options: [
            { value: "approved", label: t("account.privateApproved") },
            { value: "all", label: t("account.privateAll") },
          ],
          onChange: (next) => update({ privateAccess: next }),
        })),
        h("div", { className: "ima-picker-note" }, t("account.presetNote")),
        privateAccess === "all" && h("div", { className: "ima-picker-note warning" }, t("settings.publicChatNotice")),
        hint && h("div", { className: "ima-picker-note" }, hint),
        props.showAutoNameNote && h("div", { className: "ima-picker-note" }, t("account.autoNameNote")),
        h(Modal, {
          open: adding,
          title: t("composer.addWorkspace"),
          onCancel: () => { setAdding(false); setAddPath(""); },
          onOk: () => addWorkspace(addPath),
          okButtonProps: { disabled: addBusy || !addPath.trim() },
          confirmLoading: addBusy,
          okText: addBusy ? t("action.adding") : t("action.confirm"),
          cancelText: t("action.cancel"),
        },
          h(Input, { autoFocus: true, value: addPath, placeholder: t("composer.workspacePath"), "aria-label": t("composer.workspacePath"), onChange: (event) => setAddPath(event.target.value) }),
        ),
        h(Modal, {
          open: confirmingFullAccess,
          title: permissionT("confirm.title"),
          keyboard: false,
          maskClosable: false,
          okText: permissionT("confirm.enable"),
          cancelText: permissionT("confirm.cancel"),
          okButtonProps: { disabled: !fullAccessAcknowledged },
          onCancel: () => { setFullAccessAcknowledged(false); setConfirmingFullAccess(false); },
          onOk: () => {
            if (!fullAccessAcknowledged) return;
            update({ permission: "danger-full-access" });
            setFullAccessAcknowledged(false);
            setConfirmingFullAccess(false);
          },
        },
          h("p", null, permissionT("confirm.description")),
          h(Checkbox, { checked: fullAccessAcknowledged, onChange: (event) => setFullAccessAcknowledged(event.target.checked) }, permissionT("confirm.acknowledge")),
        ),
      );
    }

    // 与账号配置共用两列网格和 Ant 下拉，私聊与群聊分别保存。
    function CommandPermissionSettings({ value, onSave, t }) {
      const policy = value || { dm: { enabled: true, users: [] }, group: { enabled: true, users: [] } };
      return h("div", { className: "ima-command-permissions ima-account-settings" },
        ...["dm", "group"].map(kind => h("div", { key: kind, className: "ima-picker-field" },
          h("span", { className: "ima-picker-label" }, t("command." + kind)),
          h(Select, {
            className: "ima-account-picker",
            value: policy[kind].enabled ? "on" : "off",
            "aria-label": t("command." + kind),
            options: [
              { value: "on", label: t("command.enabled") },
              { value: "off", label: t("command.disabled") },
            ],
            onChange: (next) => onSave({ dm: { enabled: policy.dm.enabled, users: [] }, group: { enabled: policy.group.enabled, users: [] }, [kind]: { enabled: next === "on", users: [] } }),
          }))));
    }

    function AccountConnectionCheck({ account, t }) {
      const diagnostics = account.diagnostics;
      return h("div", { className: "ima-connection-check", role: "status", "aria-live": "polite" },
        h("strong", null, t("diagnostic.title")),
        h("div", null, t("connection.checkedAt") + ": ", h("time", { dateTime: diagnostics.checkedAt }, new Date(diagnostics.checkedAt).toLocaleString(t("settings.label") === "IM Assistant" ? "en-US" : "zh-CN"))),
        diagnostics.checks.map(item => h("div", { className: "ima-diagnostic-item", key: item.id },
          h("div", { className: "ima-diagnostic-head" },
            h("strong", null, t("diagnostic." + item.id)),
            h(Tag, { color: item.status === "passed" ? "success" : item.status === "failed" ? "error" : "warning" }, t("diagnostic." + item.status)),
          ),
          h("div", null, t("diagnostic." + item.reason)),
          h("small", null, [item.durationMs == null ? null : item.durationMs + " ms", item.httpStatus == null ? null : "HTTP " + item.httpStatus, item.platformCode == null ? null : "Code " + item.platformCode].filter(Boolean).join(" · ")),
        )),
        h("div", null, t(account.receiveConfigured === true ? "connection.receiveOn" : account.receiveConfigured === false ? "connection.receiveOff" : "connection.receiveUnknown")),
        h("div", null, t("diagnostic.scope")),
      );
    }

    function AccountInspector({ account, catalog, permissions, agentPresets, workspaces, createWorkspace, pickDirectory, modelT, permissionT, presetT, t, onAction, onSave, busy }) {
      const [modal, modalHolder] = Modal.useModal();
      const [draft, setDraft] = useState(account);
      const [note, setNote] = useState("");
      const [checkResult, setCheckResult] = useState(null);
      const [checkFailed, setCheckFailed] = useState(false);
      const [checking, setChecking] = useState(false);
      const checkRequest = useRef(0);
      const checkPending = useRef(false);
      useEffect(() => {
        checkRequest.current += 1;
        checkPending.current = false;
        setCheckResult(null);
        setCheckFailed(false);
        setChecking(false);
        return () => { checkRequest.current += 1; };
      }, [account.id]);
      const check = async () => {
        if (checkPending.current) return;
        checkPending.current = true;
        const request = ++checkRequest.current;
        setChecking(true);
        setCheckResult(null);
        setCheckFailed(false);
        try {
          const result = await onAction(account.id, "check");
          if (request === checkRequest.current) {
            if (result && result.account && result.diagnostics?.version === 1 && Array.isArray(result.diagnostics.checks) && result.diagnostics.checks.length) setCheckResult({ ...result.account, diagnostics: result.diagnostics });
            else if (result && result.account) setCheckFailed("connection.restartRequired");
            else setCheckFailed(true);
          }
        } catch {
          if (request === checkRequest.current) setCheckFailed(true);
        } finally {
          if (request === checkRequest.current) { checkPending.current = false; setChecking(false); }
        }
      };
      const saveSeq = useRef(0);
      useEffect(() => {
        saveSeq.current += 1;
        setDraft(account);
        setNote("");
      }, [account.id, account.cwd, account.permission, account.agentPreset, account.privateAccess, JSON.stringify(account.commandPermissions), account.receiveEnabled, account.assistant && account.assistant.provider, account.assistant && account.assistant.model, account.assistant && account.assistant.reasoningEffort]);
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
          agentPreset: next.agentPreset,
          commandPermissions: next.commandPermissions,
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
        modalHolder,
        h("div", { className: "ima-inspector-head" },
          h(Logo, { id: account.platform }),
          h("div", { className: "ima-inspector-head-copy" },
            h("div", { className: "ima-inspector-title-row" },
            h("h3", { className: "ima-inspector-title" }, accountLabel(account, t)),
            h("div", { className: account.connectionState === "connected" ? "ima-inspector-status ok" : "ima-inspector-status" }, h(Tag, {
              color: account.receiveConfigured === false ? "warning" : account.connectionState === "connected" ? "success" : "warning",
              bordered: false,
            }, t(account.receiveConfigured === false ? "connection.paused" : "connection." + (account.connectionState || "unknown")))),
            ),
            h("div", { className: "ima-account-id" }, account.id),
          ),
        ),
        h("div", { className: "ima-form" },
          h("div", { className: "ima-picker-field" },
            h("span", { className: "ima-picker-label" }, t("account.remark")),
            h(AccountRemarkEditor, { account, t, always: true, disabled: Boolean(busy), onSave: (name) => save({ name }) }),
            h("div", { className: "ima-picker-note" }, t("account.remarkNote")),
          ),
          h(AccountSettingsPicker, {
            value: draft,
            onChange: applySettings,
            catalog,
            permissions,
            agentPresets,
            workspaces,
            createWorkspace,
            pickDirectory,
            modelT,
            permissionT,
            presetT,
            workspaceLabel: t("account.currentWorkspace"),
            t,
          }),
          h(CommandPermissionSettings, { value: draft.commandPermissions, onSave: commandPermissions => save({ commandPermissions }), t }),
          note && h("div", { className: note === "status.saved" ? "ima-save-note ok" : "ima-save-note" }, t(note)),
          h("div", { className: "ima-inspector-actions" },
            h(Button, { disabled: Boolean(busy) || checking, onClick: check }, t(checking ? "connection.checking" : "action.checkConnection")),
            h(Button, { disabled: Boolean(busy) || checking, onClick: () => { setCheckResult(null); return onAction(account.id, "reconnect"); } }, t("action.reconnectAccount")),
            h(Button, { danger: true, disabled: Boolean(busy) || checking, onClick: () => {
              modal.confirm({
                title: t("action.removeAccount"),
                content: t("account.removeConfirm"),
                okText: t("action.removeAccount"),
                cancelText: t("action.cancel"),
                okButtonProps: { danger: true },
                onOk: () => onAction(account.id, "remove"),
              });
            } }, t("action.removeAccount")),
          ),
          checkResult && h(AccountConnectionCheck, { account: checkResult, t }),
          checkFailed && h(Alert, { type: "error", showIcon: true, role: "alert", message: t(typeof checkFailed === "string" ? checkFailed : "connection.checkFailed") }),
        ),
      );
    }

    function AccountRemarkEditor(props) {
      const account = props.account;
      const t = props.t;
      const display = accountLabel(account, t);
      const stored = account.autoName ? "" : (account.name || "");
      const [draft, setDraft] = useState(stored);
      const [editing, setEditing] = useState(Boolean(props.always));
      const skipCommit = useRef(false);
      useEffect(() => {
        setDraft(account.autoName ? "" : (account.name || ""));
        if (!props.always) setEditing(false);
      }, [account.id, account.name, account.autoName, props.always]);
      const commit = () => {
        if (skipCommit.current) {
          skipCommit.current = false;
          return;
        }
        const next = draft.trim();
        const current = account.autoName ? "" : (account.name || "");
        if (next === current) {
          if (!props.always) setEditing(false);
          return;
        }
        Promise.resolve(props.onSave(next)).then((ok) => {
          if (!ok) setDraft(current);
          if (!props.always) setEditing(false);
        });
      };
      if (!props.always && !editing) {
        return h("button", {
          type: "button",
          className: "ima-account-name ima-account-rename-button",
          title: t("account.rename"),
          "aria-label": display + " · " + t("account.rename"),
          disabled: Boolean(props.disabled),
          onClick: (event) => { event.stopPropagation(); setEditing(true); },
        }, display);
      }
      return h("input", {
        type: "text",
        className: props.always ? "ima-account-remark-input" : "ima-account-rename",
        autoFocus: !props.always,
        maxLength: 40,
        value: draft,
        placeholder: display,
        "aria-label": t("account.remark"),
        disabled: Boolean(props.disabled),
        onClick: (event) => event.stopPropagation(),
        onMouseDown: (event) => event.stopPropagation(),
        onChange: (event) => setDraft(event.target.value),
        onBlur: commit,
        onKeyDown: (event) => {
          if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === "Escape" && !props.always) {
            event.preventDefault();
            event.stopPropagation();
            skipCommit.current = true;
            setDraft(stored);
            setEditing(false);
          }
        },
      });
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
      const [settingsAccount, setSettingsAccount] = useState(null);
      const [expanded, setExpanded] = useState({});
      const [channelSettingsRequest, setChannelSettingsRequest] = useState(() => typeof window !== "undefined" ? readChannelSettingsRequest(window.sessionStorage) : undefined);
      const [catalog, setCatalog] = useState({ providers: [], permissions: [], assistant: null, cwd: "", permission: "" });
      const workspaces = props.useWorkspaces ? (props.useWorkspaces((state) => state && state.items || []) || []) : [];
      const selectAccount = useCallback((id) => {
        const next = id || "";
        setSelected(next);
        rememberAccountSelection(next);
      }, []);

      const refresh = useCallback(() => {
        return channelRefresh.invalidate().catch(() => undefined);
      }, []);

      useEffect(() => channelRefresh.subscribe((data, error) => {
        if (error) { setError(t("error.connection")); return; }
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
      }), []);

      useEffect(() => {
        ensureStyle();
        api("/assistant").then((data) => {
          if (data.ok) setCatalog({ providers: data.providers || [], permissions: data.permissions || [], agentPresets: data.agentPresets || [], agentPreset: data.agentPreset || "standard", assistant: data.assistant || null, cwd: data.cwd || "", permission: data.permission || "" });
        }).catch(() => undefined);
      }, [refresh]);
      useEffect(() => {
        if (!settingsAccount) return undefined;
        const onKey = (event) => {
          if (event.key !== "Escape") return;
          if (document.querySelector(".ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-dropdown:not(.ant-dropdown-hidden)")) return;
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
          setSettingsAccount(null);
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
      }, [settingsAccount]);
      useEffect(() => {
        if (typeof window === "undefined") return undefined;
        const onRequest = (event) => {
          const request = parseChannelSettingsRequest(event.detail);
          if (request) setChannelSettingsRequest(request);
        };
        window.addEventListener(CHANNEL_SETTINGS_EVENT, onRequest);
        return () => window.removeEventListener(CHANNEL_SETTINGS_EVENT, onRequest);
      }, []);
      useEffect(() => {
        if (!channelSettingsRequest || channels == null) return;
        const target = resolveChannelSettingsTarget(channelSettingsRequest, channels);
        clearChannelSettingsRequest(typeof window !== "undefined" ? window.sessionStorage : undefined);
        setChannelSettingsRequest(undefined);
        if (!target) return;
        setExpanded((current) => Object.assign({}, current, { [target.channelId]: true }));
        if (target.accountId) {
          selectAccount(target.accountId);
          setSettingsAccount(target.accountId);
        }
        if (typeof document !== "undefined") {
          const node = document.querySelector('[data-ima-platform="' + target.channelId + '"]');
          if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest" });
        }
      }, [channelSettingsRequest, channels, selectAccount]);

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
          return action === "check" ? data : true;
        }).catch(() => { setError(t("error.request")); return false; }).finally(() => setBusy((prev) => ({ ...prev, [id]: false })));
      };
      const saveAccount = (id, body) => onAction(id, "settings", body);
      const allAccounts = (channels || []).flatMap((channel) => channel.accounts || []);
      const selectedAccount = allAccounts.find((item) => item.id === settingsAccount);

      return h("section", { className: "ima-page ima-account-page", "aria-label": t("settings.aria") },
        h("header", { className: "ima-head" },
          h("div", { className: "ima-heading" },
            h("div", { className: "ima-title-row" },
              h("h2", { className: "ima-title" }, t("settings.title")),
              h("div", { className: "ima-title-links" },
                h(Button, { size: "small", shape: "default", href: "https://github.com/MichengAI/dsh-im-connect", target: "_blank", rel: "noreferrer", "aria-label": t("settings.viewProject"), icon: h(GithubMark16) }, t("settings.viewProject")),
                h(Button, { size: "small", shape: "default", href: "https://github.com/MichengAI/dsh-im-connect/issues", target: "_blank", rel: "noreferrer", "aria-label": t("settings.feedback"), icon: h(IconListPenOutline16, { size: 16 }) }, t("settings.feedback")),
              ),
            ),
            h("p", { className: "ima-sub" }, t("settings.description")),
          ),
        ),
        error && h(Alert, { type: "error", showIcon: true, className: "ima-error", message: error }),
        pending.length > 0 && h(Alert, {
          type: "warning",
          showIcon: true,
          className: "ima-pending",
          message: t("pending.notice"),
          description: pending.map((p) => h("div", { key: p.channelId + p.userId, className: "ima-pending-row" },
            h("span", { style: { flex: 1 } }, (p.username || p.userId) + " · " + (accountLabel(allAccounts.find((item) => item.id === p.channelId), t) || p.channelId)),
            h(Button, { onClick: () => onAction(p.channelId, "approve", { userId: p.userId }) }, t("action.approve")),
            h(Button, { onClick: () => onAction(p.channelId, "deny", { userId: p.userId }) }, t("action.deny")),
          )),
        }),
        channels == null
          ? h("div", { className: "ima-empty" }, t("loading"))
          : h("div", { className: "ima-account-shell" },
              h("div", { className: "ima-platforms" },
                ...channels.map((ch) => {
                  const canExpand = (ch.accounts || []).length > 0;
                  const open = canExpand && Boolean(expanded[ch.id]);
                  const toggleExpanded = canExpand ? () => setExpanded({ ...expanded, [ch.id]: !open }) : undefined;
                  return h("div", { key: ch.id, className: "ima-platform" + (open ? " open" : "") + (canExpand ? "" : " empty"), "data-ima-platform": ch.id },
                    h("div", { className: "ima-platform-head", role: canExpand ? "button" : undefined, tabIndex: canExpand ? 0 : undefined, "aria-expanded": canExpand ? open : undefined, onClick: toggleExpanded, onKeyDown: canExpand ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(); } } : undefined },
                      h(Logo, { id: ch.id }),
                      h("span", { className: "ima-platform-title" }, channelLabel(ch, t)),
                      h("div", { className: "ima-platform-meta" },
                        h("span", { className: "ima-platform-count" }, t("account.count", { count: ch.total })),
                        h(Button, { onClick: (e) => { e.stopPropagation(); setEditing(ch.id); } }, t("action.addAccount")),
                        h("span", { className: canExpand ? "ima-platform-caret" : "ima-platform-caret empty", "aria-hidden": "true" }, canExpand && h(IconChevron)),
                      ),
                    ),
                    open && h("div", { className: "ima-account-list" },
                      ...(ch.accounts || []).map((account) => h("div", { key: account.id, className: "ima-account-row" },
                        h("span", { className: "ima-account-copy" }, h(AccountRemarkEditor, { account, t, disabled: Boolean(busy[account.id]), onSave: (name) => onAction(account.id, "settings", { name }) })),
                        h(Tag, {
                          color: busy[account.id] ? "default" : account.receiveConfigured === false ? "warning" : account.connectionState === "connected" ? "success" : "warning",
                          bordered: false,
                        }, busy[account.id] ? t("account.statusProcessing") : t(account.receiveConfigured === false ? "connection.paused" : "connection." + (account.connectionState || "unknown"))),
                        h("div", { className: "ima-account-receive", title: t("account.receiveDescription") },
                          h("span", null, t("account.receive")),
                          h(Switch, { role: "switch", checked: account.receiveConfigured === true, "aria-checked": Boolean(account.receiveConfigured === true), "aria-label": accountLabel(account, t) + " · " + t("account.receive"), title: account.receiveConfigured === undefined ? t("connection.receiveUnknown") : t("account.receive"), disabled: Boolean(busy[account.id]) || account.receiveConfigured === undefined, onChange: (checked) => onAction(account.id, "receive", { receiveEnabled: checked }) })),
                        h(Button, { onClick: () => { selectAccount(account.id); setSettingsAccount(account.id); } }, t("action.settings")),
                      )),
                    ),
                  );
                }),
              ),
            ),
        selectedAccount && h(Modal, {
          open: true,
          className: "ima-account-modal",
          title: t("action.settings"),
          width: 640,
          zIndex: 1100,
          destroyOnHidden: true,
          keyboard: false,
          onCancel: () => setSettingsAccount(null),
          footer: null,
        },
          h(AccountInspector, {
                    account: selectedAccount,
                    busy: busy[selectedAccount.id],
                    catalog: catalog.providers,
                    permissions: catalog.permissions,
                    agentPresets: catalog.agentPresets,
                    workspaces,
                    createWorkspace: props.createWorkspace,
                    pickDirectory: props.pickDirectory,
                    modelT: props.modelT,
                    permissionT: props.permissionT,
                    presetT: props.presetT,
                    t,
                    onAction,
                    onSave: saveAccount,
            }),
        ),
        editing && h(BindModal, {
          ch: (channels || []).find((item) => item.id === editing) || { id: editing, label: editing, kind: "qr", fields: [] },
          catalog: catalog.providers,
          permissions: catalog.permissions,
                    agentPresets: catalog.agentPresets,
          workspaces,
          createWorkspace: props.createWorkspace,
          pickDirectory: props.pickDirectory,
          modelT: props.modelT,
          permissionT: props.permissionT,
          presetT: props.presetT,
          defaults: catalog,
          readMainSessionModel: props.readMainSessionModel,
          onClose: () => setEditing(null),
          onConnected: () => { setEditing(null); setExpanded((prev) => ({ ...prev, [editing]: true })); refresh(); },
          t,
        }),
      );
    }
    const WB_CSS = `.dcu-wb,.ima-native{--dsh-session-list-edge-inset:var(--dsh-sidebar-inline-padding,12px);--dsh-session-list-scrollbar-width:5px;--dsh-session-list-scrollbar-offset:2px;display:flex;flex:1;min-width:0;min-height:0;flex-direction:column;padding:0;padding-right:var(--dsh-session-list-edge-inset);box-sizing:border-box;overflow:hidden;color:var(--dsw-alias-label-primary,var(--ima-text));font:14px/20px inherit}.ima-n-toolbar{box-sizing:border-box;flex:none;height:36px;margin:2px -4px 4px 0;padding-left:4px;display:flex;justify-content:flex-end;align-items:center;gap:4px;overflow:visible;position:relative;z-index:2;color:var(--dsw-alias-label-tertiary,#81858C);border-radius:12px}.ima-n-head-label{white-space:nowrap;min-width:0;max-width:45%;flex:none;line-height:20px;font-size:14px;overflow:hidden;transition:max-width .18s var(--ds-ease-in-out,ease),margin-right .18s var(--ds-ease-in-out,ease),opacity .12s var(--ds-ease-in-out,ease),transform .18s var(--ds-ease-in-out,ease),visibility 0s linear}.ima-n-toolbar.is-search .ima-n-head-label{opacity:0;visibility:hidden;max-width:0;margin-right:-4px;transform:translate(-4px);transition-delay:0s,0s,0s,0s,.18s}.ima-n-search-slot{box-sizing:border-box;min-width:28px;max-width:28px;transition:max-width .18s var(--ds-ease-in-out,ease);flex:none;align-items:center;margin-left:auto;display:flex;position:relative;z-index:2}.ima-n-toolbar.is-search .ima-n-search-slot{flex:1;min-width:0;max-width:100%}.ima-n-search{box-sizing:border-box;cursor:text;width:100%;height:28px;color:var(--dsw-alias-label-secondary);transition:width .18s var(--ds-ease-in-out,ease),padding .18s var(--ds-ease-in-out,ease),border-color .18s var(--ds-ease-in-out,ease);background:transparent;border:none;border-radius:50%;flex:none;align-items:center;margin:0;padding:0;display:flex;overflow:hidden}.ima-n-toolbar.is-search .ima-n-search{border:.5px solid var(--dsw-alias-border-l4);width:calc(100% + 4px);height:30px;color:var(--dsw-alias-label-caption);border-radius:10px;margin-inline:-2px;padding:0 4px 0 0}.ima-n-search-btn,.ima-n-head-btn{cursor:pointer;width:28px;height:28px;min-width:28px;min-height:28px;position:relative;z-index:1;color:var(--dsw-alias-label-secondary);background:transparent;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.ima-n-toolbar.is-search .ima-n-search-btn{width:28px;height:30px}.ima-n-search-btn:hover,.ima-n-head-btn:hover,.ima-n-head-btn.on,.ima-n-head-btn.is-on{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));color:var(--dsw-alias-label-primary,var(--ima-text))}.ima-n-toolbar.is-search .ima-n-search-btn:hover{background:transparent}.ima-n-head-acts{opacity:1;visibility:visible;max-width:32px;transition:max-width .18s var(--ds-ease-in-out,ease),opacity .12s var(--ds-ease-in-out,ease),transform .18s var(--ds-ease-in-out,ease),visibility 0s linear;flex:none;align-items:center;gap:4px;display:flex;overflow:visible;position:relative}.ima-n-toolbar.is-search .ima-n-head-acts{opacity:0;visibility:hidden;pointer-events:none;max-width:0;transform:translate(4px);transition-delay:0s,0s,0s,.18s}.ima-n-search-input{display:none;opacity:0;pointer-events:none;width:0;min-width:0;flex:none;color:var(--dsw-alias-label-primary,var(--ima-text));transition:opacity .12s var(--ds-ease-in-out,ease);background:transparent;border:none;outline:none;flex:1;font-size:13px;line-height:18px}.ima-n-toolbar.is-search .ima-n-search-input{display:block;opacity:1;pointer-events:auto;margin-left:-2px;width:auto;flex:1;min-width:0}.ima-n-search-input::placeholder{color:var(--dsw-alias-label-tertiary,#81858C)}.ima-n-search-clear{cursor:pointer;width:24px;height:24px;color:var(--dsw-alias-label-secondary);background:transparent;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.ima-n-search-clear:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}@media (prefers-reduced-motion:reduce){.ima-n-head-label,.ima-n-search-slot,.ima-n-search,.ima-n-head-acts,.ima-n-search-input{transition:none}}.ima-n-list-area,.dcu-wb-list-area{min-height:0;margin-left:-4px;margin-right:calc(-1 * var(--dsh-session-list-edge-inset));flex-direction:column;flex:1;padding-left:4px;display:flex;overflow:visible}.ima-native-tree,.dcu-wb-tree{flex:1;min-width:0;min-height:0;overflow-x:hidden;overflow-y:auto;user-select:none;margin-left:-4px;margin-right:var(--dsh-session-list-scrollbar-offset);padding-top:0;padding-bottom:16px;padding-left:4px;padding-right:calc(var(--dsh-session-list-edge-inset) - var(--dsh-session-list-scrollbar-width) - var(--dsh-session-list-scrollbar-offset));scrollbar-gutter:stable}.ima-native-project,.dcu-wb-project{position:relative;min-width:0;max-width:100%}.ima-native-project+.ima-native-project,.dcu-wb-project+.dcu-wb-project{margin-top:4px}.ima-native-project>*+*,.dcu-wb-project>*+*{margin-top:2px}.dcu-wb *,.ima-native *{box-sizing:border-box}
.dcu-wb-tree,.ima-native-tree{flex:1;min-height:0}
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
.dcu-wb-empty,.ima-native-empty{padding:16px 12px;color:var(--dsw-alias-label-tertiary,var(--ima-muted));font-size:13px}
.ima-rename{flex:1;min-width:0;min-height:28px;padding:2px 8px;border-radius:6px;border:1px solid var(--dsw-alias-stroke-primary,var(--ima-line));background:transparent;color:inherit;font:inherit}
.ima-n-row,.ima-n-sess{display:flex;align-items:center;max-width:100%;gap:6px;border-radius:8px;padding:0 8px;padding-inline-start:calc(8px + var(--dsh-workspace-indent,0px));cursor:pointer;user-select:none;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-primary,var(--ima-text));font:14px/20px inherit;text-align:left;box-sizing:border-box}
.ima-n-row{height:34px}
.ima-n-sess{height:32px;gap:0;position:relative;appearance:none}
.ima-n-row:hover,.ima-n-sess:hover,.ima-n-sess.on,.ima-n-sess.is-on,.ima-n-row.menu-on,.ima-n-row.is-menu,.ima-n-sess.menu-on,.ima-n-sess.is-menu{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}
.ima-n-row.has-current-session .ima-n-folder{color:var(--dsw-alias-state-business-primary,#4c8dff)}
.ima-n-project-text{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}
.ima-n-row .ima-n-acts{height:20px}
.ima-n-sess.is-flat-idle .ima-n-title{margin-left:0}
.ima-n-sess:focus{outline:none}.ima-n-sess:focus-visible:not(.is-on){box-shadow:inset 0 0 0 2px var(--dsw-alias-state-business-primary,#4c8dff)}
.ima-n-slot{flex:none;width:16px;min-width:16px;height:20px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary,#81858C)}
.ima-n-folder{color:var(--dsw-alias-label-secondary,#9ca39f)}
.ima-n-lead{color:var(--dsw-alias-label-tertiary,#81858C)}
.ima-n-corner{color:var(--dsw-alias-label-caption,#ADB2B8);width:8px}
.ima-n-hover{--dsw-hovercard-bg:#2C2C2E;position:fixed;z-index:100;box-sizing:border-box;width:244px;padding:12px 16px;border:0;border-radius:12px;background:var(--dsw-hovercard-bg);box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.36))}
.ima-n-hover-content{display:flex;flex-direction:column;gap:8px;min-width:0}
.ima-n-hover-title{color:#fff;font-size:14px;line-height:20px;font-weight:400;overflow-wrap:break-word}
.ima-n-hover-time{margin:0;color:#cfd3d6;font-size:12px;line-height:16px}
.ima-n-hover-state{display:flex;align-items:center;gap:8px;margin:0;font-size:12px;line-height:20px;color:#adb2b8}
.ima-n-hover-dot{width:10px;height:10px;border-radius:50%;background:var(--dsw-alias-state-success-primary,#34c759);flex:none;position:relative}
.ima-n-hover-dot.is-run{background:var(--dsw-static-deepseek-450,#4c8dff)}
.ima-n-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;flex:1;font-weight:400}
.ima-n-sess .ima-n-title{margin:0 6px 0 4px}
.ima-n-sess .ima-n-title[data-scrolled]{mask-image:linear-gradient(90deg,#0000,#000 12px)}
.ima-n-sess .ima-n-title[data-clipped]{mask-image:linear-gradient(270deg,#0000,#000 12px)}
.ima-n-sess .ima-n-title[data-scrolled][data-clipped]{mask-image:linear-gradient(90deg,#0000,#000 12px calc(100% - 12px),#0000)}
@media (hover:hover){.ima-n-sess:hover .ima-n-title,.ima-n-sess.is-menu .ima-n-title{text-overflow:clip}}
.ima-n-sess.is-archived .ima-n-title,.ima-n-sess.is-archived .ima-n-time{color:var(--dsw-alias-label-caption,#ADB2B8)}
.ima-n-time{flex:none;font-size:10px;line-height:16px;color:var(--dsw-alias-label-caption,#ADB2B8);white-space:nowrap}
.ima-n-acts{flex:none;display:none;align-items:center;gap:10px}
.ima-n-row:hover .ima-n-acts,.ima-n-sess:hover .ima-n-acts,.ima-n-row.menu-on .ima-n-acts,.ima-n-row.is-menu .ima-n-acts,.ima-n-sess.menu-on .ima-n-acts,.ima-n-sess.is-menu .ima-n-acts{display:inline-flex}
.ima-n-sess:hover .ima-n-time,.ima-n-sess.menu-on .ima-n-time,.ima-n-sess.is-menu .ima-n-time{display:none}
.ima-n-ico{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:0;border-radius:4px;padding:0;background:transparent;cursor:pointer;color:var(--dsw-alias-label-tertiary,#81858C)}
.ima-n-ico:hover{color:var(--dsw-alias-label-primary,var(--ima-text))}
.ima-n-menu{position:fixed;right:auto;top:auto;z-index:4000;min-width:218px;max-width:360px;box-sizing:border-box;padding:4px;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-inverted,rgba(255,255,255,.12));border-radius:12px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2));box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.36))}
.ima-n-menu button{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:8px 10px;border:0;border-radius:10px;background:transparent;cursor:pointer;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary,var(--ima-text));text-align:left}
.ima-n-menu button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}
.ima-n-mi{display:inline-flex;flex:none;width:16px;height:16px;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary,#81858C)}
.ima-n-menu button.danger{color:var(--dsw-alias-state-error-primary,#f85149)}
.ima-n-menu button.danger .ima-n-mi{color:inherit}
.ima-n-menu button.danger:hover{background:var(--dsw-alias-interactive-bg-hover-danger,rgba(248,81,73,.12))}
.ima-n-rename{flex:1;min-width:0;margin:0 6px 0 4px;border:.5px solid var(--dsw-alias-border-l4);border-radius:4px;outline:none;background:var(--dsw-alias-button-elevated-fill,rgba(255,255,255,.04));color:inherit;padding:0 2px;font-size:14px;line-height:20px}
.ima-n-dialog-actions{display:flex;justify-content:flex-end;gap:8px}
.ima-n-dialog-copy{margin:0;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}
.ima-n-dialog-status{margin-top:12px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
.ima-n-dialog-error{margin-top:12px;color:var(--dsw-alias-state-error-primary,#f85149);font-size:13px;line-height:20px}
.ima-n-danger-button{color:var(--dsw-alias-state-error-primary,#f85149)!important}
.ima-n-danger-button:hover{background:var(--dsw-alias-interactive-bg-hover-danger,rgba(248,81,73,.12))!important}
.ima-n-restore{flex:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#c9cdd4);font:12px/16px inherit;padding:2px 4px;cursor:pointer}`;

    function NativeSvg(viewBox, size, children) {
      return h("svg", { viewBox, width: size, height: size, fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true" }, children);
    }
    function NativePath(d, extra) {
      return h("path", Object.assign({ d, fill: "currentColor" }, extra || {}));
    }
    function IconChevron() {
      return NativeSvg("0 0 14 14", 14, NativePath("M4.25 2.828v8.344c0 .49.592.735.939.389l4.172-4.172a.55.55 0 0 0 0-.778L5.189 2.439c-.347-.347-.939-.101-.939.389Z"));
    }
    function IconSearchFallback(props) {
      const size = props && props.size ? props.size : 16;
      return NativeSvg("0 0 16 16", size, [
        NativePath("M11.894845 6.647401C11.894845 3.725463 9.534486 1.356779 6.623219 1.35657C3.711786 1.35657 1.351635 3.725338 1.351635 6.647401C1.351843 9.569296 3.711911 11.938273 6.623219 11.938273C9.534361 11.938064 11.894637 9.569171 11.894845 6.647401ZM13.245462 6.647401C13.245254 10.317935 10.280401 13.293613 6.623219 13.293821C2.965871 13.293821 0.000204 10.31806 0 6.647401C0 2.976574 2.965746 0 6.623219 0C10.280526 0.000205 13.245462 2.9767 13.245462 6.647401Z"),
        NativePath("M16.000417 15.041079L15.044449 16.000433L11.530434 12.473588L12.486298 11.514234L16.000417 15.041079Z"),
      ]);
    }
    function IconSlidersFallback() {
      return NativeSvg("0 0 16 16", 16, NativePath("M2.2 3.4h6.05a1.85 1.85 0 0 0 3.5 0H13.8v1.3H11.75a1.85 1.85 0 0 0-3.5 0H2.2V3.4Zm8.6 1.15A.75.75 0 1 1 10.05 4.55.75.75 0 0 1 10.8 4.55ZM2.2 7.35h2.35a1.85 1.85 0 0 0 3.5 0H13.8v1.3H8.05a1.85 1.85 0 0 0-3.5 0H2.2V7.35Zm4.1 1.15A.75.75 0 1 1 5.55 8.5a.75.75 0 0 1 .75-.75ZM2.2 11.3h7.35a1.85 1.85 0 0 0 3.5 0H13.8v1.3h-.75a1.85 1.85 0 0 0-3.5 0H2.2v-1.3Zm9.9 1.15a.75.75 0 1 1-.75-.75.75.75 0 0 1 .75.75Z"));
    }
    function IconCloseOutlineFallback(props) {
      const size = props && props.size ? props.size : 16;
      return NativeSvg("0 0 16 16", size, [
        NativePath("M14.1168 13.197L13.197 14.1167L1.8833 2.80303L2.80309 1.88324L14.1168 13.197Z"),
        NativePath("M13.197 1.88326L14.1168 2.80305L2.80309 14.1168L1.8833 13.197L13.197 1.88326Z"),
      ]);
    }
    function IconListFallback() {
      return NativeSvg("0 0 16 16", 16, NativePath("M3 4h10M3 8h10M3 12h10", { fill: "none", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" }));
    }
    function IconArchiveCheckFallback() {
      return NativeSvg("0 0 16 16", 16, NativePath("M3 6.5h10v6H3v-6Zm1.2-2.5h7.6L13 6.5H3L4.2 4Zm2.3 5.2 1.3 1.3 2.6-2.6", { fill: "none", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }));
    }
    const IconSearchOutline = hostOrFallback(IconSearchHost, IconSearchFallback);
    const IconCloseFill = hostOrFallback(IconCloseFillHost, IconCloseOutlineFallback);
    const IconSlidersTwoOutline = hostOrFallback(IconSlidersHost, IconSlidersFallback);
    const IconFlatList = hostOrFallback(IconFlatListOutline, IconListFallback);
    const IconWorkspaceTree = hostOrFallback(pickHostIcon("IconWorkspaceTreeOutlineRegular", "IconWorkspaceTreeOutline16"), function IconTreeFallback() {
      return NativeSvg("0 0 16 16", 16, NativePath("M3 3h4v3H3V3Zm6 1h4M3 10h4v3H3v-3Zm6 1.5h4M7 4.5h2M7 11.5h2", { fill: "none", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round" }));
    });
    const IconArchiveCheckOutline = hostOrFallback(IconArchiveCheckHost, IconArchiveCheckFallback);
    function ChannelWorkspaceHead({ query, sort, groupMode, archivedFilter, onQuery, onSort, onGroupMode, onArchivedFilterChange, t = fallbackT }) {
      const [searching, setSearching] = useState(!!query);
      const [filterOpen, setFilterOpen] = useState(false);
      const searchSize = searching ? 11 : 14;
      const items = [
        { type: "label", id: "group-by", text: t("rail.group") },
        { id: "workspace", label: t("rail.byWorkspace"), icon: h(IconFolderClose, { size: 16 }) },
        { id: "workspace-tree", label: t("rail.byWorkspaceTree"), icon: h(IconWorkspaceTree, { size: 16 }) },
        { id: "flat", label: t("rail.list"), icon: h(IconFlatList, { size: 16 }) },
        { type: "separator", id: "order-by-separator" },
        { type: "label", id: "order-by", text: t("rail.sort") },
        { id: "updated", label: t("rail.recent"), icon: h(IconClockOutline, { size: 16 }) },
        { type: "separator", id: "archived-filter-separator" },
        { type: "label", id: "filter-by", text: t("rail.filter") },
        { id: "show-archived", label: t("rail.showArchived"), icon: h(IconArchiveOutline20, { size: 16 }) },
        { id: "only-archived", label: t("rail.onlyArchived"), icon: h(IconArchiveCheckOutline, { size: 16 }) },
      ];
      const selectedIds = [
        groupMode === "list" ? "flat" : groupMode,
        "updated",
        ...(archivedFilter === "show" ? ["show-archived"] : []),
        ...(archivedFilter === "only" ? ["only-archived"] : []),
      ];
      return h("div", { className: searching ? "ima-n-toolbar is-search" : "ima-n-toolbar" },
        h("span", { className: "ima-n-head-label" }, groupMode === "list" ? t("rail.sessions") : t("rail.workspace")),
        h("div", { className: "ima-n-search-slot" },
          h("div", { className: "ima-n-search", onClick: () => { setFilterOpen(false); setSearching(true); } },
            h("button", { type: "button", className: "ima-n-search-btn", "aria-label": t("rail.search"), "aria-expanded": searching, onClick: () => { setFilterOpen(false); setSearching(true); } }, h(IconSearchOutline, { size: searchSize })),
            h("input", { className: "ima-n-search-input", value: query, placeholder: t("rail.searchPlaceholder"), "aria-label": t("rail.search"), tabIndex: searching ? 0 : -1, "aria-hidden": !searching, onChange: (e) => onQuery(e.target.value), onKeyDown: (e) => { if (e.key === "Escape") { onQuery(""); setSearching(false); } } }),
            searching && h("button", { type: "button", className: "ima-n-search-clear", "aria-label": t("rail.clearSearch"), onClick: (e) => { e.stopPropagation(); onQuery(""); setSearching(false); } }, h(IconCloseFill, { size: 14 })),
          ),
        ),
        h("div", { className: "ima-n-head-acts" },
          h(HostMenu, {
            open: filterOpen,
            onClose: () => { setFilterOpen(false); },
            items,
            selectedIds,
            align: "end",
            dense: true,
            portal: true,
            onSelect: (id) => {
              if (id === "workspace" || id === "workspace-tree") onGroupMode(id);
              if (id === "flat") onGroupMode("list");
              if (id === "updated") onSort("time");
              if (id === "show-archived") onArchivedFilterChange(archivedFilter === "show" ? "default" : "show");
              if (id === "only-archived") onArchivedFilterChange(archivedFilter === "only" ? "default" : "only");
              setFilterOpen(false);
            },
            anchor: h("button", { type: "button", className: filterOpen ? "ima-n-head-btn is-on" : "ima-n-head-btn", "aria-label": t("rail.filter"), "aria-expanded": filterOpen, onClick: () => setFilterOpen((open) => !open) }, h(IconSlidersTwoOutline, { size: 16 })),
          }),
        ),
      );
    }
    function ChannelSettingsIcon() {
      return typeof IconSettingsOutline16 === "function" ? h(IconSettingsOutline16, { size: 16 }) : NativeSvg("0 0 16 16", 16, NativePath("M8 2.2a1.2 1.2 0 0 1 1.15.84l.16.5.5.16A1.2 1.2 0 0 1 11.3 5.3l.45.45a1.2 1.2 0 0 1 0 1.7l-.45.45-.16.5A1.2 1.2 0 0 1 10.3 9.7l-.5.16-.16.5A1.2 1.2 0 0 1 8.5 11.8H7.5a1.2 1.2 0 0 1-1.15-.84l-.16-.5-.5-.16A1.2 1.2 0 0 1 4.7 9.7l-.45-.45a1.2 1.2 0 0 1 0-1.7l.45-.45.16-.5A1.2 1.2 0 0 1 5.7 5.3l.5-.16.16-.5A1.2 1.2 0 0 1 7.5 2.2H8Zm0 4.3A1.5 1.5 0 1 0 8 9.5 1.5 1.5 0 0 0 8 6.5Z"));
    }
    function SessionHoverStatusDot({ running, size }) {
      if (typeof StateDot === "function") return h(StateDot, { state: running ? "ongoing" : "idle", size: size || 10 });
      return h("span", { className: running ? "ima-n-hover-dot is-run" : "ima-n-hover-dot" });
    }
    function SessionHoverContent({ title, time, running, statuses, t = fallbackT }) {
      const rows = statuses && statuses.length ? statuses : [{ state: running ? "ongoing" : "idle", label: running ? t("rail.running") : t("rail.idle") }];
      return h("div", { className: "ima-n-hover-content" },
        h("div", { className: "ima-n-hover-title" }, title),
        time ? h("div", { className: "ima-n-hover-time" }, time) : null,
        rows.map((status) => h("div", { key: status.label, className: "ima-n-hover-state" },
          status.state === "archived"
            ? h(IconArchiveOutline20, { size: 14 })
            : (typeof StateDot === "function"
              ? h(StateDot, { state: status.state === "ongoing" ? "ongoing" : status.state === "warning" ? "warning" : status.state === "done" ? "done" : "idle", size: 10 })
              : h(SessionHoverStatusDot, { running: status.state === "ongoing" })),
          status.label,
        )),
      );
    }
    function SessionHoverCard({ title, time, running, statuses, style, cardRef, onMouseEnter, onMouseLeave, t = fallbackT }) {
      return h("div", { className: "ima-n-hover", style, ref: cardRef, onMouseEnter, onMouseLeave },
        h(SessionHoverContent, { title, time, running, statuses, t }),
      );
    }
    function nativeSessionHoverStyle(row, card, viewport) {
      const pad = 8;
      const left = row.right + pad;
      const top = row.top + card.height > viewport.height - pad
        ? Math.max(pad, viewport.height - card.height - pad)
        : Math.max(pad, row.top);
      return { position: "fixed", zIndex: 4100, left: Math.round(left) + "px", top: Math.round(top) + "px" };
    }
    function relativeTimeParts(value, now) {
      const ts = Date.parse(value || "");
      if (!Number.isFinite(ts)) return null;
      const MIN = 6e4;
      const HOUR = 36e5;
      const DAY = 864e5;
      const diff = Math.max(0, (now || Date.now()) - ts);
      if (diff < MIN) return { unit: "now", n: 0 };
      if (diff < HOUR) return { unit: "minutes", n: Math.floor(diff / MIN) };
      if (diff < DAY) return { unit: "hours", n: Math.floor(diff / HOUR) };
      if (diff < 30 * DAY) return { unit: "days", n: Math.floor(diff / DAY) };
      if (diff < 365 * DAY) return { unit: "months", n: Math.floor(diff / (30 * DAY)) };
      return { unit: "years", n: Math.floor(diff / (365 * DAY)) };
    }
    function timeLabel(value, t = fallbackT, now) {
      const parts = relativeTimeParts(value, now);
      if (!parts) return "";
      return parts.unit === "now" ? t("time.now") : t("time." + parts.unit, { n: parts.n, count: parts.n });
    }
    function hoverTimeLabel(value, t = fallbackT, now) {
      const parts = relativeTimeParts(value, now);
      if (!parts) return "";
      if (parts.unit === "now") return t("time.now");
      return t("time.ago", { t: t("time." + parts.unit, { n: parts.n, count: parts.n }) });
    }
    function ChannelSessionRow({ sess, selected, onOpen, onChanged, skin, sessionActions, sessionById, menuOpen, onMenuChange, canDelete, onDeleteSession, flat, renderSlot, onStopArchive, hoverStatuses }) {
      const t = arguments[0].t || fallbackT;
      const menu = !!menuOpen;
      const setMenu = (next) => onMenuChange(!!next);
      const [renaming, setRenaming] = useState(false);
      const [draft, setDraft] = useState(sess.title || sess.chatId || "");
      const rowRef = useRef(null);
      const titleRef = useRef(null);
      const titleFrame = useRef({ id: 0 });
      const hoverRef = useRef(null);
      const hoverTimer = useRef(null);
      const [hoverOpen, setHoverOpen] = useState(false);
      const [hoverStyle, setHoverStyle] = useState({});
      const title = sess.title || sess.chatId;
      const native = skin !== "codex";
      const useOfficialHover = native && typeof HoverCard === "function";
      const archived = !!arguments[0].archived;
      const running = !!(sess.running || (sessionById && sessionById[sess.sessionId] && sessionById[sess.sessionId].running));
      const statuses = hoverStatuses || channelSessionHoverStatuses({ running, archived }, t);
      const primary = statuses.find((status) => status.state !== "archived");
      const showDot = !archived && primary && primary.state !== "idle";
      const trailing = primary && primary.trailing;
      const hoverTitle = (sessionById && sessionById[sess.sessionId] && (sessionById[sess.sessionId].displayTitle || sessionById[sess.sessionId].title)) || title;
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
        const card = hoverRef.current;
        const size = card ? { width: card.offsetWidth || 220, height: card.offsetHeight || 96 } : { width: 220, height: 96 };
        const update = () => {
          if (!rowRef.current) return;
          setHoverStyle(nativeSessionHoverStyle(rowRef.current.getBoundingClientRect(), {
            width: (hoverRef.current && hoverRef.current.offsetWidth) || size.width,
            height: (hoverRef.current && hoverRef.current.offsetHeight) || size.height,
          }, { width: window.innerWidth, height: window.innerHeight }));
        };
        update();
        window.addEventListener("resize", update);
        document.addEventListener("scroll", update, true);
        return () => {
          window.removeEventListener("resize", update);
          document.removeEventListener("scroll", update, true);
        };
      }, [hoverOpen, menu, title, running]);
      useEffect(() => () => {
        if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
        stopSessionTitleMarquee(titleRef.current, titleFrame.current);
      }, []);
      const rowClass = native
        ? ("ima-n-sess" + (selected ? " is-on" : "") + (menu ? " is-menu" : "") + (archived ? " is-archived" : ""))
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
          Promise.resolve(acts.renameSession(sess.sessionId, (extra && extra.title) || title)).then(afterHost).catch((error) => console.warn("[dsh-im-connect] 重命名失败", error));
          return;
        }
        if (action === "unarchive") {
          if (typeof acts.unarchiveSession === "function") {
            Promise.resolve(acts.unarchiveSession(sess.sessionId)).catch((error) => console.warn("[dsh-im-connect] 恢复失败", error));
          }
          return;
        }
        if (action === "archive") {
          const cleanupMissing = async error => {
            if (openStopArchive(error, { id: sess.sessionId, title }, onStopArchive)) return;
            console.warn("[dsh-im-connect] archive failed", error);
            try {
              const data = await api("/sessions/cleanup-missing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: sess.sessionId }) });
              if (data.ok) { syncList(data.groups); return; }
            } catch (cleanupError) { console.warn("[dsh-im-connect] cleanup failed", cleanupError); }
            window.alert(t("rail.archiveFailed"));
          };
          if (typeof acts.archiveSession === "function") {
            Promise.resolve().then(() => acts.archiveSession(sess.sessionId)).then(afterHost).catch(cleanupMissing);
          } else {
            void cleanupMissing(new Error("Host archive unavailable"));
          }
          return;
        }
        if ((action === "delete" || action === "remove") && typeof acts.deleteSession === "function") {
          Promise.resolve(acts.deleteSession(sess.sessionId)).then(() => afterHost()).catch((error) => console.warn("[dsh-im-connect] 删除失败", error));
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
        return h("div", { className: rowClass, ref: rowRef },
          h("input", {
            className: native ? "ima-n-rename" : "ima-rename",
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
      const displayTitle = String(hoverTitle || title).trim() || title;
      // 0.1.7 的 Menu 渲染 children。不请求 pin，频道会话不提供置顶。更早版本不渲染 children，仍用下面的 items。
      const menuSlotItems = hostMenuRendersChildren()
        ? ["rename", "fork", "archive", "archive-manager.delete-session"].map((only) => renderHostSlot(renderSlot, "sidebar.workspaces.session.menu.item", {
            sessionId: sess.sessionId,
            displayTitle,
          }, { hookContext: [menu, (open) => onMenuChange(!!open)], only }))
        : undefined;
      // 宿主槽位被跳过时不能留下一个空菜单，退回本地 items。
      const menuSlot = menuSlotItems && menuSlotItems.some((node) => node != null) ? menuSlotItems : undefined;
      const menuItems = menuSlot !== undefined ? [] : (archived
        ? [
            { id: "unarchive", label: t("rail.unarchive"), icon: h(IconArchiveOutline20, { size: 16 }) },
            ...(canDelete ? [{ id: "delete-session", label: t("rail.deleteSession"), icon: h(IconTrashOutline16), danger: true }] : []),
          ]
        : [
            { id: "rename", label: t("rail.rename"), icon: h(IconEditOutline16) },
            { id: "fork", label: t("rail.fork"), icon: h(IconBranchOutline16) },
            { id: "archive", label: t("rail.archive"), icon: h(IconArchiveOutline20, { size: 16 }) },
            ...(canDelete ? [{ id: "delete-session", label: t("rail.deleteSession"), icon: h(IconTrashOutline16), danger: true }] : []),
          ]);
      const row = h("div", {
        ref: rowRef,
        className: rowClass,
        role: "treeitem",
        tabIndex: 0,
        "aria-selected": selected,
        "data-n-menu-root": sess.sessionId,
        onClick: () => { setMenu(false); hideHover(); onOpen(sess.sessionId); },
        onMouseEnter: () => {
          startSessionTitleMarquee(titleRef.current, titleFrame.current);
          if (!useOfficialHover) showHover();
        },
        onMouseLeave: () => {
          stopSessionTitleMarquee(titleRef.current, titleFrame.current);
          if (!useOfficialHover) hideHover();
        },
        onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMenu(false); onOpen(sess.sessionId); } },
        onContextMenu: (e) => { e.preventDefault(); e.stopPropagation(); hideHover(); onMenuChange(true); },
      },
        native && h("span", { className: "ima-n-slot" }, showDot && typeof StateDot === "function" ? h(StateDot, { state: primary.state === "ongoing" ? "ongoing" : primary.state === "warning" ? "warning" : "done", size: 10 }) : null),
        h("span", {
          ref: native ? titleRef : undefined,
          className: native ? "ima-n-title" : "dcu-wb-session-title",
          onDoubleClick: (e) => {
            if (!sessionActions || typeof sessionActions.renameSession !== "function") return;
            e.stopPropagation();
            setRenaming(true);
          },
        }, title),
        native && h("span", { className: "ima-n-time", "aria-hidden": trailing ? true : undefined }, trailing || timeLabel(sess.updatedAt, t)),
        h("span", { className: native ? "ima-n-acts" : "dcu-wb-actions" },
          menuSlot === undefined && archived && h("button", {
            type: "button",
            className: "ima-n-restore",
            onMouseDown: (e) => e.stopPropagation(),
            onClick: (e) => { e.stopPropagation(); run("unarchive"); },
          }, t("rail.unarchive")),
          h(HostMenu, {
            open: menu,
            onClose: () => { onMenuChange(false); },
            items: menuItems,
            onSelect: (action) => {
              onMenuChange(false);
              if (action === "rename") setRenaming(true);
              if (action === "fork") run("fork");
              if (action === "archive") run("archive");
              if (action === "unarchive") run("unarchive");
              if (action === "delete-session") onDeleteSession && onDeleteSession();
            },
            portal: true,
            closeOnPointerLeave: true,
            anchor: h("button", {
              type: "button",
              className: native ? "ima-n-ico" : "dcu-wb-more",
              "data-ima-session-more": "",
              "aria-expanded": menu,
              "aria-label": t("action.more", { channel: title }),
              onMouseDown: (e) => e.stopPropagation(),
              onClick: (e) => { e.stopPropagation(); hideHover(); onMenuChange(!menu); },
            }, h(IconEllipsisOutline16, { size: 16 })),
          }, menuSlot),
          renderHostSlot(renderSlot, "sidebar.workspaces.session.row.action", { sessionId: sess.sessionId, displayTitle }, { only: "archive" }),
        ),
        !useOfficialHover && hoverOpen && !menu && native && typeof document !== "undefined" && ReactDOM.createPortal(h(SessionHoverCard, {
          title: hoverTitle,
          time: hoverTimeLabel(sess.updatedAt, t),
          running,
          statuses,
          t,
          style: hoverStyle,
          cardRef: hoverRef,
          onMouseEnter: showHover,
          onMouseLeave: hideHover,
        }), document.body),
      );
      if (useOfficialHover) {
        return h(HoverCard, {
          anchor: row,
          content: h(SessionHoverContent, { title: hoverTitle, time: hoverTimeLabel(sess.updatedAt, t), running, statuses, t }),
          openDelayMs: 800,
          disabled: menu,
          copyText: displayTitle,
          copyLabel: t("copy"),
          copiedLabel: t("hover.copied"),
        });
      }
      return row;
    }

    function ChannelGroupRow({ id, name, expanded, hasCurrentSession, menuOpen, canArchiveGroup, channelLogo = true, onToggle, onMenuChange, onChannelSettings, onArchiveGroup, t = fallbackT }) {
      const items = [
        ...(channelLogo ? [{ id: "channel-settings", label: t("rail.channelSettings"), icon: h(ChannelSettingsIcon) }] : []),
        ...(canArchiveGroup ? [
          { type: "separator", id: "archive-separator" },
          { id: "archive-group", label: t("rail.archiveGroup"), icon: h(IconArchiveOutline20, { size: 16 }), danger: true },
        ] : []),
      ];
      const rowClass = "ima-n-row" + (hasCurrentSession ? " has-current-session" : "") + (menuOpen ? " is-menu" : "");
      return h("div", {
        className: rowClass,
        role: "treeitem",
        "aria-expanded": expanded,
        "data-n-group": id,
        onClick: onToggle,
      },
        h("span", { className: "ima-n-slot ima-n-folder" }, channelLogo ? h(Logo, { id, small: true }) : h(IconFolderClose, { size: 16 })),
        h("span", { className: "ima-n-project-text" }, h("span", { className: "ima-n-title" }, name)),
        h("span", { className: "ima-n-acts" },
          h(HostMenu, {
            open: menuOpen,
            onClose: () => { onMenuChange(false); },
            items,
            onSelect: (action) => {
              onMenuChange(false);
              if (action === "channel-settings") onChannelSettings && onChannelSettings();
              if (action === "archive-group") onArchiveGroup && onArchiveGroup();
            },
            portal: true,
            closeOnPointerLeave: true,
            anchor: h("button", {
              type: "button",
              className: "ima-n-ico",
              "aria-label": t("rail.groupActions", { name }),
              onMouseDown: (e) => e.stopPropagation(),
              onClick: (e) => { e.stopPropagation(); onMenuChange(!menuOpen); },
            }, h(IconEllipsisOutline16, { size: 16 })),
          }),
        ),
      );
    }

    function ChannelRail(props) {
      if (typeof props.useSessions === "function" || typeof props.useWorkspaces === "function") return h(ChannelRailWithSessions, props);
      return h(ChannelRailView, props);
    }

    function ChannelRailWithSessions(props) {
      const selectedId = typeof props.useSessions === "function"
        ? props.useSessions((state) => currentSessionId(state))
        : (props.selectedId || null);
      const archivedIds = typeof props.useWorkspaces === "function"
        ? props.useWorkspaces((state) => (state && state.archivedSessionIds) || [])
        : (props.archivedIds || []);
      const sessionById = typeof props.useSessions === "function"
        ? props.useSessions((state) => (state && state.byId) || {})
        : {};
      const workspaceItems = typeof props.useWorkspaces === "function"
        ? props.useWorkspaces((state) => (state && state.items) || [])
        : (props.workspaceItems || []);
      const sessionStatuses = typeof props.useSessionStatus === "function"
        ? props.useSessionStatus((state) => state)
        : props.sessionStatuses;
      const projections = typeof props.useSessions === "function"
        ? props.useSessions((state) => (state && state.projectionsBySession) || {})
        : (props.projections || {});
      return h(ChannelRailView, Object.assign({}, props, {
        selectedId: selectedId || props.selectedId || null,
        archivedIds,
        sessionById,
        workspaceItems,
        sessionStatuses,
        projections,
      }));
    }

    function ChannelRailView(props) {
      const t = props.t || fallbackT;
      const [groups, setGroups] = useState([]);
      const [folded, setFolded] = useState({});
      const [error, setError] = useState("");
      const [openMenu, setOpenMenu] = useState();
      const [openGroupMenu, setOpenGroupMenu] = useState();
      const [query, setQuery] = useState("");
      const [sort, setSort] = useState("time");
      const [groupMode, setGroupMode] = useState("workspace");
      const [archiveManagerInstalled, setArchiveManagerInstalled] = useState(() => typeof document !== "undefined" && hasArchiveManagerPlugin(document));
      const [deleteTarget, setDeleteTarget] = useState();
      const [deleteBusy, setDeleteBusy] = useState(false);
      const [deleteError, setDeleteError] = useState();
      const [archiveGroupTarget, setArchiveGroupTarget] = useState();
      const [archiveGroupBusy, setArchiveGroupBusy] = useState(false);
      const [archiveGroupError, setArchiveGroupError] = useState();
      const [archivedFilter, setArchivedFilter] = useState("default");
      const [stopArchiveTarget, setStopArchiveTarget] = useState();
      const [stopArchiveBusy, setStopArchiveBusy] = useState(false);
      const [stopArchiveError, setStopArchiveError] = useState();
      const selectedId = props.selectedId;
      const archived = new Set(props.archivedIds || []);
      const skin = props.skin || channelSkin;
      const native = skin !== "codex";
      const open = (id) => openListedSession(resolveHostSessionId(id, props.sessionById), props.openSession || props.open);
      const canDelete = canDeleteChannelSession(archiveManagerInstalled, props.deleteSession);
      const canArchiveGroup = canArchiveChannelGroup(archiveManagerInstalled, props.archiveSession);
      useEffect(() => {
        ensureStyle();
        return channelRefresh.subscribe((data, error) => {
          if (error) { setError(t("error.connection")); return; }
          if (data.ok) { setGroups(data.groups || []); setError(""); }
          else setError(serverText(data.error, t) || t("error.load"));
        });
      }, []);
      useEffect(() => {
        if (typeof document === "undefined" || typeof MutationObserver === "undefined") return undefined;
        const refresh = () => { setArchiveManagerInstalled(hasArchiveManagerPlugin(document)); };
        refresh();
        const observer = new MutationObserver(refresh);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        return () => observer.disconnect();
      }, []);
      const confirmDelete = () => {
        if (!deleteTarget || typeof props.deleteSession !== "function" || deleteBusy) return;
        const target = deleteTarget;
        setDeleteBusy(true);
        setDeleteError(undefined);
        Promise.resolve(props.deleteSession(target.id))
          .then(() => api("/sessions/remove", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: target.id }),
          }).then((data) => { if (data.ok && data.groups) setGroups(data.groups); }).catch(() => undefined))
          .then(() => { setDeleteTarget(undefined); })
          .catch((caught) => { setDeleteError(caught instanceof Error ? caught.message : t("error.action")); })
          .finally(() => { setDeleteBusy(false); });
      };
      const confirmArchiveGroup = () => {
        if (!archiveGroupTarget || typeof props.archiveSession !== "function" || archiveGroupBusy) return;
        const target = archiveGroupTarget;
        setArchiveGroupBusy(true);
        setArchiveGroupError(undefined);
        archiveChannelGroup(target.sessionIds, props.archiveSession)
          .then(() => channelRefresh.invalidate().catch(() => undefined))
          .then(() => { setArchiveGroupTarget(undefined); })
          .catch((caught) => {
            if (openStopArchive(caught, { id: target.id, title: target.name, sessionIds: target.sessionIds, group: true }, (next) => {
              setArchiveGroupTarget(undefined);
              setStopArchiveError(undefined);
              setStopArchiveTarget(next);
            })) return;
            setArchiveGroupError(caught instanceof Error ? caught.message : t("error.action"));
          })
          .finally(() => { setArchiveGroupBusy(false); });
      };
      const confirmStopArchive = () => {
        if (!stopArchiveTarget || typeof props.archiveSession !== "function" || stopArchiveBusy) return;
        const target = stopArchiveTarget;
        setStopArchiveBusy(true);
        setStopArchiveError(undefined);
        const work = finishStopArchive(target, props.archiveSession).then((kind) => {
          if (kind === "group") return channelRefresh.invalidate().catch(() => undefined);
          if (kind !== "session") return;
          return api("/sessions/remove", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: target.id }),
          }).then((data) => { if (data.ok && data.groups) setGroups(data.groups); }).catch(() => undefined);
        });
        work
          .then(() => { setStopArchiveTarget(undefined); })
          .catch((caught) => { setStopArchiveError(caught instanceof Error ? caught.message : t("error.action")); })
          .finally(() => { setStopArchiveBusy(false); });
      };
      const needle = query.trim().toLowerCase();
      const visibleGroups = groups.map((g) => {
        const sessions = (g.sessions || []).map((sess) => {
          const host = props.sessionById && props.sessionById[sess.sessionId];
          // 手动标题及来源未知的旧名称，交给后端可靠标题事件同步。
          if (sess.titleSource === "user" || (!sess.titleSource && typeof sess.title === "string" && sess.title.trim())) return sess;
          return host && typeof host.title === "string" && host.title.trim()
            ? Object.assign({}, sess, { title: host.title }) : sess;
        }).filter((sess) => channelSessionVisible(sess.sessionId, archived, archivedFilter)).map((sess) => Object.assign({}, sess, { channelId: g.id }));
        if (!needle) return Object.assign({}, g, { sessions });
        const nameHit = String(channelLabel(g, t)).toLowerCase().includes(needle);
        return Object.assign({}, g, { sessions: nameHit ? sessions : sessions.filter((sess) => String(sess.title || sess.chatId || "").toLowerCase().includes(needle)) });
      }).filter((g) => (g.sessions || []).length > 0);
      if (groupMode === "workspace-tree") {
        const flat = visibleGroups.flatMap((g) => g.sessions || []);
        visibleGroups.splice(0, visibleGroups.length, ...groupChannelSessionsByWorkspaceTree(flat, props.workspaceItems || [], t("rail.ungrouped")));
      } else if (sort === "time") {
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
        h(ChannelWorkspaceHead, { query, sort, groupMode, archivedFilter, onQuery: setQuery, onSort: setSort, onGroupMode: setGroupMode, onArchivedFilterChange: setArchivedFilter, t }),
        h("div", { className: native ? "ima-n-list-area" : "dcu-wb-list-area" },
        h("div", { className: native ? "ima-native-tree" : "dcu-wb-tree", role: "tree" },
          error && h("div", { className: native ? "ima-native-empty" : "dcu-wb-empty" }, error),
          !error && visibleGroups.length === 0 && h("div", { className: native ? "ima-native-empty" : "dcu-wb-empty" }, t("rail.empty")),
          ...visibleGroups.map((g) => {
            const visible = g.sessions || [];
            const expanded = !folded[g.id];
            const hasCurrentSession = typeof selectedId === "string" && visible.some((sess) => isCurrentListedSession(selectedId, sess.sessionId, props.sessionById));
            const depth = g.depth || 0;
            const channelLogo = groupMode !== "workspace-tree" || !!g.channelId;
            const groupStyle = depth > 0 ? { "--dsh-workspace-indent": (depth * 12) + "px" } : undefined;
            return h("div", { key: g.id || "ungrouped", className: native ? "ima-native-project" : "dcu-wb-project", style: groupStyle },
            groupMode !== "list" && (g.keep || visible.length > 0) && (native
              ? h(ChannelGroupRow, {
                  id: g.channelId || g.id,
                  channelLogo,
                  name: channelLabel(g, t),
                  expanded,
                  hasCurrentSession,
                  menuOpen: openGroupMenu === g.id,
                  canArchiveGroup,
                  onToggle: () => setFolded({ ...folded, [g.id]: !folded[g.id] }),
                  onMenuChange: (next) => {
                    setOpenMenu(undefined);
                    setOpenGroupMenu(next ? g.id : undefined);
                  },
                  onChannelSettings: () => {
                    const channelId = g.channelId || g.id;
                    if (typeof props.openChannelSettings === "function") props.openChannelSettings({ channelId, name: channelLabel({ id: channelId, label: g.label }, t) });
                  },
                  onArchiveGroup: () => {
                    setArchiveGroupError(undefined);
                    setArchiveGroupTarget({
                      id: g.id,
                      name: channelLabel(g, t),
                      sessionIds: visible.map((sess) => sess.sessionId),
                    });
                  },
                  t,
                })
              : h("button", {
                  className: "dcu-wb-project-head",
                  type: "button",
                  role: "treeitem",
                  "aria-expanded": expanded,
                  onClick: () => setFolded({ ...folded, [g.id]: !folded[g.id] }),
                },
                  h("span", { className: "dcu-wb-folder" }, h(Logo, { id: g.id, small: true })),
                  h("span", { className: "dcu-wb-project-title" }, channelLabel(g, t)),
                )
            ),
            (groupMode === "list" || !folded[g.id]) && visible.length > 0 && visible.map((sess) => h(ChannelSessionRow, {
                key: sess.sessionId,
                sess,
                flat: groupMode === "list",
                selected: isCurrentListedSession(selectedId, sess.sessionId, props.sessionById),
                sessionById: props.sessionById,
                menuOpen: openMenu === sess.sessionId,
                onMenuChange: (next) => {
                  setOpenGroupMenu(undefined);
                  setOpenMenu(next ? sess.sessionId : undefined);
                },
                onOpen: (id) => { setOpenMenu(undefined); open(id); },
                onChanged: (next) => setGroups(next),
                canDelete,
                onDeleteSession: () => {
                  setDeleteError(undefined);
                  setDeleteTarget({
                    id: sess.sessionId,
                    title: String((props.sessionById && props.sessionById[sess.sessionId] && (props.sessionById[sess.sessionId].displayTitle || props.sessionById[sess.sessionId].title)) || sess.title || sess.chatId || sess.sessionId),
                  });
                },
                archived: archived.has(sess.sessionId),
                hoverStatuses: channelSessionHoverStatuses({
                  running: !!(sess.running || (props.sessionById && props.sessionById[sess.sessionId] && props.sessionById[sess.sessionId].running) || (props.sessionStatuses && props.sessionStatuses.get && props.sessionStatuses.get(sess.sessionId) && props.sessionStatuses.get(sess.sessionId).running)),
                  archived: archived.has(sess.sessionId),
                  completed: !!(props.sessionStatuses && props.sessionStatuses.get && props.sessionStatuses.get(sess.sessionId) && props.sessionStatuses.get(sess.sessionId).completionUnread),
                  pendingKind: props.sessionStatuses && props.sessionStatuses.get && props.sessionStatuses.get(sess.sessionId) && props.sessionStatuses.get(sess.sessionId).pendingInteraction && props.sessionStatuses.get(sess.sessionId).pendingInteraction.kind,
                  runningSubagentCount: (((props.projections && props.projections[sess.sessionId] && props.projections[sess.sessionId].values && props.projections[sess.sessionId].values.subagentCatalog) || []).filter((child) => child && child.id && props.sessionStatuses && props.sessionStatuses.get && props.sessionStatuses.get(child.id) && props.sessionStatuses.get(child.id).running)).length,
                }, t),
                onStopArchive: (target) => { setStopArchiveError(undefined); setStopArchiveTarget(target); },
                renderSlot: props.renderSlot,
                skin,
                sessionActions: {
                  renameSession: props.renameSession,
                  archiveSession: props.archiveSession,
                  unarchiveSession: props.unarchiveSession,
                  deleteSession: props.deleteSession,
                  forkSession: props.forkSession,
                  openPath: props.openPath,
                },
                t,
              })),
          );
          }),
        ),
        ),
        h(HostModal, {
          open: !!archiveGroupTarget,
          onClose: () => { if (!archiveGroupBusy) { setArchiveGroupTarget(undefined); setArchiveGroupError(undefined); } },
          closeLabel: t("rail.archiveGroupClose"),
          title: t("rail.archiveGroup"),
          footer: h("div", { className: "ima-n-dialog-actions" },
            h(HostButton, { variant: "outline", disabled: archiveGroupBusy, onClick: () => { setArchiveGroupTarget(undefined); setArchiveGroupError(undefined); } }, t("rail.archiveGroupCancel")),
            h(HostButton, { variant: "outline", className: "ima-n-danger-button", disabled: archiveGroupBusy, onClick: confirmArchiveGroup }, t("rail.archiveGroupConfirm")),
          ),
        },
          h("p", { className: "ima-n-dialog-copy" }, archiveGroupTarget ? t("rail.archiveGroupDescription", { name: archiveGroupTarget.name, count: archiveGroupTarget.sessionIds.length }) : ""),
          archiveGroupBusy && h("div", { className: "ima-n-dialog-status", role: "status" }, t("rail.archiveGroupPending")),
          archiveGroupError && h("div", { className: "ima-n-dialog-error", role: "alert" }, t("rail.archiveGroupFailed", { message: archiveGroupError })),
        ),
        h(HostModal, {
          open: !!stopArchiveTarget,
          onClose: () => { if (!stopArchiveBusy) { setStopArchiveTarget(undefined); setStopArchiveError(undefined); } },
          closeLabel: t("action.cancel"),
          title: t("rail.stopArchive"),
          footer: h("div", { className: "ima-n-dialog-actions" },
            h(HostButton, { variant: "outline", disabled: stopArchiveBusy, onClick: () => { setStopArchiveTarget(undefined); setStopArchiveError(undefined); } }, t("action.cancel")),
            h(HostButton, { variant: "outline", className: "ima-n-danger-button", disabled: stopArchiveBusy, onClick: confirmStopArchive }, t("rail.stopArchiveConfirm")),
          ),
        },
          h("p", { className: "ima-n-dialog-copy" }, stopArchiveTarget ? t(stopArchiveTarget.group ? "rail.stopArchiveGroupDescription" : "rail.stopArchiveDescription", { name: stopArchiveTarget.title }) : ""),
          stopArchiveBusy && h("div", { className: "ima-n-dialog-status", role: "status" }, t("rail.stopArchivePending")),
          stopArchiveError && h("div", { className: "ima-n-dialog-error", role: "alert" }, t("rail.archiveFailed")),
        ),
        h(HostModal, {
          open: !!deleteTarget,
          onClose: () => { if (!deleteBusy) { setDeleteTarget(undefined); setDeleteError(undefined); } },
          closeLabel: t("rail.deleteSessionClose"),
          title: t("rail.deleteSession"),
          footer: h("div", { className: "ima-n-dialog-actions" },
            h(HostButton, { variant: "outline", disabled: deleteBusy, onClick: () => { setDeleteTarget(undefined); setDeleteError(undefined); } }, t("rail.deleteSessionCancel")),
            h(HostButton, { variant: "outline", className: "ima-n-danger-button", disabled: deleteBusy, onClick: confirmDelete }, t("rail.deleteSessionConfirm")),
          ),
        },
          h("p", { className: "ima-n-dialog-copy" }, deleteTarget ? t("rail.deleteSessionDescription", { name: deleteTarget.title }) : ""),
          deleteBusy && h("div", { className: "ima-n-dialog-status", role: "status" }, t("rail.deleteSessionPending")),
          deleteError && h("div", { className: "ima-n-dialog-error", role: "alert" }, t("rail.deleteSessionFailed", { message: deleteError })),
        ),
      );
    }

    function isTaskSessionItem(item) {
      if (!item) return false;
      if (item.blank) return false;
      if (item.origin === "im" || item.origin === "subagent") return false;
      return !isChannelSession(item.id || "");
    }

    function TaskList(props) {
      if (typeof props.useSessions === "function") return h(TaskListWithSessions, props);
      return h(TaskListView, { groups: [], current: null, openSession: props.openSession, t: props.t });
    }

    function TaskListWithSessions(props) {
      useSyncExternalStore(subscribeChannelMembership, channelMembershipSnapshot, channelMembershipSnapshot);
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
      return h(TaskListView, { groups, current: currentSessionId(snap), openSession: props.openSession, t });
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
        if (hit && hit.revision === channelMembershipRevision && hit[key]) return hit[key];
      }
      const ids = (src.ids || []).filter((id) => isChannelSession(id) === keepIm);
      const result = cacheFilteredSessions(src, ids);
      if (src && typeof src === "object") {
        const previous = imSessionFilterCache.get(src);
        const bucket = previous && previous.revision === channelMembershipRevision ? previous : { revision: channelMembershipRevision };
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
          return () => {
            // 同名页签可能已被其他注册替换，旧清理函数只能移除自己持有的项。
            if (tabs.get(tab.id) !== tab) return;
            tabs.delete(tab.id); rebuild(); emit();
          };
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
      const membershipRevision = useSyncExternalStore(subscribeChannelMembership, channelMembershipSnapshot, channelMembershipSnapshot);
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
      const sessionSnap = typeof rawUseSessions === "function"
        ? rawUseSessions((state) => state)
        : undefined;
      const currentId = typeof rawUseSessions === "function"
        ? rawUseSessions((state) => currentSessionId(state))
        : (props.selectedId || null);
      const sessionById = (sessionSnap && sessionSnap.byId) || {};
      const useTaskSessions = useCallback((selector, eq) => {
        if (typeof rawUseSessions !== "function") return selector({ ids: [], byId: {}, current: null });
        return rawUseSessions((state) => selector(applyRegistryFilters(filterTaskSessions(state), nativeTabs)), eq);
      }, [rawUseSessions, nativeTabs, membershipRevision]);
      const useChannelSessions = useCallback((selector, eq) => {
        if (typeof rawUseSessions !== "function") return selector({ ids: [], byId: {}, current: null });
        return rawUseSessions((state) => selector(filterChannelSessions(state)), eq);
      }, [rawUseSessions, membershipRevision]);
      useEffect(() => { ensureStyle(); }, []);
      useEffect(() => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ } }, [tab]);
      useEffect(() => {
        const onClick = (event) => {
          const target = event.target && event.target.closest ? event.target.closest("button") : null;
          if (!target) return;
          const label = (target.innerText || "") + " " + (target.getAttribute("aria-label") || "");
          if (isHostNewSessionControl(label)) setTab("tasks");
        };
        document.addEventListener("click", onClick, true);
        return () => document.removeEventListener("click", onClick, true);
      }, []);
      const previousCurrentId = useRef(currentId);
      const tabFollowReady = useRef(false);
      useEffect(() => {
        const followed = followSidebarTab(
          { ready: tabFollowReady.current, previousId: previousCurrentId.current },
          currentId,
          extraTabs,
        );
        tabFollowReady.current = followed.ready;
        previousCurrentId.current = followed.previousId;
        if (followed.tab) setTab(followed.tab);
      }, [currentId, extraTabs, membershipRevision]);
      const openSession = (id) => {
        openListedSession(resolveHostSessionId(id, sessionById), props.openSession || props.open);
      };
      const officialProps = Object.assign({}, props, { useSessions: useTaskSessions, t: officialT, openSession, open: openSession });
      const channelRail = h(ChannelRail, {
        openSession,
        open: openSession,
        useSessions: rawUseSessions,
        useWorkspaces: props.useWorkspaces,
        useSessionStatus: props.useSessionStatus,
        selectedId: currentId || props.selectedId || null,
        skin: "native",
        renameSession: props.renameSession,
        archiveSession: props.archiveSession,
        unarchiveSession: props.unarchiveSession,
        deleteSession: props.deleteSession,
        forkSession: props.forkSession,
        openPath: props.openPath,
        openChannelSettings: props.openChannelSettings,
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

    /**
     * 侧栏包装兜底（Issue #13）。插件是用自己的一层替换宿主 sidebar.workspaces 的官方会话列表组件的：
     * 这层只要渲染失败，宿主的槽位错误边界就给这块画一个空的 crash div ——「左侧会话记录不显示」。
     * 这里接住错误，直接回落到宿主原本的官方组件（用宿主自己传进来的 props），
     * 宁可少一个频道页签，也不能让会话列表整个消失。
     */
    class ImSidebarFallbackBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }
      static getDerivedStateFromError() {
        return { failed: true };
      }
      componentDidCatch(error) {
        console.warn("[dsh-im-connect] 侧栏包装渲染失败，已回落到宿主原生会话列表", error);
      }
      render() {
        if (this.state.failed) {
          const Official = this.props.officialTree;
          return Official ? h(Official, this.props.hostProps) : null;
        }
        return this.props.children;
      }
    }

    function pickOfficialWorkspaces(ctx) {
      const read = ctx.slots.entriesOfSlot || ctx.slots.entries;
      const entries = (read && read.call(ctx.slots, "sidebar.workspaces")) || [];
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
      ctx.effect(() => {
        return channelRefresh.subscribe((data, error) => {
          if (error) console.warn("[dsh-im-connect] 无法刷新渠道会话归属", error);
        });
      }, "im-connect: channel membership");
      ctx.effect(() => ctx.locale.register(IM_LOCALE_NS, IM_LOCALES), "im-connect: dictionaries");
      const t = ctx.locale.bind(IM_LOCALE_NS);
      ctx.effect(() => observePluginUpdate({
        endpoint: "/api/michengai/dsh-im-connect/update",
        packageName: "@michengai/dsh-im-connect",
        titleRowSelector: ".ima-title-row",
        linksSelector: ".ima-title-links",
        zhName: t("settings.title"),
        enName: t("settings.title"),
        createIcon: createPluginUpdateIcon,
      }), "im-connect: plugin update ui");
      const permissionT = ctx.locale.bind("permission.access");
      const modelT = ctx.locale.bind("model");
      const presetT = ctx.locale.bind("settings.agentPreset");
      const subscribeLocale = (listener) => ctx.locale.subscribe(listener);
      const localeSnapshot = () => ctx.locale.getSnapshot();
      const openChannelSettings = (request) => {
        const next = parseChannelSettingsRequest(request);
        if (!next) return;
        requestChannelSettings(next);
        openSettingsSection(
          [t("settings.label"), IM_LOCALES.en["settings.label"], IM_LOCALES.zh["settings.label"]],
          () => { requestChannelSettings(next); },
        );
      };
      function LocalizedChannelRail(props) {
        useSyncExternalStore(subscribeLocale, localeSnapshot, localeSnapshot);
        return h(AntdProvider, null, h(ChannelRail, Object.assign({}, props, { t, openChannelSettings })));
      }
      function LocalizedSessionSwitcher(props) {
        useSyncExternalStore(subscribeLocale, localeSnapshot, localeSnapshot);
        return h(AntdProvider, null, h(SessionSwitcher, Object.assign({}, props, { t, officialT: props.t, openChannelSettings })));
      }
      function LocalizedSettingsPage(props) {
        useSyncExternalStore(subscribeLocale, localeSnapshot, localeSnapshot);
        return h(AntdProvider, null, h(SettingsPage, Object.assign({}, props, { t, permissionT, modelT, presetT, readMainSessionModel: () => readMainSessionModel(ctx) })));
      }
      openImSession = (id) => {
        try {
          if (window.__dshSessionsOpen) { window.__dshSessionsOpen(id); return true; }
        } catch { /* ignore */ }
        try { return openHostSession(ctx, id); }
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
          pickDirectory: () => pickHostDirectory(ctx),
          permissionT,
          modelT,
          presetT,
        }),
      }, LocalizedSettingsPage));

      ctx.slots.inject("sidebar.channels", () => ctx.slots.register({
          name: "sidebar.channels",
          id: "im-connect-channels",
          locale: IM_LOCALE_NS,
        inject: () => ({
          openSession: (id) => { openHostSession(ctx, id); },
          open: (id) => { openHostSession(ctx, id); },
          archiveSession: (id, options) => archiveHostSession(ctx, id, options),
          unarchiveSession: (id) => unarchiveHostSession(ctx, id),
          forkSession: (id) => forkHostSession(ctx, id),
          renameSession: (sessionId, title) => renameHostSession(ctx, sessionId, title),
        }),
        }, LocalizedChannelRail));

      // 只包一层官方任务树，绝不在通知回调里再 register，否则会把启动卡在 Loading plugins。
      ctx.slots.inject("sidebar.workspaces", () => {
        let wrappedEntry = null;
        let originalComp = null;
        let ownedWrapper = null;
        let ownedRegistry = null;
        let removeInsertedTab = () => {};
        let stopInsertedTabLocale = () => {};
        let insertedTabRegistry = null;
        let syncing = false;
        // 与定时插件共享通知，补足直接替换 component 不触发宿主插槽通知的情况。
        const notifyPeers = () => { queueMicrotask(() => window.dispatchEvent(new Event("dsh-native-sidebar-change"))); };
        const clearInsertedTab = () => {
          stopInsertedTabLocale();
          stopInsertedTabLocale = () => {};
          removeInsertedTab();
          removeInsertedTab = () => {};
          insertedTabRegistry = null;
        };
        const unwrap = () => {
          clearInsertedTab();
          if (wrappedEntry) {
            if (originalComp && wrappedEntry.component === ownedWrapper) wrappedEntry.component = originalComp;
            if (wrappedEntry.__dshNativeTabs === ownedRegistry) delete wrappedEntry.__dshNativeTabs;
            notifyPeers();
          }
          wrappedEntry = null;
          originalComp = null;
          ownedWrapper = null;
          ownedRegistry = null;
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
              matchSession: isChannelSession,
              render: (props) => h(ImSidebarFallbackBoundary, { officialTree: null, hostProps: props }, h(LocalizedChannelRail, Object.assign({}, props, {
                skin: "native",
                archiveSession: props.archiveSession || ((id, options) => archiveHostSession(ctx, id, options)),
                unarchiveSession: props.unarchiveSession || ((id) => unarchiveHostSession(ctx, id)),
              }))),
            });
          };
          refreshInsertedTab();
          const stopLocale = subscribeLocale(refreshInsertedTab);
          const stopMembership = subscribeChannelMembership(refreshInsertedTab);
          stopInsertedTabLocale = () => { stopLocale(); stopMembership(); };
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
            const read = ctx.slots.entriesOfSlot || ctx.slots.entries;
            const entries = (read && read.call(ctx.slots, "sidebar.workspaces")) || [];
            const occupant = entries.find((item) => item && item.component);
            if (wrappedEntry && (occupant !== wrappedEntry || occupant.component !== ownedWrapper)) unwrap();
            if (!occupant) { clearInsertedTab(); return; }
            if (occupant && (occupant.component.__dshNativeTabHost || occupant.component.__dshAutomationWrapped || findNativeTabRegistry(occupant))) {
              insertChannelTab(occupant);
              return;
            }
            const official = pickOfficialWorkspaces(ctx);
            if (!official || official.component.__imConnectWrapped || official.component.__dshNativeTabHost) return;
            originalComp = official.component;
            const registry = createNativeTabRegistry(originalComp);
            ownedRegistry = registry;
            const tree = originalComp;
            attachNativeTabRegistry(official, registry);
            function ImNativeWorkspaceShell(innerProps) {
              return h(ImSidebarFallbackBoundary, { officialTree: tree, hostProps: innerProps },
                h(LocalizedSessionSwitcher, Object.assign({}, innerProps, { officialTree: tree, nativeTabs: registry })));
            }
            ImNativeWorkspaceShell.displayName = "ImNativeWorkspaceShell";
            ImNativeWorkspaceShell.__imConnectWrapped = true;
            ImNativeWorkspaceShell.__imConnectOriginal = originalComp;
            ImNativeWorkspaceShell.__dshNativeTabHost = true;
            attachNativeTabRegistry(ImNativeWorkspaceShell, registry);
            official.component = ImNativeWorkspaceShell;
            ownedWrapper = ImNativeWorkspaceShell;
            wrappedEntry = official;
            notifyPeers();
          } catch (error) {
            console.warn("[dsh-im-connect] 包裹官方任务树失败", error);
          } finally {
            syncing = false;
          }
        };
        sync();
        const unsub = typeof ctx.slots.subscribe === "function" ? ctx.slots.subscribe("sidebar.workspaces", sync) : () => {};
        const unsubSidebar = typeof ctx.slots.subscribe === "function" ? ctx.slots.subscribe("sidebar", sync) : () => {};
        window.addEventListener("dsh-native-sidebar-change", sync);
        // 其他插件直接替换 component/注册表时不一定触发槽位通知，短暂重试兼容加载顺序。
        let retries = 0;
        const retryTimer = window.setInterval(() => {
          sync();
          if (insertedTabRegistry || ++retries >= 20) window.clearInterval(retryTimer);
        }, 250);
        return () => { window.clearInterval(retryTimer); unsub(); unsubSidebar(); window.removeEventListener("dsh-native-sidebar-change", sync); unwrap(); };
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
