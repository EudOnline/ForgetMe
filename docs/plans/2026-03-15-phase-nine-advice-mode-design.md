# Phase 9A Advice Mode Design

`Phase 9A` 的目标不是让 ForgetMe “像某个人说话”，而是在现有 `Memory Workspace` 之上增加一种新的**表达模式**：`Advice Mode`。

这层能力仍然必须完全受 `Phase 8` 的证据装配、引用链路、冲突提示与覆盖缺口约束。换句话说，它改变的是**答案怎么表达**，不是**答案从哪里来**。

## 设计边界

- `Advice Mode` 可以说：
  - “基于档案，目前最安全的下一步是……”
  - “从现有证据看，建议优先关注……”
  - “仍存在这些未解决的不确定性……”
- `Advice Mode` 不可以说：
  - “如果我是她，我会……”
  - “她本人一定会建议你……”
  - 任何模仿本人语气、人格、口吻、价值观的代言式输出

## 架构原则

1. 沿用现有 `Memory Workspace` deterministic context assembly
2. 沿用现有 `guardrail` 决策，不新增第二套安全判断
3. `advice` 只是 `expressionMode`，不是新的事实层
4. replay / session persistence 必须保留 mode，确保可审计

## Phase 9A 验收

- ask form 可切换 `Grounded / Advice`
- advice mode 响应会显示 `Mode: advice`
- conflict / low coverage / persona 请求仍按原 guardrail 降级
- replay 中能看出历史 turn 使用了哪种 mode
- 不引入 persona / style / voice 行为

## Phase 9B 延伸

`Phase 9B` 把同一个 `expressionMode` 扩展到 compare / judge / matrix 流程里。

- compare session 会记录 `expressionMode`
- matrix summary 会记录 `expressionMode`
- compare judge 继续以 groundedness 为主，但会明确自己在评审 `grounded advice`
- compare / matrix 仍然不进入 persona 扮演，只允许审阅 advice 表达是否忠于档案
