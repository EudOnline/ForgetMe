# Phase 10D Persona Draft Review Workflow Design

`Phase 10D` 的目标不是把 ForgetMe 从 `10C` 的 reviewed sandbox 直接推进成开放式 persona mode，而是把已经存在的 sandbox draft，第一次接入一个**正式、轻量、可审计的人审流程**。

在 `Phase 10C` 之后，系统已经能做到：

- persona 风格请求仍然被 block
- redirect 可以打开 `Reviewed draft sandbox`
- sandbox response 会显示 disclaimer、quote trace、compare / judge 审阅结果
- replay 能保留 sandbox workflow 元数据

但当前 sandbox draft 仍然只是一次 `Memory Workspace` response 里的附属区块。它可以被看、被比较、被回放，却还不能被正式地：

- 编辑
- 标记进入审阅
- 批准 / 驳回
- 写入可检索的 decision journal 审计链

`Phase 10D` 要解决的，就是这段“有草稿但没有正式审阅对象”的空白。

## 为什么 10D 不应该直接做开放 persona mode

如果在 `10C` 之后直接开放普通 `persona` ask mode，系统会立刻失去目前最重要的安全分层：

- 用户会更容易把输出误读为“系统已经能代本人发言”
- 当前 quote trace 会从“审阅依据”退化成“事后解释”
- compare / judge 也会从 review-first 变成 post-hoc 补救
- 任何编辑 / 批准行为都会缺少正式的审阅记录对象

所以 `10D` 最自然的下一步不是“让 persona sandbox 更强”，而是“让 sandbox draft 第一次成为可管理的 review artifact”。

## 方案比较

### 方案 A：继续把审阅状态塞进 `memory_workspace_turns.response_json`

优点：

- 改动最小
- 看起来最省事

缺点：

- 会把“生成记录”和“审阅记录”混在一起
- 后续编辑会变成对历史 response 的反复改写
- replay 很难区分“当时模型生成了什么”和“后来人改成了什么”

结论：**不推荐。**

### 方案 B：在 `Memory Workspace` 内引入轻量 `persona draft review` 实体

优点：

- 继续留在当前 `Memory Workspace` 产品流里
- 让 draft 拥有独立状态、正文、备注与 journal linkage
- 后续复制 / 导出 / workbench 扩展都会更自然

缺点：

- 需要新 migration、新 IPC、新页面状态管理
- 会新增一层 review read / write service

结论：**推荐。**

### 方案 C：直接做独立 `persona draft workbench`

优点：

- 结构最完整
- 长期上限最高

缺点：

- 范围明显变大
- 会把当前阶段从 `Memory Workspace` 内部闭环，扩成一条新的 review pipeline
- 与 `10D` baseline 的“轻量”目标不匹配

结论：**可以作为更后的 slice，但不是这一刀。**

## 推荐方向

`Phase 10D` 推荐采用：

## **Memory Workspace Persona Draft Review Workflow**

第一刀只做：

- `Memory Workspace` 内的轻量审阅面板
- 独立的 `persona_draft_reviews` 实体
- `draft / in_review / approved / rejected` 四种状态
- 可编辑正文与审阅备注
- journal 审计记录

不做：

- 普通开放式 `persona` ask mode
- 长期 persona conversation
- review queue / safe batch 集成
- 自动复制、导出、发送、发布
- OCR / doc evidence 扩展

## 核心对象模型

`Phase 10D` 的关键不是再发明一种新的 response，而是新增一个正式审阅对象：

- `Memory Workspace turn`
  - 记录“系统当时生成了什么 sandbox response”
- `Persona Draft Review`
  - 记录“人后来如何编辑、审阅、批准 / 驳回这份 draft”

推荐的 review 实体至少包含：

- `draftReviewId`
- `sourceTurnId`
- `scope`
- `workflowKind = persona_draft_sandbox`
- `status = draft | in_review | approved | rejected`
- `baseDraft`
- `editedDraft`
- `reviewNotes`
- `supportingExcerpts`
- `trace`
- `approvedJournalId`
- `rejectedJournalId`
- `createdAt`
- `updatedAt`

这里最重要的原则是：

- turn 是生成记录
- review entity 是审阅记录
- edited draft 不应覆写原始 sandbox response

## 页面流设计

`10D` baseline 不需要把用户带离 `Memory Workspace`。

当某个 turn 满足以下条件时：

- `response.workflowKind === 'persona_draft_sandbox'`
- `response.personaDraft !== null`

页面就在现有 `Persona Draft Sandbox` 区块下方增加 `Draft Review` 面板。

如果该 turn 还没有 review entity：

- 面板显示只读提示
- 提供一个显式 `Start draft review` 按钮
- 点击后创建 review 实体，再进入编辑态

如果 review entity 已存在：

- 展示状态 badge
- 显示可编辑正文和备注
- 根据状态决定按钮是否可用

实现里额外固定了这些 UI 文案，方便回放测试和 e2e 校验：

- `Start draft review`
- `Draft review body`
- `Draft review notes`
- `Save draft edits`
- `Mark in review`
- `Approve draft`
- `Reject draft`
- `Status: draft | in review | approved | rejected`

这个面板不替代原始 sandbox 内容，而是明确分成两层：

1. 原始 sandbox output
   - disclaimer
   - base draft
   - supporting excerpts
   - quote trace
   - compare / judge 审阅结果
2. review workflow
   - edited draft
   - notes
   - status
   - review actions

## 状态机

推荐 baseline 状态机如下：

- `draft`
  - 初始创建状态
  - 允许编辑正文、填写备注
  - 可进入 `in_review`
  - 可直接 `rejected`
- `in_review`
  - 仍允许编辑和补备注
  - 可回退为 `draft`
  - 可进入 `approved`
  - 可进入 `rejected`
- `approved`
  - baseline 下视为“内部确认可用”
  - 默认只读
  - 不提供复制 / 导出动作
- `rejected`
  - 保留最后版本与备注
  - 默认只读

第一刀不做：

- undo
- reopen approved / rejected review
- 基于 rejected review 自动 fork 新版本

## Journal 语义

`10D` 不能只改数据库状态而不留痕。

推荐新增以下 decision types：

- `mark_persona_draft_in_review`
- `approve_persona_draft_review`
- `reject_persona_draft_review`

其中：

- `draft -> in_review`
- `in_review -> approved`
- `draft / in_review -> rejected`

都应写入 `decision_journal`。

`Save draft edits` 本身不需要写 decision journal；它更像草稿编辑而不是决策动作。baseline 先依赖 `updatedAt` 与 review entity 持久化来表达编辑历史，不额外扩展 edit history 表。

## Replay 与读取原则

虽然 review entity 独立于 turn 持久化，但 replay 仍然需要看见它。

因此 `10D` 的读取层应该支持：

- 按 `turnId` 读取 review entity
- 在 `Memory Workspace` 里加载保存会话时，同样能看到 linked review
- `approved / rejected` 状态在重放时保持只读显示

这里的关键目标不是做复杂 review dashboard，而是确保：

- 旧 turn 仍然能回放原始 sandbox response
- 同时也能看到后来是否进入 review、结论是什么

## Acceptance

`Phase 10D` 收口时应满足：

- sandbox turn 可显式创建 `Draft Review`
- review 有独立实体，不覆写原始 turn response
- draft 支持编辑正文与备注
- 支持 `draft / in_review / approved / rejected` 四种状态
- 审阅状态流转会写入 `decision_journal`
- `approved / rejected` 状态默认只读
- replay / 已保存 session 中仍能看到 review 状态

## 明确不做

`Phase 10D` 不包括：

- 普通 persona ask mode
- long-running persona chat
- 自动复制 / 导出 / 发送
- review queue / safe batch 集成
- OCR / doc quote evidence 扩展
- 多版本 branching / merge draft management

## 推荐结论

`Phase 10D` 推荐正式命名为：

## **Persona Draft Review Workflow / 人格草稿审阅工作流**

推荐立即实施的 baseline：

## **Memory Workspace 内部轻量审阅闭环**

也就是：

- 不离开 `Memory Workspace`
- 先把 sandbox draft 提升为 review artifact
- 再补编辑、状态流转与 journal 审计
- 暂不进入复制 / 导出 / 交付动作
