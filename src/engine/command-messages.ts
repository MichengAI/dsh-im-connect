/** IM 命令文案字典。中文原文作为稳定键，插值与用户内容分开处理。 */
export const commandEnglish = {
  "请在网页 Chat 中打开这条会话，再执行 /export 导出 ZIP 日志。IM 文件回传暂未支持。":
    "Open this session in web Chat and run /export to download ZIP logs. File return is not yet supported in IM.",
  "与 Chat 一致，此操作也会尝试保存后续 Chat 新会话的默认模型选择；已有其他会话不会主动修改。":
    "As in Chat, this also attempts to save the default model selection for future Chat sessions; other existing sessions are not changed.",
  会话与工作区: "Sessions and workspaces",
  "/new — 新开会话（也可用 /clear）；旧会话保留在频道列表":
    "/new — Start a session (alias: /clear); previous sessions stay in the channel list",
  "/sessions [页码] — 列出会话；/session 序号或ID — 切换会话":
    "/sessions [page] — List sessions; /session number-or-ID — Switch session",
  "/workspaces — 列出工作区；/workspace 序号或已有路径 — 切换并新建":
    "/workspaces — List workspaces; /workspace number-or-existing-path — Start a session there",
  "/history — 最近文字记录；/rename 新名称 — 改名；/fork — 分叉":
    "/history — Recent text; /rename new-name — Rename; /fork — Fork",
  模型与推理: "Models and reasoning",
  "/model — 当前模型；/models — 可选模型":
    "/model — Current model; /models — Available models",
  "/reasoning — 当前推理等级和可选项":
    "/reasoning — Current reasoning level and available options",
  任务控制: "Task controls",
  "/status — 当前状态；/stop — 请求停止，保留队列":
    "/status — Current status; /stop — Request a stop, keeping queued messages",
  "/steer 补充要求 — 提交补充指令；/queue — 查看队列与操作方法":
    "/steer instructions — Submit additional instructions; /queue — View and manage queued messages",
  "切换模型：先发 /models，再发 /model 序号。":
    "Switch models: send /models, then /model number.",
  "命令单独发送为文字；图片说明按普通消息处理。":
    "Send commands as standalone text. Image captions are treated as ordinary messages.",
  "当前 Host 未提供 {0}，请升级 DSH。":
    "Your DSH installation does not provide {0}. Update DSH on your computer.",
  "当前 Host 不支持 {0}。": "Your DSH installation does not support {0}.",
  "无法打开会话。": "Unable to open the session.",
  "无法读取会话快照。": "Unable to read the session snapshot.",
  "无法读取工作区。": "Unable to read workspaces.",
  "序号无效或已过期，尚未切换。请发送 /{0} 获取新列表。":
    "The number is invalid or expired. Nothing was switched. Send /{0} for a fresh list.",
  "工作区：{0}": "Workspace: {0}",
  默认推理: "Default reasoning",
  "模型：{0}/{1} · {2}": "Model: {0}/{1} · {2}",
  "命令格式无效，请发送 /help。": "Invalid command format. Send /help.",
  "该控制命令不接受附件，请单独发送。":
    "This control command does not accept attachments. Send it separately.",
  "当前没有会话，请先发送消息或 /new。":
    "No current session. Send a message or /new first.",
  "/{0} 暂不支持参数。正确用法：/{1}":
    "/{0} does not accept arguments. Usage: /{1}",
  "查找当前会话：/status": "Find the current session: /status",
  "最近文字：/history": "Recent text: /history",
  "直接发送文字或 /new 创建会话": "Send text or /new to create a session",
  "\n发送消息创建会话后，可查看该会话的 Chat 命令。":
    "\nSend a message to create a session and discover its Chat commands.",
  "\n扩展命令暂时无法读取，以上内置帮助仍可使用；稍后重试 /help。":
    "\nExtension commands are temporarily unavailable. Built-in help above still applies; retry /help later.",
  机器人: "Bot",
  "\n\n扩展命令：\n": "\n\nExtension commands:\n",
  "旧会话已保留，直接发送消息即可开始。":
    "Previous sessions are preserved. Send a message to begin.",
  "查看旧会话：/sessions": "Previous sessions: /sessions",
  "查看当前配置：/status": "Current configuration: /status",
  "用法：/sessions [页码]": "Usage: /sessions [page]",
  "暂无可接续会话。": "No sessions available to resume.",
  "直接发送消息，或 /new 开始聊天": "Send a message or /new to start chatting",
  "没有第 {0} 页，共 {1} 页。": "Page {0} does not exist. There are {1} pages.",
  "返回列表：/sessions {0}": "Back to list: /sessions {0}",
  未命名会话: "Untitled session",
  "〔当前〕": " [current]",
  "切换：/session {0}": "Switch: /session {0}",
  "下一页：/sessions {0}": "Next page: /sessions {0}",
  "序号 15 分钟内有效，也可使用完整会话 ID。":
    "Numbers expire after 15 minutes. Full session IDs also work.",
  "当前没有会话。直接发送消息或 /new 开始。":
    "No current session. Send a message or /new to begin.",
  暂时无法读取: "Temporarily unavailable",
  "当前会话：{0}\n工作区：{1}\n会话 ID：{2}":
    "Current session: {0}\nWorkspace: {1}\nSession ID: {2}",
  "切换会话：/sessions": "Switch session: /sessions",
  "详细状态：/status": "Detailed status: /status",
  "会话不存在或不是可接入的普通会话。":
    "This session is unavailable. Send /sessions to choose another.",
  "请先在 Chat 恢复该归档会话。":
    "Restore this archived session in Chat first.",
  "会话工作区归属无效。": "The session has an invalid workspace association.",
  "目标会话正在运行，请在 Chat 停止后再切换。":
    "The target session is running. Stop it in Chat before switching.",
  "已切换会话：{0}\n工作区：{1}\n接下来的消息会发送到此会话。":
    "Switched to: {0}\nWorkspace: {1}\nYour next messages will go to this session.",
  "最近记录：/history": "Recent messages: /history",
  "重新开始：/new": "Start over: /new",
  "工作区列表 · 共 {0} 个\n\n": "Workspaces · {0} total\n\n",
  "也可使用已列出的绝对路径；旧会话保留，账号默认目录不变。":
    "You can also use a listed absolute path. Previous sessions and the account default directory are preserved.",
  "别名：/workspacelist；序号 15 分钟内有效。":
    "Alias: /workspacelist. Numbers expire after 15 minutes.",
  "还没有可用工作区。请先在网页添加，再发送 /workspaces。":
    "No workspaces available. Add one on the web, then send /workspaces.",
  "没有找到这个已添加的工作区，尚未切换。发送 /workspaces 查看可选项；新目录请先在网页添加。":
    "That workspace has not been added. Nothing was switched. Send /workspaces for options; add new directories on the web first.",
  "查看配置：/status": "Configuration: /status",
  "切回旧会话：/sessions": "Switch back: /sessions",
  "可用模型 · 共 {0} 个\n\n": "Available models · {0} total\n\n",
  "查看当前模型：/model；推理选项：/reasoning":
    "Current model: /model; reasoning options: /reasoning",
  "先发消息或 /new 创建会话，再切换模型。":
    "Send a message or /new to create a session before switching models.",
  "序号 15 分钟内有效。": "Numbers expire after 15 minutes.",
  "暂无可用模型。请在网页配置模型服务，再发送 /models。":
    "No models available. Configure a model provider on the web, then send /models.",
  "当前没有排队消息。": "No queued messages.",
  直接发消息继续: "Send a message to continue",
  "查看状态：/status": "View status: /status",
  "排队消息 · 共 {0} 条\n\n": "Queued messages · {0} total\n\n",
  等待执行: "Waiting to run",
  补充指令: "Additional instruction",
  排队中: "Queued",
  附件消息: "Attachment message",
  "移除：/queue remove {0}": "Remove: /queue remove {0}",
  "修改：/queue edit {0} 新内容": "Edit: /queue edit {0} new-content",
  "改为补充指令：/queue steer {0}":
    "Use as additional instruction: /queue steer {0}",
  "无法读取队列。": "Unable to read the queue.",
  "用法：/queue remove|steer|edit <消息ID> [新内容]":
    "Usage: /queue remove|steer|edit <message-ID> [new-content]",
  已移除排队消息: "Removed queued message",
  已修改排队消息: "Updated queued message",
  已将排队消息调整为补充指令:
    "Changed queued message to an additional instruction",
  "\n新内容：": "\nNew content: ",
  "查看队列：/queue": "View queue: /queue",
  "渠道：{0}（{1}）": "Channel: {0} ({1})",
  "会话：{0}": "Session: {0}",
  运行中: "Running",
  空闲: "Idle",
  "状态：{0}": "Status: {0}",
  默认: "Default",
  "模型：{0}/{1}；推理：{2}": "Model: {0}/{1}; reasoning: {2}",
  "模型：暂时无法读取": "Model: temporarily unavailable",
  "补充要求：/steer 补充内容":
    "Add instructions: /steer additional-instructions",
  "请求停止：/stop": "Request a stop: /stop",
  "模型设置：/model": "Model settings: /model",
  "如已启用目标任务，请用 /goal pause 暂停目标。":
    "If a goal is active, use /goal pause to pause it.",
  "当前目标仍处于活跃状态，请用 /goal pause 暂停目标。":
    "The current goal is still active. Use /goal pause to pause it.",
  "已请求停止当前运行；排队消息保留，可用 /queue 查看。":
    "Stop requested. Queued messages are preserved; view them with /queue.",
  "确认运行状态：/status": "Check running status: /status",
  "请填写补充要求。例如：/steer 只修改登录页面，保留现有配色\n查看状态：/status":
    "Enter additional instructions. Example: /steer Only change the login page and keep the current colors\nView status: /status",
  "补充指令已提交。\n{0}": "Additional instructions submitted.\n{0}",
  "请填写新名称，例如：/rename 九月出行计划":
    "Enter a new name. Example: /rename September travel plan",
  "当前会话已改名：{0}": "Session renamed: {0}",
  "查看会话列表：/sessions": "View sessions: /sessions",
  "当前会话工作区不可用，无法分叉。":
    "This session's workspace is unavailable. Unable to fork.",
  "当前 Host 不支持 fork。": "This Host does not support fork.",
  "已分叉并切换会话：{0}\n工作区：{1}\n新消息将继续这个分叉，原会话保留。":
    "Forked and switched to session: {0}\nWorkspace: {1}\nNew messages will continue this fork. The original session is preserved.",
  "查看继承记录：/history": "View inherited messages: /history",
  "切回原会话：/sessions": "Return to the original session: /sessions",
  "请先在网页检查并修复该分叉的工作区归属，然后":
    "Check and repair this fork's workspace association on the web first, then ",
  可稍后: "Later, ",
  "分叉已创建：{0}，但未能切换，当前绑定仍保留原会话。\n{1}发送 /session {2} 接续。":
    "Fork created: {0}, but switching failed. The original session is still selected.\n{1}send /session {2} to resume it.",
  "当前模型：{0}\n模型 ID：{1}/{2}\n推理等级：{3}":
    "Current model: {0}\nModel ID: {1}/{2}\nReasoning level: {3}",
  "选择其他模型：/models": "Choose another model: /models",
  "查看推理选项：/reasoning": "Reasoning options: /reasoning",
  "切换用法：/model {0}/{1} [推理等级ID]":
    "Switch usage: /model {0}/{1} [reasoning-level-ID]",
  "参数过多。用法：/model 序号或provider/model [推理等级ID]；可用模型：/models":
    "Too many arguments. Usage: /model number-or-provider/model [reasoning-level-ID]; available models: /models",
  "用法：/model <序号或provider/model> [推理等级]":
    "Usage: /model <number-or-provider/model> [reasoning-level]",
  "调整推理：/reasoning": "Adjust reasoning: /reasoning",
  "查看模型：/models": "View models: /models",
  "可选等级：\n": "Available levels:\n",
  "当前模型没有可选推理等级。":
    "This model has no selectable reasoning levels.",
  "模型：{0}\n当前推理：{1}\n{2}": "Model: {0}\nCurrent reasoning: {1}\n{2}",
  "切换：/reasoning {0}": "Switch: /reasoning {0}",
  "恢复默认：/reasoning --default": "Restore default: /reasoning --default",
  "当前模型：/model": "Current model: /model",
  "推理等级无效，请先 /reasoning 查看。":
    "Invalid reasoning level. Send /reasoning for options.",
  "推理等级已设为：{0}\n{1}": "Reasoning level set to: {0}\n{1}",
  "查看当前模型：/model": "View current model: /model",
  助手: "Assistant",
  用户: "User",
  "最近文字记录（不是完整历史）\n\n":
    "Recent text messages (not the complete history)\n\n",
  "最近记录中没有可展示的文字，图片或文件请在网页查看。":
    "No displayable text in recent messages. View images or files on the web.",
  "继续此会话：直接发消息": "Continue this session: send a message",
  "换一个会话：/sessions": "Choose another session: /sessions",
  "完整记录：在网页打开当前会话": "Full history: open this session on the web",
  "Chat 命令只支持文字和图片附件。":
    "Chat commands support only text and image attachments.",
  "未知命令 /{0}。发送 /help 查看当前 Chat 支持的命令。":
    "Unknown command /{0}. Send /help for available Chat commands.",
  "压缩较早上下文：/compact": "Compress earlier context: /compact",
  "管理长期目标：/goal；暂停：/goal pause；恢复：/goal resume":
    "Manage a goal: /goal; pause: /goal pause; resume: /goal resume",
  "进入计划模式：/plan；退出：/plan off":
    "Enter plan mode: /plan; exit: /plan off",
  "查看当前权限及可选项：/permission":
    "Current permissions and options: /permission",
  "记录会话反馈：/feedback 反馈内容":
    "Record session feedback: /feedback feedback-text",
  "提交代码简化审查：/simplify":
    "Submit a code simplification review: /simplify",
  "需在网页 Chat 中导出，IM 暂不回传文件":
    "Export in web Chat; IM file return is not yet supported",
  "命令已返回，但未提供结果说明。请在网页核对当前状态。":
    "The command returned without a result description. Check the current state on the web.",
  "命令执行失败，未提供具体原因。请在网页检查后重试。":
    "The command failed without details. Check on the web before retrying.",
  "查看运行状态：/status": "View running status: /status",
  "查看可选权限：/permission": "Available permissions: /permission",
  "切换方式：/permission 权限ID": "Switch usage: /permission permission-ID",
  "进入计划模式：/plan": "Enter plan mode: /plan",
  "退出计划模式：/plan off": "Exit plan mode: /plan off",
  "查看任务状态：/status": "View task status: /status",
  "补充反馈：/feedback 补充内容": "Add feedback: /feedback additional-feedback",
  "查看最近对话：/history": "Recent conversation: /history",
  "补充要求：/steer 保留现有接口":
    "Add instructions: /steer Keep existing interfaces",
  "暂停目标：/goal pause": "Pause goal: /goal pause",
  "恢复推进：/goal resume": "Resume progress: /goal resume",
  "修改目标：/goal edit 新目标": "Edit goal: /goal edit new-objective",
  "查看进度：/goal": "View progress: /goal",
  "恢复目标：/goal resume": "Resume goal: /goal resume",
  "清除目标：/goal clear": "Clear goal: /goal clear",
  "查看目标：/goal": "View goal: /goal",
  "设置目标：/goal 目标内容": "Set a goal: /goal objective",
  "Agent 预设：{0}": "Agent preset: {0}",
  "权限：{0}": "Permissions: {0}",
  活跃: "Active",
  已暂停: "Paused",
  受阻: "Needs attention",
  已完成: "Complete",
  "目标：{0}": "Goal: {0}",
  无目标: "No goal",
  "排队消息：{0} 条": "Queued messages: {0}",
  "当前聊天未开启命令权限，可以继续正常对话。":
    "Commands are disabled in this chat. You can still chat normally.",
  "命令已取消。查看当前状态：/status":
    "Command canceled. Check current status: /status",
  "命令执行失败：{0}\n\n查看用法：/help；确认当前会话：/status":
    "Command failed: {0}\n\nUsage: /help; check current session: /status",
  "请查看本机日志。": "Open DSH on your computer to check the error details.",
  "IM 助理已连接 DeepSeek Harness。直接发送文字即可开始任务。":
    "IM assistant connected to DeepSeek Harness. Send a message to start a task.",
  "请先完成当前问题或审批，再执行 /{0}。":
    "Answer the pending question or approval, then run /{0} again.",
  "当前任务正在运行，请先 /stop，等待停止后再执行 /{0}。":
    "A task is running. Send /stop, wait for it to stop, then run /{0} again.",
  "会话列表 · 第 {0}/{1} 页 · 共 {2} 个\n\n":
    "Sessions · Page {0}/{1} · {2} total\n\n",
  "〔已归档，需先在网页恢复〕": " [archived — restore on the web first]",
  "归档状态暂时无法读取，切换时会重新校验。":
    "Archive status is unavailable. It will be checked again when you switch.",
  "{0}〔{1}〕\n{2}": "{0} [{1}]\n{2}",
  "{0}：{1}{2}": "{0}: {1}{2}",
  "{0}：{1}": "{0}: {1}",
  "已切换模型：{0}/{1}；推理：{2}\n{3}":
    "Switched model to: {0}/{1}; reasoning: {2}\n{3}",
  "当前会话还没有可分叉的完整回合。请完成一轮对话后再发送 /fork；也可用 /new 开始。":
    "There is no completed turn to fork yet. Finish one exchange, then send /fork; or start fresh with /new.",
  "已请求停止。当前没有正在执行的任务；排队消息保留，可用 /queue 查看。":
    "Stop requested. No task is currently running. Queued messages are preserved; view them with /queue.",
  "会话 ID：{0}": "Session ID: {0}",
  "未授权：请管理员在设置 → IM助理 中批准你的访问。":
    "Access is pending approval. Ask the administrator to approve you in Settings → IM assistant.",
  "上一条消息正在合并，尚未执行本次命令。等待提交后再发 {0}。":
    "Your previous messages are being combined. This command has not run. Send {0} again after they are submitted.",
  "该会话已关联其他聊天，不能重复接续。请用 /sessions 选择其他会话，或 /new 新建。":
    "This session is connected to another chat and cannot be connected again. Choose another with /sessions, or start one with /new.",
  "/{0} 未能完成\n{1}": "/{0} couldn’t complete\n{1}",
  "〔已关联其他聊天〕": " [connected to another chat]",
  "〔运行中〕": " [running]",
  "例如：帮我整理今天的待办。": "Try: Help me organize today's tasks.",
  已开启新会话: "New session started",
  "新建并切换：/workspace {0}":
    "Start a session in another workspace: /workspace {0}",
  "当前只有这个工作区。直接发消息继续，或 /new 开启新会话。":
    "This is your only workspace. Send a message to continue, or /new to start fresh.",
  "已在「{0}」开启新会话。\n工作区：{1}\n旧会话已保留，可以直接发送任务。":
    "Started a new session in {0}.\nWorkspace: {1}\nPrevious sessions are preserved. Send a task to begin.",
  "切换：/model {0}": "Switch: /model {0}",
  "当前没有其他可切换模型，继续发送消息即可。":
    "No other models are available. Send a message to continue.",
  "当前名称已是：{0}": "The session is already named: {0}",
} as const;
