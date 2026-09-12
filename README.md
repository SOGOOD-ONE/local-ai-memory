# Local AI Cost Optimizer

面向网页大模型的**本地成本优化中间层**。

核心目标不是改变 ChatGPT、豆包、Trea 等模型本身，而是在浏览器与网页 LLM 之间增加一个运行在用户本机的优化层：

```text
用户问题
   ↓
Chrome / Edge Extension
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

浏览器层优先支持：

- Microsoft Edge
- Google Chrome

扩展采用 Manifest V3，尽量保持 Chrome / Edge 共用一套代码，通过 Platform Adapter 适配不同网页。

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
│   ├── background.js
│   ├── content/
│   ├── adapters/
│   │   ├── chatgpt.js
│   │   ├── doubao.js
│   │   └── trea.js
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
- Output token budget

### Phase 3 — Browser Integration
- Edge extension
- Chrome extension
- ChatGPT adapter
- 豆包 adapter
- Trea adapter

### Phase 4 — Local AI
- Ollama integration
- Local summarization
- Memory consolidation

### Phase 5 — Evaluation
- Token reduction rate
- Cost reduction
- Answer consistency
- Cache hit rate
- Maximum effective conversation length
