# Phase 10B Quote-Backed Communication Evidence Design

`Phase 10B` 的目标不是让 ForgetMe 开始“模仿某个人怎么说话”，而是先把这件事真正需要的底层补出来：

- 把聊天里的**可追溯原话 / excerpt**
- 变成正式、本地、可审计的 evidence read model
- 再让 `Memory Workspace` 以**直接引用**而不是**代言模仿**的方式，回答“她过去是怎么表达这类事情的”

在 `Phase 10A` 之后，系统已经能在 persona 请求上给出结构化 `boundaryRedirect`。但那层 redirect 目前仍然只能把用户带回：

- grounded summary
- advice next step
- conflicts
- timeline

它还不能真正回答用户最自然的后续需求：

- “那她过去到底是怎么说这类事的？”
- “能给我看她的原话，而不是模仿吗？”

`Phase 10B` 要解决的，就是这一步。

## 为什么 10B 应该先做 Quote-Backed Evidence

如果在 `10A` 之后直接进入 persona / style / voice，会立刻遇到一个根本问题：

- 当前系统没有消息级、语句级、发言者级的正式证据层

也就是说，我们现在最多只能说：

- 这个人和哪些文件相关
- 这个人有哪些 approved facts
- 这个人有哪些 timeline / conflict / review pressure

但我们还不能稳定地回答：

- 这句话是谁说的
- 哪句原话最能代表她的表达方式
- 这些原话来自哪个 chat 文件、在什么顺序位置

所以更稳的路线不是：

- `boundary redirect` -> `persona mode`

而应该是：

- `boundary redirect`
- `quote-backed communication evidence`
- 之后才考虑 reviewed persona draft 或更高风险的 simulation

## 方案比较

### 方案 A：把 excerpt 继续塞进 `file_derivatives`

优点：

- 迁移最小
- 可以复用现有 parsed artifact 写入方式

缺点：

- 读取时必须反复反序列化 JSON
- 很难按 `scope / speaker / topic` 做稳定筛选
- 不适合成为后续 quote / style / communication 层的正式读模型

结论：**适合临时原型，不适合 Phase 10B 基线。**

### 方案 B：新增 `communication_evidence` 读模型

优点：

- 把 excerpt 变成一等本地 evidence
- 能按 speaker、file、ordinal 做稳定读取
- 很自然承接 `Memory Workspace`、replay、后续 quote-backed compare

缺点：

- 需要新 migration
- 导入链路会多一层持久化逻辑

结论：**推荐。**

### 方案 C：直接做完整 message / thread 存储层

优点：

- 最完整
- 后续最灵活

缺点：

- 范围过大
- 会把 `10B` 从“quote evidence”扩成“完整聊天建模”
- 与当前项目节奏不匹配

结论：**现在太重。**

## 推荐方向

`Phase 10B` 推荐采用：

## **chat-first communication evidence baseline**

第一刀只覆盖：

- `chat json`
- `text chat`

先不把 OCR 文档、笔记文档、图片转录一并纳入 quote evidence。

原因很简单：

1. 当前 parser 已经能稳定识别 chat 类文件
2. chat excerpt 最接近“过去如何表达”的用户心智
3. 先把 speaker / excerpt / file trace 这条链打通，比一次性把所有文本来源混进来更稳

## 核心设计

`Phase 10B` 新增一层正式表意为：

- 一个 excerpt 是一条可引用 communication evidence
- 它来自某个 frozen chat file
- 它有稳定顺序 `ordinal`
- 它尽量带 `speakerDisplayName`
- 如果能对上 chat participant anchor，就记录 `speakerAnchorPersonId`

建议的最小 read model 至少包含：

- `communicationEvidenceId`
- `fileId`
- `ordinal`
- `speakerDisplayName`
- `speakerAnchorPersonId`
- `excerptText`
- `createdAt`

这层模型不是“完整聊天数据库”，只是一层**面向证据引用的 excerpt 索引**。

## 导入与持久化

在导入链路里：

1. parser 继续返回 chat summary
2. chat parser 额外返回 lightweight excerpt rows
3. import 阶段在 people anchors 建好之后，把 excerpt 写入 `communication_evidence`
4. 如果 excerpt 的 speaker 能匹配到本文件的 participant anchor，就写入 `speakerAnchorPersonId`

这里不要求复杂的 speaker resolution：

- 只做同文件、同 display name 的确定性匹配
- 匹配不上就保持 `null`

这能让 baseline 保持简单，也避免过早引入不透明 heuristics。

## Memory Workspace 行为

`10B` 不新增新的 ask mode，而是在现有 `Memory Workspace` 上增加一种新的**问题类型识别**：

- quote / communication / expression asks

例如：

- “她过去是怎么表达这类事的？”
- “能给我看她关于归档的原话吗？”
- “这个人平时会怎么措辞？只给直接引用，不要模仿。”

命中这类问题时，`Memory Workspace` 会：

1. 先按当前 scope 读取 communication evidence
2. 用 deterministic 规则筛出最相关的 2 到 3 条 excerpt
3. 返回一个 grounded summary
4. 同时返回结构化 `communicationEvidence` 区块，显示直接引用与来源文件

这里的重点不是“总结出一个人格”，而是“给出直接可检查的原话证据”。

## Redirect 集成

`Phase 10A` 的 `boundaryRedirect` 在 `10B` 之后应当升级一条新的建议动作：

- `Past expressions`

它的含义不是：

- “让我来代替她说”

而是：

- “让我先给你看她过去真正说过的相关表达”

因此 persona 请求在 `10B` 之后的体验会变成：

1. 仍然 blocked
2. 仍然不代言
3. 但现在可以一键跳到 quote-backed follow-up ask

这会让 `Phase 10A` 的 redirect 第一次真正接上“更接近用户真实目的、又仍然安全”的下游能力。

## 读取与排序原则

`10B` 的 excerpt 选择要保持 deterministic-first：

- 优先命中同主题关键词的 excerpt
- 同分时优先更近的 ordinal / 更近的 file
- 最多展示 3 条
- 如果没有足够匹配 excerpt，明确回到 `coverage_gap`

不要在这一阶段做：

- embedding 检索
- provider 总结“语气风格”
- 统计学 style clustering

先把可解释的规则跑通，比“聪明但不透明”的排序更重要。

## Scope 支持

`10B` baseline 推荐支持：

- `person`
- `global`
- `group` 的 best-effort 聚合

其中：

- `person`：优先读取该 canonical person 对应 anchor speakers 的 excerpts
- `global`：从全局 excerpt 中按问题筛选
- `group`：基于现有 group portrait / group membership 拿到相关成员，再聚合 excerpts

如果 group 下证据不足，允许回退到 coverage gap，而不是强行编造“群体表达风格”。

## Phase 10B 验收

- chat imports 会额外落地消息级 excerpt evidence
- `Memory Workspace` 可以回答 quote / communication 类问题
- 回答会展示直接引用和文件来源，而不是只给摘要
- `boundaryRedirect` 在有 communication evidence 时会出现 `Past expressions` 风格的安全替代动作
- replay 能保留并展示历史 quote-backed evidence
- persona request 仍然不会变成 imitation / first-person 输出

## 明确不做

`Phase 10B` 不包括：

- persona / style / voice mode
- OCR 文档 excerpt 的统一接入
- 远端 provider 帮你“总结这个人的表达风格”
- embedding / semantic retrieval
- compare / judge 针对 quote-backed answers 的新专用 rubric
- 自动生成“她最可能会说的话”

## 后续切片

如果 `10B` 跑通，后面更自然的顺序会是：

### Phase 10C：Reviewed persona draft sandbox

届时系统才更有资格尝试：

- 在 quote-backed evidence 之上生成 simulation draft
- 明确标注为非本人代言
- 保留 direct quote trace
- 允许 compare / judge / replay 审计

## 推荐结论

`Phase 10B` 推荐正式命名为：

## **Quote-Backed Communication Evidence / 引用驱动的表达证据层**

推荐立即实施的第一刀：

## **chat-first excerpt baseline**

也就是：

- 先把 chat excerpt 读出来
- 再把 quote-backed ask 接进 `Memory Workspace`
- 最后让 `boundaryRedirect` 第一次能把用户带向“真实原话”，而不是只带向另一句摘要
