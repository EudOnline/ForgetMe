# Generic Subagent Proposal Execution Design

## Goal

在已有 `web-verifier` 子线程闭环的基础上，把“子代理执行”提升成一个通用 proposal 路径：

- agent 在主线程中提出 `spawn_subagent` proposal
- proposal 经过 owner / governance / operator gate
- proposal 一旦进入可执行状态，就由 runtime 分派到对应 specialization runner
- runner 创建 subthread、执行工具、回灌主线程 summary

本阶段仍然只做后端，不做 UI。

## Recommended Scope

先把“通用入口 + 单个 specialization runner”做出来：

- 通用入口：`spawn_subagent`
- 首个 specialization：`web-verifier`

这样我们得到：

- 一个真实的通用 proposal 触发点
- 一套可扩展的 runner registry
- 不需要一次性实现所有 specialization

## Trigger Point

`spawn_subagent` proposal 的执行应发生在 proposal 被 runtime 视为最终允许执行时。

优先支持两种状态：

- `committed`
- `committable` 且该 proposal 不要求 operator confirmation

运行时不应让 `spawn_subagent` 长时间停在“理论上可执行但没有副作用”的状态。

## Architecture

### Proposal executor

在 `objectiveRuntimeService` 内增加一个小的 proposal executor：

- 输入：`AgentProposalRecord`
- 判断是否是 `spawn_subagent`
- 根据 `payload.specialization` 选择 runner
- 执行成功后把 proposal 最终状态落为 `committed`

### Runner registry

先只放一项：

- `web-verifier`

后续再扩：

- `evidence-checker`
- `draft-composer`
- `compare-analyst`

### Payload contract

`spawn_subagent` 的通用 payload 继续包含：

- `specialization`
- `skillPackIds`
- `expectedOutputSchema`

对 `web-verifier` runner，再额外读取：

- `claim`
- `query`

这两个字段先保持运行时校验，不强行上升到共享 schema 的 specialization union。

## Refactor direction

把当前 `requestExternalVerification(...)` 的子线程逻辑抽成可复用 helper，例如：

- `runWebVerifierSubagent(...)`

这样两条路径都能复用：

1. 专用快捷入口 `requestExternalVerification(...)`
2. 通用 `spawn_subagent` proposal 执行

## Testing

补一个核心单测：

- 创建 `spawn_subagent` proposal
- payload 指向 `web-verifier`
- owner approve
- operator confirm
- runtime 自动执行 runner
- 断言：
  - proposal 最终 `committed`
  - objective/subthread 中出现 subagent
  - subthread 有 `goal/tool_result/final_response`
  - 主线程有 `evidence_response`

## Deferred

- specialization-specific shared schemas
- 多 specialization runner registry
- 非 operator proposal 的自动提交策略统一化
- 失败重试和幂等执行保护
