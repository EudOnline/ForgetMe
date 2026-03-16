# Phase 10H Approved Draft Destination Registry & Send Presets Design

`Phase 10H` 的目标不是把 ForgetMe 从 `10G` 直接推进成 publish/share system，也不是马上做 failed-send retry queue，而是给 **approved draft provider send** 增加第一层明确、可选择、可审计的 destination 语义。

在 `Phase 10G` 完成之后，系统已经能做到：

- `approved` persona draft review 可以 remote send
- successful send 会写入 `decision_journal`
- `Search` / `Review Queue` / replay 可以重新找到成功 send
- `Approved Draft Handoff` 面板能显示 latest send audit detail

但当前还留着一个新的明显空白：

- send route 仍然是 service 内部隐式解析的默认 `memory_dialogue` route
- operator 不能在 send 前明确选择目标 destination
- audit 事实里还没有“这次 send 是按哪个 destination preset 发出去的”这一层稳定语义
- 如果默认 route 恰好与某个显式 provider/model preset 一样，历史上无法区分“默认发出”还是“显式选定后发出”

`Phase 10H` 要解决的，就是这段“已经能发，也能查，但还不能明确表达发往哪里”的空白。

## 为什么 10H 不应该直接做 publish/share

如果在 `10G` 之后立刻跳去 publish/share link，系统会继续扩展“发出去以后怎么传播”，但还没有真正补完“本次 send 的目标是谁、是怎么选中的”。

这会带来几个问题：

- outbound target identity 仍然不清楚
- publish/share 会立刻引入 link 生命周期、权限、撤销、可见性边界
- 当前 handoff artifact 还是本地导出与单次 send 的语义，不是公开分发语义
- 一旦 destination 语义没有先稳定，后续 publish history 会更难解释

所以 `10H` 最自然的下一步不是“继续扩大 outward surface”，而是“先让 approved draft send 拥有稳定的 destination registry 语义”。

## 为什么 10H 也不应该先做 retry

retry 看起来是 send 之后很自然的需求，但当前系统里 send 仍然只有一条隐式默认 route。

如果现在先做 retry：

- retry 只会固化“默认 route”这一种未命名目标
- operator 仍然不知道下一次 retry 将重试哪个 destination preset
- failure recovery 会在没有 target identity 的前提下膨胀

所以 retry 更像 destination 之后的一刀，而不是 destination 之前的一刀。

## 当前承接点

仓库里已经有两套对 `10H` 很有帮助的现成语义：

- approved draft send 已经有稳定的 handoff artifact 与 provider-boundary audit 链
- `Memory Workspace Compare` 已经有 renderer-side provider/model preset 语义

其中第二点尤其重要：

- compare UI 已经把 `SiliconFlow` / `OpenRouter` 这些 provider/model 组合定义成稳定 target slot
- renderer 已经有 localStorage 存储“上次使用的 provider/model 选择”
- service 侧已经接受显式 provider/model target，而不是只能依赖默认 route

这意味着 `10H` 最稳妥的做法不是重新发明一套 destination 管理体系，而是：

- 先给 approved draft send 增加一组很窄的 built-in destinations
- 尽量复用 compare 里已经跑通的 provider/model naming 约定
- 保持 registry 是只读、内建、可审计的，而不是立刻做用户自定义 CRUD

## 方案比较

### 方案 A：直接做用户可编辑的 destination registry

优点：

- 长期扩展性最高
- 后续 publish/share、retry、team presets 都更自然
- 一次性把 outbound target 管理做成产品能力

缺点：

- 需要新的 CRUD、校验、持久化、删除/停用语义
- 需要决定 registry 是本地设置、数据库真相，还是两者结合
- 明显超出 `10H` “把 destination 语义先稳定下来”的目标

结论：**现在不推荐。**

### 方案 B：做 built-in destination registry + last-used send preset

优点：

- 范围最克制
- 用户第一次可以在 send 前明确选择目标
- registry 仍然是稳定、可测试、可审计的产品概念
- 可以复用 compare 已存在的 provider/model 约定
- 不需要立刻做新的 destination 管理页面

缺点：

- 还没有真正的自定义 preset
- destination 列表暂时只能由代码内建

结论：**推荐。**

### 方案 C：继续只用默认 route，但把默认 route 显示出来

优点：

- 改动最小
- UI 上至少不再完全隐式

缺点：

- 仍然没有“选择 destination”的能力
- 不能区分默认发出和显式 preset 发出
- 无法为后续 retry / publish / registry management 打基础

结论：**不够完整。**

## 推荐方向

`Phase 10H` 推荐采用：

## **Approved Draft Destination Registry & Send Presets**

第一刀只做：

- 一组 built-in approved draft send destinations
- `Approved Draft Handoff` 面板里的 destination selector
- last-used destination preset 的 renderer persistence
- `sendApprovedPersonaDraftToProvider(...)` 接收可选 `destinationId`
- send audit artifact 与 journal payload 持久化 `destinationId` / `destinationLabel`
- replay / search / review detail 能看到本次 send 选择的 destination 语义

第一刀不做：

- 用户自定义 destination CRUD
- 独立 destination 管理页面
- publish/share link
- retry queue / background resend
- failed-send journaling
- provider response 回写为新的 approved truth

## Destination Registry 语义

`10H` 推荐引入一个窄的 registry read model：

- `destinationId`
- `label`
- `resolutionMode`
  - `memory_dialogue_default`
  - `provider_model`
- `provider`
- `model`
- `isDefault`

推荐 baseline 先只提供 3 个 built-in destinations：

1. `memory-dialogue-default`
   - label: `Memory Dialogue Default`
   - resolutionMode: `memory_dialogue_default`
   - provider/model 由当前 `resolveModelRoute({ taskType: 'memory_dialogue' })` 实时解析
2. `siliconflow-qwen25-72b`
   - label: `SiliconFlow / Qwen2.5-72B-Instruct`
   - resolutionMode: `provider_model`
   - provider: `siliconflow`
   - model: `Qwen/Qwen2.5-72B-Instruct`
3. `openrouter-qwen25-72b`
   - label: `OpenRouter / qwen-2.5-72b-instruct`
   - resolutionMode: `provider_model`
   - provider: `openrouter`
   - model: `qwen/qwen-2.5-72b-instruct`

这里最重要的原则是：

- registry 先是 **built-in**
- destination identity 先稳定，再考虑自定义
- compare 与 approved draft send 尽量共享 provider/model naming

## Send 解析规则

`10H` 的 send flow 仍然只接受 `approved` review，但 route 解析规则改为：

- `destinationId` 未传时，按 `memory-dialogue-default` 处理
- `destinationId = memory-dialogue-default`
  - 继续使用 `resolveModelRoute({ taskType: 'memory_dialogue' })`
- `destinationId = <provider-model preset>`
  - 先按对应 provider 调 `resolveModelRoute({ taskType: 'memory_dialogue', preferredProvider })`
  - 再用 preset model 覆盖 route.model

这样可以保持：

- default route 仍然是安全基线
- 显式 preset 不需要重新发明网络层
- provider/model 的边界依然走现有 `modelGatewayService`

## Persistence 设计

`10H` 推荐在 `persona_draft_provider_egress_artifacts` 中增加：

- `destination_id`
- `destination_label`

同时 successful send 的 journal payload 增加：

- `destinationId`
- `destinationLabel`
- `resolutionMode`

这样可以保证：

- provider-boundary artifact 记录这次 send 的目标 identity
- decision-history replay 也能看到相同 destination 语义
- 后续 retry / publish 如果要做，可以直接沿用 destination identity

对 `10F/10G` 已存在的历史行，读取层可以做最小兼容：

- 若 `destination_id` 为空，则按 `memory-dialogue-default` 映射
- 若 `destination_label` 为空，则按当前 default destination label 回填显示

这样不会破坏 replay，也不需要做一次性历史回写。

## Renderer 设计

`10H` 不需要开新页面，继续留在现有 `Approved Draft Handoff` 面板内。

推荐在 `Provider Boundary Send` 子区块增加：

- `Destination` label
- 一个紧凑 `<select>` 或 radio group
- 默认选中 last-used destination；若没有，则选 `Memory Dialogue Default`
- `Send approved draft` 按当前 selected destination 发送

send 成功后：

- latest send summary 继续显示 provider/model/status
- latest send audit 继续显示 request/response/error
- 在 summary 区里增加本次 `destinationLabel`

send 失败时：

- UI 继续显示失败事件
- 当前 selected destination 不被清空
- 用户可以显式切到别的 preset 再次发起 send

## Search / Replay / Review 行为

`10H` 不需要新增新的历史页面，但现有 replay surfaces 需要认识 destination metadata：

- `Search`
  - destination label 关键词可命中 send history
- `Review Queue / Undo History`
  - replay detail 能显示 `destinationId` / `destinationLabel`
- `Memory Workspace` replay
  - approved turn 中能看到当前 send history 对应的 destination summary

第一刀不要求新增独立 destination 过滤器，但要求 destination 信息至少进入：

- visible summary
- replay payload
- search haystack

## Acceptance

`Phase 10H` 收口时应满足：

- approved draft send 支持从 built-in registry 中选择 destination
- renderer 会记住 last-used approved draft send destination
- `sendApprovedPersonaDraftToProvider(...)` 支持可选 `destinationId`
- successful / failed send artifact 都记录 `destinationId` / `destinationLabel`
- successful send journal payload 包含 destination metadata
- `Memory Workspace` 当前 turn 与 replay 都能看到 destination summary
- `Search` / `Review Queue` replay detail 可重新定位 destination metadata
- 老的 `10F/10G` send history 在无 destination columns 的情况下仍可回放

## 明确不做

`Phase 10H` 不包括：

- user-authored destination registry
- destination rename / delete / disable
- provider API key management UI
- publish / share links
- background retry queue
- failed-send decision journaling
- unified outbound dashboard

## 推荐结论

`Phase 10H` 推荐正式命名为：

## **Approved Draft Destination Registry & Send Presets**

推荐立即实施的第一刀：

## **Built-in registry plus last-used destination selection**

这样我们可以把 approved draft send 从“默认 route 的单一路径”推进到“有明确 target identity、可选择、可审计、可为 retry/publish 铺路的稳定 outbound slice”，同时继续守住：

- review-first
- approved-only
- no open persona mode
- no publish semantics yet
- no editable outbound control plane yet
