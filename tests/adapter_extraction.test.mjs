/**
 * Adapter extraction test (jsdom fixtures)
 *
 * Loads the REAL content-script files (adapter.js + <platform>_adapter_v2.js)
 * into a jsdom page whose DOM mimics each platform's chat structure, then
 * asserts that the adapter extracts the correct messages and platform tag.
 *
 * This verifies adapter LOGIC (role detection, wrapper dedup, composer
 * capture, platform tagging, fingerprint dedup) and the INJECTION CHAIN
 * (adapter -> send_bridge -> platform sender -> context panel -> send_guard
 * -> composer rewrite -> recordStats). It does not replace a live
 * end-to-end test against a logged-in session.
 *
 * Run: node tests/adapter_extraction.test.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, '..', 'extension', 'content');

// ---------------------------------------------------------------------------
// Fixtures: one per platform, mimicking the DOM each adapter targets.
// Each fixture includes a wrapper node (must be skipped) so dedup is covered.
// ---------------------------------------------------------------------------
const FIXTURES = {
  deepseek: {
    file: 'deepseek_adapter_v2.js',
    url: 'https://chat.deepseek.com/a/chat/s/abc',
    html: `
      <main>
        <div class="message-list">
          <div class="message-item" data-message-author-role="user">
            <div class="content">如何学习中国象棋？</div>
          </div>
          <div class="message-item" data-message-author-role="assistant">
            <div class="content">学习中国象棋建议从规则入手。</div>
          </div>
        </div>
        <div class="input-wrapper"><textarea placeholder="给 DeepSeek 发送消息"></textarea></div>
      </main>`,
    expectedPlatform: 'deepseek',
    expectedQuery: '如何学习中国象棋？',
    expectedRoles: ['user', 'assistant'],
  },

  qwen: {
    file: 'qwen_adapter_v2.js',
    url: 'https://www.qianwen.com/chat/xyz',
    html: `
      <main>
        <div class="conversation-list">
          <div class="message-item" data-role="user"><span>帮我写一段自我介绍</span></div>
          <div class="message-item" data-role="assistant"><span>当然可以，以下是一段自我介绍。</span></div>
        </div>
        <div class="editor"><div contenteditable="true" role="textbox"></div></div>
      </main>`,
    expectedPlatform: 'qwen',
    expectedQuery: '帮我写一段自我介绍',
    expectedRoles: ['user', 'assistant'],
  },

  chatglm: {
    file: 'chatglm_adapter_v2.js',
    url: 'https://chatglm.cn/main/alltoolsdetail',
    html: `
      <main>
        <div class="msg-list">
          <div class="msg-item" aria-label="用户消息"><div>推理题怎么做？</div></div>
          <div class="msg-item" aria-label="助手消息"><div>先明确已知条件，再逐步推导。</div></div>
        </div>
        <div class="chat-input"><div contenteditable="true" role="textbox"></div></div>
      </main>`,
    expectedPlatform: 'chatglm',
    expectedQuery: '推理题怎么做？',
    expectedRoles: ['user', 'assistant'],
  },

  kimi: {
    file: 'kimi_adapter_v2.js',
    url: 'https://www.kimi.com/chat/123',
    html: `
      <main>
        <div class="chat-content">
          <div class="message-item" data-message-author-role="user"><span>总结这篇文章</span></div>
          <div class="message-item" data-message-author-role="assistant"><span>这篇文章主要讲了三点。</span></div>
        </div>
        <div class="chat-input-editor" contenteditable="true" role="textbox"></div>
      </main>`,
    expectedPlatform: 'kimi',
    expectedQuery: '总结这篇文章',
    expectedRoles: ['user', 'assistant'],
  },

  // Mirrors the real Doubao conversation DOM verified live: no role-bearing
  // attributes at all, messages anchored by [data-message-id], and the role
  // derived from layout (author messages right-aligned, assistant in a grid).
  doubao: {
    file: 'doubao_adapter_v2.js',
    url: 'https://www.doubao.com/chat/456',
    html: `
      <main>
        <div class="message-list-zLoNs1 opacity-100">
          <div data-message-id="55210028592642818" class="flex-row flex w-full justify-end">
            <div class="flex flex-col flex-grow max-w-full min-w-0">
              <div class="content-KTJ1Rj rounded-s-radius-s">推荐几本书</div>
            </div>
          </div>
          <div data-message-id="55210028592650498" class="relative grid w-full grid-cols-[minmax(0,1fr)_auto]">
            <div class="flex flex-col flex-grow max-w-full min-w-0">
              <div class="content-KTJ1Rj rounded-s-radius-s">推荐这几本经典读物。</div>
            </div>
          </div>
        </div>
        <div class="input-area"><div class="tiptap ProseMirror" contenteditable="true" role="textbox"></div></div>
      </main>`,
    expectedPlatform: 'doubao',
    expectedQuery: '推荐几本书',
    expectedRoles: ['user', 'assistant'],
  },

  // File keeps the historical "trea" spelling; the live domain is trae.ai.
  trae: {
    file: 'trea_adapter_v2.js',
    url: 'https://work.trae.ai/chat/789',
    html: `
      <main>
        <div class="message-list">
          <div class="message-item" data-role="user"><div>帮我整理这份周报</div></div>
          <div class="message-item" data-role="assistant"><div>已按项目维度整理完成。</div></div>
        </div>
        <div class="composer"><div contenteditable="true" role="textbox"></div></div>
      </main>`,
    expectedPlatform: 'trea',
    expectedQuery: '帮我整理这份周报',
    expectedRoles: ['user', 'assistant'],
  },
};

// Composer-capture scenario: text typed but not yet sent must be picked up.
const COMPOSER_FIXTURE = {
  file: 'deepseek_adapter_v2.js',
  url: 'https://chat.deepseek.com/a/chat/s/composer',
  html: `
    <main>
      <div class="message-item" data-message-author-role="user"><div>第一个问题</div></div>
      <div class="message-item" data-message-author-role="assistant"><div>第一个回答</div></div>
      <div class="input-wrapper"><textarea placeholder="给 DeepSeek 发送消息">第二个问题（尚未发送）</textarea></div>
    </main>`,
  expectedQuery: '第二个问题（尚未发送）',
};

// Negative control: with no user message the adapter must NOT emit an event.
// This proves the harness has teeth (it is not trivially passing).
const NEGATIVE_FIXTURE = {
  file: 'kimi_adapter_v2.js',
  url: 'https://www.kimi.com/chat/empty',
  html: `
    <main>
      <div class="chat-content">
        <div class="message-item" data-message-author-role="assistant"><span>只有助手消息</span></div>
      </div>
      <div class="chat-input-editor" contenteditable="true" role="textbox"></div>
    </main>`,
};

// ---------------------------------------------------------------------------
// Injection chain fixture data
// ---------------------------------------------------------------------------
// Text the user has typed into the composer but not yet sent. The adapter
// adopts it as the query, so send_guard is allowed to rewrite the composer.
const INJECTION_COMPOSER_TEXT = {
  deepseek: '再讲讲开局技巧',
  qwen: '这段话再正式一点',
  chatglm: '换个思路解释',
  kimi: '压缩到一百字',
  doubao: '给个书单',
  trae: '周报再加两行',
};

// Real URLs observed while testing (redirect targets included) that must be
// routed to the right adapter. Guards the two domain bugs found live:
// the "trea.ai" typo and Qwen's migration to qianwen.com.
const ROUTE_REGRESSIONS = [
  { url: 'https://www.qianwen.com/?ch=tongyi_redirect', platform: 'qwen' },
  { url: 'https://trae.ai/chat/1', platform: 'trae' },
  { url: 'https://kimi.com/chat/1', platform: 'kimi' },
  { url: 'https://kimi.moonshot.cn/chat/1', platform: 'kimi' },
  { url: 'https://doubao.com/chat/1', platform: 'doubao' },
];

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
function makeDom(html, url) {
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
}

function stubChrome(dom) {
  const calls = [];
  dom.window.chrome = {
    runtime: {
      id: 'test-extension-id',
      lastError: null,
      sendMessage(message, callback) {
        calls.push(message);
        callback({
          ok: true,
          data: {
            route: { decision: 'cloud', reason: 'cloud model required', cache_hit: false },
            cost: {
              original_input_tokens: 120,
              optimized_input_tokens: 70,
              output_token_budget: 512,
            },
          },
        });
      },
    },
  };
  return calls;
}

function loadScripts(dom, files) {
  for (const file of files) {
    const code = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    dom.window.eval(code);
  }
}

function runAdapter(dom, platformFile) {
  loadScripts(dom, ['adapter.js', platformFile]);
}

/**
 * jsdom does not implement innerText; real browsers do. Adapters and
 * send_guard read innerText when a node has no `value`, so shim it onto
 * textContent to match browser behaviour.
 */
function installInnerTextShim(dom) {
  Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() { return this.textContent; },
    set(value) { this.textContent = value; },
  });
}

/** Resolve the full content-script list a manifest entry injects for a file. */
function scriptsFor(manifest, platformFile) {
  const entry = manifest.content_scripts.find((cs) => cs.js.includes(`content/${platformFile}`));
  return entry ? entry.js : [];
}

/** Load manifest-declared paths (`content/x.js`) relative to the content dir. */
function loadManifestScripts(dom, manifestJsList) {
  loadScripts(dom, manifestJsList.map((js) => js.replace(/^content\//, '')));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Translate a Chrome match pattern into an equivalent RegExp. */
function matchPatternToRegex(pattern) {
  const parsed = /^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/.exec(pattern);
  if (!parsed) return null;
  const [, scheme, host, pathPart] = parsed;
  const schemeRe = scheme === '*' ? 'https?' : scheme;
  let hostRe;
  if (host === '*') hostRe = '[^/]+';
  else if (host.startsWith('*.')) hostRe = `(?:[^/]+\\.)?${escapeRegex(host.slice(2))}`;
  else hostRe = escapeRegex(host);
  const pathRe = escapeRegex(pathPart).replace(/\\\*/g, '.*');
  return new RegExp(`^${schemeRe}://${hostRe}${pathRe}$`);
}

function manifestEntryForUrl(manifest, url) {
  return manifest.content_scripts.find((cs) =>
    cs.matches.some((pattern) => matchPatternToRegex(pattern)?.test(url))) || null;
}

/** Resolve the captured optimization result, or null on timeout. */
function captureOptimized(dom, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let settled = false;
    dom.window.addEventListener('local-ai-memory:optimized', (event) => {
      if (settled) return;
      settled = true;
      resolve(event.detail);
    });
    dom.window.dispatchEvent(new dom.window.CustomEvent('local-ai-memory:refresh'));
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);
  });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
const results = [];
function check(name, condition, detail) {
  results.push({ name, pass: Boolean(condition), detail });
}

async function testExtraction(platform, fixture) {
  const dom = makeDom(fixture.html, fixture.url);
  stubChrome(dom);
  runAdapter(dom, fixture.file);

  const captured = await captureOptimized(dom);

  check(`[${platform}] optimized event fired`, captured !== null, captured ? '' : 'no event within timeout');
  if (!captured) return;

  check(
    `[${platform}] platform tag`,
    captured.platform === fixture.expectedPlatform,
    `got "${captured.platform}"`,
  );
  check(
    `[${platform}] user query extracted`,
    captured.query === fixture.expectedQuery,
    `got "${captured.query}"`,
  );

  const roles = captured.optimized_messages.map((m) => m.role);
  check(
    `[${platform}] roles detected`,
    JSON.stringify(roles) === JSON.stringify(fixture.expectedRoles),
    `got ${JSON.stringify(roles)}`,
  );

  // Dedup: wrapper nodes must not duplicate message entries.
  const bodyTexts = captured.optimized_messages.map((m) => m.content);
  const uniqueTexts = new Set(bodyTexts);
  check(
    `[${platform}] no duplicate messages`,
    uniqueTexts.size === bodyTexts.length,
    `got ${JSON.stringify(bodyTexts)}`,
  );

  // Context must contain both sides of the conversation.
  check(
    `[${platform}] optimized_context built`,
    typeof captured.optimized_context === 'string' && captured.optimized_context.includes('user:'),
    `got "${String(captured.optimized_context).slice(0, 60)}"`,
  );

  dom.window.close();
}

async function testComposerCapture() {
  const dom = makeDom(COMPOSER_FIXTURE.html, COMPOSER_FIXTURE.url);
  stubChrome(dom);
  runAdapter(dom, COMPOSER_FIXTURE.file);

  const captured = await captureOptimized(dom);
  check('[composer] unsent composer text captured', captured?.query === COMPOSER_FIXTURE.expectedQuery,
    `got "${captured?.query}"`);
  dom.window.close();
}

async function testNegativeControl() {
  const dom = makeDom(NEGATIVE_FIXTURE.html, NEGATIVE_FIXTURE.url);
  stubChrome(dom);
  runAdapter(dom, NEGATIVE_FIXTURE.file);

  const captured = await captureOptimized(dom, 1800);
  check('[negative] no user message -> no optimization event', captured === null,
    `unexpected event: ${JSON.stringify(captured?.query)}`);
  dom.window.close();
}

/**
 * Full chain: adapter extracts -> send_bridge forwards -> platform sender
 * reports canApply -> context panel renders -> clicking "应用优化" rewrites the
 * composer -> stats recorded. This is the path that actually saves tokens.
 */
async function testInjectionChain(platform, fixture, manifest) {
  const scriptList = scriptsFor(manifest, fixture.file);
  if (scriptList.length === 0) {
    check(`[${platform}] injection: manifest entry found`, false, `no entry for ${fixture.file}`);
    return;
  }

  const dom = makeDom(fixture.html, fixture.url);
  installInnerTextShim(dom);
  const calls = stubChrome(dom);

  // The user has typed the query but not sent it yet.
  const composer = dom.window.document.querySelector('textarea, [contenteditable="true"]');
  const composerText = INJECTION_COMPOSER_TEXT[platform];
  if (!composer) {
    check(`[${platform}] injection: composer present`, false, 'no composer node in fixture');
    dom.window.close();
    return;
  }
  if ('value' in composer) composer.value = composerText;
  else composer.textContent = composerText;

  loadManifestScripts(dom, scriptList);

  const seen = new Map();
  for (const name of [
    'local-ai-memory:optimized',
    'local-ai-memory:send-ready',
    'local-ai-memory:optimized-context-ready',
    'local-ai-memory:optimization-applied',
  ]) {
    dom.window.addEventListener(name, (event) => {
      if (!seen.has(name)) seen.set(name, event.detail);
    });
  }

  const captured = await captureOptimized(dom);
  check(`[${platform}] injection: optimized fired`, captured !== null, 'no event within timeout');
  if (!captured) {
    dom.window.close();
    return;
  }

  check(
    `[${platform}] injection: unsent composer text becomes query`,
    captured.query === composerText,
    `got "${captured.query}"`,
  );

  await sleep(30);

  check(
    `[${platform}] injection: send-ready forwarded by bridge`,
    Boolean(seen.get('local-ai-memory:send-ready')?.optimized_context),
  );

  const contextReady = seen.get('local-ai-memory:optimized-context-ready');
  check(
    `[${platform}] injection: platform sender reports canApply`,
    contextReady?.canApply === true && contextReady?.platform === fixture.expectedPlatform,
    `platform="${contextReady?.platform}" canApply=${contextReady?.canApply}`,
  );

  const applyButton = Array.from(dom.window.document.querySelectorAll('button'))
    .find((button) => button.textContent === '应用优化');
  check(`[${platform}] injection: optimization panel rendered`, Boolean(applyButton));
  if (!applyButton) {
    dom.window.close();
    return;
  }

  applyButton.click();
  await sleep(30);

  const current = 'value' in composer ? composer.value : composer.textContent;
  check(
    `[${platform}] injection: composer rewritten with optimized prompt`,
    typeof current === 'string' && current.includes('user:') && current.includes(composerText),
    `got "${String(current).slice(0, 80)}"`,
  );
  check(
    `[${platform}] injection: optimization-applied event fired`,
    seen.has('local-ai-memory:optimization-applied'),
  );
  check(
    `[${platform}] injection: recordStats sent to service worker`,
    calls.some((message) => message.type === 'recordStats' && message.applied === true),
    `calls: ${JSON.stringify(calls.map((message) => message.type))}`,
  );

  dom.window.close();
}

// A cache-decision result must never rewrite the composer.
async function testInjectionSkippedOnCache(fixture, manifest) {
  const dom = makeDom(fixture.html, fixture.url);
  installInnerTextShim(dom);
  stubChrome(dom);
  const composer = dom.window.document.querySelector('textarea, [contenteditable="true"]');
  composer.value = '缓存命中的问题';
  // Force the backend to report a cache hit.
  dom.window.chrome.runtime.sendMessage = (message, callback) => {
    callback({
      ok: true,
      data: {
        route: { decision: 'cache', reason: 'cache hit', cache_hit: true },
        cost: { original_input_tokens: 100, optimized_input_tokens: 10, output_token_budget: 512 },
      },
    });
  };

  loadManifestScripts(dom, scriptsFor(manifest, fixture.file));
  const captured = await captureOptimized(dom);
  check('[cache] optimization event still fires', captured?.decision === 'cache', `got "${captured?.decision}"`);

  const applyButton = Array.from(dom.window.document.querySelectorAll('button'))
    .find((button) => button.textContent === '应用优化');
  check('[cache] panel suppressed for cache decisions', !applyButton);

  const applied = dom.window.LocalAIMemorySendGuard.applyOptimization(captured) === true;
  check('[cache] send_guard refuses to rewrite composer', applied === false && composer.value === '缓存命中的问题');

  dom.window.close();
}

/**
 * Kimi runs a Lexical editor, Doubao a ProseMirror editor. Both revert direct
 * textContent writes (verified live), so the rewrite must go through the
 * editor's native insert path. This fixture models that behaviour.
 */
async function testRichTextEditorInjection(manifest) {
  const fixture = FIXTURES.kimi;
  const dom = makeDom(fixture.html, fixture.url);
  installInnerTextShim(dom);
  stubChrome(dom);

  const composer = dom.window.document.querySelector('[contenteditable="true"]');
  const query = INJECTION_COMPOSER_TEXT.kimi;
  const editorModel = { value: query };
  // The editor owns its document model: DOM mutations outside its own input
  // path are discarded when it re-renders.
  Object.defineProperty(composer, 'textContent', {
    configurable: true,
    get() { return editorModel.value; },
    set() { /* reverted by the editor */ },
  });

  const execCalls = [];
  dom.window.document.execCommand = (command, _ui, value) => {
    execCalls.push({ command, value });
    if (command !== 'insertText') return false;
    editorModel.value = value;
    return true;
  };

  loadManifestScripts(dom, scriptsFor(manifest, fixture.file));
  const captured = await captureOptimized(dom);
  check('[richtext] optimized fired', captured !== null, 'no event within timeout');
  if (!captured) {
    dom.window.close();
    return;
  }

  const applied = dom.window.LocalAIMemorySendGuard.applyOptimization(captured);
  check('[richtext] applyOptimization succeeds', applied === true);
  check(
    '[richtext] insert routed through execCommand, not textContent',
    execCalls.length === 1 && execCalls[0].command === 'insertText',
    JSON.stringify(execCalls.map((call) => call.command)),
  );
  check(
    '[richtext] editor model holds the optimized prompt',
    typeof editorModel.value === 'string'
      && editorModel.value.includes('user:')
      && editorModel.value.includes(query),
    `got "${String(editorModel.value).slice(0, 60)}"`,
  );

  dom.window.close();
}

/**
 * Manifest wiring: every platform URL must resolve to an entry that injects
 * the correct adapter/sender pair, in the order the chain depends on.
 */
async function testManifestRouting(manifest) {
  const cases = [
    ...Object.entries(FIXTURES).map(([platform, fixture]) => ({
      platform, url: fixture.url, file: fixture.file,
    })),
    ...ROUTE_REGRESSIONS.map(({ url, platform }) => ({
      platform, url, file: FIXTURES[platform].file,
    })),
  ];

  for (const { platform, url, file } of cases) {
    const entry = manifestEntryForUrl(manifest, url);
    check(`[routing] ${url} matched`, Boolean(entry), 'no match pattern covers this URL');
    if (!entry) continue;

    const sender = file.replace('_adapter_v2.js', '_sender_v1.js');
    const expectedOrder = [
      'content/adapter.js',
      'content/send_bridge.js',
      'content/send_guard.js',
      `content/${file}`,
      `content/${sender}`,
      'content/request_context.js',
      'content/request_context_bridge.js',
    ];
    check(
      `[routing] ${platform} @ ${url} injects ordered chain`,
      JSON.stringify(entry.js) === JSON.stringify(expectedOrder),
      `got ${JSON.stringify(entry.js)}`,
    );
  }
}

async function testManifest(manifest) {
  const allMatches = manifest.content_scripts.flatMap((cs) => cs.matches);
  const expectedDomains = [
    'chat.deepseek.com',
    'qianwen.com',
    'chatglm.cn',
    'kimi.com',
    'kimi.moonshot.cn',
    'doubao.com',
    'trae.ai',
  ];

  for (const domain of expectedDomains) {
    check(
      `[manifest] covers ${domain}`,
      allMatches.some((m) => m.includes(domain)),
      `matches: ${allMatches.join(', ')}`,
    );
  }

  check(
    '[manifest] legacy trea.ai typo removed',
    !allMatches.some((m) => m.includes('trea.ai')),
    'found trea.ai',
  );

  // Every referenced content script must exist on disk.
  for (const cs of manifest.content_scripts) {
    for (const js of cs.js) {
      check(
        `[manifest] file exists: ${js}`,
        fs.existsSync(path.resolve(__dirname, '..', 'extension', js)),
        'missing on disk',
      );
    }
  }
}

async function main() {
  const manifestPath = path.resolve(__dirname, '..', 'extension', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  for (const [platform, fixture] of Object.entries(FIXTURES)) {
    await testExtraction(platform, fixture);
  }
  await testComposerCapture();
  await testNegativeControl();

  for (const [platform, fixture] of Object.entries(FIXTURES)) {
    await testInjectionChain(platform, fixture, manifest);
  }
  await testInjectionSkippedOnCache(FIXTURES.deepseek, manifest);
  await testRichTextEditorInjection(manifest);

  await testManifestRouting(manifest);
  await testManifest(manifest);

  let failed = 0;
  for (const r of results) {
    if (r.pass) {
      console.log(`PASS  ${r.name}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${r.name}  -> ${r.detail}`);
    }
  }
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('Test harness error:', error);
  process.exit(1);
});
