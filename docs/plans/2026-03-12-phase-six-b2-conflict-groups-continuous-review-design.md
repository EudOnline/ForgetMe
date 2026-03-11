# Phase 6B2 Conflict Groups + Continuous Review Design

## Context

Phase 6B1 已经把 `Review Workbench` 从“按 queue item 刷列表”提升到了“先按人物进入”的工作方式。操作者现在可以先选中一个人物，再只查看这个人物的 pending items。

但 6B1 仍然缺少两个明显的效率能力：

- 同一人物下、同一字段的多条候选仍然混在 item 列表里，不能一眼看出“这是同一个问题的一组证据”
- 当操作者在一个人物 / 字段语境里批准或拒绝一条 item 后，系统虽然会刷新，但没有把“继续处理同一组问题”作为一等体验来表达

6B2 的第一刀不应该直接跳到快捷键或批量批准，而应该先让 workbench 显式理解“冲突组”。只要系统知道“这一组 item 属于同一人物、同一字段、同一候选类型”，后续的连续审核和批量安全判断才有稳定的基础。

## Recommended Slice

本次切片选择：**在现有 `Review Workbench` 中新增 `Conflict Groups` 侧栏，并让审核动作自动保持当前 group 上下文。**

这意味着：

- 读模型新增冲突组摘要，而不是新增写路径
- 组的定义先收敛为：`canonicalPersonId + itemType + fieldKey`
- 每个组展示 pending 数量、候选值集合、是否存在组内冲突
- 选择一个组后，item 列表只保留该组项目
- 批准 / 拒绝后自动跳到该组下一条 pending item；若组为空则回落到该人物下剩余 items

这条路线的好处是：

- 它直接承接 6B1 的人物上下文，不另起新页面
- 它把“连续审核”做成已有刷新逻辑的自然延伸，而不是重新发明动作流
- 它仍然不碰 6B3 的批量批准 / decision batch write path

## Architecture

### Read Model

新增 `listReviewConflictGroups()`，建立在 pending `ReviewWorkbenchListItem` 之上。每个 group 输出：

- `groupKey`
- `canonicalPersonId`
- `canonicalPersonName`
- `itemType`
- `fieldKey`
- `pendingCount`
- `distinctValues`
- `hasConflict`
- `nextQueueItemId`
- `latestPendingCreatedAt`

组内冲突的判定采用保守规则：

- 任一 item 的 `hasConflict === true`，视为冲突组
- 或者组内 `distinctValues.length > 1`，也视为冲突组

这样就能覆盖“formal value 冲突”和“pending 候选之间彼此冲突”两类场景。

### UI Integration

`ReviewWorkbenchPage` 将在 `People Inbox` 与 `Workbench Items` 之间增加一个 `Conflict Groups` 侧栏。

行为规则：

- 当选中人物时，只显示该人物的 groups
- 当未选中 group 时，显示该人物全部 items
- 当选中 group 时，只显示该 group 的 items
- 审核动作完成后，优先保留当前 group；若 group 已空，则保留当前人物；若人物也空，则回落到全局 pending

这本质上就是 6B2 的最小“continuous review”实现：系统持续留在操作者当前处理语境里。

## Scope Guardrails

本次明确不做：

- 键盘快捷键
- “同人物继续 / 同字段继续 / 同冲突组继续”三种模式切换 UI
- 批量批准
- decision batch journal
- conflict group 内的多列 diff 对比表

这些属于后续更深的 6B2 / 6B3，而不是本次基线。

## Testing Strategy

本次至少补三层验证：

1. `reviewWorkbenchReadService`：验证 group 聚合、组内冲突判定、next item 选择
2. `ReviewWorkbenchPage`：验证 group 侧栏渲染、点击 group 后 item 过滤、动作后 group 上下文保持
3. 回归验证：已有 workbench action / stale-state 流不被破坏

如果这刀稳定，下一步就能在同一个架构上继续加：

- 组内显式“继续下一条”提示
- 快捷键
- 更细的 conflict evidence compare
