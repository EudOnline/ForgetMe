# Operational Runner & Profile Projection Phase 4 Design

Date: 2026-03-11  
Status: Proposed design draft  
Project: ForgetMe

## Summary

第三阶段已经把 ForgetMe 推进到了一个关键位置：系统能够保存原件、生成多模态增强证据、把高风险字段送入共享审核队列、并在批准后让搜索与人物页消费这些结果。

但第三阶段仍然停留在 **“架构闭环已经成立，运营闭环还没完全成立”** 的状态。

最明显的两个缺口是：

- `enrichment_jobs` 已经能被创建，但还没有一个持续运行的本地执行层稳定消费这些任务
- 已批准的增强字段目前仍然主要停留在 evidence 层，还没有沉淀成 **人物正式档案层**

因此，第四阶段不应该急着做 persona、agent 或“像某个人说话”的系统，而应该先把 ForgetMe 推进成一个 **可持续执行、可持续审核、可持续沉淀人物正式属性** 的系统。

一句话定义：**第四阶段要做的是本地多模态任务执行层 + 正式人物档案投影层，让 approved evidence 能稳定、可追溯地沉淀到正式人物视图。**

## Confirmed Product Choices

本阶段推荐确认的关键决策如下：

- 主线：运营化执行层 + 正式人物档案投影层
- 核心目标：让 pending enrichment job 真正自动执行
- 正式属性来源：只从 approved evidence / approved structured fields 投影
- 投影原则：确定性规则优先，模糊归属继续进入审核队列
- 审核复用：继续复用第二阶段 `review_queue` 与 `decision_journal`
- 正式档案形态：独立 read model，不直接把属性硬塞进 `canonical_people` 基础表
- provider 配置：第四阶段先保留 env / 本地配置方式，不急着做复杂云设置中心
- 产品边界：仍然不进入 persona / agent / 模拟对话生成

## Approach Options

### Option A: Projection-Based Operational Layer（推荐）

做一个本地 background runner，持续消费 `enrichment_jobs`。当 OCR / 视觉任务产出 approved evidence 或 approved structured fields 后，系统再通过一套可解释的 attribution + projection 规则，将这些结果沉淀到人物正式档案 read model。

优点：

- 继承 ForgetMe 现有“先证据、后正式层”的边界
- 适合高敏项目，审计与撤销路径清晰
- 有利于后续做 persona，因为正式档案层已经结构化

缺点：

- schema 与 read model 会继续变复杂
- 需要额外解决“字段归属到哪个人”的问题

### Option B: Read-Time Join Layer

不新增正式档案表，人物页在读取时直接把 approved evidence / approved structured fields 动态 join 出来。

优点：

- 实现成本低
- schema 改动少

缺点：

- 人物正式档案没有稳定形态
- 无法表达冲突、来源优先级、人工确认的属性层
- 后续要做 agent / profile 仍然得返工

### Option C: Direct Canonical Column Writes

批准字段后直接写入 `canonical_people` 新增列，比如 `birth_date`、`school_name`、`license_number`。

优点：

- 查询简单
- UI 开发方便

缺点：

- 模型强行扁平化，丢失来源和多值属性能力
- 撤销、冲突、多来源并存都会变得很难
- 不适合 ForgetMe 的高敏证据场景

### Recommendation

推荐 **Option A**。

ForgetMe 现在最需要的不是“更短的查询”，而是 **更稳的正式层形成机制**。第四阶段应继续坚持 evidence-first 的系统价值观：先让 job 真跑起来，再让 approved evidence 按规则沉淀成可回链的 formal profile。

## Product Positioning

### Recommended Route

第四阶段应被定义为 **“运营化执行与正式档案沉淀层”**，而不是“智能陪伴层”或“人格模拟层”。

推荐原因：

- 前三阶段已经把底座、审核、增强证据做出来了
- 下一步最有价值的是把系统从“能证明闭环”推进到“能长期使用”
- persona / agent 如果没有稳定的正式档案层做支撑，只会把脆弱推断放大

### Product Principle

本阶段的核心不是新增更多推断，而是完成两件事：

- 让系统自动执行已经定义好的多模态 job
- 让 approved result 形成稳定、可追溯、可撤销的人物正式属性

所以第四阶段的真正产物不是一个更“聪明”的系统，而是一个更 **可运营、可积累、可形成正式档案** 的系统。

## Core Problems This Phase Solves

第四阶段聚焦解决以下问题：

### 1. Pending Jobs 目前不会稳定自动消费

第三阶段有 dispatch、有 gateway、有 normalize service，但缺少长期运行的 worker / scheduler 层。job 创建出来以后，系统没有完整运营链路去稳定推进它们进入 `completed` / `failed`。

### 2. Approved Evidence 还没变成 Person-Level Formal Profile

目前人物页已经能展示已批准字段，但这些字段本质仍是“来自某个 file 的 evidence”。

这离“正式人物档案”还差一层：

- 字段属于哪个人
- 字段是否需要额外确认
- 字段是否与已有正式属性冲突
- 字段在人物页应该以什么组块展示

### 3. Evidence-to-Person Attribution 缺少明确规则

对于成绩单、证件照、截图等材料，系统需要回答：

- 这份 approved field 应该归到哪个 canonical person？
- 如果一个文件关联多个人怎么办？
- 如果文件没有现成人物锚点怎么办？

第四阶段必须把这个问题显式建模，而不是在 UI 层临时拼凑。

### 4. Operator Loop 还不够完整

现在有 jobs 页面和 evidence 页面，但还缺少：

- attempt 级别的失败记录
- 更清晰的 processing / failed / rerun 视角
- 正式属性形成后的回链与影响预览

## Core Architecture

第四阶段建议拆成五层。

### 1. Runner Layer

新增本地 enrichment runner，在 Electron 主进程启动后开始轮询或调度。

这一层负责：

- 抢占 pending job
- 标记 processing
- 控制并发数
- 捕获失败与重试
- 写入 attempt-level 运行记录

### 2. Execution Layer

runner 取得 job 后，按 `enhancer_type` 路由：

- `document_ocr`
- `image_understanding`
- `chat_screenshot`

调用已存在的 `LiteLLM` gateway 与 normalization service：

- `modelGatewayService`
- `documentOcrService`
- `imageUnderstandingService`

这层的目标不是发明新模型逻辑，而是把第三阶段已经建好的服务串成一个稳定执行链。

### 3. Attribution & Projection Layer

当 approved evidence 产生后，进入 profile projection 流程。

系统先执行 attribution：

- 如果文件只关联一个 active canonical person，直接归属
- 如果 approved name-like field 精确匹配唯一 canonical alias，也可直接归属
- 其他情况进入新的 profile attribute candidate 审核流

归属确定后，再决定是否投影进正式档案 read model。

### 4. Review Boundary Layer

第四阶段仍然不能打破审核边界。

因此新增的 profile-level candidate 仍然应该复用第二阶段审核系统：

- `review_queue`
- `decision_journal`

新的 item type 推荐为：

- `profile_attribute_candidate`

### 5. Read Model Layer

正式人物页不再只是展示 evidence-level approved fields，而是展示分组后的 approved profile：

- 身份
- 教育
- 驾驶与证件
- 重要地点
- 其他已确认属性

每条正式属性仍必须能回链到：

- 原始文件
- approved evidence / candidate
- 决策 journal

## Data Flow

推荐数据流如下：

`import -> pending enrichment_jobs -> runner claim -> model call -> normalize -> evidence / field candidates -> review -> approved evidence -> attribution -> profile projection or profile candidate review -> approved profile read model refresh`

这个数据流继续保持 ForgetMe 的核心约束：

- 原件层不丢
- 模型输出可回看
- evidence 层与 formal profile 层分离
- profile 层所有形成过程可追溯
- 高敏和模糊归属继续通过审核边界

## Core Data Model

### 1. Enrichment Attempt

用于记录 job 的每次真实执行尝试，而不只是 job 的聚合状态。

建议字段：

- `id`
- `job_id`
- `attempt_index`
- `provider`
- `model`
- `status` (`processing`, `completed`, `failed`, `cancelled`)
- `started_at`
- `finished_at`
- `error_kind`
- `error_message`
- `usage_json`
- `created_at`

### 2. Person Profile Attribute

用于保存已经进入正式人物档案层的属性。

建议字段：

- `id`
- `canonical_person_id`
- `attribute_group`
- `attribute_key`
- `value_json`
- `display_value`
- `source_file_id`
- `source_evidence_id`
- `source_candidate_id`
- `provenance_json`
- `confidence`
- `status` (`active`, `superseded`, `undone`)
- `approved_journal_id`
- `created_at`
- `updated_at`

### 3. Profile Attribute Candidate

用于保存尚不能自动形成正式属性、需要人工确认的人物属性提案。

建议字段：

- `id`
- `proposed_canonical_person_id`
- `source_file_id`
- `source_evidence_id`
- `attribute_group`
- `attribute_key`
- `value_json`
- `proposal_basis_json`
- `reason_code` (`ambiguous_person_match`, `sensitive_projection`, `singleton_conflict`)
- `confidence`
- `status` (`pending`, `approved`, `rejected`, `undone`)
- `created_at`
- `reviewed_at`
- `review_note`
- `approved_journal_id`

### 4. Review Queue Reuse

继续复用 `review_queue`，新增 item type：

- `profile_attribute_candidate`

### Why Not Expand `canonical_people` Directly

因为 `canonical_people` 是人物主索引，不适合承载多值属性、来源并存、冲突属性与撤销历史。

正式属性应当成为独立 read model，再由人物页聚合展示。

## Attribution Rules

第四阶段建议只引入 **可解释的确定性归属规则**，不引入黑箱归属模型。

### Rule 1: Single Canonical Person on File

如果某个 `file_id` 只关联一个 active canonical person，则 approved field 可直接归属给这个人。

### Rule 2: Unique Alias Match

如果 approved 字段中的 `full_name` / `student_name` 等值精确命中唯一 canonical alias，则可以直接归属。

### Rule 3: Otherwise Review

如果：

- 文件关联多人
- 文件没有人物锚点
- 名称命中多人
- 新值与现有 singleton 属性冲突

则不自动投影，而是生成 `profile_attribute_candidate` 进入共享审核队列。

## Projection Rules

第四阶段建议区分三类投影结果：

### 1. Auto-Projectable

在归属确定且不存在冲突时，直接形成正式 profile attribute。

适合：

- 教育字段
- 一些低争议档案字段
- 已有 approved field 的补充属性

### 2. Review-Required Projection

即使 evidence 已批准，但如果正式档案形成仍然存在风险，也应进入第二层审核。

适合：

- 身份类 singleton 属性
- 已存在不同值的高敏字段
- attribution 不唯一的字段

### 3. Evidence-Only Retention

某些字段仍然可以保持在 approved evidence 层，而暂不进入 profile 层。

这能避免过度正式化，也能减少误归属成本。

## UI Structure

### 1. Enrichment Jobs View Upgrade

当前 Jobs 页在第四阶段应补充：

- attempt 历史
- 失败原因
- retry 状态
- processing 可视化
- rerun 后最新 attempt 展示

### 2. Review Queue Extension

当前 Review Queue 应能展示：

- `profile_attribute_candidate`
- proposal basis
- attribution basis
- 批准后人物页影响预览

### 3. Person Detail Upgrade

人物详情页需要正式分区：

- Approved Profile
- Supporting Evidence
- Approved Enriched Fields
- Time / Graph / Relationships

### 4. Search / People Experience

第四阶段可以先保持搜索主逻辑不变，但为后续按正式属性搜索预留 read model 接口。

## Error Handling

第四阶段必须明确这些错误边界：

- provider 不可用 -> job failed + attempt log
- schema parse 失败 -> artifact 保留 + job failed
- attribution 不确定 -> candidate review，而不是 silent drop
- projection 冲突 -> candidate review，而不是覆盖旧值
- runner 崩溃重启 -> 依赖 job status 与 attempt state 做恢复

## Testing Strategy

第四阶段测试应分四层：

### Unit Tests

覆盖：

- runner claim / retry / failure handling
- attribution rules
- projection rule engine
- profile candidate approval / reject / undo

### Integration Tests

覆盖：

- approved structured field -> profile attribute
- ambiguous approved field -> profile candidate queue
- rerun job -> attempt history update

### Renderer Tests

覆盖：

- person detail approved profile sections
- enrichment jobs attempt / error display
- review queue profile candidate display

### End-to-End Tests

覆盖：

- import real fixture -> runner consumes job -> review -> profile appears on person page

## Success Criteria

第四阶段可以进入手动 dogfooding 的标准是：

- `enrichment_jobs` 会被本地 runner 自动执行，而不是只创建不消费
- 每次 job 执行都会有 attempt 级别记录
- approved evidence 能按确定性规则归属到人物
- 模糊或冲突属性会进入共享审核队列，而不是静默写入
- 人物详情页能显示正式 approved profile 分组
- 所有 profile-level approve / reject / undo 都有 journal 与来源回链
- unit / e2e / build 在主分支都稳定通过

## Deferred Work

本阶段明确不做：

- persona agent 生成
- 基于 profile 的对话风格模拟
- 音频 / 视频增强
- 人脸识别与聚类
- 云同步与多人协作
- 大规模自动社会关系推断

## Next Step Recommendation

如果继续实现，第四阶段应按以下顺序推进：

1. 先补 runner 与 attempt logging
2. 再补 attribution 与 profile projection read model
3. 然后复用 review queue 接入 profile candidate
4. 最后升级 person detail / jobs UI 与 e2e

在第四阶段完成之前，不建议进入 agent/persona 路线。
