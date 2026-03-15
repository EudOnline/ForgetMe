# Phase 10 Persona Boundary Redirect Design

`Phase 10` 的目标不是立刻让 ForgetMe 进入“像某个人回答”的 persona 模式，而是先把当前已经存在的 `persona_request -> fallback_unsupported_request` 边界，升级成一个**更可用、更可审计、更不让用户撞墙**的安全引导层。

在 `Phase 9A/9B` 之后，产品已经具备了：

- `grounded / advice` 两种表达模式
- guardrail 决策与 replay 审计
- compare / judge / matrix 对 advice 输出的审阅能力

但当用户真正开始问“如果她本人会怎么说”“请模仿她的口吻”这类问题时，系统现在仍然只会给出一个比较生硬的拒答 fallback。这个行为是安全的，但还不够产品化。

`Phase 10` 要解决的，就是这段体验空白。

## 为什么这一阶段先不直接做 Persona Mode

如果现在直接进入 persona / style / voice 模式，会同时踩中三个风险：

1. 用户会天然把输出理解成“她本人可能真的会这么说”
2. 当前档案层仍然没有消息级、风格级、委托级的正式证据模型
3. 一旦把输出从“建议”推进到“代言”，错误的心理强度会明显升高

所以这里更稳的顺序不是：

- `Advice Mode` -> 直接 `Persona Mode`

而应该是：

- `Advice Mode`
- `Persona Boundary Redirect`
- 后续如有必要，再进入更高风险、更多审计约束的 persona/style/voice 设计

## 方案比较

### 方案 A：直接新增 `persona` expression mode

优点：

- 用户感知最强
- 路线最像“个人 agent”

缺点：

- 风险最高
- 需要新的边界判断、委托语义和更强的风格证据层
- 很容易把当前 archive-grounded answer 误读成“代本人发言”

结论：**现在不推荐。**

### 方案 B：做 review-first persona draft workbench

优点：

- 安全性比直接 persona mode 高
- 可以把高风险输出先变成待审草稿

缺点：

- 交互重
- 会把项目从 `Memory Workspace` 拉向新的 review pipeline
- 对当前阶段来说实现成本偏大

结论：**可以作为更后的高风险 slice。**

### 方案 C：做 `Persona Boundary Redirect` 基线

优点：

- 完全复用现有 deterministic context assembly 与 guardrail
- 不新增“代言式输出”
- 把 unsupported request 从“硬拒绝”升级成“有替代路径的安全引导”
- 为后续 style/persona 层预留统一入口

缺点：

- 不会立刻给出“像她本人说话”的强体验
- 更偏向边界设计与 UX 产品化

结论：**推荐作为 Phase 10 第一刀。**

## 核心设计

当用户提出 persona / style / “如果她本人会怎么说” 类问题时，`Memory Workspace` 仍然保持原有 guardrail 决策：

- `guardrail.decision = fallback_unsupported_request`

但 response 不再只有一句 fallback 文案，而是增加一个结构化的 `boundaryRedirect` 区块，用来表达：

- 为什么这个请求不能直接回答
- 当前还能安全提供哪些替代帮助
- 哪些替代问题可以一键继续 ask

这个 redirect 必须满足两个原则：

1. **不新增事实来源**
2. **不暗示系统已经知道“她本人会怎么说”**

换句话说，它是“引导用户回到 grounded archive 能承担的范围内”，不是“伪装成一种比较温和的 persona mode”。

## 推荐的 Redirect 结构

`boundaryRedirect` 建议至少包含：

- `kind`
  - 当前 baseline 只支持 `persona_request`
- `title`
  - 例如：`Persona request blocked`
- `message`
  - 清楚说明为什么系统不能代 archived person 发言
- `reasons`
  - 例如：
    - `persona_request`
    - `delegation_not_allowed`
    - `style_evidence_unavailable`
- `suggestedAsks`
  - 2 到 4 条 deterministic 派生的安全替代问法

这些 `suggestedAsks` 不是自由生成，而是由当前 scope、question、context cards、guardrail state 规则化地产生，例如：

- `Grounded summary`
  - “先基于档案总结她当前最明确的状态”
- `Advice next step`
  - “基于档案，现在最安全的下一步是什么？”
- `Open conflicts`
  - “她现在有哪些未解决冲突？”
- `Recent timeline`
  - “她最近最相关的时间线窗口是什么？”

## 产品行为

用户体验上，`Phase 10A` 应该表现为：

1. 用户输入 persona 风格问题
2. 系统返回原有 guardrail fallback
3. 同时显示一个 `Boundary redirect` 面板
4. 面板内给出安全替代动作按钮
5. 用户点击其中一个按钮后，直接在当前 scope、当前 session 里继续 ask

这让系统从“不能做”变成“不能那样做，但我可以这样帮你”。

## 架构原则

1. 继续复用 `askMemoryWorkspace(...)` 的 deterministic context assembly
2. 继续复用现有 `guardrail`，不新增第二套安全判定器
3. `boundaryRedirect` 是 response metadata，不是真相层、也不是 compare truth source
4. redirect suggestions 必须 deterministic，可 replay，可审计
5. session persistence 必须保留 redirect payload，确保历史 turn 能说明当时为什么被拦下、又推荐了什么替代路径

## Phase 10A 验收

- persona/style 请求仍然不会变成 first-person 或 imitation 输出
- unsupported request 响应新增 `Boundary redirect` 面板
- redirect 至少给出 2 条安全替代问法
- 点击替代动作后，会在当前 session 中继续 ask
- replay 里可以看到历史 turn 的 redirect 内容
- grounded / advice 的正常 ask、compare、matrix 行为不回归

## 明确不做

`Phase 10A` 不包括：

- `persona` expression mode
- first-person 代言式回答
- style transfer / tone cloning
- voice synthesis
- compare / matrix 对 persona request 的新评分维度
- 自动推断“她最可能会说的句子”

## 后续切片

如果 `Phase 10A` 跑通，后续更自然的延伸会是：

### Phase 10B：Quote-backed communication evidence

前提是先补消息级/语句级可追溯证据层，再去展示“她过去如何表达某类主题”的直接证据，而不是让模型先模仿。

### Phase 10C：Reviewed persona draft sandbox

如果未来真的要做更强的 persona 输出，更合理的路径应该是：

- 先生成 draft
- 明确标注为 simulation
- 保留 evidence trace
- 在 compare / judge / replay 里可审计

而不是直接把 persona mode 当成普通 ask mode 对外开放。

## 推荐结论

`Phase 10` 推荐正式命名为：

## **Persona Boundary Redirect / 人格请求安全引导层**

推荐立即实施的第一刀：

## **Phase 10A：Persona Boundary Redirect Baseline**

它不会直接让 ForgetMe “像某个人说话”，但会让系统第一次真正以产品化方式回答：

- 为什么不能代言
- 当前还能怎么安全地帮你
- 以及下一步最值得点的入口是什么
