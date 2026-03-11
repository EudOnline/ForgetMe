# Review Workbench Phase 5 Design

Date: 2026-03-11  
Status: Validated design draft  
Project: ForgetMe

## Summary

第四阶段已经把 ForgetMe 推进到一个可运营的拐点：系统能够自动消费 `pending enrichment_jobs`，把多模态结果沉淀为 approved evidence，把高风险字段送进共享审核队列，并在确定性归属成立时投影进正式人物档案层。

但当前系统的审核体验仍然偏“功能可用”，还没有进入“运营可用”。审核员虽然能够点击 `approve / reject / undo`，但还看不到一条候选在批准前后会如何影响 evidence、formal profile 和撤销链路，也很难在一个界面里同时看清原始材料、结构化抽取结果、归属依据与正式档案变化。

因此，Phase 5 不应该优先扩更多模型能力，也不应该过早进入 persona / agent。第五阶段更适合被定义为：**审核工作台深化层**。核心目标是把现有的 `structured_field_candidate -> profile_attribute_candidate -> person_profile_attributes` 这条链路，做成一个单条可深审、动作可预览、影响可回溯的工作台。

一句话定义：**Phase 5 要做的是单条审核深度工作台，让审核员在批准前就能看见“这条候选会改变什么”，并在批准后保持整条证据链可解释、可撤销。**

## Confirmed Product Choices

本阶段已确认的关键决策如下：

- 主线：运营台强化，而不是新增采集模态或 persona 能力
- 第一主轴：审核工作台，而不是 runner 看板或规则控制台
- 第一刀：单条审核深度，而不是批量审核
- 覆盖对象：同时覆盖 `structured_field_candidate` 与 `profile_attribute_candidate`
- 设计原则：继续坚持 `evidence-first`、`local-first`、`undoable`、`auditable`
- 写入边界：仍复用 `review_queue`、`decision_journal`、`person_profile_attributes`
- 技术策略：优先新增“读服务 / 预览服务”，尽量不重写现有审核写路径
- 产品边界：本阶段仍不进入 persona / voice / conversational simulation

## Approach Options

### Option A: Profile-Only Workbench

只为 `profile_attribute_candidate` 做工作台，把正式档案层的批准/拒绝/撤销体验做深。

优点：

- 实现成本最低
- 对正式档案沉淀帮助直接
- 容易快速上线

缺点：

- 看不到上游 `structured_field_candidate`
- 审核员需要在 evidence 页面与 review 页面之间跳转
- 无法完整展示“这条证据是怎么变成 formal profile”的链路

### Option B: Dual-Layer Review Workbench（推荐）

同时覆盖 `structured_field_candidate` 与 `profile_attribute_candidate`，让工作台能展示从原始证据到正式档案影响的完整链路。

优点：

- 最符合 ForgetMe 的证据优先原则
- 能把“结构化字段批准”与“正式档案批准”放到一条因果线上
- 后续扩批量审核时可以复用同一套 impact preview 和 trace 模型

缺点：

- 读模型和 UI 聚合逻辑更复杂
- 首版需要明确区分 evidence-level 与 profile-level 的动作语义

### Option C: Unified All-Item Workbench

一次性把 merge、event cluster、structured field、profile attribute 全部拉进统一工作台。

优点：

- 长期形态更完整
- 一个入口处理所有审核对象

缺点：

- 会把第二阶段和第五阶段问题混在一起
- 大幅增加首版复杂度
- 很容易让 Phase 5 失焦

### Recommendation

推荐 **Option B**。

ForgetMe 现在最需要的不是“更多 item type”，而是让审核员真正看清两条最关键的链路：

- 原始材料如何变成 `structured_field_candidate`
- 结构化字段如何影响正式人物档案

## Product Positioning

### Recommended Route

Phase 5 应被定义为 **“审核工作台深化层”**，而不是“批量审批层”或“智能运营台”。

推荐原因：

- Phase 4 已经把自动执行、归属、正式投影的底层链路搭起来了
- 现在的最大风险不是“做不到”，而是“人看不清”
- 高敏项目优先级应始终是判断准确、边界可见，而不是先追求审批速度

### Product Principle

本阶段要坚持两个核心原则：

- **批准前先看清影响**：所有 approve / reject / undo 都应该带 impact preview
- **单条审核先做深**：先把一条候选的因果链看透，再考虑批量效率

因此，Phase 5 的关键成果不是“新按钮”，而是一个 **可解释的审核决策界面**。

## Core Problems This Phase Solves

Phase 5 聚焦解决以下问题：

### 1. 单条审核缺少因果链可视化

当前审核员能看到 queue item，但还看不到：

- 原始材料长什么样
- 模型抽取结果是什么
- 候选进入审核队列的原因是什么
- 批准后会改变哪条 formal profile attribute
- 撤销后会回滚哪些层

### 2. `structured_field_candidate` 与 `profile_attribute_candidate` 是割裂的

虽然系统底层已经支持两层候选，但 UI 和读模型上还没有把它们连成一个工作流。审核员很难理解：

- 这条结构化字段批准后是否会直接进入正式档案
- 这条正式档案候选又是由哪条 evidence 触发的

### 3. 审核动作还不够“运营化”

目前的 approve / reject / undo 偏操作原语，而不是运营动作。系统应该在点击前先回答：

- 会影响谁
- 会新增什么
- 会与谁冲突
- 会留下什么 journal 痕迹

## Information Architecture

Phase 5 推荐采用 **三栏式单条深审工作台**。

### 1. Left Rail: Queue Navigation

左栏负责让审核员在候选之间切换，先只支持基础导航：

- `structured_field_candidate`
- `profile_attribute_candidate`
- 基础筛选：人物、字段、原因码、冲突状态、风险

每条列表项应显示最小摘要：

- `item_type`
- 候选值
- 关联人物 / 待归属人物
- `reason_code`
- 置信度

### 2. Center Pane: Evidence & Candidate Detail

中栏显示单条审核对象的主要证据与上下文：

- source file
- source evidence
- 原始 OCR / image understanding 片段
- current candidate payload
- attribution basis / proposal basis
- queue item summary

### 3. Right Pane: Formal Profile Impact Preview

右栏专门显示动作影响：

- approve 之后将新增 / 维持 / 冲突哪条 formal attribute
- reject 之后会停留在哪一层
- undo 之后哪些状态会被恢复或标记 `undone`
- 相关 `decision_journal`、source candidate、source evidence 回链

## Review Action Semantics

Phase 5 不改变现有审核真相表，只把动作语义做得更可见。

### Structured Field Candidate

- `approve`：进入 approved evidence；若 attribution + projection 可确定，则在工作台里显示 formal profile 影响预览
- `reject`：阻止其进入 approved evidence / formal profile
- `undo`：撤销 approved evidence，并回滚由其触发的 profile projection / profile candidate 链路

### Profile Attribute Candidate

- `approve`：写入 `person_profile_attributes`
- `reject`：保留 evidence 层，不进入 formal profile
- `undo`：将 formal attribute 标为 `undone`，并恢复 queue/journal 的审计链

### Preview Requirement

所有动作在 Phase 5 都应由统一的 impact preview 驱动：

- `approveImpact`
- `rejectImpact`
- `undoImpact`

## Core Architecture

Phase 5 建议新增四个服务，但尽量不改现有写路径。

### 1. Review Impact Service

负责计算 approve / reject / undo 的预览结果。

建议职责：

- 识别 formal profile 的新增 / 冲突 / 无变化
- 识别 evidence 层与 profile 层的回滚范围
- 输出结构化影响对象，供 UI 直接渲染

### 2. Review Evidence Trace Service

负责把 queue item 回链到：

- source file
- source evidence
- source candidate
- source journal

### 3. Review Workbench Read Service

聚合单条工作台详情对象：

- queue item
- candidate detail
- source trace
- attribution context
- formal profile context
- impact preview

### 4. Review Navigation Service

提供列表页最小导航能力：

- 两类 item 的统一列表
- 基础筛选
- 冲突 / 非冲突视图

## Data Flow

推荐数据流如下：

`review_queue item -> workbench read service -> evidence trace + impact preview -> operator approve/reject/undo -> existing review service -> decision_journal -> refreshed workbench state`

这个数据流继续保持 ForgetMe 的边界：

- 原件层不丢
- evidence 层与 formal profile 层分离
- 审核动作始终留痕
- 所有撤销都有明确落点

## UI Structure

### 1. Review Queue Upgrade

当前 `Review Queue` 页在 Phase 5 应从“表格 + diff card”升级为：

- 左侧候选列表
- 主区单条工作台
- 右侧 impact preview 与 action bar

### 2. Review Workbench Page

推荐新增独立页面，例如：

- `ReviewWorkbenchPage`

并支持：

- 点击列表项进入详情
- deep link 到特定 `queueItemId`
- approve / reject / undo 后原位刷新

### 3. Reusable Preview Cards

建议将影响预览拆成可复用组件：

- `ReviewImpactPreviewCard`
- `ReviewEvidenceTraceCard`
- `ReviewCandidateSummaryCard`

## Error Handling

Phase 5 需要清晰处理这些错误边界：

- queue item 不存在 -> 返回明确 not found 状态，而不是渲染空白
- source evidence 缺失 -> 显示 trace 缺口，不允许 silent pass
- impact 无法计算 -> 明确标注 preview unavailable，动作按钮降级或禁用
- undo 链路不完整 -> 明确提示哪个对象缺失
- item 状态已变化 -> 工作台提示 stale state，并支持刷新

## Testing Strategy

Phase 5 测试建议分四层：

### Unit Tests

覆盖：

- impact preview 计算
- trace 聚合
- structured/profile 两类 item 的详情装配
- stale state 与缺失 trace 的错误分支

### Integration Tests

覆盖：

- approve 后 workbench state 刷新
- undo 后 evidence / profile / journal 读模型一致

### Renderer Tests

覆盖：

- 单条工作台是否显示证据、候选、impact preview、动作区
- structured 与 profile 两类候选是否都能渲染正确

### End-to-End Tests

覆盖：

- 从 queue item 打开工作台
- 看到 formal profile 影响预览
- approve / undo 后人物页变化正确

## Phase 5 Roadmap

### Milestone 5A: Single-Item Deep Review（本次主实现）

- 单条工作台
- 双层候选覆盖
- impact preview
- trace 回链
- approve / reject / undo 原位操作

### Milestone 5B: Operator Navigation & Ergonomics

- 更强筛选
- 冲突聚合
- 人物视角分组
- 快捷键与连续审核

### Milestone 5C: Safe Batch Review

- 仅在 preview 语义稳定后引入
- 先限制在低风险、无冲突候选
- 批量动作仍必须可撤销

## Deferred Work

不要把这些拉进本阶段：

- merge/event/relationship 全类型统一工作台
- 智能审批建议
- 大规模批量审批
- persona / agent / 对话模拟
- 新模态导入扩张

## Recommendation

Phase 5 的最佳起点不是“更快地点 approve”，而是先让审核员在点击前就能看清：

- 这条候选从哪里来
- 为什么在这里
- 批准会改变什么
- 撤销会恢复什么

ForgetMe 是一个高敏、重证据、重撤销的项目。第五阶段应该继续延续这条路线，而不是为了效率牺牲解释性。
## Implementation Status

截至 2026-03-11，Milestone 5A 已经完成首版实现：

- 独立 `Review Workbench` 页面已经接入应用导航
- `structured_field_candidate` 与 `profile_attribute_candidate` 已共享同一套 read model
- 工作台能显示候选摘要、evidence trace、impact preview 与原位 `approve / reject / undo` 动作
- 当选中项因审批离开 pending 集合时，界面会明确提示 stale state，而不是静默消失

## Operator Notes

当前 dogfooding 形态下，建议运营员按以下方式使用：

- 在 `Review Queue` 中快速确认有待处理候选，再进入 `Review Workbench` 深审
- 在右侧先看 `Impact Preview`，确认批准会新增、冲突还是仅保留现状
- 在执行动作后关注 stale-state 提示，因为 pending 导航列表会立刻收缩
- 如需回退，优先使用同页 `Undo`，继续沿用现有 `decision_journal` 的可审计写路径

## Scope Boundary Reminder

当前实现仍然严格限定在第五阶段边界内：

- 只覆盖 `structured_field_candidate` 与 `profile_attribute_candidate`
- 不引入 batch review、merge/event workbench、自动审批建议
- 不进入 persona、voice、simulation 或更激进的运营自动化
