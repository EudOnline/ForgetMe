# Phase 10J Approved Draft Background Retry Queue & Launch Recovery Design

`Phase 10J` 的目标不是把 ForgetMe 从 `10I` 直接推进成通用 outbound orchestration center，也不是马上做 custom destination CRUD、publish/share link、批量重发或独立 dashboard，而是把 **approved draft provider send** 从“失败后可人工恢复”继续推进到“短暂离线后也能自动恢复、app 重启后也不会丢恢复机会”的下一段闭环。

在 `Phase 10I` 完成之后，系统已经能做到：

- failed approved draft send 会进入 `decision_journal`
- send history 能区分 `initial_send` 和 `manual_retry`
- operator 可以在 `Approved Draft Handoff` 面板里对 latest failed send 执行 manual retry
- retry 会继承 failed artifact 的 `destinationId`
- retry 会创建新的 artifact，并通过 `retryOfArtifactId` 把 lineage 串起来
- `Search` / `Review Queue` / replay 能找到 failed send 和 retry outcome

但当前还留着一个新的明显空白：

- failed send 仍然需要 operator 恰好在线并手动点击 retry
- 如果 app 关闭或重启，之前失败但尚未恢复的 send 不会自动继续
- UI 还看不出“这次失败是否已经进入 background retry 队列”
- 没有稳定语义表达“background retry 正在排队 / 执行中 / 已经耗尽尝试次数”
- `10I` 的 retry lineage 已经可审计，但还没有被 main 进程 runner 利用起来

`Phase 10J` 要解决的，就是这段“失败已经可见，也能人工恢复，但还没有轻量自动恢复”的空白。

## 为什么 10J 不应该直接做通用 outbound orchestration center

从 `10I` 往后看，background retry 确实已经自然，因为：

- destination identity 已经稳定
- attempt metadata 已经稳定
- retry lineage 已经稳定
- failed send 已经进入高层 journal

但如果这一刀直接跳到统一 outbound center，系统会立刻引入额外复杂度：

- 通用 job registry / dashboard
- 多类 outbound target 的统一 schema
- 批量控制、暂停、恢复、优先级
- 广义 backoff 策略与告警
- publish/share 等新的 outward surface

当前系统里最缺的并不是“统一调度中心”，而是“approved draft send 失败后，即使用户没马上手动介入，也能在 app 生命周期内自动恢复”。

所以 `10J` 最自然的下一步不是“建一个大而全的 outbound center”，而是“先把 approved draft outbound 做成一个很窄、可解释、可恢复的 background retry slice”。

## 为什么 10J 也不应该先做 custom destinations 或 publish/share

`10H` 稳定了 destination identity，`10I` 补齐了失败可见与手动恢复。

如果现在先去做 custom destination CRUD 或 publish/share：

- outbound surface 会继续变大
- 当前最实际的恢复缺口仍然存在
- 失败 send 的恢复会继续依赖 operator 在线
- 新增 outward surface 之前，系统还没有稳定的自动恢复基线

所以 `10J` 仍然应该沿着同一条 approved-draft outbound 主线继续收口 recovery，而不是扩大 outward surface。

## 当前承接点

仓库里已经有三块对 `10J` 很有帮助的现成语义：

- `10H`
  - destination identity 已稳定成 `destinationId` / `destinationLabel`
- `10I`
  - failed send 已进入 `decision_journal`
  - `attemptKind` / `retryOfArtifactId` 已稳定
  - manual retry 已经能复用当前 approved review 真相重建 handoff
- enrichment runner
  - main 进程已经有“轻量轮询 runner + SQLite claim”这一类实现模式

这意味着 `10J` 最稳妥的做法不是重新发明新的 send 模型，而是：

- 继续复用现有 provider send artifact 作为事实源
- 给 failed artifact 增加一层很窄的 retry-job 记录
- 用 main 进程 runner 去消费 due retry job
- 让 automatic retry 继续复用现有 send service、journal 语义和 retry lineage

## 方案比较

### 方案 A：不建 retry queue，只在 app 启动时扫描 failed artifacts 并立刻重试

优点：

- 表面上改动最少
- 不需要新增队列表

缺点：

- 无法稳定表达“queued / processing / exhausted”
- 很难避免重复自动发送
- manual retry 无法安全取消后台动作
- UI 看不到 next retry 时间或当前恢复状态
- app 每次启动都可能把历史失败重复扫出来

结论：**过于脆弱，不推荐。**

### 方案 B：给 failed artifact 增加轻量 retry queue + main runner

优点：

- auto-retry 拥有稳定、可 claim 的持久化状态
- launch recovery 天然成立，app 重启后 due job 会继续执行
- manual retry 可以显式取消旧的 pending job，避免重复
- UI 能稳定显示 queued / processing / exhausted
- 继续复用现有 artifact / journal / retry lineage

缺点：

- 需要新增一张 queue 表和一层 runner service
- 需要定义最小 delay / max attempts 规则

结论：**推荐。**

### 方案 C：直接做通用 scheduler + backoff policy + dashboard

优点：

- 长期运营能力最强
- 后续更多 outbound 工作都能复用

缺点：

- 明显超出当前 approved-draft outbound slice 的复杂度
- 需要先解决跨 domain job 统一问题
- 当前用户价值并不要求先上这一整层

结论：**现在不推荐。**

## 推荐方向

`Phase 10J` 推荐采用：

## **Approved Draft Background Retry Queue & Launch Recovery**

第一刀只做：

- failed approved-draft send 自动进入轻量 background retry queue
- automatic retry 作为新的 attempt kind 存在于现有 artifact / journal 语义中
- app 启动后 main 进程 runner 会继续消费 due retry job
- background retry 继续沿用当前 approved review 真相和 failed artifact 的 destination identity
- latest failed send 在 `Approved Draft Handoff` 面板里能显示 queue 状态
- renderer 在页面停留时周期刷新 send history，自动恢复结果能被看到

第一刀不做：

- 通用 outbound dashboard
- 指数 backoff / provider-specific retry policy
- 批量 retry
- retry queue 管理页面
- custom destination CRUD
- publish/share link
- provider response 自动回写为新的 approved truth

## Attempt 语义扩展

`10J` 推荐把 approved draft provider send 的 attempt 语义扩展为：

- `initial_send`
- `manual_retry`
- `automatic_retry`

这里最重要的原则是：

- automatic retry 不是特殊状态，而是新的 send attempt
- automatic retry 与 manual retry 一样，会创建新的 artifact
- automatic retry 仍然要通过 `retryOfArtifactId` 串回上一条 failed artifact

这样可以保证：

- history 能明确表达“第一次失败，background retry 再次尝试”
- Search / replay 能区分人工恢复和自动恢复
- 后续若真的做更复杂的 orchestration，也有稳定 audit 锚点

## Retry Queue 语义

`10J` 推荐新增一张很窄的持久化表：

- `persona_draft_provider_send_retry_jobs`

每一行只代表：

- “这条 failed artifact 是否仍然等待一次 automatic retry”

推荐字段至少包含：

- `id`
- `failedArtifactId`
- `draftReviewId`
- `sourceTurnId`
- `destinationId`
- `destinationLabel`
- `status`
  - `pending`
  - `processing`
  - `completed`
  - `cancelled`
  - `failed`
- `autoRetryAttemptIndex`
- `nextRetryAt`
- `claimedAt`
- `retryArtifactId`
- `lastErrorMessage`
- `createdAt`
- `updatedAt`

这里的核心约束是：

- 一个 failed artifact 最多只对应一条 retry job
- retry job 不是 send artifact 的替代品，只是自动恢复调度状态
- 详细 request / response / error 仍然只存于 provider send artifact / events

## Queue Eligibility 规则

`10J` 推荐的最小自动恢复规则如下：

1. 只有 latest event 为 `error` 的 artifact 才可能被 enqueue
2. enqueue 前要确认该 failed artifact 还没有 child retry artifact
3. automatic retry 次数按 artifact lineage 里的 `attemptKind = automatic_retry` 个数计算
4. 若 automatic retry 次数已达到上限，则不再创建新的 pending job
5. 若还未达到上限，则创建新的 `pending` job，并写入：
   - `autoRetryAttemptIndex = automaticRetryCount + 1`
   - `nextRetryAt = failedAt + fixedDelay`

这里有意保持最小策略：

- 固定 delay
- 固定 max attempts
- 不做 provider-specific backoff

因为这一刀的重点不是把策略做复杂，而是先把“自动恢复存在且可见”跑顺。

## Automatic Retry 的执行规则

runner 消费到 due job 后，推荐执行顺序：

1. 以事务 claim 最早到期的 `pending` job，并标记成 `processing`
2. 再次确认 job 对应 failed artifact 仍然 eligible：
   - latest event 仍为 `error`
   - 没有 child retry artifact
3. 调用现有 retry service，但把 attempt kind 设为 `automatic_retry`
4. success 时：
   - 当前 job 标记 `completed`
   - `retryArtifactId` 指向新的 successful artifact
5. failure 时：
   - 当前 job 标记 `failed`
   - send service 会为新的 failed automatic retry artifact 视情况继续 enqueue 下一条 job

这让 automatic retry 继续保持：

- 新 artifact、旧 artifact 不覆盖
- lineage 可追踪
- journal / replay 自动继承现有 send 事实

## Manual Retry 与 Queue 的关系

`10J` 不应该让 manual retry 和 background retry 彼此竞争。

推荐最小规则：

1. 当 operator 点击 `Retry failed send` 时，先取消该 failed artifact 对应的 `pending` job
2. manual retry 继续沿用当前 `retryApprovedPersonaDraftProviderSend(...)` 行为
3. 若 manual retry 成功，不再保留旧的 pending auto-retry job
4. 若 manual retry 再次失败，则新的 failed artifact 可重新按规则 enqueue

这样可以保证：

- operator 的明确动作优先于后台调度
- 不会出现“用户刚点了 retry，后台又按旧 artifact 再发一次”
- recovery 语义仍然清晰

## Launch Recovery

`10J` 推荐不单独做一次性“恢复脚本”，而是直接把恢复语义放进长期存在的 runner：

- app ready 时启动 retry runner
- runner 每隔固定 interval 检查是否存在 `nextRetryAt <= now` 的 pending job
- app 关闭时停止 runner

这样“app 启动后自动恢复”天然成立，因为：

- job 已经持久化在 SQLite
- 下次打开 app，runner 会继续看到并消费 due job

换句话说，launch recovery 不是独立 feature，而是 retry queue 持久化之后的自然结果。

## Journal / Search / Replay 行为

`10J` 不推荐新增“retry queued”类 journal entry。

保持更稳的做法是：

- automatic retry success 继续使用：
  - `send_approved_persona_draft_to_provider`
- automatic retry failure 继续使用：
  - `send_approved_persona_draft_to_provider_failed`
- 仅通过 `attemptKind = automatic_retry` 区分这次 send 是后台恢复动作

对应 label 推荐收口为：

- success + `automatic_retry`
  - `Approved draft auto-retried to provider`
- failure + `automatic_retry`
  - `Approved draft auto-retry failed`

这样 Search / replay 既能看到自动恢复 outcome，又不会因为 enqueue / cancel 等中间状态产生太多噪声。

## Read Model / Renderer 行为

`10J` 推荐继续复用：

- `listApprovedPersonaDraftProviderSends(...)`

但让每条 artifact 可选携带一层紧凑 read model：

- `backgroundRetry`
  - `status`
  - `autoRetryAttemptIndex`
  - `maxAutoRetryAttempts`
  - `nextRetryAt`
  - `claimedAt`

其中：

- 若该 failed artifact 有 `pending` 或 `processing` job，则 read model 直接来自 queue 表
- 若该 failed artifact 已无 pending job，且 automatic retry 次数已达上限，则 read model 显示 `exhausted`

`Approved Draft Handoff` 面板里，latest failed send 建议新增：

1. `Auto retry: queued · attempt 1 of 3`
2. `Next retry: <timestamp>`
3. `Auto retry: processing`
4. `Auto retry exhausted after 3 attempts`

manual retry button 的文案可以保持简洁，但建议变为：

- `Retry failed send now`

当 latest auto-retry job 处于 `processing` 时，manual retry button 应暂时禁用。

## Renderer 刷新策略

background retry 发生在 main 进程，renderer 不能只依赖用户点击后的局部刷新。

`10J` 推荐的最小方案是：

- 当 `MemoryWorkspacePage` 存在 approved draft review 时
- 周期性重新拉取 approved draft provider send history
- 只要页面仍停留在当前 scope，就让 auto-retry 成果在数秒内可见

这一刀不需要做 main->renderer push 事件，轮询即可满足需求。

## 配置建议

`10J` 推荐把最小策略配置成 env-overridable 常量：

- `FORGETME_APPROVED_DRAFT_SEND_AUTO_RETRY_DELAY_MS`
  - 默认 `30_000`
- `FORGETME_APPROVED_DRAFT_SEND_AUTO_RETRY_MAX_ATTEMPTS`
  - 默认 `3`
- `FORGETME_APPROVED_DRAFT_SEND_RETRY_RUNNER_INTERVAL_MS`
  - 默认 `5_000`

测试环境可以把 delay 与 runner interval 压到极短，从而做 deterministic e2e。

## Acceptance

`Phase 10J` 收口时应满足：

- failed approved-draft send 会自动进入 retry queue
- automatic retry 会创建新的 send artifact，`attemptKind = automatic_retry`
- automatic retry 仍然继承 failed artifact 的 `destinationId`
- app 重启后，之前未完成的 due retry job 仍会被恢复执行
- latest failed send 在 handoff 面板里能显示 queued / processing / exhausted
- operator 执行 manual retry 时，会取消该 failed artifact 对应的 pending job
- Search / replay 能区分 automatic retry success / failure
- renderer 停留在页面时，background retry 结果会自动刷新出来

## 明确不做

`Phase 10J` 不包括：

- 指数 backoff
- provider-specific retry policy
- batch retry
- retry queue dashboard
- retry queue 手工暂停 / 恢复 / 编辑
- custom destination CRUD
- publish/share link
- outbound orchestration center

## 推荐结论

`Phase 10J` 推荐正式命名为：

## **Approved Draft Background Retry Queue & Launch Recovery**

推荐立即实施的第一刀：

## **Lightweight retry queue plus app-lifecycle runner**

这样我们可以把 approved draft outbound 从“失败后可见、可人工恢复”推进到“失败后可自动恢复、app 重启也不丢恢复机会”的产品级闭环，同时继续守住：

- review-first
- approved-only
- destination identity stable
- retry lineage explicit
- detailed provider facts stay in boundary artifacts
- high-level replay facts stay in decision history
