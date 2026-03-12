# Phase 6B3 Safe Batch Approval & Decision Replay Design

## Context

当前 `Review Workbench` 已具备：

- 人物视角 inbox
- 冲突组侧栏
- 组内 compare 视图
- `Previous / Next` 与 `j / k` 连续导航
- 单条 approve / reject / undo 与 stale-state 提示

这意味着操作者已经可以稳定进入“某个人、某个字段组”的审核语境。

但当一个 group 明显安全、无冲突、且需要重复点击相同批准动作时，当前系统仍然只能逐条批准。这样虽然正确，但会带来两个问题：

1. 操作者需要重复执行多个语义完全相同的批准动作。
2. 审计层面无法明确区分“连续点了多次单条批准”与“系统认可的一次正式安全批量批准”。

因此 `6B3` 的第一刀不应该做成一个泛化的批量操作中心，而应该先做一个**受限、安全、可撤销的组内批量批准**。

## Locked Scope

本次切片只做下面这条路径：

- 仅允许对**当前选中的 group**执行批量批准
- 仅允许**safe batch approval**，不做批量拒绝
- 仅允许系统满足硬门槛时显示并执行
- 批量批准后会生成一条独立的 `decision batch journal`
- 后续允许 **Undo Batch**，同时继续保留单项 undo

本次明确不做：

- 跨 group 批量批准
- 人物范围跨字段批量
- 手动勾选任意条目后混合批量
- 批量拒绝
- 独立 replay 页面
- 搜索中心式 batch management UI
- 放宽到 high-risk 或 conflict 场景

## Safe Batch Rule

后端硬门槛固定为：

- 当前 group 对应同一 `canonical person + item type + field key`
- 至少 `2` 条 `pending` item
- 当前 group `hasConflict = false`
- 组内每一条都必须属于 `profile_attribute_candidate`

这不是前端推断，而必须由后端根据当前 group 与 pending items 重新确认。

只要其中任意一条不满足：

- 前端不应显示可执行的 `Batch Approve`
- 即使前端出现旧状态，后端执行时也必须拒绝

这一刀把 `profile_attribute_candidate` 视为当前系统内可成立的“safe batch”边界。原因是现有 `structured_field_candidate` 进入 review queue 的都是 high-risk 项，因此不适合作为第一刀的安全批量对象。

## Product Behavior

### Entry Point

入口直接放在 `Review Workbench` 当前 group 语境下。

只有当：

- 已选中一个 conflict group
- 该 group 满足 safe batch rule

页面才显示 `Batch Approve` 按钮。

### Confirmation Flow

点击 `Batch Approve` 后，不直接写入，而是先进入确认态。

确认面板只强调：

- 当前人物
- 当前字段
- 将批准的 item 数量
- 这是一次 `safe batch approval`
- 系统会生成独立 batch journal
- 后续允许整批撤销

确认态目标不是增加复杂度，而是给 batch write path 一个明确边界，避免操作者误以为只是“帮我连点 N 次 approve”。

### Undo / Replay Entry

第一刀不新增独立 replay 页面。

批量历史先复用现有 decision journal / undo 入口：

- journal 中出现一条 batch 记录
- 该记录展示 `batch size / person / field / safe batch approval`
- 操作者可以从这里触发 `Undo Batch`

这样做可以把新能力限制在最小读写面，同时保持与现有撤销心智一致。

## Architecture

### Safety Boundary

第一刀的 safe batch 不对所有 review item 开放，而是只对：

- 当前选中的 `profile_attribute_candidate` group
- 无冲突
- 至少 2 条 pending

这样可以在不扩展新的 queue 风险分层模型的前提下，先交付一条真实可用、审计清晰、可整批撤销的 batch write path。

### New Write Model

建议新增最小批次建模，而不是把批量语义硬塞进单条 journal。

推荐两层结构：

1. `decision_batches`
   - `id`
   - `batch_type` (`safe_group_approve`)
   - `status` (`approved`, `undone`, `partially_undone`)
   - `canonical_person_id`
   - `canonical_person_name_snapshot`
   - `item_type`
   - `field_key`
   - `item_count`
   - `created_by`
   - `created_at`

2. `decision_batch_items`
   - `batch_id`
   - `queue_item_id`
   - `decision_journal_id`
   - `ordinal`

这能保证：

- batch 作为独立审计对象存在
- batch 与单条批准 journal 可以关联
- 后续 replay / search / partial undo 都有稳定锚点

### Batch Approve Execution

新增服务入口，例如：

- `approveSafeReviewGroup({ groupKey, actor })`

事务内执行顺序建议为：

1. 重新读取当前 group 的 pending items
2. 重新验证 safe batch rule
3. 创建 `decision_batches` 头记录
4. 逐条复用现有单项 approve 核心逻辑，写出单条 decision journal
5. 为每条写入 `decision_batch_items`
6. 返回 batch summary

关键原则：

- 不是“前端循环调用 N 次 approve”
- 而是“后端显式创建一次 batch decision，并在事务内展开到单条批准”

### Batch Undo Execution

第一刀不新增独立 `undoDecisionBatch(batchId)` API，而是继续复用现有 `undoDecision(journalId)` 入口；当 journal 的 `targetType = decision_batch` 时，在后端走批量撤销逻辑。

其核心策略不是发明一套新逆向逻辑，而是：

1. 查出 batch 下全部成员 journal
2. 对仍可撤销的单条 journal 按顺序调用现有 undo 核心逻辑
3. 对已被手动撤销的项做跳过记录
4. 将 batch 头状态更新为：
   - `undone`：全部成功撤销
   - `partially_undone`：部分已撤销或本次只撤掉部分

这样就能满足：

- 整批撤销成立
- 单项撤销继续成立
- 二者可以共存，不会互相覆盖语义

## UI Changes

### Review Workbench

新增一个轻量 `Safe Batch Approval` 卡片或动作区，仅在当前 group 安全时出现。

它至少展示：

- group 字段
- 可批量数量
- safe batch 标签
- `Batch Approve` 按钮
- 确认态按钮：`Confirm Batch Approve` / `Cancel`

### Review Queue / Undo History

沿用现有页面，不新增独立页面。

最小增强：

- decision journal 列表能识别 batch 记录
- batch 记录可展示更强摘要
- batch 记录的 undo 动作继续调用现有 `undoDecision(journalId)`

第一刀不要求完整 replay explorer，但数据层应为后续 replay/search 留出结构。

## Error Handling

### Revalidation Failure

前端显示了 `Batch Approve` 并不等于最终一定可以执行。

提交时后端必须重新验证。

若失败，应返回明确原因，例如：

- `This group is no longer safe for batch approval`
- `Conflict detected after refresh`
- `1 item is no longer pending`
- `This batch flow only supports profile attribute groups`

第一刀建议采用**整批失败**而不是半成功执行。

原因：

- 安全批量的核心是确定性
- 部分成功会显著增加 operator 心智负担
- 审计和撤销模型也会更复杂

### Undo Collision

如果某个 batch 成员已被单独 undo：

- `Undo Batch` 不应报致命错误
- 系统应跳过已撤销成员
- 并把 batch 标记为 `partially_undone` 或最终 `undone`

## Testing Strategy

### Backend Tests

至少覆盖：

- safe-batch eligibility 判定（仅 profile_attribute_candidate group 可通过）
- safe group 批量批准创建 batch + member rows
- conflict / high-risk / single-item group 被拒绝
- batch undo 调用单项 undo 核心逻辑
- 部分成员已撤销时 batch undo 仍可继续

### Renderer Tests

至少覆盖：

- 选中安全 group 时显示 `Batch Approve`
- 不安全 group 时不显示入口
- 点击后显示确认态摘要
- 确认后调用 batch API 并刷新当前上下文
- undo history 中 batch 记录可见并可触发 batch undo

### E2E Tests

至少覆盖：

1. 进入一个安全 group
2. 执行 batch approve
3. workbench 当前 group pending items 消失或刷新
4. undo history 出现 batch journal
5. 执行 undo batch
6. 对应 items 恢复为 pending

## Acceptance Criteria

本次切片完成后，应满足：

1. 只有无冲突的 `profile_attribute_candidate` safe group 才允许批量批准
2. 批量批准通过单一后端 batch write path 执行
3. 每次批量批准都有独立 batch journal 记录
4. 可以从现有 undo / journal 入口整批撤销
5. 单项 undo 与整批 undo 可以共存
6. 不破坏现有单条 approve / reject / undo / stale-state / conflict-group flow

## Recommended Next Step

完成本切片后，再继续后续 6B3 深化：

- decision replay / search 入口
- 更完整的 batch journal 明细视图
- 更强的 partial-undo 可视化
- 更严格的 operator explanations
