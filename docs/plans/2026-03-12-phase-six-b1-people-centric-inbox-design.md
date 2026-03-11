# Phase 6B1 People-Centric Inbox Design

## Context

ForgetMe 已经具备了单条 `review_queue` workbench：操作者可以查看单条高风险候选、看到证据链、批准 / 拒绝 / 撤销，并且所有写路径仍然保持 `evidence-first`、`local-first`、`undoable`、`auditable`。

但当前入口仍然是“按 queue item 刷列表”。这在数量较少时可用，在资料量增大后会变成高摩擦工作流：操作者必须在不同人物、不同字段、不同来源之间频繁切换，系统也无法明显表达“这个人目前还有多少未决事项、是否有冲突、是否适合继续处理”。

Phase 6B1 的目标不是引入批量决策或复杂冲突聚合，而是先把审核入口从“单条 item 导向”升级成“人物导向”。这应该是一次纯 read-model + operator UI 增强：不修改现有批准 / 拒绝 / 撤销写路径，不新增自动审批，不改变既有 journal 语义。

## Recommended Slice

本次切片选择最小可交付版本：在现有 `Review Workbench` 上增加一个 `People Inbox` 侧栏，并为它提供专门的读模型。

第一刀只做四件事：

- 将 pending workbench item 按 `canonicalPersonId` 聚合成人物摘要
- 展示每个人的 pending 数量、字段集合、冲突计数、是否存在连续处理序列
- 点击人物后，右侧 item 列表只保留该人物相关项
- 当从 queue item 直接打开 workbench 时，自动落在对应人物上下文里

这条路线比“新增完整页面”更合适，因为它复用已有 workbench 信息密度和写路径，也比“直接做冲突组 / 批量批准”更稳，符合 6B1 作为 6B 基线的定位。

## Architecture

### Read Model

新增 `listReviewInboxPeople()` 读模型，建立在 `listReviewWorkbenchItems({ status: 'pending' })` 之上。每个分组输出：

- `canonicalPersonId`
- `canonicalPersonName`
- `pendingCount`
- `conflictCount`
- `fieldKeys`
- `itemTypes`
- `nextQueueItemId`
- `latestPendingCreatedAt`
- `hasContinuousSequence`

其中：

- `conflictCount` 表示该人物当前 pending 项中 `hasConflict === true` 的数量
- `hasContinuousSequence` 只表达“是否还有 2 条及以上待处理项”，不代表 6B2 的自动跳转模式已经完成
- 没有 canonical person 的项会被聚合进 `Unassigned person` 桶，但本次实现不引入额外写路径去分配人物

### UI Integration

`ReviewWorkbenchPage` 将增加一个 `People Inbox` 面板。页面会同时加载：

- 人物 inbox summaries
- pending workbench items
- 当前选中 queue item 的 detail

选择人物后，不重新定义新的 detail 协议，而是只改变“哪些 items 显示在 sidebar 里”，以及“默认聚焦哪个 queue item”。如果当前选中的 item 不在所选人物下，就自动回落到该人物的首条 pending item。

### Scope Guardrails

本次明确不做：

- 冲突组视图
- 快捷键连续审核模式
- 批量批准
- decision batch journal
- 人物页反查 journal

这些属于 6B2 / 6B3，而不是 6B1。

## Error Handling

- 若 inbox 为空，显示 `No people with pending review items.`
- 若选中人物后该人物 item 已被处理完，自动回落到全局首条 pending item 或空态
- 保留现有 stale-state 提示，不移除已有 undo 语义

## Testing Strategy

本次至少补三层验证：

1. `reviewWorkbenchReadService` 单测：验证人物聚合、字段去重、冲突计数、连续处理标记
2. `ReviewWorkbenchPage` 渲染测试：验证人物 inbox 展示、点击人物后 sidebar 过滤、生效的 detail 选择
3. `build` + 相关单测回归，确保不破坏已有 phase five workbench 行为

如果这刀稳定，再进入 6B1 的下一小步：把 `Review Queue` 的按钮文案与入口语义更新为更明确的人物导向入口，或者继续推进 6B2 的连续审核流。
