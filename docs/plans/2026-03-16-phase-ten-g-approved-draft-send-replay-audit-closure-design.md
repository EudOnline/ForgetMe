# Phase 10G Approved Draft Send Replay & Audit Closure Design

`Phase 10G` 的目标不是继续扩展 approved draft 的外发能力，也不是马上做 destination registry、publish link 或统一 boundary center，而是把 `10F` 已经跑通的 **approved draft remote send** 补成真正可回放、可搜索、可复盘的审计闭环。

在 `Phase 10F` 完成之后，系统已经能做到：

- `approved` persona draft review 可以 remote send
- send payload 直接来自 `10E` approved handoff artifact
- request / response / error 会写入专用 provider-boundary audit tables
- `Memory Workspace` 的 `Approved Draft Handoff` 面板能看到最新 send 状态

但当前仍然留着一段明显空白：

- successful send 还不会写入 `decision_journal`
- `Search` 里还搜不到 approved draft send 的高层历史
- `Review Queue` / `Undo History` 的 replay detail 还看不到 send 这类高层决策摘要
- `Memory Workspace` 面板虽然能显示 send 状态，但还缺少一个明确的紧凑 audit detail 视图

`Phase 10G` 要解决的，就是这段“send 已经发生了，但还没有真正进入全局 replay / audit 读模型”的空白。

## 为什么 10G 不应该直接做 destination registry 或 publish

如果在 `10F` 之后立刻跳去 destination registry、多 provider presets、publish / share link，系统会继续扩展“能发到哪里”，却仍然没有彻底补完“已经发过的东西以后怎么找、怎么回看、怎么复盘”。

这会带来几个问题：

- outbound surface 继续增大，但审计入口仍然分散
- 用户会更难在全局历史里找到某次 approved draft send
- `10F` 的 provider-boundary tables 仍然只是一层局部事实，不是产品级 replay 入口
- 后续一旦继续扩 send 能力，审计债只会越来越大

所以 `10G` 最自然的下一步不是“再开新出口”，而是“把 `10F` 已经产生的 send 事实，接进 replay-first / audit-first 的产品读层”。

## 当前缺口

`10F` 故意把成功 send 留在两层之间：

- 详细审计事实在 `persona_draft_provider_egress_artifacts / events`
- `Memory Workspace` 页面能临时读到这些事实

但它还没有进入全局决策历史：

- `journalService` 不知道 approved draft send 的 decision type
- `searchDecisionJournal(...)` 不会返回 send 相关 replay summary
- `ReviewQueuePage` 的 replay detail 也拿不到这类事件的高层描述

这意味着：

- 我们知道某次 send 的 request / response / error 存在
- 但还缺一层“高层可搜索、可回放、可在全局历史里定位”的审计摘要

## 方案比较

### 方案 A：只给 `10F` 成功 send 增加 `decision_journal` entry

优点：

- 范围最小
- `Search` 和 `Undo History` 立刻就能找到高层 send 记录
- 与 `10E export` 的 journal 语义一致

缺点：

- 仍然缺少一个更清晰的 send audit detail 视图
- 只能看到“发生过 send”，看不到和 boundary events 的清晰连接

结论：**可行，但不够完整。**

### 方案 B：成功 send 写入 `decision_journal`，同时在现有 handoff 面板增加紧凑 audit detail 视图

优点：

- 全局历史里能搜到 send
- 当前 `Memory Workspace` turn 上能直接看最新 send 的 request / response / error 摘要
- 不需要新页面，也不需要做统一 boundary dashboard
- 保持 `10F` 的 provider-boundary tables 仍然是详细事实源

缺点：

- 需要补一小段 renderer detail UI
- 要约定 journal payload 和 boundary artifact 的 linkage 字段

结论：**推荐。**

### 方案 C：直接做统一 boundary audit center，把 enrichment 和 persona send 一起纳入

优点：

- 长期上限最高
- 最终可能形成统一 outbound audit workbench

缺点：

- 会立刻碰到 enrichment schema 与 persona send schema 的统一问题
- 范围明显大于 `10G`
- 与当前“补闭环”的目标不匹配

结论：**现在不推荐。**

## 推荐方向

`Phase 10G` 推荐采用：

## **Approved Draft Send Replay & Audit Closure**

第一刀只做：

- successful approved draft send 追加高层 `decision_journal` entry
- `Search` 与 `Review Queue` 能看到 approved draft send 的 replay summary
- `Approved Draft Handoff` 面板增加一个紧凑的 latest send audit detail
- replay / 已保存 session 的 approved turn 对 send history 保持只读可见

第一刀不做：

- destination registry
- provider/model picker
- publish / share link
- send retry queue
- 统一 boundary dashboard
- failed send 也写进 `decision_journal`

## Journal 语义

`10G` 推荐只在 **successful send** 时写入一条高层 journal entry。

推荐 decision type：

- `send_approved_persona_draft_to_provider`

推荐 target：

- `targetType = 'persona_draft_review'`
- `targetId = draftReviewId`

推荐 operation payload 至少包含：

- `draftReviewId`
- `sourceTurnId`
- `providerSendArtifactId`
- `provider`
- `model`
- `policyKey`
- `requestHash`
- `handoffKind = 'provider_boundary_send'`
- `sentAt`

这里最重要的原则是：

- 详细 request / response / error 仍然留在 provider-boundary tables
- journal 只负责高层可搜索、可回放的 send 摘要
- journal payload 必须稳定指向 boundary artifact

## 为什么失败 send 先不进 journal

`10F` 的 provider send 失败已经会留下：

- artifact row
- request event
- error event

这对详细审计已经足够。

而 `decision_journal` 在当前产品里更像“高层已发生决策 / 行为”的历史轨迹。第一刀如果把 failed send 也混进去，会让：

- decision label 语义变复杂
- `Undo History` 里出现更多噪声
- 搜索结果里 success / failure 混在一起

所以 `10G` baseline 推荐：

- success 进 journal
- failure 继续只保留在 boundary audit tables
- 如果后续真的需要“全局失败事件搜索”，再单独开一刀更稳

## Replay 与 Search 行为

`10G` 的目标不是发明一个新的 replay 页面，而是把 send 正式接入现有高层读侧：

- `Search`
  - 搜索 `Alice Chen` / provider / policy key / model 时，能命中 approved draft send 的 replay summary
- `Review Queue / Undo History`
  - replay detail 里能看到这次 send 的高层 payload
- `Memory Workspace`
  - 已保存 session / replayed approved turn 中，仍能显示 send history 与 latest audit detail

这里最重要的是“从全局历史能重新找到那次 send”，而不只是“在原页面上偶然还能看见”。

## Handoff 面板里的紧凑 Audit Detail

`10G` 不需要上来就做完整 event browser。

推荐在现有 `Provider Boundary Send` 子区块里增加一个很窄的 detail baseline：

- `Latest send audit`
- request / response / error 的事件类型列表
- 每个事件的时间
- 可折叠查看 JSON payload

这样可以保持：

- 不离开当前 approved draft context
- 详细事实仍然来自 provider-boundary events
- UI 只做紧凑 inspector，不扩成新页面

## Acceptance

`Phase 10G` 收口时应满足：

- successful approved draft send 会写入 `decision_journal`
- journal label / target label / replay summary 对 send 语义可读
- `Search` 能命中 approved draft send 的决策历史
- `Review Queue` replay detail 能展示 send journal payload
- `Approved Draft Handoff` 面板能显示紧凑 latest send audit detail
- 已保存 session / replayed approved turn 中 send 历史保持只读可见
- failed send 仍然保留在 provider-boundary audit tables，不回归

## 明确不做

`Phase 10G` 不包括：

- destination registry
- provider preset management
- publish / share links
- failed send journaling
- unified outbound audit center
- retry queue / background send orchestration
- provider response 自动回写成新的 approved truth

## 推荐结论

`Phase 10G` 推荐正式命名为：

## **Approved Draft Send Replay & Audit Closure**

推荐立即实施的第一刀：

## **Successful-send journal integration plus compact audit detail**

这样我们可以把 `10F` 的 remote send 从“局部可见的 boundary fact”推进到“全局可搜索、可回放、可在当前 turn 内直接查看 detail 的产品级审计闭环”，同时继续守住：

- review-first
- approved-only
- detailed facts in boundary tables
- high-level replay facts in decision history
