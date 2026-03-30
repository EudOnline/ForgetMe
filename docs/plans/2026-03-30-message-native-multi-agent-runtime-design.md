# Message-Native Multi-Agent Runtime Design

一句话定义：**ForgetMe 的下一代 agent runtime 不再是“单跳编排 + 单 agent 执行器”，而是一个以 `objective / thread / message / proposal` 为核心、支持 agent 间来回协商、支持受控子代理与技能包、默认只展示关键节点摘要的 deliberative runtime。**

---

## 一、为什么要换掉当前 runtime 心智

截至 2026-03-30，ForgetMe 已经拥有一个可工作的五角色 agent runtime：

- `orchestrator`
- `ingestion`
- `review`
- `workspace`
- `governance`

当前版本已经具备：

- 角色级 task routing
- run / message / memory / policy 持久化
- proactive suggestions 与 guided autonomy
- `Agent Console` 入口
- 与现有 review / workspace / publication / compare 流程的连接

这些能力对“agent 工具台”已经足够有价值，但它仍然有一个根本限制：

> 它本质上还是“选一个角色去执行一次任务”，不是“多个 agent 先协商，再形成动作提案，再决定是否提交”。

当前 runtime 的主链路仍然是：

1. 用户提交 prompt
2. `orchestrator` 基于规则推断 `taskKind` / `targetRole`
3. runtime 找到一个 adapter
4. adapter 单次 `execute(...)`
5. 返回最终消息

这条链路的问题不是“不够智能”，而是**运行时模型本身太窄**：

- agent 之间不能持续互相发消息
- 没有线程与回合的概念
- 没有“质疑、补证据、投票、否决、收敛”的正式机制
- 没有子代理模型
- 没有技能包与工具授权边界
- 联网核验无法成为受控的一等能力

如果 ForgetMe 的目标是：

- 让 `review`、`workspace`、`governance`、`ingestion` 真正形成会商
- 让一些问题能自动拉起“核验型”子代理去上网查证或做局部调查
- 让系统输出的是“关键决策节点摘要”，而不是一大串内部聊天

那么现有 runtime 不适合继续增量打补丁，而应该**直接切换到 message-native 的 deliberation model**。

---

## 二、目标与非目标

## 2.1 目标

本设计要实现的目标是：

1. 让常驻角色 agent 可以在共享线程里来回对话，而不是单次委派
2. 让 agent 能在协商过程中生成有边界的子代理
3. 让子代理可以带着特定技能包去完成局部任务
4. 让搜索、上网核验、读取外部来源成为受控的一等能力
5. 让所有会影响系统状态的行为都通过 `proposal -> review -> commit gate`
6. 让 UI 默认只展示关键节点摘要，而不是完整内部对话
7. 让 ForgetMe 继续保持现有的 review boundary、auditability 和 local-first 哲学

## 2.2 非目标

本设计不尝试在第一阶段解决：

- 完全自由的 agent 社会模拟
- 无限层级子代理递归生成
- 没有 schema 约束的自由联网浏览
- 让外部搜索结果自动写入 formal truth tables
- 让高风险审批进入完全自治模式
- 把整个产品改造成纯聊天壳
- 在第一阶段兼容现有 run-centric runtime 的所有模型

本设计明确选择：

> **不做兼容性优先，而做模型正确性优先。**

---

## 三、设计原则

## 3.1 协商优先，执行其次

系统的默认路径不再是“谁先拿到 prompt 谁先执行”，而是：

- 先围绕 objective 协商
- 再形成结构化 proposal
- 最后进入 commit gate

## 3.2 共享线程是真实的一等对象

agent 间消息不是日志副产物，而是 runtime 的主数据。所有重要判断都必须能回到某条 message、某个 challenge、某个 tool result、某个 veto。

## 3.3 关键节点摘要是默认视图

用户默认看见的是：

- 系统理解了什么目标
- 哪些 agent 参与了
- 哪些证据缺口被发现
- 哪些工具被调用了
- 哪个 proposal 被提出、质疑、批准、阻止
- 最终为什么执行或为什么没有执行

完整内部消息保留用于审计和调试，但不是默认主视图。

## 3.4 子代理必须有边界

子代理可以被生成，但必须带有：

- 明确任务
- 明确预算
- 明确技能包
- 明确工具白名单
- 明确回传 schema
- 明确生命周期

## 3.5 工具与网络权限不直接挂在 agent 身上

agent 只能提出 `tool_request` 或 `spawn_subagent_request`。真正的执行由 broker 决定是否授权。

## 3.6 Archive truth 继续高于 agent 结论

ForgetMe 现有的 truth/read model、review queue、decision journal、provider boundary、Memory Workspace guardrail 都继续保留为更高优先级的约束。

---

## 四、核心运行时心智

新的 runtime 以四个一等实体为中心：

- `objective`
- `thread`
- `message`
- `proposal`

可以把它理解成：

> 用户或系统提出一个 objective。  
> runtime 为这个 objective 打开主线程。  
> 多个常驻角色 agent 进入线程协商。  
> 有需要时拉起带技能包的子代理去做局部调查。  
> 子代理和工具结果回到线程后，形成 proposal。  
> proposal 经过 owner、governance、必要时 operator 的 gate，最终决定 commit / block / escalate。

对应的系统形态不再是“编排器 + adapter”，而是：

```text
objective
  -> main thread
      -> role agents deliberate
      -> subthreads spawn when needed
      -> tool broker / verification broker executes authorized work
      -> proposal graph evolves
      -> checkpoint summaries are emitted
      -> commit or block
```

---

## 五、角色模型

## 5.1 常驻角色 agent

第一版保留五个常驻角色，但重新定义它们的运行时责任。

### `facilitator`

替代当前 `orchestrator` 的旧定位，但不再负责“猜完就派发”。它的职责是：

- 接收 operator / system objective
- 创建主线程
- 邀请应参与的角色 agent
- 控制 deliberation rounds
- 检测缺失回应、超时、僵局和收敛
- 生成关键节点 checkpoint

它**不拥有业务真值权**，也不应偷偷替 `review` 或 `governance` 做最终决定。

### `review`

负责涉及 formal truth mutation 的判断：

- review item approve / reject
- safe group apply
- 审核相关 proposal 的 domain ownership

它是 truth-changing action 的主要 owner。

### `ingestion`

负责证据补充与输入侧调查：

- rerun enrichment
- 读取 document evidence
- 汇总 OCR / evidence trace
- 做局部证据质量说明

它不能直接批准 review action，但可以提出“先补证据”的 challenge 或 proposal。

### `workspace`

负责用户可见结果的组装：

- grounded response
- compare outcome interpretation
- reviewed draft sandbox composition
- publication-oriented output packaging

它可以提议需要上网核验，也可以提议生成草稿，但不能越权直接修改正式 truth。

### `governance`

负责：

- 风险解释
- policy alignment
- 自动执行资格判断
- veto 权
- 外部核验与外发动作的边界约束

它不是“看热闹的记录员”，而是会商中的正式权力角色。

## 5.2 子代理

子代理不是新业务角色，而是被常驻角色临时生成的任务工人。它们的基本属性：

- 只在某个 thread / subthread 内存在
- 有且只有一个父 agent
- 只负责一个狭窄目标
- 必须绑定技能包
- 必须绑定工具白名单
- 有预算和超时
- 结束后自动收束，不保留长期人格身份

第一版建议只允许**一层子代理**，不允许“子代理继续生成子代理”，除非后续阶段单独设计。

---

## 六、线程模型

## 6.1 Objective

`objective` 是整个 deliberation 的根对象。它可以来自：

- operator 手动发起
- system 主动触发
- 某个已有 objective 的后续升级

一个 objective 应至少包含：

- 用户目标的稳定标题
- 发起方
- 当前状态
- 当前风险级别
- 是否需要 operator 继续参与
- 与之关联的主线程

## 6.2 Main Thread

每个 objective 至少有一个 `main thread`。主线程承载：

- 目标定义
- 常驻角色 agent 之间的公开消息
- proposal 生命周期
- 关键节点 checkpoint

主线程不应被原始调查细节淹没。主线程里更适合放：

- challenge 结论
- tool result 摘要
- proposal 状态变更
- veto / approval
- user-facing outcome

## 6.3 Subthread

当主线程中出现局部调查需求时，可以生成 `subthread`。典型场景包括：

- 某条 external claim 需要上网核验
- 某个 candidate 需要补看 evidence trace
- 某个 draft 需要局部重写后再回来会审

subthread 的目标是：

- 局部化复杂度
- 避免主线程过载
- 给子代理一个可控的工作空间

subthread 结束后必须向主线程返回：

- 一个结构化 summary
- 一个或多个 artifact refs
- 必要时一个更新后的 proposal

---

## 七、消息协议

## 7.1 Message 是正式运行时对象

消息必须结构化，并支持 reply、round、refs、blocking 等字段。建议的基础类型如下：

```ts
type AgentMessage = {
  messageId: string
  objectiveId: string
  threadId: string
  from: AgentIdentity
  to: AgentRecipient
  kind:
    | 'goal'
    | 'stance'
    | 'question'
    | 'challenge'
    | 'proposal'
    | 'evidence_request'
    | 'evidence_response'
    | 'tool_request'
    | 'tool_result'
    | 'risk_notice'
    | 'vote'
    | 'veto'
    | 'decision'
    | 'final_response'
  body: string
  refs: AgentArtifactRef[]
  replyToMessageId: string | null
  round: number
  confidence: number | null
  blocking: boolean
  createdAt: string
}
```

其中：

- `kind` 决定消息在 runtime 中的语义
- `blocking = true` 表示此消息会阻断 proposal 收敛
- `refs` 让消息和 review item、file、compare session、policy version 等工件绑定
- `round` 用于调度与僵局分析

## 7.2 Artifact 引用

任何消息、proposal、tool result 都不应再依赖自由文本去“猜 ID”。建议引入统一的 `AgentArtifactRef`：

```ts
type AgentArtifactRef = {
  kind:
    | 'review_queue_item'
    | 'review_group'
    | 'file'
    | 'enrichment_job'
    | 'workspace_turn'
    | 'compare_session'
    | 'policy_version'
    | 'memory_record'
    | 'external_citation_bundle'
  id: string
  label: string
}
```

这会直接替代目前 adapter 和 follow-up 逻辑里大量依赖 prompt regex 提取 id 的模式。

---

## 八、Proposal 模型

## 8.1 Proposal 取代“直接执行”

凡是涉及：

- review write
- evidence-affecting tool action
- external verification
- draft generation
- publication or outbound behavior

都应优先收敛为 `proposal`，而不是某个 agent 直接把工具调用执行掉。

建议的 proposal 类型：

```ts
type AgentProposal = {
  proposalId: string
  objectiveId: string
  threadId: string
  proposedBy: AgentIdentity
  proposalKind:
    | 'approve_review_item'
    | 'reject_review_item'
    | 'approve_safe_group'
    | 'rerun_enrichment'
    | 'ask_memory_workspace'
    | 'run_compare'
    | 'spawn_subagent'
    | 'search_web'
    | 'verify_external_claim'
    | 'compose_reviewed_draft'
    | 'publish_draft'
    | 'create_policy_draft'
    | 'respond_to_user'
  payload: Record<string, unknown>
  ownerRole: AgentRole
  status:
    | 'open'
    | 'under_review'
    | 'challenged'
    | 'approved'
    | 'vetoed'
    | 'committable'
    | 'awaiting_operator'
    | 'committed'
    | 'blocked'
    | 'superseded'
  requiredApprovals: AgentRole[]
  allowVetoBy: AgentRole[]
  requiresOperatorConfirmation: boolean
  derivedFromMessageIds: string[]
  artifactRefs: AgentArtifactRef[]
  createdAt: string
  updatedAt: string
}
```

## 8.2 Proposal 默认规则

第一版建议固定这些默认 gate：

- truth mutation
  - `review` 必须 approval
  - `governance` 不得 veto
  - 默认需要 operator confirmation
- evidence补充类工具动作
  - owner agent approval 即可
  - `governance` 可在策略层阻断
- 用户回复生成
  - `workspace` 为 owner
  - 若涉及 persona / publication / external claim，需要 governance 风险放行
- 外部搜索与网页核验
  - 必须先以 proposal 形式进入 broker，不允许 agent 自由联网

---

## 九、技能包与子代理模板

## 9.1 技能包定义

技能包不是简单 prompt fragment，而是运行时能力组合。每个技能包至少由三部分组成：

- `prompt contract`
- `tool whitelist`
- `output schema`

技能包的作用是让子代理的行为：

- 有明确边界
- 能被审计
- 能被稳定解析
- 能被 broker 授权

## 9.2 第一版子代理模板

建议第一版只做以下五个模板：

### `web-verifier`

用途：

- 上网搜索
- 打开来源页面
- 比较多个来源是否一致
- 提取 citation bundle

技能包：

- search
- source compare
- claim extraction
- citation packaging

### `evidence-checker`

用途：

- 查 document evidence
- 汇总 OCR 结果
- 做 evidence trace
- 对 candidate 溯源

### `policy-auditor`

用途：

- 检查 proposal 是否踩 policy
- 比较策略差异
- 给 governance 输出 veto / allow 理由

### `draft-composer`

用途：

- 基于已批准材料做 grounded summary
- 基于已批准 communication evidence 生成 reviewed draft sandbox

### `compare-analyst`

用途：

- 解释 `Memory Workspace Compare`
- 汇总 compare runs / judge verdict
- 形成更适合进入主线程的简洁判断

## 9.3 子代理 contract

每个子代理在生成时必须记录：

- `specialization`
- `skillPackIds`
- `toolPolicyId`
- `budget`
- `expectedOutputSchema`
- `parentAgentRole`
- `parentThreadId`

子代理完成后不能只回一段自由文本，而必须回：

- summary
- verdict / result object
- artifact refs
- optional updated proposal

---

## 十、工具层与 Broker

## 10.1 Tool Broker

agent 与子代理都不直接持有工具执行权。它们只能发起：

- `tool_request`
- `spawn_subagent_request`

真正的执行由 `Tool Broker` 决定是否允许。

Broker 负责检查：

- 请求方身份
- 当前 thread / proposal 上下文
- skill pack 白名单
- tool policy
- 剩余预算
- 是否需要 governance clearance

## 10.2 External Verification Broker

联网与搜索能力单独走一个 `External Verification Broker`，而不是挂在通用工具层里混用。

第一版建议支持：

- `search_web`
- `open_source_page`
- `extract_claims`
- `cross_source_compare`
- `capture_citation_bundle`

所有结果必须带 provenance：

- `url`
- `title`
- `retrievedAt`
- `publishedAt`
- `excerpt`
- `reliabilityLabel`

## 10.3 现有 ForgetMe 工具面如何接入

现有 authoritative domain services 不需要消失，而是应被 broker 包装成工具面，例如：

- review tools
  - `approveReviewItem`
  - `approveSafeReviewGroup`
  - `rejectReviewItem`
- workspace tools
  - `askMemoryWorkspacePersisted`
  - `runMemoryWorkspaceCompare`
  - `publishApprovedPersonaDraft`
- ingestion tools
  - `rerunEnrichmentJob`
  - `getDocumentEvidence`
- governance / policy tools
  - `recordMemory`
  - `proposePolicyVersion`

区别在于：调用它们前必须先经过 proposal 或 broker gate。

---

## 十一、联网搜索与外部核验规则

## 11.1 外部来源是辅证，不是新的 truth source

ForgetMe 的正式 truth source 仍然是：

- archive evidence
- approved read models
- review queue / decision journal
- Memory Workspace 内部的 guardrail-constrained 结果

外部搜索结果可以：

- 影响 proposal
- 影响 user-facing response
- 触发 governance 风险提示

但不能：

- 静默写入 formal fact tables
- 自动覆盖 archive truth

## 11.2 网络访问的默认限制

默认规则建议如下：

- 常驻 agent 不能直接联网
- 必须通过子代理 + broker 才能联网
- 任何联网结果都必须附 citation bundle
- 任何联网结果默认不写入长期 memory
- 若外部核验影响 high-risk write proposal，必须显式提示 operator

## 11.3 外部核验结果结构

建议统一外部核验结果 schema：

```ts
type WebVerificationResult = {
  claim: string
  verdict: 'supported' | 'partially_supported' | 'conflicted' | 'not_found'
  sources: Array<{
    title: string
    url: string
    publishedAt: string | null
    extractedFact: string
    reliabilityLabel: 'official' | 'primary' | 'secondary' | 'community' | 'unknown'
  }>
  rationale: string
  confidence: number
}
```

这样主线程里出现的是：

- “2 个 official / primary 来源支持”
- “1 个来源冲突，governance 要求人工确认”

而不是一段无法程序化使用的长文本。

---

## 十二、调度与收敛机制

## 12.1 调度模型

runtime 采用 `round-based scheduler + event-driven wakeup` 混合模型：

- 新 objective 创建时开始调度
- 新消息、tool result、proposal 状态变化时唤醒线程
- 无新事件时不空转

## 12.2 预算控制

每个 objective 应至少有：

- `maxRounds`
- `maxMessages`
- `maxToolCalls`
- `maxSubagents`
- `timeoutMs`

每个子代理也有自己的局部预算。

## 12.3 僵局检测

当满足以下情况时，objective 可被标记为 `stalled`：

- 连续多轮没有新 evidence、没有新 tool result、没有 proposal 状态跃迁
- 相同 challenge 被重复提出且无人补证
- 子线程反复失败且无新策略变化

一旦 `stalled`：

- facilitator 生成 checkpoint
- objective 升级为 `needs_operator_input` 或 `blocked_by_policy`

## 12.4 收敛条件

一个 proposal 可以进入 `committable` 的条件是：

- owner role 已 approval
- 没有未处理的 blocking challenge
- governance 未 veto
- 预算未超限
- 若需要 operator confirmation，则转入 `awaiting_operator`

---

## 十三、关键节点摘要与 UI

## 13.1 默认 UI 目标

新的前台页面不应继续是“prompt + role + history”的模型，而应改成 `Objective Workbench`。

默认只展示关键节点摘要，不展示完整内部对话。

## 13.2 关键节点类型

建议第一版默认展示这些节点：

- `Goal accepted`
- `Participants invited`
- `Evidence gap detected`
- `Subagent spawned`
- `Tool action executed`
- `External verification completed`
- `Proposal raised`
- `Challenge raised`
- `Veto issued`
- `Consensus reached`
- `Awaiting operator confirmation`
- `Committed`
- `Blocked`
- `User-facing result prepared`

## 13.3 页面信息架构

建议页面布局：

- 左侧：objective inbox
- 中间：关键节点时间线
- 右侧：agent stance panel
- 底部或侧抽屉：open proposals / approvals / veto / operator actions

### Agent stance panel 默认显示：

- 当前 stance
- confidence
- blocker
- 最近一次 challenge
- 最近一次 proposal
- 是否拥有 owner / veto 权

### 完整消息流：

- 默认折叠
- 仅在调试或审计时展开

---

## 十四、持久化模型

## 14.1 建议新表

建议直接按 message-native runtime 设计新的持久化层：

- `agent_objectives`
- `agent_threads`
- `agent_thread_participants`
- `agent_messages`
- `agent_proposals`
- `agent_votes`
- `agent_tool_executions`
- `agent_checkpoints`
- `agent_role_state`
- `agent_policies`
- `agent_memories`
- `agent_subagents`

## 14.2 Memory 分层

建议把 memory 分成四层：

### `authoritative memory`

实际就是现有 archive/read model，不允许 agent 随意写入。

### `operational memory`

用于记录 agent 的工作经验、失败模式、偏好和策略注记，可由 governance 控制沉淀。

### `thread memory`

某个 objective / thread 范围内的工作上下文。

### `ephemeral scratchpad`

单回合临时思考空间，不必持久化。

---

## 十五、与现有系统的关系

## 15.1 保留的东西

这个设计并不是否定 ForgetMe 现有积木，而是要重新连接它们。

应保留并继续复用：

- review queue / decision journal
- Memory Workspace guardrail / compare / sandbox
- provider boundary
- publication / share / send
- audit log 与现有 authoritative service 层

## 15.2 替换的东西

需要被替换的不是业务域服务，而是当前 agent runtime 的核心心智：

- 用 `facilitator` 替代现有单跳 `orchestrator`
- 用 message bus 替代单次 `adapter.execute()`
- 用 proposal / vote / veto 替代直接执行
- 用 checkpoint summary 替代默认展示全量 run replay
- 用 thread-centric persistence 替代 run-centric persistence

---

## 十六、第一版范围

## 16.1 第一版必须做

第一版建议只做最小但闭环的多 agent 协商版本：

- 新的 `objective / thread / message / proposal` runtime
- 五个常驻角色 agent 的主线程协商
- 一层子代理
- 三个核心 skill packs
  - `web-verifier`
  - `evidence-checker`
  - `draft-composer`
- Tool Broker
- External Verification Broker
- 关键节点摘要 UI
- proposal commit gate
- operator confirmation gate

## 16.2 第一版坚决不做

- 无限层子代理
- 自由 agent mesh 无主持调度
- 外部搜索结果自动入库
- fully autonomous high-risk review execution
- 全产品 chat shell 化

## 16.3 第一版验收场景

建议用以下三个 objective 做验收：

1. “这组 safe group 能不能批”
2. “这个外部事实要不要纳入回复”
3. “生成一版 grounded / reviewed draft 前需不需要补证据或联网核验”

如果这三条跑通，就说明 runtime 的最小 deliberation 骨架已经成立。

---

## 十七、最终推荐结论

ForgetMe 的下一代 agent 路线，不应该继续向“更聪明的单跳 orchestrator”演化，而应该切换到：

> **一个可审计、可阻断、可生成子代理、可带技能包、可受控联网核验、默认只展示关键节点摘要的 deliberative multi-agent runtime。**

这条路线最适合 ForgetMe 的原因不是它“更炫”，而是它更贴合 ForgetMe 的本质：

- 证据经常不完整
- 风险层级明确
- 某些动作必须 review-gated
- 某些问题必须先核验再回答
- 用户最终需要的是“为什么这么做”的清晰轨迹，而不是内部推理噪音

因此，ForgetMe 更适合的不是通用大脑，也不是传统编排器，而是：

> **以协商为主、以 proposal 为门、以 checkpoint 为默认视图、以技能子代理完成局部调查的消息原生 runtime。**
