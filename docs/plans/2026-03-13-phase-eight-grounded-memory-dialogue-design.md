# Phase 8 Grounded Memory Dialogue Design

一句话定义：**Phase 8 要做的是把 ForgetMe 从“可阅读的私人档案库”推进成“可对话的记忆操作层”，但所有回答都必须继续被证据、档案读模型和审核边界约束。**

---

## 一、当前项目到了哪里

截至 2026-03-13，这个项目已经完成了从资料冻结、结构化理解、自动运行、审核工作台、保全恢复，到人物档案 / 群体画像阅读层的主干建设：

- `Phase 1`：本地导入、原件冻结、批次浏览、搜索
- `Phase 2`：人物、时间线、关系图谱、事件聚类、审核与撤销基础
- `Phase 3`：多模态证据增强，支持 OCR / 图像理解 / 结构化候选
- `Phase 4`：运行器、归属、正式资料投影
- `Phase 5`：单条审核工作台深化
- `Phase 6`：保全、导出恢复、外发边界、people inbox、冲突连续审核、批量审批与回放
- `Phase 7`：人物 dossier 与 group portrait 的稳定读模型

也就是说，ForgetMe 现在已经能：

- 安全收下资料
- 形成可审核的结构化事实
- 保持可撤销、可追溯
- 把一个人 / 一群人稳定地“读出来”

**但它还不能自然地“跟你一起使用这些记忆”。**

这正是 `Phase 8` 应该解决的问题。

---

## 二、为什么 Phase 8 不应该直接跳到“人格 Agent”

从产品终局看，“还原一个人的说话、建议、作风，甚至形成独立 agent”当然是大方向。

但在当前时间点，直接进入“人格模拟 / 代言式回答”会有三个问题：

1. **可信度不够稳**
   - 虽然 Phase 7 已经有 dossier 和 portrait，但还没有一层专门的“对话时证据装配、引用、边界提示、冲突表达”机制。
   - 直接做人设对话，很容易把未审核推断、覆盖不足、开放冲突扁平化成“像真的一样”的回答。

2. **产品形态会过早承诺**
   - 一旦 UI 上出现“像某个人一样说话”，用户会自然地把它理解成“可替代本人”。
   - 这比当前产品真实能力前进得更快，也会放大错答、过拟合和伦理风险。

3. **现有积木其实更适合先做“可对话的档案层”**
   - 我们已经有：`PersonDossier`、`GroupPortrait`、`DocumentEvidence`、`Review Queue`、`Decision Journal`
   - 这些非常适合先变成一个 **evidence-grounded archive chat / memory workspace**

所以我的推荐是：

> **Phase 8 先定义为“Grounded Memory Dialogue / 证据驱动的记忆对话层”，而不是“Persona Simulation / 人格模拟层”。**

这不是保守，而是为了让后面的 persona / agent 更可信。

---

## 三、Phase 8 的三个候选方向

### 方案 A：Grounded Memory Dialogue（推荐）

做一个可以围绕“某个人 / 某个群体 / 整个档案库”提问的对话层。

它的回答不是自由发挥，而是建立在：

- dossier / portrait 读模型
- approved timeline / graph / profile
- document evidence
- review / conflict / decision journal

之上，并且要显式展示：

- 引用了哪些证据
- 哪些部分是已批准事实
- 哪些部分是衍生总结
- 哪些地方仍有冲突 / 缺口

**优点：**

- 最贴近当前能力边界
- 直接把静态页面升级成“可使用”的产品
- 为以后 persona agent 打牢可信上下文层

**缺点：**

- 还不是终局中的“像本人一样”
- 第一阶段更像“档案 copilot”而非“人格代理”

### 方案 B：Persona Simulation Baseline

直接做“每个人一个 agent”，从 dossier / portrait / evidence 自动组装 persona prompt。

**优点：**

- 非常贴近愿景
- 产品感强，演示冲击力大

**缺点：**

- 容易在证据不足时产生强幻觉
- 会把风格模拟与事实回答混在一起
- 当前项目还没有“人格边界 / 代言边界 / 低覆盖降级”机制

### 方案 C：Archive Operations Intelligence

下一阶段重点继续放在运营能力，例如：

- 更强的批量复核
- 覆盖率分析
- merge/split/group curation
- 数据质量仪表盘

**优点：**

- 风险低
- 有助于继续夯实基础

**缺点：**

- 产品体验提升有限
- 离“这个系统真的能陪你使用这些记忆”还差一步

---

## 四、推荐结论

我推荐 **方案 A：Grounded Memory Dialogue**。

这是最符合 ForgetMe 当前阶段的位置的一步：

- `Phase 7` 已经把“读模型”做出来了
- `Phase 8` 最自然的升级就是把这些读模型组织成“可问、可答、可追溯”的互动层
- `Phase 9` 甚至更后面，再进入 **persona / advice / style / voice** 会更稳

换句话说：

> `Phase 7` 解决“看得见”
>
> `Phase 8` 解决“问得动”
>
> `Phase 9+` 再解决“像本人”

---

## 五、Phase 8 的正式定义

`Phase 8` 建议定义为：

### **Memory Dialogue & Context Pack Phase**

核心目标不是“让 AI 扮演某个人”，而是：

1. 让用户可以围绕档案库进行自然语言提问
2. 让回答自动绑定到具体人物 / 群体 / 文档证据
3. 让系统在回答时显式带出不确定性、冲突和覆盖缺口
4. 让后续 persona / agent 使用统一、可信的上下文包

因此，Phase 8 的主产物应该是：

- 一个 `Memory Workspace / Archive Chat` 交互层
- 一个 `Context Pack` 组装层
- 一套 `Answer Provenance + Uncertainty` 回答边界机制

---

## 六、Phase 8 的产品边界

### In Scope

- 全局问答：围绕整个档案库提问
- 人物问答：围绕单个人 dossier 提问
- 群体问答：围绕 group portrait 提问
- 证据引用：回答中给出 evidence refs / dossier sections / portrait sections
- 冲突提示：当存在 open conflict 时，明确告诉用户
- 覆盖提示：当资料不足时，不硬答
- 对话历史保存：把用户问题、系统回答、引用上下文保存为可回放记录
- context pack 导出：为后续 agent / 外部模型生成结构化上下文包

### Out of Scope

- 直接“代替某个人说话”
- 语音克隆 / voice synthesis
- 自动生成长期 persona memory 并回写真相表
- 自动把对话结论写成正式事实
- 多 agent 社会模拟

---

## 七、Phase 8 的架构原则

### 1. 读模型仍然是真相入口，LLM 不是

Phase 8 不应该引入新的事实真相表来“存 AI 结论”。

问答时的事实来源仍然是：

- `PersonDossier`
- `GroupPortrait`
- `DocumentEvidence`
- `PersonTimeline`
- `PersonGraph`
- `DecisionJournal`
- `ReviewWorkbench` / `ReviewQueue` 的冲突与 pending 状态

模型只负责：

- 组织语言
- 归纳多段信息
- 生成可读答案

而不负责定义新的事实。

### 2. 先 deterministic retrieval，后 optional synthesis

每次回答都建议采用两阶段：

#### Stage A：Deterministic Context Assembly

根据问答 scope 先组上下文：

---

## 八、8A 基线状态（2026-03-13）

截至 2026-03-13，`8A` 基线已经明确收敛为：

- **deterministic answer synthesis**
  - 回答由现有 read model + review state + journal state 组装
  - 不依赖远程模型才能完成基线问答

- **conversation persistence 留到 8B**
  - 当前轮次只保留内存态
  - 不写入新的对话持久化表

- **context pack export 留到 8C**
  - 先把问答层与 citation / uncertainty 读链做稳
  - 后续再补统一导出给 persona / external model

- **quality / guardrails deepening 留到 8D**
  - 包括更细的覆盖率度量、拒答边界、问题分类、回答质量提升
  - 当前优先保证 grounded、bounded、traceable

- 全局模式：搜索 + people + recent journals + unresolved review pressure
- 人物模式：dossier + timeline + graph + evidence backtrace
- 群体模式：portrait + timeline windows + summary + ambiguity

#### Stage B：LLM Synthesis

如果需要自然语言组织，再把这些结构化上下文喂给模型。

这样即使模型失败，系统仍然可以退化成：

- 原始上下文卡片
- 可点击的证据块
- 明确的“证据不足 / 冲突未解”

---

## 九、8B 对话持久化 / 回放状态（2026-03-13）

截至 2026-03-13，`8B` 已经把 `Memory Workspace` 从“单轮即时问答”推进成“可回放、可续问的历史会话层”：

- 已新增 **scope-bound session / turn persistence**
  - 全局 / 人物 / 群体问答都会写入独立 session
  - 每一轮 turn 都保存原始 question、完整 grounded response snapshot、hash 与时间戳

- 已新增 **renderer replay UI**
  - 进入某个 scope 时会自动加载该 scope 下最新 session
  - 用户可以浏览 `Saved Sessions`
  - 历史 turn 会按顺序回放，而不是重新生成
  - 支持 `Start new session`，在同一 scope 下开始新的独立会话

- 已保持 **truth/read model 不被 replay 写回污染**
  - replay record 是交互历史，不是真相表
  - 重新打开旧 session 展示的是当时保存的回答快照，而不是基于最新状态重新合成

- 当前 `8B` 的产品边界仍然是：
  - 支持 reopen / replay / continue asking
  - 不支持编辑历史 turn、删除 session、把对话结论自动升格为正式事实

这意味着 `Phase 8` 现在已经具备了一个真正可用的 **grounded memory dialogue history** 雏形：用户不只是“问一次”，而是能回到同一个人物、群体或全局记忆空间里继续工作。

### 3. 每一段回答都必须可追溯

用户最终看到的答案至少要能追溯到：

- 某个 dossier / portrait section
- 某个 event / relationship / profile fact
- 某个 document evidence
- 某个 review / journal record

### 4. 冲突和缺口必须进入回答主文本，而不是藏起来

比如系统不应只回答：

> “Bob Li 的学校是北京大学。”

而应能回答：

> “当前档案中存在 1 个 `school_name` 冲突组，至少出现过北京大学与清华大学两个值，尚未完全消歧。”

---

## 八、Phase 8 的核心新模块

### 8.1 `MemoryWorkspace` 对话页

新页面，支持三种 mode：

- `global`
- `person-scoped`
- `group-scoped`

核心能力：

- 输入自然语言问题
- 显示回答
- 显示 evidence chips / refs
- 显示 uncertainty / conflicts / coverage gaps
- 保存会话历史

### 8.2 `Context Pack Builder`

负责把现有读模型装配成统一输入：

- `buildGlobalContextPack(...)`
- `buildPersonContextPack(canonicalPersonId)`
- `buildGroupContextPack(anchorPersonId)`

建议输出统一结构：

- scope metadata
- approved facts
- derived summaries
- unresolved ambiguity
- source evidence refs
- replayable citations

### 8.3 `Answer Trace` / `Conversation Memory`

把每轮问答保存成可追溯记录：

- question
- scope
- selected sources
- answer text
- provider / model
- prompt hash / context hash
- generated at

这层不是“正式真相”，而是**交互历史**。

### 8.4 `Grounded Prompt Policy`

定义回答规则，例如：

- 只可根据 context pack 回答
- 不得补写未提供的事实
- 有冲突先说冲突
- 资料不足时必须降级
- 建议回答与“像本人会怎么说”严格分离

---

## 九、Phase 8 推荐路线图

我建议把 Phase 8 切成四个子阶段。

### Phase 8A：Memory Workspace Baseline

这是最应该先做的第一刀。

交付：

- 新 `Memory Workspace` 页面
- 支持 `global / person / group` 三种 scope
- 输入问题后，先显示 deterministic context cards
- 再显示一个基于 context pack 的简短回答
- 展示 evidence refs 与 ambiguity badges

成功标准：

- 用户可以从 `Person Dossier` 和 `Group Portrait` 直接打开对话页
- 每次回答都能看到来源引用
- 对 unresolved conflict / no evidence 的问题会显式降级

### Phase 8B：Conversation Persistence & Replay

交付：

- 保存问答 session
- 可按人物 / 群体 / 全局查看历史对话
- 支持重新打开某次回答的上下文包与引用来源

成功标准：

- 对话不再是一次性临时输出
- 用户可以回看“当时系统是基于哪些资料回答的”

### Phase 8C：Context Pack Export

交付：

- 导出 `Person Context Pack`
- 导出 `Group Context Pack`
- 可选择“只 approved facts”或“含 derived summaries”
- 导出结果携带稳定 `shareEnvelope` 元数据，为后续 provider boundary / egress audit 包装做准备

本轮基线实现（`2026-03-14`）：

- 已落地本地 JSON 导出基线，格式版本为 `phase8c1`
- 导出入口已接到 `Person Dossier` 与 `Group Portrait`
- 当前 scope 只支持 `person` / `group`
- 当前 mode 支持：
  - `approved_only`
  - `approved_plus_derived`
- 当前导出文件名稳定为：
  - `person-<canonicalPersonId>-context-pack.json`
  - `group-<anchorPersonId>-context-pack.json`
- 当前 slice **不直接发送给远端 provider**，而是先导出本地工件，并保留后续 boundary 封装所需元数据
- `approved_only` 只去掉 `derived_summary`，**不会隐藏** `open_conflict` / `coverage_gap`

成功标准：

- ForgetMe 开始拥有“给外部模型 / agent 提供可信上下文”的标准接口
- 后续 persona 层不再直接耦合 dossier/portrait 内部结构

### Phase 8D：Grounded Answer Quality & Guardrails

交付：

- 回答质量基线评估集
- 冲突问题 / 低覆盖问题 / 多证据整合问题的回归测试
- provider/model 配置对比
- 明确的 fallback 行为

本轮基线实现（`2026-03-14`）：

- `Memory Workspace` 的每条 response 都附带显式 `guardrail` 元数据
- 已实现的 fallback：
  - `fallback_to_conflict`
  - `fallback_insufficient_evidence`
  - `fallback_unsupported_request`
- 已落地的回归质量基线：
  - conflict question
  - low coverage question
  - multi-source synthesis question
  - persona imitation question
- renderer 与 replay 现在都可直接看到 guardrail decision / reasons / citation count
- 当前 `8D` slice 仍然是 **local deterministic baseline**；真正的 provider/model compare runner 暂不在本轮实现内
- 当前新增的 compare runner 基线（`2026-03-14`）：
  - 同一 scope / question 可生成独立 compare session
  - compare session 与普通 conversation session 分开持久化
  - 默认 compare targets 为：
    - `Local baseline`
    - `SiliconFlow / Qwen2.5-72B-Instruct`
    - `OpenRouter / qwen-2.5-72b-instruct`
  - compare 的 truth source 仍是同一份 deterministic grounded context
  - provider/model 当前只比较 **answer synthesis**，不改变 truth assembly / citations / guardrail policy
  - 单个 target 失败不会中断整个 compare session
  - 当前 compare runner 已新增 **deterministic scoring baseline**：
    - run 级 rubric：
      - groundedness
      - traceability
      - guardrail alignment
      - usefulness
    - session 级 recommended run + rationale
    - tie-break 优先更安全的 `Local baseline`
  - 当前 compare runner 已新增 **optional judge v1**：
    - judge verdict 逐 run 持久化
    - judge verdict 只作为补充信号，不替代 deterministic recommendation
    - judge 失败 / 关闭不会中断 compare session
    - renderer 会并排展示 deterministic rubric 与 judge verdict
    - compare UI 已支持按次开启/关闭 judge，并覆盖 provider / model
    - compare judge 的默认开关 / provider / model 当前只做 **renderer-local preferences**
      - 使用 `localStorage` 保存最近一次选择
      - 仅用于减少重复输入，不属于跨设备同步的 app settings
  - compare UI 现已支持按次配置默认 target slots：
    - 可单独包含/排除 `Local baseline`、`SiliconFlow`、`OpenRouter`
    - 可按次覆盖两个远端 target 的 model 名称
    - 当 renderer 未自定义 target 选择时，仍沿用 service 侧默认 compare presets
    - compare target 的默认启停与 model 覆盖当前也只做 **renderer-local preferences**
      - 使用 `localStorage` 保存最近一次 target 选择
      - 仅用于减少重复配置，不属于跨设备同步的 app settings
  - 已保存 compare session 现可回填当前 compare 表单：
    - 复用原 question
    - 复用当次 target 选择与 remote model override
    - 复用当次 judge enable/provider/model
    - 仅回填 compare form，不改变 compare truth assembly 或历史记录
  - 已保存 compare session 现提供 quick-scan metadata：
    - `Targets: ...` 快速显示本次 compare 的 target 组成
    - `Judge: ...` 快速显示 judge 的 session-level 汇总状态（`disabled/completed/failed/mixed`；当各 run verdict 不一致时显示 `mixed`）
    - `Failed runs: N` 在存在失败 target 时直接提示，无需先点开历史 session
  - 当前 compare runner 仍未包含批量矩阵调度、judge 驱动的自动推荐替换

成功标准：

- 可以衡量“回答有没有乱说”
- 为后续 persona / agent 做风险门槛

---

## 十、为什么 8A 应该是下一步

如果只选一个最小切片马上做，我推荐：

## **先做 Phase 8A：Memory Workspace Baseline**

原因很简单：

1. **最直接把项目从“档案阅读器”推成“记忆工具”**
2. **复用现有最多的积木，风险最低**
3. **为 8B、8C、8D 甚至更远的人格 agent 提供统一入口**

换句话说，8A 是那个“产品感觉一下子活起来”的节点。

---

## 十一、Phase 8 的验收标准

当 Phase 8 完成时，我认为至少要满足以下条件：

### 产品层

- 用户可以对整个档案库、单个人、单个群体发起提问
- 回答可读，不只是原始 JSON 拼接
- 回答可点击追溯到证据

### 可信层

- 冲突不会被静默吞掉
- 无证据时不会装作知道
- 回答与正式真相表解耦

### 架构层

- 有统一 context pack builder
- 有 conversation/session replay
- 有 provider / model audit 对接

### 未来兼容层

- Phase 9 若进入 persona / style / advice / voice，不需要推翻 Phase 8，只是在它上面加新的“表达模式”

---

## 十二、对更长期愿景的衔接

如果项目终局是：

- 还原一个人的说话
- 还原一个人的建议
- 还原一个人的风格
- 甚至形成每个人 / 每群人的 agent

那么更合理的演进顺序应该是：

### Phase 7
把人 / 群体稳定地“读出来”

### Phase 8
把人 / 群体稳定地“问出来”

### Phase 9
把人 / 群体在明确边界下“模拟出来”

这条路径更慢一点，但更像你要做的“私人档案库”，而不是一个空心 demo。

---

## 十三、推荐结论

**Phase 8 推荐正式命名为：**

## **Grounded Memory Dialogue / 证据驱动的记忆对话层**

**推荐立即实施的第一刀：**

## **Phase 8A：Memory Workspace Baseline**

如果继续往下走，下一步最自然就是：

- 先写 `Phase 8A Memory Workspace Baseline Implementation Plan`
- 再按 TDD 把最小对话页、context pack builder、answer trace 跑通
