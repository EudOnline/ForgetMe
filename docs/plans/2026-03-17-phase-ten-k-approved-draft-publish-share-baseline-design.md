# Phase 10K Approved Draft Publish/Share Baseline Design

`Phase 10K` 的目标不是把 ForgetMe 从 `10J` 直接推进成通用 outbound control plane，也不是马上做 cloud-hosted share link、custom destination CRUD、团队协作或统一 dashboard，而是给 **approved persona draft** 增加第一条真正面向“外部接收者”的 publish/share surface。

在 `Phase 10J` 完成之后，系统已经能做到：

- `approved` draft review 可以导出内部 handoff JSON
- operator 可以按显式 destination 把 approved draft send 到 provider
- failed send 会进入 journal，高层 replay / Search / Review Queue 都能重新找到
- failed send 可以 manual retry，短暂失败也能 background retry
- app 重启后，due retry job 仍然会恢复执行
- `Approved Draft Handoff` 面板已经形成一个稳定的 outbound 操作区

但现在仍然存在一个新的清晰空白：

- 当前 outward surface 仍然只有：
  - 内部 handoff export
  - provider-boundary send
- 没有一个“给人看 / 给人转交”的正式 publish/share package
- 没有稳定语义表达“这份 approved draft 已经被发布为外部分享对象”
- operator 还无法在 replay 中区分：
  - 内部 handoff
  - provider send
  - recipient-facing share package
- `10E` 导出的 handoff JSON 仍然偏内部、偏审计，不适合作为第一版外部分享对象

`Phase 10K` 要解决的，就是这段“已经能交付给系统 / provider，但还不能正式交付给人”的空白。

## 为什么 10K 不应该直接做 cloud share link

从 `10J` 往后看，publish/share link 确实已经自然，因为：

- approved draft truth 已稳定
- handoff / provider send / retry audit 已稳定
- outward actions 已进入 `decision_journal`

但如果这一刀直接跳到 cloud-hosted link：

- 系统会立刻引入 hosting / sync / auth / revoke / expiry 语义
- 本地优先架构会第一次被强迫回答“链接由谁托管”
- revocation 会从本地审计问题升级成远程访问控制问题
- outbound slice 会突然跨过 app 边界，复杂度明显跃升

当前最缺的不是“互联网链接”，而是“一个真正面向分享对象、但仍然留在本地优先边界内的 publish artifact”。

所以 `10K` 最自然的下一步不是“先做 link”，而是“先做 local share package，并把 publish 语义稳定下来”。

## 为什么 10K 也不应该先做 custom destinations 或 outbound dashboard

`10H` 到 `10J` 已经把 outbound 主线补到了 destination identity、failed-send recovery、background retry。

如果现在先做 custom destination CRUD 或统一 outbound dashboard：

- 会继续扩展控制面
- 但“人类接收者的分享对象”仍然缺位
- provider send 与 human share 仍然混在同一个 outbound 概念里
- 用户价值更高的“把 approved draft 正式发布给外部人看”仍然没有落地

所以 `10K` 更应该沿着同一条 approved-draft outbound 主线，把 outward surface 从 “system/provider-facing” 推进一步到 “human-facing”，而不是先扩张配置面或监控面。

## 当前承接点

仓库里已经有四块很适合承接 `10K` 的现成语义：

- `10E`
  - `buildApprovedPersonaDraftHandoffArtifact(...)`
  - approved-only export destination flow
  - handoff 历史的 journal-backed read model
- `10F~10J`
  - `Approved Draft Handoff` 面板已经成为 outbound 操作区
  - journal / Search / replay 已能承载 approved-draft outbound history
- `8C Context Pack Export`
  - 已有 `shareEnvelope`
  - 已有 deterministic local export 经验
- Vault / local-first 基线
  - 整个产品仍然优先站在本地 artifact 与本地审计上

这意味着 `10K` 最稳妥的做法不是发明一个新的 remote share subsystem，而是：

- 继续复用 approved review 真相
- 复用 `Approved Draft Handoff` 面板作为 UI 承载点
- 复用 `decision_journal` 作为 publish history 的审计事实
- 把 publish object 定义成一个新的 **local share package**

## 方案比较

### 方案 A：继续只做 internal export，再把文案改成 share

优点：

- 改动最小
- 几乎不需要新增对象模型
- operator 看起来已经“能导出了”

缺点：

- `10E` 的 handoff JSON 仍然偏内部，包含 review-oriented 结构
- 无法清晰区分 internal handoff 和 recipient-facing share
- Search / replay 里仍然没有独立的 publish 语义
- 只是改名，不是真正新增 product surface

结论：**不够完整，不推荐。**

### 方案 B：新增 local share package + journal-backed publication history

优点：

- 范围窄，仍然停留在本地优先边界内
- publish 成为一条独立、可审计、可回放的 outward action
- 能和 internal handoff / provider send 清晰分层
- 可以复用现有 handoff builder 与现有 UI 壳
- 为后续 cloud link / revoke / host sync 预留稳定 publication 语义

缺点：

- 需要设计新的 recipient-facing artifact 形态
- 需要给 UI 再增加一块 publish/share 子区

结论：**推荐。**

### 方案 C：直接做 cloud share link + revoke

优点：

- 用户感知最完整
- 最接近传统“发布链接”心智
- 后续分享传播能力最强

缺点：

- 需要远程托管边界
- 需要 link lifecycle / revoke / permission / expiry
- 明显超出当前本地优先与 approved-draft outbound slice 的复杂度

结论：**现在不推荐。**

## 推荐方向

`Phase 10K` 推荐采用：

## **Approved Draft Publish/Share Baseline**

第一刀只做：

- approved-only 的 local share package
- publish action 继续留在 `Approved Draft Handoff` 面板
- publish package 为 recipient-facing，而不是 internal handoff JSON
- publish history 写入 `decision_journal`
- replay / Search / Review Queue 能看到 publish history
- renderer 记住上次使用的 publish destination

第一刀不做：

- cloud-hosted share link
- revocation / expiry / access control
- custom destination CRUD
- unified outbound dashboard
- provider send 与 publish 的统一控制中心
- publish 后自动同步到外部服务

## 核心对象分层

`10K` 推荐继续维持三层对象，再新增第四层 outward object：

1. `Memory Workspace turn`
   - 原始 sandbox / answer 响应
2. `Persona Draft Review`
   - 人审后的 draft 真相
3. `Approved Draft Handoff`
   - 面向内部系统 / operator 的交付 artifact
4. `Approved Draft Publication`
   - 面向外部接收者的分享 package

这里最重要的原则是：

- publication 不是新的 review truth
- publication 不是 provider send artifact
- publication 是从 approved review 派生出来的 recipient-facing package

### 为什么 10K 不需要新 truth table

`10K` 推荐和 `10E` 一样，先把 publication 当作 **journal-backed event object**，而不是新的可变状态表。

第一刀里：

- 每次 publish 都创建一个新的 `publicationId`
- 每次 publish 都生成新的本地 share package 目录
- 每次 publish 都写入 `decision_journal`
- publication history 通过 read service 从 journal 映射

这样可以保持：

- approved review 继续是唯一内容真相
- publication 是 outward event，不是可编辑实体
- 首刀不需要回答 revoke / lifecycle state machine

## Share Package 形态

`10K` 不推荐只生成一个文本文件，也不推荐复用 `10E` 的原始 handoff JSON。

推荐把 publication 定义成一个固定目录：

```text
approved-draft-publication-<publicationId>/
  publication.json
  manifest.json
```

这样可以保证：

- recipient-facing 内容与内部审计元数据分离
- 后续如果要扩展 HTML / assets / signatures，不需要推翻目录语义
- 多次 publish 同一 review 时不会互相覆盖

### `publication.json`

这是给外部接收者看的 payload，应该保持最小自描述，但避免泄露内部 review 细节。

推荐至少包含：

- `formatVersion = 'phase10k1'`
- `publicationKind = 'local_share_package'`
- `publishedAt`
- `publicationId`
- `title`
- `question`
- `approvedDraft`
- `shareEnvelope`

推荐 **不包含**：

- `reviewNotes`
- `supportingExcerptIds`
- `trace`
- internal `canonicalPersonId`
- retry / send history

推荐 envelope：

- `requestShape = 'local_share_persona_draft_publication'`
- `policyKey = 'persona_draft.local_publish_share'`

### `manifest.json`

这是 package 内部的审计与来源说明，仍然写入本地 package，但不作为默认“给外部人看的正文”。

推荐至少包含：

- `formatVersion = 'phase10k1'`
- `publicationId`
- `publicationKind = 'local_share_package'`
- `publishedAt`
- `draftReviewId`
- `sourceTurnId`
- `scope`
- `workflowKind`
- `sourceArtifact = 'approved_persona_draft_handoff'`
- `publicArtifactFileName = 'publication.json'`
- `publicArtifactSha256`
- `excludedFields`
  - `reviewNotes`
  - `supportingExcerptIds`
  - `trace`
- `shareEnvelope`

manifest 的核心价值是：

- 让 operator 仍然能把 package 回连到内部真相
- 明确说明 publication 是 redacted / recipient-facing artifact，而不是 internal export

## 构建规则

`10K` 推荐的 publish 流程：

1. 验证 `draftReviewId` 对应 review 仍然是 `approved`
2. 调用现有 `buildApprovedPersonaDraftHandoffArtifact(...)`
3. 从 handoff artifact 派生 recipient-facing `publication.json`
4. 生成 `manifest.json`
5. 写入 publication package 目录
6. 计算 `publication.json` 的 sha256
7. 写入 `decision_journal`

这让 `10K` 与前几阶段保持一致：

- publish 仍然来源于 approved review 真相
- 不重放旧 request
- 不复制 provider send artifact
- 不引入新的 mutable truth layer

## Journal 语义

`10K` 推荐新增 decision type：

- `publish_approved_persona_draft`

推荐 payload 至少包含：

- `publicationId`
- `draftReviewId`
- `sourceTurnId`
- `publicationKind`
- `packageRoot`
- `manifestPath`
- `publicArtifactPath`
- `publicArtifactFileName`
- `publicArtifactSha256`
- `publishedAt`
- `sourceArtifact`

对应 label 推荐收口为：

- `Approved draft published for sharing`

target summary 推荐：

- `Persona draft review · <sourceTurnId> · local share package`

这样 Search / replay / Review Queue 就能把 publish action 与：

- internal export
- provider send
- retry history

清楚区分开。

## Read Model 行为

`10K` 推荐新增一个紧凑 read model：

- `ApprovedPersonaDraftPublicationRecord`
  - `journalId`
  - `publicationId`
  - `draftReviewId`
  - `sourceTurnId`
  - `publicationKind`
  - `status = 'published'`
  - `packageRoot`
  - `manifestPath`
  - `publicArtifactPath`
  - `publicArtifactFileName`
  - `publicArtifactSha256`
  - `publishedAt`

第一刀里：

- record 全部从 journal 映射
- 不需要单独 publication 表
- 多次 publish 同一 review 时，history 直接按时间倒序展示

## Renderer 设计

`10K` 继续留在现有 `Approved Draft Handoff` 面板，不引入新页面。

推荐在现有 handoff 区块里新增第三个子区：

1. local export
2. provider boundary send
3. publish / share

### Publish / Share 子区块建议展示：

- 当前 publish destination
- `Choose publish destination`
- `Publish approved draft`
- 最新 publication 的：
  - package 文件夹
  - 时间
  - sha256
- 简短 history 列表

如果 review 不是 `approved`：

- 不渲染 publish/share 区块

如果处于 replay / 已保存 session：

- publish history 只读显示
- 不允许重新执行 publish

## Destination 策略

`10K` 推荐继续采用 operator 选择本地目录的模式，而不是复用 provider destination registry。

原因是：

- publish/share package 本质上是本地文件系统输出
- 它的 target identity 不是 provider/model
- 它与 `10H` 的 send destination 不是同一类概念

因此建议新增独立的 destination 选择：

- `selectApprovedDraftPublicationDestination()`
- renderer 记住上次使用的 publish destination root

推荐 env hook：

- `FORGETME_E2E_APPROVED_DRAFT_PUBLICATION_DESTINATION_DIR`

以支持 deterministic e2e。

## Search / Replay / Review Queue 行为

`10K` 推荐保持和前几个 phase 一致的高层体验：

- Search 可以通过 journal label / target summary 找到 publish action
- replay 能在 approved turn 下看到 publish history
- Review Queue 如果已经显示 decision journal history，则自动承接新的 publish label

第一刀不需要单独的 publication center。

## Acceptance

`Phase 10K` 收口时应满足：

- 只有 `approved` review 才能 publish/share
- publish 会生成独立的 local share package 目录
- recipient-facing `publication.json` 不包含 internal review notes / trace
- package 内的 `manifest.json` 能回连到内部 review / turn
- publish action 会写入 `decision_journal`
- `Approved Draft Handoff` 面板能显示 publish/share 区块与 publication history
- replay / Search 能找到 publication history
- renderer 能记住上次使用的 publish destination

## 明确不做

`Phase 10K` 不包括：

- cloud share link
- revoke / expiry / permission control
- custom destination CRUD
- unified outbound dashboard
- provider send 与 publish 的统一 orchestration center
- publish package 的 HTML 主题化展示
- publish 后自动同步到外部存储

## 推荐结论

`Phase 10K` 推荐正式命名为：

## **Approved Draft Publish/Share Baseline**

推荐立即实施的第一刀：

## **Local share package plus journal-backed publication history**

这样我们可以把 approved draft outbound 从“已经能内部交付、能 provider send、能失败恢复”推进到“第一次能正式作为外部分享对象发布”的产品基线，同时继续守住：

- review-first
- approved-only
- local-first
- internal handoff 与 external publication 分层
- audit-first
- no cloud hosting semantics yet
