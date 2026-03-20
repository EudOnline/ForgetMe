# Phase 10M Approved Draft Hosted Share Link Design

`Phase 10M` 的目标不是把 ForgetMe 从 `10L` 直接推进成通用 remote publishing platform，也不是马上做 custom host registry、custom domain、expiry policy、team collaboration、访问统计或统一 outbound dashboard，而是给 **approved draft publication** 增加第一条真正可远程访问、可撤销、可审计的 hosted share link 基线。

在 `Phase 10L` 完成之后，系统已经能做到：

- approved draft review 可以导出 internal handoff JSON
- operator 可以把 approved draft 发送到 provider destination，并且：
  - failed send 可 journal / replay / Search
  - failed send 可 manual retry
  - failed send 可 background retry
  - app 重启后 due retry 仍会恢复
- operator 也可以把 approved draft 发布成 local publication package：
  - `publication.json`
  - `manifest.json`
  - `index.html`
  - `styles.css`
- `Memory Workspace`、replay 与 Search 已能看到 publication history
- renderer 已能对 share page 执行 read-only 的 `Open share page`
- main 进程打开 share page 前会验证 package boundary，而不是盲目信任任意路径

但现在仍然留着一个新的清晰空白：

- 当前 share surface 仍然要求接收者拿到本地文件或本地目录
- operator 还不能把一个既有 publication package 变成可远程访问的 hosted URL
- 系统还没有稳定语义表达：
  - 这份 publication 是否已经生成 hosted share link
  - 这个 link 当前是否仍然有效
  - 这个 link 是否已经被 revoke
- replay / Search 虽然能看到 local publication，但还不能区分：
  - 仅本地发布
  - 已经远程托管
  - 已经撤销远程访问
- `10K/10L` 已经把 publication package 的本地语义做稳定了，但“远程传播”仍然没有正式承接层

`Phase 10M` 要解决的，就是这段“已经有稳定 publication package，也有给人看的 share page，但还没有 hosted link lifecycle”的空白。

## 为什么 10M 不应该直接做通用 remote publishing platform

从 `10L` 往后看，hosted share link 确实已经自然，因为：

- approved review 真相已稳定
- local publication package 已稳定
- human-readable `index.html` 已稳定
- publication history 已进入 `decision_journal`

但如果这一刀直接跳到通用 remote publishing platform，系统会立刻引入额外复杂度：

- 多 host provider / custom host registry
- custom domain / branding / theming
- link expiry / password / permission model
- analytics / access log / dashboard
- team collaboration / recipient management
- link refresh、bulk revoke、统一运维界面

当前系统里最缺的并不是“完整托管平台”，而是“在现有 approved draft publication 之上先补一条很窄、可解释、可回放、可 revoke 的 hosted share link 基线”。

所以 `10M` 最自然的下一步不是“先建平台”，而是“先把 hosted share link 作为 publication 的下一层 outward handle 稳定下来”。

## 为什么 10M 也不应该先做 custom host registry 或 outbound dashboard

`10H~10J` 已经把 provider send 的 destination、failure、retry、launch recovery 补全，`10K~10L` 又把 local publication package 与 share page 补全。

如果现在先做 custom host registry 或 unified outbound dashboard：

- 会继续扩展控制面
- 但 hosted share link 的最小对象语义仍然缺位
- operator 仍然不能先获得一个真正可发给远程接收者的 URL
- publish、host、revoke 会在没有稳定 link object 的前提下被过早抽象

所以 `10M` 更应该继续沿着同一条 approved-draft outbound 主线，先把：

- publication package
- hosted share link
- revoke

这三个动作的层次关系做清楚，而不是先扩张配置面和监控面。

## 当前承接点

仓库里已经有四块很适合承接 `10M` 的现成语义：

- `10K`
  - publication package 已是独立 outward object
  - `publication.json` 是 canonical recipient-facing payload
  - `manifest.json` 能回连内部 truth
- `10L`
  - `index.html` / `styles.css` 已形成 human-readable entry
  - `openApprovedDraftPublicationEntry(...)` 已验证 package boundary
- `10F` 与 `6A2`
  - 远程边界调用与 request/response/error 审计已有现成模式
- `Approved Draft Handoff` 面板
  - 已经是 approved draft outbound 的稳定 UI 承载点

这意味着 `10M` 最稳妥的做法不是重新定义新的 publish artifact，而是：

- 继续把 local publication package 作为 share truth
- 把 hosted link 定义成 publication 的 **远程分发句柄**
- 让 create / revoke 进入 `decision_journal`
- 让远程 host 调用沿用现有 boundary audit 思路

## 方案比较

### 方案 A：直接从当前 approved review 真相生成 hosted link，不显式依赖 local publication

优点：

- 表面上少一步本地 publish
- UI 看起来更“直接”

缺点：

- 会绕开 `10K/10L` 刚刚稳定下来的 publication package 语义
- hosted share 与 local publication 变成两条并行派生链
- operator 无法清楚知道“这个 link 到底对应哪次 publication snapshot”
- 后续 revoke / replay / diff 更难解释

结论：**会破坏现有层次，不推荐。**

### 方案 B：把 hosted share link 定义成既有 publication package 的远程分发句柄

优点：

- 复用 `10K/10L` 已落地的 package 语义
- hosted link 与 local publication 的关系清晰可解释
- create / revoke 可以作为 journal-backed outward events 挂在同一个 approved draft 上
- 后续若做 expiry / custom host / analytics，也有稳定锚点

缺点：

- operator 首次生成 hosted link 前，需要先拥有一份 publication package
- 需要定义很窄的 remote host 协议与 revoke 语义

结论：**推荐。**

### 方案 C：直接做 collaboration-style share center

优点：

- 一步到位，想象空间最大
- 后续功能都能往里塞

缺点：

- 远超当前 approved-draft outbound slice 的复杂度
- 会提前引入权限、角色、可见性、仪表盘等问题
- 不能体现 local-first publication package 的既有价值

结论：**现在不推荐。**

## 推荐方向

`Phase 10M` 推荐采用：

## **Approved Draft Hosted Share Link Baseline**

第一刀只做：

- 基于现有 approved draft publication package 创建 hosted share link
- hosted link 只引用一个确定的 `publicationId`
- hosted link 的 public entry 默认就是 package 内现有的 `index.html`
- create 与 revoke 都写入 `decision_journal`
- hosted link history 出现在 `Memory Workspace`、replay 与 Search
- 远程 host create / revoke 操作有独立 boundary audit
- replay 保持 non-mutating，但允许对现有 hosted URL 执行 read-only 打开动作

第一刀不做：

- custom host registry
- custom domain
- expiry / password / access policy
- recipient analytics / view count
- team collaboration / invitation
- multi-link bulk management
- publication center / share dashboard
- publish 时自动创建 hosted link

## 核心对象分层

`10M` 推荐继续维持现有四层对象，再新增第五层 outward handle：

1. `Memory Workspace turn`
   - 原始 sandbox / answer 响应
2. `Persona Draft Review`
   - 人审后的 draft 真相
3. `Approved Draft Handoff`
   - 面向内部系统 / operator 的交付 artifact
4. `Approved Draft Publication`
   - 面向接收者的本地 share package
5. `Approved Draft Hosted Share Link`
   - 指向某次 publication snapshot 的远程分发句柄

这里最重要的原则是：

- hosted share link 不是新的内容真相
- hosted share link 不是新的 publication package
- hosted share link 只是把既有 publication snapshot 暴露为 remote URL

## Publication 与 Hosted Link 的关系

`10M` 推荐明确要求：

- create hosted link 时必须绑定一个已存在的 `publicationId`
- hosted link 只托管那次 publication package 的固定内容
- hosted link 不会重新生成 `publication.json`
- hosted link 不会修改本地 package

第一刀里最窄的策略是：

- UI 只针对当前 latest publication 提供 `Create hosted share link`
- 如果当前 review 还没有 publication history：
  - renderer 只提示先执行 `Publish approved draft`
  - 不隐式自动 publish

这样可以保持：

- publication snapshot 来源显式
- host 行为可解释
- operator 不会误以为 hosted link 代表“当前最新 review truth”

## Hosted Link 生命周期

`10M` 推荐的 hosted link 生命周期只保留两种稳定状态：

- `active`
- `revoked`

create 规则：

1. 校验目标 `draftReviewId` 当前仍为 `approved`
2. 读取 latest publication record
3. 校验 package 结构仍然满足：
   - `manifest.json`
   - `publication.json`
   - `index.html`
   - `styles.css`
4. 校验 package manifest 仍然属于 `phase10k1` approved draft publication
5. 把 package 文件上传给 configured host
6. host 返回 `remoteShareId` 与 `shareUrl`
7. 写入 create journal

revoke 规则：

1. 只能对当前 `active` 的 hosted link 执行 revoke
2. revoke 只影响 remote accessibility，不删除本地 package
3. host 成功确认 revoke 后，写入 revoke journal
4. replay 中不允许执行 revoke，但要能看到 revoke history

第一刀里不引入：

- `expired`
- `paused`
- `password_protected`
- `soft_deleted`

因为这一刀的重点不是复杂 lifecycle，而是先把“能创建、能撤销、能审计”跑顺。

## Remote Host Boundary

`10M` 推荐新增一个很窄的 host adapter，而不是一套通用 publishing platform。

app 侧只关心两个动作：

- `createHostedApprovedDraftShareLink(...)`
- `revokeHostedApprovedDraftShareLink(...)`

host adapter 的核心约束：

- 只接受来自已验证 publication package 的固定文件集合
- 不发送本地 `packageRoot`、绝对路径或其它 host 不需要的 filesystem 信息
- 远程请求里只包含：
  - `publicationId`
  - `draftReviewId`
  - `sourceTurnId`
  - `publicArtifactSha256`
  - package 文件内容
  - 最小 host metadata

第一刀推荐只有一个 configured host，不做 selector。建议配置面收口为：

- `FORGETME_APPROVED_DRAFT_SHARE_HOST_BASE_URL`
- `FORGETME_APPROVED_DRAFT_SHARE_HOST_TOKEN`

为 deterministic e2e 预留：

- `FORGETME_E2E_APPROVED_DRAFT_SHARE_HOST_BASE_URL`

这里的原则是：

- host identity 可以先是“单个配置好的托管端点”
- 等 link object 稳定后，再考虑 host registry / presets

## Boundary Audit 语义

因为 hosted link 会首次把 approved draft publication 发到远程 host，`10M` 不应该只保留高层 journal。

推荐新增很窄的 boundary audit 语义，形态可沿用 `6A2/10F` 的现有模式：

- `approved_draft_share_host_artifacts`
- `approved_draft_share_host_events`

每次 create / revoke 都生成一条 boundary artifact，并记录：

- `request`
- `response`
- `error`

但 operator-facing 的高层历史仍然保持简单：

- create 成功才写 `decision_journal`
- revoke 成功才写 `decision_journal`
- 失败细节主要在 boundary audit 与当前页面状态中呈现

这样可以同时守住：

- 高层 replay 简洁
- 远程边界有足够审计
- 不把临时失败都混进 link lifecycle truth

## Decision Journal 语义

`10M` 推荐新增两类 decision type：

- `create_approved_persona_draft_share_link`
- `revoke_approved_persona_draft_share_link`

两者都继续挂在：

- `targetType = 'persona_draft_review'`
- `targetId = draftReviewId`

create payload 至少包含：

- `shareLinkId`
- `publicationId`
- `draftReviewId`
- `sourceTurnId`
- `hostKind = 'configured_remote_host'`
- `hostLabel`
- `remoteShareId`
- `shareUrl`
- `publicArtifactSha256`
- `createdAt`

revoke payload 至少包含：

- `shareLinkId`
- `publicationId`
- `draftReviewId`
- `sourceTurnId`
- `remoteShareId`
- `shareUrl`
- `revokedAt`

label 推荐收口为：

- create: `Hosted share link created for approved draft`
- revoke: `Hosted share link revoked`

target summary 推荐：

- `Persona draft review · <sourceTurnId> · hosted share link`

这样 Search / replay / Review Queue 就能把 hosted link 与：

- local publication
- provider send
- retry history

清楚区分开。

## Read Model 行为

`10M` 推荐先保持 journal-backed read model，而不是急着新增 mutable link table。

推荐新增：

- `ApprovedPersonaDraftHostedShareLinkRecord`

字段至少包含：

- `shareLinkId`
- `publicationId`
- `draftReviewId`
- `sourceTurnId`
- `hostKind`
- `hostLabel`
- `remoteShareId`
- `shareUrl`
- `publicArtifactSha256`
- `status`
  - `active`
  - `revoked`
- `createdAt`
- `revokedAt`

映射规则：

- create journal 生成 link record
- 若存在同 `shareLinkId` 的 revoke journal，则状态折叠成 `revoked`
- list 结果按 `createdAt` 倒序

第一刀里：

- 一个 publication 可以拥有多条 hosted links
- 一条 hosted link 最多只有一次 revoke
- 不需要单独回答 link rotation、refresh、re-activate

## Renderer 设计

`10M` 继续留在现有 `Approved Draft Handoff` 面板，不新增页面。

推荐在当前 `Publish / Share` 区块内继续增加一个 `Hosted Share Link` 子区：

当存在 latest publication 且 host 已配置时：

- `Create hosted share link`
- latest link 的：
  - `shareUrl`
  - `status`
  - `createdAt`
  - `hostLabel`
- `Open hosted share link`
- 若 latest link 为 `active`：
  - `Revoke hosted share link`
- 历史列表：
  - `active` / `revoked`
  - 时间
  - URL 或 host label

当没有 publication 时：

- 展示只读提示：
  - `Publish approved draft to create a local package before hosting`

当 host 未配置时：

- 展示只读提示：
  - `Hosted share link is unavailable until a share host is configured`

replay 规则保持和 `10L` 一致：

- 不允许 create
- 不允许 revoke
- 允许对现有 `shareUrl` 执行 open
- 允许查看 hosted link history

## Search / Replay / Review Queue 行为

`10M` 推荐继续复用高层 journal 体验：

- Search 可以通过 label、`shareUrl`、`remoteShareId`、`publicationId` 找到 hosted link history
- replay 在 approved turn 下展示 hosted link create / revoke 历史
- Review Queue 若已显示 decision journal history，则自动承接 hosted link labels

第一刀不需要：

- 独立 link management page
- 独立 host audit page

## Acceptance

`Phase 10M` 收口时应满足：

- 只有已有 local publication package 的 approved draft 才能创建 hosted share link
- hosted share link 明确绑定某个 `publicationId`
- remote host 只接收 publication package 文件与最小 metadata，不接收本地绝对路径
- create 成功会写入 `decision_journal`
- revoke 成功会写入 `decision_journal`
- create / revoke 远程调用都有 boundary audit
- `Memory Workspace` 能显示 latest hosted link 与历史
- replay 保持 non-mutating，但能打开既有 hosted link
- Search / replay / Review Queue 能区分：
  - local publication
  - hosted share link create
  - hosted share link revoke

## `10M` 不包括

`Phase 10M` 不包括：

- automatic hosted-link creation on publish
- share host destination registry
- custom host CRUD
- custom domain / branding
- expiry / password / permission gates
- recipient analytics / view log
- hosted link background retry queue
- bulk revoke / rotate / refresh
- collaboration inbox / recipient roster

## 推荐命名

`Phase 10M` 推荐正式命名为：

## **Approved Draft Hosted Share Link Baseline**

这样可以把 approved draft outward surface 继续从：

- internal handoff
- provider send
- local publication package
- human-readable local share page

再推进到：

- **journal-backed hosted share link lifecycle**

同时继续守住：

- approved review 仍是唯一内容真相
- publication package 仍是唯一 share snapshot
- hosted link 只是远程分发句柄，不是新的 truth layer
