# Phase 10C Reviewed Persona Draft Sandbox Design

`Phase 10C` 的目标不是开放普通 `persona mode`，而是在 `Phase 10A` 的 persona block 与 `Phase 10B` 的 quote-backed communication evidence 之间补上一条可审阅、可追溯、可比较的 sandbox workflow。

## Baseline

- persona 风格请求仍然先被 block，不直接产出“像她本人”的回答
- block 后的 redirect 继续保留 grounded summary / advice / past expressions
- 当当前 scope 具备 communication evidence 时，redirect 额外暴露 `Reviewed draft sandbox`
- sandbox response 使用独立 workflow：`workflowKind = persona_draft_sandbox`
- sandbox output 不是 archive fact summary，而是带 `review_required` 状态的 simulation draft

## Redirect Contract

`boundaryRedirect` 在 `10C` 里从单纯的 follow-up ask，升级为显式动作：

- `ask`
- `open_persona_draft_sandbox`

其中：

- `Past expressions` 继续回到 quote-backed evidence ask
- `Reviewed draft sandbox` 打开 sandbox workflow，而不是伪装成普通表达模式

稳定文案基线：

- redirect action label: `Reviewed draft sandbox`
- sandbox disclaimer: `Simulation draft based on archived expressions. Not a statement from the person.`
- workflow label: `Workflow: persona draft sandbox`
- compare verdict heading: `Judge verdict`

## Sandbox Evidence Rule

`Phase 10C` 继续坚持 quote-backed 生成：

- sandbox draft 至少需要 2 条 communication excerpts
- excerpt 不足时，response 保持 `workflowKind = persona_draft_sandbox`
- guardrail 会回到 `fallback_insufficient_evidence`
- 不展示 draft / disclaimer / trace

为了让 redirect 入口稳定可用，`10C` 在默认 sandbox 问句上增加一条窄回退：

- 如果用户点击的是系统生成的默认 sandbox 问句
- 且按该问句做相关性检索时不足 2 条 excerpts
- 则允许回退到当前 scope 的 communication evidence baseline

这条回退只用于默认 redirect 入口，不放宽手动输入的 sandbox ask。手动 ask 仍然必须靠问题本身匹配到足够 excerpts，避免把“任意 topic”错误包装成有根据的 persona draft。

## Response Shape

sandbox response 在普通 answer 之外，额外要求：

- `workflowKind`
- `personaDraft.title`
- `personaDraft.disclaimer`
- `personaDraft.draft`
- `personaDraft.reviewState`
- `personaDraft.supportingExcerpts`
- `personaDraft.trace`

关键原则：

- draft 是 simulation
- excerpts 才是 archive truth
- trace 必须让审阅者回到 direct quotes

## Compare / Judge Behavior

compare / judge 继续复用现有 `Memory Workspace Compare` 框架，但切换为 sandbox-aware 语义：

- compare session summary 持久化 `workflow_kind`
- compare renderer 在 saved sessions 和 run details 里都显示 workflow label
- provider compare runs 生成的是 candidate sandbox draft，而不是普通 summary rewrite
- compare scorecard 继续沿用四个维度：
  - `groundedness`
  - `traceability`
  - `guardrail_alignment`
  - `usefulness`
- judge prompt 改为 sandbox rubric，重点审查：
  - simulation label 是否保留
  - quote trace 是否仍可审阅
  - candidate draft 是否越过 non-delegation 边界

## Replay / E2E Baseline

turn replay 与 e2e baseline 必须保留这些可见信号：

- redirect 中能看到 `Reviewed draft sandbox`
- sandbox turn 中能看到 disclaimer 与 trace
- compare results 中能看到 `Workflow: persona draft sandbox`
- judge enabled 时能看到 `Judge verdict`

fixture mode 继续保持 deterministic，保证 unit / e2e 能稳定验证 sandbox flow。

## Acceptance

`Phase 10C` 收口时应满足：

- persona 请求仍不会变成普通 persona answer
- redirect 能在有 evidence 的 scope 中打开 sandbox
- sandbox turn 会明确标注 simulation / non-delegation
- sandbox turn 会展示 quote trace
- compare / judge 能对 sandbox draft 做审阅
- replay 能区分 sandbox draft 与 ordinary answer
