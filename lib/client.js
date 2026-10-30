window.__ModuleLoader__.load({ id: "@michengai/dsh-im-connect", factory: (require) => {
/**
 * API 基址解析：把插件自己的根绝对路径端点解析到页面实际所在的 base 之下。
 *
 * 为什么需要：DSH 可能被挂在带路径前缀的反向代理后面（例如 https://host/app/dsh/，
 * 网关转发前剥掉前缀）。此时浏览器把根绝对路径 "/api/..." 解析到站点根，前缀丢失，
 * 网关返回自己的 HTML 404，面板就报「服务端返回非 JSON 响应（HTTP 404）」。
 *
 * 为什么这么解析：宿主前端同样以页面 base 解析 API 路径（参见 dsh-client-connection 的
 * openConnectionWebSocket 与 dsh-client-file-upload 的 new URL(path, document.baseURI)），
 * 这里沿用同一约定——先去掉前导 "/"，再用 new URL 相对解析；若直接 new URL("/api/x", base)
 * 会丢弃 base 的路径段，前缀就没了。
 */
/** 页面基准地址；末尾补斜杠，避免 /app/dsh 这类无斜杠页面把前缀解析掉一级。 */
function pageBaseHref() {
    const doc = globalThis.document;
    if (typeof doc === 'undefined' || doc === null)
        return undefined;
    const raw = doc.baseURI;
    if (typeof raw !== 'string' || raw === '')
        return undefined;
    try {
        const url = new URL(raw);
        if (!url.pathname.endsWith('/'))
            url.pathname += '/';
        return url.href;
    }
    catch {
        return undefined;
    }
}
/**
 * 解析插件端点 URL。
 *
 * @param path 端点路径，通常是 "/api/michengai/dsh-im-connect/xxx" 这类根绝对路径。
 * @returns 基于页面 base 的绝对 URL；相对路径、完整 URL、协议相对 URL、无 document
 *          或 base 非法时原样返回，保证非浏览器环境与测试夹具行为不变。
 */
function resolveApiUrl(path) {
    if (typeof path !== 'string' || path.charAt(0) !== '/' || path.charAt(1) === '/')
        return path;
    const base = pageBaseHref();
    if (base === undefined)
        return path;
    try {
        return new URL(path.slice(1), base).href;
    }
    catch {
        return path;
    }
}



const UPDATE_HEADER = "x-michengai-plugin-update";
const STYLE_ID = "michengai-plugin-update-ui";
const updatePrimitives = (typeof require === "function" ? (function () { try { return require("@deepseek-ai/dsh-client-ui-primitives"); } catch { return {}; } })() : {});
const UpdatePrimitiveButton = (typeof updatePrimitives.Button === "function" || (updatePrimitives.Button && typeof updatePrimitives.Button === "object" && typeof updatePrimitives.Button.render === "function")) ? updatePrimitives.Button : function FallbackButton(props) {
  const iconNode = props && props.icon ? React.createElement("span", { key: "icon", className: "ima-btn-icon", style: { display: "inline-flex", alignItems: "center" } }, props.icon) : null;
  const content = iconNode ? [iconNode, props && props.children] : (props && props.children);
  const classes = ["ima-btn", "ima-link-btn", props && props.className].filter(Boolean).join(" ");
  return React.createElement("button", Object.assign({}, props, { type: "button", className: classes, icon: undefined }), content);
};
function Progress() {
  return React.createElement("div", { className: "mpi-progress", role: "progressbar", "aria-busy": "true" },
    React.createElement("div", { className: "mpi-progress-bar" })
  );
}
const PLUGIN_UPDATE_CSS = `
.mpi-version{margin-left:8px;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-family:inherit;font-size:12px;font-weight:500;line-height:18px;letter-spacing:0;white-space:nowrap;vertical-align:baseline}.mpi-check-host{display:inline-flex;align-items:center}.mpi-icon{display:inline-flex;flex:0 0 auto;width:16px;height:16px;align-items:center;justify-content:center;pointer-events:none}.mpi-icon svg{display:block;width:16px;height:16px}
.mpi-intro{margin:0 0 16px;color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:13px;line-height:20px}.mpi-meta{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px 18px;margin:0 0 16px;font-size:12px;line-height:18px}.mpi-meta dt{color:var(--dsw-alias-label-secondary,#b9b9b9)}.mpi-meta dd{margin:0}.mpi-mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.mpi-latest{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px}.mpi-status{font-size:13px;font-weight:600;line-height:18px}.mpi-status[data-kind=error]{color:var(--dsw-alias-state-error-primary,#ef7272)}.mpi-status[data-kind=success]{color:var(--dsw-alias-state-success-primary,#51b976)}.mpi-status[data-kind=update]{color:#e8b15a !important}.mpi-manual{border-top:0.5px solid var(--dsw-alias-border-l2,#494949);padding-top:16px}.mpi-manual h3{margin:0 0 6px;font-size:14px;line-height:20px}.mpi-manual p{margin:0 0 10px;color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:12px;line-height:18px}.mpi-command{display:flex;align-items:flex-start;gap:8px;border:0.5px solid var(--dsw-alias-border-l2,#494949);border-radius:var(--dsw-radius-lg,16px);padding:10px;background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-interactive-bg-hover,transparent))}.mpi-command code{min-width:0;flex:1;overflow:visible;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere}
.mpi-progress{height:4px;border-radius:2px;background:var(--dsw-alias-border-l1,#3a3a3a);overflow:hidden;margin:12px 0;position:relative}
.mpi-progress-bar{height:100%;width:40%;background:var(--dsw-alias-button-primary-fill,#4176e6);border-radius:2px;animation:mpi-progress 1.4s ease-in-out infinite}
@keyframes mpi-progress{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
@media (prefers-reduced-motion:reduce){.mpi-progress-bar{animation:none;width:100%;opacity:.6}}
@media(max-width:560px){.mpi-meta{grid-template-columns:1fr;gap:2px}.mpi-meta dd{margin-bottom:6px}}
`;
const ZH = {
  check: "检查更新",
  update: "更新",
  close: "关闭",
  recheck: "重新检查",
  auto: "自动更新",
  updating: "正在更新…",
  copy: "复制命令",
  copied: "已复制",
  copyFailed: "复制失败",
  checking: "正在检查更新…",
  latest: "已是最新版本",
  found: "发现新版本",
  failed: "检查更新失败，请稍后重试。",
  current: "运行版本",
  latestLabel: "最新版本",
  profile: "目标 profile",
  unknown: "未知",
  manual: "手工更新",
  manualHint: "自动更新失败时，可在当前 DSH 终端执行以下命令，完成后重启 DSH Web。",
  manualHintDesktop: "自动更新失败时，请先完全退出 DSH Desktop，再用 Desktop 自带的 dsh 执行以下命令。普通 dsh 会拒绝 desktop profile。",
  intro: "仅检查并更新当前插件，不会联动安装其他插件。",
  restart: "更新完成，请重启 DSH Web。",
  restartDesktop: "更新完成，请完全退出并重新打开 DSH Desktop。",
  restarting: "更新完成，正在重启 DSH Desktop…",
  unavailable: "当前环境不支持自动更新，请使用手工更新命令。",
};
const EN = {
  check: "Check for updates",
  update: "Update",
  close: "Close",
  recheck: "Check again",
  auto: "Update automatically",
  updating: "Updating…",
  copy: "Copy command",
  copied: "Copied",
  copyFailed: "Copy failed",
  checking: "Checking for updates…",
  latest: "You are up to date",
  found: "New version available",
  failed: "Could not check for updates. Try again later.",
  current: "Running version",
  latestLabel: "Latest version",
  profile: "Target profile",
  unknown: "Unknown",
  manual: "Manual update",
  manualHint: "If automatic update fails, run this command in the current DSH terminal, then restart DSH Web.",
  manualHintDesktop: "If automatic update fails, fully quit DSH Desktop, then run this command with Desktop's own dsh. A regular dsh rejects the desktop profile.",
  intro: "Only this plugin is checked and updated. Other plugins are not changed.",
  restart: "Update complete. Restart DSH Web.",
  restartDesktop: "Update complete. Fully quit and reopen DSH Desktop.",
  restarting: "Update complete. Restarting DSH Desktop…",
  unavailable: "Automatic update is unavailable. Use the manual command.",
};
function pluginUpdateCopy(lang) {
  return String(lang || "").toLowerCase().startsWith("en") ? EN : ZH;
}
function describePluginUpdate(lang, payload, phase, notice) {
  const base = pluginUpdateCopy(lang);
  const desktop = payload?.profileName === "desktop" || payload?.restartDesktop === true;
  const copy = desktop ? { ...base, manualHint: base.manualHintDesktop } : base;
  const busy = phase !== "idle";
  let message = copy.checking;
  let kind = "";
  if (phase === "checking") message = copy.checking;
  else if (phase === "updating") message = copy.updating;
  else if (notice.type === "error") { message = notice.message || copy.failed; kind = "error"; }
  else if (notice.type === "restart") { message = desktop ? copy.restartDesktop : copy.restart; kind = "success"; }
  else if (notice.type === "restarting") { message = copy.restarting; kind = "success"; }
  else if (payload === undefined) message = copy.checking;
  else if (payload.latestCheckFailed) { message = copy.failed; kind = "error"; }
  else if (!payload.canAutoUpdate && payload.updateAvailable) { message = copy.unavailable; kind = "update"; }
  else if (payload.updateAvailable) { message = `${copy.found}: v${payload.latestVersion ?? copy.unknown}`; kind = "update"; }
  else { message = copy.latest; kind = "success"; }
  return {
    copy, busy, message, kind, loading: phase === "updating",
    updateLabel: phase === "updating" ? copy.updating : copy.auto,
    disabled: busy || payload?.canAutoUpdate !== true || payload.updateAvailable !== true,
    currentVersion: payload === undefined ? copy.unknown : `v${payload.currentVersion}`,
    latestVersion: payload?.latestVersion === undefined ? copy.unknown : `v${payload.latestVersion}`,
    profileName: payload?.profileName ?? copy.unknown,
    profileRaw: payload?.profileName ?? "",
    latestRaw: payload?.latestVersion ?? "latest",
  };
}
function createUpdateFlow(request, initial, onPayload) {
  let phase = "idle";
  let current = initial;
  let notice = { type: "status" };
  const listeners = new Set();
  const emit = () => { for (const listener of listeners) listener(); };
  const assign = (next) => { current = next; onPayload?.(next); };
  return {
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    view(lang) { return describePluginUpdate(lang, current, phase, notice); },
    async check() {
      if (phase !== "idle") return;
      phase = "checking"; notice = { type: "status" }; emit();
      try { assign(await request("GET")); notice = { type: "status" }; }
      catch (error) { notice = { type: "error", message: error instanceof Error ? error.message : "" }; }
      finally { phase = "idle"; emit(); }
    },
    async update() {
      if (phase !== "idle") return;
      phase = "updating"; notice = { type: "status" }; emit();
      try {
        const next = await request("POST");
        assign(next);
        notice = { type: next.autoReload === true ? "restarting" : "restart" };
      } catch (error) { notice = { type: "error", message: error instanceof Error ? error.message : "" }; }
      finally { phase = "idle"; emit(); }
    },
  };
}
function ensurePluginUpdateStyle() {
  const existing = document.getElementById(STYLE_ID);
  if (existing !== null) {
    // 这张表的 id 被多个插件共用。已有归属时不改写，避免本插件重载删掉别人的表。
    if (existing.getAttribute("data-plugin") === null) existing.setAttribute("data-plugin", "@michengai/dsh-im-connect");
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = PLUGIN_UPDATE_CSS;
  style.setAttribute("data-plugin", "@michengai/dsh-im-connect");
  (document.head ?? document.documentElement).append(style);
}

function validPayload(value) {
  if (value === null || typeof value !== "object") return false;
  const item = value;
  return typeof item.packageName === "string" && typeof item.currentVersion === "string" && typeof item.updateAvailable === "boolean" && typeof item.profileName === "string" && typeof item.canAutoUpdate === "boolean" && typeof item.latestCheckFailed === "boolean" && (item.latestVersion === undefined || typeof item.latestVersion === "string");
}
async function requestStatus(endpoint, method, signal) {
  const signalOption = signal === undefined ? {} : { signal };
  const response = await fetch(endpoint, method === "GET" ? { cache: "no-store", ...signalOption } : {
    method: "POST",
    headers: { "content-type": "application/json", [UPDATE_HEADER]: "1" },
    body: "{}",
    ...signalOption,
  });
  const value = await response.json();
  if (!response.ok || !validPayload(value)) throw new Error(value !== null && typeof value === "object" && typeof value.error === "string" ? value.error : pluginUpdateCopy(document.documentElement.lang).failed);
  return value;
}
function manualPluginUpdateCommand(profileName, packageName, version) {
  const profile = profileName.trim() === "" ? "" : ` --profile ${profileName.trim()}`;
  return `dsh plugin${profile} add ${packageName}@${version} --registry=https://registry.npmjs.org/`;
}
function handlePluginUpdateEscape(event, close) {
  if (event.key !== "Escape") return false;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  close();
  return true;
}
function HostIcon(props) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => { ref.current?.replaceChildren(props.node); }, [props.node]);
  return React.createElement("span", { ref, className: "mpi-icon", "aria-hidden": true });
}
function UpdateDialog(props) {
  const bodyRef = React.useRef(null);
  const [, setRev] = React.useState(0);
  const [copyState, setCopyState] = React.useState("idle");
  React.useEffect(() => props.flow.subscribe(() => setRev((value) => value + 1)), [props.flow]);
  React.useEffect(() => {
    const element = document.documentElement;
    const observer = new MutationObserver(() => setRev((value) => value + 1));
    observer.observe(element, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);
  React.useEffect(() => { void props.flow.check(); }, [props.flow]);
  React.useEffect(() => {
    const onKey = (event) => {
      if (typeof modalLayers !== "undefined" && modalLayers.length && modalLayers[modalLayers.length - 1].owner !== "update") return;
      handlePluginUpdateEscape(event, props.onClose);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [props.onClose]);
  const lang = document.documentElement.lang;
  const view = props.flow.view(lang);
  const name = lang.toLowerCase().startsWith("en") ? props.enName : props.zhName;
  const command = manualPluginUpdateCommand(view.profileRaw, props.packageName, view.latestRaw);
  const copyLabel = copyState === "copied" ? view.copy.copied : copyState === "failed" ? view.copy.copyFailed : view.copy.copy;
  return React.createElement(HostThemeProvider, null, React.createElement(Modal, {
    open: true, className: "mpi-dialog", layerOwner: "update", title: `${name} ${view.copy.update}`, onCancel: props.onClose,
    footer: React.createElement("div", { className: "ima-modal-actions" },
      React.createElement(UpdatePrimitiveButton, { key: "check", variant: "outline", size: "sm", disabled: view.busy, onClick: () => { void props.flow.check(); } }, view.copy.recheck),
      React.createElement(UpdatePrimitiveButton, { key: "update", variant: "primary", size: "sm", disabled: view.disabled, onClick: () => { void props.flow.update(); } }, view.updateLabel),
    ),
  }, React.createElement("div", { ref: bodyRef },
    React.createElement("p", { className: "mpi-intro" }, view.copy.intro),
    React.createElement("dl", { className: "mpi-meta" },
      React.createElement("dt", null, view.copy.current), React.createElement("dd", null, React.createElement("span", { className: "mpi-mono" }, view.currentVersion)),
      React.createElement("dt", null, view.copy.latestLabel), React.createElement("dd", { className: "mpi-latest" }, React.createElement("span", { className: "mpi-mono" }, view.latestVersion), React.createElement("span", { className: "mpi-status", role: "status", "data-kind": view.kind, ...(view.kind === "update" ? { style: { color: "#e8b15a" } } : {}) }, view.message)),
      React.createElement("dt", null, view.copy.profile), React.createElement("dd", null, React.createElement("span", { className: "mpi-mono" }, view.profileName))),
    view.busy ? React.createElement(Progress, { percent: 100, showInfo: false, status: "active" }) : null,
    React.createElement("section", { className: "mpi-manual" },
      React.createElement("h3", null, view.copy.manual),
      React.createElement("p", null, view.copy.manualHint),
      React.createElement("div", { className: "mpi-command" },
        React.createElement("code", null, command),
        React.createElement(UpdatePrimitiveButton, { variant: "outline", size: "sm", disabled: view.busy, onClick: () => {
          const write = navigator.clipboard?.writeText(command);
          if (write === undefined) { setCopyState("failed"); return; }
          void write.then(() => { setCopyState("copied"); window.setTimeout(() => setCopyState("idle"), 1400); }).catch(() => setCopyState("failed"));
        } }, copyLabel))))));
}
function observePluginUpdate(options) {
  if (typeof document === "undefined" || document.body === null) return () => {};
  const endpoint = resolveApiUrl(options.endpoint);
  ensurePluginUpdateStyle();
  const createRoot = ReactDOM.createRoot || function createRootFallback(host) {
    return {
      render(node) { ReactDOM.render(node, host); },
      unmount() { ReactDOM.unmountComponentAtNode(host); },
    };
  };
  const controller = new AbortController();
  let payload;
  let buttonHost;
  let buttonRoot;
  let iconNode;
  let dialogHost;
  let dialogRoot;
  let frame;
  const unmountCheck = () => { buttonRoot?.unmount(); buttonRoot = undefined; buttonHost = undefined; iconNode = undefined; };
  const renderCheck = () => {
    if (buttonRoot === undefined) return;
    if (iconNode === undefined) iconNode = options.createIcon("refresh");
    const icon = iconNode;
    buttonRoot.render(React.createElement(UpdatePrimitiveButton, {
      variant: "outline", size: "sm", onClick: openDialog, icon: React.createElement(HostIcon, { node: icon }),
    }, React.createElement("span", { "data-mpi-label": "" }, pluginUpdateCopy(document.documentElement.lang).check)));
  };
  const closeDialog = () => { dialogRoot?.unmount(); dialogRoot = undefined; dialogHost?.remove(); dialogHost = undefined; };
  function openDialog() {
    closeDialog();
    const host = document.createElement("div");
    host.className = "mpi-dialog-root";
    document.body.append(host);
    dialogHost = host;
    const root = createRoot(host);
    dialogRoot = root;
    root.render(React.createElement(UpdateDialog, {
      flow: createUpdateFlow((method) => requestStatus(endpoint, method, controller.signal), payload, (next) => { payload = next; applyControls(); }),
      packageName: options.packageName, zhName: options.zhName, enName: options.enName, onClose: closeDialog,
    }));
  }
  const applyControls = () => {
    const row = document.querySelector(options.titleRowSelector);
    if (row === null) return;
    const heading = row.querySelector("h1,h2");
    const links = row.querySelector(options.linksSelector);

    if (options.isEnabled && !options.isEnabled()) {
      if (dialogHost !== undefined) closeDialog();
      if (links !== null) {
        const existing = links.querySelector(`[data-mpi-check="${options.packageName}"]`);
        if (existing !== null) {
          unmountCheck();
          existing.remove();
        }
      }
      if (heading !== null) {
        const version = heading.querySelector(`.mpi-version[data-package="${options.packageName}"]`);
        if (version !== null) {
          version.remove();
        }
      }
      return;
    }

    if (heading !== null && payload !== undefined) {
      let version = heading.querySelector(`.mpi-version[data-package="${options.packageName}"]`);
      if (version === null) {
        version = document.createElement("span");
        version.className = "mpi-version";
        version.dataset.package = options.packageName;
        heading.append(version);
      }
      const versionLabel = `v${payload.currentVersion}`;
      if (version.textContent !== versionLabel) version.textContent = versionLabel;
    }
    if (buttonHost !== undefined && !buttonHost.isConnected) unmountCheck();
    if (links === null) return;
    const existing = links.querySelector(`[data-mpi-check="${options.packageName}"]`);
    if (existing !== null) {
      const label = existing.querySelector("[data-mpi-label]");
      if (label === null || label.textContent !== pluginUpdateCopy(document.documentElement.lang).check) renderCheck();
      return;
    }
    const host = document.createElement("span");
    host.dataset.mpiCheck = options.packageName;
    host.className = "mpi-check-host";
    links.append(host);
    buttonHost = host;
    buttonRoot = createRoot(host);
    renderCheck();
  };
  const load = async () => {
    payload = await requestStatus(endpoint, "GET", controller.signal);
    applyControls();
    return payload;
  };
  const observer = new MutationObserver(() => {
    if (frame !== undefined) return;
    frame = window.requestAnimationFrame(() => { frame = undefined; applyControls(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["lang"] });
  const onToggle = () => {
    applyControls();
    if (!options.isEnabled || options.isEnabled()) void load().catch(() => {});
  };
  if (typeof window !== "undefined") window.addEventListener("ima-update-toggle", onToggle);
  applyControls();
  void load().catch(() => {});
  const cleanup = () => {
    if (typeof window !== "undefined") window.removeEventListener("ima-update-toggle", onToggle);
    controller.abort();
    observer.disconnect();
    closeDialog();
    unmountCheck();
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    document.querySelectorAll(`[data-mpi-check="${options.packageName}"],.mpi-version[data-package="${options.packageName}"]`).forEach((node) => node.remove());
  };
  return cleanup;
}
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");
    const { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, useSyncExternalStore } = React;
    const ReactDOM = require("react-dom");
    const primitives = typeof require === "function" ? (function () { try { return require("@deepseek-ai/dsh-client-ui-primitives"); } catch { return {}; } })() : {};
    const PrimitiveButton = primitives.Button;
    const HostMenu = primitives.Menu;
    const HostModal = primitives.Modal;
    const HostSegmentedTabs = primitives.SegmentedTabs;
    const HostTooltip = primitives.Tooltip;
    const PrimitiveSwitch = primitives.Switch;
    // 宿主 Button 由 forwardRef 包成对象，typeof 是 object，不是 function。
    function isHostComponent(component) {
      return typeof component === "function" || (!!component && typeof component === "object" && typeof component.render === "function");
    }
    // 只关最上层。下层监听先注册，不是顶层就放行，避免一次 Escape 关掉弹窗和宿主设置。
    const modalLayers = [];
    // 0.1.7 把尺寸从图标名里拿掉了（IconEditOutlineRegular）。旧宿主仍导出 *16/*20。
    function pickHostIcon(...names) {
      for (const name of names) {
        const icon = primitives[name];
        if (typeof icon === "function") return icon;
      }
      return function MissingHostIcon() { return null; };
    }
    const IconFolderClose = pickHostIcon("IconFolderCloseRegular", "IconFolderClose16", "IconFolderClose");
    const IconClockOutline = pickHostIcon("IconClockOutlineRegular", "IconClockOutline16");
    const IconQueueOutline = pickHostIcon("IconQueueOutlineRegular");
    const IconCheckOutline = pickHostIcon("IconCheckOutlineRegular");
    const IconCheckCircleOutline = pickHostIcon("IconCheckCircleOutlineRegular");
    const IconCloseCircleFill = pickHostIcon("IconCloseCircleFillRegular");
    const IconInfoOutline = pickHostIcon("IconInfoOutlineRegular");
    const IconWarningOutline = pickHostIcon("IconWarningOutlineRegular");
    const IconCloseFill = pickHostIcon("IconCloseFillRegular");
    const IconChevronDownOutline = pickHostIcon("IconChevronDownOutlineRegular");
    const IconChevronRightOutline = pickHostIcon("IconChevronRightOutlineRegular");
    const IconPlusOutline = pickHostIcon("IconPlusOutlineRegular");
    const IconEditOutline = pickHostIcon("IconEditOutlineRegular");
    const IconRefreshOutline = pickHostIcon("IconRefreshOutlineRegular");
    const IconDownloadOutline = pickHostIcon("IconDownloadOutlineRegular");
    const IconCopyOutline = pickHostIcon("IconCopyOutlineRegular");
    const IconLoadingOutline = pickHostIcon("IconLoadingOutlineRegular");
    function alertIcon(type) {
      if (type === "success") return h(IconCheckCircleOutline, { size: 14 });
      if (type === "warning") return h(IconWarningOutline, { size: 14 });
      if (type === "error") return h(IconCloseCircleFill, { size: 14 });
      return h(IconInfoOutline, { size: 14 });
    }
    function NoticeBar({ type = "info", icon, children, className, role, showIcon }) {
      const iconNode = icon !== undefined ? icon : (showIcon !== false ? alertIcon(type) : null);
      return React.createElement("div", {
        role: role || (type === "error" ? "alert" : undefined),
        className: ["ima-feedback", "ima-feedback-" + type, className].filter(Boolean).join(" "),
      },
        iconNode && React.createElement("span", { className: "ima-feedback-icon" }, iconNode),
        React.createElement("div", { className: "ima-feedback-body" }, children)
      );
    }
    function Tag({ color, children, icon, className, bordered, ...props }) {
      const colorCls = color ? "ima-tag-" + color : "";
      return React.createElement("span", {
        ...props,
        className: ["ima-tag", colorCls, className].filter(Boolean).join(" "),
      }, icon && React.createElement("span", { className: "ima-tag-icon", style: { display: "inline-flex", alignItems: "center", marginRight: children ? 4 : 0 } }, icon), children);
    }
    function Input(props) {
      const { className, type = "text", ...rest } = props;
      return React.createElement("input", {
        type,
        ...rest,
        className: ["ima-input", className].filter(Boolean).join(" "),
      });
    }
    function TextArea(props) {
      const { autoSize, className, rows, ...rest } = props;
      return React.createElement("textarea", {
        ...rest,
        className: ["ima-input ima-textarea", className].filter(Boolean).join(" "),
        rows: autoSize?.minRows || rows || 4,
      });
    }
    Input.TextArea = TextArea;
    function Checkbox({ checked, onChange, children, className, disabled, ...props }) {
      return React.createElement("label", {
        className: ["ima-checkbox-label", disabled ? "is-disabled" : "", className].filter(Boolean).join(" "),
      },
        React.createElement("input", {
          type: "checkbox",
          checked: Boolean(checked),
          disabled,
          onChange,
          className: "ima-checkbox",
          ...props,
        }),
        children ? React.createElement("span", { className: "ima-checkbox-text" }, children) : null
      );
    }
    function hostModalButton(label, onClick, kind, extra) {
      const options = extra || {};
      const isDanger = kind === "danger" || options.danger;
      const variant = isDanger ? "outline" : (kind === "primary" ? "primary" : "outline");
      const dangerClass = isDanger ? "ima-btn-danger" : "";
      const className = [options.className, dangerClass].filter(Boolean).join(" ") || undefined;
      if (isHostComponent(PrimitiveButton)) {
        return React.createElement(PrimitiveButton, {
          variant,
          disabled: options.disabled,
          className,
          onClick,
          type: "button",
        }, label);
      }
      return React.createElement(Button, {
        variant,
        disabled: options.disabled,
        className,
        onClick,
      }, label);
    }
    function Modal(props) {
      const { open, title, onCancel, onOk, okText, cancelText, okButtonProps, confirmLoading, width = 640, zIndex = 1100, children, footer, className, contentClassName, keyboard, maskClosable, closeLabel, description } = props;
      const requestClose = onCancel || props.onClose;
      const closeRef = useRef(requestClose);
      closeRef.current = requestClose;
      const layerRef = useRef(null);
      if (!layerRef.current) layerRef.current = { owner: props.layerOwner || "modal" };
      useEffect(() => {
        if (!open) return undefined;
        const layer = layerRef.current;
        modalLayers.push(layer);
        const onKey = (event) => {
          if (event.key !== "Escape") return;
          if (modalLayers[modalLayers.length - 1] !== layer) return;
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
          if (keyboard === false) return;
          if (closeRef.current) closeRef.current();
        };
        window.addEventListener("keydown", onKey, true);
        return () => {
          window.removeEventListener("keydown", onKey, true);
          const index = modalLayers.lastIndexOf(layer);
          if (index >= 0) modalLayers.splice(index, 1);
        };
      }, [open, keyboard]);
      if (!open) return null;
      const handleClose = () => { if (closeRef.current) closeRef.current(); };
      const handleOk = () => { if (onOk) onOk(); };
      const actionRow = footer === null ? null : (footer || React.createElement(React.Fragment, null,
        hostModalButton(cancelText || "取消", handleClose, "outline"),
        hostModalButton(okText || "确定", handleOk, okButtonProps?.danger ? "danger" : "primary", { disabled: okButtonProps?.disabled || confirmLoading, danger: okButtonProps?.danger })
      ));
      const footerNode = Array.isArray(actionRow)
        ? React.createElement(React.Fragment, null, actionRow)
        : actionRow;
      const hostDescription = typeof description === "string" && description !== "" ? { description } : {};
      if (typeof HostModal === "function") {
        return h(HostModal, {
          open: true,
          title,
          onClose: handleClose,
          closeLabel: closeLabel || "Close",
          className,
          // 宿主 Modal 把内容区裁在视口内；标记 content 区，让它在超长时滚动。
          contentClassName: ["ima-modal-content", contentClassName].filter(Boolean).join(" "),
          footer: footerNode,
          ...hostDescription,
        }, children);
      }
      const allowMask = maskClosable !== false && modalLayers[modalLayers.length - 1] === layerRef.current;
      return React.createElement("div", { className: "ima-modal-root", style: { zIndex } },
        React.createElement("div", { className: "ima-modal-mask", onClick: allowMask ? handleClose : undefined }),
        React.createElement("div", { className: ["ima-modal-wrap", className].filter(Boolean).join(" ") },
          React.createElement("div", { className: "ima-modal-panel", style: { width } },
            React.createElement("div", { className: "ima-modal-header" },
              React.createElement("div", { className: "ima-modal-title" }, title),
              React.createElement("button", { type: "button", className: "ima-modal-close", "aria-label": closeLabel || "Close", onClick: handleClose },
                h(IconCloseFill, { size: 14 })
              )
            ),
            React.createElement("div", { className: "ima-modal-body" },
              description ? React.createElement("p", { className: "ima-confirm-content" }, description) : null,
              children),
            footerNode && React.createElement("div", { className: "ima-modal-footer-wrap" }, footerNode)
          )
        )
      );
    }
    function useModal() {
      const [config, setConfig] = React.useState(null);
      const confirm = (opts) => { setConfig(opts); };
      const holder = config ? React.createElement(Modal, {
        open: true,
        title: config.title,
        width: 480,
        description: config.description,
        onCancel: () => { setConfig(null); },
        onOk: () => {
          const p = config.onOk?.();
          if (p && typeof p.then === "function") {
            p.then(() => setConfig(null));
          } else {
            setConfig(null);
          }
        },
        okText: config.okText,
        cancelText: config.cancelText,
        okButtonProps: config.okButtonProps,
      }, config.content ? React.createElement("p", { className: "ima-confirm-content" }, config.content) : null) : null;
      return [{ confirm }, holder];
    }
    Modal.useModal = useModal;
    function Switch(props) {
      const on = Boolean(props.checked);
      return React.createElement("button", {
        type: "button",
        role: "switch",
        "aria-checked": on,
        "aria-label": props["aria-label"],
        title: props.title,
        disabled: props.disabled,
        className: "ima-enable-switch" + (props.className ? " " + props.className : ""),
        onClick: function (event) {
          if (event && typeof event.stopPropagation === "function") event.stopPropagation();
          if (!props.disabled && props.onChange) props.onChange(!on);
        },
      }, React.createElement("span", { className: "ima-enable-switch-thumb", "aria-hidden": "true" }));
    }
    function Select(props) {
      const [open, setOpen] = useState(false);
      const rootRef = useRef(null);

      useEffect(() => {
        if (!open) return undefined;
        const updateWidth = () => {
          const width = rootRef.current?.getBoundingClientRect().width ?? 0;
          if (width > 0) document.documentElement.style.setProperty("--ima-menu-width", `${Math.round(width)}px`);
        };
        updateWidth();
        window.addEventListener("resize", updateWidth);
        return () => {
          window.removeEventListener("resize", updateWidth);
          document.documentElement.style.removeProperty("--ima-menu-width");
        };
      }, [open]);

      useEffect(() => {
        if (!open || typeof window === "undefined") return undefined;
        const layer = { owner: "select" };
        modalLayers.push(layer);
        function onKey(event) {
          if (event.key !== "Escape") return;
          if (modalLayers[modalLayers.length - 1] !== layer) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          setOpen(false);
        }
        window.addEventListener("keydown", onKey, true);
        return () => {
          window.removeEventListener("keydown", onKey, true);
          const index = modalLayers.lastIndexOf(layer);
          if (index >= 0) modalLayers.splice(index, 1);
        };
      }, [open]);

      const items = React.useMemo(() => {
        const list = [];
        (props.options || []).forEach((opt, idx) => {
          if (Array.isArray(opt.options)) {
            list.push({ type: "label", id: "group-" + idx, text: opt.label || "" });
            opt.options.forEach((sub) => {
              list.push({ id: String(sub.value), label: sub.label, disabled: sub.disabled, danger: sub.danger });
            });
          } else {
            list.push({ id: String(opt.value), label: opt.label, disabled: opt.disabled, danger: opt.danger });
          }
        });
        return list;
      }, [props.options]);

      const footer = React.useMemo(() => {
        if (!Array.isArray(props.footer) || props.footer.length === 0) return undefined;
        return props.footer.map((item) => ({
          id: String(item.value),
          label: item.label,
          disabled: item.disabled,
          danger: item.danger,
        }));
      }, [props.footer]);

      const selectedOption = React.useMemo(() => {
        for (const opt of props.options || []) {
          if (Array.isArray(opt.options)) {
            const found = opt.options.find((sub) => String(sub.value) === String(props.value));
            if (found) return found;
          } else if (String(opt.value) === String(props.value)) {
            return opt;
          }
        }
        return null;
      }, [props.options, props.value]);

      const currentText = selectedOption ? selectedOption.label : (props.placeholder || props["aria-label"] || "");

      return React.createElement("div", {
        ref: rootRef,
        className: "ima-menu-select-wrap " + (props.className || ""),
        style: props.style,
      },
        React.createElement(HostMenu, {
          open: open,
          listClassName: ["ima-form-menu", props.listClassName].filter(Boolean).join(" "),
          onClose: () => setOpen(false),
          onSelect: (id) => {
            if (props.footer && props.footer.some((item) => String(item.value) === id)) {
              if (typeof props.onFooter === "function") props.onFooter(id);
              setOpen(false);
              return;
            }
            if (props.onChange) props.onChange(id);
            setOpen(false);
          },
          selectedId: props.value != null ? String(props.value) : undefined,
          align: "start",
          portal: true,
          dense: true,
          anchor: React.createElement(Button, {
            variant: "outline",
            size: "sm",
            role: "combobox",
            "aria-label": props["aria-label"] || props.placeholder,
            "aria-expanded": open,
            disabled: props.disabled,
            className: "ima-menu-select-trigger" + (open ? " is-open" : ""),
            onClick: () => { if (!props.disabled) setOpen((prev) => !prev); },
          },
            React.createElement("span", { className: "ima-menu-select-label" }, currentText),
            h(IconChevronDownOutline, {
              size: 12,
              className: "ima-menu-select-arrow",
              style: { marginLeft: 4, transition: "transform 150ms ease", transform: open ? "rotate(180deg)" : "none" },
            })
          ),
          items: items,
          ...(footer ? { footer } : {}),
        })
      );
    }
    function createSpinner() {
      return h(IconLoadingOutline, {
        size: 14,
        className: "ima-btn-spinner",
        style: { marginRight: 6, display: "inline-block", verticalAlign: "-2px", animation: "ima-spin 0.8s linear infinite" },
      });
    }
    function Button({ variant, type, danger, loading, block, size, shape, className, children, href, target, rel, icon, ...props }) {
      let mappedVariant = variant ?? "outline";
      if (type === "primary") mappedVariant = "primary";
      else if (type === "text" || type === "link") mappedVariant = "ghost";

      const isPrimary = mappedVariant === "primary";
      const mappedSize = (size === "small" || size === "sm") ? "sm" : "md";

      const classes = [
        "ima-btn",
        href ? "ima-link-btn" : "",
        className,
        isPrimary ? "is-primary" : "",
        danger ? "is-danger ima-btn-danger" : "",
        (danger && isPrimary) ? "ima-btn-danger-primary" : "",
        block ? "is-block" : "",
        loading ? "is-loading" : "",
      ].filter(Boolean).join(" ");

      const iconElement = loading
        ? createSpinner()
        : (icon ? React.createElement("span", {
            key: "icon",
            className: "ima-btn-icon",
            style: { display: "inline-flex", alignItems: "center" },
          }, icon) : null);
      const content = [iconElement, children];

      if (href) {
        return React.createElement("a", Object.assign({}, props, {
          href,
          target,
          rel: rel || (target === "_blank" ? "noreferrer" : undefined),
          className: classes || undefined,
          "aria-label": props["aria-label"],
          style: props.style,
        }), content);
      }

      if (isHostComponent(PrimitiveButton)) {
        return React.createElement(PrimitiveButton, Object.assign({}, props, {
          variant: mappedVariant,
          size: mappedSize,
          className: [className, danger ? "ima-btn-danger" : ""].filter(Boolean).join(" ") || undefined,
          disabled: props.disabled || loading,
          icon: loading ? undefined : icon,
        }), loading ? createSpinner() : children);
      }

      return React.createElement("button", Object.assign({}, props, {
        type: "button",
        className: classes || undefined,
        disabled: props.disabled || loading,
      }), content);
    }

    const IconSettingsOutline16 = pickHostIcon("IconSettingsOutlineRegular", "IconSettingsOutline16");
    // 已通过逐条投递验证的渠道，与宿主端 channels/meta.ts 的 supportsSegmentReply 保持一致。
    const SEGMENT_REPLY_PLATFORMS = ["qq"];
    const supportsSegmentReply = (platform) => SEGMENT_REPLY_PLATFORMS.indexOf(platform) >= 0;
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
      const normalize = (value) => String(value || "").replace(/\s+/g, "").trim().toLowerCase();
      const labelOf = (button) => normalize(button.textContent) || normalize(button.getAttribute && button.getAttribute("aria-label"));
      const targets = labels.map(normalize).filter(Boolean);
      for (const target of targets) {
        const match = buttons.find((button) => labelOf(button) === target);
        if (match) return match;
      }
      // 宿主可能在标签旁加计数或徽标；退一步做包含匹配。
      for (const target of targets) {
        const match = buttons.find((button) => {
          const text = labelOf(button);
          return text !== "" && (text.includes(target) || target.includes(text));
        });
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
    function findAccountMenuTrigger() {
      const exact = [
        'button[aria-label="账号菜单"]',
        'button[aria-label="Account menu"]',
      ];
      for (const selector of exact) {
        const found = document.querySelector(selector);
        if (found) return found;
      }
      return [...document.querySelectorAll('button[aria-haspopup="menu"]')].find((button) => {
        const label = `${typeof button.getAttribute === "function" ? button.getAttribute("aria-label") || "" : ""} ${button.textContent || ""}`.trim();
        return /账号|account/i.test(label);
      });
    }
    function requestCodexSettingsSection(labels) {
      const trigger = typeof document !== "undefined" && document.querySelector(SETTINGS_CODEX_TRIGGER_SELECTOR);
      if (!trigger) return false;
      const request = new CustomEvent(SETTINGS_OPEN_SECTION_EVENT, { detail: { labels: [...labels] }, cancelable: true });
      return !trigger.dispatchEvent(request);
    }
    function openImSettingsPage(t) {
      openSettingsSection(
        [t("settings.label"), IM_LOCALES.en["settings.label"], IM_LOCALES.zh["settings.label"]],
        () => {},
        () => console.warn("[dsh-im-connect] 无法打开 IM 助理设置页"),
      );
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
      const launchers = [...document.querySelectorAll('button[aria-haspopup="dialog"], button[aria-label*="设置"], button[aria-label*="Settings"], [data-dcu-settings-trigger]')];
      const namedSettingsButton = [...document.querySelectorAll("button")].find((button) => /^(设置|settings)$/i.test((button.getAttribute("aria-label") || "").trim()));
      const launcher = namedSettingsButton || pickSettingsLauncher(launchers);
      const pageTrigger = document.querySelector(SETTINGS_CODEX_TRIGGER_SELECTOR);
      const dialogOpen = document.querySelector('[role="dialog"]') !== null;
      const pageOpen = document.querySelector(SETTINGS_CODEX_PAGE_SELECTOR) !== null;
      let menuTrigger;
      if (!dialogOpen && !pageOpen && !launcher && !pageTrigger) {
        menuTrigger = findAccountMenuTrigger();
        if (!menuTrigger) {
          if (onMissing) onMissing();
          return;
        }
        menuTrigger.click();
      } else if (!dialogOpen && !pageOpen) {
        (pageTrigger || launcher).click();
      }
      let frame;
      let finished = false;
      let menuActivated = false;
      let timeout;
      const observer = new MutationObserver(() => { schedule(); });
      const cleanup = () => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        window.clearTimeout(timeout);
        if (frame !== undefined) window.cancelAnimationFrame(frame);
      };
      const wait = () => {
        timeout = window.setTimeout(() => {
          if (select()) return;
          cleanup();
          if (onMissing) onMissing();
        }, 5000);
      };
      const select = () => {
        if (menuTrigger !== undefined && !menuActivated) {
          const items = [...document.querySelectorAll('[role="menuitem"], [role="menu"] button')];
          const entry = pickSettingsSectionButton(items, ["设置", "Settings"]);
          if (!entry) return false;
          menuActivated = true;
          window.clearTimeout(timeout);
          wait();
          entry.click();
          schedule();
          return true;
        }
        const buttons = [
          ...document.querySelectorAll('[role="dialog"] nav button, [role="dialog"] button'),
          ...document.querySelectorAll(SETTINGS_CODEX_PAGE_SELECTOR + " nav button"),
          ...document.querySelectorAll("nav button, button"),
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
      wait();
      observer.observe(document.body, { childList: true, subtree: true });
      schedule();
    }
    const EMPTY_EXTRA_TABS = [];
    const inject = ["slots", "sessions", "workspaces", "locale"];
    const API_BASE = "/api/michengai/dsh-im-connect";
    const TAB_KEY = "dsh-native-sidebar.tab";
    const ACCOUNT_SELECTION_KEY = "dsh-im-connect.settings.selected-account";
    const IM_LOCALE_NS = "im-connect";
    const UPDATE_ICONS = {
      refresh: IconRefreshOutline,
      download: IconDownloadOutline,
      copy: IconCopyOutline,
      close: IconCloseFill,
    };
    function createPluginUpdateIcon(name) {
      const element = document.createElement("span");
      element.innerHTML = channelMarkup(h(UPDATE_ICONS[name] || IconRefreshOutline, { size: 16 }));
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
        "sidebar.entry.title": "侧边栏入口", "sidebar.entry.desc": "在侧栏显示即时通讯管理入口。设置里的入口不变。", "sidebar.entry.toggle": "切换侧边栏入口",
        "update.entry.title": "在线更新", "update.entry.desc": "允许检查并在线安装即时通讯插件的新版本。关闭后隐藏更新入口。", "update.entry.toggle": "切换在线更新", "error.update.disabled": "在线更新已被禁用",
        "taskTreeSessions.entry.title": "在任务树显示 IM 会话", "taskTreeSessions.entry.desc": "在官方工作区任务树中显示各渠道会话。关闭后仅在侧栏「频道」页签中显示", "taskTreeSessions.entry.toggle": "切换在任务树显示 IM 会话",
        "settings.aria": "IM助理", "settings.publicChatNotice": "未批准用户可以发起聊天，但不能批准工具调用。", "pending.notice": "有访问请求。批准后该用户才能驱动本机助手。", "action.approve": "批准", "action.deny": "拒绝", "loading": "加载中…",
        "account.presetUnavailable": "预设不可用", "action.settings": "设置", "command.dm": "私聊命令", "command.group": "群聊命令", "command.enabled": "可以执行命令", "command.disabled": "仅正常对话",
        "account.workspace": "工作区", "account.currentWorkspace": "当前工作区", "account.selectWorkspace": "请选择工作区", "account.selectModel": "请选择模型", "account.selectPermission": "请选择权限", "account.privateAccess": "私聊准入", "account.privateApproved": "仅已批准用户", "account.privateAll": "允许所有私聊用户",        "account.sendMode": "发送方式", "account.sendQueue": "排队发送", "account.sendSteer": "插话发送", "account.sendSteerNote": "插话发送会把消息作为补充指令立即交给运行中的任务；任务空闲时与排队发送相同。", "account.sessionIdle": "空闲新开会话", "account.sessionIdleOff": "关闭（保持原会话）", "account.sessionIdleMin": "{n} 分钟", "account.sessionIdleHour": "{n} 小时", "account.sessionIdleHours": "{n} 小时", "account.sessionIdleNote": "距上一条消息超过该时间后再收到新消息，将开启新会话；旧会话仍可用 /sessions 找回。设为 0 表示关闭。", "account.segmentReply": "分段回复", "account.segmentFull": "完整发送", "account.segmentSplit": "分段发送", "account.segmentReplyNote": "选择分段发送时助手会把一次回复拆成多条短消息，在分隔标记处切开逐条发送；完整发送时仍是一条完整回复。", "account.segmentGap": "发送间隔", "account.segmentGapMin": "最小间隔", "account.segmentGapMax": "最大间隔", "account.segmentGapNote": "每条分段消息之间会从这个区间里随机取一个间隔，单位秒，可直接填写。", "account.segmentGapInvalid": "请填写 0 到 60 之间的秒数", "account.segmentGapOrder": "上限不能低于下限", "account.seconds": "秒", "account.autoNameNote": "绑定成功后会自动生成账号名，无需手动填写。需要区分使用者时，可在账号行填写备注。", "account.proxyMode": "网络代理", "account.proxyInherit": "跟随宿主", "account.proxyDirect": "直接连接", "account.proxyCustom": "手动配置",        "account.proxyUrl": "代理地址", "account.proxyNote": "仅影响当前账号；保存后自动重连生效。", "account.proxySaved": "代理地址已保存；留空保存可保留当前地址。", "account.defaultName": "{channel}账号 {count}",
        "account.remark": "名称备注", "account.remarkNote": "只在本机设置页区分账号，留空恢复自动名称。", "account.rename": "修改名称备注",
        "account.count": "{count} 个账号", "account.statusProcessing": "处理中…", "account.statusNotConnected": "未连接", "account.receive": "接收消息", "account.receiveDescription": "关闭后保留账号配置，但不接收新消息", "account.removeConfirm": "确定移除这个账号？本机保存的配置和凭据将一并删除。",
        "action.addAccount": "添加账号", "action.generateQr": "生成二维码", "action.checkConnection": "诊断连接", "action.reconnectAccount": "重新连接", "action.removeAccount": "移除接入", "status.saving": "保存中…", "status.saved": "已保存",
        "channel.dingtalk": "钉钉", "channel.feishu": "飞书", "channel.lark": "Lark", "channel.weixin": "微信", "channel.wecom": "企业微信", "channel.qq": "QQ", "channel.telegram": "Telegram", "channel.discord": "Discord", "channel.slack": "Slack",
        "field.dingtalk.clientId": "Client ID（原 AppKey）", "field.dingtalk.clientSecret": "Client Secret（原 AppSecret）",
        "field.wecom.botId": "Bot ID", "field.wecom.secret": "Secret", "field.qq.appId": "AppID", "field.qq.appSecret": "AppSecret", "field.telegram.token": "Bot Token", "field.discord.token": "Bot Token", "field.slack.token": "Bot Token（xoxb- 开头）", "field.slack.appToken": "App Token（xapp- 开头）",
        "bind.title": "配置 {channel}", "bind.tabsAria": "绑定方式", "bind.quick": "快捷绑定（推荐）", "bind.manual": "手动配置", "bind.saving": "正在保存账号…", "bind.success": "绑定成功，频道已连接", "bind.newIdentity": "检测到新的账号身份，已创建新账号", "bind.qrAlt": "{channel} 绑定二维码", "bind.generating": "正在生成…", "bind.expire": "二维码 {time} 后过期", "bind.scanned": "已扫码，请在手机上确认", "bind.retry": "请重新生成二维码", "bind.refresh": "重新生成二维码", "action.saving": "保存中…", "action.confirm": "确认",
        "qr.weixin": "请使用微信扫描二维码完成绑定", "qr.feishu": "请使用飞书扫描二维码，将自动创建机器人", "qr.lark": "请使用 Lark 扫描二维码完成配对", "qr.wecom": "请使用企业微信扫描二维码，快捷绑定机器人", "qr.dingtalk": "请使用钉钉扫描二维码，自动创建机器人", "qr.qq": "请使用手机 QQ 扫描二维码，创建开放平台机器人", "qr.default": "请使用对应 App 扫描二维码",
        "status.connected": "已连接", "action.more": "{channel} 更多",
        "error.loadAssistant": "无法加载账号配置", "error.noModels": "当前 Host 还没有可用模型，请先在网页里配置提供商", "error.save": "保存失败", "error.chooseWorkspace": "请选择工作区目录", "error.workspaceUnavailable": "当前 Host 无法新增工作区", "error.addWorkspace": "新增工作区失败", "error.load": "加载失败", "error.connection": "无法连接本机 IM 助理接口", "error.request": "请求失败", "error.action": "操作失败", "error.qr": "无法生成二维码", "error.detailsInLog": "操作失败，请查看服务器日志。",
        "composer.noWorkspaces": "暂无工作区", "composer.addWorkspace": "添加工作区…", "composer.workspaceRequired": "请先添加工作区，否则无法保存", "composer.permission": "权限", "composer.noModels": "暂无模型", "action.cancel": "取消",
        "permission.readOnly": "只读", "permission.workspaceWrite": "工作区写入", "permission.fullAccess": "完全访问",
        "rail.workspace": "工作区", "rail.sessions": "会话", "rail.search": "搜索", "rail.searchPlaceholder": "搜索会话...", "rail.clearSearch": "清除搜索", "rail.filter": "筛选", "rail.group": "分组方式", "rail.byWorkspace": "按工作区", "rail.list": "单列表", "rail.byWorkspaceTree": "按工作区树", "rail.byChannel": "按频道", "rail.treeUnavailable": "当前宿主未提供官方任务树。", "rail.groupReadOnly": "频道分组不能在这里重命名或删除。", "rail.sort": "排序方式", "rail.recent": "最近更新", "rail.showArchived": "显示已归档", "rail.onlyArchived": "仅显示已归档", "rail.running": "运行中", "rail.idle": "空闲", "rail.waitingApproval": "等待审批", "rail.planReview": "计划待审", "rail.waitingAnswer": "等待回答", "rail.subagents": "{n} 个子代理运行中", "rail.completed": "已完成", "rail.archived": "已归档", "rail.compactApproval": "待审批", "rail.compactPlan": "计划待审", "rail.compactAnswer": "待回答", "rail.renameAria": "重命名会话", "rail.rename": "重命名", "rail.fork": "分叉会话", "rail.archive": "归档会话", "rail.unarchive": "恢复会话", "rail.deleteSession": "删除会话", "rail.deleteSessionConfirm": "删除会话", "rail.deleteSessionDescription": "将永久删除会话“{name}”及其子代理（含正在运行的）和全部记录（对话内容、统计、缓存），此操作不可恢复。", "rail.deleteSessionPending": "正在删除会话…", "rail.deleteSessionFailed": "删除会话失败：{message}", "rail.deleteSessionClose": "关闭", "rail.deleteSessionCancel": "取消", "rail.groupActions": "“{name}”的频道操作", "rail.channelSettings": "频道设置", "rail.addChannel": "添加频道", "rail.empty": "还没有频道会话。先在设置 → IM助理 里连接渠道，并给机器人发一条消息。", "rail.ungrouped": "未分组", "rail.tabsAria": "工作区分类", "rail.tasks": "任务", "rail.channels": "频道",
        "time.now": "刚刚", "time.minutes": "{n}分钟", "time.hours": "{n}小时", "time.days": "{n}天", "time.months": "{n}个月", "time.years": "{n}年", "time.ago": "{t}前",
        "copy": "复制", "hover.copied": "已复制",
        "server.unknownChannel": "未知渠道", "server.channelUnconfigured": "渠道未配置", "server.sessionMissing": "会话不存在", "server.accountMissing": "账号不存在", "server.accountConnectFailed": "账号连接失败，请查看本机日志", "server.accountReconnectFailed": "重新连接失败，请查看本机日志", "server.selectAccountSettings": "请选择提供商、模型、工作区或权限", "server.selectModel": "请选择提供商和模型", "server.selectWorkspace": "请选择工作区", "server.createWorkspace": "请先添加工作区", "server.selectPermission": "请选择权限", "server.missingCredentials": "凭据不足，无法启动渠道", "server.qrUnsupported": "该渠道不支持扫码绑定", "server.qrExpired": "二维码已过期", "server.qrIncomplete": "扫码未完成", "server.accessDenied": "未授权：请管理员在设置 → IM助理 中批准你的访问。", "server.remarkTooLong": "账号备注不能超过 40 个字符", "server.remarkControl": "账号备注不能包含换行或控制字符",
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
        "sidebar.entry.title": "Sidebar entry", "sidebar.entry.desc": "Show IM Connect in the sidebar. The Settings entry stays either way.", "sidebar.entry.toggle": "Toggle sidebar entry",
        "update.entry.title": "Online updates", "update.entry.desc": "Allow checking and installing new versions online. Hides the update entry when disabled.", "update.entry.toggle": "Toggle online updates", "error.update.disabled": "Online updates are disabled",
        "taskTreeSessions.entry.title": "Show IM sessions in task tree", "taskTreeSessions.entry.desc": "Show messaging channel sessions in the official workspace task tree. When disabled, sessions are shown only under the 'Channels' tab.", "taskTreeSessions.entry.toggle": "Toggle show IM sessions in task tree",
        "settings.aria": "IM Assistant", "settings.publicChatNotice": "Unapproved users can start chats, but they cannot approve tool calls.", "pending.notice": "There are access requests. Approve a user before they can control the local assistant.", "action.approve": "Approve", "action.deny": "Deny", "loading": "Loading…",
        "account.presetUnavailable": "Preset unavailable", "action.settings": "Settings", "command.dm": "DM commands", "command.group": "Group commands", "command.enabled": "Commands enabled", "command.disabled": "Conversation only",
        "account.workspace": "Workspace", "account.currentWorkspace": "Current workspace", "account.selectWorkspace": "Select a workspace", "account.selectModel": "Select a model", "account.selectPermission": "Select a permission", "account.privateAccess": "Private chat access", "account.privateApproved": "Approved users only", "account.privateAll": "Allow all DM users",        "account.sendMode": "Send mode", "account.sendQueue": "Queue", "account.sendSteer": "Steer", "account.sendSteerNote": "Steer hands the message to the running task as additional instructions at its next step; when the task is idle it behaves like Queue.", "account.sessionIdle": "Idle session rotation", "account.sessionIdleOff": "Disabled (keep session)", "account.sessionIdleMin": "{n} min", "account.sessionIdleHour": "{n} hr", "account.sessionIdleHours": "{n} hrs", "account.sessionIdleNote": "Start a new session when the next message arrives after this idle period; previous sessions remain accessible via /sessions. Set to 0 to disable.", "account.segmentReply": "Segmented replies", "account.segmentFull": "Send as whole", "account.segmentSplit": "Send in segments", "account.segmentReplyNote": "When set to Send in segments, the assistant splits one reply into several short messages at the separator and sends them one by one; Send as whole keeps the entire reply in a single message.", "account.segmentGap": "Send gap", "account.segmentGapMin": "Minimum gap", "account.segmentGapMax": "Maximum gap", "account.segmentGapNote": "Each segmented message waits a random gap inside this range, in seconds. Type the values directly.", "account.segmentGapInvalid": "Enter a number of seconds between 0 and 60.", "account.segmentGapOrder": "The maximum gap cannot be lower than the minimum.", "account.seconds": "s", "account.autoNameNote": "The account name is generated automatically after setup. Add a remark on the account row if you need to tell users apart.", "account.proxyMode": "Network proxy", "account.proxyInherit": "Follow Host", "account.proxyDirect": "Connect directly", "account.proxyCustom": "Configure manually",        "account.proxyUrl": "Proxy address", "account.proxyNote": "Affects only this account. The channel reconnects automatically after saving.", "account.proxySaved": "A proxy address is saved. Leave the field blank to keep it.", "account.defaultName": "{channel} account {count}",
        "account.remark": "Name remark", "account.remarkNote": "Shown only in settings to tell accounts apart. Leave blank to restore the automatic name.", "account.rename": "Edit name remark",
        "account.count": "{count} accounts", "account.statusProcessing": "Processing…", "account.statusNotConnected": "Not connected", "account.receive": "Receive messages", "account.receiveDescription": "Turn this off to keep the account settings without receiving new messages", "account.removeConfirm": "Remove this account? Its saved settings and credentials will also be deleted.",
        "action.addAccount": "Add account", "action.generateQr": "Generate QR code", "action.checkConnection": "Diagnose connection", "action.reconnectAccount": "Reconnect", "action.removeAccount": "Remove", "status.saving": "Saving…", "status.saved": "Saved",
        "channel.dingtalk": "DingTalk", "channel.feishu": "Feishu", "channel.lark": "Lark", "channel.weixin": "WeChat", "channel.wecom": "WeCom", "channel.qq": "QQ", "channel.telegram": "Telegram", "channel.discord": "Discord", "channel.slack": "Slack",
        "field.dingtalk.clientId": "Client ID (formerly AppKey)", "field.dingtalk.clientSecret": "Client Secret (formerly AppSecret)",
        "field.wecom.botId": "Bot ID", "field.wecom.secret": "Secret", "field.qq.appId": "AppID", "field.qq.appSecret": "AppSecret", "field.telegram.token": "Bot Token", "field.discord.token": "Bot Token", "field.slack.token": "Bot Token (starts with xoxb-)", "field.slack.appToken": "App Token (starts with xapp-)",
        "bind.title": "Set up {channel}", "bind.tabsAria": "Setup method", "bind.quick": "Quick setup (recommended)", "bind.manual": "Manual setup", "bind.saving": "Saving account…", "bind.success": "Connected successfully", "bind.newIdentity": "A new account identity was detected and a new account was created", "bind.qrAlt": "{channel} setup QR code", "bind.generating": "Generating…", "bind.expire": "QR code expires in {time}", "bind.scanned": "Scanned. Confirm on your phone.", "bind.retry": "Generate a new QR code", "bind.refresh": "Generate a new QR code", "action.saving": "Saving…", "action.confirm": "Confirm",
        "qr.weixin": "Scan the QR code with WeChat to connect", "qr.feishu": "Scan with Feishu; a bot will be created automatically", "qr.lark": "Scan with Lark to pair", "qr.wecom": "Scan with WeCom to quickly connect a bot", "qr.dingtalk": "Scan with DingTalk; a bot will be created automatically", "qr.qq": "Scan with mobile QQ to create an Open Platform bot", "qr.default": "Scan the QR code with the corresponding app",
        "status.connected": "Connected", "action.more": "More options for {channel}",
        "error.loadAssistant": "Could not load account settings", "error.noModels": "No models are available in the Host. Configure a provider in the web app first.", "error.save": "Could not save", "error.chooseWorkspace": "Choose a workspace directory", "error.workspaceUnavailable": "This Host cannot create workspaces", "error.addWorkspace": "Could not add workspace", "error.load": "Could not load", "error.connection": "Could not connect to the local IM Assistant API", "error.request": "Request failed", "error.action": "Action failed", "error.qr": "Could not generate a QR code", "error.detailsInLog": "The operation failed. Check the server logs for details.",
        "composer.noWorkspaces": "No workspaces", "composer.addWorkspace": "Add workspace…", "composer.workspaceRequired": "Add a workspace before saving.", "composer.permission": "Permission", "composer.noModels": "No models", "action.cancel": "Cancel",
        "permission.readOnly": "Read Only", "permission.workspaceWrite": "Workspace Write", "permission.fullAccess": "Full access",
        "rail.workspace": "Workspaces", "rail.sessions": "Sessions", "rail.search": "Search", "rail.searchPlaceholder": "Search sessions...", "rail.clearSearch": "Clear search", "rail.filter": "Filter", "rail.group": "Group by", "rail.byWorkspace": "By workspace", "rail.list": "Single list", "rail.byWorkspaceTree": "Workspace Tree", "rail.byChannel": "By channel", "rail.treeUnavailable": "The official tree is unavailable in this Host.", "rail.groupReadOnly": "Channel groups cannot be renamed or deleted here.", "rail.sort": "Sort by", "rail.recent": "Recently updated", "rail.showArchived": "Show archived", "rail.onlyArchived": "Archived only", "rail.running": "Running", "rail.idle": "Idle", "rail.waitingApproval": "Waiting for approval", "rail.planReview": "Plan to review", "rail.waitingAnswer": "Waiting for an answer", "rail.subagents": "{n} subagents running", "rail.completed": "Completed", "rail.archived": "Archived", "rail.compactApproval": "Approval", "rail.compactPlan": "Plan review", "rail.compactAnswer": "Answer", "rail.renameAria": "Rename session", "rail.rename": "Rename", "rail.fork": "Fork session", "rail.archive": "Archive session", "rail.unarchive": "Restore session", "rail.deleteSession": "Delete session", "rail.deleteSessionConfirm": "Delete session", "rail.deleteSessionDescription": "This permanently deletes session “{name}”, its child agents (including any that are still running), and all of its records (conversation, stats, cache). This cannot be undone.", "rail.deleteSessionPending": "Deleting session…", "rail.deleteSessionFailed": "Could not delete the session: {message}", "rail.deleteSessionClose": "Close", "rail.deleteSessionCancel": "Cancel", "rail.groupActions": "Actions for {name}", "rail.channelSettings": "Channel settings", "rail.addChannel": "Add channel", "rail.empty": "No channel sessions yet. Connect a channel in Settings → IM Assistant, then send the bot a message.", "rail.ungrouped": "Ungrouped", "rail.tabsAria": "Workspace categories", "rail.tasks": "Tasks", "rail.channels": "Channels",
        "time.now": "now", "time.minutes": "{n}min", "time.hours": "{n}h", "time.days": "{n}d", "time.months": "{n}mo", "time.years": "{n}y", "time.ago": "{t} ago",
        "copy": "Copy", "hover.copied": "Copied",
        "server.unknownChannel": "Unknown channel", "server.channelUnconfigured": "Channel is not configured", "server.sessionMissing": "Session does not exist", "server.accountMissing": "Account does not exist", "server.accountConnectFailed": "Could not connect the account. Check the local logs.", "server.accountReconnectFailed": "Could not reconnect the account. Check the local logs.", "server.selectAccountSettings": "Select a provider, model, workspace, or permission setting", "server.selectModel": "Select a provider and model", "server.selectWorkspace": "Select a workspace", "server.createWorkspace": "Add a workspace first.", "server.selectPermission": "Select a permission", "server.missingCredentials": "The channel cannot start because credentials are missing", "server.qrUnsupported": "This channel does not support QR setup", "server.qrExpired": "QR code has expired", "server.qrIncomplete": "QR setup was not completed", "server.accessDenied": "Access denied: ask an administrator to approve you in Settings → IM Assistant.", "server.remarkTooLong": "Account remark cannot exceed 40 characters", "server.remarkControl": "Account remark cannot contain line breaks or control characters",
        "status.disconnected": "Disconnected", "status.reconnectFailed": "Reconnect failed", "status.connectingSocket": "Connecting", "status.waitHandshake": "Waiting for gateway handshake", "status.authenticating": "Authenticating", "status.reconnecting": "Reconnecting", "status.connectionError": "Connection error", "status.connectionFailed": "Connection failed", "status.streamConnected": "Stream connected", "status.stopped": "Stopped", "status.longConnection": "Long connection established", "status.polling": "Polling", "status.notLoggedIn": "Not signed in", "status.waitQr": "Waiting for scan", "status.loggedIn": "Signed in", "status.loggedInRecovered": "Signed in (restored)", "status.loggingIn": "Signing in",
      },
    };
    const fallbackT = (key) => key;
    const h = React.createElement;
    function HostThemeProvider({ children }) {
      return children;
    }

    const QUEUE_ICON_PATHS = '<path d="M5 6.75H11"/><path d="M5 9H8"/><path d="M2.37067 11.2497C1.5872 9.89252 1.32042 8.29798 1.61945 6.7597C1.91847 5.22141 2.76317 3.84293 3.99801 2.87809C5.23285 1.91325 6.7747 1.427 8.33964 1.50888C9.90458 1.59076 11.3873 2.23526 12.5147 3.32369C13.6422 4.41232 14.3384 5.8717 14.4751 7.43304C14.6118 8.99438 14.1797 10.5525 13.2585 11.8205C12.3372 13.0885 10.9889 13.9809 9.4617 14.3334C8.18666 14.6277 6.8587 14.529 5.64964 14.0601C5.17095 13.8745 4.76937 13.4929 4.26509 13.3963C3.67389 13.2832 2.95232 13.5595 2.0377 14.3334"/>';
    const QUEUE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="black" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${QUEUE_ICON_PATHS}</svg>`;
    const QUEUE_ICON_MASK = `url("data:image/svg+xml,${encodeURIComponent(QUEUE_ICON_SVG)}")`;

    const CSS = `
.ima-page,.ima-account-modal,.ima-bind-modal,.ima-inspector{--ima-text:var(--dsw-alias-label-primary,var(--dsh-text,#e6edf3));--ima-muted:var(--dsw-alias-label-tertiary,var(--dsh-text-muted,#8b949e));--ima-line:var(--dsw-alias-border-l2,var(--dsh-border,rgba(255,255,255,.1)));--ima-card:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04));--ima-card-hover:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));--ima-ok:var(--dsw-alias-state-success-primary,#3fb950);--ima-warning:var(--dsw-alias-state-warning-primary,#d29922);--ima-danger:var(--dsw-alias-state-error-primary,#f85149);--ima-accent:var(--dsw-alias-brand-primary,#4b7cff)}
.ima-page{box-sizing:border-box;max-width:none;width:100%;margin:0;padding:0 0 32px;color:var(--ima-text)}
.ima-head{display:flex;flex-direction:column;align-items:stretch;gap:12px;margin-bottom:12px}
.ima-heading h2,.ima-title{margin:0;font-size:24px;line-height:32px;font-weight:600;letter-spacing:-.4px;white-space:nowrap;text-align:left}
.ima-title-row{display:flex;align-items:center;gap:8px 12px;min-width:0;flex-wrap:wrap}
.ima-title-links{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ima-title-links>span[data-mpi-check]{display:inline-flex;align-items:center}
[data-ima-nav-icon]>svg{display:none!important}
[data-ima-nav-icon]::before{content:'';flex:none;width:16px;height:16px;background-color:currentColor;-webkit-mask:${QUEUE_ICON_MASK} center/contain no-repeat;mask:${QUEUE_ICON_MASK} center/contain no-repeat;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;-webkit-mask-size:16px 16px;mask-size:16px 16px}
.ima-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:32px;padding:0 12px;border:0.5px solid var(--dsw-alias-border-l3,#555);border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-primary,#eee);font:inherit;font-size:13px;line-height:20px;cursor:pointer;user-select:none;box-sizing:border-box;text-decoration:none;transition:border-color 120ms ease,color 120ms ease,background 120ms ease}
.ima-btn:not(.is-primary):not(.ima-btn-danger){color:var(--dsw-alias-label-primary,#eee)!important}
.ima-btn:hover:not(:disabled):not(.ima-btn-danger){border-color:var(--dsw-alias-border-l3,#666)!important;color:var(--dsw-alias-label-primary,#fff)!important;background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))!important}
.ima-btn:focus-visible{outline:var(--dsw-focus-ring-width,1px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary,#4b7cff))!important;outline-offset:0!important}
.ima-btn:disabled,.ima-btn.is-disabled{opacity:.4!important;cursor:not-allowed!important;pointer-events:none!important}
.ima-btn.is-primary,.ima-bind-ready .ima-btn.is-primary{background:var(--dsw-alias-button-primary-fill,#f9fafb)!important;border-color:transparent!important;color:var(--dsw-alias-label-primary-foreground,#0f1115)!important}
.ima-btn.is-primary *,.ima-bind-ready .ima-btn.is-primary *{color:inherit!important;fill:currentColor!important}
.ima-btn.is-primary:hover:not(:disabled),.ima-bind-ready .ima-btn.is-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,#ebeef2)!important;color:var(--dsw-alias-label-primary-foreground,#0f1115)!important}
.ima-btn.is-primary:disabled,.ima-bind-ready .ima-btn.is-primary:disabled{opacity:.4!important;cursor:not-allowed!important}
.ima-btn.is-block{width:100%!important}
.ima-link-btn{height:28px!important;padding:0 10px!important;font-size:12px!important}
.ima-sub{margin:12px 0 0;max-width:none;color:var(--ima-muted);font-size:14px;line-height:22px;text-align:left}
.ima-error{color:var(--ima-danger);font-size:12px;margin:0 0 12px}
.ima-pending,.ima-page>.ima-feedback,.ima-inspector .ima-feedback{margin:0 0 12px}
.ima-feedback{display:flex;align-items:flex-start;gap:8px;padding:10px 14px;border-radius:var(--dsw-radius-sm,8px);font-size:13px;line-height:20px;border:0.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.1));background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08));color:var(--dsw-alias-label-primary,#eee)}
.ima-feedback-error{background:color-mix(in srgb, var(--dsw-alias-state-error-primary,#f85149) 12%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary,#f85149) 30%, transparent);color:var(--dsw-alias-label-primary,#eee)}
.ima-feedback-error .ima-feedback-icon{color:var(--dsw-alias-state-error-primary,#f85149)}
.ima-feedback-warning{background:color-mix(in srgb, var(--dsw-alias-state-warning-primary,#d29922) 12%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-state-warning-primary,#d29922) 30%, transparent);color:var(--dsw-alias-label-primary,#eee)}
.ima-feedback-warning .ima-feedback-icon{color:var(--dsw-alias-state-warning-primary,#d29922)}
.ima-feedback-success{background:color-mix(in srgb, var(--dsw-alias-state-success-primary,#3fb950) 12%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary,#3fb950) 30%, transparent);color:var(--dsw-alias-label-primary,#eee)}
.ima-feedback-success .ima-feedback-icon{color:var(--dsw-alias-state-success-primary,#3fb950)}
.ima-feedback-info{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08));color:var(--dsw-alias-label-primary,#eee)}
.ima-feedback-icon{display:inline-flex;align-items:center;flex:none;margin-top:3px}
.ima-feedback-body{flex:1;min-width:0;word-break:break-word}
.ima-pending{display:flex;flex-direction:column;gap:8px}
.ima-feedback-head{display:flex;align-items:center;gap:8px}
.ima-feedback-title{font-weight:550;line-height:20px}
.ima-pending-list{display:flex;flex-direction:column;gap:6px;width:100%}
.ima-pending-row{display:flex;gap:8px;align-items:center;padding:4px 0}
.ima-wrap{display:flex;flex-direction:column;min-height:0;flex:1;height:100%;overflow:hidden}.ima-official-tree{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.ima-tabs-wrap{display:flex;margin:2px var(--dsh-sidebar-inline-padding,12px) 8px 0;padding:0;width:auto}
.ima-tabs-wrap .ima-segmented-tabs{display:grid!important;width:100%!important;box-sizing:border-box!important;height:32px!important;min-height:32px!important;max-height:32px!important;padding:2px!important;border:0!important;border-radius:var(--dsw-radius-sm,8px)!important;box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l2,rgba(255,255,255,.08))!important;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.02))!important}
.ima-tabs-wrap .ima-segmented-tabs>span{inset:2px auto 2px 2px!important;width:calc((100% - 4px)/var(--ima-tab-count,2))!important;border-radius:6px!important;border:0.5px solid var(--dsw-alias-border-l3,rgba(255,255,255,.12))!important;background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.08))!important;box-shadow:none!important}
.ima-tabs-wrap .ima-segmented-tabs [role=tab]{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;height:28px!important;padding:0 clamp(6px,calc(100% - 60px),12px)!important;font-size:13px!important;line-height:20px!important;border-radius:6px!important;color:var(--dsw-alias-label-secondary,#8b8f98)!important;text-align:center!important;white-space:nowrap!important;box-sizing:border-box!important;transition:color 150ms ease!important}
.ima-tabs-wrap .ima-segmented-tabs [role=tab]>*{display:inline-flex!important;align-items:center!important;justify-content:center!important}
.ima-tabs-wrap .ima-segmented-tabs [role=tab]:hover{color:var(--dsw-alias-label-primary,inherit)!important}
.ima-tabs-wrap .ima-segmented-tabs [role=tab][aria-selected=true]{color:var(--dsw-alias-label-primary,inherit)!important;font-weight:600!important}
.ima-bind-tabs-wrap{width:100%;margin:0 0 16px}
.ima-bind-tabs-wrap.is-disabled{opacity:.6;pointer-events:none}
.ima-bind-panel[hidden]{display:none!important}
.ima-bind-tabs-wrap .ima-bind-tabs{width:100%;height:32px;box-sizing:border-box;border-bottom:0;background:color-mix(in srgb,var(--dsw-alias-label-primary,currentColor) 3%,transparent)!important;border-radius:var(--dsw-radius-sm,8px)!important;border:0.5px solid var(--dsw-alias-border-l1,rgba(255,255,255,.05))!important;padding:2px!important}
.ima-bind-tabs-wrap .ima-bind-tabs>span{inset:2px auto 2px 2px!important;width:calc((100% - 4px)/2)!important;border-radius:calc(var(--dsw-radius-sm,8px) - 2px)!important;border:0.5px solid color-mix(in srgb,var(--dsw-alias-label-primary,currentColor) 12%,transparent)!important;background:color-mix(in srgb,var(--dsw-alias-label-primary,currentColor) 8%,transparent)!important;box-shadow:none!important}
.ima-bind-tabs-wrap .ima-bind-tabs [role=tab]{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;width:100%!important;height:26px!important;padding:0 10px!important;font-size:13px!important;line-height:18px!important;border-radius:calc(var(--dsw-radius-sm,8px) - 2px)!important;color:var(--dsw-alias-label-secondary,#8b8f98);text-align:center!important}
.ima-bind-tabs-wrap .ima-bind-tabs [role=tab]>*{display:inline-flex!important;align-items:center!important;justify-content:center!important}
.ima-bind-tabs-wrap .ima-bind-tabs [role=tab]:hover{color:var(--dsw-alias-label-primary,inherit)}
.ima-bind-tabs-wrap .ima-bind-tabs [role=tab][aria-selected=true]{color:var(--dsw-alias-label-primary,inherit)!important;font-weight:600}
.ima-tabs{display:flex;gap:18px;padding:4px 12px 0;border-bottom:1px solid var(--ima-line)}
.ima-tab{appearance:none;border:0;background:transparent;color:var(--ima-muted);padding:8px 0;font-size:13px;cursor:pointer}
.ima-tab.on{color:var(--ima-text);box-shadow:inset 0 -2px 0 currentColor}
.ima-tabs{flex:none}
.ima-empty{color:var(--ima-muted);font-size:12px;padding:12px 8px}
.ima-channel-official{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;overflow:hidden}
.ima-channel-official>div{flex:1;min-width:0;min-height:0}
.ima-channel-official>.ima-channel-error{flex:none}
.ima-channel-official>.ima-channel-unavailable{flex:1}
.ima-channel-error{padding:8px 12px;color:var(--dsw-alias-state-error-primary,#f85149);font-size:12px;line-height:18px}
.ima-channel-unavailable{padding:16px 12px;color:var(--dsw-alias-label-tertiary,#8b8f98);font-size:13px;line-height:20px}
.ima-session-channel-icon{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:none}
/* 频道页签复用官方工作区浏览器：分组头操作按模式裁剪。 */
.ima-channel-official[data-mode="channel"] [data-row-key^="workspace:dsh-im-channel:"]>span:last-child>:last-child{display:none!important}
.ima-channel-official[data-mode="workspace"] [data-row-key^="workspace:"]>span:last-child,
.ima-channel-official[data-mode="workspace-tree"] [data-row-key^="workspace:"]>span:last-child{display:none!important}
.ima-logo{width:28px;height:28px;flex:none;display:block;line-height:0;background:transparent}
.ima-logo svg{width:28px;height:28px;display:block}
.ima-logo.sm{width:16px;height:16px;overflow:hidden;display:grid;place-items:center}
.ima-logo.sm svg{width:16px;height:16px;transform:none}
.ima-logo[data-brand="wecom"]{border-radius:6px;box-shadow:inset 0 0 0 1px rgba(15,23,42,.12);overflow:hidden;background:#fff}
.ima-logo.sm[data-brand="wecom"]{border-radius:4px;box-shadow:none;background:transparent}
.ima-qrbox{display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px 0 4px}
.ima-qrbox img{width:200px;height:200px;background:#fff;border:1px solid var(--ima-line);border-radius:12px;object-fit:contain}
.ima-bind-ready{display:flex;flex-direction:column;align-items:center;gap:14px;padding:12px 0 4px}.ima-bind-ready .ima-btn{min-width:136px}.ima-bind-status{min-height:40px;display:grid;place-items:center;color:var(--ima-muted);font-size:13px;text-align:center}
.ima-hint{margin:0;color:var(--ima-muted);font-size:13px;text-align:center;line-height:1.6}
.ima-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-size:13px}
.ima-field .ima-input,.ima-field input{width:100%}
.ima-input,.ima-account-remark-input,.ima-field input{box-sizing:border-box!important;height:36px!important;padding:0 12px!important;border:0.5px solid var(--dsw-alias-border-l2,#494949)!important;border-radius:var(--dsw-radius-sm,8px)!important;background:var(--dsw-alias-bg-layer-1,transparent)!important;color:var(--dsw-alias-label-primary,#eee)!important;font:inherit!important;font-size:13px!important;line-height:20px!important;transition:border-color 120ms ease,background 120ms ease!important}
.ima-textarea{height:auto!important;min-height:80px;padding:8px 12px!important;resize:vertical}
.ima-input:hover:not(:disabled),.ima-account-remark-input:hover:not(:disabled),.ima-field input:hover:not(:disabled){border-color:var(--dsw-alias-border-l3,#666)!important}
.ima-input:focus,.ima-account-remark-input:focus,.ima-field input:focus{border-color:var(--dsw-alias-brand-primary,#4b7cff)!important;outline:var(--dsw-focus-ring-width,1px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary,#4b7cff))!important;outline-offset:0!important}
.ima-input::placeholder,.ima-account-remark-input::placeholder,.ima-field input::placeholder{color:var(--dsw-alias-label-tertiary,#888)!important}
.ima-input:disabled,.ima-account-remark-input:disabled{opacity:.5!important;cursor:not-allowed!important}
.ima-checkbox-label{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary,#eee);cursor:pointer;user-select:none}
.ima-checkbox-label.is-disabled{opacity:.5;cursor:not-allowed}
.ima-checkbox{width:16px;height:16px;margin:0;accent-color:var(--dsw-alias-state-business-primary,#4176e6);cursor:inherit}
.ima-tag{display:inline-flex!important;align-items:center!important;gap:4px!important;height:22px!important;padding:0 8px!important;font-size:12px!important;line-height:20px!important;border-radius:var(--dsw-radius-sm,6px)!important;font-weight:500!important;box-sizing:border-box!important;vertical-align:middle!important;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-secondary,#b9b9b9);border:none}
.ima-tag .ima-btn-spinner{width:11px!important;height:11px!important;margin-right:2px!important;vertical-align:0!important}
.ima-tag-info,.ima-tag-processing,.ima-tag.is-busy{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4176e6) 14%,transparent)!important;color:var(--dsw-alias-state-business-primary,#4176e6)!important}
.ima-tag-success{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#3fb950) 14%,transparent)!important;color:var(--dsw-alias-state-success-primary,#3fb950)!important}
.ima-tag-warning{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d29922) 14%,transparent)!important;color:var(--dsw-alias-state-warn-primary,#d29922)!important}
.ima-tag-error{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#f85149) 14%,transparent)!important;color:var(--dsw-alias-state-error-primary,#f85149)!important}
.ima-modal-root{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:1100}
.ima-modal-mask{position:absolute;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
.ima-modal-wrap{position:relative;max-width:calc(100vw - 32px);max-height:calc(100vh - 48px);overflow:auto;display:flex}
.ima-modal-panel{position:relative;isolation:isolate;box-sizing:border-box;padding:24px 28px 28px;border-radius:var(--dsw-radius-panel,28px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1));backdrop-filter:var(--dsw-menu-backdrop-filter,blur(20px));-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter,blur(20px));border:0.5px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));box-shadow:var(--dsw-elevation-panel,0 20px 48px -12px rgba(0,0,0,.35));color:var(--dsw-alias-label-primary,#eee);display:flex;flex-direction:column;gap:16px}
.ima-modal-header{display:flex;align-items:center;justify-content:space-between;min-height:24px}
.ima-modal-title{font-size:17px;font-weight:600;line-height:24px;color:var(--dsw-alias-label-primary,#eee)}
.ima-modal-close{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:none;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-tertiary,#888);cursor:pointer;transition:all 120ms ease}
.ima-modal-close:hover{color:var(--dsw-alias-label-primary,#fff);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.ima-modal-body{min-height:0;overflow:visible;display:flex;flex-direction:column;gap:12px}
.ima-modal-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px}
.ima-modal-footer-wrap{display:flex;justify-content:flex-end;margin-top:12px;padding-top:16px}
.ima-inspector-actions>button{flex:none;white-space:nowrap}
.ima-confirm-content{margin:8px 0 0;font-size:13px;line-height:22px;color:var(--dsw-alias-label-secondary,#b9b9b9)}
.ima-page.ima-account-page{container-type:inline-size;min-width:0;width:100%;padding:0 0 32px}
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
.ima-account-copy{min-width:0}.ima-account-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500}.ima-account-rename-button{width:100%;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:text}.ima-account-rename-button:hover,.ima-account-rename-button:focus-visible{color:var(--ima-accent)}.ima-account-rename,.ima-account-remark-input{box-sizing:border-box;width:100%;height:32px;padding:4px 8px;border:1px solid var(--ima-line);border-radius:6px;background:transparent;color:inherit;font:inherit}.ima-account-id{display:block;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ima-muted);font-size:11px}
.ima-account-row .ima-tag{margin-inline-end:0}
.ima-account-receive{display:inline-flex;align-items:center;justify-content:flex-end;gap:8px;white-space:nowrap;font-size:12px;color:var(--ima-muted)}
.ima-inspector{padding:22px 24px 26px;min-width:0}.ima-inspector-head{display:flex;align-items:flex-start;gap:12px;padding-bottom:18px;border-bottom:1px solid var(--ima-line)}.ima-inspector-head-copy{min-width:0;flex:1}.ima-inspector-title{margin:1px 0 3px;font-size:17px;line-height:24px}.ima-inspector-title-row{display:flex;align-items:center;gap:12px;min-width:0}.ima-inspector-title-row .ima-inspector-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0}.ima-inspector-title-row .ima-inspector-status{flex:none;white-space:nowrap;font-size:11px}.ima-inspector-head-copy>.ima-account-id{margin-top:5px}
.ima-inspector-status{flex:none}
.ima-form{display:flex;flex-direction:column;gap:16px;padding-top:20px}
.ima-command-permissions{min-width:0;margin:0;padding:0;border:0}
.ima-diagnostic-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ima-inspector-title-row .ima-tag{margin-inline-end:0}.ima-bind-modal .ima-feedback{margin-bottom:12px}.ima-connection-check{display:grid;gap:6px;padding:12px;border:1px solid var(--ima-line);border-radius:8px;font-size:12px;line-height:1.6;overflow-wrap:anywhere;color:var(--ima-muted)}.ima-connection-check strong{color:var(--ima-text)}.ima-diagnostic-item{padding:8px 0;border-top:1px solid var(--ima-line)}
.ima-inspector-actions{display:flex!important;flex-wrap:wrap!important;align-items:center!important;justify-content:flex-end!important;gap:8px!important;margin-top:16px!important;padding-top:16px!important;padding-bottom:4px!important}
.ima-account-modal .ima-inspector{padding:0 0 16px 0}
.ima-bind-modal,.ima-account-modal{width:min(720px,100%) !important;max-height:100%;min-height:0}
/* 宿主 Modal 只把 dialog 限制在视口内，内容区默认不滚动，长内容会被裁掉；
   把宿主的 content 区设为滚动容器，footer 保持在容器外可见。 */
.ima-bind-modal>.ima-modal-content,.ima-account-modal>.ima-modal-content{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
.ima-account-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px;width:100%;box-sizing:border-box}
.ima-segment-gap{display:flex;align-items:center;gap:8px;width:100%}
.ima-segment-gap-input{flex:1 1 0;min-width:0}
.ima-segment-gap-sep,.ima-segment-gap-unit{color:var(--ima-muted, #8a8a8a);white-space:nowrap}
.ima-account-settings.compact{grid-template-columns:1fr}
.ima-proxy-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px;width:100%;box-sizing:border-box}
.ima-proxy-settings>.ima-picker-note{grid-column:1/-1}
.ima-picker-field{display:flex;min-width:0;width:100%;flex-direction:column;gap:6px;box-sizing:border-box}
.ima-picker-field.wide,.ima-picker-note,.ima-model-effort{grid-column:1/-1}
.ima-model-effort{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px;min-width:0;width:100%;box-sizing:border-box}
.ima-account-settings.compact .ima-model-effort{grid-template-columns:1fr}
.ima-picker-label{color:var(--dsw-alias-label-secondary,var(--ima-muted));font-size:12px;font-weight:550;line-height:16px}
.ima-picker-note{color:var(--dsw-alias-label-tertiary,var(--ima-muted));font-size:11px;line-height:1.6;margin-top:2px}
.ima-picker-note.warning{color:var(--ima-warning)}
.ima-save-note{color:var(--ima-muted);font-size:11px}.ima-save-note.ok{color:var(--ima-ok)}
.ima-bind-modal .ima-setup-section{padding:16px!important;margin:0 0 16px!important;border-radius:var(--dsw-radius-md,12px)!important;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.04))!important;border:0.5px solid var(--dsw-alias-border-l1,rgba(255,255,255,.06))!important}
.ima-bind-ready{display:flex!important;flex-direction:column!important;align-items:center!important;gap:14px!important;padding:20px 16px!important;border-radius:var(--dsw-radius-md,12px)!important;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.04))!important;border:0.5px solid var(--dsw-alias-border-l1,rgba(255,255,255,.06))!important}
.ima-bind-ready .ima-btn{min-width:140px!important;height:36px!important}
.ima-account-picker{width:100%}
.ima-enable-switch{box-sizing:border-box;position:relative;flex:0 0 auto;width:36px;height:20px;padding:2px;border:0;border-radius:999px;corner-shape:round;background:var(--dsw-alias-border-l3,#555);cursor:pointer}
.ima-enable-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary)}
.ima-enable-switch:disabled{cursor:default;opacity:.5}
.ima-enable-switch:focus-visible{outline:var(--dsw-focus-ring-width,1px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.ima-enable-switch-thumb{display:block;width:16px;height:16px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-label-primary-foreground,#fff);transition:transform 120ms ease;pointer-events:none}
.ima-enable-switch[aria-checked=false] .ima-enable-switch-thumb{background:var(--dsw-alias-switch-thumb,#fff)}
.ima-enable-switch[aria-checked=true] .ima-enable-switch-thumb{transform:translateX(16px)}
.ima-form-menu{box-sizing:border-box;width:max(var(--ima-menu-width,144px),144px)!important;min-width:max(var(--ima-menu-width,144px),144px)!important;max-width:100%!important}
.ima-menu-select-wrap,.ima-menu-select-wrap > *,.ima-menu-select-wrap span[class*="_root_"],.ima-menu-select-wrap .ima-menu-select-trigger,.ima-account-picker{display:flex!important;width:100%!important;min-width:0!important;box-sizing:border-box!important}
.ima-menu-select-trigger{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:6px!important;width:100%!important;height:36px!important;padding:0 12px!important;border:0.5px solid var(--dsw-alias-border-l2,#494949)!important;border-radius:var(--dsw-radius-sm,8px)!important;background:var(--dsw-alias-bg-layer-1,transparent)!important;color:var(--dsw-alias-label-primary,#eee)!important;font:inherit!important;font-size:13px!important;cursor:pointer!important;user-select:none!important;box-sizing:border-box!important;transition:border-color 120ms ease,background 120ms ease!important}
.ima-menu-select-trigger:hover:not(:disabled){border-color:var(--dsw-alias-border-l3,#666)!important;background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))!important}
.ima-menu-select-trigger.is-open{border-color:var(--dsw-alias-brand-primary,#4b7cff)!important;outline:var(--dsw-focus-ring-width,1px) solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary,#4b7cff))!important}
.ima-menu-select-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:left}
.ima-menu-select-arrow{flex:none;opacity:0.6}
.ima-btn-spinner{display:inline-block;vertical-align:-2px;animation:ima-spin 0.8s linear infinite}
@keyframes ima-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.ima-btn-danger{color:var(--dsw-alias-state-error-primary,var(--ima-danger))!important;border-color:var(--dsw-alias-state-error-primary,var(--ima-danger))!important}
.ima-btn-danger:hover:not(:disabled){color:var(--dsw-alias-state-error-primary,var(--ima-danger))!important;border-color:var(--dsw-alias-state-error-primary,var(--ima-danger))!important;background:rgba(239,68,68,.12)!important}
.ima-btn-danger-primary,.ima-btn-danger.ima-btn-danger-primary{background:var(--dsw-alias-state-error-primary,var(--ima-danger))!important;border-color:var(--dsw-alias-state-error-primary,var(--ima-danger))!important;color:#fff!important}
@container (max-width:480px){.ima-account-row{grid-template-columns:minmax(0,1fr) auto auto;gap:8px;padding:10px}.ima-account-receive>span{display:none}.ima-platform-head{padding:10px 12px}.ima-account-list{padding:0 12px 12px}}
.ima-main-panel{box-sizing:border-box;height:100%;min-height:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:28px clamp(24px,4vw,48px) 48px}.ima-main-panel>*{width:100%;max-width:960px}.ima-bundle-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2)}.ima-bundle-label-box{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;text-align:left}.ima-bundle-title{font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}.ima-bundle-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
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

    let requestHostSessionRefresh = () => {};
    let channelSessionIds = new Set();
    let channelSessionChannels = new Map();
    let channelMembershipRevision = 0;
    const channelMembershipListeners = new Set();
    function updateChannelMembership(groups) {
      const next = new Set();
      const channels = new Map();
      for (const group of groups) {
        for (const session of group.sessions || []) {
          next.add(session.sessionId);
          channels.set(String(session.sessionId), group.id);
        }
      }
      let changed = next.size !== channelSessionIds.size || [...next].some(id => !channelSessionIds.has(id));
      if (!changed) {
        for (const [id, channel] of channels) {
          if (channelSessionChannels.get(id) !== channel) { changed = true; break; }
        }
      }
      if (changed) {
        channelSessionIds = next;
        channelSessionChannels = channels;
        channelMembershipRevision += 1;
        for (const listener of channelMembershipListeners) listener();
      }
      try { requestHostSessionRefresh(changed); } catch { /* 下次频道轮询继续重试 */ }
    }
    /** IM 会话 ID 包含账号实例；接口映射兼容沿用普通 ID 的已接入会话。 */
    function channelIdOfSession(sessionId) {
      const value = String(sessionId || "");
      const mapped = channelSessionChannels.get(value);
      if (mapped) return mapped;
      // 统一 UUID 不含渠道信息，映射未到达前只能返回空；旧语义 ID 仍可从字符串反解。
      if (!value.startsWith("im:")) return undefined;
      const rest = value.slice(3);
      const split = rest.indexOf(":");
      const instance = split > 0 ? rest.slice(0, split) : rest;
      const platform = instance.split("_", 1)[0];
      return platform || undefined;
    }
    // 新旧两代 IM 前缀都要认，否则存量会话升级后会掉出渠道页签。
    const isChannelSession = (id) => {
      const value = String(id);
      return value.startsWith("dsh-im-session-") || value.startsWith("im:") || channelSessionIds.has(value);
    };
    const subscribeChannelMembership = (listener) => {
      channelMembershipListeners.add(listener);
      return () => channelMembershipListeners.delete(listener);
    };
    const channelMembershipSnapshot = () => channelMembershipRevision;

    /** 频道不能新建普通会话。当前会话决定侧栏该停在哪一页；定时页签自己认领的不抢。 */
    function sidebarTabForSession(currentId, extraTabs) {
      if (typeof currentId !== "string" || currentId === "") return null;
      const matched = (extraTabs || []).find((item) => item && item.matchSession && item.matchSession(currentId));
      if (matched && matched.id !== "schedule" && matched.id !== "channels") return matched.id;
      // 频道会话同时存在于任务树和频道页签，不再自动改页签。
      if (isChannelSession(currentId)) return null;
      if (matched) return null;
      return "tasks";
    }

    function followSidebarTab(state, currentId, extraTabs) {
      const ready = !!(state && state.ready);
      const next = sidebarTabForSession(currentId, extraTabs);
      // 首个有效主会话只建立基线，不覆盖用户恢复的页签；空快照继续等待。
      if (!ready) return { ready: typeof currentId === "string" && currentId !== "", previousId: currentId, tab: null };
      if (typeof currentId !== "string" || currentId === "") return { ready: true, previousId: currentId, tab: null };
      if (currentId === state.previousId) return { ready: true, previousId: currentId, tab: null };
      return { ready: true, previousId: currentId, tab: next };
    }

    function resolveSidebarTab(tab, extraTabs) {
      return tab === "tasks" || tab === "channels" || extraTabs.some((item) => item.id === tab) ? tab : "tasks";
    }

    function isHostNewSessionControl(label) {
      return /^(新会话|新建任务|New chat|New session)(?:\s+(?:Ctrl|Alt|Shift|Meta)(?:\+[^\s+]+)*)?$/i.test(String(label || "").trim());
    }

    const api = (path, opts) => {
      // 管理路由复用宿主登录 Cookie，不缓存账号状态或认证错误。
      const request = Object.assign({}, opts || {}, { credentials: "same-origin", cache: "no-store" });
      const method = String(request.method || "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        request.headers = Object.assign({ "content-type": "application/json" }, request.headers || {}, { "x-dsh-im-connect-client": "1" });
        if (request.body === undefined) request.body = "{}";
      }
      const targetUrl = typeof resolveApiUrl === "function" ? resolveApiUrl(API_BASE + path) : API_BASE + path;
      return fetch(targetUrl, request).then((r) => r.json()).then((data) => {
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

      if (id === "discord") {
        return svg(compact ? "0 -8.5 65 65" : "0 0 65 48", [
          h("path", { key: "mark", fill: "#5865F2", d: "M41.2351 0C40.6164 1.09866 40.0607 2.2352 39.5556 3.397C34.7569 2.67719 29.8697 2.67719 25.0584 3.397C24.5658 2.2352 23.9976 1.09866 23.3788 0C18.8705 0.770324 14.4759 2.12155 10.3085 4.02841C2.04967 16.2652 -0.185531 28.1863 0.925755 39.9432C5.76238 43.517 11.1799 46.2447 16.951 47.9874C18.2517 46.2447 19.4009 44.3883 20.3859 42.4562C18.5169 41.7616 16.7111 40.8903 14.981 39.88C15.4356 39.5517 15.8776 39.2107 16.307 38.8824C26.4475 43.6559 38.1917 43.6559 48.3449 38.8824C48.7742 39.236 49.2162 39.577 49.6708 39.88C47.9408 40.9029 46.1349 41.7616 44.2533 42.4688C45.2383 44.4009 46.3875 46.2573 47.6882 48C53.4593 46.2573 58.8768 43.5422 63.7134 39.9684C65.0268 26.3299 61.4656 14.5099 54.3054 4.04104C50.1507 2.13418 45.7561 0.782952 41.2478 0.0252565L41.2351 0ZM21.8003 32.7072C18.6811 32.7072 16.0923 29.8785 16.0923 26.3804C16.0923 22.8824 18.5801 20.041 21.7876 20.041C24.9952 20.041 27.5461 22.895 27.4956 26.3804C27.4451 29.8658 24.9826 32.7072 21.8003 32.7072ZM42.8389 32.7072C39.7071 32.7072 37.1436 29.8785 37.1436 26.3804C37.1436 22.8824 39.6314 20.041 42.8389 20.041C46.0465 20.041 48.5848 22.895 48.5343 26.3804C48.4838 29.8658 46.0213 32.7072 42.8389 32.7072Z" }),
        ]);
      }
      if (id === "slack") {
        return svg("0 0 127 127", [
          h("path", { key: "red", fill: "#E01E5A", d: "M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z" }),
          h("path", { key: "blue", fill: "#36C5F0", d: "M47 27c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.5 39.7.6 47 .6c7.3 0 13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9c0-7.3 5.9-13.2 13.2-13.2H47z" }),
          h("path", { key: "green", fill: "#2EB67D", d: "M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6c7.3 0 13.2 5.9 13.2 13.2v33.1z" }),
          h("path", { key: "yellow", fill: "#ECB22E", d: "M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z" }),
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
      ["账号备注不能超过 40 个字符", "server.remarkTooLong"], ["账号备注不能包含换行或控制字符", "server.remarkControl"],
      ["请选择提供商、模型、工作区或权限", "server.selectAccountSettings"], ["请选择提供商和模型", "server.selectModel"], ["请选择工作区", "server.selectWorkspace"], ["请先添加工作区", "server.createWorkspace"], ["请选择权限", "server.selectPermission"], ["凭据不足，无法启动渠道", "server.missingCredentials"],
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
    function parsePickedPath(value) {
      if (typeof value === "string" && value.trim() !== "") return value;
      if (value === null || typeof value !== "object") return undefined;
      if (value.canceled === true) return undefined;
      if (typeof value.path === "string" && value.path.trim() !== "") return value.path;
      const first = Array.isArray(value.filePaths) ? value.filePaths[0] : undefined;
      return typeof first === "string" && first.trim() !== "" ? first : undefined;
    }
    function pickHostDirectory(ctx) {
      const host = typeof globalThis !== "undefined" ? globalThis.__DSH_DIRECTORY_PICKER__ : undefined;
      if (host && typeof host.pick === "function") {
        return Promise.resolve(host.pick()).then(parsePickedPath);
      }
      const uiWorkspace = probeService(ctx, "uiWorkspace");
      if (uiWorkspace && typeof uiWorkspace.pickDirectory === "function") return Promise.resolve(uiWorkspace.pickDirectory()).then(parsePickedPath);
      const dialog = probeService(ctx, "dialog");
      if (dialog && typeof dialog.pickDirectory === "function") return Promise.resolve(dialog.pickDirectory()).then(parsePickedPath);
      if (ctx && ctx.workspaces && typeof ctx.workspaces.pickDirectory === "function") return Promise.resolve(ctx.workspaces.pickDirectory()).then(parsePickedPath);
      // 全部来源都不可用时必须显式拒绝：调用方据此提示“当前 Host 无法新增工作区”，
      // 否则点击“添加工作区…”会静默无响应（取消选择由 resolve(undefined) 表示，二者不能混淆）。
      return Promise.reject(workspacePickerUnavailable());
    }
    function workspacePickerUnavailable() {
      const error = new Error("workspace picker unavailable");
      error.code = "workspace/picker-unavailable";
      return error;
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

    function preferredAssistant(defaults, readModel) {
      const main = typeof readModel === "function" ? readModel() : null;
      if (main && main.provider && main.model) return main;
      const assistant = defaults && defaults.assistant;
      return assistant && assistant.provider && assistant.model ? assistant : null;
    }
    function selectableWorkspace(preferred, workspaces) {
      const items = Array.isArray(workspaces) ? workspaces : [];
      const key = (path) => {
        const value = String(path || "");
        const windows = /^[a-z]:[\\/]|^\\\\|^\/\//i.test(value);
        const normalized = (windows ? value.replace(/\\/g, "/") : value).replace(/\/+$/, "");
        return windows ? normalized.toLowerCase() : normalized;
      };
      const wanted = key(preferred);
      const matched = wanted && items.find((item) => item && key(item.path) === wanted);
      if (matched && matched.path) return matched.path;
      const first = items.find((item) => item && item.path);
            return first ? first.path : "";
                }
                function workspaceIsListed(cwd, workspaces) {
                  const items = Array.isArray(workspaces) ? workspaces : [];
                  const key = (path) => {
                    const value = String(path || "");
                    const windows = /^[a-z]:[\\/]|^\\\\|^\/\//i.test(value);
                    const normalized = (windows ? value.replace(/\\/g, "/") : value).replace(/\/+$/, "");
                    return windows ? normalized.toLowerCase() : normalized;
                  };
                  const wanted = key(cwd);
                  return Boolean(wanted && items.some((item) => item && key(item.path) === wanted));
                }
                function BindModal({ ch, onClose, onConnected, catalog, permissions, agentPresets, workspaces, defaults, readMainSessionModel, createWorkspace, pickDirectory, modelT, permissionT, presetT, t = fallbackT }) {
      const hasQr = ch.kind === "qr" || ch.kind === "qr-or-credentials";
      const hasManual = ch.kind === "credentials" || ch.kind === "qr-or-credentials";
      const showTabs = hasQr && hasManual;
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
          sendMode: "queue",
          segmentReply: false,
          segmentDelayMinSecs: 1,
          segmentDelayMaxSecs: 2,
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
              if (!hasQr || !workspaceIsListed(settings.cwd, workspaces)) return;
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
      }, [ch.id, hasQr, settings, workspaces]);

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
          if (modalLayers.length && modalLayers[modalLayers.length - 1].owner !== "bind") return;
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
              if (!workspaceIsListed(settings.cwd, workspaces)) {
                setError(t("composer.workspaceRequired"));
                return;
              }
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
        width: 720,
        zIndex: 1100,
        destroyOnHidden: true,
        layerOwner: "bind",
        maskClosable: !saving,
        onCancel: close,
        footer: tab === "manual" && hasManual
          ? h("div", { className: "ima-modal-actions" },
              hostModalButton(t("action.cancel"), close, "outline", { disabled: busy }),
              hostModalButton(busy ? t("action.saving") : t("action.confirm"), saveManual, "primary", { disabled: busy || !workspaceIsListed(settings.cwd, workspaces) }),
            )
          : null,
      },
        showTabs && h("div", {
          className: ["ima-bind-tabs-wrap", saving ? "is-disabled" : ""].filter(Boolean).join(" "),
          "aria-disabled": saving ? "true" : undefined,
        }, h(HostSegmentedTabs, {
          className: "ima-bind-tabs",
          label: t("bind.tabsAria"),
          value: tab,
          onChange: (next) => switchTab(next),
          items: [
            { value: "qr", id: "ima-bind-tab-qr", panelId: "ima-bind-panel-qr", label: t("bind.quick") },
            { value: "manual", id: "ima-bind-tab-manual", panelId: "ima-bind-panel-manual", label: t("bind.manual") },
          ],
        })),
        error && h(NoticeBar, { type: "error" }, error),
        success && h(NoticeBar, { type: "success" }, success),
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
            segmentReplySupported: supportsSegmentReply(ch.id),
            t,
          }),
          h(CommandPermissionSettings, { value: settings.commandPermissions, onSave: commandPermissions => setSettings(current => ({ ...current, commandPermissions })), t }),
        ),
        hasQr && h("div", showTabs ? { className: "ima-bind-panel", id: "ima-bind-panel-qr", role: "tabpanel", "aria-labelledby": "ima-bind-tab-qr", hidden: tab !== "qr" } : null,
          status === "success"
            ? h(NoticeBar, { type: "success" }, t("bind.success"))
            : status === "saving"
              ? h("div", { className: "ima-bind-status" }, t("bind.saving"))
            : src
              ? h("div", { className: "ima-qrbox" },
                h("p", { className: "ima-hint" }, hintOf(ch, t)),
                h("img", { src, alt: t("bind.qrAlt", { channel: channelLabel(ch, t) }) }),
                remain > 0 && h("p", { className: "ima-hint" }, t("bind.expire", { time: Math.floor(remain / 60) + ":" + String(remain % 60).padStart(2, "0") })),
                status === "scanned" && h("p", { className: "ima-hint" }, t("bind.scanned")),
                (status === "expired" || status === "failed") && h("p", { className: "ima-error" }, serverText(pairing && pairing.error, t) || t("bind.retry")),
                hostModalButton(t("bind.refresh"), () => startQr(true), "outline", { disabled: busy }),
              )
              : h("div", { className: "ima-bind-ready" },
                  h("p", { className: "ima-hint" }, hintOf(ch, t)),
                  (busy || status === "starting") && h("div", { className: "ima-bind-status" }, t("bind.generating")),
                  (status === "expired" || status === "failed") && h("div", { className: "ima-error" }, serverText(pairing && pairing.error, t) || t("bind.retry")),
                  hostModalButton(busy ? t("bind.generating") : qrStarted ? t("bind.refresh") : t("action.generateQr"), () => startQr(qrStarted), "primary", { disabled: busy || !workspaceIsListed(settings.cwd, workspaces) || !settings.provider || !settings.model || !settings.permission }),
                )
        ),
        hasManual && h("div", showTabs ? { className: "ima-bind-panel", id: "ima-bind-panel-manual", role: "tabpanel", "aria-labelledby": "ima-bind-tab-manual", hidden: tab !== "manual" } : null,
          ...ch.fields.filter((f) => !f.settingsOnly).map((f) => h("label", { key: f.key, className: "ima-field" },
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
      return h(IconPlusOutline, { size: 14 });
    }

    function formatProviderLabel(provider, defaultLabel, modelT) {
      if (provider === "deepseek-account") {
        const localized = modelT("provider.account");
        if (localized && localized !== "provider.account") return localized;
      }
      return defaultLabel;
    }

    function orderProviders(left, right) {
      const leftRank = left === "deepseek-account" ? 0 : left === "deepseek-official" ? 1 : 2;
      const rightRank = right === "deepseek-account" ? 0 : right === "deepseek-official" ? 1 : 2;
      return leftRank - rightRank;
    }

    function renderModelOptionLabel(item) {
      const isOfficialFlash = (item.provider === "deepseek-account" || item.provider === "deepseek-official") && item.model === "deepseek-flash";
      if (!isOfficialFlash) return item.label;
      return React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 } },
        React.createElement("span", null, item.label),
        React.createElement(Tag, { color: "info" }, "1017")
      );
    }

    function AccountSettingsPicker(props) {
      const t = props.t || fallbackT;
      const modelT = props.modelT || ((key) => key);
      const permissionT = props.permissionT || ((key) => key);
      const presetT = props.presetT || ((key) => key);
      const value = props.value || {};
      const segmentDelayMinSecs = Number.isInteger(value.segmentDelayMinSecs) ? value.segmentDelayMinSecs : 1;
      const segmentDelayMaxSecs = Number.isInteger(value.segmentDelayMaxSecs) ? value.segmentDelayMaxSecs : 2;
      const [addBusy, setAddBusy] = useState(false);
      const [hint, setHint] = useState("");
      const [confirmingFullAccess, setConfirmingFullAccess] = useState(false);
      const [fullAccessAcknowledged, setFullAccessAcknowledged] = useState(false);
      const [segmentGapMinDraft, setSegmentGapMinDraft] = useState(String(segmentDelayMinSecs));
      const [segmentGapMaxDraft, setSegmentGapMaxDraft] = useState(String(segmentDelayMaxSecs));
      const [segmentGapError, setSegmentGapError] = useState("");
      useEffect(() => { setSegmentGapMinDraft(String(segmentDelayMinSecs)); }, [segmentDelayMinSecs]);
      useEffect(() => { setSegmentGapMaxDraft(String(segmentDelayMaxSecs)); }, [segmentDelayMaxSecs]);
      const items = props.workspaces || [];
      const providers = props.catalog || [];
      const permissions = props.permissions || [];
      const provider = value.provider || (value.assistant && value.assistant.provider) || "";
      const model = value.model || (value.assistant && value.assistant.model) || "";
      const effort = value.reasoningEffort || (value.assistant && value.assistant.reasoningEffort) || "";
      const cwd = value.cwd || "";
      const permission = value.permission || "";
      const privateAccess = value.privateAccess === "all" ? "all" : "approved";
      const sendMode = value.sendMode === "steer" ? "steer" : "queue";
      const segmentSupported = typeof props.segmentReplySupported === "boolean"
        ? props.segmentReplySupported
        : supportsSegmentReply(value.platform);
      const segmentReply = value.segmentReply === true;
      const workspace = items.find((item) => item.path === cwd);
      const modelGroups = providers.map((item) => {
        const providerName = formatProviderLabel(item.id, item.name || item.id, modelT);
        return {
          id: item.id,
          name: providerName,
          models: (item.models || []).map((entry) => ({
            value: item.id + "::" + entry.id,
            provider: item.id,
            providerName: providerName,
            model: entry.id,
            label: entry.name || entry.id,
            description: entry.description,
            reasoning: entry.reasoning,
          })),
        };
      }).filter((item) => item.models.length > 0).sort((left, right) => orderProviders(left.id, right.id));
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

      // 分段间隔手填秒数：失焦时统一校验，不合法就保留草稿并提示，不提交脏值。
      const parseSegmentSecs = (raw) => {
        const text = String(raw == null ? "" : raw).trim();
        if (text === "") return undefined;
        const parsed = Number(text);
        if (!Number.isFinite(parsed)) return undefined;
        return Math.min(60, Math.max(0, Math.round(parsed)));
      };
      const commitSegmentGap = () => {
        const min = parseSegmentSecs(segmentGapMinDraft);
        const max = parseSegmentSecs(segmentGapMaxDraft);
        if (min === undefined || max === undefined) { setSegmentGapError(t("account.segmentGapInvalid")); return; }
        if (max < min) { setSegmentGapError(t("account.segmentGapOrder")); return; }
        setSegmentGapError("");
        const patch = {};
        if (min !== segmentDelayMinSecs) patch.segmentDelayMinSecs = min;
        if (max !== segmentDelayMaxSecs) patch.segmentDelayMaxSecs = max;
        if (patch.segmentDelayMinSecs === undefined && patch.segmentDelayMaxSecs === undefined) return;
        update(patch);
      };

      const addWorkspace = (path) => {
        const next = (path || "").trim();
        if (!next) { setHint(t("error.chooseWorkspace")); return Promise.resolve(); }
        if (typeof props.createWorkspace !== "function") { setHint(t("error.workspaceUnavailable")); return Promise.resolve(); }
        setAddBusy(true);
        return Promise.resolve().then(() => props.createWorkspace({ path: next })).then((created) => {
          const cwdPath = created && (created.path || created.cwd);
          if (typeof cwdPath !== "string" || !cwdPath.trim()) {
            setHint(t("error.addWorkspace"));
            return;
          }
          update({ cwd: cwdPath });
        }).catch((error) => setHint((error && error.message) || t("error.addWorkspace")))
          .finally(() => setAddBusy(false));
      };
      const onAddWorkspace = () => {
        setHint("");
        if (typeof props.pickDirectory !== "function") {
          setHint(t("error.workspaceUnavailable"));
          return Promise.resolve();
        }
        setAddBusy(true);
        return Promise.resolve()
          .then(() => props.pickDirectory())
          .then((picked) => {
            if (typeof picked === "string" && picked.trim()) {
              return addWorkspace(picked);
            }
          })
          .catch((error) => {
            setHint(error && error.code === "workspace/picker-unavailable"
              ? t("error.workspaceUnavailable")
              : (error && error.message) || t("error.addWorkspace"));
          })
          .finally(() => {
            setAddBusy(false);
          });
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

      const segmentReplyTip = t("account.segmentReplyNote");
      const tipAnchor = h("span", {
        className: "ima-label-tip",
        title: HostTooltip ? undefined : segmentReplyTip,
        "aria-label": segmentReplyTip,
        role: "button",
        tabIndex: 0,
        style: {
          display: "inline-flex",
          alignItems: "center",
          cursor: "help",
          color: "var(--dsw-alias-label-tertiary, var(--ima-muted))",
          marginLeft: 2,
        },
      }, h(IconInfoOutline, { size: 12 }));

      const segmentReplyLabel = h("span", { style: { display: "inline-flex", alignItems: "center", gap: 4 } },
        h("span", null, t("account.segmentReply")),
        HostTooltip
          ? h(HostTooltip, { label: segmentReplyTip, portal: true, side: "top" }, tipAnchor)
          : tipAnchor,
      );

      const sessionIdleMinutes = Number.isFinite(value.sessionIdleMinutes) ? Math.max(0, Math.round(value.sessionIdleMinutes)) : 0;
      const sessionIdleTip = t("account.sessionIdleNote");
      const sessionIdleTipAnchor = h("span", {
        className: "ima-label-tip",
        title: HostTooltip ? undefined : sessionIdleTip,
        "aria-label": sessionIdleTip,
        role: "button",
        tabIndex: 0,
        style: {
          display: "inline-flex",
          alignItems: "center",
          cursor: "help",
          color: "var(--dsw-alias-label-tertiary, var(--ima-muted))",
          marginLeft: 2,
        },
      }, h(IconInfoOutline, { size: 12 }));

      const sessionIdleLabel = h("span", { style: { display: "inline-flex", alignItems: "center", gap: 4 } },
        h("span", null, t("account.sessionIdle")),
        HostTooltip
          ? h(HostTooltip, { label: sessionIdleTip, portal: true, side: "top" }, sessionIdleTipAnchor)
          : sessionIdleTipAnchor,
      );

      const standardIdlePresets = [0, 30, 60, 120, 360, 720, 1440];
      const sessionIdleOptions = standardIdlePresets.map((mins) => {
        if (mins === 0) return { value: "0", label: t("account.sessionIdleOff") };
        if (mins < 60) return { value: String(mins), label: t("account.sessionIdleMin", { n: mins }) };
        const hours = mins / 60;
        return {
          value: String(mins),
          label: hours === 1 ? t("account.sessionIdleHour", { n: hours }) : t("account.sessionIdleHours", { n: hours }),
        };
      });
      if (sessionIdleMinutes > 0 && !standardIdlePresets.includes(sessionIdleMinutes)) {
        sessionIdleOptions.splice(1, 0, {
          value: String(sessionIdleMinutes),
          label: sessionIdleMinutes % 60 === 0
            ? t("account.sessionIdleHours", { n: sessionIdleMinutes / 60 })
            : t("account.sessionIdleMin", { n: sessionIdleMinutes }),
        });
      }

      return h("div", { className: "ima-account-settings" + (props.compact ? " compact" : "") },
        field("workspace", props.workspaceLabel || t("account.workspace"), items.length === 0
          ? h("div", null,
              h(Button, { variant: "primary", icon: h(PlusIcon), disabled: addBusy, onClick: onAddWorkspace }, t("composer.addWorkspace")),
              h("div", { className: "ima-picker-note warning" }, t("composer.workspaceRequired")),
            )
          : h(Select, {
          className: "ima-account-picker ima-workspace-picker",
          value: cwd || undefined,
          placeholder: t("account.selectWorkspace"),
          "aria-label": props.workspaceLabel || t("account.workspace"),
          popupMatchSelectWidth: false,
          options: items.map((item) => ({ value: item.path, label: item.title || item.path })),
          footer: [{ value: "add-workspace", label: t("composer.addWorkspace"), disabled: addBusy }],
          onFooter: () => { onAddWorkspace(); },
          notFoundContent: t("composer.noWorkspaces"),
          onChange: (next) => update({ cwd: next }),
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
              options: group.models.map((item) => ({ value: item.value, label: renderModelOptionLabel(item) })),
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
        field("sendMode", t("account.sendMode"), h(Select, {
          className: "ima-account-picker",
          value: sendMode,
          "aria-label": t("account.sendMode"),
          options: [
            { value: "queue", label: t("account.sendQueue") },
            { value: "steer", label: t("account.sendSteer") },
          ],
          onChange: (next) => update({ sendMode: next }),
        })),
        field("sessionIdle", sessionIdleLabel, h(Select, {
          className: "ima-account-picker",
          value: String(sessionIdleMinutes),
          "aria-label": t("account.sessionIdle"),
          options: sessionIdleOptions,
          onChange: (next) => update({ sessionIdleMinutes: Number(next) }),
        })),
        segmentSupported && field("segmentReply", segmentReplyLabel, h(Select, {
          className: "ima-account-picker",
          value: segmentReply ? "segmented" : "full",
          "aria-label": t("account.segmentReply"),
          options: [
            { value: "full", label: t("account.segmentFull") },
            { value: "segmented", label: t("account.segmentSplit") },
          ],
          onChange: (next) => update({ segmentReply: next === "segmented" }),
        })),
        sendMode === "steer" && h("div", { className: "ima-picker-note" }, t("account.sendSteerNote")),
        segmentSupported && segmentReply && field("segmentGap", t("account.segmentGap"), h("div", { className: "ima-segment-gap" },
          h(Input, {
            type: "number",
            min: 0,
            max: 60,
            step: 1,
            inputMode: "numeric",
            className: "ima-segment-gap-input",
            value: segmentGapMinDraft,
            placeholder: "1",
            "aria-label": t("account.segmentGapMin"),
            onChange: (event) => { setSegmentGapMinDraft(event.target.value); setSegmentGapError(""); },
            onBlur: commitSegmentGap,
            onKeyDown: (event) => { if (event.key === "Enter") event.currentTarget.blur(); },
          }),
          h("span", { className: "ima-segment-gap-sep" }, "~"),
          h(Input, {
            type: "number",
            min: 0,
            max: 60,
            step: 1,
            inputMode: "numeric",
            className: "ima-segment-gap-input",
            value: segmentGapMaxDraft,
            placeholder: "2",
            "aria-label": t("account.segmentGapMax"),
            onChange: (event) => { setSegmentGapMaxDraft(event.target.value); setSegmentGapError(""); },
            onBlur: commitSegmentGap,
            onKeyDown: (event) => { if (event.key === "Enter") event.currentTarget.blur(); },
          }),
          h("span", { className: "ima-segment-gap-unit" }, t("account.seconds")),
        )),
        segmentSupported && segmentReply && segmentGapError && h("div", { className: "ima-picker-note warning" }, segmentGapError),
        segmentSupported && segmentReply && h("div", { className: "ima-picker-note" }, t("account.segmentGapNote")),
        privateAccess === "all" && h("div", { className: "ima-picker-note warning" }, t("settings.publicChatNotice")),
        hint && h("div", { className: "ima-picker-note" }, hint),
        props.showAutoNameNote && h("div", { className: "ima-picker-note" }, t("account.autoNameNote")),
        h(Modal, {
          open: confirmingFullAccess,
          layerOwner: "full-access",
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
      const [proxyModeDraft, setProxyModeDraft] = useState(account.proxyMode || "inherit");
      const [proxyUrlDraft, setProxyUrlDraft] = useState(account.proxyUrl || "");
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
        setProxyModeDraft(account.proxyMode || "inherit");
        setNote("");
      }, [account.id, account.cwd, account.permission, account.agentPreset, account.privateAccess, account.sendMode, account.sessionIdleMinutes, account.segmentReply, account.segmentDelayMinSecs, account.segmentDelayMaxSecs, account.proxyMode, account.proxyConfigured, JSON.stringify(account.commandPermissions), account.receiveEnabled, account.assistant && account.assistant.provider, account.assistant && account.assistant.model, account.assistant && account.assistant.reasoningEffort]);
      useEffect(() => {
        setProxyUrlDraft(account.proxyUrl || "");
      }, [account.id, account.proxyUrl]);
      const save = (patch) => {
        const seq = ++saveSeq.current;
        const next = { ...draft, ...patch };
        setDraft(next);
        if (next.proxyMode) setProxyModeDraft(next.proxyMode);
        setNote("status.saving");
        const payload = {
          name: next.name,
          cwd: next.cwd,
          provider: next.assistant.provider,
          model: next.assistant.model,
          reasoningEffort: next.assistant.reasoningEffort || null,
          permission: next.permission,
          privateAccess: next.privateAccess,
          sendMode: next.sendMode,
          sessionIdleMinutes: Number.isFinite(next.sessionIdleMinutes) ? Math.max(0, Math.round(next.sessionIdleMinutes)) : 0,
          segmentReply: next.segmentReply === true,
          segmentDelayMinSecs: next.segmentDelayMinSecs,
          segmentDelayMaxSecs: next.segmentDelayMaxSecs,
          agentPreset: next.agentPreset,
          commandPermissions: next.commandPermissions,
        };
        if (account.platform === "telegram" || account.platform === "discord") {
          const hasProxyPatch = Object.prototype.hasOwnProperty.call(patch, "proxyMode") || Object.prototype.hasOwnProperty.call(patch, "proxyUrl");
          if (hasProxyPatch) {
            payload.proxyMode = next.proxyMode || proxyModeDraft;
            payload.proxyUrl = Object.prototype.hasOwnProperty.call(patch, "proxyUrl") ? patch.proxyUrl : proxyUrlDraft;
          }
        }
        return onSave(account.id, payload).then((ok) => {
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
            segmentReplySupported: account.segmentReplySupported !== false,
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
          (account.platform === "telegram" || account.platform === "discord") && h("div", { className: "ima-proxy-settings" },
            h("label", { className: "ima-picker-field" },
              h("span", { className: "ima-picker-label" }, t("account.proxyMode")),
              h(Select, {
              className: "ima-account-picker",
              value: proxyModeDraft,
              "aria-label": t("account.proxyMode"),
              options: [
                { value: "inherit", label: t("account.proxyInherit") },
                { value: "direct", label: t("account.proxyDirect") },
                { value: "custom", label: t("account.proxyCustom") },
              ],
              onChange: (next) => {
                setProxyModeDraft(next);
                if (next === "custom" && !account.proxyConfigured) setDraft({ ...draft, proxyMode: next });
                else save({ proxyMode: next, proxyUrl: "" });
              },
            })),
            proxyModeDraft === "custom" && h("label", { className: "ima-picker-field" },
              h("span", { className: "ima-picker-label" }, t("account.proxyUrl")),
              h(Input, {
                type: "text",
                autoComplete: "url",
                value: proxyUrlDraft,
                placeholder: t(account.proxyConfigured ? "account.proxySaved" : "http://127.0.0.1:7897"),
                "aria-label": t("account.proxyUrl"),
                onChange: (event) => { setProxyUrlDraft(event.target.value); setDraft({ ...draft, proxyMode: "custom" }); },
                onBlur: (event) => {
                  const value = event.target.value.trim();
                  save({ proxyMode: "custom", proxyUrl: value }).then((ok) => {
                    if (ok && !value) setProxyUrlDraft(account.proxyUrl || "");
                  });
                },
              }),
            ),
            h("div", { className: "ima-picker-note" }, t("account.proxyNote")),
          ),
          h(CommandPermissionSettings, { value: draft.commandPermissions, onSave: commandPermissions => save({ commandPermissions }), t }),
          note && h("div", { className: note === "status.saved" ? "ima-save-note ok" : "ima-save-note" }, t(note)),
          h("div", { className: "ima-inspector-actions" },
            h(Button, { variant: "outline", disabled: Boolean(busy) || checking, onClick: check }, t(checking ? "connection.checking" : "action.checkConnection")),
            h(Button, { variant: "outline", disabled: Boolean(busy) || checking, onClick: () => { setCheckResult(null); return onAction(account.id, "reconnect"); } }, t("action.reconnectAccount")),
            h(Button, { variant: "outline", danger: true, disabled: Boolean(busy) || checking, onClick: () => {
              modal.confirm({
                title: t("action.removeAccount"),
                description: t("account.removeConfirm"),
                okText: t("action.removeAccount"),
                cancelText: t("action.cancel"),
                okButtonProps: { danger: true },
                onOk: () => onAction(account.id, "remove"),
              });
            } }, t("action.removeAccount")),
          ),
          checkResult && h(AccountConnectionCheck, { account: checkResult, t }),
          checkFailed && h(NoticeBar, { type: "error", role: "alert" }, t(typeof checkFailed === "string" ? checkFailed : "connection.checkFailed")),
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
    function FeedbackIcon() {
      return h(IconEditOutline, { size: 16 });
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
          if (modalLayers.length && modalLayers[modalLayers.length - 1].owner !== "settings-account") return;
          if (event.key !== "Escape") return;
          if (document.querySelector("[role='listbox'], [role='menu'], .ima-menu-select-dropdown")) return;
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
                h(PrimitiveButton, {
                  variant: "outline",
                  size: "sm",
                  "aria-label": t("settings.viewProject"),
                  icon: h(GithubMark16),
                  onClick: () => { window.open("https://github.com/MichengAI/dsh-im-connect", "_blank", "noreferrer"); }
                }, t("settings.viewProject")),
                h(PrimitiveButton, {
                  variant: "outline",
                  size: "sm",
                  "aria-label": t("settings.feedback"),
                  icon: h(FeedbackIcon),
                  onClick: () => { window.open("https://github.com/MichengAI/dsh-im-connect/issues", "_blank", "noreferrer"); }
                }, t("settings.feedback")),
              ),
            ),
            h("p", { className: "ima-sub" }, t("settings.description")),
          ),
        ),
        error && h(NoticeBar, { type: "error", className: "ima-error" }, error),
        pending.length > 0 && h("div", { className: "ima-feedback ima-feedback-warning ima-pending", role: "region" },
          h("div", { className: "ima-feedback-head" },
            h("span", { className: "ima-feedback-icon" }, alertIcon("warning")),
            h("span", { className: "ima-feedback-title" }, t("pending.notice")),
          ),
          h("div", { className: "ima-pending-list" },
            ...pending.map((p) => h("div", { key: p.channelId + p.userId, className: "ima-pending-row" },
              h("span", { style: { flex: 1 } }, (p.username || p.userId) + " · " + (accountLabel(allAccounts.find((item) => item.id === p.channelId), t) || p.channelId)),
              h(Button, { variant: "primary", size: "sm", onClick: () => onAction(p.channelId, "approve", { userId: p.userId }) }, t("action.approve")),
              h(Button, { variant: "outline", size: "sm", danger: true, onClick: () => onAction(p.channelId, "deny", { userId: p.userId }) }, t("action.deny")),
            )),
          ),
        ),
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
                          color: busy[account.id] ? "processing" : account.receiveConfigured === false ? "warning" : account.connectionState === "connected" ? "success" : "warning",
                          bordered: false,
                          className: "ima-account-status-tag" + (busy[account.id] ? " is-busy" : ""),
                          icon: busy[account.id] ? createSpinner() : undefined,
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
          width: 720,
          zIndex: 1100,
          layerOwner: "settings-account",
          destroyOnHidden: true,
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

    function IconChevron() {
      return h(IconChevronRightOutline, { size: 14 });
    }

    // ---------------------------------------------------------------------
    // 频道页签：直接复用官方 WorkspaceBrowser。
    // 自绘列表已删除；官方树不可用时只显示不可用提示。
    // ---------------------------------------------------------------------

    const CHANNEL_WORKSPACE_PREFIX = "dsh-im-channel:";
    const CHANNEL_GROUP_IDS = ["weixin", "wecom", "qq", "feishu", "lark", "dingtalk", "telegram", "discord", "slack"];
    const EMPTY_SESSION_STATE = { ids: [], byId: {}, current: null };
    const EMPTY_WORKSPACE_STATE = { items: [], archivedSessionIds: [], pinnedSessionIds: [], state: "idle", phase: "ready", error: null };
    const CHANNEL_GROUP_OPTION_ATTR = "data-ima-channel-group-option";
    const CHANNEL_GROUP_MENU_ATTR = "data-ima-channel-group-menu";

    function channelWorkspaceId(id) {
      return CHANNEL_WORKSPACE_PREFIX + String(id || "");
    }

    function channelIdFromWorkspaceId(workspaceId) {
      const value = String(workspaceId || "");
      return value.startsWith(CHANNEL_WORKSPACE_PREFIX) ? value.slice(CHANNEL_WORKSPACE_PREFIX.length) : undefined;
    }

    /** 频道页签把官方“添加工作区”按钮复用为“添加频道”。 */
    function channelAddFlow(select) {
      return select(true);
    }

    function noopChannelAction() {}

    function copySessionOrders(orders) {
      return Object.fromEntries(Object.entries(orders || {}).map(([key, order]) => [key, [...order]]));
    }

    /** 频道页签使用独立视图状态，不污染上方任务树。 */
    function createChannelViewStore() {
      let state = {
        groupBy: "channel",
        orderBy: "updated",
        groupExpansion: {},
        sessionOrderByAccount: {},
        archivedFilter: "default",
      };
      const listeners = new Set();
      const publish = (next) => {
        state = next;
        for (const listener of listeners) listener();
      };
      const actions = {
        setGroupBy(mode) {
          if (mode !== state.groupBy) publish(Object.assign({}, state, { groupBy: mode }));
        },
        setOrderBy(mode, initialOrders) {
          if (mode === state.orderBy) return;
          publish(Object.assign({}, state, {
            orderBy: mode,
            sessionOrderByAccount: mode === "manual" ? copySessionOrders(initialOrders) : {},
          }));
        },
        setGroupExpanded(key, expanded) {
          if (state.groupExpansion[key] === expanded) return;
          publish(Object.assign({}, state, { groupExpansion: Object.assign({}, state.groupExpansion, { [key]: expanded }) }));
        },
        retainAccountKeys(workspaceKeys) {
          const retained = new Set(workspaceKeys || []);
          const groupExpansion = Object.fromEntries(Object.entries(state.groupExpansion).filter(([key]) => retained.has(key)));
          const sessionOrderByAccount = Object.fromEntries(Object.entries(state.sessionOrderByAccount).filter(([key]) => retained.has(key)));
          if (Object.keys(groupExpansion).length === Object.keys(state.groupExpansion).length
            && Object.keys(sessionOrderByAccount).length === Object.keys(state.sessionOrderByAccount).length) return;
          publish(Object.assign({}, state, { groupExpansion, sessionOrderByAccount }));
        },
        setSessionOrder(accountKey, order, initialOrders) {
          const sessionOrderByAccount = state.orderBy === "manual"
            ? Object.assign({}, state.sessionOrderByAccount, { [accountKey]: [...order] })
            : Object.assign(copySessionOrders(initialOrders), { [accountKey]: [...order] });
          publish(Object.assign({}, state, { orderBy: "manual", sessionOrderByAccount }));
        },
        syncSessionOrders(orders) {
          if (state.orderBy !== "manual") return;
          publish(Object.assign({}, state, { sessionOrderByAccount: Object.assign({}, state.sessionOrderByAccount, copySessionOrders(orders)) }));
        },
        pinSessionOrder(sessionId, accountKeys, source) {
          const selected = new Set(accountKeys || []);
          const sessionOrderByAccount = Object.fromEntries(Object.entries((source && source.members) || {}).map(([key, members]) => {
            const current = state.sessionOrderByAccount[key] || members;
            const order = selected.has(key) ? [sessionId, ...current.filter((id) => id !== sessionId)] : [...current];
            return [key, order];
          }));
          publish(Object.assign({}, state, { sessionOrderByAccount }));
        },
        setArchivedFilter(filter) {
          if (filter !== state.archivedFilter) publish(Object.assign({}, state, { archivedFilter: filter }));
        },
        ensureExpanded(keys) {
          let changed = false;
          const groupExpansion = Object.assign({}, state.groupExpansion);
          for (const key of keys || []) {
            if (key === "" || groupExpansion[key] !== undefined) continue;
            groupExpansion[key] = true;
            changed = true;
          }
          if (changed) publish(Object.assign({}, state, { groupExpansion }));
        },
      };
      return {
        getSnapshot: () => state,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        actions,
      };
    }

    let sharedChannelViewStore;
    function getChannelViewStore() {
      sharedChannelViewStore = sharedChannelViewStore || createChannelViewStore();
      return sharedChannelViewStore;
    }

    const channelSessionStateCache = new WeakMap();
    const channelSyntheticWorkspaceCache = new WeakMap();
    const channelRealWorkspaceCache = new WeakMap();

    /** 只保留 /channels 分组里的会话，避免官方树出现“未分组”桶。 */
    function channelMemberSessionState(state, memberIds) {
      const src = state || EMPTY_SESSION_STATE;
      const hit = channelSessionStateCache.get(src);
      if (hit && hit.ids === memberIds) return hit.result;
      const ids = (src.ids || []).filter((id) => memberIds.has(String(id)));
      const result = cacheFilteredSessions(src, ids);
      channelSessionStateCache.set(src, { ids: memberIds, result });
      return result;
    }

    function channelGroupsFromSessionState(state, t) {
      const groups = new Map(CHANNEL_GROUP_IDS.map((id) => [id, {
        id,
        label: channelLabel({ id }, t),
        sessions: [],
      }]));
      const src = state || EMPTY_SESSION_STATE;
      for (const id of src.ids || []) {
        const group = groups.get(channelIdOfSession(id));
        const session = src.byId && src.byId[id];
        if (group && session) group.sessions.push({ sessionId: id, updatedAt: session.updatedAt });
      }
      return [...groups.values()].filter((group) => group.sessions.length > 0);
    }

    function channelGroupCreatedAt(group) {
      let earliest = Infinity;
      for (const session of group.sessions || []) {
        const timestamp = Date.parse(session.updatedAt || "");
        if (Number.isFinite(timestamp) && timestamp < earliest) earliest = timestamp;
      }
      return new Date(Number.isFinite(earliest) ? earliest : 0).toISOString();
    }

    /**
     * 按频道分组：每个频道合成一个官方 WorkspaceView。
     * 保留宿主的 phase/state/归档集合，官方浏览器才能正常渲染。
     */
    function syntheticChannelWorkspaceState(state, groups, t) {
      const src = state || EMPTY_WORKSPACE_STATE;
      const key = groups.map((group) => [
        group.id,
        channelLabel(group, t),
        channelGroupCreatedAt(group),
        (group.sessions || []).map((session) => session.sessionId).join(","),
      ].join("\0")).join("\0\0");
      const hit = channelSyntheticWorkspaceCache.get(src);
      if (hit && hit.key === key) return hit.result;
      const items = groups.filter((group) => (group.sessions || []).length > 0).map((group) => {
        const workspaceId = channelWorkspaceId(group.id);
        return {
          workspaceId,
          id: workspaceId,
          title: channelLabel(group, t),
          path: "",
          sessionIds: (group.sessions || []).map((session) => session.sessionId),
          createdAt: channelGroupCreatedAt(group),
        };
      });
      const result = Object.assign({}, src, { items, phase: "ready" });
      channelSyntheticWorkspaceCache.set(src, { key, result });
      return result;
    }

    /** 按工作区/工作区树：保留真实工作区，只过滤出频道会话。 */
    function channelRealWorkspaceState(state, memberIds) {
      const src = state || EMPTY_WORKSPACE_STATE;
      const hit = channelRealWorkspaceCache.get(src);
      if (hit && hit.ids === memberIds) return hit.result;
      const items = (src.items || []).map((workspace) => {
        const sessionIds = (workspace.sessionIds || []).filter((id) => memberIds.has(String(id)));
        return sessionIds.length === (workspace.sessionIds || []).length
          ? workspace
          : Object.assign({}, workspace, { sessionIds });
      });
      const result = Object.assign({}, src, { items });
      channelRealWorkspaceCache.set(src, { ids: memberIds, result });
      return result;
    }

    let channelIconCssValue;

    /** 把 React 元素渲染成可直接注入官方 DOM 的 HTML。 */
    function channelMarkup(element) {
      if (typeof document === "undefined") return "";
      const hasCreateRoot = typeof ReactDOM.createRoot === "function";
      const createRoot = ReactDOM.createRoot || function createRootFallback(host) {
        return {
          render(node) { if (typeof ReactDOM.render === "function") ReactDOM.render(node, host); },
          unmount() { if (typeof ReactDOM.unmountComponentAtNode === "function") ReactDOM.unmountComponentAtNode(host); },
        };
      };
      try {
        const host = document.createElement("div");
        const root = createRoot(host);
        try {
          if (hasCreateRoot && typeof ReactDOM.flushSync === "function") ReactDOM.flushSync(() => root.render(element));
          else root.render(element);
          return host.innerHTML;
        } finally {
          try { root.unmount(); } catch { /* ignore */ }
        }
      } catch {
        return "";
      }
    }

    const channelLogoUrlCache = new Map();
    /** 频道品牌标 data URL，供分组头和会话行复用。 */
    function channelLogoUrl(id) {
      if (channelLogoUrlCache.has(id)) return channelLogoUrlCache.get(id);
      const markup = channelMarkup(h(BrandMark, { id, compact: true }));
      const url = markup ? `url("data:image/svg+xml,${encodeURIComponent(markup)}")` : "";
      channelLogoUrlCache.set(id, url);
      return url;
    }

    /** 频道分组头图标：用品牌标覆盖官方文件夹图标，并保持悬停时可见。 */
    function channelIconCss() {
      if (channelIconCssValue !== undefined) return channelIconCssValue;
      if (typeof document === "undefined") {
        channelIconCssValue = "";
        return channelIconCssValue;
      }
      channelIconCssValue = CHANNEL_GROUP_IDS.map((id) => {
        const logo = channelLogoUrl(id);
        if (!logo) return "";
        const row = `[data-row-key="workspace:${channelWorkspaceId(id)}"]`;
        return `.ima-channel-official ${row}>span:first-child>svg{display:none!important}`
          + `.ima-channel-official ${row}>span:first-child{display:inline-flex!important;background:${logo} center/contain no-repeat!important}`
          // 宿主在悬停时用 chevron 换掉文件夹；频道分组保持品牌图标可见。
          + `.ima-channel-official ${row}:hover>span:first-child{display:inline-flex!important}`
          + `.ima-channel-official ${row}:hover>span:nth-child(2){display:none!important}`;
      }).join("");
      return channelIconCssValue;
    }

    let channelWorkspaceIconCache = { key: "", css: "" };
    /**
     * 按工作区/工作区树分组时，如果某个工作区的频道会话都来自同一个频道，
     * 用频道品牌标替换文件夹。混合频道的工作区保持官方文件夹图标。
     */
    function channelWorkspaceIconCss(workspaces, memberIds) {
      const entries = [];
      for (const workspace of workspaces || []) {
        const workspaceId = workspace.workspaceId || workspace.id;
        if (!workspaceId) continue;
        const channels = new Set();
        for (const sessionId of workspace.sessionIds || []) {
          if (!memberIds.has(String(sessionId))) continue;
          const channelId = channelIdOfSession(sessionId);
          if (channelId) channels.add(channelId);
        }
        if (channels.size !== 1) continue;
        const channelId = [...channels][0];
        if (!channelLogoUrl(channelId)) continue;
        entries.push([workspaceId, channelId]);
      }
      const key = entries.map(([workspaceId, channelId]) => `${workspaceId}\0${channelId}`).join("\0\0");
      if (channelWorkspaceIconCache.key === key) return channelWorkspaceIconCache.css;
      const css = entries.map(([workspaceId, channelId]) => {
        const logo = channelLogoUrl(channelId);
        const row = `[data-row-key=${JSON.stringify("workspace:" + workspaceId)}]`;
        const scope = `.ima-channel-official:not([data-mode="channel"])`;
        return `${scope} ${row}>span:first-child>svg{display:none!important}`
          + `${scope} ${row}>span:first-child{display:inline-flex!important;background:${logo} center/contain no-repeat!important}`
          + `${scope} ${row}:hover>span:first-child{display:inline-flex!important}`
          + `${scope} ${row}:hover>span:nth-child(2){display:none!important}`;
      }).join("");
      channelWorkspaceIconCache = { key, css };
      return css;
    }

    /**
     * 官方视图选项菜单没有扩展位，注入第四个分组项「按频道」。
     * 只在频道页签挂载期间生效。
     */
    function installChannelGroupOption(options) {
      if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => {};
      let frame;
      const closeMenu = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      const inject = (menu) => {
        const text = menu.textContent || "";
        if (!options.groupLabel || !options.workspaceLabel
          || !text.includes(options.groupLabel) || !text.includes(options.workspaceLabel)) return;
        if (menu.querySelector(`[${CHANNEL_GROUP_OPTION_ATTR}="true"]`) !== null) return;
        const items = [...menu.querySelectorAll('button[role="menuitem"]')];
        const first = items[0];
        if (!first) return;
        const wrapper = first.parentElement;
        if (!wrapper) return;
        const clone = wrapper.cloneNode(true);
        const button = clone.querySelector('button[role="menuitem"]');
        if (!button) return;
        button.setAttribute(CHANNEL_GROUP_OPTION_ATTR, "true");
        button.removeAttribute("aria-disabled");
        button.removeAttribute("disabled");
        button.disabled = false;
        button.classList.remove("danger");
        for (const svg of button.querySelectorAll(":scope > svg")) svg.remove();
        const spans = button.querySelectorAll("span");
        if (spans[0] !== undefined) spans[0].innerHTML = channelMarkup(h(IconQueueOutline, { size: 16 }));
        if (spans[1] !== undefined) spans[1].textContent = options.label;
        else button.textContent = options.label;
        if (options.checked) {
          const check = document.createElement("span");
          check.innerHTML = channelMarkup(h(IconCheckOutline, { size: 16 }));
          const svg = check.firstElementChild;
          if (svg !== null) {
            if (svg.style) svg.style.marginLeft = "auto";
            button.append(svg);
          }
        }
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          closeMenu();
          window.setTimeout(options.onSelect, 0);
        });
        wrapper.parentElement?.insertBefore(clone, wrapper);
      };
      const scan = () => {
        frame = undefined;
        for (const menu of document.querySelectorAll('[role="menu"]')) inject(menu);
      };
      const schedule = () => {
        if (frame !== undefined) return;
        frame = window.requestAnimationFrame(scan);
      };
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });
      schedule();
      return () => {
        if (frame !== undefined) window.cancelAnimationFrame(frame);
        observer.disconnect();
        for (const item of document.querySelectorAll(`[${CHANNEL_GROUP_OPTION_ATTR}="true"]`)) item.parentElement?.remove();
      };
    }

    /**
     * 官方工作区分组菜单只有重命名/删除；频道组合成工作区需要「频道设置」，因此注入设置入口。
     */
    function installChannelGroupMenu(options) {
      if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => {};
      let channelId;
      let rememberedAt = 0;
      let frame;
      const closeMenu = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      const remember = (event) => {
        const target = event.target && typeof event.target.closest === "function" ? event.target : undefined;
        if (target === undefined) return;
        const row = target.closest(`[data-row-key^="workspace:${CHANNEL_WORKSPACE_PREFIX}"]`);
        if (row !== null) {
          const key = row.getAttribute("data-row-key") || "";
          channelId = channelIdFromWorkspaceId(key.slice("workspace:".length));
          rememberedAt = performance.now();
          return;
        }
        if (target.closest('[role="menu"]') === null) channelId = undefined;
      };
      const hiddenItems = new Map();
      const hideOthers = (menu, ours) => {
        for (const item of menu.querySelectorAll('button[role="menuitem"]')) {
          if (ours.has(item)) continue;
          if (!hiddenItems.has(item)) {
            hiddenItems.set(item, {
              display: item.style.display,
              ariaHidden: item.getAttribute("aria-hidden"),
            });
          }
          item.style.display = "none";
          item.setAttribute("aria-hidden", "true");
        }
      };
      const inject = (menu) => {
        if (channelId === undefined || performance.now() - rememberedAt > 2000) return;
        if (menu.querySelector(`[${CHANNEL_GROUP_MENU_ATTR}="true"]`) !== null) return;
        const items = [...menu.querySelectorAll('button[role="menuitem"]')];
        if (items.length === 0) return;
        const menuText = items.map((item) => item.textContent || "").join(" ");
        if (!/(删除工作区|Delete workspace)/i.test(menuText)) return;
        const group = options.resolve(channelId);
        if (!group) return;
        const template = items.find((item) => /^(重命名|Rename)$/i.test((item.textContent || "").trim()))
          || items.find((item) => !item.disabled && !/danger|删除|Delete/i.test(item.textContent || ""))
          || items[0];
        const wrapper = template.parentElement;
        if (!wrapper) return;
        const build = (label, icon, onClick) => {
          const clone = wrapper.cloneNode(true);
          const button = clone.querySelector('button[role="menuitem"]');
          if (!button) return undefined;
          clone.removeAttribute(CHANNEL_GROUP_MENU_ATTR);
          button.removeAttribute(CHANNEL_GROUP_MENU_ATTR);
          button.removeAttribute("aria-disabled");
          button.removeAttribute("disabled");
          button.disabled = false;
          button.style.opacity = "";
          button.style.cursor = "";
          button.classList.remove("danger");
          button.setAttribute(CHANNEL_GROUP_MENU_ATTR, "true");
          const spans = button.querySelectorAll("span");
          if (spans[0] !== undefined) spans[0].innerHTML = icon;
          if (spans[1] !== undefined) spans[1].textContent = label;
          else button.textContent = label;
          let fired = false;
          const activate = (event) => {
            if (fired) return;
            fired = true;
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
            closeMenu();
            // 等宿主菜单完成卸载后再打开设置，避免同一次点击被菜单的关闭逻辑吞掉。
            window.setTimeout(onClick, 50);
          };
          button.addEventListener("click", activate);
          button.addEventListener("pointerup", (event) => {
            if (event.button === 0) activate(event);
          });
          return clone;
        };
        const node = build(options.settingsLabel, channelMarkup(h(ChannelMenuSettingsIcon)), () => options.onSettings(group));
        if (node) wrapper.parentElement?.insertBefore(node, wrapper);
        const injected = new Set(menu.querySelectorAll(`[${CHANNEL_GROUP_MENU_ATTR}="true"]`));
        if (injected.size > 0) hideOthers(menu, injected);
      };
      const scan = () => {
        frame = undefined;
        for (const menu of document.querySelectorAll('[role="menu"]')) inject(menu);
      };
      const schedule = () => {
        if (frame !== undefined) return;
        frame = window.requestAnimationFrame(scan);
      };
      document.addEventListener("pointerdown", remember, true);
      document.addEventListener("click", remember, true);
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });
      schedule();
      return () => {
        if (frame !== undefined) window.cancelAnimationFrame(frame);
        observer.disconnect();
        document.removeEventListener("pointerdown", remember, true);
        document.removeEventListener("click", remember, true);
        for (const [item, previous] of hiddenItems) {
          item.style.display = previous.display;
          if (previous.ariaHidden === null) item.removeAttribute("aria-hidden");
          else item.setAttribute("aria-hidden", previous.ariaHidden);
        }
        hiddenItems.clear();
        for (const item of document.querySelectorAll(`[${CHANNEL_GROUP_MENU_ATTR}="true"]`)) item.parentElement?.remove();
      };
    }

    function ChannelMenuSettingsIcon() {
      return h(IconSettingsOutline16, { size: 16 });
    }

    function ChannelUnavailable({ t }) {
      return h("div", { className: "ima-channel-unavailable" }, t("rail.treeUnavailable"));
    }

    class ChannelTreeGuard extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }
      static getDerivedStateFromError() {
        return { failed: true };
      }
      componentDidCatch(error) {
        console.warn("[dsh-im-connect] 官方频道树渲染失败", error);
      }
      render() {
        return this.state.failed ? h(ChannelUnavailable, { t: this.props.t }) : this.props.children;
      }
    }

    function ChannelOfficialView(props) {
      const t = props.t || fallbackT;
      const hostProps = props.hostProps || {};
      const Official = props.officialTree;
      const hostT = typeof props.hostT === "function"
        ? props.hostT
        : (typeof hostProps.t === "function" ? hostProps.t : t);
      const rawUseSessions = hostProps.useSessions;
      const rawUseWorkspaces = hostProps.useWorkspaces;
      const store = getChannelViewStore();
      const membershipRevision = useSyncExternalStore(subscribeChannelMembership, channelMembershipSnapshot, channelMembershipSnapshot);
      const useChannelStore = useCallback((select) => {
        const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
        return select(snapshot);
      }, [store]);
      const groupBy = useChannelStore((state) => state.groupBy);
      const sessionSource = typeof rawUseSessions === "function"
        ? rawUseSessions((state) => state)
        : EMPTY_SESSION_STATE;
      // 宿主 0.2.x 首个权威快照前 phase 为 pending，列表失败时也停在 pending；
      // 旧宿主快照可能不带 phase，此时按已就绪处理，由 renderable 判定能力缺失。
      const groupsReady = sessionSource.phase === undefined || sessionSource.phase === "ready";
      const groupsError = sessionSource.state === "error";
      const groups = useMemo(() => channelGroupsFromSessionState(sessionSource, t), [membershipRevision, sessionSource, t]);
      const groupsRef = useRef(groups);
      groupsRef.current = groups;
      const [channelIcons, setChannelIcons] = useState("");
      const [workspaceIcons, setWorkspaceIcons] = useState("");
      const open = props.openSession || hostProps.open || hostProps.openSession;
      const openChannelSettings = props.openChannelSettings || hostProps.openChannelSettings;
      const openImSettings = props.openImSettings || hostProps.openImSettings || (() => openImSettingsPage(t));

      useEffect(() => { ensureStyle(); }, []);

      useEffect(() => {
        if (groupBy === "channel" && channelIcons === "") setChannelIcons(channelIconCss());
      }, [channelIcons, groupBy]);

      const memberKey = groups.map((group) => group.id + ":" + (group.sessions || []).map((session) => session.sessionId).join(",")).join("|");
      const memberIds = useMemo(() => {
        const ids = new Set();
        for (const group of groups) {
          for (const session of group.sessions || []) ids.add(String(session.sessionId));
        }
        return ids;
      }, [memberKey]);

      const useChannelSessions = useCallback((selector, equals) => {
        if (typeof rawUseSessions !== "function") return selector(EMPTY_SESSION_STATE);
        return rawUseSessions((state) => selector(channelMemberSessionState(state, memberIds)), equals);
      }, [memberIds, rawUseSessions]);

      const useChannelWorkspaces = useCallback((selector, equals) => {
        if (typeof rawUseWorkspaces !== "function") return selector(EMPTY_WORKSPACE_STATE);
        return rawUseWorkspaces((state) => selector(
          groupBy === "channel"
            ? syntheticChannelWorkspaceState(state, groups, t)
            : channelRealWorkspaceState(state, memberIds),
        ), equals);
      }, [groupBy, groups, memberIds, rawUseWorkspaces, t]);

      const workspaceSource = typeof rawUseWorkspaces === "function"
        ? rawUseWorkspaces((state) => state)
        : undefined;
      useEffect(() => {
        if (groupBy === "channel") {
          if (workspaceIcons !== "") setWorkspaceIcons("");
          return;
        }
        const items = (workspaceSource && workspaceSource.items) || [];
        const css = channelWorkspaceIconCss(items, memberIds);
        if (css !== workspaceIcons) setWorkspaceIcons(css);
      }, [groupBy, memberIds, membershipRevision, workspaceIcons, workspaceSource]);
      const groupKeys = useMemo(() => {
        if (groupBy === "channel") {
          return groups.filter((group) => (group.sessions || []).length > 0).map((group) => channelWorkspaceId(group.id));
        }
        if (groupBy === "flat") return [];
        return ((workspaceSource && workspaceSource.items) || [])
          .map((workspace) => String(workspace.workspaceId || workspace.id || ""))
          .filter((key) => key !== "");
      }, [groupBy, groups, workspaceSource]);
      useEffect(() => {
        store.actions.ensureExpanded(groupKeys);
      }, [groupKeys, store]);

      const text = useCallback((key, params) => {
        if (key === "section.workspaces" && groupBy === "channel") return t("rail.channels");
        if (key === "workspace.add" || key === "menu.addWorkspace") return t("rail.addChannel");
        return hostT(key, params);
      }, [groupBy, hostT, t]);

      useEffect(() => installChannelGroupOption({
        label: t("rail.byChannel"),
        groupLabel: text("groupBy.label"),
        workspaceLabel: text("groupBy.workspace"),
        checked: groupBy === "channel",
        onSelect: () => store.actions.setGroupBy("channel"),
      }), [groupBy, store, t, text]);

      useEffect(() => installChannelGroupMenu({
        settingsLabel: t("rail.channelSettings"),
        resolve: (channelId) => groupsRef.current.find((group) => group.id === channelId),
        onSettings: (group) => {
          if (typeof openChannelSettings === "function") {
            openChannelSettings({ channelId: group.id, name: channelLabel(group, t) });
            return;
          }
          openImSettings();
        },
      }), [openChannelSettings, openImSettings, t]);

      const rawStartSession = hostProps.startSession;
      const rawRenameWorkspace = hostProps.renameWorkspace;
      const rawDeleteWorkspace = hostProps.deleteWorkspace;
      const rawInsertWorkspaceBefore = hostProps.insertWorkspaceBefore;
      const rawSearch = hostProps.searchSessions;
      const startChannelSession = useCallback((workspaceId, options) => {
        if (channelIdFromWorkspaceId(workspaceId) !== undefined) return;
        if (typeof rawStartSession === "function") rawStartSession(workspaceId, options);
      }, [rawStartSession]);
      const renameChannelWorkspace = useCallback(async (workspaceId, title) => {
        if (channelIdFromWorkspaceId(workspaceId) !== undefined) throw new Error(t("rail.groupReadOnly"));
        if (typeof rawRenameWorkspace === "function") await rawRenameWorkspace(workspaceId, title);
      }, [rawRenameWorkspace, t]);
      const deleteChannelWorkspace = useCallback(async (workspaceId) => {
        if (channelIdFromWorkspaceId(workspaceId) !== undefined) throw new Error(t("rail.groupReadOnly"));
        if (typeof rawDeleteWorkspace === "function") await rawDeleteWorkspace(workspaceId);
      }, [rawDeleteWorkspace, t]);
      const insertChannelWorkspaceBefore = useCallback(async (workspaceId, beforeWorkspaceId) => {
        if (channelIdFromWorkspaceId(workspaceId) !== undefined) return;
        if (typeof rawInsertWorkspaceBefore === "function") await rawInsertWorkspaceBefore(workspaceId, beforeWorkspaceId);
      }, [rawInsertWorkspaceBefore]);
      const searchChannelSessions = useCallback(async (query, signal) => {
        if (typeof rawSearch !== "function") return { items: [], hasMore: false };
        const result = await rawSearch(query, signal);
        return {
          items: (result.items || []).filter((item) => item && item.id !== undefined && memberIds.has(String(item.id))),
          hasMore: result.hasMore,
        };
      }, [memberIds, rawSearch]);
      const rawUseShortcuts = hostProps.useShortcuts;
      const useChannelShortcuts = useCallback((select, equals) => {
        if (typeof rawUseShortcuts !== "function") return select([]);
        return rawUseShortcuts((rows) => select((rows || []).filter((row) => row && row.id !== "workspace.add")), equals);
      }, [rawUseShortcuts]);

      const officialProps = Object.assign({}, hostProps, {
        t: text,
        useStore: useChannelStore,
        actions: store.actions,
        useSessions: useChannelSessions,
        useWorkspaces: useChannelWorkspaces,
        open: typeof open === "function" ? open : noopChannelAction,
        useDirectoryFlow: channelAddFlow,
        requestAddWorkspace: typeof openImSettings === "function" ? openImSettings : noopChannelAction,
        startSession: startChannelSession,
        renameWorkspace: renameChannelWorkspace,
        deleteWorkspace: deleteChannelWorkspace,
        insertWorkspaceBefore: insertChannelWorkspaceBefore,
      });
      if (typeof rawSearch === "function") officialProps.searchSessions = searchChannelSessions;
      if (typeof rawUseShortcuts === "function") officialProps.useShortcuts = useChannelShortcuts;

      const renderable = Official !== undefined && Official !== null
        && typeof rawUseSessions === "function" && typeof rawUseWorkspaces === "function";
      // 官方树会清理不存在的分组，首个权威快照到达前不能传入空列表。
      const body = !groupsReady ? null : renderable
        ? h(ChannelTreeGuard, { t }, h(Official, officialProps))
        : h(ChannelUnavailable, { t });

      return h(React.Fragment, null,
        h("div", { className: "ima-channel-official", "data-mode": groupBy },
          groupBy === "channel" && channelIcons !== "" && h("style", null, channelIcons),
          groupBy !== "channel" && workspaceIcons !== "" && h("style", null, workspaceIcons),
          // 宿主列表失败时 phase 仍停在 pending，没有横幅就是整页空白。
          groupsError && h("div", { className: "ima-channel-error", role: "alert" }, t("error.load")),
          body,
        ),
      );
    }

    const registryFilterCache = new WeakMap();
    function cacheFilteredSessions(src, ids) {
      if (ids.length === (src.ids || []).length) return src;
      const byId = {};
      for (const id of ids) {
        if (src.byId && src.byId[id]) byId[id] = src.byId[id];
      }
      return Object.assign({}, src, { ids, byId });
    }

    function openRegisteredSession(sessionId, registry, hostOpen) {
      const openers = registry && Array.isArray(registry.sessionOpeners) ? registry.sessionOpeners : [];
      const opener = openers
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .find((item) => item && typeof item.matchSession === "function" && item.matchSession(sessionId));
      if (!opener) {
        if (typeof hostOpen === "function") hostOpen(sessionId);
        return;
      }
      try {
        opener.open(sessionId, hostOpen);
      } catch {
        if (typeof hostOpen === "function") hostOpen(sessionId);
      }
    }

    function createNativeTabRegistry(officialTree) {
      const tabs = new Map();
      const sessionFilters = [];
      const sessionOpeners = [];
      const listeners = new Set();
      let cachedTabs = [];
      let revision = 0;
      const rebuild = () => { cachedTabs = [...tabs.values()].sort((a, b) => (a.order || 0) - (b.order || 0)); };
      const emit = () => {
        revision += 1;
        for (const listener of listeners) listener();
      };
      return {
        version: 1,
        officialTree,
        sessionFilters,
        sessionOpeners,
        getTabs() { return cachedTabs; },
        getRevision() { return revision; },
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
        addSessionOpener(opener) {
          sessionOpeners.push(opener);
          emit();
          return () => {
            const index = sessionOpeners.indexOf(opener);
            if (index >= 0) sessionOpeners.splice(index, 1);
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
      const target = entry && (typeof entry === "object" || typeof entry === "function") && "component" in entry ? entry.component : entry;
      const registry = target?.__dshNativeTabs;
      return registry?.version === 1 && typeof registry.getTabs === "function" && typeof registry.subscribe === "function" && typeof registry.insert === "function" ? registry : null;
    }

    function applySessionFilters(state, registry) {
      const src = state || { ids: [], byId: {}, current: null };
      const filters = registry && registry.sessionFilters ? registry.sessionFilters : [];
      if (!filters.length) return src;
      const revision = registry && typeof registry.getRevision === "function" ? registry.getRevision() : null;
      if (revision !== null && src && typeof src === "object") {
        const hit = registryFilterCache.get(src);
        if (hit && hit.registry === registry && hit.revision === revision) return hit.result;
      }
      const ids = (src.ids || []).filter((id) => filters.every((fn) => fn(String(id))));
      const result = cacheFilteredSessions(src, ids);
      if (revision !== null && src && typeof src === "object") registryFilterCache.set(src, { registry, revision, result });
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
      const registryRevision = useSyncExternalStore(
        (listener) => (nativeTabs && nativeTabs.subscribe ? nativeTabs.subscribe(listener) : () => {}),
        () => (nativeTabs && nativeTabs.getRevision ? nativeTabs.getRevision() : 0),
        () => 0,
      );
      const [tab, setTab] = useState(() => {
        try {
          return localStorage.getItem(TAB_KEY)
            || localStorage.getItem("dsh-im-connect.sidebar-tab")
            || localStorage.getItem("dsh-automation.sidebar-tab") || "tasks";
        } catch { return "tasks"; }
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
        // 频道会话也出现在官方任务树；频道页签只是同一批会话的过滤视图。
        return rawUseSessions((state) => selector(applySessionFilters(state, nativeTabs)), eq);
      }, [rawUseSessions, nativeTabs, registryRevision]);
      useEffect(() => { ensureStyle(); }, []);
      useEffect(() => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ } }, [tab]);
      useEffect(() => {
        const onClick = (event) => {
          const target = event.target && event.target.closest ? event.target.closest("button") : null;
          if (!target) return;
          if (target.closest("[data-row-key]")) return;
          const label = target.getAttribute("aria-label") || target.innerText || target.textContent || "";
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
      const hostOpen = props.openSession || props.open;
      const openListed = (id) => {
        openListedSession(resolveHostSessionId(id, sessionById), hostOpen);
      };
      const openSession = (id) => {
        if (nativeTabs && Array.isArray(nativeTabs.sessionOpeners)
          && nativeTabs.sessionOpeners.some((item) => item && item.id === "im-connect")) {
          openRegisteredSession(id, nativeTabs, hostOpen);
          return;
        }
        openListed(id);
      };
      const safeExpandSidebar = useCallback(() => {}, []);
      const rawUseWorkspaceShortcuts = typeof props.useWorkspaceShortcuts === "function" ? props.useWorkspaceShortcuts : undefined;
      const useIsolatedWorkspaceShortcuts = useCallback((select, equals) => {
        if (typeof rawUseWorkspaceShortcuts !== "function") return select({ searchRequest: 0, addRequested: false, directoryBusy: false, renameTarget: null });
        return rawUseWorkspaceShortcuts((state) => select(Object.assign({}, state, { searchRequest: 0 })), equals);
      }, [rawUseWorkspaceShortcuts]);
      const guardedHostProps = Object.assign({}, props, {
        expandSidebar: safeExpandSidebar,
        useWorkspaceShortcuts: useIsolatedWorkspaceShortcuts,
      });
      const officialProps = Object.assign({}, props, { useSessions: useTaskSessions, t: officialT, openSession, open: openSession });
      const guardedOfficialProps = Object.assign({}, officialProps, {
        expandSidebar: safeExpandSidebar,
        useWorkspaceShortcuts: useIsolatedWorkspaceShortcuts,
      });
      const channelView = h(ChannelOfficialView, {
        officialTree: Official,
        hostProps: guardedHostProps,
        hostT: officialT,
        t,
        openSession,
        openChannelSettings: props.openChannelSettings,
        openImSettings: props.openImSettings,
      });
      if (props.wide === false) return Official ? h(Official, guardedOfficialProps) : null;
      const officialTree = Official
        ? h("div", { className: "ima-official-tree" }, h(Official, guardedOfficialProps))
        : null;
      const visibleTab = resolveSidebarTab(tab, extraTabs);
      const extra = extraTabs.find((item) => item.id === visibleTab);
      const hasChannelTab = extraTabs.some((item) => item.id === "channels");
      const imTabItems = [
        {
          value: "tasks",
          id: "ima-tab-tasks",
          panelId: "ima-panel-tasks",
          label: h("span", { style: { display: "inline-flex", alignItems: "center", gap: 5 } },
            h(IconFolderClose, { size: 14 }),
            h("span", null, t("rail.tasks")),
          ),
        },
      ];
      if (!hasChannelTab) {
        imTabItems.push({
          value: "channels",
          id: "ima-tab-channels",
          panelId: "ima-panel-channels",
          label: h("span", { style: { display: "inline-flex", alignItems: "center", gap: 5 } },
            h(IconQueueOutline, { size: 14 }),
            h("span", null, t("rail.channels")),
          ),
        });
      }
      for (const item of extraTabs) {
        const itemLabel = item.id === "channels"
          ? h("span", { style: { display: "inline-flex", alignItems: "center", gap: 5 } },
              h(IconQueueOutline, { size: 14 }),
              h("span", null, item.label),
            )
          : item.id === "schedule"
            ? h("span", { style: { display: "inline-flex", alignItems: "center", gap: 5 } },
                h(IconClockOutline, { size: 14 }),
                h("span", null, item.label),
              )
            : item.label;
        imTabItems.push({
          value: item.id,
          id: "ima-tab-" + item.id,
          panelId: "ima-panel-" + item.id,
          label: itemLabel,
        });
      }

      return h("div", { className: "ima-wrap" },
        HostSegmentedTabs
          ? h("div", { className: "ima-tabs-wrap", style: { "--ima-tab-count": String(imTabItems.length) } },
              h(HostSegmentedTabs, {
                className: "ima-segmented-tabs",
                label: t("rail.tabsAria"),
                value: visibleTab,
                onChange: (next) => setTab(next),
                items: imTabItems,
              }),
            )
          : h("div", { className: "ima-tabs", role: "tablist", "aria-label": t("rail.tabsAria") },
              h("button", { type: "button", role: "tab", "aria-selected": visibleTab === "tasks", className: visibleTab === "tasks" ? "ima-tab on" : "ima-tab", onClick: () => setTab("tasks") }, t("rail.tasks")),
              !hasChannelTab && h("button", { type: "button", role: "tab", "aria-selected": visibleTab === "channels", className: visibleTab === "channels" ? "ima-tab on" : "ima-tab", onClick: () => setTab("channels") }, t("rail.channels")),
              ...extraTabs.map((item) => h("button", {
                key: item.id,
                type: "button",
                role: "tab",
                "aria-selected": visibleTab === item.id,
                className: visibleTab === item.id ? "ima-tab on" : "ima-tab",
                onClick: () => setTab(item.id),
              }, item.label)),
            ),
        visibleTab === "tasks"
          ? (officialTree || h(ChannelUnavailable, { t }))
          : extra
            ? extra.render(Object.assign({}, props, { t: officialT, openSession, open: openSession }))
            : channelView,
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
        if (isWrappedWorkspaceComponent(item.component)) continue;
        return item;
      }
      return null;
    }

    function isWrappedWorkspaceComponent(component) {
      return !!component && (component.__dshNativeTabWrapped === true
        || component.__dshNativeTabHost === true
        || component.__imConnectWrapped === true
        || component.__imConnectOriginal !== undefined
        || component.__dshAutomationWrapped === true
        || component.__dshAutomationOriginal !== undefined);
    }

    const BUNDLE_KEY = "@michengai/dsh-im-connect";
    const SIDEBAR_PANEL_ID = "im-connect";
    const SIDEBAR_PANEL_ORDER = 3;

    function ImSidebarIcon(props) {
      const size = props && typeof props.size === "number" ? props.size : 16;
      return h(IconQueueOutline, { size });
    }

    function ImBundleConfigCard(props) {
      const {
        t,
        enabled,
        onToggle,
        disabled,
        onlineUpdateEnabled = true,
        onToggleOnlineUpdate,
        onlineUpdateDisabled,
        onlineUpdateLocked = false,
        taskTreeSessionsEnabled = false,
        onToggleTaskTreeSessions,
        taskTreeSessionsDisabled = false,
      } = props;

      const SwitchComponent = PrimitiveSwitch || Switch;
      const rows = [
        h("div", { key: "sidebar-entry", className: "ima-bundle-row" },
          h("div", { className: "ima-bundle-label-box" },
            h("span", { className: "ima-bundle-title" }, t("sidebar.entry.title")),
            h("span", { className: "ima-bundle-desc" }, t("sidebar.entry.desc"))
          ),
          h(SwitchComponent, {
            checked: enabled,
            onChange: onToggle,
            label: t("sidebar.entry.toggle"),
            disabled: disabled,
          })
        ),
      ];

      if (typeof onToggleOnlineUpdate === "function") {
        const updateDesc = onlineUpdateLocked
          ? `${t("update.entry.desc")} (${t("error.update.disabled")})`
          : t("update.entry.desc");
        rows.push(
          h("div", { key: "online-update", className: "ima-bundle-row" },
            h("div", { className: "ima-bundle-label-box" },
              h("span", { className: "ima-bundle-title" }, t("update.entry.title")),
              h("span", { className: "ima-bundle-desc" }, updateDesc)
            ),
            h(SwitchComponent, {
              checked: onlineUpdateEnabled,
              onChange: onToggleOnlineUpdate,
              label: t("update.entry.toggle"),
              disabled: onlineUpdateDisabled || onlineUpdateLocked,
            })
          )
        );
      }

      if (typeof onToggleTaskTreeSessions === "function") {
        rows.push(
          h("div", { key: "task-tree-sessions", className: "ima-bundle-row" },
            h("div", { className: "ima-bundle-label-box" },
              h("span", { className: "ima-bundle-title" }, t("taskTreeSessions.entry.title")),
              h("span", { className: "ima-bundle-desc" }, t("taskTreeSessions.entry.desc"))
            ),
            h(SwitchComponent, {
              checked: taskTreeSessionsEnabled,
              onChange: onToggleTaskTreeSessions,
              label: t("taskTreeSessions.entry.toggle"),
              disabled: taskTreeSessionsDisabled,
            })
          )
        );
      }

      return h(React.Fragment, null, rows);
    }

    function ImBundleConfigCardWrapper(props) {
      const [enabled, setEnabled] = useState(props.getEnabled);
      const [onlineUpdateEnabled, setOnlineUpdateEnabled] = useState(props.getOnlineUpdateEnabled ? props.getOnlineUpdateEnabled : () => true);
      const [onlineUpdateLocked, setOnlineUpdateLocked] = useState(props.getOnlineUpdateLocked ? props.getOnlineUpdateLocked : () => false);
      const [taskTreeSessionsEnabled, setTaskTreeSessionsEnabled] = useState(props.getTaskTreeSessionsEnabled ? props.getTaskTreeSessionsEnabled : () => false);
      const [savingSidebar, setSavingSidebar] = useState(false);
      const [savingUpdate, setSavingUpdate] = useState(false);
      const [savingTaskTreeSessions, setSavingTaskTreeSessions] = useState(false);

      useEffect(() => {
        setEnabled(props.getEnabled());
        if (props.getOnlineUpdateEnabled) {
          setOnlineUpdateEnabled(props.getOnlineUpdateEnabled());
        }
        if (props.getOnlineUpdateLocked) {
          setOnlineUpdateLocked(props.getOnlineUpdateLocked());
        }
        if (props.getTaskTreeSessionsEnabled) {
          setTaskTreeSessionsEnabled(props.getTaskTreeSessionsEnabled());
        }
        return props.subscribe(() => {
          setEnabled(props.getEnabled());
          if (props.getOnlineUpdateEnabled) {
            setOnlineUpdateEnabled(props.getOnlineUpdateEnabled());
          }
          if (props.getOnlineUpdateLocked) {
            setOnlineUpdateLocked(props.getOnlineUpdateLocked());
          }
          if (props.getTaskTreeSessionsEnabled) {
            setTaskTreeSessionsEnabled(props.getTaskTreeSessionsEnabled());
          }
        });
      }, [props]);

      const onToggleSidebar = (next) => {
        setSavingSidebar(true);
        setEnabled(next);
        props.setSidebar(next).catch(() => {
          setEnabled(props.getEnabled());
        }).finally(() => {
          setSavingSidebar(false);
        });
      };

      const onToggleOnlineUpdate = props.setOnlineUpdate ? (next) => {
        if (onlineUpdateLocked) return;
        setSavingUpdate(true);
        setOnlineUpdateEnabled(next);
        props.setOnlineUpdate(next).catch(() => {
          if (props.getOnlineUpdateEnabled) {
            setOnlineUpdateEnabled(props.getOnlineUpdateEnabled());
          }
        }).finally(() => {
          setSavingUpdate(false);
        });
      } : undefined;

      const onToggleTaskTreeSessions = props.setTaskTreeSessions ? (next) => {
        setSavingTaskTreeSessions(true);
        setTaskTreeSessionsEnabled(next);
        props.setTaskTreeSessions(next).catch(() => {
          if (props.getTaskTreeSessionsEnabled) {
            setTaskTreeSessionsEnabled(props.getTaskTreeSessionsEnabled());
          }
        }).finally(() => {
          setSavingTaskTreeSessions(false);
        });
      } : undefined;

      return h(ImBundleConfigCard, {
        t: props.t,
        enabled,
        disabled: savingSidebar,
        onToggle: onToggleSidebar,
        onlineUpdateEnabled,
        onlineUpdateDisabled: savingUpdate,
        onlineUpdateLocked,
        onToggleOnlineUpdate,
        taskTreeSessionsEnabled,
        taskTreeSessionsDisabled: savingTaskTreeSessions,
        onToggleTaskTreeSessions,
      });
    }

    const STORAGE_KEY_TASK_TREE_SESSIONS = "dsh-im-connect.task-tree-sessions";

    function setupSidebarEntry(ctx, options) {
      if (!ctx.locale) {
        return {
          isEnabled: () => false,
          isSupported: () => false,
          setEnabled: async () => false,
          isOnlineUpdateEnabled: () => true,
          isOnlineUpdateLocked: () => false,
          setOnlineUpdate: async () => false,
          isTaskTreeSessionsEnabled: () => false,
          setTaskTreeSessions: async () => false,
          destroy: () => {},
        };
      }
      const { callApi, renderPanel, ns } = options;
      let sidebarEntryEnabled = false;
      let sidebarSupported = false;
      let offPanel = null;
      let offRow = null;
      let epoch = 0;
      let layoutService;
      const listeners = new Set();

      const notify = () => {
        for (const listener of listeners) {
          try { listener(); } catch {}
        }
      };

      const sync = () => {
        if (sidebarSupported && sidebarEntryEnabled) {
          if (!offPanel) {
            const res = ctx.slots.register({
              name: "main",
              key: SIDEBAR_PANEL_ID,
              locale: ns,
              inject: () => {
                const extra = typeof options.injectProps === "function" ? options.injectProps() : options.injectProps;
                return Object.assign({ t: ctx.locale?.bind ? ctx.locale.bind(ns) : undefined }, extra);
              },
            }, (ownerProps) => h("div", { className: "ima-main-panel" }, renderPanel(ownerProps)));
            offPanel = typeof res === "function" ? res : () => {};
          }
          if (!offRow) {
            const res = ctx.slots.register({
              name: "sidebar.panellist",
              id: SIDEBAR_PANEL_ID,
              order: SIDEBAR_PANEL_ORDER,
              label: () => ctx.locale.bind(ns)("settings.title"),
              locale: ns,
            }, (ownerProps) => h(ImSidebarIcon, ownerProps));
            offRow = typeof res === "function" ? res : () => {};
          }
        } else {
          if (layoutService?.panelInfo && typeof layoutService.selectPanel === "function") {
            try {
              if (layoutService.panelInfo.getSnapshot().activePanelId === SIDEBAR_PANEL_ID) {
                layoutService.selectPanel(null);
              }
            } catch {}
          }
          if (offRow) {
            try { offRow(); } catch {}
            offRow = null;
          }
          if (offPanel) {
            try { offPanel(); } catch {}
            offPanel = null;
          }
        }
      };

      const setEnabled = async (next) => {
        const currentEpoch = ++epoch;
        sidebarEntryEnabled = next;
        sync();
        notify();
        try {
          await callApi("/sidebar-entry", {
            method: "POST",
            body: JSON.stringify({ enabled: next }),
          });
          return next;
        } catch (err) {
          if (currentEpoch === epoch) {
            sidebarEntryEnabled = !next;
            sync();
            notify();
          }
          throw err;
        }
      };

      let onlineUpdateEnabled = true;
      let onlineUpdateLocked = false;
      let updateEpoch = 0;

      const setOnlineUpdate = async (next) => {
        if (onlineUpdateLocked) return onlineUpdateEnabled;
        const currentEpoch = ++updateEpoch;
        onlineUpdateEnabled = next;
        notify();
        if (typeof options.onOnlineUpdateChange === "function") {
          try { options.onOnlineUpdateChange(next); } catch {}
        }
        try {
          await callApi("/online-update", {
            method: "POST",
            body: JSON.stringify({ enabled: next }),
          });
          // 乐观通知可能早于服务端开启；保存完成后再通知更新器重读版本。
          if (currentEpoch === updateEpoch && typeof options.onOnlineUpdateChange === "function") {
            options.onOnlineUpdateChange(next);
          }
          return next;
        } catch (err) {
          if (currentEpoch === updateEpoch) {
            onlineUpdateEnabled = !next;
            notify();
            if (typeof options.onOnlineUpdateChange === "function") {
              try { options.onOnlineUpdateChange(!next); } catch {}
            }
          }
          throw err;
        }
      };

      const loadEpoch = epoch;
      callApi("/sidebar-entry")
        .then((res) => {
          if (epoch === loadEpoch && res && typeof res.enabled === "boolean") {
            sidebarEntryEnabled = res.enabled;
            sync();
            notify();
          }
        })
        .catch(() => {});

      const loadUpdateEpoch = updateEpoch;
      callApi("/online-update")
        .then((res) => {
          if (updateEpoch === loadUpdateEpoch && res) {
            if (typeof res.enabled === "boolean") onlineUpdateEnabled = res.enabled;
            if (typeof res.locked === "boolean") onlineUpdateLocked = res.locked;
            notify();
            if (typeof options.onOnlineUpdateChange === "function") {
              try { options.onOnlineUpdateChange(onlineUpdateEnabled); } catch {}
            }
          }
        })
        .catch(() => {});

      let taskTreeSessionsEnabled = (() => {
        try {
          return localStorage.getItem(STORAGE_KEY_TASK_TREE_SESSIONS) === "true";
        } catch {
          return false;
        }
      })();
      let taskTreeEpoch = 0;

      const setTaskTreeSessions = async (next) => {
        const currentEpoch = ++taskTreeEpoch;
        taskTreeSessionsEnabled = next;
        try {
          localStorage.setItem(STORAGE_KEY_TASK_TREE_SESSIONS, next ? "true" : "false");
        } catch {}
        notify();
        if (typeof options.onTaskTreeSessionsChange === "function") {
          try { options.onTaskTreeSessionsChange(next); } catch {}
        }
        try {
          await callApi("/task-tree-sessions", {
            method: "POST",
            body: JSON.stringify({ enabled: next }),
          });
          return next;
        } catch (err) {
          if (currentEpoch === taskTreeEpoch) {
            taskTreeSessionsEnabled = !next;
            try {
              localStorage.setItem(STORAGE_KEY_TASK_TREE_SESSIONS, (!next) ? "true" : "false");
            } catch {}
            notify();
            if (typeof options.onTaskTreeSessionsChange === "function") {
              try { options.onTaskTreeSessionsChange(!next); } catch {}
            }
          }
          throw err;
        }
      };

      const loadTaskTreeEpoch = taskTreeEpoch;
      callApi("/task-tree-sessions")
        .then((res) => {
          if (taskTreeEpoch === loadTaskTreeEpoch && res && typeof res.enabled === "boolean") {
            taskTreeSessionsEnabled = res.enabled;
            try {
              localStorage.setItem(STORAGE_KEY_TASK_TREE_SESSIONS, res.enabled ? "true" : "false");
            } catch {}
            notify();
            if (typeof options.onTaskTreeSessionsChange === "function") {
              try { options.onTaskTreeSessionsChange(taskTreeSessionsEnabled); } catch {}
            }
          }
        })
        .catch(() => {});

      if (typeof ctx.inject === "function") {
        ctx.inject(["layout"], (scoped) => {
          layoutService = scoped.layout;
        });
      }

      ctx.slots.inject("sidebar.panellist", () => {
        sidebarSupported = true;
        sync();
      });

      ctx.slots.inject("plugins.bundle.config", () => {
        return ctx.slots.register({
          name: "plugins.bundle.config",
          key: BUNDLE_KEY,
          locale: ns,
        }, (ownerProps) => {
          if (ownerProps && ownerProps.view === "summary") return null;
          return h(ImBundleConfigCardWrapper, {
            t: ctx.locale.bind(ns),
            getEnabled: () => sidebarEntryEnabled,
            setSidebar: setEnabled,
            getOnlineUpdateEnabled: () => onlineUpdateEnabled,
            getOnlineUpdateLocked: () => onlineUpdateLocked,
            setOnlineUpdate: setOnlineUpdate,
            getTaskTreeSessionsEnabled: () => taskTreeSessionsEnabled,
            setTaskTreeSessions: setTaskTreeSessions,
            subscribe: (fn) => {
              listeners.add(fn);
              return () => { listeners.delete(fn); };
            },
          });
        });
      });

      return {
        isEnabled: () => sidebarEntryEnabled,
        isSupported: () => sidebarSupported,
        setEnabled,
        isOnlineUpdateEnabled: () => onlineUpdateEnabled,
        isOnlineUpdateLocked: () => onlineUpdateLocked,
        setOnlineUpdate,
        isTaskTreeSessionsEnabled: () => taskTreeSessionsEnabled,
        setTaskTreeSessions,
        destroy: () => {
          listeners.clear();
          if (offRow) {
            try { offRow(); } catch {}
            offRow = null;
          }
          if (offPanel) {
            try { offPanel(); } catch {}
            offPanel = null;
          }
        },
      };
    }

    function apply(ctx) {
      ensureStyle();
      ctx.effect(() => {
        let pending = channelSessionIds.size > 0, flight = null, disposed = false;
        const refresh = (changed) => {
          pending = pending || changed;
          if (disposed || !pending || flight) return;
          const sessions = probeService(ctx, "sessions");
          if (!sessions || typeof sessions.refresh !== "function") return;
          const revision = channelMembershipRevision;
          flight = Promise.resolve().then(() => {
            if (disposed) return;
            return sessions.refresh();
          }).then(() => {
            if (disposed) return;
            const snapshot = sessions.list && typeof sessions.list.getSnapshot === "function" ? sessions.list.getSnapshot() : undefined;
            if (snapshot && snapshot.state === "error") return;
            if (revision === channelMembershipRevision) pending = false;
          }).catch(() => { /* 保留待处理状态，由下次渠道刷新重试 */ })
            .finally(() => { flight = null; });
        };
        requestHostSessionRefresh = refresh;
        return () => {
          disposed = true;
          if (requestHostSessionRefresh === refresh) requestHostSessionRefresh = () => {};
        };
      }, "im-connect: host session refresh");
      ctx.effect(() => channelRefresh.subscribe((data, error) => {
        if (error) console.warn("[dsh-im-connect] 无法刷新渠道会话归属", error);
      }), "im-connect: channel membership");
      ctx.effect(() => ctx.locale.register(IM_LOCALE_NS, IM_LOCALES), "im-connect: dictionaries");
      const t = ctx.locale.bind(IM_LOCALE_NS);
      const permissionT = ctx.locale.bind("permission.access");
      const modelT = ctx.locale.bind("model");
      const presetT = ctx.locale.bind("settings.agentPreset");
      let syncActiveTaskTreeFilter = () => {};
      const sidebarController = setupSidebarEntry(ctx, {
        callApi: api,
        renderPanel: (ownerProps) => h(LocalizedSettingsPage, ownerProps),
        ns: IM_LOCALE_NS,
        injectProps: () => ({
          createWorkspace: typeof ctx.workspaces?.create === "function" ? (input) => ctx.workspaces.create(input) : undefined,
          pickDirectory: () => pickHostDirectory(ctx),
          permissionT,
          modelT,
          presetT,
        }),
        onOnlineUpdateChange: () => {
          if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ima-update-toggle"));
        },
        onTaskTreeSessionsChange: () => {
          syncActiveTaskTreeFilter();
        },
      });
      ctx.effect(() => () => sidebarController.destroy(), "im-connect: sidebar entry");
      ctx.effect(() => observePluginUpdate({
        endpoint: "/api/michengai/dsh-im-connect/update",
        packageName: "@michengai/dsh-im-connect",
        titleRowSelector: ".ima-title-row",
        linksSelector: ".ima-title-links",
        zhName: t("settings.title"),
        enName: t("settings.title"),
        createIcon: createPluginUpdateIcon,
        isEnabled: () => sidebarController.isOnlineUpdateEnabled(),
      }), "im-connect: plugin update ui");
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
      const openImSettings = () => openImSettingsPage(t);
      // Codex UI 只把 sidebar.channels 当作页签占用信号，频道内容由它自己的
      // ChannelBrowser 渲染；这里保留占位，避免未来宿主直接渲染时空白。
      function LocalizedChannelRail() {
        useSyncExternalStore(subscribeLocale, localeSnapshot, localeSnapshot);
        return h(ChannelUnavailable, { t });
      }
      function LocalizedSessionSwitcher(props) {
        useSyncExternalStore(subscribeLocale, localeSnapshot, localeSnapshot);
        const archiveSession = props.archiveSession || ((sessionId, options) => archiveHostSession(ctx, sessionId, options));
        const unarchiveSession = props.unarchiveSession || ((sessionId) => unarchiveHostSession(ctx, sessionId));
        return h(SessionSwitcher, Object.assign({}, props, {
          t,
          officialT: props.t,
          openChannelSettings,
          openImSettings,
          archiveSession,
          unarchiveSession,
        }));
      }
      function LocalizedSettingsPage(props) {
        useSyncExternalStore(subscribeLocale, localeSnapshot, localeSnapshot);
        return h(SettingsPage, Object.assign({}, props, { t, permissionT, modelT, presetT, readMainSessionModel: () => readMainSessionModel(ctx) }));
      }
      openImSession = (id) => {
        try {
          if (window.__dshSessionsOpen) { window.__dshSessionsOpen(id); return true; }
        } catch { /* ignore */ }
        try { return openHostSession(ctx, id); }
        catch (error) { console.warn("[dsh-im-connect] 无法打开会话", id, error); return false; }
      };

      const NAV_ICON_MARKER = "data-ima-nav-icon";
      const NAV_ROW_SELECTOR = '[role="dialog"] nav button, [data-shortcut-modal="settings"] nav button';
      const NAV_ICON_STYLE_ID = "ima-settings-nav-icon-style";
      const KNOWN_NAV_LABELS = new Set(["im助理", "imassistant"]);

      const QUEUE_ICON_PATHS = '<path d="M5 6.75H11"/><path d="M5 9H8"/><path d="M2.37067 11.2497C1.5872 9.89252 1.32042 8.29798 1.61945 6.7597C1.91847 5.22141 2.76317 3.84293 3.99801 2.87809C5.23285 1.91325 6.7747 1.427 8.33964 1.50888C9.90458 1.59076 11.3873 2.23526 12.5147 3.32369C13.6422 4.41232 14.3384 5.8717 14.4751 7.43304C14.6118 8.99438 14.1797 10.5525 13.2585 11.8205C12.3372 13.0885 10.9889 13.9809 9.4617 14.3334C8.18666 14.6277 6.8587 14.529 5.64964 14.0601C5.17095 13.8745 4.76937 13.4929 4.26509 13.3963C3.67389 13.2832 2.95232 13.5595 2.0377 14.3334"/>';
      const QUEUE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="black" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${QUEUE_ICON_PATHS}</svg>`;
      const QUEUE_ICON_MASK = `url("data:image/svg+xml,${encodeURIComponent(QUEUE_ICON_SVG)}")`;

      const NAV_ICON_CSS = `[${NAV_ICON_MARKER}]>svg{display:none!important}[${NAV_ICON_MARKER}]::before{content:'';flex:none;width:16px;height:16px;background-color:currentColor;-webkit-mask:${QUEUE_ICON_MASK} center/contain no-repeat;mask:${QUEUE_ICON_MASK} center/contain no-repeat;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;-webkit-mask-size:16px 16px;mask-size:16px 16px}`;

      function ensureNavIconStyle(doc) {
        const targetDoc = doc || (typeof document !== "undefined" ? document : null);
        if (!targetDoc || typeof targetDoc.getElementById !== "function") return;
        if (targetDoc.getElementById(NAV_ICON_STYLE_ID) !== null) return;
        const style = typeof targetDoc.createElement === "function" ? targetDoc.createElement("style") : null;
        if (!style) return;
        style.id = NAV_ICON_STYLE_ID;
        style.textContent = NAV_ICON_CSS;
        const targetParent = targetDoc.head ?? targetDoc.documentElement;
        if (targetParent && typeof targetParent.appendChild === "function") {
          targetParent.appendChild(style);
        }
      }

      function getNavButtonText(button) {
        if (!button) return "";
        const span = typeof button.querySelector === "function" ? button.querySelector("span") : null;
        const label = span && span.textContent ? span.textContent : button.textContent;
        return String(label ?? "").trim();
      }

      function isOwnNavRow(rowText, wantedLabel) {
        const normRow = String(rowText ?? "").replace(/\s+/g, "").toLowerCase();
        if (normRow.length === 0) return false;
        const normWanted = String(wantedLabel ?? "").replace(/\s+/g, "").toLowerCase();
        if (normWanted.length > 0 && normWanted !== "settings.label" && !KNOWN_NAV_LABELS.has(normWanted)) {
          return false;
        }
        if (KNOWN_NAV_LABELS.has(normRow)) return true;
        return normWanted.length > 0 && normRow === normWanted;
      }

      function applySettingsNavIcon(button, wantedLabel) {
        const isOwn = isOwnNavRow(getNavButtonText(button), typeof wantedLabel === "function" ? wantedLabel() : wantedLabel);
        if (isOwn) {
          if (button.getAttribute(NAV_ICON_MARKER) === "") return false;
          button.setAttribute(NAV_ICON_MARKER, "");
          return true;
        }
        if (button.hasAttribute(NAV_ICON_MARKER)) {
          button.removeAttribute(NAV_ICON_MARKER);
          return true;
        }
        return false;
      }

      function restoreSettingsNavIcon(button) {
        if (!button.hasAttribute(NAV_ICON_MARKER)) return false;
        button.removeAttribute(NAV_ICON_MARKER);
        return true;
      }

      function installSettingsNavIcon(targetCtx, resolveLabel) {
        if (typeof document === "undefined") return;
        ensureNavIconStyle(document);
        targetCtx.effect(() => {
          let disposed = false;
          let scheduled = false;

          const sync = () => {
            scheduled = false;
            if (disposed) return;
            ensureNavIconStyle(document);
            for (const row of document.querySelectorAll(NAV_ROW_SELECTOR)) {
              applySettingsNavIcon(row, resolveLabel);
            }
          };

          const schedule = () => {
            if (scheduled || disposed) return;
            scheduled = true;
            queueMicrotask(sync);
          };

          sync();
          const targetRoot = document.documentElement || document.body;
          const observer = new MutationObserver(schedule);
          observer.observe(targetRoot, { childList: true, subtree: true, characterData: true });

          return () => {
            disposed = true;
            observer.disconnect();
            for (const row of document.querySelectorAll(`[${NAV_ICON_MARKER}]`)) {
              restoreSettingsNavIcon(row);
            }
          };
        }, "im-connect: settings nav icon");
      }

      installSettingsNavIcon(ctx, () => t("settings.label"));

      ctx.slots.inject("settings.section", () => ctx.slots.register({
          name: "settings.section",
          id: "im-assistant",
          order: 40,
          label: () => t("settings.label"),
          icon: "chat",
          locale: IM_LOCALE_NS,
        inject: () => ({
          createWorkspace: typeof ctx.workspaces?.create === "function" ? (input) => ctx.workspaces.create(input) : undefined,
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

      // 频道会话行前显示所属频道品牌标，和定时任务的时钟图标同一套 leading 槽位。
      ctx.slots.inject("sidebar.session.row.leading", () => ctx.slots.register({
        name: "sidebar.session.row.leading",
        id: "im-connect-session-channel",
        order: 10,
      }, function ChannelSessionLeading({ sessionId }) {
        useSyncExternalStore(subscribeChannelMembership, channelMembershipSnapshot, channelMembershipSnapshot);
        const channelId = channelIdOfSession(sessionId);
        if (!channelId) return null;
        return h("span", { className: "ima-session-channel-icon", "aria-hidden": "true" }, h(Logo, { id: channelId, small: true }));
      }));

      // 只包一层官方任务树，绝不在通知回调里再 register，否则会把启动卡在 Loading plugins。
      ctx.slots.inject("sidebar.workspaces", () => {
        let wrappedEntry = null;
        let originalComp = null;
        let ownedWrapper = null;
        let ownedRegistry = null;
        let removeInsertedTab = () => {};
        let removeInsertedOpener = () => {};
        let removeInsertedFilter = () => {};
        let activeFilterRegistry = null;
        let filterInstalled = false;
        let warnedUnsupportedFilter = false;
        let stopInsertedTabLocale = () => {};
        let insertedTabRegistry = null;
        let syncing = false;
        // 与定时插件共享通知，补足直接替换 component 不触发宿主插槽通知的情况。
        const notifyPeers = () => { queueMicrotask(() => window.dispatchEvent(new Event("dsh-native-sidebar-change"))); };
        const clearFilter = () => {
          if (filterInstalled) {
            removeInsertedFilter();
            removeInsertedFilter = () => {};
            filterInstalled = false;
          }
          warnedUnsupportedFilter = false;
        };
        const ensureFilter = (registry) => {
          if (registry !== activeFilterRegistry) {
            clearFilter();
            activeFilterRegistry = registry;
          }
          if (!registry) {
            clearFilter();
            return;
          }
          const showSessions = typeof sidebarController !== "undefined"
            && sidebarController
            && typeof sidebarController.isTaskTreeSessionsEnabled === "function"
            ? sidebarController.isTaskTreeSessionsEnabled()
            : false;
          if (showSessions) {
            clearFilter();
            return;
          }
          if (!filterInstalled) {
            if (typeof registry.addSessionFilter === "function") {
              const dispose = registry.addSessionFilter((sessionId) => {
                return !isChannelSession(sessionId);
              });
              removeInsertedFilter = () => {
                dispose();
              };
              filterInstalled = true;
            } else if (!warnedUnsupportedFilter) {
              warnedUnsupportedFilter = true;
              console.warn("[dsh-im-connect] 外壳注册表未支持 addSessionFilter 协议，无法在任务树过滤会话");
            }
          }
        };
        syncActiveTaskTreeFilter = () => {
          ensureFilter(insertedTabRegistry || ownedRegistry);
        };
        const installSessionOpener = (registry) => {
          if (!registry || typeof registry.addSessionOpener !== "function") return () => {};
          if (registry.sessionOpeners && registry.sessionOpeners.some((item) => item.id === "im-connect")) return () => {};
          return registry.addSessionOpener({
            id: "im-connect",
            order: 20,
            // 普通任务行也需要把宿主内部 key 解析成官方 session id；定时 opener 优先级更高。
            matchSession: (sessionId) => typeof sessionId === "string" && sessionId !== "",
            open: (sessionId, hostOpen) => {
              let byId;
              try { byId = ctx.sessions && ctx.sessions.list && ctx.sessions.list.getSnapshot ? ctx.sessions.list.getSnapshot().byId : undefined; } catch { byId = undefined; }
              openListedSession(resolveHostSessionId(sessionId, byId), hostOpen);
            },
          });
        };
        const clearInsertedTab = () => {
          stopInsertedTabLocale();
          stopInsertedTabLocale = () => {};
          removeInsertedTab();
          removeInsertedTab = () => {};
          removeInsertedOpener();
          removeInsertedOpener = () => {};
          clearFilter();
          insertedTabRegistry = null;
        };
        const unwrap = () => {
          clearInsertedTab();
          clearFilter();
          activeFilterRegistry = null;
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
          if (insertedTabRegistry !== registry) {
            clearInsertedTab();
            insertedTabRegistry = registry;
            removeInsertedOpener = installSessionOpener(registry);
          }
          ensureFilter(registry);
          if (registry.getTabs().some((item) => item.id === "channels")) return true;
          const refreshInsertedTab = () => {
            removeInsertedTab = registry.insert({
              id: "channels",
              label: t("rail.channels"),
              order: 20,
              matchSession: isChannelSession,
              render: (props) => h(ImSidebarFallbackBoundary, {
                officialTree: () => h(ChannelUnavailable, { t }),
                hostProps: props,
              }, h(ChannelOfficialView, Object.assign({}, props, {
                officialTree: registry.officialTree,
                hostProps: props,
                hostT: props.officialT || props.t,
                t,
                openChannelSettings,
                openImSettings,
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
            if (combo) {
              unwrap();
              return;
            }
            const read = ctx.slots.entriesOfSlot || ctx.slots.entries;
            const entries = (read && read.call(ctx.slots, "sidebar.workspaces")) || [];
            const occupant = entries.find((item) => item && item.component);
            if (wrappedEntry && (occupant !== wrappedEntry || occupant.component !== ownedWrapper)) unwrap();
            if (!occupant) { clearInsertedTab(); return; }
            if (insertedTabRegistry && findNativeTabRegistry(occupant) !== insertedTabRegistry) clearInsertedTab();
            if (occupant && (occupant.component.__dshNativeTabHost || occupant.component.__dshNativeTabWrapped || occupant.component.__dshAutomationWrapped || findNativeTabRegistry(occupant))) {
              insertChannelTab(occupant);
              return;
            }
            const official = pickOfficialWorkspaces(ctx);
            if (!official) return;
            originalComp = official.component;
            const registry = createNativeTabRegistry(originalComp);
            ownedRegistry = registry;
            removeInsertedOpener = installSessionOpener(registry);
            ensureFilter(registry);
            const tree = originalComp;
            attachNativeTabRegistry(official, registry);
            function DshNativeTabWorkspaceShell(innerProps) {
              return h(ImSidebarFallbackBoundary, { officialTree: tree, hostProps: innerProps },
                h(LocalizedSessionSwitcher, Object.assign({}, innerProps, { officialTree: tree, nativeTabs: registry })));
            }
            DshNativeTabWorkspaceShell.displayName = "DshNativeTabWorkspaceShell";
            DshNativeTabWorkspaceShell.__dshNativeTabHost = true;
            DshNativeTabWorkspaceShell.__dshNativeTabWrapped = true;
            DshNativeTabWorkspaceShell.__dshNativeTabOriginal = originalComp;
            DshNativeTabWorkspaceShell.__dshNativeTabOwner = "im-connect";
            DshNativeTabWorkspaceShell.__imConnectWrapped = true;
            DshNativeTabWorkspaceShell.__imConnectOriginal = originalComp;
            attachNativeTabRegistry(DshNativeTabWorkspaceShell, registry);
            official.component = DshNativeTabWorkspaceShell;
            ownedWrapper = DshNativeTabWorkspaceShell;
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
        return () => {
          syncActiveTaskTreeFilter = () => {};
          window.clearInterval(retryTimer);
          unsub();
          unsubSidebar();
          window.removeEventListener("dsh-native-sidebar-change", sync);
          unwrap();
        };
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.resolveApiUrl = resolveApiUrl;
    exports.setupSidebarEntry = setupSidebarEntry;
    return module.exports;
} });
