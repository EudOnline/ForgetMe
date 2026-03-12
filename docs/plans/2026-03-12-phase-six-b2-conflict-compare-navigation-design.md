# Phase 6B2 Conflict Compare + Navigation Design

## Context

当前 `Review Workbench` 已具备：

- 人物视角 inbox
- 冲突组侧栏
- 审核动作后保持 group / person 上下文的连续刷新

这意味着系统已经知道“操作者现在正在处理哪个人物、哪个字段组”。但在真实使用上仍有两个缺口：

1. 选中一个冲突组后，操作者仍需在 item 列表和 detail 面板之间来回扫视，才能看清这一组到底有哪些候选值、值之间如何分裂、当前选中的 item 在组里处于什么位置。
2. 虽然 approve / reject 后系统会保持上下文，但手动查看组内下一条 / 上一条 item 仍然要鼠标点击，缺少真正轻量的连续导航。

所以 6B2 的下一刀应该把“组内比较”和“组内导航”做成一等操作，而不是继续扩大写路径或引入批量决策。

## Recommended Slice

本次切片做两件事：

- 新增 `Conflict Compare` 面板：当选中 group 时，展示该组的字段、pending 数量、distinct values、每个值的票数，以及当前 item 在组里的位置。
- 新增 `Previous / Next` 连续导航，并支持 `j` / `k` 快捷键在当前可见 scope 内切换 item。

这里的“当前可见 scope”遵循现有 workbench 过滤链：

- 若选中 group，则 scope = group 内 items
- 否则若选中 person，则 scope = person 内 items
- 否则 scope = 全部 pending items

这种设计的好处是：

- 不新增新的后端写语义
- 不改已有 approve / reject / undo 接口
- 把 compare 和 navigation 都建立在已经存在的 `visibleItems` 上
- 为后续更强的 compare、快捷键和批量判断提供基础交互范式

## Architecture

### Compare View

`Conflict Compare` 面板优先使用当前 renderer 已有的 `visibleItems` 与 `selectedConflictGroup` 推导，不新增新的 main-process 读模型。

面板展示：

- `fieldKey`
- `pendingCount`
- `distinctValueCount`
- 每个 value 的 count
- 当前 item 的组内索引：例如 `2 / 4`
- 简短提示：是否存在明显冲突（2 个以上 distinct values）

这是一个 operator-oriented summary，而不是正式证据模型，不需要把它写回数据库。

### Navigation

新增一个轻量的连续导航条：

- `Previous`
- `Next`
- `Use J / K to move through current scope`

同时监听键盘：

- `j` 或 `ArrowDown` → 下一个 visible item
- `k` 或 `ArrowUp` → 上一个 visible item

快捷键只在以下条件触发：

- 无 `meta/ctrl/alt` 修饰键
- 当前焦点不在 input / textarea / contenteditable
- 当前 scope 至少有 2 个 item

## Scope Guardrails

本次明确不做：

- 跨 group 的快捷键跳转
- 多列证据 diff 表
- 批量批准
- decision batch journal
- 冲突值自动建议排序策略

## Testing Strategy

至少覆盖：

1. 选中 group 后显示 compare 面板与值计数
2. `Next / Previous` 按钮切换当前 item
3. `j / k` 键在当前 scope 内切换当前 item
4. 不破坏既有 approve / stale-state / undo 流
