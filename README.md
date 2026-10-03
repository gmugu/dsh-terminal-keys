# dsh-terminal-keys

DeepSeek Harness 客户端插件：为移动端（触屏）提供终端虚拟按键面板，补足手机上缺失的快捷键。

## 功能

- **常驻面板**（4×2）：`Esc / Tab / Ctrl / Alt` + `← ↑ ↓ →`；仅在触屏设备、右侧栏展开且终端 tab 处于前台时显示
- **Ctrl / Alt 粘滞键**（互斥）：点亮后直接组合**你自己的键盘**——裸字母变为控制码 / Meta 序列，方向键变为按词移动，Backspace 变为删词；组合一次后自动熄灭。物理键盘（keydown）与软键盘（beforeinput）双路径拦截，终端外输入不受影响
- **方向键长按连发**；Ctrl+方向 = 按词移动
- 面板标题栏可**拖动**，位置按视口比例记忆（localStorage）
- 深浅主题跟随（`--dsw-alias-*` token）；中英文案走 locale

## 实现要点

- 注册席位 `shell.overlay`（声明性），实际 UI 为 body 级浮动面板（z-index 2000）：外壳浮动层是 z-index 20，会被展开的右侧栏（z-index 40）盖住，故必须挂 body
- 写入路径：`ctx.sidebarRight.active()` → `tabDomain.occurrence().navigation` → `ctx.webTerminals.view(...)` 取官方终端同一 `TerminalView` 实例后 `write()`，不侵入官方终端 UI
- Host 侧为空壳；客户端模块见 `client.js`

## 验证

`.verify/` 内为 Playwright + 本机 Edge 的无头回归（headless12 为最新全量），需在该目录 `npm i playwright-core` 后运行；通过本机 login-gate 会话直连 127.0.0.1:3080。测试会在当前会话里开终端，跑完自动关闭标签页。
