# Provider Boundary & Redaction Phase 6A2 Design

Date: 2026-03-12  
Status: Validated design draft  
Project: ForgetMe

## Summary

Phase 6A1 解决了“资料能不能导出并恢复”的问题，Phase 6A2 要解决的是另一类高敏风险：**远程模型外发到底发了什么、为什么能发、有没有明确边界、事后能不能回查**。

ForgetMe 当前多模态执行链已经能调 `LiteLLM`，但边界层仍然过于隐式：

- job 执行逻辑直接构造模型 messages
- 远程请求里仍混有本地绝对路径语义
- 没有持久化的 provider egress artifact / event 审计层
- 没有显式 redaction policy 命中记录

所以 6A2 的目标不是先做“完美的像素级打码”，而是先做一个 **provider boundary baseline**：

- 远程模型调用必须经过统一边界层
- 边界层必须生成可审计的 egress artifact 与 request / response / error event
- 默认去掉不该出现在外发请求里的本地绝对路径
- 每次外发都必须带上 policy key 与 redaction summary

## Route Options

### Option A: Inline Sanitization Inside `enrichmentExecutionService`

直接在 `defaultModelCaller()` 里把 `frozenPath` 去掉，顺手插几条 audit 记录。

优点：

- 改动最少
- 上手最快

缺点：

- 执行逻辑、边界策略、审计持久化混在一起
- 后续一旦扩展到不同 provider / 文件类型，很快变乱
- 不利于单独测试与演进 redaction policy

### Option B: Dedicated Provider Boundary Layer

新增一个单独的 provider boundary service，负责：

- 选择 redaction policy
- 构造 sanitized request envelope
- 持久化 egress artifact 与 event
- 记录 response / error 审计

优点：

- 与执行逻辑解耦
- 审计和策略可单测、可扩展
- 后续接入真实图像 redaction、provider-specific payload 更自然

缺点：

- schema 与 service 会增加
- 首次实现成本比 Option A 高一点

### Option C: Block Remote Providers for High-Sensitivity Inputs

对身份证、驾驶证、成绩单等全部直接禁用远程 provider，只允许本地模型。

优点：

- 风险最小

缺点：

- 与当前用户已确认的产品路线冲突
- 会让多模态增强在当前阶段失去可用性

### Recommendation

推荐 **Option B**。

ForgetMe 需要的是 **可解释、可扩展的 provider boundary**，而不是把边界逻辑散落在执行代码里。6A2 应该先把边界层本身建出来，再继续丰富真正的内容级 redaction。

## Scope of 6A2 First Slice

6A2 的第一实现切片只做 **metadata-first boundary baseline**，不假装一步到位解决所有 redaction 问题。

这一切片包含：

- `provider_egress_artifacts`
- `provider_egress_events`
- `redaction_policies`
- sanitized request envelope
- request / response / error 审计持久化
- 去除绝对路径泄露

这一切片暂不包含：

- 文档图片像素级遮罩
- OCR 文本结果里的字段级二次脱敏
- UI 级完整审计浏览器
- provider-specific multipart image upload

## Core Design Principles

### 1. No Raw Local Path Egress

远程 provider request 里不应再出现本地绝对路径，例如 `/Users/.../vault/originals/...`。边界层应把它替换为更安全的引用，例如：

- `vault://file/<fileId>`
- `sha256`
- `extension`
- `mimeType`

### 2. Audit Every Outbound Call

每一次远程模型调用都必须留下三类最小记录：

- 这次调用命中了什么 policy
- 实际发出的 sanitized request 是什么
- 返回了什么 response，或报了什么 error

### 3. Policy Before Provider

先由 redaction policy 决定“这次允许发什么、删掉什么、保留什么”，再把结果交给 provider 调用层。provider 只是执行者，不应该自己决定边界。

### 4. Preservation Over Convenience

边界层要保存的是 **外发事实**，不是为了把请求变短。审计和可回查优先于“少写几个字段”。

## Proposed Schema Additions

### `redaction_policies`

最小字段建议：

- `id`
- `policy_key`
- `enhancer_type`
- `status`
- `rules_json`
- `created_at`
- `updated_at`

### `provider_egress_artifacts`

最小字段建议：

- `id`
- `job_id`
- `file_id`
- `provider`
- `model`
- `enhancer_type`
- `policy_key`
- `request_hash`
- `redaction_summary_json`
- `created_at`

### `provider_egress_events`

最小字段建议：

- `id`
- `artifact_id`
- `event_type` (`request`, `response`, `error`)
- `payload_json`
- `created_at`

## Core Flow

`enrichment_job -> providerBoundaryService.selectPolicy -> sanitize request envelope -> persist provider_egress_artifact + request event -> call LiteLLM -> persist response/error event -> continue normalization / review flow`

## First-Slice Policy Model

第一切片先做一个非常克制的 policy 模型：

- `document_ocr.remote_baseline`
- `image_understanding.remote_baseline`
- `chat_screenshot.remote_baseline`

这些 policy 在第一切片里至少执行：

- 删除 `frozenPath`
- 保留 `fileId`、`fileName`、`sha256`、`extension`、`mimeType`
- 记录 `removedFields: ['frozenPath']`
- 记录 `requestShape: 'metadata_reference'`

## Acceptance Criteria

6A2 第一切片完成时，至少应满足：

- enrichment execution 不再把本地绝对路径发给远程 provider
- 每一次默认 provider 调用都会写入 egress artifact
- 每一次 provider 调用都会写入 request event
- 成功调用会写 response event，失败调用会写 error event
- 单元测试能证明 request envelope 已被 sanitization
- 单元测试能证明 egress audit rows 被写入数据库

## Next Step

最合适的实施起点是：

1. 先加 phase-6A2 schema
2. 再加 provider boundary service
3. 然后把 `enrichmentExecutionService` 接到边界层
