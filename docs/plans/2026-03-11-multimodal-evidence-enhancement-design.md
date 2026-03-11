# Multimodal Evidence Enhancement Phase 3 Design

Date: 2026-03-11  
Status: Validated design draft  
Project: ForgetMe

## Summary

第三阶段的目标不是直接让 ForgetMe 变成“更会理解人”的系统，而是先把高价值非结构化资料变成 **可追溯、可审核、可撤销的多模态增强证据层**。

这一阶段重点覆盖两类输入：

- 身份证、驾驶证、成绩单等高信息密度文档的 OCR 与字段抽取
- 聊天截图、相册图片等视觉资料的图片理解

模型接入默认允许使用远程提供方，例如 `SiliconFlow`、`OpenRouter`，并通过 `LiteLLM` 作为统一模型客户端和路由层。第三阶段不直接污染正式人物视图，而是将模型结果拆成低风险自动证据和高风险字段候选，再接入现有第二阶段的审核和撤销机制。

一句话定义：**第三阶段要做的是一个字段级风控的多模态证据增强层，为现有人物时间线、关系图谱和搜索系统持续提供更强证据。**

## Confirmed Product Choices

本阶段已经确认的关键决策如下：

- 主线：多模态证据增强
- 重点输入：身份证 / 驾驶证 / 成绩单 + 聊天截图 / 相册图片
- 模型接入：允许使用 `SiliconFlow`、`OpenRouter`
- 客户端策略：统一使用 `LiteLLM`
- 产物重心：证据增强层，而不是直接扩展认知层
- 抽取架构：类型化抽取 + 通用兜底
- 风控策略：字段级风控
- 审核规则：低风险自动入证据层，高风险结构化字段进入审核队列

## Product Positioning

### Recommended Route

第三阶段应被定义为 **“多模态证据增强层”**，而不是“自动人物画像层”或“Agent 生成层”。

推荐原因：

- 第一阶段已经解决了原件冻结、批次管理、搜索和删除审计
- 第二阶段已经建立了人物正式层、审核队列、撤销日志、时间线和图谱
- 第三阶段最有价值的事情，是让系统能够可靠地“看懂更多资料”，而不是在证据薄弱时过早放大推断层

### Product Principle

本阶段的核心不是“模型说了什么就算什么”，而是：

- 模型先产出可追溯增强结果
- 系统按字段级风险分发结果
- 低风险结果可自动进入增强证据层
- 高风险字段必须经人工审核后才进入正式可消费层
- 所有增强结论都能回到原始文件、原始模型响应和原始页块

因此，第三阶段真正的产物不是“更聪明的 Agent”，而是 **一套能把高敏资料转成可信增强证据的工作流**。

## Core Architecture

第三阶段建议拆成四层。

### 1. Dispatch Layer

导入完成后，根据文件类型和特征决定进入哪种增强器：

- `document_ocr_enhancer`
- `image_understanding_enhancer`
- `chat_screenshot_enhancer`

这一层负责：

- 任务创建
- 幂等去重
- 缓存命中
- 模型重跑
- 错误记录

### 2. Model Gateway Layer

统一通过 `LiteLLM` 发起模型调用。

这一层负责：

- 提供方路由（`SiliconFlow` / `OpenRouter`）
- 模型名和 fallback 策略
- 请求超时与重试
- 成本、耗时、错误信息记录
- 原始响应归档

### 3. Evidence Normalization Layer

模型结果落地后必须分成两类输出：

#### 通用结果

- `raw_text`
- `layout_blocks`
- `image_summary`
- `detected_entities`
- `detected_dates`
- `detected_locations`

#### 类型化结果

- `id_card_fields`
- `driver_license_fields`
- `transcript_fields`
- `chat_screenshot_fields`

### 4. Risk Routing Layer

标准化结果进入字段级风控：

- 低风险：自动进入增强证据层
- 中高风险：写入候选字段表并进入审核队列

正式人物页、时间线、图谱和搜索只消费：

- 已批准正式层
- 低风险自动增强层
- 已批准高风险字段

## Data Flow

推荐数据流如下：

`import -> dispatch -> litellm call -> raw artifact archive -> normalized evidence -> field risk classification -> auto evidence or review candidate -> approved read models refresh`

这个数据流延续了 ForgetMe 的核心原则：

- 原件不丢
- 模型输出可复查
- 字段进入正式层前有边界
- 审核和撤销保持一体化

## Core Data Model

第三阶段建议新增以下增强证据相关模型。

### 1. Enrichment Job

用于记录一次增强任务。

建议字段：

- `id`
- `file_id`
- `enhancer_type`
- `provider`
- `model`
- `status`
- `attempt_count`
- `started_at`
- `finished_at`
- `error_message`
- `usage_json`
- `created_at`

### 2. Enrichment Artifact

用于归档原始模型结果和中间产物。

建议字段：

- `id`
- `job_id`
- `artifact_type`
- `payload_json`
- `created_at`

典型内容包括：

- 原始 OCR 文本
- 原始版面块
- 图片描述
- 原始字段抽取 JSON

### 3. Enriched Evidence

用于保存低风险自动可用的增强证据。

建议字段：

- `id`
- `file_id`
- `job_id`
- `evidence_type`
- `payload_json`
- `risk_level`
- `status`
- `created_at`

### 4. Structured Field Candidate

用于保存高风险字段候选。

建议字段：

- `id`
- `file_id`
- `job_id`
- `field_type`
- `field_key`
- `field_value_json`
- `document_type`
- `confidence`
- `risk_level`
- `source_page`
- `source_span_json`
- `status` (`pending`, `approved`, `rejected`, `undone`)
- `created_at`
- `reviewed_at`
- `review_note`
- `approved_journal_id`

### 5. Enrichment Review Queue Item

建议继续复用第二阶段的 `review_queue` 与 `decision_journal`，避免并行发明第二套审批机制。

新增 item types 即可，例如：

- `structured_field_candidate`
- `document_identity_candidate`
- `document_attribute_candidate`

## Risk Policy

第三阶段采用 **字段级风控**。

### Low Risk

可自动进入增强证据层：

- 通用 OCR 文本
- 页面版面块
- 普通截图对话文本
- 场景摘要
- 非敏感实体片段

### High Risk

必须进审核队列：

- 姓名
- 证件号
- 手机号
- 住址
- 出生日期
- 学校名称
- 成绩字段
- 驾照号
- 准驾车型
- 车牌号

### Why Field-Level Review

字段级风控的好处是：

- 不会因为整份材料高敏就阻断通用文本搜索
- 高价值字段仍然可控
- 最适合 ForgetMe 的高敏资料场景

## Supported Evidence Types

### Batch 1 Targets

- 身份证
- 驾驶证
- 成绩单

### Batch 2 Targets

- 聊天截图
- 相册图片

### Deferred

- 音频转写
- 视频转写和关键帧理解
- 人脸聚类
- OCR 版面可视化修订器

## Integration with Phase 2

第三阶段不是独立系统，而是为第二阶段提供更强证据。

接入点包括：

- 搜索：增强全文、结构化字段过滤
- 人物详情：已批准身份字段、教育字段、证件字段
- 时间线：从截图和文档中提取出的时间线索
- 图谱：从已批准字段中产生更稳的人物边与属性边
- 审核队列：统一展示 phase 2 和 phase 3 候选项

## UI Structure

### 1. Enrichment Jobs View

展示每个文件的增强任务状态：

- 已排队
- 处理中
- 成功
- 失败
- 可重跑

### 2. Document Evidence View

针对文档类文件展示：

- 原图/原 PDF 页
- OCR 文本
- 版面块
- 结构化字段候选
- 已批准字段

### 3. Review Queue Extension

在现有审核队列中增加：

- 高风险字段候选
- 字段来源片段预览
- 页码与框选范围
- 批准后影响预览

### 4. Person Detail Extension

人物详情页可读取：

- 已批准身份字段
- 已批准教育字段
- 证件相关证据来源
- 图片理解产生的补充证据

## Recommended Implementation Batches

### Batch 1: Enrichment Infrastructure

- `LiteLLM` 接入
- job / artifact / evidence schema
- provider config
- retry / timeout / usage logging

### Batch 2: Document OCR MVP

- 身份证专用抽取
- 驾驶证专用抽取
- 成绩单专用抽取
- 通用 OCR fallback

### Batch 3: Screenshot and Image MVP

- 聊天截图文本与参与者片段
- 相册图片场景理解
- 日期、地点、人物线索提取

### Batch 4: Read Model Consumption

- 搜索接入增强字段
- 人物页接入已批准字段
- 时间线接入文档和截图线索
- 图谱接入已批准增强属性

## Success Criteria

第三阶段可以进入手动 dogfooding 的标准是：

- 文档类文件可以生成 OCR 和结构化字段候选
- 聊天截图和相册图片可以生成通用增强证据
- 高风险字段进入审核队列
- 低风险增强结果可自动进入证据层
- 已批准字段能在搜索和人物详情中被消费
- 所有增强任务和字段审批都可追溯
- 所有高风险字段批准都可撤销

## Deferred Work

本阶段明确不做：

- Agent persona 生成
- 云同步与协作
- 音频和视频转写
- 人脸识别与聚类
- 大规模社会关系自动推断

## Implementation Notes

- 第三阶段必须复用第二阶段的审核和撤销边界，不再另起一套审批系统。
- `LiteLLM` 只是统一网关，不应直接决定正式数据写入规则。
- 远程模型可用，但需要在 job 和 artifact 层保留提供方、模型、耗时和 usage 证据。
- 第三阶段的输出首先是“增强证据”，而不是“最终真相”。

## Implementation Checkpoint (2026-03-11)

当前代码分支已经实现并验证了以下闭环：

- phase-three schema: `enrichment_jobs` / `enrichment_artifacts` / `enriched_evidence` / `structured_field_candidates`
- provider routing through `LiteLLM` configuration surfaces
- import-time job dispatch
- typed document extraction persistence and image understanding persistence
- field-level risk classification
- shared review queue integration for `structured_field_candidate`
- approve / reject / undo support for high-risk structured fields
- approved enrichment consumption in search, person detail, and timeline evidence
- IPC exposure for enrichment jobs, document evidence, rerun, and candidate review actions
- evidence-first UI for enrichment jobs and document evidence inspection
- deterministic e2e fixture proving the review-to-profile flow for a high-risk multimodal field

### Verified Flow

当前已验证的产品链路是：

`import -> seed/dispatch -> review_queue -> approve -> approved_structured_field -> person detail/search consumption`

其中，`multimodal-review-flow.spec.ts` 已证明：

- 高风险结构化字段可以进入共享审核队列
- 审核批准后可进入 approved evidence
- 人物详情页可读取并展示批准后的字段值

### Honest Status Note

当前分支已经完成第三阶段的证据层、审批层、消费层与 UI 闭环。
不过，面向真实远程模型调用的“持续后台 job runner”仍是后续运营级补强项；本次实现已经把 gateway、dispatch、normalization、risk routing 与人工审核出口全部铺好，并通过确定性 e2e 夹具验证正式层消费路径。
