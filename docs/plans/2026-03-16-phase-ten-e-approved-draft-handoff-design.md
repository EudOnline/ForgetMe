# Phase 10E Approved Draft Handoff Design

`Phase 10E` 的目标不是把 ForgetMe 从 `10D` 直接推进成开放式 persona mode，也不是立刻接入远程发送或发布链路，而是给**已经通过人审的 persona draft** 增加一个最小、可审计、可回放的 handoff 出口。

在 `Phase 10D` 完成之后，系统已经能做到：

- `Memory Workspace` 里的 reviewed sandbox draft 可以正式创建 review artifact
- draft 支持编辑、进入 `in_review`、`approved`、`rejected`
- `approved / rejected` 默认只读
- 审阅状态流转会写入 `decision_journal`
- replay / 已保存 session 可以重新看到 review 状态

但现在仍然缺少一段关键闭环：

- `approved` draft 还不能被正式交付到本地 artifact
- UI 没有 handoff 区块
- 没有 handoff 审计记录
- 没有“这份 approved draft 已经被导出过什么”的 replay 视图

`Phase 10E` 要解决的，就是这段“审阅完成但还没有 handoff”的空白。

## 为什么 10E 不应该直接做开放 persona mode

如果在 `10D` 之后直接开放普通 persona ask mode，系统会再次把“审阅完成的内部草稿”误推成“可以自由代表本人发言的交互能力”。

这会带来几个问题：

- `approved` 的含义会从“内部通过审阅的 draft artifact”被误解成“可以直接对外使用的人格模式”
- handoff 审计边界会被聊天交互吞掉，很难知道到底哪一个版本被交付出去了
- 当前 review-first 结构会被新的 ask surface 稀释
- 一旦把 send / publish 和 open persona mode 混在一起，范围会立刻失控

所以 `10E` 最自然的下一步不是“放开 persona”，而是“让 approved draft 第一次拥有正式 handoff 动作”。

## 方案比较

### 方案 A：approved 后直接做 copy + export，两种动作都上

优点：

- 用户感知最完整
- 一份 approved draft 可以立刻复制或导出
- 看起来最像“handoff”

缺点：

- 当前代码里没有成熟 clipboard 路径
- copy 行为天然比本地文件导出更难审计
- 首刀就引入两种 egress surface，会让验收和错误处理同时变复杂

结论：**不是第一刀的最佳选择。**

### 方案 B：只做 approved-only 的本地 JSON export，并把 handoff 历史建成 journal-backed read model

优点：

- 与现有 `Context Pack Export` 模式高度一致
- 本地文件导出比 clipboard 更容易审计和回放
- 不需要再发明新的 truth table
- 可以把 handoff 定义为“审阅完成后的明确交付事件”，而不是新的编辑对象

缺点：

- 首刀没有一键 copy
- handoff 体验偏克制，需要用户先选目录再导出

结论：**推荐。**

### 方案 C：直接做 send / publish / provider handoff pipeline

优点：

- 长期能力最完整
- 后续对接外部 agent / provider 更自然

缺点：

- 会立刻扩展到远程 egress、失败补偿、外部目标建模、更多 audit policy
- 明显超出 `10E` “最小 handoff” 的目标

结论：**后续阶段再做，不适合这一刀。**

## 推荐方向

`Phase 10E` 推荐采用：

## **Approved Draft Handoff Export**

第一刀只做：

- 只有 `approved` persona draft review 才能 handoff
- handoff 形式只支持本地 JSON export
- export 结果写入 `decision_journal`
- `Memory Workspace` 与 replay 都能看到 handoff 历史摘要

第一刀不做：

- clipboard copy
- remote send / publish
- 重新打开 approved review
- 多版本 handoff pipeline
- 普通开放式 persona ask mode

## 核心对象模型

`10E` 的核心原则不是再发明一个“handoff 后的 draft 真相表”，而是明确区分三层对象：

- `Memory Workspace turn`
  - 记录系统当时生成了什么 sandbox response
- `Persona Draft Review`
  - 记录人如何编辑并批准 / 驳回这份 draft
- `Approved Draft Handoff`
  - 记录哪一份 approved review 何时被导出成了本地 artifact

推荐 baseline 做法是：

- **不新增 `persona_draft_handoffs` 表**
- handoff 事件直接写入 `decision_journal`
- 再通过一个专门的 read service，把 journal entry 映射成 handoff history

这样可以保持：

- review entity 继续是唯一的审阅真相
- handoff 是事件，不是新的可编辑实体
- replay 可以稳定回放 handoff 结果

推荐的 handoff read model 至少包含：

- `journalId`
- `draftReviewId`
- `sourceTurnId`
- `handoffKind = local_json_export`
- `status = exported`
- `filePath`
- `fileName`
- `sha256`
- `exportedAt`

## Export Artifact 形态

`10E` 不应该只导出一段正文文本；它应该导出一份**足够自描述、足够可追溯**的 JSON artifact。

推荐 artifact 至少包含：

- `formatVersion = 'phase10e1'`
- `handoffKind = 'local_json_export'`
- `exportedAt`
- `draftReviewId`
- `sourceTurnId`
- `scope`
- `workflowKind = 'persona_draft_sandbox'`
- `reviewStatus = 'approved'`
- `question`
- `approvedDraft`
- `reviewNotes`
- `supportingExcerptIds`
- `communicationExcerpts`
- `trace`
- `shareEnvelope`

其中最关键的是：

- `approvedDraft` 必须来自 review entity 的 `editedDraft`
- `communicationExcerpts` 需要从 source turn 的 `communicationEvidence.excerpts` 补齐文本级证据，而不只是导出 excerpt id
- `shareEnvelope` 维持和 context pack 一样的边界语义，明确这是本地导出 artifact，而不是系统内部真相表

推荐 envelope：

- `requestShape = 'local_json_persona_draft_handoff'`
- `policyKey = 'persona_draft.local_export_approved'`

推荐文件名：

- `persona-draft-review-<draftReviewId>-approved.json`

使用稳定文件名的好处是：

- 同一份 approved review 重复导出时路径稳定
- 与 context pack 的 deterministic export 模式一致
- 不需要在首刀里额外设计 archive package 或版本目录

## 页面流设计

`10E` 继续留在 `Memory Workspace` 内部闭环，不引入新的 workbench 页面。

当某个 turn 满足：

- 存在 linked `Persona Draft Review`
- review `status === 'approved'`

页面就在现有 `Draft Review` 面板下方增加 `Approved Draft Handoff` 区块。

这个区块只需要展示：

- 当前导出目录
- `Choose export destination`
- `Export approved draft`
- 最近一次 handoff 的文件名、时间、sha256

如果 review 还没 `approved`：

- 不显示 handoff 操作按钮
- 避免把“导出”误提示成 review 之前就可执行的动作

如果 review 已经 `approved` 且存在 handoff 历史：

- 默认展示最近一次导出
- 可以附带简单 history 列表
- replay / 已保存 session 中保持只读展示

这个 handoff 区块不替代 `Draft Review`，也不替代原始 sandbox response；它只是第三层：

1. 原始 sandbox output
2. draft review workflow
3. approved draft handoff

## Journal 语义

`10E` 的关键是 handoff 必须是可审计动作，而不是 UI 本地状态。

推荐新增 decision type：

- `export_approved_persona_draft`

其中：

- 只有成功写出本地 artifact 时才写 journal
- 用户取消目录选择不写 journal
- 写文件失败返回错误或 `null`，但不伪造成功记录

推荐 journal payload 至少包含：

- `draftReviewId`
- `sourceTurnId`
- `scope`
- `handoffKind`
- `filePath`
- `fileName`
- `sha256`
- `exportedAt`

`targetType` 继续使用：

- `persona_draft_review`

这样可以保持：

- 审阅与 handoff 都围绕同一个 `draftReviewId`
- Decision Journal 搜索仍能看到完整链条
- 不需要为了首刀新建 handoff target type taxonomy

## Replay 与读取原则

虽然 handoff 没有独立表，但 replay 必须看得见它。

因此 `10E` 的读取层应该支持：

- 按 `draftReviewId` 列出 handoff history
- `Memory Workspace` 加载保存 session 时同步读取 linked approved handoff summary
- approved review 在 replay 下显示只读 handoff 摘要

这里最重要的不是做复杂 handoff dashboard，而是确保：

- 我们知道哪份 draft 被导出了
- 知道导出到了什么文件
- 知道是什么时候导出的
- 导出的内容能回溯到具体 approved review

## Acceptance

`Phase 10E` 收口时应满足：

- 只有 `approved` persona draft review 才能执行 handoff
- handoff 第一刀只支持本地 JSON export
- exported artifact 包含 approved draft、question、excerpt evidence、trace 与 share envelope
- export 成功会写入 `decision_journal`
- `Memory Workspace` 中能看到最新 handoff 结果
- replay / 已保存 session 中仍能看到 handoff 摘要
- 原始 turn response 与 review entity 在 handoff 后仍保持不变

## 明确不做

`Phase 10E` 不包括：

- clipboard copy
- remote provider send
- publish / share link
- approved review reopen / undo
- handoff queue、批量 handoff
- 普通 persona ask mode
- 新的 standalone persona workbench
