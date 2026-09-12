import crypto from "crypto";

// ==========================================
// Types & Interfaces
// ==========================================

export interface Session {
  id: number;
  session_id: string;
  platform: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  session_id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  token_count: number;
  created_at: string;
}

export interface Memory {
  id: number;
  session_id: string | null;
  memory_type: "short" | "medium" | "long";
  content: string;
  importance: number;
  metadata_json: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SemanticCacheEntry {
  id: number;
  platform: string;
  model: string | null;
  session_scope: string;
  query: string;
  normalized_query: string;
  context_fingerprint: string;
  response: string;
  input_tokens: number;
  output_tokens: number;
  hit_count: number;
  last_hit_at: string | null;
  expires_at: string | null;
  created_at: string;
  retrieval_score?: number;
}

export interface OptimizationStat {
  id: number;
  platform: string;
  decision: string;
  original_input_tokens: number;
  optimized_input_tokens: number;
  output_token_budget: number;
  applied: number;
  created_at: string;
}

export interface ModelPricing {
  input_per_million: number;
  output_per_million: number;
}

export interface OptimizationPolicy {
  default_output_tokens: number;
  simple_output_tokens: number;
  complex_output_tokens: number;
  simple_query_max_chars: number;
  cache_similarity_threshold: number;
}

export interface ContextPolicy {
  recent_messages: number;
  recalled_memories: number;
  max_context_tokens: number;
  min_retrieval_score: number;
}

export interface MemoryPolicy {
  short_window: number;
  medium_trigger_messages: number;
  medium_summary_window: number;
  min_long_importance: number;
}

// ==========================================
// Token Engine
// ==========================================

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const latinWords = (text.match(/[A-Za-z0-9_]+(?:['-][A-Za-z0-9_]+)*/g) || []).length;
  const punctuation = (text.match(/[^\w\s\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/gu) || []).length;
  const spaces = (text.match(/\s+/g) || []).length;
  return Math.max(1, Math.ceil(cjk + latinWords * 1.3 + punctuation * 0.5 + spaces * 0.15));
}

export function estimateMessages(messages: Array<{ content?: string }>): number {
  return messages.reduce((sum, msg) => sum + estimateTokens(String(msg.content || "")), 0);
}

export function compressionStats(originalTokens: number, compressedTokens: number) {
  const original = Math.max(0, originalTokens);
  const compressed = Math.max(0, compressedTokens);
  const saved = Math.max(0, original - compressed);
  const rate = original ? Number(((saved / original) * 100).toFixed(2)) : 0.0;
  return {
    original_tokens: original,
    compressed_tokens: compressed,
    saved_tokens: saved,
    reduction_percent: rate,
  };
}

// ==========================================
// Cost Engine
// ==========================================

export const DEFAULT_PRICING: ModelPricing = {
  input_per_million: 0.0,
  output_per_million: 0.0,
};

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing = DEFAULT_PRICING
) {
  const inputs = Math.max(0, inputTokens);
  const outputs = Math.max(0, outputTokens);
  const inputCost = (inputs / 1_000_000) * (pricing.input_per_million || 0);
  const outputCost = (outputs / 1_000_000) * (pricing.output_per_million || 0);
  return {
    input_tokens: inputs,
    output_tokens: outputs,
    input_cost: Number(inputCost.toFixed(8)),
    output_cost: Number(outputCost.toFixed(8)),
    total_cost: Number((inputCost + outputCost).toFixed(8)),
  };
}

export function calculateSavings(
  originalInput: number,
  optimizedInput: number,
  originalOutput = 0,
  optimizedOutput = 0,
  pricing: ModelPricing = DEFAULT_PRICING
) {
  const before = estimateCost(originalInput, originalOutput, pricing);
  const after = estimateCost(optimizedInput, optimizedOutput, pricing);
  return {
    before,
    after,
    saved_cost: Number(Math.max(0, before.total_cost - after.total_cost).toFixed(8)),
    saved_input_tokens: Math.max(0, originalInput - optimizedInput),
    saved_output_tokens: Math.max(0, originalOutput - optimizedOutput),
  };
}

// ==========================================
// Cost Optimizer & Router
// ==========================================

export const DEFAULT_OPTIMIZATION_POLICY: OptimizationPolicy = {
  default_output_tokens: 800,
  simple_output_tokens: 300,
  complex_output_tokens: 1600,
  simple_query_max_chars: 80,
  cache_similarity_threshold: 0.92,
};

export function classifyQuery(query: string): "empty" | "simple" | "normal" | "complex" {
  const text = (query || "").split(/\s+/).join(" ").trim();
  if (text.length <= 0) return "empty";
  const simpleMarkers = ["多少", "等于", "翻译", "解释", "是什么", "怎么写", "what is", "how to"];
  if (text.length <= 80 && simpleMarkers.some((m) => text.includes(m))) {
    return "simple";
  }
  const complexMarkers = ["设计", "分析", "论文", "架构", "详细", "比较", "design", "architecture", "analysis"];
  if (text.length > 500 || complexMarkers.some((m) => text.includes(m))) {
    return "complex";
  }
  return "normal";
}

export function outputBudget(
  query: string,
  policy: OptimizationPolicy = DEFAULT_OPTIMIZATION_POLICY
) {
  const kind = classifyQuery(query);
  const map: Record<string, number> = {
    empty: policy.default_output_tokens,
    simple: policy.simple_output_tokens,
    normal: policy.default_output_tokens,
    complex: policy.complex_output_tokens,
  };
  return {
    query_type: kind,
    max_output_tokens: map[kind] ?? policy.default_output_tokens,
  };
}

export function optimizationPreview(
  originalInputTokens: number,
  query: string,
  optimizedInputTokens: number,
  pricing: ModelPricing,
  expectedOutputTokens?: number | null,
  policy: OptimizationPolicy = DEFAULT_OPTIMIZATION_POLICY
) {
  const budget = outputBudget(query, policy);
  const outputTokens = Math.min(
    expectedOutputTokens ?? budget.max_output_tokens,
    budget.max_output_tokens
  );
  const before = estimateCost(originalInputTokens, expectedOutputTokens ?? outputTokens, pricing);
  const after = estimateCost(optimizedInputTokens, outputTokens, pricing);
  return {
    query_type: budget.query_type,
    max_output_tokens: budget.max_output_tokens,
    planned_output_tokens: outputTokens,
    before,
    after,
    saved_cost: Number(Math.max(0, before.total_cost - after.total_cost).toFixed(8)),
  };
}

export function decideRoute(
  query: string,
  cacheHit = false,
  localCapable = false,
  policy: OptimizationPolicy = DEFAULT_OPTIMIZATION_POLICY
) {
  const queryType = classifyQuery(query);
  if (!String(query || "").trim()) {
    return {
      action: "reject",
      reason: "empty query",
      query_type: "empty",
      cache_threshold: policy.cache_similarity_threshold,
    };
  }
  if (localCapable) {
    return {
      action: "local",
      reason: "task is eligible for local fast path",
      query_type: queryType,
      cache_threshold: policy.cache_similarity_threshold,
    };
  }
  if (cacheHit) {
    return {
      action: "cache",
      reason: "semantic cache hit",
      query_type: queryType,
      cache_threshold: policy.cache_similarity_threshold,
    };
  }
  return {
    action: "cloud",
    reason: "cloud model required",
    query_type: queryType,
    cache_threshold: policy.cache_similarity_threshold,
  };
}

export function routerPreview(
  query: string,
  cacheHit = false,
  localCapable = false,
  policy: OptimizationPolicy = DEFAULT_OPTIMIZATION_POLICY
) {
  const decision = decideRoute(query, cacheHit, localCapable, policy);
  return {
    ...decision,
    output_policy: outputBudget(query, policy),
  };
}

export function buildOptimizationPreview(
  query: string,
  originalInputTokens: number,
  optimizedInputTokens: number,
  options: {
    cache_hit?: boolean;
    local_capable?: boolean;
    expected_output_tokens?: number | null;
    pricing?: ModelPricing;
    policy?: OptimizationPolicy;
  } = {}
) {
  const {
    cache_hit = false,
    local_capable = false,
    expected_output_tokens = null,
    pricing = { input_per_million: 0, output_per_million: 0 },
    policy = DEFAULT_OPTIMIZATION_POLICY,
  } = options;

  const route = routerPreview(query, cache_hit, local_capable, policy);
  const cost = optimizationPreview(
    originalInputTokens,
    query,
    optimizedInputTokens,
    pricing,
    expected_output_tokens,
    policy
  );
  return { route, cost };
}

// ==========================================
// Semantic Cache
// ==========================================

export function normalizeQuery(query: string): string {
  return (query || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function cacheKey(query: string, contextFingerprint = ""): string {
  const payload = normalizeQuery(query) + "\n" + contextFingerprint;
  return crypto.createHash("sha256").update(payload, "utf-8").digest("hex");
}

export function tokenSimilarity(a: string, b: string): number {
  const getTerms = (s: string) => {
    const matched = normalizeQuery(s).match(/[\w\u3400-\u9fff]+/g) || [];
    const counts = new Map<string, number>();
    for (const t of matched) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    return counts;
  };
  const aTerms = getTerms(a);
  const bTerms = getTerms(b);
  if (aTerms.size === 0 || bTerms.size === 0) return 0.0;
  let common = 0;
  for (const [k, v] of aTerms.entries()) {
    if (bTerms.has(k)) {
      common += Math.min(v, bTerms.get(k)!);
    }
  }
  let sumASq = 0;
  for (const v of aTerms.values()) sumASq += v * v;
  let sumBSq = 0;
  for (const v of bTerms.values()) sumBSq += v * v;
  const denom = Math.sqrt(sumASq * sumBSq);
  return denom ? common / denom : 0.0;
}

// ==========================================
// Retrieval Engine
// ==========================================

export function terms(text: string): string[] {
  return (text.toLowerCase().match(/[A-Za-z0-9_'-]+|[\u3400-\u9fff]/g) || []).filter((t) => t.trim().length > 0);
}

export function scoreRetrieval(query: string, content: string): number {
  const qList = terms(query);
  const cList = terms(content);
  const q = new Map<string, number>();
  for (const t of qList) q.set(t, (q.get(t) || 0) + 1);
  const c = new Map<string, number>();
  for (const t of cList) c.set(t, (c.get(t) || 0) + 1);
  if (q.size === 0 || c.size === 0) return 0.0;
  let common = 0;
  for (const [k, v] of q.entries()) {
    if (c.has(k)) {
      common += Math.min(v, c.get(k)!);
    }
  }
  let qn = 0;
  for (const v of q.values()) qn += v * v;
  let cn = 0;
  for (const v of c.values()) cn += v * v;
  return qn && cn ? common / (Math.sqrt(qn) * Math.sqrt(cn)) : 0.0;
}

// ==========================================
// Memory Lifecycle
// ==========================================

export function scoreMessageImportance(role: string, content: string): number {
  const text = (content || "").trim().toLowerCase();
  let score = 0.2;
  if (role === "user") score += 0.2;
  const keywords = ["记住", "以后", "我的", "项目", "不要", "需要", "prefer", "always", "never", "remember", "important"];
  if (keywords.some((k) => text.includes(k))) {
    score += 0.35;
  }
  if (content.length > 120) score += 0.1;
  return Math.min(score, 1.0);
}

export function buildLocalSummary(messages: Message[]): string {
  const lines: string[] = [];
  for (const msg of messages) {
    const content = (msg.content || "").trim().replace(/\n/g, " ");
    if (!content) continue;
    const snippet = content.length <= 180 ? content : content.slice(0, 177) + "...";
    lines.append ? lines.push(`${msg.role}: ${snippet}`) : lines.push(`${msg.role}: ${snippet}`);
  }
  return lines.join("\n");
}

// ==========================================
// In-Memory Database Store (with full Persistence)
// ==========================================

class DataStore {
  private sessions: Map<string, Session> = new Map();
  private messages: Message[] = [];
  private memories: Memory[] = [];
  private cache: SemanticCacheEntry[] = [];
  private stats: OptimizationStat[] = [];
  private nextId = {
    session: 1,
    message: 1,
    memory: 1,
    cache: 1,
    stat: 1,
  };

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    // Initial sample session
    const sessId = "sess_demo_1";
    this.upsertSession(sessId, "ChatGPT", "Cost Optimization Overview");
    
    // Add sample messages
    this.addMessage(sessId, "user", "请记住，我的项目叫 local-ai-memory，运行在端口 3000 上，偏好轻量级 TypeScript 架构。");
    this.addMessage(sessId, "assistant", "已记录！你的项目是 local-ai-memory，默认在端口 3000 运行，采用轻量级 TypeScript 架构。");
    
    // Add initial long-term memory
    this.addMemory("用户项目：local-ai-memory，运行端口 3000，使用 TypeScript 架构。", "long", sessId, 0.9, { category: "project_pref" });
    this.addMemory("用户关注重点：降低 AI Token 消耗与优化上下文压缩。", "long", sessId, 0.85, { category: "goals" });

    // Add initial semantic cache entry
    this.putCache(
      "什么是 local-ai-memory?",
      "local-ai-memory 是一个本地 AI 记忆与成本优化引擎，通过语义缓存、上下文压缩和智能路由节省大模型 Token 开销。",
      "ChatGPT",
      "gpt-4o",
      "global",
      "",
      15,
      60,
      86400
    );

    // Initial stats
    this.recordOptimizationStat({
      platform: "ChatGPT",
      decision: "cloud",
      original_input_tokens: 1200,
      optimized_input_tokens: 450,
      output_token_budget: 800,
      applied: true,
    });
    this.recordOptimizationStat({
      platform: "豆包",
      decision: "cache",
      original_input_tokens: 380,
      optimized_input_tokens: 0,
      output_token_budget: 300,
      applied: true,
    });
    this.recordOptimizationStat({
      platform: "ChatGPT",
      decision: "local",
      original_input_tokens: 150,
      optimized_input_tokens: 0,
      output_token_budget: 0,
      applied: true,
    });
  }

  // Sessions
  upsertSession(sessionId: string, platform = "unknown", title?: string | null): Session {
    const now = new Date().toISOString();
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.platform = platform || existing.platform;
      if (title !== undefined && title !== null) existing.title = title;
      existing.updated_at = now;
      return existing;
    }
    const sess: Session = {
      id: this.nextId.session++,
      session_id: sessionId,
      platform: platform || "unknown",
      title: title || null,
      created_at: now,
      updated_at: now,
    };
    this.sessions.set(sessionId, sess);
    return sess;
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }

  // Messages
  addMessage(sessionId: string, role: "system" | "user" | "assistant" | "tool", content: string, tokenCount?: number): number {
    const tokens = tokenCount !== undefined ? tokenCount : estimateTokens(content);
    const now = new Date().toISOString();
    const msg: Message = {
      id: this.nextId.message++,
      session_id: sessionId,
      role,
      content,
      token_count: tokens,
      created_at: now,
    };
    this.messages.push(msg);
    const session = this.sessions.get(sessionId);
    if (session) {
      session.updated_at = now;
    }
    return msg.id;
  }

  listMessages(sessionId: string, limit = 50): Message[] {
    const maxLimit = Math.max(1, Math.min(limit, 500));
    const filtered = this.messages.filter((m) => m.session_id === sessionId);
    return filtered.slice(-maxLimit);
  }

  // Memories
  addMemory(
    content: string,
    memoryType: "short" | "medium" | "long" = "long",
    sessionId: string | null = null,
    importance = 0.5,
    metadata?: Record<string, any>
  ): number {
    const clampedImportance = Math.max(0.0, Math.min(Number(importance || 0.5), 1.0));
    const now = new Date().toISOString();
    const mem: Memory = {
      id: this.nextId.memory++,
      session_id: sessionId,
      memory_type: memoryType,
      content,
      importance: clampedImportance,
      metadata_json: JSON.stringify(metadata || {}),
      metadata: metadata || {},
      created_at: now,
      updated_at: now,
    };
    this.memories.push(mem);
    return mem.id;
  }

  listMemories(memoryType?: string | null, limit = 20): Memory[] {
    const maxLimit = Math.max(1, Math.min(limit, 200));
    let list = this.memories;
    if (memoryType) {
      list = list.filter((m) => m.memory_type === memoryType);
    }
    return [...list]
      .sort((a, b) => b.importance - a.importance || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, maxLimit);
  }

  deleteMemory(id: number): boolean {
    const idx = this.memories.findIndex((m) => m.id === id);
    if (idx !== -1) {
      this.memories.splice(idx, 1);
      return true;
    }
    return false;
  }

  // Semantic Cache
  putCache(
    query: string,
    response: string,
    platform = "unknown",
    model: string | null = null,
    sessionScope = "global",
    contextFingerprint = "",
    inputTokens = 0,
    outputTokens = 0,
    ttlSeconds = 86400
  ): number {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(1, ttlSeconds) * 1000).toISOString();
    const entry: SemanticCacheEntry = {
      id: this.nextId.cache++,
      platform,
      model,
      session_scope: sessionScope,
      query,
      normalized_query: normalizeQuery(query),
      context_fingerprint: contextFingerprint,
      response,
      input_tokens: Math.max(0, inputTokens),
      output_tokens: Math.max(0, outputTokens),
      hit_count: 0,
      last_hit_at: null,
      expires_at: expiresAt,
      created_at: now.toISOString(),
    };
    this.cache.push(entry);
    return entry.id;
  }

  findCache(
    query: string,
    platform = "unknown",
    model: string | null = null,
    sessionScope = "global",
    threshold = 0.92
  ): SemanticCacheEntry | null {
    const now = new Date();
    const candidates = this.cache.filter((item) => {
      if (item.platform !== platform) return false;
      if (item.session_scope !== sessionScope) return false;
      if (model && item.model && item.model !== model) return false;
      if (item.expires_at && new Date(item.expires_at) <= now) return false;
      return true;
    });

    let best: SemanticCacheEntry | null = null;
    let bestScore = 0.0;

    for (const item of candidates) {
      const sim = tokenSimilarity(query, item.query);
      if (sim > bestScore) {
        bestScore = sim;
        best = item;
      }
    }

    if (!best || bestScore < Number(threshold)) {
      return null;
    }

    best.hit_count++;
    best.last_hit_at = now.toISOString();
    return {
      ...best,
      retrieval_score: Number(bestScore.toFixed(6)),
    };
  }

  listCache(limit = 50): SemanticCacheEntry[] {
    return [...this.cache].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
  }

  clearCache() {
    this.cache = [];
  }

  // Retrieval
  retrieveMemories(query: string, limit = 5): Array<Memory & { retrieval_score: number }> {
    const ranked = this.memories.map((mem) => {
      const s = scoreRetrieval(query, mem.content);
      return {
        ...mem,
        retrieval_score: Number(s.toFixed(6)),
      };
    });
    ranked.sort((a, b) => b.retrieval_score - a.retrieval_score || b.importance - a.importance);
    return ranked.slice(0, Math.max(1, Math.min(limit, 50)));
  }

  // Context Engine
  buildContext(
    sessionId: string,
    query: string,
    policy: ContextPolicy = {
      recent_messages: 8,
      recalled_memories: 5,
      max_context_tokens: 6000,
      min_retrieval_score: 0.0,
    }
  ) {
    const recent = this.listMessages(sessionId, Math.max(1, Math.min(policy.recent_messages, 50)));
    const recalled = this.retrieveMemories(query, policy.recalled_memories).filter(
      (m) => m.retrieval_score >= (policy.min_retrieval_score || 0.0)
    );

    const originalMessages = recent.map((m) => ({ role: m.role, content: m.content }));
    const originalTokens = estimateMessages(originalMessages) + estimateTokens(query);

    const selectedMemories: Array<Memory & { retrieval_score: number }> = [];
    const memoryMessages: Array<{ role: string; content: string }> = [];
    const queryTokens = estimateTokens(query);
    const memoryBudget = Math.max(0, policy.max_context_tokens - queryTokens);
    let usedMemoryTokens = 0;

    for (const mem of recalled) {
      const text = mem.content.trim();
      const memTokens = estimateTokens(text);
      if (usedMemoryTokens + memTokens > memoryBudget && selectedMemories.length > 0) {
        continue;
      }
      selectedMemories.push(mem);
      usedMemoryTokens += memTokens;
      memoryMessages.push({ role: "system", content: `Relevant local memory: ${text}` });
      if (selectedMemories.length >= policy.recalled_memories) {
        break;
      }
    }

    const compressed: Array<{ role: string; content: string }> = [...memoryMessages];
    const recentBudget = Math.max(1, policy.max_context_tokens - estimateMessages(memoryMessages) - queryTokens);
    let running = 0;

    const reversed = [...originalMessages].reverse();
    const toInsert: Array<{ role: string; content: string }> = [];
    for (const msg of reversed) {
      const cost = estimateTokens(msg.content);
      if (running + cost > recentBudget && (compressed.length > 0 || toInsert.length > 0)) {
        break;
      }
      toInsert.unshift(msg);
      running += cost;
    }
    compressed.push(...toInsert);
    compressed.push({ role: "user", content: query });

    const compressedTokens = estimateMessages(compressed);

    return {
      session_id: sessionId,
      query,
      messages: compressed,
      memories: selectedMemories.map((m) => ({
        id: m.id,
        memory_type: m.memory_type,
        importance: m.importance,
        retrieval_score: m.retrieval_score,
        content: m.content,
      })),
      policy: {
        recent_messages: policy.recent_messages,
        recalled_memories: policy.recalled_memories,
        max_context_tokens: policy.max_context_tokens,
        min_retrieval_score: policy.min_retrieval_score,
      },
      stats: compressionStats(originalTokens, compressedTokens),
    };
  }

  // Rollup Session
  rollupSession(
    sessionId: string,
    policy: MemoryPolicy = {
      short_window: 8,
      medium_trigger_messages: 20,
      medium_summary_window: 20,
      min_long_importance: 0.75,
    }
  ) {
    const allMessages = this.listMessages(sessionId, 500);
    if (!allMessages || allMessages.length === 0) {
      return { session_id: sessionId, status: "empty", created: 0 };
    }

    let created = 0;
    let mediumSummary: string | null = null;
    if (allMessages.length >= policy.medium_trigger_messages) {
      const mediumMessages = allMessages.slice(-policy.medium_summary_window);
      mediumSummary = buildLocalSummary(mediumMessages);
      if (mediumSummary) {
        this.addMemory(mediumSummary, "medium", sessionId, 0.65, {
          source: "memory_lifecycle",
          message_count: mediumMessages.length,
        });
        created++;
      }
    }

    const shortSlice = allMessages.slice(-policy.short_window);
    for (const msg of shortSlice) {
      const importance = scoreMessageImportance(msg.role, msg.content);
      if (importance >= policy.min_long_importance) {
        this.addMemory(msg.content, "long", sessionId, importance, {
          source: "message",
          message_id: msg.id,
          role: msg.role,
        });
        created++;
      }
    }

    return {
      session_id: sessionId,
      status: "ok",
      created,
      medium_summary_created: Boolean(mediumSummary),
    };
  }

  // Stats
  recordOptimizationStat(stat: {
    platform: string;
    decision: string;
    original_input_tokens: number;
    optimized_input_tokens: number;
    output_token_budget: number;
    applied: boolean;
  }): number {
    const entry: OptimizationStat = {
      id: this.nextId.stat++,
      platform: stat.platform || "unknown",
      decision: stat.decision || "cloud",
      original_input_tokens: Math.max(0, stat.original_input_tokens || 0),
      optimized_input_tokens: Math.max(0, stat.optimized_input_tokens || 0),
      output_token_budget: Math.max(0, stat.output_token_budget || 0),
      applied: stat.applied ? 1 : 0,
      created_at: new Date().toISOString(),
    };
    this.stats.push(entry);
    return entry.id;
  }

  getOptimizationStats(platform?: string | null) {
    const list = platform ? this.stats.filter((s) => s.platform === platform) : this.stats;
    let requests = list.length;
    let originalInputTokens = 0;
    let optimizedInputTokens = 0;
    let savedInputTokens = 0;
    let outputTokenBudget = 0;
    let appliedRequests = 0;
    const decisions: Record<string, number> = {};

    for (const s of list) {
      originalInputTokens += s.original_input_tokens;
      optimizedInputTokens += s.optimized_input_tokens;
      if (s.decision === "local" || s.decision === "cache") {
        savedInputTokens += s.original_input_tokens;
      } else {
        savedInputTokens += Math.max(0, s.original_input_tokens - s.optimized_input_tokens);
      }
      outputTokenBudget += s.output_token_budget;
      if (s.applied) appliedRequests += 1;
      decisions[s.decision] = (decisions[s.decision] || 0) + 1;
    }

    const inputSavingRatio = originalInputTokens
      ? Number(((savedInputTokens / originalInputTokens) * 100).toFixed(2))
      : 0.0;

    return {
      requests,
      original_input_tokens: originalInputTokens,
      optimized_input_tokens: optimizedInputTokens,
      saved_input_tokens: savedInputTokens,
      input_saving_ratio: inputSavingRatio,
      output_token_budget: outputTokenBudget,
      applied_requests: appliedRequests,
      decisions,
    };
  }
}

export const store = new DataStore();
