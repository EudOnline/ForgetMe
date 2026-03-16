# Phase 10F Approved Draft Provider-Boundary Send Design

`Phase 10F` 的目标不是把 ForgetMe 从 `10E` 直接推进成开放式 persona mode，也不是一下子抽象出覆盖所有外发场景的通用 outbound framework，而是给**已经通过人审、已经具备 handoff artifact 形态的 approved persona draft** 增加第一条远程 provider send 通路。

在 `Phase 10E` 完成之后，系统已经能做到：

- `approved` draft 可以导出为本地 JSON artifact
- 导出 payload 已经具备稳定的 artifact 结构
- handoff 历史能在 `Memory Workspace` 与 replay 中看到
- approved draft 仍然被限制在 review-first、非开放 persona mode 的边界内

但当前仍然缺少下一段闭环：

- 没有正式的 remote provider send 动作
- 远程 send 还没有 request / response / error 级别的审计链
- approved draft artifact 还不能进入 provider-boundary audit model
- UI 里还看不到“这份 approved draft 被远程发过什么、结果如何”

`Phase 10F` 要解决的，就是这段“已经 approved，也已经可以本地 handoff，但还不能经过 provider boundary 正式远程发送”的空白。

## 为什么 10F 不应该直接做开放 persona mode

如果在 `10E` 之后直接开放普通 persona ask mode 或长期 persona conversation，系统会再次把“经过审阅的内部交付 artifact”误推成“可以自由对外代表本人发言的能力”。

这会带来几个问题：

- approved draft 的含义会从“审阅通过的单次 artifact”滑向“持续 persona 权限”
- provider send 边界会和 ongoing chat surface 混在一起
- request / response / error 的审计对象会从“单次 send”变成“整段会话”
- 当前 review-first 架构会被新的对话入口稀释

所以 `10F` 最自然的下一步不是“放开 persona”，而是“让 approved draft 第一次拥有 remote provider send，但仍保持一刀一审、一发一记账”。

## 当前 schema mismatch

现有 provider-boundary 审计模型是围绕 enrichment 链路建的：

- `provider_egress_artifacts.job_id` 是必填
- `provider_egress_artifacts.file_id` 是必填
- `enhancer_type` 的语义是 enrichment task
- `Enrichment Jobs` 页面和读取层默认按 `jobId` 聚合

而 approved persona draft send 并不天然隶属于 enrichment job：

- 它的真相源头是 `persona_draft_reviews`
- 它的内容载体是 `ApprovedPersonaDraftHandoffArtifact`
- 它不要求绑定某一个 `vault_file`
- 它也不应该伪装成 `document_ocr` 或 `image_understanding`

这意味着 `10F` 不能草率把 approved draft send 硬塞进现有 `provider_egress_artifacts` 表，否则就会让 enrichment 语义和 persona send 语义互相污染。

## 方案比较

### 方案 A：直接把现有 `provider_egress_artifacts` 泛化成全局 outbound 表

优点：

- 长期看最统一
- 所有 provider egress 最后都能进一套表
- 未来做统一 boundary dashboard 更顺手

缺点：

- 需要重做现有 schema，把 `job_id` / `file_id` 从必填改成可空或拆成 polymorphic target
- 需要同步改 `Enrichment Jobs` 读取层与现有边界 UI
- 风险远超 `10F` 这刀的目标

结论：**现在不推荐。**

### 方案 B：新增 approved-draft 专用 provider-boundary audit 表，但复用现有 boundary 原则

优点：

- 不破坏 enrichment 已上线的边界审计链
- 能继续复用 `redaction_policies`、policy key、request / response / error event 结构
- 可以明确把 approved draft send 约束成一条很窄的、review-first 的 remote send slice

缺点：

- 短期内会有两组 boundary artifact 表
- 未来如果更多 outbound domain 出现，还需要再决定是否统一

结论：**推荐。**

### 方案 C：只写 `decision_journal`，不建 provider-boundary send 表

优点：

- 改动最小
- 很快就能留下“谁点击了 send”的高层记录

缺点：

- 没有 request / response / error 级别事件
- 无法复用 provider-boundary 的审计原则
- 对“到底发了什么、返回了什么”仍然不够可回查

结论：**不适合作为 10F baseline。**

## 推荐方向

`Phase 10F` 推荐采用：

## **Approved Draft Provider-Boundary Send**

第一刀只做：

- 只有 `approved` persona draft review 才能 remote send
- send payload 直接复用 `10E` 的 approved handoff artifact 作为 source artifact
- send 通过 `memory_dialogue` 默认 provider route 执行
- request / response / error 都写入一条窄的 approved-draft boundary audit 链
- `Memory Workspace` 与 replay 可以看到 send 历史与最近结果

第一刀不做：

- 普通开放式 persona conversation
- 多 provider destination 管理
- 发布链接 / 分享链接
- 重试队列 / 后台任务编排
- 把所有 outbound domain 先抽象成统一大框架

## 核心对象模型

`10F` 的关键不是再创造一个新的“approved draft 真相”，而是明确区分三层对象：

- `Persona Draft Review`
  - 记录审阅状态与 approved text
- `Approved Draft Handoff Artifact`
  - 记录这份 approved review 的稳定 handoff payload
- `Approved Draft Provider Send Artifact`
  - 记录某次 remote provider send 的 request / response / error 审计事实

这里最重要的原则是：

- approved draft review 继续是真相源
- `10E` artifact 继续是外发内容源
- `10F` send artifact 只是 remote egress 审计记录，不反向改写 approved draft

## Boundary Payload 设计

`10F` 不应该重新拼一份“看起来像 approved draft 的 payload”；它应该直接把 `10E` 已经稳定的 artifact 当作 source payload。

推荐 outbound request envelope：

- `requestShape = 'approved_persona_draft_handoff_artifact'`
- `policyKey = 'persona_draft.remote_send_approved'`
- `handoffArtifact`
  - 即 `buildApprovedPersonaDraftHandoffArtifact(...)` 返回的 artifact

也就是说，请求体是一个 boundary wrapper：

- 外层表达“这是一条 remote send”
- 内层保留原始 approved draft handoff artifact

这样可以保证：

- send 复用 `10E` 的 artifact 契约
- 不需要再发明第二份 outbound truth source
- 本地 export 与 remote send 共享同一份 approved content baseline

## Policy 与 Route 语义

`10F` 推荐继续复用现有 `redaction_policies` 表，但新增一条窄 policy：

- `policyKey = 'persona_draft.remote_send_approved'`
- `enhancer_type = 'persona_draft_send'`

第一刀的 redaction summary 可以非常克制：

- `requestShape = 'approved_persona_draft_handoff_artifact'`
- `sourceArtifact = 'approved_persona_draft_handoff'`
- `removedFields = []`

这里的重点不是做复杂打码，而是明确：

- send 只允许来自 approved artifact
- send 通过 boundary wrapper 发出
- send 事后能追溯 policy key、request hash、response/error

provider route 推荐直接复用：

- `resolveModelRoute({ taskType: 'memory_dialogue' })`

这样第一刀不引入新的 destination 管理 UI，也不需要专门配置 persona send provider。

## Persistence 设计

`10F` 推荐**不改动**现有 `provider_egress_artifacts` / `provider_egress_events`，而是新增一组 parallel tables：

### `persona_draft_provider_egress_artifacts`

最小字段建议：

- `id`
- `draft_review_id`
- `source_turn_id`
- `provider`
- `model`
- `policy_key`
- `request_hash`
- `redaction_summary_json`
- `created_at`

### `persona_draft_provider_egress_events`

最小字段建议：

- `id`
- `artifact_id`
- `event_type` (`request`, `response`, `error`)
- `payload_json`
- `created_at`

这样可以保持：

- enrichment boundary 审计继续按 job/file 读取
- approved draft send 审计继续按 `draftReviewId` 读取
- 两边共用相同的 boundary event 语义，但不共享错误的外键假设

`10F` baseline 先不额外把 request / response / error 生命周期重复写进 `decision_journal`。对于这一刀来说，provider-boundary tables 本身就是更合适的审计真相层；如果后续需要把 send 决策纳入全局 decision history，再补一条高层 journal 事件更稳。

## Send Flow

推荐最小 send 流程如下：

1. 用户在 `Memory Workspace` 中将 draft 审阅到 `approved`
2. 用户点击 `Send approved draft`
3. 主进程服务调用 `buildApprovedPersonaDraftHandoffArtifact(db, { draftReviewId })`
4. service 构造 boundary request envelope
5. service 写入 `persona_draft_provider_egress_artifacts`
6. service 先写一条 `request` event
7. service 用 `memory_dialogue` route 发起远程 provider 调用
8. 成功则写 `response` event；失败则写 `error` event
9. renderer 刷新 send history，显示最新状态

关键规则：

- 非 `approved` review 不能 send
- send 不依赖用户先执行本地 export
- send 失败时必须保留 request + error 审计事实
- send 不会把 provider response 写回 approved draft 本身

## UI 设计

`10F` 继续留在现有 `Approved Draft Handoff` 区块里，不开新页面。

推荐在现有 export controls 下方增加一个窄的 `Provider Boundary Send` 子区块，内容只需要包括：

- 当前 route 摘要
  - provider
  - model
- `Send approved draft`
- 最近一次 send 的状态
  - `request recorded`
  - `response recorded`
  - 或 `error recorded`
- 最近一次 send 的 provider / model / policy key / 时间

如果已经有 send history：

- 默认显示最新一条
- 可以附带一个简短历史列表
- replay / 已保存 session 中保持只读

第一刀不需要做完整 boundary event 浏览器；只要 `Memory Workspace` 能看见“这份 approved draft 已经发过什么、最近结果如何”即可。

## Provider Response 处理

`10F` 的重点是 provider-boundary send 本身，不是立刻发明新的 downstream workflow。

所以第一刀建议：

- 远程调用使用固定、deterministic 的 wrapper prompt
- 原始 response payload 直接作为 boundary event 持久化
- renderer 只展示高层状态与少量摘要
- 不解析成新的 review artifact
- 不自动进入下一轮 persona conversation

这样可以把范围稳稳限制在：

- approved draft 能发出去
- 发了什么可追溯
- 对方回了什么可追溯

而不是把 `10F` 变成“approved draft 发送后自动继续跑一套新工作流”。

## Acceptance

`Phase 10F` 收口时应满足：

- 只有 `approved` review 可以 `Send approved draft`
- send payload 直接来源于 approved handoff artifact
- remote send 会留下 request / response / error 审计记录
- send 历史可以按 `draftReviewId` 读取
- `Memory Workspace` 可以看到 send 状态与最新结果
- replay / 已保存 session 中 send 历史保持只读可见
- enrichment 现有 provider-boundary schema / 页面 / 读取行为不回归

## 明确不做

`Phase 10F` 不包括：

- 统一改造所有 existing provider egress schema
- 开放 persona mode 或长期 persona chat
- send 后自动 publish / share
- destination registry
- background retry runner
- 把 provider response 自动当成新的 approved truth

## 推荐结论

`Phase 10F` 推荐正式命名为：

## **Approved Draft Provider-Boundary Send**

推荐立即实施的第一刀：

## **Approved-only remote send with dedicated boundary audit tables**

这条路线能把 `10E` 的 approved handoff artifact 推进到第一条真正的 remote egress 通路，同时继续守住：

- review-first
- approved-only
- request / response / error 可审计
- 不把系统误推成开放 persona mode
