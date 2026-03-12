# Phase 7 Dossier & Group Portrait Design

Date: 2026-03-12  
Status: Validated design draft  
Project: ForgetMe

## Summary

第七阶段的目标不是继续扩写路径，也不是开始做 persona 模拟，而是把前六阶段已经建立起来的可信证据层、审核层、时间线、关系图谱和决策回放，组织成真正“可阅读、可回溯、可继续整理”的人物档案层。

一句话定义：**Phase 7 要做的是证据驱动的人物档案与群体画像读模型，让 ForgetMe 第一次真正具备“描绘一个人 / 一群人”的稳定阅读界面。**

这个阶段的核心产物不是新的真相来源，而是：

- 基于已批准事实构建的人物档案页
- 显式展示争议与资料缺口的档案视图
- 以多人为中心的轻量群体总览页

## Confirmed Product Choices

本阶段已经确认的关键产品决策如下：

- 阶段主题：人物档案 / 群体画像层
- 中心对象：先做单人档案，再补轻量群体总览
- 事实原则：evidence-first
- 部署原则：local-first
- 操作原则：undoable / auditable
- 模拟边界：不做 persona / agent 模拟
- 文本策略：默认不依赖 LLM 写长篇人物总结
- 展示规范：必须区分 approved facts、derived summaries、open conflicts、coverage gaps

## Product Positioning

### Recommended Route

第七阶段应被定义为 **“档案阅读层”**，而不是“自动人格生成层”或“分析推理工作台”。

推荐原因很直接：

- 前六阶段已经解决“资料进来、冻结、审核、恢复、回放”的可信底座问题
- 当前最缺的不是新的写入能力，而是把现有结果组织成一个真正能阅读的人物档案
- 如果过早进入“像某人一样说话”或“自动总结一个人”，会直接冲击你已经明确拒绝的模拟边界

### Product Principle

第七阶段延续 ForgetMe 目前已经成立的四条原则：

- **local-first**：档案页与群体页只依赖本地 archive
- **evidence-first**：一切展示都能追溯到证据和审核记录
- **undoable**：档案展示不能绕过现有审核与撤销体系
- **auditable**：摘要、派生、冲突与缺口都必须显式标记

因此，第七阶段的核心不是“系统已经理解这个人”，而是：

- 系统把**已经被确认的部分**组织出来
- 系统把**尚未确认的部分**明确暴露出来
- 用户始终知道“这块内容为什么成立、为什么还不成立”

## Core Output

### 1. Person Dossier

单个人的主界面应该第一次像一份真正档案，而不是一组零散功能页的拼接。

人物档案页的目标是回答：

- 这个人目前被系统保存成什么样
- 这个人的关键经历和关系是什么
- 哪些结论已经稳定
- 哪些地方仍然冲突或缺资料

### 2. Group Portrait

群体画像本阶段只做成一个**轻量多人总览页**，不引入复杂推理引擎。

群体页的目标是回答：

- 这群人之间目前有什么已知结构
- 谁和谁联系更紧密
- 有哪些共同事件与共同证据
- 哪些关系已经确认，哪些仍然模糊

### 3. Dossier Navigation Layer

第七阶段还应把现有能力重新串起来：

- 从人物档案跳回证据页
- 从人物档案跳回 review workbench
- 从人物档案跳回 decision replay
- 从单人档案跳到群体总览

这样 ForgetMe 的阅读路径才会第一次从“系统功能导航”升级到“档案导航”。

## Person Dossier Information Architecture

建议单人档案页分成 6 个稳定区块。

### 1. Identity Card

展示当前人物最稳定、最常看的档案头部信息：

- primary display name
- aliases / manual labels
- first seen / last seen
- evidence count
- source distribution
- unresolved conflict count

这部分必须优先使用已批准结果，不展示未经审核的候选值。

### 2. Key Timeline

以时间序列方式展示关键事件、文档、聊天和图片证据，让“这个人经历了什么”可读。

这一块应主要复用前两阶段已经建立的：

- approved event clusters
- person timeline events
- approved evidence references

### 3. Relationship Context

展示当前人物和谁联系最紧密，以及这些关系为什么成立。

建议展示：

- strongest approved neighbors
- shared event count
- shared file count
- manual relationship labels
- evidence backtrace entry

### 4. Thematic Portrait

把 approved `person_profile_attributes` 做成人能读懂的主题化卡片，而不是原始表行。

建议的第一版主题分组：

- identity
- education
- work
- family
- location
- account / device
- habit / routine

### 5. Conflicts & Gaps

这是本阶段最重要的新显式区块之一，用来防止档案页“看起来很完整，实际上很多地方仍不确定”。

建议至少展示：

- 当前人物相关的 pending review items
- 当前人物相关的 conflicting field groups
- 时间线断点
- 低覆盖主题区块
- 缺失但高价值的资料类型提醒

### 6. Evidence Backtrace

档案页每一块摘要都应有回溯入口，至少能跳回：

- source file
- source evidence
- source candidate
- source journal / replay detail

原则是：**上层可读，下层可证。**

## Group Portrait Scope

本阶段的群体画像不做复杂分析台，只做轻量多人总览。

### Recommended Scope

群体页第一版建议包含：

- 群体成员列表
- 核心人物排序
- approved relationship density
- shared event clusters
- shared evidence sources
- unresolved relationship / event ambiguity count

### Explicitly Out of Scope

第七阶段明确不做这些内容：

- 多人推理结论自动生成
- 对群体给出“关系判断”式 AI 总结
- 群体行为预测
- 常驻群体 agent
- 代替某个群体或某个人说话

## Read Model Architecture

第七阶段不能把人物档案做成新的真相来源，而应当做成一层**可重建的读模型**。

### Layer 1: Approved Fact Layer

底层真实来源仍然是现有正式结果：

- `canonical_people`
- approved `person_profile_attributes`
- approved event clusters
- approved relationship labels / graph edges
- approved enriched evidence
- decision journal

这一层是“事实层”，不得被档案页面反向覆盖。

### Layer 2: Dossier Aggregate Layer

在事实层上做确定性聚合，形成人物档案读模型：

- dossier header summary
- themed profile sections
- relationship summary blocks
- timeline highlights
- conflict / gap summary

这里的目标是重组，不是重新判断。

### Layer 3: View Snapshot / Cache Layer

如有必要，可以增加缓存或快照层提升页面加载速度，但必须满足：

- 可从 approved fact layer 重建
- 不承载新的业务真相
- 不绕开审核路径

## Display Typing Rules

第七阶段必须显式区分展示类型，避免摘要伪装成事实。

建议统一至少四类：

### `approved_fact`

表示已批准、可直接采信的内容，例如：

- approved school name
- approved relationship label
- approved event title

### `derived_summary`

表示由已批准事实拼装出来的摘要，例如：

- “主要活动时间为 2019–2023”
- “教育资料主要集中在北京大学阶段”

### `open_conflict`

表示该主题下存在多个冲突值或待审项，例如：

- 同一字段仍有多个候选值
- 同一人物存在未决关系冲突

### `coverage_gap`

表示目前证据不足，不是结论，只是提示，例如：

- 工作经历资料覆盖稀薄
- 某个时间段没有足够证据

## Dossier Generation Strategy

### Default Strategy

第七阶段默认使用**模板化、可解释的组装逻辑**生成档案区块，不引入依赖 LLM 的长篇自然语言总结。

推荐原因：

- 更稳定、可控、可测试
- 更容易把每块内容回链到正式事实
- 不会在现阶段引入“文本看起来很像真的，但其实是派生推断”的风险

### Deferred Strategy

未来如果要增加自然语言档案摘要，只能作为：

- 独立派生工件
- 显式带生成时间
- 显式标注来源和生成策略
- 不覆盖 approved fact layer

## Main Flows

### 1. Person → Dossier

用户进入 `People` 后，点击某个 canonical person，即可看到完整档案页，而不是只看到一小部分 profile / timeline / graph 结果。

### 2. Dossier → Evidence

用户在档案页点击任一摘要卡片，可回到：

- 证据详情页
- 审核项
- 决策回放

### 3. Dossier → Workbench

当用户看到 conflict 或 gap 时，应能直接跳入对应的 review context 或人物 workbench 过滤视角。

### 4. Dossier → Group Portrait

当人物处于高关系密度群体中时，用户应能直接跳到该群体总览，查看“这群人当前被描绘成什么样”。

## Data Additions

第七阶段尽量避免大规模新增写模型，优先新增读模型聚合结果。

建议新增或扩展的读模型对象：

### `PersonDossier`

- `person`
- `identityCard`
- `timelineHighlights`
- `relationshipSummary`
- `thematicSections`
- `conflictSummary`
- `coverageGaps`

### `DossierSection`

- `sectionKey`
- `title`
- `displayType`
- `items`
- `evidenceRefs`
- `openIssueCount`

### `GroupPortrait`

- `groupId`
- `title`
- `memberCount`
- `memberSummaries`
- `sharedEvents`
- `relationshipDensity`
- `openIssues`

## UI Changes

建议新增或重构如下页面层次：

### People List

继续作为人物入口，但支持直接打开 dossier，而不是跳到零散二级页。

### Person Dossier Page

作为 Phase 7 的主产物。

### Group Portrait Page

作为轻量多人总览页。

### Reuse Existing Views

以下页面不消失，而应成为 dossier 的回溯目标：

- `Document Evidence`
- `Enrichment Jobs`
- `Review Workbench`
- `Review Queue`
- `Search`

## Error Handling

### Missing Section Data

若某一主题暂无 approved facts，不应展示为空白块，而应明确显示为 coverage gap。

### Stale Dossier Snapshot

若档案页使用快照缓存，在审核写入后必须能刷新或失效重建，避免展示过期摘要。

### Partial Relationship Availability

如果 timeline 已有结果但 relationship summary 尚不完整，应允许分区块降级展示，而不是整页失败。

## Testing Strategy

### Unit Tests

至少覆盖：

- dossier 聚合逻辑
- typed display labels (`approved_fact`, `derived_summary`, `open_conflict`, `coverage_gap`)
- relationship / timeline / theme section shaping
- gap detection and low-coverage threshold behavior

### Renderer Tests

至少覆盖：

- dossier header rendering
- section grouping
- conflict / gap block visibility
- evidence backtrace links
- group portrait summary rendering

### Integration / E2E Tests

至少覆盖：

- 从 `People` 进入 dossier
- 从 dossier 跳转到 evidence / review / replay
- conflict / gap 提示与人物 workbench 过滤联动
- 从单人 dossier 进入 group portrait

## Milestones

### Milestone 7A: Person Dossier Baseline

- 单人档案页
- identity card
- thematic portrait
- timeline highlights
- relationship summary
- evidence backtrace entry

### Milestone 7B: Conflicts & Coverage Gaps

- conflict block
- pending review summary
- low-coverage theme detection
- timeline / relationship gaps
- dossier → workbench shortcuts

### Milestone 7C: Group Portrait Baseline

- group portrait page
- member list
- shared events
- relationship density
- central people summary
- unresolved ambiguity summary

## Acceptance Criteria

当第七阶段完成时，至少应满足：

- 任一 canonical person 都能打开结构化人物档案页
- 档案中的内容都明确标注为 `approved_fact / derived_summary / open_conflict / coverage_gap`
- 档案页可以直接回到证据、审核、决策回放
- 用户可以看见“哪些内容还不确定、哪些资料仍然缺失”
- 用户可以从单人档案进入群体总览页
- 整个阶段仍然不引入 persona / agent 模拟

## Recommended Implementation Order

推荐实现顺序如下：

1. `7A` dossier read model baseline
2. `7A` dossier page UI
3. `7B` conflict / gap summary
4. `7B` dossier → review / replay shortcuts
5. `7C` group portrait baseline

原因很简单：

- 先让“一个人到底长什么样”成立
- 再让“哪里还不完整”变得显式
- 最后再进入“这一群人是什么结构”

## Next Step

如果按照推荐路线继续推进，下一步最合适的动作是：

- 先写 **Phase 7A 人物档案基线实施计划**
- 首个实现包聚焦 `Person Dossier read model + dossier page baseline`

这一步最贴近项目定位，也最能把 Phase 1–6 沉淀下来的能力转成真正可读的“私人档案库”体验。
