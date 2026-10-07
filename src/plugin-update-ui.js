const UPDATE_HEADER = "x-michengai-plugin-update";
const STYLE_ID = "michengai-plugin-update-ui";
const CSS = `
.mpi-version{margin-left:8px;color:var(--dsw-alias-label-tertiary,#a0a0a0);font-family:inherit;font-size:12px;font-weight:500;line-height:18px;letter-spacing:0;white-space:nowrap;vertical-align:baseline}.mpi-check-host{display:inline-flex;align-items:center}.mpi-icon{display:inline-flex;flex:0 0 auto;width:16px;height:16px;align-items:center;justify-content:center;pointer-events:none}.mpi-icon svg{display:block;width:16px;height:16px}
.mpi-intro{margin:0 0 16px;color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:13px;line-height:20px}.mpi-meta{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px 18px;margin:0 0 16px;font-size:12px;line-height:18px}.mpi-meta dt{color:var(--dsw-alias-label-secondary,#b9b9b9)}.mpi-meta dd{margin:0}.mpi-mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.mpi-latest{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px}.mpi-status{font-size:13px;font-weight:600;line-height:18px}.mpi-status[data-kind=error]{color:var(--dsw-alias-state-error-primary,#ef7272)}.mpi-status[data-kind=success]{color:var(--dsw-alias-state-success-primary,#51b976)}.mpi-status[data-kind=update]{color:#e8b15a !important}.mpi-manual{border-top:1px solid var(--dsw-alias-border-l2,#494949);padding-top:16px}.mpi-manual h3{margin:0 0 6px;font-size:14px;line-height:20px}.mpi-manual p{margin:0 0 10px;color:var(--dsw-alias-label-secondary,#b9b9b9);font-size:12px;line-height:18px}.mpi-command{display:flex;align-items:flex-start;gap:8px;border:1px solid var(--dsw-alias-border-l2,#494949);border-radius:7px;padding:10px;background:var(--dsw-alias-bg-layer-3,var(--dsw-specific-menu-item-hover,#353638))}.mpi-command code{min-width:0;flex:1;overflow:visible;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:560px){.mpi-meta{grid-template-columns:1fr;gap:2px}.mpi-meta dd{margin-bottom:6px}}
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
function ensureStyle() {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
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
    const onKey = (event) => { handlePluginUpdateEscape(event, props.onClose); };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [props.onClose]);
  const lang = document.documentElement.lang;
  const view = props.flow.view(lang);
  const name = lang.toLowerCase().startsWith("en") ? props.enName : props.zhName;
  const command = manualPluginUpdateCommand(view.profileRaw, props.packageName, view.latestRaw);
  const copyLabel = copyState === "copied" ? view.copy.copied : copyState === "failed" ? view.copy.copyFailed : view.copy.copy;
  return React.createElement(AntdProvider, null, React.createElement(Modal, {
    open: true, className: "mpi-dialog", width: 680, zIndex: 1200, title: `${name} ${view.copy.update}`, keyboard: false, destroyOnHidden: true, onCancel: props.onClose,
    afterOpenChange: (open) => { if (open && bodyRef.current) { bodyRef.current.tabIndex = -1; bodyRef.current.focus(); } },
    footer: [
      React.createElement(Button, { key: "check", disabled: view.busy, loading: view.busy && !view.loading, onClick: () => { void props.flow.check(); } }, view.copy.recheck),
      React.createElement(Button, { key: "update", type: "primary", disabled: view.disabled, loading: view.loading, onClick: () => { void props.flow.update(); } }, view.updateLabel),
    ],
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
        React.createElement(Button, { disabled: view.busy, onClick: () => {
          const write = navigator.clipboard?.writeText(command);
          if (write === undefined) { setCopyState("failed"); return; }
          void write.then(() => { setCopyState("copied"); window.setTimeout(() => setCopyState("idle"), 1400); }).catch(() => setCopyState("failed"));
        } }, copyLabel))))));
}
function observePluginUpdate(options) {
  if (typeof document === "undefined" || document.body === null) return () => {};
  ensureStyle();
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
    buttonRoot.render(React.createElement(AntdProvider, null, React.createElement(Button, {
      size: "small", shape: "default", onClick: openDialog, icon: React.createElement(HostIcon, { node: icon }),
    }, React.createElement("span", { "data-mpi-label": "" }, pluginUpdateCopy(document.documentElement.lang).check))));
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
      flow: createUpdateFlow((method) => requestStatus(options.endpoint, method, controller.signal), payload, (next) => { payload = next; applyControls(); }),
      packageName: options.packageName, zhName: options.zhName, enName: options.enName, onClose: closeDialog,
    }));
  }
  const applyControls = () => {
    const row = document.querySelector(options.titleRowSelector);
    if (row === null) return;
    const heading = row.querySelector("h1,h2");
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
    const links = row.querySelector(options.linksSelector);
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
    payload = await requestStatus(options.endpoint, "GET", controller.signal);
    applyControls();
    return payload;
  };
  const observer = new MutationObserver(() => {
    if (frame !== undefined) return;
    frame = window.requestAnimationFrame(() => { frame = undefined; applyControls(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["lang"] });
  applyControls();
  void load().catch(() => {});
  return () => {
    controller.abort();
    observer.disconnect();
    closeDialog();
    unmountCheck();
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    document.querySelectorAll(`[data-mpi-check="${options.packageName}"],.mpi-version[data-package="${options.packageName}"]`).forEach((node) => node.remove());
  };
}
export {
  handlePluginUpdateEscape,
  manualPluginUpdateCommand,
  observePluginUpdate
};
