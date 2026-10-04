# dsh-terminal-keys

[English](#english) | 中文

DeepSeek Harness（DSH）Web 客户端插件：为触屏设备提供终端虚拟按键面板，补足手机上缺失的快捷键。

## 功能

- **常驻面板**（4×2）：`Esc / Tab / Ctrl / Alt` + `← ↑ ↓ →`；仅在触屏设备、右侧栏展开且终端 tab 处于前台时显示
- **Ctrl / Alt 粘滞键**（互斥）：点亮后直接组合**你自己的键盘**——裸字母变为控制码 / Meta 序列，方向键变为按词移动，Backspace 变为删词；组合一次后自动熄灭。物理键盘（keydown）与软键盘（beforeinput）双路径拦截，终端外输入不受影响
- **方向键长按连发**；Ctrl+方向 = 按词移动
- 面板标题栏可**拖动**，位置按视口比例记忆（localStorage）
- 深浅主题跟随（`--dsw-alias-*` token）；中英文案走 locale

## 安装

要求：DSH `>= 0.2.0-rc.2`，Node `>= 24`。

**方式一：命令行**

```bash
dsh plugin --profile <你的profile> add https://github.com/gmugu/dsh-terminal-keys
```

**方式二：Web 界面**

打开 DSH Web 界面左侧栏的 **Plugins** 页面，在安装入口粘贴仓库地址 `https://github.com/gmugu/dsh-terminal-keys` 安装。

安装后组合包默认启用；若界面未立即出现，刷新页面或重启该 profile。

## 实现要点

- 注册席位 `shell.overlay`（声明性），实际 UI 为 body 级浮动面板（z-index 2000）：外壳浮动层是 z-index 20，会被展开的右侧栏（z-index 40）盖住，故必须挂 body
- 可见性刷新以事件为主：会话（`mounted`）、tab 成员（`openTabs`）、指针模式（`matchMedia`）、终端可写状态（`view.state`）与 tab 内终端切换（`occurrence.navigation`）均有订阅；1 秒轮询仅兜底两个官方无事件的拉取项——活动 tab 与右侧栏展开，且先做零成本门卫判断再进入正文检查
- 写入路径：`ctx.sidebarRight.active()` → `tabDomain.occurrence().navigation` → `ctx.webTerminals.view(...)` 取官方终端同一 `TerminalView` 实例后 `write()`，不侵入官方终端 UI
- Host 侧为空壳；客户端模块见 [client.js](client.js)

## 目录结构

| 文件 | 说明 |
|---|---|
| [client.js](client.js) | Client（浏览器）模块：面板 UI、按键写入、粘滞键拦截 |
| [index.js](index.js) | Host 侧空壳入口 |
| [cordis.patch.yml](cordis.patch.yml) | 组合包补丁：插入插件行 |
| [locale/en.json](locale/en.json)、[locale/zh.json](locale/zh.json) | 插件管理器展示用的标题/描述（中英） |
| [package.json](package.json) | 包清单（`dsh.bundle` / `dsh.client` 声明） |

## 开发与验证

`.verify/` 内为 Playwright + 本机 Edge 的无头回归（headless12 为最新全量，不入库），需在该目录 `npm i playwright-core` 后运行；通过本机 login-gate 会话直连 `127.0.0.1:3080`。测试会在当前会话里开终端，跑完自动关闭标签页。

## 许可证

[MIT](LICENSE)

---

## English

A DeepSeek Harness (DSH) Web client plugin that adds a touch terminal key panel — `Esc / Tab / Ctrl / Alt` plus arrow keys — for phones and other touch devices.

- Fixed 4×2 panel shown only on touch devices while the right sidebar hosts a foreground terminal tab
- Sticky, mutually exclusive `Ctrl` / `Alt`: tap to arm, then compose with your own (physical or soft) keyboard; auto-releases after one combo. Intercepts both `keydown` and `beforeinput`; input outside the terminal is untouched
- Arrow keys auto-repeat on hold; Ctrl+arrows move by word
- Draggable panel header; position remembered per viewport ratio (localStorage)
- Follows light/dark themes via `--dsw-alias-*` tokens; UI copy localized (zh/en)

### Install

Requires DSH `>= 0.2.0-rc.2` and Node `>= 24`.

```bash
dsh plugin --profile <profile> add https://github.com/gmugu/dsh-terminal-keys
```

Or paste the repository URL into the install box of the **Plugins** page in the DSH Web UI.

License: [MIT](LICENSE)
