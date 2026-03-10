# People Timeline & Relationship Graph Phase 2 Design

Date: 2026-03-10  
Status: Validated design draft  
Project: ForgetMe

## Summary

第二阶段的目标不是新增一个“炫酷图谱功能”，而是把第一阶段的可信档案底座升级成一个 **审核驱动的人物认知层**。

这意味着系统开始尝试理解“这个人是谁、和谁有关、在什么时候发生过什么”，但这种理解不能直接污染正式视图。系统只能先生成候选结论，再经过人工审核进入正式结果。正式结果必须可追溯、可撤销、可回滚。

一句话定义：**第二阶段要做的是人物为中心的双层时间线主视图，加上关系图谱侧视图，并且所有自动理解都要通过审核队列与撤销日志管理。**

## Confirmed Product Choices

本阶段已经确认的关键产品决策如下：

- 范围：人物时间线 + 关系图谱一起做
- 中心对象：人物为中心
- 人物合并：半自动合并
- 合并要求：记录所有合并，允许撤销合并
- 时间线形态：双层时间线
- 图谱关系边：证据关系边 + 人工标签
- 事件生成：自动聚类 + 人工修正
- 审核入口：审核队列先批准再生效
- 撤销要求：批准后仍然可以撤销
- 正式视图展示：默认只显示已批准结果

## Product Positioning

### Recommended Route

第二阶段应当被定义为 **“审核优先型人物认知层”**，而不是“自动推断优先型”或“可视化优先型”。

推荐原因：

- ForgetMe 面向的是高敏个人档案，误判带来的成本远大于功能炫目带来的收益
- 第一阶段已经建立了原件与证据链，第二阶段最重要的是在不破坏可信度的前提下引入“理解层”
- 时间线和图谱只有在结果经过确认后，才适合作为人物理解的正式界面

### Product Principle

本阶段的核心不是“自动理解一切”，而是：

- 系统提出候选理解
- 用户审核候选理解
- 审核通过后进入正式认知层
- 所有认知操作都可审计、可撤销、可回到证据

因此，第二阶段的真正产物不是单纯的 timeline 或 graph，而是 **一套可校正的人物认知工作流**。

## Core Data Model

第二阶段必须严格区分 **正式结果** 与 **候选结果**，不能让二者共用一套状态模糊的数据模型。

### 1. Canonical Person

正式人物代表已经确认存在的“这个人”。

建议字段：

- `id`
- `primary_display_name`
- `normalized_name`
- `alias_count`
- `first_seen_at`
- `last_seen_at`
- `evidence_count`
- `manual_labels`
- `status`
- `created_at`
- `updated_at`

### 2. Person Merge Candidate

人物候选合并代表“人物 A 和人物 B 疑似是同一人”的待审核提案。

建议字段：

- `id`
- `left_person_id`
- `right_person_id`
- `confidence`
- `matched_rules`
- `supporting_evidence_json`
- `status` (`pending`, `approved`, `rejected`, `undone`)
- `created_at`
- `reviewed_at`
- `review_note`

### 3. Event Cluster

正式事件簇是双层时间线的上层节点，用于聚合某个时段内围绕同一组人物和证据形成的事件。

建议字段：

- `id`
- `title`
- `time_start`
- `time_end`
- `summary`
- `status`
- `created_at`
- `updated_at`

并通过关联表维护：

- 事件包含哪些证据点
- 事件包含哪些人物
- 事件来自哪个候选事件簇

### 4. Relationship Edge

关系边默认是证据边，而不是社会关系推断边。

建议字段：

- `id`
- `from_person_id`
- `to_person_id`
- `evidence_strength`
- `shared_event_count`
- `shared_file_count`
- `manual_label`
- `status`
- `created_at`
- `updated_at`

其中 `manual_label` 用于人工标注：朋友、家人、同学、同事等。

### 5. Decision Journal

所有批准、拒绝、合并、拆分、重命名、撤销都必须进入不可变日志。

建议字段：

- `id`
- `decision_type`
- `target_type`
- `target_id`
- `operation_payload_json`
- `undo_payload_json`
- `actor`
- `created_at`
- `undone_at`

## Candidate Generation and Review Flow

第二阶段的所有自动理解结果都必须走统一的数据流：

`candidate generation -> review queue -> approval/rejection -> formal write -> undoable journal`

### Candidate Generation

导入完成后，后台分析器生成两类候选：

- **人物候选合并**：昵称相似、联系方式碎片相同、账号线索相同、跨批次稳定共现、聊天参与者结构高度一致
- **事件簇候选**：时间接近、共同人物重叠、同批次证据共现、关键词或来源相似

系统只产出 candidate，不直接改正式人物、正式时间线、正式图谱。

### Review Queue

所有 candidate 进入统一审核队列。

每条候选都应展示：

- 候选类型
- 置信度
- 命中规则
- 支持证据
- 批准后的影响范围
- 拒绝后的结果
- 是否支持撤销

### Approval Rule

批准后，系统才执行正式写入：

- 人物候选合并 -> 更新 canonical person 成员归属
- 事件簇候选 -> 生成正式 event cluster
- 关系边视图 -> 仅从已批准人物和已批准事件重新计算或增量刷新

### Undo Rule

批准后的操作仍然必须允许撤销。

撤销不是简单删除，而是执行一条反向操作：

- 合并撤销 -> 恢复从属人物与关联证据归属
- 事件撤销 -> 拆分 event cluster，恢复原始证据点
- 标签撤销 -> 删除或恢复人工标签

## Timeline Design

第二阶段采用 **双层时间线**。

### Upper Layer: Event Timeline

默认视图显示事件簇：

- 事件标题
- 起止时间
- 涉及人物数量
- 证据数量
- 简要摘要

这个层级的目标是让你快速看到“这个人什么时候经历了什么”。

### Lower Layer: Evidence Timeline

点击某个事件簇后，下钻展示证据点：

- 聊天文件
- 图片
- 文档
- 批次来源
- 支持该事件的关系边和人物证据

原则：**上层可读，下层可证。**

### Visibility Rule

时间线默认只显示 **已批准** 的人物、事件、关系。未批准候选不进入正式人物页。

## Graph Design

关系图谱不是独立的主导航，而应当作为 **人物详情页的侧视图**。

### Graph Center

- 中心节点是当前人物
- 一度节点是与其存在证据边的人
- 边默认展示证据强度，而不是社会关系推断

### Edge Semantics

正式图谱边来自：

- 已批准的 canonical person
- 已批准的 event cluster
- 已确认的证据关联

同时允许人工补充：

- `manual_label = friend`
- `manual_label = family`
- `manual_label = classmate`
- `manual_label = colleague`

### Display Principle

- 图谱不展示未批准候选边
- 图谱边必须能回到支持证据
- 图谱展示的是“为什么有关联”，不是“系统脑补的人际关系”

## UI Structure

### 1. People List Page

展示正式人物列表：

- 主名称
- 别名数量
- 证据数量
- 首末出现时间
- 最近活动时间
- 关系人数

### 2. Person Detail Page

人物详情页是第二阶段的核心界面。

包含：

- 正式人物基础信息
- 双层时间线
- 关系图谱标签页
- 相关证据入口
- 手工关系标签入口

### 3. Review Queue Page

统一展示待审核项：

- 人物候选合并
- 事件簇候选
- 未来可能扩展的候选关系项

操作包括：

- 批准
- 拒绝
- 查看证据
- 查看影响范围

### 4. Decision History Page

展示所有批准、拒绝、撤销记录，并允许执行撤销。

这是可信度的重要组成部分。

## Implementation Sequence

推荐按四批推进：

### Batch 1: Data Model Upgrade

- 扩展 schema，增加 canonical person / merge candidate / event cluster / decision journal
- 为现有 people / relations 增加通往正式认知层的映射路径

### Batch 2: Candidate Generators

- 实现人物候选合并生成器
- 实现事件簇候选生成器
- 先追求可解释规则，不追求复杂算法

### Batch 3: Review and Undo

- 做统一审核队列
- 做批准 / 拒绝 / 撤销动作
- 做事务化写入与回滚

### Batch 4: Timeline and Graph UI

- 做人物列表页
- 做人物详情页
- 做双层时间线
- 做关系图谱侧视图

## Failure Policy

第二阶段最大的风险不是程序报错，而是 **错误认知污染正式视图**。

因此错误处理必须遵循：

- 候选错误但未批准 -> 不污染正式结果
- 批准失败半途写入 -> 必须回滚
- 撤销失败半途写入 -> 必须回滚
- 所有正式视图只读取已批准结果

## Validation Baselines

第二阶段至少要守住以下验证底线：

- 未批准候选绝不能出现在正式人物页
- 合并批准后，时间线与图谱全部指向 canonical person
- 合并撤销后，人物归属与关系边恢复
- 事件批准后，上层时间线出现事件簇，下层证据仍完整可见
- 事件撤销后，不丢任何原始证据点
- 所有批准 / 拒绝 / 撤销动作都有 journal 记录

## Definition of Success

当以下条件成立时，第二阶段可认为进入可用状态：

- 用户可以在正式人物列表中进入某个人物详情页
- 人物详情页默认看到已批准的事件簇时间线
- 事件簇可下钻到原始证据点
- 人物图谱只显示已批准人物与证据关系边
- 系统可生成人物合并候选和事件簇候选
- 用户可在审核队列中批准、拒绝、撤销候选操作
- 所有变更均可在操作历史中追溯

## Next Step Recommendation

下一步应当基于本设计写一份详细实施计划，并将实现范围控制在：

1. canonical person 与 merge candidate 数据模型
2. event cluster 候选与正式事件模型
3. review queue 与 undo journal
4. person detail 的双层时间线
5. relationship graph 侧视图


## Implementation Notes

- 当前实现保留 phase-one 的 `people` 作为证据锚点，新增 `canonical_people` 作为正式人物层。
- 导入完成后会为新锚点创建 canonical person，并基于可解释规则生成人物合并候选。
- 审核队列目前已支持人物合并候选与事件簇候选的批准、拒绝、撤销，并写入 `decision_journal`。
- 批准人物合并时，系统会优先保留更适合作为正式展示名的一侧，而不是按 UUID 顺序保留。
- 人物页、时间线、图谱页只读取已批准状态；待审核候选不会进入正式视图。
