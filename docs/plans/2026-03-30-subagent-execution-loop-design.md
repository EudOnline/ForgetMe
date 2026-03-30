# Subagent Execution Loop Design

## Goal

把现有 message-native objective runtime 里的“子 agent”从静态登记对象升级为真实执行闭环：

- 主线程提出局部调查需求
- runtime 创建 subthread
- 子 agent 在 subthread 内接收目标、执行受控工具
- 子 agent 产出结构化 summary / artifact refs
- 结果回灌主线程，供后续 challenge / vote / confirm 使用

本阶段仍然不做 UI，只补后端运行时与持久化。

## Recommended Approach

推荐先做 **单 specialization 的垂直闭环**，也就是先把 `web-verifier` 跑通，而不是一开始做通用调度器。

理由：

- 当前代码已经有 `requestExternalVerification(...)`、`subagentRegistryService`、`agent_message_v2`、`agent_tool_executions`
- 现在缺的不是更多抽象，而是一个真实的 “spawn -> work -> return” 路径
- 先把 `web-verifier` 做成标准样板，后续 `evidence-checker`、`draft-composer` 可以照这个协议扩展

## Execution Model

### Parent thread

主线程继续保留：

- proposal
- subagent spawned checkpoint
- external verification completed checkpoint
- 子 agent 回传的 summary message

主线程只收“关键结论”，不收全部中间抓取细节。

### Subthread

新建一个 `subthread` 作为子 agent 的工作空间，至少包含两个 participant：

- 父角色，例如 `workspace`
- `participantKind = 'subagent'` 的子代理 participant

subthread 消息流最小为：

1. `goal`
   - 父角色告诉子 agent 要核实什么 claim / query
2. `tool_result`
   - 搜索结果摘要
3. `tool_result`
   - 页面打开与提取摘要
4. `tool_result`
   - citation bundle 结果
5. `final_response`
   - 子 agent 对 subthread 的最终结论

### Return to parent

subthread 完成后，runtime 再向 parent thread 写一条 `evidence_response`：

- `fromParticipantId = subagentId`
- 附带 citation refs
- 正文是压缩后的 summary

这样父线程里其他 role agent 能直接对“子 agent 产出”做 challenge，而不是只能对 runtime 的黑盒总结做 challenge。

## Persistence Changes

需要补两个更新 API：

- `updateThreadStatus(...)`
- `updateSubagent(...)`

完成时：

- subthread status -> `completed`
- subagent status -> `completed`
- subagent summary -> final summary
- `completedAt` 持久化

## Scope Limits

本阶段故意不做：

- 通用多 specialization 调度器
- 多轮 agent receive/respond 回合控制
- 子 agent 自主再生成孙代理
- 失败重试与复杂恢复策略

## Test Targets

至少补一个核心单测，验证：

- `requestExternalVerification(...)` 创建的 subagent 绑定的是 subthread，不再是主线程
- subthread 含 parent role + subagent participant
- subthread 内存在 `goal -> tool_result -> final_response`
- parent thread 收到 `evidence_response`
- subagent 与 subthread 最终都处于 `completed`
