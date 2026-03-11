# Preservation & Operator Efficiency Phase 6 Design

Date: 2026-03-11  
Status: Validated design draft  
Project: ForgetMe

## Summary

第五阶段完成以后，ForgetMe 已经具备了一条完整的高风险资料处理闭环：原件冻结、证据增强、候选审核、正式档案投影、单条审核工作台都已经打通。

第六阶段不应该急着进入“人格模拟”或“替身 agent”层，而应该先补齐两件更基础、也更符合项目定位的能力：

- **6A 保全底座**：确保资料真的“留得住、拿得回、恢复得了、外发有边界”
- **6B 审核效率层**：确保资料量上来以后，操作者还能持续、高质量、低摩擦地完成审核

这一阶段的核心目标不是让系统“更像人”，而是让系统更像一个**长期可运营的私人档案库**。只有当保全、恢复、审计、撤销、审核效率这些基础能力都足够稳以后，后续的人格画像、风格抽取、建议模拟才有可信基础。

## Route Options

### Option A: Preservation First, Review Efficiency Second

先做备份 / 恢复 / 导出 / 加密 / 模型外发脱敏边界 / 恢复演练，再做人物视角审核队列、冲突聚合、连续审核和安全批量批准。

优点：

- 最符合“私人档案库”定位
- 先解决高敏数据项目最致命的风险：丢失、泄露、不可恢复
- 后续审核效率优化可以建立在更稳的保全边界上
- 为未来 persona 层提供可信、可回放、可恢复的底座

缺点：

- 用户短期内感知到的“操作更快”会稍晚出现
- 需要先投入到偏基础设施的能力

### Option B: Review Efficiency First

先做人物视角分组、冲突聚合、连续审核、批量批准和决策回放，再回头补保全底座。

优点：

- 操作者更快感觉到“审核更顺手”
- 对当前 phase five 的工作台是自然延展

缺点：

- 一旦数据规模继续增长，缺少稳定备份 / 恢复机制会成为更大隐患
- 批量能力如果先上，外发和恢复边界不清晰，会放大风险

### Option C: Persona / Agent First

直接开始做人设建模、说话风格模仿、建议生成、人物常驻 agent。

优点：

- 演示效果强
- 很容易让人觉得“项目终于智能了”

缺点：

- 当前正式层还远不够稳，不适合承载人格层
- 会放大错误归属、错误字段、审核遗漏的后果
- 与“保全优先”的项目定位冲突

### Recommendation

推荐 **Option A**。

ForgetMe 现阶段最重要的不是“更会模仿一个人”，而是 **更可靠地保全一个人**。第六阶段应该先把“保存、恢复、边界、审计、撤销、效率”这些基础能力做完整，再进入更高层的人物模拟。

## Product Positioning

### Recommended Route

第六阶段应被定义为：**“保全与运营效率层”**。

它承接前五阶段，但不改变核心价值观：

- `local-first`
- `evidence-first`
- `undoable`
- `auditable`
- preservation before simulation

### Product Principle

这一阶段要回答的，不是“系统能不能更像某个人”，而是以下问题：

- 这些高敏资料有没有可靠备份？
- 如果本地数据库或机器损坏，能不能恢复？
- 发给远程模型的内容有没有明确脱敏与边界？
- 数据量继续上升以后，审核还能不能做得动？
- 批量操作出了问题，能不能整批撤销并回看？

所以第六阶段的成功标准应是：

- 数据保全能力可验证
- 外发边界可解释
- 审核效率明显提升
- 批量决策仍然保持可追溯与可撤销

## Core Problems This Phase Solves

### 1. 当前系统还没有真正可依赖的备份 / 恢复路径

现在的系统已经能把原件冻结进本地 vault，也能把结构化状态写进 SQLite，但还缺少系统级保全能力：

- 如何导出完整归档包
- 如何校验归档包完整性
- 如何在新机器或损坏后恢复
- 恢复后怎样确认 formal view 与 evidence view 一致

如果这些问题不先解决，ForgetMe 仍然更像“能工作的本地应用”，而不是“可信的私人档案库”。

### 2. 模型外发边界虽然有 provider 接入，但还不够显式

第三、四、五阶段已经引入 `LiteLLM` 与远程模型提供方，但目前仍缺少更强的边界层：

- 哪些字段允许直接外发
- 哪些字段必须先脱敏
- 哪些文件类型只能本地保留，不允许外发
- 每次外发到底发了什么、为什么能发、对应什么策略

对于身份证、驾驶证、成绩单、聊天截图这类资料，这一层必须显式建模，而不能只停留在调用方约定。

### 3. 当前审核流程能闭环，但规模上来后会变慢

phase five 已经提供了很好的单条审核工作台，但当候选数量增长以后，操作者会遇到：

- 同一个人物下的多个候选来回切换
- 同一字段冲突被分散在多条 item 里处理
- 相似决策不断重复点击
- 做过的批准 / 撤销缺少更强的回放与搜索入口

如果不补这一层，系统会“正确但费人”。

### 4. 批量能力必须建立在安全边界和撤销模型之上

用户已经明确要求：

- 允许记录所有合并
- 允许撤销合并
- 批准后也可以撤销

同样的原则必须延续到第六阶段的批量审核：

- 只有低风险、无冲突、同类决策才能批量批准
- 每一次批量批准都必须被记录成可回放事件
- 整批撤销与单项撤销都要成立

## Scope Split

## 6A 保全底座

第六阶段的第一部分是让 ForgetMe 具备真正的“档案库底座”。

### Goals

- 支持完整导出 vault + database + manifest 的归档包
- 支持导出包完整性校验
- 支持 restore 到新数据目录或空目录
- 支持对导出包进行可选加密
- 支持对模型外发内容应用显式脱敏策略
- 支持恢复演练并产出校验报告

### Core Capabilities

#### 1. Export / Backup Manifest Layer

新增面向归档保全的导出能力。导出包至少应包含：

- vault 原件对象
- SQLite 数据库快照
- schema 版本信息
- 文件计数、字节计数、对象哈希
- 导出时间、应用版本、数据目录信息

manifest 的目标不是只做“打包成功”提示，而是提供一个可验证、可恢复、可审计的归档说明。

#### 2. Restore Layer

系统应支持从归档包恢复到新目录，并执行恢复前后的完整性验证：

- vault 对象是否齐全
- 数据库 schema 是否兼容
- import batch / file / evidence / review / journal 数量是否一致
- formal profile read model 是否可重建

恢复不应是“把 zip 解开”这么简单，而应是一次显式、可报告的恢复操作。

#### 3. Encryption Layer

导出包应支持可选加密。设计上优先采用“本地口令驱动的加密导出”，而不是复杂的多设备密钥同步。

推荐原则：

- 加密是导出包级别，而不是把整个运行目录永久改成复杂加密文件系统
- 密钥材料尽量不落入项目数据库
- 本地开发环境与测试夹具可保留非加密模式，避免拖慢日常开发

#### 4. Provider Boundary & Redaction Layer

在把文档、图片、聊天截图发给远程模型前，应新增一层显式策略：

- 文件类型级别：哪些资料允许外发
- 字段级别：哪些高敏字段要遮罩
- 任务级别：不同 enhancer 使用不同边界策略
- 审计级别：记录本次外发的策略命中与脱敏摘要

注意这里不是要修改原始文件，而是生成一份 **provider egress artifact**：

- 原件仍保存在 vault
- 外发版本是脱敏后的临时工件
- 外发工件与原件、任务、提供方、策略全部可回链

#### 5. Recovery Drill Layer

第六阶段不应只提供“理论上可以恢复”，而应支持恢复演练：

- 从测试或真实备份包恢复到临时目录
- 自动运行完整性检查
- 输出 drill report
- 给出失败项与差异摘要

这样系统才能真正证明“数据保全能力成立”。

### Suggested Data Additions

推荐新增或扩展以下建模方向：

- `backup_exports`
- `backup_export_entries`
- `restore_runs`
- `restore_checks`
- `provider_egress_artifacts`
- `provider_egress_events`
- `redaction_policies`
- `recovery_drills`

这里不要求一次把所有实现做满，但设计上应留出这些能力的演进空间。

## 6B 审核效率层

当保全底座具备以后，第六阶段第二部分是让操作者在更大数据规模下继续高质量工作。

### Goals

- 提供人物视角优先的审核队列
- 聚合同人物 / 同字段 / 同冲突簇的审核项
- 提供连续审核流，减少跳转
- 支持低风险、无冲突批量批准
- 支持决策日志的搜索、回放与按批次撤销

### Core Capabilities

#### 1. People-Centric Review Inbox

现有 workbench 以“单条 queue item”为中心。第六阶段应新增“以人物为中心”的审核入口，让操作者先进入某个人，再看该人物当前待处理项。

推荐展示维度：

- 该人物 pending 数量
- 该人物涉及的字段类别
- 是否存在冲突
- 最近一次审核时间
- 是否存在可连续处理序列

这会把工作方式从“刷列表”转变成“处理一个人物的一组未决事项”。

#### 2. Conflict Aggregation

同一个 canonical person 下、同一字段键、同一来源簇的多个候选，应尽量聚合展示。

例如：

- 多份成绩单都提到同一学校
- 多张证件图都提到同一证件号片段
- 多次 OCR 对同一出生日期给出接近但不完全一致的结果

workbench 不应要求操作者逐条来回对比，而应支持“冲突组”视图：

- 一眼看到一致项与分歧项
- 能区分新证据、冲突证据、重复证据
- 能在组内逐项批准 / 拒绝 / 延后

#### 3. Continuous Review Flow

在单条 workbench 基础上，增加连续审核体验：

- 当前 item 处理完成后自动定位下一条相关 item
- 支持“同人物继续”“同字段继续”“同冲突组继续”三种跳转模式
- 支持键盘快捷操作
- 支持保留筛选与上下文，不频繁回主列表

这会显著降低操作摩擦。

#### 4. Safe Batch Approval

批量批准必须非常克制，只覆盖低风险、无冲突、可解释的场景。

推荐限制条件：

- 同一 item type
- 同一 canonical person
- 同一 field key
- 无 formal conflict
- 无多来源互斥
- 不涉及 identity / license / education-number 这类高敏字段

批量批准不是绕过审核，而是把重复低风险判断压缩成一次显式决策。

#### 5. Decision Journal Replay / Search

当前已经有 journal，但第六阶段应把它从“可存档”提升为“可运营”：

- 按人物、字段、候选类型、时间范围搜索
- 查看某次批准影响了哪些正式属性
- 查看某次批量批准包含哪些 item
- 支持整批撤销与单项撤销
- 支持从人物页反向查看相关决策历史

## Phase 6 Write Path Principles

无论是 6A 还是 6B，都不能破坏现有写路径的核心原则：

- 原件不覆盖、不替换
- evidence 层与 formal 层继续分离
- 所有批准、拒绝、撤销都必须写 journal
- 批量决策必须有独立 decision batch 记录
- undo 必须优先于 convenience

推荐新增一种批量决策封装，而不是让批量批准直接循环调用单项接口后就结束。系统应该明确知道：

- 这是一组什么决策
- 为什么允许组决策
- 组内包含哪些 item
- 整组如何撤销

## Data Flow

### 6A Data Flow

`vault/db state -> export snapshot -> manifest build -> optional encryption -> backup package -> restore run -> integrity check -> rebuild read models -> recovery report`

### 6A Model Egress Flow

`source file -> boundary policy match -> redacted egress artifact -> provider request -> raw response archive -> normalized evidence/candidates -> audit trail`

### 6B Review Flow

`pending review items -> people-centric grouping -> conflict aggregation -> continuous review session -> single or batch decision -> decision batch journal -> projection refresh -> replay / undo`

## Milestones

### Milestone 6A1: Export / Restore Baseline

- 导出 vault + db + manifest
- 支持 restore 到空目录
- 支持基础完整性校验
- 形成最小 recovery report

### Milestone 6A2: Encryption & Provider Boundary

- 导出包可选加密
- provider egress artifact 建模
- 脱敏策略配置与审计记录
- OCR / 图片理解任务接入边界层

### Milestone 6A3: Recovery Drill & Verification

- 恢复演练命令或界面入口
- fixture 级恢复验证
- 失败差异报告
- 可重复执行的灾备演练流程

### Milestone 6B1: People-Centric Inbox

- 人物视角待审入口
- pending item 聚合计数
- 基础人物分组筛选
- workbench 与人物上下文联动

### Milestone 6B2: Conflict Grouping & Continuous Review

- 冲突组展示
- 同人物 / 同字段连续审核
- 快捷键与上下文保持
- stale state 与并发提示继续保留

### Milestone 6B3: Safe Batch Approval & Decision Replay

- 低风险无冲突批量批准
- decision batch journal
- 批量撤销与单项撤销共存
- journal replay / search 入口

## Out of Scope

第六阶段明确不做这些内容：

- persona 模拟
- 语音克隆
- 对话式常驻 agent
- 云端同步 / 多端实时协作
- 自动批准高风险身份字段
- 删除 vault 原件以节省空间

## Recommended Implementation Order

推荐实现顺序如下：

1. `6A1` 导出 / manifest / restore baseline
2. `6A2` provider boundary 与脱敏工件
3. `6A2` 导出包可选加密
4. `6A3` recovery drill 与完整性校验
5. `6B1` 人物视角审核入口
6. `6B2` 冲突聚合与连续审核
7. `6B3` 安全批量批准与 replay / undo

原因很简单：

- 先解决“数据保全是不是成立”
- 再解决“模型外发是否有边界”
- 最后再把审核操作做得更快

这样既符合项目定位，也能避免在高敏场景里先追求效率、后补安全。

## Acceptance Criteria

当第六阶段完成时，至少应满足：

- 可以导出一个可校验、可恢复的归档包
- 可以从归档包恢复到新目录并通过一致性检查
- 可以说明每一次远程模型外发的脱敏策略与外发内容摘要
- 可以按人物组织待审核项，而不是只刷平铺列表
- 可以对低风险无冲突项做批量批准，并支持整批撤销
- 可以搜索与回放关键决策历史

## Next Step

如果按照推荐路线继续推进，下一步最合适的实施起点不是批量审核，而是：

- 先写 **Phase 6A 保全底座实施计划**
- 首个实现包聚焦 `export / manifest / restore baseline`

这是第六阶段里风险最低、价值最高、也最符合“私人档案库”定位的切入口。
