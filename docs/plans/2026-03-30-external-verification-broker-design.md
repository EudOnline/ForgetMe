# External Verification Broker Design

## Goal

把 message-native objective runtime 里的外部核实能力从 `searchWeb: async () => []` 升级为一个真实、受控、可审计的后端闭环：

- agent 提出 `verify_external_claim` proposal
- runtime 依据 `toolPolicyId` 和 skill pack 做工具授权
- broker 执行受限搜索与页面抓取
- 生成带来源的 citation bundle
- 把 tool execution、checkpoint 和 artifact refs 落库

本阶段不做 UI；UI 只在后续消费这些持久化结果。

## Non-goals

- 不做自由浏览器会话
- 不做无限网页跳转
- 不做自动把外部结论写回 formal truth
- 不做新的前端展示
- 不做多层子代理递归

## Architecture

### 1. Policy layer

在 `toolBrokerService` 中增加固定 policy registry，最少提供：

- `external-verification-policy`
- `local-evidence-policy`

runtime 不再只保存 `toolPolicyId` 字符串，而是通过 registry 解析出真实 policy，再交给 `authorizeToolRequest(...)` 做判定。

### 2. Search/page adapter layer

新增一个面向公网的轻量适配器服务，职责只有两个：

- `searchWeb(query)`：返回候选搜索结果
- `openSourcePage(url)`：抓取页面标题、正文摘要、发布时间等可用于 citation 的最小字段

第一阶段默认使用无需 API key 的公开 HTML 搜索入口和普通 `fetch` 页面抓取，并施加：

- 查询长度上限
- 结果数量上限
- 页面抓取数量上限
- 超时
- 只接受 `http/https`

### 3. Verification broker layer

`externalVerificationBrokerService` 负责把搜索结果和页面内容整理成统一的 `CitationBundle`：

- 规范化 query
- 去重 URL
- 优先保留更可信来源
- 从页面文本里抽取与 claim 最接近的 fact/snippet
- 给每个 source 打上 reliability label
- 得出 `supported | inconclusive | not_supported`

它不直接决定数据库结构，也不直接接触 IPC。

### 4. Objective runtime integration

`objectiveRuntimeService.requestExternalVerification(...)` 负责 orchestration：

1. 创建 `verify_external_claim` proposal
2. 创建 bounded web-verifier subagent
3. 为 `search_web`、`open_source_page`、`capture_citation_bundle` 分别做授权
4. 为每次工具调用写入 `agent_tool_executions`
5. 将最终 citation bundle 映射为 checkpoint + artifact refs

## Data model additions

数据库表 `agent_tool_executions` 已存在，但目前没有配套 persistence API。需要补：

- `createToolExecution(...)`
- `completeToolExecution(...)`
- `listToolExecutionsByProposal(...)`

第一阶段不要求把 tool executions 暴露到 renderer detail DTO；只要求运行时能审计和测试能验证。

## Minimal execution flow

### search_web

- 输入：`claim`, `query`, `maxResults`
- 授权：必须来自 `external-verification-policy`
- 落库：记录 query、结果数、选中的 URL

### open_source_page

- 输入：`url`
- 授权：同上
- 落库：记录标题、发布时间、提取到的 snippet 长度

### capture_citation_bundle

- 输入：候选 sources
- 授权：同上
- 落库：记录 verdict、source count

## Reliability heuristic

第一阶段只做轻量规则，不引入模型推断：

- `official`：`gov`、`edu`、已知官方域名线索，或 hostname 含 `official`
- `trusted_media`：常见媒体域名线索
- `secondary`：普通网页

排序优先级：

1. `official`
2. 有明确 `publishedAt`
3. 文本中包含 claim 关键词更多
4. 搜索结果靠前

## Failure behavior

- 搜索失败：写失败的 tool execution，返回 `inconclusive`
- 单个页面抓取失败：不中断整个核实流程，继续其余页面
- 全部页面无有效内容：返回 `not_supported` 或 `inconclusive`
- tool policy 不允许：直接抛错，中止该 proposal 的自动核实

## Testing

优先补三类单测：

1. `toolBrokerService`
   - `external-verification-policy` 可解析
   - 缺 policy / 禁网 policy 会阻止网络工具

2. `externalVerificationBrokerService`
   - 搜索结果 + 页面内容可归一化为 citation bundle
   - URL 去重和可信度标签工作正常

3. `objectiveRuntimeService`
   - `requestExternalVerification(...)` 会写入 `agent_tool_executions`
   - 生成 `external_verification_completed` checkpoint
   - artifact refs 指向真实 citation source

## Deferred work

- 更强的 HTML 抽取
- robots / domain allowlist 更细粒度策略
- 页面内容缓存
- 将 tool execution 暴露给 renderer
- 让子 agent 真正独立执行工具，而不是先由 runtime 同步代跑
