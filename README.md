# Local AI Memory

本地 AI 记忆与上下文压缩中间件。

目标：通过 Chrome Manifest V3 浏览器插件连接本地 Flask 服务，在不改变用户原有 ChatGPT / 豆包 / Trea 使用习惯的前提下，在本机保存对话记忆、进行 Token 统计、相关记忆检索与上下文压缩，并逐步扩展到多平台适配。

## MVP

- Chrome MV3 Extension
- Flask Local Memory Server
- SQLite 本地持久化
- Token 统计
- Context Builder
- 基础短时/长期记忆模型
- ChatGPT Adapter 首个实验目标

## Repository layout

```text
local-ai-memory/
├── backend/
│   ├── app.py
│   ├── database/
│   ├── memory/
│   ├── retrieval/
│   ├── compression/
│   └── token/
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content/
│   ├── adapters/
│   └── popup/
├── tests/
├── docs/
├── requirements.txt
└── README.md
```

## Privacy

MVP 默认只允许本地服务使用 `127.0.0.1` 接口。对话历史、记忆数据和向量数据设计为本机保存，不在本项目中默认上传到第三方服务器。

## Development

当前版本先搭建可测试的软件骨架，再逐步实现平台适配和真正的上下文压缩链路。
