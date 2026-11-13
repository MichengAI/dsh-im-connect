/**
 * dsh-im-connect 浏览器端：IM助理设置页 + 工作区频道槽。
 */
window.__ModuleLoader__.load({
  id: "@michengai/dsh-im-connect",
  factory: (require) => {
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
    const PrimitiveSegmentedControl = primitives.SegmentedControl;
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
    const IconListPenOutline = pickHostIcon("IconListPenOutlineMedium", "IconListPenOutlineRegular", "IconListPenOutline", "IconEditOutlineRegular", "IconEditOutline");
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
    const IM_LOCALES = {
      zh: {
        "account.autoNameNote": "绑定成功后会自动生成账号名，无需手动填写。需要区分使用者时，可在账号行填写备注。",
        "account.count": "{count} 个账号",
        "account.currentWorkspace": "当前工作区",
        "account.defaultName": "{channel}账号 {count}",
        "account.presetUnavailable": "预设不可用",
        "account.privateAccess": "私聊准入",
        "account.privateAll": "允许所有私聊用户",
        "account.privateApproved": "仅已批准用户",
        "account.proxyCustom": "手动配置",
        "account.proxyDirect": "直接连接",
        "account.proxyInherit": "跟随宿主",
        "account.proxyMode": "网络代理",
        "account.proxyNote": "仅影响当前账号；保存后自动重连生效。",
        "account.proxySaved": "代理地址已保存；留空保存可保留当前地址。",
        "account.proxyUrl": "代理地址",
        "account.receive": "接收消息",
        "account.receiveDescription": "关闭后保留账号配置，但不接收新消息",
        "account.remark": "名称备注",
        "account.remarkNote": "只在本机设置页区分账号，留空恢复自动名称。",
        "account.removeConfirm": "确定移除这个账号？本机保存的配置和凭据将一并删除。",
        "account.rename": "修改名称备注",
        "account.seconds": "秒",
        "account.segmentFull": "完整发送",
        "account.segmentGap": "发送间隔",
        "account.segmentGapInvalid": "请填写 0 到 60 之间的秒数",
        "account.segmentGapMax": "最大间隔",
        "account.segmentGapMin": "最小间隔",
        "account.segmentGapOrder": "上限不能低于下限",
        "account.segmentReply": "分段回复",
        "account.segmentReplyNote": "选择分段发送时助手会把一次回复拆成多条短消息，在分隔标记处切开逐条发送；完整发送时仍是一条完整回复。",
        "account.segmentSplit": "分段发送",
        "account.selectModel": "请选择模型",
        "account.selectPermission": "请选择权限",
        "account.selectWorkspace": "请选择工作区",
        "account.sendMode": "发送方式",
        "account.sendQueue": "排队发送",
        "account.sendSteer": "插话发送",
        "account.sendSteerNote": "插话发送会把消息作为补充指令立即交给运行中的任务；任务空闲时与排队发送相同。",
        "account.sessionIdle": "空闲新开会话",
        "account.sessionIdleHour": "{n} 小时",
        "account.sessionIdleHours": "{n} 小时",
        "account.sessionIdleMin": "{n} 分钟",
        "account.sessionIdleNote": "距上一条消息超过该时间后再收到新消息，将开启新会话；旧会话仍可用 /sessions 找回。设为 0 表示关闭。",
        "account.sessionIdleOff": "关闭（保持原会话）",
        "account.statusNotConnected": "未连接",
        "account.statusProcessing": "处理中…",
        "account.telegramFreeChatGroups": "免 @ 群号白名单",
        "account.telegramFreeChatGroupsInvalid": "未检测到有效群 ID。群 ID 通常为负数纯数字（如 -1001234567890），亦可直接粘贴 Telegram 网页版群聊链接。",
        "account.telegramFreeChatGroupsPartial": "有 {count} 个群号无法识别，将被忽略；请填负数群号（如 -1001234567890）或 Telegram 网页版群聊链接。",
        "account.telegramGroupPolicy": "群聊触发策略",
        "account.telegramGroupPolicyAddressed": "仅 @提及 或回复时响应（默认）",
        "account.telegramGroupPolicyAlways": "所有群消息均响应",
        "account.telegramGroupPolicyCustom": "仅指定群免 @ 响应",
        "account.telegramGroupPolicyNote": "仅影响当前账号群聊；若需普通消息送达，请将 Bot 设为群管理员或在 @BotFather 中关闭隐私模式（/setprivacy → Disable）。",
        "account.telegramThinkingDisplay": "展示思考过程",
        "account.telegramThinkingDisplayCollapsed": "折叠展示",
        "account.telegramThinkingDisplayNote": "开启后，模型的思考过程会以可折叠引用块单独发送，点击可展开查看。群聊中所有成员均可展开，请在允许分享思考的部署开启。",
        "account.telegramThinkingDisplayOff": "关闭",
        "account.workspace": "工作区",
        "action.addAccount": "添加账号",
        "action.approve": "批准",
        "action.cancel": "取消",
        "action.checkConnection": "诊断连接",
        "action.confirm": "确认",
        "action.deny": "拒绝",
        "action.generateQr": "生成二维码",
        "action.more": "{channel} 更多",
        "action.reconnectAccount": "重新连接",
        "action.removeAccount": "移除接入",
        "action.saving": "保存中…",
        "action.settings": "设置",
        "bind.expire": "二维码 {time} 后过期",
        "bind.generating": "正在生成…",
        "bind.manual": "手动配置",
        "bind.newIdentity": "检测到新的账号身份，已创建新账号",
        "bind.qrAlt": "{channel} 绑定二维码",
        "bind.quick": "快捷绑定（推荐）",
        "bind.refresh": "重新生成二维码",
        "bind.retry": "请重新生成二维码",
        "bind.saving": "正在保存账号…",
        "bind.scanned": "已扫码，请在手机上确认",
        "bind.success": "绑定成功，频道已连接",
        "bind.tabsAria": "绑定方式",
        "bind.title": "配置 {channel}",
        "channel.dingtalk": "钉钉",
        "channel.discord": "Discord",
        "channel.feishu": "飞书",
        "channel.lark": "Lark",
        "channel.qq": "QQ",
        "channel.slack": "Slack",
        "channel.telegram": "Telegram",
        "channel.wecom": "企业微信",
        "channel.weixin": "微信",
        "command.disabled": "仅正常对话",
        "command.dm": "私聊命令",
        "command.enabled": "可以执行命令",
        "command.group": "群聊命令",
        "composer.addWorkspace": "添加工作区…",
        "composer.noModels": "暂无模型",
        "composer.noWorkspaces": "暂无工作区",
        "composer.permission": "权限",
        "composer.workspaceRequired": "请先添加工作区，否则无法保存",
        "connection.checkFailed": "状态检查未完成，请重试；仍失败时查看本机日志。",
        "connection.checkedAt": "检查时间",
        "connection.checking": "检查中…",
        "connection.connected": "已连接",
        "connection.connecting": "连接中",
        "connection.disconnected": "未连接",
        "connection.error": "连接异常",
        "connection.next.connected": "可在原聊天发送消息验证收发；私聊仍需符合准入设置。",
        "connection.next.connecting": "请稍后再次检查；等待扫码时请完成手机确认。",
        "connection.next.disconnected": "请重新连接；需要扫码的渠道可重新添加绑定。",
        "connection.next.error": "请尝试重新连接；仍有异常时查看本机日志。",
        "connection.next.reconnecting": "渠道正在尝试恢复，请稍后再次检查。",
        "connection.next.stopped": "请点击重新连接以启动账号。",
        "connection.next.unknown": "暂时无法确认状态，请稍后再检查或查看本机日志。",
        "connection.paused": "接收已暂停",
        "connection.receiveOff": "接收开关已关闭；请在账号列表开启后再发送消息。",
        "connection.receiveOn": "接收开关已开启",
        "connection.receiveUnknown": "无法读取接收开关，请重启 DSH 并刷新页面。",
        "connection.reconnecting": "重连中",
        "connection.restartRequired": "前后端版本不一致。请完整重启 DSH 并刷新页面后重新诊断。",
        "connection.scope": "仅检查本机渠道运行状态，未验证平台凭据或消息收发。",
        "connection.stopped": "已停止",
        "connection.title": "本次状态检查",
        "connection.unknown": "状态未知",
        "copy": "复制",
        "diagnostic.auth": "凭据缺失或失效，请重新配置或扫码绑定。",
        "diagnostic.bot": "机器人身份查询",
        "diagnostic.cancelled": "诊断已取消，未确认连接状态。",
        "diagnostic.changed": "账号状态已变化，请重新诊断。",
        "diagnostic.config": "微信配置查询（getconfig）",
        "diagnostic.credentials": "应用凭据验证",
        "diagnostic.failed": "失败",
        "diagnostic.gateway": "网关查询",
        "diagnostic.heartbeat": "企微连接心跳（ping）",
        "diagnostic.invalid-response": "平台响应不完整或格式不符，无法确认可用。",
        "diagnostic.local-state": "无法读取凭据或初始化本地账号状态，请检查本机配置及文件访问权限。",
        "diagnostic.missing-context": "缺少原聊天上下文，请用扫码账号先发送一条消息后重试。",
        "diagnostic.network": "网络请求失败，请检查网络或代理。",
        "diagnostic.not-connected": "当前没有可验证的连接，请先重新连接。",
        "diagnostic.ok": "平台已返回有效响应",
        "diagnostic.passed": "通过",
        "diagnostic.permission": "平台拒绝访问，请检查应用权限。",
        "diagnostic.rate-limit": "平台限流，请稍后再试。",
        "diagnostic.rejected": "平台拒绝请求，请核对应用配置和权限。",
        "diagnostic.scope": "以下为本次平台接口或心跳检查结果。未发送测试消息，消息投递权限仍未验证。",
        "diagnostic.server": "平台服务异常，请稍后再试。",
        "diagnostic.timeout": "诊断超时，请检查网络后重试。",
        "diagnostic.title": "连接诊断",
        "diagnostic.unsupported": "当前 SDK 或配置不支持此诊断，未判定为通过。",
        "diagnostic.unverified": "未验证",
        "diagnostic.webhook": "Webhook 冲突检查",
        "diagnostic.webhook-conflict": "已设置 Webhook，与当前轮询方式冲突；请在其他服务停用该机器人的 Webhook。",
        "entry.location.both": "全部显示",
        "entry.location.desc": "选择即时通信功能在界面上的显示入口（侧边栏或设置页面）",
        "entry.location.settings": "仅设置",
        "entry.location.sidebar": "仅侧边栏",
        "entry.location.title": "入口展示位置",
        "error.action": "操作失败",
        "error.addWorkspace": "新增工作区失败",
        "error.chooseWorkspace": "请选择工作区目录",
        "error.connection": "无法连接本机 IM 助理接口",
        "error.detailsInLog": "操作失败，请查看服务器日志。",
        "error.load": "加载失败",
        "error.loadAssistant": "无法加载账号配置",
        "error.noModels": "当前 Host 还没有可用模型，请先在网页里配置提供商",
        "error.qr": "无法生成二维码",
        "error.request": "请求失败",
        "error.save": "保存失败",
        "error.workspaceUnavailable": "当前 Host 无法新增工作区",
        "field.dingtalk.clientId": "Client ID（原 AppKey）",
        "field.dingtalk.clientSecret": "Client Secret（原 AppSecret）",
        "field.discord.token": "Bot Token",
        "field.qq.appId": "AppID",
        "field.qq.appSecret": "AppSecret",
        "field.slack.appToken": "App Token（xapp- 开头）",
        "field.slack.token": "Bot Token（xoxb- 开头）",
        "field.telegram.token": "Bot Token",
        "field.wecom.botId": "Bot ID",
        "field.wecom.secret": "Secret",
        "hover.copied": "已复制",
        "loading": "加载中…",
        "pending.notice": "有访问请求。批准后该用户才能驱动本机助手。",
        "permission.fullAccess": "完全访问",
        "permission.readOnly": "只读",
        "permission.workspaceWrite": "工作区写入",
        "qr.default": "请使用对应 App 扫描二维码",
        "qr.dingtalk": "请使用钉钉扫描二维码，自动创建机器人",
        "qr.feishu": "请使用飞书扫描二维码，将自动创建机器人",
        "qr.lark": "请使用 Lark 扫描二维码完成配对",
        "qr.qq": "请使用手机 QQ 扫描二维码，创建开放平台机器人",
        "qr.wecom": "请使用企业微信扫描二维码，快捷绑定机器人",
        "qr.weixin": "请使用微信扫描二维码完成绑定",
        "rail.addChannel": "添加频道",
        "rail.archive": "归档会话",
        "rail.archived": "已归档",
        "rail.byChannel": "按频道",
        "rail.byWorkspace": "按工作区",
        "rail.byWorkspaceTree": "按工作区树",
        "rail.channelSettings": "频道设置",
        "rail.channels": "频道",
        "rail.clearSearch": "清除搜索",
        "rail.compactAnswer": "待回答",
        "rail.compactApproval": "待审批",
        "rail.compactPlan": "计划待审",
        "rail.completed": "已完成",
        "rail.deleteSession": "删除会话",
        "rail.deleteSessionCancel": "取消",
        "rail.deleteSessionClose": "关闭",
        "rail.deleteSessionConfirm": "删除会话",
        "rail.deleteSessionDescription": "将永久删除会话“{name}”及其子代理（含正在运行的）和全部记录（对话内容、统计、缓存），此操作不可恢复。",
        "rail.deleteSessionFailed": "删除会话失败：{message}",
        "rail.deleteSessionPending": "正在删除会话…",
        "rail.empty": "还没有频道会话。先在设置 → IM助理 里连接渠道，并给机器人发一条消息。",
        "rail.filter": "筛选",
        "rail.fork": "分叉会话",
        "rail.group": "分组方式",
        "rail.groupActions": "“{name}”的频道操作",
        "rail.groupReadOnly": "频道分组不能在这里重命名或删除。",
        "rail.idle": "空闲",
        "rail.list": "单列表",
        "rail.onlyArchived": "仅显示已归档",
        "rail.planReview": "计划待审",
        "rail.recent": "最近更新",
        "rail.rename": "重命名",
        "rail.renameAria": "重命名会话",
        "rail.running": "运行中",
        "rail.search": "搜索",
        "rail.searchPlaceholder": "搜索会话...",
        "rail.sessions": "会话",
        "rail.showArchived": "显示已归档",
        "rail.sort": "排序方式",
        "rail.subagents": "{n} 个子代理运行中",
        "rail.tabsAria": "工作区分类",
        "rail.tasks": "任务",
        "rail.treeUnavailable": "当前宿主未提供官方任务树。",
        "rail.unarchive": "恢复会话",
        "rail.ungrouped": "未分组",
        "rail.waitingAnswer": "等待回答",
        "rail.waitingApproval": "等待审批",
        "rail.workspace": "工作区",
        "server.accessDenied": "未授权：请管理员在设置 → IM助理 中批准你的访问。",
        "server.accountConnectFailed": "账号连接失败，请查看本机日志",
        "server.accountMissing": "账号不存在",
        "server.accountReconnectFailed": "重新连接失败，请查看本机日志",
        "server.channelUnconfigured": "渠道未配置",
        "server.createWorkspace": "请先添加工作区",
        "server.missingCredentials": "凭据不足，无法启动渠道",
        "server.qrExpired": "二维码已过期",
        "server.qrIncomplete": "扫码未完成",
        "server.qrUnsupported": "该渠道不支持扫码绑定",
        "server.remarkControl": "账号备注不能包含换行或控制字符",
        "server.remarkTooLong": "账号备注不能超过 40 个字符",
        "server.selectAccountSettings": "请选择提供商、模型、工作区或权限",
        "server.selectModel": "请选择提供商和模型",
        "server.selectPermission": "请选择权限",
        "server.selectWorkspace": "请选择工作区",
        "server.sessionMissing": "会话不存在",
        "server.unknownChannel": "未知渠道",
        "settings.aria": "IM助理",
        "settings.description": "管理各渠道账号。每个账号独立选择工作区、模型和权限，配置仅保存在本机。",
        "settings.feedback": "问题反馈",
        "settings.label": "IM助理",
        "settings.publicChatNotice": "未批准用户可以发起聊天，但不能批准工具调用。",
        "settings.title": "IM助理",
        "settings.viewProject": "GitHub",
        "sidebar.entry.desc": "在侧栏显示即时通讯管理入口。设置里的入口不变。",
        "sidebar.entry.title": "侧边栏入口",
        "sidebar.entry.toggle": "切换侧边栏入口",
        "status.authenticating": "鉴权中",
        "status.connected": "已连接",
        "status.connectingSocket": "连接中",
        "status.connectionError": "连接错误",
        "status.connectionFailed": "连接失败",
        "status.disconnected": "已断开",
        "status.loggedIn": "已登录",
        "status.loggedInRecovered": "已登录（自动恢复）",
        "status.loggingIn": "登录中",
        "status.longConnection": "长连接已建立",
        "status.notLoggedIn": "未登录",
        "status.polling": "轮询中",
        "status.reconnectFailed": "重连失败",
        "status.reconnecting": "重连中",
        "status.saved": "已保存",
        "status.saving": "保存中…",
        "status.stopped": "已停止",
        "status.streamConnected": "Stream 已连接",
        "status.waitHandshake": "等待网关握手",
        "status.waitQr": "等待扫码",
        "taskTreeSessions.entry.desc": "在官方工作区任务树中显示各渠道会话。关闭后仅在侧栏「频道」页签中显示",
        "taskTreeSessions.entry.title": "在任务树显示 IM 会话",
        "taskTreeSessions.entry.toggle": "切换在任务树显示 IM 会话",
        "time.ago": "{t}前",
        "time.days": "{n}天",
        "time.hours": "{n}小时",
        "time.minutes": "{n}分钟",
        "time.months": "{n}个月",
        "time.now": "刚刚",
        "time.years": "{n}年",
      },
      en: {
        "account.autoNameNote": "The account name is generated automatically after setup. Add a remark on the account row if you need to tell users apart.",
        "account.count": "{count} accounts",
        "account.currentWorkspace": "Current workspace",
        "account.defaultName": "{channel} account {count}",
        "account.presetUnavailable": "Preset unavailable",
        "account.privateAccess": "Private chat access",
        "account.privateAll": "Allow all DM users",
        "account.privateApproved": "Approved users only",
        "account.proxyCustom": "Configure manually",
        "account.proxyDirect": "Connect directly",
        "account.proxyInherit": "Follow Host",
        "account.proxyMode": "Network proxy",
        "account.proxyNote": "Affects only this account. The channel reconnects automatically after saving.",
        "account.proxySaved": "A proxy address is saved. Leave the field blank to keep it.",
        "account.proxyUrl": "Proxy address",
        "account.receive": "Receive messages",
        "account.receiveDescription": "Turn this off to keep the account settings without receiving new messages",
        "account.remark": "Name remark",
        "account.remarkNote": "Shown only in settings to tell accounts apart. Leave blank to restore the automatic name.",
        "account.removeConfirm": "Remove this account? Its saved settings and credentials will also be deleted.",
        "account.rename": "Edit name remark",
        "account.seconds": "s",
        "account.segmentFull": "Send as whole",
        "account.segmentGap": "Send gap",
        "account.segmentGapInvalid": "Enter a number of seconds between 0 and 60.",
        "account.segmentGapMax": "Maximum gap",
        "account.segmentGapMin": "Minimum gap",
        "account.segmentGapOrder": "The maximum gap cannot be lower than the minimum.",
        "account.segmentReply": "Segmented replies",
        "account.segmentReplyNote": "When set to Send in segments, the assistant splits one reply into several short messages at the separator and sends them one by one; Send as whole keeps the entire reply in a single message.",
        "account.segmentSplit": "Send in segments",
        "account.selectModel": "Select a model",
        "account.selectPermission": "Select a permission",
        "account.selectWorkspace": "Select a workspace",
        "account.sendMode": "Send mode",
        "account.sendQueue": "Queue",
        "account.sendSteer": "Steer",
        "account.sendSteerNote": "Steer hands the message to the running task as additional instructions at its next step; when the task is idle it behaves like Queue.",
        "account.sessionIdle": "Idle session rotation",
        "account.sessionIdleHour": "{n} hr",
        "account.sessionIdleHours": "{n} hrs",
        "account.sessionIdleMin": "{n} min",
        "account.sessionIdleNote": "Start a new session when the next message arrives after this idle period; previous sessions remain accessible via /sessions. Set to 0 to disable.",
        "account.sessionIdleOff": "Disabled (keep session)",
        "account.statusNotConnected": "Not connected",
        "account.statusProcessing": "Processing…",
        "account.telegramFreeChatGroups": "Free-chat group IDs",
        "account.telegramFreeChatGroupsInvalid": "No valid group IDs detected. Group IDs are typically negative integers (e.g. -1001234567890), or paste a Telegram Web chat link.",
        "account.telegramFreeChatGroupsPartial": "{count} group ID(s) could not be recognized and will be ignored. Use negative integers (e.g. -1001234567890) or a Telegram Web chat link.",
        "account.telegramGroupPolicy": "Group trigger policy",
        "account.telegramGroupPolicyAddressed": "Only on @mention or reply (Default)",
        "account.telegramGroupPolicyAlways": "All group messages",
        "account.telegramGroupPolicyCustom": "Only specified groups without @",
        "account.telegramGroupPolicyNote": "Applies only to this account. To receive plain group messages, make the bot a group admin or disable privacy mode in @BotFather (/setprivacy → Disable).",
        "account.telegramThinkingDisplay": "Show thinking process",
        "account.telegramThinkingDisplayCollapsed": "Collapsed",
        "account.telegramThinkingDisplayNote": "When enabled, reasoning is sent as an expandable quote block that users can tap to expand. All group members can view expanded reasoning.",
        "account.telegramThinkingDisplayOff": "Off",
        "account.workspace": "Workspace",
        "action.addAccount": "Add account",
        "action.approve": "Approve",
        "action.cancel": "Cancel",
        "action.checkConnection": "Diagnose connection",
        "action.confirm": "Confirm",
        "action.deny": "Deny",
        "action.generateQr": "Generate QR code",
        "action.more": "More options for {channel}",
        "action.reconnectAccount": "Reconnect",
        "action.removeAccount": "Remove",
        "action.saving": "Saving…",
        "action.settings": "Settings",
        "bind.expire": "QR code expires in {time}",
        "bind.generating": "Generating…",
        "bind.manual": "Manual setup",
        "bind.newIdentity": "A new account identity was detected and a new account was created",
        "bind.qrAlt": "{channel} setup QR code",
        "bind.quick": "Quick setup (recommended)",
        "bind.refresh": "Generate a new QR code",
        "bind.retry": "Generate a new QR code",
        "bind.saving": "Saving account…",
        "bind.scanned": "Scanned. Confirm on your phone.",
        "bind.success": "Connected successfully",
        "bind.tabsAria": "Setup method",
        "bind.title": "Set up {channel}",
        "channel.dingtalk": "DingTalk",
        "channel.discord": "Discord",
        "channel.feishu": "Feishu",
        "channel.lark": "Lark",
        "channel.qq": "QQ",
        "channel.slack": "Slack",
        "channel.telegram": "Telegram",
        "channel.wecom": "WeCom",
        "channel.weixin": "WeChat",
        "command.disabled": "Conversation only",
        "command.dm": "DM commands",
        "command.enabled": "Commands enabled",
        "command.group": "Group commands",
        "composer.addWorkspace": "Add workspace…",
        "composer.noModels": "No models",
        "composer.noWorkspaces": "No workspaces",
        "composer.permission": "Permission",
        "composer.workspaceRequired": "Add a workspace before saving.",
        "connection.checkFailed": "The status check could not be completed. Retry, or check the local logs if it keeps failing.",
        "connection.checkedAt": "Checked at",
        "connection.checking": "Checking…",
        "connection.connected": "Connected",
        "connection.connecting": "Connecting",
        "connection.disconnected": "Disconnected",
        "connection.error": "Connection error",
        "connection.next.connected": "Send a message in the original chat to verify delivery. Private chats still follow access settings.",
        "connection.next.connecting": "Check again shortly. Complete confirmation on your phone if a QR scan is pending.",
        "connection.next.disconnected": "Reconnect the account. QR channels may need to be added again.",
        "connection.next.error": "Try reconnecting. If the issue persists, check the local logs.",
        "connection.next.reconnecting": "The channel is attempting to recover. Check again shortly.",
        "connection.next.stopped": "Select Reconnect to start the account.",
        "connection.next.unknown": "The current state could not be confirmed. Check again later or inspect the local logs.",
        "connection.paused": "Receiving paused",
        "connection.receiveOff": "Receiving is disabled. Enable it in the account list before sending messages.",
        "connection.receiveOn": "Receiving is enabled",
        "connection.receiveUnknown": "The receiving setting is unavailable. Restart DSH and refresh this page.",
        "connection.reconnecting": "Reconnecting",
        "connection.restartRequired": "The frontend and backend versions do not match. Fully restart DSH, refresh this page, and retry.",
        "connection.scope": "Checks local channel runtime only. Platform credentials and message delivery have not been verified.",
        "connection.stopped": "Stopped",
        "connection.title": "Status check result",
        "connection.unknown": "Status unknown",
        "copy": "Copy",
        "diagnostic.auth": "Credentials are missing or invalid. Configure or pair the account again.",
        "diagnostic.bot": "Bot identity query",
        "diagnostic.cancelled": "The check was cancelled. Connection status was not verified.",
        "diagnostic.changed": "The account state changed. Run diagnostics again.",
        "diagnostic.config": "WeChat configuration (getconfig)",
        "diagnostic.credentials": "Application credentials",
        "diagnostic.failed": "Failed",
        "diagnostic.gateway": "Gateway query",
        "diagnostic.heartbeat": "WeCom heartbeat (ping)",
        "diagnostic.invalid-response": "The platform response was incomplete or invalid. Availability could not be confirmed.",
        "diagnostic.local-state": "Could not read credentials or initialize local account state. Check local configuration and file permissions.",
        "diagnostic.missing-context": "The original chat context is missing. Send a message from the paired account and retry.",
        "diagnostic.network": "The request failed. Check your network or proxy.",
        "diagnostic.not-connected": "No active connection is available to verify. Reconnect first.",
        "diagnostic.ok": "The platform returned a valid response",
        "diagnostic.passed": "Passed",
        "diagnostic.permission": "Access was denied. Check application permissions.",
        "diagnostic.rate-limit": "The platform rate limit was reached. Retry later.",
        "diagnostic.rejected": "The platform rejected the request. Check application settings and permissions.",
        "diagnostic.scope": "Results from platform queries or a connection heartbeat in this check. No test messages were sent; message delivery permissions remain unverified.",
        "diagnostic.server": "The platform service failed. Retry later.",
        "diagnostic.timeout": "The check timed out. Check your network and retry.",
        "diagnostic.title": "Connection diagnostics",
        "diagnostic.unsupported": "The current SDK or configuration does not support this check. It has not passed.",
        "diagnostic.unverified": "Unverified",
        "diagnostic.webhook": "Webhook conflict check",
        "diagnostic.webhook-conflict": "A Webhook is configured and conflicts with polling. Disable this bot's Webhook in the other service.",
        "entry.location.both": "Both",
        "entry.location.desc": "Choose where IM Connect is displayed (sidebar or Settings page)",
        "entry.location.settings": "Settings only",
        "entry.location.sidebar": "Sidebar only",
        "entry.location.title": "Entry location",
        "error.action": "Action failed",
        "error.addWorkspace": "Could not add workspace",
        "error.chooseWorkspace": "Choose a workspace directory",
        "error.connection": "Could not connect to the local IM Assistant API",
        "error.detailsInLog": "The operation failed. Check the server logs for details.",
        "error.load": "Could not load",
        "error.loadAssistant": "Could not load account settings",
        "error.noModels": "No models are available in the Host. Configure a provider in the web app first.",
        "error.qr": "Could not generate a QR code",
        "error.request": "Request failed",
        "error.save": "Could not save",
        "error.workspaceUnavailable": "This Host cannot create workspaces",
        "field.dingtalk.clientId": "Client ID (formerly AppKey)",
        "field.dingtalk.clientSecret": "Client Secret (formerly AppSecret)",
        "field.discord.token": "Bot Token",
        "field.qq.appId": "AppID",
        "field.qq.appSecret": "AppSecret",
        "field.slack.appToken": "App Token (starts with xapp-)",
        "field.slack.token": "Bot Token (starts with xoxb-)",
        "field.telegram.token": "Bot Token",
        "field.wecom.botId": "Bot ID",
        "field.wecom.secret": "Secret",
        "hover.copied": "Copied",
        "loading": "Loading…",
        "pending.notice": "There are access requests. Approve a user before they can control the local assistant.",
        "permission.fullAccess": "Full access",
        "permission.readOnly": "Read Only",
        "permission.workspaceWrite": "Workspace Write",
        "qr.default": "Scan the QR code with the corresponding app",
        "qr.dingtalk": "Scan with DingTalk; a bot will be created automatically",
        "qr.feishu": "Scan with Feishu; a bot will be created automatically",
        "qr.lark": "Scan with Lark to pair",
        "qr.qq": "Scan with mobile QQ to create an Open Platform bot",
        "qr.wecom": "Scan with WeCom to quickly connect a bot",
        "qr.weixin": "Scan the QR code with WeChat to connect",
        "rail.addChannel": "Add channel",
        "rail.archive": "Archive session",
        "rail.archived": "Archived",
        "rail.byChannel": "By channel",
        "rail.byWorkspace": "By workspace",
        "rail.byWorkspaceTree": "Workspace Tree",
        "rail.channelSettings": "Channel settings",
        "rail.channels": "Channels",
        "rail.clearSearch": "Clear search",
        "rail.compactAnswer": "Answer",
        "rail.compactApproval": "Approval",
        "rail.compactPlan": "Plan review",
        "rail.completed": "Completed",
        "rail.deleteSession": "Delete session",
        "rail.deleteSessionCancel": "Cancel",
        "rail.deleteSessionClose": "Close",
        "rail.deleteSessionConfirm": "Delete session",
        "rail.deleteSessionDescription": "This permanently deletes session “{name}”, its child agents (including any that are still running), and all of its records (conversation, stats, cache). This cannot be undone.",
        "rail.deleteSessionFailed": "Could not delete the session: {message}",
        "rail.deleteSessionPending": "Deleting session…",
        "rail.empty": "No channel sessions yet. Connect a channel in Settings → IM Assistant, then send the bot a message.",
        "rail.filter": "Filter",
        "rail.fork": "Fork session",
        "rail.group": "Group by",
        "rail.groupActions": "Actions for {name}",
        "rail.groupReadOnly": "Channel groups cannot be renamed or deleted here.",
        "rail.idle": "Idle",
        "rail.list": "Single list",
        "rail.onlyArchived": "Archived only",
        "rail.planReview": "Plan to review",
        "rail.recent": "Recently updated",
        "rail.rename": "Rename",
        "rail.renameAria": "Rename session",
        "rail.running": "Running",
        "rail.search": "Search",
        "rail.searchPlaceholder": "Search sessions...",
        "rail.sessions": "Sessions",
        "rail.showArchived": "Show archived",
        "rail.sort": "Sort by",
        "rail.subagents": "{n} subagents running",
        "rail.tabsAria": "Workspace categories",
        "rail.tasks": "Tasks",
        "rail.treeUnavailable": "The official tree is unavailable in this Host.",
        "rail.unarchive": "Restore session",
        "rail.ungrouped": "Ungrouped",
        "rail.waitingAnswer": "Waiting for an answer",
        "rail.waitingApproval": "Waiting for approval",
        "rail.workspace": "Workspaces",
        "server.accessDenied": "Access denied: ask an administrator to approve you in Settings → IM Assistant.",
        "server.accountConnectFailed": "Could not connect the account. Check the local logs.",
        "server.accountMissing": "Account does not exist",
        "server.accountReconnectFailed": "Could not reconnect the account. Check the local logs.",
        "server.channelUnconfigured": "Channel is not configured",
        "server.createWorkspace": "Add a workspace first.",
        "server.missingCredentials": "The channel cannot start because credentials are missing",
        "server.qrExpired": "QR code has expired",
        "server.qrIncomplete": "QR setup was not completed",
        "server.qrUnsupported": "This channel does not support QR setup",
        "server.remarkControl": "Account remark cannot contain line breaks or control characters",
        "server.remarkTooLong": "Account remark cannot exceed 40 characters",
        "server.selectAccountSettings": "Select a provider, model, workspace, or permission setting",
        "server.selectModel": "Select a provider and model",
        "server.selectPermission": "Select a permission",
        "server.selectWorkspace": "Select a workspace",
        "server.sessionMissing": "Session does not exist",
        "server.unknownChannel": "Unknown channel",
        "settings.aria": "IM Assistant",
        "settings.description": "Manage accounts across channels. Each account has its own workspace, model, and permission settings, stored only on this machine.",
        "settings.feedback": "Issues",
        "settings.label": "IM Assistant",
        "settings.publicChatNotice": "Unapproved users can start chats, but they cannot approve tool calls.",
        "settings.title": "IM Assistant",
        "settings.viewProject": "GitHub",
        "sidebar.entry.desc": "Show IM Connect in the sidebar. The Settings entry stays either way.",
        "sidebar.entry.title": "Sidebar entry",
        "sidebar.entry.toggle": "Toggle sidebar entry",
        "status.authenticating": "Authenticating",
        "status.connected": "Connected",
        "status.connectingSocket": "Connecting",
        "status.connectionError": "Connection error",
        "status.connectionFailed": "Connection failed",
        "status.disconnected": "Disconnected",
        "status.loggedIn": "Signed in",
        "status.loggedInRecovered": "Signed in (restored)",
        "status.loggingIn": "Signing in",
        "status.longConnection": "Long connection established",
        "status.notLoggedIn": "Not signed in",
        "status.polling": "Polling",
        "status.reconnectFailed": "Reconnect failed",
        "status.reconnecting": "Reconnecting",
        "status.saved": "Saved",
        "status.saving": "Saving…",
        "status.stopped": "Stopped",
        "status.streamConnected": "Stream connected",
        "status.waitHandshake": "Waiting for gateway handshake",
        "status.waitQr": "Waiting for scan",
        "taskTreeSessions.entry.desc": "Show messaging channel sessions in the official workspace task tree. When disabled, sessions are shown only under the 'Channels' tab.",
        "taskTreeSessions.entry.title": "Show IM sessions in task tree",
        "taskTreeSessions.entry.toggle": "Toggle show IM sessions in task tree",
        "time.ago": "{t} ago",
        "time.days": "{n}d",
        "time.hours": "{n}h",
        "time.minutes": "{n}min",
        "time.months": "{n}mo",
        "time.now": "now",
        "time.years": "{n}y",
      },
      ja: {
        "account.autoNameNote": "連携成功後にアカウント名が自動生成されるため、手動入力は不要です。ユーザーを区別する必要がある場合は、アカウント行に備考を入力できます。",
        "account.count": "{count} 個のアカウント",
        "account.currentWorkspace": "現在のワークスペース",
        "account.defaultName": "{channel} アカウント {count}",
        "account.presetUnavailable": "プリセット利用不可",
        "account.privateAccess": "DMアクセス許可",
        "account.privateAll": "すべてのDMユーザーを許可",
        "account.privateApproved": "承認済みユーザーのみ",
        "account.proxyCustom": "手動設定",
        "account.proxyDirect": "直接接続",
        "account.proxyInherit": "ホストに従う",
        "account.proxyMode": "ネットワークプロキシ",
        "account.proxyNote": "現在のアカウントにのみ影響します。保存後に自動再接続して反映されます。",
        "account.proxySaved": "プロキシアドレスは保存されています。空のまま保存すると現在のアドレスが維持されます。",
        "account.proxyUrl": "プロキシアドレス",
        "account.receive": "メッセージを受信",
        "account.receiveDescription": "無効にするとアカウント設定を維持したまま新規メッセージを受信しません",
        "account.remark": "名称備考",
        "account.remarkNote": "本機の設定ページでのアカウント識別用です。空にすると自動名に戻ります。",
        "account.removeConfirm": "このアカウントを削除してもよろしいですか？ローカルに保存された設定と認証情報も削除されます。",
        "account.rename": "名称備考を編集",
        "account.seconds": "秒",
        "account.segmentFull": "まとめて送信",
        "account.segmentGap": "送信間隔",
        "account.segmentGapInvalid": "0〜60の秒数を入力してください",
        "account.segmentGapMax": "最大間隔",
        "account.segmentGapMin": "最小間隔",
        "account.segmentGapOrder": "上限を下限より小さくすることはできません",
        "account.segmentReply": "分割返信",
        "account.segmentReplyNote": "「分割して送信」を選択すると、アシスタントは区切り文字で複数の短いメッセージに分割して順次送信します。「まとめて送信」では1通の完全なメッセージとして送信されます。",
        "account.segmentSplit": "分割して送信",
        "account.selectModel": "モデルを選択してください",
        "account.selectPermission": "権限を選択してください",
        "account.selectWorkspace": "ワークスペースを選択してください",
        "account.sendMode": "送信モード",
        "account.sendQueue": "キュー送信",
        "account.sendSteer": "割り込み送信",
        "account.sendSteerNote": "割り込み送信は、実行中のタスクの次のステップに追加の指示としてメッセージを渡します。タスクがアイドル状態のときはキュー送信と同様に動作します。",
        "account.sessionIdle": "アイドル時の新規セッション作成",
        "account.sessionIdleHour": "{n} 時間",
        "account.sessionIdleHours": "{n} 時間",
        "account.sessionIdleMin": "{n} 分",
        "account.sessionIdleNote": "前のメッセージからこの時間を超えて新しいメッセージを受信した場合、新規セッションを開始します。以前のセッションは /sessions で確認できます。0 に設定すると無効になります。",
        "account.sessionIdleOff": "無効（元のセッションを維持）",
        "account.statusNotConnected": "未接続",
        "account.statusProcessing": "処理中…",
        "account.telegramFreeChatGroups": "@不要グループIDホワイトリスト",
        "account.telegramFreeChatGroupsInvalid": "有効なグループIDが検出されませんでした。グループIDは通常負の整数（例: -1001234567890）です。Telegram Webのリンクを直接貼り付けることも可能です。",
        "account.telegramFreeChatGroupsPartial": "{count} 個のグループIDを認識できなかったため無視されます。負のグループID（例: -1001234567890）またはTelegram Webのリンクを入力してください。",
        "account.telegramGroupPolicy": "グループトリガーポリシー",
        "account.telegramGroupPolicyAddressed": "@メンションまたは返信時のみ応答（デフォルト）",
        "account.telegramGroupPolicyAlways": "すべてのグループメッセージに応答",
        "account.telegramGroupPolicyCustom": "指定したグループのみ@なしで応答",
        "account.telegramGroupPolicyNote": "現在のアカウントのグループにのみ影響します。通常のメッセージを受信するには、Botをグループ管理者に設定するか、@BotFatherでプライバシーモードを無効にしてください（/setprivacy → Disable）。",
        "account.telegramThinkingDisplay": "思考プロセスの表示",
        "account.telegramThinkingDisplayCollapsed": "折りたたみ表示",
        "account.telegramThinkingDisplayNote": "有効にすると、思考過程が折りたたみ可能な引用ブロックとして送信され、タップして展開できます。グループ内の全員が展開して閲覧可能です。",
        "account.telegramThinkingDisplayOff": "オフ",
        "account.workspace": "ワークスペース",
        "action.addAccount": "アカウントを追加",
        "action.approve": "承認",
        "action.cancel": "キャンセル",
        "action.checkConnection": "接続診断",
        "action.confirm": "確認",
        "action.deny": "拒否",
        "action.generateQr": "QRコードを生成",
        "action.more": "{channel} その他の操作",
        "action.reconnectAccount": "再接続",
        "action.removeAccount": "連携を解除",
        "action.saving": "保存中…",
        "action.settings": "設定",
        "bind.expire": "QRコードの有効期限はあと {time}",
        "bind.generating": "生成中…",
        "bind.manual": "手動設定",
        "bind.newIdentity": "新しいアカウント情報が検出され、新しいアカウントが作成されました",
        "bind.qrAlt": "{channel} 連携用QRコード",
        "bind.quick": "クイック連携（推奨）",
        "bind.refresh": "QRコードを再生成",
        "bind.retry": "QRコードを再生成",
        "bind.saving": "アカウントを保存中…",
        "bind.scanned": "スキャン済み。スマートフォンで確認してください",
        "bind.success": "連携に成功し、接続されました",
        "bind.tabsAria": "連携方法",
        "bind.title": "{channel} を設定",
        "channel.dingtalk": "DingTalk",
        "channel.discord": "Discord",
        "channel.feishu": "Feishu",
        "channel.lark": "Lark",
        "channel.qq": "QQ",
        "channel.slack": "Slack",
        "channel.telegram": "Telegram",
        "channel.wecom": "WeCom",
        "channel.weixin": "WeChat",
        "command.disabled": "通常会話のみ",
        "command.dm": "DMコマンド",
        "command.enabled": "コマンド実行可能",
        "command.group": "グループコマンド",
        "composer.addWorkspace": "ワークスペースを追加…",
        "composer.noModels": "モデルがありません",
        "composer.noWorkspaces": "ワークスペースがありません",
        "composer.permission": "権限",
        "composer.workspaceRequired": "保存する前にワークスペースを追加してください",
        "connection.checkFailed": "ステータス確認が完了しませんでした。再試行するか、失敗が続く場合はローカルログを確認してください。",
        "connection.checkedAt": "確認日時",
        "connection.checking": "確認中…",
        "connection.connected": "接続済み",
        "connection.connecting": "接続中",
        "connection.disconnected": "未接続",
        "connection.error": "接続エラー",
        "connection.next.connected": "元のチャットでメッセージを送信して送受信を検証できます。ダイレクトメッセージはアクセス許可設定に従います。",
        "connection.next.connecting": "しばらくしてから再確認してください。QRコードスキャン待ちの場合はスマートフォンで確認を完了してください。",
        "connection.next.disconnected": "アカウントを再接続してください。QRコードチャンネルは再連携が必要な場合があります。",
        "connection.next.error": "再接続を試みてください。問題が解決しない場合はローカルログを確認してください。",
        "connection.next.reconnecting": "チャンネルが復旧を試みています。しばらくしてから再確認してください。",
        "connection.next.stopped": "「再接続」をクリックしてアカウントを起動してください。",
        "connection.next.unknown": "状態を確認できませんでした。後でもう一度確認するか、ローカルログを確認してください。",
        "connection.paused": "受信一時停止中",
        "connection.receiveOff": "メッセージ受信は無効です。メッセージを送信する前にアカウント一覧で有効にしてください。",
        "connection.receiveOn": "メッセージ受信は有効です",
        "connection.receiveUnknown": "受信設定を取得できません。DSHを再起動し、ページを再読み込みしてください。",
        "connection.reconnecting": "再接続中",
        "connection.restartRequired": "フロントエンドとバックエンドのバージョンが一致しません。DSHを完全に再起動し、このページを再読み込みしてから再試行してください。",
        "connection.scope": "ローカルチャンネルのランタイム状態のみ確認しました。プラットフォーム認証情報およびメッセージ送受信は未検証です。",
        "connection.stopped": "停止済み",
        "connection.title": "今回のステータス確認",
        "connection.unknown": "状態不明",
        "copy": "コピー",
        "diagnostic.auth": "認証情報が見つからないか無効です。再設定するかQRコードで再連携してください。",
        "diagnostic.bot": "ボット情報の取得",
        "diagnostic.cancelled": "診断がキャンセルされました。接続状態は未確認です。",
        "diagnostic.changed": "アカウント状態が変更されました。診断を再実行してください。",
        "diagnostic.config": "WeChat 設定確認（getconfig）",
        "diagnostic.credentials": "アプリ認証情報の検証",
        "diagnostic.failed": "失敗",
        "diagnostic.gateway": "ゲートウェイの確認",
        "diagnostic.heartbeat": "WeCom 接続ハートビート（ping）",
        "diagnostic.invalid-response": "プラットフォームの応答が不完全または形式が無効なため、利用可否を確認できません。",
        "diagnostic.local-state": "認証情報の読み取りまたはローカルアカウント状態の初期化に失敗しました。ローカル設定とファイルアクセス権限を確認してください。",
        "diagnostic.missing-context": "元のチャットコンテキストがありません。連携したアカウントからメッセージを1通送信してから再試行してください。",
        "diagnostic.network": "ネットワークリクエストに失敗しました。ネットワークまたはプロキシ設定を確認してください。",
        "diagnostic.not-connected": "検証可能な有効な接続がありません。まず再接続してください。",
        "diagnostic.ok": "プラットフォームから有効な応答を受信しました",
        "diagnostic.passed": "成功",
        "diagnostic.permission": "プラットフォームへのアクセスが拒否されました。アプリの権限を確認してください。",
        "diagnostic.rate-limit": "プラットフォームのレート制限に達しました。しばらく待ってから再試行してください。",
        "diagnostic.rejected": "プラットフォームによってリクエストが拒否されました。アプリ設定と権限を確認してください。",
        "diagnostic.scope": "以下は今回のプラットフォームAPIまたはハートビート確認の結果です。テストメッセージは送信されておらず、メッセージ配信権限は未検証です。",
        "diagnostic.server": "プラットフォームサービスでエラーが発生しました。しばらく待ってから再試行してください。",
        "diagnostic.timeout": "診断がタイムアウトしました。ネットワークを確認して再試行してください。",
        "diagnostic.title": "接続診断",
        "diagnostic.unsupported": "現在のSDKまたは設定はこの診断に対応していないため、成功と判定されませんでした。",
        "diagnostic.unverified": "未検証",
        "diagnostic.webhook": "Webhook 競合チェック",
        "diagnostic.webhook-conflict": "Webhook が設定されており、現在のポーリングと競合しています。他のサービスでこのボットの Webhook を無効化してください。",
        "entry.location.both": "すべて表示",
        "entry.location.desc": "IM機能の画面上の表示位置を選択します（サイドバーまたは設定ページ）",
        "entry.location.settings": "設定のみ",
        "entry.location.sidebar": "サイドバーのみ",
        "entry.location.title": "表示位置",
        "error.action": "操作に失敗しました",
        "error.addWorkspace": "ワークスペースの追加に失敗しました",
        "error.chooseWorkspace": "ワークスペースディレクトリを選択してください",
        "error.connection": "ローカルのIMアシスタントAPIに接続できません",
        "error.detailsInLog": "操作に失敗しました。サーバーログを確認してください。",
        "error.load": "読み込みに失敗しました",
        "error.loadAssistant": "アカウント設定を読み込めません",
        "error.noModels": "現在のホストで利用可能なモデルがありません。Web画面でプロバイダーを設定してください",
        "error.qr": "QRコードを生成できません",
        "error.request": "リクエストに失敗しました",
        "error.save": "保存に失敗しました",
        "error.workspaceUnavailable": "現在のホストではワークスペースを追加できません",
        "field.dingtalk.clientId": "Client ID（旧 AppKey）",
        "field.dingtalk.clientSecret": "Client Secret（旧 AppSecret）",
        "field.discord.token": "Bot Token",
        "field.qq.appId": "AppID",
        "field.qq.appSecret": "AppSecret",
        "field.slack.appToken": "App Token（xapp- で始まるもの）",
        "field.slack.token": "Bot Token（xoxb- で始まるもの）",
        "field.telegram.token": "Bot Token",
        "field.wecom.botId": "Bot ID",
        "field.wecom.secret": "Secret",
        "hover.copied": "コピー完了",
        "loading": "読み込み中…",
        "pending.notice": "アクセスリクエストがあります。承認されたユーザーのみがローカルアシスタントを操作できます。",
        "permission.fullAccess": "フルアクセス",
        "permission.readOnly": "読み取り専用",
        "permission.workspaceWrite": "ワークスペース書き込み",
        "qr.default": "対応するアプリでQRコードをスキャンしてください",
        "qr.dingtalk": "DingTalkでスキャンするとボットが自動作成されます",
        "qr.feishu": "Feishuでスキャンするとボットが自動作成されます",
        "qr.lark": "Larkでスキャンしてペアリングを完了してください",
        "qr.qq": "モバイルQQでスキャンし、オープンボットを作成してください",
        "qr.wecom": "WeComでQRコードをスキャンし、ボットを素早く連携します",
        "qr.weixin": "WeChatでQRコードをスキャンして連携を完了してください",
        "rail.addChannel": "チャンネルを追加",
        "rail.archive": "セッションをアーカイブ",
        "rail.archived": "アーカイブ済み",
        "rail.byChannel": "チャンネル別",
        "rail.byWorkspace": "ワークスペース別",
        "rail.byWorkspaceTree": "ワークスペースツリー別",
        "rail.channelSettings": "チャンネル設定",
        "rail.channels": "チャンネル",
        "rail.clearSearch": "検索をクリア",
        "rail.compactAnswer": "回答待ち",
        "rail.compactApproval": "承認待ち",
        "rail.compactPlan": "計画レビュー",
        "rail.completed": "完了",
        "rail.deleteSession": "セッションを削除",
        "rail.deleteSessionCancel": "キャンセル",
        "rail.deleteSessionClose": "閉じる",
        "rail.deleteSessionConfirm": "セッションを削除",
        "rail.deleteSessionDescription": "セッション「{name}」とその子エージェント（実行中のものを含む）およびすべての記録（会話内容、統計、キャッシュ）を完全に削除します。この操作は元に戻せません。",
        "rail.deleteSessionFailed": "セッションの削除に失敗しました: {message}",
        "rail.deleteSessionPending": "セッションを削除中…",
        "rail.empty": "チャンネルセッションはまだありません。設定 → IMアシスタント でチャンネルを連携し、ボットにメッセージを送信してください。",
        "rail.filter": "フィルター",
        "rail.fork": "セッションをフォーク",
        "rail.group": "グループ化",
        "rail.groupActions": "「{name}」のチャンネル操作",
        "rail.groupReadOnly": "チャンネルグループはここで名前変更や削除はできません。",
        "rail.idle": "待機中",
        "rail.list": "単一リスト",
        "rail.onlyArchived": "アーカイブのみ",
        "rail.planReview": "計画レビュー待ち",
        "rail.recent": "最近の更新",
        "rail.rename": "名前変更",
        "rail.renameAria": "セッション名を変更",
        "rail.running": "実行中",
        "rail.search": "検索",
        "rail.searchPlaceholder": "セッションを検索...",
        "rail.sessions": "セッション",
        "rail.showArchived": "アーカイブ済みを表示",
        "rail.sort": "並び替え",
        "rail.subagents": "{n} 個のサブエージェントが実行中",
        "rail.tabsAria": "ワークスペース分類",
        "rail.tasks": "タスク",
        "rail.treeUnavailable": "現在のホストでは公式タスクツリーが提供されていません。",
        "rail.unarchive": "セッションを復元",
        "rail.ungrouped": "未分類",
        "rail.waitingAnswer": "回答待ち",
        "rail.waitingApproval": "承認待ち",
        "rail.workspace": "ワークスペース",
        "server.accessDenied": "アクセス拒否: 管理者に 設定 → IMアシスタント でアクセス承認を依頼してください。",
        "server.accountConnectFailed": "アカウントの接続に失敗しました。ローカルログを確認してください",
        "server.accountMissing": "アカウントが存在しません",
        "server.accountReconnectFailed": "再接続に失敗しました。ローカルログを確認してください",
        "server.channelUnconfigured": "チャンネルが未設定です",
        "server.createWorkspace": "先にワークスペースを追加してください",
        "server.missingCredentials": "認証情報が不足しているため、チャンネルを起動できません",
        "server.qrExpired": "QRコードの有効期限が切れました",
        "server.qrIncomplete": "QRスキャンが完了していません",
        "server.qrUnsupported": "このチャンネルはQRコード連携に対応していません",
        "server.remarkControl": "アカウントの備考に改行や制御文字を含めることはできません",
        "server.remarkTooLong": "アカウントの備考は40文字以内である必要があります",
        "server.selectAccountSettings": "プロバイダー、モデル、ワークスペース、または権限を選択してください",
        "server.selectModel": "プロバイダーとモデルを選択してください",
        "server.selectPermission": "権限を選択してください",
        "server.selectWorkspace": "ワークスペースを選択してください",
        "server.sessionMissing": "セッションが存在しません",
        "server.unknownChannel": "未知のチャンネル",
        "settings.aria": "IMアシスタント",
        "settings.description": "各チャンネルのアカウントを管理します。アカウントごとにワークスペース、モデル、権限を個別に設定でき、設定は本機にのみ保存されます。",
        "settings.feedback": "フィードバック",
        "settings.label": "IMアシスタント",
        "settings.publicChatNotice": "未承認のユーザーはチャットを開始できますが、ツール呼び出しを承認することはできません。",
        "settings.title": "IMアシスタント",
        "settings.viewProject": "GitHub",
        "sidebar.entry.desc": "サイドバーにIM管理の入口を表示します。設定内の入口は常に維持されます。",
        "sidebar.entry.title": "サイドバーの表示",
        "sidebar.entry.toggle": "サイドバーの表示を切り替え",
        "status.authenticating": "認証中",
        "status.connected": "接続済み",
        "status.connectingSocket": "接続中",
        "status.connectionError": "接続エラー",
        "status.connectionFailed": "接続失敗",
        "status.disconnected": "切断済み",
        "status.loggedIn": "ログイン済み",
        "status.loggedInRecovered": "ログイン済み（自動復旧）",
        "status.loggingIn": "ログイン中",
        "status.longConnection": "常時接続確立済み",
        "status.notLoggedIn": "未ログイン",
        "status.polling": "ポーリング中",
        "status.reconnectFailed": "再接続失敗",
        "status.reconnecting": "再接続中",
        "status.saved": "保存済み",
        "status.saving": "保存中…",
        "status.stopped": "停止済み",
        "status.streamConnected": "Stream 接続済み",
        "status.waitHandshake": "ゲートウェイハンドシェイク待機中",
        "status.waitQr": "QRスキャン待ち",
        "taskTreeSessions.entry.desc": "公式ワークスペースのタスクツリーに各チャンネルのセッションを表示します。無効時はサイドバーの「チャンネル」タブにのみ表示されます。",
        "taskTreeSessions.entry.title": "タスクツリーにIMセッションを表示",
        "taskTreeSessions.entry.toggle": "タスクツリーでのIMセッション表示を切り替え",
        "time.ago": "{t}前",
        "time.days": "{n}日",
        "time.hours": "{n}時間",
        "time.minutes": "{n}分",
        "time.months": "{n}ヶ月",
        "time.now": "たった今",
        "time.years": "{n}年",
      },
      es: {
        "account.autoNameNote": "El nombre de la cuenta se genera automáticamente tras la vinculación. Añada una observación en la fila si necesita distinguir usuarios.",
        "account.count": "{count} cuentas",
        "account.currentWorkspace": "Espacio de trabajo actual",
        "account.defaultName": "Cuenta de {channel} {count}",
        "account.presetUnavailable": "Preajuste no disponible",
        "account.privateAccess": "Acceso a chat privado",
        "account.privateAll": "Permitir a todos los usuarios de DM",
        "account.privateApproved": "Solo usuarios aprobados",
        "account.proxyCustom": "Configuración manual",
        "account.proxyDirect": "Conexión directa",
        "account.proxyInherit": "Seguir host",
        "account.proxyMode": "Proxy de red",
        "account.proxyNote": "Afecta solo a esta cuenta. El canal se reconecta automáticamente al guardar.",
        "account.proxySaved": "Se ha guardado una dirección de proxy. Deje el campo en blanco para conservarla.",
        "account.proxyUrl": "Dirección del proxy",
        "account.receive": "Recibir mensajes",
        "account.receiveDescription": "Desactive esto para conservar la configuración de la cuenta sin recibir nuevos mensajes",
        "account.remark": "Observación del nombre",
        "account.remarkNote": "Se muestra solo en la configuración local para distinguir cuentas. Deje en blanco para restaurar el nombre automático.",
        "account.removeConfirm": "¿Seguro que desea eliminar esta cuenta? La configuración y credenciales guardadas localmente también se eliminarán.",
        "account.rename": "Modificar observación del nombre",
        "account.seconds": "s",
        "account.segmentFull": "Enviar completa",
        "account.segmentGap": "Intervalo de envío",
        "account.segmentGapInvalid": "Introduzca un número de segundos entre 0 y 60.",
        "account.segmentGapMax": "Intervalo máximo",
        "account.segmentGapMin": "Intervalo mínimo",
        "account.segmentGapOrder": "El límite máximo no puede ser inferior al mínimo.",
        "account.segmentReply": "Respuestas segmentadas",
        "account.segmentReplyNote": "Al elegir Enviar en segmentos, el asistente divide la respuesta en varios mensajes cortos por el separador y los envía uno a uno; Enviar completa mantiene la respuesta en un solo mensaje.",
        "account.segmentSplit": "Enviar en segmentos",
        "account.selectModel": "Seleccione un modelo",
        "account.selectPermission": "Seleccione un permiso",
        "account.selectWorkspace": "Seleccione un espacio de trabajo",
        "account.sendMode": "Modo de envío",
        "account.sendQueue": "En cola",
        "account.sendSteer": "Intervención",
        "account.sendSteerNote": "La intervención entrega el mensaje a la tarea en ejecución como instrucciones adicionales en su siguiente paso; cuando la tarea está inactiva se comporta como cola.",
        "account.sessionIdle": "Rotación de sesión por inactividad",
        "account.sessionIdleHour": "{n} h",
        "account.sessionIdleHours": "{n} h",
        "account.sessionIdleMin": "{n} min",
        "account.sessionIdleNote": "Inicia una nueva sesión cuando llega el siguiente mensaje tras este periodo de inactividad; las sesiones anteriores siguen accesibles mediante /sessions. Establezca 0 para desactivar.",
        "account.sessionIdleOff": "Desactivado (mantener sesión)",
        "account.statusNotConnected": "No conectado",
        "account.statusProcessing": "Procesando…",
        "account.telegramFreeChatGroups": "Lista de ID de grupos sin @",
        "account.telegramFreeChatGroupsInvalid": "No se detectaron ID de grupo válidos. Los ID suelen ser números enteros negativos (ej. -1001234567890), o pegue un enlace web de Telegram.",
        "account.telegramFreeChatGroupsPartial": "{count} ID de grupo no se reconocieron y se ignorarán. Use números negativos (ej. -1001234567890) o enlaces web de Telegram.",
        "account.telegramGroupPolicy": "Política de activación en grupos",
        "account.telegramGroupPolicyAddressed": "Solo con @mención o respuesta (predeterminado)",
        "account.telegramGroupPolicyAlways": "Todos los mensajes de grupo",
        "account.telegramGroupPolicyCustom": "Solo grupos específicos sin @",
        "account.telegramGroupPolicyNote": "Afecta solo a los grupos de esta cuenta. Para recibir mensajes normales, haga administrador al bot o desactive el modo de privacidad en @BotFather (/setprivacy → Disable).",
        "account.telegramThinkingDisplay": "Mostrar proceso de razonamiento",
        "account.telegramThinkingDisplayCollapsed": "Plegado",
        "account.telegramThinkingDisplayNote": "Cuando está habilitado, el razonamiento se envía como un bloque de cita desplegable que los usuarios pueden tocar para expandir. Todos los miembros pueden verlo.",
        "account.telegramThinkingDisplayOff": "Desactivado",
        "account.workspace": "Espacio de trabajo",
        "action.addAccount": "Añadir cuenta",
        "action.approve": "Aprobar",
        "action.cancel": "Cancelar",
        "action.checkConnection": "Diagnosticar conexión",
        "action.confirm": "Confirmar",
        "action.deny": "Rechazar",
        "action.generateQr": "Generar código QR",
        "action.more": "Más opciones de {channel}",
        "action.reconnectAccount": "Reconectar",
        "action.removeAccount": "Eliminar",
        "action.saving": "Guardando…",
        "action.settings": "Configuración",
        "bind.expire": "El código QR caduca en {time}",
        "bind.generating": "Generando…",
        "bind.manual": "Configuración manual",
        "bind.newIdentity": "Se detectó una nueva identidad de cuenta y se creó una cuenta nueva",
        "bind.qrAlt": "Código QR de configuración de {channel}",
        "bind.quick": "Vinculación rápida (recomendado)",
        "bind.refresh": "Volver a generar código QR",
        "bind.retry": "Volver a generar código QR",
        "bind.saving": "Guardando cuenta…",
        "bind.scanned": "Escaneado. Confirme en su teléfono.",
        "bind.success": "Vinculación correcta, canal conectado",
        "bind.tabsAria": "Método de vinculación",
        "bind.title": "Configurar {channel}",
        "channel.dingtalk": "DingTalk",
        "channel.discord": "Discord",
        "channel.feishu": "Feishu",
        "channel.lark": "Lark",
        "channel.qq": "QQ",
        "channel.slack": "Slack",
        "channel.telegram": "Telegram",
        "channel.wecom": "WeCom",
        "channel.weixin": "WeChat",
        "command.disabled": "Solo conversación normal",
        "command.dm": "Comandos de chat privado",
        "command.enabled": "Comandos habilitados",
        "command.group": "Comandos de grupo",
        "composer.addWorkspace": "Añadir espacio de trabajo…",
        "composer.noModels": "Sin modelos",
        "composer.noWorkspaces": "Sin espacios de trabajo",
        "composer.permission": "Permiso",
        "composer.workspaceRequired": "Añada un espacio de trabajo antes de guardar.",
        "connection.checkFailed": "No se pudo completar la comprobación de estado. Reintente o revise los registros locales si sigue fallando.",
        "connection.checkedAt": "Comprobado el",
        "connection.checking": "Comprobando…",
        "connection.connected": "Conectado",
        "connection.connecting": "Conectando",
        "connection.disconnected": "Desconectado",
        "connection.error": "Error de conexión",
        "connection.next.connected": "Puede enviar un mensaje en el chat original para verificar la entrega. Los chats privados siguen la configuración de acceso.",
        "connection.next.connecting": "Vuelva a comprobar en breve. Si hay un escaneo de QR pendiente, confirme en su teléfono.",
        "connection.next.disconnected": "Vuelva a conectar la cuenta. Es posible que los canales de QR deban vincularse de nuevo.",
        "connection.next.error": "Intente reconectar. Si el problema persiste, revise los registros locales.",
        "connection.next.reconnecting": "El canal está intentando recuperarse. Vuelva a comprobar en breve.",
        "connection.next.stopped": "Haga clic en Reconectar para iniciar la cuenta.",
        "connection.next.unknown": "No se pudo confirmar el estado actual. Vuelva a comprobar más tarde o revise los registros locales.",
        "connection.paused": "Recepción en pausa",
        "connection.receiveOff": "La recepción está desactivada. Actívela en la lista de cuentas antes de enviar mensajes.",
        "connection.receiveOn": "La recepción está activada",
        "connection.receiveUnknown": "No se puede leer la configuración de recepción. Reinicie DSH y actualice la página.",
        "connection.reconnecting": "Reconectando",
        "connection.restartRequired": "Las versiones de frontend y backend no coinciden. Reinicie DSH por completo, actualice la página y vuelva a intentarlo.",
        "connection.scope": "Solo comprueba el entorno local del canal. Las credenciales de plataforma y el envío/recepción no se han verificado.",
        "connection.stopped": "Detenido",
        "connection.title": "Resultado de comprobación de estado",
        "connection.unknown": "Estado desconocido",
        "copy": "Copiar",
        "diagnostic.auth": "Credenciales ausentes o inválidas. Configure o vuelva a vincular la cuenta.",
        "diagnostic.bot": "Consulta de identidad del bot",
        "diagnostic.cancelled": "Diagnóstico cancelado. El estado de la conexión no se verificó.",
        "diagnostic.changed": "El estado de la cuenta ha cambiado. Ejecute el diagnóstico de nuevo.",
        "diagnostic.config": "Consulta de configuración de WeChat (getconfig)",
        "diagnostic.credentials": "Verificación de credenciales de aplicación",
        "diagnostic.failed": "Fallido",
        "diagnostic.gateway": "Consulta de puerta de enlace",
        "diagnostic.heartbeat": "Latido de conexión de WeCom (ping)",
        "diagnostic.invalid-response": "Respuesta de la plataforma incompleta o no válida. No se puede confirmar la disponibilidad.",
        "diagnostic.local-state": "No se pudieron leer las credenciales ni inicializar el estado local. Compruebe la configuración local y los permisos de archivos.",
        "diagnostic.missing-context": "Falta el contexto del chat original. Envíe un mensaje desde la cuenta vinculada y vuelva a intentarlo.",
        "diagnostic.network": "La solicitud de red falló. Compruebe su red o proxy.",
        "diagnostic.not-connected": "No hay ninguna conexión activa para verificar. Vuelva a conectar primero.",
        "diagnostic.ok": "La plataforma devolvió una respuesta válida",
        "diagnostic.passed": "Aprobado",
        "diagnostic.permission": "Acceso denegado por la plataforma. Compruebe los permisos de la aplicación.",
        "diagnostic.rate-limit": "Se alcanzó el límite de velocidad de la plataforma. Inténtelo más tarde.",
        "diagnostic.rejected": "La plataforma rechazó la solicitud. Verifique la configuración y los permisos de la aplicación.",
        "diagnostic.scope": "Resultados de las consultas a la plataforma o del latido en esta verificación. No se enviaron mensajes de prueba; los permisos de entrega no están verificados.",
        "diagnostic.server": "Fallo en el servicio de la plataforma. Inténtelo más tarde.",
        "diagnostic.timeout": "El diagnóstico agotó el tiempo de espera. Compruebe su red y vuelva a intentarlo.",
        "diagnostic.title": "Diagnóstico de conexión",
        "diagnostic.unsupported": "El SDK o configuración actual no admite este diagnóstico. No se ha determinado como aprobado.",
        "diagnostic.unverified": "Sin verificar",
        "diagnostic.webhook": "Comprobación de conflictos de Webhook",
        "diagnostic.webhook-conflict": "Hay un Webhook configurado que entra en conflicto con el sondeo. Desactive el Webhook de este bot en el otro servicio.",
        "entry.location.both": "Ambos",
        "entry.location.desc": "Elija dónde se muestra IM Connect (barra lateral o página de Configuración)",
        "entry.location.settings": "Solo Configuración",
        "entry.location.sidebar": "Solo barra lateral",
        "entry.location.title": "Ubicación del acceso",
        "error.action": "Operación fallida",
        "error.addWorkspace": "Error al añadir espacio de trabajo",
        "error.chooseWorkspace": "Seleccione un directorio de espacio de trabajo",
        "error.connection": "No se pudo conectar a la API local del Asistente IM",
        "error.detailsInLog": "Operación fallida. Revise los registros del servidor para más detalles.",
        "error.load": "Error al cargar",
        "error.loadAssistant": "No se pudo cargar la configuración de la cuenta",
        "error.noModels": "No hay modelos disponibles en el host. Configure primero un proveedor en la web.",
        "error.qr": "No se pudo generar el código QR",
        "error.request": "Solicitud fallida",
        "error.save": "Error al guardar",
        "error.workspaceUnavailable": "Este host no puede añadir espacios de trabajo",
        "field.dingtalk.clientId": "Client ID (anteriormente AppKey)",
        "field.dingtalk.clientSecret": "Client Secret (anteriormente AppSecret)",
        "field.discord.token": "Bot Token",
        "field.qq.appId": "AppID",
        "field.qq.appSecret": "AppSecret",
        "field.slack.appToken": "App Token (comienza con xapp-)",
        "field.slack.token": "Bot Token (comienza con xoxb-)",
        "field.telegram.token": "Bot Token",
        "field.wecom.botId": "Bot ID",
        "field.wecom.secret": "Secret",
        "hover.copied": "Copiado",
        "loading": "Cargando…",
        "pending.notice": "Hay solicitudes de acceso. Apruebe a un usuario para que pueda controlar el asistente local.",
        "permission.fullAccess": "Acceso total",
        "permission.readOnly": "Solo lectura",
        "permission.workspaceWrite": "Escritura en espacio de trabajo",
        "qr.default": "Escanee el código QR con la aplicación correspondiente",
        "qr.dingtalk": "Escanee con DingTalk; se creará un bot automáticamente",
        "qr.feishu": "Escanee con Feishu; se creará un bot automáticamente",
        "qr.lark": "Escanee con Lark para emparejar",
        "qr.qq": "Escanee con QQ móvil para crear un bot de plataforma abierta",
        "qr.wecom": "Escanee con WeCom para vincular rápidamente un bot",
        "qr.weixin": "Escanee el código QR con WeChat para completar la vinculación",
        "rail.addChannel": "Añadir canal",
        "rail.archive": "Archivar sesión",
        "rail.archived": "Archivado",
        "rail.byChannel": "Por canal",
        "rail.byWorkspace": "Por espacio de trabajo",
        "rail.byWorkspaceTree": "Por árbol de espacios de trabajo",
        "rail.channelSettings": "Configuración del canal",
        "rail.channels": "Canales",
        "rail.clearSearch": "Limpiar búsqueda",
        "rail.compactAnswer": "Respuesta",
        "rail.compactApproval": "Aprobación",
        "rail.compactPlan": "Revisión de plan",
        "rail.completed": "Completado",
        "rail.deleteSession": "Eliminar sesión",
        "rail.deleteSessionCancel": "Cancelar",
        "rail.deleteSessionClose": "Cerrar",
        "rail.deleteSessionConfirm": "Eliminar sesión",
        "rail.deleteSessionDescription": "Eliminará permanentemente la sesión “{name}”, sus agentes secundarios (incluidos los activos) y todos sus registros (conversación, estadísticas, caché). Esta acción no se puede deshacer.",
        "rail.deleteSessionFailed": "Error al eliminar la sesión: {message}",
        "rail.deleteSessionPending": "Eliminando sesión…",
        "rail.empty": "Aún no hay sesiones de canal. Conecte un canal en Configuración → Asistente IM y envíe un mensaje al bot.",
        "rail.filter": "Filtrar",
        "rail.fork": "Bifurcar sesión",
        "rail.group": "Agrupar por",
        "rail.groupActions": "Acciones de canal para “{name}”",
        "rail.groupReadOnly": "Los grupos de canales no se pueden renombrar ni eliminar aquí.",
        "rail.idle": "Inactivo",
        "rail.list": "Lista única",
        "rail.onlyArchived": "Solo archivadas",
        "rail.planReview": "Revisión de plan pendiente",
        "rail.recent": "Reciente",
        "rail.rename": "Renombrar",
        "rail.renameAria": "Renombrar sesión",
        "rail.running": "En ejecución",
        "rail.search": "Buscar",
        "rail.searchPlaceholder": "Buscar sesiones...",
        "rail.sessions": "Sesiones",
        "rail.showArchived": "Mostrar archivadas",
        "rail.sort": "Ordenar por",
        "rail.subagents": "{n} subagentes en ejecución",
        "rail.tabsAria": "Categorías del espacio de trabajo",
        "rail.tasks": "Tareas",
        "rail.treeUnavailable": "El árbol oficial no está disponible en este host.",
        "rail.unarchive": "Restaurar sesión",
        "rail.ungrouped": "Sin agrupar",
        "rail.waitingAnswer": "Esperando respuesta",
        "rail.waitingApproval": "Esperando aprobación",
        "rail.workspace": "Espacios de trabajo",
        "server.accessDenied": "Acceso denegado: solicite al administrador que apruebe su acceso en Configuración → Asistente IM.",
        "server.accountConnectFailed": "Error al conectar la cuenta. Revise los registros locales.",
        "server.accountMissing": "La cuenta no existe",
        "server.accountReconnectFailed": "Error al reconectar la cuenta. Revise los registros locales.",
        "server.channelUnconfigured": "Canal no configurado",
        "server.createWorkspace": "Añada un espacio de trabajo primero",
        "server.missingCredentials": "Credenciales insuficientes, no se puede iniciar el canal",
        "server.qrExpired": "El código QR ha caducado",
        "server.qrIncomplete": "Escaneo de código QR incompleto",
        "server.qrUnsupported": "Este canal no admite vinculación por código QR",
        "server.remarkControl": "La observación de la cuenta no puede contener saltos de línea ni caracteres de control",
        "server.remarkTooLong": "La observación de la cuenta no puede superar los 40 caracteres",
        "server.selectAccountSettings": "Seleccione proveedor, modelo, espacio de trabajo o permiso",
        "server.selectModel": "Seleccione un proveedor y un modelo",
        "server.selectPermission": "Seleccione un permiso",
        "server.selectWorkspace": "Seleccione un espacio de trabajo",
        "server.sessionMissing": "La sesión no existe",
        "server.unknownChannel": "Canal desconocido",
        "settings.aria": "Asistente IM",
        "settings.description": "Administre cuentas en distintos canales. Cada cuenta selecciona de forma independiente su espacio de trabajo, modelo y permisos, guardados solo localmente.",
        "settings.feedback": "Problemas",
        "settings.label": "Asistente IM",
        "settings.publicChatNotice": "Los usuarios no aprobados pueden iniciar chats, pero no pueden autorizar llamadas a herramientas.",
        "settings.title": "Asistente IM",
        "settings.viewProject": "GitHub",
        "sidebar.entry.desc": "Muestra el acceso a IM en la barra lateral. El acceso en Configuración se mantiene.",
        "sidebar.entry.title": "Acceso en barra lateral",
        "sidebar.entry.toggle": "Alternar acceso en barra lateral",
        "status.authenticating": "Autenticando",
        "status.connected": "Conectado",
        "status.connectingSocket": "Conectando",
        "status.connectionError": "Error de conexión",
        "status.connectionFailed": "Conexión fallida",
        "status.disconnected": "Desconectado",
        "status.loggedIn": "Autenticado",
        "status.loggedInRecovered": "Autenticado (recuperado)",
        "status.loggingIn": "Iniciando sesión",
        "status.longConnection": "Conexión persistente establecida",
        "status.notLoggedIn": "No autenticado",
        "status.polling": "Sondeando",
        "status.reconnectFailed": "Error al reconectar",
        "status.reconnecting": "Reconectando",
        "status.saved": "Guardado",
        "status.saving": "Guardando…",
        "status.stopped": "Detenido",
        "status.streamConnected": "Stream conectado",
        "status.waitHandshake": "Esperando enlace de puerta de enlace",
        "status.waitQr": "Esperando escaneo",
        "taskTreeSessions.entry.desc": "Muestra las sesiones de mensajería en el árbol de tareas oficial del espacio de trabajo. Si se desactiva, solo se muestran en la pestaña 'Canales'.",
        "taskTreeSessions.entry.title": "Mostrar sesiones de IM en árbol de tareas",
        "taskTreeSessions.entry.toggle": "Alternar sesiones de IM en árbol de tareas",
        "time.ago": "hace {t}",
        "time.days": "{n} d",
        "time.hours": "{n} h",
        "time.minutes": "{n} min",
        "time.months": "{n} m",
        "time.now": "ahora",
        "time.years": "{n} a",
      },
      fr: {
        "account.autoNameNote": "Le nom du compte est généré automatiquement après l'association. Ajoutez une remarque sur la ligne du compte pour différencier les utilisateurs.",
        "account.count": "{count} comptes",
        "account.currentWorkspace": "Espace de travail actuel",
        "account.defaultName": "Compte {channel} {count}",
        "account.presetUnavailable": "Préréglage indisponible",
        "account.privateAccess": "Accès aux messages privés",
        "account.privateAll": "Autoriser tous les utilisateurs en MP",
        "account.privateApproved": "Utilisateurs approuvés uniquement",
        "account.proxyCustom": "Configuration manuelle",
        "account.proxyDirect": "Connexion directe",
        "account.proxyInherit": "Suivre l'hôte",
        "account.proxyMode": "Proxy réseau",
        "account.proxyNote": "Ne concerne que ce compte. Le canal se reconnecte automatiquement après enregistrement.",
        "account.proxySaved": "Une adresse de proxy est enregistrée. Laissez vide pour la conserver.",
        "account.proxyUrl": "Adresse du proxy",
        "account.receive": "Recevoir des messages",
        "account.receiveDescription": "Désactivez cette option pour conserver les paramètres sans recevoir de nouveaux messages",
        "account.remark": "Remarque sur le nom",
        "account.remarkNote": "Affiché uniquement dans les paramètres locaux pour distinguer les comptes. Laissez vide pour restaurer le nom automatique.",
        "account.removeConfirm": "Voulez-vous vraiment supprimer ce compte ? Les paramètres et identifiants enregistrés localement seront également supprimés.",
        "account.rename": "Modifier la remarque",
        "account.seconds": "s",
        "account.segmentFull": "Envoi complet",
        "account.segmentGap": "Intervalle d'envoi",
        "account.segmentGapInvalid": "Veuillez saisir un nombre de secondes entre 0 et 60.",
        "account.segmentGapMax": "Intervalle maximum",
        "account.segmentGapMin": "Intervalle minimum",
        "account.segmentGapOrder": "Le maximum ne peut pas être inférieur au minimum.",
        "account.segmentReply": "Réponses segmentées",
        "account.segmentReplyNote": "En choisissant l'envoi par segments, l'assistant découpe la réponse en plusieurs messages courts au niveau du séparateur ; l'envoi complet conserve la réponse en un seul message.",
        "account.segmentSplit": "Envoi par segments",
        "account.selectModel": "Veuillez sélectionner un modèle",
        "account.selectPermission": "Veuillez sélectionner une autorisation",
        "account.selectWorkspace": "Veuillez sélectionner un espace de travail",
        "account.sendMode": "Mode d'envoi",
        "account.sendQueue": "En file d'attente",
        "account.sendSteer": "Intervention directe",
        "account.sendSteerNote": "L'intervention transmet le message à la tâche en cours en tant qu'instruction supplémentaire à la prochaine étape ; lorsque la tâche est inactive, elle se comporte comme la file d'attente.",
        "account.sessionIdle": "Nouvelle session après inactivité",
        "account.sessionIdleHour": "{n} h",
        "account.sessionIdleHours": "{n} h",
        "account.sessionIdleMin": "{n} min",
        "account.sessionIdleNote": "Démarre une nouvelle session si un nouveau message arrive après ce délai d'inactivité ; les anciennes sessions restent accessibles via /sessions. Définir à 0 pour désactiver.",
        "account.sessionIdleOff": "Désactivé (conserver la session)",
        "account.statusNotConnected": "Non connecté",
        "account.statusProcessing": "Traitement en cours…",
        "account.telegramFreeChatGroups": "Liste blanche des ID de groupe sans @",
        "account.telegramFreeChatGroupsInvalid": "Aucun ID de groupe valide détecté. Les ID sont généralement des entiers négatifs (ex. -1001234567890), ou collez un lien Telegram Web.",
        "account.telegramFreeChatGroupsPartial": "{count} ID de groupe n'ont pas pu être reconnus et seront ignorés. Utilisez des entiers négatifs (ex. -1001234567890) ou un lien Telegram Web.",
        "account.telegramGroupPolicy": "Politique de déclenchement de groupe",
        "account.telegramGroupPolicyAddressed": "Seulement sur @mention ou réponse (par défaut)",
        "account.telegramGroupPolicyAlways": "Tous les messages du groupe",
        "account.telegramGroupPolicyCustom": "Groupes spécifiques sans @",
        "account.telegramGroupPolicyNote": "Ne concerne que ce compte. Pour recevoir les messages ordinaires, nommez le bot administrateur ou désactivez le mode confidentialité dans @BotFather (/setprivacy → Disable).",
        "account.telegramThinkingDisplay": "Affichage du raisonnement",
        "account.telegramThinkingDisplayCollapsed": "Replié",
        "account.telegramThinkingDisplayNote": "Si activé, le raisonnement est envoyé sous forme de bloc de citation pliable pouvant être déroulé au toucher. Visible par tous les membres du groupe.",
        "account.telegramThinkingDisplayOff": "Désactivé",
        "account.workspace": "Espace de travail",
        "action.addAccount": "Ajouter un compte",
        "action.approve": "Approuver",
        "action.cancel": "Annuler",
        "action.checkConnection": "Diagnostiquer la connexion",
        "action.confirm": "Confirmer",
        "action.deny": "Refuser",
        "action.generateQr": "Générer un QR code",
        "action.more": "Plus d'options pour {channel}",
        "action.reconnectAccount": "Reconnecter",
        "action.removeAccount": "Supprimer",
        "action.saving": "Enregistrement…",
        "action.settings": "Paramètres",
        "bind.expire": "Le code QR expire dans {time}",
        "bind.generating": "Génération…",
        "bind.manual": "Configuration manuelle",
        "bind.newIdentity": "Une nouvelle identité de compte a été détectée et un compte a été créé",
        "bind.qrAlt": "Code QR de configuration de {channel}",
        "bind.quick": "Association rapide (recommandé)",
        "bind.refresh": "Régénérer le code QR",
        "bind.retry": "Régénérer le code QR",
        "bind.saving": "Enregistrement du compte…",
        "bind.scanned": "Scanné. Confirmez sur votre téléphone.",
        "bind.success": "Association réussie, canal connecté",
        "bind.tabsAria": "Méthode d'association",
        "bind.title": "Configurer {channel}",
        "channel.dingtalk": "DingTalk",
        "channel.discord": "Discord",
        "channel.feishu": "Feishu",
        "channel.lark": "Lark",
        "channel.qq": "QQ",
        "channel.slack": "Slack",
        "channel.telegram": "Telegram",
        "channel.wecom": "WeCom",
        "channel.weixin": "WeChat",
        "command.disabled": "Conversation normale uniquement",
        "command.dm": "Commandes en message privé",
        "command.enabled": "Commandes activées",
        "command.group": "Commandes de groupe",
        "composer.addWorkspace": "Ajouter un espace de travail…",
        "composer.noModels": "Aucun modèle",
        "composer.noWorkspaces": "Aucun espace de travail",
        "composer.permission": "Autorisation",
        "composer.workspaceRequired": "Veuillez ajouter un espace de travail avant d'enregistrer.",
        "connection.checkFailed": "La vérification d'état n'a pas pu se terminer. Réessayez ou consultez les journaux locaux.",
        "connection.checkedAt": "Vérifié à",
        "connection.checking": "Vérification en cours…",
        "connection.connected": "Connecté",
        "connection.connecting": "Connexion en cours",
        "connection.disconnected": "Déconnecté",
        "connection.error": "Erreur de connexion",
        "connection.next.connected": "Envoyez un message dans le chat d'origine pour vérifier la livraison. Les chats privés suivent les règles d'accès.",
        "connection.next.connecting": "Vérifiez à nouveau sous peu. Si un QR code est en attente, confirmez sur votre téléphone.",
        "connection.next.disconnected": "Reconnectez le compte. Les canaux par QR code devront peut-être être réassociés.",
        "connection.next.error": "Essayez de vous reconnecter. Si le problème persiste, consultez les journaux locaux.",
        "connection.next.reconnecting": "Le canal tente de se rétablir. Vérifiez à nouveau sous peu.",
        "connection.next.stopped": "Cliquez sur Reconnecter pour démarrer le compte.",
        "connection.next.unknown": "État actuel non confirmé. Vérifiez à nouveau plus tard ou consultez les journaux locaux.",
        "connection.paused": "Réception en pause",
        "connection.receiveOff": "La réception est désactivée. Activez-la dans la liste des comptes avant d'envoyer des messages.",
        "connection.receiveOn": "La réception est activée",
        "connection.receiveUnknown": "Paramètre de réception indisponible. Redémarrez DSH et actualisez la page.",
        "connection.reconnecting": "Reconnexion en cours",
        "connection.restartRequired": "Incohérence de version frontend/backend. Redémarrez complètement DSH, actualisez la page et réessayez.",
        "connection.scope": "Vérifie uniquement le runtime du canal local. Les identifiants et la livraison de messages n'ont pas été vérifiés.",
        "connection.stopped": "Arrêté",
        "connection.title": "Résultat de la vérification d'état",
        "connection.unknown": "État inconnu",
        "copy": "Copier",
        "diagnostic.auth": "Identifiants manquants ou invalides. Reconfigurez ou associez à nouveau le compte.",
        "diagnostic.bot": "Requête d'identité du bot",
        "diagnostic.cancelled": "Diagnostic annulé. L'état de connexion n'a pas été vérifié.",
        "diagnostic.changed": "L'état du compte a changé. Relancez le diagnostic.",
        "diagnostic.config": "Configuration WeChat (getconfig)",
        "diagnostic.credentials": "Vérification des identifiants de l'application",
        "diagnostic.failed": "Échoué",
        "diagnostic.gateway": "Requête de passerelle",
        "diagnostic.heartbeat": "Heartbeat de connexion WeCom (ping)",
        "diagnostic.invalid-response": "Réponse de la plateforme incomplète ou invalide. Disponibilité non confirmée.",
        "diagnostic.local-state": "Impossible de lire les identifiants ou d'initialiser l'état local. Vérifiez la configuration locale et les autorisations de fichiers.",
        "diagnostic.missing-context": "Contexte du chat d'origine manquant. Envoyez un message depuis le compte associé et réessayez.",
        "diagnostic.network": "Échec de la requête réseau. Vérifiez votre réseau ou votre proxy.",
        "diagnostic.not-connected": "Aucune connexion active à vérifier. Reconnectez-vous d'abord.",
        "diagnostic.ok": "La plateforme a renvoyé une réponse valide",
        "diagnostic.passed": "Réussi",
        "diagnostic.permission": "Accès refusé par la plateforme. Vérifiez les autorisations de l'application.",
        "diagnostic.rate-limit": "Limite de débit atteinte sur la plateforme. Réessayez plus tard.",
        "diagnostic.rejected": "La plateforme a rejeté la requête. Vérifiez les paramètres et autorisations.",
        "diagnostic.scope": "Résultats des requêtes plateforme ou du heartbeat lors de cette vérification. Aucun message de test envoyé ; autorisations de livraison non vérifiées.",
        "diagnostic.server": "Le service de la plateforme a échoué. Réessayez plus tard.",
        "diagnostic.timeout": "Délai d'attente du diagnostic dépassé. Vérifiez votre réseau et réessayez.",
        "diagnostic.title": "Diagnostic de connexion",
        "diagnostic.unsupported": "Le SDK ou la configuration actuelle ne prend pas en charge ce diagnostic.",
        "diagnostic.unverified": "Non vérifié",
        "diagnostic.webhook": "Vérification des conflits de Webhook",
        "diagnostic.webhook-conflict": "Un Webhook est configuré et entre en conflit avec le polling. Désactivez le Webhook de ce bot dans l'autre service.",
        "entry.location.both": "Les deux",
        "entry.location.desc": "Choisissez où afficher IM Connect (barre latérale ou page des paramètres)",
        "entry.location.settings": "Paramètres uniquement",
        "entry.location.sidebar": "Barre latérale uniquement",
        "entry.location.title": "Emplacement de l'accès",
        "error.action": "Échec de l'opération",
        "error.addWorkspace": "Échec de l'ajout de l'espace de travail",
        "error.chooseWorkspace": "Veuillez choisir un répertoire d'espace de travail",
        "error.connection": "Impossible de se connecter à l'API locale de l'assistant IM",
        "error.detailsInLog": "Opération échouée. Consultez les journaux du serveur pour plus de détails.",
        "error.load": "Échec du chargement",
        "error.loadAssistant": "Impossible de charger les paramètres du compte",
        "error.noModels": "Aucun modèle disponible sur l'hôte. Configurez d'abord un fournisseur dans l'interface web.",
        "error.qr": "Impossible de générer le code QR",
        "error.request": "Échec de la requête",
        "error.save": "Échec de l'enregistrement",
        "error.workspaceUnavailable": "Cet hôte ne peut pas ajouter d'espace de travail",
        "field.dingtalk.clientId": "Client ID (anciennement AppKey)",
        "field.dingtalk.clientSecret": "Client Secret (anciennement AppSecret)",
        "field.discord.token": "Bot Token",
        "field.qq.appId": "AppID",
        "field.qq.appSecret": "AppSecret",
        "field.slack.appToken": "App Token (commence par xapp-)",
        "field.slack.token": "Bot Token (commence par xoxb-)",
        "field.telegram.token": "Bot Token",
        "field.wecom.botId": "Bot ID",
        "field.wecom.secret": "Secret",
        "hover.copied": "Copié",
        "loading": "Chargement…",
        "pending.notice": "Demandes d'accès en attente. Approuvez un utilisateur pour lui permettre de piloter l'assistant local.",
        "permission.fullAccess": "Accès complet",
        "permission.readOnly": "Lecture seule",
        "permission.workspaceWrite": "Écriture dans l'espace de travail",
        "qr.default": "Scannez le code QR avec l'application correspondante",
        "qr.dingtalk": "Scannez avec DingTalk ; un bot sera créé automatiquement",
        "qr.feishu": "Scannez avec Feishu ; un bot sera créé automatiquement",
        "qr.lark": "Scannez avec Lark pour appairer",
        "qr.qq": "Scannez avec QQ mobile pour créer un bot Open Platform",
        "qr.wecom": "Scannez avec WeCom pour associer rapidement un bot",
        "qr.weixin": "Scannez le code QR avec WeChat pour terminer l'association",
        "rail.addChannel": "Ajouter un canal",
        "rail.archive": "Archiver la session",
        "rail.archived": "Archivé",
        "rail.byChannel": "Par canal",
        "rail.byWorkspace": "Par espace de travail",
        "rail.byWorkspaceTree": "Par arborescence d'espaces de travail",
        "rail.channelSettings": "Paramètres du canal",
        "rail.channels": "Canaux",
        "rail.clearSearch": "Effacer la recherche",
        "rail.compactAnswer": "Réponse",
        "rail.compactApproval": "Approbation",
        "rail.compactPlan": "Revue de plan",
        "rail.completed": "Terminé",
        "rail.deleteSession": "Supprimer la session",
        "rail.deleteSessionCancel": "Annuler",
        "rail.deleteSessionClose": "Fermer",
        "rail.deleteSessionConfirm": "Supprimer la session",
        "rail.deleteSessionDescription": "Cette action supprimera définitivement la session « {name} », ses sous-agents (y compris ceux en cours) et tous ses enregistrements (échanges, statistiques, cache). Cette action est irréversible.",
        "rail.deleteSessionFailed": "Impossible de supprimer la session : {message}",
        "rail.deleteSessionPending": "Suppression de la session en cours…",
        "rail.empty": "Aucune session de canal pour le moment. Connectez un canal dans Paramètres → Assistant IM, puis envoyez un message au bot.",
        "rail.filter": "Filtrer",
        "rail.fork": "Dupliquer la session",
        "rail.group": "Grouper par",
        "rail.groupActions": "Actions de canal pour « {name} »",
        "rail.groupReadOnly": "Les groupes de canaux ne peuvent pas être renommés ou supprimés ici.",
        "rail.idle": "Inactif",
        "rail.list": "Liste unique",
        "rail.onlyArchived": "Archivées uniquement",
        "rail.planReview": "Plan à réviser",
        "rail.recent": "Récents",
        "rail.rename": "Renommer",
        "rail.renameAria": "Renommer la session",
        "rail.running": "En cours",
        "rail.search": "Rechercher",
        "rail.searchPlaceholder": "Rechercher des sessions...",
        "rail.sessions": "Sessions",
        "rail.showArchived": "Afficher les archives",
        "rail.sort": "Trier par",
        "rail.subagents": "{n} sous-agents en cours",
        "rail.tabsAria": "Catégories d'espaces de travail",
        "rail.tasks": "Tâches",
        "rail.treeUnavailable": "L'arbre officiel n'est pas disponible sur cet hôte.",
        "rail.unarchive": "Restaurer la session",
        "rail.ungrouped": "Non groupé",
        "rail.waitingAnswer": "En attente de réponse",
        "rail.waitingApproval": "En attente d'approbation",
        "rail.workspace": "Espaces de travail",
        "server.accessDenied": "Accès refusé : demandez à un administrateur d'approuver votre accès dans Paramètres → Assistant IM.",
        "server.accountConnectFailed": "Échec de connexion du compte. Consultez les journaux locaux.",
        "server.accountMissing": "Le compte n'existe pas",
        "server.accountReconnectFailed": "Échec de reconnexion du compte. Consultez les journaux locaux.",
        "server.channelUnconfigured": "Canal non configuré",
        "server.createWorkspace": "Veuillez d'abord ajouter un espace de travail",
        "server.missingCredentials": "Identifiants insuffisants pour démarrer le canal",
        "server.qrExpired": "Le code QR a expiré",
        "server.qrIncomplete": "Scan du QR code incomplet",
        "server.qrUnsupported": "Ce canal ne prend pas en charge l'association par QR code",
        "server.remarkControl": "La remarque du compte ne peut pas contenir de retours à la ligne ou de caractères de contrôle",
        "server.remarkTooLong": "La remarque du compte ne peut pas dépasser 40 caractères",
        "server.selectAccountSettings": "Veuillez choisir un fournisseur, modèle, espace de travail ou autorisation",
        "server.selectModel": "Veuillez choisir un fournisseur et un modèle",
        "server.selectPermission": "Veuillez choisir une autorisation",
        "server.selectWorkspace": "Veuillez choisir un espace de travail",
        "server.sessionMissing": "La session n'existe pas",
        "server.unknownChannel": "Canal inconnu",
        "settings.aria": "Assistant IM",
        "settings.description": "Gérez les comptes sur les différents canaux. Chaque compte choisit indépendamment son espace de travail, son modèle et ses autorisations, enregistrés uniquement sur cette machine.",
        "settings.feedback": "Retours",
        "settings.label": "Assistant IM",
        "settings.publicChatNotice": "Les utilisateurs non approuvés peuvent initier des discussions, mais ne peuvent pas approuver les appels d'outils.",
        "settings.title": "Assistant IM",
        "settings.viewProject": "GitHub",
        "sidebar.entry.desc": "Affiche l'accès IM dans la barre latérale. L'accès dans les paramètres reste présent.",
        "sidebar.entry.title": "Entrée dans la barre latérale",
        "sidebar.entry.toggle": "Basculer l'accès dans la barre latérale",
        "status.authenticating": "Authentification en cours",
        "status.connected": "Connecté",
        "status.connectingSocket": "Connexion en cours",
        "status.connectionError": "Erreur de connexion",
        "status.connectionFailed": "Connexion échouée",
        "status.disconnected": "Déconnecté",
        "status.loggedIn": "Connecté",
        "status.loggedInRecovered": "Connecté (récupéré)",
        "status.loggingIn": "Connexion…",
        "status.longConnection": "Connexion persistante établie",
        "status.notLoggedIn": "Non connecté",
        "status.polling": "Polling en cours",
        "status.reconnectFailed": "Échec de reconnexion",
        "status.reconnecting": "Reconnexion en cours",
        "status.saved": "Enregistré",
        "status.saving": "Enregistrement…",
        "status.stopped": "Arrêté",
        "status.streamConnected": "Stream connecté",
        "status.waitHandshake": "En attente de négociation passerelle",
        "status.waitQr": "En attente de scan",
        "taskTreeSessions.entry.desc": "Affiche les sessions de messagerie dans l'arbre des tâches officiel de l'espace de travail. Si désactivé, elles apparaissent uniquement sous l'onglet 'Canaux'.",
        "taskTreeSessions.entry.title": "Afficher les sessions IM dans l'arbre des tâches",
        "taskTreeSessions.entry.toggle": "Basculer l'affichage des sessions IM dans l'arbre des tâches",
        "time.ago": "il y a {t}",
        "time.days": "{n} j",
        "time.hours": "{n} h",
        "time.minutes": "{n} min",
        "time.months": "{n} mois",
        "time.now": "à l'instant",
        "time.years": "{n} an(s)",
      },
      de: {
        "account.autoNameNote": "Der Kontoname wird nach der Kopplung automatisch generiert. Fügen Sie in der Kontozeile eine Notiz hinzu, um Benutzer zu unterscheiden.",
        "account.count": "{count} Konten",
        "account.currentWorkspace": "Aktueller Arbeitsbereich",
        "account.defaultName": "{channel}-Konto {count}",
        "account.presetUnavailable": "Voreinstellung nicht verfügbar",
        "account.privateAccess": "Privatchat-Zugriff",
        "account.privateAll": "Alle DM-Benutzer zulassen",
        "account.privateApproved": "Nur genehmigte Benutzer",
        "account.proxyCustom": "Manuelle Konfiguration",
        "account.proxyDirect": "Direkte Verbindung",
        "account.proxyInherit": "Host folgen",
        "account.proxyMode": "Netzwerk-Proxy",
        "account.proxyNote": "Betrifft nur dieses Konto. Der Kanal verbindet sich nach dem Speichern automatisch neu.",
        "account.proxySaved": "Eine Proxy-Adresse ist gespeichert. Feld leer lassen, um sie beizubehalten.",
        "account.proxyUrl": "Proxy-Adresse",
        "account.receive": "Nachrichten empfangen",
        "account.receiveDescription": "Ausschalten, um Kontoeinstellungen zu behalten, ohne neue Nachrichten zu empfangen",
        "account.remark": "Namensnotiz",
        "account.remarkNote": "Wird nur lokal zur Unterscheidung angezeigt. Leer lassen, um den automatischen Namen wiederherzustellen.",
        "account.removeConfirm": "Möchten Sie dieses Konto wirklich entfernen? Lokal gespeicherte Einstellungen und Anmeldedaten werden ebenfalls gelöscht.",
        "account.rename": "Namensnotiz bearbeiten",
        "account.seconds": "s",
        "account.segmentFull": "Als Ganzes senden",
        "account.segmentGap": "Sendeabstand",
        "account.segmentGapInvalid": "Bitte eine Sekundenzahl zwischen 0 und 60 eingeben.",
        "account.segmentGapMax": "Höchstabstand",
        "account.segmentGapMin": "Mindestabstand",
        "account.segmentGapOrder": "Die Obergrenze darf nicht unter der Untergrenze liegen.",
        "account.segmentReply": "Segmentierte Antworten",
        "account.segmentReplyNote": "Bei segmentiertem Senden teilt der Assistent Antworten an Trennmarkierungen in mehrere kurze Nachrichten; bei vollständigem Senden bleibt alles in einer Nachricht.",
        "account.segmentSplit": "In Segmenten senden",
        "account.selectModel": "Modell auswählen",
        "account.selectPermission": "Berechtigung auswählen",
        "account.selectWorkspace": "Arbeitsbereich auswählen",
        "account.sendMode": "Sendemodus",
        "account.sendQueue": "Warteschlange",
        "account.sendSteer": "Zwischenruf (Steer)",
        "account.sendSteerNote": "Steer übergibt die Nachricht als zusätzliche Anweisung an den nächsten Schritt der aktiven Aufgabe; im Leerlauf verhält es sich wie die Warteschlange.",
        "account.sessionIdle": "Neue Sitzung bei Inaktivität",
        "account.sessionIdleHour": "{n} Std.",
        "account.sessionIdleHours": "{n} Std.",
        "account.sessionIdleMin": "{n} Min.",
        "account.sessionIdleNote": "Startet eine neue Sitzung, wenn nach dieser Inaktivitätsdauer eine neue Nachricht eintrifft; frühere Sitzungen bleiben über /sessions abrufbar. 0 bedeutet deaktiviert.",
        "account.sessionIdleOff": "Deaktiviert (Sitzung beibehalten)",
        "account.statusNotConnected": "Nicht verbunden",
        "account.statusProcessing": "Wird verarbeitet…",
        "account.telegramFreeChatGroups": "Gruppen-ID-Whitelist ohne @",
        "account.telegramFreeChatGroupsInvalid": "Keine gültigen Gruppen-IDs erkannt. Gruppen-IDs sind meist negative Ganzzahlen (z. B. -1001234567890) oder Telegram Web-Links.",
        "account.telegramFreeChatGroupsPartial": "{count} Gruppen-ID(s) wurden nicht erkannt und werden ignoriert. Verwenden Sie negative Ganzzahlen (z. B. -1001234567890) oder Telegram Web-Links.",
        "account.telegramGroupPolicy": "Gruppen-Trigger-Richtlinie",
        "account.telegramGroupPolicyAddressed": "Nur bei @Erwähnung oder Antwort (Standard)",
        "account.telegramGroupPolicyAlways": "Alle Gruppennachrichten",
        "account.telegramGroupPolicyCustom": "Nur bestimmte Gruppen ohne @",
        "account.telegramGroupPolicyNote": "Gilt nur für Gruppen dieses Kontos. Um reguläre Nachrichten zu empfangen, ernennen Sie den Bot zum Admin oder deaktivieren Sie den Datenschutzmodus in @BotFather (/setprivacy → Disable).",
        "account.telegramThinkingDisplay": "Denkprozess anzeigen",
        "account.telegramThinkingDisplayCollapsed": "Eingeklappt",
        "account.telegramThinkingDisplayNote": "Wenn aktiviert, wird das Reasoning als einklappbarer Zitatblock gesendet, der angetippt werden kann. Alle Gruppenmitglieder können ihn einsehen.",
        "account.telegramThinkingDisplayOff": "Aus",
        "account.workspace": "Arbeitsbereich",
        "action.addAccount": "Konto hinzufügen",
        "action.approve": "Genehmigen",
        "action.cancel": "Abbrechen",
        "action.checkConnection": "Verbindung diagnostizieren",
        "action.confirm": "Bestätigen",
        "action.deny": "Ablehnen",
        "action.generateQr": "QR-Code erstellen",
        "action.more": "Weitere Aktionen für {channel}",
        "action.reconnectAccount": "Neu verbinden",
        "action.removeAccount": "Entfernen",
        "action.saving": "Wird gespeichert…",
        "action.settings": "Einstellungen",
        "bind.expire": "QR-Code läuft in {time} ab",
        "bind.generating": "Wird generiert…",
        "bind.manual": "Manuelle Konfiguration",
        "bind.newIdentity": "Neue Kontoidentität erkannt, ein neues Konto wurde erstellt",
        "bind.qrAlt": "Einrichtungs-QR-Code für {channel}",
        "bind.quick": "Schnellkopplung (empfohlen)",
        "bind.refresh": "QR-Code neu generieren",
        "bind.retry": "QR-Code neu generieren",
        "bind.saving": "Konto wird gespeichert…",
        "bind.scanned": "Gescrannt. Bitte auf dem Smartphone bestätigen.",
        "bind.success": "Kopplung erfolgreich, Kanal verbunden",
        "bind.tabsAria": "Kopplungsmethode",
        "bind.title": "{channel} einrichten",
        "channel.dingtalk": "DingTalk",
        "channel.discord": "Discord",
        "channel.feishu": "Feishu",
        "channel.lark": "Lark",
        "channel.qq": "QQ",
        "channel.slack": "Slack",
        "channel.telegram": "Telegram",
        "channel.wecom": "WeCom",
        "channel.weixin": "WeChat",
        "command.disabled": "Nur normale Unterhaltung",
        "command.dm": "Direktnachrichten-Befehle",
        "command.enabled": "Befehle aktiviert",
        "command.group": "Gruppen-Befehle",
        "composer.addWorkspace": "Arbeitsbereich hinzufügen…",
        "composer.noModels": "Keine Modelle",
        "composer.noWorkspaces": "Keine Arbeitsbereiche",
        "composer.permission": "Berechtigung",
        "composer.workspaceRequired": "Vor dem Speichern muss ein Arbeitsbereich hinzugefügt werden.",
        "connection.checkFailed": "Statusprüfung konnte nicht abgeschlossen werden. Erneut versuchen oder lokale Protokolle prüfen.",
        "connection.checkedAt": "Geprüft am",
        "connection.checking": "Wird geprüft…",
        "connection.connected": "Verbunden",
        "connection.connecting": "Verbindung wird hergestellt",
        "connection.disconnected": "Getrennt",
        "connection.error": "Verbindungsfehler",
        "connection.next.connected": "Senden Sie eine Nachricht im ursprünglichen Chat, um die Zustellung zu prüfen. Private Chats folgen den Zugriffseinstellungen.",
        "connection.next.connecting": "Gleich nochmals prüfen. Bestätigen Sie auf Ihrem Telefon, falls ein QR-Scan aussteht.",
        "connection.next.disconnected": "Verbinden Sie das Konto erneut. QR-Kanäle müssen möglicherweise neu gekoppelt werden.",
        "connection.next.error": "Versuchen Sie eine erneute Verbindung. Bei fortbestehendem Problem lokale Protokolle prüfen.",
        "connection.next.reconnecting": "Der Kanal versucht die Wiederherstellung. In Kürze erneut prüfen.",
        "connection.next.stopped": "Wählen Sie Neu verbinden, um das Konto zu starten.",
        "connection.next.unknown": "Aktueller Status konnte nicht bestätigt werden. Später erneut prüfen oder lokale Protokolle einsehen.",
        "connection.paused": "Empfang pausiert",
        "connection.receiveOff": "Empfang ist deaktiviert. Aktivieren Sie ihn in der Kontoliste, bevor Sie Nachrichten senden.",
        "connection.receiveOn": "Empfang ist aktiviert",
        "connection.receiveUnknown": "Empfangseinstellung nicht verfügbar. DSH neu starten und diese Seite aktualisieren.",
        "connection.reconnecting": "Wiederverbindung läuft",
        "connection.restartRequired": "Frontend- und Backend-Versionen stimmen nicht überein. DSH vollständig neu starten, Seite aktualisieren und erneut versuchen.",
        "connection.scope": "Prüft nur die lokale Kanal-Laufzeit. Plattform-Anmeldedaten und Nachrichtenzustellung wurden nicht überprüft.",
        "connection.stopped": "Gestoppt",
        "connection.title": "Ergebnis der Statusprüfung",
        "connection.unknown": "Status unbekannt",
        "copy": "Kopieren",
        "diagnostic.auth": "Anmeldedaten fehlen oder sind ungültig. Konfigurieren oder koppeln Sie das Konto erneut.",
        "diagnostic.bot": "Abfrage der Bot-Identität",
        "diagnostic.cancelled": "Diagnose abgebrochen. Verbindungsstatus wurde nicht bestätigt.",
        "diagnostic.changed": "Kontostatus hat sich geändert. Diagnose erneut ausführen.",
        "diagnostic.config": "WeChat-Konfiguration (getconfig)",
        "diagnostic.credentials": "Überprüfung der Anwendungsanmeldedaten",
        "diagnostic.failed": "Fehlgeschlagen",
        "diagnostic.gateway": "Gateway-Abfrage",
        "diagnostic.heartbeat": "WeCom-Verbindungs-Heartbeat (ping)",
        "diagnostic.invalid-response": "Plattformantwort unvollständig oder ungültig. Verfügbarkeit konnte nicht bestätigt werden.",
        "diagnostic.local-state": "Anmeldedaten konnten nicht gelesen oder der lokale Kontostatus nicht initialisiert werden. Lokale Konfiguration und Dateiberechtigungen prüfen.",
        "diagnostic.missing-context": "Ursprünglicher Chat-Kontext fehlt. Senden Sie eine Nachricht vom gekoppelten Konto und versuchen Sie es erneut.",
        "diagnostic.network": "Netzwerkanfrage fehlgeschlagen. Netzwerk oder Proxy prüfen.",
        "diagnostic.not-connected": "Keine aktive Verbindung zum Prüfen vorhanden. Bitte zuerst neu verbinden.",
        "diagnostic.ok": "Die Plattform hat eine gültige Antwort zurückgegeben",
        "diagnostic.passed": "Bestanden",
        "diagnostic.permission": "Zugriff von der Plattform verweigert. Anwendungsberechtigungen prüfen.",
        "diagnostic.rate-limit": "Ratenbegrenzung der Plattform erreicht. Bitte später erneut versuchen.",
        "diagnostic.rejected": "Plattform hat die Anfrage abgelehnt. Anwendungseinstellungen und Berechtigungen prüfen.",
        "diagnostic.scope": "Ergebnisse von Plattformabfragen oder einem Heartbeat bei dieser Prüfung. Es wurden keine Testnachrichten gesendet; Zustellrechte bleiben ungeprüft.",
        "diagnostic.server": "Plattformdienst fehlgeschlagen. Bitte später erneut versuchen.",
        "diagnostic.timeout": "Diagnose-Zeitüberschreitung. Netzwerk prüfen und erneut versuchen.",
        "diagnostic.title": "Verbindungsdiagnose",
        "diagnostic.unsupported": "Aktuelles SDK oder Konfiguration unterstützt diese Diagnose nicht.",
        "diagnostic.unverified": "Ungeprüft",
        "diagnostic.webhook": "Webhook-Konfliktprüfung",
        "diagnostic.webhook-conflict": "Ein Webhook ist konfiguriert und steht im Konflikt mit Polling. Deaktivieren Sie den Webhook dieses Bots im anderen Dienst.",
        "entry.location.both": "Beide",
        "entry.location.desc": "Wählen Sie, wo IM Connect angezeigt wird (Seitenleiste oder Einstellungsseite)",
        "entry.location.settings": "Nur Einstellungen",
        "entry.location.sidebar": "Nur Seitenleiste",
        "entry.location.title": "Anzeigeort",
        "error.action": "Aktion fehlgeschlagen",
        "error.addWorkspace": "Arbeitsbereich konnte nicht hinzugefügt werden",
        "error.chooseWorkspace": "Arbeitsbereichsverzeichnis auswählen",
        "error.connection": "Verbindung zur lokalen IM-Assistenten-API fehlgeschlagen",
        "error.detailsInLog": "Vorgang fehlgeschlagen. Details in den Serverprotokollen einsehen.",
        "error.load": "Laden fehlgeschlagen",
        "error.loadAssistant": "Kontoeinstellungen konnten nicht geladen werden",
        "error.noModels": "Keine Modelle im Host verfügbar. Konfigurieren Sie zuerst einen Anbieter in der Web-App.",
        "error.qr": "QR-Code konnte nicht generiert werden",
        "error.request": "Anfrage fehlgeschlagen",
        "error.save": "Speichern fehlgeschlagen",
        "error.workspaceUnavailable": "Dieser Host kann keine Arbeitsbereiche hinzufügen",
        "field.dingtalk.clientId": "Client ID (ehemals AppKey)",
        "field.dingtalk.clientSecret": "Client Secret (ehemals AppSecret)",
        "field.discord.token": "Bot Token",
        "field.qq.appId": "AppID",
        "field.qq.appSecret": "AppSecret",
        "field.slack.appToken": "App Token (beginnt mit xapp-)",
        "field.slack.token": "Bot Token (beginnt mit xoxb-)",
        "field.telegram.token": "Bot Token",
        "field.wecom.botId": "Bot ID",
        "field.wecom.secret": "Secret",
        "hover.copied": "Kopiert",
        "loading": "Wird geladen…",
        "pending.notice": "Es liegen Zugriffsanfragen vor. Genehmigen Sie Benutzer, damit sie den lokalen Assistenten steuern können.",
        "permission.fullAccess": "Vollzugriff",
        "permission.readOnly": "Schreibgeschützt",
        "permission.workspaceWrite": "Arbeitsbereich-Schreibzugriff",
        "qr.default": "QR-Code mit der entsprechenden App scannen",
        "qr.dingtalk": "Mit DingTalk scannen; ein Bot wird automatisch erstellt",
        "qr.feishu": "Mit Feishu scannen; ein Bot wird automatisch erstellt",
        "qr.lark": "Mit Lark scannen, um zu koppeln",
        "qr.qq": "Mit mobilem QQ scannen, um einen Open-Platform-Bot zu erstellen",
        "qr.wecom": "Mit WeCom scannen, um schnell einen Bot zu verbinden",
        "qr.weixin": "QR-Code mit WeChat scannen, um die Kopplung abzuschließen",
        "rail.addChannel": "Kanal hinzufügen",
        "rail.archive": "Sitzung archivieren",
        "rail.archived": "Archiviert",
        "rail.byChannel": "Nach Kanal",
        "rail.byWorkspace": "Nach Arbeitsbereich",
        "rail.byWorkspaceTree": "Nach Arbeitsbereichsbaum",
        "rail.channelSettings": "Kanaleinstellungen",
        "rail.channels": "Kanäle",
        "rail.clearSearch": "Suche löschen",
        "rail.compactAnswer": "Antwort",
        "rail.compactApproval": "Genehmigung",
        "rail.compactPlan": "Planprüfung",
        "rail.completed": "Abgeschlossen",
        "rail.deleteSession": "Sitzung löschen",
        "rail.deleteSessionCancel": "Abbrechen",
        "rail.deleteSessionClose": "Schließen",
        "rail.deleteSessionConfirm": "Sitzung löschen",
        "rail.deleteSessionDescription": "Löscht die Sitzung „{name}“, ihre Subagenten (einschließlich laufender) und alle Datensätze (Verlauf, Statistiken, Cache) dauerhaft. Dies kann nicht rückgängig gemacht werden.",
        "rail.deleteSessionFailed": "Sitzung konnte nicht gelöscht werden: {message}",
        "rail.deleteSessionPending": "Sitzung wird gelöscht…",
        "rail.empty": "Noch keine Kanalsitzungen vorhanden. Verbinden Sie einen Kanal unter Einstellungen → IM-Assistent und senden Sie dem Bot eine Nachricht.",
        "rail.filter": "Filter",
        "rail.fork": "Sitzung forken",
        "rail.group": "Gruppieren nach",
        "rail.groupActions": "Kanalaktionen für „{name}“",
        "rail.groupReadOnly": "Kanalgruppen können hier weder umbenannt noch gelöscht werden.",
        "rail.idle": "Inaktiv",
        "rail.list": "Einzelne Liste",
        "rail.onlyArchived": "Nur archivierte",
        "rail.planReview": "Plan prüfen",
        "rail.recent": "Zuletzt aktualisiert",
        "rail.rename": "Umbenennen",
        "rail.renameAria": "Sitzung umbenennen",
        "rail.running": "Aktiv",
        "rail.search": "Suchen",
        "rail.searchPlaceholder": "Sitzungen suchen...",
        "rail.sessions": "Sitzungen",
        "rail.showArchived": "Archivierte anzeigen",
        "rail.sort": "Sortieren nach",
        "rail.subagents": "{n} Subagenten aktiv",
        "rail.tabsAria": "Arbeitsbereich-Kategorien",
        "rail.tasks": "Aufgaben",
        "rail.treeUnavailable": "Der offizielle Baum ist in diesem Host nicht verfügbar.",
        "rail.unarchive": "Sitzung wiederherstellen",
        "rail.ungrouped": "Nicht gruppiert",
        "rail.waitingAnswer": "Wartet auf Antwort",
        "rail.waitingApproval": "Wartet auf Genehmigung",
        "rail.workspace": "Arbeitsbereiche",
        "server.accessDenied": "Zugriff verweigert: Bitten Sie den Administrator unter Einstellungen → IM-Assistent um Genehmigung.",
        "server.accountConnectFailed": "Konto konnte nicht verbunden werden. Lokale Protokolle prüfen.",
        "server.accountMissing": "Konto existiert nicht",
        "server.accountReconnectFailed": "Konto konnte nicht wiederverbunden werden. Lokale Protokolle prüfen.",
        "server.channelUnconfigured": "Kanal nicht konfiguriert",
        "server.createWorkspace": "Zuerst einen Arbeitsbereich hinzufügen",
        "server.missingCredentials": "Unzureichende Anmeldedaten, Kanal kann nicht gestartet werden",
        "server.qrExpired": "QR-Code ist abgelaufen",
        "server.qrIncomplete": "QR-Scan nicht abgeschlossen",
        "server.qrUnsupported": "Dieser Kanal unterstützt keine QR-Code-Kopplung",
        "server.remarkControl": "Kontonotiz darf keine Zeilenumbrüche oder Steuerzeichen enthalten",
        "server.remarkTooLong": "Kontonotiz darf maximal 40 Zeichen lang sein",
        "server.selectAccountSettings": "Anbieter, Modell, Arbeitsbereich oder Berechtigung auswählen",
        "server.selectModel": "Anbieter und Modell auswählen",
        "server.selectPermission": "Berechtigung auswählen",
        "server.selectWorkspace": "Arbeitsbereich auswählen",
        "server.sessionMissing": "Sitzung existiert nicht",
        "server.unknownChannel": "Unbekannter Kanal",
        "settings.aria": "IM-Assistent",
        "settings.description": "Konten über verschiedene Kanäle verwalten. Jedes Konto wählt unabhängig Arbeitsbereich, Modell und Berechtigungen, die nur auf diesem Rechner gespeichert werden.",
        "settings.feedback": "Feedback",
        "settings.label": "IM-Assistent",
        "settings.publicChatNotice": "Nicht genehmigte Benutzer können Chats starten, aber keine Tool-Aufrufe freigeben.",
        "settings.title": "IM-Assistent",
        "settings.viewProject": "GitHub",
        "sidebar.entry.desc": "IM-Verwaltung in der Seitenleiste anzeigen. Der Eintrag in den Einstellungen bleibt erhalten.",
        "sidebar.entry.title": "Seitenleisteneintrag",
        "sidebar.entry.toggle": "Seitenleisteneintrag umschalten",
        "status.authenticating": "Authentifizierung läuft",
        "status.connected": "Verbunden",
        "status.connectingSocket": "Verbindung wird hergestellt",
        "status.connectionError": "Verbindungsfehler",
        "status.connectionFailed": "Verbindung fehlgeschlagen",
        "status.disconnected": "Getrennt",
        "status.loggedIn": "Angemeldet",
        "status.loggedInRecovered": "Angemeldet (wiederhergestellt)",
        "status.loggingIn": "Anmeldung läuft",
        "status.longConnection": "Dauerverbindung hergestellt",
        "status.notLoggedIn": "Nicht angemeldet",
        "status.polling": "Polling läuft",
        "status.reconnectFailed": "Wiederverbindung fehlgeschlagen",
        "status.reconnecting": "Wiederverbindung läuft",
        "status.saved": "Gespeichert",
        "status.saving": "Wird gespeichert…",
        "status.stopped": "Gestoppt",
        "status.streamConnected": "Stream verbunden",
        "status.waitHandshake": "Warte auf Gateway-Handshake",
        "status.waitQr": "Warte auf QR-Scan",
        "taskTreeSessions.entry.desc": "Messaging-Kanalsitzungen im offiziellen Arbeitsbereichs-Aufgabenbaum anzeigen. Deaktiviert werden sie nur im Reiter 'Kanäle' angezeigt.",
        "taskTreeSessions.entry.title": "IM-Sitzungen im Aufgabenbaum anzeigen",
        "taskTreeSessions.entry.toggle": "IM-Sitzungen im Aufgabenbaum umschalten",
        "time.ago": "vor {t}",
        "time.days": "{n} T.",
        "time.hours": "{n} Std.",
        "time.minutes": "{n} Min.",
        "time.months": "{n} M.",
        "time.now": "gerade eben",
        "time.years": "{n} J.",
      },
      ru: {
        "account.autoNameNote": "Имя аккаунта генерируется автоматически после привязки. Если нужно различать пользователей, добавьте примечание в строке аккаунта.",
        "account.count": "Аккаунтов: {count}",
        "account.currentWorkspace": "Текущая рабочая область",
        "account.defaultName": "Аккаунт {channel} {count}",
        "account.presetUnavailable": "Пресет недоступен",
        "account.privateAccess": "Доступ к личным сообщениям",
        "account.privateAll": "Разрешить всем пользователям в ЛС",
        "account.privateApproved": "Только одобренные пользователи",
        "account.proxyCustom": "Ручная настройка",
        "account.proxyDirect": "Прямое подключение",
        "account.proxyInherit": "Следовать хосту",
        "account.proxyMode": "Сетевой прокси",
        "account.proxyNote": "Влияет только на этот аккаунт. Канал автоматически переподключается после сохранения.",
        "account.proxySaved": "Адрес прокси сохранен. Оставьте поле пустым, чтобы сохранить его.",
        "account.proxyUrl": "Адрес прокси",
        "account.receive": "Прием сообщений",
        "account.receiveDescription": "Отключите, чтобы сохранить настройки аккаунта без приема новых сообщений",
        "account.remark": "Примечание к имени",
        "account.remarkNote": "Отображается только в локальных настройках для различия аккаунтов. Оставьте пустым для автоимени.",
        "account.removeConfirm": "Удалить этот аккаунт? Сохраненные локально настройки и учетные данные также будут удалены.",
        "account.rename": "Изменить примечание к имени",
        "account.seconds": "с",
        "account.segmentFull": "Отправлять целиком",
        "account.segmentGap": "Интервал отправки",
        "account.segmentGapInvalid": "Укажите количество секунд от 0 до 60.",
        "account.segmentGapMax": "Максимальный интервал",
        "account.segmentGapMin": "Минимальный интервал",
        "account.segmentGapOrder": "Верхний предел не может быть меньше нижнего.",
        "account.segmentReply": "Сегментированные ответы",
        "account.segmentReplyNote": "При выборе отправки частями ассистент разбивает ответ на несколько коротких сообщений по разделителю; отправка целиком сохраняет весь ответ в одном сообщении.",
        "account.segmentSplit": "Отправлять частями",
        "account.selectModel": "Выберите модель",
        "account.selectPermission": "Выберите права доступа",
        "account.selectWorkspace": "Выберите рабочую область",
        "account.sendMode": "Режим отправки",
        "account.sendQueue": "В очередь",
        "account.sendSteer": "Вмешательство (Steer)",
        "account.sendSteerNote": "Режим вмешательства передает сообщение запущенной задаче в качестве дополнительной инструкции на следующем шаге; в режиме ожидания работает как очередь.",
        "account.sessionIdle": "Новая сессия при неактивности",
        "account.sessionIdleHour": "{n} ч",
        "account.sessionIdleHours": "{n} ч",
        "account.sessionIdleMin": "{n} мин",
        "account.sessionIdleNote": "Запускает новую сессию, если после указанного периода неактивности поступает новое сообщение; старые сессии доступны через /sessions. 0 — отключить.",
        "account.sessionIdleOff": "Отключено (сохранять сессию)",
        "account.statusNotConnected": "Не подключено",
        "account.statusProcessing": "Обработка…",
        "account.telegramFreeChatGroups": "Белый список ID групп без @",
        "account.telegramFreeChatGroupsInvalid": "Не обнаружено действительных ID групп. Обычно это отрицательные числа (например, -1001234567890) или веб-ссылка Telegram.",
        "account.telegramFreeChatGroupsPartial": "{count} ID групп не удалось распознать, они будут проигнорированы. Используйте отрицательные числа (например, -1001234567890) или веб-ссылку Telegram.",
        "account.telegramGroupPolicy": "Политика срабатывания в группах",
        "account.telegramGroupPolicyAddressed": "Только при @упоминании или ответе (по умолчанию)",
        "account.telegramGroupPolicyAlways": "Все сообщения группы",
        "account.telegramGroupPolicyCustom": "Только указанные группы без @",
        "account.telegramGroupPolicyNote": "Влияет только на группы этого аккаунта. Чтобы бот получал обычные сообщения, сделайте его администратором или отключите режим конфиденциальности в @BotFather (/setprivacy → Disable).",
        "account.telegramThinkingDisplay": "Отображение хода мыслей",
        "account.telegramThinkingDisplayCollapsed": "Свернуто",
        "account.telegramThinkingDisplayNote": "Если включено, ход мыслей отправляется в виде сворачиваемого цитатного блока. Все участники группы могут развернуть и просмотреть его.",
        "account.telegramThinkingDisplayOff": "Выкл",
        "account.workspace": "Рабочая область",
        "action.addAccount": "Добавить аккаунт",
        "action.approve": "Одобрить",
        "action.cancel": "Отмена",
        "action.checkConnection": "Диагностика подключения",
        "action.confirm": "Подтвердить",
        "action.deny": "Отклонить",
        "action.generateQr": "Создать QR-код",
        "action.more": "Другие действия для {channel}",
        "action.reconnectAccount": "Переподключить",
        "action.removeAccount": "Удалить",
        "action.saving": "Сохранение…",
        "action.settings": "Настройки",
        "bind.expire": "Срок действия QR-кода истекает через {time}",
        "bind.generating": "Создание…",
        "bind.manual": "Ручная настройка",
        "bind.newIdentity": "Обнаружена новая личность аккаунта, создан новый аккаунт",
        "bind.qrAlt": "QR-код настройки {channel}",
        "bind.quick": "Быстрая привязка (рекомендуется)",
        "bind.refresh": "Создать QR-код заново",
        "bind.retry": "Создать QR-код заново",
        "bind.saving": "Сохранение аккаунта…",
        "bind.scanned": "Отсканировано. Подтвердите на телефоне.",
        "bind.success": "Привязка успешна, канал подключен",
        "bind.tabsAria": "Способ привязки",
        "bind.title": "Настройка {channel}",
        "channel.dingtalk": "DingTalk",
        "channel.discord": "Discord",
        "channel.feishu": "Feishu",
        "channel.lark": "Lark",
        "channel.qq": "QQ",
        "channel.slack": "Slack",
        "channel.telegram": "Telegram",
        "channel.wecom": "WeCom",
        "channel.weixin": "WeChat",
        "command.disabled": "Только обычный диалог",
        "command.dm": "Команды в личных сообщениях",
        "command.enabled": "Команды разрешены",
        "command.group": "Команды в группах",
        "composer.addWorkspace": "Добавить рабочую область…",
        "composer.noModels": "Нет моделей",
        "composer.noWorkspaces": "Нет рабочих областей",
        "composer.permission": "Права доступа",
        "composer.workspaceRequired": "Сначала добавьте рабочую область перед сохранением.",
        "connection.checkFailed": "Проверка состояния не завершена. Повторите попытку или проверьте локальные журналы.",
        "connection.checkedAt": "Проверено в",
        "connection.checking": "Проверка…",
        "connection.connected": "Подключено",
        "connection.connecting": "Подключение",
        "connection.disconnected": "Отключено",
        "connection.error": "Ошибка подключения",
        "connection.next.connected": "Отправьте сообщение в исходный чат для проверки доставки. Личные чаты подчиняются правилам доступа.",
        "connection.next.connecting": "Проверьте снова чуть позже. Если ожидается сканирование QR-кода, подтвердите на телефоне.",
        "connection.next.disconnected": "Переподключите аккаунт. Каналы с QR-кодом может потребоваться привязать заново.",
        "connection.next.error": "Попробуйте переподключиться. Если проблема сохраняется, проверьте локальные журналы.",
        "connection.next.reconnecting": "Канал пытается восстановиться. Проверьте снова через некоторое время.",
        "connection.next.stopped": "Нажмите «Переподключить», чтобы запустить аккаунт.",
        "connection.next.unknown": "Текущее состояние не подтверждено. Проверьте позже или просмотрите локальные журналы.",
        "connection.paused": "Прием приостановлен",
        "connection.receiveOff": "Прием сообщений выключен. Включите его в списке аккаунтов перед отправкой сообщений.",
        "connection.receiveOn": "Прием сообщений включен",
        "connection.receiveUnknown": "Настройка приема недоступна. Перезапустите DSH и обновите эту страницу.",
        "connection.reconnecting": "Переподключение",
        "connection.restartRequired": "Несоответствие версий фронтенда и бэкенда. Полностью перезапустите DSH, обновите страницу и повторите попытку.",
        "connection.scope": "Проверяется только локальная среда канала. Учетные данные платформы и доставка сообщений не проверялись.",
        "connection.stopped": "Остановлено",
        "connection.title": "Результат проверки состояния",
        "connection.unknown": "Статус неизвестен",
        "copy": "Копировать",
        "diagnostic.auth": "Учетные данные отсутствуют или недействительны. Настройте или привяжите аккаунт заново.",
        "diagnostic.bot": "Запрос идентификатора бота",
        "diagnostic.cancelled": "Диагностика отменена. Состояние подключения не подтверждено.",
        "diagnostic.changed": "Состояние аккаунта изменилось. Запустите диагностику снова.",
        "diagnostic.config": "Конфигурация WeChat (getconfig)",
        "diagnostic.credentials": "Проверка учетных данных приложения",
        "diagnostic.failed": "Сбой",
        "diagnostic.gateway": "Запрос шлюза",
        "diagnostic.heartbeat": "Heartbeat подключения WeCom (ping)",
        "diagnostic.invalid-response": "Неполный или некорректный ответ платформы. Доступность не подтверждена.",
        "diagnostic.local-state": "Не удалось прочитать учетные данные или инициализировать локальное состояние. Проверьте конфигурацию и права доступа к файлам.",
        "diagnostic.missing-context": "Отсутствует исходный контекст чата. Отправьте сообщение из привязанного аккаунта и повторите попытку.",
        "diagnostic.network": "Сетевой запрос не удался. Проверьте подключение к сети или прокси.",
        "diagnostic.not-connected": "Нет активного подключения для проверки. Сначала переподключитесь.",
        "diagnostic.ok": "Платформа вернула корректный ответ",
        "diagnostic.passed": "Пройдено",
        "diagnostic.permission": "Платформа отклонила доступ. Проверьте разрешения приложения.",
        "diagnostic.rate-limit": "Превышен лимит запросов платформы. Повторите попытку позже.",
        "diagnostic.rejected": "Платформа отклонила запрос. Проверьте параметры приложения и права доступа.",
        "diagnostic.scope": "Результаты запросов к платформе или heartbeat в этой проверке. Тестовые сообщения не отправлялись; права на доставку не проверялись.",
        "diagnostic.server": "Ошибка службы платформы. Повторите попытку позже.",
        "diagnostic.timeout": "Время ожидания диагностики истекло. Проверьте сеть и повторите попытку.",
        "diagnostic.title": "Диагностика подключения",
        "diagnostic.unsupported": "Текущий SDK или конфигурация не поддерживают эту диагностику.",
        "diagnostic.unverified": "Не проверено",
        "diagnostic.webhook": "Проверка конфликтов Webhook",
        "diagnostic.webhook-conflict": "Настроен Webhook, конфликтующий с опросом. Отключите Webhook этого бота в другой службе.",
        "entry.location.both": "Везде",
        "entry.location.desc": "Выберите, где отображается IM Connect (боковая панель или страница настроек)",
        "entry.location.settings": "Только настройки",
        "entry.location.sidebar": "Только боковая панель",
        "entry.location.title": "Расположение входа",
        "error.action": "Действие не удалось",
        "error.addWorkspace": "Не удалось добавить рабочую область",
        "error.chooseWorkspace": "Выберите каталог рабочей области",
        "error.connection": "Не удалось подключиться к локальному API IM-ассистента",
        "error.detailsInLog": "Операция не удалась. Подробности см. в журналах сервера.",
        "error.load": "Не удалось загрузить",
        "error.loadAssistant": "Не удалось загрузить настройки аккаунта",
        "error.noModels": "В хосте нет доступных моделей. Сначала настройте провайдера в веб-интерфейсе.",
        "error.qr": "Не удалось создать QR-код",
        "error.request": "Запрос не удался",
        "error.save": "Не удалось сохранить",
        "error.workspaceUnavailable": "Этот хост не может добавлять рабочие области",
        "field.dingtalk.clientId": "Client ID (ранее AppKey)",
        "field.dingtalk.clientSecret": "Client Secret (ранее AppSecret)",
        "field.discord.token": "Bot Token",
        "field.qq.appId": "AppID",
        "field.qq.appSecret": "AppSecret",
        "field.slack.appToken": "App Token (начинается с xapp-)",
        "field.slack.token": "Bot Token (начинается с xoxb-)",
        "field.telegram.token": "Bot Token",
        "field.wecom.botId": "Bot ID",
        "field.wecom.secret": "Secret",
        "hover.copied": "Скопировано",
        "loading": "Загрузка…",
        "pending.notice": "Есть запросы на доступ. Одобрите пользователя, чтобы он мог взаимодействовать с локальным ассистентом.",
        "permission.fullAccess": "Полный доступ",
        "permission.readOnly": "Только чтение",
        "permission.workspaceWrite": "Запись в рабочую область",
        "qr.default": "Отсканируйте QR-код в соответствующем приложении",
        "qr.dingtalk": "Отсканируйте в DingTalk; бот будет создан автоматически",
        "qr.feishu": "Отсканируйте в Feishu; бот будет создан автоматически",
        "qr.lark": "Отсканируйте в Lark для сопряжения",
        "qr.qq": "Отсканируйте в мобильном QQ для создания бота Open Platform",
        "qr.wecom": "Отсканируйте в WeCom для быстрого подключения бота",
        "qr.weixin": "Отсканируйте QR-код в WeChat для завершения привязки",
        "rail.addChannel": "Добавить канал",
        "rail.archive": "Архивировать сессию",
        "rail.archived": "В архиве",
        "rail.byChannel": "По каналу",
        "rail.byWorkspace": "По рабочей области",
        "rail.byWorkspaceTree": "По дереву рабочих областей",
        "rail.channelSettings": "Настройки канала",
        "rail.channels": "Каналы",
        "rail.clearSearch": "Очистить поиск",
        "rail.compactAnswer": "Ответ",
        "rail.compactApproval": "Одобрение",
        "rail.compactPlan": "План",
        "rail.completed": "Завершено",
        "rail.deleteSession": "Удалить сессию",
        "rail.deleteSessionCancel": "Отмена",
        "rail.deleteSessionClose": "Закрыть",
        "rail.deleteSessionConfirm": "Удалить сессию",
        "rail.deleteSessionDescription": "Сессия «{name}», ее субагенты (включая запущенных) и все записи (диалог, статистика, кэш) будут удалены безвозвратно. Это действие необратимо.",
        "rail.deleteSessionFailed": "Не удалось удалить сессию: {message}",
        "rail.deleteSessionPending": "Удаление сессии…",
        "rail.empty": "Сессий каналов пока нет. Подключите канал в меню Настройки → IM-ассистент и отправьте боту сообщение.",
        "rail.filter": "Фильтр",
        "rail.fork": "Ответвить сессию",
        "rail.group": "Группировка",
        "rail.groupActions": "Действия с каналом «{name}»",
        "rail.groupReadOnly": "Группы каналов нельзя переименовать или удалить здесь.",
        "rail.idle": "Ожидание",
        "rail.list": "Общий список",
        "rail.onlyArchived": "Только архивные",
        "rail.planReview": "План на проверке",
        "rail.recent": "Недавние",
        "rail.rename": "Переименовать",
        "rail.renameAria": "Переименовать сессию",
        "rail.running": "Выполняется",
        "rail.search": "Поиск",
        "rail.searchPlaceholder": "Поиск сессий...",
        "rail.sessions": "Сессии",
        "rail.showArchived": "Показывать архивные",
        "rail.sort": "Сортировка",
        "rail.subagents": "{n} субагентов активно",
        "rail.tabsAria": "Категории рабочей области",
        "rail.tasks": "Задачи",
        "rail.treeUnavailable": "Официальное дерево недоступно в этом хосте.",
        "rail.unarchive": "Восстановить сессию",
        "rail.ungrouped": "Без группы",
        "rail.waitingAnswer": "Ожидает ответа",
        "rail.waitingApproval": "Ожидает одобрения",
        "rail.workspace": "Рабочие области",
        "server.accessDenied": "Доступ запрещен: попросите администратора одобрить ваш доступ в меню Настройки → IM-ассистент.",
        "server.accountConnectFailed": "Не удалось подключить аккаунт. Проверьте локальные журналы.",
        "server.accountMissing": "Аккаунт не существует",
        "server.accountReconnectFailed": "Не удалось переподключить аккаунт. Проверьте локальные журналы.",
        "server.channelUnconfigured": "Канал не настроен",
        "server.createWorkspace": "Сначала добавьте рабочую область",
        "server.missingCredentials": "Недостаточно учетных данных для запуска канала",
        "server.qrExpired": "Срок действия QR-кода истек",
        "server.qrIncomplete": "Сканирование QR-кода не завершено",
        "server.qrUnsupported": "Этот канал не поддерживает привязку по QR-коду",
        "server.remarkControl": "Примечание к аккаунту не может содержать переводы строк или управляющие символы",
        "server.remarkTooLong": "Примечание к аккаунту не может превышать 40 символов",
        "server.selectAccountSettings": "Выберите провайдера, модель, рабочую область или права доступа",
        "server.selectModel": "Выберите провайдера и модель",
        "server.selectPermission": "Выберите права доступа",
        "server.selectWorkspace": "Выберите рабочую область",
        "server.sessionMissing": "Сессия не существует",
        "server.unknownChannel": "Неизвестный канал",
        "settings.aria": "IM-ассистент",
        "settings.description": "Управление аккаунтами на различных каналах. Для каждого аккаунта независимо настраиваются рабочая область, модель и права, сохраняемые только локально.",
        "settings.feedback": "Отзывы и проблемы",
        "settings.label": "IM-ассистент",
        "settings.publicChatNotice": "Неодобренные пользователи могут начинать диалог, но не могут утверждать вызовы инструментов.",
        "settings.title": "IM-ассистент",
        "settings.viewProject": "GitHub",
        "sidebar.entry.desc": "Отображать вход в IM на боковой панели. Вход в настройках сохраняется в любом случае.",
        "sidebar.entry.title": "Пункт на боковой панели",
        "sidebar.entry.toggle": "Переключить отображение на боковой панели",
        "status.authenticating": "Аутентификация",
        "status.connected": "Подключено",
        "status.connectingSocket": "Подключение",
        "status.connectionError": "Ошибка подключения",
        "status.connectionFailed": "Сбой подключения",
        "status.disconnected": "Отключено",
        "status.loggedIn": "Вход выполнен",
        "status.loggedInRecovered": "Вход выполнен (восстановлено)",
        "status.loggingIn": "Выполняется вход",
        "status.longConnection": "Постоянное соединение установлено",
        "status.notLoggedIn": "Вход не выполнен",
        "status.polling": "Опрос",
        "status.reconnectFailed": "Ошибка переподключения",
        "status.reconnecting": "Переподключение",
        "status.saved": "Сохранено",
        "status.saving": "Сохранение…",
        "status.stopped": "Остановлено",
        "status.streamConnected": "Stream подключен",
        "status.waitHandshake": "Ожидание рукопожатия шлюза",
        "status.waitQr": "Ожидание сканирования",
        "taskTreeSessions.entry.desc": "Отображать сессии каналов в официальном дереве задач рабочей области. При отключении сессии видны только на вкладке «Каналы».",
        "taskTreeSessions.entry.title": "Показывать сессии IM в дереве задач",
        "taskTreeSessions.entry.toggle": "Переключить показ сессий IM в дереве задач",
        "time.ago": "{t} назад",
        "time.days": "{n} д",
        "time.hours": "{n} ч",
        "time.minutes": "{n} мин",
        "time.months": "{n} мес",
        "time.now": "только что",
        "time.years": "{n} г",
      },
      pt: {
        "account.autoNameNote": "O nome da conta é gerado automaticamente após a vinculação. Adicione uma observação na linha da conta se precisar diferenciar usuários.",
        "account.count": "{count} contas",
        "account.currentWorkspace": "Espaço de trabalho atual",
        "account.defaultName": "Conta do {channel} {count}",
        "account.presetUnavailable": "Predefinição indisponível",
        "account.privateAccess": "Acesso ao chat privado",
        "account.privateAll": "Permitir todos os usuários em DM",
        "account.privateApproved": "Apenas usuários aprovados",
        "account.proxyCustom": "Configuração manual",
        "account.proxyDirect": "Conexão direta",
        "account.proxyInherit": "Seguir host",
        "account.proxyMode": "Proxy de rede",
        "account.proxyNote": "Afeta apenas esta conta. O canal reconecta automaticamente após salvar.",
        "account.proxySaved": "Um endereço de proxy foi salvo. Deixe em branco para mantê-lo.",
        "account.proxyUrl": "Endereço do proxy",
        "account.receive": "Receber mensagens",
        "account.receiveDescription": "Desative para manter as configurações da conta sem receber novas mensagens",
        "account.remark": "Observação do nome",
        "account.remarkNote": "Exibido apenas nas configurações locais para distinguir contas. Deixe em branco para restaurar o nome automático.",
        "account.removeConfirm": "Tem certeza de que deseja remover esta conta? As configurações e credenciais salvas localmente também serão excluídas.",
        "account.rename": "Editar observação do nome",
        "account.seconds": "s",
        "account.segmentFull": "Enviar completa",
        "account.segmentGap": "Intervalo de envio",
        "account.segmentGapInvalid": "Insira um número de segundos entre 0 e 60.",
        "account.segmentGapMax": "Intervalo máximo",
        "account.segmentGapMin": "Intervalo mínimo",
        "account.segmentGapOrder": "O limite máximo não pode ser menor que o mínimo.",
        "account.segmentReply": "Respostas segmentadas",
        "account.segmentReplyNote": "Ao enviar em segmentos, o assistente divide a resposta em várias mensagens curtas no separador e as envia uma a uma; Enviar completa mantém a mensagem inteira.",
        "account.segmentSplit": "Enviar em segmentos",
        "account.selectModel": "Selecione um modelo",
        "account.selectPermission": "Selecione uma permissão",
        "account.selectWorkspace": "Selecione um espaço de trabalho",
        "account.sendMode": "Modo de envio",
        "account.sendQueue": "Fila",
        "account.sendSteer": "Intervenção (Steer)",
        "account.sendSteerNote": "A intervenção entrega a mensagem à tarefa em execução como instrução adicional no próximo passo; em repouso funciona como fila.",
        "account.sessionIdle": "Nova sessão por inatividade",
        "account.sessionIdleHour": "{n} h",
        "account.sessionIdleHours": "{n} h",
        "account.sessionIdleMin": "{n} min",
        "account.sessionIdleNote": "Inicia uma nova sessão quando a próxima mensagem chega após este período de inatividade; sessões anteriores permanecem em /sessions. 0 para desativar.",
        "account.sessionIdleOff": "Desativado (manter sessão)",
        "account.statusNotConnected": "Não conectado",
        "account.statusProcessing": "Processando…",
        "account.telegramFreeChatGroups": "Lista de grupos livres de @",
        "account.telegramFreeChatGroupsInvalid": "Nenhum ID de grupo válido detectado. IDs de grupo são normalmente números inteiros negativos (ex. -1001234567890), ou cole o link do Telegram Web.",
        "account.telegramFreeChatGroupsPartial": "{count} ID(s) de grupo não puderam ser reconhecidos e serão ignorados. Use inteiros negativos (ex. -1001234567890) ou link do Telegram Web.",
        "account.telegramGroupPolicy": "Política de disparo em grupo",
        "account.telegramGroupPolicyAddressed": "Apenas com @menção ou resposta (padrão)",
        "account.telegramGroupPolicyAlways": "Todas as mensagens do grupo",
        "account.telegramGroupPolicyCustom": "Apenas grupos especificados sem @",
        "account.telegramGroupPolicyNote": "Aplica-se apenas aos grupos desta conta. Para receber mensagens normais, torne o bot administrador ou desative o modo de privacidade no @BotFather (/setprivacy → Disable).",
        "account.telegramThinkingDisplay": "Exibir processo de pensamento",
        "account.telegramThinkingDisplayCollapsed": "Recolhido",
        "account.telegramThinkingDisplayNote": "Quando ativado, o raciocínio é enviado como um bloco de citação expansível que pode ser aberto com um toque. Visível para todos no grupo.",
        "account.telegramThinkingDisplayOff": "Desativado",
        "account.workspace": "Espaço de trabalho",
        "action.addAccount": "Adicionar conta",
        "action.approve": "Aprovar",
        "action.cancel": "Cancelar",
        "action.checkConnection": "Diagnosticar conexão",
        "action.confirm": "Confirmar",
        "action.deny": "Recusar",
        "action.generateQr": "Gerar código QR",
        "action.more": "Mais opções para {channel}",
        "action.reconnectAccount": "Reconectar",
        "action.removeAccount": "Remover",
        "action.saving": "Salvando…",
        "action.settings": "Configurações",
        "bind.expire": "O código QR expira em {time}",
        "bind.generating": "Gerando…",
        "bind.manual": "Configuração manual",
        "bind.newIdentity": "Nova identidade de conta detectada e nova conta criada",
        "bind.qrAlt": "Código QR de configuração do {channel}",
        "bind.quick": "Vinculação rápida (recomendado)",
        "bind.refresh": "Gerar novo código QR",
        "bind.retry": "Gerar novo código QR",
        "bind.saving": "Salvando conta…",
        "bind.scanned": "Escaneado. Confirme no seu celular.",
        "bind.success": "Vinculação bem-sucedida, canal conectado",
        "bind.tabsAria": "Método de vinculação",
        "bind.title": "Configurar {channel}",
        "channel.dingtalk": "DingTalk",
        "channel.discord": "Discord",
        "channel.feishu": "Feishu",
        "channel.lark": "Lark",
        "channel.qq": "QQ",
        "channel.slack": "Slack",
        "channel.telegram": "Telegram",
        "channel.wecom": "WeCom",
        "channel.weixin": "WeChat",
        "command.disabled": "Apenas conversa normal",
        "command.dm": "Comandos de mensagem privada",
        "command.enabled": "Comandos habilitados",
        "command.group": "Comandos de grupo",
        "composer.addWorkspace": "Adicionar espaço de trabalho…",
        "composer.noModels": "Sem modelos",
        "composer.noWorkspaces": "Nenhum espaço de trabalho",
        "composer.permission": "Permissão",
        "composer.workspaceRequired": "Adicione um espaço de trabalho antes de salvar.",
        "connection.checkFailed": "A verificação de status não pôde ser concluída. Tente novamente ou consulte os logs locais se persistir.",
        "connection.checkedAt": "Verificado em",
        "connection.checking": "Verificando…",
        "connection.connected": "Conectado",
        "connection.connecting": "Conectando",
        "connection.disconnected": "Desconectado",
        "connection.error": "Erro de conexão",
        "connection.next.connected": "Envie uma mensagem no chat original para verificar a entrega. Chats privados seguem as regras de acesso.",
        "connection.next.connecting": "Verifique novamente em breve. Se houver leitura de QR pendente, confirme no seu celular.",
        "connection.next.disconnected": "Reconecte a conta. Canais por QR code podem precisar ser emparelhados novamente.",
        "connection.next.error": "Tente reconectar. Se o problema persistir, verifique os logs locais.",
        "connection.next.reconnecting": "O canal está tentando se recuperar. Verifique novamente em breve.",
        "connection.next.stopped": "Selecione Reconectar para iniciar a conta.",
        "connection.next.unknown": "Não foi possível confirmar o status atual. Verifique mais tarde ou consulte os logs locais.",
        "connection.paused": "Recebimento pausado",
        "connection.receiveOff": "O recebimento está desativado. Ative-o na lista de contas antes de enviar mensagens.",
        "connection.receiveOn": "O recebimento está ativado",
        "connection.receiveUnknown": "Configuração de recebimento indisponível. Reinicie o DSH e recarregue a página.",
        "connection.reconnecting": "Reconectando",
        "connection.restartRequired": "Incompatibilidade de versões do frontend e backend. Reinicie o DSH completamente, recarregue a página e tente novamente.",
        "connection.scope": "Verifica apenas o runtime do canal local. Credenciais da plataforma e entrega de mensagens não foram verificadas.",
        "connection.stopped": "Parado",
        "connection.title": "Resultado da verificação de status",
        "connection.unknown": "Status desconhecido",
        "copy": "Copiar",
        "diagnostic.auth": "Credenciais ausentes ou inválidas. Configure ou emparelhe a conta novamente.",
        "diagnostic.bot": "Consulta de identidade do bot",
        "diagnostic.cancelled": "Diagnóstico cancelado. O estado da conexão não foi confirmado.",
        "diagnostic.changed": "O estado da conta mudou. Execute o diagnóstico novamente.",
        "diagnostic.config": "Configuração do WeChat (getconfig)",
        "diagnostic.credentials": "Verificação de credenciais do aplicativo",
        "diagnostic.failed": "Falha",
        "diagnostic.gateway": "Consulta de gateway",
        "diagnostic.heartbeat": "Heartbeat de conexão WeCom (ping)",
        "diagnostic.invalid-response": "Resposta da plataforma incompleta ou inválida. Disponibilidade não confirmada.",
        "diagnostic.local-state": "Não foi possível ler credenciais ou inicializar o estado local. Verifique as configurações locais e permissões de arquivos.",
        "diagnostic.missing-context": "Contexto do chat original ausente. Envie uma mensagem pela conta vinculada e tente novamente.",
        "diagnostic.network": "A solicitação de rede falhou. Verifique sua rede ou proxy.",
        "diagnostic.not-connected": "Nenhuma conexão ativa para verificar. Reconecte primeiro.",
        "diagnostic.ok": "A plataforma retornou uma resposta válida",
        "diagnostic.passed": "Aprovado",
        "diagnostic.permission": "Acesso negado pela plataforma. Verifique as permissões do aplicativo.",
        "diagnostic.rate-limit": "Limite de taxa da plataforma atingido. Tente novamente mais tarde.",
        "diagnostic.rejected": "A plataforma rejeitou a solicitação. Verifique as configurações e permissões.",
        "diagnostic.scope": "Resultados de consultas à plataforma ou heartbeat nesta verificação. Nenhuma mensagem de teste enviada; permissões de entrega não verificadas.",
        "diagnostic.server": "Falha no serviço da plataforma. Tente novamente mais tarde.",
        "diagnostic.timeout": "Tempo limite de diagnóstico esgotado. Verifique a rede e tente novamente.",
        "diagnostic.title": "Diagnóstico de conexão",
        "diagnostic.unsupported": "O SDK ou configuração atual não suporta este diagnóstico.",
        "diagnostic.unverified": "Não verificado",
        "diagnostic.webhook": "Verificação de conflito de Webhook",
        "diagnostic.webhook-conflict": "Um Webhook está configurado e em conflito com o polling. Desative o Webhook deste bot no outro serviço.",
        "entry.location.both": "Ambos",
        "entry.location.desc": "Escolha onde exibir o IM Connect (barra lateral ou página de Configurações)",
        "entry.location.settings": "Apenas Configurações",
        "entry.location.sidebar": "Apenas barra lateral",
        "entry.location.title": "Local de exibição",
        "error.action": "Ação falhou",
        "error.addWorkspace": "Não foi possível adicionar o espaço de trabalho",
        "error.chooseWorkspace": "Escolha um diretório de espaço de trabalho",
        "error.connection": "Não foi possível conectar à API local do Assistente IM",
        "error.detailsInLog": "A operação falhou. Verifique os logs do servidor para mais detalhes.",
        "error.load": "Falha ao carregar",
        "error.loadAssistant": "Não foi possível carregar as configurações da conta",
        "error.noModels": "Nenhum modelo disponível no host. Configure um provedor no aplicativo web primeiro.",
        "error.qr": "Não foi possível gerar o código QR",
        "error.request": "Falha na solicitação",
        "error.save": "Não foi possível salvar",
        "error.workspaceUnavailable": "Este host não pode adicionar espaços de trabalho",
        "field.dingtalk.clientId": "Client ID (anteriormente AppKey)",
        "field.dingtalk.clientSecret": "Client Secret (anteriormente AppSecret)",
        "field.discord.token": "Bot Token",
        "field.qq.appId": "AppID",
        "field.qq.appSecret": "AppSecret",
        "field.slack.appToken": "App Token (começa com xapp-)",
        "field.slack.token": "Bot Token (começa com xoxb-)",
        "field.telegram.token": "Bot Token",
        "field.wecom.botId": "Bot ID",
        "field.wecom.secret": "Secret",
        "hover.copied": "Copiado",
        "loading": "Carregando…",
        "pending.notice": "Existem solicitações de acesso. Aprove um usuário para permitir que ele controle o assistente local.",
        "permission.fullAccess": "Acesso total",
        "permission.readOnly": "Somente leitura",
        "permission.workspaceWrite": "Gravação no espaço de trabalho",
        "qr.default": "Escaneie o código QR com o aplicativo correspondente",
        "qr.dingtalk": "Escaneie com o DingTalk; um bot será criado automaticamente",
        "qr.feishu": "Escaneie com o Feishu; um bot será criado automaticamente",
        "qr.lark": "Escaneie com o Lark para emparelhar",
        "qr.qq": "Escaneie com o QQ móvel para criar um bot Open Platform",
        "qr.wecom": "Escaneie com o WeCom para conectar um bot rapidamente",
        "qr.weixin": "Escaneie o código QR com o WeChat para concluir a vinculação",
        "rail.addChannel": "Adicionar canal",
        "rail.archive": "Arquivar sessão",
        "rail.archived": "Arquivado",
        "rail.byChannel": "Por canal",
        "rail.byWorkspace": "Por espaço de trabalho",
        "rail.byWorkspaceTree": "Por árvore de espaços de trabalho",
        "rail.channelSettings": "Configurações do canal",
        "rail.channels": "Canais",
        "rail.clearSearch": "Limpar busca",
        "rail.compactAnswer": "Resposta",
        "rail.compactApproval": "Aprovação",
        "rail.compactPlan": "Revisão do plano",
        "rail.completed": "Concluído",
        "rail.deleteSession": "Excluir sessão",
        "rail.deleteSessionCancel": "Cancelar",
        "rail.deleteSessionClose": "Fechar",
        "rail.deleteSessionConfirm": "Excluir sessão",
        "rail.deleteSessionDescription": "Isso excluirá permanentemente a sessão “{name}”, seus subagentes (incluindo os ativos) e todos os registros (conversa, estatísticas, cache). Esta ação não pode ser desfeita.",
        "rail.deleteSessionFailed": "Não foi possível excluir a sessão: {message}",
        "rail.deleteSessionPending": "Excluindo sessão…",
        "rail.empty": "Nenhuma sessão de canal ainda. Conecte um canal em Configurações → Assistente IM e envie uma mensagem para o bot.",
        "rail.filter": "Filtrar",
        "rail.fork": "Bifurcar sessão",
        "rail.group": "Agrupar por",
        "rail.groupActions": "Ações de canal para “{name}”",
        "rail.groupReadOnly": "Grupos de canais não podem ser renomeados ou excluídos aqui.",
        "rail.idle": "Inativo",
        "rail.list": "Lista única",
        "rail.onlyArchived": "Apenas arquivadas",
        "rail.planReview": "Plano para revisar",
        "rail.recent": "Recente",
        "rail.rename": "Renombrar",
        "rail.renameAria": "Renomear sessão",
        "rail.running": "Em execução",
        "rail.search": "Buscar",
        "rail.searchPlaceholder": "Buscar sessões...",
        "rail.sessions": "Sessões",
        "rail.showArchived": "Mostrar arquivadas",
        "rail.sort": "Ordenar por",
        "rail.subagents": "{n} subagentes em execução",
        "rail.tabsAria": "Categorias de espaço de trabalho",
        "rail.tasks": "Tarefas",
        "rail.treeUnavailable": "A árvore oficial não está disponível neste host.",
        "rail.unarchive": "Restaurar sessão",
        "rail.ungrouped": "Sem grupo",
        "rail.waitingAnswer": "Aguardando resposta",
        "rail.waitingApproval": "Aguardando aprovação",
        "rail.workspace": "Espaços de trabalho",
        "server.accessDenied": "Acesso negado: solicite a um administrador para aprovar seu acesso em Configurações → Assistente IM.",
        "server.accountConnectFailed": "Não foi possível conectar a conta. Verifique os logs locais.",
        "server.accountMissing": "A conta não existe",
        "server.accountReconnectFailed": "Não foi possível reconectar a conta. Verifique os logs locais.",
        "server.channelUnconfigured": "Canal não configurado",
        "server.createWorkspace": "Adicione um espaço de trabalho primeiro",
        "server.missingCredentials": "Credenciais insuficientes para iniciar o canal",
        "server.qrExpired": "O código QR expirou",
        "server.qrIncomplete": "Leitura de QR code incompleta",
        "server.qrUnsupported": "Este canal não suporta vinculação por código QR",
        "server.remarkControl": "A observação da conta não pode conter quebras de linha ou caracteres de controle",
        "server.remarkTooLong": "A observação da conta não pode exceder 40 caracteres",
        "server.selectAccountSettings": "Selecione provedor, modelo, espaço de trabalho ou permissão",
        "server.selectModel": "Selecione provedor e modelo",
        "server.selectPermission": "Selecione uma permissão",
        "server.selectWorkspace": "Selecione um espaço de trabalho",
        "server.sessionMissing": "A sessão não existe",
        "server.unknownChannel": "Canal desconhecido",
        "settings.aria": "Assistente IM",
        "settings.description": "Gerencie contas em múltiplos canais. Cada conta seleciona independentemente seu espaço de trabalho, modelo e permissões, salvos apenas localmente.",
        "settings.feedback": "Problemas",
        "settings.label": "Assistente IM",
        "settings.publicChatNotice": "Usuários não aprovados podem iniciar conversas, mas não podem aprovar chamadas de ferramentas.",
        "settings.title": "Assistente IM",
        "settings.viewProject": "GitHub",
        "sidebar.entry.desc": "Exibe o acesso ao IM na barra lateral. O acesso nas Configurações é mantido.",
        "sidebar.entry.title": "Entrada na barra lateral",
        "sidebar.entry.toggle": "Alternar entrada na barra lateral",
        "status.authenticating": "Autenticando",
        "status.connected": "Conectado",
        "status.connectingSocket": "Conectando",
        "status.connectionError": "Erro de conexão",
        "status.connectionFailed": "Falha na conexão",
        "status.disconnected": "Desconectado",
        "status.loggedIn": "Conectado",
        "status.loggedInRecovered": "Conectado (restaurado)",
        "status.loggingIn": "Entrando",
        "status.longConnection": "Conexão persistente estabelecida",
        "status.notLoggedIn": "Não conectado",
        "status.polling": "Sondando",
        "status.reconnectFailed": "Falha na reconexão",
        "status.reconnecting": "Reconectando",
        "status.saved": "Salvo",
        "status.saving": "Salvando…",
        "status.stopped": "Parado",
        "status.streamConnected": "Stream conectado",
        "status.waitHandshake": "Aguardando handshake do gateway",
        "status.waitQr": "Aguardando leitura de QR",
        "taskTreeSessions.entry.desc": "Mostra as sessões dos canais na árvore oficial de tarefas do espaço de trabalho. Se desativado, elas aparecem apenas na aba 'Canais'.",
        "taskTreeSessions.entry.title": "Mostrar sessões de IM na árvore de tarefas",
        "taskTreeSessions.entry.toggle": "Alternar sessões de IM na árvore de tarefas",
        "time.ago": "há {t}",
        "time.days": "{n} d",
        "time.hours": "{n} h",
        "time.minutes": "{n} min",
        "time.months": "{n} m",
        "time.now": "agora",
        "time.years": "{n} a",
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
.ima-section-card{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:18px 20px;background:var(--dsw-alias-bg-layer-2,#18181b);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,0.08));border-radius:12px;margin-bottom:16px}
body:not([data-ds-dark-theme]) .ima-section-card{background:var(--dsw-alias-bg-layer-2,#ffffff);border-color:var(--dsw-alias-border-l1,rgba(0,0,0,0.08))}
.ima-head{display:flex;flex-direction:column;align-items:stretch;gap:12px;margin-bottom:0}
.ima-heading h2,.ima-title{margin:0;font-size:24px;line-height:32px;font-weight:600;letter-spacing:-.4px;white-space:nowrap;text-align:left}
.ima-title-row{display:flex;align-items:center;gap:8px 12px;min-width:0;flex-wrap:wrap}
.ima-title-links{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
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
.ima-proxy-settings,.ima-mention-policy-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px;width:100%;box-sizing:border-box}
.ima-proxy-settings>.ima-picker-note,.ima-mention-policy-settings>.ima-picker-note{grid-column:1/-1}
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

      const thinkingDisplayTip = t("account.telegramThinkingDisplayNote");
      const thinkingTipAnchor = h("span", {
        className: "ima-label-tip",
        title: HostTooltip ? undefined : thinkingDisplayTip,
        "aria-label": thinkingDisplayTip,
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

      const thinkingDisplayLabel = h("span", { style: { display: "inline-flex", alignItems: "center", gap: 4 } },
        h("span", null, t("account.telegramThinkingDisplay")),
        HostTooltip
          ? h(HostTooltip, { label: thinkingDisplayTip, portal: true, side: "top" }, thinkingTipAnchor)
          : thinkingTipAnchor,
      );

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
        props.thinkingDisplaySupported && field("thinkingDisplay", thinkingDisplayLabel, h(Select, {
          className: "ima-account-picker",
          value: value.thinkingDisplay ? "collapsed" : "off",
          "aria-label": t("account.telegramThinkingDisplay"),
          options: [
            { value: "off", label: t("account.telegramThinkingDisplayOff") },
            { value: "collapsed", label: t("account.telegramThinkingDisplayCollapsed") },
          ],
          onChange: (next) => update({ thinkingDisplay: next === "collapsed" }),
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

    /**
     * 单个群号条目能否被识别。
     * 规则必须与后端 src/channels/mention-policy.ts 的 normalizeChatId 保持一致：
     * 纯数字群号（可带负号、可带 :topicId 后缀）、t.me/c 私有群链接、web.telegram.org 链接。
     */
    function isValidFreeChatGroupToken(item) {
      const cleaned = String(item).trim().replace(/[\u2212\u2013\u2014\uFF0D]/g, "-");
      if (!cleaned) return false;
      return /^-?\d{1,20}$/.test(cleaned.split(":")[0])
        || /t\.me\/c\/\d{1,18}(?:[/?#]|$)/i.test(cleaned)
        || /web\.telegram\.org\/[^#]*#(?:-\d{1,18}|c?\d{1,18})(?![0-9])/i.test(cleaned);
    }

    /** 统计群号列表里的条目总数与无法识别的条数；前端只用于提示，不改变保存内容。 */
    function freeChatGroupTokenIssues(raw) {
      const tokens = typeof raw === "string" && raw.trim() ? raw.split(/[\s,，]+/).filter(Boolean) : [];
      let invalid = 0;
      for (const token of tokens) if (!isValidFreeChatGroupToken(token)) invalid += 1;
      return { total: tokens.length, invalid };
    }

    function AccountInspector({ account, catalog, permissions, agentPresets, workspaces, createWorkspace, pickDirectory, modelT, permissionT, presetT, t, onAction, onSave, busy }) {
      const [modal, modalHolder] = Modal.useModal();
      const [draft, setDraft] = useState(account);
      const [proxyModeDraft, setProxyModeDraft] = useState(account.proxyMode || "inherit");
      const [proxyUrlDraft, setProxyUrlDraft] = useState(account.proxyUrl || "");
      const [mentionPolicyDraft, setMentionPolicyDraft] = useState(
        account.mentionPolicy === "always" ? "always" : (account.freeChatGroups ? "custom" : "addressed")
      );
      const [freeChatGroupsDraft, setFreeChatGroupsDraft] = useState(account.freeChatGroups || "");
      const accountIdRef = useRef(account.id);
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
      }, [account.id, account.cwd, account.permission, account.agentPreset, account.privateAccess, account.sendMode, account.sessionIdleMinutes, account.segmentReply, account.segmentDelayMinSecs, account.segmentDelayMaxSecs, account.proxyMode, account.proxyConfigured, JSON.stringify(account.commandPermissions), account.receiveEnabled, account.assistant && account.assistant.provider, account.assistant && account.assistant.model, account.assistant && account.assistant.reasoningEffort, account.thinkingDisplay]);
      useEffect(() => {
        if (accountIdRef.current !== account.id) {
          accountIdRef.current = account.id;
          setFreeChatGroupsDraft(account.freeChatGroups || "");
          setMentionPolicyDraft(account.mentionPolicy === "always" ? "always" : (account.freeChatGroups ? "custom" : "addressed"));
        }
      }, [account.id, account.freeChatGroups, account.mentionPolicy]);
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
        if (account.platform === "telegram") {
          const hasMentionPatch = Object.prototype.hasOwnProperty.call(patch, "mentionPolicy") || Object.prototype.hasOwnProperty.call(patch, "freeChatGroups");
          if (hasMentionPatch) {
            payload.mentionPolicy = Object.prototype.hasOwnProperty.call(patch, "mentionPolicy") ? patch.mentionPolicy : (mentionPolicyDraft === "always" ? "always" : "addressed");
            payload.freeChatGroups = Object.prototype.hasOwnProperty.call(patch, "freeChatGroups") ? patch.freeChatGroups : freeChatGroupsDraft;
          }
          if (Object.prototype.hasOwnProperty.call(patch, "thinkingDisplay")) {
            payload.thinkingDisplay = patch.thinkingDisplay;
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
            thinkingDisplaySupported: account.platform === "telegram",
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
          account.platform === "telegram" && h("div", { className: "ima-mention-policy-settings" },
            h("label", { className: mentionPolicyDraft === "custom" ? "ima-picker-field" : "ima-picker-field wide" },
              h("span", { className: "ima-picker-label" }, t("account.telegramGroupPolicy")),
              h(Select, {
                className: "ima-account-picker",
                value: mentionPolicyDraft,
                "aria-label": t("account.telegramGroupPolicy"),
                options: [
                  { value: "addressed", label: t("account.telegramGroupPolicyAddressed") },
                  { value: "custom", label: t("account.telegramGroupPolicyCustom") },
                  { value: "always", label: t("account.telegramGroupPolicyAlways") },
                ],
                onChange: (next) => {
                  setMentionPolicyDraft(next);
                  if (next === "addressed") {
                    save({ mentionPolicy: "addressed", freeChatGroups: "" });
                  } else if (next === "always") {
                    save({ mentionPolicy: "always", freeChatGroups: "" });
                  } else {
                    save({ mentionPolicy: "addressed", freeChatGroups: freeChatGroupsDraft.trim() });
                  }
                },
              }),
            ),
            mentionPolicyDraft === "custom" && h("label", { className: "ima-picker-field" },
              h("span", { className: "ima-picker-label" }, t("account.telegramFreeChatGroups")),
              h(Input, {
                type: "text",
                value: freeChatGroupsDraft,
                placeholder: "-1001234567890, -5496760438",
                "aria-label": t("account.telegramFreeChatGroups"),
                onChange: (event) => {
                  setFreeChatGroupsDraft(event.target.value);
                },
                onBlur: (event) => {
                  const value = event.target.value.trim();
                  save({ mentionPolicy: "addressed", freeChatGroups: value });
                },
              }),
            ),
            mentionPolicyDraft === "custom" && (() => {
              const issues = freeChatGroupTokenIssues(freeChatGroupsDraft);
              if (issues.invalid === 0) return null;
              const key = issues.invalid === issues.total ? "account.telegramFreeChatGroupsInvalid" : "account.telegramFreeChatGroupsPartial";
              return h("div", { className: "ima-picker-note warning" }, t(key, { count: issues.invalid }));
            })(),
            h("div", { className: "ima-picker-note" }, t("account.telegramGroupPolicyNote")),
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
        h("div", { className: "ima-section-card" },
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
                    icon: h(IconListPenOutline, { size: 14 }),
                    onClick: () => { window.open("https://github.com/MichengAI/dsh-im-connect/issues", "_blank", "noreferrer"); }
                  }, t("settings.feedback")),
                ),
              ),
              h("p", { className: "ima-sub" }, t("settings.description")),
            ),
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

    function createImSessionOpener(registry, hostOpen, getSessionById) {
      return (id) => {
        if (registry && Array.isArray(registry.sessionOpeners)
          && registry.sessionOpeners.some((item) => item && item.id === "im-connect")) {
          openRegisteredSession(id, registry, hostOpen);
          return;
        }
        const byId = typeof getSessionById === "function" ? getSessionById() : getSessionById;
        openListedSession(resolveHostSessionId(id, byId), hostOpen);
      };
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
      const hostOpen = typeof props.openSession === "function"
        ? props.openSession
        : (typeof props.open === "function" ? props.open : undefined);
      const openSession = createImSessionOpener(nativeTabs, hostOpen, sessionById);
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
        location,
        onLocationChange,
        taskTreeSessionsEnabled = false,
        onToggleTaskTreeSessions,
        taskTreeSessionsDisabled = false,
      } = props;

      const SwitchComponent = PrimitiveSwitch || Switch;
      const SegmentedControlComponent = PrimitiveSegmentedControl;
      const currentLocation = location || (enabled ? 'both' : 'settings');
      const locationOptions = [
        { label: t("entry.location.both"), value: "both" },
        { label: t("entry.location.sidebar"), value: "sidebar" },
        { label: t("entry.location.settings"), value: "settings" },
      ];

      const rows = [
        SegmentedControlComponent
          ? h("div", { key: "sidebar-entry", className: "ima-bundle-row" },
              h("div", { className: "ima-bundle-label-box" },
                h("span", { className: "ima-bundle-title" }, t("entry.location.title")),
                h("span", { className: "ima-bundle-desc" }, t("entry.location.desc"))
              ),
              h(SegmentedControlComponent, {
                id: "ima-bundle-entry-location",
                value: currentLocation,
                options: locationOptions,
                label: t("entry.location.title"),
                onChange: (val) => {
                  if (typeof onLocationChange === "function") {
                    onLocationChange(val);
                  } else if (typeof onToggle === "function") {
                    onToggle(val !== "settings");
                  }
                },
                disabled: disabled,
              })
            )
          : h("div", { key: "sidebar-entry", className: "ima-bundle-row" },
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
      const [location, setLocation] = useState(props.getLocation ? props.getLocation : () => (props.getEnabled() ? 'both' : 'settings'));
      const [enabled, setEnabled] = useState(props.getEnabled);
      const [taskTreeSessionsEnabled, setTaskTreeSessionsEnabled] = useState(props.getTaskTreeSessionsEnabled ? props.getTaskTreeSessionsEnabled : () => false);
      const [savingSidebar, setSavingSidebar] = useState(false);
      const [savingTaskTreeSessions, setSavingTaskTreeSessions] = useState(false);

      useEffect(() => {
        if (props.getLocation) setLocation(props.getLocation());
        setEnabled(props.getEnabled());
        if (props.getTaskTreeSessionsEnabled) {
          setTaskTreeSessionsEnabled(props.getTaskTreeSessionsEnabled());
        }
        return props.subscribe(() => {
          if (props.getLocation) setLocation(props.getLocation());
          setEnabled(props.getEnabled());
          if (props.getTaskTreeSessionsEnabled) {
            setTaskTreeSessionsEnabled(props.getTaskTreeSessionsEnabled());
          }
        });
      }, [props]);

      const onLocationChange = (next) => {
        setSavingSidebar(true);
        setLocation(next);
        setEnabled(next !== "settings");
        const p = props.setLocation ? props.setLocation(next) : props.setSidebar(next !== "settings");
        p.catch(() => {
          if (props.getLocation) setLocation(props.getLocation());
          setEnabled(props.getEnabled());
        }).finally(() => {
          setSavingSidebar(false);
        });
      };

      const onToggleSidebar = (next) => {
        onLocationChange(next ? "both" : "settings");
      };

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
        location,
        onLocationChange,
        enabled,
        disabled: savingSidebar,
        onToggle: onToggleSidebar,
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
          isTaskTreeSessionsEnabled: () => false,
          setTaskTreeSessions: async () => false,
          destroy: () => {},
        };
      }
      const { callApi, renderPanel, ns } = options;
      let entryLocation = "settings";
      let sidebarEntryEnabled = false;
      let sidebarSupported = false;
      let offPanel = null;
      let offRow = null;
      let epoch = 0;
      let layoutService;
      const listeners = new Set();
      const locationListeners = new Set();

      const notify = () => {
        for (const listener of listeners) {
          try { listener(); } catch {}
        }
        for (const listener of locationListeners) {
          try { listener(entryLocation); } catch {}
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

      const setLocation = async (next) => {
        if (next !== "both" && next !== "sidebar" && next !== "settings") {
          throw new Error("location must be one of 'both', 'sidebar', or 'settings'");
        }
        const prevLocation = entryLocation;
        const prevEnabled = sidebarEntryEnabled;
        const currentEpoch = ++epoch;
        entryLocation = next;
        sidebarEntryEnabled = next !== "settings";
        sync();
        notify();
        try {
          await callApi("/sidebar-entry", {
            method: "POST",
            body: JSON.stringify({ location: next }),
          });
          return next;
        } catch (err) {
          if (currentEpoch === epoch) {
            entryLocation = prevLocation;
            sidebarEntryEnabled = prevEnabled;
            sync();
            notify();
          }
          throw err;
        }
      };

      const setEnabled = async (next) => {
        return (await setLocation(next ? "both" : "settings")) !== "settings";
      };

      const loadEpoch = epoch;
      callApi("/sidebar-entry")
        .then((res) => {
          if (epoch === loadEpoch && res) {
            if (res.location === "both" || res.location === "sidebar" || res.location === "settings") {
              entryLocation = res.location;
              sidebarEntryEnabled = entryLocation !== "settings";
            } else if (typeof res.enabled === "boolean") {
              sidebarEntryEnabled = res.enabled;
              entryLocation = res.enabled ? "both" : "settings";
            }
            sync();
            notify();
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
            getLocation: () => entryLocation,
            setLocation: setLocation,
            getEnabled: () => sidebarEntryEnabled,
            setSidebar: setEnabled,
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
        getLocation: () => entryLocation,
        setLocation,
        isSettingsSectionEnabled: () => entryLocation !== "sidebar",
        onLocationChange: (fn) => {
          locationListeners.add(fn);
          return () => { locationListeners.delete(fn); };
        },
        isEnabled: () => sidebarEntryEnabled,
        isSupported: () => sidebarSupported,
        setEnabled,
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
        onTaskTreeSessionsChange: () => {
          syncActiveTaskTreeFilter();
        },
      });
      ctx.effect(() => () => sidebarController.destroy(), "im-connect: sidebar entry");
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

      const NAV_ICON_CSS = `[${NAV_ICON_MARKER}]>svg{display:none!important}[${NAV_ICON_MARKER}]::before{content:'';flex:none;width:16px;height:16px;background-color:currentColor;-webkit-mask:${QUEUE_ICON_MASK} center/contain no-repeat;mask:${QUEUE_ICON_MASK} center/contain no-repeat;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;-webkit-mask-size:16px 16px;mask-size:16px 16px}.dcu-sb-row[${NAV_ICON_MARKER}]::before{content:none!important}`;

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

      function isSidebarNavButton(button) {
        if (!button) return false;
        if (typeof button.matches === "function") {
          if (button.matches('.dcu-sb-row, [data-dcu-panel-id], button[class*="panelRow"]')) return true;
        }
        if (typeof button.closest === "function") {
          if (button.closest('.dcu-sidebar-nav-root, .dcu-sb-root, [data-dcu-managed], [data-dcu-sidebar-active], [data-slot="sidebar"], div[class*="SidebarRoot_root"]')) return true;
        }
        const cls = String(button.className || "");
        if (cls.includes("dcu-sb-row") || cls.includes("panelRow")) return true;
        if (typeof button.hasAttribute === "function" && button.hasAttribute("data-dcu-panel-id")) return true;
        return false;
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
        if (isSidebarNavButton(button)) {
          if (button.hasAttribute(NAV_ICON_MARKER)) {
            button.removeAttribute(NAV_ICON_MARKER);
            return true;
          }
          return false;
        }
        const isOwn = isOwnNavRow(getNavButtonText(button), typeof wantedLabel === "function" ? wantedLabel() : wantedLabel);
        if (isOwn) {
          const hasSlotIcon = Array.from((button && button.children) || []).some((child) => {
            if (!child || child.tagName !== "SPAN") return false;
            const cls = String(child.className || "");
            const ariaHidden = typeof child.getAttribute === "function" ? child.getAttribute("aria-hidden") : null;
            return cls.includes("navIcon") || cls.includes("glyph") || cls.includes("dcu-sb-") || ariaHidden === "true";
          }) || Boolean(button && typeof button.querySelector === "function" && button.querySelector('span[class*="navIcon"], span[class*="glyph"], [class*="dcu-sb-glyph"]'));
          if (hasSlotIcon) {
            if (button.hasAttribute(NAV_ICON_MARKER)) {
              button.removeAttribute(NAV_ICON_MARKER);
              return true;
            }
            return false;
          }
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

      /**
       * 宿主是否已声明设置图标插槽。
       * 实测宿主公开面只暴露 `spec`（`specDynamic` 仅在 SlotCore 内部使用），
       * 两个都探是为了兼容将来把宽形式提到公开面的宿主；返回值可能是 null，
       * 所以统一按 `!= null` 判定，不能写 `!== undefined`。
       */
      function hostDeclaresIconSlot(slots) {
        if (!slots) return false;
        if (typeof slots.specDynamic === "function" && slots.specDynamic("settings.section.icon") != null) return true;
        if (typeof slots.spec === "function" && slots.spec("settings.section.icon") != null) return true;
        return false;
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

      const hasIconSlot = hostDeclaresIconSlot(ctx.slots);

      if (!hasIconSlot) {
        installSettingsNavIcon(ctx, () => t("settings.label"));
      }

      function ImNavIcon({ size = 16 }) {
        return React.createElement(
          "svg",
          {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 16 16",
            width: size,
            height: size,
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 1.3,
            strokeLinecap: "round",
            strokeLinejoin: "round",
          },
          React.createElement("path", { d: "M5 6.75H11" }),
          React.createElement("path", { d: "M5 9H8" }),
          React.createElement("path", { d: "M2.37067 11.2497C1.5872 9.89252 1.32042 8.29798 1.61945 6.7597C1.91847 5.22141 2.76317 3.84293 3.99801 2.87809C5.23285 1.91325 6.7747 1.427 8.33964 1.50888C9.90458 1.59076 11.3873 2.23526 12.5147 3.32369C13.6422 4.41232 14.3384 5.8717 14.4751 7.43304C14.6118 8.99438 14.1797 10.5525 13.2585 11.8205C12.3372 13.0885 10.9889 13.9809 9.4617 14.3334C8.18666 14.6277 6.8587 14.529 5.64964 14.0601C5.17095 13.8745 4.76937 13.4929 4.26509 13.3963C3.67389 13.2832 2.95232 13.5595 2.0377 14.3334" }),
        );
      }

      /**
       * 在宿主声明了 `settings.section.icon` 后注册插件图标，并跟随入口位置启停。
       * 注册动作必须自带清理：槽位声明被撤销后宿主会重跑 inject 回调，不返回 disposer
       * 会让本地 unregIcon 变成永久非空、图标再也注册不回去。
       * 注册失败只影响图标本身（宿主回退自带字形），不得把宿主 settings 壳的注册流程带崩。
       */
      function installSettingsIconSlot(targetCtx, controller, IconComponent) {
        targetCtx.slots.inject("settings.section.icon", () => {
          let unregIcon = null;
          const syncIcon = () => {
            const shouldShow = controller && typeof controller.isSettingsSectionEnabled === "function"
              ? controller.isSettingsSectionEnabled()
              : true;
            if (shouldShow && !unregIcon) {
              try {
                const res = targetCtx.slots.register({
                  name: "settings.section.icon",
                  id: "im-assistant",
                  locale: IM_LOCALE_NS,
                }, IconComponent);
                unregIcon = typeof res === "function" ? res : () => {};
              } catch { /* 注册抛错时留空 unregIcon，等下一次位置变化重试 */ }
            } else if (!shouldShow && unregIcon) {
              try { unregIcon(); } catch {}
              unregIcon = null;
            }
          };
          syncIcon();
          const unlisten = controller && typeof controller.onLocationChange === "function"
            ? controller.onLocationChange(() => syncIcon())
            : null;
          return () => {
            if (typeof unlisten === "function") {
              try { unlisten(); } catch {}
            }
            if (unregIcon) {
              try { unregIcon(); } catch {}
              unregIcon = null;
            }
          };
        });
      }

      let unregSettings = null;
      const mountSettingsSection = () => {
        if (unregSettings) return;
        const res = (ctx.slots.register({
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
        unregSettings = typeof res === "function" ? res : () => {};
      };

      const unmountSettingsSection = () => {
        if (!unregSettings) return;
        try { unregSettings(); } catch {}
        unregSettings = null;
      };

      let settingsSlotInjected = false;
      const syncSettingsSection = () => {
        if (!settingsSlotInjected) return;
        const shouldShow = sidebarController && typeof sidebarController.isSettingsSectionEnabled === "function"
          ? sidebarController.isSettingsSectionEnabled()
          : true;
        if (shouldShow) {
          mountSettingsSection();
        } else {
          unmountSettingsSection();
        }
      };

      ctx.slots.inject("settings.section", () => {
        settingsSlotInjected = true;
        syncSettingsSection();
        return () => {
          unmountSettingsSection();
          settingsSlotInjected = false;
        };
      });

      installSettingsIconSlot(ctx, sidebarController, ImNavIcon);

      if (sidebarController && typeof sidebarController.onLocationChange === "function") {
        sidebarController.onLocationChange(() => syncSettingsSection());
      }

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
              render: (props) => {
                const hostOpen = typeof props.openSession === "function"
                  ? props.openSession
                  : (typeof props.open === "function" ? props.open : undefined);
                const openSession = createImSessionOpener(registry, hostOpen, () => {
                  try { return ctx.sessions && ctx.sessions.list && ctx.sessions.list.getSnapshot ? ctx.sessions.list.getSnapshot().byId : undefined; } catch { return undefined; }
                });
                return h(ImSidebarFallbackBoundary, {
                  officialTree: () => h(ChannelUnavailable, { t }),
                  hostProps: props,
                }, h(ChannelOfficialView, Object.assign({}, props, {
                  officialTree: registry.officialTree,
                  hostProps: props,
                  hostT: props.officialT || props.t,
                  t,
                  openSession,
                  open: openSession,
                  openChannelSettings,
                  openImSettings,
                  archiveSession: props.archiveSession || ((id, options) => archiveHostSession(ctx, id, options)),
                  unarchiveSession: props.unarchiveSession || ((id) => unarchiveHostSession(ctx, id)),
                })));
              },
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
  },
});
