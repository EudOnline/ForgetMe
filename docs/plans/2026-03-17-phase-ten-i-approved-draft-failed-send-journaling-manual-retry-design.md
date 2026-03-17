# Phase 10I Approved Draft Failed Send Journaling & Manual Retry Design

`Phase 10I` 的目标不是把 ForgetMe 从 `10H` 直接推进成 background retry system，也不是马上做 publish/share link 或自定义 destination 管理，而是把 **approved draft provider send** 补成“失败也可见、失败后可恢复、恢复过程仍然可审计”的下一段闭环。

在 `Phase 10H` 完成之后，系统已经能做到：

- `approved` persona draft review 可以 remote send
- operator 可以在 send 前显式选择 built-in destination
- successful send 会把 `destinationId` / `destinationLabel` 写进 provider-boundary artifact 与 `decision_journal`
- `Search` / `Review Queue` / replay 可以重新找到 successful send
- `Approved Draft Handoff` 面板能显示 latest send audit detail，并记住上次使用的 destination

但当前还留着一个新的明显空白：

- failed send 虽然会留下 `request` / `error` boundary events，但还没有进入全局高层历史
- operator 只能看到“这次失败了”，却不能一键按同一 destination 重新发送
- send history 里还没有“这是 initial send 还是 retry”这一层稳定语义
- retry relation 还没有明确的 audit linkage，后续复盘时很难回答“这次成功是不是在补之前那次失败”

`Phase 10I` 要解决的，就是这段“已经能发，也能看成功，但失败还没有产品级恢复闭环”的空白。

## 为什么 10I 不应该直接做 background retry queue

从 `10H` 往后看，retry 确实已经变得自然，因为 destination identity 终于稳定了。但如果这一刀直接跳到后台重试队列，系统会立刻引入一整层新的执行复杂度：

- app 生命周期与后台任务调度
- retry backoff / stop policy
- 多次失败后的状态汇总
- 幂等性与重复发送解释
- 自动重试和人工重试之间的优先级

而当前系统里最缺的其实不是“自动重发”，而是“失败先成为可见、可解释、可由 operator 明确触发恢复的产品对象”。

所以 `10I` 最自然的下一步不是“把 retry 自动化”，而是“先把失败 send 正式接进 journal / replay / 手动恢复这条窄闭环”。

## 为什么 10I 也不应该先做 publish/share 或 custom destinations

`10H` 已经明确把 destination identity 稳定下来，但 outbound slice 仍然还缺“失败恢复”。

如果现在先做 publish/share 或 custom destination CRUD：

- outbound surface 会继续变大
- 失败 send 仍然没有统一可见的高层历史
- 用户可以管理更多目标，却还不能稳定处理失败后的补发
- 后续 publish/share history 会同时背上“目标 identity”与“失败恢复”两笔债

所以 `10I` 更适合继续沿着同一条 approved-draft outbound 主线，把 recovery 补齐，再考虑 outward surface 的扩张。

## 当前承接点

仓库里已经有几块对 `10I` 很有帮助的现成语义：

- `persona_draft_provider_egress_artifacts / events`
  - 已经能记录 request / response / error
- `10G`
  - 已经把 successful send 接进 `decision_journal`、Search、Review replay
- `10H`
  - 已经把 destination identity 稳定成 `destinationId` / `destinationLabel`
  - renderer 已经有 destination selector 与 last-used preset

这意味着 `10I` 最稳妥的做法不是重新发明 send history，而是：

- 在现有 approved-draft egress artifacts 上补出 attempt metadata
- 让 failed send 也进入高层 journal 读侧
- 加一个很窄的 manual retry action
- 让 retry 明确继承失败 artifact 的 destination identity

## 方案比较

### 方案 A：只给 failed send 增加 journal entry，不做 retry

优点：

- 范围最小
- `Search` / replay 立刻能找到 failed send
- 失败不再只是局部 boundary 事实

缺点：

- operator 仍然要手动重新选 destination，再次点击普通 send
- 无法区分“新的 send”与“对失败 send 的恢复动作”
- recovery 语义还是不稳定

结论：**可行，但不够完整。**

### 方案 B：failed send journaling + manual retry with explicit linkage

优点：

- 失败变成第一类高层历史
- retry 是一条明确、可搜索、可回放、可审计的恢复动作
- 不需要后台队列，也不需要新页面
- 继续保持 review-first、operator-driven 的安全边界

缺点：

- 需要决定 retry 是重放旧 request，还是重建当前 approved handoff
- 需要给 artifact 增加 attempt metadata 与 retry linkage

结论：**推荐。**

### 方案 C：直接做后台 retry queue

优点：

- 长期运营能力更强
- 对频繁 transient failure 更方便

缺点：

- 明显超出当前 outbound slice 的复杂度
- 会把调度、状态机、幂等等问题提前拉进来
- 没有先把“手动恢复”跑顺，就很容易把失败处理做成黑盒

结论：**现在不推荐。**

## 推荐方向

`Phase 10I` 推荐采用：

## **Approved Draft Failed Send Journaling & Manual Retry**

第一刀只做：

- failed approved-draft send 写入高层 `decision_journal`
- retry 作为明确的 operator action 存在于现有 `Approved Draft Handoff` 面板
- retry 明确继承失败 artifact 的 `destinationId`
- retry 会创建新的 provider send artifact，不会修改旧的 failed artifact
- send history 能区分 `initial_send` 与 `manual_retry`
- `Search` / `Review Queue` / replay 能看到 failed send 与 retry outcome

第一刀不做：

- background retry queue
- retry backoff / max retry policy
- 批量 retry
- failed-send dashboard
- custom destination CRUD
- publish/share link
- provider response 自动回写成 approved truth

## Attempt 语义

`10I` 推荐给 approved draft provider send 增加一层稳定的 attempt 语义：

- `attemptKind`
  - `initial_send`
  - `manual_retry`
- `retryOfArtifactId`
  - 仅 `manual_retry` 时可指向上一条 failed artifact

这里最重要的原则是：

- retry 不是覆盖旧记录
- retry 是新的 send attempt
- retry 与被补发的失败 attempt 必须能在 audit 上连起来

这样可以保证：

- history 能说明“第一次失败、第二次补发成功”
- search/replay 不会把多次 attempt 挤成一条模糊状态
- 后续如果真的要做 background retry，也有稳定的数据锚点

## Retry 的内容源

`10I` 不建议把 retry 定义成“原封不动重放旧 request payload”。更稳妥的做法是：

- retry 继承失败 attempt 的 `destinationId`
- retry 重新从当前 `draftReviewId` 构建最新 approved handoff artifact
- retry 继续走当前 send service 的 route resolution 与 boundary policy

这样可以保持：

- destination identity 明确继承
- approved content 仍然来自当前 approved review 真相
- retry 不需要直接复制旧 request JSON

如果 review 已经不再是 `approved`，则 retry 应该失效，而不是偷偷发送旧 payload。

## Journal 语义

`10I` 推荐新增一条 failed-send decision type：

- `send_approved_persona_draft_to_provider_failed`

推荐 payload 至少包含：

- `draftReviewId`
- `sourceTurnId`
- `providerSendArtifactId`
- `provider`
- `model`
- `destinationId`
- `destinationLabel`
- `policyKey`
- `requestHash`
- `errorMessage`
- `attemptKind`
- `retryOfArtifactId`
- `failedAt`

同时，successful send 保持现有：

- `send_approved_persona_draft_to_provider`

但 operation payload 应补充：

- `attemptKind`
- `retryOfArtifactId`

这样 journal 层就能表达三类高层事实：

- 初次发送成功
- 初次发送失败
- 手动 retry 后成功或再次失败

## Label / Replay Summary 行为

为了让 Search 与 Replay 可读，`10I` 推荐在 `journalService` 里收口为：

- `send_approved_persona_draft_to_provider`
  - `attemptKind = initial_send` -> `Approved draft sent to provider`
  - `attemptKind = manual_retry` -> `Approved draft resent to provider`
- `send_approved_persona_draft_to_provider_failed`
  - `attemptKind = initial_send` -> `Approved draft send failed`
  - `attemptKind = manual_retry` -> `Approved draft resend failed`

target label 继续沿用：

- `Persona draft review · <sourceTurnId> · <destinationLabel>`

这里仍然保持 `destinationLabel` 优先于裸 `provider`，与 `10H` 一致。

## Persistence 设计

`10I` 推荐在 `persona_draft_provider_egress_artifacts` 中继续增加：

- `attempt_kind`
- `retry_of_artifact_id`

保留现有：

- `destination_id`
- `destination_label`

这样每条 artifact 都能表达：

- 发往哪里
- 是初次还是重试
- 如果是 retry，补的是哪次失败

provider egress events 表不需要新增字段，因为：

- request / response / error 细节仍然挂在 artifact 下面
- retry linkage 已经由 artifact 行表达

## Retry 行为规则

`10I` 推荐的最小规则如下：

1. 只有 latest event 为 `error` 的 artifact 才可 retry
2. retry 只能由 operator 显式点击触发
3. retry 默认继承 failed artifact 的 `destinationId`
4. retry 创建新的 artifact，并写入：
   - `attemptKind = manual_retry`
   - `retryOfArtifactId = <failed artifact id>`
5. retry 成功时：
   - 写 success journal
6. retry 失败时：
   - 写 failed-send journal

这里故意不做：

- 自动切换到别的 destination
- 自动 backoff
- 背景连续重试

如果 operator 想改 destination，不应该通过 retry button 隐式完成，而应该使用现有 destination selector 再发起一次新的普通 send。

## Renderer 设计

`10I` 继续留在现有 `Approved Draft Handoff` 面板中，不开新页面。

推荐在 `Provider Boundary Send` 子区块里补三层窄 UI：

1. latest failure summary
   - `error recorded`
   - `Destination: <label>`
   - 最新错误消息
   - `Attempt: initial send` 或 `Attempt: manual retry`
2. retry action
   - 当 latest event 为 `error` 时显示 `Retry failed send`
3. latest recovery result
   - retry 成功后，summary 切成 success，并显示 `Attempt: manual retry`

当前 destination selector 继续服务于“新的普通 send”。

`Retry failed send` 不是 selector 的别名，而是一个单独动作：

- 它继承失败 artifact 的 destination
- 不消费当前 selector 选项

## Search / Replay / Review 行为

`10I` 不需要新历史页，但现有读侧需要认识 failed/retried send：

- `Search`
  - 可以搜到 failed send summary
  - 可以通过 destination label、errorMessage、provider/model 命中
- `Review Queue / Undo History`
  - replay detail 能看到 failed / retried send journal payload
- `Memory Workspace` replay
  - approved turn 能看到 attempt kind、latest failure summary、latest retry outcome

这里的重点是：

- fail 与 retry 都变成产品级可复盘历史
- 同时仍然保留 boundary events 作为详细事实源

## Acceptance

`Phase 10I` 收口时应满足：

- failed approved-draft send 会写入 `decision_journal`
- successful retry 会写新的 artifact，而不是修改失败 artifact
- send artifact 读侧能区分 `initial_send` / `manual_retry`
- retry linkage 能指回 `retryOfArtifactId`
- `Search` / `Review Queue` / replay 能看到 failed send 与 retry outcome
- `Approved Draft Handoff` 面板能显示 latest error message，并提供 `Retry failed send`
- operator 触发 retry 后，latest audit detail 仍然保持可见
- retry 继续遵守 approved-only、review-first 的边界

## 明确不做

`Phase 10I` 不包括：

- background retry queue
- automatic resend on app launch
- retry statistics dashboard
- batch retry
- custom destination CRUD
- publish/share links
- failed send 之外的统一 outbound orchestration center

## 推荐结论

`Phase 10I` 推荐正式命名为：

## **Approved Draft Failed Send Journaling & Manual Retry**

推荐立即实施的第一刀：

## **Failed-send journal integration plus explicit manual retry linkage**

这样我们可以把 approved draft outbound slice 从“成功时可审计、失败时仍偏局部”的状态，推进到“失败也能进入全局历史、恢复也能形成明确审计链、但仍然保持 operator-driven 的窄闭环”，同时继续守住：

- approved-only
- review-first
- destination identity 已稳定
- detailed facts in boundary tables
- high-level lifecycle facts in decision history
