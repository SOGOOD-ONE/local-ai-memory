import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import {
  store,
  estimateTokens,
  buildOptimizationPreview,
  DEFAULT_PRICING,
  DEFAULT_OPTIMIZATION_POLICY,
  MemoryPolicy,
  ContextPolicy,
  OptimizationPolicy,
} from "./src/optimizer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Enable CORS for all allowed origins & browser extensions
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or extension popups)
      // and web origins
      callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ==========================================
// API Routes (Exact match with backend/app.py)
// ==========================================

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "local-ai-memory",
    version: "0.7.0",
    engine: "node-express-ts",
    timestamp: new Date().toISOString(),
  });
});

// Session creation / upsert
app.post("/api/session", (req: Request, res: Response) => {
  const data = req.body || {};
  const sessionId = String(data.session_id || "").trim();
  if (!sessionId) {
    return res.status(400).json({ error: "session_id is required" });
  }
  const platform = String(data.platform || "unknown");
  const title = data.title ? String(data.title) : undefined;
  store.upsertSession(sessionId, platform, title);
  return res.json({ status: "ok", session_id: sessionId });
});

// List all sessions (Extended endpoint for dashboard)
app.get("/api/sessions", (_req: Request, res: Response) => {
  return res.json({ sessions: store.listSessions() });
});

// Add message
app.post("/api/message", (req: Request, res: Response) => {
  const data = req.body || {};
  const sessionId = String(data.session_id || "").trim();
  const role = String(data.role || "").trim() as "system" | "user" | "assistant" | "tool";
  const content = String(data.content || "");

  if (!sessionId || !["system", "user", "assistant", "tool"].includes(role) || !content) {
    return res.status(400).json({ error: "session_id, valid role and content are required" });
  }

  store.upsertSession(sessionId, String(data.platform || "unknown"));
  const tokenCount = estimateTokens(content);
  const messageId = store.addMessage(sessionId, role, content, tokenCount);
  return res.json({ status: "ok", message_id: messageId, token_count: tokenCount });
});

// List messages in a session
app.get("/api/session/:session_id/messages", (req: Request, res: Response) => {
  const sessionId = req.params.session_id;
  const limit = parseInt(String(req.query.limit || "50"), 10) || 50;
  const messages = store.listMessages(sessionId, limit);
  return res.json({ session_id: sessionId, messages });
});

// Create memory
app.post("/api/memory", (req: Request, res: Response) => {
  const data = req.body || {};
  const content = String(data.content || "").trim();
  const memoryType = String(data.memory_type || "long") as "short" | "medium" | "long";

  if (!content || !["short", "medium", "long"].includes(memoryType)) {
    return res.status(400).json({ error: "content and valid memory_type are required" });
  }

  const importance = parseFloat(String(data.importance ?? 0.5)) || 0.5;
  const memoryId = store.addMemory(
    content,
    memoryType,
    data.session_id ? String(data.session_id) : null,
    importance,
    typeof data.metadata === "object" ? data.metadata : {}
  );
  return res.json({ status: "ok", memory_id: memoryId });
});

// List memories
app.get("/api/memories", (req: Request, res: Response) => {
  const memoryType = req.query.type ? String(req.query.type) : null;
  const limit = parseInt(String(req.query.limit || "20"), 10) || 20;
  return res.json({ memories: store.listMemories(memoryType, limit) });
});

// Delete memory
app.delete("/api/memories/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const success = store.deleteMemory(id);
  return res.json({ status: success ? "ok" : "not_found" });
});

// Memory lifecycle rollup
app.post("/api/session/:session_id/rollup", (req: Request, res: Response) => {
  const sessionId = req.params.session_id;
  const data = req.body || {};

  const policy: MemoryPolicy = {
    short_window: Math.max(1, Math.min(parseInt(String(data.short_window || 8), 10) || 8, 50)),
    medium_trigger_messages: Math.max(5, Math.min(parseInt(String(data.medium_trigger_messages || 20), 10) || 20, 500)),
    medium_summary_window: Math.max(5, Math.min(parseInt(String(data.medium_summary_window || 20), 10) || 20, 100)),
    min_long_importance: Math.max(0.0, Math.min(parseFloat(String(data.min_long_importance ?? 0.75)) || 0.75, 1.0)),
  };

  const result = store.rollupSession(sessionId, policy);
  return res.json(result);
});

// Context Engine: Build context
app.post("/api/context/build", (req: Request, res: Response) => {
  const data = req.body || {};
  const sessionId = String(data.session_id || "").trim();
  const query = String(data.query || "").trim();

  if (!sessionId || !query) {
    return res.status(400).json({ error: "session_id and query are required" });
  }

  const policy: ContextPolicy = {
    recent_messages: Math.max(1, Math.min(parseInt(String(data.recent_limit || 8), 10) || 8, 50)),
    recalled_memories: Math.max(1, Math.min(parseInt(String(data.memory_limit || 5), 10) || 5, 50)),
    max_context_tokens: Math.max(256, Math.min(parseInt(String(data.max_context_tokens || 6000), 10) || 6000, 32000)),
    min_retrieval_score: Math.max(0.0, Math.min(parseFloat(String(data.min_retrieval_score ?? 0.0)) || 0.0, 1.0)),
  };

  const result = store.buildContext(sessionId, query, policy);
  return res.json(result);
});

// Semantic Cache: Lookup
app.post("/api/cache/lookup", (req: Request, res: Response) => {
  const data = req.body || {};
  const query = String(data.query || "").trim();
  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  const threshold = parseFloat(String(data.threshold ?? 0.92)) || 0.92;
  const result = store.findCache(
    query,
    String(data.platform || "unknown"),
    data.model ? String(data.model) : null,
    String(data.session_scope || "global"),
    Math.max(0.0, Math.min(threshold, 1.0))
  );

  return res.json({ hit: result !== null, entry: result });
});

// Semantic Cache: Store
app.post("/api/cache/store", (req: Request, res: Response) => {
  const data = req.body || {};
  const query = String(data.query || "").trim();
  const response = String(data.response || "");

  if (!query || !response) {
    return res.status(400).json({ error: "query and response are required" });
  }

  try {
    const entryId = store.putCache(
      query,
      response,
      String(data.platform || "unknown"),
      data.model ? String(data.model) : null,
      String(data.session_scope || "global"),
      String(data.context_fingerprint || ""),
      parseInt(String(data.input_tokens || 0), 10) || 0,
      parseInt(String(data.output_tokens || 0), 10) || 0,
      parseInt(String(data.ttl_seconds || 86400), 10) || 86400
    );
    return res.json({ status: "ok", cache_id: entryId });
  } catch (err: any) {
    return res.status(400).json({ error: "invalid cache parameters", details: err?.message });
  }
});

// List Semantic Cache
app.get("/api/cache", (req: Request, res: Response) => {
  const limit = parseInt(String(req.query.limit || "50"), 10) || 50;
  return res.json({ entries: store.listCache(limit) });
});

// Optimize Preview
app.post("/api/optimize/preview", (req: Request, res: Response) => {
  const data = req.body || {};
  const query = String(data.query || "").trim();
  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  let originalContext = String(data.original_context || "").trim();
  let optimizedContext = String(data.optimized_context || "").trim();
  if (!originalContext) originalContext = query;
  if (!optimizedContext) optimizedContext = query;

  try {
    const originalInput = parseInt(
      String(data.original_input_tokens || estimateTokens(originalContext)),
      10
    ) || estimateTokens(originalContext);
    const optimizedInput = parseInt(
      String(data.optimized_input_tokens || estimateTokens(optimizedContext)),
      10
    ) || estimateTokens(optimizedContext);

    const inputPrice = parseFloat(String(data.input_per_million || 0.0)) || 0.0;
    const outputPrice = parseFloat(String(data.output_per_million || 0.0)) || 0.0;
    const expectedOutput = data.expected_output_tokens !== undefined && data.expected_output_tokens !== null
      ? parseInt(String(data.expected_output_tokens), 10)
      : null;

    const result = buildOptimizationPreview(
      query,
      Math.max(0, originalInput),
      Math.max(0, optimizedInput),
      {
        cache_hit: Boolean(data.cache_hit),
        local_capable: Boolean(data.local_capable),
        expected_output_tokens: expectedOutput,
        pricing: { input_per_million: inputPrice, output_per_million: outputPrice },
        policy: DEFAULT_OPTIMIZATION_POLICY,
      }
    );
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: "invalid numeric optimization parameters", details: err?.message });
  }
});

// Record Statistics
app.post("/api/stats/record", (req: Request, res: Response) => {
  const data = req.body || {};
  try {
    const statId = store.recordOptimizationStat({
      platform: String(data.platform || "unknown"),
      decision: String(data.decision || "cloud"),
      original_input_tokens: parseInt(String(data.original_input_tokens || 0), 10) || 0,
      optimized_input_tokens: parseInt(String(data.optimized_input_tokens || 0), 10) || 0,
      output_token_budget: parseInt(String(data.output_token_budget || 0), 10) || 0,
      applied: Boolean(data.applied),
    });
    return res.json({ status: "ok", stat_id: statId });
  } catch (err: any) {
    return res.status(400).json({ error: "invalid statistics parameters", details: err?.message });
  }
});

// Get Statistics
app.get("/api/stats", (req: Request, res: Response) => {
  const platform = req.query.platform ? String(req.query.platform) : null;
  return res.json(store.getOptimizationStats(platform));
});

// Serve Static Frontend and extension files
app.use(express.static(path.join(__dirname, "public")));
app.use("/extension", express.static(path.join(__dirname, "extension")));

// Fallback to index.html for SPA routes
app.get("*", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[local-ai-memory] Server is running on http://0.0.0.0:${PORT}`);
});
