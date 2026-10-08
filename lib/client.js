window.__ModuleLoader__.load({ id: "@michengai/dsh-im-connect", factory: (require) => {
const UPDATE_HEADER = "x-michengai-plugin-update";
const STYLE_ID = "michengai-plugin-update-ui";
const PLUGIN_UPDATE_CSS = `
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

    const __imAntdModule = { exports: {} };
    (function (module, exports, require) {
var B1=Object.create;var cb=Object.defineProperty;var V1=Object.getOwnPropertyDescriptor;var H1=Object.getOwnPropertyNames;var k1=Object.getPrototypeOf,W1=Object.prototype.hasOwnProperty;var ao=(e,t)=>()=>(t||e((t={exports:{}}).exports,t),t.exports);var j1=(e,t,o,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let n of H1(t))!W1.call(e,n)&&n!==o&&cb(e,n,{get:()=>t[n],enumerable:!(r=V1(t,n))||r.enumerable});return e};var $=(e,t,o)=>(o=e!=null?B1(k1(e)):{},j1(t||!e||!e.__esModule?cb(o,"default",{value:e,enumerable:!0}):o,e));var gy=ao(vt=>{"use strict";var zm=Symbol.for("react.transitional.element"),Bm=Symbol.for("react.portal"),Mc=Symbol.for("react.fragment"),Oc=Symbol.for("react.strict_mode"),Ac=Symbol.for("react.profiler"),_c=Symbol.for("react.consumer"),Lc=Symbol.for("react.context"),Dc=Symbol.for("react.forward_ref"),Fc=Symbol.for("react.suspense"),zc=Symbol.for("react.suspense_list"),Bc=Symbol.for("react.memo"),Vc=Symbol.for("react.lazy"),py=Symbol.for("react.view_transition"),TP=Symbol.for("react.client.reference");function wr(e){if(typeof e=="object"&&e!==null){var t=e.$$typeof;switch(t){case zm:switch(e=e.type,e){case Mc:case Ac:case Oc:case Fc:case zc:case py:return e;default:switch(e=e&&e.$$typeof,e){case Lc:case Dc:case Vc:case Bc:return e;case _c:return e;default:return t}}case Bm:return t}}}vt.ContextConsumer=_c;vt.ContextProvider=Lc;vt.Element=zm;vt.ForwardRef=Dc;vt.Fragment=Mc;vt.Lazy=Vc;vt.Memo=Bc;vt.Portal=Bm;vt.Profiler=Ac;vt.StrictMode=Oc;vt.Suspense=Fc;vt.SuspenseList=zc;vt.isContextConsumer=function(e){return wr(e)===_c};vt.isContextProvider=function(e){return wr(e)===Lc};vt.isElement=function(e){return typeof e=="object"&&e!==null&&e.$$typeof===zm};vt.isForwardRef=function(e){return wr(e)===Dc};vt.isFragment=function(e){return wr(e)===Mc};vt.isLazy=function(e){return wr(e)===Vc};vt.isMemo=function(e){return wr(e)===Bc};vt.isPortal=function(e){return wr(e)===Bm};vt.isProfiler=function(e){return wr(e)===Ac};vt.isStrictMode=function(e){return wr(e)===Oc};vt.isSuspense=function(e){return wr(e)===Fc};vt.isSuspenseList=function(e){return wr(e)===zc};vt.isValidElementType=function(e){return typeof e=="string"||typeof e=="function"||e===Mc||e===Ac||e===Oc||e===Fc||e===zc||e===py||typeof e=="object"&&e!==null&&(e.$$typeof===Vc||e.$$typeof===Bc||e.$$typeof===Lc||e.$$typeof===_c||e.$$typeof===Dc||e.$$typeof===TP||e.getModuleId!==void 0)};vt.typeOf=wr});var xy=ao((tB,hy)=>{"use strict";hy.exports=gy()});var Ry=ao((bB,kc)=>{"use strict";kc.exports=Km;kc.exports.isMobile=Km;kc.exports.default=Km;var VP=/(android|bb\d+|meego).+mobile|armv7l|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|redmi|series[46]0|samsungbrowser.*mobile|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i,HP=/CrOS/,kP=/android|ipad|playbook|silk/i;function Km(e){e||(e={});let t=e.ua;if(!t&&typeof navigator<"u"&&(t=navigator.userAgent),t&&t.headers&&typeof t.headers["user-agent"]=="string"&&(t=t.headers["user-agent"]),typeof t!="string")return!1;let o=VP.test(t)&&!HP.test(t)||!!e.tablet&&kP.test(t);return!o&&e.tablet&&e.featureDetect&&navigator&&navigator.maxTouchPoints>1&&t.indexOf("Macintosh")!==-1&&t.indexOf("Safari")!==-1&&(o=!0),o}});var Rs=ao((dpe,oc)=>{function sL(e){return e&&e.__esModule?e:{default:e}}oc.exports=sL,oc.exports.__esModule=!0,oc.exports.default=oc.exports});var y1=ao(Yd=>{"use strict";Object.defineProperty(Yd,"__esModule",{value:!0});Yd.default=void 0;var aL={items_per_page:"\u6761/\u9875",jump_to:"\u8DF3\u81F3",jump_to_confirm:"\u786E\u5B9A",page:"\u9875",prev_page:"\u4E0A\u4E00\u9875",next_page:"\u4E0B\u4E00\u9875",prev_5:"\u5411\u524D 5 \u9875",next_5:"\u5411\u540E 5 \u9875",prev_3:"\u5411\u524D 3 \u9875",next_3:"\u5411\u540E 3 \u9875",page_size:"\u9875\u7801"},mpe=Yd.default=aL});var tb=ao(Qd=>{"use strict";Object.defineProperty(Qd,"__esModule",{value:!0});Qd.commonLocale=void 0;var gpe=Qd.commonLocale={yearFormat:"YYYY",dayFormat:"D",cellMeridiemFormat:"A",monthBeforeYear:!0}});var C1=ao(Zd=>{"use strict";Object.defineProperty(Zd,"__esModule",{value:!0});Zd.default=void 0;var lL=tb(),cL={...lL.commonLocale,locale:"zh_CN",today:"\u4ECA\u5929",now:"\u6B64\u523B",backToToday:"\u8FD4\u56DE\u4ECA\u5929",ok:"\u786E\u5B9A",timeSelect:"\u9009\u62E9\u65F6\u95F4",dateSelect:"\u9009\u62E9\u65E5\u671F",weekSelect:"\u9009\u62E9\u5468",clear:"\u6E05\u9664",week:"\u5468",month:"\u6708",year:"\u5E74",previousMonth:"\u4E0A\u4E2A\u6708",nextMonth:"\u4E0B\u4E2A\u6708",monthSelect:"\u9009\u62E9\u6708\u4EFD",yearSelect:"\u9009\u62E9\u5E74\u4EFD",decadeSelect:"\u9009\u62E9\u5E74\u4EE3",previousYear:"\u4E0A\u4E00\u5E74",nextYear:"\u4E0B\u4E00\u5E74",previousDecade:"\u4E0A\u4E00\u5E74\u4EE3",nextDecade:"\u4E0B\u4E00\u5E74\u4EE3",previousCentury:"\u4E0A\u4E00\u4E16\u7EAA",nextCentury:"\u4E0B\u4E00\u4E16\u7EAA",yearFormat:"YYYY\u5E74",cellDateFormat:"D",monthBeforeYear:!1},xpe=Zd.default=cL});var ob=ao(Jd=>{"use strict";Object.defineProperty(Jd,"__esModule",{value:!0});Jd.default=void 0;var uL={placeholder:"\u8BF7\u9009\u62E9\u65F6\u95F4",rangePlaceholder:["\u5F00\u59CB\u65F6\u95F4","\u7ED3\u675F\u65F6\u95F4"]},ype=Jd.default=uL});var rb=ao(em=>{"use strict";var S1=Rs().default;Object.defineProperty(em,"__esModule",{value:!0});em.default=void 0;var fL=S1(C1()),dL=S1(ob()),v1={lang:{placeholder:"\u8BF7\u9009\u62E9\u65E5\u671F",yearPlaceholder:"\u8BF7\u9009\u62E9\u5E74\u4EFD",quarterPlaceholder:"\u8BF7\u9009\u62E9\u5B63\u5EA6",monthPlaceholder:"\u8BF7\u9009\u62E9\u6708\u4EFD",weekPlaceholder:"\u8BF7\u9009\u62E9\u5468",rangePlaceholder:["\u5F00\u59CB\u65E5\u671F","\u7ED3\u675F\u65E5\u671F"],rangeYearPlaceholder:["\u5F00\u59CB\u5E74\u4EFD","\u7ED3\u675F\u5E74\u4EFD"],rangeMonthPlaceholder:["\u5F00\u59CB\u6708\u4EFD","\u7ED3\u675F\u6708\u4EFD"],rangeQuarterPlaceholder:["\u5F00\u59CB\u5B63\u5EA6","\u7ED3\u675F\u5B63\u5EA6"],rangeWeekPlaceholder:["\u5F00\u59CB\u5468","\u7ED3\u675F\u5468"],...fL.default},timePickerLocale:{...dL.default}};v1.lang.ok="\u786E\u5B9A";var Spe=em.default=v1});var R1=ao(tm=>{"use strict";var mL=Rs().default;Object.defineProperty(tm,"__esModule",{value:!0});tm.default=void 0;var pL=mL(rb()),Rpe=tm.default=pL.default});var E1=ao(rm=>{"use strict";var om=Rs().default;Object.defineProperty(rm,"__esModule",{value:!0});rm.default=void 0;var gL=om(y1()),hL=om(R1()),xL=om(rb()),bL=om(ob()),Cr="${label}\u4E0D\u662F\u4E00\u4E2A\u6709\u6548\u7684${type}",yL={locale:"zh-cn",Pagination:gL.default,DatePicker:xL.default,TimePicker:bL.default,Calendar:hL.default,global:{placeholder:"\u8BF7\u9009\u62E9",close:"\u5173\u95ED",sortable:"\u53EF\u6392\u5E8F",show:"\u663E\u793A",hide:"\u9690\u85CF"},Table:{filterTitle:"\u7B5B\u9009",filterConfirm:"\u786E\u5B9A",filterReset:"\u91CD\u7F6E",filterEmptyText:"\u65E0\u7B5B\u9009\u9879",filterCheckAll:"\u5168\u9009",filterSearchPlaceholder:"\u5728\u7B5B\u9009\u9879\u4E2D\u641C\u7D22",emptyText:"\u6682\u65E0\u6570\u636E",selectAll:"\u5168\u9009\u5F53\u9875",selectInvert:"\u53CD\u9009\u5F53\u9875",selectNone:"\u6E05\u7A7A\u6240\u6709",selectionAll:"\u5168\u9009\u6240\u6709",sortTitle:"\u6392\u5E8F",expand:"\u5C55\u5F00\u884C",collapse:"\u5173\u95ED\u884C",triggerDesc:"\u70B9\u51FB\u964D\u5E8F",triggerAsc:"\u70B9\u51FB\u5347\u5E8F",cancelSort:"\u53D6\u6D88\u6392\u5E8F"},Modal:{okText:"\u786E\u5B9A",cancelText:"\u53D6\u6D88",justOkText:"\u77E5\u9053\u4E86"},Tour:{Next:"\u4E0B\u4E00\u6B65",Previous:"\u4E0A\u4E00\u6B65",Finish:"\u7ED3\u675F\u5BFC\u89C8"},Popconfirm:{cancelText:"\u53D6\u6D88",okText:"\u786E\u5B9A"},Transfer:{titles:["",""],searchPlaceholder:"\u8BF7\u8F93\u5165\u641C\u7D22\u5185\u5BB9",itemUnit:"\u9879",itemsUnit:"\u9879",remove:"\u5220\u9664",selectCurrent:"\u5168\u9009\u5F53\u9875",removeCurrent:"\u5220\u9664\u5F53\u9875",selectAll:"\u5168\u9009\u6240\u6709",deselectAll:"\u53D6\u6D88\u5168\u9009",removeAll:"\u5220\u9664\u5168\u90E8",selectInvert:"\u53CD\u9009\u5F53\u9875"},Upload:{uploading:"\u6587\u4EF6\u4E0A\u4F20\u4E2D",removeFile:"\u5220\u9664\u6587\u4EF6",uploadError:"\u4E0A\u4F20\u9519\u8BEF",previewFile:"\u9884\u89C8\u6587\u4EF6",downloadFile:"\u4E0B\u8F7D\u6587\u4EF6"},Empty:{description:"\u6682\u65E0\u6570\u636E"},Icon:{icon:"\u56FE\u6807"},Text:{edit:"\u7F16\u8F91",copy:"\u590D\u5236",copied:"\u590D\u5236\u6210\u529F",expand:"\u5C55\u5F00",collapse:"\u6536\u8D77"},Carousel:{prevSlide:"\u4E0A\u4E00\u5F20\u5E7B\u706F\u7247",nextSlide:"\u4E0B\u4E00\u5F20\u5E7B\u706F\u7247"},Form:{optional:"\uFF08\u53EF\u9009\uFF09",defaultValidateMessages:{default:"\u5B57\u6BB5\u9A8C\u8BC1\u9519\u8BEF${label}",required:"\u8BF7\u8F93\u5165${label}",enum:"${label}\u5FC5\u987B\u662F\u5176\u4E2D\u4E00\u4E2A[${enum}]",whitespace:"${label}\u4E0D\u80FD\u4E3A\u7A7A\u5B57\u7B26",date:{format:"${label}\u65E5\u671F\u683C\u5F0F\u65E0\u6548",parse:"${label}\u4E0D\u80FD\u8F6C\u6362\u4E3A\u65E5\u671F",invalid:"${label}\u662F\u4E00\u4E2A\u65E0\u6548\u65E5\u671F"},types:{string:Cr,method:Cr,array:Cr,object:Cr,number:Cr,date:Cr,boolean:Cr,integer:Cr,float:Cr,regexp:Cr,email:Cr,url:Cr,hex:Cr},string:{len:"${label}\u987B\u4E3A${len}\u4E2A\u5B57\u7B26",min:"${label}\u6700\u5C11${min}\u4E2A\u5B57\u7B26",max:"${label}\u6700\u591A${max}\u4E2A\u5B57\u7B26",range:"${label}\u987B\u5728${min}-${max}\u5B57\u7B26\u4E4B\u95F4"},number:{len:"${label}\u5FC5\u987B\u7B49\u4E8E${len}",min:"${label}\u6700\u5C0F\u503C\u4E3A${min}",max:"${label}\u6700\u5927\u503C\u4E3A${max}",range:"${label}\u987B\u5728${min}-${max}\u4E4B\u95F4"},array:{len:"\u987B\u4E3A${len}\u4E2A${label}",min:"\u6700\u5C11${min}\u4E2A${label}",max:"\u6700\u591A${max}\u4E2A${label}",range:"${label}\u6570\u91CF\u987B\u5728${min}-${max}\u4E4B\u95F4"},pattern:{mismatch:"${label}\u4E0E\u6A21\u5F0F\u4E0D\u5339\u914D${pattern}"}}},QRCode:{expired:"\u4E8C\u7EF4\u7801\u8FC7\u671F",refresh:"\u70B9\u51FB\u5237\u65B0",scanned:"\u5DF2\u626B\u63CF"},ColorPicker:{presetEmpty:"\u6682\u65E0",transparent:"\u65E0\u8272",singleColor:"\u5355\u8272",gradientColor:"\u6E10\u53D8\u8272"}},wpe=rm.default=yL});var $1=ao((Ppe,w1)=>{w1.exports=E1()});var P1=ao(nm=>{"use strict";Object.defineProperty(nm,"__esModule",{value:!0});nm.default=void 0;var CL={items_per_page:"/ page",jump_to:"Go to",jump_to_confirm:"confirm",page:"Page",prev_page:"Previous Page",next_page:"Next Page",prev_5:"Previous 5 Pages",next_5:"Next 5 Pages",prev_3:"Previous 3 Pages",next_3:"Next 3 Pages",page_size:"Page Size"},Npe=nm.default=CL});var N1=ao(im=>{"use strict";Object.defineProperty(im,"__esModule",{value:!0});im.default=void 0;var SL=tb(),vL={...SL.commonLocale,locale:"en_US",today:"Today",now:"Now",backToToday:"Back to today",ok:"OK",clear:"Clear",week:"Week",month:"Month",year:"Year",timeSelect:"select time",dateSelect:"select date",weekSelect:"Choose a week",monthSelect:"Choose a month",yearSelect:"Choose a year",decadeSelect:"Choose a decade",previousMonth:"Previous month",nextMonth:"Next month",previousYear:"Last year",nextYear:"Next year",previousDecade:"Last decade",nextDecade:"Next decade",previousCentury:"Last century",nextCentury:"Next century"},Tpe=im.default=vL});var nb=ao(sm=>{"use strict";Object.defineProperty(sm,"__esModule",{value:!0});sm.default=void 0;var RL={placeholder:"Select time",rangePlaceholder:["Start time","End time"]},Ope=sm.default=RL});var ib=ao(am=>{"use strict";var I1=Rs().default;Object.defineProperty(am,"__esModule",{value:!0});am.default=void 0;var EL=I1(N1()),wL=I1(nb()),$L={lang:{placeholder:"Select date",yearPlaceholder:"Select year",quarterPlaceholder:"Select quarter",monthPlaceholder:"Select month",weekPlaceholder:"Select week",rangePlaceholder:["Start date","End date"],rangeYearPlaceholder:["Start year","End year"],rangeQuarterPlaceholder:["Start quarter","End quarter"],rangeMonthPlaceholder:["Start month","End month"],rangeWeekPlaceholder:["Start week","End week"],...EL.default},timePickerLocale:{...wL.default}},_pe=am.default=$L});var T1=ao(lm=>{"use strict";var PL=Rs().default;Object.defineProperty(lm,"__esModule",{value:!0});lm.default=void 0;var NL=PL(ib()),Dpe=lm.default=NL.default});var M1=ao(um=>{"use strict";var cm=Rs().default;Object.defineProperty(um,"__esModule",{value:!0});um.default=void 0;var IL=cm(P1()),TL=cm(T1()),ML=cm(ib()),OL=cm(nb()),Sr="${label} is not a valid ${type}",AL={locale:"en",Pagination:IL.default,DatePicker:ML.default,TimePicker:OL.default,Calendar:TL.default,global:{placeholder:"Please select",close:"Close",sortable:"sortable",show:"Show",hide:"Hide"},Table:{filterTitle:"Filter menu",filterConfirm:"OK",filterReset:"Reset",filterEmptyText:"No filters",filterCheckAll:"Select all items",filterSearchPlaceholder:"Search in filters",emptyText:"No data",selectAll:"Select current page",selectInvert:"Invert current page",selectNone:"Clear all data",selectionAll:"Select all data",sortTitle:"Sort",expand:"Expand row",collapse:"Collapse row",triggerDesc:"Click to sort descending",triggerAsc:"Click to sort ascending",cancelSort:"Click to cancel sorting"},Tour:{Next:"Next",Previous:"Previous",Finish:"Finish"},Modal:{okText:"OK",cancelText:"Cancel",justOkText:"OK"},Popconfirm:{okText:"OK",cancelText:"Cancel"},Transfer:{titles:["",""],searchPlaceholder:"Search here",itemUnit:"item",itemsUnit:"items",remove:"Remove",selectCurrent:"Select current page",removeCurrent:"Remove current page",selectAll:"Select all data",deselectAll:"Deselect all data",removeAll:"Remove all data",selectInvert:"Invert current page"},Upload:{uploading:"Uploading...",removeFile:"Remove file",uploadError:"Upload error",previewFile:"Preview file",downloadFile:"Download file"},Empty:{description:"No data"},Icon:{icon:"icon"},Text:{edit:"Edit",copy:"Copy",copied:"Copied",expand:"Expand",collapse:"Collapse"},Carousel:{prevSlide:"Previous slide",nextSlide:"Next slide"},Form:{optional:"(optional)",defaultValidateMessages:{default:"Field validation error for ${label}",required:"Please enter ${label}",enum:"${label} must be one of [${enum}]",whitespace:"${label} cannot be a blank character",date:{format:"${label} date format is invalid",parse:"${label} cannot be converted to a date",invalid:"${label} is an invalid date"},types:{string:Sr,method:Sr,array:Sr,object:Sr,number:Sr,date:Sr,boolean:Sr,integer:Sr,float:Sr,regexp:Sr,email:Sr,url:Sr,hex:Sr},string:{len:"${label} must be ${len} characters",min:"${label} must be at least ${min} characters",max:"${label} must be up to ${max} characters",range:"${label} must be between ${min}-${max} characters"},number:{len:"${label} must be equal to ${len}",min:"${label} must be minimum ${min}",max:"${label} must be maximum ${max}",range:"${label} must be between ${min}-${max}"},array:{len:"Must be ${len} ${label}",min:"At least ${min} ${label}",max:"At most ${max} ${label}",range:"The amount of ${label} must be between ${min}-${max}"},pattern:{mismatch:"${label} does not match the pattern ${pattern}"}}},QRCode:{expired:"QR code expired",refresh:"Refresh",scanned:"Scanned"},ColorPicker:{presetEmpty:"Empty",transparent:"Transparent",singleColor:"Single",gradientColor:"Gradient"}},zpe=um.default=AL});var A1=ao((Vpe,O1)=>{O1.exports=M1()});var ht=$(require("react"));function U1(e){for(var t=0,o,r=0,n=e.length;n>=4;++r,n-=4)o=e.charCodeAt(r)&255|(e.charCodeAt(++r)&255)<<8|(e.charCodeAt(++r)&255)<<16|(e.charCodeAt(++r)&255)<<24,o=(o&65535)*1540483477+((o>>>16)*59797<<16),o^=o>>>24,t=(o&65535)*1540483477+((o>>>16)*59797<<16)^(t&65535)*1540483477+((t>>>16)*59797<<16);switch(n){case 3:t^=(e.charCodeAt(r+2)&255)<<16;case 2:t^=(e.charCodeAt(r+1)&255)<<8;case 1:t^=e.charCodeAt(r)&255,t=(t&65535)*1540483477+((t>>>16)*59797<<16)}return t^=t>>>13,t=(t&65535)*1540483477+((t>>>16)*59797<<16),((t^t>>>15)>>>0).toString(36)}var ei=U1;function It(){return!!(typeof window<"u"&&window.document&&window.document.createElement)}function Li(e,t){if(!e)return!1;if(e.contains)return e.contains(t);let o=t;for(;o;){if(o===e)return!0;o=o.parentNode}return!1}var ub="data-rc-order",fb="data-rc-priority",q1="rc-util-key",mm=new Map;function db({mark:e}={}){return e?e.startsWith("data-")?e:`data-${e}`:q1}function ac(e){return e.attachTo?e.attachTo:document.querySelector("head")||document.body}function G1(e){return e==="queue"?"prependQueue":e?"prepend":"append"}function pm(e){return Array.from((mm.get(e)||e).children).filter(t=>t.tagName==="STYLE")}function gm(e,t={}){if(!It())return null;let{csp:o,prepend:r,priority:n=0}=t,i=G1(r),s=i==="prependQueue",a=document.createElement("style");a.setAttribute(ub,i),s&&n&&a.setAttribute(fb,`${n}`),o?.nonce&&(a.nonce=o?.nonce),a.innerHTML=e;let c=ac(t),{firstChild:l}=c;if(r){if(s){let u=(t.styles||pm(c)).filter(f=>{if(!["prepend","prependQueue"].includes(f.getAttribute(ub)))return!1;let d=Number(f.getAttribute(fb)||0);return n>=d});if(u.length)return c.insertBefore(a,u[u.length-1].nextSibling),a}c.insertBefore(a,l)}else c.appendChild(a);return a}function mb(e,t={}){let{styles:o}=t;return o||=pm(ac(t)),o.find(r=>r.getAttribute(db(t))===e)}function jr(e,t={}){let o=mb(e,t);o&&ac(t).removeChild(o)}function X1(e,t){let o=mm.get(e);if(!o||!Li(document,o)){let r=gm("",t),{parentNode:n}=r;mm.set(e,n),e.removeChild(r)}}function Go(e,t,o={}){let r=ac(o),n=pm(r),i={...o,styles:n};X1(r,i);let s=mb(t,i);if(s)return i.csp?.nonce&&s.nonce!==i.csp?.nonce&&(s.nonce=i.csp?.nonce),s.innerHTML!==e&&(s.innerHTML=e),s;let a=gm(e,i);return a.setAttribute(db(i),t),a}var Nb=require("react");var pb=$(require("react"));function Ur(e,t,o){let r=pb.useRef({});return(!("value"in r.current)||o(r.current.condition,t))&&(r.current.value=e(),r.current.condition=t),r.current.value}var hm={},K1=[],Y1=e=>{K1.push(e)};function gb(e,t){}function Q1(e,t){}function hb(){hm={}}function xb(e,t,o){!t&&!hm[o]&&(e(!1,o),hm[o]=!0)}function lc(e,t){xb(gb,e,t)}function xm(e,t){xb(Q1,e,t)}lc.preMessage=Y1;lc.resetWarned=hb;lc.noteOnce=xm;var Gt=lc;function Z1(e,t,o=!1){let r=new Set;function n(i,s,a=1){let c=r.has(i);if(Gt(!c,"Warning: There may be circular references"),c)return!1;if(i===s)return!0;if(o&&a>1)return!1;r.add(i);let l=a+1;if(Array.isArray(i)){if(!Array.isArray(s)||i.length!==s.length)return!1;for(let u=0;u<i.length;u++)if(!n(i[u],s[u],l))return!1;return!0}if(i&&s&&typeof i=="object"&&typeof s=="object"){let u=Object.keys(i);return u.length!==Object.keys(s).length?!1:u.every(f=>n(i[f],s[f],l))}return!1}return n(e,t)}var Di=Z1;var uc=$(require("react"));function cc(e){return e.join("%")}var bb=0,bm=class{instanceId;constructor(t){this.instanceId=t}cache=new Map;updateTimes=new Map;extracted=new Set;get(t){return this.opGet(cc(t))}opGet(t){return this.cache.get(t)||null}update(t,o){return this.opUpdate(cc(t),o)}opUpdate(t,o){let r=this.cache.get(t),n=o(r);n===null?(this.cache.delete(t),this.updateTimes.delete(t)):(this.cache.set(t,n),this.updateTimes.set(t,bb),bb+=1)}},yb=bm;var Fi="data-token-hash",jo="data-css-hash";var cn="__cssinjs_instance__";function Cb(){let e=Math.random().toString(12).slice(2);if(typeof document<"u"&&document.head&&document.body){let t=document.body.querySelectorAll(`style[${jo}]`)||[],{firstChild:o}=document.head;Array.from(t).forEach(n=>{n[cn]||=e,n[cn]===e&&document.head.insertBefore(n,o)});let r={};Array.from(document.querySelectorAll(`style[${jo}]`)).forEach(n=>{let i=n.getAttribute(jo);r[i]?n[cn]===e&&n.parentNode?.removeChild(n):r[i]=!0})}return new yb(e)}var J1=uc.createContext({hashPriority:"low",cache:Cb(),defaultCache:!0,autoPrefix:!1});var qr=J1;var tP="CALC_UNIT",tD=new RegExp(tP,"g");function oP(e,t){if(e.length!==t.length)return!1;for(let o=0;o<e.length;o++)if(e[o]!==t[o])return!1;return!0}var Es=class e{static MAX_CACHE_SIZE=20;static MAX_CACHE_OFFSET=5;cache;keys;cacheCallTimes;constructor(){this.cache=new Map,this.keys=[],this.cacheCallTimes=0}size(){return this.keys.length}internalGet(t,o=!1){let r={map:this.cache};return t.forEach(n=>{r?r=r?.map?.get(n):r=void 0}),r?.value&&o&&(r.value[1]=this.cacheCallTimes++),r?.value}get(t){return this.internalGet(t,!0)?.[0]}has(t){return!!this.internalGet(t)}set(t,o){if(!this.has(t)){if(this.size()+1>e.MAX_CACHE_SIZE+e.MAX_CACHE_OFFSET){let[n]=this.keys.reduce((i,s)=>{let[,a]=i;return this.internalGet(s)[1]<a?[s,this.internalGet(s)[1]]:i},[this.keys[0],this.cacheCallTimes]);this.delete(n)}this.keys.push(t)}let r=this.cache;t.forEach((n,i)=>{if(i===t.length-1)r.set(n,{value:[o,this.cacheCallTimes++]});else{let s=r.get(n);s?s.map||(s.map=new Map):r.set(n,{map:new Map}),r=r.get(n).map}})}deleteByPath(t,o){let r=t.get(o[0]);if(o.length===1)return r.map?t.set(o[0],{map:r.map}):t.delete(o[0]),r.value?.[0];let n=this.deleteByPath(r.map,o.slice(1));return(!r.map||r.map.size===0)&&!r.value&&t.delete(o[0]),n}delete(t){if(this.has(t))return this.keys=this.keys.filter(o=>!oP(o,t)),this.deleteByPath(this.cache,t)}};var Sb=0,In=class{derivatives;id;constructor(t){this.derivatives=Array.isArray(t)?t:[t],this.id=Sb,t.length===0&&(t.length>0,void 0),Sb+=1}getDerivativeToken(t){return this.derivatives.reduce((o,r)=>r(t,o),void 0)}};var ym=new Es;function un(e){let t=Array.isArray(e)?e:[e];return ym.has(t)||ym.set(t,new In(t)),ym.get(t)}var nP=new WeakMap,Cm={};function Rb(e,t){let o=nP;for(let r=0;r<t.length;r+=1){let n=t[r];o.has(n)||o.set(n,new WeakMap),o=o.get(n)}return o.has(Cm)||o.set(Cm,e()),o.get(Cm)}var vb=new WeakMap;function ws(e){let t=vb.get(e)||"";return t||(Object.keys(e).forEach(o=>{let r=e[o];t+=o,r instanceof In?t+=r.id:r&&typeof r=="object"?t+=ws(r):t+=r}),t=ei(t),vb.set(e,t)),t}function Eb(e,t){return ei(`${t}_${ws(e)}`)}var $D=`random-${Date.now()}-${Math.random()}`.replace(/\./g,"");var Da=It();function J(e){return typeof e=="number"?`${e}px`:e}function ti(e,t,o,r={},n=!1){if(n)return e;let i={...r,[Fi]:t,[jo]:o};return`<style ${Object.keys(i).map(a=>{let c=i[a];return c?`${a}="${c}"`:null}).filter(a=>a).join(" ")}>${e}</style>`}function fc(e){let{hashCls:t,hashPriority:o="low"}=e||{};if(!t)return"";let r=`.${t}`;return o==="low"?`:where(${r})`:r}var wb=e=>e!=null;function $s(e,t){let o=typeof t=="function"?t():t;return o?{...e,csp:{...e.csp,nonce:o}}:e}var Ps=(e,t="")=>`--${t?`${t}-`:""}${e}`.replace(/([a-z0-9])([A-Z])/g,"$1-$2").replace(/([A-Z]+)([A-Z][a-z0-9]+)/g,"$1-$2").replace(/([a-z])([A-Z0-9])/g,"$1-$2").toLowerCase(),iP=(e,t,o)=>{let{hashCls:r,hashPriority:n="low",scope:i}=o||{};if(!Object.keys(e).length)return"";let s=`${fc({hashCls:r,hashPriority:n})}.${t}`,a=[i].flat().filter(Boolean);return`${a.length?a.map(l=>`${s}.${l}`).join(", "):s}{${Object.entries(e).map(([l,u])=>`${l}:${u};`).join("")}}`},dc=(e,t,o)=>{let{hashCls:r,hashPriority:n="low",prefix:i,unitless:s,ignore:a,preserve:c}=o||{},l={},u={};return Object.entries(e).forEach(([f,d])=>{if(c?.[f])u[f]=d;else if((typeof d=="string"||typeof d=="number")&&!a?.[f]){let m=Ps(f,i);l[m]=typeof d=="number"&&!s?.[f]?`${d}px`:String(d),u[f]=`var(${m})`}}),[u,iP(l,t,{scope:o?.scope,hashCls:r,hashPriority:n})]};var pc=$(require("react")),Pb=require("react");function sP(){return!1}var $b=sP;var mc=new Map;function zi(e,t,o,r,n){let{cache:i}=pc.useContext(qr),s=[e,...t],a=cc(s),c=$b(),l=d=>{i.opUpdate(a,m=>{let[p=0,g]=m||[void 0,void 0],x=g||o(),b=[p,x];return d?d(b):b})};pc.useMemo(()=>{l()},[a]);let f=i.opGet(a)[1];return(0,Pb.useInsertionEffect)(()=>(l(([d,m])=>[d+1,m]),mc.has(a)||(n?.(f),mc.set(a,!0),Promise.resolve().then(()=>{mc.delete(a)})),()=>{i.opUpdate(a,d=>{let[m=0,p]=d||[];return m-1===0?(r?.(p,!1),mc.delete(a),null):[m-1,p]})}),[a]),f}var aP={},lP="css",Bi=new Map;function cP(e){Bi.set(e,(Bi.get(e)||0)+1)}function uP(e,t){typeof document<"u"&&document.querySelectorAll(`style[${Fi}="${e}"]`).forEach(r=>{r[cn]===t&&r.parentNode?.removeChild(r)})}var fP=-1;function dP(e,t){Bi.set(e,(Bi.get(e)||0)-1);let o=new Set;Bi.forEach((r,n)=>{r<=0&&o.add(n)}),Bi.size-o.size>fP&&o.forEach(r=>{uP(r,t),Bi.delete(r)})}var gc=(e,t,o,r)=>{let i={...o.getDerivativeToken(e),...t};return r&&(i=r(i)),i},Sm="token";function hc(e,t,o){let{cache:{instanceId:r},container:n,hashPriority:i}=(0,Nb.useContext)(qr),{salt:s="",override:a=aP,formatToken:c,getComputedToken:l,cssVar:u,nonce:f}=o,d=Rb(()=>Object.assign({},...t),t),m=ws(d),p=ws(a),g=ws(u);return zi(Sm,[s,e.id,m,p,g],()=>{let x=l?l(d,a,e):gc(d,a,e,c),b={...x},h=`${s}_${u.prefix}`,S=ei(h),C=`${lP}-${S}`;b._tokenKey=Eb(b,h);let[R,v]=dc(x,u.key,{prefix:u.prefix,ignore:u.ignore,unitless:u.unitless,preserve:u.preserve,hashPriority:i,hashCls:u.hashed?C:void 0});return R._hashId=S,cP(u.key),[R,C,b,v,u.key]},([,,,,x])=>{dP(x,r)},([,,,x,b])=>{if(!x)return;let h={mark:jo,prepend:"queue",attachTo:n,priority:-999};h=$s(h,f);let S=Go(x,ei(`css-var-${b}`),h);S[cn]=r,S.setAttribute(Fi,b)})}var Ib=(e,t,o)=>{let[,,r,n,i]=e,{plain:s}=o||{};if(!n)return null;let a=r._tokenKey,c=-999,l={"data-rc-order":"prependQueue","data-rc-priority":`${c}`},u=ti(n,i,a,l,s);return[c,a,u]};var oy=require("react");var Jb=$(require("react"));var mP={animationIterationCount:1,borderImageOutset:1,borderImageSlice:1,borderImageWidth:1,boxFlex:1,boxFlexGroup:1,boxOrdinalGroup:1,columnCount:1,columns:1,flex:1,flexGrow:1,flexPositive:1,flexShrink:1,flexNegative:1,flexOrder:1,gridRow:1,gridRowEnd:1,gridRowSpan:1,gridRowStart:1,gridColumn:1,gridColumnEnd:1,gridColumnSpan:1,gridColumnStart:1,msGridRow:1,msGridRowSpan:1,msGridColumn:1,msGridColumnSpan:1,fontWeight:1,lineHeight:1,opacity:1,order:1,orphans:1,tabSize:1,widows:1,zIndex:1,zoom:1,WebkitLineClamp:1,fillOpacity:1,floodOpacity:1,stopOpacity:1,strokeDasharray:1,strokeDashoffset:1,strokeMiterlimit:1,strokeOpacity:1,strokeWidth:1},vm=mP;var St="-ms-",Vi="-moz-",rt="-webkit-",xc="comm",Ns="rule",Is="decl";var Tb="@import";var Mb="@namespace",bc="@keyframes";var Ob="@layer";var Ab=Math.abs,Hi=String.fromCharCode,Fa=Object.assign;function _b(e,t){return Ut(e,0)^45?(((t<<2^Ut(e,0))<<2^Ut(e,1))<<2^Ut(e,2))<<2^Ut(e,3):0}function yc(e){return e.trim()}function Gr(e,t){return(e=t.exec(e))?e[0]:e}function We(e,t,o){return e.replace(t,o)}function Cc(e,t){return e.indexOf(t)}function Ut(e,t){return e.charCodeAt(t)|0}function Xr(e,t,o){return e.slice(t,o)}function Lo(e){return e.length}function Sc(e){return e.length}function ki(e,t){return t.push(e),e}function Lb(e,t){return e.map(t).join("")}function Rm(e,t){return e.filter(function(o){return!Gr(o,t)})}var vc=1,Ts=1,Db=0,Rr=0,to=0,Os="";function za(e,t,o,r,n,i,s,a){return{value:e,root:t,parent:o,type:r,props:n,children:i,line:vc,column:Ts,length:s,return:"",siblings:a}}function Tn(e,t){return Fa(za("",null,null,"",null,null,0,e.siblings),e,{length:-e.length},t)}function Wi(e){for(;e.root;)e=Tn(e.root,{children:[e]});ki(e,e.siblings)}function Fb(){return to}function zb(){return to=Rr>0?Ut(Os,--Rr):0,Ts--,to===10&&(Ts=1,vc--),to}function Er(){return to=Rr<Db?Ut(Os,Rr++):0,Ts++,to===10&&(Ts=1,vc++),to}function Mn(){return Ut(Os,Rr)}function Ba(){return Rr}function Rc(e,t){return Xr(Os,e,t)}function Ms(e){switch(e){case 0:case 9:case 10:case 13:case 32:return 5;case 33:case 43:case 44:case 47:case 62:case 64:case 126:case 59:case 123:case 125:return 4;case 58:return 3;case 34:case 39:case 40:case 91:return 2;case 41:case 93:return 1}return 0}function Bb(e){return vc=Ts=1,Db=Lo(Os=e),Rr=0,[]}function Vb(e){return Os="",e}function Ec(e){return yc(Rc(Rr-1,Em(e===91?e+2:e===40?e+1:e)))}function Hb(e){for(;(to=Mn())&&to<33;)Er();return Ms(e)>2||Ms(to)>3?"":" "}function kb(e,t){for(;--t&&Er()&&!(to<48||to>102||to>57&&to<65||to>70&&to<97););return Rc(e,Ba()+(t<6&&Mn()==32&&Er()==32))}function Em(e){for(;Er();)switch(to){case e:return Rr;case 34:case 39:e!==34&&e!==39&&Em(to);break;case 40:e===41&&Em(e);break;case 92:Er();break}return Rr}function Wb(e,t){for(;Er()&&e+to!==57;)if(e+to===84&&Mn()===47)break;return"/*"+Rc(t,Rr-1)+"*"+Hi(e===47?e:Er())}function jb(e){for(;!Ms(Mn());)Er();return Rc(e,Rr)}function wm(e){return Vb(wc("",null,null,null,[""],e=Bb(e),0,[0],e))}function wc(e,t,o,r,n,i,s,a,c){for(var l=0,u=0,f=s,d=0,m=0,p=0,g=1,y=1,x=1,b=0,h=0,S="",C=n,R=i,v=r,w=S;y;)switch(p=h,h=Er()){case 40:p!=108&&Ut(w,f-1)==58?(b++,w+="("):w+=Ec(h);break;case 41:b--,w+=")";break;case 34:case 39:case 91:w+=Ec(h);break;case 9:case 10:case 13:case 32:if(b>0){w+=Hi(h);break}w+=Hb(p);break;case 92:w+=kb(Ba()-1,7);continue;case 47:switch(Mn()){case 42:case 47:ki(pP(Wb(Er(),Ba()),t,o,c),c),(Ms(p||1)==5||Ms(Mn()||1)==5)&&Lo(w)&&Xr(w,-1,void 0)!==" "&&(w+=" ");break;default:w+="/"}break;case 123*g:a[l++]=Lo(w)*x;case 125*g:case 59:case 0:if(b>0&&h){w+=Hi(h);break}switch(h){case 0:case 125:y=0;case 59+u:x==-1&&(w=We(w,/\f/g,"")),m>0&&(Lo(w)-f||g===0)&&ki(m>32?qb(w+";",r,o,f-1,c):qb(We(w," ","")+";",r,o,f-2,c),c);break;case 59:w+=";";default:if(ki(v=Ub(w,t,o,l,u,n,a,S,C=[],R=[],f,i),i),h===123)if(u===0)wc(w,t,v,v,C,i,f,a,R);else{switch(d){case 99:if(Ut(w,3)===110)break;case 108:if(Ut(w,2)===97)break;default:u=0;case 100:case 109:case 115:}u?wc(e,v,v,r&&ki(Ub(e,v,v,0,0,n,a,S,n,C=[],f,R),R),n,R,f,a,r?C:R):wc(w,v,v,v,[""],R,0,a,R)}}l=u=m=0,g=x=1,S=w="",f=s;break;case 58:f=1+Lo(w),m=p;default:if(g<1){if(h==123)--g;else if(h==125&&g++==0&&zb()==125)continue}switch(w+=Hi(h),h*g){case 38:x=u>0?1:(w+="\f",-1);break;case 44:if(b>0)break;a[l++]=(Lo(w)-1)*x,x=1;break;case 64:Mn()===45&&(w+=Ec(Er())),d=Mn(),u=f=Lo(S=w+=jb(Ba())),h++;break;case 45:p===45&&Lo(w)==2&&(g=0)}}return i}function Ub(e,t,o,r,n,i,s,a,c,l,u,f){for(var d=n-1,m=n===0?i:[""],p=Sc(m),g=0,y=0,x=0;g<r;++g)for(var b=0,h=Xr(e,d+1,d=Ab(y=s[g])),S=e;b<p;++b)(S=yc(y>0?m[b]+" "+h:We(h,/&\f/g,m[b])))&&(c[x++]=S);return za(e,t,o,n===0?Ns:a,c,l,u,f)}function pP(e,t,o,r){return za(e,t,o,xc,Hi(Fb()),Xr(e,2,-2),0,r)}function qb(e,t,o,r,n){return za(e,t,o,Is,Xr(e,0,r),Xr(e,r+1,-1),r,n)}function $m(e,t,o){switch(_b(e,t)){case 5103:return rt+"print-"+e+e;case 5737:case 4201:case 3177:case 3433:case 1641:case 4457:case 2921:case 5572:case 6356:case 5844:case 3191:case 6645:case 3005:case 4215:case 6389:case 5109:case 5365:case 5621:case 3829:case 6391:case 5879:case 5623:case 6135:case 4599:return rt+e+e;case 4855:return rt+e.replace("add","source-over").replace("substract","source-out").replace("intersect","source-in").replace("exclude","xor")+e;case 4789:return Vi+e+e;case 5349:case 4246:case 4810:case 6968:case 2756:return rt+e+Vi+e+St+e+e;case 5936:switch(Ut(e,t+11)){case 114:return rt+e+St+We(e,/[svh]\w+-[tblr]{2}/,"tb")+e;case 108:return rt+e+St+We(e,/[svh]\w+-[tblr]{2}/,"tb-rl")+e;case 45:return rt+e+St+We(e,/[svh]\w+-[tblr]{2}/,"lr")+e}case 6828:case 4268:case 2903:return rt+e+St+e+e;case 6165:return rt+e+St+"flex-"+e+e;case 5187:return rt+e+We(e,/(\w+).+(:[^]+)/,rt+"box-$1$2"+St+"flex-$1$2")+e;case 5443:return rt+e+St+"flex-item-"+We(e,/flex-|-self/g,"")+(Gr(e,/flex-|baseline/)?"":St+"grid-row-"+We(e,/flex-|-self/g,""))+e;case 4675:return rt+e+St+"flex-line-pack"+We(e,/align-content|flex-|-self/g,"")+e;case 5548:return rt+e+St+We(e,"shrink","negative")+e;case 5292:return rt+e+St+We(e,"basis","preferred-size")+e;case 6060:return rt+"box-"+We(e,"-grow","")+rt+e+St+We(e,"grow","positive")+e;case 4554:return rt+We(e,/([^-])(transform)/g,"$1"+rt+"$2")+e;case 6187:return We(We(We(e,/(zoom-|grab)/,rt+"$1"),/(image-set)/,rt+"$1"),e,"")+e;case 5495:case 3959:return We(e,/(image-set\([^]*)/,rt+"$1$`$1");case 4968:return We(We(e,/(.+:)(flex-)?(.*)/,rt+"box-pack:$3"+St+"flex-pack:$3"),/space-between/,"justify")+rt+e+e;case 4200:if(!Gr(e,/flex-|baseline/))return St+"grid-column-align"+Xr(e,t)+e;break;case 2592:case 3360:return St+We(e,"template-","")+e;case 4384:case 3616:return o&&o.some(function(r,n){return t=n,Gr(r.props,/grid-\w+-end/)})?~Cc(e+(o=o[t].value),"span")?e:St+We(e,"-start","")+e+St+"grid-row-span:"+(~Cc(o,"span")?Gr(o,/\d+/):+Gr(o,/\d+/)-+Gr(e,/\d+/))+";":St+We(e,"-start","")+e;case 4896:case 4128:return o&&o.some(function(r){return Gr(r.props,/grid-\w+-start/)})?e:St+We(We(e,"-end","-span"),"span ","")+e;case 4095:case 3583:case 4068:case 2532:return We(e,/(.+)-inline(.+)/,rt+"$1$2")+e;case 8116:case 7059:case 5753:case 5535:case 5445:case 5701:case 4933:case 4677:case 5533:case 5789:case 5021:case 4765:if(Lo(e)-1-t>6)switch(Ut(e,t+1)){case 109:if(Ut(e,t+4)!==45)break;case 102:return We(e,/(.+:)(.+)-([^]+)/,"$1"+rt+"$2-$3$1"+Vi+(Ut(e,t+3)==108?"$3":"$2-$3"))+e;case 115:return~Cc(e,"stretch")?$m(We(e,"stretch","fill-available"),t,o)+e:e}break;case 5152:case 5920:return We(e,/(.+?):(\d+)(\s*\/\s*(span)?\s*(\d+))?(.*)/,function(r,n,i,s,a,c,l){return St+n+":"+i+l+(s?St+n+"-span:"+(a?c:+c-+i)+l:"")+e});case 4949:if(Ut(e,t+6)===121)return We(e,":",":"+rt)+e;break;case 6444:switch(Ut(e,Ut(e,14)===45?18:11)){case 120:return We(e,/(.+:)([^;\s!]+)(;|(\s+)?!.+)?/,"$1"+rt+(Ut(e,14)===45?"inline-":"")+"box$3$1"+rt+"$2$3$1"+St+"$2box$3")+e;case 100:return We(e,":",":"+St)+e}break;case 5719:case 2647:case 2135:case 3927:case 2391:return We(e,"scroll-","scroll-snap-")+e}return e}function ji(e,t){for(var o="",r=0;r<e.length;r++)o+=t(e[r],r,e,t)||"";return o}function Pm(e,t,o,r){switch(e.type){case Ob:if(e.children.length)break;case Tb:case Mb:case Is:return e.return=e.return||e.value;case xc:return"";case bc:return e.return=e.value+"{"+ji(e.children,r)+"}";case Ns:if(!Lo(e.value=e.props.join(",")))return""}return Lo(o=ji(e.children,r))?e.return=e.value+"{"+o+"}":""}function Gb(e){var t=Sc(e);return function(o,r,n,i){for(var s="",a=0;a<t;a++)s+=e[a](o,r,n,i)||"";return s}}function Xb(e,t,o,r){if(e.length>-1&&!e.return)switch(e.type){case Is:e.return=$m(e.value,e.length,o);return;case bc:return ji([Tn(e,{value:We(e.value,"@","@"+rt)})],r);case Ns:if(e.length)return Lb(o=e.props,function(n){switch(Gr(n,r=/(::plac\w+|:read-\w+)/)){case":read-only":case":read-write":Wi(Tn(e,{props:[We(n,/:(read-\w+)/,":"+Vi+"$1")]})),Wi(Tn(e,{props:[n]})),Fa(e,{props:Rm(o,r)});break;case"::placeholder":Wi(Tn(e,{props:[We(n,/:(plac\w+)/,":"+rt+"input-$1")]})),Wi(Tn(e,{props:[We(n,/:(plac\w+)/,":"+Vi+"$1")]})),Wi(Tn(e,{props:[We(n,/:(plac\w+)/,St+"input-$1")]})),Wi(Tn(e,{props:[n]})),Fa(e,{props:Rm(o,r)});break}return""})}}var Nm="data-ant-cssinjs-cache-path",Im="_FILE_STYLE__";var Ui,Kb=!0;function yP(){if(!Ui&&(Ui={},It())){let e=document.createElement("div");e.className=Nm,e.style.position="fixed",e.style.visibility="hidden",e.style.top="-9999px",document.body.appendChild(e);let t=getComputedStyle(e).content||"";t=t.replace(/^"/,"").replace(/"$/,""),t.split(";").forEach(r=>{let[n,i]=r.split(":");Ui[n]=i});let o=document.querySelector(`style[${Nm}]`);o&&(Kb=!1,o.parentNode?.removeChild(o)),document.body.removeChild(e)}}function Yb(e){return yP(),!!Ui[e]}function Qb(e){let t=Ui[e],o=null;if(t&&It())if(Kb)o=Im;else{let r=document.querySelector(`style[${jo}="${Ui[e]}"]`);r?o=r.innerHTML:delete Ui[e]}return[o,t]}var CP="_skip_check_",ey="_multi_value_";function $c(e,t){return(t?ji(wm(e),Gb([Xb,Pm])):ji(wm(e),Pm)).replace(/\{%%%\:[^;];}/g,";")}function SP(e){return typeof e=="object"&&e&&(CP in e||ey in e)}function Zb(e,t,o="high"){if(!t)return e;let r=fc({hashCls:t,hashPriority:o});return e.split(",").map(i=>{let s=i.trim().split(/\s+/),a=s[0]||"",c=a.match(/^\w+/)?.[0]||"";return a=`${c}${r}${a.slice(c.length)}`,[a,...s.slice(1)].join(" ")}).join(",")}var Tm=(e,t={},{root:o,injectHash:r,parentSelectors:n}={root:!0,parentSelectors:[]})=>{let{hashId:i,layer:s,path:a,hashPriority:c,transformers:l=[],linters:u=[]}=t,f="",d={};function m(y){let x=y.getName(i);if(!d[x]){let[b]=Tm(y.style,t,{root:!1,parentSelectors:n});d[x]=`@keyframes ${y.getName(i)}${b}`}}function p(y,x=[]){return y.forEach(b=>{Array.isArray(b)?p(b,x):b&&x.push(b)}),x}return p(Array.isArray(e)?e:[e]).forEach(y=>{let x=typeof y=="string"&&!o?{}:y;if(typeof x=="string")f+=`${x}
`;else if(x._keyframe)m(x);else{let b=l.reduce((h,S)=>S?.visit?.(h)||h,x);Object.keys(b).forEach(h=>{let S=b[h];if(typeof S=="object"&&S&&(h!=="animationName"||!S._keyframe)&&!SP(S)){let C=!1,R=h.trim(),v=!1;(o||r)&&i?R.startsWith("@")?C=!0:R==="&"?R=Zb("",i,c):R=Zb(h,i,c):o&&!i&&(R==="&"||R==="")&&(R="",v=!0);let[w,T]=Tm(S,t,{root:v,injectHash:C,parentSelectors:[...n,R]});d={...d,...T},f+=`${R}${w}`}else{let C=function(v,w){let T=v.replace(/[A-Z]/g,P=>`-${P.toLowerCase()}`),I=w;!vm[v]&&typeof I=="number"&&I!==0&&(I=`${I}px`),v==="animationName"&&w?._keyframe&&(m(w),I=w.getName(i)),f+=`${T}:${I};`},R=S?.value??S;typeof S=="object"&&S?.[ey]&&Array.isArray(R)?R.forEach(v=>{C(h,v)}):wb(R)&&C(h,R)}})}}),o?s&&(f&&(f=`@layer ${s.name} {${f}}`),s.dependencies&&(d[`@layer ${s.name}`]=s.dependencies.map(y=>`@layer ${y}, ${s.name};`).join(`
`))):f=`{${f}}`,[f,d]};function Mm(e,t){return ei(`${e.join("%")}${t}`)}var Om="style";function oi(e,t){let{path:o,hashId:r,layer:n,nonce:i,clientOnly:s,order:a=0}=e,{mock:c,hashPriority:l,container:u,transformers:f,linters:d,cache:m,layer:p,autoPrefix:g}=Jb.useContext(qr),y=[r||""];p&&y.push("layer"),y.push(...o);let x=Da;zi(Om,y,()=>{let b=y.join("|");if(Yb(b)){let[w,T]=Qb(b);if(w)return[w,T,{},s,a]}let h=t(),[S,C]=Tm(h,{hashId:r,hashPriority:l,layer:p?n:void 0,path:o.join("-"),transformers:f,linters:d}),R=$c(S,g||!1),v=Mm(y,R);return[R,v,C,s,a]},(b,h)=>{let[,S]=b;h&&Da&&jr(S,{mark:jo,attachTo:u})},b=>{let[h,S,C,,R]=b;if(x&&h!==Im){let v={mark:jo,prepend:p?!1:"queue",attachTo:u,priority:R};v=$s(v,i);let w=[],T=[];Object.keys(C).forEach(P=>{P.startsWith("@layer")?w.push(P):T.push(P)}),w.forEach(P=>{Go($c(C[P],g||!1),`_layer-${P}`,{...v,prepend:!0})});let I=Go(h,S,v);I[cn]=m.instanceId,T.forEach(P=>{Go($c(C[P],g||!1),`_effect-${P}`,v)})}})}var ty=(e,t,o)=>{let[r,n,i,s,a]=e,{plain:c,autoPrefix:l}=o||{};if(s)return null;let u=r,f={"data-rc-order":"prependQueue","data-rc-priority":`${a}`};return u=ti(r,void 0,n,f,c),i&&Object.keys(i).forEach(d=>{if(!t[d]){t[d]=!0;let m=$c(i[d],l||!1),p=ti(m,void 0,`_effect-${d}`,f,c);d.startsWith("@layer")?u=p+u:u+=p}}),[a,n,u]};var Am="cssVar",vP=(e,t)=>{let{key:o,prefix:r,unitless:n,ignore:i,token:s,hashId:a,scope:c,nonce:l}=e,{cache:{instanceId:u},container:f,hashPriority:d}=(0,oy.useContext)(qr),{_tokenKey:m}=s,p=Array.isArray(c)?c.join("@@"):c,g=[...e.path,o,p,m];return zi(Am,g,()=>{let x=t(),[b,h]=dc(x,o,{prefix:r,unitless:n,ignore:i,scope:c,hashPriority:d,hashCls:a}),S=Mm(g,h);return[b,h,S,o]},([,,x])=>{Da&&jr(x,{mark:jo,attachTo:f})},([,x,b])=>{if(!x)return;let h={mark:jo,prepend:"queue",attachTo:f,priority:-999};h=$s(h,l);let S=Go(x,b,h);S[cn]=u,S.setAttribute(Fi,o)})},ry=(e,t,o)=>{let[,r,n,i]=e,{plain:s}=o||{};if(!r)return null;let a=-999,c={"data-rc-order":"prependQueue","data-rc-priority":`${a}`},l=ti(r,i,n,c,s);return[a,n,l]},_m=vP;var lz={[Om]:ty,[Sm]:Ib,[Am]:ry};var Lm=class{name;style;constructor(t,o){this.name=t,this.style=o}getName(t=""){return t?`${t}-${this.name}`:this.name}_keyframe=!0},Ue=Lm;function As(e){return e.notSplit=!0,e}var fz={inset:["top","right","bottom","left"],insetBlock:["top","bottom"],insetBlockStart:["top"],insetBlockEnd:["bottom"],insetInline:["left","right"],insetInlineStart:["left"],insetInlineEnd:["right"],marginBlock:["marginTop","marginBottom"],marginBlockStart:["marginTop"],marginBlockEnd:["marginBottom"],marginInline:["marginLeft","marginRight"],marginInlineStart:["marginLeft"],marginInlineEnd:["marginRight"],paddingBlock:["paddingTop","paddingBottom"],paddingBlockStart:["paddingTop"],paddingBlockEnd:["paddingBottom"],paddingInline:["paddingLeft","paddingRight"],paddingInlineStart:["paddingLeft"],paddingInlineEnd:["paddingRight"],borderBlock:As(["borderTop","borderBottom"]),borderBlockStart:As(["borderTop"]),borderBlockEnd:As(["borderBottom"]),borderInline:As(["borderLeft","borderRight"]),borderInlineStart:As(["borderLeft"]),borderInlineEnd:As(["borderRight"]),borderBlockWidth:["borderTopWidth","borderBottomWidth"],borderBlockStartWidth:["borderTopWidth"],borderBlockEndWidth:["borderBottomWidth"],borderInlineWidth:["borderLeftWidth","borderRightWidth"],borderInlineStartWidth:["borderLeftWidth"],borderInlineEndWidth:["borderRightWidth"],borderBlockStyle:["borderTopStyle","borderBottomStyle"],borderBlockStartStyle:["borderTopStyle"],borderBlockEndStyle:["borderBottomStyle"],borderInlineStyle:["borderLeftStyle","borderRightStyle"],borderInlineStartStyle:["borderLeftStyle"],borderInlineEndStyle:["borderRightStyle"],borderBlockColor:["borderTopColor","borderBottomColor"],borderBlockStartColor:["borderTopColor"],borderBlockEndColor:["borderBottomColor"],borderInlineColor:["borderLeftColor","borderRightColor"],borderInlineStartColor:["borderLeftColor"],borderInlineEndColor:["borderRightColor"],borderStartStartRadius:["borderTopLeftRadius"],borderStartEndRadius:["borderTopRightRadius"],borderEndStartRadius:["borderBottomLeftRadius"],borderEndEndRadius:["borderBottomRightRadius"]};var ny=require("react"),RP=(0,ny.createContext)({}),_s=RP;var Pc=$(require("react")),EP=e=>{let t=Pc.useRef(e);return t.current=e,Pc.useCallback((...r)=>t.current?.(...r),[])},ye=EP;var Ls=$(require("react"));var iy=It()?Ls.useLayoutEffect:Ls.useEffect,wP=(e,t)=>{let o=Ls.useRef(!0);iy(()=>e(o.current),t),iy(()=>(o.current=!1,()=>{o.current=!0}),[])};var qe=wP;var Ds=$(require("react")),$P=e=>{let t=Ds.useRef(!1),[o,r]=Ds.useState(e);Ds.useEffect(()=>(t.current=!1,()=>{t.current=!0}),[]);function n(i,s){s&&t.current||r(i)}return[o,n]},Fs=$P;var sy=require("react");function it(e,t){let[o,r]=(0,sy.useState)(e),n=t!==void 0?t:o;return qe(i=>{i||r(t)},[t]),[n,r]}var Nc=$(require("react"));var ly=e=>+setTimeout(e,16),cy=e=>clearTimeout(e);typeof window<"u"&&"requestAnimationFrame"in window&&(ly=e=>window.requestAnimationFrame(e),cy=e=>window.cancelAnimationFrame(e));var ay=0,Dm=new Map;function uy(e){Dm.delete(e)}var fy=(e,t=1)=>{ay+=1;let o=ay;function r(n){if(n===0)uy(o),e();else{let i=ly(()=>{r(n-1)});Dm.set(o,i)}}return r(t),o};fy.cancel=e=>{let t=Dm.get(e);return uy(e),cy(t)};var Ge=fy;function Ic(e){let[t,o]=Nc.useState(e),r=Nc.useRef(null),n=ye(()=>{if(r.current){let[s,a]=r.current;s?Ge.cancel(a):clearTimeout(a),r.current=null}}),i=ye((s,a)=>{let c=a||{frame:1};n(),c===!0?o(s):"ms"in c?r.current=[!1,setTimeout(()=>o(s),c.ms)]:r.current=[!0,Ge(()=>o(s),c.frame)]});return[t,i]}var Ha=$(require("react"));function NP(){return{...Ha}.useId}var dy=0;var my=NP(),xo=my?function(t){let o=my();return t||o}:function(t){let[o,r]=Ha.useState("ssr-id");return Ha.useEffect(()=>{let n=dy;dy+=1,r(`rc_unique_${n}`)},[]),t||o};var Tc=$(require("react"));function IP(e){let[,t]=Tc.useReducer(i=>i+1,0),o=Tc.useRef(e),r=ye(()=>o.current),n=ye(i=>{o.current=typeof i=="function"?i(o.current):i,t()});return[r,n]}var Fm=IP;var Hc=require("react"),Wa=$(xy());var MP=Symbol.for("react.element"),OP=Symbol.for("react.transitional.element"),AP=Symbol.for("react.fragment");function ka(e){return e&&typeof e=="object"&&(e.$$typeof===MP||e.$$typeof===OP)&&e.type===AP}var _P=Number(Hc.version.split(".")[0]),by=(e,t)=>{typeof e=="function"?e(t):typeof e=="object"&&e&&"current"in e&&(e.current=t)},gt=(...e)=>{let t=e.filter(Boolean);return t.length<=1?t[0]:o=>{e.forEach(r=>{by(r,o)})}},ir=(...e)=>Ur(()=>gt(...e),e,(t,o)=>t.length!==o.length||t.every((r,n)=>r!==o[n])),ri=e=>{if(!e)return!1;if(Vm(e)&&_P>=19)return!0;let t=(0,Wa.isMemo)(e)?e.type.type:e.type;return!(typeof t=="function"&&!t.prototype?.render&&t.$$typeof!==Wa.ForwardRef||typeof e=="function"&&!e.prototype?.render&&e.$$typeof!==Wa.ForwardRef)};function Vm(e){return(0,Hc.isValidElement)(e)&&!ka(e)}var Hm=e=>Vm(e)&&ri(e),Kr=e=>{if(e&&Vm(e)){let t=e;return t.props.propertyIsEnumerable("ref")?t.props.ref:t.ref}return null};function fn(e){return e instanceof HTMLElement||e instanceof SVGElement}function sr(e){return e&&typeof e=="object"&&fn(e.nativeElement)?e.nativeElement:fn(e)?e:null}var ii=require("react");var qi=(e=>{if(!e)return!1;if(e instanceof Element){if(e.offsetParent)return!0;if(e.getBBox){let{width:t,height:o}=e.getBBox();if(t||o)return!0}if(e.getBoundingClientRect){let{width:t,height:o}=e.getBoundingClientRect();if(t||o)return!0}}return!1});function yy(e,t=!1){if(qi(e)){let o=e.nodeName.toLowerCase(),r=["input","select","textarea","button"].includes(o)||e.isContentEditable||o==="a"&&!!e.getAttribute("href"),n=e.getAttribute("tabindex"),i=Number(n),s=null;return n&&!Number.isNaN(i)?s=i:r&&s===null&&(s=0),r&&e.disabled&&(s=null),s!==null&&(s>=0||t&&s<0)}return!1}function jm(e,t=!1){let o=[...e.querySelectorAll("*")].filter(r=>yy(r,t));return yy(e,t)&&o.unshift(e),o}function Bs(e,t){if(!e)return;e.focus(t);let{cursor:o}=t||{};if(o&&(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement)){let r=e.value.length;switch(o){case"start":e.setSelectionRange(0,0);break;case"end":e.setSelectionRange(r,r);break;default:e.setSelectionRange(0,r)}}}var zs=null,ni=[],Wm=new Map,Um=new Map;function qm(){return ni[ni.length-1]}function LP(e){let t=qm();if(e&&t){let o;for(let[n,i]of Wm.entries())if(i===t){o=n;break}let r=Um.get(o);return!!r&&(r===e||r.contains(e))}return!1}function DP(e){let{activeElement:t}=document;return e===t||e.contains(t)}function km(){let e=qm(),{activeElement:t}=document;if(!LP(t))if(e&&!DP(e)){let o=jm(e);(o.includes(zs)?zs:o[0])?.focus({preventScroll:!0})}else zs=t}function Cy(e){if(e.key==="Tab"){let{activeElement:t}=document,o=qm(),r=jm(o),n=r[r.length-1];e.shiftKey&&t===r[0]?zs=n:!e.shiftKey&&t===n&&(zs=r[0])}}function Sy(e,t){return e&&(Wm.set(t,e),ni=ni.filter(o=>o!==e),ni.push(e),window.addEventListener("focusin",km),window.addEventListener("keydown",Cy,!0),km()),()=>{zs=null,ni=ni.filter(o=>o!==e),Wm.delete(t),Um.delete(t),ni.length===0&&(window.removeEventListener("focusin",km),window.removeEventListener("keydown",Cy,!0))}}function FP(e,t){let o=(0,ii.useRef)(0),[r,n]=(0,ii.useState)(0);(0,ii.useEffect)(()=>{o.current=0},t),(0,ii.useEffect)(()=>{let[i,s]=e(o.current);return s||(o.current+=1,n(a=>a+1)),i},[...t,r])}function Gm(e,t){let o=xo(),r=(0,ii.useRef)(t);return r.current=t,FP(s=>{if(!e)return[void 0,!0];let a=r.current();return a?[Sy(a,o),!0]:[void 0,s>=1]},[o,e]),[s=>{s&&Um.set(o,s)}]}function vy(e){return e?.getRootNode?.()}function zP(e){return vy(e)instanceof ShadowRoot}function Vs(e){return zP(e)?vy(e):null}var Ae={MAC_ENTER:3,BACKSPACE:8,TAB:9,NUM_CENTER:12,ENTER:13,SHIFT:16,CTRL:17,ALT:18,PAUSE:19,CAPS_LOCK:20,ESC:27,SPACE:32,PAGE_UP:33,PAGE_DOWN:34,END:35,HOME:36,LEFT:37,UP:38,RIGHT:39,DOWN:40,PRINT_SCREEN:44,INSERT:45,DELETE:46,ZERO:48,ONE:49,TWO:50,THREE:51,FOUR:52,FIVE:53,SIX:54,SEVEN:55,EIGHT:56,NINE:57,QUESTION_MARK:63,A:65,B:66,C:67,D:68,E:69,F:70,G:71,H:72,I:73,J:74,K:75,L:76,M:77,N:78,O:79,P:80,Q:81,R:82,S:83,T:84,U:85,V:86,W:87,X:88,Y:89,Z:90,META:91,WIN_KEY_RIGHT:92,CONTEXT_MENU:93,NUM_ZERO:96,NUM_ONE:97,NUM_TWO:98,NUM_THREE:99,NUM_FOUR:100,NUM_FIVE:101,NUM_SIX:102,NUM_SEVEN:103,NUM_EIGHT:104,NUM_NINE:105,NUM_MULTIPLY:106,NUM_PLUS:107,NUM_MINUS:109,NUM_PERIOD:110,NUM_DIVISION:111,F1:112,F2:113,F3:114,F4:115,F5:116,F6:117,F7:118,F8:119,F9:120,F10:121,F11:122,F12:123,NUMLOCK:144,SEMICOLON:186,DASH:189,EQUALS:187,COMMA:188,PERIOD:190,SLASH:191,APOSTROPHE:192,SINGLE_QUOTE:222,OPEN_SQUARE_BRACKET:219,BACKSLASH:220,CLOSE_SQUARE_BRACKET:221,WIN_KEY:224,MAC_FF_META:224,WIN_IME:229,isTextModifyingKeyEvent:function(t){let{keyCode:o}=t;if(t.altKey&&!t.ctrlKey||t.metaKey||o>=Ae.F1&&o<=Ae.F12)return!1;switch(o){case Ae.ALT:case Ae.CAPS_LOCK:case Ae.CONTEXT_MENU:case Ae.CTRL:case Ae.DOWN:case Ae.END:case Ae.ESC:case Ae.HOME:case Ae.INSERT:case Ae.LEFT:case Ae.MAC_FF_META:case Ae.META:case Ae.NUMLOCK:case Ae.NUM_CENTER:case Ae.PAGE_DOWN:case Ae.PAGE_UP:case Ae.PAUSE:case Ae.PRINT_SCREEN:case Ae.RIGHT:case Ae.SHIFT:case Ae.UP:case Ae.WIN_KEY:case Ae.WIN_KEY_RIGHT:return!1;default:return!0}},isCharacterKey:function(t){if(t>=Ae.ZERO&&t<=Ae.NINE||t>=Ae.NUM_ZERO&&t<=Ae.NUM_MULTIPLY||t>=Ae.A&&t<=Ae.Z||window.navigator.userAgent.indexOf("WebKit")!==-1&&t===0)return!0;switch(t){case Ae.SPACE:case Ae.QUESTION_MARK:case Ae.NUM_PLUS:case Ae.NUM_MINUS:case Ae.NUM_PERIOD:case Ae.NUM_DIVISION:case Ae.SEMICOLON:case Ae.DASH:case Ae.EQUALS:case Ae.COMMA:case Ae.PERIOD:case Ae.SLASH:case Ae.APOSTROPHE:case Ae.SINGLE_QUOTE:case Ae.OPEN_SQUARE_BRACKET:case Ae.BACKSLASH:case Ae.CLOSE_SQUARE_BRACKET:return!0;default:return!1}},isEditableTarget:function(t){let o=t.target;if(!(o instanceof HTMLElement))return!1;let r=o.tagName;return!!(r==="INPUT"||r==="TEXTAREA"||r==="SELECT"||o.isContentEditable)}},Ie=Ae;function BP(e){let t=`rc-scrollbar-measure-${Math.random().toString(36).substring(7)}`,o=document.createElement("div");o.id=t;let r=o.style;r.position="absolute",r.left="0",r.top="0",r.width="100px",r.height="100px",r.overflow="scroll";let n,i;if(e){let c=getComputedStyle(e);r.scrollbarColor=c.scrollbarColor,r.scrollbarWidth=c.scrollbarWidth;let l=getComputedStyle(e,"::-webkit-scrollbar"),u=parseInt(l.width,10),f=parseInt(l.height,10);try{let d=u?`width: ${l.width};`:"",m=f?`height: ${l.height};`:"";Go(`
#${t}::-webkit-scrollbar {
${d}
${m}
}`,t)}catch(d){console.error(d),n=u,i=f}}document.body.appendChild(o);let s=e&&n&&!Number.isNaN(n)?n:o.offsetWidth-o.clientWidth,a=e&&i&&!Number.isNaN(i)?i:o.offsetHeight-o.clientHeight;return document.body.removeChild(o),jr(t),{width:s,height:a}}function Xm(e){return typeof document>"u"||!e||!(e instanceof Element)?{width:0,height:0}:BP(e)}function lo(e){return e!=null}function ut(e){return lo(e)&&e!==!1&&e!==""}var WP=$(Ry());function tt(e,t){let o=Object.assign({},e);return Array.isArray(t)&&t.forEach(r=>{delete o[r]}),o}var jP=`accept acceptCharset accessKey action allowFullScreen allowTransparency
    alt async autoComplete autoFocus autoPlay capture cellPadding cellSpacing challenge
    charSet checked classID className colSpan cols content contentEditable contextMenu
    controls coords crossOrigin data dateTime default defer dir disabled download draggable
    encType form formAction formEncType formMethod formNoValidate formTarget frameBorder
    headers height hidden high href hrefLang htmlFor httpEquiv icon id inputMode integrity
    is keyParams keyType kind label lang list loop low manifest marginHeight marginWidth max maxLength media
    mediaGroup method min minLength multiple muted name noValidate nonce open
    optimum pattern placeholder poster preload radioGroup readOnly rel required
    reversed role rowSpan rows sandbox scope scoped scrolling seamless selected
    shape size sizes span spellCheck src srcDoc srcLang srcSet start step style
    summary tabIndex target title type useMap value width wmode wrap`,UP=`onCopy onCut onPaste onCompositionEnd onCompositionStart onCompositionUpdate onKeyDown
    onKeyPress onKeyUp onFocus onBlur onChange onInput onSubmit onClick onContextMenu onDoubleClick
    onDrag onDragEnd onDragEnter onDragExit onDragLeave onDragOver onDragStart onDrop onMouseDown
    onMouseEnter onMouseLeave onMouseMove onMouseOut onMouseOver onMouseUp onSelect onTouchCancel
    onTouchEnd onTouchMove onTouchStart onScroll onWheel onAbort onCanPlay onCanPlayThrough
    onDurationChange onEmptied onEncrypted onEnded onError onLoadedData onLoadedMetadata
    onLoadStart onPause onPlay onPlaying onProgress onRateChange onSeeked onSeeking onStalled onSuspend onTimeUpdate onVolumeChange onWaiting onLoad
    onPointerDown onPointerMove onPointerUp onPointerCancel onPointerEnter onPointerLeave onPointerOver onPointerOut onGotPointerCapture onLostPointerCapture
    onAnimationStart onAnimationEnd onAnimationIteration
    onTransitionEnd onTransitionRun onTransitionStart onTransitionCancel
    onBeforeInput onReset onInvalid
    onAuxClick onToggle onBeforeToggle onCancel onClose onResize onScrollEnd`,qP=`${jP} ${UP}`.split(/[\s\n]+/),GP="aria-",XP="data-";function Ey(e,t){return e.indexOf(t)===0}function Ht(e,t=!1){let o;t===!1?o={aria:!0,data:!0,attr:!0}:t===!0?o={aria:!0}:o={...t};let r={};return Object.keys(e).forEach(n=>{(o.aria&&(n==="role"||Ey(n,GP))||o.data&&Ey(n,XP)||o.attr&&qP.includes(n))&&(r[n]=e[n])}),r}var wy=$(require("react"));function Ro(e,t={}){let o=[];return wy.default.Children.forEach(e,r=>{r==null&&!t.keepEmpty||(Array.isArray(r)?o=o.concat(Ro(r)):ka(r)&&r.props?o=o.concat(Ro(r.props.children,t)):o.push(r))}),o}function KP(...e){let t={};for(let o of e)if(o)for(let r of Object.keys(o))o[r]!==void 0&&(t[r]=o[r]);return t}var Wc=KP;function co(e,t){let o=e;for(let r=0;r<t.length;r+=1){if(o==null)return;o=o[t[r]]}return o}function Py(e,t,o,r){if(!t.length)return o;let[n,...i]=t,s;return!e&&typeof n=="number"?s=[]:Array.isArray(e)?s=[...e]:s={...e},r&&o===void 0&&i.length===1?delete s[n][i[0]]:s[n]=Py(s[n],i,o,r),s}function Eo(e,t,o,r=!1){return t.length&&r&&o===void 0&&!co(e,t.slice(0,-1))?e:Py(e,t,o,r)}function YP(e){return typeof e=="object"&&e!==null&&Object.getPrototypeOf(e)===Object.prototype}function $y(e){return Array.isArray(e)?[]:{}}var QP=typeof Reflect>"u"?Object.keys:Reflect.ownKeys;function Ny(e,t={}){let{prepareArray:o}=t,r=o||(()=>[]),n=$y(e[0]);return e.forEach(i=>{function s(a,c){let l=new Set(c),u=co(i,a),f=Array.isArray(u);if(f||YP(u)){if(!l.has(u)){l.add(u);let d=co(n,a);f?n=Eo(n,a,r(d,u)):(!d||typeof d!="object")&&(n=Eo(n,a,$y(u))),QP(u).forEach(m=>{Object.getOwnPropertyDescriptor(u,m).enumerable&&s([...a,m],l)})}}else n=Eo(n,a,u)}s([])}),n}function dn(...e){return Ny(e)}var Iy=require("react-dom/client"),jc="__rc_react_root__";function ja(e,t){let o=t[jc]||(0,Iy.createRoot)(t);o.render(e),t[jc]=o}async function Ua(e){return Promise.resolve().then(()=>{e[jc]?.unmount(),delete e[jc]})}var Uc=require("react"),ZP=$(require("react-dom"));var wo=e=>typeof e=="number"&&!Number.isNaN(e),$r=e=>typeof e=="string",ze=e=>e!==null&&typeof e=="object",ot=e=>typeof e=="function",qc=e=>lo(e)&&ot(e.then);var Ty=e=>ze(e)&&"propertyName"in e&&$r(e.propertyName);var Ym=$(require("react"));function eN(){}var{resetWarned:$V}=Gt;var My=Ym.createContext({}),tN=()=>{let e=()=>{};return e.deprecated=eN,e},Gc=tN;var Oy=require("react"),Ay=(0,Oy.createContext)(void 0);var ks=$(require("react"));var oN={items_per_page:"/ page",jump_to:"Go to",jump_to_confirm:"confirm",page:"Page",prev_page:"Previous Page",next_page:"Next Page",prev_5:"Previous 5 Pages",next_5:"Next 5 Pages",prev_3:"Previous 3 Pages",next_3:"Next 3 Pages",page_size:"Page Size"},_y=oN;var Ly={yearFormat:"YYYY",dayFormat:"D",cellMeridiemFormat:"A",monthBeforeYear:!0};var rN={...Ly,locale:"en_US",today:"Today",now:"Now",backToToday:"Back to today",ok:"OK",clear:"Clear",week:"Week",month:"Month",year:"Year",timeSelect:"select time",dateSelect:"select date",weekSelect:"Choose a week",monthSelect:"Choose a month",yearSelect:"Choose a year",decadeSelect:"Choose a decade",previousMonth:"Previous month",nextMonth:"Next month",previousYear:"Last year",nextYear:"Next year",previousDecade:"Last decade",nextDecade:"Next decade",previousCentury:"Last century",nextCentury:"Next century"},Dy=rN;var nN={placeholder:"Select time",rangePlaceholder:["Start time","End time"]},Xc=nN;var iN={lang:{placeholder:"Select date",yearPlaceholder:"Select year",quarterPlaceholder:"Select quarter",monthPlaceholder:"Select month",weekPlaceholder:"Select week",rangePlaceholder:["Start date","End date"],rangeYearPlaceholder:["Start year","End year"],rangeQuarterPlaceholder:["Start quarter","End quarter"],rangeMonthPlaceholder:["Start month","End month"],rangeWeekPlaceholder:["Start week","End week"],...Dy},timePickerLocale:{...Xc}},Kc=iN;var Fy=Kc;var ar="${label} is not a valid ${type}",sN={locale:"en",Pagination:_y,DatePicker:Kc,TimePicker:Xc,Calendar:Fy,global:{placeholder:"Please select",close:"Close",sortable:"sortable",show:"Show",hide:"Hide"},Table:{filterTitle:"Filter menu",filterConfirm:"OK",filterReset:"Reset",filterEmptyText:"No filters",filterCheckAll:"Select all items",filterSearchPlaceholder:"Search in filters",emptyText:"No data",selectAll:"Select current page",selectInvert:"Invert current page",selectNone:"Clear all data",selectionAll:"Select all data",sortTitle:"Sort",expand:"Expand row",collapse:"Collapse row",triggerDesc:"Click to sort descending",triggerAsc:"Click to sort ascending",cancelSort:"Click to cancel sorting"},Tour:{Next:"Next",Previous:"Previous",Finish:"Finish"},Modal:{okText:"OK",cancelText:"Cancel",justOkText:"OK"},Popconfirm:{okText:"OK",cancelText:"Cancel"},Transfer:{titles:["",""],searchPlaceholder:"Search here",itemUnit:"item",itemsUnit:"items",remove:"Remove",selectCurrent:"Select current page",removeCurrent:"Remove current page",selectAll:"Select all data",deselectAll:"Deselect all data",removeAll:"Remove all data",selectInvert:"Invert current page"},Upload:{uploading:"Uploading...",removeFile:"Remove file",uploadError:"Upload error",previewFile:"Preview file",downloadFile:"Download file"},Empty:{description:"No data"},Icon:{icon:"icon"},Text:{edit:"Edit",copy:"Copy",copied:"Copied",expand:"Expand",collapse:"Collapse"},Carousel:{prevSlide:"Previous slide",nextSlide:"Next slide"},Form:{optional:"(optional)",defaultValidateMessages:{default:"Field validation error for ${label}",required:"Please enter ${label}",enum:"${label} must be one of [${enum}]",whitespace:"${label} cannot be a blank character",date:{format:"${label} date format is invalid",parse:"${label} cannot be converted to a date",invalid:"${label} is an invalid date"},types:{string:ar,method:ar,array:ar,object:ar,number:ar,date:ar,boolean:ar,integer:ar,float:ar,regexp:ar,email:ar,url:ar,hex:ar},string:{len:"${label} must be ${len} characters",min:"${label} must be at least ${min} characters",max:"${label} must be up to ${max} characters",range:"${label} must be between ${min}-${max} characters"},number:{len:"${label} must be equal to ${len}",min:"${label} must be minimum ${min}",max:"${label} must be maximum ${max}",range:"${label} must be between ${min}-${max}"},array:{len:"Must be ${len} ${label}",min:"At least ${min} ${label}",max:"At most ${max} ${label}",range:"The amount of ${label} must be between ${min}-${max}"},pattern:{mismatch:"${label} does not match the pattern ${pattern}"}}},QRCode:{expired:"QR code expired",refresh:"Refresh",scanned:"Scanned"},ColorPicker:{presetEmpty:"Empty",transparent:"Transparent",singleColor:"Single",gradientColor:"Gradient"}},lr=sN;var Yc={...lr.Modal},Qc=[],zy=()=>Qc.reduce((e,t)=>({...e,...t}),lr.Modal);function By(e){if(e){let t={...e};return Qc.push(t),Yc=zy(),()=>{Qc=Qc.filter(o=>o!==t),Yc=zy()}}Yc={...lr.Modal}}function Zc(){return Yc}var Vy=require("react"),aN=(0,Vy.createContext)(void 0),Hs=aN;var qa=$(require("react"));var lN=(e,t)=>{let o=qa.useContext(Hs),r=qa.useMemo(()=>{let i=t||lr[e],s=o?.[e]??{};return{...ot(i)?i():i,...s||{}}},[e,t,o]),n=qa.useMemo(()=>{let i=o?.locale;return o?.exist&&!i?lr.locale:i},[o]);return[r,n]},$o=lN;var Hy="internalMark",cN=e=>{let{locale:t={},children:o,_ANT_MARK__:r}=e;ks.useEffect(()=>By(t?.Modal),[t]);let n=ks.useMemo(()=>({...t,exist:!0}),[t]);return ks.createElement(Hs.Provider,{value:n},o)},ky=cN;var mC=$(require("react"));var Ga={blue:"#1677FF",purple:"#722ED1",cyan:"#13C2C2",green:"#52C41A",magenta:"#EB2F96",pink:"#EB2F96",red:"#F5222D",orange:"#FA8C16",yellow:"#FADB14",volcano:"#FA541C",geekblue:"#2F54EB",gold:"#FAAD14",lime:"#A0D911"},uN={...Ga,colorPrimary:"#1677ff",colorSuccess:"#52c41a",colorWarning:"#faad14",colorError:"#ff4d4f",colorInfo:"#1677ff",colorLink:"",colorTextBase:"",colorBgBase:"",fontFamily:`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',
'Noto Color Emoji'`,fontFamilyCode:"'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace",fontSize:14,lineWidth:1,lineType:"solid",motionUnit:.1,motionBase:0,motionEaseOutCirc:"cubic-bezier(0.08, 0.82, 0.17, 1)",motionEaseInOutCirc:"cubic-bezier(0.78, 0.14, 0.15, 0.86)",motionEaseOut:"cubic-bezier(0.215, 0.61, 0.355, 1)",motionEaseInOut:"cubic-bezier(0.645, 0.045, 0.355, 1)",motionEaseOutBack:"cubic-bezier(0.12, 0.4, 0.29, 1.46)",motionEaseInBack:"cubic-bezier(0.71, -0.46, 0.88, 0.6)",motionEaseInQuint:"cubic-bezier(0.755, 0.05, 0.855, 0.06)",motionEaseOutQuint:"cubic-bezier(0.23, 1, 0.32, 1)",borderRadius:6,sizeUnit:4,sizeStep:4,sizePopupArrow:16,controlHeight:32,zIndexBase:0,zIndexPopupBase:1e3,opacityImage:1,wireframe:!1,focusOutline:!0,motion:!0},Yr=uN;var Wy={aliceblue:"9ehhb",antiquewhite:"9sgk7",aqua:"1ekf",aquamarine:"4zsno",azure:"9eiv3",beige:"9lhp8",bisque:"9zg04",black:"0",blanchedalmond:"9zhe5",blue:"73",blueviolet:"5e31e",brown:"6g016",burlywood:"8ouiv",cadetblue:"3qba8",chartreuse:"4zshs",chocolate:"87k0u",coral:"9yvyo",cornflowerblue:"3xael",cornsilk:"9zjz0",crimson:"8l4xo",cyan:"1ekf",darkblue:"3v",darkcyan:"rkb",darkgoldenrod:"776yz",darkgray:"6mbhl",darkgreen:"jr4",darkgrey:"6mbhl",darkkhaki:"7ehkb",darkmagenta:"5f91n",darkolivegreen:"3bzfz",darkorange:"9yygw",darkorchid:"5z6x8",darkred:"5f8xs",darksalmon:"9441m",darkseagreen:"5lwgf",darkslateblue:"2th1n",darkslategray:"1ugcv",darkslategrey:"1ugcv",darkturquoise:"14up",darkviolet:"5rw7n",deeppink:"9yavn",deepskyblue:"11xb",dimgray:"442g9",dimgrey:"442g9",dodgerblue:"16xof",firebrick:"6y7tu",floralwhite:"9zkds",forestgreen:"1cisi",fuchsia:"9y70f",gainsboro:"8m8kc",ghostwhite:"9pq0v",goldenrod:"8j4f4",gold:"9zda8",gray:"50i2o",green:"pa8",greenyellow:"6senj",grey:"50i2o",honeydew:"9eiuo",hotpink:"9yrp0",indianred:"80gnw",indigo:"2xcoy",ivory:"9zldc",khaki:"9edu4",lavenderblush:"9ziet",lavender:"90c8q",lawngreen:"4vk74",lemonchiffon:"9zkct",lightblue:"6s73a",lightcoral:"9dtog",lightcyan:"8s1rz",lightgoldenrodyellow:"9sjiq",lightgray:"89jo3",lightgreen:"5nkwg",lightgrey:"89jo3",lightpink:"9z6wx",lightsalmon:"9z2ii",lightseagreen:"19xgq",lightskyblue:"5arju",lightslategray:"4nwk9",lightslategrey:"4nwk9",lightsteelblue:"6wau6",lightyellow:"9zlcw",lime:"1edc",limegreen:"1zcxe",linen:"9shk6",magenta:"9y70f",maroon:"4zsow",mediumaquamarine:"40eju",mediumblue:"5p",mediumorchid:"79qkz",mediumpurple:"5r3rv",mediumseagreen:"2d9ip",mediumslateblue:"4tcku",mediumspringgreen:"1di2",mediumturquoise:"2uabw",mediumvioletred:"7rn9h",midnightblue:"z980",mintcream:"9ljp6",mistyrose:"9zg0x",moccasin:"9zfzp",navajowhite:"9zest",navy:"3k",oldlace:"9wq92",olive:"50hz4",olivedrab:"472ub",orange:"9z3eo",orangered:"9ykg0",orchid:"8iu3a",palegoldenrod:"9bl4a",palegreen:"5yw0o",paleturquoise:"6v4ku",palevioletred:"8k8lv",papayawhip:"9zi6t",peachpuff:"9ze0p",peru:"80oqn",pink:"9z8wb",plum:"8nba5",powderblue:"6wgdi",purple:"4zssg",rebeccapurple:"3zk49",red:"9y6tc",rosybrown:"7cv4f",royalblue:"2jvtt",saddlebrown:"5fmkz",salmon:"9rvci",sandybrown:"9jn1c",seagreen:"1tdnb",seashell:"9zje6",sienna:"6973h",silver:"7ir40",skyblue:"5arjf",slateblue:"45e4t",slategray:"4e100",slategrey:"4e100",snow:"9zke2",springgreen:"1egv",steelblue:"2r1kk",tan:"87yx8",teal:"pds",thistle:"8ggk8",tomato:"9yqfb",turquoise:"2j4r4",violet:"9b10u",wheat:"9ld4j",white:"9zldr",whitesmoke:"9lhpx",yellow:"9zl6o",yellowgreen:"61fzm"};var bo=Math.round;function Qm(e,t){let o=e.replace(/^[^(]*\((.*)/,"$1").replace(/\).*/,"").match(/\d*\.?\d+%?/g)||[],r=o.map(n=>parseFloat(n));for(let n=0;n<3;n+=1)r[n]=t(r[n]||0,o[n]||"",n);return o[3]?r[3]=o[3].includes("%")?r[3]/100:r[3]:r[3]=1,r}var jy=(e,t,o)=>o===0?e:e/100;function Xa(e,t){let o=t||255;return e>o?o:e<0?0:e}var Ze=class e{isValid=!0;r=0;g=0;b=0;a=1;_h;_hsl_s;_hsv_s;_l;_v;_max;_min;_brightness;constructor(t){function o(r){return r[0]in t&&r[1]in t&&r[2]in t}if(t)if(typeof t=="string"){let n=function(i){return r.startsWith(i)},r=t.trim();if(/^#?[A-F\d]{3,8}$/i.test(r))this.fromHexString(r);else if(n("rgb"))this.fromRgbString(r);else if(n("hsl"))this.fromHslString(r);else if(n("hsv")||n("hsb"))this.fromHsvString(r);else{let i=Wy[r.toLowerCase()];i&&this.fromHexString(parseInt(i,36).toString(16).padStart(6,"0"))}}else if(t instanceof e)this.r=t.r,this.g=t.g,this.b=t.b,this.a=t.a,this._h=t._h,this._hsl_s=t._hsl_s,this._hsv_s=t._hsv_s,this._l=t._l,this._v=t._v;else if(o("rgb"))this.r=Xa(t.r),this.g=Xa(t.g),this.b=Xa(t.b),this.a=typeof t.a=="number"?Xa(t.a,1):1;else if(o("hsl"))this.fromHsl(t);else if(o("hsv"))this.fromHsv(t);else throw new Error("@ant-design/fast-color: unsupported input "+JSON.stringify(t))}setR(t){return this._sc("r",t)}setG(t){return this._sc("g",t)}setB(t){return this._sc("b",t)}setA(t){return this._sc("a",t,1)}setHue(t){let o=this.toHsv();return o.h=t,this._c(o)}getLuminance(){function t(i){let s=i/255;return s<=.03928?s/12.92:Math.pow((s+.055)/1.055,2.4)}let o=t(this.r),r=t(this.g),n=t(this.b);return .2126*o+.7152*r+.0722*n}getHue(){if(typeof this._h>"u"){let t=this.getMax()-this.getMin();t===0?this._h=0:this._h=bo(60*(this.r===this.getMax()?(this.g-this.b)/t+(this.g<this.b?6:0):this.g===this.getMax()?(this.b-this.r)/t+2:(this.r-this.g)/t+4))}return this._h}getSaturation(){return this.getHSVSaturation()}getHSVSaturation(){if(typeof this._hsv_s>"u"){let t=this.getMax()-this.getMin();t===0?this._hsv_s=0:this._hsv_s=t/this.getMax()}return this._hsv_s}getHSLSaturation(){if(typeof this._hsl_s>"u"){let t=this.getMax()-this.getMin();if(t===0)this._hsl_s=0;else{let o=this.getLightness();this._hsl_s=t/255/(1-Math.abs(2*o-1))}}return this._hsl_s}getLightness(){return typeof this._l>"u"&&(this._l=(this.getMax()+this.getMin())/510),this._l}getValue(){return typeof this._v>"u"&&(this._v=this.getMax()/255),this._v}getBrightness(){return typeof this._brightness>"u"&&(this._brightness=(this.r*299+this.g*587+this.b*114)/1e3),this._brightness}darken(t=10){let o=this.getHue(),r=this.getSaturation(),n=this.getLightness()-t/100;return n<0&&(n=0),this._c({h:o,s:r,l:n,a:this.a})}lighten(t=10){let o=this.getHue(),r=this.getSaturation(),n=this.getLightness()+t/100;return n>1&&(n=1),this._c({h:o,s:r,l:n,a:this.a})}mix(t,o=50){let r=this._c(t),n=o/100,i=a=>(r[a]-this[a])*n+this[a],s={r:bo(i("r")),g:bo(i("g")),b:bo(i("b")),a:bo(i("a")*100)/100};return this._c(s)}tint(t=10){return this.mix({r:255,g:255,b:255,a:1},t)}shade(t=10){return this.mix({r:0,g:0,b:0,a:1},t)}onBackground(t){let o=this._c(t),r=this.a+o.a*(1-this.a),n=i=>bo((this[i]*this.a+o[i]*o.a*(1-this.a))/r);return this._c({r:n("r"),g:n("g"),b:n("b"),a:r})}isDark(){return this.getBrightness()<128}isLight(){return this.getBrightness()>=128}equals(t){return this.r===t.r&&this.g===t.g&&this.b===t.b&&this.a===t.a}clone(){return this._c(this)}toHexString(){let t="#",o=(this.r||0).toString(16);t+=o.length===2?o:"0"+o;let r=(this.g||0).toString(16);t+=r.length===2?r:"0"+r;let n=(this.b||0).toString(16);if(t+=n.length===2?n:"0"+n,typeof this.a=="number"&&this.a>=0&&this.a<1){let i=bo(this.a*255).toString(16);t+=i.length===2?i:"0"+i}return t}toHsl(){return{h:this.getHue(),s:this.getHSLSaturation(),l:this.getLightness(),a:this.a}}toHslString(){let t=this.getHue(),o=bo(this.getHSLSaturation()*100),r=bo(this.getLightness()*100);return this.a!==1?`hsla(${t},${o}%,${r}%,${this.a})`:`hsl(${t},${o}%,${r}%)`}toHsv(){return{h:this.getHue(),s:this.getHSVSaturation(),v:this.getValue(),a:this.a}}toRgb(){return{r:this.r,g:this.g,b:this.b,a:this.a}}toRgbString(){return this.a!==1?`rgba(${this.r},${this.g},${this.b},${this.a})`:`rgb(${this.r},${this.g},${this.b})`}toString(){return this.toRgbString()}_sc(t,o,r){let n=this.clone();return n[t]=Xa(o,r),n}_c(t){return new this.constructor(t)}getMax(){return typeof this._max>"u"&&(this._max=Math.max(this.r,this.g,this.b)),this._max}getMin(){return typeof this._min>"u"&&(this._min=Math.min(this.r,this.g,this.b)),this._min}fromHexString(t){let o=t.replace("#","");function r(n,i){return parseInt(o[n]+o[i||n],16)}o.length<6?(this.r=r(0),this.g=r(1),this.b=r(2),this.a=o[3]?r(3)/255:1):(this.r=r(0,1),this.g=r(2,3),this.b=r(4,5),this.a=o[6]?r(6,7)/255:1)}fromHsl({h:t,s:o,l:r,a:n}){let i=(t%360+360)%360;if(this._h=i,this._hsl_s=o,this._l=r,this.a=typeof n=="number"?n:1,o<=0){let m=bo(r*255);this.r=m,this.g=m,this.b=m;return}let s=0,a=0,c=0,l=i/60,u=(1-Math.abs(2*r-1))*o,f=u*(1-Math.abs(l%2-1));l>=0&&l<1?(s=u,a=f):l>=1&&l<2?(s=f,a=u):l>=2&&l<3?(a=u,c=f):l>=3&&l<4?(a=f,c=u):l>=4&&l<5?(s=f,c=u):l>=5&&l<6&&(s=u,c=f);let d=r-u/2;this.r=bo((s+d)*255),this.g=bo((a+d)*255),this.b=bo((c+d)*255)}fromHsv({h:t,s:o,v:r,a:n}){let i=(t%360+360)%360;this._h=i,this._hsv_s=o,this._v=r,this.a=typeof n=="number"?n:1;let s=bo(r*255);if(this.r=s,this.g=s,this.b=s,o<=0)return;let a=i/60,c=Math.floor(a),l=a-c,u=bo(r*(1-o)*255),f=bo(r*(1-o*l)*255),d=bo(r*(1-o*(1-l))*255);switch(c){case 0:this.g=d,this.b=u;break;case 1:this.r=f,this.b=u;break;case 2:this.r=u,this.b=d;break;case 3:this.r=u,this.g=f;break;case 4:this.r=d,this.g=u;break;case 5:default:this.g=u,this.b=f;break}}fromHsvString(t){let o=Qm(t,jy);this.fromHsv({h:o[0],s:o[1],v:o[2],a:o[3]})}fromHslString(t){let o=Qm(t,jy);this.fromHsl({h:o[0],s:o[1],l:o[2],a:o[3]})}fromRgbString(t){let o=Qm(t,(r,n)=>n.includes("%")?bo(r/100*255):r);this.r=o[0],this.g=o[1],this.b=o[2],this.a=o[3]}};var Jc=2,Uy=.16,fN=.05,dN=.05,mN=.15,Ky=5,Yy=4,pN=[{index:7,amount:15},{index:6,amount:25},{index:5,amount:30},{index:5,amount:45},{index:5,amount:65},{index:5,amount:85},{index:4,amount:90},{index:3,amount:95},{index:2,amount:97},{index:1,amount:98}];function qy(e,t,o){let r;return Math.round(e.h)>=60&&Math.round(e.h)<=240?r=o?Math.round(e.h)-Jc*t:Math.round(e.h)+Jc*t:r=o?Math.round(e.h)+Jc*t:Math.round(e.h)-Jc*t,r<0?r+=360:r>=360&&(r-=360),r}function Gy(e,t,o){if(e.h===0&&e.s===0)return e.s;let r;return o?r=e.s-Uy*t:t===Yy?r=e.s+Uy:r=e.s+fN*t,r>1&&(r=1),o&&t===Ky&&r>.1&&(r=.1),r<.06&&(r=.06),Math.round(r*100)/100}function Xy(e,t,o){let r;return o?r=e.v+dN*t:r=e.v-mN*t,r=Math.max(0,Math.min(1,r)),Math.round(r*100)/100}function mn(e,t={}){let o=[],r=new Ze(e),n=r.toHsv();for(let i=Ky;i>0;i-=1){let s=new Ze({h:qy(n,i,!0),s:Gy(n,i,!0),v:Xy(n,i,!0)});o.push(s)}o.push(r);for(let i=1;i<=Yy;i+=1){let s=new Ze({h:qy(n,i),s:Gy(n,i),v:Xy(n,i)});o.push(s)}return t.theme==="dark"?pN.map(({index:i,amount:s})=>new Ze(t.backgroundColor||"#141414").mix(o[i],s).toHexString()):o.map(i=>i.toHexString())}var On={red:"#F5222D",volcano:"#FA541C",orange:"#FA8C16",gold:"#FAAD14",yellow:"#FADB14",lime:"#A0D911",green:"#52C41A",cyan:"#13C2C2",blue:"#1677FF",geekblue:"#2F54EB",purple:"#722ED1",magenta:"#EB2F96",grey:"#666666"},Zm=["#fff1f0","#ffccc7","#ffa39e","#ff7875","#ff4d4f","#f5222d","#cf1322","#a8071a","#820014","#5c0011"];Zm.primary=Zm[5];var Jm=["#fff2e8","#ffd8bf","#ffbb96","#ff9c6e","#ff7a45","#fa541c","#d4380d","#ad2102","#871400","#610b00"];Jm.primary=Jm[5];var ep=["#fff7e6","#ffe7ba","#ffd591","#ffc069","#ffa940","#fa8c16","#d46b08","#ad4e00","#873800","#612500"];ep.primary=ep[5];var tp=["#fffbe6","#fff1b8","#ffe58f","#ffd666","#ffc53d","#faad14","#d48806","#ad6800","#874d00","#613400"];tp.primary=tp[5];var op=["#feffe6","#ffffb8","#fffb8f","#fff566","#ffec3d","#fadb14","#d4b106","#ad8b00","#876800","#614700"];op.primary=op[5];var rp=["#fcffe6","#f4ffb8","#eaff8f","#d3f261","#bae637","#a0d911","#7cb305","#5b8c00","#3f6600","#254000"];rp.primary=rp[5];var np=["#f6ffed","#d9f7be","#b7eb8f","#95de64","#73d13d","#52c41a","#389e0d","#237804","#135200","#092b00"];np.primary=np[5];var ip=["#e6fffb","#b5f5ec","#87e8de","#5cdbd3","#36cfc9","#13c2c2","#08979c","#006d75","#00474f","#002329"];ip.primary=ip[5];var sp=["#e6f4ff","#bae0ff","#91caff","#69b1ff","#4096ff","#1677ff","#0958d9","#003eb3","#002c8c","#001d66"];sp.primary=sp[5];var ap=["#f0f5ff","#d6e4ff","#adc6ff","#85a5ff","#597ef7","#2f54eb","#1d39c4","#10239e","#061178","#030852"];ap.primary=ap[5];var lp=["#f9f0ff","#efdbff","#d3adf7","#b37feb","#9254de","#722ed1","#531dab","#391085","#22075e","#120338"];lp.primary=lp[5];var cp=["#fff0f6","#ffd6e7","#ffadd2","#ff85c0","#f759ab","#eb2f96","#c41d7f","#9e1068","#780650","#520339"];cp.primary=cp[5];var up=["#a6a6a6","#999999","#8c8c8c","#808080","#737373","#666666","#404040","#1a1a1a","#000000","#000000"];up.primary=up[5];var eu={red:Zm,volcano:Jm,orange:ep,gold:tp,yellow:op,lime:rp,green:np,cyan:ip,blue:sp,geekblue:ap,purple:lp,magenta:cp,grey:up},Qy=["#2a1215","#431418","#58181c","#791a1f","#a61d24","#d32029","#e84749","#f37370","#f89f9a","#fac8c3"];Qy.primary=Qy[5];var Zy=["#2b1611","#441d12","#592716","#7c3118","#aa3e19","#d84a1b","#e87040","#f3956a","#f8b692","#fad4bc"];Zy.primary=Zy[5];var Jy=["#2b1d11","#442a11","#593815","#7c4a15","#aa6215","#d87a16","#e89a3c","#f3b765","#f8cf8d","#fae3b7"];Jy.primary=Jy[5];var eC=["#2b2111","#443111","#594214","#7c5914","#aa7714","#d89614","#e8b339","#f3cc62","#f8df8b","#faedb5"];eC.primary=eC[5];var tC=["#2b2611","#443b11","#595014","#7c6e14","#aa9514","#d8bd14","#e8d639","#f3ea62","#f8f48b","#fafab5"];tC.primary=tC[5];var oC=["#1f2611","#2e3c10","#3e4f13","#536d13","#6f9412","#8bbb11","#a9d134","#c9e75d","#e4f88b","#f0fab5"];oC.primary=oC[5];var rC=["#162312","#1d3712","#274916","#306317","#3c8618","#49aa19","#6abe39","#8fd460","#b2e58b","#d5f2bb"];rC.primary=rC[5];var nC=["#112123","#113536","#144848","#146262","#138585","#13a8a8","#33bcb7","#58d1c9","#84e2d8","#b2f1e8"];nC.primary=nC[5];var iC=["#111a2c","#112545","#15325b","#15417e","#1554ad","#1668dc","#3c89e8","#65a9f3","#8dc5f8","#b7dcfa"];iC.primary=iC[5];var sC=["#131629","#161d40","#1c2755","#203175","#263ea0","#2b4acb","#5273e0","#7f9ef3","#a8c1f8","#d2e0fa"];sC.primary=sC[5];var aC=["#1a1325","#24163a","#301c4d","#3e2069","#51258f","#642ab5","#854eca","#ab7ae0","#cda8f0","#ebd7fa"];aC.primary=aC[5];var lC=["#291321","#40162f","#551c3b","#75204f","#a02669","#cb2b83","#e0529c","#f37fb7","#f8a8cc","#fad2e3"];lC.primary=lC[5];var cC=["#151515","#1f1f1f","#2d2d2d","#393939","#494949","#5a5a5a","#6a6a6a","#7b7b7b","#888888","#969696"];cC.primary=cC[5];var Po=["blue","purple","cyan","green","magenta","pink","red","orange","yellow","volcano","geekblue","lime","gold"];function Ka(e,{generateColorPalettes:t,generateNeutralColorPalettes:o}){let{colorSuccess:r,colorWarning:n,colorError:i,colorInfo:s,colorPrimary:a,colorBgBase:c,colorTextBase:l}=e,u=t(a),f=t(r),d=t(n),m=t(i),p=t(s),g=o(c,l),y=e.colorLink||e.colorInfo,x=t(y),b=new Ze(m[1]).mix(new Ze(m[3]),50).toHexString(),h={};return Po.forEach(S=>{let C=e[S];if(C){let R=t(C);h[`${S}Hover`]=R[5],h[`${S}Active`]=R[7]}}),{...g,colorPrimaryBg:u[1],colorPrimaryBgHover:u[2],colorPrimaryBorder:u[3],colorPrimaryBorderHover:u[4],colorPrimaryHover:u[5],colorPrimary:u[6],colorPrimaryActive:u[7],colorPrimaryTextHover:u[8],colorPrimaryText:u[9],colorPrimaryTextActive:u[10],colorSuccessBg:f[1],colorSuccessBgHover:f[2],colorSuccessBorder:f[3],colorSuccessBorderHover:f[4],colorSuccessHover:f[4],colorSuccess:f[6],colorSuccessActive:f[7],colorSuccessTextHover:f[8],colorSuccessText:f[9],colorSuccessTextActive:f[10],colorErrorBg:m[1],colorErrorBgHover:m[2],colorErrorBgFilledHover:b,colorErrorBgActive:m[3],colorErrorBorder:m[3],colorErrorBorderHover:m[4],colorErrorHover:m[5],colorError:m[6],colorErrorActive:m[7],colorErrorTextHover:m[8],colorErrorText:m[9],colorErrorTextActive:m[10],colorWarningBg:d[1],colorWarningBgHover:d[2],colorWarningBorder:d[3],colorWarningBorderHover:d[4],colorWarningHover:d[4],colorWarning:d[6],colorWarningActive:d[7],colorWarningTextHover:d[8],colorWarningText:d[9],colorWarningTextActive:d[10],colorInfoBg:p[1],colorInfoBgHover:p[2],colorInfoBorder:p[3],colorInfoBorderHover:p[4],colorInfoHover:p[4],colorInfo:p[6],colorInfoActive:p[7],colorInfoTextHover:p[8],colorInfoText:p[9],colorInfoTextActive:p[10],colorLinkHover:x[4],colorLink:x[6],colorLinkActive:x[7],...h,colorBgMask:new Ze("#000").setA(.45).toRgbString(),colorWhite:"#fff"}}var gN=e=>{let t=e,o=e,r=e,n=e;return e<6&&e>=5?t=e+1:e<16&&e>=6?t=e+2:e>=16&&(t=16),e<7&&e>=5?o=4:e<8&&e>=7?o=5:e<14&&e>=8?o=6:e<16&&e>=14?o=7:e>=16&&(o=8),e<6&&e>=2?r=1:e>=6&&(r=2),e>4&&e<8?n=4:e>=8&&(n=6),{borderRadius:e,borderRadiusXS:r,borderRadiusSM:o,borderRadiusLG:t,borderRadiusOuter:n}},uC=gN;function fp(e){let{motionUnit:t,motionBase:o,borderRadius:r,lineWidth:n}=e;return{motionDurationFast:`${(o+t).toFixed(1)}s`,motionDurationMid:`${(o+t*2).toFixed(1)}s`,motionDurationSlow:`${(o+t*3).toFixed(1)}s`,lineWidthBold:n+1,...uC(r)}}var hN=e=>{let{controlHeight:t}=e;return{controlHeightSM:t*.75,controlHeightXS:t*.5,controlHeightLG:t*1.25}},tu=hN;function Ws(e){return(e+8)/e}function dp(e){let t=Array.from({length:10}).map((o,r)=>{let n=r-1,i=e*Math.E**(n/5),s=r>1?Math.floor(i):Math.ceil(i);return Math.floor(s/2)*2});return t[1]=e,t.map(o=>({size:o,lineHeight:Ws(o)}))}var xN=e=>{let t=dp(e),o=t.map(u=>u.size),r=t.map(u=>u.lineHeight),n=o[1],i=o[0],s=o[2],a=r[1],c=r[0],l=r[2];return{fontSizeSM:i,fontSize:n,fontSizeLG:s,fontSizeXL:o[3],fontSizeHeading1:o[6],fontSizeHeading2:o[5],fontSizeHeading3:o[4],fontSizeHeading4:o[3],fontSizeHeading5:o[2],lineHeight:a,lineHeightLG:l,lineHeightSM:c,fontHeight:Math.round(a*n),fontHeightLG:Math.round(l*s),fontHeightSM:Math.round(c*i),lineHeightHeading1:r[6],lineHeightHeading2:r[5],lineHeightHeading3:r[4],lineHeightHeading4:r[3],lineHeightHeading5:r[2]}},ou=xN;function mp(e){let{sizeUnit:t,sizeStep:o}=e;return{sizeXXL:t*(o+8),sizeXL:t*(o+4),sizeLG:t*(o+2),sizeMD:t*(o+1),sizeMS:t*o,size:t*o,sizeSM:t*(o-1),sizeXS:t*(o-2),sizeXXS:t*(o-3)}}var cr=(e,t)=>new Ze(e).setA(t).toRgbString(),Gi=(e,t)=>new Ze(e).darken(t).toHexString();var fC=e=>{let t=mn(e);return{1:t[0],2:t[1],3:t[2],4:t[3],5:t[4],6:t[5],7:t[6],8:t[4],9:t[5],10:t[6]}},dC=(e,t,o)=>{let r=e||"#fff",n=t||"#000";return{colorBgBase:r,colorTextBase:n,colorShadow:o||"#000",colorText:cr(n,.88),colorTextSecondary:cr(n,.65),colorTextTertiary:cr(n,.45),colorTextQuaternary:cr(n,.25),colorFill:cr(n,.15),colorFillSecondary:cr(n,.06),colorFillTertiary:cr(n,.04),colorFillQuaternary:cr(n,.02),colorBgSolid:cr(n,1),colorBgSolidHover:cr(n,.75),colorBgSolidActive:cr(n,.95),colorBgLayout:Gi(r,4),colorBgContainer:Gi(r,0),colorBgElevated:Gi(r,0),colorBgSpotlight:cr(n,.85),colorBgBlur:"transparent",colorBorder:Gi(r,15),colorBorderDisabled:Gi(r,15),colorBorderSecondary:Gi(r,6)}};function An(e){On.pink=On.magenta,eu.pink=eu.magenta;let t=Object.keys(Ga).map(o=>{let r=e[o]===On[o]?eu[o]:mn(e[o]);return Array.from({length:10},()=>1).reduce((n,i,s)=>(n[`${o}-${s+1}`]=r[s],n[`${o}${s+1}`]=r[s],n),{})}).reduce((o,r)=>(o={...o,...r},o),{});return{...e,...t,...Ka(e,{generateColorPalettes:fC,generateNeutralColorPalettes:dC}),...ou(e.fontSize),...mp(e),...tu(e),...fp(e)}}var bN=un(An),Xi=bN;var si={token:Yr,override:{override:Yr},hashed:!0},Ki=mC.default.createContext(si);var qp=$(require("react"));var Pr=$(require("react")),EC=require("react-dom");var pC=$(require("react")),yN=pC.createContext(null),ru=yN;var gC=!1;function pp(e){return typeof e=="boolean"&&(gC=e),gC}var Yi=$(require("react"));var hC=[];function gp(e,t){let[o]=Yi.useState(()=>It()?document.createElement("div"):null),r=Yi.useRef(!1),n=Yi.useContext(ru),[i,s]=Yi.useState(hC),a=n||(r.current?void 0:u=>{s(f=>[u,...f])});function c(){o.parentElement||document.body.appendChild(o),r.current=!0}function l(){o.parentElement?.removeChild(o),r.current=!1}return qe(()=>(e?n?n(c):c():l(),l),[e]),qe(()=>{i.length&&(i.forEach(u=>u()),s(hC))},[i]),[o,a]}var yC=$(require("react"));function xC(){return document.body.scrollHeight>(window.innerHeight||document.documentElement.clientHeight)&&window.innerWidth>document.body.offsetWidth}var CN=`rc-util-locker-${Date.now()}`,bC=0;function hp(e){let t=!!e,[o]=yC.useState(()=>(bC+=1,`${CN}_${bC}`));qe(()=>{if(t){let r=Xm(document.body).width,n=xC();Go(`
html body {
  overflow-y: hidden;
  ${n?`width: calc(100% - ${r}px);`:""}
}`,o)}else jr(o);return()=>{jr(o)}},[t,o])}var nu=require("react"),Qi=[],SN=200,CC=0;var SC=e=>{if(e.key==="Escape"&&!e.isComposing){if(Date.now()-CC<SN)return;let o=Qi.length;for(let r=o-1;r>=0;r-=1)Qi[r].onEsc({top:r===o-1,event:e})}},vC=()=>{CC=Date.now()};function vN(){window.addEventListener("keydown",SC),window.addEventListener("compositionend",vC)}function RN(){Qi.length===0&&(window.removeEventListener("keydown",SC),window.removeEventListener("compositionend",vC))}function xp(e,t){let o=xo(),r=ye(t),n=()=>{Qi.find(s=>s.id===o)||Qi.push({id:o,onEsc:r})},i=()=>{Qi=Qi.filter(s=>s.id!==o)};(0,nu.useMemo)(()=>{e?n():e||i()},[e]),(0,nu.useEffect)(()=>{if(e)return n(),vN(),()=>{i(),RN()}},[e])}var RC=e=>e===!1?!1:!It()||!e?null:typeof e=="string"?document.querySelector(e):typeof e=="function"?e():e,EN=Pr.forwardRef((e,t)=>{let{open:o,autoLock:r,getContainer:n,debug:i,autoDestroy:s=!0,children:a,onEsc:c}=e,[l,u]=Pr.useState(o),f=l||o;Pr.useEffect(()=>{(s||o)&&u(o)},[o,s]);let[d,m]=Pr.useState(()=>RC(n));Pr.useEffect(()=>{let C=RC(n);m(()=>C??null)});let[p,g]=gp(f&&!d,i),y=d??p;hp(r&&o&&It()&&(y===p||y===document.body)),xp(o,c);let x=null;a&&ri(a)&&t&&(x=Kr(a));let b=ir(x,t);if(!f||!It()||d===void 0)return null;let h=y===!1||pp(),S=a;return t&&(S=Pr.cloneElement(a,{ref:b})),Pr.createElement(ru.Provider,{value:g},h?S:(0,EC.createPortal)(S,y))}),wC=EN;var Zi=wC;function $C(e){var t,o,r="";if(typeof e=="string"||typeof e=="number")r+=e;else if(typeof e=="object")if(Array.isArray(e)){var n=e.length;for(t=0;t<n;t++)e[t]&&(o=$C(e[t]))&&(r&&(r+=" "),r+=o)}else for(o in e)e[o]&&(r&&(r+=" "),r+=o);return r}function E(){for(var e,t,o=0,r="",n=arguments.length;o<n;o++)(e=arguments[o])&&(t=$C(e))&&(r&&(r+=" "),r+=t);return r}var su=$(require("react"));var Nr=$(require("react"));var Qr=$(require("react")),iu=Qr.createContext(null);function PC({children:e,onBatchResize:t}){let o=Qr.useRef(0),r=Qr.useRef([]),n=Qr.useContext(iu),i=Qr.useCallback((s,a,c)=>{o.current+=1;let l=o.current;r.current.push({size:s,element:a,data:c}),Promise.resolve().then(()=>{l===o.current&&(t?.(r.current),r.current=[])}),n?.(s,a,c)},[t,n]);return Qr.createElement(iu.Provider,{value:i},e)}var Ya=$(require("react"));var ai=new Map;function wN(e){e.forEach(t=>{let{target:o}=t;ai.get(o)?.forEach(r=>r(o))})}var bp;function NC(){return bp||(bp=new ResizeObserver(wN)),bp}function IC(e,t){ai.has(e)||(ai.set(e,new Set),NC().observe(e)),ai.get(e).add(t)}function TC(e,t){ai.has(e)&&(ai.get(e).delete(t),ai.get(e).size||(NC().unobserve(e),ai.delete(e)))}function js(e,t,o,r){let n=Ya.useRef({width:-1,height:-1,offsetWidth:-1,offsetHeight:-1}),i=ye(c=>{let{width:l,height:u}=c.getBoundingClientRect(),{offsetWidth:f,offsetHeight:d}=c,m=Math.floor(l),p=Math.floor(u);if(n.current.width!==m||n.current.height!==p||n.current.offsetWidth!==f||n.current.offsetHeight!==d){let g={width:m,height:p,offsetWidth:f,offsetHeight:d};n.current=g;let y=f===Math.round(l)?l:f,x=d===Math.round(u)?u:d,b={...g,offsetWidth:y,offsetHeight:x};r?.(b,c),Promise.resolve().then(()=>{o?.(b,c)})}}),s=typeof t=="function",a=Ya.useRef(0);Ya.useEffect(()=>{let c=s?t():t;return c&&e?IC(c,i):e&&s&&(a.current+=1),()=>{c&&TC(c,i)}},[e,s?a.current:t])}function $N(e,t){let{children:o,disabled:r,onResize:n,data:i}=e,s=Nr.useRef(null),a=Nr.useContext(iu),c=typeof o=="function",l=c?o(s):o,u=!c&&Nr.isValidElement(l)&&ri(l),f=u?Kr(l):null,d=ir(f,s),m=()=>sr(s.current);return Nr.useImperativeHandle(t,()=>m()),js(!r,m,n,(p,g)=>{a?.(p,g,i)}),u?Nr.cloneElement(l,{ref:d}):l}var PN=Nr.forwardRef($N),MC=PN;function yp(){return yp=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},yp.apply(this,arguments)}var NN="rc-observer-key";function IN(e,t){let{children:o}=e;return(typeof o=="function"?[o]:Ro(o)).map((n,i)=>{let s=n?.key||`${NN}-${i}`;return su.createElement(MC,yp({},e,{key:s,ref:i===0?t:void 0}),n)})}var OC=su.forwardRef(IN);OC.Collection=PC;var Ir=OC;var et=$(require("react"));var Ko=$(require("react")),UC=require("react");var Us=$(require("react")),Cp=Us.createContext({}),TN=e=>{let{children:t,...o}=e,r=Us.useMemo(()=>({motion:o.motion}),[o.motion]);return Us.createElement(Cp.Provider,{value:r},t)},Sp=TN;var Ji=$(require("react")),Ln=require("react");var Tr="none",Qa="appear",Za="enter",Ja="leave",vp="none",Xo="prepare",pn="start",_n="active";var au="prepared";var zC=$(require("react")),BC=require("react");function AC(e,t){let o={};return o[e.toLowerCase()]=t.toLowerCase(),o[`Webkit${e}`]=`webkit${t}`,o[`Moz${e}`]=`moz${t}`,o[`ms${e}`]=`MS${t}`,o[`O${e}`]=`o${t.toLowerCase()}`,o}function MN(e,t){let o={animationend:AC("Animation","AnimationEnd"),transitionend:AC("Transition","TransitionEnd")};return e&&("AnimationEvent"in t||delete o.animationend.animation,"TransitionEvent"in t||delete o.transitionend.transition),o}var ON=MN(It(),typeof window<"u"?window:{}),_C={};It()&&({style:_C}=document.createElement("div"));var lu={};function LC(e){if(lu[e])return lu[e];let t=ON[e];if(t){let o=Object.keys(t),r=o.length;for(let n=0;n<r;n+=1){let i=o[n];if(Object.prototype.hasOwnProperty.call(t,i)&&i in _C)return lu[e]=t[i],lu[e]}}return""}var DC=LC("animationend"),FC=LC("transitionend"),cu=!!(DC&&FC),Rp=DC||"animationend",Ep=FC||"transitionend";function wp(e,t){if(!e)return null;if(typeof e=="object"){let o=t.replace(/-\w/g,r=>r[1].toUpperCase());return e[o]}return`${e}-${t}`}var VC=(e=>{let t=(0,BC.useRef)();function o(n){n&&(n.removeEventListener(Ep,e),n.removeEventListener(Rp,e))}function r(n){t.current&&t.current!==n&&o(t.current),n&&n!==t.current&&(n.addEventListener(Ep,e),n.addEventListener(Rp,e),t.current=n)}return zC.useEffect(()=>()=>{o(t.current),t.current=null},[]),[r,o]});var uu=require("react"),AN=It()?uu.useLayoutEffect:uu.useEffect,fu=AN;var kC=$(require("react"));var du=$(require("react")),HC=(()=>{let e=du.useRef(null);function t(){Ge.cancel(e.current)}function o(r,n=2){t();let i=Ge(()=>{n<=1?r({isCanceled:()=>i!==e.current}):o(r,n-1)});e.current=i}return du.useEffect(()=>()=>{t()},[]),[o,t]});var _N=[Xo,pn,_n,"end"],LN=[Xo,au],Pp=!1,WC=!0;function mu(e){return e===_n||e==="end"}var jC=((e,t,o)=>{let[r,n]=Fs(vp),[i,s]=HC();function a(){n(Xo,!0)}let c=t?LN:_N;return fu(()=>{if(r!==vp&&r!=="end"){let l=c.indexOf(r),u=c[l+1],f=o(r);f===Pp?n(u,!0):u&&i(d=>{function m(){d.isCanceled()||n(u,!0)}f===!0?m():Promise.resolve(f).then(m)})}},[e,r]),kC.useEffect(()=>()=>{s()},[]),[a,r]});function Np(e,t,o,{motionEnter:r=!0,motionAppear:n=!0,motionLeave:i=!0,motionDeadline:s,motionLeaveImmediately:a,onAppearPrepare:c,onEnterPrepare:l,onLeavePrepare:u,onAppearStart:f,onEnterStart:d,onLeaveStart:m,onAppearActive:p,onEnterActive:g,onLeaveActive:y,onAppearEnd:x,onEnterEnd:b,onLeaveEnd:h,onVisibleChanged:S}){let[C,R]=Ji.useState(),[v,w]=Fm(Tr),[T,I]=Ji.useState([null,null]),P=v(),N=(0,Ln.useRef)(!1),O=(0,Ln.useRef)(null);function _(){return o()}let M=(0,Ln.useRef)(!1);function A(){w(Tr),I([null,null])}let V=ye(Y=>{let q=v();if(q===Tr)return;let D=_();if(Y&&!Y.deadline&&Y.target!==D)return;let K=M.current,H;q===Qa&&K?H=x?.(D,Y):q===Za&&K?H=b?.(D,Y):q===Ja&&K&&(H=h?.(D,Y)),K&&H!==!1&&A()}),[F]=VC(V),G=Y=>{switch(Y){case Qa:return{[Xo]:c,[pn]:f,[_n]:p};case Za:return{[Xo]:l,[pn]:d,[_n]:g};case Ja:return{[Xo]:u,[pn]:m,[_n]:y};default:return{}}},z=Ji.useMemo(()=>G(P),[P]),[B,k]=jC(P,!e,Y=>{if(Y===Xo){let q=z[Xo];return q?q(_()):Pp}return Y in z&&I([z[Y]?.(_(),null)||null,Y]),Y===_n&&P!==Tr&&(F(_()),s>0&&(clearTimeout(O.current),O.current=setTimeout(()=>{V({deadline:!0})},s))),Y===au&&A(),WC}),W=mu(k);M.current=W;let j=(0,Ln.useRef)(null);fu(()=>{if(N.current&&j.current===t)return;R(t);let Y=N.current;N.current=!0;let q;!Y&&t&&n&&(q=Qa),Y&&t&&r&&(q=Za),(Y&&!t&&i||!Y&&a&&!t&&i)&&(q=Ja);let D=G(q);q&&(e||D[Xo])?(w(q),B()):w(Tr),j.current=t},[t]),(0,Ln.useEffect)(()=>{(P===Qa&&!n||P===Za&&!r||P===Ja&&!i)&&w(Tr)},[n,r,i]),(0,Ln.useEffect)(()=>()=>{N.current=!1,clearTimeout(O.current)},[]);let L=Ji.useRef(!1);(0,Ln.useEffect)(()=>{C&&(L.current=!0),C!==void 0&&P===Tr&&((L.current||C)&&S?.(C),L.current=!0)},[C,P]);let U=T[0];z[Xo]&&k===pn&&(U={transition:"none",...U});let X=T[1];return[v,k,U,C??t,!N.current&&P===Tr&&e&&n?"NONE":k===pn||k===_n?X===k:!0]}function Ip(e){return e?.length<2}function qC(e){let t=e;typeof e=="object"&&({transitionSupport:t}=e);function o(n,i){return!!(n.motionName&&t&&i!==!1)}let r=Ko.forwardRef((n,i)=>{let{visible:s=!0,removeOnLeave:a=!0,forceRender:c,children:l,motionName:u,leavedClassName:f,eventProps:d}=n,{motion:m}=Ko.useContext(Cp),p=o(n,m),g=(0,UC.useRef)();function y(){return sr(g.current)}let[x,b,h,S,C]=Np(p,s,y,n),R=x(),v=Ko.useRef(S);S&&(v.current=!0);let w=Ko.useMemo(()=>{let P={};return Object.defineProperties(P,{nativeElement:{enumerable:!0,get:y},inMotion:{enumerable:!0,get:()=>()=>x()!==Tr},enableMotion:{enumerable:!0,get:()=>()=>p}}),P},[]);Ko.useImperativeHandle(i,()=>w,[]);let T=Ko.useRef(0);C&&(T.current+=1);let I=Ko.useMemo(()=>{if(C==="NONE")return null;let P,N={...d,visible:s};if(!l)P=null;else if(R===Tr)S?P=l({...N},g):!a&&v.current&&f?P=l({...N,className:f},g):c||!a&&!f?P=l({...N,style:{display:"none"}},g):P=null;else{let O;b===Xo?O="prepare":mu(b)?O="active":b===pn&&(O="start");let _=wp(u,`${R}-${O}`);P=l({...N,className:E(wp(u,R),{[_]:_&&O,[u]:typeof u=="string"}),style:h},g)}return P},[T.current]);if(Ip(l)&&Hm(I)){let P=Kr(I);if(P!==g)return Ko.cloneElement(I,{ref:gt(P,g)})}return I});return r.displayName="CSSMotion",r}var pu=qC(cu);var es=$(require("react"));var gu="keep",hu="remove",bu="removed";function DN(e){let t;return e&&typeof e=="object"&&"key"in e?t=e:t={key:e},{...t,key:String(t.key)}}function xu(e=[]){return e.map(DN)}function GC(e=[],t=[]){let o=[],r=0,n=t.length,i=xu(e),s=xu(t);i.forEach(l=>{let u=!1;for(let f=r;f<n;f+=1){let d=s[f];if(d.key===l.key){r<f&&(o=o.concat(s.slice(r,f).map(m=>({...m,status:"add"}))),r=f),o.push({...d,status:gu}),r+=1,u=!0;break}}u||o.push({...l,status:hu})}),r<n&&(o=o.concat(s.slice(r).map(l=>({...l,status:"add"}))));let a={};return o.forEach(({key:l})=>{a[l]=(a[l]||0)+1}),Object.keys(a).filter(l=>a[l]>1).forEach(l=>{o=o.filter(({key:u,status:f})=>u!==l||f!==hu),o.forEach(u=>{u.key===l&&(u.status=gu)})}),o}function Tp(){return Tp=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Tp.apply(this,arguments)}var zN=["eventProps","visible","children","motionName","motionAppear","motionEnter","motionLeave","motionLeaveImmediately","motionDeadline","removeOnLeave","leavedClassName","onAppearPrepare","onAppearStart","onAppearActive","onAppearEnd","onEnterStart","onEnterActive","onEnterEnd","onLeaveStart","onLeaveActive","onLeaveEnd"];function BN(e,t=pu){class o extends es.Component{static defaultProps={component:"div"};state={keyEntities:[]};static getDerivedStateFromProps({keys:n},{keyEntities:i}){let s=xu(n);return{keyEntities:GC(i,s).filter(c=>{let l=i.find(({key:u})=>c.key===u);return!(l&&l.status===bu&&c.status===hu)})}}removeKey=n=>{this.setState(i=>({keyEntities:i.keyEntities.map(a=>a.key!==n?a:{...a,status:bu})}),()=>{let{keyEntities:i}=this.state;i.filter(({status:a})=>a!==bu).length===0&&this.props.onAllRemoved&&this.props.onAllRemoved()})};render(){let{keyEntities:n}=this.state,{component:i,children:s,onVisibleChanged:a,onAllRemoved:c,...l}=this.props,u=i||es.Fragment,f={};return zN.forEach(d=>{f[d]=l[d],delete l[d]}),delete l.keys,es.createElement(u,l,n.map(({status:d,...m},p)=>{let g=d==="add"||d===gu;return es.createElement(t,Tp({},f,{key:m.key,visible:g,eventProps:m,onVisibleChanged:y=>{a?.(y,{key:m.key}),y||this.removeKey(m.key)}}),Ip(s)?y=>s({...y,index:p}):(y,x)=>s({...y,index:p},x))}))}}return o}var VN=BN(cu);var oo=pu;var Yo=$(require("react"));var yu=$(require("react"));function Mp(e){let{prefixCls:t,align:o,arrow:r,arrowPos:n}=e,{className:i,content:s,style:a}=r||{},{x:c=0,y:l=0}=n,u=yu.useRef(null);if(!o||!o.points)return null;let f={position:"absolute"};if(o.autoArrow!==!1){let d=o.points[0],m=o.points[1],p=d[0],g=d[1],y=m[0],x=m[1];p===y||!["t","b"].includes(p)?f.top=l:p==="t"?f.top=0:f.bottom=0,g===x||!["l","r"].includes(g)?f.left=c:g==="l"?f.left=0:f.right=0}return yu.createElement("div",{ref:u,className:E(`${t}-arrow`,i),style:{...f,...a}},s)}var Ap=$(require("react"));function Op(){return Op=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Op.apply(this,arguments)}function _p(e){let{prefixCls:t,open:o,zIndex:r,mask:n,motion:i,mobile:s}=e;return n?Ap.createElement(oo,Op({},i,{motionAppear:!0,visible:o,removeOnLeave:!0}),({className:a})=>Ap.createElement("div",{style:{zIndex:r},className:E(`${t}-mask`,s&&`${t}-mobile-mask`,a)})):null}var XC=$(require("react")),HN=XC.memo(({children:e})=>e,(e,t)=>t.cache),KC=HN;function el(e,t,o,r,n,i,s,a){let c="auto",l=e?{}:{left:"-1000vw",top:"-1000vh",right:c,bottom:c};if(!e&&(t||!o)){let{points:u}=r,f=r.dynamicInset||r._experimental?.dynamicInset,d=f&&u[0][1]==="r",m=f&&u[0][0]==="b";d?(l.right=n,l.left=c):(l.left=s,l.right=c),m?(l.bottom=i,l.top=c):(l.top=a,l.bottom=c)}return l}function Lp(){return Lp=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Lp.apply(this,arguments)}var kN=Yo.forwardRef((e,t)=>{let{onEsc:o,popup:r,className:n,prefixCls:i,style:s,target:a,onVisibleChanged:c,open:l,keepDom:u,fresh:f,onClick:d,mask:m,arrow:p,arrowPos:g,align:y,motion:x,maskMotion:b,mobile:h,forceRender:S,getPopupContainer:C,autoDestroy:R,portal:v,children:w,zIndex:T,onMouseEnter:I,onMouseLeave:P,onPointerEnter:N,onPointerDownCapture:O,ready:_,offsetX:M,offsetY:A,offsetR:V,offsetB:F,onAlign:G,onPrepare:z,onResize:B,stretch:k,targetWidth:W,targetHeight:j}=e,L=typeof r=="function"?r():r,U=l||u,X=!!h,[Y,q,D]=Yo.useMemo(()=>h?[h.mask,h.maskMotion,h.motion]:[m,b,x],[h,m,b,x]),K=C?.length>0,[H,Q]=Yo.useState(!C||!K);qe(()=>{!H&&K&&a&&Q(!0)},[H,K,a]);let Z=ye((re,oe)=>{B?.(re,oe),G()}),te=el(X,_,l,y,V,F,M,A);if(!H)return null;let se={};return k&&(k.includes("height")&&j?se.height=j:k.includes("minHeight")&&j&&(se.minHeight=j),k.includes("width")&&W?se.width=W:k.includes("minWidth")&&W&&(se.minWidth=W)),l||(se.pointerEvents="none"),Yo.createElement(v,{open:S||U,getContainer:C&&(()=>C(a)),autoDestroy:R,onEsc:o},Yo.createElement(_p,{prefixCls:i,open:l,zIndex:T,mask:Y,motion:q,mobile:X}),Yo.createElement(Ir,{onResize:Z,disabled:!l},re=>Yo.createElement(oo,Lp({motionAppear:!0,motionEnter:!0,motionLeave:!0,removeOnLeave:!1,forceRender:S,leavedClassName:`${i}-hidden`},D,{onAppearPrepare:z,onEnterPrepare:z,visible:l,onVisibleChanged:oe=>{x?.onVisibleChanged?.(oe),c(oe)}}),({className:oe,style:ae},ie)=>{let be=E(i,oe,n,{[`${i}-mobile`]:X});return Yo.createElement("div",{ref:gt(re,t,ie),className:be,style:{"--arrow-x":`${g.x||0}px`,"--arrow-y":`${g.y||0}px`,...te,...se,...ae,boxSizing:"border-box",zIndex:T,...s},onMouseEnter:I,onMouseLeave:P,onPointerEnter:N,onClick:d,onPointerDownCapture:O},p&&Yo.createElement(Mp,{prefixCls:i,arrow:p,arrowPos:g,align:y}),Yo.createElement(KC,{cache:!l&&!f},L))})),w)}),Cu=kN;var Dp=$(require("react")),WN=Dp.createContext(null),qs=WN,Su=Dp.createContext(null);var QC=$(require("react"));function YC(e){return e?Array.isArray(e)?e:[e]:[]}function Fp(e,t,o){return QC.useMemo(()=>{let r=YC(t??e),n=YC(o??e),i=new Set(r),s=new Set(n);return i.has("hover")&&!i.has("click")&&i.add("touch"),s.has("hover")&&!s.has("click")&&s.add("touch"),[i,s]},[e,t,o])}var ts=$(require("react"));function jN(e=[],t=[],o){let r=(n,i)=>n[i]||"";return o?r(e,0)===r(t,0):r(e,0)===r(t,0)&&r(e,1)===r(t,1)}function vu(e,t,o,r){let{points:n}=o,i=Object.keys(e);for(let s=0;s<i.length;s+=1){let a=i[s];if(jN(e[a]?.points,n,r))return`${t}-placement-${a}`}return""}function li(e){return e.ownerDocument.defaultView}function ol(e){let t=[],o=e?.parentElement,r=["hidden","scroll","clip","auto"];for(;o;){let{overflowX:n,overflowY:i,overflow:s}=li(o).getComputedStyle(o);[n,i,s].some(a=>r.includes(a))&&t.push(o),o=o.parentElement}return t}function Gs(e,t=1){return Number.isNaN(e)?t:e}function tl(e){return Gs(parseFloat(e),0)}function zp(e,t){let o={...e};return(t||[]).forEach(r=>{if(r instanceof HTMLBodyElement||r instanceof HTMLHtmlElement)return;let{overflow:n,overflowClipMargin:i,borderTopWidth:s,borderBottomWidth:a,borderLeftWidth:c,borderRightWidth:l}=li(r).getComputedStyle(r),u=r.getBoundingClientRect(),{offsetHeight:f,clientHeight:d,offsetWidth:m,clientWidth:p}=r,g=tl(s),y=tl(a),x=tl(c),b=tl(l),h=Gs(Math.round(u.width/m*1e3)/1e3),S=Gs(Math.round(u.height/f*1e3)/1e3),C=(m-p-x-b)*h,R=(f-d-g-y)*S,v=g*S,w=y*S,T=x*h,I=b*h,P=0,N=0;if(n==="clip"){let V=tl(i);P=V*h,N=V*S}let O=u.x+T-P,_=u.y+v-N,M=O+u.width+2*P-T-I-C,A=_+u.height+2*N-v-w-R;o.left=Math.max(o.left,O),o.top=Math.max(o.top,_),o.right=Math.min(o.right,M),o.bottom=Math.min(o.bottom,A)}),o}function ZC(e,t=0){let o=`${t}`,r=o.match(/^(.*)\%$/);return r?e*(parseFloat(r[1])/100):parseFloat(o)}function JC(e,t){let[o,r]=t||[];return[ZC(e.width,o),ZC(e.height,r)]}function eS(e=""){return[e[0],e[1]]}function Xs(e,t){let o=t[0],r=t[1],n,i;return o==="t"?i=e.y:o==="b"?i=e.y+e.height:i=e.y+e.height/2,r==="l"?n=e.x:r==="r"?n=e.x+e.width:n=e.x+e.width/2,{x:n,y:i}}function ci(e,t){let o={t:"b",b:"t",l:"r",r:"l"},r=[...e];return r[t]=o[e[t]]||"c",r}function tS(e){return e.join("")}function rl(e,t,o,r,n,i,s,a){let[c,l]=ts.useState({ready:!1,offsetX:0,offsetY:0,offsetR:0,offsetB:0,arrowX:0,arrowY:0,scaleX:1,scaleY:1,align:n[r]||{}}),u=ts.useRef(0),f=ts.useMemo(()=>!t||a?[]:ol(t),[t]),d=ts.useRef({});e||(()=>{d.current={}})();let p=ye(()=>{if(t&&o&&e&&!a){let Ye=function(Ne,Wo,_o=se){let La=M.x+Ne,_i=M.y+Wo,rc=La+L,nc=_i+j,ic=Math.max(La,_o.left),sb=Math.max(_i,_o.top),fm=Math.min(rc,_o.right),dm=Math.min(nc,_o.bottom);return Math.max(0,(fm-ic)*(dm-sb))},he=function(){ge=M.y+Fe,Le=ge+j,ne=M.x+ve,Ce=ne+L},x=t,b=x.ownerDocument,h=li(x),{position:S}=h.getComputedStyle(x),C=x.style.left,R=x.style.top,v=x.style.right,w=x.style.bottom,T=x.style.overflow,I=x.style.overflowX,P=x.style.overflowY,N={...n[r],...i},O=b.createElement("div");x.parentElement?.appendChild(O),O.style.left=`${x.offsetLeft}px`,O.style.top=`${x.offsetTop}px`,O.style.position=S,O.style.height=`${x.offsetHeight}px`,O.style.width=`${x.offsetWidth}px`,x.style.left="0",x.style.top="0",x.style.right="auto",x.style.bottom="auto",x.style.overflow="hidden";let _;if(Array.isArray(o))_={x:o[0],y:o[1],width:0,height:0};else{let Ne=o.getBoundingClientRect();Ne.x=Ne.x??Ne.left,Ne.y=Ne.y??Ne.top,_={x:Ne.x,y:Ne.y,width:Ne.width,height:Ne.height}}let M=x.getBoundingClientRect(),{height:A,width:V}=h.getComputedStyle(x);M.x=M.x??M.left,M.y=M.y??M.top;let{clientWidth:F,clientHeight:G,scrollWidth:z,scrollHeight:B,scrollTop:k,scrollLeft:W}=b.documentElement,j=M.height,L=M.width,U=_.height,X=_.width,Y={left:0,top:0,right:F,bottom:G},q={left:-W,top:-k,right:z-W,bottom:B-k},{htmlRegion:D}=N,K="visible",H="visibleFirst";D!=="scroll"&&D!==H&&(D=K);let Q=D===H,Z=zp(q,f),te=zp(Y,f),se=D===K?te:Z,re=Q?te:se;x.style.left="auto",x.style.top="auto",x.style.right="0",x.style.bottom="0";let oe=x.getBoundingClientRect();x.style.left=C,x.style.top=R,x.style.right=v,x.style.bottom=w,x.style.overflow=T,x.style.overflowX=I,x.style.overflowY=P,x.parentElement?.removeChild(O);let ae=Gs(Math.round(L/parseFloat(V)*1e3)/1e3),ie=Gs(Math.round(j/parseFloat(A)*1e3)/1e3);if(ae===0||ie===0||fn(o)&&!qi(o))return;let{offset:be,targetOffset:ee}=N,[xe,fe]=JC(M,be),[_e,Ve]=JC(_,ee);_.x-=_e,_.y-=Ve;let[ue,He]=N.points||[],Ke=eS(He),Pe=eS(ue),de=Xs(_,Ke),le=Xs(M,Pe),Re={...N},pe=[Pe,Ke],ve=de.x-le.x+xe,Fe=de.y-le.y+fe,Je=Ye(ve,Fe),st=Ye(ve,Fe,te),Xe=Xs(_,["t","l"]),wt=Xs(M,["t","l"]),$t=Xs(_,["b","r"]),lt=Xs(M,["b","r"]),Ct=N.overflow||{},{adjustX:Pt,adjustY:Nt,shiftX:Me,shiftY:zt}=Ct,ce=Ne=>typeof Ne=="boolean"?Ne:Ne>=0,ge,Le,ne,Ce;he();let $e=ce(Nt),Qe=Pe[0]===Ke[0];if($e&&Pe[0]==="t"&&(Le>re.bottom||d.current.bt)){let Ne=Fe;Qe?Ne-=j-U:Ne=Xe.y-lt.y-fe;let Wo=Ye(ve,Ne),_o=Ye(ve,Ne,te);Wo>Je||Wo===Je&&(!Q||_o>=st)?(d.current.bt=!0,Fe=Ne,fe=-fe,pe=[ci(pe[0],0),ci(pe[1],0)]):d.current.bt=!1}if($e&&Pe[0]==="b"&&(ge<re.top||d.current.tb)){let Ne=Fe;Qe?Ne+=j-U:Ne=$t.y-wt.y-fe;let Wo=Ye(ve,Ne),_o=Ye(ve,Ne,te);Wo>Je||Wo===Je&&(!Q||_o>=st)?(d.current.tb=!0,Fe=Ne,fe=-fe,pe=[ci(pe[0],0),ci(pe[1],0)]):d.current.tb=!1}let Bt=ce(Pt),At=Pe[1]===Ke[1];if(Bt&&Pe[1]==="l"&&(Ce>re.right||d.current.rl)){let Ne=ve;At?Ne-=L-X:Ne=Xe.x-lt.x-xe;let Wo=Ye(Ne,Fe),_o=Ye(Ne,Fe,te);Wo>Je||Wo===Je&&(!Q||_o>=st)?(d.current.rl=!0,ve=Ne,xe=-xe,pe=[ci(pe[0],1),ci(pe[1],1)]):d.current.rl=!1}if(Bt&&Pe[1]==="r"&&(ne<re.left||d.current.lr)){let Ne=ve;At?Ne+=L-X:Ne=$t.x-wt.x-xe;let Wo=Ye(Ne,Fe),_o=Ye(Ne,Fe,te);Wo>Je||Wo===Je&&(!Q||_o>=st)?(d.current.lr=!0,ve=Ne,xe=-xe,pe=[ci(pe[0],1),ci(pe[1],1)]):d.current.lr=!1}Re.points=[tS(pe[0]),tS(pe[1])],he();let pt=Me===!0?0:Me;typeof pt=="number"&&(ne<te.left&&(ve-=ne-te.left-xe,_.x+X<te.left+pt&&(ve+=_.x-te.left+X-pt)),Ce>te.right&&(ve-=Ce-te.right-xe,_.x>te.right-pt&&(ve+=_.x-te.right+pt)));let qt=zt===!0?0:zt;typeof qt=="number"&&(ge<te.top&&(Fe-=ge-te.top-fe,_.y+U<te.top+qt&&(Fe+=_.y-te.top+U-qt)),Le>te.bottom&&(Fe-=Le-te.bottom-fe,_.y>te.bottom-qt&&(Fe+=_.y-te.bottom+qt)));let Qt=M.x+ve,vr=Qt+L,io=M.y+Fe,so=io+j,go=_.x,we=go+X,ke=_.y,_t=ke+U,vo=Math.max(Qt,go),ct=Math.min(vr,we),ho=(vo+ct)/2-Qt,ko=Math.max(io,ke),Wr=Math.min(so,_t),Jn=(ko+Wr)/2-io;s?.(t,Re);let ln=oe.right-M.x-(ve+M.width),Nn=oe.bottom-M.y-(Fe+M.height);ae===1&&(ve=Math.floor(ve),ln=Math.floor(ln)),ie===1&&(Fe=Math.floor(Fe),Nn=Math.floor(Nn));let _a={ready:!0,offsetX:ve/ae,offsetY:Fe/ie,offsetR:ln/ae,offsetB:Nn/ie,arrowX:ho/ae,arrowY:Jn/ie,scaleX:ae,scaleY:ie,align:Re};l(_a)}}),g=()=>{u.current+=1;let x=u.current;Promise.resolve().then(()=>{u.current===x&&p()})},y=()=>{l(x=>({...x,ready:!1}))};return qe(y,[r]),qe(()=>{e||y()},[e]),[c.ready,c.offsetX,c.offsetY,c.offsetR,c.offsetB,c.arrowX,c.arrowY,c.scaleX,c.scaleY,c.align,g]}var Ru=$(require("react"));function nl(){let e=Ru.useRef(null),t=()=>{e.current&&(clearTimeout(e.current),e.current=null)},o=(r,n)=>{t(),n===0?r():e.current=setTimeout(()=>{r()},n*1e3)};return Ru.useEffect(()=>()=>{t()},[]),o}function Bp(e,t,o,r,n){qe(()=>{if(e&&t&&o){let f=function(){r(),n()},i=t,s=o,a=ol(i),c=ol(s),l=li(s),u=new Set([l,...a,...c]);return u.forEach(d=>{d.addEventListener("scroll",f,{passive:!0})}),l.addEventListener("resize",f,{passive:!0}),r(),()=>{u.forEach(d=>{d.removeEventListener("scroll",f),l.removeEventListener("resize",f)})}}},[e,t,o])}var il=$(require("react"));function Vp(e,t,o,r,n,i,s,a){let c=il.useRef(e);c.current=e;let l=il.useRef(!1);il.useEffect(()=>{if(t&&r&&(!n||i)){let f=()=>{l.current=!1},d=g=>{c.current&&!s(g.composedPath?.()?.[0]||g.target)&&!l.current&&a(!1)},m=li(r);m.addEventListener("pointerdown",f,!0),m.addEventListener("mousedown",d,!0),m.addEventListener("contextmenu",d,!0);let p=Vs(o);return p&&(p.addEventListener("mousedown",d,!0),p.addEventListener("contextmenu",d,!0)),()=>{m.removeEventListener("pointerdown",f,!0),m.removeEventListener("mousedown",d,!0),m.removeEventListener("contextmenu",d,!0),p&&(p.removeEventListener("mousedown",d,!0),p.removeEventListener("contextmenu",d,!0))}}},[t,o,r,n,i]);function u(){l.current=!0}return u}var Zt=$(require("react"));var sl=$(require("react"));function Hp(){let[e,t]=sl.default.useState(null),[o,r]=sl.default.useState(!1),[n,i]=sl.default.useState(!1),s=sl.default.useRef(null),a=ye(l=>{l===!1?(s.current=null,r(!1)):n&&o?s.current=l:(r(!0),t(l),s.current=null,o||i(!0))}),c=ye(l=>{l?(i(!1),s.current&&(t(s.current),s.current=null)):(i(!1),s.current=null)});return[a,o,e,c]}var al=$(require("react"));function kp(){return kp=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},kp.apply(this,arguments)}var UN=e=>{let{prefixCls:t,isMobile:o,ready:r,open:n,align:i,offsetR:s,offsetB:a,offsetX:c,offsetY:l,arrowPos:u,popupSize:f,motion:d,uniqueContainerClassName:m,uniqueContainerStyle:p}=e,g=`${t}-unique-container`,[y,x]=al.default.useState(!1),b=el(o,r,n,i,s,a,c,l),h=al.default.useRef(b);r&&(h.current=b);let S={};return f&&(S.width=f.width,S.height=f.height),al.default.createElement(oo,kp({motionAppear:!0,motionEnter:!0,motionLeave:!0,removeOnLeave:!1,leavedClassName:`${g}-hidden`},d,{visible:n,onVisibleChanged:C=>{x(C)}}),({className:C,style:R})=>{let v=E(g,C,m,{[`${g}-visible`]:y});return al.default.createElement("div",{className:v,style:{"--arrow-x":`${u?.x||0}px`,"--arrow-y":`${u?.y||0}px`,...h.current,...S,...R,...p}})})},oS=UN;var qN=({children:e,postTriggerProps:t})=>{let[o,r,n,i]=Hp(),s=Zt.useMemo(()=>!n||!t?n:t(n),[n,t]),[a,c]=Zt.useState(null),[l,u]=Zt.useState(null),f=Zt.useRef(null),d=ye(F=>{f.current=F,fn(F)&&a!==F&&c(F)}),m=Zt.useRef(null),p=nl(),g=ye((F,G)=>{m.current=G,p(()=>{o(F)},F.delay)}),y=F=>{p(()=>{m.current?.()||o(!1)},F)},x=ye(F=>{i(F)}),[b,h,S,C,R,v,w,,,T,I]=rl(r,a,s?.target,s?.popupPlacement,s?.builtinPlacements||{},s?.popupAlign,void 0,!1),P=Zt.useMemo(()=>{if(!s)return"";let F=vu(s.builtinPlacements||{},s.prefixCls||"",T,!1);return E(F,s.getPopupClassNameFromAlign?.(T))},[T,s?.getPopupClassNameFromAlign,s?.builtinPlacements,s?.prefixCls]),N=Zt.useMemo(()=>({show:g,hide:y}),[]);Zt.useEffect(()=>{I()},[s?.target]);let O=ye(()=>(I(),Promise.resolve())),_=Zt.useRef({}),M=Zt.useContext(qs),A=Zt.useMemo(()=>({registerSubPopup:(F,G)=>{_.current[F]=G,M?.registerSubPopup(F,G)}}),[M]),V=s?.prefixCls;return Zt.createElement(Su.Provider,{value:N},e,s&&Zt.createElement(qs.Provider,{value:A},Zt.createElement(Cu,{ref:d,portal:Zi,onEsc:s.onEsc,prefixCls:V,popup:s.popup,className:E(s.popupClassName,P,`${V}-unique-controlled`),style:s.popupStyle,target:s.target,open:r,keepDom:!0,fresh:!0,autoDestroy:!1,onVisibleChanged:x,ready:b,offsetX:h,offsetY:S,offsetR:C,offsetB:R,onAlign:I,onPrepare:O,onResize:F=>u({width:F.offsetWidth,height:F.offsetHeight}),arrowPos:{x:v,y:w},align:T,zIndex:s.zIndex,mask:s.mask,arrow:s.arrow,motion:s.popupMotion,maskMotion:s.maskMotion,getPopupContainer:s.getPopupContainer},Zt.createElement(oS,{prefixCls:V,isMobile:!1,ready:b,open:r,align:T,offsetR:C,offsetB:R,offsetX:h,offsetY:S,arrowPos:{x:v,y:w},popupSize:l,motion:s.popupMotion,uniqueContainerClassName:E(s.uniqueContainerClassName,P),uniqueContainerStyle:s.uniqueContainerStyle}))))},Wp=qN;var rS=require("react-dom");function GN(e=Zi){return et.forwardRef((o,r)=>{let{prefixCls:n="rc-trigger-popup",children:i,action:s="hover",showAction:a,hideAction:c,disabled:l=!1,popupVisible:u,defaultPopupVisible:f,onOpenChange:d,afterOpenChange:m,onPopupVisibleChange:p,afterPopupVisibleChange:g,mouseEnterDelay:y,mouseLeaveDelay:x=.1,focusDelay:b,blurDelay:h,mask:S,maskClosable:C=!0,getPopupContainer:R,forceRender:v,autoDestroy:w,popup:T,popupClassName:I,uniqueContainerClassName:P,uniqueContainerStyle:N,popupStyle:O,popupPlacement:_,builtinPlacements:M={},popupAlign:A,zIndex:V,stretch:F,getPopupClassNameFromAlign:G,fresh:z,unique:B,alignPoint:k,onPopupClick:W,onPopupAlign:j,arrow:L,popupMotion:U,maskMotion:X,mobile:Y,...q}=o,D=w||!1,K=u===void 0,H=!!Y,Q=et.useRef({}),Z=et.useContext(qs),te=et.useMemo(()=>({registerSubPopup:(me,at)=>{Q.current[me]=at,Z?.registerSubPopup(me,at)}}),[Z]),se=et.useContext(Su),re=xo(),[oe,ae]=et.useState(null),ie=et.useRef(null),be=ye(me=>{ie.current=me,fn(me)&&oe!==me&&ae(me),Z?.registerSubPopup(re,me)}),[ee,xe]=et.useState(null),fe=et.useRef(null),_e=ye(me=>{let at=sr(me);fn(at)&&ee!==at&&(xe(at),fe.current=at)}),Ve={},ue=ye(me=>{let at=ee;return at?.contains(me)||Vs(at)?.host===me||me===at||oe?.contains(me)||Vs(oe)?.host===me||me===oe||Object.values(Q.current).some(sc=>sc?.contains(me)||me===sc)}),He=L?{...L!==!0?L:{}}:null,[Ke,Pe]=it(f||!1,u),de=Ke||!1,le=de&&!l,Re=et.useMemo(()=>{let me=typeof i=="function"?i({open:le}):i;return et.Children.only(me)},[i,le]),pe=Re?.props||{},ve=ye(()=>le),Fe=ye((me=0)=>({popup:T,target:ee,delay:me,prefixCls:n,popupClassName:I,uniqueContainerClassName:P,uniqueContainerStyle:N,popupStyle:O,popupPlacement:_,builtinPlacements:M,popupAlign:A,zIndex:V,mask:S,maskClosable:C,popupMotion:U,maskMotion:X,arrow:He,getPopupContainer:R,getPopupClassNameFromAlign:G,id:re,onEsc:wt}));qe(()=>{se&&B&&ee&&!K&&!Z&&(le?se.show(Fe(y),ve):se.hide(x))},[le,ee]);let Ye=et.useRef(le);Ye.current=le;let Je=ye(me=>{(0,rS.flushSync)(()=>{de!==me&&(Pe(me),d?.(me),p?.(me))})}),st=nl(),Xe=(me,at=0)=>{if(u!==void 0){st(()=>{Je(me)},at);return}if(se&&B&&K&&!Z){me?se.show(Fe(at),ve):se.hide(at);return}st(()=>{Je(me)},at)};function wt({top:me}){me&&Xe(!1)}let[$t,lt]=et.useState(!1);qe(me=>{(!me||le)&&lt(!0)},[le]);let[Ct,Pt]=et.useState(null),[Nt,Me]=et.useState(null),zt=me=>{Me([me.clientX,me.clientY])},[ce,ge,Le,ne,Ce,he,$e,Qe,Bt,At,pt]=rl(le,oe,k&&Nt!==null?Nt:ee,_,M,A,j,H),[qt,Qt]=Fp(s,a,c),vr=qt.has("click"),io=Qt.has("click")||Qt.has("contextMenu"),so=ye(()=>{$t||pt()});Bp(le,ee,oe,so,()=>{Ye.current&&k&&io&&Xe(!1)}),qe(()=>{so()},[Nt,_]),qe(()=>{le&&!M?.[_]&&so()},[JSON.stringify(A)]);let we=et.useMemo(()=>{let me=vu(M,n,At,k);return E(me,G?.(At))},[At,G,M,n,k]);et.useImperativeHandle(r,()=>({nativeElement:fe.current,popupElement:ie.current,forceAlign:so}));let[ke,_t]=et.useState(0),[vo,ct]=et.useState(0),Vt=()=>{if(F&&ee){let me=ee.getBoundingClientRect();_t(me.width),ct(me.height)}},ho=()=>{Vt(),so()},ko=me=>{lt(!1),pt(),m?.(me),g?.(me)},Wr=()=>new Promise(me=>{Vt(),Pt(()=>me)});qe(()=>{Ct&&(pt(),Ct(),Pt(null))},[Ct]);function an(me,at,sc,F1,ab){Ve[me]=(lb,...z1)=>{(!ab||!ab())&&(F1?.(lb),Xe(at,sc)),pe[me]?.(lb,...z1)}}let Jn=qt.has("touch"),ln=Qt.has("touch"),Nn=et.useRef(!1);(Jn||ln)&&(Ve.onTouchStart=(...me)=>{Nn.current=!0,Ye.current&&ln?Xe(!1):!Ye.current&&Jn&&Xe(!0),pe.onTouchStart?.(...me)}),(vr||io)&&(Ve.onClick=(me,...at)=>{Ye.current&&io?Xe(!1):!Ye.current&&vr&&(zt(me),Xe(!0)),pe.onClick?.(me,...at),Nn.current=!1});let _a=Vp(le,io||ln,ee,oe,S,C,ue,Xe),Ne=qt.has("hover"),Wo=Qt.has("hover"),_o,La,_i=()=>Nn.current;if(Ne){let me=at=>{zt(at)};an("onMouseEnter",!0,y,me,_i),an("onPointerEnter",!0,y,me,_i),_o=at=>{(le||$t)&&oe?.contains(at.target)&&Xe(!0,y)},k&&(Ve.onMouseMove=at=>{pe.onMouseMove?.(at)})}Wo&&(an("onMouseLeave",!1,x,void 0,_i),an("onPointerLeave",!1,x,void 0,_i),La=()=>{Xe(!1,x)}),qt.has("focus")&&an("onFocus",!0,b),Qt.has("focus")&&an("onBlur",!1,h),qt.has("contextMenu")&&(Ve.onContextMenu=(me,...at)=>{Ye.current&&Qt.has("contextMenu")?Xe(!1):(zt(me),Xe(!0)),me.preventDefault(),pe.onContextMenu?.(me,...at)});let rc=et.useRef(!1);rc.current||=v||le||$t;let nc={...pe,...Ve},ic={};["onContextMenu","onClick","onMouseDown","onTouchStart","onMouseEnter","onMouseLeave","onFocus","onBlur"].forEach(me=>{q[me]&&(ic[me]=(...at)=>{nc[me]?.(...at),q[me](...at)})});let fm={x:he,y:$e};js(le,ee,ho);let dm=ir(_e,Kr(Re)),D1=et.cloneElement(Re,{...nc,...ic,ref:dm});return et.createElement(et.Fragment,null,D1,rc.current&&(!se||!B)&&et.createElement(qs.Provider,{value:te},et.createElement(Cu,{portal:e,ref:be,prefixCls:n,popup:T,className:E(I,!H&&we),style:O,target:ee,onMouseEnter:_o,onMouseLeave:La,onPointerEnter:_o,zIndex:V,open:le,keepDom:$t,fresh:z,onClick:W,onPointerDownCapture:_a,mask:S,motion:U,maskMotion:X,onVisibleChanged:ko,onPrepare:Wr,forceRender:v,autoDestroy:D,getPopupContainer:R,onEsc:wt,align:At,arrow:He,arrowPos:fm,ready:ce,offsetX:ge,offsetY:Le,offsetR:ne,offsetB:Ce,onAlign:so,stretch:F,targetWidth:ke/Qe,targetHeight:vo/Bt,mobile:Y})))})}var Eu=GN(Zi);var Pu=$(require("react"));var ll=$(require("react"));function wu(e){return e&&ll.default.isValidElement(e)&&e.type===ll.default.Fragment}var jp=(e,t,o)=>ll.default.isValidElement(e)?ll.default.cloneElement(e,ot(o)?o(e.props||{}):o):t;function Qo(e,t){return jp(e,e,t)}var $u=$(require("react")),Ks="ant",Ys="anticon",Up=["outlined","borderless","filled","underlined"],XN=(e,t)=>t||(e?`${Ks}-${e}`:Ks),Se=$u.createContext({getPrefixCls:XN,iconPrefixCls:Ys}),{Consumer:KN}=Se,nS={};function De(e){let t=$u.useContext(Se),{getPrefixCls:o,direction:r,getPopupContainer:n,renderEmpty:i}=t,s=t[e];return{classNames:nS,styles:nS,...s,getPrefixCls:o,direction:r,getPopupContainer:n,renderEmpty:i}}var YN=({children:e})=>{let{getPrefixCls:t}=Pu.default.useContext(Se),o=t();return Pu.default.isValidElement(e)?Pu.default.createElement(oo,{visible:!0,motionName:`${o}-fade`,motionAppear:!0,motionEnter:!0,motionLeave:!1,removeOnLeave:!1},({style:r,className:n})=>Qo(e,i=>({className:E(i.className,n),style:{...i.style,...r}}))):e},iS=YN;var Nu=[null,null];function QN(e){if(Nu[0]!==e){let t={};Object.keys(e).forEach(o=>{t[o]={...e[o],dynamicInset:!1}}),Nu[0]=e,Nu[1]=t}return Nu[1]}var ZN=({children:e})=>{let t=o=>{let{id:r,builtinPlacements:n,popup:i}=o,s=ot(i)?i():i,a=QN(n);return{...o,getPopupContainer:null,arrow:!1,popup:qp.default.createElement(iS,{key:r},s),builtinPlacements:a}};return qp.default.createElement(Wp,{postTriggerProps:t},e)},Iu=ZN;var Qs=$(require("react")),Gp=Qs.createContext(!1),Tu=({children:e,disabled:t})=>{let o=Qs.useContext(Gp);return Qs.createElement(Gp.Provider,{value:t??o},e)},Xt=Gp;var Kp=require("react");var Zs=$(require("react")),Xp=Zs.createContext(void 0),sS=({children:e,size:t})=>{let o=Zs.useContext(Xp);return Zs.createElement(Xp.Provider,{value:t||o},e)},os=Xp;function JN(){let e=(0,Kp.useContext)(Xt),t=(0,Kp.useContext)(os);return{componentDisabled:e,componentSize:t}}var aS=JN;var OS=require("react");function yo(e){"@babel/helpers - typeof";return yo=typeof Symbol=="function"&&typeof Symbol.iterator=="symbol"?function(t){return typeof t}:function(t){return t&&typeof Symbol=="function"&&t.constructor===Symbol&&t!==Symbol.prototype?"symbol":typeof t},yo(e)}function lS(e){if(Array.isArray(e))return e}function cS(e,t){var o=e==null?null:typeof Symbol<"u"&&e[Symbol.iterator]||e["@@iterator"];if(o!=null){var r,n,i,s,a=[],c=!0,l=!1;try{if(i=(o=o.call(e)).next,t===0){if(Object(o)!==o)return;c=!1}else for(;!(c=(r=i.call(o)).done)&&(a.push(r.value),a.length!==t);c=!0);}catch(u){l=!0,n=u}finally{try{if(!c&&o.return!=null&&(s=o.return(),Object(s)!==s))return}finally{if(l)throw n}}return a}}function cl(e,t){(t==null||t>e.length)&&(t=e.length);for(var o=0,r=Array(t);o<t;o++)r[o]=e[o];return r}function Mu(e,t){if(e){if(typeof e=="string")return cl(e,t);var o={}.toString.call(e).slice(8,-1);return o==="Object"&&e.constructor&&(o=e.constructor.name),o==="Map"||o==="Set"?Array.from(e):o==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(o)?cl(e,t):void 0}}function uS(){throw new TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Ou(e,t){return lS(e)||cS(e,t)||Mu(e,t)||uS()}function fS(e){if(Array.isArray(e))return cl(e)}function dS(e){if(typeof Symbol<"u"&&e[Symbol.iterator]!=null||e["@@iterator"]!=null)return Array.from(e)}function mS(){throw new TypeError(`Invalid attempt to spread non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`)}function Rt(e){return fS(e)||dS(e)||Mu(e)||mS()}function pS(e,t){if(yo(e)!="object"||!e)return e;var o=e[Symbol.toPrimitive];if(o!==void 0){var r=o.call(e,t||"default");if(yo(r)!="object")return r;throw new TypeError("@@toPrimitive must return a primitive value.")}return(t==="string"?String:Number)(e)}function Au(e){var t=pS(e,"string");return yo(t)=="symbol"?t:t+""}function Do(e,t,o){return(t=Au(t))in e?Object.defineProperty(e,t,{value:o,enumerable:!0,configurable:!0,writable:!0}):e[t]=o,e}function gS(e,t){var o=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter(function(n){return Object.getOwnPropertyDescriptor(e,n).enumerable})),o.push.apply(o,r)}return o}function No(e){for(var t=1;t<arguments.length;t++){var o=arguments[t]!=null?arguments[t]:{};t%2?gS(Object(o),!0).forEach(function(r){Do(e,r,o[r])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(o)):gS(Object(o)).forEach(function(r){Object.defineProperty(e,r,Object.getOwnPropertyDescriptor(o,r))})}return e}var $S=require("react");function Mr(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}function hS(e,t){for(var o=0;o<t.length;o++){var r=t[o];r.enumerable=r.enumerable||!1,r.configurable=!0,"value"in r&&(r.writable=!0),Object.defineProperty(e,Au(r.key),r)}}function Or(e,t,o){return t&&hS(e.prototype,t),o&&hS(e,o),Object.defineProperty(e,"prototype",{writable:!1}),e}function ui(e){if(e===void 0)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return e}function _u(e,t){return _u=Object.setPrototypeOf?Object.setPrototypeOf.bind():function(o,r){return o.__proto__=r,o},_u(e,t)}function Js(e,t){if(typeof t!="function"&&t!==null)throw new TypeError("Super expression must either be null or a function");e.prototype=Object.create(t&&t.prototype,{constructor:{value:e,writable:!0,configurable:!0}}),Object.defineProperty(e,"prototype",{writable:!1}),t&&_u(e,t)}function fi(e){return fi=Object.setPrototypeOf?Object.getPrototypeOf.bind():function(t){return t.__proto__||Object.getPrototypeOf(t)},fi(e)}function ul(){try{var e=!Boolean.prototype.valueOf.call(Reflect.construct(Boolean,[],function(){}))}catch{}return(ul=function(){return!!e})()}function Lu(e,t){if(t&&(yo(t)=="object"||typeof t=="function"))return t;if(t!==void 0)throw new TypeError("Derived constructors may only return object or undefined");return ui(e)}function Du(e){var t=ul();return function(){var o,r=fi(e);if(t){var n=fi(this).constructor;o=Reflect.construct(r,arguments,n)}else o=r.apply(this,arguments);return Lu(this,o)}}var eI=Or(function e(){Mr(this,e)}),Fu=eI;var xS="CALC_UNIT",tI=new RegExp(xS,"g");function Yp(e){return typeof e=="number"?"".concat(e).concat(xS):e}var bS=(function(e){Js(o,e);var t=Du(o);function o(r,n){var i;Mr(this,o),i=t.call(this),Do(ui(i),"result",""),Do(ui(i),"unitlessCssVar",void 0),Do(ui(i),"lowPriority",void 0);var s=yo(r);return i.unitlessCssVar=n,r instanceof o?i.result="(".concat(r.result,")"):s==="number"?i.result=Yp(r):s==="string"&&(i.result=r),i}return Or(o,[{key:"add",value:function(n){return n instanceof o?this.result="".concat(this.result," + ").concat(n.getResult()):(typeof n=="number"||typeof n=="string")&&(this.result="".concat(this.result," + ").concat(Yp(n))),this.lowPriority=!0,this}},{key:"sub",value:function(n){return n instanceof o?this.result="".concat(this.result," - ").concat(n.getResult()):(typeof n=="number"||typeof n=="string")&&(this.result="".concat(this.result," - ").concat(Yp(n))),this.lowPriority=!0,this}},{key:"mul",value:function(n){return this.lowPriority&&(this.result="(".concat(this.result,")")),n instanceof o?this.result="".concat(this.result," * ").concat(n.getResult(!0)):(typeof n=="number"||typeof n=="string")&&(this.result="".concat(this.result," * ").concat(n)),this.lowPriority=!1,this}},{key:"div",value:function(n){return this.lowPriority&&(this.result="(".concat(this.result,")")),n instanceof o?this.result="".concat(this.result," / ").concat(n.getResult(!0)):(typeof n=="number"||typeof n=="string")&&(this.result="".concat(this.result," / ").concat(n)),this.lowPriority=!1,this}},{key:"getResult",value:function(n){return this.lowPriority||n?"(".concat(this.result,")"):this.result}},{key:"equal",value:function(n){var i=this,s=n||{},a=s.unit,c=!0;return typeof a=="boolean"?c=a:Array.from(this.unitlessCssVar).some(function(l){return i.result.includes(l)})&&(c=!1),this.result=this.result.replace(tI,c?"px":""),typeof this.lowPriority<"u"?"calc(".concat(this.result,")"):this.result}}]),o})(Fu);var oI=(function(e){Js(o,e);var t=Du(o);function o(r){var n;return Mr(this,o),n=t.call(this),Do(ui(n),"result",0),r instanceof o?n.result=r.result:typeof r=="number"&&(n.result=r),n}return Or(o,[{key:"add",value:function(n){return n instanceof o?this.result+=n.result:typeof n=="number"&&(this.result+=n),this}},{key:"sub",value:function(n){return n instanceof o?this.result-=n.result:typeof n=="number"&&(this.result-=n),this}},{key:"mul",value:function(n){return n instanceof o?this.result*=n.result:typeof n=="number"&&(this.result*=n),this}},{key:"div",value:function(n){return n instanceof o?this.result/=n.result:typeof n=="number"&&(this.result/=n),this}},{key:"equal",value:function(){return this.result}}]),o})(Fu),yS=oI;var rI=function(t,o){var r=t==="css"?bS:yS;return function(n){return new r(n,o)}},zu=rI;var nI=function(t,o){return"".concat([o,t.replace(/([A-Z]+)([A-Z][a-z]+)/g,"$1-$2").replace(/([a-z])([A-Z])/g,"$1-$2")].filter(Boolean).join("-"))},Qp=nI;function iI(e,t,o,r){var n=No({},t[e]);if(r!=null&&r.deprecatedTokens){var i=r.deprecatedTokens;i.forEach(function(a){var c=Ou(a,2),l=c[0],u=c[1];if(n!=null&&n[l]||n!=null&&n[u]){var f;(f=n[u])!==null&&f!==void 0||(n[u]=n?.[l])}})}var s=No(No({},o),n);return Object.keys(s).forEach(function(a){s[a]===t[a]&&delete s[a]}),s}var Zp=iI;var CS=typeof CSSINJS_STATISTIC<"u",Jp=!0;function Oe(){for(var e=arguments.length,t=new Array(e),o=0;o<e;o++)t[o]=arguments[o];if(!CS)return Object.assign.apply(Object,[{}].concat(t));Jp=!1;var r={};return t.forEach(function(n){if(yo(n)==="object"){var i=Object.keys(n);i.forEach(function(s){Object.defineProperty(r,s,{configurable:!0,enumerable:!0,get:function(){return n[s]}})})}}),Jp=!0,r}var Bu={};function sI(){}var aI=function(t){var o,r=t,n=sI;return CS&&typeof Proxy<"u"&&(o=new Set,r=new Proxy(t,{get:function(s,a){if(Jp){var c;(c=o)===null||c===void 0||c.add(a)}return s[a]}}),n=function(s,a){var c;Bu[s]={global:Array.from(o),component:No(No({},(c=Bu[s])===null||c===void 0?void 0:c.component),a)}}),{token:r,keys:o,flush:n}},Vu=aI;function lI(e,t,o){if(typeof o=="function"){var r;return o(Oe(t,(r=t[e])!==null&&r!==void 0?r:{}))}return o??{}}var eg=lI;function cI(e){return e==="js"?{max:Math.max,min:Math.min}:{max:function(){for(var o=arguments.length,r=new Array(o),n=0;n<o;n++)r[n]=arguments[n];return"max(".concat(r.map(function(i){return J(i)}).join(","),")")},min:function(){for(var o=arguments.length,r=new Array(o),n=0;n<o;n++)r[n]=arguments[n];return"min(".concat(r.map(function(i){return J(i)}).join(","),")")}}}var SS=cI;var RS=$(require("react")),uI=1e3*60*10,fI=(function(){function e(){Mr(this,e),Do(this,"map",new Map),Do(this,"objectIDMap",new WeakMap),Do(this,"nextID",0),Do(this,"lastAccessBeat",new Map),Do(this,"accessBeat",0)}return Or(e,[{key:"set",value:function(o,r){this.clear();var n=this.getCompositeKey(o);this.map.set(n,r),this.lastAccessBeat.set(n,Date.now())}},{key:"get",value:function(o){var r=this.getCompositeKey(o),n=this.map.get(r);return this.lastAccessBeat.set(r,Date.now()),this.accessBeat+=1,n}},{key:"getCompositeKey",value:function(o){var r=this,n=o.map(function(i){return i&&yo(i)==="object"?"obj_".concat(r.getObjectID(i)):"".concat(yo(i),"_").concat(i)});return n.join("|")}},{key:"getObjectID",value:function(o){if(this.objectIDMap.has(o))return this.objectIDMap.get(o);var r=this.nextID;return this.objectIDMap.set(o,r),this.nextID+=1,r}},{key:"clear",value:function(){var o=this;if(this.accessBeat>1e4){var r=Date.now();this.lastAccessBeat.forEach(function(n,i){r-n>uI&&(o.map.delete(i),o.lastAccessBeat.delete(i))}),this.accessBeat=0}}}]),e})(),vS=new fI;function dI(e,t){return RS.default.useMemo(function(){var o=vS.get(t);if(o)return o;var r=e();return vS.set(t,r),r},t)}var ES=dI;var mI=function(){return{}},wS=mI;function pI(e){var t=e.useCSP,o=t===void 0?wS:t,r=e.useToken,n=e.usePrefix,i=e.getResetStyles,s=e.getCommonStyle,a=e.getCompUnitless;function c(d,m,p,g){var y=Array.isArray(d)?d[0]:d;function x(w){return"".concat(String(y)).concat(w.slice(0,1).toUpperCase()).concat(w.slice(1))}var b=g?.unitless||{},h=typeof a=="function"?a(d):{},S=No(No({},h),{},Do({},x("zIndexPopup"),!0));Object.keys(b).forEach(function(w){S[x(w)]=b[w]});var C=No(No({},g),{},{unitless:S,prefixToken:x}),R=u(d,m,p,C),v=l(y,p,C);return function(w){var T=arguments.length>1&&arguments[1]!==void 0?arguments[1]:w,I=R(w,T),P=g?.extraCssVarPrefixCls,N=typeof P=="function"?P({prefixCls:w,rootCls:T}):P,O=v(N!=null&&N.length?[T].concat(Rt(N)):T);return[I,O]}}function l(d,m,p){var g=p.unitless,y=p.prefixToken,x=p.ignore;return function(b){var h=r(),S=h.cssVar,C=h.realToken,R=o();return _m({path:[d],prefix:S.prefix,key:S.key,unitless:g,ignore:x,token:C,scope:b,nonce:function(){return R.nonce}},function(){var v=eg(d,C,m),w=Zp(d,C,v,{deprecatedTokens:p?.deprecatedTokens});return v&&Object.keys(v).forEach(function(T){w[y(T)]=w[T],delete w[T]}),w}),S?.key}}function u(d,m,p){var g=arguments.length>3&&arguments[3]!==void 0?arguments[3]:{},y=Array.isArray(d)?d:[d,d],x=Ou(y,1),b=x[0],h=y.join("-"),S=e.layer||{name:"antd"};return function(C){var R=arguments.length>1&&arguments[1]!==void 0?arguments[1]:C,v=r(),w=v.theme,T=v.realToken,I=v.hashId,P=v.token,N=v.cssVar,O=v.zeroRuntime,_=(0,$S.useMemo)(function(){return O},[]);if(_)return I;var M=n(),A=M.rootPrefixCls,V=M.iconPrefixCls,F=o(),G="css",z=ES(function(){var L=new Set;return Object.keys(g.unitless||{}).forEach(function(U){L.add(Ps(U,N.prefix)),L.add(Ps(U,Qp(b,N.prefix)))}),zu(G,L)},[G,b,N?.prefix]),B=SS(G),k=B.max,W=B.min,j={theme:w,token:P,hashId:I,nonce:function(){return F.nonce},clientOnly:g.clientOnly,layer:S,order:g.order||-999};return typeof i=="function"&&oi(No(No({},j),{},{clientOnly:!1,path:["Shared",A]}),function(){return i(P,{prefix:{rootPrefixCls:A,iconPrefixCls:V},csp:F})}),oi(No(No({},j),{},{path:[h,C,V]}),function(){if(g.injectStyle===!1)return[];var L=Vu(P),U=L.token,X=L.flush,Y=eg(b,T,p),q=".".concat(C),D=Zp(b,T,Y,{deprecatedTokens:g.deprecatedTokens});Y&&yo(Y)==="object"&&Object.keys(Y).forEach(function(Z){Y[Z]="var(".concat(Ps(Z,Qp(b,N.prefix)),")")});var K=Oe(U,{componentCls:q,prefixCls:C,iconCls:".".concat(V),antCls:".".concat(A),calc:z,max:k,min:W},Y),H=m(K,{hashId:I,prefixCls:C,rootPrefixCls:A,iconPrefixCls:V});X(b,D);var Q=typeof s=="function"?s(K,C,R,g.resetFont):null;return[g.resetStyle===!1?null:Q,H]}),I}}function f(d,m,p){var g=arguments.length>3&&arguments[3]!==void 0?arguments[3]:{},y=u(d,m,p,No({resetStyle:!1,order:-998},g)),x=function(h){var S=h.prefixCls,C=h.rootCls,R=C===void 0?S:C;return y(S,R),null};return x}return{genStyleHooks:c,genSubStyleComponent:f,genComponentStyleHook:u}}var tg=pI;var rg=$(require("react"));var PS="6.6.5";var NS=PS;function og(e){return e>=0&&e<=255}function gI(e,t){let{r:o,g:r,b:n,a:i}=new Ze(e).toRgb();if(i<1)return e;let{r:s,g:a,b:c}=new Ze(t).toRgb();for(let l=.01;l<=1;l+=.01){let u=Math.round((o-s*(1-l))/l),f=Math.round((r-a*(1-l))/l),d=Math.round((n-c*(1-l))/l);if(og(u)&&og(f)&&og(d))return new Ze({r:u,g:f,b:d,a:Math.round(l*100)/100}).toRgbString()}return new Ze({r:o,g:r,b:n,a:1}).toRgbString()}var rs=gI;function fl(e){let{override:t,...o}=e,r={...t};Object.keys(Yr).forEach(y=>{delete r[y]});let n={...o,...r},i=new Ze(n.colorShadow),s=i.a,a=y=>i.clone().setA(s*y).toRgbString(),c=480,l=576,u=768,f=992,d=1200,m=1600,p=1920;return n.motion===!1&&(n.motionDurationFast="0s",n.motionDurationMid="0s",n.motionDurationSlow="0s"),{...n,colorFillContent:n.colorFillSecondary,colorFillContentHover:n.colorFill,colorFillAlter:n.colorFillQuaternary,colorBgContainerDisabled:n.colorFillTertiary,colorBorderBg:n.colorBgContainer,colorSplit:rs(n.colorBorderSecondary,n.colorBgContainer),colorTextPlaceholder:n.colorTextQuaternary,colorTextDisabled:n.colorTextQuaternary,colorTextHeading:n.colorText,colorTextLabel:n.colorTextSecondary,colorTextDescription:n.colorTextTertiary,colorTextLightSolid:n.colorWhite,colorHighlight:n.colorError,colorBgTextHover:n.colorFillSecondary,colorBgTextActive:n.colorFill,colorIcon:n.colorTextTertiary,colorIconHover:n.colorText,colorErrorOutline:rs(n.colorErrorBg,n.colorBgContainer),colorWarningOutline:rs(n.colorWarningBg,n.colorBgContainer),colorErrorAffix:n.colorError,colorWarningAffix:n.colorWarning,fontHeight:Math.round(n.fontSize*n.lineHeight),fontHeightSM:Math.round(n.fontSizeSM*n.lineHeightSM),fontHeightLG:Math.round(n.fontSizeLG*n.lineHeightLG),fontSizeIcon:n.fontSizeSM,lineWidthFocus:n.focusOutline===!1?0:n.lineWidth*3,lineWidth:n.lineWidth,controlOutlineWidth:n.lineWidth*2,controlInteractiveSize:n.controlHeight/2,controlItemBgHover:n.colorFillTertiary,controlItemBgActive:n.colorPrimaryBg,controlItemBgActiveHover:n.colorPrimaryBgHover,controlItemBgActiveDisabled:n.colorFill,controlTmpOutline:n.colorFillQuaternary,controlOutline:rs(n.colorPrimaryBg,n.colorBgContainer),lineType:n.lineType,borderRadius:n.borderRadius,borderRadiusXS:n.borderRadiusXS,borderRadiusSM:n.borderRadiusSM,borderRadiusLG:n.borderRadiusLG,fontWeightStrong:600,opacityLoading:.65,linkDecoration:"none",linkHoverDecoration:"none",linkFocusDecoration:"none",controlPaddingHorizontal:12,controlPaddingHorizontalSM:8,paddingXXS:n.sizeXXS,paddingXS:n.sizeXS,paddingSM:n.sizeSM,padding:n.size,paddingMD:n.sizeMD,paddingLG:n.sizeLG,paddingXL:n.sizeXL,paddingContentHorizontalLG:n.sizeLG,paddingContentVerticalLG:n.sizeMS,paddingContentHorizontal:n.sizeMS,paddingContentVertical:n.sizeSM,paddingContentHorizontalSM:n.size,paddingContentVerticalSM:n.sizeXS,marginXXS:n.sizeXXS,marginXS:n.sizeXS,marginSM:n.sizeSM,margin:n.size,marginMD:n.sizeMD,marginLG:n.sizeLG,marginXL:n.sizeXL,marginXXL:n.sizeXXL,boxShadow:`
      0 6px 16px 0 ${a(.08)},
      0 3px 6px -4px ${a(.12)},
      0 9px 28px 8px ${a(.05)}
    `,boxShadowSecondary:`
      0 6px 16px 0 ${a(.08)},
      0 3px 6px -4px ${a(.12)},
      0 9px 28px 8px ${a(.05)}
    `,boxShadowTertiary:`
      0 1px 2px 0 ${a(.05)},
      0 1px 6px -1px ${a(.03)},
      0 2px 4px 0 ${a(.03)}
    `,screenXS:c,screenXSMin:c,screenXSMax:l-1,screenSM:l,screenSMMin:l,screenSMMax:u-1,screenMD:u,screenMDMin:u,screenMDMax:f-1,screenLG:f,screenLGMin:f,screenLGMax:d-1,screenXL:d,screenXLMin:d,screenXLMax:m-1,screenXXL:m,screenXXLMin:m,screenXXLMax:p-1,screenXXXL:p,screenXXXLMin:p,boxShadowPopoverArrow:`2px 2px 5px ${a(.05)}`,dropShadowPopover:`drop-shadow(0 6px 16px ${a(.08)}) drop-shadow(0 3px 6px ${a(.12)}) drop-shadow(0 9px 28px ${a(.05)})`,boxShadowCard:`
      0 1px 2px -2px ${a(.16)},
      0 3px 6px 0 ${a(.12)},
      0 5px 12px 4px ${a(.09)}
    `,boxShadowDrawerRight:`
      -6px 0 16px 0 ${a(.08)},
      -3px 0 6px -4px ${a(.12)},
      -9px 0 28px 8px ${a(.05)}
    `,boxShadowDrawerLeft:`
      6px 0 16px 0 ${a(.08)},
      3px 0 6px -4px ${a(.12)},
      9px 0 28px 8px ${a(.05)}
    `,boxShadowDrawerUp:`
      0 6px 16px 0 ${a(.08)},
      0 3px 6px -4px ${a(.12)},
      0 9px 28px 8px ${a(.05)}
    `,boxShadowDrawerDown:`
      0 -6px 16px 0 ${a(.08)},
      0 -3px 6px -4px ${a(.12)},
      0 -9px 28px 8px ${a(.05)}
    `,boxShadowTabsOverflowLeft:`inset 10px 0 8px -8px ${a(.08)}`,boxShadowTabsOverflowRight:`inset -10px 0 8px -8px ${a(.08)}`,boxShadowTabsOverflowTop:`inset 0 10px 8px -8px ${a(.08)}`,boxShadowTabsOverflowBottom:`inset 0 -10px 8px -8px ${a(.08)}`,...r}}var ng={lineHeight:!0,lineHeightSM:!0,lineHeightLG:!0,lineHeightHeading1:!0,lineHeightHeading2:!0,lineHeightHeading3:!0,lineHeightHeading4:!0,lineHeightHeading5:!0,opacityLoading:!0,fontWeightStrong:!0,zIndexPopupBase:!0,zIndexBase:!0,opacityImage:!0},hI={motionBase:!0,motionUnit:!0},xI={screenXS:!0,screenXSMin:!0,screenXSMax:!0,screenSM:!0,screenSMMin:!0,screenSMMax:!0,screenMD:!0,screenMDMin:!0,screenMDMax:!0,screenLG:!0,screenLGMin:!0,screenLGMax:!0,screenXL:!0,screenXLMin:!0,screenXLMax:!0,screenXXL:!0,screenXXLMin:!0,screenXXLMax:!0,screenXXXL:!0,screenXXXLMin:!0},IS=(e,t,o)=>{let r=o.getDerivativeToken(e),{override:n,...i}=t,s={...r,override:n};return s=fl(s),i&&Object.entries(i).forEach(([a,c])=>{let{theme:l,...u}=c,f=u;l&&(f=IS({...s,...u},{override:u},l)),s[a]=f}),s};function Tt(){let{token:e,hashed:t,theme:o,override:r,cssVar:n,zeroRuntime:i}=rg.default.useContext(Ki),{csp:s,getPrefixCls:a}=rg.default.useContext(Se),c={prefix:n?.prefix??a(),key:n?.key??"css-var-root"},l=`${NS}-${t||""}`,u=o||Xi,[f,d,m]=hc(u,[Yr,e],{salt:l,override:r,getComputedToken:IS,cssVar:{...c,unitless:ng,ignore:hI,preserve:xI},nonce:s?.nonce});return[u,m,t?d:"",f,c,!!i]}var ig=require("react");var Zr={overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"},ft=(e,t=!1)=>({boxSizing:"border-box",margin:0,padding:0,color:e.colorText,fontSize:e.fontSize,lineHeight:e.lineHeight,listStyle:"none",fontFamily:t?"inherit":e.fontFamily}),dl=()=>({display:"inline-flex",alignItems:"center",color:"inherit",fontStyle:"normal",lineHeight:0,textAlign:"center",textTransform:"none",verticalAlign:"-0.125em",textRendering:"optimizeLegibility","-webkit-font-smoothing":"antialiased","-moz-osx-font-smoothing":"grayscale","> *":{lineHeight:1},svg:{display:"inline-block",verticalAlign:"inherit"}}),bI=new Ue("loadingCircle",{"100%":{transform:"rotate(360deg)"}}),Hu=()=>({"&::before":{display:"table",content:'""'},"&::after":{display:"table",clear:"both",content:'""'}}),Dn=(e,t)=>({outline:`${J(e.lineWidthFocus)} solid ${e.colorPrimaryBorder}`,outlineOffset:t??1,transition:["outline-offset","outline"].map(o=>`${o} 0s`).join(", ")}),Jr=(e,t)=>({"&:focus-visible":Dn(e,t)}),TS=e=>({a:{color:e.colorLink,textDecoration:e.linkDecoration,backgroundColor:"transparent",outline:"none",cursor:"pointer",transition:`color ${e.motionDurationSlow}`,"-webkit-text-decoration-skip":"objects","&:hover":{color:e.colorLinkHover},"&:active":{color:e.colorLinkActive},"&:active, &:hover":{textDecoration:e.linkHoverDecoration,outline:0},"&:focus":{textDecoration:e.linkFocusDecoration,outline:0},...Jr(e),"&[disabled]":{color:e.colorTextDisabled,cursor:"not-allowed"}}}),MS=(e,t,o,r)=>{let n=`[class^="${t}"], [class*=" ${t}"]`,i=o?`.${o}`:n,s={boxSizing:"border-box","&::before, &::after":{boxSizing:"border-box"}},a={};return r!==!1&&(a={fontFamily:e.fontFamily,fontSize:e.fontSize}),{[i]:{...a,...s,[n]:s}}},ku=e=>({[`.${e}`]:{...dl(),"&::before":{display:"none"},"&[tabindex]":{cursor:"pointer"}},[`.${e} .${e}-icon`]:{display:"block"},[`.${e}-spin`]:{animationName:bI,animationDuration:"1s",animationIterationCount:"infinite",animationTimingFunction:"linear"}});var{genStyleHooks:Be,genComponentStyleHook:sg,genSubStyleComponent:Fn}=tg({usePrefix:()=>{let{getPrefixCls:e,iconPrefixCls:t}=(0,ig.useContext)(Se);return{rootPrefixCls:e(),iconPrefixCls:t}},useToken:()=>{let[e,t,o,r,n,i]=Tt();return{theme:e,realToken:t,hashId:o,token:r,cssVar:n,zeroRuntime:i}},useCSP:()=>{let{csp:e}=(0,ig.useContext)(Se);return e??{}},getResetStyles:(e,t)=>{let o=TS(e);return[o,{"&":o},ku(t?.prefix.iconPrefixCls??Ys)]},getCommonStyle:MS,getCompUnitless:()=>ng}),Mt=(e,t)=>{let o=`--${e.replace(/\./g,"")}-${t}-`;return[i=>`${o}${i}`,(i,s)=>s?`var(${o}${i}, ${s})`:`var(${o}${i})`]};function ea(e,t){return Po.reduce((o,r)=>{let n=e[`${r}1`],i=e[`${r}3`],s=e[`${r}6`],a=e[`${r}7`];return{...o,...t(r,{lightColor:n,lightBorderColor:i,darkColor:s,textColor:a})}},{})}var yI=(e,t)=>{let[o,r]=Tt();return oi({theme:o,token:r,hashId:"",path:["ant-design-icons",e],nonce:()=>t?.nonce,layer:{name:"antd"}},()=>ku(e))},Wu=yI;function ag(e,t,o){let r=Gc("ConfigProvider"),n=e||{},i=n.inherit===!1||!t?{...si,hashed:t?.hashed??si.hashed,cssVar:t?.cssVar,zeroRuntime:t?.zeroRuntime}:t,s=(0,OS.useId)();return Ur(()=>{if(!e)return t;let a={...i.components};Object.keys(e.components||{}).forEach(u=>{a[u]={...a[u],...e.components[u]}});let c=`css-var-${s.replace(/:/g,"")}`,l={prefix:o?.prefixCls,...i.cssVar,...n.cssVar,key:n.cssVar?.key||c};return{...i,...n,token:{...i.token,...n.token},components:a,cssVar:l}},[n,i,o?.prefixCls,s],(a,c)=>a.some((l,u)=>{let f=c[u];return!Di(l,f,!0)}))}var zn=$(require("react"));var AS=zn.createContext(!0);function lg(e){let t=zn.useContext(AS),{children:o}=e,[,r]=Tt(),{motion:n}=r,i=zn.useRef(!1);return i.current||(i.current=t!==n),i.current?zn.createElement(AS.Provider,{value:n},zn.createElement(Sp,{motion:n},o)):o}var CI=$(require("react"));var _S=()=>null;var SI=({iconPrefixCls:e,csp:t})=>(Wu(e,t),null);var vI=["getTargetContainer","getPopupContainer","renderEmpty","input","pagination","form","select","button"],ju,LS,DS,FS;function cg(){return ju||Ks}function RI(){return LS||Ys}var EI=e=>{let{prefixCls:t,iconPrefixCls:o,theme:r,holderRender:n}=e;t!==void 0&&(ju=t),o!==void 0&&(LS=o),"holderRender"in e&&(FS=n),r&&(DS=r)},zS=()=>({getPrefixCls:(e,t)=>t||(e?`${cg()}-${e}`:cg()),getIconPrefixCls:RI,getRootPrefixCls:()=>ju||cg(),getTheme:()=>DS,holderRender:FS}),wI=e=>{let{children:t,csp:o,autoInsertSpaceInButton:r,alert:n,affix:i,anchor:s,app:a,form:c,locale:l,componentSize:u,direction:f,space:d,splitter:m,virtual:p,dropdownMatchSelectWidth:g,popupMatchSelectWidth:y,popupOverflow:x,legacyLocale:b,parentContext:h,iconPrefixCls:S,theme:C,componentDisabled:R,segmented:v,statistic:w,spin:T,calendar:I,carousel:P,cascader:N,collapse:O,typography:_,checkbox:M,descriptions:A,divider:V,drawer:F,skeleton:G,steps:z,image:B,layout:k,list:W,listy:j,mentions:L,modal:U,progress:X,result:Y,slider:q,breadcrumb:D,masonry:K,menu:H,pagination:Q,input:Z,inputPassword:te,inputSearch:se,textArea:re,otp:oe,empty:ae,badge:ie,borderBeam:be,radio:ee,rate:xe,ribbon:fe,switch:_e,transfer:Ve,avatar:ue,message:He,tag:Ke,table:Pe,card:de,cardMeta:le,tabs:Re,timeline:pe,timePicker:ve,upload:Fe,notification:Ye,tree:Je,colorPicker:st,datePicker:Xe,rangePicker:wt,flex:$t,wave:lt,dropdown:Ct,warning:Pt,tour:Nt,tooltip:Me,popover:zt,popconfirm:ce,qrcode:ge,floatButton:Le,floatButtonGroup:ne,variant:Ce,inputNumber:he,treeSelect:$e,watermark:Qe}=e,Bt=ht.useMemo(()=>ze(l)&&Object.prototype.hasOwnProperty.call(l,"default")&&l.default?.locale?l.default:l,[l]),At=ht.useCallback((ct,Vt)=>{let{prefixCls:ho}=e;if(Vt)return Vt;let ko=ho||h.getPrefixCls("");return ct?`${ko}-${ct}`:ko},[h.getPrefixCls,e.prefixCls]),pt=S||h.iconPrefixCls||Ys,qt=o||h.csp,Qt=ag(C,h.theme,{prefixCls:At("")}),vr={csp:qt,autoInsertSpaceInButton:r,alert:n,affix:i,anchor:s,app:a,locale:Bt||b,direction:f,space:d,splitter:m,virtual:p,popupMatchSelectWidth:y??g,popupOverflow:x,getPrefixCls:At,iconPrefixCls:pt,theme:Qt,segmented:v,statistic:w,spin:T,calendar:I,carousel:P,cascader:N,collapse:O,typography:_,checkbox:M,descriptions:A,divider:V,drawer:F,skeleton:G,steps:z,image:B,input:Z,inputPassword:te,inputSearch:se,textArea:re,otp:oe,layout:k,list:W,listy:j,mentions:L,modal:U,progress:X,result:Y,slider:q,breadcrumb:D,masonry:K,menu:H,pagination:Q,empty:ae,badge:ie,borderBeam:be,radio:ee,rate:xe,ribbon:fe,switch:_e,transfer:Ve,avatar:ue,message:He,tag:Ke,table:Pe,card:de,cardMeta:le,tabs:Re,timeline:pe,timePicker:ve,upload:Fe,notification:Ye,tree:Je,colorPicker:st,datePicker:Xe,rangePicker:wt,flex:$t,wave:lt,dropdown:Ct,warning:Pt,tour:Nt,tooltip:Me,popover:zt,popconfirm:ce,qrcode:ge,floatButton:Le,floatButtonGroup:ne,variant:Ce,inputNumber:he,treeSelect:$e,watermark:Qe},io={...h};Object.keys(vr).forEach(ct=>{vr[ct]!==void 0&&(io[ct]=vr[ct])}),vI.forEach(ct=>{let Vt=e[ct];Vt&&(io[ct]=Vt)}),typeof r<"u"&&(io.button={autoInsertSpace:r,...io.button});let so=Ur(()=>io,io,(ct,Vt)=>{let ho=Object.keys(ct),ko=Object.keys(Vt);return ho.length!==ko.length||ho.some(Wr=>ct[Wr]!==Vt[Wr])}),{layer:go}=ht.useContext(qr),we=ht.useMemo(()=>({prefixCls:pt,csp:qt,layer:go?"antd":void 0,zeroRuntime:!!go||Qt?.zeroRuntime}),[pt,qt,go,Qt?.zeroRuntime]),ke=ht.createElement(ht.Fragment,null,ht.createElement(SI,{iconPrefixCls:pt,csp:qt}),ht.createElement(_S,{dropdownMatchSelectWidth:g}),t),_t=ht.useMemo(()=>dn(lr.Form?.defaultValidateMessages||{},so.locale?.Form?.defaultValidateMessages||{},so.form?.validateMessages||{},c?.validateMessages||{}),[so,c?.validateMessages]);Object.keys(_t).length>0&&(ke=ht.createElement(Ay.Provider,{value:_t},ke)),Bt&&(ke=ht.createElement(ky,{locale:Bt,_ANT_MARK__:Hy},ke)),(pt||qt)&&(ke=ht.createElement(_s.Provider,{value:we},ke)),u&&(ke=ht.createElement(sS,{size:u},ke)),ke=ht.createElement(lg,null,ke),Me?.unique&&(ke=ht.createElement(Iu,null,ke));let vo=ht.useMemo(()=>{let{algorithm:ct,token:Vt,components:ho,cssVar:ko,...Wr}=Qt||{},an=ct&&(!Array.isArray(ct)||ct.length>0)?un(ct):Xi,Jn={};Object.entries(ho||{}).forEach(([Nn,_a])=>{let Ne={..._a};"algorithm"in Ne&&(Ne.algorithm===!0?Ne.theme=an:(Array.isArray(Ne.algorithm)||ot(Ne.algorithm))&&(Ne.theme=un(Ne.algorithm)),delete Ne.algorithm),Jn[Nn]=Ne});let ln={...Yr,...Vt};return{...Wr,theme:an,token:ln,components:Jn,override:{override:ln,...Jn},cssVar:ko}},[Qt]);return C&&(ke=ht.createElement(Ki.Provider,{value:vo},ke)),so.warning&&(ke=ht.createElement(My.Provider,{value:so.warning},ke)),R!==void 0&&(ke=ht.createElement(Tu,{disabled:R},ke)),ht.createElement(Se.Provider,{value:so},ke)},ta=e=>{let t=ht.useContext(Se),o=ht.useContext(Hs);return ht.createElement(wI,{parentContext:t,legacyLocale:o,...e})};ta.ConfigContext=Se;ta.SizeContext=os;ta.config=EI;ta.useConfig=aS;Object.defineProperty(ta,"SizeContext",{get:()=>os});var di=ta;var $I=e=>{let t=e?.algorithm?un(e.algorithm):Xi,o={...Yr,...e?.token};return gc(o,{override:e?.token},t,fl)},BS=$I;function ug(e){let{sizeUnit:t,sizeStep:o}=e,r=o-2;return{sizeXXL:t*(r+10),sizeXL:t*(r+6),sizeLG:t*(r+2),sizeMD:t*(r+2),sizeMS:t*(r+1),size:t*r,sizeSM:t*r,sizeXS:t*(r-1),sizeXXS:t*(r-1)}}var PI=(e,t)=>{let o=t??An(e),r=o.fontSizeSM,n=o.controlHeight-4;return{...o,...ug(t??e),...ou(r),controlHeight:n,...tu({...o,controlHeight:n})}},VS=PI;var ur=(e,t)=>new Ze(e).setA(t).toRgbString(),mi=(e,t)=>new Ze(e).lighten(t).toHexString();var fg=e=>{let t=mn(e,{theme:"dark"});return{1:t[0],2:t[1],3:t[2],4:t[3],5:t[6],6:t[5],7:t[4],8:t[6],9:t[5],10:t[4]}},HS=(e,t,o)=>{let r=e||"#000",n=t||"#fff";return{colorBgBase:r,colorTextBase:n,colorShadow:o||"rgba(255, 255, 255, 0.2)",colorText:ur(n,.85),colorTextSecondary:ur(n,.65),colorTextTertiary:ur(n,.45),colorTextQuaternary:ur(n,.25),colorFill:ur(n,.18),colorFillSecondary:ur(n,.12),colorFillTertiary:ur(n,.08),colorFillQuaternary:ur(n,.04),colorBgSolid:ur(n,.95),colorBgSolidHover:ur(n,1),colorBgSolidActive:ur(n,.9),colorBgElevated:mi(r,12),colorBgContainer:mi(r,8),colorBgLayout:mi(r,0),colorBgSpotlight:mi(r,26),colorBgBlur:ur(n,.04),colorBorder:mi(r,26),colorBorderDisabled:mi(r,26),colorBorderSecondary:mi(r,19)}};var NI=(e,t)=>{let o=Object.keys(Ga).map(s=>{let a=mn(e[s],{theme:"dark"});return Array.from({length:10},()=>1).reduce((c,l,u)=>(c[`${s}-${u+1}`]=a[u],c[`${s}${u+1}`]=a[u],c),{})}).reduce((s,a)=>(s={...s,...a},s),{}),r=t??An(e),n=Ka(e,{generateColorPalettes:fg,generateNeutralColorPalettes:HS}),i=Po.reduce((s,a)=>{let c=e[a];if(c){let l=fg(c);s[`${a}Hover`]=l[7],s[`${a}Active`]=l[5]}return s},{});return{...r,...o,...n,...i,colorPrimaryBg:n.colorPrimaryBorder,colorPrimaryBgHover:n.colorPrimaryBorderHover}},kS=NI;function II(){let[e,t,o,r]=Tt();return{theme:e,token:t,hashId:o,cssVar:r}}var TI={defaultSeed:si.token,useToken:II,defaultAlgorithm:An,darkAlgorithm:kS,compactAlgorithm:VS,getDesignToken:BS,defaultConfig:si,_internalContext:Ki},WS=TI;var xa=$(require("react"));var Et=$(require("react"));var Gu=$(require("react"));var MI={icon:{tag:"svg",attrs:{viewBox:"64 64 896 896",focusable:"false"},children:[{tag:"path",attrs:{d:"M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm193.5 301.7l-210.6 292a31.8 31.8 0 01-51.7 0L318.5 484.9c-3.8-5.3 0-12.7 6.5-12.7h46.9c10.2 0 19.9 4.9 25.9 13.3l71.2 98.8 157.2-218c6-8.3 15.6-13.3 25.9-13.3H699c6.5 0 10.3 7.4 6.5 12.7z"}}]},name:"check-circle",theme:"filled"},jS=MI;var is=$(require("react"));var ov=$(require("react"));var ns=$(require("react"));var US="data-rc-order",qS="data-rc-priority",OI="rc-util-key",dg=new Map;function XS(){return!!(typeof window<"u"&&window.document&&window.document.createElement)}function AI(e,t){if(!e||!t)return!1;if(e.contains)return e.contains(t);let o=t;for(;o;){if(o===e)return!0;o=o.parentNode}return!1}function KS({mark:e}={}){return e?e.startsWith("data-")?e:`data-${e}`:OI}function mg(e){return e.attachTo?e.attachTo:document.querySelector("head")||document.body}function _I(e){return e==="queue"?"prependQueue":e?"prepend":"append"}function pg(e){return Array.from((dg.get(e)||e).children).filter(t=>t.tagName==="STYLE")}function YS(e,t={}){if(!XS())return null;let{csp:o,prepend:r,priority:n=0}=t,i=_I(r),s=i==="prependQueue",a=document.createElement("style");a.setAttribute(US,i),s&&n&&a.setAttribute(qS,`${n}`),o?.nonce&&(a.nonce=o.nonce),a.innerHTML=e;let c=mg(t),{firstChild:l}=c;if(r){if(s){let u=(t.styles||pg(c)).filter(f=>{if(!["prepend","prependQueue"].includes(f.getAttribute(US)))return!1;let d=Number(f.getAttribute(qS)||0);return n>=d});if(u.length)return c.insertBefore(a,u[u.length-1].nextSibling),a}c.insertBefore(a,l)}else c.appendChild(a);return a}function LI(e,t={}){let{styles:o}=t;return o||=pg(mg(t)),o.find(r=>r.getAttribute(KS(t))===e)}function DI(e,t){let o=dg.get(e);if(!o||!AI(document,o)){let r=YS("",t);if(!r)return;let{parentNode:n}=r;dg.set(e,n),e.removeChild(r)}}function QS(e,t,o={}){if(!XS())return null;let r=mg(o),n=pg(r),i={...o,styles:n};DI(r,i);let s=LI(t,i);if(s)return i.csp?.nonce&&s.nonce!==i.csp.nonce&&(s.nonce=i.csp.nonce),s.innerHTML!==e&&(s.innerHTML=e),s;let a=YS(e,i);return a?.setAttribute(KS(i),t),a}function FI(e){return e?.getRootNode?.()}function ZS(e){let t=FI(e);return typeof ShadowRoot<"u"&&t instanceof ShadowRoot?t:null}var GS={};function JS(e,t){e||GS[t]||(GS[t]=!0)}function zI(e){return e.replace(/-(.)/g,(t,o)=>o.toUpperCase())}function qu(e,t){JS(e,`[@ant-design/icons] ${t}`)}function oa(e){return e!==null&&typeof e=="object"&&typeof e.name=="string"&&typeof e.theme=="string"&&(typeof e.icon=="object"||typeof e.icon=="function")}function ev(e={}){return Object.keys(e).reduce((t,o)=>{let r=e[o];switch(o){case"class":t.className=r,delete t.class;break;default:delete t[o],t[zI(o)]=r}return t},{})}function Uu(e,t,o){return o?ns.default.createElement(e.tag,{key:t,...ev(e.attrs),...o},(e.children||[]).map((r,n)=>Uu(r,`${t}-${e.tag}-${n}`))):ns.default.createElement(e.tag,{key:t,...ev(e.attrs)},(e.children||[]).map((r,n)=>Uu(r,`${t}-${e.tag}-${n}`)))}var BI=`
.anticon {
  display: inline-flex;
  align-items: center;
  color: inherit;
  font-style: normal;
  line-height: 0;
  text-align: center;
  text-transform: none;
  vertical-align: -0.125em;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.anticon > * {
  line-height: 1;
}

.anticon svg {
  display: inline-block;
  vertical-align: inherit;
}

.anticon::before {
  display: none;
}

.anticon .anticon-icon {
  display: block;
}

.anticon[tabindex] {
  cursor: pointer;
}

.anticon-spin {
  -webkit-animation: loadingCircle 1s infinite linear;
  animation: loadingCircle 1s infinite linear;
}

@-webkit-keyframes loadingCircle {
  100% {
    -webkit-transform: rotate(360deg);
    transform: rotate(360deg);
  }
}

@keyframes loadingCircle {
  100% {
    -webkit-transform: rotate(360deg);
    transform: rotate(360deg);
  }
}
`,tv=e=>{let{csp:t,prefixCls:o,layer:r,zeroRuntime:n}=(0,ns.useContext)(_s),i=BI;o&&(i=i.replace(/anticon/g,o)),r&&(i=`@layer ${r} {
${i}
}`),(0,ns.useEffect)(()=>{if(n)return;let s=e.current,a=ZS(s);QS(i,"@ant-design-icons",{prepend:!r,csp:t,attachTo:a})},[])};var rv=e=>{let{icon:t,className:o,onClick:r,style:n,primaryColor:i,secondaryColor:s,...a}=e,c=ov.useRef(null);if(tv(c),qu(oa(t),`icon should be icon definiton, but got ${typeof t}`),!oa(t))return null;let l=t;return Uu(l.icon,`svg-${l.name}`,{className:o,onClick:r,style:n,"data-icon":l.name,width:"1em",height:"1em",fill:"currentColor","aria-hidden":"true",...a,ref:c})};rv.displayName="IconReact";var nv=rv;function gg(){return gg=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},gg.apply(this,arguments)}var VI=is.forwardRef((e,t)=>{let{className:o,icon:r,spin:n,rotate:i,tabIndex:s,onClick:a,twoToneColor:c,...l}=e,{prefixCls:u="anticon",rootClassName:f}=is.useContext(_s);if(qu(oa(r),`icon should be icon definiton, but got ${typeof r}`),!oa(r))return null;let d=E(f,u,{[`${u}-${r.name}`]:!!r.name,[`${u}-spin`]:!!n||r.name==="loading"},o),m=s;m===void 0&&a&&(m=-1);let p=i?{msTransform:`rotate(${i}deg)`,transform:`rotate(${i}deg)`}:void 0;return is.createElement("span",gg({role:"img","aria-label":r.name},l,{ref:t,tabIndex:m,onClick:a,className:d}),is.createElement(nv,{icon:r,style:p}))}),Kt=VI;function hg(){return hg=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},hg.apply(this,arguments)}var HI=(e,t)=>Gu.createElement(Kt,hg({},e,{ref:t,icon:jS})),kI=Gu.forwardRef(HI),ra=kI;var Xu=$(require("react"));var WI={icon:{tag:"svg",attrs:{"fill-rule":"evenodd",viewBox:"64 64 896 896",focusable:"false"},children:[{tag:"path",attrs:{d:"M512 64c247.4 0 448 200.6 448 448S759.4 960 512 960 64 759.4 64 512 264.6 64 512 64zm127.98 274.82h-.04l-.08.06L512 466.75 384.14 338.88c-.04-.05-.06-.06-.08-.06a.12.12 0 00-.07 0c-.03 0-.05.01-.09.05l-45.02 45.02a.2.2 0 00-.05.09.12.12 0 000 .07v.02a.27.27 0 00.06.06L466.75 512 338.88 639.86c-.05.04-.06.06-.06.08a.12.12 0 000 .07c0 .03.01.05.05.09l45.02 45.02a.2.2 0 00.09.05.12.12 0 00.07 0c.02 0 .04-.01.08-.05L512 557.25l127.86 127.87c.04.04.06.05.08.05a.12.12 0 00.07 0c.03 0 .05-.01.09-.05l45.02-45.02a.2.2 0 00.05-.09.12.12 0 000-.07v-.02a.27.27 0 00-.05-.06L557.25 512l127.87-127.86c.04-.04.05-.06.05-.08a.12.12 0 000-.07c0-.03-.01-.05-.05-.09l-45.02-45.02a.2.2 0 00-.09-.05.12.12 0 00-.07 0z"}}]},name:"close-circle",theme:"filled"},iv=WI;function xg(){return xg=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},xg.apply(this,arguments)}var jI=(e,t)=>Xu.createElement(Kt,xg({},e,{ref:t,icon:iv})),UI=Xu.forwardRef(jI),gn=UI;var Ku=$(require("react"));var qI={icon:{tag:"svg",attrs:{viewBox:"64 64 896 896",focusable:"false"},children:[{tag:"path",attrs:{d:"M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm-32 232c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v272c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V296zm32 440a48.01 48.01 0 010-96 48.01 48.01 0 010 96z"}}]},name:"exclamation-circle",theme:"filled"},sv=qI;function bg(){return bg=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},bg.apply(this,arguments)}var GI=(e,t)=>Ku.createElement(Kt,bg({},e,{ref:t,icon:sv})),XI=Ku.forwardRef(GI),Yu=XI;var Qu=$(require("react"));var KI={icon:{tag:"svg",attrs:{viewBox:"64 64 896 896",focusable:"false"},children:[{tag:"path",attrs:{d:"M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm32 664c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V456c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v272zm-32-344a48.01 48.01 0 010-96 48.01 48.01 0 010 96z"}}]},name:"info-circle",theme:"filled"},av=KI;function yg(){return yg=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},yg.apply(this,arguments)}var YI=(e,t)=>Qu.createElement(Kt,yg({},e,{ref:t,icon:av})),QI=Qu.forwardRef(YI),Zu=QI;function Lt(...e){return e.find(t=>t!==void 0)}var Ju=$(require("react"));var ef=e=>{let{allowClear:t,clearIcon:o,contextAllowClear:r,contextClearIcon:n,defaultAllowClear:i,componentName:s}=e;return(0,Ju.useMemo)(()=>t??r??i?{clearIcon:Lt(ze(t)?t?.clearIcon:o,ze(r)?r?.clearIcon:n,Ju.default.createElement(gn,null)),disabled:(ze(t)?t?.disabled:void 0)??(ze(r)?r?.disabled:void 0)}:!1,[t,o,r,n,i])};var ss=$(require("react"));var tf=$(require("react"));var ZI={icon:{tag:"svg",attrs:{"fill-rule":"evenodd",viewBox:"64 64 896 896",focusable:"false"},children:[{tag:"path",attrs:{d:"M799.86 166.31c.02 0 .04.02.08.06l57.69 57.7c.04.03.05.05.06.08a.12.12 0 010 .06c0 .03-.02.05-.06.09L569.93 512l287.7 287.7c.04.04.05.06.06.09a.12.12 0 010 .07c0 .02-.02.04-.06.08l-57.7 57.69c-.03.04-.05.05-.07.06a.12.12 0 01-.07 0c-.03 0-.05-.02-.09-.06L512 569.93l-287.7 287.7c-.04.04-.06.05-.09.06a.12.12 0 01-.07 0c-.02 0-.04-.02-.08-.06l-57.69-57.7c-.04-.03-.05-.05-.06-.07a.12.12 0 010-.07c0-.03.02-.05.06-.09L454.07 512l-287.7-287.7c-.04-.04-.05-.06-.06-.09a.12.12 0 010-.07c0-.02.02-.04.06-.08l57.7-57.69c.03-.04.05-.05.07-.06a.12.12 0 01.07 0c.03 0 .05.02.09.06L512 454.07l287.7-287.7c.04-.04.06-.05.09-.06a.12.12 0 01.07 0z"}}]},name:"close",theme:"outlined"},lv=ZI;function Cg(){return Cg=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Cg.apply(this,arguments)}var JI=(e,t)=>tf.createElement(Kt,Cg({},e,{ref:t,icon:lv})),eT=tf.forwardRef(JI),fr=eT;var na=e=>{if(!e)return;let{closable:t,closeIcon:o}=e;return{closable:t,closeIcon:o}},uv={},cv=(e,t)=>{if(!e&&(e===!1||t===!1||t===null))return!1;if(!lo(e)&&!lo(t))return null;let o={closeIcon:typeof t!="boolean"&&lo(t)?t:void 0};return ze(e)&&(o={...o,...e}),o},tT=(e,t,o)=>e===!1?!1:e?Wc(o,t,e):t===!1?!1:t?Wc(o,t):o.closable?o:!1,oT=(e,t,o)=>{let{closeIconRender:r}=t,{closeIcon:n,...i}=e,s=n,a=Ht(i,!0);return lo(s)&&(r&&(s=r(s)),s=ss.default.isValidElement(s)?ss.default.cloneElement(s,{"aria-label":o,...s.props,...a}):ss.default.createElement("span",{"aria-label":o,...a},s)),[s,{"aria-label":o,...a}]},rT=(e,t,o=uv,r="Close")=>{let n=cv(e?.closable,e?.closeIcon),i=cv(t?.closable,t?.closeIcon),s={closeIcon:ss.default.createElement(fr,null),...o},a=tT(n,i,s),c=typeof a!="boolean"?!!a?.disabled:!1;if(a===!1)return[!1,null,c,{}];let[l,u]=oT(a,s,r);return[!0,l,c,u]},of=(e,t,o=uv)=>{let[r]=$o("global",lr.global);return ss.default.useMemo(()=>rT(e,t,{closeIcon:ss.default.createElement(fr,null),...o},r.close),[e,t,o,r.close])};var fv=require("react");var rf=(e,t)=>{let o={};return ze(e)&&(o={...e}),typeof e=="boolean"&&(o={enabled:e}),o.closable===void 0&&t!==void 0&&(o.closable=t),o},dv=(e,t,o,r)=>(0,fv.useMemo)(()=>{let n=rf(e,r),i=rf(t),s={blur:!1,...i,...n,closable:n.closable??r??i.closable??!0},a=s.blur?`${o}-mask-blur`:void 0;return[s.enabled!==!1,{mask:a},!!s.closable]},[e,t,o,r]);var pv=require("react"),mv=e=>e==="horizontal"||e==="vertical",ia=(e,t,o)=>(0,pv.useMemo)(()=>{let r=mv(e),n;return r?n=e:typeof t=="boolean"?n=t?"vertical":"horizontal":n=mv(o)?o:"horizontal",[n,n==="vertical"]},[o,e,t]);var nf=$(require("react")),gv=()=>{let[e,t]=nf.useState([]),o=nf.useCallback(r=>(t(n=>[].concat(Rt(n),[r])),()=>{t(n=>n.filter(i=>i!==r))}),[]);return[e,o]};var xv=$(require("react"));var hv=$(require("react")),nT=hv.default.createContext(void 0),sa=nT;var Bn=100,iT=10,Sg=Bn*iT,A9=Sg+Bn,bv={Modal:Bn,Drawer:Bn,Popover:Bn,Popconfirm:Bn,Tooltip:Bn,Tour:Bn,FloatButton:Bn},sT={SelectLike:50,Dropdown:50,DatePicker:50,Menu:50,ImagePreview:1},aT=e=>e in bv,aa=(e,t)=>{let[,o]=Tt(),r=xv.default.useContext(sa),n=aT(e),i;if(t!==void 0)i=[t,t];else{let s=r??0;n?s+=(r?0:o.zIndexPopupBase)+bv[e]:s+=sT[e],i=[r===void 0?t:s,s]}return i};var hn=(e,t,o)=>o!==void 0?o:`${e}-${t}`;var $f=$(require("react"));var cs=$(require("react"));var Dt=$(require("react"));var ml=$(require("react"));var sf=(e,t)=>{let o={...e};return Object.keys(t).forEach(r=>{t[r]._default?o[r]||(o[r]={}):o[r]=sf(o[r],t[r])}),o};var Cv=(e={},...t)=>t.filter(o=>!!o).reduce((o,r)=>(Object.keys(r).forEach(n=>{let i=e[n],s=r[n];if(i)if(ze(s))o[n]=Cv(i,o[n],s);else{let{_default:a}=i;a&&(o[n]=o[n]||{},o[n][a]=E(o[n][a],s))}else o[n]=E(o[n],s)}),o),{}),lT=(e,...t)=>ml.useMemo(()=>Cv.apply(void 0,[e].concat(t)),[e].concat(t)),cT=(...e)=>e.filter(t=>!!t).reduce((t,o={})=>(Object.keys(o).forEach(r=>{t[r]={...t[r],...o[r]}}),t),{}),uT=(...e)=>ml.useMemo(()=>cT.apply(void 0,e),[].concat(e)),Ee=(e,t="root")=>ml.useMemo(()=>e?{[t]:e}:void 0,[e,t]),yv=(e,t)=>ot(e)?e(t):e,je=(e,t,o,r)=>{let n=e.map(c=>c?yv(c,o):void 0),i=t.map(c=>c?yv(c,o):void 0),s=lT.apply(void 0,[r].concat(Rt(n))),a=uT.apply(void 0,Rt(i));return ml.useMemo(()=>r?[sf(s,r),sf(a,r)]:[s,a],[s,a,r])};var as=$(require("react"));var fT=e=>{let{componentCls:t,colorPrimary:o,motionDurationSlow:r,motionEaseInOut:n,motionEaseOutCirc:i,antCls:s}=e,[,a]=Mt(s,"wave");return{[t]:{position:"absolute",background:"transparent",pointerEvents:"none",boxSizing:"border-box",color:a("color",o),boxShadow:"0 0 0 0 currentcolor",opacity:.2,"&.wave-motion-appear":{transition:["box-shadow 0.4s","opacity 2s"].map(c=>`${c} ${i}`).join(","),"&-active":{boxShadow:"0 0 0 6px currentcolor",opacity:0},"&.wave-quick":{transition:["box-shadow","opacity"].map(c=>`${c} ${r} ${n}`).join(",")}}}}},Sv=sg("Wave",fT);var ca=$(require("react"));var la=`${Ks}-wave-target`;var Co=$(require("react"));var vv=e=>e?$r(e)&&e!=="#fff"&&e!=="#ffffff"&&e!=="rgb(255, 255, 255)"&&e!=="rgba(255, 255, 255, 1)"&&!/rgba\((?:\d*, ){3}0\)/i.test(e)&&!/^#(?:[0-9a-f]{3}0|[0-9a-f]{6}00)$/i.test(e)&&e!=="transparent"&&e!=="canvastext":!1;function Rv(e,t=null){let o=getComputedStyle(e),{borderTopColor:r,borderColor:n,backgroundColor:i}=o;return t&&vv(o[t])?o[t]:[r,n,i].find(vv)??null}function vg(e){return Number.isNaN(e)?0:e}var dT=e=>{let{className:t,target:o,component:r,colorSource:n}=e,i=Co.useRef(null),{getPrefixCls:s}=Co.useContext(Se),a=s(),[c]=Mt(a,"wave"),[l,u]=Co.useState(null),[f,d]=Co.useState([]),[m,p]=Co.useState(0),[g,y]=Co.useState(0),[x,b]=Co.useState(0),[h,S]=Co.useState(0),[C,R]=Co.useState(!1),v={left:m,top:g,width:x,height:h,borderRadius:f.map(I=>`${I}px`).join(" ")};l&&(v[c("color")]=l);function w(){let I=getComputedStyle(o);u(Rv(o,n));let P=I.position==="static",{borderLeftWidth:N,borderTopWidth:O}=I;p(P?o.offsetLeft:vg(-Number.parseFloat(N))),y(P?o.offsetTop:vg(-Number.parseFloat(O))),b(o.offsetWidth),S(o.offsetHeight);let{borderTopLeftRadius:_,borderTopRightRadius:M,borderBottomLeftRadius:A,borderBottomRightRadius:V}=I;d([_,M,V,A].map(F=>vg(Number.parseFloat(F))))}if(Co.useEffect(()=>{if(o){let I=Ge(()=>{w(),R(!0)}),P;return typeof ResizeObserver<"u"&&(P=new ResizeObserver(w),P.observe(o)),()=>{Ge.cancel(I),P?.disconnect()}}},[o]),!C)return null;let T=(r==="Checkbox"||r==="Radio")&&o?.classList.contains(la);return Co.createElement(oo,{visible:!0,motionAppear:!0,motionName:"wave-motion",motionDeadline:5e3,onAppearEnd:(I,P)=>{if(P.deadline||Ty(P)&&P.propertyName==="opacity"){let N=i.current?.parentElement;Ua(N).then(()=>{N?.remove()})}return!1}},({className:I},P)=>Co.createElement("div",{ref:gt(i,P),className:E(t,I,{"wave-quick":T}),style:v}))},mT=(e,t)=>{let{component:o}=t;if(o==="Checkbox"&&!e.querySelector("input")?.checked)return;let r=document.createElement("div");r.style.position="absolute",r.style.left="0px",r.style.top="0px",e?.insertBefore(r,e?.firstChild),ja(Co.createElement(dT,{...t,target:e}),r)},Ev=mT;var pT=(e,t,o,r)=>{let{wave:n}=ca.useContext(Se),[,i,s]=Tt(),a=ye(u=>{let f=e.current;if(n?.disabled||!f)return;let d=f.querySelector(`.${la}`)||f,{showEffect:m}=n||{};(m||Ev)(d,{className:t,token:i,component:o,event:u,hashId:s,colorSource:r})}),c=ca.useRef(null);return ca.useEffect(()=>()=>{Ge.cancel(c.current)},[]),u=>{Ge.cancel(c.current),c.current=Ge(()=>{a(u)})}},wv=pT;var $v={click:"click",mousedown:"mousedown",mouseup:"mouseup",pointerdown:"pointerdown",pointerup:"pointerup"},gT=e=>{let{children:t,disabled:o,component:r,colorSource:n}=e,{getPrefixCls:i,wave:s}=(0,as.useContext)(Se),a=(0,as.useRef)(null),c=i("wave"),l=Sv(c),u=wv(a,E(c,l),r,n);if(as.default.useEffect(()=>{let d=a.current;if(!d||d.nodeType!==window.Node.ELEMENT_NODE||o)return;let m=y=>{!qi(y.target)||!d.getAttribute||d.getAttribute("disabled")||d.disabled||d.className.includes("disabled")&&!d.className.includes("disabled:")||d.getAttribute("aria-disabled")==="true"||d.className.includes("-leave")||u(y)},p=s?.triggerType,g=p&&p in $v?$v[p]:"click";return d.addEventListener(g,m,!0),()=>{d.removeEventListener(g,m,!0)}},[o,s?.triggerType]),!as.default.isValidElement(t))return t??null;let f=ri(t)?gt(Kr(t),a):a;return Qo(t,{ref:f})},pi=gT;var Rg=$(require("react"));var hT=e=>{let t=Rg.default.useContext(os);return Rg.default.useMemo(()=>e?$r(e)?e??t:ot(e)?e(t):t:t,[e,t])},kt=hT;var Jt=$(require("react"));var xT=e=>{let{componentCls:t}=e;return{[t]:{display:"inline-flex","&-block":{display:"flex",width:"100%"},"&-vertical":{flexDirection:"column"},"&-rtl":{direction:"rtl"}}}},Pv=Be(["Space","Compact"],xT,()=>({}),{resetStyle:!1});var af=Jt.createContext(null),Ar=(e,t)=>{let o=Jt.useContext(af),r=Jt.useMemo(()=>{if(!o)return"";let{compactDirection:n,isFirstItem:i,isLastItem:s}=o,a=n==="vertical"?"-vertical-":"-";return E(`${e}-compact${a}item`,{[`${e}-compact${a}first-item`]:i,[`${e}-compact${a}last-item`]:s,[`${e}-compact${a}item-rtl`]:t==="rtl"})},[e,t,o]);return{compactSize:o?.compactSize,compactDirection:o?.compactDirection,compactItemClassnames:r}},Nv=e=>{let{children:t}=e;return Jt.createElement(af.Provider,{value:null},t)},bT=e=>{let{children:t,...o}=e;return Jt.createElement(af.Provider,{value:Jt.useMemo(()=>o,[o])},t)},yT=Jt.forwardRef((e,t)=>{let{getPrefixCls:o,direction:r}=Jt.useContext(Se),{size:n,direction:i,orientation:s,block:a,prefixCls:c,className:l,rootClassName:u,children:f,vertical:d,...m}=e,[p,g]=ia(s,d,i),y=kt(w=>n??w),x=o("space-compact",c),[b]=Pv(x),h=E(x,b,{[`${x}-rtl`]:r==="rtl",[`${x}-block`]:a,[`${x}-vertical`]:g},l,u),S=Jt.useContext(af),C=Jt.useRef(null);Jt.useImperativeHandle(t,()=>({nativeElement:C.current}));let R=Ro(f),v=Jt.useMemo(()=>R.map((w,T)=>{let I=w?.key||`${x}-item-${T}`;return Jt.createElement(bT,{key:I,compactSize:y,compactDirection:p,isFirstItem:T===0&&(!S||S?.isFirstItem),isLastItem:T===R.length-1&&(!S||S?.isLastItem)},w)}),[R,S,p,y,x]);return R.length===0?null:Jt.createElement("div",{ref:C,className:h,...m},v)}),lf=yT;var Vn=$(require("react"));var Eg=Vn.createContext(void 0),CT=e=>{let{getPrefixCls:t,direction:o}=Vn.useContext(Se),{prefixCls:r,size:n,className:i,...s}=e,a=t("btn-group",r),[,,c]=Tt(),l=Vn.useMemo(()=>{switch(n){case"large":return"lg";case"small":return"sm";default:return""}},[n]),u=E(a,{[`${a}-${l}`]:l,[`${a}-rtl`]:o==="rtl"},i,c);return Vn.createElement(Eg.Provider,{value:n},Vn.createElement("div",{...s,className:u}))},Iv=CT;var pl=$(require("react"));var Tv=/^[\u4E00-\u9FA5]{2}$/,cf=Tv.test.bind(Tv);function uf(e){return e==="danger"?{danger:!0}:{type:e}}function ff(e){return e==="text"||e==="link"}function ST(e,t,o,r){if(!ut(e))return;let n=t?" ":"";return!$r(e)&&!wo(e)&&$r(e.type)&&cf(e.props.children)?Qo(e,i=>{let s=E(i.className,r)||void 0,a={...o,...i.style};return{...i,children:i.children.split("").join(n),className:s,style:a}}):$r(e)?pl.default.createElement("span",{className:r,style:o},cf(e)?e.split("").join(n):e):wu(e)?pl.default.createElement("span",{className:r,style:o},e):Qo(e,i=>({...i,className:E(i.className,r)||void 0,style:{...i.style,...o}}))}function Mv(e,t,o,r){let n=!1,i=[];return pl.default.Children.forEach(e,s=>{let a=$r(s)||wo(s);if(n&&a){let c=i.length-1,l=i[c];i[c]=`${l}${s}`}else i.push(s);n=a}),pl.default.Children.map(i,s=>ST(s,t,o,r))}var Bj=["default","primary","danger"].concat(Rt(Po));var gi=$(require("react"));var df=$(require("react"));var vT={icon:{tag:"svg",attrs:{viewBox:"0 0 1024 1024",focusable:"false"},children:[{tag:"path",attrs:{d:"M988 548c-19.9 0-36-16.1-36-36 0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 00-94.3-139.9 437.71 437.71 0 00-139.9-94.3C629 83.6 571.4 72 512 72c-19.9 0-36-16.1-36-36s16.1-36 36-36c69.1 0 136.2 13.5 199.3 40.3C772.3 66 827 103 874 150c47 47 83.9 101.8 109.7 162.7 26.7 63.1 40.2 130.2 40.2 199.3.1 19.9-16 36-35.9 36z"}}]},name:"loading",theme:"outlined"},Ov=vT;function wg(){return wg=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},wg.apply(this,arguments)}var RT=(e,t)=>df.createElement(Kt,wg({},e,{ref:t,icon:Ov})),ET=df.forwardRef(RT),ua=ET;var mf=$(require("react"));var wT=(0,mf.forwardRef)((e,t)=>{let{className:o,style:r,children:n,prefixCls:i}=e,s=E(`${i}-icon`,o);return mf.default.createElement("span",{ref:t,className:s,style:r},n)}),pf=wT;var Av=(0,gi.forwardRef)((e,t)=>{let{prefixCls:o,className:r,style:n,iconClassName:i}=e,s=E(`${o}-loading-icon`,r);return gi.default.createElement(pf,{prefixCls:o,className:s,style:n,ref:t},gi.default.createElement(ua,{className:i}))}),$g=()=>({width:0,opacity:0,transform:"scale(0)"}),Pg=e=>({width:e.scrollWidth,opacity:1,transform:"scale(1)"}),$T=e=>{let{prefixCls:t,loading:o,existIcon:r,className:n,style:i,mount:s}=e,a=!!o;return r?gi.default.createElement(Av,{prefixCls:t,className:n,style:i}):gi.default.createElement(oo,{visible:a,motionName:`${t}-loading-icon-motion`,motionAppear:!s,motionEnter:!s,motionLeave:!s,removeOnLeave:!0,onAppearStart:$g,onAppearActive:Pg,onEnterStart:$g,onEnterActive:Pg,onLeaveStart:Pg,onLeaveActive:$g},({className:c,style:l},u)=>{let f={...i,...l};return gi.default.createElement(Av,{prefixCls:t,className:E(n,c),style:f,ref:u})})},_v=$T;var Lv=e=>({animationDuration:e,animationFillMode:"both"}),hi=(e,t,o,r,n=!1)=>{let i=n?"&":"";return{[`
      ${i}${e}-enter,
      ${i}${e}-appear
    `]:{...Lv(r),animationPlayState:"paused"},[`${i}${e}-leave`]:{...Lv(r),animationPlayState:"paused"},[`
      ${i}${e}-enter${e}-enter-active,
      ${i}${e}-appear${e}-appear-active
    `]:{animationName:t,animationPlayState:"running"},[`${i}${e}-leave${e}-leave-active`]:{animationName:o,animationPlayState:"running",pointerEvents:"none"}}};var Dv=new Ue("antFadeIn",{"0%":{opacity:0},"100%":{opacity:1}}),Fv=new Ue("antFadeOut",{"0%":{opacity:1},"100%":{opacity:0}}),gl=(e,t=!1)=>{let{antCls:o}=e,r=`${o}-fade`,n=t?"&":"";return[hi(r,Dv,Fv,e.motionDurationMid,t),{[`
        ${n}${r}-enter,
        ${n}${r}-appear
      `]:{opacity:0,animationTimingFunction:"linear"},[`${n}${r}-leave`]:{animationTimingFunction:"linear"}}]};var zv=new Ue("antMoveDownIn",{"0%":{transform:"translate3d(0, 100%, 0)",transformOrigin:"0 0",opacity:0},"100%":{transform:"translate3d(0, 0, 0)",transformOrigin:"0 0",opacity:1}}),Bv=new Ue("antMoveDownOut",{"0%":{transform:"translate3d(0, 0, 0)",transformOrigin:"0 0",opacity:1},"100%":{transform:"translate3d(0, 100%, 0)",transformOrigin:"0 0",opacity:0}}),Vv=new Ue("antMoveLeftIn",{"0%":{transform:"translate3d(-100%, 0, 0)",transformOrigin:"0 0",opacity:0},"100%":{transform:"translate3d(0, 0, 0)",transformOrigin:"0 0",opacity:1}}),Hv=new Ue("antMoveLeftOut",{"0%":{transform:"translate3d(0, 0, 0)",transformOrigin:"0 0",opacity:1},"100%":{transform:"translate3d(-100%, 0, 0)",transformOrigin:"0 0",opacity:0}}),kv=new Ue("antMoveRightIn",{"0%":{transform:"translate3d(100%, 0, 0)",transformOrigin:"0 0",opacity:0},"100%":{transform:"translate3d(0, 0, 0)",transformOrigin:"0 0",opacity:1}}),Wv=new Ue("antMoveRightOut",{"0%":{transform:"translate3d(0, 0, 0)",transformOrigin:"0 0",opacity:1},"100%":{transform:"translate3d(100%, 0, 0)",transformOrigin:"0 0",opacity:0}}),jv=new Ue("antMoveUpIn",{"0%":{transform:"translate3d(0, -100%, 0)",transformOrigin:"0 0",opacity:0},"100%":{transform:"translate3d(0, 0, 0)",transformOrigin:"0 0",opacity:1}}),Uv=new Ue("antMoveUpOut",{"0%":{transform:"translate3d(0, 0, 0)",transformOrigin:"0 0",opacity:1},"100%":{transform:"translate3d(0, -100%, 0)",transformOrigin:"0 0",opacity:0}}),PT={"move-up":{inKeyframes:jv,outKeyframes:Uv},"move-down":{inKeyframes:zv,outKeyframes:Bv},"move-left":{inKeyframes:Vv,outKeyframes:Hv},"move-right":{inKeyframes:kv,outKeyframes:Wv}},gf=(e,t)=>{let{antCls:o}=e,r=`${o}-${t}`,{inKeyframes:n,outKeyframes:i}=PT[t];return[hi(r,n,i,e.motionDurationMid),{[`
        ${r}-enter,
        ${r}-appear
      `]:{opacity:0,animationTimingFunction:e.motionEaseOutCirc},[`${r}-leave`]:{animationTimingFunction:e.motionEaseInOutCirc}}]};var hf=new Ue("antSlideUpIn",{"0%":{transform:"scaleY(0.8)",transformOrigin:"0% 0%",opacity:0},"100%":{transform:"scaleY(1)",transformOrigin:"0% 0%",opacity:1}}),xf=new Ue("antSlideUpOut",{"0%":{transform:"scaleY(1)",transformOrigin:"0% 0%",opacity:1},"100%":{transform:"scaleY(0.8)",transformOrigin:"0% 0%",opacity:0}}),bf=new Ue("antSlideDownIn",{"0%":{transform:"scaleY(0.8)",transformOrigin:"100% 100%",opacity:0},"100%":{transform:"scaleY(1)",transformOrigin:"100% 100%",opacity:1}}),yf=new Ue("antSlideDownOut",{"0%":{transform:"scaleY(1)",transformOrigin:"100% 100%",opacity:1},"100%":{transform:"scaleY(0.8)",transformOrigin:"100% 100%",opacity:0}}),qv=new Ue("antSlideLeftIn",{"0%":{transform:"scaleX(0.8)",transformOrigin:"0% 0%",opacity:0},"100%":{transform:"scaleX(1)",transformOrigin:"0% 0%",opacity:1}}),Gv=new Ue("antSlideLeftOut",{"0%":{transform:"scaleX(1)",transformOrigin:"0% 0%",opacity:1},"100%":{transform:"scaleX(0.8)",transformOrigin:"0% 0%",opacity:0}}),Xv=new Ue("antSlideRightIn",{"0%":{transform:"scaleX(0.8)",transformOrigin:"100% 0%",opacity:0},"100%":{transform:"scaleX(1)",transformOrigin:"100% 0%",opacity:1}}),Kv=new Ue("antSlideRightOut",{"0%":{transform:"scaleX(1)",transformOrigin:"100% 0%",opacity:1},"100%":{transform:"scaleX(0.8)",transformOrigin:"100% 0%",opacity:0}}),NT={"slide-up":{inKeyframes:hf,outKeyframes:xf},"slide-down":{inKeyframes:bf,outKeyframes:yf},"slide-left":{inKeyframes:qv,outKeyframes:Gv},"slide-right":{inKeyframes:Xv,outKeyframes:Kv}},Cf=(e,t)=>{let{antCls:o}=e,r=`${o}-${t}`,{inKeyframes:n,outKeyframes:i}=NT[t];return[hi(r,n,i,e.motionDurationMid),{[`
      ${r}-enter,
      ${r}-appear
    `]:{transform:"scale(0)",transformOrigin:"0% 0%",opacity:0,animationTimingFunction:e.motionEaseOutQuint,"&-prepare":{transform:"scale(1)"}},[`${r}-leave`]:{animationTimingFunction:e.motionEaseInQuint}}]};var xn=()=>({"@media (prefers-reduced-motion: reduce)":{"&, &::before, &::after":{transition:"none",animation:"none"}}}),fa=()=>({"@media (prefers-reduced-motion: reduce)":{transition:"none",animation:"none"}});var Yv=new Ue("antZoomIn",{"0%":{transform:"scale(0.2)",opacity:0},"100%":{transform:"scale(1)",opacity:1}}),Qv=new Ue("antZoomOut",{"0%":{transform:"scale(1)"},"100%":{transform:"scale(0.2)",opacity:0}}),Ng=new Ue("antZoomBigIn",{"0%":{transform:"scale(0.8)",opacity:0},"100%":{transform:"scale(1)",opacity:1}}),Ig=new Ue("antZoomBigOut",{"0%":{transform:"scale(1)"},"100%":{transform:"scale(0.8)",opacity:0}}),Zv=new Ue("antZoomUpIn",{"0%":{transform:"scale(0.8)",transformOrigin:"50% 0%",opacity:0},"100%":{transform:"scale(1)",transformOrigin:"50% 0%"}}),Jv=new Ue("antZoomUpOut",{"0%":{transform:"scale(1)",transformOrigin:"50% 0%"},"100%":{transform:"scale(0.8)",transformOrigin:"50% 0%",opacity:0}}),e0=new Ue("antZoomLeftIn",{"0%":{transform:"scale(0.8)",transformOrigin:"0% 50%",opacity:0},"100%":{transform:"scale(1)",transformOrigin:"0% 50%"}}),t0=new Ue("antZoomLeftOut",{"0%":{transform:"scale(1)",transformOrigin:"0% 50%"},"100%":{transform:"scale(0.8)",transformOrigin:"0% 50%",opacity:0}}),o0=new Ue("antZoomRightIn",{"0%":{transform:"scale(0.8)",transformOrigin:"100% 50%",opacity:0},"100%":{transform:"scale(1)",transformOrigin:"100% 50%"}}),r0=new Ue("antZoomRightOut",{"0%":{transform:"scale(1)",transformOrigin:"100% 50%"},"100%":{transform:"scale(0.8)",transformOrigin:"100% 50%",opacity:0}}),n0=new Ue("antZoomDownIn",{"0%":{transform:"scale(0.8)",transformOrigin:"50% 100%",opacity:0},"100%":{transform:"scale(1)",transformOrigin:"50% 100%"}}),i0=new Ue("antZoomDownOut",{"0%":{transform:"scale(1)",transformOrigin:"50% 100%"},"100%":{transform:"scale(0.8)",transformOrigin:"50% 100%",opacity:0}}),IT={zoom:{inKeyframes:Yv,outKeyframes:Qv},"zoom-big":{inKeyframes:Ng,outKeyframes:Ig},"zoom-big-fast":{inKeyframes:Ng,outKeyframes:Ig},"zoom-left":{inKeyframes:e0,outKeyframes:t0},"zoom-right":{inKeyframes:o0,outKeyframes:r0},"zoom-up":{inKeyframes:Zv,outKeyframes:Jv},"zoom-down":{inKeyframes:n0,outKeyframes:i0}},hl=(e,t)=>{let{antCls:o}=e,r=`${o}-${t}`,{inKeyframes:n,outKeyframes:i}=IT[t];return[hi(r,n,i,t==="zoom-big-fast"?e.motionDurationFast:e.motionDurationMid),{[`
        ${r}-enter,
        ${r}-appear
      `]:{transform:"scale(0)",opacity:0,animationTimingFunction:e.motionEaseOutCirc,"&-prepare":{transform:"none"}},[`${r}-leave`]:{animationTimingFunction:e.motionEaseInOutCirc}}]};var s0=(e,t)=>({[`> span, > ${e}`]:{"&:not(:last-child)":{[`&, & > ${e}`]:{"&:not(:disabled)":{borderInlineEndColor:t}}},"&:not(:first-child)":{[`&, & > ${e}`]:{"&:not(:disabled)":{borderInlineStartColor:t}}}}}),TT=e=>{let{componentCls:t,fontSize:o,lineWidth:r,groupBorderColor:n,colorErrorHover:i}=e;return{[`${t}-group`]:[{position:"relative",display:"inline-flex",[`> span, > ${t}`]:{"&:not(:last-child)":{[`&, & > ${t}`]:{borderStartEndRadius:0,borderEndEndRadius:0}},"&:not(:first-child)":{marginInlineStart:e.calc(r).mul(-1).equal(),[`&, & > ${t}`]:{borderStartStartRadius:0,borderEndStartRadius:0}}},[t]:{position:"relative",zIndex:1,"&:hover, &:focus, &:active":{zIndex:2},"&[disabled]":{zIndex:0}},[`${t}-icon-only`]:{fontSize:o}},s0(`${t}-primary`,n),s0(`${t}-danger`,i)]}},a0=TT;var Ag=$(require("react"));var Tg=e=>Math.round(Number(e||0)),MT=e=>{if(e instanceof Ze)return e;if(e&&typeof e=="object"&&"h"in e&&"b"in e){let{b:t,...o}=e;return{...o,v:t}}return typeof e=="string"&&/hsb/.test(e)?e.replace(/hsb/,"hsv"):e},Uo=class extends Ze{constructor(t){super(MT(t))}toHsbString(){let t=this.toHsb(),o=Tg(t.s*100),r=Tg(t.b*100),n=Tg(t.h),i=t.a,s=`hsb(${n}, ${o}%, ${r}%)`,a=`hsba(${n}, ${o}%, ${r}%, ${i.toFixed(i===0?0:2)})`;return i===1?s:a}toHsb(){let{v:t,...o}=this.toHsv();return{...o,b:t,a:this.a}}};var Mg=e=>e instanceof Uo?e:new Uo(e),OT=Mg("#1677ff");var AT=$(require("react"));var c0=$(require("react"));var Og=require("react");var _T=$(require("react"));var LT=$(require("react"));var l0=$(require("react"));var kT=require("react");var WT=$(require("react"));var f0=$(require("react"));var u0=$(require("react"));var jT=(e,t)=>e?.replace(/[^0-9a-f]/gi,"").slice(0,t?8:6)||"",UT=(e,t)=>e?jT(e,t):"",ls=(function(){function e(t){if(Mr(this,e),this.cleared=!1,t instanceof e){this.metaColor=t.metaColor.clone(),this.colors=t.colors?.map(r=>({color:new e(r.color),percent:r.percent})),this.cleared=t.cleared;return}let o=Array.isArray(t);o&&t.length?(this.colors=t.map(({color:r,percent:n})=>({color:new e(r),percent:n})),this.metaColor=new Uo(this.colors[0].color.metaColor)):this.metaColor=new Uo(o?"":t),(!t||o&&!this.colors)&&(this.metaColor=this.metaColor.setA(0),this.cleared=!0)}return Or(e,[{key:"toHsb",value:function(){return this.metaColor.toHsb()}},{key:"toHsbString",value:function(){return this.metaColor.toHsbString()}},{key:"toHex",value:function(){return UT(this.toHexString(),this.metaColor.a<1)}},{key:"toHexString",value:function(){return this.metaColor.toHexString()}},{key:"toRgb",value:function(){return this.metaColor.toRgb()}},{key:"toRgbString",value:function(){return this.metaColor.toRgbString()}},{key:"isGradient",value:function(){return!!this.colors&&!this.cleared}},{key:"getColors",value:function(){return this.colors||[{color:this,percent:0}]}},{key:"toCssString",value:function(){let{colors:o}=this;return o?`linear-gradient(90deg, ${o.map(n=>`${n.color.toRgbString()} ${n.percent}%`).join(", ")})`:this.metaColor.toRgbString()}},{key:"equals",value:function(o){return!o||this.isGradient()!==o.isGradient()?!1:this.isGradient()?this.colors.length===o.colors.length&&this.colors.every((r,n)=>{let i=o.colors[n];return r.percent===i.percent&&r.color.equals(i.color)}):this.toHexString()===o.toHexString()}}])})();var p0=$(require("react"));function dr(){return dr=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)({}).hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},dr.apply(null,arguments)}var m0=e=>e instanceof ls?e:new ls(e);var Sf=(e,t)=>{let{r:o,g:r,b:n,a:i}=e.toRgb(),s=new Uo(e.toRgbString()).onBackground(t).toHsv();return i<=.5?s.v>.5:o*.299+r*.587+n*.114>192};var vf=e=>{let{paddingInline:t,onlyIconSize:o,borderColorDisabled:r}=e;return Oe(e,{buttonPaddingHorizontal:t,buttonPaddingVertical:0,buttonIconOnlyFontSize:o,colorBorderDisabled:r})},Rf=e=>{let t=e.contentFontSize??e.fontSize,o=e.contentFontSizeSM??e.fontSize,r=e.contentFontSizeLG??e.fontSizeLG,n=e.contentLineHeight??Ws(t),i=e.contentLineHeightSM??Ws(o),s=e.contentLineHeightLG??Ws(r),a=Sf(new ls(e.colorBgSolid),"#fff")?"#000":"#fff",c=Po.reduce((f,d)=>({...f,[`${d}ShadowColor`]:`0 ${J(e.controlOutlineWidth)} 0 ${rs(e[`${d}1`],e.colorBgContainer)}`}),{}),l=e.colorBgContainerDisabled,u=e.colorBgContainerDisabled;return{...c,fontWeight:400,iconGap:e.marginXS,defaultShadow:`0 ${e.controlOutlineWidth}px 0 ${e.controlTmpOutline}`,primaryShadow:`0 ${e.controlOutlineWidth}px 0 ${e.controlOutline}`,dangerShadow:`0 ${e.controlOutlineWidth}px 0 ${e.colorErrorOutline}`,primaryColor:e.colorTextLightSolid,dangerColor:e.colorTextLightSolid,borderColorDisabled:e.colorBorderDisabled,defaultGhostColor:e.colorBgContainer,ghostBg:"transparent",defaultGhostBorderColor:e.colorBgContainer,paddingInline:e.paddingContentHorizontal-e.lineWidth,paddingInlineLG:e.paddingContentHorizontal-e.lineWidth,paddingInlineSM:8-e.lineWidth,onlyIconSize:"inherit",onlyIconSizeSM:"inherit",onlyIconSizeLG:"inherit",groupBorderColor:e.colorPrimaryHover,linkHoverBg:"transparent",textTextColor:e.colorText,textTextHoverColor:e.colorText,textTextActiveColor:e.colorText,textHoverBg:e.colorFillTertiary,defaultColor:e.colorText,defaultBg:e.colorBgContainer,defaultBorderColor:e.colorBorder,defaultBorderColorDisabled:e.colorBorder,defaultHoverBg:e.colorBgContainer,defaultHoverColor:e.colorPrimaryHover,defaultHoverBorderColor:e.colorPrimaryHover,defaultActiveBg:e.colorBgContainer,defaultActiveColor:e.colorPrimaryActive,defaultActiveBorderColor:e.colorPrimaryActive,solidTextColor:a,contentFontSize:t,contentFontSizeSM:o,contentFontSizeLG:r,contentLineHeight:n,contentLineHeightSM:i,contentLineHeightLG:s,paddingBlock:Math.max((e.controlHeight-t*n)/2-e.lineWidth,0),paddingBlockSM:Math.max((e.controlHeightSM-o*i)/2-e.lineWidth,0),paddingBlockLG:Math.max((e.controlHeightLG-r*s)/2-e.lineWidth,0),defaultBgDisabled:l,dashedBgDisabled:u}};var qT=e=>{let{componentCls:t,antCls:o,lineWidth:r,lineType:n}=e,[i,s]=Mt(o,"btn");return{[t]:[{[i("border-width")]:r,[i("border-color")]:"#000",[i("border-color-hover")]:s("border-color"),[i("border-color-active")]:s("border-color"),[i("border-color-disabled")]:s("border-color"),[i("border-style")]:n,[i("text-color")]:"#000",[i("text-color-hover")]:s("text-color"),[i("text-color-active")]:s("text-color"),[i("text-color-disabled")]:s("text-color"),[i("bg-color")]:"#ddd",[i("bg-color-hover")]:s("bg-color"),[i("bg-color-active")]:s("bg-color"),[i("bg-color-disabled")]:e.colorBgContainerDisabled,[i("bg-color-container")]:e.colorBgContainer,[i("shadow")]:"none"},{border:[s("border-width"),s("border-style"),s("border-color")].join(" "),color:s("text-color"),backgroundColor:s("bg-color"),[`&:not(:disabled):not(${t}-disabled)`]:{"&:hover":{border:[s("border-width"),s("border-style"),s("border-color-hover")].join(" "),color:s("text-color-hover"),backgroundColor:s("bg-color-hover")},"&:active":{border:[s("border-width"),s("border-style"),s("border-color-active")].join(" "),color:s("text-color-active"),backgroundColor:s("bg-color-active")}}},{[`&${t}-variant-solid`]:{[i("solid-bg-color")]:s("color-base"),[i("solid-bg-color-hover")]:s("color-hover"),[i("solid-bg-color-active")]:s("color-active"),[i("border-color")]:"transparent",[i("text-color")]:e.colorTextLightSolid,[i("bg-color")]:s("solid-bg-color"),[i("bg-color-hover")]:s("solid-bg-color-hover"),[i("bg-color-active")]:s("solid-bg-color-active"),boxShadow:s("shadow")},[`&${t}-variant-outlined, &${t}-variant-dashed`]:{[i("border-color")]:s("color-base"),[i("border-color-hover")]:s("color-hover"),[i("border-color-active")]:s("color-active"),[i("bg-color")]:s("bg-color-container"),[i("text-color")]:s("color-base"),[i("text-color-hover")]:s("color-hover"),[i("text-color-active")]:s("color-active"),boxShadow:s("shadow")},[`&${t}-variant-dashed`]:{[i("border-style")]:"dashed",[i("bg-color-disabled")]:e.dashedBgDisabled},[`&${t}-variant-filled`]:{[i("border-color")]:"transparent",[i("text-color")]:s("color-base"),[i("bg-color")]:s("color-light"),[i("bg-color-hover")]:s("color-light-hover"),[i("bg-color-active")]:s("color-light-active")},[`&${t}-variant-text, &${t}-variant-link`]:{[i("border-color")]:"transparent",[i("text-color")]:s("color-base"),[i("text-color-hover")]:s("color-hover"),[i("text-color-active")]:s("color-active"),[i("bg-color")]:"transparent",[i("bg-color-hover")]:"transparent",[i("bg-color-active")]:"transparent",[`&:disabled, &${e.componentCls}-disabled`]:{background:"transparent",borderColor:"transparent"}},[`&${t}-variant-text`]:{[i("bg-color-hover")]:s("color-light"),[i("bg-color-active")]:s("color-light-active")}},{[`&${t}-variant-link`]:{[i("color-base")]:e.colorLink,[i("color-hover")]:e.colorLinkHover,[i("color-active")]:e.colorLinkActive,[i("bg-color-hover")]:e.linkHoverBg},[`&${t}-color-primary`]:{[i("color-base")]:e.colorPrimary,[i("color-hover")]:e.colorPrimaryHover,[i("color-active")]:e.colorPrimaryActive,[i("color-light")]:e.colorPrimaryBg,[i("color-light-hover")]:e.colorPrimaryBgHover,[i("color-light-active")]:e.colorPrimaryBorder,[i("shadow")]:e.primaryShadow,[`&${t}-variant-solid`]:{[i("text-color")]:e.primaryColor,[i("text-color-hover")]:s("text-color"),[i("text-color-active")]:s("text-color")}},[`&${t}-color-dangerous`]:{[i("color-base")]:e.colorError,[i("color-hover")]:e.colorErrorHover,[i("color-active")]:e.colorErrorActive,[i("color-light")]:e.colorErrorBg,[i("color-light-hover")]:e.colorErrorBgFilledHover,[i("color-light-active")]:e.colorErrorBgActive,[i("shadow")]:e.dangerShadow,[`&${t}-variant-solid`]:{[i("text-color")]:e.dangerColor,[i("text-color-hover")]:s("text-color"),[i("text-color-active")]:s("text-color")}},[`&${t}-color-default`]:{[i("solid-bg-color")]:e.colorBgSolid,[i("solid-bg-color-hover")]:e.colorBgSolidHover,[i("solid-bg-color-active")]:e.colorBgSolidActive,[i("color-base")]:e.defaultBorderColor,[i("color-hover")]:e.defaultHoverBorderColor,[i("color-active")]:e.defaultActiveBorderColor,[i("color-light")]:e.colorFillTertiary,[i("color-light-hover")]:e.colorFillSecondary,[i("color-light-active")]:e.colorFill,[i("text-color")]:e.defaultColor,[i("text-color-hover")]:e.defaultHoverColor,[i("text-color-active")]:e.defaultActiveColor,[i("shadow")]:e.defaultShadow,[`&${t}-variant-outlined`]:{[i("bg-color-disabled")]:e.defaultBgDisabled},[`&${t}-variant-solid`]:{[i("text-color")]:e.solidTextColor,[i("text-color-hover")]:s("text-color"),[i("text-color-active")]:s("text-color")},[`&${t}-variant-filled, &${t}-variant-text`]:{[i("text-color-hover")]:s("text-color"),[i("text-color-active")]:s("text-color")},[`&${t}-variant-outlined, &${t}-variant-dashed`]:{[i("text-color")]:e.defaultColor,[i("text-color-hover")]:e.defaultHoverColor,[i("text-color-active")]:e.defaultActiveColor,[i("bg-color-container")]:e.defaultBg,[i("bg-color-hover")]:e.defaultHoverBg,[i("bg-color-active")]:e.defaultActiveBg},[`&${t}-variant-text`]:{[i("text-color")]:e.textTextColor,[i("text-color-hover")]:e.textTextHoverColor,[i("text-color-active")]:e.textTextActiveColor,[i("bg-color-hover")]:e.textHoverBg},[`&${t}-background-ghost`]:{[`&${t}-variant-outlined, &${t}-variant-dashed`]:{[i("text-color")]:e.defaultGhostColor,[i("border-color")]:e.defaultGhostBorderColor}}}},Po.map(a=>{let c=e[`${a}6`],l=e[`${a}1`],u=e[`${a}Hover`],f=e[`${a}2`],d=e[`${a}3`],m=e[`${a}Active`],p=e[`${a}ShadowColor`];return{[`&${t}-color-${a}`]:{[i("color-base")]:c,[i("color-hover")]:u,[i("color-active")]:m,[i("color-light")]:l,[i("color-light-hover")]:f,[i("color-light-active")]:d,[i("shadow")]:p}}}),{[`&:disabled, &${e.componentCls}-disabled`]:{cursor:"not-allowed",borderColor:e.colorBorderDisabled,background:s("bg-color-disabled"),color:e.colorTextDisabled,boxShadow:"none"}},{[`&${t}-background-ghost`]:{[i("bg-color")]:e.ghostBg,[i("bg-color-hover")]:e.ghostBg,[i("bg-color-active")]:e.ghostBg,[i("shadow")]:"none",[`&${t}-variant-outlined, &${t}-variant-dashed`]:{[i("bg-color-hover")]:e.ghostBg,[i("bg-color-active")]:e.ghostBg}}}]}},g0=qT;var GT=e=>{let{componentCls:t,iconCls:o,fontWeight:r,opacityLoading:n,motionDurationSlow:i,motionEaseInOut:s,iconGap:a,calc:c}=e;return{[t]:{outline:"none",position:"relative",display:"inline-flex",gap:a,alignItems:"center",justifyContent:"center",fontWeight:r,whiteSpace:"nowrap",textAlign:"center",backgroundImage:"none",cursor:"pointer",transition:`all ${e.motionDurationMid} ${e.motionEaseInOut}`,userSelect:"none",touchAction:"manipulation",...xn(),"&:disabled > *":{pointerEvents:"none"},[`${t}-icon > svg`]:dl(),[`${t}-icon`]:{display:"inline-flex",alignItems:"center",[o]:{verticalAlign:"middle","&:before":{content:'"\\a0"',display:"inline-block",width:0}}},"> a":{color:"currentColor"},"&:not(:disabled)":Jr(e),[`&${t}-two-chinese-chars::first-letter`]:{letterSpacing:"0.34em"},[`&${t}-two-chinese-chars > *:not(${o})`]:{marginInlineEnd:"-0.34em",letterSpacing:"0.34em"},[`&${t}-icon-only`]:{paddingInline:0,[`&${t}-compact-item`]:{flex:"none"}},[`&${t}-loading`]:{opacity:n,cursor:"default"},[`${t}-loading-icon`]:{transition:["width","opacity","margin"].map(l=>`${l} ${i} ${s}`).join(",")},[`&:not(${t}-icon-end)`]:{[`${t}-loading-icon-motion`]:{"&-appear-start, &-enter-start, &-appear-prepare, &-enter-prepare":{marginInlineEnd:c(a).mul(-1).equal(),opacity:0},"&-appear-active, &-enter-active":{marginInlineEnd:0},"&-leave-start":{marginInlineEnd:0},"&-leave-active":{marginInlineEnd:c(a).mul(-1).equal()}}},"&-icon-end":{flexDirection:"row-reverse",[`${t}-loading-icon-motion`]:{"&-appear-start, &-enter-start, &-appear-prepare, &-enter-prepare":{marginInlineStart:c(a).mul(-1).equal(),opacity:0},"&-appear-active, &-enter-active":{marginInlineStart:0},"&-leave-start":{marginInlineStart:0},"&-leave-active":{marginInlineStart:c(a).mul(-1).equal()}}}}}},XT=e=>({minWidth:e.controlHeight,paddingInline:0,borderRadius:"50%"}),_g=(e,t="")=>{let{componentCls:o,controlHeight:r,fontSize:n,borderRadius:i,buttonPaddingHorizontal:s,iconCls:a,buttonPaddingVertical:c,buttonIconOnlyFontSize:l}=e;return[{[t]:{fontSize:n,height:r,padding:`${J(c)} ${J(s)}`,borderRadius:i,[`&${o}-icon-only`]:{width:r,[a]:{fontSize:l}}}},{[`${o}${o}-circle${t}`]:XT(e)},{[`${o}${o}-round${t}`]:{borderRadius:e.controlHeight,[`&:not(${o}-icon-only)`]:{paddingInline:e.buttonPaddingHorizontal}}}]},KT=e=>{let t=Oe(e,{fontSize:e.contentFontSize});return _g(t,e.componentCls)},YT=e=>{let t=Oe(e,{controlHeight:e.controlHeightSM,fontSize:e.contentFontSizeSM,padding:e.paddingXS,buttonPaddingHorizontal:e.paddingInlineSM,buttonPaddingVertical:0,borderRadius:e.borderRadiusSM,buttonIconOnlyFontSize:e.onlyIconSizeSM});return _g(t,`${e.componentCls}-sm`)},QT=e=>{let t=Oe(e,{controlHeight:e.controlHeightLG,fontSize:e.contentFontSizeLG,buttonPaddingHorizontal:e.paddingInlineLG,buttonPaddingVertical:0,borderRadius:e.borderRadiusLG,buttonIconOnlyFontSize:e.onlyIconSizeLG});return _g(t,`${e.componentCls}-lg`)},ZT=e=>{let{componentCls:t}=e;return{[t]:{[`&${t}-block`]:{width:"100%"}}}},h0=Be("Button",e=>{let t=vf(e);return[GT(t),KT(t),YT(t),QT(t),ZT(t),g0(t),a0(t)]},Rf,{unitless:{fontWeight:!0,contentLineHeight:!0,contentLineHeightSM:!0,contentLineHeightLG:!0}});function JT(e,t,o,r){let{focusElCls:n,focus:i,borderElCls:s}=o,a=s?"> *":"",c=a?` ${a}`:"",l=d=>d.filter(Boolean).map(m=>`&:${m}${c}`).join(","),u=l(["hover",n?`hover${n}`:null]),f=l([i?"focus":null,"active"]);return{[`&-item:not(${t}-last-item)`]:{marginInlineEnd:e.calc(e.lineWidth).mul(-1).equal()},[`&-item:not(${r}-status-success)`]:{zIndex:2},"&-item":{[f]:{zIndex:3},[u]:{zIndex:4},...n?{[`&${n}`]:{zIndex:3}}:{},[`&[disabled] ${a}`]:{zIndex:0}}}}function eM(e,t,o){let{borderElCls:r}=o,n=r?`> ${r}`:"";return{[`&-item:not(${t}-first-item):not(${t}-last-item) ${n}`]:{borderRadius:0},[`&-item:not(${t}-last-item)${t}-first-item`]:{[`& ${n}, &${e}-sm ${n}, &${e}-lg ${n}`]:{borderStartEndRadius:0,borderEndEndRadius:0}},[`&-item:not(${t}-first-item)${t}-last-item`]:{[`& ${n}, &${e}-sm ${n}, &${e}-lg ${n}`]:{borderStartStartRadius:0,borderEndStartRadius:0}}}}function xi(e,t={focus:!0}){let{componentCls:o}=e,{componentCls:r}=t,n=r||o,i=`${n}-compact`;return{[i]:{...JT(e,i,t,n),...eM(n,i,t)}}}function tM(e,t,o){return{[`&-item:not(${t}-last-item)`]:{marginBottom:e.calc(e.lineWidth).mul(-1).equal()},[`&-item:not(${o}-status-success)`]:{zIndex:2},"&-item":{"&:focus,&:active":{zIndex:3},"&:hover":{zIndex:4},"&[disabled]":{zIndex:0}}}}function oM(e,t){return{[`&-item:not(${t}-first-item):not(${t}-last-item)`]:{borderRadius:0},[`&-item${t}-first-item:not(${t}-last-item)`]:{[`&, &${e}-sm, &${e}-lg`]:{borderEndEndRadius:0,borderEndStartRadius:0}},[`&-item${t}-last-item:not(${t}-first-item)`]:{[`&, &${e}-sm, &${e}-lg`]:{borderStartStartRadius:0,borderStartEndRadius:0}}}}function x0(e){let t=`${e.componentCls}-compact-vertical`;return{[t]:{...tM(e,t,e.componentCls),...oM(e.componentCls,t)}}}var rM=e=>{let{antCls:t,componentCls:o,lineWidth:r,calc:n,colorBgContainer:i}=e,s=`${o}-variant-solid:not([disabled])`,a=n(r).mul(-1).equal(),[c,l]=Mt(t,"btn"),u=f=>({[`${o}-compact${f?"-vertical":""}-item`]:{[c("compact-connect-border-color")]:l("bg-color-hover"),[`&${s}`]:{transition:"none",[`& + ${s}:before`]:[{position:"absolute",backgroundColor:l("compact-connect-border-color"),content:'""'},f?{top:a,insetInline:a,height:r}:{insetBlock:a,insetInlineStart:a,width:r}],"&:hover:before":{display:"none"}}}});return[u(),u(!0),{[`${s}${o}-color-default`]:{[c("compact-connect-border-color")]:`color-mix(in srgb, ${l("bg-color-hover")} 75%, ${i})`}}]},b0=Fn(["Button","compact"],e=>{let t=vf(e);return[xi(t),x0(t),rM(t)]},Rf);function nM(e){if(ze(e)){let t=e?.delay;return t=wo(t)?t:0,{loading:t<=0,delay:t}}return{loading:!!e,delay:0}}var iM={default:["default","outlined"],primary:["primary","solid"],dashed:["default","dashed"],link:["link","link"],text:["default","text"]},sM=Dt.default.forwardRef((e,t)=>{let{_skipSemantic:o,loading:r=!1,prefixCls:n,color:i,variant:s,type:a,danger:c=!1,shape:l,size:u,disabled:f,className:d,rootClassName:m,children:p,icon:g,iconPosition:y,iconPlacement:x,ghost:b=!1,block:h=!1,htmlType:S="button",classNames:C,styles:R,style:v,autoInsertSpace:w,autoFocus:T,...I}=e,P=Ro(p),N=a||"default",{getPrefixCls:O,direction:_,autoInsertSpace:M,className:A,style:V,classNames:F,styles:G,loadingIcon:z,shape:B,color:k,variant:W}=De("button"),j=l||B||"default",[L,U]=(0,Dt.useMemo)(()=>{if(i&&s)return[i,s];if(a||c){let Me=iM[N]||[];return c?["danger",Me[1]]:Me}return s==="solid"?["primary",s]:k&&W?[k,W]:W==="solid"?["primary",W]:["default","outlined"]},[i,s,a,c,k,W,N]),[X,Y]=(0,Dt.useMemo)(()=>b&&U==="solid"?[L,"outlined"]:[L,U],[L,U,b]),q=X==="danger",D=q?"dangerous":X,K=w??M??!0,H=O("btn",n),[Q,Z]=h0(H),te=(0,Dt.useContext)(Xt),se=f??te,re=(0,Dt.useContext)(Eg),oe=(0,Dt.useMemo)(()=>nM(r),[r]),[ae,ie]=Ic(oe.loading),[be,ee]=(0,Dt.useState)(!1),xe=(0,Dt.useRef)(null),fe=ir(t,xe),_e=P.length===1&&!g&&!ff(Y),Ve=(0,Dt.useRef)(!0);Dt.default.useEffect(()=>(Ve.current=!1,()=>{Ve.current=!0}),[]),qe(()=>{oe.delay>0?ie(!0,{ms:oe.delay}):ie(oe.loading,!0)},[oe.delay,oe.loading]),(0,Dt.useEffect)(()=>{if(!xe.current||!K)return;let Me=xe.current.textContent||"";_e&&cf(Me)?be||ee(!0):be&&ee(!1)}),(0,Dt.useEffect)(()=>{T&&xe.current?.focus()},[]);let ue=Dt.default.useCallback(Me=>{if(ae||se){Me.preventDefault();return}e.onClick?.(("href"in e,Me))},[e.onClick,ae,se]),{compactSize:He,compactItemClassnames:Ke}=Ar(H,_),Pe=kt(Me=>u??He??re??Me),de=ae?"loading":g,le=x??y??"start",Re=tt(I,["navigate"]),pe={...e,type:N,color:X,variant:Y,danger:q,shape:j,size:Pe,disabled:se,loading:ae,iconPlacement:le},ve=Ee(V),Fe=Ee(v),[Ye,Je]=je([o?void 0:F,C],[o?void 0:G,ve,R,Fe],{props:pe}),st=E(H,Q,Z,{[`${H}-${j}`]:j!=="default"&&j!=="square"&&j,[`${H}-${N}`]:N,[`${H}-dangerous`]:c,[`${H}-color-${D}`]:D,[`${H}-variant-${Y}`]:Y,[`${H}-lg`]:Pe==="large",[`${H}-sm`]:Pe==="small",[`${H}-icon-only`]:!p&&p!==0&&!!de,[`${H}-background-ghost`]:b&&!ff(Y),[`${H}-loading`]:ae,[`${H}-two-chinese-chars`]:be&&K&&!ae,[`${H}-block`]:h,[`${H}-rtl`]:_==="rtl",[`${H}-icon-end`]:le==="end"},Ke,d,m,A,Ye.root),Xe={className:Ye.icon,style:Je.icon},wt=Me=>Dt.default.createElement(pf,{prefixCls:H,...Xe},Me),$t=Dt.default.createElement(_v,{existIcon:!!g,prefixCls:H,loading:ae,mount:Ve.current,...Xe}),lt=ze(r)&&r.icon||z,Ct;g&&!ae?Ct=wt(g):r&&lt?Ct=wt(lt):Ct=$t;let Pt=ut(p)?Mv(p,_e&&K,Je.content,Ye.content):null;if(Re.href!==void 0)return Dt.default.createElement("a",{...Re,className:E(st,{[`${H}-disabled`]:se}),href:se?void 0:Re.href,style:Je.root,onClick:ue,ref:fe,tabIndex:se?-1:0,"aria-disabled":se},Ct,Pt);let Nt=Dt.default.createElement("button",{...I,type:S,className:st,style:Je.root,onClick:ue,disabled:se,ref:fe},Ct,Pt,Ke&&Dt.default.createElement(b0,{prefixCls:H}));return ff(Y)||(Nt=Dt.default.createElement(pi,{component:"Button",disabled:ae},Nt)),Nt}),Lg=sM;Lg.Group=Iv;Lg.__ANT_BUTTON=!0;var bn=Lg;var aM=e=>{let{type:t,children:o,prefixCls:r,buttonProps:n,close:i,autoFocus:s,emitEvent:a,isSilent:c,quitOnNullishReturnValue:l,actionFn:u}=e,f=cs.useRef(!1),d=cs.useRef(null),[m,p]=Fs(!1),g=(...b)=>{i?.(...b)};cs.useEffect(()=>{let b=null;return s&&(b=setTimeout(()=>{d.current?.focus({preventScroll:!0})})),()=>{b&&clearTimeout(b)}},[s]);let y=b=>{qc(b)&&(p(!0),b.then((...h)=>{p(!1,!0),g.apply(void 0,h),f.current=!1},h=>{if(p(!1,!0),f.current=!1,!c?.())return Promise.reject(h)}))},x=b=>{if(f.current)return;if(f.current=!0,!u){g();return}let h;if(a){if(h=u(b),l&&!qc(h)){f.current=!1,g(b);return}}else if(u.length)h=u(i),f.current=!1;else if(h=u(),!qc(h)){g();return}y(h)};return cs.createElement(bn,{...uf(t),onClick:x,loading:m,prefixCls:r,...n,ref:d},o)},Ef=aM;var y0=$(require("react")),Hn=y0.default.createContext({}),{Provider:wf}=Hn;var lM=()=>{let{autoFocusButton:e,cancelButtonProps:t,cancelTextLocale:o,isSilent:r,mergedOkCancel:n,rootPrefixCls:i,close:s,onCancel:a,onConfirm:c,onClose:l}=(0,$f.useContext)(Hn);return n?$f.default.createElement(Ef,{isSilent:r,actionFn:a,close:(...u)=>{s?.(...u),c?.(!1),l?.()},autoFocus:e==="cancel",buttonProps:t,prefixCls:`${i}-btn`},o):null},Dg=lM;var Pf=$(require("react"));var cM=()=>{let{autoFocusButton:e,close:t,isSilent:o,okButtonProps:r,rootPrefixCls:n,okTextLocale:i,okType:s,onConfirm:a,onOk:c,onClose:l}=(0,Pf.useContext)(Hn);return Pf.default.createElement(Ef,{isSilent:o,type:s||"primary",actionFn:c,close:(...u)=>{t?.(...u),a?.(!0),l?.()},autoFocus:e==="ok",buttonProps:r,prefixCls:`${n}-btn`},i)},Fg=cM;var Jo=$(require("react"));var yn=$(require("react"));var C0=$(require("react")),Nf=C0.createContext({});var bi=$(require("react")),us=require("react");function zg(e,t,o){let r=t;return!r&&o&&(r=`${e}-${o}`),r}function S0(e,t){let o=e[`page${t?"Y":"X"}Offset`],r=`scroll${t?"Top":"Left"}`;if(typeof o!="number"){let n=e.document;o=n.documentElement[r],typeof o!="number"&&(o=n.body[r])}return o}function v0(e){let t=e.getBoundingClientRect(),o={left:t.left,top:t.top},r=e.ownerDocument,n=r.defaultView||r.parentWindow;return o.left+=S0(n),o.top+=S0(n,!0),o}var kn=$(require("react")),Vg=require("react");var Io=$(require("react"));var R0=$(require("react")),E0=R0.memo(({children:e})=>e,(e,{shouldUpdate:t})=>!t);function If(){return If=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},If.apply(this,arguments)}var uM=Io.default.forwardRef((e,t)=>{let{prefixCls:o,className:r,style:n,title:i,ariaId:s,footer:a,closable:c,closeIcon:l,onClose:u,children:f,bodyStyle:d,bodyProps:m,modalRender:p,onMouseDown:g,onMouseUp:y,holderRef:x,visible:b,forceRender:h,width:S,height:C,classNames:R,styles:v,isFixedPos:w,focusTrap:T}=e,{panel:I}=Io.default.useContext(Nf),P=(0,Io.useRef)(null),N=ir(x,I,P),[O]=Gm(b&&w&&T!==!1,()=>P.current);Io.default.useImperativeHandle(t,()=>({focus:()=>{P.current?.focus({preventScroll:!0})}}));let _={};S!==void 0&&(_.width=S),C!==void 0&&(_.height=C);let M=a?Io.default.createElement("div",{className:E(`${o}-footer`,R?.footer),style:{...v?.footer}},a):null,A=i?Io.default.createElement("div",{className:E(`${o}-header`,R?.header),style:{...v?.header}},Io.default.createElement("div",{className:E(`${o}-title`,R?.title),id:s,style:{...v?.title}},i)):null,V=(0,Io.useMemo)(()=>typeof c=="object"&&c!==null?c:c?{closeIcon:l??Io.default.createElement("span",{className:`${o}-close-x`})}:{},[c,l,o]),F=Ht(V,!0),G=typeof c=="object"&&c.disabled,z=c?Io.default.createElement("button",If({type:"button",onClick:u,"aria-label":"Close"},F,{className:E(`${o}-close`,R?.close),disabled:G,style:v?.close}),V.closeIcon):null,B=Io.default.createElement("div",{className:E(`${o}-container`,R?.container),style:v?.container},z,A,Io.default.createElement("div",If({className:E(`${o}-body`,R?.body),style:{...d,...v?.body}},m),f),M);return Io.default.createElement("div",{key:"dialog-element",role:"dialog","aria-labelledby":i?s:null,"aria-modal":"true",ref:N,style:{...n,..._},className:E(o,r),onMouseDown:g,onMouseUp:y,tabIndex:-1,onFocus:k=>{O(k.target)}},Io.default.createElement(E0,{shouldUpdate:b||h},p?p(B):B))}),xl=uM;function Bg(){return Bg=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Bg.apply(this,arguments)}var fM=kn.forwardRef((e,t)=>{let{prefixCls:o,title:r,style:n,className:i,visible:s,forceRender:a,destroyOnHidden:c,motionName:l,ariaId:u,onVisibleChanged:f,mousePosition:d}=e,m=(0,Vg.useRef)(null),p=(0,Vg.useRef)(null);kn.useImperativeHandle(t,()=>({...p.current,inMotion:m.current.inMotion,enableMotion:m.current.enableMotion}));let[g,y]=kn.useState(),x={};g&&(x.transformOrigin=g);function b(){if(!m.current?.nativeElement)return;let h=v0(m.current.nativeElement);y(d&&(d.x||d.y)?`${d.x-h.left}px ${d.y-h.top}px`:"")}return kn.createElement(oo,{visible:s,onVisibleChanged:f,onAppearPrepare:b,onEnterPrepare:b,forceRender:a,motionName:l,removeOnLeave:c,ref:m},({className:h,style:S},C)=>kn.createElement(xl,Bg({},e,{ref:p,title:r,ariaId:u,prefixCls:o,holderRef:C,style:{...S,...n,...x},className:E(i,h)})))}),w0=fM;var kg=$(require("react"));function Hg(){return Hg=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Hg.apply(this,arguments)}var dM=e=>{let{prefixCls:t,style:o,visible:r,maskProps:n,motionName:i,className:s}=e;return kg.createElement(oo,{key:"mask",visible:r,motionName:i,leavedClassName:`${t}-mask-hidden`},({className:a,style:c},l)=>kg.createElement("div",Hg({ref:l,style:{...c,...o},className:E(`${t}-mask`,a,s)},n)))},$0=dM;function bl(){return bl=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},bl.apply(this,arguments)}var mM=e=>{let{prefixCls:t="rc-dialog",zIndex:o,visible:r=!1,focusTriggerAfterClose:n=!0,wrapStyle:i,wrapClassName:s,wrapProps:a,onClose:c,afterOpenChange:l,afterClose:u,transitionName:f,animation:d,closable:m=!0,mask:p=!0,maskTransitionName:g,maskAnimation:y,maskClosable:x=!0,maskStyle:b,maskProps:h,rootClassName:S,rootStyle:C,classNames:R,styles:v}=e,w=(0,us.useRef)(null),T=(0,us.useRef)(null),I=(0,us.useRef)(null),[P,N]=bi.useState(r),[O,_]=bi.useState(!1),M=xo();function A(){Li(T.current,document.activeElement)||(w.current=document.activeElement)}function V(){Li(T.current,document.activeElement)||I.current?.focus()}function F(){if(N(!1),p&&w.current&&n){try{w.current.focus({preventScroll:!0})}catch{}w.current=null}P&&u?.()}function G(L){L?V():F(),l?.(L)}function z(L){c?.(L)}let B=(0,us.useRef)(!1),k=null;x&&(k=L=>{T.current===L.target&&B.current&&z(L)});function W(L){B.current=L.target===T.current}(0,us.useEffect)(()=>{if(r){if(B.current=!1,N(!0),A(),T.current){let L=getComputedStyle(T.current);_(L.position==="fixed")}}else P&&I.current.enableMotion()&&!I.current.inMotion()&&F()},[r]);let j={zIndex:o,...i,...v?.wrapper,display:P?null:"none"};return bi.createElement("div",bl({className:E(`${t}-root`,S),style:C},Ht(e,{data:!0})),bi.createElement($0,{prefixCls:t,visible:p&&r,motionName:zg(t,g,y),style:{zIndex:o,...b,...v?.mask},maskProps:h,className:R?.mask}),bi.createElement("div",bl({className:E(`${t}-wrap`,s,R?.wrapper),ref:T,onClick:k,onMouseDown:W,style:j},a),bi.createElement(w0,bl({},e,{isFixedPos:O,ref:I,closable:m,ariaId:M,prefixCls:t,visible:r&&P,onClose:z,onVisibleChanged:G,motionName:zg(t,f,d)}))))},P0=mM;function Wg(){return Wg=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Wg.apply(this,arguments)}var pM=e=>{let{visible:t,getContainer:o,forceRender:r,destroyOnHidden:n=!1,afterClose:i,closable:s,panelRef:a,keyboard:c=!0,scrollLock:l=!0,onClose:u}=e,{scrollLock:f,...d}=e,[m,p]=yn.useState(t),g=yn.useMemo(()=>({panel:a}),[a]),y=({top:x,event:b})=>{if(x&&c){b.stopPropagation(),u?.(b);return}};return yn.useEffect(()=>{t&&p(!0)},[t]),!r&&n&&!m?null:yn.createElement(Nf.Provider,{value:g},yn.createElement(Zi,{open:t||r||m,onEsc:y,autoDestroy:!1,getContainer:o,autoLock:l&&(t||m)},yn.createElement(P0,Wg({},d,{destroyOnHidden:n,afterClose:()=>{let x=s&&typeof s=="object"?s:{},{afterClose:b}=x||{};b?.(),i?.(),p(!1)}}))))},N0=pM;var I0=N0;var ch=$(require("react"));var Wn=$(require("react"));var mR=$(require("react"));var qo=$(require("react"));var T0=$(require("react")),en="RC_FORM_INTERNAL_HOOKS",xt=()=>{Gt(!1,"Can not find FormContext. Please make sure you wrap Field under Form.")},gM=T0.createContext({getFieldValue:xt,getFieldsValue:xt,getFieldError:xt,getFieldWarning:xt,getFieldsError:xt,isFieldsTouched:xt,isFieldTouched:xt,isFieldValidating:xt,isFieldsValidating:xt,resetFields:xt,setFields:xt,setFieldValue:xt,setFieldsValue:xt,validateFields:xt,submit:xt,getInternalHooks:()=>(xt(),{dispatch:xt,initEntityValue:xt,registerField:xt,useSubscribe:xt,setInitialValues:xt,destroyForm:xt,setCallbacks:xt,registerWatch:xt,getFields:xt,setValidateMessages:xt,setPreserve:xt,getInitialValue:xt})}),tn=gM;var M0=$(require("react")),hM=M0.createContext(null),yi=hM;function yl(e){return e==null?[]:Array.isArray(e)?e:[e]}function O0(e){return e&&!!e._init}function Tf(){return{default:"Validation error on field %s",required:"%s is required",enum:"%s must be one of %s",whitespace:"%s cannot be empty",date:{format:"%s date %s is invalid for format %s",parse:"%s date could not be parsed, %s is invalid ",invalid:"%s date %s is invalid"},types:{string:"%s is not a %s",method:"%s is not a %s (function)",array:"%s is not an %s",object:"%s is not an %s",number:"%s is not a %s",date:"%s is not a %s",boolean:"%s is not a %s",integer:"%s is not an %s",float:"%s is not a %s",regexp:"%s is not a valid %s",email:"%s is not a valid %s",tel:"%s is not a valid %s",url:"%s is not a valid %s",hex:"%s is not a valid %s"},string:{len:"%s must be exactly %s characters",min:"%s must be at least %s characters",max:"%s cannot be longer than %s characters",range:"%s must be between %s and %s characters"},number:{len:"%s must equal %s",min:"%s cannot be less than %s",max:"%s cannot be greater than %s",range:"%s must be between %s and %s"},array:{len:"%s must be exactly %s in length",min:"%s cannot be less than %s in length",max:"%s cannot be greater than %s in length",range:"%s must be between %s and %s in length"},pattern:{mismatch:"%s value %s does not match pattern %s"},clone(){let e=JSON.parse(JSON.stringify(this));return e.clone=this.clone,e}}}var Mf=Tf();var xM=/%[sdj%]/g,_0=()=>{};typeof process<"u"&&process.env;function Of(e){if(!e||!e.length)return null;let t={};return e.forEach(o=>{let r=o.field;t[r]=t[r]||[],t[r].push(o)}),t}function ro(e,...t){let o=0,r=t.length;return typeof e=="function"?e.apply(null,t):typeof e=="string"?e.replace(xM,i=>{if(i==="%%")return"%";if(o>=r)return i;switch(i){case"%s":return String(t[o++]);case"%d":return Number(t[o++]);case"%j":try{return JSON.stringify(t[o++])}catch{return"[Circular]"}break;default:return i}}):e}function bM(e){return e==="string"||e==="url"||e==="hex"||e==="email"||e==="date"||e==="pattern"||e==="tel"}function nt(e,t){return!!(e==null||t==="array"&&Array.isArray(e)&&!e.length||bM(t)&&typeof e=="string"&&!e)}function yM(e,t,o){let r=[],n=0,i=e.length;function s(a){r.push(...a||[]),n++,n===i&&o(r)}e.forEach(a=>{t(a,s)})}function A0(e,t,o){let r=0,n=e.length;function i(s){if(s&&s.length){o(s);return}let a=r;r=r+1,a<n?t(e[a],i):o([])}i([])}function CM(e){let t=[];return Object.keys(e).forEach(o=>{t.push(...e[o]||[])}),t}var Af=class extends Error{errors;fields;constructor(t,o){super("Async Validation Error"),this.errors=t,this.fields=o}};function L0(e,t,o,r,n){if(t.first){let f=new Promise((d,m)=>{let p=y=>(r(y),y.length?m(new Af(y,Of(y))):d(n)),g=CM(e);A0(g,o,p)});return f.catch(d=>d),f}let i=t.firstFields===!0?Object.keys(e):t.firstFields||[],s=Object.keys(e),a=s.length,c=0,l=[],u=new Promise((f,d)=>{let m=p=>{if(l.push.apply(l,p),c++,c===a)return r(l),l.length?d(new Af(l,Of(l))):f(n)};s.length||(r(l),f(n)),s.forEach(p=>{let g=e[p];i.indexOf(p)!==-1?A0(g,o,m):yM(g,o,m)})});return u.catch(f=>f),u}function SM(e){return!!(e&&e.message!==void 0)}function vM(e,t){let o=e;for(let r=0;r<t.length;r++){if(o==null)return o;o=o[t[r]]}return o}function jg(e,t){return o=>{let r;return e.fullFields?r=vM(t,e.fullFields):r=t[o.field||e.fullField],SM(o)?(o.field=o.field||e.fullField,o.fieldValue=r,o):{message:typeof o=="function"?o():o,fieldValue:r,field:o.field||e.fullField}}}function Ug(e,t){if(t){for(let o in t)if(t.hasOwnProperty(o)){let r=t[o];typeof r=="object"&&typeof e[o]=="object"?e[o]={...e[o],...r}:e[o]=r}}return e}var da="enum",RM=(e,t,o,r,n)=>{e[da]=Array.isArray(e[da])?e[da]:[],e[da].indexOf(t)===-1&&r.push(ro(n.messages[da],e.fullField,e[da].join(", ")))},D0=RM;var EM=(e,t,o,r,n)=>{e.pattern&&(e.pattern instanceof RegExp?(e.pattern.lastIndex=0,e.pattern.test(t)||r.push(ro(n.messages.pattern.mismatch,e.fullField,t,e.pattern))):typeof e.pattern=="string"&&(new RegExp(e.pattern).test(t)||r.push(ro(n.messages.pattern.mismatch,e.fullField,t,e.pattern))))},F0=EM;var wM=(e,t,o,r,n)=>{let i=typeof e.len=="number",s=typeof e.min=="number",a=typeof e.max=="number",c=/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,l=t,u=null,f=typeof t=="number",d=typeof t=="string",m=Array.isArray(t);if(f?u="number":d?u="string":m&&(u="array"),!u)return!1;m&&(l=t.length),d&&(l=t.replace(c,"_").length),i?l!==e.len&&r.push(ro(n.messages[u].len,e.fullField,e.len)):s&&!a&&l<e.min?r.push(ro(n.messages[u].min,e.fullField,e.min)):a&&!s&&l>e.max?r.push(ro(n.messages[u].max,e.fullField,e.max)):s&&a&&(l<e.min||l>e.max)&&r.push(ro(n.messages[u].range,e.fullField,e.min,e.max))},z0=wM;var $M=(e,t,o,r,n,i)=>{e.required&&(!o.hasOwnProperty(e.field)||nt(t,i||e.type))&&r.push(ro(n.messages.required,e.fullField))},_f=$M;var Lf,B0=(()=>{if(Lf)return Lf;let e="[a-fA-F\\d:]",t=C=>C&&C.includeBoundaries?`(?:(?<=\\s|^)(?=${e})|(?<=${e})(?=\\s|$))`:"",o="(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)){3}",r="[a-fA-F\\d]{1,4}",s=`(?:${[`(?:${r}:){7}(?:${r}|:)`,`(?:${r}:){6}(?:${o}|:${r}|:)`,`(?:${r}:){5}(?::${o}|(?::${r}){1,2}|:)`,`(?:${r}:){4}(?:(?::${r}){0,1}:${o}|(?::${r}){1,3}|:)`,`(?:${r}:){3}(?:(?::${r}){0,2}:${o}|(?::${r}){1,4}|:)`,`(?:${r}:){2}(?:(?::${r}){0,3}:${o}|(?::${r}){1,5}|:)`,`(?:${r}:){1}(?:(?::${r}){0,4}:${o}|(?::${r}){1,6}|:)`,`(?::(?:(?::${r}){0,5}:${o}|(?::${r}){1,7}|:))`].join("|")})(?:%[0-9a-zA-Z]{1,})?`,a=new RegExp(`(?:^${o}$)|(?:^${s}$)`),c=new RegExp(`^${o}$`),l=new RegExp(`^${s}$`),u=C=>C&&C.exact?a:new RegExp(`(?:${t(C)}${o}${t(C)})|(?:${t(C)}${s}${t(C)})`,"g");u.v4=C=>C&&C.exact?c:new RegExp(`${t(C)}${o}${t(C)}`,"g"),u.v6=C=>C&&C.exact?l:new RegExp(`${t(C)}${s}${t(C)}`,"g");let f="(?:(?:[a-z]+:)?//)",d="(?:\\S+(?::\\S*)?@)?",m=u.v4().source,p=u.v6().source,S=`(?:${f}|www\\.)${d}(?:localhost|${m}|${p}|(?:(?:[a-z\\u00a1-\\uffff0-9][-_]*)*[a-z\\u00a1-\\uffff0-9]+)(?:\\.(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)*(?:\\.(?:[a-z\\u00a1-\\uffff]{2,})))(?::\\d{2,5})?(?:[/?#][^\\s"]*)?`;return Lf=new RegExp(`(?:^${S}$)`,"i"),Lf});var qg={email:/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+\.)+[a-zA-Z\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]{2,}))$/,tel:/^(\+[0-9]{1,3}[-\s\u2011]?)?(\([0-9]{1,4}\)[-\s\u2011]?)?([0-9]+[-\s\u2011]?)*[0-9]+$/,hex:/^#?([a-f0-9]{6}|[a-f0-9]{3})$/i},Cl={integer(e){return Cl.number(e)&&parseInt(e,10)===e},float(e){return Cl.number(e)&&!Cl.integer(e)},array(e){return Array.isArray(e)},regexp(e){if(e instanceof RegExp)return!0;try{return!!new RegExp(e)}catch{return!1}},date(e){return typeof e.getTime=="function"&&typeof e.getMonth=="function"&&typeof e.getYear=="function"&&!isNaN(e.getTime())},number(e){return isNaN(e)?!1:typeof e=="number"},object(e){return typeof e=="object"&&!Cl.array(e)},method(e){return typeof e=="function"},email(e){return typeof e=="string"&&e.length<=320&&!!e.match(qg.email)},tel(e){return typeof e=="string"&&e.length<=32&&!!e.match(qg.tel)},url(e){return typeof e=="string"&&e.length<=2048&&!!e.match(B0())},hex(e){return typeof e=="string"&&!!e.match(qg.hex)}},PM=(e,t,o,r,n)=>{if(e.required&&t===void 0){_f(e,t,o,r,n);return}let i=["integer","float","array","regexp","object","method","email","tel","number","date","url","hex"],s=e.type;i.indexOf(s)>-1?Cl[s](t)||r.push(ro(n.messages.types[s],e.fullField,e.type)):s&&typeof t!==e.type&&r.push(ro(n.messages.types[s],e.fullField,e.type))},V0=PM;var NM=(e,t,o,r,n)=>{(/^\s+$/.test(t)||t==="")&&r.push(ro(n.messages.whitespace,e.fullField))},H0=NM;var Te={required:_f,whitespace:H0,type:V0,range:z0,enum:D0,pattern:F0};var IM=(e,t,o,r,n)=>{let i=[];if(e.required||!e.required&&r.hasOwnProperty(e.field)){if(nt(t)&&!e.required)return o();Te.required(e,t,r,i,n)}o(i)},k0=IM;var TM=(e,t,o,r,n)=>{let i=[];if(e.required||!e.required&&r.hasOwnProperty(e.field)){if(t==null&&!e.required)return o();Te.required(e,t,r,i,n,"array"),t!=null&&(Te.type(e,t,r,i,n),Te.range(e,t,r,i,n))}o(i)},W0=TM;var MM=(e,t,o,r,n)=>{let i=[];if(e.required||!e.required&&r.hasOwnProperty(e.field)){if(nt(t)&&!e.required)return o();Te.required(e,t,r,i,n),t!==void 0&&Te.type(e,t,r,i,n)}o(i)},j0=MM;var OM=(e,t,o,r,n)=>{let i=[];if(e.required||!e.required&&r.hasOwnProperty(e.field)){if(nt(t,"date")&&!e.required)return o();if(Te.required(e,t,r,i,n),!nt(t,"date")){let a;t instanceof Date?a=t:a=new Date(t),Te.type(e,a,r,i,n),a&&Te.range(e,a.getTime(),r,i,n)}}o(i)},U0=OM;var AM="enum",_M=(e,t,o,r,n)=>{let i=[];if(e.required||!e.required&&r.hasOwnProperty(e.field)){if(nt(t)&&!e.required)return o();Te.required(e,t,r,i,n),t!==void 0&&Te[AM](e,t,r,i,n)}o(i)},q0=_M;var LM=(e,t,o,r,n)=>{let i=[];if(e.required||!e.required&&r.hasOwnProperty(e.field)){if(nt(t)&&!e.required)return o();Te.required(e,t,r,i,n),t!==void 0&&(Te.type(e,t,r,i,n),Te.range(e,t,r,i,n))}o(i)},G0=LM;var DM=(e,t,o,r,n)=>{let i=[];if(e.required||!e.required&&r.hasOwnProperty(e.field)){if(nt(t)&&!e.required)return o();Te.required(e,t,r,i,n),t!==void 0&&(Te.type(e,t,r,i,n),Te.range(e,t,r,i,n))}o(i)},X0=DM;var FM=(e,t,o,r,n)=>{let i=[];if(e.required||!e.required&&r.hasOwnProperty(e.field)){if(nt(t)&&!e.required)return o();Te.required(e,t,r,i,n),t!==void 0&&Te.type(e,t,r,i,n)}o(i)},K0=FM;var zM=(e,t,o,r,n)=>{let i=[];if(e.required||!e.required&&r.hasOwnProperty(e.field)){if(t===""&&(t=void 0),nt(t)&&!e.required)return o();Te.required(e,t,r,i,n),t!==void 0&&(Te.type(e,t,r,i,n),Te.range(e,t,r,i,n))}o(i)},Y0=zM;var BM=(e,t,o,r,n)=>{let i=[];if(e.required||!e.required&&r.hasOwnProperty(e.field)){if(nt(t)&&!e.required)return o();Te.required(e,t,r,i,n),t!==void 0&&Te.type(e,t,r,i,n)}o(i)},Q0=BM;var VM=(e,t,o,r,n)=>{let i=[];if(e.required||!e.required&&r.hasOwnProperty(e.field)){if(nt(t,"string")&&!e.required)return o();Te.required(e,t,r,i,n),nt(t,"string")||Te.pattern(e,t,r,i,n)}o(i)},Z0=VM;var HM=(e,t,o,r,n)=>{let i=[];if(e.required||!e.required&&r.hasOwnProperty(e.field)){if(nt(t)&&!e.required)return o();Te.required(e,t,r,i,n),nt(t)||Te.type(e,t,r,i,n)}o(i)},J0=HM;var kM=(e,t,o,r,n)=>{let i=[],s=Array.isArray(t)?"array":typeof t;Te.required(e,t,r,i,n,s),o(i)},eR=kM;var WM=(e,t,o,r,n)=>{let i=[];if(e.required||!e.required&&r.hasOwnProperty(e.field)){if(nt(t,"string")&&!e.required)return o();Te.required(e,t,r,i,n,"string"),nt(t,"string")||(Te.type(e,t,r,i,n),Te.range(e,t,r,i,n),Te.pattern(e,t,r,i,n),e.whitespace===!0&&Te.whitespace(e,t,r,i,n))}o(i)},tR=WM;var jM=(e,t,o,r,n)=>{let i=e.type,s=[];if(e.required||!e.required&&r.hasOwnProperty(e.field)){if(nt(t,i)&&!e.required)return o();Te.required(e,t,r,s,n,i),nt(t,i)||Te.type(e,t,r,s,n)}o(s)},Sl=jM;var ma={string:tR,method:K0,number:Y0,boolean:j0,regexp:J0,integer:X0,float:G0,array:W0,object:Q0,enum:q0,pattern:Z0,date:U0,url:Sl,hex:Sl,email:Sl,tel:Sl,required:eR,any:k0};var Gg=class e{static register=function(o,r){if(typeof r!="function")throw new Error("Cannot register a validator by type, validator is not a function");ma[o]=r};static warning=_0;static messages=Mf;static validators=ma;rules=null;_messages=Mf;constructor(t){this.define(t)}define(t){if(!t)throw new Error("Cannot configure a schema with no rules");if(typeof t!="object"||Array.isArray(t))throw new Error("Rules must be an object");this.rules={},Object.keys(t).forEach(o=>{let r=t[o];this.rules[o]=Array.isArray(r)?r:[r]})}messages(t){return t&&(this._messages=Ug(Tf(),t)),this._messages}validate(t,o={},r=()=>{}){let n=t,i=o,s=r;if(typeof i=="function"&&(s=i,i={}),!this.rules||Object.keys(this.rules).length===0)return s&&s(null,n),Promise.resolve(n);function a(f){let d=[],m={};function p(g){Array.isArray(g)?d=d.concat(...g):d.push(g)}for(let g=0;g<f.length;g++)p(f[g]);d.length?(m=Of(d),s(d,m)):s(null,n)}if(i.messages){let f=this.messages();f===Mf&&(f=Tf()),Ug(f,i.messages),i.messages=f}else i.messages=this.messages();let c={};(i.keys||Object.keys(this.rules)).forEach(f=>{let d=this.rules[f],m=n[f];d.forEach(p=>{let g=p;typeof g.transform=="function"&&(n===t&&(n={...n}),m=n[f]=g.transform(m),m!=null&&(g.type=g.type||(Array.isArray(m)?"array":typeof m))),typeof g=="function"?g={validator:g}:g={...g},g.validator=this.getValidationMethod(g),g.validator&&(g.field=f,g.fullField=g.fullField||f,g.type=this.getType(g),c[f]=c[f]||[],c[f].push({rule:g,value:m,source:n,field:f}))})});let u={};return L0(c,i,(f,d)=>{let m=f.rule,p=(m.type==="object"||m.type==="array")&&(typeof m.fields=="object"||typeof m.defaultField=="object");p=p&&(m.required||!m.required&&f.value),m.field=f.field;function g(b,h){return{...h,fullField:`${m.fullField}.${b}`,fullFields:m.fullFields?[...m.fullFields,b]:[b]}}function y(b=[]){let h=Array.isArray(b)?b:[b];!i.suppressWarning&&h.length&&e.warning("async-validator:",h),h.length&&m.message!==void 0&&m.message!==null&&(h=[].concat(m.message));let S=h.map(jg(m,n));if(i.first&&S.length)return u[m.field]=1,d(S);if(!p)d(S);else{if(m.required&&!f.value)return m.message!==void 0?S=[].concat(m.message).map(jg(m,n)):i.error&&(S=[i.error(m,ro(i.messages.required,m.field))]),d(S);let C={};m.defaultField&&Object.keys(f.value).map(w=>{C[w]=m.defaultField}),C={...C,...f.rule.fields};let R={};Object.keys(C).forEach(w=>{let T=C[w],I=Array.isArray(T)?T:[T];R[w]=I.map(g.bind(null,w))});let v=new e(R);v.messages(i.messages),f.rule.options&&(f.rule.options.messages=i.messages,f.rule.options.error=i.error),v.validate(f.value,f.rule.options||i,w=>{let T=[];S&&S.length&&T.push(...S),w&&w.length&&T.push(...w),d(T.length?T:null)})}}let x;if(m.asyncValidator)x=m.asyncValidator(m,f.value,y,f.source,i);else if(m.validator){try{x=m.validator(m,f.value,y,f.source,i)}catch(b){console.error?.(b),i.suppressValidatorError||setTimeout(()=>{throw b},0),y(b.message)}x===!0?y():x===!1?y(typeof m.message=="function"?m.message(m.fullField||m.field):m.message||`${m.fullField||m.field} fails`):x instanceof Array?y(x):x instanceof Error&&y(x.message)}x&&x.then&&x.then(()=>y(),b=>y(b))},f=>{a(f)},n)}getType(t){if(t.type===void 0&&t.pattern instanceof RegExp&&(t.type="pattern"),typeof t.validator!="function"&&t.type&&!ma.hasOwnProperty(t.type))throw new Error(ro("Unknown rule type %s",t.type));return t.type||"string"}getValidationMethod(t){if(typeof t.validator=="function")return t.validator;let o=Object.keys(t),r=o.indexOf("message");return r!==-1&&o.splice(r,1),o.length===1&&o[0]==="required"?ma.required:ma[this.getType(t)]||void 0}},oR=Gg;var Ff=$(require("react"));var Zo="'${name}' is not a valid ${type}",Df={default:"Validation error on field '${name}'",required:"'${name}' is required",enum:"'${name}' must be one of [${enum}]",whitespace:"'${name}' cannot be empty",date:{format:"'${name}' is invalid for format date",parse:"'${name}' could not be parsed as date",invalid:"'${name}' is invalid date"},types:{string:Zo,method:Zo,array:Zo,object:Zo,number:Zo,date:Zo,boolean:Zo,integer:Zo,float:Zo,regexp:Zo,email:Zo,tel:Zo,url:Zo,hex:Zo},string:{len:"'${name}' must be exactly ${len} characters",min:"'${name}' must be at least ${min} characters",max:"'${name}' cannot be longer than ${max} characters",range:"'${name}' must be between ${min} and ${max} characters"},number:{len:"'${name}' must equal ${len}",min:"'${name}' cannot be less than ${min}",max:"'${name}' cannot be greater than ${max}",range:"'${name}' must be between ${min} and ${max}"},array:{len:"'${name}' must be exactly ${len} in length",min:"'${name}' cannot be less than ${min} in length",max:"'${name}' cannot be greater than ${max} in length",range:"'${name}' must be between ${min} and ${max} in length"},pattern:{mismatch:"'${name}' does not match pattern ${pattern}"}};var rR=oR;function UM(e,t){return e.replace(/\\?\$\{\w+\}/g,o=>{if(o.startsWith("\\"))return o.slice(1);let r=o.slice(2,-1);return t[r]})}var nR="CODE_LOGIC_ERROR";async function Xg(e,t,o,r,n){let i={...o};if(delete i.ruleIndex,rR.warning=()=>{},i.validator){let d=i.validator;i.validator=(...m)=>{try{return d(...m)}catch(p){return console.error(p),Promise.reject(nR)}}}let s=null;i&&i.type==="array"&&i.defaultField&&(s=i.defaultField,delete i.defaultField);let a=new rR({[e]:[i]}),c=dn(Df,r.validateMessages);a.messages(c);let l=[];try{await Promise.resolve(a.validate({[e]:t},{...r}))}catch(d){d.errors&&(l=d.errors.map(({message:m},p)=>{let g=m===nR?c.default:m;return Ff.isValidElement(g)?Ff.cloneElement(g,{key:`error_${p}`}):g}))}if(!l.length&&s&&Array.isArray(t)&&t.length>0)return(await Promise.all(t.map((m,p)=>Xg(`${e}.${p}`,m,s,r,n)))).reduce((m,p)=>[...m,...p],[]);let u={...o,name:e,enum:(o.enum||[]).join(", "),...n};return l.map(d=>typeof d=="string"?UM(d,u):d)}function iR(e,t,o,r,n,i){let s=e.join("."),a=o.map((l,u)=>{let f=l.validator,d={...l,ruleIndex:u};return f&&(d.validator=(m,p,g)=>{let y=!1,b=f(m,p,(...h)=>{Promise.resolve().then(()=>{Gt(!y,"Your validator function has already return a promise. `callback` will be ignored."),y||g(...h)})});y=b&&typeof b.then=="function"&&typeof b.catch=="function",Gt(y,"`callback` is deprecated. Please return a promise instead."),y&&b.then(()=>{g()}).catch(h=>{g(h||" ")})}),d}).sort(({warningOnly:l,ruleIndex:u},{warningOnly:f,ruleIndex:d})=>!!l==!!f?u-d:l?1:-1),c;if(n===!0)c=new Promise(async(l,u)=>{for(let f=0;f<a.length;f+=1){let d=a[f],m=await Xg(s,t,d,r,i);if(m.length){u([{errors:m,rule:d}]);return}}l([])});else{let l=a.map(u=>Xg(s,t,u,r,i).then(f=>({errors:f,rule:u})));c=(n?GM(l):qM(l)).then(u=>Promise.reject(u))}return c.catch(l=>l),c}async function qM(e){return Promise.all(e).then(t=>[].concat(...t))}async function GM(e){let t=0;return new Promise(o=>{e.forEach(r=>{r.then(n=>{n.errors.length&&o([n]),t+=1,t===e.length&&o([])})})})}function Ot(e){return yl(e)}function Kg(e,t){let o={};return t.forEach(r=>{let n=co(e,r);o=Eo(o,r,n)}),o}function Ci(e,t,o=!1){return e&&e.some(r=>pa(t,r,o))}function pa(e,t,o=!1){return!e||!t||!o&&e.length!==t.length?!1:t.every((r,n)=>e[n]===r)}function sR(e,t){if(e===t)return!0;if(!e&&t||e&&!t||!e||!t||typeof e!="object"||typeof t!="object")return!1;let o=Object.keys(e),r=Object.keys(t);return[...new Set([...o,...r])].every(i=>{let s=e[i],a=t[i];return typeof s=="function"&&typeof a=="function"?!0:s===a})}function aR(e,...t){let o=t[0];return o&&o.target&&typeof o.target=="object"&&e in o.target?o.target[e]:o}function Yg(e,t,o){let{length:r}=e;if(t<0||t>=r||o<0||o>=r)return e;let n=e[t],i=t-o;return i>0?[...e.slice(0,o),n,...e.slice(o,t),...e.slice(t+1,r)]:i<0?[...e.slice(0,t),...e.slice(t+1,o+1),n,...e.slice(o+1,r)]:e}var Qg=e=>{let t=new MessageChannel;t.port1.onmessage=e,t.port2.postMessage(null)},vl=class{namePathList=[];taskId=0;watcherList=new Set;form;constructor(t){this.form=t}register(t){return this.watcherList.add(t),()=>{this.watcherList.delete(t)}}notify(t){t.forEach(o=>{this.namePathList.every(r=>!pa(r,o))&&this.namePathList.push(o)}),this.doBatch()}doBatch(){this.taskId+=1;let t=this.taskId;Qg(()=>{if(t===this.taskId&&this.watcherList.size){let o=this.form.getForm(),r=o.getFieldsValue(),n=o.getFieldsValue(!0);this.watcherList.forEach(i=>{i(r,n,this.namePathList)}),this.namePathList=[]}})}};async function Zg(){return new Promise(e=>{Qg(()=>{Ge(()=>{e()})})})}function eh(){return eh=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},eh.apply(this,arguments)}var fs=[],Rl=[];function Jg(e,t,o,r,n,i){return typeof e=="function"?e(t,o,"source"in i?{source:i.source}:{}):r!==n}var th=class extends qo.PureComponent{static contextType=tn;state={resetCount:0};cancelRegisterFunc=null;mounted=!1;touched=!1;dirty=!1;validatePromise;prevValidating;errors=fs;warnings=Rl;constructor(t){if(super(t),t.fieldContext){let{getInternalHooks:o}=t.fieldContext,{initEntityValue:r}=o(en);r(this)}}componentDidMount(){let{shouldUpdate:t,fieldContext:o}=this.props;if(this.mounted=!0,o){let{getInternalHooks:r}=o,{registerField:n}=r(en);this.cancelRegisterFunc=n(this)}t===!0&&this.reRender()}componentWillUnmount(){this.cancelRegister(),this.triggerMetaEvent(!0),this.mounted=!1}cancelRegister=()=>{let{preserve:t,isListField:o,name:r}=this.props;this.cancelRegisterFunc&&this.cancelRegisterFunc(o,t,Ot(r)),this.cancelRegisterFunc=null};getNamePath=()=>{let{name:t,fieldContext:o}=this.props,{prefixName:r=[]}=o;return t!==void 0?[...r,...t]:[]};getRules=()=>{let{rules:t=[],fieldContext:o}=this.props;return t.map(r=>typeof r=="function"?r(o):r)};reRender(){this.mounted&&this.forceUpdate()}refresh=()=>{this.mounted&&this.setState(({resetCount:t})=>({resetCount:t+1}))};metaCache=null;triggerMetaEvent=t=>{let{onMetaChange:o}=this.props;if(o){let r={...this.getMeta(),destroy:t};Di(this.metaCache,r)||o(r),this.metaCache=r}else this.metaCache=null};onStoreChange=(t,o,r)=>{let{shouldUpdate:n,dependencies:i=[],onReset:s}=this.props,{store:a}=r,c=this.getNamePath(),l=this.getValue(t),u=this.getValue(a),f=o&&Ci(o,c);switch(r.type==="valueUpdate"&&r.source==="external"&&!Di(l,u)&&(this.touched=!0,this.dirty=!0,this.validatePromise=null,this.errors=fs,this.warnings=Rl,this.triggerMetaEvent()),r.type){case"reset":if(!o||f){this.touched=!1,this.dirty=!1,this.validatePromise=void 0,this.errors=fs,this.warnings=Rl,this.triggerMetaEvent(),s?.(),this.refresh();return}break;case"remove":{if(n&&Jg(n,t,a,l,u,r)){this.reRender();return}break}case"setField":{let{data:d}=r;if(f){"touched"in d&&(this.touched=d.touched),"validating"in d&&!("originRCField"in d)&&(this.validatePromise=d.validating?Promise.resolve([]):null),"errors"in d&&(this.errors=d.errors||fs),"warnings"in d&&(this.warnings=d.warnings||Rl),this.dirty=!0,this.triggerMetaEvent(),this.reRender();return}else if("value"in d&&Ci(o,c,!0)){this.reRender();return}if(n&&!c.length&&Jg(n,t,a,l,u,r)){this.reRender();return}break}case"dependenciesUpdate":{if(i.map(Ot).some(m=>Ci(r.relatedFields,m))){this.reRender();return}break}default:if(f||(!i.length||c.length||n)&&Jg(n,t,a,l,u,r)){this.reRender();return}break}n===!0&&this.reRender()};validateRules=t=>{let o=this.getNamePath(),r=this.getValue(),{triggerName:n,validateOnly:i=!1,delayFrame:s}=t||{},a=Promise.resolve().then(async()=>{if(!this.mounted)return[];let{validateFirst:c=!1,messageVariables:l,validateDebounce:u}=this.props;s&&await Zg();let f=this.getRules();if(n&&(f=f.filter(m=>m).filter(m=>{let{validateTrigger:p}=m;return p?yl(p).includes(n):!0})),u&&n&&(await new Promise(m=>{setTimeout(m,u)}),this.validatePromise!==a))return[];let d=iR(o,r,f,t,c,l);return d.catch(m=>m).then((m=fs)=>{if(this.validatePromise===a){this.validatePromise=null;let p=[],g=[];m.forEach?.(({rule:{warningOnly:y},errors:x=fs})=>{y?g.push(...x):p.push(...x)}),this.errors=p,this.warnings=g,this.triggerMetaEvent(),this.reRender()}}),d});return i||(this.validatePromise=a,this.dirty=!0,this.errors=fs,this.warnings=Rl,this.triggerMetaEvent(),this.reRender()),a};isFieldValidating=()=>!!this.validatePromise;isFieldTouched=()=>this.touched;isFieldDirty=()=>{if(this.dirty||this.props.initialValue!==void 0)return!0;let{fieldContext:t}=this.props,{getInitialValue:o}=t.getInternalHooks(en);return o(this.getNamePath())!==void 0};getErrors=()=>this.errors;getWarnings=()=>this.warnings;isListField=()=>this.props.isListField;isList=()=>this.props.isList;isPreserve=()=>this.props.preserve;getMeta=()=>(this.prevValidating=this.isFieldValidating(),{touched:this.isFieldTouched(),validating:this.prevValidating,errors:this.errors,warnings:this.warnings,name:this.getNamePath(),validated:this.validatePromise===null});getOnlyChild=t=>{if(typeof t=="function"){let r=this.getMeta();return{...this.getOnlyChild(t(this.getControlled(),r,this.props.fieldContext)),isFunction:!0}}let o=Ro(t);return o.length!==1||!qo.isValidElement(o[0])?{child:o,isFunction:!1}:{child:o[0],isFunction:!1}};getValue=t=>{let{getFieldsValue:o}=this.props.fieldContext,r=this.getNamePath();return co(t||o(!0),r)};getControlled=(t={})=>{let{name:o,trigger:r="onChange",validateTrigger:n,getValueFromEvent:i,normalize:s,valuePropName:a="value",getValueProps:c,fieldContext:l}=this.props,u=n!==void 0?n:l.validateTrigger,f=this.getNamePath(),{getInternalHooks:d,getFieldsValue:m}=l,{dispatch:p}=d(en),g=this.getValue(),y=c||(C=>({[a]:C})),x=t[r],b=o!==void 0?y(g):{},h={...t,...b};return h[r]=(...C)=>{this.touched=!0,this.dirty=!0,this.triggerMetaEvent();let R=this.getValue(),v;i?v=i(...C):v=aR(a,...C),s&&(v=s(v,R,m(!0))),v!==R&&p({type:"updateValue",namePath:f,value:v}),x&&x(...C)},yl(u||[]).forEach(C=>{let R=h[C];h[C]=(...v)=>{R&&R(...v);let{rules:w}=this.props;w&&w.length&&p({type:"validateField",namePath:f,triggerName:C})}}),h};render(){let{resetCount:t}=this.state,{children:o}=this.props,{child:r,isFunction:n}=this.getOnlyChild(o),i;return n?i=r:qo.isValidElement(r)?i=qo.cloneElement(r,this.getControlled(r.props)):(Gt(!r,"`children` of Field is not validate ReactElement."),i=r),qo.createElement(qo.Fragment,{key:t},i)}};function XM({name:e,...t}){let o=qo.useContext(tn),r=qo.useContext(yi),n=e!==void 0?Ot(e):void 0,i=t.isListField??!!r,s="keep";return i||(s=`_${(n||[]).join("_")}`),qo.createElement(th,eh({key:s,name:n,isListField:i},t,{fieldContext:o}))}var zf=XM;var mr=$(require("react"));function KM({name:e,initialValue:t,children:o,rules:r,validateTrigger:n,isListField:i}){let s=mr.useContext(tn),a=mr.useContext(yi),l=mr.useRef({keys:[],id:0}).current,u=mr.useMemo(()=>[...Ot(s.prefixName)||[],...Ot(e)],[s.prefixName,e]),f=mr.useMemo(()=>({...s,prefixName:u}),[s,u]),d=mr.useMemo(()=>({getKey:p=>{let g=u.length,y=p[g];return[l.keys[y],p.slice(g+1)]}}),[l,u]);if(typeof o!="function")return Gt(!1,"Form.List only accepts function as children."),null;let m=(p,g,{source:y})=>y==="internal"?!1:p!==g;return mr.createElement(yi.Provider,{value:d},mr.createElement(tn.Provider,{value:f},mr.createElement(zf,{name:[],shouldUpdate:m,rules:r,validateTrigger:n,initialValue:t,isList:!0,isListField:i??!!a},({value:p=[],onChange:g},y)=>{let{getFieldValue:x}=s,b=()=>x(u||[])||[],h={add:(C,R)=>{let v=b();R>=0&&R<=v.length?(l.keys=[...l.keys.slice(0,R),l.id,...l.keys.slice(R)],g([...v.slice(0,R),C,...v.slice(R)])):(l.keys=[...l.keys,l.id],g([...v,C])),l.id+=1},remove:C=>{let R=b(),v=new Set(Array.isArray(C)?C:[C]);v.size<=0||(l.keys=l.keys.filter((w,T)=>!v.has(T)),g(R.filter((w,T)=>!v.has(T))))},move(C,R){if(C===R)return;let v=b();C<0||C>=v.length||R<0||R>=v.length||(l.keys=Yg(l.keys,C,R),g(Yg(v,C,R)))}},S=p||[];return Array.isArray(S)||(S=[]),o(S.map((C,R)=>{let v=l.keys[R];return v===void 0&&(l.keys[R]=l.id,v=l.keys[R],l.id+=1),{name:R,key:v,isListField:!0}}),h,y)})))}var lR=KM;var Vf=$(require("react"));function cR(e){let t=!1,o=e.length,r=[];return e.length?new Promise((n,i)=>{e.forEach((s,a)=>{s.catch(c=>(t=!0,c)).then(c=>{o-=1,r[a]=c,!(o>0)&&(t&&i(r),n(r))})})}):Promise.resolve([])}var oh="__@field_split__";function Bf(e){return e.map(t=>`${typeof t}:${t}`).join(oh)}var rh=class{kvs=new Map;set(t,o){this.kvs.set(Bf(t),o)}get(t){return this.kvs.get(Bf(t))}getAsPrefix(t){let o=Bf(t),r=o+oh,n=[],i=this.kvs.get(o);return i!==void 0&&n.push(i),this.kvs.forEach((s,a)=>{a.startsWith(r)&&n.push(s)}),n}update(t,o){let r=this.get(t),n=o(r);n?this.set(t,n):this.delete(t)}delete(t){this.kvs.delete(Bf(t))}map(t){return[...this.kvs.entries()].map(([o,r])=>{let n=o.split(oh);return t({key:n.map(i=>{let[,s,a]=i.match(/^([^:]*):(.*)$/);return s==="number"?Number(a):a}),value:r})})}toJSON(){let t={};return this.map(({key:o,value:r})=>(t[o.join(".")]=r,null)),t}},ds=rh;var nh=class{formHooked=!1;forceRootUpdate;subscribable=!0;store={};fieldEntities=[];initialValues={};callbacks={};validateMessages=null;preserve=null;lastValidatePromise=null;watcherCenter=new vl(this);constructor(t){this.forceRootUpdate=t}getForm=()=>({getFieldValue:this.getFieldValue,getFieldsValue:this.getFieldsValue,getFieldError:this.getFieldError,getFieldWarning:this.getFieldWarning,getFieldsError:this.getFieldsError,isFieldsTouched:this.isFieldsTouched,isFieldTouched:this.isFieldTouched,isFieldValidating:this.isFieldValidating,isFieldsValidating:this.isFieldsValidating,resetFields:this.resetFields,setFields:this.setFields,setFieldValue:this.setFieldValue,setFieldsValue:this.setFieldsValue,validateFields:this.validateFields,submit:this.submit,_init:!0,getInternalHooks:this.getInternalHooks});getInternalHooks=t=>t===en?(this.formHooked=!0,{dispatch:this.dispatch,initEntityValue:this.initEntityValue,registerField:this.registerField,useSubscribe:this.useSubscribe,setInitialValues:this.setInitialValues,destroyForm:this.destroyForm,setCallbacks:this.setCallbacks,setValidateMessages:this.setValidateMessages,getFields:this.getFields,setPreserve:this.setPreserve,getInitialValue:this.getInitialValue,registerWatch:this.registerWatch}):(Gt(!1,"`getInternalHooks` is internal usage. Should not call directly."),null);useSubscribe=t=>{this.subscribable=t};prevWithoutPreserves=null;setInitialValues=(t,o)=>{if(this.initialValues=t||{},o){let r=dn(t,this.store);this.prevWithoutPreserves?.map(({key:n})=>{r=Eo(r,n,co(t,n))}),this.prevWithoutPreserves=null,this.updateStore(r)}};destroyForm=t=>{if(t)this.updateStore({});else{let o=new ds;this.getFieldEntities(!0).forEach(r=>{this.isMergedPreserve(r.isPreserve())||o.set(r.getNamePath(),!0)}),this.prevWithoutPreserves=o}};getInitialValue=t=>{let o=co(this.initialValues,t);return t.length?dn(o):o};setCallbacks=t=>{this.callbacks=t};setValidateMessages=t=>{this.validateMessages=t};setPreserve=t=>{this.preserve=t};registerWatch=t=>this.watcherCenter.register(t);notifyWatch=(t=[])=>{this.watcherCenter.notify(t)};timeoutId=null;warningUnhooked=()=>{};updateStore=t=>{this.store=t};getFieldEntities=(t=!1)=>t?this.fieldEntities.filter(o=>o.getNamePath().length):this.fieldEntities;getFieldsMap=(t=!1)=>{let o=new ds;return this.getFieldEntities(t).forEach(r=>{let n=r.getNamePath();o.set(n,r)}),o};getFieldEntitiesForNamePathList=(t,o=!1)=>{if(!t)return this.getFieldEntities(!0);let r=this.getFieldsMap(!0);return o?t.flatMap(n=>{let i=Ot(n),s=r.getAsPrefix(i);return s.length?s:[{INVALIDATE_NAME_PATH:i}]}):t.map(n=>{let i=Ot(n);return r.get(i)||{INVALIDATE_NAME_PATH:Ot(n)}})};getFieldsValue=(t,o)=>{this.warningUnhooked();let r,n;if(t===!0||Array.isArray(t)?(r=t,n=o):t&&typeof t=="object"&&(n=t.filter),r===!0&&!n)return this.store;let i=this.getFieldEntitiesForNamePathList(Array.isArray(r)?r:null,!0),s=[],a=[];i.forEach(l=>{let u=l.INVALIDATE_NAME_PATH||l.getNamePath();if(l.isList?.()){a.push(u);return}if(!n)s.push(u);else{let f="getMeta"in l?l.getMeta():null;n(f)&&s.push(u)}});let c=Kg(this.store,s.map(Ot));return a.forEach(l=>{co(c,l)||(c=Eo(c,l,[]))}),c};getFieldValue=t=>{this.warningUnhooked();let o=Ot(t);return co(this.store,o)};getFieldsError=t=>(this.warningUnhooked(),this.getFieldEntitiesForNamePathList(t).map((r,n)=>r&&!r.INVALIDATE_NAME_PATH?{name:r.getNamePath(),errors:r.getErrors(),warnings:r.getWarnings()}:{name:Ot(t[n]),errors:[],warnings:[]}));getFieldError=t=>{this.warningUnhooked();let o=Ot(t);return this.getFieldsError([o])[0].errors};getFieldWarning=t=>{this.warningUnhooked();let o=Ot(t);return this.getFieldsError([o])[0].warnings};isFieldsTouched=(...t)=>{this.warningUnhooked();let[o,r]=t,n,i=!1;t.length===0?n=null:t.length===1?Array.isArray(o)?(n=o.map(Ot),i=!1):(n=null,i=o):(n=o.map(Ot),i=r);let s=this.getFieldEntities(!0),a=f=>f.isFieldTouched();if(!n)return i?s.every(f=>a(f)||f.isList()):s.some(a);let c=new ds;n.forEach(f=>{c.set(f,[])}),s.forEach(f=>{let d=f.getNamePath();n.forEach(m=>{m.every((p,g)=>d[g]===p)&&c.update(m,p=>[...p,f])})});let l=f=>f.some(a),u=c.map(({value:f})=>f);return i?u.every(l):u.some(l)};isFieldTouched=t=>(this.warningUnhooked(),this.isFieldsTouched([t]));isFieldsValidating=t=>{this.warningUnhooked();let o=this.getFieldEntities();if(!t)return o.some(n=>n.isFieldValidating());let r=t.map(Ot);return o.some(n=>{let i=n.getNamePath();return Ci(r,i)&&n.isFieldValidating()})};isFieldValidating=t=>(this.warningUnhooked(),this.isFieldsValidating([t]));resetWithFieldInitialValue=(t={})=>{let o=new ds,r=this.getFieldEntities(!0);r.forEach(s=>{let{initialValue:a}=s.props,c=s.getNamePath();if(a!==void 0){let l=o.get(c)||new Set;l.add({entity:s,value:a}),o.set(c,l)}});let n=s=>{s.forEach(a=>{let{initialValue:c}=a.props;if(c!==void 0){let l=a.getNamePath();if(this.getInitialValue(l)!==void 0)Gt(!1,`Form already set 'initialValues' with path '${l.join(".")}'. Field can not overwrite it.`);else{let f=o.get(l);if(f&&f.size>1)Gt(!1,`Multiple Field with path '${l.join(".")}' set 'initialValue'. Can not decide which one to pick.`);else if(f){let d=this.getFieldValue(l);!a.isListField()&&(!t.skipExist||d===void 0)&&this.updateStore(Eo(this.store,l,[...f][0].value))}}}})},i;t.entities?i=t.entities:t.namePathList?(i=[],t.namePathList.forEach(s=>{let a=o.get(s);a&&i.push(...[...a].map(c=>c.entity))})):i=r,n(i)};resetFields=t=>{this.warningUnhooked();let o=this.store;if(!t){this.updateStore(dn(this.initialValues)),this.resetWithFieldInitialValue(),this.notifyObservers(o,null,{type:"reset"}),this.notifyWatch();return}let r=t.map(Ot);r.forEach(n=>{let i=this.getInitialValue(n);this.updateStore(Eo(this.store,n,i))}),this.resetWithFieldInitialValue({namePathList:r}),this.notifyObservers(o,r,{type:"reset"}),this.notifyWatch(r)};setFields=t=>{this.warningUnhooked();let o=this.store,r=[];t.forEach(n=>{let{name:i,...s}=n,a=Ot(i);r.push(a),"value"in s&&this.updateStore(Eo(this.store,a,s.value)),this.notifyObservers(o,[a],{type:"setField",data:n})}),this.notifyWatch(r)};getFields=()=>this.getFieldEntities(!0).map(r=>{let n=r.getNamePath(),s={...r.getMeta(),name:n,value:this.getFieldValue(n)};return Object.defineProperty(s,"originRCField",{value:!0}),s});initEntityValue=t=>{let{initialValue:o}=t.props;if(o!==void 0){let r=t.getNamePath();co(this.store,r)===void 0&&this.updateStore(Eo(this.store,r,o))}};isMergedPreserve=t=>(t!==void 0?t:this.preserve)??!0;registerField=t=>{this.fieldEntities.push(t);let o=t.getNamePath();if(this.notifyWatch([o]),t.props.initialValue!==void 0){let r=this.store;this.resetWithFieldInitialValue({entities:[t],skipExist:!0}),this.notifyObservers(r,[t.getNamePath()],{type:"valueUpdate",source:"internal"})}return(r,n,i=[])=>{if(this.fieldEntities=this.fieldEntities.filter(s=>s!==t),!this.isMergedPreserve(n)&&(!r||i.length>1)){let s=r?void 0:this.getInitialValue(o);if(o.length&&this.getFieldValue(o)!==s&&this.fieldEntities.every(a=>!pa(a.getNamePath(),o))){let a=this.store;this.updateStore(Eo(a,o,s,!0)),this.notifyObservers(a,[o],{type:"remove"}),this.triggerDependenciesUpdate(a,o)}}this.notifyWatch([o])}};dispatch=t=>{switch(t.type){case"updateValue":{let{namePath:o,value:r}=t;this.updateValue(o,r);break}case"validateField":{let{namePath:o,triggerName:r}=t;this.validateFields([o],{triggerName:r});break}default:}};notifyObservers=(t,o,r)=>{if(this.subscribable){let n={...r,store:this.getFieldsValue(!0)};this.getFieldEntities().forEach(({onStoreChange:i})=>{i(t,o,n)})}else this.forceRootUpdate()};triggerDependenciesUpdate=(t,o)=>{let r=this.getDependencyChildrenFields(o);return r.length&&this.validateFields(r,{delayFrame:!0}),this.notifyObservers(t,r,{type:"dependenciesUpdate",relatedFields:[o,...r]}),r};updateValue=(t,o)=>{let r=Ot(t),n=this.store;this.updateStore(Eo(this.store,r,o)),this.notifyObservers(n,[r],{type:"valueUpdate",source:"internal"}),this.notifyWatch([r]);let i=this.triggerDependenciesUpdate(n,r),{onValuesChange:s}=this.callbacks;if(s){let a=Kg(this.store,[r]),c=this.getFieldsValue(),l=Eo(c,r,co(a,r));s(a,l)}this.triggerOnFieldsChange([r,...i])};setFieldsValue=t=>{this.warningUnhooked();let o=this.store;if(t){let r=dn(this.store,t);this.updateStore(r)}this.notifyObservers(o,null,{type:"valueUpdate",source:"external"}),this.notifyWatch()};setFieldValue=(t,o)=>{this.setFields([{name:t,value:o,errors:[],warnings:[],touched:!0}])};getDependencyChildrenFields=t=>{let o=new Set,r=[],n=new ds;this.getFieldEntities().forEach(s=>{let{dependencies:a}=s.props;(a||[]).forEach(c=>{let l=Ot(c);n.update(l,(u=new Set)=>(u.add(s),u))})});let i=s=>{(n.get(s)||new Set).forEach(c=>{if(!o.has(c)){o.add(c);let l=c.getNamePath();c.isFieldDirty()&&l.length&&(r.push(l),i(l))}})};return i(t),r};triggerOnFieldsChange=(t,o)=>{let{onFieldsChange:r}=this.callbacks;if(r){let n=this.getFields();if(o){let s=new ds;o.forEach(({name:a,errors:c})=>{s.set(a,c)}),n.forEach(a=>{a.errors=s.get(a.name)||a.errors})}let i=n.filter(({name:s})=>Ci(t,s));i.length&&r(i,n)}};validateFields=(t,o)=>{this.warningUnhooked();let r,n;Array.isArray(t)||typeof t=="string"||typeof o=="string"?(r=t,n=o):n=t;let i=!!r,s=i?r.map(Ot):[],a=[...s],c=[],l=String(Date.now()),u=new Set,{recursive:f,dirty:d}=n||{};this.getFieldEntities(!0).forEach(y=>{let x=y.getNamePath();if(i||((!y.isList()||!s.some(b=>pa(b,x,!0)))&&a.push(x),s.push(x)),!(!y.props.rules||!y.props.rules.length)&&!(d&&!y.isFieldDirty())&&(u.add(x.join(l)),!i||Ci(s,x,f))){let b=y.validateRules({validateMessages:{...Df,...this.validateMessages},...n});c.push(b.then(()=>({name:x,errors:[],warnings:[]})).catch(h=>{let S=[],C=[];return h.forEach?.(({rule:{warningOnly:R},errors:v})=>{R?C.push(...v):S.push(...v)}),S.length?Promise.reject({name:x,errors:S,warnings:C}):{name:x,errors:S,warnings:C}}))}});let m=cR(c);this.lastValidatePromise=m,m.catch(y=>y).then(y=>{let x=y.map(({name:b})=>b);this.notifyObservers(this.store,x,{type:"validateFinish"}),this.triggerOnFieldsChange(x,y)});let p=m.then(()=>this.lastValidatePromise===m?Promise.resolve(this.getFieldsValue(a)):Promise.reject([])).catch(y=>{let x=y.filter(h=>h&&h.errors.length),b=x[0]?.errors?.[0];return Promise.reject({message:b,values:this.getFieldsValue(s),errorFields:x,outOfDate:this.lastValidatePromise!==m})});p.catch(y=>y);let g=s.filter(y=>u.has(y.join(l)));return this.triggerOnFieldsChange(g),p};submit=()=>{this.warningUnhooked(),this.validateFields().then(t=>{let{onFinish:o}=this.callbacks;if(o)try{o(t)}catch(r){console.error(r)}}).catch(t=>{let{onFinishFailed:o}=this.callbacks;o&&o(t)})}};function YM(e){let t=Vf.useRef(null),[,o]=Vf.useState({});if(!t.current)if(e)t.current=e;else{let r=()=>{o({})},n=new nh(r);t.current=n.getForm()}return[t.current]}var Hf=YM;var So=$(require("react"));var Si=$(require("react")),ih=Si.createContext({triggerFormChange:()=>{},triggerFormFinish:()=>{},registerForm:()=>{},unregisterForm:()=>{}}),sh=({validateMessages:e,onFormChange:t,onFormFinish:o,children:r})=>{let n=Si.useContext(ih),i=Si.useRef({});return Si.createElement(ih.Provider,{value:{...n,validateMessages:{...n.validateMessages,...e},triggerFormChange:(s,a)=>{t&&t(s,{changedFields:a,forms:i.current}),n.triggerFormChange(s,a)},triggerFormFinish:(s,a)=>{o&&o(s,{values:a,forms:i.current}),n.triggerFormFinish(s,a)},registerForm:(s,a)=>{s&&(i.current={...i.current,[s]:a}),n.registerForm(s,a)},unregisterForm:s=>{let a={...i.current};delete a[s],i.current=a,n.unregisterForm(s)}}},r)};var uR=ih;function ah(){return ah=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},ah.apply(this,arguments)}var QM=(e,t)=>{let{name:o,initialValues:r,fields:n,form:i,preserve:s,children:a,component:c="form",validateMessages:l,validateTrigger:u="onChange",onValuesChange:f,onFieldsChange:d,onFinish:m,onFinishFailed:p,clearOnDestroy:g,...y}=e,x=So.useRef(null),b=So.useContext(uR),[h]=Hf(i),{useSubscribe:S,setInitialValues:C,setCallbacks:R,setValidateMessages:v,setPreserve:w,destroyForm:T}=h.getInternalHooks(en);So.useImperativeHandle(t,()=>({...h,nativeElement:x.current})),So.useEffect(()=>(b.registerForm(o,h),()=>{b.unregisterForm(o)}),[b,h,o]),v({...b.validateMessages,...l}),R({onValuesChange:f,onFieldsChange:(A,...V)=>{b.triggerFormChange(o,A),d&&d(A,...V)},onFinish:A=>{b.triggerFormFinish(o,A),m&&m(A)},onFinishFailed:p}),w(s);let I=So.useRef(null);C(r,!I.current),I.current||(I.current=!0),So.useEffect(()=>()=>T(g),[]);let P,N=typeof a=="function";if(N){let A=h.getFieldsValue(!0);P=a(A,h)}else P=a;S(!N);let O=So.useRef(null);So.useEffect(()=>{sR(O.current||[],n||[])||h.setFields(n||[]),O.current=n},[n,h]);let _=So.useMemo(()=>({...h,validateTrigger:u}),[h,u]),M=So.createElement(yi.Provider,{value:null},So.createElement(tn.Provider,{value:_},P));return c===!1?M:So.createElement(c,ah({},y,{ref:x,onSubmit:A=>{A.preventDefault(),A.stopPropagation(),h.submit()},onReset:A=>{A.preventDefault(),h.resetFields(),y.onReset?.(A)}}),M)},fR=QM;var on=require("react");function lh(e){try{return JSON.stringify(e)}catch{return Math.random()}}function ZM(...e){let[t,o={}]=e,r=O0(o)?{form:o}:o,n=r.form,[i,s]=(0,on.useState)(()=>typeof t=="function"?t({}):void 0),a=(0,on.useMemo)(()=>lh(i),[i]),c=(0,on.useRef)(a);c.current=a;let l=(0,on.useContext)(tn),u=n||l,f=u&&u._init,{getFieldsValue:d,getInternalHooks:m}=u,{registerWatch:p}=m(en),g=ye((x,b)=>{let h=r.preserve?b??d(!0):x??d(),S=typeof t=="function"?t(h):co(h,Ot(t));lh(i)!==lh(S)&&s(S)}),y=typeof t=="function"?t:JSON.stringify(t);return(0,on.useEffect)(()=>{f&&g()},[f,y]),(0,on.useEffect)(()=>f?p((b,h)=>{g(b,h)}):void 0,[f]),i}var dR=ZM;var JM=mR.forwardRef(fR),El=JM;El.FormProvider=sh;El.Field=zf;El.List=lR;El.useForm=Hf;El.useWatch=dR;var Fo=Wn.createContext({}),pR=({children:e,status:t,override:o})=>{let r=Wn.useContext(Fo),n=Wn.useMemo(()=>{let i={...r};return o&&delete i.isFormItemInput,t&&(delete i.status,delete i.hasFeedback,delete i.feedbackIcon),i},[t,o,r]);return Wn.createElement(Fo.Provider,{value:n},e)},gR=Wn.createContext(void 0);var eO=e=>{let{space:t,form:o,children:r}=e;if(!ut(r))return null;let n=r;return o&&(n=ch.default.createElement(pR,{override:!0,status:!0},n)),t&&(n=ch.default.createElement(Nv,null,n)),n},jn=eO;var hR=()=>It()&&window.document.documentElement;var tO=e=>`${e}-css-var`,no=tO;var xR=require("react");function uh(e,t,o){return(0,xR.useMemo)(()=>({...{trap:t??!0,focusTriggerAfterClose:o??!0},...e}),[e,t,o])}var Sn=$(require("react"));var wl=$(require("react"));var kf=$(require("react"));var oO=e=>{let{prefixCls:t,className:o,style:r,size:n,shape:i}=e,s=E({[`${t}-lg`]:n==="large",[`${t}-sm`]:n==="small"}),a=E({[`${t}-circle`]:i==="circle",[`${t}-square`]:i==="square",[`${t}-round`]:i==="round"}),c=kf.useMemo(()=>wo(n)?{width:n,height:n,lineHeight:`${n}px`}:{},[n]);return kf.createElement("span",{className:E(t,s,a,o),style:{...c,...r}})},vi=oO;var rO=new Ue("ant-skeleton-loading",{"0%":{backgroundPosition:"100% 50%"},"100%":{backgroundPosition:"0 50%"}}),ph=e=>({height:e,lineHeight:J(e)}),Ri=e=>({width:e,...ph(e)}),nO=e=>({background:e.skeletonLoadingBackground,backgroundSize:"400% 100%",animationName:rO,animationDuration:e.skeletonLoadingMotionDuration,animationTimingFunction:"ease",animationIterationCount:"infinite"}),fh=(e,t)=>({width:t(e).mul(5).equal(),minWidth:t(e).mul(5).equal(),...ph(e)}),iO=e=>{let{skeletonAvatarCls:t,gradientFromColor:o,controlHeight:r,controlHeightLG:n,controlHeightSM:i}=e;return{[t]:{display:"inline-block",verticalAlign:"top",background:o,...Ri(r)},[`${t}${t}-circle`]:{borderRadius:"50%"},[`${t}${t}-lg`]:{...Ri(n)},[`${t}${t}-sm`]:{...Ri(i)}}},sO=e=>{let{controlHeight:t,borderRadiusSM:o,skeletonInputCls:r,controlHeightLG:n,controlHeightSM:i,gradientFromColor:s,calc:a}=e;return{[r]:{display:"inline-block",verticalAlign:"top",background:s,borderRadius:o,...fh(t,a)},[`${r}-lg`]:{...fh(n,a)},[`${r}-sm`]:{...fh(i,a)}}},bR=e=>{let{gradientFromColor:t,borderRadiusSM:o,imageSizeBase:r,calc:n}=e;return{display:"inline-flex",alignItems:"center",justifyContent:"center",verticalAlign:"middle",background:t,borderRadius:o,...Ri(n(r).mul(2).equal())}},aO=e=>({[e.skeletonNodeCls]:{...bR(e)}}),lO=e=>{let{skeletonImageCls:t,imageSizeBase:o,calc:r}=e;return{[t]:{...bR(e),[`${t}-path`]:{fill:"#bfbfbf"},[`${t}-svg`]:{...Ri(o),maxWidth:r(o).mul(4).equal(),maxHeight:r(o).mul(4).equal()},[`${t}-svg${t}-svg-circle`]:{borderRadius:"50%"}},[`${t}${t}-circle`]:{borderRadius:"50%"}}},dh=(e,t,o)=>{let{skeletonButtonCls:r}=e;return{[`${o}${r}-circle`]:{width:t,minWidth:t,borderRadius:"50%"},[`${o}${r}-round`]:{borderRadius:t}}},mh=(e,t)=>({width:t(e).mul(2).equal(),minWidth:t(e).mul(2).equal(),...ph(e)}),cO=e=>{let{borderRadiusSM:t,skeletonButtonCls:o,controlHeight:r,controlHeightLG:n,controlHeightSM:i,gradientFromColor:s,calc:a}=e;return{[o]:{display:"inline-block",verticalAlign:"top",background:s,borderRadius:t,width:a(r).mul(2).equal(),minWidth:a(r).mul(2).equal(),...mh(r,a)},...dh(e,r,o),[`${o}-lg`]:{...mh(n,a)},...dh(e,n,`${o}-lg`),[`${o}-sm`]:{...mh(i,a)},...dh(e,i,`${o}-sm`)}},uO=e=>{let{componentCls:t,skeletonAvatarCls:o,skeletonTitleCls:r,skeletonParagraphCls:n,skeletonButtonCls:i,skeletonInputCls:s,skeletonNodeCls:a,skeletonImageCls:c,controlHeight:l,controlHeightLG:u,controlHeightSM:f,gradientFromColor:d,padding:m,marginSM:p,borderRadius:g,titleHeight:y,blockRadius:x,paragraphLiHeight:b,controlHeightXS:h,paragraphMarginTop:S}=e;return{[t]:{display:"table",width:"100%",[`${t}-header`]:{display:"table-cell",paddingInlineEnd:m,verticalAlign:"top",[o]:{display:"inline-block",verticalAlign:"top",background:d,...Ri(l)},[`${o}-circle`]:{borderRadius:"50%"},[`${o}-lg`]:{...Ri(u)},[`${o}-sm`]:{...Ri(f)}},[`${t}-section`]:{display:"table-cell",width:"100%",verticalAlign:"top",[r]:{width:"100%",height:y,background:d,borderRadius:x,[`+ ${n}`]:{marginBlockStart:f}},[n]:{padding:0,"> li":{width:"100%",height:b,listStyle:"none",background:d,borderRadius:x,"+ li":{marginBlockStart:h}}},[`${n}> li:last-child:not(:first-child):not(:nth-child(2))`]:{width:"61%"}},[`&-round ${t}-section`]:{[`${r}, ${n} > li`]:{borderRadius:g}}},[`${t}-with-avatar ${t}-section`]:{[r]:{marginBlockStart:p,[`+ ${n}`]:{marginBlockStart:S}}},[`${t}${t}-element`]:{display:"inline-block",width:"auto",...cO(e),...iO(e),...sO(e),...aO(e),...lO(e)},[`${t}${t}-block`]:{width:"100%",[i]:{width:"100%"},[s]:{width:"100%"}},[`${t}${t}-active`]:{[`
        ${r},
        ${n} > li,
        ${o},
        ${i},
        ${s},
        ${a},
        ${c}
      `]:{...nO(e)}}}},fO=e=>{let{colorFillContent:t,colorFill:o}=e,r=t,n=o;return{color:r,colorGradientEnd:n,gradientFromColor:r,gradientToColor:n,titleHeight:e.controlHeight/2,blockRadius:e.borderRadiusSM,paragraphMarginTop:e.marginLG+e.marginXXS,paragraphLiHeight:e.controlHeight/2}},Cn=Be("Skeleton",e=>{let{componentCls:t,calc:o}=e,r=Oe(e,{skeletonAvatarCls:`${t}-avatar`,skeletonTitleCls:`${t}-title`,skeletonParagraphCls:`${t}-paragraph`,skeletonButtonCls:`${t}-button`,skeletonInputCls:`${t}-input`,skeletonNodeCls:`${t}-node`,skeletonImageCls:`${t}-image`,imageSizeBase:o(e.controlHeight).mul(1.5).equal(),borderRadius:100,skeletonLoadingBackground:`linear-gradient(90deg, ${e.gradientFromColor} 25%, ${e.gradientToColor} 37%, ${e.gradientFromColor} 63%)`,skeletonLoadingMotionDuration:"1.4s"});return uO(r)},fO,{deprecatedTokens:[["color","gradientFromColor"],["colorGradientEnd","gradientToColor"]]});var dO=e=>{let{prefixCls:t,className:o,classNames:r,rootClassName:n,active:i,style:s,styles:a,shape:c="circle",size:l,...u}=e,{getPrefixCls:f}=wl.useContext(Se),d=f("skeleton",t),[m,p]=Cn(d),g=kt(x=>l??x),y=E(d,`${d}-element`,{[`${d}-active`]:i},r?.root,o,n,m,p);return wl.createElement("div",{className:y,style:a?.root},wl.createElement(vi,{prefixCls:`${d}-avatar`,className:r?.content,style:{...a?.content,...s},shape:c,size:g,...u}))},yR=dO;var $l=$(require("react"));var mO=e=>{let{prefixCls:t,className:o,rootClassName:r,classNames:n,active:i,style:s,styles:a,block:c=!1,size:l,...u}=e,{getPrefixCls:f}=$l.useContext(Se),d=f("skeleton",t),[m,p]=Cn(d),g=kt(x=>l??x),y=E(d,`${d}-element`,{[`${d}-active`]:i,[`${d}-block`]:c},n?.root,o,r,m,p);return $l.createElement("div",{className:y,style:a?.root},$l.createElement(vi,{prefixCls:`${d}-button`,className:n?.content,style:{...a?.content,...s},size:g,...u}))},CR=mO;var ms=$(require("react"));var Pl=$(require("react"));var pO=e=>{let{prefixCls:t,className:o,classNames:r,rootClassName:n,internalClassName:i,style:s,styles:a,active:c,children:l}=e,{getPrefixCls:u}=Pl.useContext(Se),f=u("skeleton",t),[d,m]=Cn(f),p=E(f,`${f}-element`,{[`${f}-active`]:c},d,r?.root,o,n,m);return Pl.createElement("div",{className:p,style:a?.root},Pl.createElement("div",{className:E(r?.content,i||`${f}-node`),style:{...a?.content,...s}},l))},Wf=pO;var gO=e=>{let{getPrefixCls:t}=ms.useContext(Se),o=t("skeleton",e.prefixCls);return ms.createElement(Wf,{...e,internalClassName:`${o}-image`},ms.createElement("svg",{viewBox:"0 0 1098 1024",xmlns:"http://www.w3.org/2000/svg",className:`${o}-image-svg`,"aria-hidden":"true",focusable:"false"},ms.createElement("title",null,"Image placeholder"),ms.createElement("path",{d:"M365.7 329.1q0 45.8-32 77.7t-77.7 32-77.7-32-32-77.7 32-77.6 77.7-32 77.7 32 32 77.6M951 548.6v256H146.3V694.9L329 512l91.5 91.4L713 311zm54.8-402.3H91.4q-7.4 0-12.8 5.4T73 164.6v694.8q0 7.5 5.5 12.9t12.8 5.4h914.3q7.5 0 12.9-5.4t5.4-12.9V164.6q0-7.5-5.4-12.9t-12.9-5.4m91.4 18.3v694.8q0 37.8-26.8 64.6t-64.6 26.9H91.4q-37.7 0-64.6-26.9T0 859.4V164.6q0-37.8 26.8-64.6T91.4 73h914.3q37.8 0 64.6 26.9t26.8 64.6",className:`${o}-image-path`})))},SR=gO;var Nl=$(require("react"));var hO=e=>{let{prefixCls:t,className:o,classNames:r,rootClassName:n,active:i,block:s,style:a,styles:c,size:l,...u}=e,{getPrefixCls:f}=Nl.useContext(Se),d=f("skeleton",t),[m,p]=Cn(d),g=kt(x=>l??x),y=E(d,`${d}-element`,{[`${d}-active`]:i,[`${d}-block`]:s},r?.root,o,n,m,p);return Nl.createElement("div",{className:y,style:c?.root},Nl.createElement(vi,{prefixCls:`${d}-input`,className:r?.content,style:{...c?.content,...a},size:g,...u}))},vR=hO;var gh=$(require("react"));var xO=(e,t)=>{let{width:o,rows:r=2}=t;if(Array.isArray(o))return o[e];if(r-1===e)return o},bO=e=>{let{prefixCls:t,className:o,style:r,rows:n=0}=e,i=Array.from({length:n}).map((s,a)=>gh.createElement("li",{key:a,style:{width:xO(a,e)}}));return gh.createElement("ul",{className:E(t,o),style:r},i)},RR=bO;var ER=$(require("react"));var yO=({prefixCls:e,className:t,width:o,style:r})=>ER.createElement("h3",{className:E(e,t),style:{width:o,...r}}),wR=yO;function hh(e){return ze(e)?e:{}}function CO(e,t){return e&&!t?{size:"large",shape:"square"}:{size:"large",shape:"circle"}}function SO(e,t){return!e&&t?{width:"38%"}:e&&t?{width:"50%"}:{}}function vO(e,t){let o={};return(!e||!t)&&(o.width="61%"),!e&&t?o.rows=3:o.rows=2,o}var ga=Sn.default.forwardRef((e,t)=>{let{prefixCls:o,loading:r,className:n,rootClassName:i,classNames:s,style:a,styles:c,children:l,avatar:u=!1,title:f=!0,paragraph:d=!0,active:m,round:p}=e,{getPrefixCls:g,direction:y,className:x,style:b,classNames:h,styles:S}=De("skeleton"),C=g("skeleton",o),[R,v]=Cn(C),w={...e,avatar:u,title:f,paragraph:d},T=Ee(b),I=Ee(a),[P,N]=je([h,s],[S,T,c,I],{props:w}),O=Sn.default.useRef(null);if(Sn.default.useImperativeHandle(t,()=>({nativeElement:O.current})),r||!("loading"in e)){let _=!!u,M=!!f,A=!!d,V;if(_){let z={className:P.avatar,prefixCls:`${C}-avatar`,...CO(M,A),...hh(u),style:N.avatar};V=Sn.default.createElement("div",{className:E(P.header,`${C}-header`),style:N.header},Sn.default.createElement(vi,{...z}))}let F;if(M||A){let z;if(M){let k={className:P.title,prefixCls:`${C}-title`,...SO(_,A),...hh(f),style:N.title};z=Sn.default.createElement(wR,{...k})}let B;if(A){let k={className:P.paragraph,prefixCls:`${C}-paragraph`,...vO(_,M),...hh(d),style:N.paragraph};B=Sn.default.createElement(RR,{...k})}F=Sn.default.createElement("div",{className:E(P.section,`${C}-section`),style:N.section},z,B)}let G=E(C,{[`${C}-with-avatar`]:_,[`${C}-active`]:m,[`${C}-rtl`]:y==="rtl",[`${C}-round`]:p},P.root,x,n,i,R,v);return Sn.default.createElement("div",{ref:O,className:G,style:N.root},V,F)}return l??null});ga.Button=CR;ga.Avatar=yR;ga.Input=vR;ga.Image=SR;ga.Node=Wf;var $R=ga;var PR=$R;var ha=$(require("react"));function NR(){}var RO=ha.createContext({add:NR,remove:NR});function IR(e){let t=ha.useContext(RO),o=ha.useRef(null);return ye(n=>{if(n){let i=e?n.querySelector(e):n;i&&(t.add(i),o.current=i)}else t.remove(o.current)})}var vn=$(require("react"));var jf=$(require("react"));var EO=()=>{let{cancelButtonProps:e,cancelTextLocale:t,onCancel:o}=(0,jf.useContext)(Hn),r=n=>{o?.(n),e?.onClick?.(n)};return jf.default.createElement(bn,{...e,onClick:r},t)},xh=EO;var Uf=$(require("react"));var wO=()=>{let{confirmLoading:e,okButtonProps:t,okType:o,okTextLocale:r,onOk:n}=(0,Uf.useContext)(Hn);return Uf.default.createElement(bn,{...uf(o),loading:e,onClick:n,...t},r)},bh=wO;function qf(e,t){return vn.default.createElement("span",{className:`${e}-close-x`},ut(t)?t:vn.default.createElement(fr,{className:`${e}-close-icon`}))}var Gf=e=>{let{okText:t,okType:o="primary",cancelText:r,confirmLoading:n,onOk:i,onCancel:s,okButtonProps:a,cancelButtonProps:c,footer:l}=e,[u]=$o("Modal",Zc()),f=Lt(t,u?.okText),d=Lt(r,u?.cancelText),m=vn.default.useMemo(()=>({confirmLoading:n,okButtonProps:a,cancelButtonProps:c,okTextLocale:f,cancelTextLocale:d,okType:o,onOk:i,onCancel:s}),[n,a,c,f,d,o,i,s]),p;return ot(l)||typeof l>"u"?(p=vn.default.createElement(vn.default.Fragment,null,vn.default.createElement(xh,null),vn.default.createElement(bh,null)),ot(l)&&(p=l(p,{OkBtn:bh,CancelBtn:xh})),p=vn.default.createElement(wf,{value:m},p)):p=l,vn.default.createElement(Tu,{disabled:!1},p)};var $O=e=>{let{componentCls:t}=e;return{[t]:{display:"flex",flexFlow:"row wrap",minWidth:0,"&::before, &::after":{display:"flex"},"&-no-wrap":{flexWrap:"nowrap"},"&-start":{justifyContent:"flex-start"},"&-center":{justifyContent:"center"},"&-end":{justifyContent:"flex-end"},"&-space-between":{justifyContent:"space-between"},"&-space-around":{justifyContent:"space-around"},"&-space-evenly":{justifyContent:"space-evenly"},"&-top":{alignItems:"flex-start"},"&-middle":{alignItems:"center"},"&-bottom":{alignItems:"flex-end"}}}},PO=e=>{let{componentCls:t}=e;return{[t]:{position:"relative",maxWidth:"100%",minHeight:1}}},NO=(e,t)=>{let{componentCls:o,gridColumns:r,antCls:n}=e,[i,s]=Mt(n,"grid"),[,a]=Mt(n,"col"),c={};for(let l=r;l>=0;l--)l===0?(c[`${o}${t}-${l}`]={display:"none"},c[`${o}-push-${l}`]={insetInlineStart:"auto"},c[`${o}-pull-${l}`]={insetInlineEnd:"auto"},c[`${o}${t}-push-${l}`]={insetInlineStart:"auto"},c[`${o}${t}-pull-${l}`]={insetInlineEnd:"auto"},c[`${o}${t}-offset-${l}`]={marginInlineStart:0},c[`${o}${t}-order-${l}`]={order:0}):(c[`${o}${t}-${l}`]=[{[i("display")]:"block",display:"block"},{display:s("display"),flex:`0 0 ${l/r*100}%`,maxWidth:`${l/r*100}%`}],c[`${o}${t}-push-${l}`]={insetInlineStart:`${l/r*100}%`},c[`${o}${t}-pull-${l}`]={insetInlineEnd:`${l/r*100}%`},c[`${o}${t}-offset-${l}`]={marginInlineStart:`${l/r*100}%`},c[`${o}${t}-order-${l}`]={order:l});return c[`${o}${t}-flex`]={flex:a(`${t.replace(/-/,"")}-flex`)},c},yh=(e,t)=>NO(e,t),IO=(e,t,o)=>({[`@media (min-width: ${J(t)})`]:{...yh(e,o)}}),TO=()=>({}),MO=()=>({}),IQ=Be("Grid",$O,TO),Ch=e=>({xs:e.screenXSMin,sm:e.screenSMMin,md:e.screenMDMin,lg:e.screenLGMin,xl:e.screenXLMin,xxl:e.screenXXLMin,xxxl:e.screenXXXLMin}),TQ=Be("Grid",e=>{let t=Oe(e,{gridColumns:24}),o=Ch(t);return delete o.xs,[PO(t),yh(t,""),yh(t,"-xs"),Object.keys(o).map(r=>IO(t,o[r],`-${r}`)).reduce((r,n)=>({...r,...n}),{})]},MO);function TR(e){return{position:e,inset:0}}var OO=e=>{let{componentCls:t,antCls:o}=e;return[{[`${t}-root`]:{[`${t}${o}-zoom-enter, ${t}${o}-zoom-appear`]:{transform:"none",opacity:0,animationDuration:e.motionDurationSlow,userSelect:"none"},[`${t}${o}-zoom-leave ${t}-container`]:{pointerEvents:"none"},[`${t}-mask`]:{...TR("fixed"),zIndex:e.zIndexPopupBase,height:"100%",backgroundColor:e.colorBgMask,pointerEvents:"none",[`&${t}-mask-blur`]:{backdropFilter:"blur(4px)"},[`${t}-hidden`]:{display:"none"}},[`${t}-wrap`]:{...TR("fixed"),zIndex:e.zIndexPopupBase,overflow:"auto",outline:0,WebkitOverflowScrolling:"touch"}}},{[`${t}-root`]:gl(e)}]},AO=e=>{let{componentCls:t,motionDurationMid:o}=e;return[{[`${t}-root`]:{[`${t}-wrap-rtl`]:{direction:"rtl"},[`${t}-centered`]:{textAlign:"center","&::before":{display:"inline-block",width:0,height:"100%",verticalAlign:"middle",content:'""'},[t]:{top:0,display:"inline-block",paddingBottom:0,textAlign:"start",verticalAlign:"middle"}},[`@media (max-width: ${e.screenSMMax}px)`]:{[t]:{maxWidth:"calc(100vw - 16px)",margin:`${J(e.marginXS)} auto`},[`${t}-centered`]:{[t]:{flex:1}}}}},{[t]:{...ft(e),pointerEvents:"none",position:"relative",top:100,width:"auto",maxWidth:`calc(100vw - ${J(e.calc(e.margin).mul(2).equal())})`,margin:"0 auto","&:focus-visible":{borderRadius:e.borderRadiusLG,...Dn(e)},[`${t}-title`]:{margin:0,color:e.titleColor,fontWeight:e.fontWeightStrong,fontSize:e.titleFontSize,lineHeight:e.titleLineHeight,wordWrap:"break-word"},[`${t}-container`]:{position:"relative",backgroundColor:e.contentBg,backgroundClip:"padding-box",border:0,borderRadius:e.borderRadiusLG,boxShadow:e.boxShadow,pointerEvents:"auto",padding:e.contentPadding},[`${t}-close`]:{position:"absolute",top:e.calc(e.modalHeaderHeight).sub(e.modalCloseBtnSize).div(2).equal(),insetInlineEnd:e.calc(e.modalHeaderHeight).sub(e.modalCloseBtnSize).div(2).equal(),zIndex:e.calc(e.zIndexPopupBase).add(10).equal(),padding:0,color:e.modalCloseIconColor,fontWeight:e.fontWeightStrong,lineHeight:1,textDecoration:"none",background:"transparent",borderRadius:e.borderRadiusSM,width:e.modalCloseBtnSize,height:e.modalCloseBtnSize,border:0,outline:0,cursor:"pointer",transition:["color","background-color"].map(r=>`${r} ${o}`).join(", "),"&-x":{display:"flex",fontSize:e.fontSizeLG,fontStyle:"normal",lineHeight:J(e.modalCloseBtnSize),justifyContent:"center",textTransform:"none",textRendering:"auto"},"&:disabled":{pointerEvents:"none"},"&:hover":{color:e.modalCloseIconHoverColor,backgroundColor:e.colorBgTextHover,textDecoration:"none"},"&:active":{backgroundColor:e.colorBgTextActive},...Jr(e)},[`${t}-header`]:{color:e.colorText,background:e.headerBg,borderRadius:`${J(e.borderRadiusLG)} ${J(e.borderRadiusLG)} 0 0`,marginBottom:e.headerMarginBottom,padding:e.headerPadding,borderBottom:e.headerBorderBottom},[`${t}-body`]:{fontSize:e.fontSize,lineHeight:e.lineHeight,wordWrap:"break-word",padding:e.bodyPadding,[`${t}-body-skeleton`]:{width:"100%",height:"100%",display:"flex",justifyContent:"center",alignItems:"center",margin:`${J(e.margin)} auto`}},[`${t}-footer`]:{textAlign:"end",background:e.footerBg,marginTop:e.footerMarginTop,padding:e.footerPadding,borderTop:e.footerBorderTop,borderRadius:e.footerBorderRadius,[`> ${e.antCls}-btn + ${e.antCls}-btn`]:{marginInlineStart:e.marginXS}},[`${t}-open`]:{overflow:"hidden"}}},{[`${t}-pure-panel`]:{top:"auto",padding:0,display:"flex",flexDirection:"column",[`${t}-container,
          ${t}-body,
          ${t}-confirm-body-wrapper`]:{display:"flex",flexDirection:"column",flex:"auto"},[`${t}-confirm-body`]:{marginBottom:"auto"}}}]},_O=e=>{let{componentCls:t}=e;return{[`${t}-root`]:{[`${t}-wrap-rtl`]:{direction:"rtl",[`${t}-confirm-body`]:{direction:"rtl"}}}}},LO=e=>{let{componentCls:t}=e,o=Ch(e),r={...o};delete r.xs;let n=`--${t.replace(".","")}-`,i=Object.keys(r).map(s=>({[`@media (min-width: ${J(r[s])})`]:{width:`var(${n}${s}-width)`}}));return{[`${t}-root`]:{[t]:[].concat(Rt(Object.keys(o).map((s,a)=>{let c=Object.keys(o)[a-1];return c?{[`${n}${s}-width`]:`var(${n}${c}-width)`}:null})),[{width:`var(${n}xs-width)`}],Rt(i))}}},Sh=e=>{let t=e.padding,o=e.fontSizeHeading5,r=e.lineHeightHeading5;return Oe(e,{modalHeaderHeight:e.calc(e.calc(r).mul(o).equal()).add(e.calc(t).mul(2).equal()).equal(),modalFooterBorderColorSplit:e.colorSplit,modalFooterBorderStyle:e.lineType,modalFooterBorderWidth:e.lineWidth,modalCloseIconColor:e.colorIcon,modalCloseIconHoverColor:e.colorIconHover,modalCloseBtnSize:e.controlHeight,modalConfirmIconSize:e.fontHeight,modalTitleHeight:e.calc(e.titleFontSize).mul(e.titleLineHeight).equal()})},vh=e=>({footerBg:"transparent",headerBg:"transparent",titleLineHeight:e.lineHeightHeading5,titleFontSize:e.fontSizeHeading5,contentBg:e.colorBgElevated,titleColor:e.colorTextHeading,contentPadding:e.wireframe?0:`${J(e.paddingMD)} ${J(e.paddingContentHorizontalLG)}`,headerPadding:e.wireframe?`${J(e.padding)} ${J(e.paddingLG)}`:0,headerBorderBottom:e.wireframe?`${J(e.lineWidth)} ${e.lineType} ${e.colorSplit}`:"none",headerMarginBottom:e.wireframe?0:e.marginXS,bodyPadding:e.wireframe?e.paddingLG:0,footerPadding:e.wireframe?`${J(e.paddingXS)} ${J(e.padding)}`:0,footerBorderTop:e.wireframe?`${J(e.lineWidth)} ${e.lineType} ${e.colorSplit}`:"none",footerBorderRadius:e.wireframe?`0 0 ${J(e.borderRadiusLG)} ${J(e.borderRadiusLG)}`:0,footerMarginTop:e.wireframe?0:e.marginSM,confirmBodyPadding:e.wireframe?`${J(e.padding*2)} ${J(e.padding*2)} ${J(e.paddingLG)}`:0,confirmIconMarginInlineEnd:e.wireframe?e.margin:e.marginSM,confirmBtnsMarginTop:e.wireframe?e.marginLG:e.marginSM,mask:!0}),Xf=Be("Modal",e=>{let t=Sh(e);return[AO(t),_O(t),OO(t),hl(t,"zoom"),LO(t)]},vh,{unitless:{titleLineHeight:!0}});var Rh,DO=e=>{Rh={x:e.pageX,y:e.pageY},setTimeout(()=>{Rh=null},100)};hR()&&document.documentElement.addEventListener("click",DO,!0);var FO=e=>{let{prefixCls:t,className:o,rootClassName:r,open:n,wrapClassName:i,centered:s,getContainer:a,style:c,width:l=520,footer:u,classNames:f,styles:d,children:m,loading:p,confirmLoading:g,zIndex:y,mousePosition:x,onOk:b,onCancel:h,okButtonProps:S,cancelButtonProps:C,destroyOnHidden:R,destroyOnClose:v,panelRef:w=null,closable:T,mask:I,modalRender:P,maskClosable:N,_semanticOmit:O,scrollLock:_,focusTriggerAfterClose:M,focusable:A,_renderSemanticContent:V,...F}=e,{getPopupContainer:G,getPrefixCls:z,direction:B,className:k,style:W,classNames:j,styles:L,centered:U,cancelButtonProps:X,okButtonProps:Y,mask:q,focusable:D}=De("modal"),{modal:K}=Jo.useContext(Se),[H,Q]=Jo.useMemo(()=>typeof T=="boolean"?[void 0,void 0]:[T?.afterClose,T?.onClose],[T]),Z=z("modal",t),te=z(),[se,re,oe]=dv(I,q,Z,N),ae=uh({...D,...A},se,M),ie=Me=>{g||(h?.(Me),Q?.())},be=Me=>{b?.(Me),Q?.()},ee=no(Z),[xe,fe]=Xf(Z,ee),_e=E(i,{[`${Z}-centered`]:s??U,[`${Z}-wrap-rtl`]:B==="rtl"}),Ve=u!==null&&!p?Jo.createElement(Gf,{...e,okButtonProps:{...Y,...S},onOk:be,cancelButtonProps:{...X,...C},onCancel:ie}):null,[ue,He,Ke,Pe]=of(na(e),na(K),{closable:!0,closeIcon:Jo.createElement(fr,{className:`${Z}-close-icon`}),closeIconRender:Me=>qf(Z,Me)}),de=ue?{disabled:Ke,closeIcon:He,afterClose:H,...Pe}:!1,le=P?Me=>Jo.createElement("div",{className:`${Z}-render`},P(Me)):void 0,Re=`.${Z}-${P?"render":"container"}`,pe=IR(Re),ve=gt(w,pe),[Fe,Ye]=aa("Modal",y),Je={...e,width:l,panelRef:w,focusTriggerAfterClose:ae.focusTriggerAfterClose,focusable:ae,mask:se,maskClosable:oe,zIndex:Fe},[st,Xe]=je([j,f,re],[L,d],{props:Je}),wt=O?tt(st,O):st,$t=O?tt(Xe,O):Xe,lt=V?V({classNames:st,styles:Xe}):m,[Ct,Pt]=Jo.useMemo(()=>ze(l)?[void 0,l]:[l,void 0],[l]),Nt=Jo.useMemo(()=>{let Me={};return Pt&&Object.keys(Pt).forEach(zt=>{let ce=Pt[zt];lo(ce)&&(Me[`--${Z}-${zt}-width`]=wo(ce)?`${ce}px`:ce)}),Me},[Z,Pt]);return Jo.createElement(jn,{form:!0,space:!0},Jo.createElement(sa.Provider,{value:Ye},Jo.createElement(I0,{width:Ct,...F,zIndex:Fe,getContainer:a===void 0?G:a,prefixCls:Z,rootClassName:E(xe,r,fe,ee,wt.root),rootStyle:$t.root,footer:Ve,visible:n,mousePosition:x??Rh,onClose:ie,closable:de,closeIcon:He,transitionName:hn(te,"zoom",e.transitionName),maskTransitionName:hn(te,"fade",e.maskTransitionName),mask:se,maskClosable:oe,scrollLock:_,className:E(xe,o,k),style:{...W,...c,...Nt},classNames:{...wt,wrapper:E(wt.wrapper,_e)},styles:$t,panelRef:ve,destroyOnHidden:R??v,modalRender:le,focusTriggerAfterClose:ae.focusTriggerAfterClose,focusTrap:ae.trap},p?Jo.createElement(PR,{active:!0,title:!1,paragraph:{rows:4},className:`${Z}-body-skeleton`}):lt)))},Kf=FO;var zO=e=>{let{componentCls:t,titleFontSize:o,titleLineHeight:r,modalConfirmIconSize:n,fontSize:i,lineHeight:s,modalTitleHeight:a,fontHeight:c,confirmBodyPadding:l}=e,u=`${t}-confirm`;return{[u]:{"&-rtl":{direction:"rtl"},[`${e.antCls}-modal-header`]:{display:"none"},[`${u}-body-wrapper`]:{...Hu()},[`&${t} ${t}-body`]:{padding:l},[`${u}-body`]:{display:"flex",flexWrap:"nowrap",alignItems:"start",[`> ${e.iconCls}`]:{flex:"none",fontSize:n,marginInlineEnd:e.confirmIconMarginInlineEnd,marginTop:e.calc(e.calc(c).sub(n).equal()).div(2).equal()},[`&-has-title > ${e.iconCls}`]:{marginTop:e.calc(e.calc(a).sub(n).equal()).div(2).equal()}},[`${u}-paragraph`]:{display:"flex",flexDirection:"column",flex:"auto",rowGap:e.marginXS,maxWidth:`calc(100% - ${J(e.marginSM)})`},[`${u}-body-no-icon ${u}-paragraph`]:{maxWidth:"100%"},[`${e.iconCls} + ${u}-paragraph`]:{maxWidth:`calc(100% - ${J(e.calc(e.modalConfirmIconSize).add(e.marginSM).equal())})`},[`${u}-title`]:{color:e.colorTextHeading,fontWeight:e.fontWeightStrong,fontSize:o,lineHeight:r},[`${u}-container`]:{color:e.colorText,fontSize:i,lineHeight:s},[`${u}-btns`]:{textAlign:"end",marginTop:e.confirmBtnsMarginTop,[`${e.antCls}-btn + ${e.antCls}-btn`]:{marginBottom:0,marginInlineStart:e.marginXS}}},[`${u}-error ${u}-body > ${e.iconCls}`]:{color:e.colorError},[`${u}-warning ${u}-body > ${e.iconCls},
        ${u}-confirm ${u}-body > ${e.iconCls}`]:{color:e.colorWarning},[`${u}-info ${u}-body > ${e.iconCls}`]:{color:e.colorInfo},[`${u}-success ${u}-body > ${e.iconCls}`]:{color:e.colorSuccess}}},MR=Fn(["Modal","confirm"],e=>{let t=Sh(e);return zO(t)},vh,{order:-1e3});var BO=["body"],Eh=e=>{let{prefixCls:t,icon:o,okText:r,cancelText:n,confirmPrefixCls:i,type:s,okCancel:a,footer:c,locale:l,autoFocusButton:u,focusable:f,contentClassName:d,contentStyle:m,...p}=e,{infoIcon:g,successIcon:y,errorIcon:x,warningIcon:b}=De("modal"),h=o;if(o===void 0)switch(s){case"info":h=Lt(g,Et.createElement(Zu,null));break;case"success":h=Lt(y,Et.createElement(ra,null));break;case"error":h=Lt(x,Et.createElement(gn,null));break;default:h=Lt(b,Et.createElement(Yu,null))}let S=a??s==="confirm",C=Et.useMemo(()=>{let V=f?.autoFocusButton||u;return V||V===null?V:"ok"},[u,f?.autoFocusButton]),[R]=$o("Modal"),v=l||R,w=Lt(r,S?v?.okText:v?.justOkText),T=Lt(n,v?.cancelText),{closable:I}=p,{onClose:P}=ze(I)?I:{},N=Et.useMemo(()=>({autoFocusButton:C,cancelTextLocale:T,okTextLocale:w,mergedOkCancel:S,onClose:P,...p}),[C,T,w,S,P,p]),O=Et.createElement(Et.Fragment,null,Et.createElement(Dg,null),Et.createElement(Fg,null)),_=ut(e.title),M=ut(h),A=`${i}-body`;return Et.createElement("div",{className:`${i}-body-wrapper`},Et.createElement("div",{className:E(A,{[`${A}-has-title`]:_,[`${A}-no-icon`]:!M})},h,Et.createElement("div",{className:`${i}-paragraph`},_&&Et.createElement("span",{className:`${i}-title`},e.title),Et.createElement("div",{className:E(`${i}-content`,d),style:m},e.content))),c===void 0||ot(c)?Et.createElement(wf,{value:N},Et.createElement("div",{className:`${i}-btns`},ot(c)?c(O,{OkBtn:Fg,CancelBtn:Dg}):O)):c,Et.createElement(MR,{prefixCls:t}))},VO=e=>{let{close:t,zIndex:o,maskStyle:r,direction:n,prefixCls:i,wrapClassName:s,rootPrefixCls:a,bodyStyle:c,closable:l=!1,onConfirm:u,styles:f,title:d,mask:m,maskClosable:p,okButtonProps:g,cancelButtonProps:y}=e,{cancelButtonProps:x,okButtonProps:b}=De("modal"),h=`${i}-confirm`,S=e.width||416,C=e.style||{},R=ot(f)?N=>({body:c,mask:r,...f(N)}):{body:c,mask:r,...f},v=tt(e,["bodyStyle","maskStyle"]),w=E(h,`${h}-${e.type}`,{[`${h}-rtl`]:n==="rtl"},e.className),T=Et.useMemo(()=>{let N=rf(m,p);return N.closable??(N.closable=!1),N},[m,p]),[,I]=Tt(),P=Et.useMemo(()=>o!==void 0?o:I.zIndexPopupBase+Sg,[o,I]);return Et.createElement(Kf,{...v,className:w,wrapClassName:E({[`${h}-centered`]:!!e.centered},s),onCancel:()=>{t?.({triggerCancel:!0}),u?.(!1)},title:d,footer:null,transitionName:hn(a||"","zoom",e.transitionName),maskTransitionName:hn(a||"","fade",e.maskTransitionName),mask:T,style:C,styles:R,width:S,zIndex:P,closable:l,_semanticOmit:BO,_renderSemanticContent:({classNames:N,styles:O})=>Et.createElement(Eh,{...e,confirmPrefixCls:h,okButtonProps:{...b,...g},cancelButtonProps:{...x,...y},contentClassName:N.body,contentStyle:O.body})})},HO=e=>{let{rootPrefixCls:t,iconPrefixCls:o,direction:r,theme:n}=e;return Et.createElement(di,{prefixCls:t,iconPrefixCls:o,direction:r,theme:n},Et.createElement(VO,{...e}))},Yf=HO;var kO=[],Rn=kO;var OR="";function AR(){return OR}var WO=e=>{let{prefixCls:t,getContainer:o,direction:r}=e,n=Zc(),i=(0,xa.useContext)(Se),s=AR()||i.getPrefixCls(),a=t||`${s}-modal`,c=o;return c===!1&&(c=void 0),xa.default.createElement(Yf,{...e,rootPrefixCls:s,prefixCls:a,iconPrefixCls:i.iconPrefixCls,theme:i.theme,direction:r??i.direction,locale:i.locale?.Modal??n,getContainer:c})};function ps(e){let t=zS(),o=document.createDocumentFragment(),r={...e,close:a,open:!0},n;function i(...l){l.some(f=>f?.triggerCancel)&&e.onCancel?.(()=>{},...l.slice(1));for(let f=0;f<Rn.length;f++)if(Rn[f]===a){Rn.splice(f,1);break}Ua(o).then(()=>{})}let s=l=>{clearTimeout(n),n=setTimeout(()=>{let u=t.getPrefixCls(void 0,AR()),f=t.getIconPrefixCls(),d=t.getTheme(),m=xa.default.createElement(WO,{...l});ja(xa.default.createElement(di,{prefixCls:u,iconPrefixCls:f,theme:d},ot(t.holderRender)?t.holderRender(m):m),o)})};function a(...l){r={...r,open:!1,afterClose:()=>{ot(e.afterClose)&&e.afterClose(),i.apply(this,l)}},s(r)}function c(l){ot(l)?r=l(r):r={...r,...l},s(r)}return s(r),Rn.push(a),{destroy:a,update:c}}function Qf(e){return{...e,type:"warning"}}function Zf(e){return{...e,type:"info"}}function Jf(e){return{...e,type:"success"}}function ed(e){return{...e,type:"error"}}function td(e){return{...e,type:"confirm"}}function _R({rootPrefixCls:e}){OR=e}var ba=$(require("react"));var er=$(require("react"));function wh(e){return t=>er.createElement(di,{theme:{token:{motion:!1,zIndexPopupBase:0}}},er.createElement(e,{...t}))}var jO=(e,t,o,r,n)=>wh(s=>{let{prefixCls:a,style:c}=s,l=er.useRef(null),[u,f]=er.useState(0),[d,m]=er.useState(0),[p,g]=it(!1,s.open),{getPrefixCls:y}=er.useContext(Se),x=y(r||"select",a);er.useEffect(()=>{if(g(!0),typeof ResizeObserver<"u"){let S=new ResizeObserver(R=>{let v=R[0].target;f(v.offsetHeight+8),m(v.offsetWidth)}),C=setInterval(()=>{let R=n?`.${n(x)}`:`.${x}-dropdown`,v=l.current?.querySelector(R);v&&(clearInterval(C),S.observe(v))},10);return()=>{clearInterval(C),S.disconnect()}}},[x]);let b={...s,style:{...c,margin:0},open:p,getPopupContainer:()=>l.current};return o&&(b=o(b)),t&&(b={...b,[t]:{overflow:{adjustX:!1,adjustY:!1}}}),er.createElement("div",{ref:l,style:{paddingBottom:u,position:"relative",minWidth:d}},er.createElement(e,{...b}))}),LR=jO;var UO=e=>{let{prefixCls:t,className:o,closeIcon:r,closable:n,type:i,title:s,children:a,footer:c,style:l,classNames:u,styles:f,...d}=e,{getPrefixCls:m}=ba.useContext(Se),{className:p,style:g,classNames:y,styles:x}=De("modal"),b=m(),h=t||m("modal"),S=no(b),[C,R]=Xf(h,S),v=Ee(g),w=Ee(l),[T,I]=je([y,u],[x,v,f,w],{props:e}),P=`${h}-confirm`,N={};return i?N={closable:n??!1,title:"",footer:"",children:ba.createElement(Eh,{...e,prefixCls:h,confirmPrefixCls:P,rootPrefixCls:b,content:a})}:N={closable:n??!0,title:s,footer:c!==null&&ba.createElement(Gf,{...e}),children:a},ba.createElement(xl,{prefixCls:h,className:E(C,`${h}-pure-panel`,i&&P,i&&`${P}-${i}`,o,p,R,S,T.root),style:I.root,...d,closeIcon:qf(h,r),closable:n,classNames:T,styles:I,...N})},DR=wh(UO);var Wt=$(require("react"));var rn=$(require("react"));var qO=rn.forwardRef((e,t)=>{let{afterClose:o,config:r,...n}=e,[i,s]=rn.useState(!0),[a,c]=rn.useState(r),{direction:l,getPrefixCls:u}=rn.useContext(Se),f=u("modal"),d=u(),m=()=>{o(),a.afterClose?.()},p=(...x)=>{s(!1),x.some(h=>h?.triggerCancel)&&a.onCancel?.(()=>{},...x.slice(1))};rn.useImperativeHandle(t,()=>({destroy:p,update:x=>{c(b=>{let h=ot(x)?x(b):x;return{...b,...h}})}}));let g=a.okCancel??a.type==="confirm",[y]=$o("Modal",lr.Modal);return rn.createElement(Yf,{prefixCls:f,rootPrefixCls:d,...a,close:p,open:i,afterClose:m,okText:Lt(a.okText,g?y?.okText:y?.justOkText),direction:a.direction||l,cancelText:Lt(a.cancelText,y?.cancelText),...n})}),FR=qO;var zR=0,GO=Wt.memo(Wt.forwardRef((e,t)=>{let[o,r]=gv();return Wt.useImperativeHandle(t,()=>({patchElement:r}),[r]),Wt.createElement(Wt.Fragment,null,o)}));function XO(){let e=Wt.useRef(null),[t,o]=Wt.useState([]);Wt.useEffect(()=>{t.length&&(Rt(t).forEach(s=>{s()}),o([]))},[t]);let r=Wt.useCallback(i=>function(a){zR+=1;let c=Wt.createRef(),l,u=new Promise(g=>{l=g}),f=!1,d,m=Wt.createElement(FR,{key:`modal-${zR}`,config:i(a),ref:c,afterClose:()=>{d?.()},isSilent:()=>f,onConfirm:g=>{l(g)}});return d=e.current?.patchElement(m),d&&Rn.push(d),{destroy:()=>{function g(){c.current?.destroy()}c.current?g():o(y=>[].concat(Rt(y),[g]))},update:g=>{function y(){c.current?.update(g)}c.current?y():o(x=>[].concat(Rt(x),[y]))},then:g=>(f=!0,u.then(g))}},[]);return[Wt.useMemo(()=>({info:r(Zf),success:r(Jf),error:r(ed),warning:r(Qf),confirm:r(td)}),[r]),Wt.createElement(GO,{key:"modal-holder",ref:e})]}var BR=XO;function VR(e){return ps(Qf(e))}var nn=Kf;nn.useModal=BR;nn.info=function(t){return ps(Zf(t))};nn.success=function(t){return ps(Jf(t))};nn.error=function(t){return ps(ed(t))};nn.warning=VR;nn.warn=VR;nn.confirm=function(t){return ps(td(t))};nn.destroyAll=function(){for(;Rn.length;){let t=Rn.pop();t&&t()}};nn.config=_R;nn._InternalPanelDoNotUseOrYouWillBeFired=DR;var HR=nn;var Dr=$(require("react"));var yt=$(require("react"));var bt=$(require("react"));var $h=require("react"),kR=(e,t,o,r,n=!1,i,s)=>{let a=(0,$h.useMemo)(()=>typeof o=="boolean"?{allowClear:o}:o&&typeof o=="object"?o:{allowClear:!1},[o]);return(0,$h.useMemo)(()=>{let c=!n&&a.allowClear!==!1&&(t.length||i)&&!(s==="combobox"&&i==="");return{allowClear:c,clearIcon:c?a.clearIcon||r||"\xD7":null,label:c?a.label??"Clear":""}},[a,r,n,t.length,i,s])};var od=$(require("react")),Ph=od.createContext(null);function zo(){return od.useContext(Ph)}var Il=$(require("react"));function Nh(e=250){let t=Il.useRef(null),o=Il.useRef(null);Il.useEffect(()=>()=>{window.clearTimeout(o.current)},[]);function r(n){(n||t.current===null)&&(t.current=n),window.clearTimeout(o.current),o.current=window.setTimeout(()=>{t.current=null},e)}return[()=>t.current,r]}var WR=$(require("react"));function Ih(e,t){return e.filter(o=>o).some(o=>o.contains(t)||o===t)}function Th(e,t,o,r){let n=ye(i=>{if(r)return;let s=i.target;s.shadowRoot&&i.composed&&(s=i.composedPath()[0]||s),i._ori_target&&(s=i._ori_target),t&&!Ih(e(),s)&&o(!1)});WR.useEffect(()=>(window.addEventListener("mousedown",n),()=>window.removeEventListener("mousedown",n)),[n])}var _r=$(require("react"));function Mh(){return Mh=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Mh.apply(this,arguments)}var KO=e=>{let t=e===!0?0:1;return{bottomLeft:{points:["tl","bl"],offset:[0,4],overflow:{adjustX:t,adjustY:1},htmlRegion:"scroll"},bottomRight:{points:["tr","br"],offset:[0,4],overflow:{adjustX:t,adjustY:1},htmlRegion:"scroll"},topLeft:{points:["bl","tl"],offset:[0,-4],overflow:{adjustX:t,adjustY:1},htmlRegion:"scroll"},topRight:{points:["br","tr"],offset:[0,-4],overflow:{adjustX:t,adjustY:1},htmlRegion:"scroll"}}},YO=(e,t)=>{let{prefixCls:o,disabled:r,visible:n,children:i,popupElement:s,animation:a,transitionName:c,popupStyle:l,popupClassName:u,direction:f="ltr",placement:d,builtinPlacements:m,popupMatchSelectWidth:p,popupRender:g,popupAlign:y,getPopupContainer:x,empty:b,onPopupVisibleChange:h,onPopupMouseEnter:S,onPopupMouseDown:C,onPopupBlur:R,...v}=e,w=`${o}-dropdown`,T=s;g&&(T=g(s));let I=_r.useMemo(()=>m||KO(p),[m,p]),P=a?`${w}-${a}`:c,N=typeof p=="number",O=_r.useMemo(()=>p===!1||N?"minWidth":"width",[p,N]),_=l;N&&(_={...l,width:p});let M=_r.useRef(null);return _r.useImperativeHandle(t,()=>({getPopupElement:()=>M.current?.popupElement})),_r.createElement(Eu,Mh({},v,{showAction:h?["click"]:[],hideAction:h?["click"]:[],popupPlacement:d||(f==="rtl"?"bottomRight":"bottomLeft"),builtinPlacements:I,prefixCls:w,popupMotion:{motionName:P},popup:_r.createElement("div",{onMouseEnter:S,onMouseDown:C,onBlur:R},T),ref:M,stretch:O,popupAlign:y,popupVisible:n,getPopupContainer:x,popupClassName:E(u,{[`${w}-empty`]:b}),popupStyle:_,onPopupVisibleChange:h}),i)},QO=_r.forwardRef(YO),jR=QO;function UR(e,t){let{key:o}=e,r;return"value"in e&&({value:r}=e),o??(r!==void 0?r:`rc-index-key-${t}`)}function Tl(e){return typeof e<"u"&&!Number.isNaN(e)}function Oh(e,t){let{label:o,value:r,options:n,groupLabel:i}=e||{},s=o||(t?"children":"label");return{label:s,value:r||"value",options:n||"options",groupLabel:i||s}}function qR(e,{fieldNames:t,childrenAsData:o}={}){let r=[],{label:n,value:i,options:s,groupLabel:a}=Oh(t,!1);function c(l,u){Array.isArray(l)&&l.forEach(f=>{if(u||!(s in f)){let d=f[i];r.push({key:UR(f,r.length),groupOption:u,data:f,label:f[n],value:d})}else{let d=f[a];d===void 0&&o&&(d=f.label),r.push({key:UR(f,r.length),group:!0,data:f,label:d}),c(f[s],!0)}})}return c(e,!1),r}function Ml(e){let t={...e};return"props"in t||Object.defineProperty(t,"props",{get(){return Gt(!1,"Return type is option instead of Option instance. Please read value directly instead of reading from `props`."),t}}),t}var GR=(e,t,o)=>{if(!t||!t.length)return null;let r=!1,n=(s,[a,...c])=>{if(!a)return[s];let l=s.split(a);return r=r||l.length>1,l.reduce((u,f)=>[...u,...n(f,c)],[]).filter(Boolean)},i=n(e,t);return r?typeof o<"u"?i.slice(0,o):i:null};var XR=$(require("react"));function Ah(e){let{visible:t,values:o}=e;if(!t)return null;let r=50;return XR.createElement("span",{"aria-live":"polite",style:{width:0,height:0,position:"absolute",overflow:"hidden",opacity:0}},`${o.slice(0,r).map(({label:n,value:i})=>["number","string"].includes(typeof n)?n:i).join(", ")}`,o.length>r?", ...":null)}var gs=require("react"),ZO=e=>{let t=new MessageChannel;t.port1.onmessage=e,t.port2.postMessage(null)},rd=(e,t=1)=>{if(t<=0){e();return}ZO(()=>{rd(e,t-1)})};function _h(e,t,o,r){let[n,i]=(0,gs.useState)(!1);(0,gs.useEffect)(()=>{i(!0)},[]);let[s,a]=it(e,t),[c,l]=(0,gs.useState)(!1),u=n?s:!1,f=r(u),d=(0,gs.useRef)(0),m=ye(g=>{o&&f!==g&&o(g),a(g)}),p=ye((g,y={})=>{let{cancelFun:x}=y;d.current+=1;let b=d.current,h=typeof g=="boolean"?g:!f;l(!h);function S(){b===d.current&&!x?.()&&(m(h),l(!1))}h?S():rd(()=>{S()})});return[u,f,p,c]}var uo=$(require("react"));var KR=$(require("react"));function nd(e){let{children:t,...o}=e;return t?KR.createElement("div",o,t):null}var Ll=$(require("react"));var Vo=$(require("react"));var Bo=$(require("react"));var id=$(require("react")),YR=id.createContext(null);function En(){return id.useContext(YR)}var QR=YR;var JO=Bo.forwardRef((e,t)=>{let{onChange:o,onKeyDown:r,onBlur:n,style:i,syncWidth:s,value:a,className:c,autoComplete:l,...u}=e,{prefixCls:f,mode:d,onSearch:m,onSearchSubmit:p,onInputBlur:g,autoFocus:y,tokenWithEnter:x,placeholder:b,components:{input:h="input"}}=En(),{id:S,classNames:C,styles:R,open:v,activeDescendantId:w,role:T,disabled:I}=zo()||{},P=E(`${f}-input`,C?.input,c),N=Bo.useRef(!1),O=Bo.useRef(null),_=Bo.useRef(null);Bo.useImperativeHandle(t,()=>_.current);let M=L=>{let{value:U}=L.target;if(x&&O.current&&/[\r\n]/.test(O.current)){let X=O.current.replace(/[\r\n]+$/,"").replace(/\r\n/g," ").replace(/[\r\n]/g," ");U=U.replace(X,O.current)}O.current=null,m&&m(U,!0,N.current),o?.(L)},A=L=>{let{key:U}=L,{value:X}=L.currentTarget;U==="Enter"&&d==="tags"&&!v&&!N.current&&p&&p(X),r?.(L)},V=L=>{g?.(),n?.(L)},F=()=>{N.current=!0},G=L=>{if(N.current=!1,d!=="combobox"){let{value:U}=L.currentTarget;m?.(U,!0,!1)}},z=L=>{let{clipboardData:U}=L,X=U?.getData("text");O.current=X||""},[B,k]=Bo.useState(void 0);qe(()=>{let L=_.current;if(s&&L){L.style.width="0px";let U=L.scrollWidth;k(U),L.style.width=""}},[s,a]);let W={id:S,type:"text",...u,ref:_,style:{...R?.input,...i,"--select-input-width":B},autoFocus:y,autoComplete:l||"new-password",className:P,disabled:I,value:a||"",onChange:M,onKeyDown:A,onBlur:V,onPaste:z,onCompositionStart:F,onCompositionEnd:G,role:T||"combobox","aria-expanded":v||!1,"aria-haspopup":"listbox","aria-owns":v?`${S}_list`:void 0,"aria-autocomplete":"list","aria-controls":v?`${S}_list`:void 0,"aria-activedescendant":v?w:void 0};if(Bo.isValidElement(h)){let L=h.props||{},U={placeholder:e.placeholder||b,...W,...L};return Object.keys(L).forEach(X=>{let Y=L[X];typeof Y=="function"&&(U[X]=(...q)=>{Y(...q),W[X]?.(...q)})}),U.ref=gt(h.ref,W.ref),Bo.cloneElement(h,U)}return Bo.createElement(h,W)}),sd=JO;var ZR=$(require("react"));function Ol(e){let{prefixCls:t,placeholder:o,displayValues:r}=En(),{classNames:n,styles:i}=zo(),{show:s=!0}=e;return r.length?null:ZR.createElement("div",{className:E(`${t}-placeholder`,n?.placeholder),style:{...s?{}:{visibility:"hidden"},...i?.placeholder}},o)}var JR=$(require("react")),eA=JR.createContext(null),ya=eA;function Al(e){return Array.isArray(e)?e:e!==void 0?[e]:[]}var WJ=typeof window<"u"&&window.document&&window.document.documentElement;function tE(e){return e!=null}function oE(e){return!e&&e!==0}function eE(e){return["string","number"].includes(typeof e)}function _l(e){let t;return e&&(eE(e.title)?t=e.title.toString():eE(e.label)&&(t=e.label.toString())),t}function Lh(){return Lh=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Lh.apply(this,arguments)}var tA=Vo.forwardRef(({inputProps:e},t)=>{let{prefixCls:o,searchValue:r,activeValue:n,displayValues:i,maxLength:s,mode:a,components:c}=En(),{triggerOpen:l,title:u,showSearch:f,classNames:d,styles:m}=zo(),p=Vo.useContext(ya),[g,y]=Vo.useState(!1),x=a==="combobox",b=i[0],h=Vo.useMemo(()=>x&&n&&!g&&l?n:f?r:"",[x,n,g,l,r,f]),[S,C,R,v]=Vo.useMemo(()=>{let P,N,O;if(b&&p?.flattenOptions){let M=p.flattenOptions.find(A=>A.value===b.value);M?.data&&(P=M.data.className,N=M.data.style,O=_l(M.data))}return b&&!O&&(O=_l(b)),u!==void 0&&(O=u),[P,N,O,!!P||!!N]},[b,p?.flattenOptions,u]);Vo.useEffect(()=>{x&&y(!1)},[x,n]);let w=b&&b.label!==null&&b.label!==void 0&&String(b.label).trim()!=="",I=!(x&&c?.input)?b?v?Vo.createElement("div",{className:E(`${o}-content-value`,S),style:{...h?{visibility:"hidden"}:{},...C},title:R},b.label):b.label:Vo.createElement(Ol,{show:!h}):null;return Vo.createElement("div",{className:E(`${o}-content`,w&&`${o}-content-has-value`,h&&`${o}-content-has-search-value`,v&&`${o}-content-has-option-style`,d?.content),style:m?.content,title:v?void 0:R},I,Vo.createElement(sd,Lh({ref:t},e,{value:h,maxLength:a==="combobox"?s:void 0,onChange:P=>{y(!0),e.onChange?.(P)}})))}),rE=tA;var $n=$(require("react"));var pr=$(require("react")),wn=require("react");var hs=$(require("react"));var Ca=void 0;function oA(e,t){let{prefixCls:o,invalidate:r,item:n,renderItem:i,responsive:s,responsiveDisabled:a,registerSize:c,itemKey:l,className:u,style:f,children:d,display:m,order:p,component:g="div",...y}=e,x=s&&!m;function b(v){c(l,v)}hs.useEffect(()=>()=>{b(null)},[]);let h=i&&n!==Ca?i(n,{index:p}):d,S;r||(S={opacity:x?0:1,height:x?0:Ca,overflowY:x?"hidden":Ca,order:s?p:Ca,pointerEvents:x?"none":Ca,position:x?"absolute":Ca});let C={};x&&(C["aria-hidden"]=!0);let R=hs.createElement(g,dr({className:E(!r&&o,u),style:{...S,...f}},C,y,{ref:t}),h);return s&&(R=hs.createElement(Ir,{onResize:({offsetWidth:v})=>{b(v)},disabled:a},R)),R}var rA=hs.forwardRef(oA),xs=rA;var ad=$(require("react")),nE=require("react-dom");function Dh(e){if(typeof MessageChannel>"u")Ge(e);else{let t=new MessageChannel;t.port1.onmessage=()=>e(),t.port2.postMessage(void 0)}}function iE(){let e=ad.useRef(null);return o=>{e.current||(e.current=[],Dh(()=>{(0,nE.unstable_batchedUpdates)(()=>{e.current.forEach(r=>{r()}),e.current=null})})),e.current.push(o)}}function Ei(e,t){let[o,r]=ad.useState(t),n=ye(i=>{e(()=>{r(i)})});return[o,n]}var wi=$(require("react"));var sE=$(require("react")),bs=sE.default.createContext(null);var nA=(e,t)=>{let o=wi.useContext(bs);if(!o){let{component:a="div",...c}=e;return wi.createElement(a,dr({},c,{ref:t}))}let{className:r,...n}=o,{className:i,...s}=e;return wi.createElement(bs.Provider,{value:null},wi.createElement(xs,dr({ref:t,className:E(r,i)},n,s)))},iA=wi.forwardRef(nA),aE=iA;var lE="responsive",cE="invalidate";function sA(e){return`+ ${e.length} ...`}function aA(e,t){let{prefixCls:o="rc-overflow",data:r=[],renderItem:n,renderRawItem:i,itemKey:s,itemWidth:a=10,ssr:c,style:l,className:u,maxCount:f,renderRest:d,renderRawRest:m,prefix:p,suffix:g,component:y="div",itemComponent:x,onVisibleChange:b,...h}=e,S=c==="full",C=iE(),[R,v]=Ei(C,null),w=R||0,[T,I]=Ei(C,new Map),[P,N]=Ei(C,0),[O,_]=Ei(C,0),[M,A]=Ei(C,0),[V,F]=Ei(C,0),[G,z]=(0,wn.useState)(null),[B,k]=(0,wn.useState)(null),W=pr.useMemo(()=>B===null&&S?Number.MAX_SAFE_INTEGER:B||0,[B,R]),[j,L]=(0,wn.useState)(!1),U=`${o}-item`,X=Math.max(P,O),Y=f===lE,q=r.length&&Y,D=f===cE,K=q||typeof f=="number"&&r.length>f,H=(0,wn.useMemo)(()=>{let de=r;return q?R===null&&S?de=r:de=r.slice(0,Math.min(r.length,w/a)):typeof f=="number"&&(de=r.slice(0,f)),de},[r,a,R,f,q]),Q=(0,wn.useMemo)(()=>q?r.slice(W+1):r.slice(H.length),[r,H,q,W]),Z=(0,wn.useCallback)((de,le)=>typeof s=="function"?s(de):(s&&de?.[s])??le,[s]),te=(0,wn.useCallback)(n||(de=>de),[n]);function se(de,le,Re){B===de&&(le===void 0||le===G)||(k(de),Re||(L(de<r.length-1),b?.(de)),le!==void 0&&z(le))}function re(de,le){v(le.clientWidth)}function oe(de,le){I(Re=>{let pe=new Map(Re);return le===null?pe.delete(de):pe.set(de,le),pe})}function ae(de,le){_(le),N(O)}function ie(de,le){A(le)}function be(de,le){F(le)}function ee(de){return T.get(Z(H[de],de))}qe(()=>{if(w&&typeof X=="number"&&H){let de=M+V,le=H.length,Re=le-1;if(!le){se(0,null);return}for(let pe=0;pe<le;pe+=1){let ve=ee(pe);if(S&&(ve=ve||0),ve===void 0){se(pe-1,void 0,!0);break}if(de+=ve,Re===0&&de<=w||pe===Re-1&&de+ee(Re)<=w){se(Re,null);break}else if(de+X>w){se(pe-1,de-ve-V+O);break}}g&&ee(0)+V>w&&z(null)}},[w,T,O,M,V,Z,H]);let xe=j&&!!Q.length,fe={};G!==null&&q&&(fe={position:"absolute",top:0,insetInlineStart:G});let _e={prefixCls:U,responsive:q,component:x,invalidate:D},Ve=i?(de,le)=>{let Re=Z(de,le);return pr.createElement(bs.Provider,{key:Re,value:{..._e,order:le,item:de,itemKey:Re,registerSize:oe,display:le<=W}},i(de,le))}:(de,le)=>{let Re=Z(de,le);return pr.createElement(xs,dr({},_e,{order:le,key:Re,item:de,renderItem:te,itemKey:Re,registerSize:oe,display:le<=W}))},ue={order:xe?W:Number.MAX_SAFE_INTEGER,className:`${U}-rest`,registerSize:ae,display:xe},He=d||sA,Ke=m?pr.createElement(bs.Provider,{value:{..._e,...ue}},m(Q)):pr.createElement(xs,dr({},_e,ue),typeof He=="function"?He(Q):He),Pe=pr.createElement(y,dr({className:E(!D&&o,u),style:l,ref:t},h),p&&pr.createElement(xs,dr({},_e,{responsive:Y,responsiveDisabled:!q,order:-1,className:`${U}-prefix`,registerSize:ie,display:!0}),p),H.map(Ve),K?Ke:null,g&&pr.createElement(xs,dr({},_e,{responsive:Y,responsiveDisabled:!q,order:W,className:`${U}-suffix`,registerSize:be,display:!0,style:fe}),g));return Y?pr.createElement(Ir,{onResize:re,disabled:!q},Pe):Pe}var ld=pr.forwardRef(aA);ld.Item=aE;ld.RESPONSIVE=lE;ld.INVALIDATE=cE;var uE=ld;var fE=uE;var Fh=$(require("react"));var lA=e=>{let{className:t,style:o,customizeIcon:r,customizeIconProps:n,children:i,onMouseDown:s,onClick:a}=e,c=typeof r=="function"?r(n):r;return Fh.createElement("span",{className:t,onMouseDown:l=>{l.preventDefault(),s?.(l)},style:{userSelect:"none",WebkitUserSelect:"none",...o},unselectable:"on",onClick:a,"aria-hidden":!0},c!==void 0?c:Fh.createElement("span",{className:E(t.split(/\s+/).map(l=>`${l}-icon`))},i))},cd=lA;function zh(){return zh=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},zh.apply(this,arguments)}function cA(e){return e.key??e.value}var dE=e=>{e.preventDefault(),e.stopPropagation()},mE=$n.forwardRef(function({inputProps:t},o){let{prefixCls:r,displayValues:n,searchValue:i,mode:s,onSelectorRemove:a,removeIcon:c}=En(),{disabled:l,showSearch:u,triggerOpen:f,rawOpen:d,toggleOpen:m,autoClearSearchValue:p,tagRender:g,maxTagPlaceholder:y,maxTagTextLength:x,maxTagCount:b,classNames:h,styles:S}=zo(),C=`${r}-selection-item`,R=i;!d&&s==="multiple"&&p!==!1&&(R="");let v=u&&R||"",w=u&&!l,T=c??"\xD7",I=y??(F=>`+ ${F.length} ...`),P=g,N=F=>{m(F)},O=F=>{a?.(F)},_=(F,G,z,B,k)=>$n.createElement("span",{title:_l(F),className:E(C,{[`${C}-disabled`]:z},h?.item),style:S?.item},$n.createElement("span",{className:E(`${C}-content`,h?.itemContent),style:S?.itemContent},G),B&&$n.createElement(cd,{className:E(`${C}-remove`,h?.itemRemove),style:S?.itemRemove,onMouseDown:dE,onClick:k,customizeIcon:T},"\xD7")),M=(F,G,z,B,k,W,j)=>$n.createElement("span",{onMouseDown:U=>{dE(U),N(!f)}},P({label:G,value:F,index:j?.index,disabled:z,closable:B,onClose:k,isMaxTag:!!W})),A=(F,G)=>{let{disabled:z,label:B,value:k}=F,W=!l&&!z,j=B;if(typeof x=="number"&&(typeof B=="string"||typeof B=="number")){let U=String(j);U.length>x&&(j=`${U.slice(0,x)}...`)}let L=U=>{U&&U.stopPropagation(),O(F)};return typeof P=="function"?M(k,j,z,W,L,void 0,G):_(F,j,z,W,L)},V=F=>{if(!n.length)return null;let G=typeof I=="function"?I(F):I;return typeof P=="function"?M(void 0,G,!1,!1,void 0,!0):_({title:G},G,!1)};return $n.createElement(fE,{prefixCls:`${r}-content`,className:h?.content,style:S?.content,prefix:!n.length&&!v&&$n.createElement(Ol,null),data:n,renderItem:A,renderRest:V,suffix:$n.createElement(sd,zh({ref:o,disabled:l,readOnly:!w},t,{value:v||"",syncWidth:!0})),itemKey:cA,maxCount:b})});var uA=Ll.forwardRef(function(t,o){let{multiple:r,onInputKeyDown:n,tabIndex:i}=En(),s=zo(),{showSearch:a}=s,l={...Ht(s,{aria:!0}),onKeyDown:n,readOnly:!a,tabIndex:i};return r?Ll.createElement(mE,{ref:o,inputProps:l}):Ll.createElement(rE,{ref:o,inputProps:l})}),pE=uA;function gE(e){return e&&![Ie.ESC,Ie.SHIFT,Ie.BACKSPACE,Ie.TAB,Ie.WIN_KEY,Ie.ALT,Ie.META,Ie.WIN_KEY_RIGHT,Ie.CTRL,Ie.SEMICOLON,Ie.EQUALS,Ie.CAPS_LOCK,Ie.CONTEXT_MENU,Ie.UP,Ie.LEFT,Ie.RIGHT,Ie.F1,Ie.F2,Ie.F3,Ie.F4,Ie.F5,Ie.F6,Ie.F7,Ie.F8,Ie.F9,Ie.F10,Ie.F11,Ie.F12].includes(e)}function ud(){return ud=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},ud.apply(this,arguments)}var fA=["value","onChange","removeIcon","placeholder","maxTagCount","maxTagTextLength","maxTagPlaceholder","choiceTransitionName","onInputKeyDown","onPopupScroll","tabIndex","activeValue","onSelectorRemove","focused"],hE=uo.forwardRef(function(t,o){let{prefixCls:r,className:n,style:i,prefix:s,suffix:a,clearIcon:c,clearLabel:l,children:u,multiple:f,displayValues:d,placeholder:m,mode:p,searchValue:g,onSearch:y,onSearchSubmit:x,onInputBlur:b,maxLength:h,autoFocus:S,onMouseDown:C,onClearMouseDown:R,onInputKeyDown:v,onSelectorRemove:w,tokenWithEnter:T,components:I,...P}=t,{triggerOpen:N,toggleOpen:O,showSearch:_,disabled:M,loading:A,classNames:V,styles:F}=zo(),G=uo.useRef(null),z=uo.useRef(null),B=ye(q=>{let{which:D}=q,K=z.current instanceof HTMLTextAreaElement;if(!K&&N&&(D===Ie.UP||D===Ie.DOWN)&&q.preventDefault(),v&&v(q),K&&!N&&~[Ie.UP,Ie.DOWN,Ie.LEFT,Ie.RIGHT].indexOf(D))return;!(q.ctrlKey||q.altKey||q.metaKey)&&gE(D)&&O(!0)});uo.useImperativeHandle(o,()=>({focus:q=>{(z.current||G.current).focus?.(q)},blur:()=>{(z.current||G.current).blur?.()},nativeElement:sr(G.current)}));let k=ye(q=>{if(!M){let D=sr(z.current);q.nativeEvent._ori_target=D;let K=D===q.target||D?.contains(q.target);D&&!K&&q.preventDefault();let Z=N&&!f&&(p==="combobox"||_)||N&&f&&K;q.nativeEvent._select_lazy?N&&!f&&O(!1):(z.current?.focus(),Z||O())}C?.(q)}),W=q=>{(q.key==="Enter"||q.key===" ")&&q.stopPropagation()},{root:j}=I,L=tt(P,fA),U=Ht(L,{aria:!0}),X=Object.keys(U),Y={...t,onInputKeyDown:B};if(j){let q=j.props||{},D={...q,...L};return Object.keys(q).forEach(K=>{let H=q[K],Q=L[K];typeof H=="function"&&typeof Q=="function"&&(D[K]=(...Z)=>{Q(...Z),H(...Z)})}),uo.isValidElement(j)?uo.cloneElement(j,{...D,ref:gt(j.ref,G)}):uo.createElement(j,ud({},D,{ref:G}))}return uo.createElement(QR.Provider,{value:Y},uo.createElement("div",ud({},tt(L,X),{ref:G,className:n,style:i,onMouseDown:k}),uo.createElement(nd,{className:E(`${r}-prefix`,V?.prefix),style:F?.prefix},s),uo.createElement(pE,{ref:z}),uo.createElement(nd,{className:E(`${r}-suffix`,{[`${r}-suffix-loading`]:A},V?.suffix),style:F?.suffix},a),c&&uo.createElement("button",{type:"button","aria-label":l,className:E(`${r}-clear`,V?.clear),style:F?.clear,onMouseDown:q=>{q.preventDefault(),q.nativeEvent._select_lazy=!0},onKeyDown:W,onClick:R},c),u))});var xE=$(require("react"));function Bh(e,t,o){return xE.useMemo(()=>{let{root:r,input:n}=e||{};return o&&(r=o()),t&&(n=t()),{root:r,input:n}},[e,t,o])}function Vh(){return Vh=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Vh.apply(this,arguments)}var Dl=e=>e==="tags"||e==="multiple",dA=bt.forwardRef((e,t)=>{let{id:o,prefixCls:r,className:n,styles:i,classNames:s,showSearch:a,tagRender:c,showScrollBar:l="optional",direction:u,omitDomProps:f,displayValues:d,onDisplayValuesChange:m,emptyOptions:p,notFoundContent:g="Not Found",onClear:y,maxCount:x,placeholder:b,mode:h,disabled:S,loading:C,getInputElement:R,getRawInputElement:v,open:w,defaultOpen:T,onPopupVisibleChange:I,activeValue:P,onActiveValueChange:N,activeDescendantId:O,searchValue:_,autoClearSearchValue:M,onSearch:A,onSearchSplit:V,tokenSeparators:F,allowClear:G,prefix:z,suffix:B,suffixIcon:k,clearIcon:W,OptionList:j,animation:L,transitionName:U,popupStyle:X,popupClassName:Y,popupMatchSelectWidth:q,popupRender:D,popupAlign:K,placement:H,builtinPlacements:Q,getPopupContainer:Z,showAction:te=[],onFocus:se,onBlur:re,onKeyUp:oe,onKeyDown:ae,onMouseDown:ie,components:be,...ee}=e,xe=Dl(h),fe=bt.useRef(null),_e=bt.useRef(null),Ve=bt.useRef(null),[ue,He]=bt.useState(!1);bt.useImperativeHandle(t,()=>({focus:fe.current?.focus,blur:fe.current?.blur,scrollTo:we=>Ve.current?.scrollTo(we),nativeElement:sr(fe.current)}));let Ke=Bh(be,R,v),Pe=bt.useMemo(()=>{if(h!=="combobox")return _;let we=d[0]?.value;return typeof we=="string"||typeof we=="number"?String(we):""},[_,h,d]),de=h==="combobox"&&typeof R=="function"&&R()||null,le=!g&&p,[Re,pe,ve,Fe]=_h(T||!1,w,I,we=>S||le?!1:we),Ye=bt.useMemo(()=>typeof F=="function"||(F||[]).some(we=>[`
`,`\r
`].includes(we)),[F]),Je=bt.useMemo(()=>typeof F=="function"?(we,ke)=>{let _t=F(we),vo=Array.isArray(_t)&&_t.length===1&&_t[0]===we;return!Array.isArray(_t)||!_t.length||vo?null:typeof ke<"u"?_t.slice(0,ke):_t}:(we,ke)=>GR(we,F,ke),[F]),st=(we,ke,_t)=>{if(xe&&Tl(x)&&d.length>=x)return;let vo=!0,ct=we;N?.(null);let Vt=Tl(x)?x-d.length:void 0,ho=_t?null:Je(we,Vt);return h!=="combobox"&&ho&&(ct="",V?.(ho),ve(!1),vo=!1),A&&Pe!==ct&&A(ct,{source:ke?"typing":"effect"}),we&&ke&&vo&&ve(!0),vo},Xe=we=>{!we||!we.trim()||A(we,{source:"submit"})};bt.useEffect(()=>{!Re&&!xe&&h!=="combobox"&&st("",!1,!1)},[Re]),bt.useEffect(()=>{S&&(ve(!1),He(!1))},[S,pe]);let[wt,$t]=Nh(),lt=bt.useRef(!1),Ct=we=>{let ke=wt(),{key:_t}=we,vo=_t==="Enter",ct=_t===" ";if(vo||ct){let Vt=h==="combobox";(ct&&!(Vt||a)||vo&&!Vt)&&we.preventDefault(),pe||ve(!0)}if($t(!!Pe),_t==="Backspace"&&!ke&&xe&&!Pe&&d.length){let Vt=[...d],ho=null;for(let ko=Vt.length-1;ko>=0;ko-=1){let Wr=Vt[ko];if(!Wr.disabled){Vt.splice(ko,1),ho=Wr;break}}ho&&m(Vt,{type:"remove",values:[ho]})}pe&&(!vo||!lt.current)&&!ct&&(vo&&(lt.current=!0),Ve.current?.onKeyDown(we)),ae?.(we)},Pt=(we,...ke)=>{pe&&Ve.current?.onKeyUp(we,...ke),we.key==="Enter"&&(lt.current=!1),oe?.(we,...ke)},Nt=ye(we=>{let ke=d.filter(_t=>_t!==we);m(ke,{type:"remove",values:[we]})}),Me=()=>{lt.current=!1},zt=()=>[sr(fe.current),_e.current?.getPopupElement()];Th(zt,pe,ve,!!Ke.root);let ce=bt.useRef(!1),ge=we=>{He(!0),S||(te.includes("focus")&&ve(!0),se?.(we))},Le=()=>{pe&&!ce.current&&ve(!1,{cancelFun:()=>Ih(zt(),document.activeElement)})},ne=we=>{He(!1),Pe&&(h==="tags"?A(Pe,{source:"submit"}):h==="multiple"&&A("",{source:"blur"})),Le(),S||re?.(we)},Ce=(we,...ke)=>{let{target:_t}=we;_e.current?.getPopupElement()?.contains(_t)&&ve&&ve(!0),ie?.(we,...ke),ce.current=!0,rd(()=>{ce.current=!1})},[,he]=bt.useState({});function $e(){he({})}let Qe;Ke.root&&(Qe=we=>{ve(we)});let Bt=bt.useMemo(()=>({...e,notFoundContent:g,open:pe,triggerOpen:pe,rawOpen:Re,id:o,showSearch:a,multiple:xe,toggleOpen:ve,showScrollBar:l,styles:i,classNames:s,lockOptions:Fe}),[e,g,ve,o,a,xe,pe,Re,l,i,s,Fe]),At=bt.useMemo(()=>{let we=B??k;return typeof we=="function"?we({searchValue:Pe,open:pe,focused:ue,showSearch:a,loading:C}):we},[B,k,Pe,pe,ue,a,C]),pt=()=>{y?.(),fe.current?.focus(),m([],{type:"clear",values:d}),st("",!1,!1)},{allowClear:qt,clearIcon:Qt,label:vr}=kR(r,d,G,W,S,Pe,h),io=bt.createElement(j,{ref:Ve}),so=E(r,n,{[`${r}-focused`]:ue,[`${r}-multiple`]:xe,[`${r}-single`]:!xe,[`${r}-allow-clear`]:qt,[`${r}-show-arrow`]:At!=null,[`${r}-disabled`]:S,[`${r}-loading`]:C,[`${r}-open`]:pe,[`${r}-customize-input`]:de,[`${r}-show-search`]:a}),go=bt.createElement(hE,Vh({},ee,{ref:fe,prefixCls:r,className:so,focused:ue,prefix:z,suffix:At,clearIcon:Qt,clearLabel:vr,multiple:xe,mode:h,displayValues:d,placeholder:b,searchValue:Pe,activeValue:P,onSearch:st,onSearchSubmit:Xe,onInputBlur:Me,onFocus:ge,onBlur:ne,onClearMouseDown:pt,onKeyDown:Ct,onKeyUp:Pt,onSelectorRemove:Nt,tokenWithEnter:Ye,onMouseDown:Ce,components:Ke}));return go=bt.createElement(jR,{ref:_e,disabled:S,prefixCls:r,visible:pe,popupElement:io,animation:L,transitionName:U,popupStyle:X,popupClassName:Y,direction:u,popupMatchSelectWidth:q,popupRender:D,popupAlign:K,placement:H,builtinPlacements:Q,getPopupContainer:Z,empty:p,onPopupVisibleChange:Qe,onPopupMouseEnter:$e,onPopupMouseDown:Ce,onPopupBlur:Le},go),bt.createElement(Ph.Provider,{value:Bt},bt.createElement(Ah,{visible:ue&&!pe,values:d}),go)}),Hh=dA;var bE=()=>null;bE.isSelectOptGroup=!0;var Fl=bE;var yE=()=>null;yE.isSelectOption=!0;var zl=yE;var Yt=$(require("react")),tr=require("react"),tx=require("react-dom");var Sa=$(require("react"));function kh(){return kh=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},kh.apply(this,arguments)}var CE=Sa.forwardRef(({height:e,offsetY:t,offsetX:o,children:r,prefixCls:n,onInnerResize:i,innerProps:s,rtl:a,extra:c},l)=>{let u={},f={display:"flex",flexDirection:"column"};return t!==void 0&&(u={height:e,position:"relative",overflow:"hidden"},f={...f,transform:`translateY(${t}px)`,[a?"marginRight":"marginLeft"]:-o||0,position:"absolute",left:0,right:0,top:0}),Sa.createElement("div",{style:u},Sa.createElement(Ir,{onResize:({offsetHeight:d})=>{d&&i&&i()}},Sa.createElement("div",kh({style:f,className:E({[`${n}-holder-inner`]:n}),ref:l},s),r,c)))});CE.displayName="Filler";var SE=CE;var RE=$(require("react"));var fd=$(require("react"));function vE({children:e,setRef:t}){let o=fd.useCallback(r=>{t(r)},[t]);return fd.cloneElement(e,{ref:o})}function Wh(e,t,o,r,n,i,s,{getKey:a}){return e.slice(t,o+1).map((c,l)=>{let u=t+l,f=s(c,u,{style:{width:r},offsetX:n}),d=a(c);return RE.createElement(vE,{key:d,setRef:m=>i(c,m)},f)})}var Bl=$(require("react"));function EE(e,t,o){let r=e.length,n=t.length,i,s;if(r===0&&n===0)return null;r<n?(i=e,s=t):(i=t,s=e);let a={__EMPTY_ITEM__:!0};function c(f){return f!==void 0?o(f):a}let l=null,u=Math.abs(r-n)!==1;for(let f=0;f<s.length;f+=1){let d=c(i[f]),m=c(s[f]);if(d!==m){l=f,u=u||d!==c(s[f+1]);break}}return l===null?null:{index:l,multiple:u}}function jh(e,t,o){let[r,n]=Bl.useState(e),[i,s]=Bl.useState(null);return Bl.useEffect(()=>{let a=EE(r||[],e||[],t);a?.index!==void 0&&(o?.(a.index),s(e[a.index])),n(e)},[e]),[i]}var ys=require("react");var mA=typeof navigator=="object"&&/Firefox/i.test(navigator.userAgent),Uh=mA;var dd=require("react"),md=((e,t,o,r)=>{let n=(0,dd.useRef)(!1),i=(0,dd.useRef)(null);function s(){clearTimeout(i.current),n.current=!0,i.current=setTimeout(()=>{n.current=!1},50)}let a=(0,dd.useRef)({top:e,bottom:t,left:o,right:r});return a.current.top=e,a.current.bottom=t,a.current.left=o,a.current.right=r,(c,l,u=!1)=>{let f=c?l<0&&a.current.left||l>0&&a.current.right:l<0&&a.current.top||l>0&&a.current.bottom;return u&&f?(clearTimeout(i.current),n.current=!1):(!f||n.current)&&s(),!n.current&&f}});function qh(e,t,o,r,n,i,s){let a=(0,ys.useRef)(0),c=(0,ys.useRef)(null),l=(0,ys.useRef)(null),u=(0,ys.useRef)(!1),f=md(t,o,r,n);function d(b,h){if(Ge.cancel(c.current),f(!1,h))return;let S=b;if(!S._virtualHandled)S._virtualHandled=!0;else return;a.current+=h,l.current=h,Uh||S.preventDefault(),c.current=Ge(()=>{let C=u.current?10:1;s(a.current*C,!1),a.current=0})}function m(b,h){s(h,!0),Uh||b.preventDefault()}let p=(0,ys.useRef)(null),g=(0,ys.useRef)(null);function y(b){if(!e)return;Ge.cancel(g.current),g.current=Ge(()=>{p.current=null},2);let{deltaX:h,deltaY:S,shiftKey:C}=b,R=h,v=S;(p.current==="sx"||!p.current&&C&&S&&!h)&&(R=S,v=0,p.current="sx");let w=Math.abs(R),T=Math.abs(v);p.current===null&&(p.current=i&&w>T?"x":"y"),p.current==="y"?d(b,v):m(b,R)}function x(b){e&&(u.current=b.detail===l.current)}return[y,x]}var wE=$(require("react"));function $E(e,t,o,r){let[n,i]=wE.useMemo(()=>[new Map,[]],[e,o.id,r]);return(a,c=a)=>{let l=n.get(a),u=n.get(c);if(l===void 0||u===void 0){let f=e.length;for(let d=i.length;d<f;d+=1){let m=e[d],p=t(m);n.set(p,d);let g=o.get(p)??r;if(i[d]=(i[d-1]||0)+g,p===a&&(l=d),p===c&&(u=d),l!==void 0&&u!==void 0)break}}return{top:i[l-1]||0,bottom:i[u]}}}var IE=$(require("react")),va=require("react");var Gh=class{maps;id=0;diffRecords=new Map;constructor(){this.maps=Object.create(null)}set(t,o){this.diffRecords.set(t,this.maps[t]),this.maps[t]=o,this.id+=1}get(t){return this.maps[t]}resetRecord(){this.diffRecords.clear()}getRecord(){return this.diffRecords}},PE=Gh;function NE(e){let t=parseFloat(e);return isNaN(t)?0:t}function Xh(e,t,o){let[r,n]=IE.useState(0),i=(0,va.useRef)(new Map),s=(0,va.useRef)(new PE),a=(0,va.useRef)(0);function c(){a.current+=1}function l(f=!1){c();let d=()=>{let m=!1;i.current.forEach((p,g)=>{if(p&&p.offsetParent){let{offsetHeight:y}=p,{marginTop:x,marginBottom:b}=getComputedStyle(p),h=NE(x),S=NE(b),C=y+h+S;s.current.get(g)!==C&&(s.current.set(g,C),m=!0)}}),m&&n(p=>p+1)};if(f)d();else{a.current+=1;let m=a.current;Promise.resolve().then(()=>{m===a.current&&d()})}}function u(f,d){let m=e(f),p=i.current.get(m);d?(i.current.set(m,d),l()):i.current.delete(m),!p!=!d&&(d?t?.(f):o?.(f))}return(0,va.useEffect)(()=>c,[]),[u,l,s.current,r]}var Ra=require("react"),TE=14/15;function Kh(e,t,o){let r=(0,Ra.useRef)(!1),n=(0,Ra.useRef)(0),i=(0,Ra.useRef)(0),s=(0,Ra.useRef)(null),a=(0,Ra.useRef)(null),c,l=d=>{if(r.current){let m=Math.ceil(d.touches[0].pageX),p=Math.ceil(d.touches[0].pageY),g=n.current-m,y=i.current-p,x=Math.abs(g)>Math.abs(y);x?n.current=m:i.current=p;let b=o(x,x?g:y,!1,d);b&&d.preventDefault(),clearInterval(a.current),b&&(a.current=setInterval(()=>{x?g*=TE:y*=TE;let h=Math.floor(x?g:y);(!o(x,h,!0)||Math.abs(h)<=.1)&&clearInterval(a.current)},16))}},u=()=>{r.current=!1,c()},f=d=>{c(),d.touches.length===1&&!r.current&&(r.current=!0,n.current=Math.ceil(d.touches[0].pageX),i.current=Math.ceil(d.touches[0].pageY),s.current=d.target,s.current.addEventListener("touchmove",l,{passive:!1}),s.current.addEventListener("touchend",u,{passive:!0}))};c=()=>{s.current&&(s.current.removeEventListener("touchmove",l),s.current.removeEventListener("touchend",u))},qe(()=>(e&&t.current.addEventListener("touchstart",f,{passive:!0}),()=>{t.current?.removeEventListener("touchstart",f),c(),clearInterval(a.current)}),[e])}var OE=$(require("react"));function ME(e){return Math.floor(e**.5)}function Vl(e,t){return("touches"in e?e.touches[0]:e)[t?"pageX":"pageY"]-window[t?"scrollX":"scrollY"]}function pA(e){let t=e;for(;t;){if(t.draggable)return!0;t=t.parentElement}return!1}function Yh(e,t,o){OE.useEffect(()=>{let r=t.current;if(e&&r){let n=!1,i,s,a=()=>{Ge.cancel(i)},c=()=>{a(),i=Ge(()=>{o(s),c()})},l=()=>{n=!1,a()},u=d=>{if(pA(d.target)||d.button!==0)return;let m=d;m._virtualHandled||(m._virtualHandled=!0,n=!0)},f=d=>{if(n){let m=Vl(d,!1),{top:p,bottom:g}=r.getBoundingClientRect();if(m<=p){let y=p-m;s=-ME(y),c()}else if(m>=g){let y=m-g;s=ME(y),c()}else a()}};return r.addEventListener("mousedown",u),r.ownerDocument.addEventListener("mouseup",l),r.ownerDocument.addEventListener("mousemove",f),r.ownerDocument.addEventListener("dragend",l),()=>{r.removeEventListener("mousedown",u),r.ownerDocument.removeEventListener("mouseup",l),r.ownerDocument.removeEventListener("mousemove",f),r.ownerDocument.removeEventListener("dragend",l),a()}}},[e])}var pd=$(require("react"));var gA=10;function hA(e,t){let o=typeof e=="function"?e(t):e;return Number.isFinite(o)?o:0}function Qh(e,t,o,r,n,i,s,a,c){let l=pd.useRef(void 0),[u,f]=pd.useState(null);return qe(()=>{if(u&&u.times<gA){if(!e.current){f(R=>({...R}));return}s();let{targetAlign:d,originAlign:m,offset:p}=u,g=u.index>=0?u.index:t.findIndex(R=>n(R)===u.key),y=d||m,x=hA(p,{getSize:i,align:y}),b=e.current.clientHeight,h=g<0,S=d,C=null;if(b&&g>=0){let R=0,v=0,w=0,T=Math.min(t.length-1,g);for(let P=0;P<=T;P+=1){let N=n(t[P]);v=R;let O=o.get(N);w=v+(O===void 0?r:O),R=w}let I=y==="top"?x:b-x;for(let P=T;P>=0;P-=1){let N=n(t[P]),O=o.get(N);if(O===void 0){h=!0;break}if(I-=O,I<=0)break}switch(y){case"top":C=v-x;break;case"bottom":C=w-b+x;break;default:{let{scrollTop:P}=e.current,N=P+b;v<P?S="top":w>N&&(S="bottom")}}C!==null&&a(C),C!==u.lastTop&&(h=!0)}h&&f(R=>({...R,times:R.times+1,index:g,targetAlign:S,lastTop:C}))}},[u,e.current]),d=>{if(d==null){c();return}if(Ge.cancel(l.current),typeof d=="number")a(d);else if(d&&typeof d=="object"){let m,p,{align:g}=d;"index"in d?{index:m}=d:(p=d.key,m=t.findIndex(x=>n(x)===p));let{offset:y=0}=d;f({times:0,index:m,key:p,offset:y,originAlign:g})}}}var Ft=$(require("react"));function AE(e,t,o){if(t<=0||o<=0)return 0;let n=Math.max(Math.min(e,o),0)/o,i=Math.ceil(n*t);return i=Math.max(i,0),i=Math.min(i,t),i}var xA=Ft.forwardRef((e,t)=>{let{prefixCls:o,rtl:r,scrollOffset:n,scrollRange:i,onStartMove:s,onStopMove:a,onScroll:c,horizontal:l,spinSize:u,containerSize:f,style:d,thumbStyle:m,showScrollBar:p}=e,[g,y]=Ft.useState(!1),[x,b]=Ft.useState(null),[h,S]=Ft.useState(null),C=!r,R=Ft.useRef(null),v=Ft.useRef(null),[w,T]=Ft.useState(p),I=Ft.useRef(void 0),P=()=>{p===!0||p===!1||(clearTimeout(I.current),T(!0),I.current=setTimeout(()=>{T(!1)},3e3))},N=i-f||0,O=f-u||0,_=Ft.useMemo(()=>n===0||N===0?0:n/N*O,[n,N,O]),M=L=>!!L&&v.current?.contains(L),A=L=>{let U=R.current;if(!U)return;let X=U.getBoundingClientRect(),Y=Vl(L,l),q;if(Number.isFinite(Y)){if(l){let D=C?X.left:X.right;if(!Number.isFinite(D))return;q=(C?Y-D:D-Y)-u/2}else{if(!Number.isFinite(X.top))return;q=Y-X.top-u/2}c(AE(q,N,O),l)}},V=L=>{L.stopPropagation(),L.preventDefault(),!(L.button!==0||M(L.target))&&A(L)},F=Ft.useRef({top:_,dragging:g,pageY:x,startTop:h});F.current={top:_,dragging:g,pageY:x,startTop:h};let G=ye(L=>{y(!0),b(Vl(L,l)),S(F.current.top),s(),L.stopPropagation(),L.preventDefault()});Ft.useEffect(()=>{let L=Y=>{Y.preventDefault()},U=R.current,X=v.current;return U.addEventListener("touchstart",L,{passive:!1}),X.addEventListener("touchstart",G,{passive:!1}),()=>{U.removeEventListener("touchstart",L),X.removeEventListener("touchstart",G)}},[G]);let z=Ft.useRef(void 0);z.current=N;let B=Ft.useRef(void 0);B.current=O,Ft.useEffect(()=>{if(g){let L,U=Y=>{let{dragging:q,pageY:D,startTop:K}=F.current;Ge.cancel(L);let H=R.current.getBoundingClientRect(),Q=f/(l?H.width:H.height);if(q){let Z=(Vl(Y,l)-D)*Q,te=K;!C&&l?te-=Z:te+=Z;let se=z.current,re=B.current,oe=AE(te,se,re);L=Ge(()=>{c(oe,l)})}},X=()=>{y(!1),a()};return window.addEventListener("mousemove",U,{passive:!0}),window.addEventListener("touchmove",U,{passive:!0}),window.addEventListener("mouseup",X,{passive:!0}),window.addEventListener("touchend",X,{passive:!0}),()=>{window.removeEventListener("mousemove",U),window.removeEventListener("touchmove",U),window.removeEventListener("mouseup",X),window.removeEventListener("touchend",X),Ge.cancel(L)}}},[g]),Ft.useEffect(()=>(P(),()=>{clearTimeout(I.current)}),[n]),Ft.useImperativeHandle(t,()=>({delayHidden:P}));let k=`${o}-scrollbar`,W={position:"absolute",visibility:w?null:"hidden"},j={position:"absolute",borderRadius:99,background:"var(--rc-virtual-list-scrollbar-bg, rgba(0, 0, 0, 0.5))",cursor:"pointer",userSelect:"none"};return l?(Object.assign(W,{height:8,left:0,right:0,bottom:0}),Object.assign(j,{height:"100%",width:u,[C?"left":"right"]:_})):(Object.assign(W,{width:8,top:0,bottom:0,[C?"right":"left"]:0}),Object.assign(j,{width:"100%",height:u,top:_})),Ft.createElement("div",{ref:R,className:E(k,{[`${k}-horizontal`]:l,[`${k}-vertical`]:!l,[`${k}-visible`]:w}),style:{...W,...d},onMouseDown:V,onMouseMove:P},Ft.createElement("div",{ref:v,className:E(`${k}-thumb`,{[`${k}-thumb-moving`]:g}),style:{...j,...m},onMouseDown:G}))}),Zh=xA;function Jh(e=0,t=0){let o=e/t*e;return isNaN(o)&&(o=0),o=Math.max(o,20),Math.floor(o)}function ex(){return ex=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},ex.apply(this,arguments)}var bA=[],yA={overflowY:"auto",overflowAnchor:"none"};function ox(e,t){let{prefixCls:o="rc-virtual-list",className:r,height:n,itemHeight:i,fullHeight:s=!0,style:a,data:c,children:l,itemKey:u,virtual:f,direction:d,scrollWidth:m,component:p="div",onScroll:g,onVirtualScroll:y,onVisibleChange:x,innerProps:b,extraRender:h,styles:S,showScrollBar:C="optional",...R}=e,v=Yt.useCallback(ce=>typeof u=="function"?u(ce):ce?.[u],[u]),[w,T,I,P]=Xh(v,null,null),N=!!(f!==!1&&n&&i),O=Yt.useMemo(()=>Object.values(I.maps).reduce((ce,ge)=>ce+ge,0),[I.id,I.maps]),_=N&&c&&(Math.max(i*c.length,O)>n||!!m),M=d==="rtl",A=E(o,{[`${o}-rtl`]:M},r),V=c||bA,F=(0,tr.useRef)(null),G=(0,tr.useRef)(null),z=(0,tr.useRef)(null),[B,k]=(0,tr.useState)(0),[W,j]=(0,tr.useState)(0),[L,U]=(0,tr.useState)(!1),X=()=>{U(!0)},Y=()=>{U(!1)},q={getKey:v};function D(ce){k(ge=>{let Le;typeof ce=="function"?Le=ce(ge):Le=ce;let ne=ue(Le);return F.current.scrollTop=ne,ne})}let K=(0,tr.useRef)({start:0,end:V.length}),H=(0,tr.useRef)(void 0),[Q]=jh(V,v);H.current=Q;let{scrollHeight:Z,start:te,end:se,offset:re}=Yt.useMemo(()=>{if(!N)return{scrollHeight:void 0,start:0,end:V.length-1,offset:void 0};if(!_)return{scrollHeight:G.current?.offsetHeight||0,start:0,end:V.length-1,offset:void 0};let ce=0,ge,Le,ne,Ce=V.length;for(let he=0;he<Ce;he+=1){let $e=V[he],Qe=v($e),Bt=I.get(Qe),At=ce+(Bt===void 0?i:Bt);At>=B&&ge===void 0&&(ge=he,Le=ce),At>B+n&&ne===void 0&&(ne=he),ce=At}return ge===void 0&&(ge=0,Le=0,ne=Math.ceil(n/i)),ne===void 0&&(ne=V.length-1),ne=Math.min(ne+1,V.length-1),{scrollHeight:ce,start:ge,end:ne,offset:Le}},[_,N,B,V,P,n]);K.current.start=te,K.current.end=se,Yt.useLayoutEffect(()=>{let ce=I.getRecord();if(ce.size===1){let ge=Array.from(ce.keys())[0],Le=ce.get(ge),ne=V[te];if(ne&&Le===void 0&&v(ne)===ge){let $e=I.get(ge)-i;D(Qe=>Qe+$e)}}I.resetRecord()},[Z]);let[oe,ae]=Yt.useState({width:0,height:n}),ie=ce=>{ae({width:ce.offsetWidth,height:ce.offsetHeight})},be=(0,tr.useRef)(null),ee=(0,tr.useRef)(null),xe=Yt.useMemo(()=>Jh(oe.width,m),[oe.width,m]),fe=Yt.useMemo(()=>Jh(oe.height,Z),[oe.height,Z]),_e=Z-n,Ve=(0,tr.useRef)(_e);Ve.current=_e;function ue(ce){let ge=ce;return Number.isNaN(Ve.current)||(ge=Math.min(ge,Ve.current)),ge=Math.max(ge,0),ge}let He=B<=0,Ke=B>=_e,Pe=W<=0,de=W>=m,le=md(He,Ke,Pe,de),Re=()=>({x:M?-W:W,y:B}),pe=(0,tr.useRef)(Re()),ve=ye(ce=>{if(y){let ge={...Re(),...ce};(pe.current.x!==ge.x||pe.current.y!==ge.y)&&(y(ge),pe.current=ge)}});function Fe(ce,ge){let Le=ce;ge?((0,tx.flushSync)(()=>{j(Le)}),ve()):D(Le)}function Ye(ce){let{scrollTop:ge}=ce.currentTarget;ge!==B&&D(ge),g?.(ce),ve()}let Je=ce=>{let ge=ce,Le=m?m-oe.width:0;return ge=Math.max(ge,0),ge=Math.min(ge,Le),ge},st=ye((ce,ge)=>{ge?((0,tx.flushSync)(()=>{j(Le=>{let ne=Le+(M?-ce:ce);return Je(ne)})}),ve()):D(Le=>Le+ce)}),[Xe,wt]=qh(N,He,Ke,Pe,de,!!m,st);Kh(N,F,(ce,ge,Le,ne)=>{let Ce=ne;return le(ce,ge,Le)?!1:!Ce||!Ce._virtualHandled?(Ce&&(Ce._virtualHandled=!0),Xe({preventDefault(){},deltaX:ce?ge:0,deltaY:ce?0:ge}),!0):!1}),Yh(_,F,ce=>{D(ge=>ge+ce)}),qe(()=>{function ce(Le){let ne=He&&Le.detail<0,Ce=Ke&&Le.detail>0;N&&!ne&&!Ce&&Le.preventDefault()}let ge=F.current;return ge.addEventListener("wheel",Xe,{passive:!1}),ge.addEventListener("DOMMouseScroll",wt,{passive:!0}),ge.addEventListener("MozMousePixelScroll",ce,{passive:!1}),()=>{ge.removeEventListener("wheel",Xe),ge.removeEventListener("DOMMouseScroll",wt),ge.removeEventListener("MozMousePixelScroll",ce)}},[N,He,Ke]),qe(()=>{if(m){let ce=Je(W);j(ce),ve({x:ce})}},[oe.width,m]);let $t=()=>{be.current?.delayHidden(),ee.current?.delayHidden()},lt=$E(V,v,I,i),Ct=Qh(F,V,I,i,v,lt,()=>T(!0),D,$t);Yt.useImperativeHandle(t,()=>({nativeElement:z.current,getScrollInfo:Re,scrollTo:ce=>{function ge(Le){return Le&&typeof Le=="object"&&("left"in Le||"top"in Le)}ge(ce)?(ce.left!==void 0&&j(Je(ce.left)),Ct(ce.top)):Ct(ce)}})),qe(()=>{if(x){let ce=V.slice(te,se+1);x(ce,V)}},[te,se,V]);let Pt=h?.({start:te,end:se,virtual:_,offsetX:W,scrollTop:B,offsetY:re,rtl:M,getSize:lt}),Nt=Wh(V,te,se,m,W,w,l,q),Me=null;n&&(Me={[s?"height":"maxHeight"]:n,...yA},N&&(Me.overflowY="hidden",m&&(Me.overflowX="hidden"),L&&(Me.pointerEvents="none")));let zt={};return M&&(zt.dir="rtl"),Yt.createElement("div",ex({ref:z,style:{...a,position:"relative"},className:A},zt,R),Yt.createElement(Ir,{onResize:ie},Yt.createElement(p,{className:`${o}-holder`,style:Me,ref:F,onScroll:Ye,onMouseEnter:$t},Yt.createElement(SE,{prefixCls:o,height:Z,offsetX:W,offsetY:re,scrollWidth:m,onInnerResize:T,ref:G,innerProps:b,rtl:M,extra:Pt},Nt))),_&&Z>n&&Yt.createElement(Zh,{ref:be,prefixCls:o,scrollOffset:B,scrollRange:Z,rtl:M,onScroll:Fe,onStartMove:X,onStopMove:Y,spinSize:fe,containerSize:oe.height,style:S?.verticalScrollBar,thumbStyle:S?.verticalScrollBarThumb,showScrollBar:C}),_&&m>oe.width&&Yt.createElement(Zh,{ref:ee,prefixCls:o,scrollOffset:W,scrollRange:m,rtl:M,onScroll:Fe,onStartMove:X,onStopMove:Y,spinSize:xe,containerSize:oe.width,horizontal:!0,style:S?.horizontalScrollBar,thumbStyle:S?.horizontalScrollBarThumb,showScrollBar:C}))}var _E=Yt.forwardRef(ox);_E.displayName="List";var LE=_E;var DE=$(require("react"));var CA=DE.forwardRef((e,t)=>ox({...e,virtual:!1},t));CA.displayName="List";var FE=LE;var dt=$(require("react")),rx=require("react");function zE(){return/(mac\sos|macintosh)/i.test(navigator.appVersion)}function Hl(){return Hl=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Hl.apply(this,arguments)}function BE(e){return typeof e=="string"||typeof e=="number"}var SA=(e,t)=>{let{prefixCls:o,id:r,open:n,multiple:i,mode:s,searchValue:a,toggleOpen:c,notFoundContent:l,onPopupScroll:u,showScrollBar:f,lockOptions:d}=zo(),{maxCount:m,flattenOptions:p,onActiveValue:g,defaultActiveFirstOption:y,onSelect:x,menuItemSelectedIcon:b,rawValues:h,fieldNames:S,virtual:C,direction:R,listHeight:v,listItemHeight:w,optionRender:T,classNames:I,styles:P}=dt.useContext(ya),N=`${o}-item`,O=Ur(()=>p,[n,d],(D,K)=>K[0]&&!K[1]),_=dt.useRef(null),M=dt.useMemo(()=>i&&Tl(m)&&h?.size>=m,[i,m,h?.size]),A=D=>{D.preventDefault()},V=D=>{_.current?.scrollTo(typeof D=="number"?{index:D}:D)},F=dt.useCallback(D=>s==="combobox"?!1:h.has(D),[s,[...h].toString(),h.size]),G=(D,K=1)=>{let H=O.length;for(let Q=0;Q<H;Q+=1){let Z=(D+Q*K+H)%H,{group:te,data:se}=O[Z]||{};if(!te&&!se?.disabled&&(F(se.value)||!M))return Z}return-1},[z,B]=dt.useState(()=>G(0)),k=(D,K=!1)=>{B(D);let H={source:K?"keyboard":"mouse"},Q=O[D];if(!Q){g(null,-1,H);return}g(Q.value,D,H)};(0,rx.useEffect)(()=>{k(y!==!1?G(0):-1)},[O.length,a]);let W=dt.useCallback(D=>s==="combobox"?String(D).toLowerCase()===a.toLowerCase():h.has(D),[s,a,[...h].toString(),h.size]);(0,rx.useEffect)(()=>{let D;if(!i&&n&&h.size===1){let K=Array.from(h)[0],H=O.findIndex(({data:Q})=>a?String(Q.value).startsWith(a):Q.value===K);H!==-1&&(k(H),D=setTimeout(()=>{V(H)}))}return n&&_.current?.scrollTo(void 0),()=>clearTimeout(D)},[n,a]);let j=D=>{D!==void 0&&x(D,{selected:!h.has(D)}),i||c(!1)};if(dt.useImperativeHandle(t,()=>({onKeyDown:D=>{let{which:K,ctrlKey:H}=D;switch(K){case Ie.N:case Ie.P:case Ie.UP:case Ie.DOWN:{let Q=0;if(K===Ie.UP?Q=-1:K===Ie.DOWN?Q=1:zE()&&H&&(K===Ie.N?Q=1:K===Ie.P&&(Q=-1)),Q!==0){let Z=G(z+Q,Q);V(Z),k(Z,!0)}break}case Ie.TAB:case Ie.ENTER:{let Q=O[z];if(!Q||Q.data.disabled)return j(void 0);!M||h.has(Q.value)?j(Q.value):j(void 0),n&&D.preventDefault();break}case Ie.ESC:c(!1),n&&D.stopPropagation()}},onKeyUp:()=>{},scrollTo:D=>{V(D)}})),O.length===0)return dt.createElement("div",{role:"listbox",id:`${r}_list`,className:`${N}-empty`,onMouseDown:A},l);let L=Object.keys(S).map(D=>S[D]),U=D=>D.label;function X(D,K){let{group:H}=D;return{role:H?"presentation":"option",id:`${r}_list_${K}`}}let Y=D=>{let K=O[D];if(!K)return null;let H=K.data||{},{value:Q,disabled:Z}=H,{group:te}=K,se=Ht(H,!0),re=U(K);return K?dt.createElement("div",Hl({"aria-label":typeof re=="string"&&!te?re:null},se,{key:D},X(K,D),{"aria-selected":W(Q),"aria-disabled":Z}),Q):null},q={role:"listbox",id:`${r}_list`};return dt.createElement(dt.Fragment,null,C&&dt.createElement("div",Hl({},q,{style:{height:0,width:0,overflow:"hidden"}}),Y(z-1),Y(z),Y(z+1)),dt.createElement(FE,{prefixCls:`${o}-dropdown-list`,itemKey:"key",ref:_,data:O,height:v,itemHeight:w,fullHeight:!1,onMouseDown:A,onScroll:u,virtual:C,direction:R,innerProps:C?null:q,showScrollBar:f,className:I?.popup?.list,style:P?.popup?.list},(D,K)=>{let{group:H,groupOption:Q,data:Z,label:te,value:se}=D,{key:re}=Z;if(H){let Re=Z.title??(BE(te)?te.toString():void 0);return dt.createElement("div",{className:E(N,`${N}-group`,Z.className),title:Re},te!==void 0?te:re)}let{disabled:oe,title:ae,children:ie,style:be,className:ee,...xe}=Z,fe=tt(xe,L),_e=F(se),Ve=oe||!_e&&M,ue=`${N}-option`,He=E(N,ue,ee,I?.popup?.listItem,{[`${ue}-grouped`]:Q,[`${ue}-active`]:z===K&&!Ve,[`${ue}-disabled`]:Ve,[`${ue}-selected`]:_e}),Ke=U(D),Pe=!b||typeof b=="function"||_e,de=typeof Ke=="number"?Ke:Ke||se,le=BE(de)?de.toString():void 0;return ae!==void 0&&(le=ae),dt.createElement("div",Hl({},Ht(fe),C?{}:X(D,K),{"aria-selected":C?void 0:W(se),"aria-disabled":Ve,className:He,title:le,onMouseMove:()=>{z===K||Ve||k(K)},onClick:()=>{Ve||j(se)},style:{...P?.popup?.listItem,...be}}),dt.createElement("div",{className:`${ue}-content`},typeof T=="function"?T(D,{index:K}):de),dt.isValidElement(b)||_e,Pe&&dt.createElement(cd,{className:`${N}-option-state`,customizeIcon:b,customizeIconProps:{value:se,disabled:Ve,isSelected:_e}},_e?"\u2713":null))}))},vA=dt.forwardRef(SA),VE=vA;var Ea=$(require("react")),HE=((e,t)=>{let o=Ea.useRef({values:new Map,options:new Map}),r=Ea.useMemo(()=>{let{values:i,options:s}=o.current,a=e.map(u=>u.label===void 0?{...u,label:i.get(u.value)?.label}:u),c=new Map,l=new Map;return a.forEach(u=>{c.set(u.value,u),l.set(u.value,t.get(u.value)||s.get(u.value))}),o.current.values=c,o.current.options=l,a},[e,t]),n=Ea.useCallback(i=>t.get(i)||o.current.options.get(i),[t]);return[r,n]});var kE=$(require("react"));function nx(e,t){return Al(e).join("").toUpperCase().includes(t)}var WE=((e,t,o,r,n)=>kE.useMemo(()=>{if(!o||r===!1)return e;let{options:i,label:s,value:a}=t,c=[],l=typeof r=="function",u=o.toUpperCase(),f=l?r:(m,p)=>n&&n.length?n.some(g=>nx(p[g],u)):p[i]?nx(p[s!=="children"?s:"label"],u):nx(p[a],u),d=l?m=>Ml(m):m=>m;return e.forEach(m=>{if(m[i]){if(f(o,d(m)))c.push(m);else{let g=m[i].filter(y=>f(o,d(y)));g.length&&c.push({...m,[i]:g})}return}f(o,d(m))&&c.push(m)}),c},[e,r,n,o,t]));var UE=$(require("react"));var jE=$(require("react"));function RA(e){let{key:t,props:{children:o,value:r,...n}}=e;return{key:t,value:r!==void 0?r:t,children:o,...n}}function gd(e,t=!1){return Ro(e).map((o,r)=>{if(!jE.isValidElement(o)||!o.type)return null;let{type:{isSelectOptGroup:n},key:i,props:{children:s,...a}}=o;return t||!n?RA(o):{key:`__RC_SELECT_GRP__${i===null?r:i}__`,label:i,...a,options:gd(s)}}).filter(o=>o)}var EA=(e,t,o,r,n)=>UE.useMemo(()=>{let i=e;!e&&(i=gd(t));let a=new Map,c=new Map,l=(f,d,m)=>{m&&typeof m=="string"&&f.set(d[m],d)},u=(f,d=!1)=>{for(let m=0;m<f.length;m+=1){let p=f[m];!p[o.options]||d?(a.set(p[o.value],p),l(c,p,o.label),r.forEach(g=>{l(c,p,g)}),l(c,p,n)):u(p[o.options],!0)}};return u(i),{options:i,valueOptions:a,labelOptions:c}},[e,t,o,r,n]),qE=EA;var hd=$(require("react"));function xd(e){let t=hd.useRef(e);return t.current=e,hd.useCallback((...r)=>t.current(...r),[])}var wA=$(require("react"));var GE=$(require("react"));function ix(e,t,o){let{filterOption:r,searchValue:n,optionFilterProp:i,filterSort:s,onSearch:a,autoClearSearchValue:c}=t;return GE.useMemo(()=>{let l=typeof e=="object",u={filterOption:r,searchValue:n,optionFilterProp:i,filterSort:s,onSearch:a,autoClearSearchValue:c,...l?e:{}};return[l||o==="combobox"||o==="tags"||o==="multiple"&&e===void 0?!0:e,u]},[o,e,r,n,i,s,a,c])}function sx(){return sx=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},sx.apply(this,arguments)}var $A=["inputValue"];function PA(e){return!e||typeof e!="object"}var NA=yt.forwardRef((e,t)=>{let{id:o,mode:r,prefixCls:n="rc-select",backfill:i,fieldNames:s,showSearch:a,searchValue:c,onSearch:l,autoClearSearchValue:u,filterOption:f,optionFilterProp:d,filterSort:m,onSelect:p,onDeselect:g,onActive:y,popupMatchSelectWidth:x=!0,optionLabelProp:b,options:h,optionRender:S,children:C,defaultActiveFirstOption:R,menuItemSelectedIcon:v,virtual:w,direction:T,listHeight:I=200,listItemHeight:P=20,labelRender:N,value:O,defaultValue:_,labelInValue:M,onChange:A,maxCount:V,classNames:F,styles:G,...z}=e,B={searchValue:c,onSearch:l,autoClearSearchValue:u,filterOption:f,optionFilterProp:d,filterSort:m},[k,W]=ix(a,B,r),{filterOption:j,searchValue:L,optionFilterProp:U,filterSort:X,onSearch:Y,autoClearSearchValue:q=!0}=W,D=yt.useMemo(()=>U?Array.isArray(U)?U:[U]:[],[U]),K=xo(o),H=Dl(r),Q=!!(!h&&C),Z=yt.useMemo(()=>j===void 0&&r==="combobox"?!1:j,[j,r]),te=yt.useMemo(()=>Oh(s,Q),[JSON.stringify(s),Q]),[se,re]=it("",L),oe=se||"",ae=qE(h,C,te,D,b),{valueOptions:ie,labelOptions:be,options:ee}=ae,xe=yt.useCallback(ne=>Al(ne).map(he=>{let $e,Qe,Bt,At;PA(he)?$e=he:(Qe=he.label,$e=he.value);let pt=ie.get($e);return pt&&(Qe===void 0&&(Qe=pt?.[b||te.label]),Bt=pt?.disabled,At=pt?.title),{label:Qe,value:$e,key:$e,disabled:Bt,title:At}}),[te,b,ie]),[fe,_e]=it(_,O),Ve=yt.useMemo(()=>{let Ce=xe(H&&fe===null?[]:fe);return r==="combobox"&&oE(Ce[0]?.value)?[]:Ce},[fe,xe,r,H]),[ue,He]=HE(Ve,ie),Ke=yt.useMemo(()=>{if(!r&&ue.length===1){let ne=ue[0];if(ne.value===null&&(ne.label===null||ne.label===void 0))return[]}return ue.map(ne=>({...ne,label:(typeof N=="function"?N(ne):ne.label)??ne.value}))},[r,ue,N]),Pe=yt.useMemo(()=>new Set(ue.map(ne=>ne.value)),[ue]);yt.useEffect(()=>{if(r==="combobox"){let ne=ue[0]?.value;re(tE(ne)?String(ne):"")}},[ue]);let de=xd((ne,Ce)=>{let he=Ce??ne;return{[te.value]:ne,[te.label]:he}}),le=yt.useMemo(()=>{if(r!=="tags")return ee;let ne=[...ee],Ce=he=>ie.has(he);return[...ue].sort((he,$e)=>he.value<$e.value?-1:1).forEach(he=>{let $e=he.value;Ce($e)||ne.push(de($e,he.label))}),ne},[de,ee,ie,ue,r]),Re=WE(le,te,oe,Z,D),pe=yt.useMemo(()=>{let ne=Ce=>D.length?D.some(he=>Ce?.[he]===oe):Ce?.value===oe;return r!=="tags"||!oe||Re.some(Ce=>ne(Ce))||Re.some(Ce=>Ce[te.value]===oe)||ie.get(oe)?.disabled?Re:[de(oe),...Re]},[de,D,r,Re,oe,te,ie]),ve=ne=>[...ne].sort((he,$e)=>X(he,$e,{searchValue:oe})).map(he=>Array.isArray(he.options)?{...he,options:he.options.length>0?ve(he.options):he.options}:he),Fe=yt.useMemo(()=>X?ve(pe):pe,[pe,X,oe]),Ye=yt.useMemo(()=>qR(Fe,{fieldNames:te,childrenAsData:Q}),[Fe,te,Q]),Je=ne=>{let Ce=xe(ne);if(_e(Ce),A&&(Ce.length!==ue.length||Ce.some((he,$e)=>ue[$e]?.value!==he?.value))){let he=M?Ce.map(({label:Qe,value:Bt})=>({label:Qe,value:Bt})):Ce.map(Qe=>Qe.value),$e=Ce.map(Qe=>Ml(He(Qe.value)));A(H?he:he[0],H?$e:$e[0])}},[st,Xe]=yt.useState(null),[wt,$t]=yt.useState(0),lt=R!==void 0?R:r!=="combobox",Ct=yt.useRef(void 0),Pt=yt.useCallback((ne,Ce,{source:he="keyboard"}={})=>{$t(Ce),i&&r==="combobox"&&ne!==null&&he==="keyboard"&&Xe(String(ne));let $e=Promise.resolve().then(()=>{Ct.current===$e&&y?.(ne)});Ct.current=$e},[i,r,y]),Nt=(ne,Ce,he)=>{let $e=()=>{let Qe=He(ne);return[M?{label:Qe?.[te.label],value:ne}:ne,Ml(Qe)]};if(Ce&&p){let[Qe,Bt]=$e();p(Qe,Bt)}else if(!Ce&&g&&he!=="clear"){let[Qe,Bt]=$e();g(Qe,Bt)}},Me=xd((ne,Ce)=>{let he,$e=H?Ce.selected:!0;$e?he=H?[...ue,ne]:[ne]:he=ue.filter(Qe=>Qe.value!==ne),Je(he),Nt(ne,$e),r==="combobox"?Xe(""):(!Dl||q)&&(re(""),Xe(""))}),zt=(ne,Ce)=>{Je(ne);let{type:he,values:$e}=Ce;(he==="remove"||he==="clear")&&$e.forEach(Qe=>{Nt(Qe.value,!1,he)})},ce=(ne,Ce)=>{if(re(ne),Xe(null),Ce.source==="submit"){let he=(ne||"").trim();if(he){if(ie.get(he)?.disabled){re("");return}let $e=Array.from(new Set([...Pe,he]));Je($e),Nt(he,!0),re("")}return}Ce.source!=="blur"&&(r==="combobox"&&Je(ne),Y?.(ne))},ge=ne=>{let Ce=ne;r!=="tags"&&(Ce=ne.map($e=>be.get($e)?.value).filter($e=>$e!==void 0)),r==="tags"&&(Ce=Ce.filter($e=>!ie.get($e)?.disabled));let he=Array.from(new Set([...Pe,...Ce]));Je(he),he.forEach($e=>{Nt($e,!0)})},Le=yt.useMemo(()=>({...ae,flattenOptions:Ye,onActiveValue:Pt,defaultActiveFirstOption:lt,onSelect:Me,menuItemSelectedIcon:v,rawValues:Pe,fieldNames:te,virtual:w!==!1&&x!==!1,direction:T,listHeight:I,listItemHeight:P,childrenAsData:Q,maxCount:V,optionRender:S,classNames:F,styles:G}),[V,ae,Ye,Pt,lt,Me,v,Pe,te,w,x,T,I,P,Q,S,F,G]);return yt.createElement(ya.Provider,{value:Le},yt.createElement(Hh,sx({},z,{id:K,prefixCls:n,ref:t,omitDomProps:$A,mode:r,classNames:F,styles:G,displayValues:Ke,onDisplayValuesChange:zt,maxCount:V,direction:T,showSearch:k,searchValue:oe,onSearch:ce,autoClearSearchValue:q,onSearchSplit:ge,popupMatchSelectWidth:x,OptionList:VE,emptyOptions:!Ye.length,activeValue:st,activeDescendantId:`${K}_list_${wt}`})))}),ax=NA;ax.Option=zl;ax.OptGroup=Fl;var XE=ax;var KE=XE;var IA=(e,t,o)=>e===!1?null:e===!0?o:e&&t&&e[t]!==void 0?e[t]:o,lx=IA;var Un=(e,t,o)=>E({[`${e}-status-success`]:t==="success",[`${e}-status-warning`]:t==="warning",[`${e}-status-error`]:t==="error",[`${e}-status-validating`]:t==="validating",[`${e}-has-feedback`]:o}),$i=(e,t)=>t||e;var $a=$(require("react"));var or=$(require("react"));var gr=$(require("react")),YE=require("react");var qn=(e,t)=>e?.startsWith("var(")||t?.startsWith("var(")?e:new Ze(e).onBackground(t).toHexString();var TA=()=>{let[,e]=Tt(),[t]=$o("Empty"),{colorBgContainer:o,colorFill:r,colorFillSecondary:n,colorFillTertiary:i,colorTextQuaternary:s}=e,{panelBgColor:a,borderColor:c,detailColor:l,shadowColor:u,iconColor:f}=(0,YE.useMemo)(()=>({panelBgColor:qn(i,o),borderColor:qn(s,o),detailColor:qn(r,o),shadowColor:qn(n,o),iconColor:o}),[o,r,n,i,s]);return gr.createElement("svg",{width:"184",height:"152",viewBox:"0 0 184 152",xmlns:"http://www.w3.org/2000/svg"},gr.createElement("title",null,t?.description||"Empty"),gr.createElement("g",{fill:"none",fillRule:"evenodd"},gr.createElement("g",{transform:"translate(24 31.7)"},gr.createElement("ellipse",{fillOpacity:".8",fill:u,cx:"67.8",cy:"106.9",rx:"67.8",ry:"12.7"}),gr.createElement("path",{fill:c,d:"M122 69.7 98.1 40.2a6 6 0 0 0-4.6-2.2H42.1a6 6 0 0 0-4.6 2.2l-24 29.5V85H122z"}),gr.createElement("path",{fill:a,d:"M33.8 0h68a4 4 0 0 1 4 4v93.3a4 4 0 0 1-4 4h-68a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4"}),gr.createElement("path",{fill:l,d:"M42.7 10h50.2a2 2 0 0 1 2 2v25a2 2 0 0 1-2 2H42.7a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2m.2 39.8h49.8a2.3 2.3 0 1 1 0 4.5H42.9a2.3 2.3 0 0 1 0-4.5m0 11.7h49.8a2.3 2.3 0 1 1 0 4.6H42.9a2.3 2.3 0 0 1 0-4.6m79 43.5a7 7 0 0 1-6.8 5.4H20.5a7 7 0 0 1-6.7-5.4l-.2-1.8V69.7h26.3c2.9 0 5.2 2.4 5.2 5.4s2.4 5.4 5.3 5.4h34.8c2.9 0 5.3-2.4 5.3-5.4s2.3-5.4 5.2-5.4H122v33.5q0 1-.2 1.8"})),gr.createElement("path",{fill:l,d:"m149.1 33.3-6.8 2.6a1 1 0 0 1-1.3-1.2l2-6.2q-4.1-4.5-4.2-10.4c0-10 10.1-18.1 22.6-18.1S184 8.1 184 18.1s-10.1 18-22.6 18q-6.8 0-12.3-2.8"}),gr.createElement("g",{fill:f,transform:"translate(149.7 15.4)"},gr.createElement("circle",{cx:"20.7",cy:"3.2",r:"2.8"}),gr.createElement("path",{d:"M5.7 5.6H0L2.9.7zM9.3.7h5v5h-5z"}))))},QE=TA;var Pi=$(require("react")),ZE=require("react");var MA=()=>{let[,e]=Tt(),[t]=$o("Empty"),{colorFill:o,colorFillTertiary:r,colorFillQuaternary:n,colorBgContainer:i}=e,{borderColor:s,shadowColor:a,contentColor:c}=(0,ZE.useMemo)(()=>({borderColor:qn(o,i),shadowColor:qn(r,i),contentColor:qn(n,i)}),[o,r,n,i]);return Pi.createElement("svg",{width:"64",height:"41",viewBox:"0 0 64 41",xmlns:"http://www.w3.org/2000/svg"},Pi.createElement("title",null,t?.description||"Empty"),Pi.createElement("g",{transform:"translate(0 1)",fill:"none",fillRule:"evenodd"},Pi.createElement("ellipse",{fill:a,cx:"32",cy:"33",rx:"32",ry:"7"}),Pi.createElement("g",{fillRule:"nonzero",stroke:s},Pi.createElement("path",{d:"M55 12.8 44.9 1.3Q44 0 42.9 0H21.1q-1.2 0-2 1.3L9 12.8V22h46z"}),Pi.createElement("path",{d:"M41.6 16c0-1.7 1-3 2.2-3H55v18.1c0 2.2-1.3 3.9-3 3.9H12c-1.7 0-3-1.7-3-3.9V13h11.2c1.2 0 2.2 1.3 2.2 3s1 2.9 2.2 2.9h14.8c1.2 0 2.2-1.4 2.2-3",fill:c}))))},JE=MA;var OA=e=>{let{componentCls:t,margin:o,marginXS:r,marginXL:n,fontSize:i,lineHeight:s}=e;return{[t]:{marginInline:r,fontSize:i,lineHeight:s,textAlign:"center",[`${t}-image`]:{height:e.emptyImgHeight,marginBottom:r,opacity:e.opacityImage,img:{height:"100%"},svg:{maxWidth:"100%",height:"100%",margin:"auto"}},[`${t}-description`]:{color:e.colorTextDescription},[`${t}-footer`]:{marginTop:o},"&-normal":{marginBlock:n,color:e.colorTextDescription,[`${t}-description`]:{color:e.colorTextDescription},[`${t}-image`]:{height:e.emptyImgHeightMD}},"&-small":{marginBlock:r,color:e.colorTextDescription,[`${t}-image`]:{height:e.emptyImgHeightSM}}}}},ew=Be("Empty",e=>{let{componentCls:t,controlHeightLG:o,calc:r}=e,n=Oe(e,{emptyImgCls:`${t}-img`,emptyImgHeight:r(o).mul(2.5).equal(),emptyImgHeightMD:o,emptyImgHeightSM:r(o).mul(.875).equal()});return OA(n)});var tw=or.createElement(QE,null),ow=or.createElement(JE,null),cx=or.forwardRef((e,t)=>{let{className:o,rootClassName:r,prefixCls:n,image:i,description:s,children:a,imageStyle:c,style:l,classNames:u,styles:f,...d}=e,{getPrefixCls:m,direction:p,className:g,style:y,classNames:x,styles:b,image:h}=De("empty"),S=m("empty",n),[C,R]=ew(S),v=Ee(y),w=Ee(l),[T,I]=je([x,u],[b,v,f,w],{props:e}),[P]=$o("Empty"),N=typeof s<"u"?s:P?.description,O=typeof N=="string"?N:"empty",_=i??h??tw,M=null;typeof _=="string"?M=or.createElement("img",{draggable:!1,alt:O,src:_}):M=_;let A=or.useRef(null);return or.useImperativeHandle(t,()=>({nativeElement:A.current})),or.createElement("div",{ref:A,className:E(C,R,S,g,{[`${S}-normal`]:_===ow,[`${S}-rtl`]:p==="rtl"},o,r,T.root),style:I.root,...d},or.createElement("div",{className:E(`${S}-image`,T.image),style:{...c,...I.image}},M),ut(N)&&or.createElement("div",{className:E(`${S}-description`,T.description),style:I.description},N),ut(a)&&or.createElement("div",{className:E(`${S}-footer`,T.footer),style:I.footer},a))});cx.PRESENTED_IMAGE_DEFAULT=tw;cx.PRESENTED_IMAGE_SIMPLE=ow;var wa=cx;var AA=e=>{let{componentName:t}=e,{getPrefixCls:o}=(0,$a.useContext)(Se),r=o("empty");switch(t){case"Table":case"List":return $a.default.createElement(wa,{image:wa.PRESENTED_IMAGE_SIMPLE});case"Select":case"TreeSelect":case"Cascader":case"Transfer":case"Mentions":return $a.default.createElement(wa,{image:wa.PRESENTED_IMAGE_SIMPLE,className:`${r}-small`});case"Table.filter":return null;default:return $a.default.createElement(wa,null)}},rw=AA;var ux=$(require("react"));var _A=(e,t,o,r)=>{let n=ux.useContext(Se),{variant:i,[e]:s}=n,a=ux.useContext(gR),c=r?n[r]:void 0,l=s?.variant??c?.variant,u=typeof t<"u"||o===!1||typeof a<"u"||typeof l<"u"||typeof i<"u",f;typeof t<"u"?f=t:o===!1?f="borderless":f=a??l??i??"outlined";let d=Up.includes(f);return[f,d,u]},hr=_A;var LA=e=>{let o={overflow:{adjustX:!0,adjustY:!0,shiftY:!0},htmlRegion:e==="scroll"?"scroll":"visible",dynamicInset:!0};return{bottomLeft:{...o,points:["tl","bl"],offset:[0,4]},bottomRight:{...o,points:["tr","br"],offset:[0,4]},topLeft:{...o,points:["bl","tl"],offset:[0,-4]},topRight:{...o,points:["br","tr"],offset:[0,-4]}}};function DA(e,t){return e||LA(t)}var nw=DA;var iw=e=>{let{optionHeight:t,optionFontSize:o,optionLineHeight:r,optionPadding:n}=e;return{position:"relative",display:"block",minHeight:t,padding:n,color:e.colorText,fontWeight:"normal",fontSize:o,lineHeight:r,boxSizing:"border-box"}},FA=e=>{let{antCls:t,componentCls:o}=e,r=`${o}-item`,n=`&${t}-slide-up-enter${t}-slide-up-enter-active`,i=`&${t}-slide-up-appear${t}-slide-up-appear-active`,s=`&${t}-slide-up-leave${t}-slide-up-leave-active`,a=`${o}-dropdown-placement-`,c=`${r}-option-selected`;return[{[`${o}-dropdown`]:{...ft(e),position:"absolute",top:-9999,zIndex:e.zIndexPopup,boxSizing:"border-box",padding:e.paddingXXS,overflow:"hidden",fontSize:e.fontSize,fontVariant:"initial",backgroundColor:e.colorBgElevated,borderRadius:e.borderRadiusLG,outline:"none",boxShadow:e.boxShadowSecondary,[`
          ${n}${a}bottomLeft,
          ${i}${a}bottomLeft
        `]:{animationName:hf},[`
          ${n}${a}topLeft,
          ${i}${a}topLeft,
          ${n}${a}topRight,
          ${i}${a}topRight
        `]:{animationName:bf},[`${s}${a}bottomLeft`]:{animationName:xf},[`
          ${s}${a}topLeft,
          ${s}${a}topRight
        `]:{animationName:yf},"&-hidden":{display:"none"},[`${o}-dropdown-list-scrollbar`]:{cursor:"pointer","&:hover":{backgroundColor:e.colorFillQuaternary}},[r]:{...iw(e),cursor:"pointer",transition:`background-color ${e.motionDurationSlow} ease`,borderRadius:e.borderRadiusSM,"&-group":{color:e.colorTextDescription,fontSize:e.fontSizeSM,cursor:"default"},"&-option":{display:"flex","&-content":{flex:"auto",...Zr},"&-state":{flex:"none",display:"flex",alignItems:"center"},[`&-selected:not(${r}-option-disabled)`]:{color:e.optionSelectedColor,fontWeight:e.optionSelectedFontWeight,backgroundColor:e.optionSelectedBg,[`${r}-option-state`]:{color:e.colorPrimary}},[`&-active:not(${r}-option-disabled)`]:{backgroundColor:e.optionActiveBg},[`&-selected${r}-option-active:not(${r}-option-disabled)`]:{backgroundColor:e.controlItemBgActiveHover},"&-disabled":{[`&${r}-option-selected`]:{backgroundColor:e.colorBgContainerDisabled},color:e.colorTextDisabled,cursor:"not-allowed"},"&-grouped":{paddingInlineStart:e.calc(e.controlPaddingHorizontal).mul(2).equal()}},"&-empty":{...iw(e),color:e.colorTextDisabled}},[`${c}:has(+ ${c})`]:{borderEndStartRadius:0,borderEndEndRadius:0,[`& + ${c}`]:{borderStartStartRadius:0,borderStartEndRadius:0}},"&-rtl":{direction:"rtl"}}},Cf(e,"slide-up"),Cf(e,"slide-down"),gf(e,"move-up"),gf(e,"move-down")]},sw=FA;var zA=e=>{let{antCls:t,componentCls:o}=e,r={background:"transparent"},n=["> input[disabled]","> textarea[disabled]",`> ${o}-input`,`> ${t}-input-affix-wrapper-disabled`,`> ${t}-input-search`].join(", ");return{[`&${o}-customize`]:{border:0,padding:0,fontSize:"inherit",lineHeight:"inherit",[`${o}-placeholder`]:{display:"none"},[`${o}-content`]:{margin:0,padding:0,"&-value":{display:"none"}},[`&${o}-filled ${o}-content`]:{[`${t}-input-filled`]:r},[`&${o}-disabled ${o}-content`]:{[n]:r,"input[disabled], textarea[disabled]":r}}}},aw=zA;var lw=4,BA=e=>{let{componentCls:t,calc:o,iconCls:r,paddingXS:n,paddingXXS:i,INTERNAL_FIXED_ITEM_MARGIN:s,lineWidth:a,lineType:c,colorIcon:l,colorIconHover:u,inputPaddingHorizontalBase:f,antCls:d}=e,[m,p]=Mt(d,"select");return{"&-multiple":{[m("multi-item-background")]:e.multipleItemBg,[m("multi-item-border-color")]:"transparent",[m("multi-item-border-radius")]:e.borderRadiusSM,[m("multi-item-height")]:e.multipleItemHeight,[m("multi-padding-base")]:`calc((${p("height")} - ${p("multi-item-height")}) / 2)`,[m("multi-padding-vertical")]:`calc(${p("multi-padding-base")} - ${s} - ${a})`,[m("multi-item-padding-horizontal")]:`calc(${f} - ${p("multi-padding-vertical")} - ${a} * 2)`,paddingBlock:p("multi-padding-vertical"),paddingInlineStart:`calc(${p("multi-padding-base")} - ${a})`,[`${t}-prefix`]:{marginInlineStart:p("multi-item-padding-horizontal")},[`${t}-prefix + ${t}-content`]:{[`${t}-placeholder`]:{insetInlineStart:0},[`${t}-content-item${t}-content-item-suffix`]:{marginInlineStart:0}},[`${t}-placeholder`]:{position:"absolute",lineHeight:p("line-height"),insetInlineStart:p("multi-item-padding-horizontal"),width:`calc(100% - ${p("multi-item-padding-horizontal")})`,top:"50%",transform:"translateY(-50%)"},[`${t}-content`]:{flexWrap:"wrap",alignItems:"center",lineHeight:1,"&-item-prefix":{height:p("font-size")},"&-item":{lineHeight:1,maxWidth:`calc(100% - ${lw}px)`},[`${t}-content-item-prefix + ${t}-content-item-suffix,
          ${t}-content-item-suffix:first-child`]:{marginInlineStart:p("multi-item-padding-horizontal")},[`${t}-selection-item`]:{lineHeight:`calc(${p("multi-item-height")} - ${a} * 2)`,border:`${a} ${c} ${p("multi-item-border-color")}`,display:"flex",marginBlock:s,marginInlineEnd:o(s).mul(2).equal(),background:p("multi-item-background"),borderRadius:p("multi-item-border-radius"),paddingInlineStart:n,paddingInlineEnd:i,transition:["height","line-height","padding"].map(g=>`${g} ${e.motionDurationSlow}`).join(","),"&-content":{...Zr,marginInlineEnd:i},"&-remove":{...dl(),display:"inline-flex",alignItems:"center",color:l,fontWeight:"bold",fontSize:10,lineHeight:"inherit",cursor:"pointer",[`> ${r}`]:{verticalAlign:"-0.2em"},"&:hover":{color:u}}},[`${t}-input`]:{lineHeight:o(s).mul(2).add(p("multi-item-height")).equal(),width:"calc(var(--select-input-width, 0) * 1px)",minWidth:lw,maxWidth:"100%",transition:`line-height ${e.motionDurationSlow}`}},[`&${t}-sm`]:{[m("multi-item-height")]:e.multipleItemHeightSM,[m("multi-item-border-radius")]:e.borderRadiusXS},[`&${t}-lg`]:{[m("multi-item-height")]:e.multipleItemHeightLG,[m("multi-item-border-radius")]:e.borderRadius},[`&${t}-filled`]:{[m("multi-item-border-color")]:e.colorSplit,[m("multi-item-background")]:e.colorBgContainer,[`&${t}-disabled`]:{[m("multi-item-border-color")]:"transparent"}}}}},cw=BA;var fx=(e,t)=>{let{componentCls:o,antCls:r}=e,[n]=Mt(r,"select"),{border:i,borderHover:s,borderActive:a,borderOutline:c}=t,l=t.background||e.selectorBg||e.colorBgContainer;return{[n("border-color")]:i,[n("background-color")]:l,[n("affix-color")]:t.affixColor,[`&:not(${o}-disabled)`]:{"&:hover":{[n("border-color")]:s,[n("background-color")]:t.backgroundHover||l},[`&${o}-focused`]:{[n("border-color")]:a,[n("background-color")]:t.backgroundActive||l,boxShadow:`0 0 0 ${J(e.controlOutlineWidth)} ${c}`}},[`&${o}-disabled`]:{[n("border-color")]:t.borderDisabled||t.border,[n("background-color")]:t.backgroundDisabled||t.background}}},bd=(e,t,o,r,n,i)=>{let{componentCls:s}=e;return{[`&${s}-${t}`]:[fx(e,o),{[`&${s}-status-error`]:fx(e,{...o,...r}),[`&${s}-status-warning`]:fx(e,{...o,...n})},i]}},dx=(e,t)=>({outline:`${J(e.lineWidthFocus)} ${e.lineType} ${t}`,outlineOffset:J(e.calc(e.lineWidth).mul(-1).equal()),transition:["outline-offset","outline"].map(o=>`${o} 0s`).join(", ")}),VA=e=>{let{componentCls:t,fontHeight:o,controlHeight:r,fontSizeIcon:n,showArrowPaddingInlineEnd:i,iconCls:s,antCls:a,max:c,calc:l}=e,[u,f]=Mt(a,"select"),d=c(l(i).sub(n).equal(),0);return{[t]:[{[u("border-radius")]:e.borderRadius,[u("border-color")]:"#000",[u("border-size")]:e.lineWidth,[u("background-color")]:e.colorBgContainer,[u("font-size")]:e.fontSize,[u("line-height")]:e.lineHeight,[u("font-height")]:o,[u("color")]:e.colorText,[u("affix-color")]:e.colorText,[u("height")]:r,[u("padding-horizontal")]:l(e.paddingSM).sub(e.lineWidth).equal(),[u("padding-vertical")]:`calc((${f("height")} - ${f("font-height")}) / 2 - ${f("border-size")})`,...ft(e),display:"inline-flex",flexWrap:"nowrap",position:"relative",transition:`all ${e.motionDurationSlow}`,alignItems:"flex-start",outline:0,cursor:"pointer",borderRadius:f("border-radius"),borderWidth:f("border-size"),borderStyle:e.lineType,borderColor:f("border-color"),background:f("background-color"),fontSize:f("font-size"),lineHeight:f("line-height"),color:f("color"),paddingInline:f("padding-horizontal"),paddingBlock:f("padding-vertical"),[`${t}-prefix`]:{color:f("affix-color"),flex:"none",lineHeight:1},[`${t}-placeholder`]:{...Zr,color:e.colorTextPlaceholder,pointerEvents:"none",zIndex:1},[`${t}-content`]:{flex:"auto",minWidth:0,position:"relative",display:"flex",marginInlineEnd:d,"&:before":{content:'"\\a0"',width:0,overflow:"hidden"},"&-value":{visibility:"inherit"},"input[readonly]":{cursor:"inherit",caretColor:"transparent"}},[`${t}-suffix`]:{flex:"none",color:e.colorTextQuaternary,fontSize:e.fontSizeIcon,lineHeight:1,transition:["opacity","color"].map(m=>`${m} ${e.motionDurationMid} ease`).join(", "),"> :not(:last-child)":{marginInlineEnd:e.marginXS}},[`${t}-prefix, ${t}-suffix`]:{alignSelf:"center",[s]:{verticalAlign:"top"}},"&-disabled":{background:e.colorBgContainerDisabled,[u("color")]:e.colorTextDisabled,cursor:"not-allowed",input:{cursor:"not-allowed"}},"&-sm":{[u("height")]:e.controlHeightSM,[u("padding-horizontal")]:l(e.paddingXS).sub(e.lineWidth).equal(),[u("border-radius")]:e.borderRadiusSM,[`${t}-clear`]:{insetInlineEnd:f("padding-horizontal")}},"&-lg":{[u("height")]:e.controlHeightLG,[u("font-size")]:e.fontSizeLG,[u("line-height")]:e.lineHeightLG,[u("font-height")]:e.fontHeightLG,[u("border-radius")]:e.borderRadiusLG}},{[`&:not(${t}-customize)`]:{[`${t}-input`]:{outline:"none",background:"transparent",appearance:"none",border:0,margin:0,padding:0,color:f("color"),fontFamily:"inherit",fontSize:"inherit","&::-webkit-search-cancel-button":{display:"none",appearance:"none"}}}},{[`&-single:not(${t}-customize)`]:{[`${t}-input`]:{position:"absolute",inset:0,lineHeight:"inherit"},[`${t}-content`]:{...Zr,alignSelf:"center","&-has-value":{display:"block","&:before":{display:"none"}},"&-has-search-value":{color:"transparent",[`> *:not(${t}-input)`]:{opacity:0}},"&-value":{transition:`all ${e.motionDurationMid} ${e.motionEaseInOut}`,zIndex:1,opacity:1}},[`&${t}-open ${t}-content`]:{"&-has-value":{opacity:.25},"&-has-search-value":{opacity:1,transition:`opacity ${e.motionDurationMid} ${e.motionEaseInOut}`,color:"transparent",[`> *:not(${t}-input)`]:{opacity:0}}}}},{[`&-show-search:not(${t}-customize-input):not(${t}-disabled)`]:{cursor:"text"}},cw(e),bd(e,"outlined",{border:e.colorBorder,borderHover:e.hoverBorderColor,borderActive:e.activeBorderColor,borderOutline:e.activeOutlineColor,borderDisabled:e.colorBorderDisabled},{border:e.colorError,borderHover:e.colorErrorBorderHover,borderActive:e.colorError,borderOutline:e.colorErrorOutline,affixColor:e.colorErrorAffix},{border:e.colorWarning,borderHover:e.colorWarningHover,borderActive:e.colorWarning,borderOutline:e.colorWarningOutline,affixColor:e.colorWarningAffix}),bd(e,"filled",{border:"transparent",borderHover:"transparent",borderActive:e.activeBorderColor,borderOutline:"transparent",borderDisabled:e.colorBorderDisabled,background:e.colorFillTertiary,backgroundHover:e.colorFillSecondary,backgroundActive:e.colorBgContainer},{color:e.colorErrorText,background:e.colorErrorBg,backgroundHover:e.colorErrorBgHover,borderActive:e.colorError},{background:e.colorWarningBg,backgroundHover:e.colorWarningBgHover,borderActive:e.colorWarning}),bd(e,"borderless",{border:"transparent",borderHover:"transparent",borderActive:"transparent",borderOutline:"transparent",background:"transparent"},{},{},{[`&:not(${t}-disabled):has(input:focus-visible), &:not(${t}-disabled):has(textarea:focus-visible)`]:dx(e,e.activeBorderColor),[`&${t}-status-error:not(${t}-disabled):has(input:focus-visible), &${t}-status-error:not(${t}-disabled):has(textarea:focus-visible)`]:dx(e,e.colorError),[`&${t}-status-warning:not(${t}-disabled):has(input:focus-visible), &${t}-status-warning:not(${t}-disabled):has(textarea:focus-visible)`]:dx(e,e.colorWarning)}),bd(e,"underlined",{border:e.colorBorder,borderHover:e.hoverBorderColor,borderActive:e.activeBorderColor,borderOutline:"transparent"},{border:e.colorError,borderHover:e.colorErrorBorderHover,borderActive:e.colorError},{border:e.colorWarning,borderHover:e.colorWarningHover,borderActive:e.colorWarning},{borderRadius:0,borderTopColor:"transparent",borderInlineColor:"transparent"}),aw(e)]}},uw=VA;var fw=e=>{let{fontSize:t,lineHeight:o,lineWidth:r,lineWidthFocus:n,controlHeight:i,controlHeightSM:s,controlHeightLG:a,paddingXXS:c,controlPaddingHorizontal:l,zIndexPopupBase:u,colorText:f,fontWeightStrong:d,controlItemBgActive:m,controlItemBgHover:p,colorBgContainer:g,colorFillSecondary:y,colorBgContainerDisabled:x,colorTextDisabled:b,colorPrimaryHover:h,colorPrimary:S,controlOutline:C}=e,R=c*2,v=r*2,w=Math.min(i-R,i-v),T=Math.min(s-R,s-v),I=Math.min(a-R,a-v),P=Math.floor(c/2);return{lineWidthFocus:n===0?0:r,INTERNAL_FIXED_ITEM_MARGIN:P,zIndexPopup:u+50,optionSelectedColor:f,optionSelectedFontWeight:d,optionSelectedBg:m,optionActiveBg:p,optionPadding:`${(i-t*o)/2}px ${l}px`,optionFontSize:t,optionLineHeight:o,optionHeight:i,selectorBg:g,clearBg:g,singleItemHeightLG:a,multipleItemBg:y,multipleItemBorderColor:"transparent",multipleItemHeight:w,multipleItemHeightSM:T,multipleItemHeightLG:I,multipleSelectorBgDisabled:x,multipleItemColorDisabled:b,multipleItemBorderColorDisabled:"transparent",showArrowPaddingInlineEnd:Math.ceil(e.fontSize*1.25),hoverBorderColor:h,activeBorderColor:S,activeOutlineColor:C,selectAffixPadding:c}};var HA=e=>{let{antCls:t,componentCls:o,motionDurationMid:r,inputPaddingHorizontalBase:n}=e,i={[`${o}-clear`]:{opacity:1},[`${o}-suffix:not(:last-child)`]:{opacity:0,pointerEvents:"none"},[`&${o}-allow-clear:not(${o}-show-arrow):not(${o}-customize) ${o}-content`]:{marginInlineEnd:e.showArrowPaddingInlineEnd}};return{[o]:{...ft(e),[`${o}-selection-item`]:{flex:1,fontWeight:"normal",position:"relative",userSelect:"none",...Zr,[`> ${t}-typography`]:{display:"inline"}},[`${o}-prefix`]:{flex:"none",marginInlineEnd:e.selectAffixPadding},[`${o}-clear`]:{position:"absolute",top:"50%",insetInlineStart:"auto",insetInlineEnd:n,zIndex:1,display:"inline-block",width:e.fontSizeIcon,height:e.fontSizeIcon,marginTop:e.calc(e.fontSizeIcon).mul(-1).div(2).equal(),padding:0,background:"transparent",color:e.colorTextQuaternary,fontSize:e.fontSizeIcon,fontFamily:"inherit",fontStyle:"normal",lineHeight:1,textAlign:"center",textTransform:"none",appearance:"none",border:0,cursor:"pointer",opacity:0,transition:["color","opacity"].map(s=>`${s} ${r} ease`).join(", "),textRendering:"auto",transform:"translateZ(0)","&:before":{display:"block"},"&:hover":{color:e.colorIcon}},"@media(hover:none)":i,"&:hover":i},[`${o}-status`]:{"&-error, &-warning, &-success, &-validating":{[`&${o}-has-feedback`]:{[`${o}-clear`]:{insetInlineEnd:e.calc(n).add(e.fontSize).add(e.paddingXS).equal()}}}}}},kA=e=>{let{componentCls:t}=e;return[{[t]:{[`&${t}-in-form-item`]:{width:"100%"}}},HA(e),sw(e),{[`${t}-rtl`]:{direction:"rtl"}},xi(e,{focusElCls:`${t}-focused`})]},dw=Be("Select",(e,{rootPrefixCls:t})=>{let o=Oe(e,{rootPrefixCls:t,inputPaddingHorizontalBase:e.calc(e.paddingSM).sub(e.lineWidth).equal(),multipleSelectItemHeight:e.multipleItemHeight,selectHeight:e.controlHeight});return[kA(o),uw(o)]},fw,{unitless:{optionLineHeight:!0,optionSelectedFontWeight:!0}});var Lr=$(require("react"));var yd=$(require("react"));var WA={icon:{tag:"svg",attrs:{viewBox:"64 64 896 896",focusable:"false"},children:[{tag:"path",attrs:{d:"M912 190h-69.9c-9.8 0-19.1 4.5-25.1 12.2L404.7 724.5 207 474a32 32 0 00-25.1-12.2H112c-6.7 0-10.4 7.7-6.3 12.9l273.9 347c12.8 16.2 37.4 16.2 50.3 0l488.4-618.9c4.1-5.1.4-12.8-6.3-12.8z"}}]},name:"check",theme:"outlined"},mw=WA;function mx(){return mx=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},mx.apply(this,arguments)}var jA=(e,t)=>yd.createElement(Kt,mx({},e,{ref:t,icon:mw})),UA=yd.forwardRef(jA),Cd=UA;var Sd=$(require("react"));var qA={icon:{tag:"svg",attrs:{viewBox:"64 64 896 896",focusable:"false"},children:[{tag:"path",attrs:{d:"M884 256h-75c-5.1 0-9.9 2.5-12.9 6.6L512 654.2 227.9 262.6c-3-4.1-7.8-6.6-12.9-6.6h-75c-6.5 0-10.3 7.4-6.5 12.7l352.6 486.1c12.8 17.6 39 17.6 51.7 0l352.6-486.1c3.9-5.3.1-12.7-6.4-12.7z"}}]},name:"down",theme:"outlined"},pw=qA;function px(){return px=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},px.apply(this,arguments)}var GA=(e,t)=>Sd.createElement(Kt,px({},e,{ref:t,icon:pw})),XA=Sd.forwardRef(GA),gw=XA;var vd=$(require("react"));var KA={icon:{tag:"svg",attrs:{viewBox:"64 64 896 896",focusable:"false"},children:[{tag:"path",attrs:{d:"M909.6 854.5L649.9 594.8C690.2 542.7 712 479 712 412c0-80.2-31.3-155.4-87.9-212.1-56.6-56.7-132-87.9-212.1-87.9s-155.5 31.3-212.1 87.9C143.2 256.5 112 331.8 112 412c0 80.1 31.3 155.5 87.9 212.1C256.5 680.8 331.8 712 412 712c67 0 130.6-21.8 182.7-62l259.7 259.6a8.2 8.2 0 0011.6 0l43.6-43.5a8.2 8.2 0 000-11.6zM570.4 570.4C528 612.7 471.8 636 412 636s-116-23.3-158.4-65.6C211.3 528 188 471.8 188 412s23.3-116.1 65.6-158.4C296 211.3 352.2 188 412 188s116.1 23.2 158.4 65.6S636 352.2 636 412s-23.3 116.1-65.6 158.4z"}}]},name:"search",theme:"outlined"},hw=KA;function gx(){return gx=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},gx.apply(this,arguments)}var YA=(e,t)=>vd.createElement(Kt,gx({},e,{ref:t,icon:hw})),QA=vd.forwardRef(YA),Rd=QA;function hx({suffixIcon:e,contextSuffixIcon:t,clearIcon:o,contextClearIcon:r,menuItemSelectedIcon:n,contextMenuItemSelectedIcon:i,removeIcon:s,contextRemoveIcon:a,loading:c,loadingIcon:l,contextLoadingIcon:u,searchIcon:f,contextSearchIcon:d,multiple:m,hasFeedback:p,showSuffixIcon:g,feedbackIcon:y,showArrow:x,componentName:b}){return Lr.useMemo(()=>{let h=Lt(o,r,Lr.createElement(gn,null)),S=w=>e===null&&!p&&!x?null:Lr.createElement(Lr.Fragment,null,g!==!1&&w,p&&y),C=null;e!==void 0?C=S(e):c?C=S(Lt(l,u,Lr.createElement(ua,{spin:!0}))):C=({open:w,showSearch:T})=>S(w&&T?Lt(f,d,Lr.createElement(Rd,null)):Lt(t,Lr.createElement(gw,null)));let R=Lt(n,i,m?Lr.createElement(Cd,null):null),v=Lt(s,a,Lr.createElement(fr,null));return{clearIcon:h,suffixIcon:C,itemIcon:R,removeIcon:v}},[e,t,o,r,n,i,s,a,c,l,u,f,d,m,p,g,y,x])}var xx=$(require("react"));function ZA(e){return xx.default.useMemo(()=>{if(e)return(...t)=>xx.default.createElement(jn,{space:!0},e.apply(void 0,t))},[e])}var xw=ZA;function bx(e,t){return t!==void 0?t:e!==null}var bw="SECRET_COMBOBOX_MODE_DO_NOT_USE",JA=(e,t)=>{let{prefixCls:o,bordered:r,className:n,rootClassName:i,getPopupContainer:s,popupClassName:a,dropdownClassName:c,listHeight:l=256,placement:u,listItemHeight:f,size:d,disabled:m,notFoundContent:p,status:g,builtinPlacements:y,dropdownMatchSelectWidth:x,popupMatchSelectWidth:b,direction:h,style:S,allowClear:C,variant:R,popupStyle:v,dropdownStyle:w,transitionName:T,tagRender:I,maxCount:P,prefix:N,dropdownRender:O,popupRender:_,onDropdownVisibleChange:M,onOpenChange:A,styles:V,classNames:F,clearIcon:G,showSearch:z,...B}=e,{getPopupContainer:k,getPrefixCls:W,renderEmpty:j,direction:L,virtual:U,popupMatchSelectWidth:X,popupOverflow:Y}=Dr.useContext(Se),{showSearch:q,allowClear:D,style:K,styles:H,className:Q,classNames:Z,clearIcon:te,loadingIcon:se,menuItemSelectedIcon:re,removeIcon:oe,suffixIcon:ae}=De("select"),[,ie]=Tt(),be=f??ie?.controlHeight,ee=W("select",o),xe=W(),fe=h??L,{compactSize:_e,compactItemClassnames:Ve}=Ar(ee,fe),[ue,He]=hr("select",R,r),Ke=no(ee),[Pe,de]=dw(ee,Ke),le=Dr.useMemo(()=>{let{mode:go}=e;if(go!=="combobox")return go===bw?"combobox":go},[e.mode]),Re=le==="multiple"||le==="tags",pe=bx(e.suffixIcon,e.showArrow),ve=b??x??X,Fe=xw(_||O),Ye=A||M,{status:Je,hasFeedback:st,isFormItemInput:Xe,feedbackIcon:wt}=Dr.useContext(Fo),$t=$i(Je,g),lt;p!==void 0?lt=p:le==="combobox"?lt=null:lt=j?.("Select")||Dr.createElement(rw,{componentName:"Select"});let{suffixIcon:Ct,itemIcon:Pt,removeIcon:Nt,clearIcon:Me}=hx({...B,multiple:Re,hasFeedback:st,feedbackIcon:wt,showSuffixIcon:pe,prefixCls:ee,componentName:"Select",clearIcon:G,searchIcon:lx(z,"searchIcon"),contextClearIcon:te,contextLoadingIcon:se,contextMenuItemSelectedIcon:re,contextRemoveIcon:oe,contextSearchIcon:lx(q,"searchIcon"),contextSuffixIcon:ae}),zt=C??D,ce=zt===!0?{clearIcon:Me}:zt,ge=z??q,Le=tt(B,["suffixIcon","itemIcon"]),ne=kt(go=>d??_e??go),Ce=Dr.useContext(Xt),he=m??Ce,$e={...e,variant:ue,status:$t,disabled:he,size:ne},Qe=Ee(K),Bt=Ee(S),[At,pt]=je([Z,F],[H,Qe,V,Bt],{props:$e},{popup:{_default:"root"}}),qt=E(At.popup.root,a,c,{[`${ee}-dropdown-${fe}`]:fe==="rtl"},i,de,Ke,Pe),Qt={...pt.popup?.root,...v??w},vr=E({[`${ee}-lg`]:ne==="large",[`${ee}-sm`]:ne==="small",[`${ee}-rtl`]:fe==="rtl",[`${ee}-${ue}`]:He,[`${ee}-in-form-item`]:Xe},Un(ee,$t,st),Ve,Q,n,At.root,i,de,Ke,Pe),io=Dr.useMemo(()=>u!==void 0?u:fe==="rtl"?"bottomRight":"bottomLeft",[u,fe]),[so]=aa("SelectLike",pt.popup.root?.zIndex??Qt.zIndex);return Dr.createElement(KE,{ref:t,virtual:U,classNames:At,styles:pt,showSearch:ge,...Le,style:pt.root,popupMatchSelectWidth:ve,transitionName:hn(xe,"slide-up",T),builtinPlacements:nw(y,Y),listHeight:l,listItemHeight:be,mode:le,prefixCls:ee,placement:io,direction:fe,prefix:N,suffixIcon:Ct,menuItemSelectedIcon:Pt,removeIcon:Nt,allowClear:ce,notFoundContent:lt,className:vr,getPopupContainer:s||k,popupClassName:qt,disabled:he,popupStyle:{...pt.popup.root,...Qt,zIndex:so},maxCount:Re?P:void 0,tagRender:Re?I:void 0,popupRender:Fe,onPopupVisibleChange:Ye})},Pa=Dr.forwardRef(JA),e2=LR(Pa,"popupAlign");Pa.SECRET_COMBOBOX_MODE_DO_NOT_USE=bw;Pa.Option=zl;Pa.OptGroup=Fl;Pa._InternalPanelDoNotUseOrYouWillBeFired=e2;var yw=Pa;var Gn=$(require("react"));var Cs=$(require("react"));function yx(){return yx=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},yx.apply(this,arguments)}var Cw=Cs.forwardRef(({prefixCls:e="rc-switch",className:t,checked:o,defaultChecked:r,disabled:n,loadingIcon:i,checkedChildren:s,unCheckedChildren:a,onClick:c,onChange:l,onKeyDown:u,styles:f,classNames:d,...m},p)=>{let[g,y]=it(r??!1,o);function x(C,R){let v=g;return n||(v=C,y(v),l?.(v,R)),v}function b(C){C.which===Ie.LEFT?x(!1,C):C.which===Ie.RIGHT&&x(!0,C),u?.(C)}function h(C){let R=x(!g,C);c?.(R,C)}let S=E(e,t,{[`${e}-checked`]:g,[`${e}-disabled`]:n});return Cs.createElement("button",yx({},m,{type:"button",role:"switch","aria-checked":g,disabled:n,className:S,ref:p,onKeyDown:b,onClick:h}),i,Cs.createElement("span",{className:`${e}-inner`},Cs.createElement("span",{className:E(`${e}-inner-checked`,d?.content),style:f?.content},s),Cs.createElement("span",{className:E(`${e}-inner-unchecked`,d?.content),style:f?.content},a)))});Cw.displayName="Switch";var Sw=Cw;var t2=e=>{let{componentCls:t,trackHeightSM:o,trackPadding:r,trackMinWidthSM:n,innerMinMarginSM:i,innerMaxMarginSM:s,handleSizeSM:a,calc:c}=e,l=`${t}-inner`,u=J(c(a).add(c(r).mul(2)).equal()),f=J(c(s).mul(2).equal());return{[t]:{[`&${t}-small`]:{minWidth:n,height:o,lineHeight:J(o),[`${t}-inner`]:{paddingInlineStart:s,paddingInlineEnd:i,[`${l}-checked, ${l}-unchecked`]:{minHeight:o},[`${l}-checked`]:{marginInlineStart:`calc(-100% + ${u} - ${f})`,marginInlineEnd:`calc(100% - ${u} + ${f})`},[`${l}-unchecked`]:{marginTop:c(o).mul(-1).equal(),marginInlineStart:0,marginInlineEnd:0}},[`${t}-handle`]:{width:a,height:a},[`${t}-loading-icon`]:{top:c(c(a).sub(e.switchLoadingIconSize)).div(2).equal(),fontSize:e.switchLoadingIconSize},[`&${t}-checked`]:{[`${t}-inner`]:{paddingInlineStart:i,paddingInlineEnd:s,[`${l}-checked`]:{marginInlineStart:0,marginInlineEnd:0},[`${l}-unchecked`]:{marginInlineStart:`calc(100% - ${u} + ${f})`,marginInlineEnd:`calc(-100% + ${u} - ${f})`}},[`${t}-handle`]:{insetInlineStart:`calc(100% - ${J(c(a).add(r).equal())})`}},[`&:not(${t}-disabled):active`]:{[`&:not(${t}-checked) ${l}`]:{[`${l}-unchecked`]:{marginInlineStart:c(e.marginXXS).div(2).equal(),marginInlineEnd:c(e.marginXXS).mul(-1).div(2).equal()}},[`&${t}-checked ${l}`]:{[`${l}-checked`]:{marginInlineStart:c(e.marginXXS).mul(-1).div(2).equal(),marginInlineEnd:c(e.marginXXS).div(2).equal()}}}}}}},o2=e=>{let{componentCls:t,handleSize:o,calc:r}=e;return{[t]:{[`${t}-loading-icon${e.iconCls}`]:{position:"relative",top:r(r(o).sub(e.fontSize)).div(2).equal(),color:e.switchLoadingIconColor,verticalAlign:"top"},[`&${t}-checked ${t}-loading-icon`]:{color:e.switchColor}}}},r2=e=>{let{componentCls:t,trackPadding:o,handleBg:r,handleShadow:n,handleSize:i,calc:s}=e,a=`${t}-handle`;return{[t]:{[a]:{position:"absolute",top:o,insetInlineStart:o,width:i,height:i,transition:`all ${e.switchDuration} ease-in-out`,...xn(),"&::before":{position:"absolute",top:0,insetInlineEnd:0,bottom:0,insetInlineStart:0,backgroundColor:r,borderRadius:s(i).div(2).equal(),boxShadow:n,transition:`all ${e.switchDuration} ease-in-out`,content:'""',...fa()}},[`&${t}-checked ${a}`]:{insetInlineStart:`calc(100% - ${J(s(i).add(o).equal())})`},[`&:not(${t}-disabled):active`]:{[`${a}::before`]:{insetInlineEnd:e.switchHandleActiveInset,insetInlineStart:0},[`&${t}-checked ${a}::before`]:{insetInlineEnd:0,insetInlineStart:e.switchHandleActiveInset}}}}},n2=e=>{let{componentCls:t,trackHeight:o,trackPadding:r,innerMinMargin:n,innerMaxMargin:i,handleSize:s,switchDuration:a,calc:c}=e,l=`${t}-inner`,u=J(c(s).add(c(r).mul(2)).equal()),f=J(c(i).mul(2).equal());return{[t]:{[l]:{display:"block",overflow:"hidden",borderRadius:100,height:"100%",paddingInlineStart:i,paddingInlineEnd:n,transition:["padding-inline-start","padding-inline-end"].map(d=>`${d} ${a} ease-in-out`).join(", "),...xn(),[`${l}-checked, ${l}-unchecked`]:{display:"flex",alignItems:"center",justifyContent:"center",color:e.colorTextLightSolid,fontSize:e.fontSizeSM,pointerEvents:"none",minHeight:o,transition:["margin-inline-start","margin-inline-end"].map(d=>`${d} ${a} ease-in-out`).join(", "),...xn()},[`${l}-checked`]:{marginInlineStart:`calc(-100% + ${u} - ${f})`,marginInlineEnd:`calc(100% - ${u} + ${f})`},[`${l}-unchecked`]:{marginTop:c(o).mul(-1).equal(),marginInlineStart:0,marginInlineEnd:0}},[`&${t}-checked ${l}`]:{paddingInlineStart:n,paddingInlineEnd:i,[`${l}-checked`]:{marginInlineStart:0,marginInlineEnd:0},[`${l}-unchecked`]:{marginInlineStart:`calc(100% - ${u} + ${f})`,marginInlineEnd:`calc(-100% + ${u} - ${f})`}},[`&:not(${t}-disabled):active`]:{[`&:not(${t}-checked) ${l}`]:{[`${l}-unchecked`]:{marginInlineStart:c(r).mul(2).equal(),marginInlineEnd:c(r).mul(-1).mul(2).equal()}},[`&${t}-checked ${l}`]:{[`${l}-checked`]:{marginInlineStart:c(r).mul(-1).mul(2).equal(),marginInlineEnd:c(r).mul(2).equal()}}}}}},i2=e=>{let{componentCls:t,trackHeight:o,trackMinWidth:r}=e;return{[t]:{...ft(e),position:"relative",display:"inline-block",boxSizing:"border-box",minWidth:r,height:o,lineHeight:J(o),verticalAlign:"middle",background:e.colorTextQuaternary,border:"0",borderRadius:100,cursor:"pointer",transition:`all ${e.motionDurationMid}`,userSelect:"none",...xn(),[`&:hover:not(${t}-disabled)`]:{background:e.colorTextTertiary},...Jr(e),[`&${t}-checked`]:{background:e.switchColor,[`&:hover:not(${t}-disabled)`]:{background:e.colorPrimaryHover}},[`&${t}-loading, &${t}-disabled`]:{cursor:"not-allowed",opacity:e.switchDisabledOpacity,"*":{boxShadow:"none",cursor:"not-allowed"}},[`&${t}-rtl`]:{direction:"rtl"}}}},s2=e=>{let{fontSize:t,lineHeight:o,controlHeight:r,colorWhite:n}=e,i=t*o,s=r/2,a=2,c=i-a*2,l=s-a*2;return{trackHeight:i,trackHeightSM:s,trackMinWidth:c*2+a*4,trackMinWidthSM:l*2+a*2,trackPadding:a,handleBg:n,handleSize:c,handleSizeSM:l,handleShadow:`0 2px 4px 0 ${new Ze("#00230b").setA(.2).toRgbString()}`,innerMinMargin:c/2,innerMaxMargin:c+a+a*2,innerMinMarginSM:l/2,innerMaxMarginSM:l+a+a*2}},vw=Be("Switch",e=>{let t=Oe(e,{switchDuration:e.motionDurationMid,switchColor:e.colorPrimary,switchDisabledOpacity:e.opacityLoading,switchLoadingIconSize:e.calc(e.fontSizeIcon).mul(.75).equal(),switchLoadingIconColor:`rgba(0, 0, 0, ${e.opacityLoading})`,switchHandleActiveInset:"-30%"});return[i2(t),n2(t),r2(t),o2(t),t2(t)]},s2);var a2=Gn.forwardRef((e,t)=>{let{prefixCls:o,size:r,disabled:n,loading:i,className:s,rootClassName:a,style:c,checked:l,value:u,defaultChecked:f,defaultValue:d,onChange:m,styles:p,classNames:g,...y}=e,[x,b]=it(f??d??!1,l??u),{getPrefixCls:h,direction:S,className:C,style:R,classNames:v,styles:w}=De("switch"),T=Gn.useContext(Xt),I=(n??T)||i,P=h("switch",o),[N,O]=vw(P),_=kt(r),M={...e,size:_,disabled:I},A=Ee(R),V=Ee(c),[F,G]=je([v,g],[w,A,p,V],{props:M}),z=Gn.createElement("div",{className:E(`${P}-handle`,F.indicator),style:G.indicator},i&&Gn.createElement(ua,{className:`${P}-loading-icon`})),B=E(C,{[`${P}-small`]:_==="small",[`${P}-loading`]:i,[`${P}-rtl`]:S==="rtl"},s,a,F.root,N,O);return Gn.createElement(pi,{component:"Switch",disabled:I},Gn.createElement(Sw,{...y,classNames:F,styles:G,checked:x,onChange:(...W)=>{b(W[0]),m?.(...W)},prefixCls:P,className:B,style:G.root,disabled:I,ref:t,loadingIcon:z}))}),Rw=a2;Rw.__ANT_SWITCH=!0;var Ew=Rw;var ww=bn;var wx=$(require("react")),kl=require("react");var Ii=$(require("react"));function Cx(e){return["small","middle","medium","large"].includes(e)}function Sx(e){return e?wo(e):!1}var Ed=$(require("react"));var l2=e=>{let{componentCls:t,borderRadius:o,paddingSM:r,colorBorder:n,paddingXS:i,fontSizeLG:s,fontSizeSM:a,borderRadiusLG:c,borderRadiusSM:l,colorBgContainerDisabled:u,lineWidth:f,lineType:d,antCls:m}=e,[p,g]=Mt(m,"space-addon");return{[t]:[{...ft(e),display:"inline-flex",alignItems:"center",gap:0,whiteSpace:"nowrap",paddingInline:r,margin:0,borderWidth:f,borderStyle:d,borderRadius:o,"&:hover":{zIndex:0},[`&${t}-disabled`]:{color:e.colorTextDisabled},"&-large":{fontSize:s,borderRadius:c},"&-small":{paddingInline:i,borderRadius:l,fontSize:a},"&-compact-last-item":{borderEndStartRadius:0,borderStartStartRadius:0},"&-compact-first-item":{borderEndEndRadius:0,borderStartEndRadius:0},"&-compact-item:not(:first-child):not(:last-child)":{borderRadius:0},"&-compact-item:not(:last-child)":{borderInlineEndWidth:0},"&-compact-item:not(:first-child)":{borderInlineStartWidth:0}},{[p("addon-border-color")]:n,[p("addon-background")]:u,[p("addon-border-color-outlined")]:n,[p("addon-background-filled")]:u,borderColor:g("addon-border-color"),background:g("addon-background"),"&-variant-outlined":{[p("addon-border-color")]:g("addon-border-color-outlined")},"&-variant-filled":{[p("addon-border-color")]:"transparent",[p("addon-background")]:g("addon-background-filled"),[`&${t}-disabled`]:{[p("addon-border-color")]:n,[p("addon-background")]:u}},"&-variant-borderless":{border:"none",background:"transparent"},"&-variant-underlined":{border:"none",background:"transparent"}},{"&-status-error":{[p("addon-border-color-outlined")]:e.colorError,[p("addon-background-filled")]:e.colorErrorBg,color:e.colorError},"&-status-warning":{[p("addon-border-color-outlined")]:e.colorWarning,[p("addon-background-filled")]:e.colorWarningBg,color:e.colorWarning}}]}},$w=Be("Addon",e=>[l2(e),xi(e,{focus:!1})]);var c2=Ed.default.forwardRef((e,t)=>{let{className:o,children:r,style:n,prefixCls:i,variant:s="outlined",disabled:a,status:c,...l}=e,{getPrefixCls:u,direction:f}=Ed.default.useContext(Se),d=u("space-addon",i),[m,p]=$w(d),{compactItemClassnames:g,compactSize:y}=Ar(d,f),x=Un(d,c),b=E(d,m,g,p,`${d}-variant-${s}`,x,{[`${d}-${y}`]:y,[`${d}-disabled`]:a},o);return Ed.default.createElement("div",{ref:t,className:b,style:n,...l},r)}),Pw=c2;var Nw=$(require("react")),vx=Nw.default.createContext({latestIndex:0}),Iw=vx.Provider;var Ni=$(require("react"));var u2=e=>{let{className:t,prefix:o,index:r,children:n,separator:i,style:s,classNames:a,styles:c}=e,{latestIndex:l}=Ni.useContext(vx);return ut(n)?Ni.createElement(Ni.Fragment,null,Ni.createElement("div",{className:t,style:s},n),r<l&&i&&Ni.createElement("span",{className:E(`${o}-item-separator`,a?.separator),style:c?.separator},i)):null},Tw=u2;var f2=e=>{let{componentCls:t,antCls:o}=e;return{[t]:{display:"inline-flex","&-rtl":{direction:"rtl"},"&-vertical":{flexDirection:"column"},"&-align":{flexDirection:"column","&-center":{alignItems:"center"},"&-start":{alignItems:"flex-start"},"&-end":{alignItems:"flex-end"},"&-baseline":{alignItems:"baseline"}},[`${t}-item:empty`]:{display:"none"},[`${t}-item > ${o}-badge-not-a-wrapper:only-child`]:{display:"block"}}}},d2=e=>{let{componentCls:t}=e;return{[t]:{"&-gap-row-small":{rowGap:e.spaceGapSmallSize},"&-gap-row-medium, &-gap-row-middle":{rowGap:e.spaceGapMiddleSize},"&-gap-row-large":{rowGap:e.spaceGapLargeSize},"&-gap-col-small":{columnGap:e.spaceGapSmallSize},"&-gap-col-medium, &-gap-col-middle":{columnGap:e.spaceGapMiddleSize},"&-gap-col-large":{columnGap:e.spaceGapLargeSize}}}};var Mw=Be("Space",e=>{let t=Oe(e,{spaceGapSmallSize:e.paddingXS,spaceGapMiddleSize:e.padding,spaceGapLargeSize:e.paddingLG});return[f2(t),d2(t)]},()=>({}),{resetStyle:!1});var m2=Ii.forwardRef((e,t)=>{let{getPrefixCls:o,direction:r,size:n,className:i,style:s,classNames:a,styles:c}=De("space"),{size:l=n??"small",align:u,className:f,rootClassName:d,children:m,direction:p,orientation:g,prefixCls:y,split:x,separator:b,style:h,vertical:S,wrap:C=!1,classNames:R,styles:v,...w}=e,[T,I]=Array.isArray(l)?l:[l,l],P=Cx(I),N=Cx(T),O=Sx(I),_=Sx(T),M=Ro(m,{keepEmpty:!0}),[A,V]=ia(g,S,p),F=u===void 0&&!V?"center":u,G=b??x,z=o("space",y),[B,k]=Mw(z),W={...e,size:l,orientation:A,align:F},j=Ee(s),L=Ee(h),[U,X]=je([a,R],[c,j,v,L],{props:W}),Y=E(z,i,B,`${z}-${A}`,{[`${z}-rtl`]:r==="rtl",[`${z}-align-${F}`]:F,[`${z}-gap-row-${I}`]:P,[`${z}-gap-col-${T}`]:N},f,d,k,U.root),q=E(`${z}-item`,U.item),D=M.map((Q,Z)=>{let te=Q?.key||`${q}-${Z}`;return Ii.createElement(Tw,{prefix:z,classNames:U,styles:X,className:q,key:te,index:Z,separator:G,style:X.item},Q)}),K=Ii.useMemo(()=>({latestIndex:M.reduce((Z,te,se)=>ut(te)?se:Z,0)}),[M]);if(M.length===0)return null;let H={};return C&&(H.flexWrap="wrap"),!N&&_&&(H.columnGap=T),!P&&O&&(H.rowGap=I),Ii.createElement("div",{ref:t,className:Y,style:{...H,...X.root},...w},Ii.createElement(Iw,{value:K},D))}),Rx=m2;Rx.Compact=lf;Rx.Addon=Pw;var Ow=Rx;function Xn(e){return Oe(e,{inputAffixPadding:e.paddingXXS})}var Kn=e=>{let{controlHeight:t,fontSize:o,lineHeight:r,lineWidth:n,lineWidthFocus:i,controlHeightSM:s,controlHeightLG:a,fontSizeLG:c,lineHeightLG:l,paddingSM:u,controlPaddingHorizontalSM:f,controlPaddingHorizontal:d,colorFillAlter:m,colorPrimaryHover:p,colorPrimary:g,controlOutlineWidth:y,controlOutline:x,colorErrorOutline:b,colorWarningOutline:h,colorBgContainer:S,inputFontSize:C,inputFontSizeLG:R,inputFontSizeSM:v}=e,w=C||o,T=v||w,I=R||c,P=Math.round((t-w*r)/2*10)/10-n,N=Math.round((s-T*r)/2*10)/10-n,O=Math.ceil((a-I*l)/2*10)/10-n;return{lineWidthFocus:i===0?0:n,paddingBlock:Math.max(P,0),paddingBlockSM:Math.max(N,0),paddingBlockLG:Math.max(O,0),paddingInline:u-n,paddingInlineSM:f-n,paddingInlineLG:d-n,addonBg:m,activeBorderColor:g,hoverBorderColor:p,activeShadow:`0 0 0 ${y}px ${x}`,errorActiveShadow:`0 0 0 ${y}px ${b}`,warningActiveShadow:`0 0 0 ${y}px ${h}`,hoverBg:S,activeBg:S,inputFontSize:w,inputFontSizeLG:I,inputFontSizeSM:T}};var p2=e=>({borderColor:e.hoverBorderColor,backgroundColor:e.hoverBg}),Ex=e=>({color:e.colorTextDisabled,backgroundColor:e.colorBgContainerDisabled,borderColor:e.colorBorderDisabled,boxShadow:"none",cursor:"not-allowed",opacity:1,"input[disabled], textarea[disabled]":{cursor:"not-allowed"},"&:hover:not([disabled])":{...p2(Oe(e,{hoverBorderColor:e.colorBorderDisabled,hoverBg:e.colorBgContainerDisabled}))}}),Bw=(e,t)=>({background:e.colorBgContainer,borderWidth:e.lineWidth,borderStyle:e.lineType,borderColor:t.borderColor,"&:hover":{borderColor:t.hoverBorderColor,backgroundColor:e.hoverBg},"&:focus, &:focus-within":{borderColor:t.activeBorderColor,boxShadow:t.activeShadow,outline:0,backgroundColor:e.activeBg}}),Aw=(e,t)=>({[`&${e.componentCls}-status-${t.status}:not(${e.componentCls}-disabled)`]:{...Bw(e,t),[`${e.componentCls}-prefix, ${e.componentCls}-suffix`]:{color:t.affixColor}},[`&${e.componentCls}-status-${t.status}${e.componentCls}-disabled`]:{borderColor:t.borderColor}}),Vw=(e,t)=>({"&-outlined":{...Bw(e,{borderColor:e.colorBorder,hoverBorderColor:e.hoverBorderColor,activeBorderColor:e.activeBorderColor,activeShadow:e.activeShadow}),[`&${e.componentCls}-disabled, &[disabled]`]:{...Ex(e)},...Aw(e,{status:"error",borderColor:e.colorError,hoverBorderColor:e.colorErrorBorderHover,activeBorderColor:e.colorError,activeShadow:e.errorActiveShadow,affixColor:e.colorErrorAffix}),...Aw(e,{status:"warning",borderColor:e.colorWarning,hoverBorderColor:e.colorWarningBorderHover,activeBorderColor:e.colorWarning,activeShadow:e.warningActiveShadow,affixColor:e.colorWarningAffix}),...t}}),_w=(e,t)=>({[`&${e.componentCls}-group-wrapper-status-${t.status}`]:{[`${e.componentCls}-group-addon`]:{borderColor:t.addonBorderColor,color:t.addonColor}}}),Hw=e=>({"&-outlined":{[`${e.componentCls}-group`]:{"&-addon":{background:e.addonBg,border:`${J(e.lineWidth)} ${e.lineType} ${e.colorBorder}`},"&-addon:first-child":{borderInlineEnd:0},"&-addon:last-child":{borderInlineStart:0}},..._w(e,{status:"error",addonBorderColor:e.colorError,addonColor:e.colorErrorText}),..._w(e,{status:"warning",addonBorderColor:e.colorWarning,addonColor:e.colorWarningText}),[`&${e.componentCls}-group-wrapper-disabled`]:{[`${e.componentCls}-group-addon`]:{...Ex(e)}}}}),kw="&:focus-visible, &:has(input:focus-visible), &:has(textarea:focus-visible)",Ww=(e,t)=>({outline:`${J(e.lineWidthFocus)} ${e.lineType} ${t}`,outlineOffset:J(e.calc(e.lineWidth).mul(-1).equal()),transition:["outline-offset","outline"].map(o=>`${o} 0s`).join(", ")}),Lw=(e,t)=>({"&, & input, & textarea":{color:t.color},[kw]:Ww(e,t.color),[`${e.componentCls}-prefix, ${e.componentCls}-suffix`]:{color:t.affixColor}}),jw=(e,t)=>{let{componentCls:o}=e;return{"&-borderless":{background:"transparent",border:"none",paddingBlock:e.calc(e.paddingBlock).add(e.lineWidth).equal(),[`&${o}-sm, &${o}-affix-wrapper-sm`]:{paddingBlock:e.calc(e.paddingBlockSM).add(e.lineWidth).equal()},[`&${o}-lg, &${o}-affix-wrapper-lg`]:{paddingBlock:e.calc(e.paddingBlockLG).add(e.lineWidth).equal()},"&:focus, &:focus-within":{outline:"none"},[kw]:Ww(e,e.activeBorderColor),[`&${o}-disabled, &[disabled]`]:{color:e.colorTextDisabled,cursor:"not-allowed"},[`&${o}-status-error`]:Lw(e,{color:e.colorError,affixColor:e.colorErrorAffix}),[`&${o}-status-warning`]:Lw(e,{color:e.colorWarning,affixColor:e.colorWarningAffix}),...t}}},Uw=(e,t)=>({background:t.bg,borderWidth:e.lineWidth,borderStyle:e.lineType,borderColor:"transparent","input&, & input, textarea&, & textarea":{color:t?.inputColor??"unset"},"&:hover":{background:t.hoverBg},"&:focus, &:focus-within":{outline:0,borderColor:t.activeBorderColor,backgroundColor:e.activeBg}}),Dw=(e,t)=>({[`&${e.componentCls}-status-${t.status}:not(${e.componentCls}-disabled)`]:{...Uw(e,t),[`${e.componentCls}-prefix, ${e.componentCls}-suffix`]:{color:t.affixColor}}}),qw=(e,t)=>({"&-filled":{...Uw(e,{bg:e.colorFillTertiary,hoverBg:e.colorFillSecondary,activeBorderColor:e.activeBorderColor,inputColor:e.colorText}),[`&${e.componentCls}-disabled, &[disabled]`]:{...Ex(e)},...Dw(e,{status:"error",bg:e.colorErrorBg,hoverBg:e.colorErrorBgHover,activeBorderColor:e.colorError,inputColor:e.colorErrorText,affixColor:e.colorErrorAffix}),...Dw(e,{status:"warning",bg:e.colorWarningBg,hoverBg:e.colorWarningBgHover,activeBorderColor:e.colorWarning,inputColor:e.colorWarningText,affixColor:e.colorWarningAffix}),...t}}),Fw=(e,t)=>({[`&${e.componentCls}-group-wrapper-status-${t.status}`]:{[`${e.componentCls}-group-addon`]:{background:t.addonBg,color:t.addonColor}}}),Gw=e=>({"&-filled":{[`${e.componentCls}-group-addon`]:{background:e.colorFillTertiary,"&:last-child":{position:"static"}},...Fw(e,{status:"error",addonBg:e.colorErrorBg,addonColor:e.colorErrorText}),...Fw(e,{status:"warning",addonBg:e.colorWarningBg,addonColor:e.colorWarningText}),[`&${e.componentCls}-group-wrapper-disabled`]:{[`${e.componentCls}-group`]:{"&-addon":{background:e.colorFillTertiary,color:e.colorTextDisabled},"&-addon:first-child":{borderInlineStart:`${J(e.lineWidth)} ${e.lineType} ${e.colorBorder}`,borderTop:`${J(e.lineWidth)} ${e.lineType} ${e.colorBorder}`,borderBottom:`${J(e.lineWidth)} ${e.lineType} ${e.colorBorder}`},"&-addon:last-child":{borderInlineEnd:`${J(e.lineWidth)} ${e.lineType} ${e.colorBorder}`,borderTop:`${J(e.lineWidth)} ${e.lineType} ${e.colorBorder}`,borderBottom:`${J(e.lineWidth)} ${e.lineType} ${e.colorBorder}`}}}}}),Xw=(e,t)=>({background:e.colorBgContainer,borderWidth:`${J(e.lineWidth)} 0`,borderStyle:`${e.lineType} none`,borderColor:`transparent transparent ${t.borderColor} transparent`,borderRadius:0,"&:hover":{borderColor:`transparent transparent ${t.hoverBorderColor} transparent`,backgroundColor:e.hoverBg},"&:focus, &:focus-within":{borderColor:`transparent transparent ${t.activeBorderColor} transparent`,outline:0,backgroundColor:e.activeBg}}),zw=(e,t)=>({[`&${e.componentCls}-status-${t.status}:not(${e.componentCls}-disabled)`]:{...Xw(e,t),[`${e.componentCls}-prefix, ${e.componentCls}-suffix`]:{color:t.affixColor}},[`&${e.componentCls}-status-${t.status}${e.componentCls}-disabled`]:{borderColor:`transparent transparent ${t.borderColor} transparent`}}),Kw=(e,t)=>({"&-underlined":{...Xw(e,{borderColor:e.colorBorder,hoverBorderColor:e.hoverBorderColor,activeBorderColor:e.activeBorderColor,activeShadow:e.activeShadow}),[`&${e.componentCls}-disabled, &[disabled]`]:{color:e.colorTextDisabled,boxShadow:"none",cursor:"not-allowed","&:hover":{borderColor:`transparent transparent ${e.colorBorder} transparent`}},"input[disabled], textarea[disabled]":{cursor:"not-allowed"},...zw(e,{status:"error",borderColor:e.colorError,hoverBorderColor:e.colorErrorBorderHover,activeBorderColor:e.colorError,activeShadow:e.errorActiveShadow,affixColor:e.colorErrorAffix}),...zw(e,{status:"warning",borderColor:e.colorWarning,hoverBorderColor:e.colorWarningBorderHover,activeBorderColor:e.colorWarning,activeShadow:e.warningActiveShadow,affixColor:e.colorWarningAffix}),...t}});var g2=e=>({"&::-moz-placeholder":{opacity:1},"&::placeholder":{color:e,userSelect:"none"},"&:placeholder-shown":{textOverflow:"ellipsis"}});var Yw=e=>{let{paddingBlockLG:t,lineHeightLG:o,borderRadiusLG:r,paddingInlineLG:n}=e;return{padding:`${J(t)} ${J(n)}`,fontSize:e.inputFontSizeLG,lineHeight:o,borderRadius:r}},Qw=e=>({padding:`${J(e.paddingBlockSM)} ${J(e.paddingInlineSM)}`,fontSize:e.inputFontSizeSM,borderRadius:e.borderRadiusSM}),Zw=(e,t={})=>({position:"relative",display:"inline-block",width:"100%",minWidth:0,padding:`${J(e.paddingBlock)} ${J(e.paddingInline)}`,color:e.colorText,fontSize:e.inputFontSize,lineHeight:e.lineHeight,borderRadius:e.borderRadius,transition:`all ${e.motionDurationMid}`,...g2(e.colorTextPlaceholder),"&-lg":{...Yw(e),...t.largeStyle},"&-sm":{...Qw(e),...t.smallStyle},"&-rtl, &-textarea-rtl":{direction:"rtl"}}),h2=e=>{let{componentCls:t,antCls:o}=e;return{position:"relative",display:"table",width:"100%",borderCollapse:"separate",borderSpacing:0,"&[class*='col-']":{paddingInlineEnd:e.paddingXS,"&:last-child":{paddingInlineEnd:0}},[`&-lg ${t}, &-lg > ${t}-group-addon`]:{...Yw(e)},[`&-sm ${t}, &-sm > ${t}-group-addon`]:{...Qw(e)},[`&-lg ${o}-select-single`]:{height:e.controlHeightLG},[`&-sm ${o}-select-single`]:{height:e.controlHeightSM},[`> ${t}`]:{display:"table-cell","&:not(:first-child):not(:last-child)":{borderRadius:0}},[`${t}-group`]:{"&-addon, &-wrap":{display:"table-cell",width:1,whiteSpace:"nowrap",verticalAlign:"middle","&:not(:first-child):not(:last-child)":{borderRadius:0}},"&-wrap > *":{display:"block !important"},"&-addon":{position:"relative",padding:`0 ${J(e.paddingInline)}`,color:e.colorText,fontWeight:"normal",fontSize:e.inputFontSize,textAlign:"center",borderRadius:e.borderRadius,transition:`all ${e.motionDurationSlow}`,lineHeight:1,[`${o}-select`]:{margin:`${J(e.calc(e.paddingBlock).add(1).mul(-1).equal())} ${J(e.calc(e.paddingInline).mul(-1).equal())}`,[`&${o}-select-single:not(${o}-select-customize-input):not(${o}-pagination-size-changer)`]:{backgroundColor:"inherit",border:`${J(e.lineWidth)} ${e.lineType} transparent`,boxShadow:"none"}},[`${o}-cascader-picker`]:{margin:`-9px ${J(e.calc(e.paddingInline).mul(-1).equal())}`,backgroundColor:"transparent",[`${o}-cascader-input`]:{textAlign:"start",border:0,boxShadow:"none"}}}},[t]:{width:"100%",marginBottom:0,textAlign:"inherit","&:focus":{zIndex:1,borderInlineEndWidth:1},"&:hover":{zIndex:1,borderInlineEndWidth:1}},[`> ${t}:first-child, ${t}-group-addon:first-child`]:{borderStartEndRadius:0,borderEndEndRadius:0,[`${o}-select`]:{borderStartEndRadius:0,borderEndEndRadius:0}},[`> ${t}-affix-wrapper`]:{[`&:not(:first-child) ${t}`]:{borderStartStartRadius:0,borderEndStartRadius:0},[`&:not(:last-child) ${t}`]:{borderStartEndRadius:0,borderEndEndRadius:0}},[`> ${t}:last-child, ${t}-group-addon:last-child`]:{borderStartStartRadius:0,borderEndStartRadius:0,[`${o}-select`]:{borderStartStartRadius:0,borderEndStartRadius:0}},[`${t}-affix-wrapper`]:{"&:not(:last-child)":{borderStartEndRadius:0,borderEndEndRadius:0},"&:not(:first-child)":{borderStartStartRadius:0,borderEndStartRadius:0}},[`&${t}-group-compact`]:{display:"block",...Hu(),[`${t}-group-addon, ${t}-group-wrap, > ${t}`]:{"&:not(:first-child):not(:last-child)":{borderInlineEndWidth:e.lineWidth,"&:hover, &:focus":{zIndex:1}}},"& > *":{display:"inline-flex",float:"none",verticalAlign:"top",borderRadius:0},[`
        & > ${t}-affix-wrapper,
        & > ${t}-number-affix-wrapper,
        & > ${o}-picker-range
      `]:{display:"inline-flex"},"& > *:not(:last-child)":{marginInlineEnd:e.calc(e.lineWidth).mul(-1).equal(),borderInlineEndWidth:e.lineWidth},[t]:{float:"none"},[`& > ${o}-select,
      & > ${o}-select-auto-complete ${t},
      & > ${o}-cascader-picker ${t},
      & > ${t}-group-wrapper ${t}`]:{borderInlineEndWidth:e.lineWidth,borderRadius:0,"&:hover, &:focus":{zIndex:1}},[`& > ${o}-select-focused`]:{zIndex:1},[`& > ${o}-select > ${o}-select-arrow`]:{zIndex:1},[`& > *:first-child,
      & > ${o}-select:first-child,
      & > ${o}-select-auto-complete:first-child ${t},
      & > ${o}-cascader-picker:first-child ${t}`]:{borderStartStartRadius:e.borderRadius,borderEndStartRadius:e.borderRadius},[`& > *:last-child,
      & > ${o}-select:last-child,
      & > ${o}-cascader-picker:last-child ${t},
      & > ${o}-cascader-picker-focused:last-child ${t}`]:{borderInlineEndWidth:e.lineWidth,borderStartEndRadius:e.borderRadius,borderEndEndRadius:e.borderRadius},[`& > ${o}-select-auto-complete ${t}`]:{verticalAlign:"top"},[`${t}-group-wrapper + ${t}-group-wrapper`]:{marginInlineStart:e.calc(e.lineWidth).mul(-1).equal(),[`${t}-affix-wrapper`]:{}}}}},x2=e=>{let{componentCls:t,controlHeightSM:o,lineWidth:r,calc:n}=e,s=n(o).sub(n(r).mul(2)).sub(16).div(2).equal();return{[t]:{...ft(e),...Zw(e),...Vw(e),...qw(e),...jw(e),...Kw(e),'&[type="color"]':{height:e.controlHeight,[`&${t}-lg`]:{height:e.controlHeightLG},[`&${t}-sm`]:{height:o,paddingTop:s,paddingBottom:s}},'&[type="search"]::-webkit-search-cancel-button, &[type="search"]::-webkit-search-decoration':{appearance:"none"}}}},b2=e=>{let{componentCls:t}=e;return{[`${t}-clear-icon`]:{margin:0,padding:0,lineHeight:0,color:e.colorTextQuaternary,fontSize:e.fontSizeIcon,verticalAlign:-1,cursor:"pointer",transition:`color ${e.motionDurationSlow}`,border:"none",outline:"none",backgroundColor:"transparent","&:hover":{color:e.colorIcon},"&:focus-visible":{color:e.colorIcon,borderRadius:e.borderRadiusSM,...Dn(e)},"&:active":{color:e.colorText},"&-hidden":{visibility:"hidden"},"&-has-suffix":{margin:`0 ${J(e.inputAffixPadding)}`}}}},y2=e=>{let{componentCls:t,inputAffixPadding:o,colorTextDescription:r,motionDurationSlow:n,colorIcon:i,colorIconHover:s}=e,a=`${t}-affix-wrapper`,c=`${t}-affix-wrapper-disabled`;return{[a]:{...Zw(e),display:"inline-flex","&-focused, &:focus":{zIndex:1},[`> input${t}`]:{padding:0},[`> input${t}, > textarea${t}`]:{fontSize:"inherit",border:"none",borderRadius:0,outline:"none",background:"transparent",color:"inherit","&::-ms-reveal":{display:"none"},"&:focus":{boxShadow:"none !important"}},"&::before":{display:"inline-block",width:0,visibility:"hidden",content:'"\\a0"'},[t]:{"&-prefix, &-suffix":{display:"flex",flex:"none",alignItems:"center","> *:not(:last-child)":{marginInlineEnd:e.paddingXS}},"&-show-count-suffix":{color:r,direction:"ltr"},"&-show-count-has-suffix":{marginInlineEnd:e.paddingXXS},"&-prefix":{marginInlineEnd:o},"&-suffix":{marginInlineStart:o},"&-password-icon":{display:"inline-flex",color:i,cursor:"pointer",transition:`all ${n}`,"&:hover":{color:s}}},...b2(e)},[`${t}-underlined`]:{borderRadius:0},[c]:{[`${t}-password-icon`]:{color:i,cursor:"not-allowed","&:hover":{color:i}}}}},C2=e=>{let{componentCls:t,borderRadiusLG:o,borderRadiusSM:r}=e;return{[`${t}-group`]:{...ft(e),...h2(e),"&-rtl":{direction:"rtl"},"&-wrapper":{display:"inline-block",width:"100%",textAlign:"start",verticalAlign:"top","&-rtl":{direction:"rtl"},"&-lg":{[`${t}-group-addon`]:{borderRadius:o,fontSize:e.inputFontSizeLG}},"&-sm":{[`${t}-group-addon`]:{borderRadius:r}},...Hw(e),...Gw(e),[`&:not(${t}-compact-first-item):not(${t}-compact-last-item)${t}-compact-item`]:{[`${t}, ${t}-group-addon`]:{borderRadius:0}},[`&:not(${t}-compact-last-item)${t}-compact-first-item`]:{[`${t}, ${t}-group-addon`]:{borderStartEndRadius:0,borderEndEndRadius:0}},[`&:not(${t}-compact-first-item)${t}-compact-last-item`]:{[`${t}, ${t}-group-addon`]:{borderStartStartRadius:0,borderEndStartRadius:0}},[`&:not(${t}-compact-last-item)${t}-compact-item`]:{[`${t}-affix-wrapper`]:{borderStartEndRadius:0,borderEndEndRadius:0}},[`&:not(${t}-compact-first-item)${t}-compact-item`]:{[`${t}-affix-wrapper`]:{borderStartStartRadius:0,borderEndStartRadius:0}}}}}},S2=e=>{let{componentCls:t}=e;return{[`${t}-out-of-range`]:{[`&, & input, & textarea, ${t}-show-count-suffix, ${t}-data-count`]:{color:e.colorError}}}},wd=Be(["Input","Shared"],e=>{let t=Oe(e,Xn(e));return[x2(t),y2(t)]},Kn,{resetFont:!1}),$d=Be(["Input","Component"],e=>{let t=Oe(e,Xn(e));return[C2(t),S2(t),xi(t,{focus:!0,focusElCls:`${t.componentCls}-affix-wrapper-focused`})]},Kn,{resetFont:!1});var v2=e=>{let{getPrefixCls:t,direction:o}=(0,kl.useContext)(Se),{prefixCls:r,className:n}=e,i=t("input-group",r),s=t("input"),[a,c]=$d(s),l=E(i,c,{[`${i}-lg`]:e.size==="large",[`${i}-sm`]:e.size==="small",[`${i}-compact`]:e.compact,[`${i}-rtl`]:o==="rtl"},a,n),u=(0,kl.useContext)(Fo),f=(0,kl.useMemo)(()=>({...u,isFormItemInput:!1}),[u]);return wx.createElement(Fo.Provider,{value:f},wx.createElement(Ow.Compact,{className:l,style:e.style,onMouseEnter:e.onMouseEnter,onMouseLeave:e.onMouseLeave,onFocus:e.onFocus,onBlur:e.onBlur},e.children))},Jw=v2;var rr=$(require("react"));var To=$(require("react"));function t$(e){return!!(e.addonBefore||e.addonAfter)}function o$(e){return!!(e.prefix||e.suffix||e.allowClear)}function e$(e,t,o){let r=t.cloneNode(!0),n=Object.create(e,{target:{value:r},currentTarget:{value:r}});return r.value=o,typeof t.selectionStart=="number"&&typeof t.selectionEnd=="number"&&(r.selectionStart=t.selectionStart,r.selectionEnd=t.selectionEnd),r.setSelectionRange=(...i)=>{t.setSelectionRange(...i)},n}function Na(e,t,o,r){if(!o)return;let n=t;if(t.type==="click"){n=e$(t,e,""),o(n);return}if(e.type!=="file"&&r!==void 0){n=e$(t,e,r),o(n);return}o(n)}function $x(){return $x=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},$x.apply(this,arguments)}var R2=To.default.forwardRef((e,t)=>{let{inputElement:o,children:r,prefixCls:n,prefix:i,suffix:s,addonBefore:a,addonAfter:c,className:l,style:u,disabled:f,readOnly:d,focused:m,triggerFocus:p,allowClear:g,value:y,handleReset:x,hidden:b,classes:h,classNames:S,dataAttrs:C,styles:R,components:v,onClear:w}=e,T=r??o,I=v?.affixWrapper||"span",P=v?.groupWrapper||"span",N=v?.wrapper||"span",O=v?.groupAddon||"span",_=(0,To.useRef)(null),M=G=>{_.current?.contains(G.target)&&p?.()},A=o$(e),V=(0,To.cloneElement)(T,{value:y,className:E(T.props?.className,!A&&S?.variant)||null}),F=(0,To.useRef)(null);if(To.default.useImperativeHandle(t,()=>({nativeElement:F.current||_.current})),A){let G=null;if(g){let W=!f&&!d&&y&&!(typeof g=="object"&&g.disabled),j=`${n}-clear-icon`,L=typeof g=="object"&&g?.clearIcon?g.clearIcon:"\u2716";G=To.default.createElement("button",{type:"button",onClick:U=>{x?.(U),w?.()},onMouseDown:U=>U.preventDefault(),className:E(j,{[`${j}-hidden`]:!W,[`${j}-has-suffix`]:!!s},S?.clear),style:R?.clear},L)}let z=`${n}-affix-wrapper`,B=E(z,{[`${n}-disabled`]:f,[`${z}-disabled`]:f,[`${z}-focused`]:m,[`${z}-readonly`]:d,[`${z}-input-with-clear-btn`]:s&&g&&y},h?.affixWrapper,S?.affixWrapper,S?.variant),k=(s||g)&&To.default.createElement("span",{className:E(`${n}-suffix`,S?.suffix),style:R?.suffix},G,s);V=To.default.createElement(I,$x({className:B,style:R?.affixWrapper,onClick:M},C?.affixWrapper,{ref:_}),i&&To.default.createElement("span",{className:E(`${n}-prefix`,S?.prefix),style:R?.prefix},i),V,k)}if(t$(e)){let G=`${n}-group`,z=`${G}-addon`,B=`${G}-wrapper`,k=E(`${n}-wrapper`,G,h?.wrapper,S?.wrapper),W=E(B,{[`${B}-disabled`]:f},h?.group,S?.groupWrapper);V=To.default.createElement(P,{className:W,ref:F},To.default.createElement(N,{className:k},a&&To.default.createElement(O,{className:z},a),V,c&&To.default.createElement(O,{className:z},c)))}return To.default.cloneElement(V,{className:E(V.props?.className,l)||null,style:{...V.props?.style,...u},hidden:b})}),Wl=R2;var fo=$(require("react"));var r$=$(require("react"));function jl(e,t){return r$.useMemo(()=>{let o={};t&&(o.show=typeof t=="object"&&t.formatter?t.formatter:!!t),o={...o,...e};let{show:r,...n}=o;return{...n,show:!!r,showFormatter:typeof r=="function"?r:void 0,strategy:n.strategy||(i=>i.length)}},[e,t])}var n$=$(require("react"));function Ul({countConfig:e,value:t,maxLength:o}){return n$.useMemo(()=>{let r=e.max??o,n=e.strategy(t),i=!!r&&n>r,s=Number(r)>0,a=e.show?e.showFormatter?e.showFormatter({value:t,count:n,maxLength:r}):`${n}${s?` / ${r}`:""}`:void 0;return{mergedMax:r,isOutOfRange:i,dataCount:a}},[e,o,t])}var Yn=$(require("react"));function ql({countConfig:e,getTarget:t}){let[o,r]=Yn.useState(null),n=Yn.useRef(t);return Yn.useEffect(()=>{n.current=t},[t]),Yn.useEffect(()=>{o&&(n.current()?.setSelectionRange(...o),r(null))},[o]),Yn.useCallback((s,a)=>{let c=s;return!a&&e.exceedFormatter&&e.max&&e.strategy(s)>e.max&&(c=e.exceedFormatter(s,{max:e.max}),s!==c&&r([n.current()?.selectionStart||0,n.current()?.selectionEnd||0])),c},[e])}function Gl(e,t){let[o,r]=it(e,t),n=o==null?"":String(o);return{value:o,setValue:r,formatValue:n}}function Pd(){return Pd=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Pd.apply(this,arguments)}var E2=(0,fo.forwardRef)((e,t)=>{let{autoComplete:o,onChange:r,onFocus:n,onBlur:i,onPressEnter:s,onKeyDown:a,onKeyUp:c,prefixCls:l="rc-input",disabled:u,htmlSize:f,className:d,maxLength:m,suffix:p,showCount:g,count:y,type:x="text",classes:b,classNames:h,styles:S,onCompositionStart:C,onCompositionEnd:R,...v}=e,[w,T]=(0,fo.useState)(!1),I=(0,fo.useRef)(!1),P=(0,fo.useRef)(!1),N=(0,fo.useRef)(null),O=(0,fo.useRef)(null),_=H=>{N.current&&Bs(N.current,H)},{setValue:M,formatValue:A}=Gl(e.defaultValue,e.value),V=jl(y,g),{isOutOfRange:F,dataCount:G}=Ul({countConfig:V,value:A,maxLength:m}),z=ql({countConfig:V,getTarget:()=>N.current});(0,fo.useImperativeHandle)(t,()=>({focus:_,blur:()=>{N.current?.blur()},setSelectionRange:(H,Q,Z)=>{N.current?.setSelectionRange(H,Q,Z)},select:()=>{N.current?.select()},input:N.current,nativeElement:O.current?.nativeElement||N.current})),(0,fo.useEffect)(()=>{P.current&&(P.current=!1),T(H=>H&&u?!1:H)},[u]);let B=(H,Q,Z)=>{let te=z(Q,I.current);Z.source==="compositionEnd"&&Q===te||(M(te),N.current&&Na(N.current,H,r,te))},k=H=>{B(H,H.target.value,{source:"change"})},W=H=>{I.current=!1,B(H,H.currentTarget.value,{source:"compositionEnd"}),R?.(H)},j=H=>{s&&H.key==="Enter"&&!P.current&&!H.nativeEvent.isComposing&&(P.current=!0,s(H)),a?.(H)},L=H=>{H.key==="Enter"&&(P.current=!1),c?.(H)},U=H=>{T(!0),n?.(H)},X=H=>{P.current&&(P.current=!1),T(!1),i?.(H)},Y=H=>{M(""),_(),N.current&&Na(N.current,H,r)},q=F&&`${l}-out-of-range`,D=()=>{let H=tt(e,["prefixCls","onPressEnter","addonBefore","addonAfter","prefix","suffix","allowClear","defaultValue","showCount","count","classes","htmlSize","styles","classNames","onClear"]);return fo.default.createElement("input",Pd({autoComplete:o},H,{onChange:k,onFocus:U,onBlur:X,onKeyDown:j,onKeyUp:L,className:E(l,{[`${l}-disabled`]:u},h?.input),style:S?.input,ref:N,size:f,type:x,onCompositionStart:Q=>{I.current=!0,C?.(Q)},onCompositionEnd:W}))},K=()=>p||V.show?fo.default.createElement(fo.default.Fragment,null,V.show&&fo.default.createElement("span",{className:E(`${l}-show-count-suffix`,{[`${l}-show-count-has-suffix`]:!!p},h?.count),style:{...S?.count}},G),p):null;return fo.default.createElement(Wl,Pd({},v,{prefixCls:l,className:E(d,q),handleReset:Y,value:A,focused:w,triggerFocus:_,suffix:K(),disabled:u,classes:b,classNames:h,styles:S,ref:O}),D())}),i$=E2;var Oo=$(require("react"));var Mo=$(require("react"));var w2=`
  min-height:0 !important;
  max-height:none !important;
  height:0 !important;
  visibility:hidden !important;
  overflow:hidden !important;
  position:absolute !important;
  z-index:-1000 !important;
  top:0 !important;
  right:0 !important;
  pointer-events: none !important;
`,$2=["letter-spacing","line-height","padding-top","padding-bottom","font-family","font-weight","font-size","font-variant","text-rendering","text-transform","width","text-indent","padding-left","padding-right","border-width","box-sizing","word-break","white-space"],Px={},xr;function P2(e,t=!1){let o=e.getAttribute("id")||e.getAttribute("data-reactid")||e.getAttribute("name");if(t&&Px[o])return Px[o];let r=window.getComputedStyle(e),n=r.getPropertyValue("box-sizing")||r.getPropertyValue("-moz-box-sizing")||r.getPropertyValue("-webkit-box-sizing"),i=parseFloat(r.getPropertyValue("padding-bottom"))+parseFloat(r.getPropertyValue("padding-top")),s=parseFloat(r.getPropertyValue("border-bottom-width"))+parseFloat(r.getPropertyValue("border-top-width")),c={sizingStyle:$2.map(l=>`${l}:${r.getPropertyValue(l)}`).join(";"),paddingSize:i,borderSize:s,boxSizing:n};return t&&o&&(Px[o]=c),c}function Nx(e,t=!1,o=null,r=null){xr||(xr=document.createElement("textarea"),xr.setAttribute("tab-index","-1"),xr.setAttribute("aria-hidden","true"),xr.setAttribute("name","hiddenTextarea"),document.body.appendChild(xr)),e.getAttribute("wrap")?xr.setAttribute("wrap",e.getAttribute("wrap")):xr.removeAttribute("wrap");let{paddingSize:n,borderSize:i,boxSizing:s,sizingStyle:a}=P2(e,t);xr.setAttribute("style",`${a};${w2}`),xr.value=e.value||e.placeholder||"";let c,l,u,f=xr.scrollHeight;if(s==="border-box"?f+=i:s==="content-box"&&(f-=n),o!==null||r!==null){xr.value=" ";let m=xr.scrollHeight-n;o!==null&&(c=m*o,s==="border-box"&&(c=c+n+i),f=Math.max(c,f)),r!==null&&(l=m*r,s==="border-box"&&(l=l+n+i),u=f>l?void 0:"hidden",f=Math.min(l,f))}let d={height:f,overflowY:u,resize:"none"};return c&&(d.minHeight=c),l&&(d.maxHeight=l),d}function Ox(){return Ox=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Ox.apply(this,arguments)}var Ix=0,Tx=1,Mx=2,N2=Mo.forwardRef((e,t)=>{let{prefixCls:o,defaultValue:r,value:n,autoSize:i,onResize:s,className:a,style:c,disabled:l,onChange:u,onInternalAutoSize:f,...d}=e,[m,p]=it(r,n),g=m??"",y=M=>{p(M.target.value),u?.(M)},x=Mo.useRef(null);Mo.useImperativeHandle(t,()=>({textArea:x.current}));let[b,h]=Mo.useMemo(()=>i&&typeof i=="object"?[i.minRows,i.maxRows]:[],[i]),S=!!i,[C,R]=Mo.useState(Mx),[v,w]=Mo.useState(),T=()=>{R(Ix)};qe(()=>{S&&T()},[n,b,h,S]),qe(()=>{if(C===Ix)R(Tx);else if(C===Tx){let M=Nx(x.current,!1,b,h);R(Mx),w(M)}},[C]);let I=Mo.useRef(void 0),P=()=>{I.current!==void 0&&Ge.cancel(I.current)},N=M=>{C===Mx&&(s?.(M),i&&(P(),I.current=Ge(()=>{T()})))};Mo.useEffect(()=>P,[]);let _={...c,...S?v:null};return(C===Ix||C===Tx)&&(_.overflowY="hidden",_.overflowX="hidden"),Mo.createElement(Ir,{onResize:N,disabled:!(i||s)},Mo.createElement("textarea",Ox({},d,{ref:x,style:_,className:E(o,a,{[`${o}-disabled`]:l}),disabled:l,value:g,onChange:y})))}),Ax=N2;function _x(){return _x=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},_x.apply(this,arguments)}var I2=Oo.default.forwardRef(({defaultValue:e,value:t,onFocus:o,onBlur:r,onChange:n,allowClear:i,maxLength:s,onCompositionStart:a,onCompositionEnd:c,suffix:l,prefixCls:u="rc-textarea",showCount:f,count:d,className:m,style:p,disabled:g,hidden:y,classNames:x,styles:b,onResize:h,onClear:S,onPressEnter:C,readOnly:R,autoSize:v,onKeyDown:w,...T},I)=>{let[P,N]=Oo.default.useState(!1),O=Oo.default.useRef(!1),[_,M]=Oo.default.useState(null),A=(0,Oo.useRef)(null),V=(0,Oo.useRef)(null),F=()=>V.current?.textArea||null,{setValue:G,formatValue:z}=Gl(e,t),B=jl(d,f),{isOutOfRange:k,dataCount:W}=Ul({countConfig:B,value:z,maxLength:s}),j=ql({countConfig:B,getTarget:()=>V.current?.textArea||null}),L=()=>{F()?.focus()};(0,Oo.useImperativeHandle)(I,()=>({resizableTextArea:V.current,focus:L,blur:()=>{F()?.blur()},nativeElement:A.current?.nativeElement||F()})),(0,Oo.useEffect)(()=>{N(re=>!g&&re)},[g]);let U=(re,oe)=>{let ae=j(oe,O.current);G(ae),Na(re.currentTarget,re,n,ae)},X=re=>{O.current=!0,a?.(re)},Y=re=>{O.current=!1,U(re,re.currentTarget.value),c?.(re)},q=re=>{U(re,re.target.value)},D=re=>{re.key==="Enter"&&C&&!re.nativeEvent.isComposing&&C(re),w?.(re)},K=re=>{N(!0),o?.(re)},H=re=>{N(!1),r?.(re)},Q=re=>{G(""),L();let oe=F();oe&&Na(oe,re,n)},Z=l;B.show&&(Z=Oo.default.createElement(Oo.default.Fragment,null,Z,Oo.default.createElement("span",{className:E(`${u}-data-count`,x?.count),style:b?.count},W)));let te=re=>{h?.(re),F()?.style.height&&M(!0)},se=!v&&!f&&!i;return Oo.default.createElement(Wl,{ref:A,value:z,allowClear:i,handleReset:Q,suffix:Z,prefixCls:u,classNames:{...x,affixWrapper:E(x?.affixWrapper,{[`${u}-show-count`]:f,[`${u}-textarea-allow-clear`]:i})},disabled:g,focused:P,className:E(m,k&&`${u}-out-of-range`),style:{...p,..._&&!se?{height:"auto"}:{}},dataAttrs:typeof W=="string"?{affixWrapper:{"data-count":W}}:void 0,styles:b,hidden:y,readOnly:R,onClear:S},Oo.default.createElement(Ax,_x({},T,{autoSize:v,maxLength:s,onKeyDown:D,onChange:q,onFocus:K,onBlur:H,onCompositionStart:X,onCompositionEnd:Y,className:E(x?.textarea),style:{resize:p?.resize,...b?.textarea},disabled:g,prefixCls:u,onResize:te,ref:V,readOnly:R})))}),Lx=I2;var s$=i$;var Nd=require("react");function Xl(e,t){let o=(0,Nd.useRef)([]),r=()=>{o.current.push(setTimeout(()=>{e.current?.input&&e.current?.input.getAttribute("type")==="password"&&e.current?.input.hasAttribute("value")&&e.current?.input.removeAttribute("value")}))};return(0,Nd.useEffect)(()=>(t&&r(),()=>o.current.forEach(n=>{n&&clearTimeout(n)})),[t]),r}function a$(e){return!!(e.prefix||e.suffix||e.allowClear||e.showCount)}var T2=(0,rr.forwardRef)((e,t)=>{let{prefixCls:o,bordered:r=!0,status:n,size:i,disabled:s,onBlur:a,onFocus:c,suffix:l,allowClear:u,addonAfter:f,addonBefore:d,className:m,style:p,styles:g,rootClassName:y,onChange:x,classNames:b,variant:h,...S}=e,{getPrefixCls:C,direction:R,allowClear:v,autoComplete:w,className:T,style:I,classNames:P,styles:N}=De("input"),O=C("input",o),_=(0,rr.useRef)(null),M=no(O),[A,V]=wd(O,y);$d(O,M);let{compactSize:F,compactItemClassnames:G}=Ar(O,R),z=kt(ee=>i??F??ee),B=rr.default.useContext(Xt),k=s??B,W={...e,size:z,disabled:k},j=Ee(I),L=Ee(p),[U,X]=je([P,b],[N,j,g,L],{props:W}),{status:Y,hasFeedback:q,feedbackIcon:D}=(0,rr.useContext)(Fo),K=$i(Y,n),H=a$(e)||!!q,Q=(0,rr.useRef)(H),Z=Xl(_,!0),te=ee=>{Z(),a?.(ee)},se=ee=>{Z(),c?.(ee)},re=ee=>{Z(),x?.(ee)},oe=(q||l)&&rr.default.createElement(rr.default.Fragment,null,l,q&&D),ae=ef({allowClear:u,contextAllowClear:v,componentName:"Input"}),[ie,be]=hr("input",h,r);return rr.default.createElement(s$,{ref:gt(t,_),prefixCls:O,autoComplete:w,...S,disabled:k,onBlur:te,onFocus:se,style:X.root,styles:X,suffix:oe,allowClear:ae,className:E(m,y,V,M,G,T,U.root),onChange:re,addonBefore:d&&rr.default.createElement(jn,{form:!0,space:!0},d),addonAfter:f&&rr.default.createElement(jn,{form:!0,space:!0},f),classNames:{...U,input:E({[`${O}-sm`]:z==="small",[`${O}-lg`]:z==="large",[`${O}-rtl`]:R==="rtl"},U.input,A),variant:E({[`${O}-${ie}`]:be},Un(O,K)),affixWrapper:E({[`${O}-affix-wrapper-sm`]:z==="small",[`${O}-affix-wrapper-lg`]:z==="large",[`${O}-affix-wrapper-rtl`]:R==="rtl"},A),wrapper:E({[`${O}-group-rtl`]:R==="rtl"},A),groupWrapper:E({[`${O}-group-wrapper-sm`]:z==="small",[`${O}-group-wrapper-lg`]:z==="large",[`${O}-group-wrapper-rtl`]:R==="rtl",[`${O}-group-wrapper-${ie}`]:be},Un(`${O}-group-wrapper`,K,q),A)}})}),Ti=T2;var jt=$(require("react"));var M2=e=>{let{componentCls:t,paddingXS:o}=e;return{[t]:{display:"inline-flex",alignItems:"center",flexWrap:"nowrap",columnGap:o,[`${t}-input-wrapper`]:{position:"relative",[`${t}-mask-icon`]:{position:"absolute",zIndex:"1",top:"50%",right:"50%",transform:"translate(50%, -50%)",pointerEvents:"none"},[`${t}-mask-input`]:{color:"transparent",caretColor:e.colorText,"&::selection":{color:"transparent"}},[`${t}-mask-input[type=number]::-webkit-inner-spin-button`]:{"-webkit-appearance":"none",margin:0},[`${t}-mask-input[type=number]`]:{"-moz-appearance":"textfield"}},"&-rtl":{direction:"rtl"},[`${t}-input`]:{textAlign:"center",paddingInline:e.paddingXXS},[`&${t}-sm ${t}-input`]:{paddingInline:e.calc(e.paddingXXS).div(2).equal()},[`&${t}-lg ${t}-input`]:{paddingInline:e.paddingXS}}}},l$=Be(["Input","OTP"],e=>{let t=Oe(e,Xn(e));return M2(t)},Kn);var Fr=$(require("react"));var O2="\u2022",A2=Fr.forwardRef((e,t)=>{let{className:o,value:r,onChange:n,onActiveChange:i,index:s,mask:a,onFocus:c,type:l,...u}=e,{getPrefixCls:f}=Fr.useContext(Se),d=f("otp"),m=typeof a=="string"?a:O2,p=Fr.useRef(null);Fr.useImperativeHandle(t,()=>p.current);let g=h=>{n(s,h.target.value)},y=()=>{Ge(()=>{let h=p.current?.input;document.activeElement===h&&h&&h.select()})},x=h=>{c?.(h),y()},b=h=>{let{key:S,ctrlKey:C,metaKey:R}=h;S==="ArrowLeft"?i(s-1):S==="ArrowRight"?i(s+1):S==="z"&&(C||R)?h.preventDefault():S==="Backspace"&&!r&&i(s-1),y()};return Fr.createElement("span",{className:`${d}-input-wrapper`,role:"presentation"},a&&r!==""&&r!==void 0&&Fr.createElement("span",{className:`${d}-mask-icon`,"aria-hidden":"true"},m),Fr.createElement(Ti,{"aria-label":`OTP Input ${s+1}`,...u,type:l??(a?"password":"text"),ref:p,value:r,onInput:g,onFocus:x,onKeyDown:b,onMouseDown:y,onMouseUp:y,className:E(o,{[`${d}-mask-input`]:a})}))}),c$=A2;function Id(e){return(e||"").split("")}var _2=e=>{let{index:t,prefixCls:o,separator:r,className:n,style:i}=e,s=ot(r)?r(t):r;return s?jt.createElement("span",{className:E(`${o}-separator`,n),style:i},s):null},L2=jt.forwardRef((e,t)=>{let{prefixCls:o,length:r=6,size:n,defaultValue:i,value:s,onChange:a,formatter:c,separator:l,variant:u,disabled:f,status:d,autoFocus:m,mask:p,type:g,autoComplete:y,onInput:x,onFocus:b,inputMode:h,classNames:S,styles:C,className:R,style:v,...w}=e,{classNames:T,styles:I,getPrefixCls:P,direction:N,style:O,className:_}=De("otp"),M=P("otp",o),[A]=hr("otp",u,void 0,"input"),V={...e,length:r,variant:A},F=Ee(O),G=Ee(v),[z,B]=je([T,S],[I,F,C,G],{props:V}),k=Ht(w,{aria:!0,data:!0,attr:!0}),[W,j]=l$(M),L=kt(ie=>n??ie),U=jt.useContext(Fo),X=$i(U.status,d),Y=jt.useMemo(()=>({...U,status:X,hasFeedback:!1,feedbackIcon:null}),[U,X]),q=jt.useRef(null),D=jt.useRef({});jt.useImperativeHandle(t,()=>({focus:()=>{D.current[0]?.focus()},blur:()=>{for(let ie=0;ie<r;ie+=1)D.current[ie]?.blur()},nativeElement:q.current}));let K=ie=>c?c(ie):ie,[H,Q]=jt.useState(()=>Id(K(i||"")));jt.useEffect(()=>{s!==void 0&&Q(Id(s))},[s]);let Z=ye(ie=>{Q(ie),x&&x(ie),a&&ie.length===r&&ie.every(be=>be)&&ie.some((be,ee)=>H[ee]!==be)&&a(ie.join(""))}),te=ye((ie,be)=>{let ee=Rt(H);for(let fe=0;fe<ie;fe+=1)ee[fe]||(ee[fe]="");be.length<=1?ee[ie]=be:ee=ee.slice(0,ie).concat(Id(be)),ee=ee.slice(0,r);for(let fe=ee.length-1;fe>=0&&!ee[fe];fe-=1)ee.pop();let xe=K(ee.map(fe=>fe||" ").join(""));return ee=Id(xe).map((fe,_e)=>fe===" "&&!ee[_e]?ee[_e]:fe),ee}),se=(ie,be)=>{let ee=te(ie,be),xe=Math.min(ie+be.length,r-1);xe!==ie&&ee[ie]!==void 0&&D.current[xe]?.focus(),Z(ee)},re=ie=>{D.current[ie]?.focus()},oe=(ie,be)=>{for(let ee=0;ee<be;ee+=1)if(!D.current[ee]?.input?.value){D.current[ee]?.focus();break}b?.(ie)},ae={variant:A,disabled:f,status:X,mask:p,type:g,inputMode:h,autoComplete:y};return jt.createElement("div",{...k,ref:q,className:E(R,M,{[`${M}-sm`]:L==="small",[`${M}-lg`]:L==="large",[`${M}-rtl`]:N==="rtl"},j,W,_,z.root),style:B.root,role:"group"},jt.createElement(Fo.Provider,{value:Y},Array.from({length:r}).map((ie,be)=>{let ee=`otp-${be}`,xe=H[be]||"";return jt.createElement(jt.Fragment,{key:ee},jt.createElement(c$,{ref:fe=>{D.current[be]=fe},index:be,size:L,htmlSize:1,className:E(z.input,`${M}-input`),style:B.input,onChange:se,value:xe,onActiveChange:re,autoFocus:be===0&&m,onFocus:fe=>oe(fe,be),...ae}),be<r-1&&jt.createElement(_2,{separator:l,index:be,prefixCls:M,className:E(z.separator),style:B.separator}))})))}),u$=L2;var nr=$(require("react")),Od=require("react");var Td=$(require("react"));var D2={icon:{tag:"svg",attrs:{viewBox:"64 64 896 896",focusable:"false"},children:[{tag:"path",attrs:{d:"M942.2 486.2Q889.47 375.11 816.7 305l-50.88 50.88C807.31 395.53 843.45 447.4 874.7 512 791.5 684.2 673.4 766 512 766q-72.67 0-133.87-22.38L323 798.75Q408 838 512 838q288.3 0 430.2-300.3a60.29 60.29 0 000-51.5zm-63.57-320.64L836 122.88a8 8 0 00-11.32 0L715.31 232.2Q624.86 186 512 186q-288.3 0-430.2 300.3a60.3 60.3 0 000 51.5q56.69 119.4 136.5 191.41L112.48 835a8 8 0 000 11.31L155.17 889a8 8 0 0011.31 0l712.15-712.12a8 8 0 000-11.32zM149.3 512C232.6 339.8 350.7 258 512 258c54.54 0 104.13 9.36 149.12 28.39l-70.3 70.3a176 176 0 00-238.13 238.13l-83.42 83.42C223.1 637.49 183.3 582.28 149.3 512zm246.7 0a112.11 112.11 0 01146.2-106.69L401.31 546.2A112 112 0 01396 512z"}},{tag:"path",attrs:{d:"M508 624c-3.46 0-6.87-.16-10.25-.47l-52.82 52.82a176.09 176.09 0 00227.42-227.42l-52.82 52.82c.31 3.38.47 6.79.47 10.25a111.94 111.94 0 01-112 112z"}}]},name:"eye-invisible",theme:"outlined"},f$=D2;function Dx(){return Dx=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Dx.apply(this,arguments)}var F2=(e,t)=>Td.createElement(Kt,Dx({},e,{ref:t,icon:f$})),z2=Td.forwardRef(F2),d$=z2;var Md=$(require("react"));var B2={icon:{tag:"svg",attrs:{viewBox:"64 64 896 896",focusable:"false"},children:[{tag:"path",attrs:{d:"M942.2 486.2C847.4 286.5 704.1 186 512 186c-192.2 0-335.4 100.5-430.2 300.3a60.3 60.3 0 000 51.5C176.6 737.5 319.9 838 512 838c192.2 0 335.4-100.5 430.2-300.3 7.7-16.2 7.7-35 0-51.5zM512 766c-161.3 0-279.4-81.8-362.7-254C232.6 339.8 350.7 258 512 258c161.3 0 279.4 81.8 362.7 254C791.5 684.2 673.4 766 512 766zm-4-430c-97.2 0-176 78.8-176 176s78.8 176 176 176 176-78.8 176-176-78.8-176-176-176zm0 288c-61.9 0-112-50.1-112-112s50.1-112 112-112 112 50.1 112 112-50.1 112-112 112z"}}]},name:"eye",theme:"outlined"},m$=B2;function Fx(){return Fx=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Fx.apply(this,arguments)}var V2=(e,t)=>Md.createElement(Kt,Fx({},e,{ref:t,icon:m$})),H2=Md.forwardRef(V2),p$=H2;var k2=e=>e?nr.createElement(p$,null):nr.createElement(d$,null),W2={click:"onClick",hover:"onMouseOver"},j2=nr.forwardRef((e,t)=>{let{disabled:o,action:r="click",visibilityToggle:n=!0,iconRender:i,prefixCls:s,inputPrefixCls:a,suffix:c,className:l,style:u,classNames:f,styles:d,variant:m,...p}=e,{getPrefixCls:g,className:y,style:x,classNames:b,styles:h,iconRender:S}=De("inputPassword"),[C]=hr("inputPassword",m,e.bordered,"input"),[R]=$o("global"),v=nr.useContext(Xt),w=o??v,T={...e,disabled:w,variant:C},I=Ee(x),P=Ee(u),[N,O]=je([b,f],[h,I,d,P],{props:T}),_=ze(n)&&n.visible!==void 0,[M,A]=(0,Od.useState)(()=>_?n.visible:!1),V=(0,Od.useRef)(null);nr.useEffect(()=>{_&&A(n.visible)},[_,n]);let F=Xl(V),G=()=>{if(w)return;M&&F();let U=!M;_||A(U),ze(n)&&n.onVisibleChange?.(U)},z=U=>{let X=W2[r]||"",q=(i||S||k2)(M),D=ze(n)?n.tabIndex:void 0;return nr.createElement("span",{key:"passwordIcon",role:"button",tabIndex:w?-1:D??0,className:`${U}-icon`,"aria-disabled":w,"aria-pressed":M,"aria-label":M?R.hide:R.show,onMouseDown:K=>{K.preventDefault()},onMouseUp:K=>{K.preventDefault()},onKeyDown:K=>{(K.key==="Enter"||K.key===" ")&&(K.preventDefault(),K.repeat||G())},[X]:G},q)},B=g("input",a),k=g("input-password",s),W=n&&z(k),j=E(k,y,l,{[`${k}-${e.size}`]:!!e.size}),L={...p,type:M?"text":"password",prefixCls:B,suffix:nr.createElement(nr.Fragment,null,W,c),disabled:w,className:j,classNames:N,styles:O,variant:C};return nr.createElement(Ti,{ref:gt(t,V),...L})}),g$=j2;var zr=$(require("react"));var U2=e=>{let{componentCls:t,antCls:o,calc:r,max:n}=e,i=`${t}-btn`,[s,a]=Mt(o,"input-search"),c=e.inputFontSizeSM??e.fontSize,l=n(e.controlHeightSM,r(c).mul(e.lineHeight).add(r(e.paddingBlockSM).mul(2)).add(r(e.lineWidth).mul(2)).equal());return{[t]:{[s("btn-height")]:J(e.controlHeight),width:"100%",[i]:{height:a("btn-height"),"&:focus-visible":{zIndex:5},[`&${o}-btn-icon-only`]:{width:a("btn-height")},"&-filled":{background:e.colorFillTertiary,"&:not(:disabled)":{"&:hover":{background:e.colorFillSecondary},"&:active":{background:e.colorFill}}}},[`&${t}-large`]:{[s("btn-height")]:J(e.controlHeightLG)},[`&${t}-small`]:{[s("btn-height")]:J(e.controlHeightSM)},[`&${t}-small ${i}`]:{minHeight:l,[`&${e.antCls}-btn-icon-only`]:{minWidth:l}}}}},h$=Be(["Input","Search"],e=>{let t=Oe(e,Xn(e));return U2(t)},Kn);var q2=zr.forwardRef((e,t)=>{let{prefixCls:o,inputPrefixCls:r,className:n,size:i,style:s,enterButton:a=!1,searchIcon:c,addonAfter:l,loading:u,disabled:f,onSearch:d,onChange:m,onCompositionStart:p,onCompositionEnd:g,variant:y,onPressEnter:x,classNames:b,styles:h,hidden:S,...C}=e,{direction:R,getPrefixCls:v,className:w,style:T,classNames:I,styles:P,searchIcon:N}=De("inputSearch"),O=zr.useContext(Xt),_=f??O,[M,,A]=hr("inputSearch",y,e.bordered),V=A?M:void 0,[F]=hr("inputSearch",y,e.bordered,"input"),G={...e,enterButton:a,variant:V},z=Ee(T),B=Ee(s),[k,W]=je([I,b],[P,z,h,B],{props:G},{button:{_default:"root"}}),j=zr.useRef(!1),L=v("input-search",o),U=v("input",r),[X,Y]=h$(L),{compactSize:q}=Ar(L,R),D=kt(ue=>i??q??ue),K=zr.useRef(null),H=ue=>{ue?.target&&ue.type==="click"&&d&&d(ue.target.value,ue,{source:"clear"}),m?.(ue)},Q=ue=>{document.activeElement===K.current?.input&&ue.preventDefault()},Z=ue=>{d&&d(K.current?.input?.value,ue,{source:"input"})},te=ue=>{j.current||u||(x?.(ue),Z(ue))},se=typeof a=="boolean"?Lt(c,N,zr.createElement(Rd,null)):null,re=`${L}-btn`,oe=E(re,{[`${re}-${V}`]:V}),ae,ie=a||{},be=ie.type&&ie.type.__ANT_BUTTON===!0;if(be||ie.type==="button"){let ue=ie.props;ae=Qo(ie,{disabled:_||ue.disabled||!be&&u,onMouseDown:He=>{ue.onMouseDown?.(He),Q(He)},onClick:He=>{ie?.props?.onClick?.(He),Z(He)},key:"enterButton",...be?{className:E(oe,ue.className),loading:u||ue.loading,size:D}:{}})}else ae=zr.createElement(bn,{classNames:k.button,styles:W.button,className:oe,color:a?"primary":"default",size:D,disabled:f,key:"enterButton",onMouseDown:Q,onClick:Z,loading:u,icon:se,variant:V==="borderless"||V==="filled"||V==="underlined"?"text":a?"solid":void 0},a);l&&(ae=[ae,Qo(l,{key:"addonAfter"})]);let ee=E(L,Y,{[`${L}-rtl`]:R==="rtl",[`${L}-${D}`]:!!D,[`${L}-with-button`]:!!a},n,w,X,k.root),xe=ue=>{j.current=!0,p?.(ue)},fe=ue=>{j.current=!1,g?.(ue)},_e=Ht(C,{data:!0}),Ve=tt({...C,classNames:tt(k,["button","root"]),styles:tt(W,["button","root"]),prefixCls:U,type:"search",size:D,variant:F,onPressEnter:te,onCompositionStart:xe,onCompositionEnd:fe,onChange:H,disabled:f},Object.keys(_e));return zr.createElement(lf,{className:ee,style:W.root,..._e,hidden:S},zr.createElement(Ti,{ref:gt(K,t),...Ve}),ae)}),x$=q2;var br=$(require("react")),y$=require("react");var G2=e=>{let{componentCls:t,paddingLG:o}=e,r=`${t}-textarea`;return{[`textarea${t}`]:{maxWidth:"100%",height:"auto",minHeight:e.controlHeight,lineHeight:e.lineHeight,verticalAlign:"bottom",transition:`all ${e.motionDurationSlow}`,resize:"vertical","@media (hover: none) and (pointer: coarse)":{resize:"none"},[`&${t}-mouse-active`]:{transition:`all ${e.motionDurationSlow}, height 0s, width 0s`}},[`${t}-textarea-affix-wrapper-resize-dirty`]:{width:"auto"},[r]:{position:"relative","&-show-count":{[`${t}-data-count`]:{position:"absolute",bottom:e.calc(e.fontSize).mul(e.lineHeight).mul(-1).equal(),insetInlineEnd:0,color:e.colorTextDescription,whiteSpace:"nowrap",pointerEvents:"none"}},[`
        &-allow-clear > ${t},
        &-affix-wrapper${r}-has-feedback ${t}
      `]:{paddingInlineEnd:o},[`&-affix-wrapper${t}-affix-wrapper`]:{padding:0,[`> textarea${t}`]:{fontSize:"inherit",border:"none",outline:"none",background:"transparent",minHeight:e.calc(e.controlHeight).sub(e.calc(e.lineWidth).mul(2)).equal(),"&:focus":{boxShadow:"none !important"}},[`${t}-suffix`]:{margin:0,"> *:not(:last-child)":{marginInline:0},[`${t}-clear-icon`]:{position:"absolute",insetInlineEnd:e.paddingInline,insetBlockStart:e.paddingXS},[`${r}-suffix`]:{position:"absolute",top:0,insetInlineEnd:e.paddingInline,bottom:0,zIndex:1,display:"inline-flex",alignItems:"center",margin:"auto",pointerEvents:"none"}}},[`&-affix-wrapper${t}-affix-wrapper-rtl`]:{[`${t}-suffix`]:{[`${t}-data-count`]:{direction:"ltr",insetInlineStart:0}}},[`&-affix-wrapper${t}-affix-wrapper-sm`]:{[`${t}-suffix`]:{[`${t}-clear-icon`]:{insetInlineEnd:e.paddingInlineSM}}}}}},b$=Be(["Input","TextArea"],e=>{let t=Oe(e,Xn(e));return G2(t)},Kn,{resetFont:!1});var X2=(0,y$.forwardRef)((e,t)=>{let{prefixCls:o,bordered:r=!0,size:n,disabled:i,status:s,allowClear:a,classNames:c,rootClassName:l,className:u,style:f,styles:d,variant:m,showCount:p,onMouseDown:g,onResize:y,...x}=e,{getPrefixCls:b,direction:h,allowClear:S,autoComplete:C,className:R,style:v,classNames:w,styles:T}=De("textArea"),I=br.useContext(Xt),P=i??I,{status:N,hasFeedback:O,feedbackIcon:_}=br.useContext(Fo),M=$i(N,s),A=Ee(v),V=Ee(f),[F,G]=je([w,c],[T,A,d,V],{props:e}),z=br.useRef(null);br.useImperativeHandle(t,()=>({resizableTextArea:z.current?.resizableTextArea,focus:re=>{Bs(z.current?.resizableTextArea?.textArea,re)},blur:()=>z.current?.blur(),nativeElement:z.current?.nativeElement||null}));let B=b("input",o),k=no(B),[W,j]=wd(B,l);b$(B,k);let{compactSize:L,compactItemClassnames:U}=Ar(B,h),X=kt(re=>n??L??re),[Y,q]=hr("textArea",m,r),D=ef({allowClear:a,contextAllowClear:S,componentName:"TextArea"}),[K,H]=br.useState(!1),[Q,Z]=br.useState(!1),te=re=>{H(!0),g?.(re);let oe=()=>{H(!1),document.removeEventListener("mouseup",oe)};document.addEventListener("mouseup",oe)},se=re=>{if(y?.(re),K&&ot(getComputedStyle)){let oe=z.current?.nativeElement?.querySelector("textarea");oe&&getComputedStyle(oe).resize==="both"&&Z(!0)}};return br.createElement(Lx,{autoComplete:C,...x,style:G.root,styles:G,disabled:P,allowClear:D,className:E(j,k,u,l,U,R,F.root,{[`${B}-textarea-affix-wrapper-resize-dirty`]:Q}),classNames:{...F,textarea:E({[`${B}-sm`]:X==="small",[`${B}-lg`]:X==="large"},W,F.textarea,K&&`${B}-mouse-active`),variant:E({[`${B}-${Y}`]:q},Un(B,M)),affixWrapper:E(`${B}-textarea-affix-wrapper`,{[`${B}-affix-wrapper-rtl`]:h==="rtl",[`${B}-affix-wrapper-sm`]:X==="small",[`${B}-affix-wrapper-lg`]:X==="large",[`${B}-textarea-show-count`]:p||e.count?.show},W)},prefixCls:B,suffix:O&&br.createElement("span",{className:`${B}-textarea-suffix`},_),showCount:p,ref:z,onResize:se,onMouseDown:te})}),C$=X2;var Ia=Ti;Ia.Group=Jw;Ia.Search=x$;Ia.TextArea=C$;Ia.Password=g$;Ia.OTP=u$;var S$=Ia;var Ao=$(require("react"));var Ss=$(require("react"));var Y2=$(require("react"));var Kl=require("react"),zx={percent:0,prefixCls:"rc-progress",strokeColor:"#2db7f5",strokeLinecap:"round",strokeWidth:1,railColor:"#D9D9D9",railWidth:1,gapPosition:"bottom",loading:!1},Bx=()=>{let e=(0,Kl.useRef)([]),t=(0,Kl.useRef)(null);return(0,Kl.useEffect)(()=>{let o=Date.now(),r=!1;e.current.forEach(n=>{if(!n)return;r=!0;let i=n.style;i.transitionDuration=".3s, .3s, .3s, .06s",t.current&&o-t.current<100&&(i.transitionDuration="0s, 0s")}),r&&(t.current=Date.now())}),e.current};var K2=$(require("react"));var Yl=$(require("react"));var Br=$(require("react"));var v$=({bg:e,children:t})=>Br.createElement("div",{style:{width:"100%",height:"100%",background:e}},t);function R$(e,t){return Object.keys(e).map(o=>{let r=parseFloat(o),n=`${Math.floor(r*t)}%`;return`${e[o]} ${n}`})}var Q2=Br.forwardRef((e,t)=>{let{prefixCls:o,color:r,gradientId:n,radius:i,className:s,style:a,ptg:c,strokeLinecap:l,strokeWidth:u,size:f,gapDegree:d}=e,m=r&&typeof r=="object",p=m?"#FFF":void 0,g=f/2,y=Br.createElement("circle",{className:E(`${o}-circle-path`,s),r:i,cx:g,cy:g,stroke:p,strokeLinecap:l,strokeWidth:u,opacity:c===0?0:1,style:a,ref:t});if(!m)return y;let x=`${n}-conic`,b=d?`${180+d/2}deg`:"0deg",h=R$(r,(360-d)/360),S=R$(r,1),C=`conic-gradient(from ${b}, ${h.join(", ")})`,R=`linear-gradient(to ${d?"bottom":"top"}, ${S.join(", ")})`;return Br.createElement(Br.Fragment,null,Br.createElement("mask",{id:x},y),Br.createElement("foreignObject",{x:0,y:0,width:f,height:f,mask:`url(#${x})`},Br.createElement(v$,{bg:R},Br.createElement(v$,{bg:C}))))}),E$=Q2;var Ad=(e,t,o,r,n,i,s,a,c,l,u=0)=>{let f=o/100*360*((360-i)/360),d=i===0?0:{bottom:0,top:180,left:90,right:-90}[s],m=(100-r)/100*t;c==="round"&&r!==100&&(m+=l/2,m>=t&&(m=t-.01));let p=100/2;return{stroke:typeof a=="string"?a:void 0,strokeDasharray:`${t}px ${e}`,strokeDashoffset:m+u,transform:`rotate(${n+f+d}deg)`,transformOrigin:`${p}px ${p}px`,transition:"stroke-dashoffset .3s ease 0s, stroke-dasharray .3s ease 0s, stroke .3s, stroke-width .06s ease .3s, opacity .3s ease 0s",fillOpacity:0}};var w$=$(require("react")),$$=(({id:e,loading:t})=>{if(!t)return{indeterminateStyleProps:{},indeterminateStyleAnimation:null};let o=`${e}-indeterminate-animate`;return{indeterminateStyleProps:{transform:"rotate(0deg)",animation:`${o} 1s linear infinite`},indeterminateStyleAnimation:w$.default.createElement("style",null,`@keyframes ${o} {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }`)}});function Vx(){return Vx=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Vx.apply(this,arguments)}function P$(e){let t=e??[];return Array.isArray(t)?t:[t]}var Z2=e=>{let{id:t,prefixCls:o,classNames:r={},styles:n={},steps:i,strokeWidth:s,railWidth:a,gapDegree:c=0,gapPosition:l,railColor:u,strokeLinecap:f,style:d,className:m,strokeColor:p,percent:g,loading:y,...x}={...zx,...e},b=100/2,h=xo(t),S=`${h}-gradient`,C=b-s/2,R=Math.PI*2*C,v=c>0?90+c/2:-90,w=R*((360-c)/360),{count:T,gap:I}=typeof i=="object"?i:{count:i,gap:2},P=P$(g),N=P$(p),O=N.find(k=>k&&typeof k=="object"),M=O&&typeof O=="object"?"butt":f,{indeterminateStyleProps:A,indeterminateStyleAnimation:V}=$$({id:h,loading:y}),F=Ad(R,w,0,100,v,c,l,u,M,s),G=Bx(),z=()=>{let k=0;return P.map((W,j)=>{let L=N[j]||N[N.length-1],U=Ad(R,w,k,W,v,c,l,L,M,s);return k+=W,Yl.createElement(E$,{key:j,color:L,ptg:W,radius:C,prefixCls:o,gradientId:S,className:r.track,style:{...U,...A,...n.track},strokeLinecap:M,strokeWidth:s,gapDegree:c,ref:X=>{G[j]=X},size:100})}).reverse()},B=()=>{let k=Math.round(T*(P[0]/100)),W=100/T,j=0;return new Array(T).fill(null).map((L,U)=>{let X=U<=k-1?N[0]:u,Y=X&&typeof X=="object"?`url(#${S})`:void 0,q=Ad(R,w,j,W,v,c,l,X,"butt",s,I);return j+=(w-q.strokeDashoffset+I)*100/w,Yl.createElement("circle",{key:U,className:E(`${o}-circle-path`,r.track),r:C,cx:b,cy:b,stroke:Y,strokeWidth:s,opacity:1,style:{...q,...n.track},ref:D=>{G[U]=D}})})};return Yl.createElement("svg",Vx({className:E(`${o}-circle`,r.root,m),viewBox:`0 0 ${100} ${100}`,style:{...n.root,...d},id:t,role:"presentation"},x),!T&&Yl.createElement("circle",{className:E(`${o}-circle-rail`,r.rail),r:C,cx:b,cy:b,stroke:u,strokeLinecap:M,strokeWidth:a||s,style:{...F,...n.rail}}),T?B():z(),V)},Hx=Z2;var mo=$(require("react"));var N$=$(require("react")),J2=e=>{let{children:t,prefixCls:o,id:r,classNames:n,styles:i,className:s,style:a}=e;return N$.createElement("div",{id:r,className:E(`${o}-container`,n?.container,s),style:{...i?.container,...a},role:"tooltip"},typeof t=="function"?t():t)},Ql=J2;var sn=$(require("react")),Ld=require("react");var Ta={shiftX:64,adjustY:1},Ma={adjustX:1,shiftY:!0},Vr=[0,0],I$={left:{points:["cr","cl"],overflow:Ma,offset:[-4,0],targetOffset:Vr},right:{points:["cl","cr"],overflow:Ma,offset:[4,0],targetOffset:Vr},top:{points:["bc","tc"],overflow:Ta,offset:[0,-4],targetOffset:Vr},bottom:{points:["tc","bc"],overflow:Ta,offset:[0,4],targetOffset:Vr},topLeft:{points:["bl","tl"],overflow:Ta,offset:[0,-4],targetOffset:Vr},leftTop:{points:["tr","tl"],overflow:Ma,offset:[-4,0],targetOffset:Vr},topRight:{points:["br","tr"],overflow:Ta,offset:[0,-4],targetOffset:Vr},rightTop:{points:["tl","tr"],overflow:Ma,offset:[4,0],targetOffset:Vr},bottomRight:{points:["tr","br"],overflow:Ta,offset:[0,4],targetOffset:Vr},rightBottom:{points:["bl","br"],overflow:Ma,offset:[4,0],targetOffset:Vr},bottomLeft:{points:["tl","bl"],overflow:Ta,offset:[0,4],targetOffset:Vr},leftBottom:{points:["br","bl"],overflow:Ma,offset:[-4,0],targetOffset:Vr}};function kx(){return kx=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},kx.apply(this,arguments)}var e_=sn.forwardRef((e,t)=>{let{trigger:o=["hover","focus"],mouseEnterDelay:r=0,mouseLeaveDelay:n=.1,prefixCls:i="rc-tooltip",children:s,onVisibleChange:a,afterVisibleChange:c,motion:l,placement:u="right",align:f={},destroyOnHidden:d=!1,defaultVisible:m,getTooltipContainer:p,arrowContent:g,overlay:y,id:x,showArrow:b=!0,classNames:h,styles:S,...C}=e,R=xo(x),v=(0,Ld.useRef)(null);(0,Ld.useImperativeHandle)(t,()=>v.current);let w={...C};"visible"in e&&(w.popupVisible=e.visible);let T=sn.useMemo(()=>{if(!b)return!1;let P=b===!0?{}:b;return{...P,className:E(P.className,h?.arrow),style:{...P.style,...S?.arrow},content:P.content??g}},[b,h?.arrow,S?.arrow,g]),I=({open:P})=>{let N=sn.Children.only(s),M={"aria-describedby":[N.props["aria-describedby"],y&&P?R:void 0].filter(Boolean).join(" ")||void 0};return sn.cloneElement(N,M)};return sn.createElement(Eu,kx({popupClassName:h?.root,prefixCls:i,popup:sn.createElement(Ql,{key:"content",prefixCls:i,id:R,classNames:h,styles:S},y),action:o,builtinPlacements:I$,popupPlacement:u,ref:v,popupAlign:f,getPopupContainer:p,onOpenChange:a,afterOpenChange:c,popupMotion:l,defaultPopupVisible:m,autoDestroy:d,mouseLeaveDelay:n,popupStyle:S?.root,mouseEnterDelay:r,arrow:T,uniqueContainerClassName:h?.uniqueContainer,uniqueContainerStyle:S?.uniqueContainer},w),I)}),T$=e_;var M$=T$;function O$(e){let{sizePopupArrow:t,borderRadiusXS:o,borderRadiusOuter:r}=e,n=t/2,i=0,s=n,a=r*1/Math.sqrt(2),c=n-r*(1-1/Math.sqrt(2)),l=n-o*(1/Math.sqrt(2)),u=r*(Math.sqrt(2)-1)+o*(1/Math.sqrt(2)),f=2*n-l,d=u,m=2*n-a,p=c,g=2*n-i,y=s,x=n*Math.sqrt(2)+r*(Math.sqrt(2)-2),b=r*(Math.sqrt(2)-1),h=`polygon(${b}px 100%, 50% ${b}px, ${2*n-b}px 100%, ${b}px 100%)`,S=`path('M ${i} ${s} A ${r} ${r} 0 0 0 ${a} ${c} L ${l} ${u} A ${o} ${o} 0 0 1 ${f} ${d} L ${m} ${p} A ${r} ${r} 0 0 0 ${g} ${y} Z')`;return{arrowShadowWidth:x,arrowPath:S,arrowPolygon:h}}var A$=(e,t,o)=>{let{sizePopupArrow:r,arrowPolygon:n,arrowPath:i,arrowShadowWidth:s,borderRadiusXS:a,calc:c}=e,l={content:'""',position:"absolute",width:s,height:s,bottom:0,insetInline:0,margin:"auto",borderRadius:{_skip_check_:!0,value:`0 0 ${J(a)} 0`},transform:"translateY(50%) rotate(-135deg)",zIndex:0,background:"transparent"};return o&&(l.boxShadow=o),{pointerEvents:"none",width:r,height:r,overflow:"hidden","&::before":{position:"absolute",bottom:0,insetInlineStart:0,width:r,height:c(r).div(2).equal(),background:t,clipPath:{_multi_value_:!0,value:[n,i]},content:'""'},"&::after":l}};var Wx=8;function Dd(e){let{contentRadius:t,limitVerticalRadius:o}=e,r=t>12?t+2:12;return{arrowOffsetHorizontal:r,arrowOffsetVertical:o?Wx:r}}var t_=(e,t,o)=>{let{componentCls:r,boxShadowPopoverArrow:n,arrowOffsetVertical:i,arrowOffsetHorizontal:s,antCls:a}=e,[c]=Mt(a,"tooltip"),{arrowDistance:l=0,arrowShadow:u=!0}=o||{};return{[r]:{[`${r}-arrow`]:[{position:"absolute",zIndex:1,display:"block",...A$(e,t,u?n:!1),"&:before":{background:t}}],[[`&-placement-top > ${r}-arrow`,`&-placement-topLeft > ${r}-arrow`,`&-placement-topRight > ${r}-arrow`].join(",")]:{bottom:l,transform:"translateY(100%) rotate(180deg)"},[`&-placement-top > ${r}-arrow`]:{left:{_skip_check_:!0,value:"50%"},transform:"translateX(-50%) translateY(100%) rotate(180deg)"},"&-placement-topLeft":{[c("arrow-offset-x")]:s,[`> ${r}-arrow`]:{left:{_skip_check_:!0,value:s}}},"&-placement-topRight":{[c("arrow-offset-x")]:`calc(100% - ${J(s)})`,[`> ${r}-arrow`]:{right:{_skip_check_:!0,value:s}}},[[`&-placement-bottom > ${r}-arrow`,`&-placement-bottomLeft > ${r}-arrow`,`&-placement-bottomRight > ${r}-arrow`].join(",")]:{top:l,transform:"translateY(-100%)"},[`&-placement-bottom > ${r}-arrow`]:{left:{_skip_check_:!0,value:"50%"},transform:"translateX(-50%) translateY(-100%)"},"&-placement-bottomLeft":{[c("arrow-offset-x")]:s,[`> ${r}-arrow`]:{left:{_skip_check_:!0,value:s}}},"&-placement-bottomRight":{[c("arrow-offset-x")]:`calc(100% - ${J(s)})`,[`> ${r}-arrow`]:{right:{_skip_check_:!0,value:s}}},[[`&-placement-left > ${r}-arrow`,`&-placement-leftTop > ${r}-arrow`,`&-placement-leftBottom > ${r}-arrow`].join(",")]:{right:{_skip_check_:!0,value:l},transform:"translateX(100%) rotate(90deg)"},[`&-placement-left > ${r}-arrow`]:{top:{_skip_check_:!0,value:"50%"},transform:"translateY(-50%) translateX(100%) rotate(90deg)"},[`&-placement-leftTop > ${r}-arrow`]:{top:i},[`&-placement-leftBottom > ${r}-arrow`]:{bottom:i},[[`&-placement-right > ${r}-arrow`,`&-placement-rightTop > ${r}-arrow`,`&-placement-rightBottom > ${r}-arrow`].join(",")]:{left:{_skip_check_:!0,value:l},transform:"translateX(-100%) rotate(-90deg)"},[`&-placement-right > ${r}-arrow`]:{top:{_skip_check_:!0,value:"50%"},transform:"translateY(-50%) translateX(-100%) rotate(-90deg)"},[`&-placement-rightTop > ${r}-arrow`]:{top:i},[`&-placement-rightBottom > ${r}-arrow`]:{bottom:i}}}},_$=t_;function o_(e,t,o,r){if(r===!1)return{adjustX:!1,adjustY:!1};let n=ze(r)?r:{},i={};switch(e){case"top":case"bottom":i.shiftX=t.arrowOffsetHorizontal*2+o,i.shiftY=!0,i.adjustY=!0;break;case"left":case"right":i.shiftY=t.arrowOffsetVertical*2+o,i.shiftX=!0,i.adjustX=!0;break}let s={...i,...n};return s.shiftX||(s.adjustX=!0),s.shiftY||(s.adjustY=!0),s}var L$={left:{points:["cr","cl"]},right:{points:["cl","cr"]},top:{points:["bc","tc"]},bottom:{points:["tc","bc"]},topLeft:{points:["bl","tl"]},leftTop:{points:["tr","tl"]},topRight:{points:["br","tr"]},rightTop:{points:["tl","tr"]},bottomRight:{points:["tr","br"]},rightBottom:{points:["bl","br"]},bottomLeft:{points:["tl","bl"]},leftBottom:{points:["br","bl"]}},r_={topLeft:{points:["bl","tc"]},leftTop:{points:["tr","cl"]},topRight:{points:["br","tc"]},rightTop:{points:["tl","cr"]},bottomRight:{points:["tr","bc"]},rightBottom:{points:["bl","cr"]},bottomLeft:{points:["tl","bc"]},leftBottom:{points:["br","cl"]}},n_=new Set(["topLeft","topRight","bottomLeft","bottomRight","leftTop","leftBottom","rightTop","rightBottom"]);function jx(e){let{arrowWidth:t,autoAdjustOverflow:o,arrowPointAtCenter:r,offset:n,borderRadius:i,visibleFirst:s}=e,a=t/2,c={},l=Dd({contentRadius:i,limitVerticalRadius:!0});return Object.keys(L$).forEach(u=>{let d={...r&&r_[u]||L$[u],offset:[0,0],dynamicInset:!0};switch(c[u]=d,n_.has(u)&&(d.autoArrow=!1),u){case"top":case"topLeft":case"topRight":d.offset[1]=-a-n;break;case"bottom":case"bottomLeft":case"bottomRight":d.offset[1]=a+n;break;case"left":case"leftTop":case"leftBottom":d.offset[0]=-a-n;break;case"right":case"rightTop":case"rightBottom":d.offset[0]=a+n;break}if(r)switch(u){case"topLeft":case"bottomLeft":d.offset[0]=-l.arrowOffsetHorizontal-a;break;case"topRight":case"bottomRight":d.offset[0]=l.arrowOffsetHorizontal+a;break;case"leftTop":case"rightTop":d.offset[1]=-l.arrowOffsetHorizontal*2+a;break;case"leftBottom":case"rightBottom":d.offset[1]=l.arrowOffsetHorizontal*2-a;break}d.overflow=o_(u,l,t,o),s&&(d.htmlRegion="visibleFirst")}),c}var D$=$(require("react")),i_=D$.default.createContext(!1),F$=i_;var z$=$(require("react")),s_=(e,t)=>{let o=r=>typeof r=="boolean"?{show:r}:r||{};return z$.default.useMemo(()=>{let r=o(e),n=o(t);return{...n,...r,show:r.show??n.show??!0}},[e,t])},B$=s_;var Mi=$(require("react"));var V$="50%",a_=e=>{let{calc:t,componentCls:o,tooltipMaxWidth:r,tooltipColor:n,tooltipBg:i,tooltipBorderRadius:s,zIndexPopup:a,controlHeight:c,dropShadowPopover:l,paddingSM:u,paddingXS:f,arrowOffsetHorizontal:d,sizePopupArrow:m,antCls:p}=e,[g,y]=Mt(p,"tooltip"),x=t(s).add(m).add(d).equal(),h={minWidth:t(s).mul(2).add(m).equal(),minHeight:c,padding:`${J(e.calc(u).div(2).equal())} ${J(f)}`,color:y("overlay-color",n),textAlign:"start",textDecoration:"none",wordWrap:"break-word",backgroundColor:i,borderRadius:s,boxSizing:"border-box"},S={[g("valid-offset-x")]:y("arrow-offset-x","var(--arrow-x)"),transformOrigin:[y("valid-offset-x",V$),`var(--arrow-y, ${V$})`].join(" ")};return[{[o]:{...ft(e),position:"absolute",zIndex:a,display:"block",width:"max-content",maxWidth:r,visibility:"visible",filter:l,...S,"&-hidden":{display:"none"},[g("arrow-background-color")]:i,[`${o}-container`]:[h,gl(e,!0)],[`&:has(~ ${o}-unique-container)`]:{[`${o}-container`]:{border:"none",background:"transparent"}},[["&-placement-topLeft","&-placement-topRight","&-placement-bottomLeft","&-placement-bottomRight"].join(",")]:{minWidth:x},[["&-placement-left","&-placement-leftTop","&-placement-leftBottom","&-placement-right","&-placement-rightTop","&-placement-rightBottom"].join(",")]:{[`${o}-inner`]:{borderRadius:e.min(s,Wx)}},[`${o}-content`]:{position:"relative"},...ea(e,(C,{darkColor:R})=>({[`&${o}-${C}`]:{[`${o}-container`]:{backgroundColor:R},[`${o}-arrow`]:{[g("arrow-background-color")]:R}}})),"&-rtl":{direction:"rtl"}}},_$(e,y("arrow-background-color"),{arrowShadow:!1}),{[`${o}-pure`]:{position:"relative",maxWidth:"none",margin:e.sizePopupArrow}},{[`${o}-unique-container`]:{...h,...S,position:"absolute",zIndex:t(a).sub(1).equal(),filter:l,"&-hidden":{display:"none"},"&-visible":{transition:`all ${e.motionDurationSlow}`}}}]},l_=e=>({zIndexPopup:e.zIndexPopupBase+70,maxWidth:250,...Dd({contentRadius:e.borderRadius,limitVerticalRadius:!0}),...O$(Oe(e,{borderRadiusOuter:Math.min(e.borderRadiusOuter,4)}))}),Fd=(e,t,o=!0)=>Be("Tooltip",n=>{let{borderRadius:i,colorTextLightSolid:s,colorBgSpotlight:a,maxWidth:c}=n,l=Oe(n,{tooltipMaxWidth:c,tooltipColor:s,tooltipBorderRadius:i,tooltipBg:a});return[a_(l),hl(n,"zoom-big-fast")]},l_,{resetStyle:!1,injectStyle:o})(e,t);var c_=Po.map(e=>`${e}-inverse`),u_=["success","processing","error","default","warning"];function zd(e,t=!0){return t?[].concat(Rt(c_),Rt(Po)).includes(e):Po.includes(e)}function H$(e){return u_.includes(e)}var Bd=(e,t,o)=>{let r=zd(o),[n]=Mt(e,"tooltip"),i=E({[`${t}-${o}`]:o&&r}),s={},a={},c=m0(o).toRgb(),u=(.299*c.r+.587*c.g+.114*c.b)/255<.5?"#FFF":"#000";return o&&!r&&(s.background=o,s[n("overlay-color")]=u,a[n("arrow-background-color")]=o),{className:i,overlayStyle:s,arrowStyle:a}};var f_=e=>{let{prefixCls:t,className:o,placement:r="top",title:n,color:i,overlayInnerStyle:s,classNames:a,styles:c}=e,{getPrefixCls:l}=Mi.useContext(Se),u=l("tooltip",t),f=l(),d=no(u),[m,p]=Fd(u,d),g=Bd(f,u,i),y=g.arrowStyle,x=Mi.useMemo(()=>({container:{...s,...g.overlayStyle}}),[s,g.overlayStyle]),b={...e,placement:r},[h,S]=je([a],[x,c],{props:b}),C=E(d,m,p,u,`${u}-pure`,`${u}-placement-${r}`,o,g.className);return Mi.createElement("div",{className:C,style:y},Mi.createElement("div",{className:`${u}-arrow`}),Mi.createElement(Ql,{...e,className:m,prefixCls:u,classNames:h,styles:S},n))},k$=f_;var d_=mo.forwardRef((e,t)=>{let{prefixCls:o,openClassName:r,getTooltipContainer:n,color:i,children:s,afterOpenChange:a,arrow:c,destroyTooltipOnHide:l,destroyOnHidden:u,title:f,overlay:d,trigger:m,builtinPlacements:p,autoAdjustOverflow:g=!0,motion:y,getPopupContainer:x,placement:b="top",mouseEnterDelay:h,mouseLeaveDelay:S,rootClassName:C,styles:R,classNames:v,onOpenChange:w,overlayInnerStyle:T,overlayStyle:I,overlayClassName:P,...N}=e,[,O]=Tt(),_=e["data-popover-inject"],{getPopupContainer:M,getPrefixCls:A,direction:V,...F}=De("tooltip"),{className:G,style:z,classNames:B,styles:k,arrow:W,trigger:j,mouseEnterDelay:L,mouseLeaveDelay:U}=_?{}:F,X=h??L??.1,Y=S??U??.1,q=B$(c,W),D=q.show,K=m||j||"hover",H=x||n||M,Q=u??!!l,Z=mo.useContext(F$),te=Gc("Tooltip"),se=mo.useRef(null),re=()=>{se.current?.forceAlign()};mo.useImperativeHandle(t,()=>({forceAlign:re,nativeElement:se.current?.nativeElement,popupElement:se.current?.popupElement}));let[oe,ae]=it(e.defaultOpen??!1,e.open),ie=!f&&!d&&f!==0,be=Me=>{ae(ie?!1:Me),!ie&&w&&w(Me)},ee=mo.useMemo(()=>p||jx({arrowPointAtCenter:q?.pointAtCenter??!1,autoAdjustOverflow:g,arrowWidth:D?O.sizePopupArrow:0,borderRadius:O.borderRadius,offset:O.marginXXS,visibleFirst:!0}),[q,p,O,D,g]),xe=mo.useMemo(()=>f===0?f:d||f||"",[d,f]),fe=mo.createElement(jn,{space:!0,form:!0},ot(xe)?xe():xe),_e={...e,trigger:K,builtinPlacements:ee,getPopupContainer:H,destroyOnHidden:Q,mouseEnterDelay:X,mouseLeaveDelay:Y},Ve=Ee(z),ue=Ee(I),[He,Ke]=je([B,v],[k,Ve,R,ue],{props:_e}),Pe=A("tooltip",o),de=A(),le=oe;(!("open"in e)&&ie||Z)&&(le=!1);let Re=mo.isValidElement(s)&&!wu(s)?s:mo.createElement("span",null,s),pe=Re.props,ve=!pe.className||typeof pe.className=="string"?E(pe.className,r||`${Pe}-open`):pe.className,Fe=no(Pe),[Ye,Je]=Fd(Pe,Fe,!_),st=Bd(de,Pe,i),Xe=st.arrowStyle,wt=E(Fe,Ye,Je),$t=E(P,{[`${Pe}-rtl`]:V==="rtl"},st.className,C,wt,G,He.root),[lt,Ct]=aa("Tooltip",N.zIndex),Pt={...Ke.container,...T,...st.overlayStyle},Nt=mo.createElement(M$,{unique:!0,...N,zIndex:lt,showArrow:D,placement:b,mouseEnterDelay:X,mouseLeaveDelay:Y,prefixCls:Pe,classNames:{root:$t,container:He.container,arrow:He.arrow,uniqueContainer:E(wt,He.container)},styles:{root:{...Xe,...Ke.root},container:Pt,uniqueContainer:Pt,arrow:Ke.arrow},ref:se,overlay:fe,visible:le,onVisibleChange:be,afterVisibleChange:a,arrowContent:mo.createElement("span",{className:`${Pe}-arrow-content`}),motion:{motionName:hn(de,"zoom-big-fast",typeof y?.motionName=="string"?y?.motionName:void 0),motionDeadline:1e3},trigger:K,builtinPlacements:ee,getTooltipContainer:H,destroyOnHidden:Q},le&&!N.disabled?Qo(Re,{className:ve}):Re);return mo.createElement(sa.Provider,{value:Ct},Nt)}),Ux=d_;Ux._InternalPanelDoNotUseOrYouWillBeFired=k$;Ux.UniqueProvider=Iu;var Vd=Ux;function Qn(e){return!e||e<0?0:e>100?100:e}function Oa({success:e}){let t;return e&&"percent"in e&&(t=e.percent),t}var W$=({percent:e,success:t})=>{let o=Qn(Oa({success:t}));return[o,Qn(Qn(e)-o)]},j$=({success:e={},strokeColor:t})=>{let{strokeColor:o}=e;return[o||On.green,t||null]},Oi=(e,t,o)=>{let r=-1,n=-1;if(t==="step"){let i=o.steps,s=o.strokeWidth;typeof e=="string"||typeof e>"u"?(r=e==="small"?2:14,n=s??8):wo(e)?[r,n]=[e,e]:[r=14,n=8]=Array.isArray(e)?e:[e.width,e.height],r*=i}else if(t==="line"){let i=o?.strokeWidth;typeof e=="string"||typeof e>"u"?n=i||(e==="small"?6:8):wo(e)?[r,n]=[e,e]:[r=-1,n=8]=Array.isArray(e)?e:[e.width,e.height]}else(t==="circle"||t==="dashboard")&&(typeof e=="string"||typeof e>"u"?[r,n]=e==="small"?[60,60]:[120,120]:wo(e)?[r,n]=[e,e]:Array.isArray(e)&&(r=e[0]??e[1]??120,n=e[0]??e[1]??120));return[r,n]};var m_=3,p_=e=>m_/e*100,U$=["root","body","indicator"],g_=e=>{let{prefixCls:t,classNames:o,styles:r,railColor:n,trailColor:i,strokeLinecap:s="round",gapPosition:a,gapPlacement:c,gapDegree:l,width:u=120,type:f,children:d,success:m,size:p=u,steps:g}=e,{direction:y}=De("progress"),x=n??i,[b,h]=Oi(p,"circle"),{strokeWidth:S}=e;S===void 0&&(S=Math.max(p_(b),6));let C={width:b,height:h,fontSize:b*.15+6},R=Ss.useMemo(()=>{if(l||l===0)return l;if(f==="dashboard")return 75},[l,f]),v=W$(e),w=Ss.useMemo(()=>{let M=(c??a)||f==="dashboard"&&"bottom"||void 0,A=y==="rtl";switch(M){case"start":return A?"right":"left";case"end":return A?"left":"right";default:return M}},[y,c,a,f]),T=ze(e.strokeColor),I=j$({success:m,strokeColor:e.strokeColor}),P=E(`${t}-body`,{[`${t}-circle-gradient`]:T},o.body),N=Ss.createElement(Hx,{steps:g,percent:g?v[1]:v,strokeWidth:S,railWidth:S,strokeColor:g?I[1]:I,strokeLinecap:s,railColor:x,prefixCls:t,gapDegree:R,gapPosition:w,classNames:tt(o,U$),styles:tt(r,U$)}),O=b<=20,_=Ss.createElement("div",{className:P,style:{...C,...r.body}},N,!O&&d);return O?Ss.createElement(Vd,{title:d},_):_},q$=g_;var Zl=$(require("react"));var Hd="--progress-line-stroke-color",h_=e=>{let t=e?"100%":"-100%";return new Ue(`antProgress${e?"RTL":"LTR"}Active`,{"0%":{transform:`translateX(${t}) scaleX(0)`,opacity:.1},"20%":{transform:`translateX(${t}) scaleX(0)`,opacity:.5},to:{transform:"translateX(0) scaleX(1)",opacity:0}})},x_=e=>{let{componentCls:t,iconCls:o}=e;return{[t]:{...ft(e),display:"inline-flex","&-rtl":{direction:"rtl"},[`${t}-indicator`]:{color:e.colorText,lineHeight:1,whiteSpace:"nowrap",verticalAlign:"middle",wordBreak:"normal",[o]:{fontSize:e.fontSize}},[`&${t}-status-exception`]:{[`${t}-indicator`]:{color:e.colorError}},[`&${t}-status-success`]:{[`${t}-indicator`]:{color:e.colorSuccess}}}}},b_=e=>{let{componentCls:t}=e;return{[`${t}-line`]:{position:"relative",width:"100%",fontSize:e.fontSize,[`${t}-body`]:{display:"inline-flex",alignItems:"center",width:"100%",gap:e.marginXS},[`${t}-rail`]:{flex:"auto",background:e.remainingColor,borderRadius:e.lineBorderRadius,position:"relative",width:"100%",overflow:"hidden"},[`&${t}-status-active`]:{[`${t}-track:after`]:{content:'""',position:"absolute",inset:0,backgroundColor:e.colorBgContainer,borderRadius:"inherit",opacity:0,animationName:h_(),animationDuration:e.progressActiveMotionDuration,animationTimingFunction:e.motionEaseOutQuint,animationIterationCount:"infinite"}},[`${t}-track`]:{position:"absolute",insetInlineStart:0,insetBlock:0,borderRadius:"inherit",background:e.defaultColor,transition:`all ${e.motionDurationSlow} ${e.motionEaseInOutCirc}`,minWidth:"max-content",display:"flex",alignItems:"center","&-success":{background:e.colorSuccess}},[`&${t}-status-exception`]:{[`${t}-track`]:{background:e.colorError}},[`&${t}-status-success`]:{[`${t}-track`]:{background:e.colorSuccess}},[`${t}-indicator-outer`]:{[`&${t}-indicator-start`]:{order:-1}},[`${t}-body-layout-bottom`]:{flexDirection:"column",alignItems:"center",gap:e.marginXXS},[`${t}-indicator${t}-indicator-inner`]:{color:e.colorWhite,paddingInline:e.paddingXXS,width:"100%",display:"flex",justifyContent:"center",[`&${t}-indicator-end`]:{justifyContent:"end"},[`&${t}-indicator-start`]:{justifyContent:"start"},[`&${t}-indicator-bright`]:{color:"rgba(0, 0, 0, 0.45)"}}}}},y_=e=>{let{componentCls:t,iconCls:o}=e;return{[`${t}-circle`]:{[`${t}-circle-rail`]:{stroke:e.remainingColor},[`${t}-body:not(${t}-circle-gradient)`]:{[`${t}-circle-path`]:{stroke:e.defaultColor}},[`${t}-body`]:{position:"relative",lineHeight:1,backgroundColor:"transparent"},[`${t}-indicator`]:{position:"absolute",insetBlockStart:"50%",insetInlineStart:0,width:"100%",margin:0,padding:0,color:e.circleTextColor,fontSize:e.circleTextFontSize,lineHeight:1,whiteSpace:"normal",textAlign:"center",transform:"translateY(-50%)",[o]:{fontSize:e.circleIconFontSize}},[`&${t}-status-exception`]:{[`${t}-body:not(${t}-circle-gradient)`]:{[`${t}-circle-path`]:{stroke:e.colorError}}},[`&${t}-status-success`]:{[`${t}-body:not(${t}-circle-gradient)`]:{[`${t}-circle-path`]:{stroke:e.colorSuccess}}}},[`${t}-inline-circle`]:{lineHeight:1,[`${t}-inner`]:{verticalAlign:"bottom"}}}},C_=e=>{let{componentCls:t}=e;return{[t]:{[`${t}-steps`]:{display:"inline-block","&-body":{display:"flex",flexDirection:"row",alignItems:"center",gap:e.progressStepMarginInlineEnd,[`${t}-indicator`]:{marginInlineStart:e.marginXS}},"&-item":{flexShrink:0,minWidth:e.progressStepMinWidth,backgroundColor:e.remainingColor,transition:`all ${e.motionDurationSlow}`,"&-active":{backgroundColor:e.defaultColor}}}}}},S_=e=>{let{componentCls:t,iconCls:o}=e;return{[t]:{[`${t}-small&-line, ${t}-small&-line ${t}-indicator ${o}`]:{fontSize:e.fontSizeSM}}}},v_=e=>({circleTextColor:e.colorText,defaultColor:e.colorInfo,remainingColor:e.colorFillSecondary,lineBorderRadius:100,circleTextFontSize:"1em",circleIconFontSize:`${e.fontSize/e.fontSizeSM}em`}),G$=Be("Progress",e=>{let t=e.calc(e.marginXXS).div(2).equal(),o=Oe(e,{progressStepMarginInlineEnd:t,progressStepMinWidth:t,progressActiveMotionDuration:"2.4s"});return[x_(o),b_(o),y_(o),C_(o),S_(o)]},v_);var R_=e=>{let t=[];return Object.keys(e).forEach(o=>{let r=Number.parseFloat(o.replace(/%/g,""));Number.isNaN(r)||t.push({key:r,value:e[o]})}),t=t.sort((o,r)=>o.key-r.key),t.map(({key:o,value:r})=>`${r} ${o}%`).join(", ")},E_=(e,t)=>{let{from:o=On.blue,to:r=On.blue,direction:n=t==="rtl"?"to left":"to right",...i}=e;if(Object.keys(i).length!==0){let a=R_(i),c=`linear-gradient(${n}, ${a})`;return{background:c,[Hd]:c}}let s=`linear-gradient(${n}, ${o}, ${r})`;return{background:s,[Hd]:s}},w_=e=>{let{prefixCls:t,classNames:o,styles:r,direction:n,percent:i,size:s,strokeWidth:a,strokeColor:c,strokeLinecap:l="round",children:u,railColor:f,trailColor:d,percentPosition:m,success:p}=e,{align:g,type:y}=m,x=f??d,b=l==="square"||l==="butt"?0:void 0,h=s??[-1,a||(s==="small"?6:8)],[S,C]=Oi(h,"line",{strokeWidth:a}),R={backgroundColor:x||void 0,borderRadius:b,height:C},v=`${t}-track`,w=c&&typeof c!="string"?E_(c,n):{[Hd]:c,background:c},T={width:`${Qn(i)}%`,height:C,borderRadius:b,...w},I=Oa(e),P={width:`${Qn(I)}%`,height:C,borderRadius:b,backgroundColor:p?.strokeColor};return Zl.createElement("div",{className:E(`${t}-body`,o.body,{[`${t}-body-layout-bottom`]:g==="center"&&y==="outer"}),style:{width:S>0?S:"100%",...r.body}},Zl.createElement("div",{className:E(`${t}-rail`,o.rail),style:{...R,...r.rail}},Zl.createElement("div",{className:E(v,o.track),style:{...T,...r.track}},y==="inner"&&u),I!==void 0&&Zl.createElement("div",{className:E(v,`${v}-success`,o.track),style:{...P,...r.track}})),y==="outer"&&u)},X$=w_;var qx=$(require("react"));var $_=e=>{let{classNames:t,styles:o,size:r,steps:n,rounding:i=Math.round,percent:s=0,strokeWidth:a=8,strokeColor:c,railColor:l,trailColor:u,prefixCls:f,children:d}=e,m=i(n*(s/100)),g=r??[r==="small"?2:14,a],[y,x]=Oi(g,"step",{steps:n,strokeWidth:a}),b=y/n,h=Array.from({length:n}),S=l??u;for(let C=0;C<n;C++){let R=Array.isArray(c)?c[C]:c;h[C]=qx.createElement("div",{key:C,className:E(`${f}-steps-item`,{[`${f}-steps-item-active`]:C<=m-1},t.track),style:{backgroundColor:C<=m-1?R:S,width:b,height:x,...o.track}})}return qx.createElement("div",{className:E(`${f}-steps-body`,t.body),style:o.body},h,d)},K$=$_;var P_=["normal","exception","active","success"],N_=Ao.forwardRef((e,t)=>{let{prefixCls:o,className:r,rootClassName:n,classNames:i,styles:s,steps:a,strokeColor:c,percent:l=0,size:u="medium",showInfo:f=!0,type:d="line",status:m,format:p,style:g,percentPosition:y={},...x}=e,{align:b="end",type:h="outer"}=y,S=Array.isArray(c)?c[0]:c,C=typeof c=="string"||Array.isArray(c)?c:void 0,R=Ao.useMemo(()=>{if(S){let q=typeof S=="string"?S:Object.values(S)[0];return new Ze(q).isLight()}return!1},[c]),v=Ao.useMemo(()=>{let q=Oa(e);return Number.parseInt(q!==void 0?(q??0)?.toString():(l??0)?.toString(),10)},[l,e.success]),w=Ao.useMemo(()=>!P_.includes(m)&&v>=100?"success":m||"normal",[m,v]),{getPrefixCls:T,direction:I,className:P,style:N,classNames:O,styles:_}=De("progress"),M=T("progress",o),[A,V]=G$(M),F={...e,percent:l,type:d,size:u,showInfo:f,percentPosition:y},G=Ee(N),z=Ee(g),[B,k]=je([O,i],[_,G,s,z],{props:F}),W=d==="line",j=W&&!a,L=Ao.useMemo(()=>{if(!f)return null;let q=Oa(e),D,K=p||(Q=>`${Q}%`),H=W&&R&&h==="inner";return h==="inner"||p||w!=="exception"&&w!=="success"?D=K(Qn(l),Qn(q)):w==="exception"?D=W?Ao.createElement(gn,null):Ao.createElement(fr,null):w==="success"&&(D=W?Ao.createElement(ra,null):Ao.createElement(Cd,null)),Ao.createElement("span",{className:E(`${M}-indicator`,{[`${M}-indicator-bright`]:H,[`${M}-indicator-${b}`]:j,[`${M}-indicator-${h}`]:j},B.indicator),style:k.indicator,title:typeof D=="string"?D:void 0},D)},[f,l,v,w,d,M,p,W,R,h,b,j,B.indicator,k.indicator]),U={...e,classNames:B,styles:k},X;d==="line"?X=a?Ao.createElement(K$,{...U,strokeColor:C,prefixCls:M,steps:ze(a)?a.count:a},L):Ao.createElement(X$,{...U,strokeColor:S,prefixCls:M,direction:I,percentPosition:{align:b,type:h}},L):(d==="circle"||d==="dashboard")&&(X=Ao.createElement(q$,{...U,strokeColor:S,prefixCls:M,progressStatus:w},L));let Y=E(M,`${M}-status-${w}`,{[`${M}-${d==="dashboard"&&"circle"||d}`]:d!=="line",[`${M}-inline-circle`]:d==="circle"&&Oi(u,"circle")[0]<=20,[`${M}-line`]:j,[`${M}-line-align-${b}`]:j,[`${M}-line-position-${h}`]:j,[`${M}-steps`]:a,[`${M}-show-info`]:f,[`${M}-small`]:u==="small",[`${M}-rtl`]:I==="rtl"},P,r,n,B.root,A,V);return Ao.createElement("div",{ref:t,style:k.root,className:Y,role:"progressbar","aria-valuenow":v,"aria-valuemin":0,"aria-valuemax":100,...tt(x,["railColor","trailColor","strokeWidth","width","gapDegree","gapPosition","gapPlacement","strokeLinecap","success"])},X)}),Y$=N_;var Q$=Y$;var Ho=$(require("react"));var Xx=$(require("react")),vs=require("react");function Gx(){return Gx=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Gx.apply(this,arguments)}var I_=(0,vs.forwardRef)((e,t)=>{let{prefixCls:o="rc-checkbox",className:r,style:n,checked:i,disabled:s,defaultChecked:a=!1,type:c="checkbox",title:l,onChange:u,...f}=e,d=(0,vs.useRef)(null),m=(0,vs.useRef)(null),[p,g]=it(a,i);(0,vs.useImperativeHandle)(t,()=>({focus:b=>{d.current?.focus(b)},blur:()=>{d.current?.blur()},input:d.current,nativeElement:m.current}));let y=E(o,r,{[`${o}-checked`]:p,[`${o}-disabled`]:s}),x=b=>{s||("checked"in e||g(b.target.checked),u?.({target:{...e,type:c,checked:b.target.checked},stopPropagation(){b.stopPropagation()},preventDefault(){b.preventDefault()},nativeEvent:b.nativeEvent}))};return Xx.createElement("span",{className:y,title:l,style:n,ref:m},Xx.createElement("input",Gx({},f,{className:`${o}-input`,ref:d,onChange:x,disabled:s,checked:!!p,type:c})))}),Z$=I_;var J$=$(require("react")),T_=J$.default.createContext(null),kd=T_;var M_=e=>{let{checkboxCls:t,checkboxSize:o,lineWidth:r}=e,n=`${t}-wrapper`,i="@media (hover: hover) and (pointer: fine)";return[{[`${t}-group`]:{...ft(e),display:"inline-flex",flexWrap:"wrap",columnGap:e.marginXS,[`> ${e.antCls}-row`]:{flex:1}},[n]:{...ft(e),display:"inline-flex",alignItems:"baseline",cursor:"pointer","&:after":{display:"inline-block",width:0,overflow:"hidden",content:"'\\a0'"},[`& + ${n}`]:{marginInlineStart:0}},[t]:{...ft(e),position:"relative",whiteSpace:"nowrap",lineHeight:1,cursor:"pointer",alignSelf:"center",boxSizing:"border-box",display:"block",width:o,height:o,direction:"ltr",backgroundColor:e.colorBgContainer,border:`${J(r)} ${e.lineType} ${e.colorBorder}`,borderRadius:e.borderRadiusSM,borderCollapse:"separate",transition:`all ${e.motionDurationSlow}`,flex:"none",...xn(),"&:after":{boxSizing:"border-box",position:"absolute",top:`calc(${o} / 2 - ${r})`,insetInlineStart:`calc(${o} / 4 - ${r})`,display:"table",width:e.calc(o).div(14).mul(5).equal(),height:e.calc(o).div(14).mul(8).equal(),border:`${J(e.lineWidthBold)} solid ${e.colorWhite}`,borderTop:0,borderInlineStart:0,transform:"rotate(45deg) scale(0) translate(-50%,-50%)",opacity:0,content:'""',transition:`all ${e.motionDurationFast} ${e.motionEaseInBack}, opacity ${e.motionDurationFast}`,...fa()},[`${t}-input`]:{position:"absolute",inset:`calc(-1 * (${r}))`,zIndex:1,cursor:"pointer",opacity:0,margin:0},[`&:has(${t}-input:focus-visible)`]:Dn(e),"& + span":{paddingInlineStart:e.paddingXS,paddingInlineEnd:e.paddingXS}}},{[i]:{[`
          ${n}:not(${n}-disabled),
          ${t}:not(${t}-disabled)
        `]:{[`&:hover ${t}`]:{borderColor:e.colorPrimary}},[`${n}:not(${n}-disabled)`]:{[`&:hover ${t}-checked:not(${t}-disabled)`]:{backgroundColor:e.colorPrimaryHover,borderColor:"transparent"}}}},{[`${t}-checked`]:{backgroundColor:e.colorPrimary,borderColor:e.colorPrimary,"&:after":{opacity:1,transform:"rotate(45deg) scale(1) translate(-50%,-50%)",transition:`all ${e.motionDurationMid} ${e.motionEaseOutBack} ${e.motionDurationFast}`,...fa()},[i]:{[`&:not(${t}-disabled):hover`]:{backgroundColor:e.colorPrimaryHover,borderColor:"transparent"}}}},{[t]:{"&-indeterminate":{backgroundColor:e.colorBgContainer,borderColor:e.colorBorder,"&:after":{top:"50%",insetInlineStart:"50%",width:e.calc(e.fontSizeLG).div(2).equal(),height:e.calc(e.fontSizeLG).div(2).equal(),backgroundColor:e.colorPrimary,border:0,transform:"translate(-50%, -50%) scale(1)",opacity:1,content:'""'},[i]:{[`&:not(${t}-disabled):hover`]:{backgroundColor:e.colorBgContainer,borderColor:e.colorPrimary}}}}},{[`${n}-disabled`]:{cursor:"not-allowed"},[`${t}-disabled`]:{[`&, ${t}-input`]:{cursor:"not-allowed",pointerEvents:"none"},background:e.colorBgContainerDisabled,borderColor:e.colorBorder,"&:after":{borderColor:e.colorTextDisabled},"& + span":{color:e.colorTextDisabled},[`&${t}-indeterminate::after`]:{background:e.colorTextDisabled}}}]};function O_(e,t){let o=Oe(t,{checkboxCls:`.${e}`,checkboxSize:t.controlInteractiveSize});return M_(o)}var Wd=Be("Checkbox",(e,{prefixCls:t})=>[O_(t,e)]);var e1=$(require("react"));function Kx(e){let t=e1.default.useRef(null),o=()=>{Ge.cancel(t.current),t.current=null};return[()=>{o(),t.current=Ge(()=>{t.current=null})},i=>{t.current&&(i.stopPropagation(),o()),e?.(i)}]}var A_=(e,t)=>{let{prefixCls:o,children:r,indeterminate:n=!1,onMouseEnter:i,onMouseLeave:s,skipGroup:a=!1,disabled:c,rootClassName:l,className:u,style:f,classNames:d,styles:m,name:p,value:g,checked:y,defaultChecked:x,onChange:b,...h}=e,{getPrefixCls:S,direction:C,className:R,style:v,classNames:w,styles:T}=De("checkbox"),I=Ho.useContext(kd),{isFormItemInput:P}=Ho.useContext(Fo),N=Ho.useContext(Xt),O=c??I?.disabled??N,[_,M]=it(x,y),A=_,V=ye(Z=>{M(Z.target.checked),b?.(Z),!a&&I?.toggleOption&&I.toggleOption({label:r,value:g})});I&&!a&&(A=I.value.includes(g));let F=Ho.useRef(null),G=ir(t,F);Ho.useEffect(()=>{if(!(a||!I))return I.registerValue(g),()=>{I.cancelValue(g)}},[g,a]),Ho.useEffect(()=>{F.current?.input&&(F.current.input.indeterminate=n)},[n]);let z=S("checkbox",o),B=no(z),[k,W]=Wd(z,B),j={...h},L={...e,indeterminate:n,disabled:O,checked:A},U=Ee(v),X=Ee(f),[Y,q]=je([w,d],[T,U,m,X],{props:L}),D=E(`${z}-wrapper`,{[`${z}-rtl`]:C==="rtl",[`${z}-wrapper-checked`]:A,[`${z}-wrapper-disabled`]:O,[`${z}-wrapper-in-form-item`]:P},R,u,Y.root,l,W,B,k),K=E(Y.icon,{[`${z}-indeterminate`]:n},la,k),[H,Q]=Kx(j.onClick);return Ho.createElement(pi,{component:"Checkbox",disabled:O},Ho.createElement("label",{className:D,style:q.root,onMouseEnter:i,onMouseLeave:s,onClick:H},Ho.createElement(Z$,{...j,name:!a&&I?I.name:p,checked:A,onClick:Q,onChange:V,prefixCls:z,className:K,style:q.icon,disabled:O,ref:G,value:g}),ut(r)&&Ho.createElement("span",{className:E(`${z}-label`,Y.label),style:q.label},r)))},__=Ho.forwardRef(A_),jd=__;var yr=$(require("react"));var L_=yr.forwardRef((e,t)=>{let{defaultValue:o,children:r,options:n=[],prefixCls:i,className:s,rootClassName:a,style:c,onChange:l,role:u="group",...f}=e,{getPrefixCls:d,direction:m}=yr.useContext(Se),[p,g]=it(o||[],f.value),y=p||[],[x,b]=yr.useState([]),h=yr.useMemo(()=>n.map(A=>$r(A)||wo(A)?{label:A,value:A}:A).filter(A=>lo(A)&&lo(A.value)),[n]),S=A=>{b(V=>V.filter(F=>F!==A))},C=A=>{b(V=>[].concat(Rt(V),[A]))},R=A=>{let V=y.indexOf(A.value),F=Rt(y);V===-1?F.push(A.value):F.splice(V,1),g(F),l?.(F.filter(G=>x.includes(G)).sort((G,z)=>{let B=h.findIndex(W=>W.value===G),k=h.findIndex(W=>W.value===z);return B-k}))},v=d("checkbox",i),w=`${v}-group`,T=no(v),[I,P]=Wd(v,T),N=tt(f,["value","disabled"]),O=Array.isArray(h)&&h.length>0?h.map(A=>yr.createElement(jd,{prefixCls:v,key:A.value.toString(),disabled:"disabled"in A?A.disabled:f.disabled,value:A.value,checked:y.includes(A.value),onChange:A.onChange,className:E(`${w}-item`,A.className),style:A.style,title:A.title,id:A.id,required:A.required},A.label)):r,_=yr.useMemo(()=>({toggleOption:R,value:y,disabled:f.disabled,name:f.name,registerValue:C,cancelValue:S}),[R,y,f.disabled,f.name,C,S]),M=E(w,{[`${w}-rtl`]:m==="rtl"},s,a,P,T,I);return yr.createElement("div",{className:M,style:c,role:u,...N,ref:t},yr.createElement(kd.Provider,{value:_},O))});var t1=L_;var Yx=jd;Yx.Group=t1;Yx.__ANT_CHECKBOX=!0;var o1=Yx;var kr=$(require("react"));var po=$(require("react"));var Hr=$(require("react")),r1=(e,t)=>{if(!e)return null;let o={left:e.offsetLeft,right:e.parentElement.clientWidth-e.clientWidth-e.offsetLeft,width:e.clientWidth,top:e.offsetTop,bottom:e.parentElement.clientHeight-e.clientHeight-e.offsetTop,height:e.clientHeight};return t?{left:0,right:0,width:0,top:o.top,bottom:o.bottom,height:o.height}:{left:o.left,right:o.right,width:o.width,top:0,bottom:0,height:0}},Pn=e=>e!==void 0?`${e}px`:void 0;function Qx(e){let{prefixCls:t,containerRef:o,value:r,getValueIndex:n,motionName:i,onMotionStart:s,onMotionEnd:a,direction:c,vertical:l=!1}=e,u=Hr.useRef(null),[f,d]=Hr.useState(r),m=v=>{let w=n(v),T=o.current?.querySelectorAll(`.${t}-item`)[w];return T?.offsetParent&&T},[p,g]=Hr.useState(null),[y,x]=Hr.useState(null);qe(()=>{if(f!==r){let v=m(f),w=m(r),T=r1(v,l),I=r1(w,l);d(r),g(T),x(I),v&&w?s():a()}},[r]);let b=Hr.useMemo(()=>Pn(l?p?.top??0:c==="rtl"?-p?.right:p?.left),[l,c,p]),h=Hr.useMemo(()=>Pn(l?y?.top??0:c==="rtl"?-y?.right:y?.left),[l,c,y]),S=()=>l?{transform:"translateY(var(--thumb-start-top))",height:"var(--thumb-start-height)"}:{transform:"translateX(var(--thumb-start-left))",width:"var(--thumb-start-width)"},C=()=>l?{transform:"translateY(var(--thumb-active-top))",height:"var(--thumb-active-height)"}:{transform:"translateX(var(--thumb-active-left))",width:"var(--thumb-active-width)"},R=()=>{g(null),x(null),a()};return!p||!y?null:Hr.createElement(oo,{visible:!0,motionName:i,motionAppear:!0,onAppearStart:S,onAppearActive:C,onVisibleChanged:R},({className:v,style:w},T)=>{let I={...w,"--thumb-start-left":b,"--thumb-start-width":Pn(p?.width),"--thumb-active-left":h,"--thumb-active-width":Pn(y?.width),"--thumb-start-top":b,"--thumb-start-height":Pn(p?.height),"--thumb-active-top":h,"--thumb-active-height":Pn(y?.height)},P={ref:gt(u,T),style:I,className:E(`${t}-thumb`,v)};return Hr.createElement("div",P)})}function Ud(){return Ud=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var o=arguments[t];for(var r in o)Object.prototype.hasOwnProperty.call(o,r)&&(e[r]=o[r])}return e},Ud.apply(this,arguments)}function D_(e){if(typeof e.title<"u")return e.title;if(typeof e.label!="object")return e.label?.toString()}function F_(e){return e.map(t=>{if(typeof t=="object"&&t!==null){let o=D_(t);return{...t,value:t.value,title:o}}return{label:t?.toString(),title:t?.toString(),value:t}})}var z_=({prefixCls:e,className:t,style:o,styles:r,classNames:n,data:i,disabled:s,checked:a,label:c,title:l,value:u,name:f,onChange:d,onFocus:m,onBlur:p,onKeyDown:g,onKeyUp:y,onMouseDown:x,itemRender:b=h=>h})=>{let h=C=>{s||d(C,u)},S=po.createElement("label",{className:E(t,{[`${e}-item-disabled`]:s}),style:o,onMouseDown:x},po.createElement("input",{name:f,className:`${e}-item-input`,type:"radio",disabled:s,checked:a,onChange:h,onFocus:m,onBlur:p,onKeyDown:g,onKeyUp:y}),po.createElement("div",{className:E(`${e}-item-label`,n?.label),title:l,style:r?.label},c));return b(S,{item:i})},B_=po.forwardRef((e,t)=>{let{prefixCls:o="rc-segmented",direction:r,vertical:n,options:i=[],disabled:s,defaultValue:a,value:c,name:l,onChange:u,className:f="",style:d,styles:m,classNames:p,motionName:g="thumb-motion",itemRender:y,...x}=e,b=po.useRef(null),h=po.useMemo(()=>gt(b,t),[b,t]),S=po.useMemo(()=>F_(i),[i]),[C,R]=it(a??S[0]?.value,c),[v,w]=po.useState(!1),T=(k,W)=>{R(W),u?.(W)},I=tt(x,["children"]),[P,N]=po.useState(!1),[O,_]=po.useState(!1),M=()=>{_(!0)},A=()=>{_(!1)},V=()=>{N(!1)},F=k=>{k.key==="Tab"&&N(!0)},G=k=>{let W=S.filter(Y=>Y.value===C||!Y.disabled),j=W.findIndex(Y=>Y.value===C),L=W.length,U=(j+k+L)%L,X=W[U];X&&X.value!==C&&(R(X.value),u?.(X.value))},z=k=>{switch(k.key){case"ArrowLeft":case"ArrowUp":G(-1);break;case"ArrowRight":case"ArrowDown":G(1);break}},B=k=>{let{value:W,disabled:j}=k;return po.createElement(z_,Ud({},k,{name:l,data:k,itemRender:y,key:W,prefixCls:o,className:E(k.className,`${o}-item`,p?.item,{[`${o}-item-selected`]:W===C&&!v,[`${o}-item-selected-text`]:W===C,[`${o}-item-focused`]:O&&P&&W===C}),style:m?.item,classNames:p,styles:m,checked:W===C,onChange:T,onFocus:M,onBlur:A,onKeyDown:z,onKeyUp:F,onMouseDown:V,disabled:!!s||!!j}))};return po.createElement("div",Ud({role:"radiogroup","aria-label":"segmented control",tabIndex:s?void 0:0,"aria-orientation":n?"vertical":"horizontal",style:d},I,{className:E(o,{[`${o}-rtl`]:r==="rtl",[`${o}-disabled`]:s,[`${o}-vertical`]:n},f),ref:h}),po.createElement("div",{className:`${o}-group`},po.createElement(Qx,{vertical:n,prefixCls:o,value:C,containerRef:b,motionName:`${o}-${g}`,direction:r,getValueIndex:k=>S.findIndex(W=>W.value===k),onMotionStart:()=>{w(!0)},onMotionEnd:()=>{w(!1)}}),S.map(B)))}),V_=B_,n1=V_;function i1(e,t){return{[`${e}, ${e}:hover, ${e}:focus`]:{color:t.colorTextDisabled,cursor:"not-allowed"}}}var s1=e=>({background:e.itemSelectedBg,boxShadow:e.boxShadowTertiary}),H_={overflow:"hidden",...Zr},k_=e=>{let{componentCls:t,motionDurationSlow:o,motionEaseInOut:r,motionDurationMid:n}=e,i=e.calc(e.controlHeight).sub(e.calc(e.trackPadding).mul(2)).equal(),s=e.calc(e.controlHeightLG).sub(e.calc(e.trackPadding).mul(2)).equal(),a=e.calc(e.controlHeightSM).sub(e.calc(e.trackPadding).mul(2)).equal();return{[t]:{...ft(e),display:"inline-block",padding:e.trackPadding,color:e.itemColor,background:e.trackBg,borderRadius:e.borderRadius,transition:`all ${n}`,...Jr(e),[`${t}-group`]:{position:"relative",display:"flex",alignItems:"stretch",justifyItems:"flex-start",flexDirection:"row",width:"100%"},[`&${t}-rtl`]:{direction:"rtl"},[`&${t}-vertical`]:{[`${t}-group`]:{flexDirection:"column"},[`${t}-thumb`]:{width:"100%",height:0,padding:`0 ${J(e.paddingXXS)}`}},[`&${t}-block`]:{display:"flex"},[`&${t}-block ${t}-item`]:{flex:1,minWidth:0},[`${t}-item`]:{position:"relative",textAlign:"center",cursor:"pointer",transition:`color ${n}`,borderRadius:e.borderRadiusSM,transform:"translateZ(0)","&-selected":{...s1(e),color:e.itemSelectedColor},"&-selected-text":{color:e.itemSelectedColor,transition:`color ${n}`},"&-focused":Dn(e),"&::after":{content:'""',position:"absolute",zIndex:-1,width:"100%",height:"100%",top:0,insetInlineStart:0,borderRadius:"inherit",opacity:0,pointerEvents:"none",transition:["opacity","background-color"].map(c=>`${c} ${n}`).join(", ")},[`&:not(${t}-item-selected):not(${t}-item-selected-text):not(${t}-item-disabled)`]:{"&:hover, &:active":{color:e.itemHoverColor},"&:hover::after":{opacity:1,backgroundColor:e.itemHoverBg},"&:active::after":{opacity:1,backgroundColor:e.itemActiveBg}},"&-label":{minHeight:i,lineHeight:J(i),padding:`0 ${J(e.segmentedPaddingHorizontal)}`,...H_},"&-icon + *":{marginInlineStart:e.calc(e.marginSM).div(2).equal()},"&-icon > svg":{display:"inline-block",verticalAlign:"middle",marginBlockEnd:"0.2em"},"&-input":{position:"absolute",insetBlockStart:0,insetInlineStart:0,width:0,height:0,opacity:0,pointerEvents:"none"}},[`${t}-thumb`]:{...s1(e),position:"absolute",insetBlockStart:0,insetInlineStart:0,width:0,height:"100%",padding:`${J(e.paddingXXS)} 0`,borderRadius:e.borderRadiusSM,[`& ~ ${t}-item:not(${t}-item-selected):not(${t}-item-disabled)::after`]:{backgroundColor:"transparent"}},[`&${t}-lg`]:{borderRadius:e.borderRadiusLG,[`${t}-item-label`]:{minHeight:s,lineHeight:J(s),padding:`0 ${J(e.segmentedPaddingHorizontal)}`,fontSize:e.fontSizeLG},[`${t}-item, ${t}-thumb`]:{borderRadius:e.borderRadius}},[`&${t}-sm`]:{borderRadius:e.borderRadiusSM,[`${t}-item-label`]:{minHeight:a,lineHeight:J(a),padding:`0 ${J(e.segmentedPaddingHorizontalSM)}`},[`${t}-item, ${t}-thumb`]:{borderRadius:e.borderRadiusXS}},...i1(`&-disabled ${t}-item`,e),...i1(`${t}-item-disabled`,e),[`${t}-thumb-motion-appear-active`]:{willChange:"transform, width",transition:["transform","width"].map(c=>`${c} ${o} ${r}`).join(", ")},[`&${t}-shape-round`]:{borderRadius:9999,[`${t}-item, ${t}-thumb`]:{borderRadius:9999}}}}},W_=e=>{let{colorTextLabel:t,colorText:o,colorFillSecondary:r,colorBgElevated:n,colorFill:i,lineWidthBold:s,colorBgLayout:a}=e;return{trackPadding:s,trackBg:a,itemColor:t,itemHoverColor:o,itemHoverBg:r,itemSelectedBg:n,itemActiveBg:i,itemSelectedColor:o}},a1=Be("Segmented",e=>{let{lineWidth:t,calc:o}=e,r=Oe(e,{segmentedPaddingHorizontal:o(e.controlPaddingHorizontal).sub(t).equal(),segmentedPaddingHorizontalSM:o(e.controlPaddingHorizontalSM).sub(t).equal()});return k_(r)},W_);function j_(e){return ze(e)&&!!e?.icon}var U_=kr.forwardRef((e,t)=>{let o=xo(),{prefixCls:r,className:n,rootClassName:i,block:s,options:a=[],size:c,style:l,vertical:u,orientation:f,shape:d="default",name:m=o,styles:p,classNames:g,...y}=e,{getPrefixCls:x,direction:b,className:h,style:S,classNames:C,styles:R}=De("segmented"),v={...e,options:a,size:c,shape:d},w=Ee(S),T=Ee(l),[I,P]=je([C,g],[R,w,p,T],{props:v}),N=x("segmented",r),[O,_]=a1(N),M=kt(c),A=kr.useMemo(()=>a.map(z=>{if(j_(z)){let{icon:B,label:k,...W}=z;return{...W,label:kr.createElement(kr.Fragment,null,kr.createElement("span",{className:E(`${N}-item-icon`,I.icon),style:P.icon},B),ut(k)&&kr.createElement("span",null,k))}}return z}),[a,N,I.icon,P.icon]),[,V]=ia(f,u),F=E(n,i,h,I.root,{[`${N}-block`]:s,[`${N}-sm`]:M==="small",[`${N}-lg`]:M==="large",[`${N}-vertical`]:V,[`${N}-shape-${d}`]:d==="round"},O,_),G=(z,{item:B})=>{if(!B.tooltip)return z;let k=ze(B.tooltip)?B.tooltip:{title:B.tooltip};return kr.createElement(Vd,{...k},z)};return kr.createElement(n1,{...y,name:m,className:F,style:P.root,classNames:I,styles:P,itemRender:G,options:A,ref:t,prefixCls:N,direction:b,vertical:V})}),q_=U_,l1=q_;var eo=$(require("react"));var Ai=$(require("react"));var G_=e=>{let{paddingXXS:t,lineWidth:o,tagPaddingHorizontal:r,componentCls:n,calc:i}=e,s=i(r).sub(o).equal(),a=i(t).sub(o).equal();return{[n]:{...ft(e),display:"inline-block",height:"auto",paddingInline:s,fontSize:e.tagFontSize,lineHeight:e.tagLineHeight,whiteSpace:"nowrap",backgroundColor:e.defaultBg,border:`${J(e.lineWidth)} ${e.lineType} ${e.colorBorder}`,borderRadius:e.borderRadiusSM,opacity:1,transition:`all ${e.motionDurationMid}`,textAlign:"start",position:"relative",[`&${n}-rtl`]:{direction:"rtl"},"&, a, a:hover":{color:e.defaultColor},[`${n}-close-icon`]:{marginInlineStart:a,fontSize:e.tagIconSize,color:e.colorIcon,cursor:"pointer",transition:`all ${e.motionDurationMid}`,"&:hover":{color:e.colorTextHeading}},"&-checkable":{backgroundColor:"transparent",borderColor:"transparent",cursor:"pointer",[`&:not(${n}-checkable-checked):hover`]:{color:e.colorPrimary,backgroundColor:e.colorFillSecondary},"&:active, &-checked":{color:e.colorTextLightSolid},"&-checked":{backgroundColor:e.colorPrimary,"&:hover":{backgroundColor:e.colorPrimaryHover}},"&:active":{backgroundColor:e.colorPrimaryActive},"&-disabled":{cursor:"not-allowed",[`&:not(${n}-checkable-checked)`]:{color:e.colorTextDisabled,"&:hover":{backgroundColor:"transparent"}},[`&${n}-checkable-checked`]:{color:e.colorTextDisabled,backgroundColor:e.colorBgContainerDisabled},"&:hover, &:active":{backgroundColor:e.colorBgContainerDisabled,color:e.colorTextDisabled},[`&:not(${n}-checkable-checked):hover`]:{color:e.colorTextDisabled}},"&-group":{display:"flex",flexWrap:"wrap",gap:e.paddingXS}},"&-hidden":{display:"none"},"> svg":{display:"inline-block",verticalAlign:"middle",marginBlockEnd:"0.2em"},[`> ${e.iconCls} + span, > span + ${e.iconCls}, > svg + span, > span + svg`]:{marginInlineStart:s}},[`&${e.componentCls}-solid`]:{borderColor:"transparent",color:e.colorTextLightSolid,backgroundColor:e.colorBgSolid,[`&${n}-default`]:{color:e.solidTextColor}},[`${n}-filled`]:{borderColor:"transparent",backgroundColor:e.tagBorderlessBg},[`&${n}-disabled`]:{color:e.colorTextDisabled,cursor:"not-allowed",backgroundColor:e.colorBgContainerDisabled,a:{cursor:"not-allowed",pointerEvents:"none",color:e.colorTextDisabled,"&:hover":{color:e.colorTextDisabled}},"a&":{"&:hover, &:active":{color:e.colorTextDisabled}},[`&${n}-outlined`]:{borderColor:e.colorBorderDisabled},[`&${n}-solid, &${n}-filled`]:{color:e.colorTextDisabled,[`${n}-close-icon`]:{color:e.colorTextDisabled}},[`${n}-close-icon`]:{cursor:"not-allowed",color:e.colorTextDisabled,"&:hover":{color:e.colorTextDisabled}}}}},Jl=e=>{let{lineWidth:t,fontSizeIcon:o,calc:r}=e,n=e.fontSizeSM;return Oe(e,{tagFontSize:n,tagLineHeight:J(r(e.lineHeightSM).mul(n).equal()),tagIconSize:r(o).sub(r(t).mul(2)).equal(),tagPaddingHorizontal:8,tagBorderlessBg:e.defaultBg})},ec=e=>{let t=Sf(new ls(e.colorBgSolid),"#fff")?"#000":"#fff";return{defaultBg:new Ze(e.colorFillTertiary).onBackground(e.colorBgContainer).toHexString(),defaultColor:e.colorText,solidTextColor:t}},Aa=Be("Tag",e=>{let t=Jl(e);return G_(t)},ec);var X_=Ai.forwardRef((e,t)=>{let{prefixCls:o,style:r,className:n,checked:i,children:s,icon:a,onChange:c,onClick:l,onKeyDown:u,disabled:f,...d}=e,{getPrefixCls:m,tag:p}=Ai.useContext(Se),g=Ai.useContext(Xt),y=f??g,x=v=>{y||(c?.(!i),l?.(v))},b=v=>{u?.(v),!(v.defaultPrevented||y)&&v.key===" "&&(v.preventDefault(),v.repeat||c?.(!i))},h=m("tag",o),[S,C]=Aa(h),R=E(h,`${h}-checkable`,{[`${h}-checkable-checked`]:i,[`${h}-checkable-disabled`]:y},p?.className,n,S,C);return Ai.createElement("span",{...d,ref:t,role:"checkbox","aria-checked":i,"aria-disabled":y||void 0,tabIndex:y?-1:0,style:{...p?.style,...r},className:R,onClick:x,onKeyDown:b},a,Ai.createElement("span",null,s))}),qd=X_;var Zn=$(require("react"));var K_=Zn.default.forwardRef((e,t)=>{let{id:o,prefixCls:r,rootClassName:n,className:i,style:s,classNames:a,styles:c,disabled:l,options:u,value:f,defaultValue:d,onChange:m,multiple:p,...g}=e,{getPrefixCls:y,direction:x,className:b,style:h,classNames:S,styles:C}=De("tag"),R=y("tag",r),v=`${R}-checkable-group`,w=no(R),[T,I]=Aa(R,w),P=Ee(h),N=Ee(s),[O,_]=je([S,a],[C,P,c,N],{props:e}),M=(0,Zn.useMemo)(()=>Array.isArray(u)?u.map(B=>ze(B)?B:{value:B,label:B}):[],[u]),[A,V]=it(d,f),F=(B,k)=>{let W=null;if(p){let j=A||[];W=B?[].concat(Rt(j),[k.value]):j.filter(L=>L!==k.value)}else W=B?k.value:null;V(W),m?.(W)},G=Zn.default.useRef(null);(0,Zn.useImperativeHandle)(t,()=>({nativeElement:G.current}));let z=Ht(g,{aria:!0,data:!0});return Zn.default.createElement("div",{...z,className:E(v,b,n,{[`${v}-disabled`]:l,[`${v}-rtl`]:x==="rtl"},T,I,i,O.root),style:_.root,id:o,ref:G},M.map(B=>Zn.default.createElement(qd,{key:B.value,className:E(`${v}-item`,O.item,B.className),style:{..._.item,...B.style},checked:p?(A||[]).includes(B.value):A===B.value,onChange:k=>F(k,B),disabled:l},B.label)))}),c1=K_;var u1=$(require("react"));function Zx(e,t){let{color:o,variant:r,bordered:n}=e;return u1.useMemo(()=>{let i=o?.endsWith("-inverse"),s;r?s=r:i?s="solid":n===!1?s="filled":s=t||"filled";let a=i?o?.replace("-inverse",""):o;a===void 0&&s==="solid"&&(a="default");let c=zd(a),l=H$(a),u={};if(!c&&!l&&a)if(s==="solid")u.backgroundColor=o;else{let f=new Ze(a).toHsl();f.l=.95,u.backgroundColor=new Ze(f).toHexString(),u.color=o,s==="outlined"&&(u.borderColor=o)}return[s,a,c,l,u]},[o,r,n,t])}var Y_=e=>ea(e,(t,{textColor:o,lightBorderColor:r,lightColor:n,darkColor:i})=>({[`${e.componentCls}${e.componentCls}-${t}:not(${e.componentCls}-disabled)`]:{[`&${e.componentCls}-outlined`]:{backgroundColor:n,borderColor:r,color:o},[`&${e.componentCls}-solid`]:{backgroundColor:i,borderColor:i,color:e.colorTextLightSolid},[`&${e.componentCls}-filled`]:{backgroundColor:n,color:o}}})),f1=Fn(["Tag","preset"],e=>{let t=Jl(e);return Y_(t)},ec);function Jx(e){return typeof e!="string"?e:e.charAt(0).toUpperCase()+e.slice(1)}var Gd=(e,t,o)=>{let r=Jx(o);return{[`${e.componentCls}${e.componentCls}-${t}:not(${e.componentCls}-disabled)`]:{[`&${e.componentCls}-outlined`]:{backgroundColor:e[`color${r}Bg`],borderColor:e[`color${r}Border`],color:e[`color${o}`]},[`&${e.componentCls}-solid`]:{backgroundColor:e[`color${o}`],borderColor:e[`color${o}`]},[`&${e.componentCls}-filled`]:{backgroundColor:e[`color${r}Bg`],color:e[`color${o}`]}}}},d1=Fn(["Tag","status"],e=>{let t=Jl(e);return[Gd(t,"success","Success"),Gd(t,"processing","Info"),Gd(t,"error","Error"),Gd(t,"warning","Warning")]},ec);var Q_=eo.forwardRef((e,t)=>{let{prefixCls:o,className:r,rootClassName:n,style:i,children:s,icon:a,color:c,variant:l,onClose:u,bordered:f,disabled:d,href:m,target:p,styles:g,classNames:y,...x}=e,{getPrefixCls:b,direction:h,className:S,variant:C,style:R,classNames:v,styles:w}=De("tag"),[T,I,P,N,O]=Zx(e,C),_=P||N,M=eo.useContext(Xt),A=d??M,{tag:V}=eo.useContext(Se),[F,G]=eo.useState(!0),z=tt(x,["closeIcon","closable"]),B={...e,color:I,variant:T,disabled:A},k=Ee(R),W=Ee(i),[j,L]=je([v,y],[w,k,g,W],{props:B}),U=eo.useMemo(()=>{let ae=L.root;return A||(ae={...O,...ae}),ae},[L.root,O,A]),X=b("tag",o),[Y,q]=Aa(X),D=E(X,S,j.root,`${X}-${T}`,{[`${X}-${I}`]:_,[`${X}-hidden`]:!F,[`${X}-rtl`]:h==="rtl",[`${X}-disabled`]:A},r,n,Y,q),K=ae=>{A||(ae.stopPropagation(),u?.(ae),!ae.defaultPrevented&&(m&&ae.preventDefault(),G(!1)))},H=ae=>{(ae.key==="Enter"||ae.key===" ")&&(ae.preventDefault(),ae.repeat||ae.currentTarget.click())},[,Q]=of(na(e),na(V),{closable:!1,closeIconRender:ae=>{let ie=eo.createElement("span",{role:"button",tabIndex:A?-1:0,"aria-disabled":A||void 0,className:E(`${X}-close-icon`,j.close),onClick:K,onKeyDown:H,style:L.close},ae);return jp(ae,ie,be=>({onClick:ee=>{be?.onClick?.(ee),K(ee)},onKeyDown:ee=>{be?.onKeyDown?.(ee),ee.defaultPrevented||H(ee)},role:"button",tabIndex:A?-1:0,"aria-disabled":A||void 0,className:E(be?.className,`${X}-close-icon`,j.close),style:{...L.close,...be?.style}}))}}),Z=ot(x.onClick)||s&&s.type==="a",te=Qo(a,{className:E(eo.isValidElement(a)?a.props?.className:void 0,j.icon),style:L.icon}),se=te?eo.createElement(eo.Fragment,null,te,ut(s)&&eo.createElement("span",{className:j.content,style:L.content},s)):s,oe=eo.createElement(m?"a":"span",{...z,ref:t,className:D,style:U,href:A?void 0:m,target:p,onClick:A?void 0:z.onClick,...m&&A?{"aria-disabled":!0}:{}},se,Q,P&&eo.createElement(f1,{key:"preset",prefixCls:X}),N&&eo.createElement(d1,{key:"status",prefixCls:X}));return Z?eo.createElement(pi,{component:"Tag"},oe):oe}),eb=Q_;eb.CheckableTag=qd;eb.CheckableTagGroup=c1;var m1=eb;var mt=$(require("react"));var Xd=(e,t,o)=>({background:e,[`${o}-icon`]:{color:t}}),Z_=e=>{let{componentCls:t,motionDurationSlow:o,marginXS:r,marginSM:n,fontSize:i,fontSizeLG:s,lineHeight:a,motionEaseInOutCirc:c,borderRadius:l,withDescriptionIconSize:u,colorText:f,colorTextHeading:d,withDescriptionPadding:m,defaultPadding:p,lineWidth:g,lineType:y,colorSuccessBorder:x,colorWarningBorder:b,colorErrorBorder:h,colorInfoBorder:S}=e;return{[t]:{...ft(e),position:"relative",display:"flex",alignItems:"center",padding:p,wordWrap:"break-word",borderRadius:l,borderWidth:J(g),borderStyle:y,[`&${t}-success`]:{borderColor:x},[`&${t}-info`]:{borderColor:S},[`&${t}-warning`]:{borderColor:b},[`&${t}-error`]:{borderColor:h},[`&${t}-filled`]:{borderColor:"transparent"},[`&${t}-rtl`]:{direction:"rtl"},[`${t}-section`]:{flex:1,minWidth:0},[`${t}-icon`]:{marginInlineEnd:r,lineHeight:0},"&-description":{display:"none",fontSize:i,lineHeight:a},"&-title":{color:d},[`&${t}-motion-leave`]:{overflow:"hidden",opacity:1,transition:["max-height","opacity","padding-top","padding-bottom","margin-bottom"].map(C=>`${C} ${o} ${c}`).join(", ")},[`&${t}-motion-leave-active`]:{maxHeight:0,marginBottom:"0 !important",paddingTop:0,paddingBottom:0,opacity:0},[`&${t}-with-description`]:{alignItems:"flex-start",padding:m,[`${t}-icon`]:{marginInlineEnd:n,fontSize:u,lineHeight:0},[`${t}-title`]:{display:"block",marginBottom:r,color:d,fontSize:s},[`${t}-description`]:{display:"block",color:f}},[`&${t}-banner`]:{marginBottom:0,border:"0 !important",borderRadius:0}}}},J_=e=>{let{componentCls:t,colorSuccess:o,colorSuccessBg:r,colorWarning:n,colorWarningBg:i,colorError:s,colorErrorBg:a,colorInfo:c,colorInfoBg:l}=e;return{[t]:{"&-success":Xd(r,o,t),"&-info":Xd(l,c,t),"&-warning":Xd(i,n,t),"&-error":{...Xd(a,s,t),[`${t}-description > pre`]:{margin:0,padding:0}}}}},eL=e=>{let{componentCls:t,iconCls:o,motionDurationMid:r,marginXS:n,fontSizeIcon:i,colorIcon:s,colorIconHover:a}=e;return{[t]:{[`${t}-actions`]:{marginInlineStart:n},[`${t}-close-icon`]:{marginInlineStart:n,padding:0,overflow:"hidden",fontSize:i,lineHeight:J(i),backgroundColor:"transparent",border:"none",cursor:"pointer",...Jr(e),[`${o}-close`]:{color:s,transition:`color ${r}`,"&:hover":{color:a}}},"&-close-text":{color:s,transition:`color ${r}`,"&:hover":{color:a}}}}},tL=e=>({borderRadius:e.borderRadiusLG,withDescriptionIconSize:e.fontSizeHeading3,defaultPadding:`${e.paddingContentVerticalSM}px 12px`,withDescriptionPadding:`${e.paddingMD}px ${e.paddingContentHorizontalLG}px`}),p1=Be("Alert",e=>[Z_(e),J_(e),eL(e)],tL);var oL=e=>{let{icon:t,type:o,className:r,style:n,successIcon:i,infoIcon:s,warningIcon:a,errorIcon:c}=e;return mt.createElement("span",{className:r,style:n},t??{success:i??mt.createElement(ra,null),info:s??mt.createElement(Zu,null),error:c??mt.createElement(gn,null),warning:a??mt.createElement(Yu,null)}[o])},rL=e=>{let{isClosable:t,prefixCls:o,closeIcon:r,handleClose:n,ariaProps:i,className:s,style:a}=e,c=r===!0||r===void 0?mt.createElement(fr,null):r;return t?mt.createElement("button",{type:"button",onClick:n,className:E(`${o}-close-icon`,s),tabIndex:0,style:a,...i},c):null},nL=mt.forwardRef((e,t)=>{let{description:o,prefixCls:r,message:n,title:i,banner:s,className:a,rootClassName:c,style:l,onMouseEnter:u,onMouseLeave:f,onClick:d,afterClose:m,showIcon:p,closable:g,closeText:y,closeIcon:x,action:b,id:h,styles:S,classNames:C,...R}=e,v=i??n,[w,T]=mt.useState(!1),I=mt.useRef(null);mt.useImperativeHandle(t,()=>({nativeElement:I.current}));let{getPrefixCls:P,direction:N,variant:O,closable:_,closeIcon:M,className:A,style:V,classNames:F,styles:G,successIcon:z,infoIcon:B,warningIcon:k,errorIcon:W}=De("alert"),j=P("alert",r),[L,U]=p1(j),{onClose:X,afterClose:Y}=ze(g)?g:{},q=xe=>{T(!0),(X??e.onClose)?.(xe)},D=mt.useMemo(()=>e.type!==void 0?e.type:s?"warning":"info",[e.type,s]),K=e.variant??O??"outlined",H=mt.useMemo(()=>ze(g)||y?!0:typeof g=="boolean"?g:x!==!1&&lo(x)?!0:!!_,[y,x,g,_]),Q=s&&p===void 0?!0:p,Z={...e,prefixCls:j,variant:K,type:D,showIcon:Q,closable:H},te=Ee(V),se=Ee(l),[re,oe]=je([F,C],[G,te,S,se],{props:Z}),ae=E(j,`${j}-${D}`,`${j}-${K}`,{[`${j}-with-description`]:ut(o),[`${j}-no-icon`]:!Q,[`${j}-banner`]:!!s,[`${j}-rtl`]:N==="rtl"},A,a,c,re.root,U,L),ie=Ht(R,{aria:!0,data:!0}),be=mt.useMemo(()=>ze(g)&&g.closeIcon?g.closeIcon:y||(x!==void 0?x:ze(_)&&_.closeIcon?_.closeIcon:M),[x,g,_,y,M]),ee=mt.useMemo(()=>{let xe=g??_;return ze(xe)?Ht(xe,{data:!0,aria:!0}):{}},[g,_]);return mt.createElement(oo,{visible:!w,motionName:`${j}-motion`,motionAppear:!1,motionEnter:!1,onLeaveStart:xe=>({maxHeight:xe.offsetHeight}),onLeaveEnd:Y??m},({className:xe,style:fe},_e)=>mt.createElement("div",{id:h,ref:gt(I,_e),"data-show":!w,className:E(ae,xe),style:{...oe.root,...fe},onMouseEnter:u,onMouseLeave:f,onClick:d,role:"alert",...ie},Q?mt.createElement(oL,{className:E(`${j}-icon`,re.icon),style:oe.icon,description:o,icon:e.icon,prefixCls:j,type:D,successIcon:z,infoIcon:B,warningIcon:k,errorIcon:W}):null,mt.createElement("div",{className:E(`${j}-section`,re.section),style:oe.section},ut(v)?mt.createElement("div",{className:E(`${j}-title`,re.title),style:oe.title},v):null,ut(o)?mt.createElement("div",{className:E(`${j}-description`,re.description),style:oe.description},o):null),ut(b)?mt.createElement("div",{className:E(`${j}-actions`,re.actions),style:oe.actions},b):null,mt.createElement(rL,{className:re.close,style:oe.close,isClosable:H,prefixCls:j,closeIcon:be,handleClose:q,ariaProps:ee})))}),Kd=nL;function g1(e,t,o){return t=fi(t),Lu(e,ul()?Reflect.construct(t,o||[],fi(e).constructor):t.apply(e,o))}var tc=$(require("react"));var iL=(function(e){function t(){var o;return Mr(this,t),o=g1(this,t,arguments),o.state={error:void 0,info:{}},o}return Js(t,e),Or(t,[{key:"componentDidCatch",value:function(r,n){this.setState({error:r,info:n})}},{key:"render",value:function(){let{message:r,title:n,description:i,id:s,children:a}=this.props,{error:c,info:l}=this.state,u=n??r,f=l?.componentStack||null,d=lo(u)?u:c?.toString(),m=lo(i)?i:f;return c?tc.createElement(Kd,{id:s,type:"error",title:d,description:tc.createElement("pre",{style:{fontSize:"0.9em",overflowX:"auto"}},m)}):a}}])})(tc.PureComponent),h1=iL;var x1=Kd;x1.ErrorBoundary=h1;var b1=x1;var _1=$($1()),L1=$(A1());module.exports={antd:{ConfigProvider:di,theme:WS,Modal:HR,Select:yw,Switch:Ew,Button:ww,Input:S$,Progress:Q$,Checkbox:o1,Segmented:l1,Tag:m1,Alert:b1},localeZh:_1.default,localeEn:L1.default};
/*! Bundled license information:

react-is/cjs/react-is.production.js:
  (**
   * @license React
   * react-is.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/

    })(__imAntdModule, __imAntdModule.exports, require);
    const __imAntdBundle = __imAntdModule.exports;
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
    const antd = __imAntdBundle.antd;
    const { ConfigProvider, theme, Modal, Select, Switch, Button: AntdButton, Input, Progress, Checkbox, Segmented, Tag, Alert } = antd;
    function Button(props) {
      return React.createElement(AntdButton, Object.assign({ shape: "round", size: "middle" }, props));
    }
    const zhCN = __imAntdBundle.localeZh;
    const enUS = __imAntdBundle.localeEn;
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

      if (id === "discord") {
        return svg("0 0 24 24", [
          h("path", { key: "mark", fill: "#5865F2", d: "M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 0-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 0-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" }),
        ]);
      }

      if (id === "slack") {
        return svg("0 0 24 24", [
          h("path", { key: "mark", fill: "#4A154B", d: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" }),
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
      const [expanded, setExpanded] = useState({ weixin: true });
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
} });
