// 各APIへの接続。streamChat は { text } / { thought } / { notice } を順に返す。

export const CONN_TYPES = {
  vertex: 'Vertex AI（APIキー）',
  gemini: 'Gemini（Google AI Studio）',
  openai: 'OpenAI互換（OpenRouterなど）',
  dummy: 'ダミーAI（動作確認用・通信しません）',
};

export const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? undefined : Number(v));

async function* sse(resp) {
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const parse = (line) => {
    if (!line.startsWith('data:')) return;
    const d = line.slice(5).trim();
    if (!d || d === '[DONE]') return;
    try { return JSON.parse(d); } catch { /* 途中で切れた行は無視 */ }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const obj = parse(buf.slice(0, i).replace(/\r$/, ''));
      buf = buf.slice(i + 1);
      if (obj) yield obj;
    }
  }
  const last = parse(buf.trim());
  if (last) yield last;
}

const HINTS = {
  400: 'リクエストの内容が受け付けられませんでした。温度や思考の設定がこのモデルに合っていない可能性があります。温度を空欄に、思考の設定を「指定しない」にして試してください。',
  401: 'APIキーが正しくないか、この接続先では使えないキーです。',
  403: 'このキーには権限がありません。APIが有効になっているか確認してください。',
  404: 'モデル名が見つかりません。モデル名のつづりを確認してください。',
  429: '利用上限に達しました。しばらく待ってからやり直してください。',
};

async function fail(resp) {
  let detail = await resp.text();
  try {
    let j = JSON.parse(detail);
    if (Array.isArray(j)) j = j[0];
    detail = j?.error?.message || detail;
  } catch { /* JSONでなければそのまま */ }
  let hint = HINTS[resp.status] || (resp.status >= 500 ? 'サーバー側のエラーです。少し待ってやり直してください。' : '');
  // 「このリージョンにそのモデルが無い」エラー：プロジェクト番号を拾い、global を案内する
  const where = /projects\/([\w-]+)\/locations\/([\w-]+)\/publishers\/google\/models\/([\w.-]+)/.exec(detail);
  if (resp.status === 404 && where) {
    hint = `モデル「${where[3]}」は、今のリージョン（${where[2]}）では使えないようです。\n歯車 →「接続先」の「リージョン」を「global」にしてみてください。プロジェクト番号（${where[1]}）は自動で入れました。`;
  }
  const err = new Error(`エラー ${resp.status}\n${hint}\n\n（サーバーからの返事）\n${detail}`.trim());
  err.status = resp.status;
  if (where) err.vertexProject = where[1];
  err.retryable = resp.status === 429 || resp.status >= 500;
  throw err;
}

async function post(url, headers, body, signal) {
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    const err = new Error(`通信できませんでした。電波の状態やURLを確認してください。\n（${e.message}）`);
    err.retryable = true;
    throw err;
  }
  if (!resp.ok) await fail(resp);
  return resp;
}

const BLOCK_REASONS = {
  SAFETY: '安全フィルターにより止められました',
  PROHIBITED_CONTENT: '禁止コンテンツと判定され止められました',
  RECITATION: '既存の文章との重複と判定され止められました',
  MAX_TOKENS: '最大出力トークンに達して途中で終わりました',
  BLOCKLIST: '禁止語句により止められました',
  OTHER: '不明な理由で止められました',
};

// Vertex の呼び先。リージョンを指定しなければ、プロジェクトの既定の場所で動く短い形を使う。
// 新しいモデルは global（や us / eu）にしかないことがあるので、プロジェクトとリージョンを指定できるようにする。
function vertexUrl(conn, model) {
  const loc = (conn.location || '').trim();
  if (!loc) return `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:streamGenerateContent?alt=sse`;
  const project = (conn.project || '').trim();
  if (!project) {
    const err = new Error('リージョンを指定するときは、プロジェクトの番号（またはID）も必要です。\n歯車 →「接続先」の「プロジェクト」に入れてください。番号は、エラー文の projects/○○○ の部分や、Google Cloud の画面で確認できます。');
    throw err;
  }
  const host = loc === 'global' ? 'aiplatform.googleapis.com' : loc === 'us' ? 'aiplatform.us.rep.googleapis.com' : loc === 'eu' ? 'aiplatform.eu.rep.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(loc)}/publishers/google/models/${model}:streamGenerateContent?alt=sse`;
}

async function* gemini(conn, { system, messages, signal, json }) {
  const model = encodeURIComponent(conn.model.trim());
  const url = conn.type === 'vertex' ? vertexUrl(conn, model) : `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

  const generationConfig = {};
  if (json) generationConfig.responseMimeType = 'application/json';
  if (num(conn.temperature) !== undefined) generationConfig.temperature = num(conn.temperature);
  if (num(conn.maxTokens) !== undefined) generationConfig.maxOutputTokens = num(conn.maxTokens);
  const thinking = {};
  if (conn.thinkMode === 'budget' && num(conn.thinkBudget) !== undefined) thinking.thinkingBudget = num(conn.thinkBudget);
  if (conn.thinkMode === 'level' && conn.thinkLevel) thinking.thinkingLevel = conn.thinkLevel.toUpperCase();
  if (conn.showThoughts) thinking.includeThoughts = true;
  if (Object.keys(thinking).length) generationConfig.thinkingConfig = thinking;

  const body = {
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [...(m.text ? [{ text: m.text }] : []), ...m.images.map((i) => ({ inlineData: { mimeType: i.mime, data: i.data } }))],
    })),
    generationConfig,
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (conn.safety && conn.safety !== 'default') {
    body.safetySettings = [
      'HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT',
    ].map((category) => ({ category, threshold: conn.safety }));
  }

  const resp = await post(url, { 'x-goog-api-key': conn.apiKey.trim() }, body, signal);
  for await (const chunk of sse(resp)) {
    if (chunk.error) throw new Error(`エラー\n${chunk.error.message || JSON.stringify(chunk.error)}`);
    const block = chunk.promptFeedback?.blockReason;
    if (block) yield { notice: `入力が${BLOCK_REASONS[block] || block}` };
    const u = chunk.usageMetadata;
    if (u) yield { usage: { in: u.promptTokenCount || 0, out: u.candidatesTokenCount || 0, think: u.thoughtsTokenCount || 0, cached: u.cachedContentTokenCount || 0 } };
    const cand = chunk.candidates?.[0];
    for (const part of cand?.content?.parts || []) {
      if (!part.text) continue;
      yield part.thought ? { thought: part.text } : { text: part.text };
    }
    const fin = cand?.finishReason;
    if (fin && fin !== 'STOP') yield { notice: BLOCK_REASONS[fin] || `終了理由: ${fin}` };
  }
}

async function* openai(conn, { system, messages, signal, json }) {
  const base = (conn.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  const body = {
    model: conn.model.trim(),
    stream: true,
    stream_options: { include_usage: true },
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages.map((m) => ({
        role: m.role,
        content: m.images.length
          ? [...(m.text ? [{ type: 'text', text: m.text }] : []), ...m.images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } }))]
          : m.text,
      })),
    ],
  };
  if (num(conn.temperature) !== undefined) body.temperature = num(conn.temperature);
  if (num(conn.maxTokens) !== undefined) body.max_tokens = num(conn.maxTokens);
  if (conn.thinkMode === 'budget' && num(conn.thinkBudget) !== undefined) body.reasoning = { max_tokens: num(conn.thinkBudget) };
  if (conn.thinkMode === 'level' && conn.thinkLevel) body.reasoning = { effort: conn.thinkLevel };

  const call = () => post(`${base}/chat/completions`, { Authorization: `Bearer ${conn.apiKey.trim()}` }, body, signal);
  let resp;
  try { resp = await call(); } catch (e) {
    // 使用量の報告指定（stream_options）を受け付けない互換サーバー向けに、外してもう一度
    if (e.name === 'AbortError' || !/stream_options|include_usage/i.test(e.message)) throw e;
    delete body.stream_options;
    resp = await call();
  }
  for await (const chunk of sse(resp)) {
    if (chunk.error) throw new Error(`エラー\n${chunk.error.message || JSON.stringify(chunk.error)}`);
    const u = chunk.usage;
    if (u) yield { usage: { in: u.prompt_tokens || 0, out: u.completion_tokens || 0, think: u.completion_tokens_details?.reasoning_tokens || 0, cached: u.prompt_tokens_details?.cached_tokens || 0 } };
    const choice = chunk.choices?.[0];
    const d = choice?.delta || {};
    const thought = d.reasoning || d.reasoning_content;
    if (thought && conn.showThoughts) yield { thought };
    if (d.content) yield { text: d.content };
    if (choice?.finish_reason === 'length') yield { notice: BLOCK_REASONS.MAX_TOKENS };
    if (choice?.finish_reason === 'content_filter') yield { notice: BLOCK_REASONS.SAFETY };
  }
}

async function* dummy(conn, { messages, signal, json, sample }) {
  const last = messages.at(-1)?.text || '';
  const text = (json && sample) || conn.dummyText?.trim() || `これはダミーAIの返事です。通信はしていません。\n\n受け取った文章（${messages.length}件目）:\n${last}`;
  for (let i = 0; i < text.length; i += 4) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    await new Promise((r) => setTimeout(r, 30));
    yield { text: text.slice(i, i + 4) };
  }
}

export function streamChat(conn, req) {
  if (!conn) throw new Error('接続先がありません。歯車のマークの設定 →「接続先」で追加してください。');
  const merged = [];
  for (const m of req.messages) {
    if (!m.text && !m.images?.length) continue;
    const prev = merged.at(-1);
    if (prev?.role === m.role) {
      prev.text = [prev.text, m.text].filter(Boolean).join('\n\n');
      prev.images = [...prev.images, ...(m.images || [])];
    } else merged.push({ role: m.role, text: m.text || '', images: [...(m.images || [])] });
  }
  req = { ...req, messages: merged };
  if (conn.type === 'dummy') return dummy(conn, req);
  if (!conn.apiKey?.trim()) throw new Error('APIキーが入力されていません。歯車のマークの設定 →「接続先」で入力してください。');
  if (!conn.model?.trim()) throw new Error('モデル名が入力されていません。歯車のマークの設定 →「接続先」で入力してください。');
  return conn.type === 'openai' ? openai(conn, req) : gemini(conn, req);
}
