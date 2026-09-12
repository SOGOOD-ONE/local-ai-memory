# Local AI Cost Optimizer

面向网页大模型的**本地成本优化中间层**。

核心目标不是改变 ChatGPT、豆包、Trea 等模型本身，而是在浏览器与网页 LLM 之间增加一个运行在用户本机的优化层。

```text
用户问题
   ↓
Chrome / Edge Extension
   ↓
Platform Adapter
   ↓
Local AI Cost Optimizer
   ├── Memory Engine        本地记忆
   ├── Retrieval            相关记忆召回
   ├── Context Compression  上下文压缩
   ├── Token Budget         输入/输出预算
   ├── Semantic Cache       语义缓存，避免重复调用
   ├── Local Router         简单任务本地处理/路由
   └── Cost Tracker         Token 与费用统计
   ↓
ChatGPT / 豆包 / Trea / 其他网页 LLM
```

## 核心优化目标

1. 减少发送给云端模型的输入 Token。
2. 控制不必要的输出 Token。
3. 对重复或简单请求尽可能避免云端模型调用。
4. 在本地统计原始 Token、实际 Token、节省 Token 与估算费用。
5. 保留完整历史，但只向云端发送当前任务真正需要的上下文。

## 平台

浏览器层优先支持 Microsoft Edge 与 Google Chrome。

扩展采用 Manifest V3，并通过 Platform Adapter 适配不同网页。

当前已经加入共享 `extension/content/adapter.js`，以及 ChatGPT/Trea 的 v2 页面适配器。由于当前环境对更新根 `extension/manifest.json` 有安全限制，同时保留 `extension/manifest.v2.json` 作为对应的新清单，便于后续切换。

## 页面上下文采集原则

适配器只负责网页侧的 DOM 读取、消息角色归一化和去抖上报，不把平台特定逻辑写入核心优化器。当前流程为：

```text
网页 DOM
   ↓
Platform Adapter
   ↓
统一 message[]
   ↓
Local Optimizer
   ↓
原始 Token / 优化 Token / Cache / Route / Output Budget
```

这样后续增加 Claude、Gemini 等平台时，不需要改动 Memory、Retrieval、Cache、Cost 等核心模块。

## 记忆架构

```text
messages
   ↓
Short-term Memory
   ↓ threshold
Medium-term Summary
   ↓ importance / stability
Long-term Memory
   ↓
Embedding / Retrieval
   ↓
Context Engine
```

完整原始消息保存在本地 SQLite；长期记忆保存结构化信息。检索结果只在需要时进入本次 Context。

## 成本优化链路

```text
Query
  ↓
Local Router
  ├── Local Fast Path → 本地直接处理
  ├── Semantic Cache → 命中历史结果
  └── Cloud Path
          ↓
      Context Engine
          ↓
      Token Budget
          ↓
      Cloud LLM
```

## Repository layout

```text
local-ai-memory/
├── backend/
│   ├── app.py
│   ├── database.py
│   ├── token_engine.py
│   ├── retrieval.py
│   ├── context_engine.py
│   ├── memory_lifecycle.py
│   ├── cost_engine.py
│   ├── semantic_cache.py
│   └── router.py
├── extension/
│   ├── manifest.json
│   ├── manifest.v2.json
│   ├── background.js
│   ├── content/
│   │   ├── adapter.js
│   │   ├── chatgpt_adapter_v2.js
│   │   ├── trea.js
│   │   └── trea_adapter_v2.js
│   └── popup/
├── tests/
├── docs/
├── requirements.txt
└── README.md
```

## Privacy

默认架构以本地处理为原则：SQLite、记忆、检索索引和成本统计均保存于用户本机。Local API 默认绑定 `127.0.0.1`，不主动上传用户记忆。

## Roadmap

### Phase 1 — Core
- SQLite session/message/memory
- Token accounting
- Context Engine
- Cost Engine

### Phase 2 — Intelligent Optimization
- Embedding retrieval
- Semantic cache
- Local router
- Browser page context bridge
- Per-platform adapter

### Phase 3 — Request Optimization
- 真实发送前上下文裁剪
- Output token budget 注入
- 更精确的模型 Tokenizer
- 可选的浏览器请求层拦截
- 可量化的云端成本下降报告
