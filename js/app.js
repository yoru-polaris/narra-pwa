import { db, uid } from './db.js';
import { streamChat, CONN_TYPES, DEFAULT_BASE_URL, readNetLog, clearNetLog } from './api.js';
import { initPhone } from './phone.js';
import { DEFAULT_INSERTS } from './inserts.js';

const $ = (s) => document.querySelector(s);

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

// 線画アイコン（絵文字は端末ごとに見た目が変わるので使わない）
const ICONS = {
  pencil: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  branch: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  summary: 'M17 10H3M21 6H3M21 14H3M13 18H3',
  fold: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
  unfold: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  save: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  trash: 'M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ai: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  image: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 16l-5-5-9 9',
  clip: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  gauge: 'M12 21a9 9 0 1 1 9-9M12 12l5-3M3 12h2M12 3v2',
  pin: 'M9 4h6l-1 6 3 3v2H7v-2l3-3zM12 15v6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  play: 'M7 4l13 8-13 8z',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  radioOn: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  radioOff: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  boxOn: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 12l3 3 5-6',
  boxOff: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
};

function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

// ---------- 状態 ----------
const S = {
  settings: { connections: [], activeConnId: null, showImages: true, lastPromptId: null, lastChatId: null, lastCharIds: [],
    summary: { connId: '', model: '', auto: false, threshold: 40, keep: 10 },
    ui: { theme: 'auto', fontSize: '16', enterSend: false, autoScroll: true, showTimer: true, skipDeleteConfirm: false,
      kbGap: 'auto', retries: '2', replaceUser: true, toolsMode: 'always', toolColors: true, toolStyle: '', compactTools: false, showMeta: true, font: 'gothic', lineHeight: '1.75', paper: false, scrollbar: true, continueText: '続きを書いてください。', imgBase: '', imgExt: '.avif', bgVeil: 70, bubbleAlpha: 85 } },
  prompts: [],
  chars: [],
  chats: [],
  chat: null,
  msgs: new Map(),  // openChat で MsgMap に差し替える
  busy: false,
  pending: [],
  abort: null,
  error: '',
  editing: null,
  tab: 'conn',
  openCard: null,
};

const saveSettings = () => db.kvSet('settings', S.settings);
const activeConn = () => S.settings.connections.find((c) => c.id === S.settings.activeConnId);
const modelLabel = (c) => (!c ? 'モデル未選択' : c.type === 'dummy' ? 'ダミーAI' : c.model || 'モデル未選択');

const THEMES = {
  auto: ['自動', 'linear-gradient(90deg,#3b6ea5 50%,#2a2d33 50%)'],
  kinari: ['生成り', '#3b6ea5'], aizumi: ['藍墨', '#26437a'], sora: ['空', '#1f78b4'], matcha: ['抹茶', '#3d6b2a'], wakakusa: ['若草', '#5f8f2f'],
  sakura: ['桜', '#c2476a'], beni: ['紅', '#a3263c'], sumire: ['菫', '#6a45b0'], sepia: ['セピア', '#8a5c24'],
  sumi: ['墨', '#2a2d33'], aiyo: ['藍夜', '#24345c'], azuki: ['小豆', '#5a2f3c'], yozakura: ['夜桜', '#4a2450'],
};

function applyUi() {
  const ui = S.settings.ui;
  const root = document.documentElement;
  if (ui.theme === 'auto') delete root.dataset.theme; else root.dataset.theme = ui.theme;
  root.style.setProperty('--msg-size', `${ui.fontSize}px`);
  root.style.setProperty('--body-font', ui.font === 'mincho' ? '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif JP", serif' : 'inherit');
  root.style.setProperty('--body-lh', ui.lineHeight || '1.75');
  $('#messages').classList.toggle('paper', !!ui.paper);
  fitViewport();
  root.style.setProperty('--veil', `${ui.bgVeil}%`);
  root.style.setProperty('--bubble-alpha', `${ui.bubbleAlpha}%`);
  const color = getComputedStyle($('#topbar')).backgroundColor;
  document.querySelectorAll('meta[name=theme-color]').forEach((m) => { m.content = color; m.removeAttribute('media'); });
}

const promptOf = (id) => S.prompts.find((p) => p.id === id);

const DEFAULT_MODELS = ['gemini-3.1-pro-preview', 'gemini-3.5-flash-lite', 'gemini-4-hydrogen', 'gemini-4-argon', 'gemini-4-carbon'];

function newConn() {
  return {
    id: uid(), name: 'Vertex AI', type: 'vertex', apiKey: '', baseUrl: '', model: DEFAULT_MODELS[0], models: [...DEFAULT_MODELS],
    temperature: '', maxTokens: '', thinkMode: 'none', thinkBudget: '', thinkLevel: 'high',
    showThoughts: false, safety: 'default', location: '', project: '', fallbackModel: '',
  };
}

const CHAR_TYPES = { char: '登場人物', hero: '主人公（自分が演じる・語る人物）', world: '世界設定', doc: '資料（まるごと読み込む）' };
// このチャットで使う登場人物・世界設定・資料（主人公は別扱いなので含めない）
const chatChars = (chat) => (chat.charIds || []).map((id) => S.chars.find((c) => c.id === id)).filter((c) => c && c.type !== 'hero');

// このチャットの主人公。保存したカードか、この話だけの主人公（custom）。なければ null。
function heroOf(chat) {
  if (!chat) return null;
  if (chat.heroId === 'custom') {
    const hc = chat.heroCustom || {};
    return hc.name?.trim() || hc.text?.trim() ? { name: hc.name?.trim() || '主人公', text: hc.text || '' } : null;
  }
  const card = S.chars.find((c) => c.id === chat.heroId && c.type === 'hero');
  return card ? { name: card.name || '主人公', text: card.core || '', card } : null;
}

// 以前の形式（主人公も charIds に入っていた）を、主人公＝heroId に分ける
function normalizeChat(chat) {
  if (chat.heroId === undefined) {
    const ids = chat.charIds || [];
    const isHero = (id) => S.chars.find((c) => c.id === id)?.type === 'hero';
    chat.heroId = ids.find(isHero) ?? null;
    chat.charIds = ids.filter((id) => !isHero(id));
  }
  return chat;
}

// {{user}} {{char}} と、単独の「User」を、選んでいる主人公・登場人物の名前に置き換える
function fillNames(chat, text) {
  const chars = chatChars(chat);
  const hero = heroOf(chat)?.name;
  const cast = chars.find((c) => (c.type || 'char') === 'char')?.name;
  if (cast) text = text.replace(/\{\{char\}\}/gi, () => cast);
  if (hero) {
    text = text.replace(/\{\{user\}\}/gi, () => hero);
    if (S.settings.ui.replaceUser) text = text.replace(/(^|[^A-Za-z])User(?![A-Za-z])/g, (_, pre) => pre + hero);
  }
  return text;
}

// プロンプトとキャラ表から、AIに渡すシステムプロンプトを組み立てる。
// 「詳細」は、直近の会話に名前かキーワードが出たキャラの分だけ入れる。
// 要約が有効なら、path のうち何件目までが要約済みかを返す（無効・対象外なら 0）
function summaryCut(chat, path) {
  const sum = chat.summary;
  if (!sum?.text?.trim() || chat.summaryOn === false) return 0;
  const i = path.findIndex((m) => m.id === sum.uptoId);
  return i >= 0 && i < path.length - 1 ? i + 1 : 0;
}

function buildSystem(chat, recentText, summaryText) {
  const parts = [promptOf(chat.promptId)?.text || ''];
  const loaded = [];
  const block = (c) => {
    let text = `## ${c.name}\n${c.core || ''}`.trim();
    const keys = [c.name, ...(c.keywords || '').split(/[,、，\n]+/)].map((k) => k.trim()).filter(Boolean);
    if (c.detail?.trim() && (c.alwaysDetail || keys.some((k) => recentText.includes(k)))) {
      text += `\n${c.detail.trim()}`;
      if (!c.alwaysDetail) loaded.push(c.name);
    }
    return text;
  };
  const chars = chatChars(chat);
  const hero = heroOf(chat);
  for (const [type, title] of [['world', '# 世界設定'], ['hero', '# 主人公（ユーザーが演じる・語る人物）'], ['char', '# 登場人物'], ['doc', '# 資料']]) {
    if (type === 'hero') {
      if (hero) parts.push(`${title}\n\n## ${hero.name}\n${hero.text}`.trim());
      continue;
    }
    const list = chars.filter((c) => (c.type || 'char') === type);
    if (list.length) parts.push(`${title}\n\n${list.map(block).join('\n\n')}`);
  }
  if (chat.note?.trim()) parts.push(`# 今回の話\n\n${chat.note.trim()}`);
  if (summaryText) parts.push(`# これまでのあらすじ\n\n${summaryText.trim()}`);
  return { system: fillNames(chat, parts.filter(Boolean).join('\n\n')), loaded };
}

// 新しいチャットは、今開いているチャットの選び方（プロンプト・主人公・登場人物）を引き継ぐ。
// 開いているチャットがなければ、最後に選んだものを使う。
function blankChat() {
  const from = S.chat && normalizeChat(S.chat);
  const promptId = promptOf(from ? from.promptId : S.settings.lastPromptId) ? (from ? from.promptId : S.settings.lastPromptId) : null;
  const charIds = (from ? from.charIds || [] : S.settings.lastCharIds || []).filter((id) => S.chars.some((c) => c.id === id && c.type !== 'hero'));
  const lastHero = from ? from.heroId : S.settings.lastHeroId;
  const heroId = S.chars.some((c) => c.id === lastHero && c.type === 'hero') ? lastHero : null;   // この話だけの主人公は引き継がない
  return { id: uid(), title: '', promptId, charIds, heroId, createdAt: Date.now(), updatedAt: Date.now(), leafId: null };
}

// ---------- 会話の木 ----------
// 親ごとの子メッセージ一覧。メッセージの追加・削除があったときだけ作り直す。
let kidsIndex = null;
class MsgMap extends Map {
  set(k, v) { kidsIndex = null; return super.set(k, v); }
  delete(k) { kidsIndex = null; return super.delete(k); }
}
function childrenOf(parentId) {
  if (!kidsIndex) {
    kidsIndex = new Map();
    for (const m of S.msgs.values()) {
      const key = m.parentId ?? null;
      if (!kidsIndex.has(key)) kidsIndex.set(key, []);
      kidsIndex.get(key).push(m);
    }
    for (const list of kidsIndex.values()) list.sort((a, b) => a.createdAt - b.createdAt);
  }
  return kidsIndex.get(parentId ?? null) || [];
}

function pathTo(id) {
  const out = [];
  while (id) {
    const m = S.msgs.get(id);
    if (!m) break;
    out.unshift(m);
    id = m.parentId;
  }
  return out;
}

function deepest(id) {
  for (;;) {
    const kids = childrenOf(id);
    if (!kids.length) return id;
    id = kids[kids.length - 1].id;
  }
}

function subtree(id) {
  const ids = [id];
  for (let i = 0; i < ids.length; i++) for (const k of childrenOf(ids[i])) ids.push(k.id);
  return ids;
}

async function saveChat() {
  S.chat.updatedAt = Date.now();
  if (!S.chats.includes(S.chat)) S.chats.unshift(S.chat);
  S.settings.lastChatId = S.chat.id;
  await Promise.all([db.put('chats', S.chat), saveSettings()]);
}

// 書きかけの入力を、チャットごとにこの端末へ残す（送信前にアプリを閉じても消えないように）
const draftKey = (id) => `sousaku:draft:${id}`;
function saveDraft() {
  if (!S.chat) return;
  try {
    const v = $('#input').value;
    if (v.trim()) localStorage.setItem(draftKey(S.chat.id), v); else localStorage.removeItem(draftKey(S.chat.id));
  } catch { /* 保存できない環境では何もしない */ }
}
function loadDraft() {
  let v = '';
  try { v = localStorage.getItem(draftKey(S.chat.id)) || ''; } catch { /* 読めなければ空 */ }
  $('#input').value = v;
  resizeInput();
}
let draftTimer = 0;

// 長い会話でも重くならないよう、画面に出すのは直近 PAGE 件だけにする（上のボタンで追加表示）
const PAGE = 60;

async function openChat(chat) {
  if (S.chat) saveDraft();
  S.abort?.abort();
  S.chat = normalizeChat(chat);
  S.error = '';
  S.editing = null;
  S.showCount = PAGE;
  const stored = await db.messagesOf(chat.id);
  S.fileStore = new Map(stored.filter((x) => x.files).map((x) => [x.id, x.files]));   // 枝どうしで共有する添付
  S.msgs = new MsgMap(stored.filter((x) => !x.deletedAt).map((x) => [x.id, x]));
  kidsIndex = null;
  if (S.chats.includes(chat)) { S.settings.lastChatId = chat.id; saveSettings(); }
  loadDraft();
  render();
  scrollBottom();
  applyBg();
}

// ---------- 表示 ----------
const IMG_URL = /(?:!\[[^\]]*\]\()?(https?:\/\/[^\s<>"'()（）「」【】]+?\.(?:avif|webp|png|jpe?g|gif))\)?/gi;

function expandImages(text) {
  const base = S.settings.ui.imgBase.trim();
  if (!base) return text;
  const ext = S.settings.ui.imgExt.trim();
  return text.replace(/\[\[([^\[\]\n]{1,80})\]\]/g, (_, name) =>
    `${base.replace(/\/?$/, '/')}${name.trim()}${/\.\w{2,5}$/.test(name.trim()) ? '' : ext}`);
}

function picture(url, show) {
  if (!show) {
    const chip = h('button', { class: 'picchip', onclick: () => chip.replaceWith(picture(url, true)) }, icon('image'), '画像を表示');
    return chip;
  }
  let src = url;
  try { src = encodeURI(decodeURI(url)); } catch { /* そのまま使う */ }
  const img = h('img', {
    class: 'pic', src, alt: '', loading: 'lazy',
    onclick: () => img.replaceWith(picture(url, false)),
    onerror: () => img.replaceWith(h('span', { class: 'hint', text: `（画像を読み込めません: ${url}）` })),
  });
  return img;
}

function richText(text) {
  text = expandImages(text);
  const frag = document.createDocumentFragment();
  const plain = (s) => {
    s.split(/\*\*(.+?)\*\*/s).forEach((part, i) => {
      if (part) frag.append(i % 2 ? h('strong', { text: part }) : part);
    });
  };
  let last = 0;
  for (const m of text.matchAll(IMG_URL)) {
    plain(text.slice(last, m.index));
    frag.append(picture(m[1], S.settings.showImages));
    last = m.index + m[0].length;
  }
  plain(text.slice(last));
  return frag;
}

function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2200);
}

function scrollBottom() {
  const box = $('#messages');
  box.scrollTop = box.scrollHeight;
}

const num = (n) => Number(n || 0).toLocaleString();
// ---------- 換算トークン ----------
// 「入力1トークン何個分か」に直した数。料金表の倍率をモデルごとに登録しておく。
// 出力と思考は同じ倍率（料金表の「出力レスポンス / 推論テキスト」）。
const KNOWN_RATES = { 'gemini-4-neon': { in: 1, cache: 0.05, out: 5 } };
const modelIdOf = (m) => m.modelId || (m.model || '').replace(/（.*）$/, '');
const ratesFor = (id) => S.settings.rates?.[id] || KNOWN_RATES[id] || null;
function converted(u, r) {
  if (!u || !r) return null;
  const cached = u.cached || 0;
  return Math.max(0, u.in - cached) * Number(r.in ?? 1) + cached * Number(r.cache ?? 1) + (u.out + (u.think || 0)) * Number(r.out ?? 1);
}
const usageText = (u, m) => {
  const conv = m && converted(u, ratesFor(modelIdOf(m)));
  return `入力 ${num(u.in)}${u.cached ? `（うちキャッシュ ${num(u.cached)}・${Math.round((u.cached / Math.max(1, u.in)) * 100)}％）` : ''} ／ 出力 ${num(u.out)}${u.think ? ` ／ 思考 ${num(u.think)}` : ''} トークン${conv != null ? ` ／ 換算 ${num(Math.round(conv))}` : ''}`;
};

function openNetLog() {
  $('#sheetTitle').textContent = '通信の記録';
  const list = readNetLog().reverse();
  const tm = (t) => new Date(t).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const day = (t) => new Date(t).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  const recent = list.filter((e) => Date.now() - e.at < 60000);
  $('#sheetBody').replaceChildren(
    h('p', { class: 'hint', text: `AIに送った直近${list.length}件です（新しい順）。送った文章やAPIキーは記録していません。直近1分間に送った回数：${recent.length}回` }),
    h('div', { class: 'netlog' }, list.map((e) => h('div', { class: `netrow ${e.status === 200 ? 'ok' : 'ng'}` },
      h('span', { class: 'when', text: `${day(e.at)} ${tm(e.at)}` }),
      h('span', { class: 'st', text: String(e.status) }),
      h('span', { class: 'what', text: `${e.purpose}・${e.model}` }),
      h('span', { class: 'where', text: `${e.host}・${e.kb}KB・${(e.ms / 1000).toFixed(1)}秒` })))),
    !list.length && h('p', { class: 'hint', text: 'まだ記録がありません。' }),
    h('div', { class: 'btnrow' }, h('button', { text: '記録を消す', onclick: () => { clearNetLog(); openNetLog(); } })),
  );
  show('#sheet');
}

function openUsage() {
  $('#sheetTitle').textContent = '使用量';
  const sum = (list) => list.reduce((t, m) => {
    if (!m.usage) return t;
    const conv = converted(m.usage, ratesFor(modelIdOf(m)));
    return { n: t.n + 1, in: t.in + m.usage.in, out: t.out + m.usage.out, think: t.think + m.usage.think, cached: t.cached + m.usage.cached,
      conv: t.conv + (conv || 0), convN: t.convN + (conv != null ? 1 : 0) };
  }, { n: 0, in: 0, out: 0, think: 0, cached: 0, conv: 0, convN: 0 });
  const table = (title, t) => h('div', { class: 'card' },
    h('strong', { text: title }),
    t.n ? h('div', { class: 'usagegrid' },
      h('span', { text: '返事の回数' }), h('b', { text: `${num(t.n)} 回` }),
      h('span', { text: '入力' }), h('b', { text: `${num(t.in)} トークン` }),
      h('span', { text: 'うちキャッシュ' }), h('b', { text: `${num(t.cached)} トークン（${Math.round((t.cached / Math.max(1, t.in)) * 100)}％）` }),
      h('span', { text: '出力' }), h('b', { text: `${num(t.out)} トークン` }),
      h('span', { text: '思考' }), h('b', { text: `${num(t.think)} トークン` }),
      h('span', { class: 'conv', text: '換算' }), h('b', { class: 'conv', text: t.convN ? `${num(Math.round(t.conv))}${t.convN < t.n ? `（${t.convN}回分）` : ''}` : '倍率が未登録' }))
      : h('p', { class: 'hint', text: 'まだ記録がありません（この機能を入れたあとの返事から数えます）。' }));
  const path = pathTo(S.chat.leafId);
  const last = [...path].reverse().find((m) => m.usage);

  // 今のモデルの倍率
  const model = activeConn()?.model || '';
  const rates = (S.settings.rates ||= {});
  const cur = { ...(rates[model] || KNOWN_RATES[model] || { in: '', cache: '', out: '' }) };
  const rateField = (key, label) => {
    const el = h('input', { type: 'number', step: 'any', min: '0', inputMode: 'decimal', value: cur[key] ?? '' });
    el.addEventListener('change', () => {
      cur[key] = el.value;
      if (['in', 'cache', 'out'].every((k) => cur[k] === '' || cur[k] == null)) delete rates[model];
      else rates[model] = { in: Number(cur.in || 1), cache: Number(cur.cache === '' ? cur.in || 1 : cur.cache), out: Number(cur.out || 1) };
      saveSettings();
    });
    return h('label', { class: 'f' }, label, el);
  };
  $('#sheetBody').replaceChildren(...[
    h('p', { class: 'hint', text: 'AIから返ってきた実際の数字です。入力は「毎回送っている量」で、会話が長いほど増えます。キャッシュは、前回と同じ出だしの部分が割引で処理された量です。' }),
    last && h('div', { class: 'card' }, h('strong', { text: '直近の返事' }), h('p', { class: 'hint', text: usageText(last.usage, last) })),
    table('今見ている枝の合計', sum(path)),
    table('このチャット全体（消していない枝すべて）', sum([...S.msgs.values()])),
    model && h('details', { class: 'card' },
      h('summary', { text: `換算の倍率（${model}）${rates[model] || KNOWN_RATES[model] ? '' : '・未登録'}` }),
      h('p', { class: 'hint', text: '換算トークンは「入力1トークン何個分か」に直した数です。料金表の「1 ○○トークン = △ トークン」の △ を入れます。出力と思考は同じ倍率です。モデルを切り替えると、そのモデルの倍率を登録できます。' }),
      h('div', { class: 'rategrid' }, rateField('in', '入力'), rateField('cache', 'キャッシュ読み取り'), rateField('out', '出力・思考')),
      h('p', { class: 'hint', text: 'キャッシュ書き込みの割増は、AIから量が返ってこないため数えていません。' })),
    h('p', { class: 'hint', text: '要約・スマホをのぞく・AI整理で使った分は、ここには含まれません。' }),
  ].filter(Boolean));
  show('#sheet');
}

const openThoughts = new Set();   // 開いている思考の枠（描き直しても開いたままにする）

function messageEl(m, index) {
  const el = h('div', { class: `msg ${m.role}` });
  el.dataset.id = m.id;


  const fold = async () => { m.collapsed = !m.collapsed; render(); await db.put('messages', m); };
  const ui = S.settings.ui;
  const tapTools = (e) => {
    if (ui.toolsMode !== 'tap' || S.busy || e.target.closest('img,button,details,a') || String(getSelection())) return;
    S.toolsFor = S.toolsFor === m.id ? null : m.id;
    render();
  };
  const bubble = h('div', { class: `bubble ${m.collapsed ? 'folded' : ''} ${m.side ? 'side' : ''}`, onclick: m.collapsed ? (S.busy ? null : fold) : tapTools });
  const face = !m.side && S.faces?.[m.role];
  if (iconUrl(face)) bubble.append(h('div', { class: 'who' }, avatar(face, 'av sm'), face.name));
  if (m.side) bubble.append(h('div', { class: 'sidetag' }, icon('spark'), `番外：${m.sideName || '差し込み'}`));
  const more = S.moreFor === m.id;
  const showInfo = ui.showMeta && (!ui.compactTools || more);
  if (showInfo) bubble.append(h('div', { class: 'meta', text: [`#${index + 1}`, m.model, new Date(m.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' / ') }));
  if (m.collapsed) {
    bubble.append(h('div', { class: 'body', text: expandImages(m.text).replace(IMG_URL, '〔画像〕').trim().slice(0, 200) }));
  } else {
    if (m.thought) bubble.append(h('details', { class: 'thought', open: openThoughts.has(m.id), ontoggle: (e) => { if (e.target.open) openThoughts.add(m.id); else openThoughts.delete(m.id); } }, h('summary', { text: '思考' }), h('div', { text: m.thought }),
      h('div', { class: 'thoughtbtns' },
        h('button', { text: m.thoughtJa ? '日本語訳を見る' : '日本語にする', onclick: () => translateThought(m) }),
        h('button', { text: 'コピー', onclick: () => navigator.clipboard.writeText(m.thought).then(() => toast('思考をコピーしました')) }))));
    bubble.append(h('div', { class: 'body' }, richText(m.text)));
    if (filesOf(m).length) bubble.append(h('div', { class: 'files' }, filesOf(m).map((f) => f.kind === 'image'
      ? h('img', { src: `data:${f.mime};base64,${f.data}`, alt: f.name })
      : h('span', { class: 'filechip' }, icon('clip'), f.name))));
    if (m.notice) bubble.append(h('div', { class: 'hint', text: `※ ${m.notice}` }));
    if (m.usage && showInfo) bubble.append(h('div', { class: 'meta usage', text: usageText(m.usage, m) }));
    if (m.loaded?.length) bubble.append(h('div', { class: 'hint' }, icon('book'), `詳細を読み込み: ${m.loaded.join('、')}`));
  }
  el.append(bubble);

  if (!S.busy && (ui.toolsMode !== 'tap' || m.id === S.chat.leafId || S.toolsFor === m.id)) {
    const sibs = childrenOf(m.parentId);
    const idx = sibs.indexOf(m);
    const style = ui.toolStyle === 'color' ? 'colored' : ui.toolStyle === 'plain' ? '' : 'themed';
    const tools = h('div', { class: `tools ${style}` });
    if (sibs.length > 1) {
      tools.append(
        h('button', { text: '◀', disabled: idx === 0, 'aria-label': '前の枝', onclick: () => switchBranch(sibs[idx - 1]) }),
        h('span', { class: 'sib', text: `${idx + 1} / ${sibs.length}` }),
        h('button', { text: '▶', disabled: idx === sibs.length - 1, 'aria-label': '次の枝', onclick: () => switchBranch(sibs[idx + 1]) }),
      );
    }
    tools.append(h('button', { class: 'sym c-fold', text: m.collapsed ? '▸' : '▾', 'aria-label': m.collapsed ? 'ひらく' : 'たたむ', onclick: fold }));
    // 返事がまだ無い（エラーで止まった）最後の発言には、返事をもらい直すボタンを出す
    if (m.role === 'user' && m.id === S.chat.leafId) tools.append(h('button', { class: 'c-go', text: '返事をもらう', onclick: () => generate(m.id) }));
    if (m.role === 'assistant' && m.id === S.chat.leafId) tools.append(h('button', { class: 'c-go', text: '続き', onclick: () => continueFrom(m) }));
    if (m.side) tools.append(h('button', { class: 'c-retry', text: 'やり直す', onclick: () => runInsert({ name: m.sideName, text: m.sideText || '', mode: 'side' }, m.parentId) }));
    else if (m.role === 'assistant') tools.append(h('button', { class: 'c-retry', text: '再生成', onclick: () => generate(m.parentId) }));
    if (!ui.compactTools || more) {
      tools.append(
        h('button', { class: 'c-edit', text: '編集', onclick: () => editMessage(m) }),
        h('button', { class: 'c-copy', text: 'コピー', onclick: () => navigator.clipboard.writeText(m.text).then(() => toast('コピーしました')) }),
        h('button', { class: 'c-del', text: '削除', onclick: () => removeMessage(m) }),
        h('span', { class: 'cnt', text: `${m.text.length.toLocaleString()} / ${S.totalChars.toLocaleString()}字` }),
      );
    }
    // よく使うボタン以外は「…」の中にしまう
    if (ui.compactTools) tools.append(h('button', { class: 'c-more', text: more ? '閉じる' : '…', 'aria-label': more ? '閉じる' : 'ほかの操作', onclick: () => { S.moreFor = more ? null : m.id; render(); } }));
    el.append(tools);
  }
  return el;
}

function render() {
  $('#chatTitle').textContent = S.chat.title || '新しいチャット';
  $('#modelChip span').textContent = modelLabel(activeConn());
  // 接続先が複数あるときは、同じ名前のモデルを見分けられるよう接続先の名前も出す
  const several = S.settings.connections.length > 1 && activeConn();
  $('#connTag').hidden = !several;
  $('#connTag').textContent = several ? (activeConn().name || '').slice(0, 5) : '';
  const heroNow = heroOf(S.chat);
  $('#heroChip span').textContent = heroNow?.name || '主人公なし';
  $('#heroChip img').hidden = !iconUrl(heroNow?.card);
  $('#heroChip svg').style.display = iconUrl(heroNow?.card) ? 'none' : '';
  if (iconUrl(heroNow?.card)) $('#heroChip img').src = iconUrl(heroNow.card);
  // 吹き出しに出す顔：相手役が1人だけならその人、自分側は主人公
  const cast = chatChars(S.chat).filter((c) => (c.type || 'char') === 'char');
  S.faces = { assistant: cast.length === 1 ? cast[0] : null, user: heroNow?.card || null };
  $('#btnImages').classList.toggle('off', !S.settings.showImages);
  $('#btnSend').textContent = S.busy ? '停止' : '送信';
  const waitingReply = !S.busy && S.msgs.get(S.chat.leafId)?.role === 'user';
  $('#input').placeholder = waitingReply ? '空のまま送信すると、返事をもう一度もらえます' : 'メッセージを入力';

  const box = $('#messages');
  const path = pathTo(S.chat.leafId);
  S.totalChars = path.reduce((n, m) => n + m.text.length, 0);
  const cut = summaryCut(S.chat, path);
  const hidden = Math.max(0, path.length - (S.showCount || PAGE));
  box.replaceChildren(...[
    hidden > 0 && h('button', { class: 'wide older', text: `▲ 前のメッセージを表示（あと ${hidden} 件）`, onclick: () => {
      const before = box.scrollHeight;
      S.showCount = (S.showCount || PAGE) + PAGE;
      render();
      box.scrollTop += box.scrollHeight - before;
    } }),
    ...path.flatMap((m, i) => (i < hidden ? [] : [messageEl(m, i), i === cut - 1 && h('div', { class: 'cutline', text: 'ここまで要約済み（これより上はあらすじとして送られます）' })])),
  ].filter(Boolean));
  if (!path.length && !S.error) {
    const conn = activeConn();
    const ready = conn?.apiKey || conn?.type === 'dummy';
    const starts = chatChars(S.chat).filter((c) => c.greeting?.trim());
    box.append(h('div', { class: 'empty' },
      ready ? 'メッセージを入力して始めましょう' : 'まず右上の歯車のマークから「接続先」にAPIキーを入力してください',
      starts.map((c) => h('div', { class: 'btnrow center' }, h('button', { text: `「${c.name}」の始まり方で始める`, onclick: () => startWith(c) })))));
  }
  if (S.error) {
    const leaf = S.msgs.get(S.chat.leafId);
    box.append(h('div', { class: 'errbox' }, S.error,
      leaf?.role === 'user' && h('div', { class: 'btnrow' }, h('button', { text: 'もう一度試す', onclick: () => generate(leaf.id) }))));
  }
  updateBar();
}

function updateBar() {
  const box = $('#messages');
  const bar = $('#scrollbar');
  const on = S.settings.ui.scrollbar;
  box.classList.toggle('custombar', on);
  const range = box.scrollHeight - box.clientHeight;
  bar.hidden = !on || range < 40;
  if (bar.hidden) return;
  const r = box.getBoundingClientRect();
  bar.style.top = `${r.top}px`;
  bar.style.height = `${r.height}px`;
  const thumb = Math.max(44, (r.height * box.clientHeight) / box.scrollHeight);
  bar.firstElementChild.style.height = `${thumb}px`;
  bar.firstElementChild.style.top = `${(box.scrollTop / range) * (r.height - thumb)}px`;
}

function dragBar(e) {
  const box = $('#messages');
  const r = box.getBoundingClientRect();
  const thumb = $('#scrollbar').firstElementChild.offsetHeight;
  const ratio = Math.min(1, Math.max(0, (e.clientY - r.top - thumb / 2) / (r.height - thumb)));
  box.scrollTop = ratio * (box.scrollHeight - box.clientHeight);
}

let bgUrl = '';
async function applyBg() {
  const box = $('#messages');
  const global = await db.kvGet('bg');
  const own = S.chat ? chatChars(S.chat).find((c) => c.bg)?.bg : null;
  const blob = own || global;
  if (bgUrl) URL.revokeObjectURL(bgUrl);
  bgUrl = blob ? URL.createObjectURL(blob) : '';
  box.classList.toggle('hasbg', !!blob);
  box.style.setProperty('--bgimg', blob ? `url("${bgUrl}")` : 'none');
  return !!global;
}

async function shrinkImage(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = h('canvas', { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
}

async function setBg(file) {
  try {
    await db.kvSet('bg', await shrinkImage(file));
    await applyBg();
    renderSettings();
  } catch (e) {
    alert(`この画像は読み込めませんでした。\n${e.message}`);
  }
}

// 枝分かれの全体図。一本道の区間を1行にまとめ、分岐するたびに一段下げて表示する。
function openTree() {
  $('#sheetTitle').textContent = '分岐ツリー';
  const onPath = new Set(pathTo(S.chat.leafId).map((m) => m.id));
  const rows = [];
  const walk = (start, depth) => {
    let node = start;
    let count = 1;
    for (;;) {
      const kids = childrenOf(node.id);
      if (kids.length !== 1) {
        rows.push({ start, last: node, count, depth, kids });
        kids.forEach((k) => walk(k, depth + 1));
        return;
      }
      node = kids[0];
      count++;
    }
  };
  childrenOf(null).forEach((root) => walk(root, 0));

  const jump = (row) => {
    if (!onPath.has(row.last.id)) S.chat.leafId = deepest(row.last.id);
    const p = pathTo(S.chat.leafId);
    S.showCount = Math.max(S.showCount || PAGE, p.length - p.findIndex((m) => m.id === row.start.id) + 2);
    S.error = '';
    closePanels();
    saveChat();
    $(`#messages [data-id="${row.start.id}"]`)?.scrollIntoView({ block: 'start' });
  };
  const leaves = rows.filter((r) => !r.kids.length).length;
  $('#sheetBody').replaceChildren(
    h('p', { class: 'hint', text: rows.length ? `全部で ${S.msgs.size} 件、枝の先は ${leaves} 本あります。行をタップするとその枝に切り替わります。` : 'まだメッセージがありません。' }),
    ...rows.map((r) => h('div', { class: `treerow ${onPath.has(r.start.id) ? 'on' : ''}`, style: `margin-left:${Math.min(r.depth, 8) * 14}px` },
      h('button', { class: 'plain', onclick: () => jump(r) },
        h('div', { class: 't' }, icon(r.start.role === 'user' ? 'user' : 'ai'), expandImages(r.start.text).replace(IMG_URL, '〔画像〕').replace(/\s+/g, ' ').slice(0, 60) || '（添付のみ）'),
        h('div', { class: 'd', text: `${r.count} 件${r.kids.length ? `　→ ここから ${r.kids.length} つに分岐` : '　・枝の先'}${onPath.has(r.last.id) && !r.kids.length ? '　✔ 今ここ' : ''}　${stamp(r.last.createdAt)}` })),
      h('button', { class: 'iconbtn', 'aria-label': 'この枝を削除', onclick: async () => { await removeMessage(r.start); if (!$('#sheet').hidden) openTree(); } }, icon('trash')))),
  );
  show('#sheet');
}

const SUMMARY_PROMPT = `あなたは物語の記録係です。渡される小説・ロールプレイの本文を、続きを書くための「あらすじ」にまとめてください。

- 出来事を起きた順に書く。
- 登場人物それぞれの今の状態、気持ち、関係の変化を書く。
- 今いる場所と時間、まだ解決していないこと、約束や伏線を書く。
- 途中で決まった設定や呼び名があれば書く。
- 「これまでのあらすじ」が渡されたら、その内容を残したまま、続きの本文の分を足して1つにまとめ直す。
- 内容を和らげたり、評価や感想を加えたりしない。
- 2000字以内。あらすじの本文だけを出力する。`;

// 思考の日本語訳。押したときだけ、要約・翻訳用のモデルで訳して、横の画面に出す。訳は保存して、次からは無料で見られる。
const TRANSLATE_PROMPT = 'あなたは翻訳者です。渡される文章は、AIが返事を書く前に考えた内容のメモです。自然な日本語に翻訳してください。見出しや箇条書きの形はそのまま残し、内容を省いたり、付け足したり、和らげたりしないでください。訳文だけを出力してください。';

async function translateThought(m) {
  $('#sheetTitle').textContent = '思考の日本語訳';
  const out = h('div', { class: 'translated' });
  const copyBtn = h('button', { text: '訳をコピー', disabled: !m.thoughtJa, onclick: () => navigator.clipboard.writeText(out.textContent).then(() => toast('訳をコピーしました')) });
  const conn = summaryConn();
  $('#sheetBody').replaceChildren(
    h('p', { class: 'hint', text: m.thoughtJa ? '前に訳したものです。' : `「${modelLabel(conn)}」で訳しています。モデルは、チャット名 →「あらすじ（要約）」の「要約・翻訳に使うモデル」で変えられます。` }),
    out,
    h('div', { class: 'btnrow' }, copyBtn,
      h('button', { text: '原文をコピー', onclick: () => navigator.clipboard.writeText(m.thought).then(() => toast('原文をコピーしました')) }),
      m.thoughtJa && h('button', { text: '訳し直す', onclick: async () => { delete m.thoughtJa; await db.put('messages', m); render(); translateThought(m); } })),
  );
  show('#sheet');
  if (m.thoughtJa) { out.textContent = m.thoughtJa; return; }
  out.textContent = '訳しています…';
  let text = '';
  try {
    for await (const ev of streamChat(conn, { purpose: '翻訳', system: TRANSLATE_PROMPT, messages: [{ role: 'user', text: m.thought }] })) {
      if (ev.text) { text += ev.text; out.textContent = text; }
    }
    if (!text.trim()) throw new Error('訳が空でした。');
    m.thoughtJa = text.trim();
    await db.put('messages', m);
    copyBtn.disabled = false;
    if (S.chat?.id === m.chatId) render();
  } catch (e) {
    out.textContent = `訳せませんでした。\n${e.message}`;
  }
}

function summaryConn() {
  const cfg = S.settings.summary;
  const base = S.settings.connections.find((c) => c.id === cfg.connId) || activeConn();
  return base && { ...base, model: (cfg.connId && cfg.model) || base.model, tailUser: '', tailModel: '' };
}

async function summarize(manual) {
  if (S.summarizing) return;
  const chat = S.chat;
  const path = pathTo(chat.leafId);
  const keep = Math.max(2, Number(S.settings.summary.keep) || 10);
  const done = chat.summary ? path.findIndex((m) => m.id === chat.summary.uptoId) + 1 : 0;
  let end = path.length - keep;
  while (end > done && path[end - 1].side) end--;
  if (end - done < 2) {
    if (manual) alert(`まだ要約するほど長くありません。\n直近 ${keep} 件はそのまま残し、それより前を要約します。`);
    return;
  }
  const body = path.slice(done, end).filter((m) => !m.side).map((m) => `${m.role === 'user' ? '【ユーザー】' : '【AI】'}\n${apiMessage(m).text}`).join('\n\n');
  const input = `${done ? `# これまでのあらすじ\n${chat.summary.text}\n\n` : ''}# 続きの本文\n${body}`;
  S.summarizing = true;
  if (!manual) toast('古い部分を要約しています…');
  try {
    let out = '';
    for await (const ev of streamChat(summaryConn(), { purpose: manual ? '要約' : '自動要約', system: SUMMARY_PROMPT, messages: [{ role: 'user', text: input }] })) {
      if (ev.text) out += ev.text;
      if (ev.notice && !out) throw new Error(ev.notice);
    }
    if (!out.trim()) throw new Error('要約の返事が空でした。');
    chat.summary = { text: out.trim(), uptoId: path[end - 1].id, createdAt: Date.now() };
    chat.summaryOn = true;
    await db.put('chats', chat);
    toast(`${end} 件目までを要約しました`);
    if (S.chat === chat && !S.busy) { if ($('#sheet').hidden) render(); else openSummary(); }
  } catch (e) {
    if (manual) alert(`要約できませんでした。\n${e.message}`); else toast('要約に失敗しました（チャットはそのまま続けられます）');
  }
  S.summarizing = false;
}

function openSummary() {
  $('#sheetTitle').textContent = 'あらすじ（要約）';
  const chat = S.chat;
  const cfg = S.settings.summary;
  const path = pathTo(chat.leafId);
  const done = chat.summary ? path.findIndex((m) => m.id === chat.summary.uptoId) + 1 : 0;
  const saveChatOnly = () => (S.chats.includes(chat) ? db.put('chats', chat) : null);
  const ta = h('textarea', { class: 'big', value: chat.summary?.text || '', placeholder: 'まだ要約はありません。' });
  tapToEdit(ta, (v) => { if (chat.summary) { chat.summary.text = v; saveChatOnly(); } });
  const models = { '': '本文と同じモデルを使う' };
  for (const c of S.settings.connections) for (const name of c.type === 'dummy' ? ['ダミーAI'] : c.models) models[`${c.id}|${name}`] = `${c.name} / ${name}`;
  const pick = h('select', {}, Object.entries(models).map(([value, text]) => h('option', { value, text })));
  pick.value = cfg.connId ? `${cfg.connId}|${cfg.model}` : '';
  if (pick.selectedIndex < 0) pick.value = '';
  pick.addEventListener('change', () => { [cfg.connId, cfg.model] = pick.value ? pick.value.split('|') : ['', '']; saveSettings(); });
  const runBtn = h('button', { class: 'primary', text: '今すぐ要約する', onclick: async () => { runBtn.disabled = true; runBtn.textContent = '要約中…'; await summarize(true); if (!$('#sheet').hidden) openSummary(); } });
  $('#sheetBody').replaceChildren(
    h('p', { class: 'hint', text: '会話が長くなったら、古い部分をあらすじに置き換えてAIに送ります。料金が減り、序盤の内容も忘れにくくなります。画面の会話は消えません。' }),
    h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: chat.summaryOn !== false, onchange: (e) => { chat.summaryOn = e.target.checked; saveChatOnly(); } }), 'このチャットで要約を使う'),
    h('div', { class: 'hint', text: done ? `${path.length} 件のうち ${done} 件目までを要約済みです。下の文章は書き直せます。` : chat.summary ? '今見ている枝には、この要約は当てはまりません（別の枝で作った要約です）。' : '' }),
    ta,
    h('div', { class: 'btnrow' }, runBtn,
      chat.summary && h('button', { class: 'danger', text: '要約を消す', onclick: async () => { if (!confirm('要約を消して、全文を送る状態に戻しますか？')) return; delete chat.summary; await saveChatOnly(); openSummary(); } })),
    h('div', { class: 'card', style: 'margin-top:14px' },
      h('strong', { text: '要約の設定（全チャット共通）' }),
      field('要約・翻訳に使うモデル', pick, '思考の日本語訳にも使います。安いモデルで十分です。'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!cfg.auto, onchange: (e) => { cfg.auto = e.target.checked; saveSettings(); } }), '長くなったら自動で要約する'),
      field('要約していないメッセージがこの件数を超えたら要約', bound(cfg, 'threshold', saveSettings, { type: 'number', min: '6', inputMode: 'numeric' })),
      field('直近この件数は要約せずそのまま送る', bound(cfg, 'keep', saveSettings, { type: 'number', min: '2', inputMode: 'numeric' }))),
  );
  show('#sheet');
}

function saveText(list) {
  const name = `${(S.chat.title || 'チャット').replace(/[\\/:*?"<>|\n]/g, '_')}.txt`;
  closePanels();
  return saveFile(new File([list.map((m) => m.text).join('\n\n')], name, { type: 'text/plain' }));
}

function openChatMenu() {
  $('#sheetTitle').textContent = 'このチャット';
  const path = pathTo(S.chat.leafId);
  const item = (ic, text, fn) => h('div', { class: 'row' }, h('button', { class: 'plain withic', onclick: fn }, icon(ic), text));
  const foldAll = async (collapsed) => {
    path.forEach((m) => (m.collapsed = collapsed));
    closePanels();
    await db.putMany('messages', path);
  };
  const story = path.filter((m) => !m.side);   // 番外は本文に含めない
  const copy = (list) => navigator.clipboard.writeText(list.map((m) => m.text).join('\n\n')).then(() => { toast('コピーしました'); closePanels(); });
  $('#sheetBody').replaceChildren(
    item('pencil', '名前を変える', async () => {
      const name = prompt('チャットの名前', S.chat.title);
      if (name == null) return;
      S.chat.title = name.trim();
      if (S.chats.includes(S.chat)) await db.put('chats', S.chat);
      closePanels();
    }),
    item('search', 'このチャットを検索', () => openFind(S.lastFind || '')),
    h('p', { class: 'grouphead', text: '見る・のぞく' }),
    item('phone', 'スマホをのぞく', phone.openPeekSheet),
    item('gauge', '使用量（トークン・キャッシュ）', openUsage),
    item('gauge', '通信の記録（エラーの確認用）', openNetLog),
    item('branch', '分岐ツリー', openTree),
    h('p', { class: 'grouphead', text: '整理' }),
    item('summary', `あらすじ（要約）${S.chat.summary ? (S.chat.summaryOn === false ? '（オフ）' : '（あり）') : ''}`, openSummary),
    item('fold', 'すべてたたむ', () => foldAll(true)),
    item('unfold', 'すべてひらく', () => foldAll(false)),
    h('p', { class: 'grouphead', text: '書き出し' }),
    item('copy', '全文をコピー（今見えている枝）', () => copy(story)),
    item('copy', 'AIの文章だけコピー', () => copy(story.filter((m) => m.role === 'assistant'))),
    item('save', 'テキストファイルで保存（全文）', () => saveText(story)),
    item('save', 'テキストファイルで保存（AIの文章だけ）', () => saveText(story.filter((m) => m.role === 'assistant'))),
  );
  show('#sheet');
}

// 登場人物のカードから、新しいチャットを1回で始める（主人公とプロンプトは今のチャットから引き継ぐ）
async function startFromCard(c) {
  const chat = blankChat();
  chat.charIds = [c.id, ...chat.charIds.filter((id) => S.chars.find((x) => x.id === id)?.type !== 'char')];
  await openChat(chat);
  closePanels();
  if (c.greeting?.trim()) await startWith(c);
  else { S.chat.title = c.name; await saveChat(); render(); }
}

// このチャットの中を検索する。今見ている枝を先に、ほかの枝は後に並べる。
function openFind(query = '') {
  $('#sheetTitle').textContent = 'このチャットを検索';
  const input = h('input', { type: 'text', value: query, placeholder: '探す言葉', enterkeyhint: 'search' });
  const list = h('div', {});
  const onPath = new Set(pathTo(S.chat.leafId).map((m) => m.id));
  const run = () => {
    const q = input.value.trim();
    if (!q) { list.replaceChildren(h('p', { class: 'hint', text: '言葉を入れると、このチャットの全部の枝から探します。' })); return; }
    const hits = [...S.msgs.values()].filter((m) => m.text.includes(q))
      .sort((a, b) => (onPath.has(b.id) - onPath.has(a.id)) || a.createdAt - b.createdAt);
    list.replaceChildren(
      h('p', { class: 'hint', text: hits.length ? `${hits.length} 件見つかりました${hits.length > 100 ? '（最初の100件を表示）' : ''}` : '見つかりませんでした。' }),
      ...hits.slice(0, 100).map((m) => {
        const i = m.text.indexOf(q);
        const before = m.text.slice(Math.max(0, i - 24), i).replace(/\s+/g, ' ');
        const after = m.text.slice(i + q.length, i + q.length + 40).replace(/\s+/g, ' ');
        return h('div', { class: 'row findrow' }, h('button', { class: 'plain', onclick: () => jumpTo(m, q) },
          h('div', { class: 'd', text: `${m.role === 'user' ? '自分' : m.side ? '番外' : 'AI'}・${stamp(m.createdAt)}${onPath.has(m.id) ? '' : '・別の枝'}` }),
          h('div', { class: 'snip' }, `${i > 24 ? '…' : ''}${before}`, h('mark', { text: q }), `${after}…`)));
      }));
  };
  input.addEventListener('input', run);
  $('#sheetBody').replaceChildren(input, list);
  run();
  show('#sheet');
  input.focus();
}

async function jumpTo(m, q) {
  if (!pathTo(S.chat.leafId).includes(m)) { S.chat.leafId = deepest(m.id); await saveChat(); }
  const path = pathTo(S.chat.leafId);
  S.showCount = Math.max(S.showCount || PAGE, path.length - path.indexOf(m) + 2);
  if (m.collapsed) { m.collapsed = false; db.put('messages', m); }
  closePanels();
  const el = $(`#messages [data-id="${m.id}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  el.classList.add('found');
  setTimeout(() => el.classList.remove('found'), 2200);
  S.lastFind = q;
}

function openStartSheet() {
  $('#sheetTitle').textContent = '人物を選んで始める';
  const cast = S.chars.filter((c) => (c.type || 'char') === 'char');
  const hero = heroOf(S.chat);
  $('#sheetBody').replaceChildren(...[
    h('p', { class: 'hint', text: `選んだ人物で新しいチャットを始めます。始まり方が書いてあれば、そこから始まります。主人公（${hero?.name || 'なし'}）とプロンプトは今のチャットと同じです。` }),
    ...cast.map((c) => h('div', { class: 'row' }, h('button', { class: 'plain withic', onclick: () => startFromCard(c) },
      avatar(c, 'av') || icon('user'), h('span', { text: c.name || '（名前なし）' }), c.greeting?.trim() && h('small', { class: 'tag', text: '始まり方あり' })))),
    !cast.length && h('p', { class: 'hint', text: 'まだ登場人物のカードがありません。歯車 →「キャラ」で作れます。' }),
  ].filter(Boolean));
  show('#sheet');
}

async function startWith(c) {
  const m = { id: uid(), chatId: S.chat.id, parentId: null, role: 'assistant', text: fillNames(S.chat, c.greeting.trim()), createdAt: Date.now() };
  S.msgs.set(m.id, m);
  S.chat.leafId = m.id;
  if (!S.chat.title) S.chat.title = c.name;
  render();
  await Promise.all([db.put('messages', m), saveChat()]);
}

// ---------- 会話の操作 ----------
// 保存してあるメッセージを、APIに送る形にする（テキスト添付は本文に足し、画像は別に渡す）
function apiMessage(m) {
  const texts = filesOf(m).filter((f) => f.kind === 'text').map((f) => `【添付ファイル: ${f.name}】\n${f.text}`);
  return {
    role: m.role,
    text: [m.text, ...texts].filter(Boolean).join('\n\n'),
    images: filesOf(m).filter((f) => f.kind === 'image').map((f) => ({ mime: f.mime, data: f.data })),
  };
}

function renderPending() {
  const box = $('#pending');
  box.hidden = !S.pending.length;
  box.replaceChildren(...S.pending.map((f) => h('button', { onclick: () => { S.pending = S.pending.filter((x) => x !== f); renderPending(); } }, icon(f.kind === 'image' ? 'image' : 'clip'), `${f.name} ✕`)));
  updateBar();
}

async function addFiles(files) {
  for (const f of files) {
    try {
      if (f.type.startsWith('image/')) {
        const url = await toDataUrl(await shrinkImage(f));
        S.pending.push({ kind: 'image', name: f.name, mime: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) });
      } else {
        S.pending.push({ kind: 'text', name: f.name, text: await f.text() });
      }
    } catch (e) {
      alert(`「${f.name}」を読み込めませんでした。\n${e.message}`);
    }
  }
  renderPending();
}

// 差し込みプロンプトを実行する。side は番外（履歴に入れない）、steer は本編の続きとして出す。
function runInsert(ins, parentId = S.chat.leafId ?? null) {
  if (S.busy) return;
  const text = fillNames(S.chat, ins.text).replace(/\{\{char\}\}/gi, '相手役').replace(/\{\{user\}\}/gi, 'ユーザー');
  if (ins.mode === 'steer') return generate(parentId, { extraUser: `（次の指示に沿って、本編の続きを書いてください。この指示文そのものには触れないこと）\n${text}` });
  return generate(parentId, {
    extraUser: `（これは本編には残らない番外の出力です。本編の続きは書かず、次の指示の内容だけを出力してください）\n\n${text}`,
    side: { name: ins.name, text: ins.text },
  });
}

function openInsertSheet() {
  $('#sheetTitle').textContent = '差し込み';
  const list = S.settings.inserts;
  const group = (mode, title, hint) => {
    const items = list.filter((i) => (i.mode || 'side') === mode);
    return items.length ? [h('p', { class: 'grouphead', text: title }), h('p', { class: 'hint', text: hint }),
      ...items.map((i) => h('div', { class: 'row' }, h('button', { class: 'plain withic', onclick: () => { closePanels(); runInsert(i); } }, icon(mode === 'side' ? 'spark' : 'branch'), i.name || '（名前なし）')))] : [];
  };
  $('#sheetBody').replaceChildren(
    ...group('side', '番外として見る', '本編とは別枠で出します。相手には知られず、この先の会話にも影響しません。'),
    ...group('steer', '本編に反映する', '見えない指示として送り、返事は本編の続きになります。'),
    h('div', { class: 'btnrow' }, h('button', { text: '追加・編集する', onclick: () => openSettings('prompts') })),
  );
  show('#sheet');
}

// メッセージの添付。編集で作った枝は、元のメッセージの添付を参照する（画像を二重に保存しない）
const filesOf = (m) => m.files || (m.filesRef && S.fileStore?.get(m.filesRef)) || [];

const continueFrom = (m) => generate(m.id, { extraUser: S.settings.ui.continueText.trim() || '続きを書いてください。' });

async function generate(parentId, opts = {}) {
  if (S.busy) return;
  const conn = activeConn();
  const fullPath = pathTo(parentId);
  let cut = summaryCut(S.chat, [...fullPath, {}]);
  if (cut >= fullPath.length || !fullPath.slice(cut).some((x) => !x.side)) cut = 0;
  const history = fullPath.slice(cut).filter((x) => !x.side).map(apiMessage);
  const { system, loaded } = buildSystem(S.chat, history.slice(-4).map((x) => x.text).join('\n'), cut ? S.chat.summary.text : '');
  if (opts.extraUser) history.push({ role: 'user', text: opts.extraUser });
  if (conn?.tailUser?.trim()) history.push({ role: 'user', text: conn.tailUser });
  const prefill = conn?.tailModel?.trim() ? conn.tailModel : '';
  if (prefill) history.push({ role: 'assistant', text: prefill });
  let got = false;
  const m = { id: uid(), chatId: S.chat.id, parentId, role: 'assistant', text: prefill && conn.tailJoin ? prefill : '', thought: '', createdAt: Date.now() };
  if (loaded.length) m.loaded = loaded;
  if (opts.side) Object.assign(m, { side: true, sideName: opts.side.name, sideText: opts.side.text });
  m.modelId = conn?.type === 'dummy' ? '' : conn?.model || '';
  m.model = modelLabel(conn) + (S.settings.connections.length > 1 && conn?.type !== 'dummy' ? `（${conn.name}）` : '');
  const chat = S.chat;
  S.msgs.set(m.id, m);
  chat.leafId = m.id;
  S.error = '';
  S.editing = null;
  S.busy = true;
  S.abort = new AbortController();
  render();
  scrollBottom();

  const box = $('#messages');
  const body = box.querySelector(`[data-id="${m.id}"] .body`);
  const ui = S.settings.ui;
  const started = Date.now();
  const waiting = () => S.retryNote || `${m.thought ? '思考中' : '応答待ち'}…${ui.showTimer ? ` ${Math.round((Date.now() - started) / 1000)}秒` : ''}`;
  body.textContent = waiting();
  let queued = false;
  const paint = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (S.chat !== chat) return;
      const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      body.textContent = got || m.text ? m.text : waiting();
      updateBar();
      if (stick && ui.autoScroll) scrollBottom();
    });
  };

  const ticker = setInterval(() => { if (!m.text) paint(); }, 1000);
  const tries = Number(ui.retries ?? 2);
  let useConn = conn;
  let fellBack = false;
  for (let attempt = 0; ; attempt++) {
    try {
      for await (const ev of streamChat(useConn, { purpose: attempt > 0 ? `やり直し${attempt}` : fellBack ? '予備モデル' : opts.side ? '番外' : '返事', system, messages: history, signal: S.abort.signal })) {
        if (ev.text) { m.text += ev.text; got = true; }
        if (ev.thought) m.thought += ev.thought;
        if (ev.notice) m.notice = ev.notice;
        if (ev.usage) m.usage = ev.usage;
        paint();
      }
      break;
    } catch (e) {
      if (e.name === 'AbortError') break;
      // 混雑（429）・サーバー側のエラー（5xx）・通信の失敗は、返事がまだ1文字も来ていなければ、少し待ってやり直す
      if (!got && e.retryable && attempt < tries) {
        // 待ち時間は少しずつ延ばし、ばらつきも入れる（みんなが同じ瞬間にやり直して、また混むのを避ける）
        const wait = ([4, 10, 20, 40, 60][attempt] || 60) + Math.round(Math.random() * 3);
        m.thought = '';
        S.retryNote = `混んでいるようです。${wait}秒後にやり直します（${attempt + 1}/${tries}）`;
        paint();
        const ok = await new Promise((resolve) => {
          const t = setTimeout(() => resolve(true), wait * 1000);
          S.abort.signal.addEventListener('abort', () => { clearTimeout(t); resolve(false); }, { once: true });
        });
        S.retryNote = '';
        if (ok) continue;
        break;
      }
      // やり直しても混んでいるときは、決めておいた予備のモデルで返事をもらう
      const backup = conn?.fallbackModel?.trim();
      if (!got && e.status === 429 && backup && !fellBack && backup !== useConn.model) {
        fellBack = true;
        useConn = { ...conn, model: backup };
        m.modelId = backup;
        m.model = backup + (S.settings.connections.length > 1 ? `（${conn.name}）` : '');
        m.notice = `${conn.model} が混んでいたため、予備の ${backup} で返事をもらいました`;
        attempt = -1;   // 予備のモデルでも、やり直しの回数は最初から数える
        continue;
      }
      if (e.vertexProject && conn && !conn.project) {
        conn.project = e.vertexProject;
        saveSettings();
        if (conn.location && !got) continue;   // プロジェクトが分かったので、選んだリージョンでやり直す
      }
      S.error = e.message;
      break;
    }
  }
  S.retryNote = '';

  clearInterval(ticker);
  S.busy = false;
  if (got) {
    await db.put('messages', m);
  } else {
    S.msgs.delete(m.id);
    if (chat.leafId === m.id) chat.leafId = parentId;
    if (!S.error && !S.abort.signal.aborted) S.error = m.notice || '返事が空でした。もう一度試してください。';
  }
  if (S.chat === chat) { await saveChat(); render(); } else { await db.put('chats', chat); }
  if (got && S.chat === chat && S.settings.summary.auto) {
    const p = pathTo(chat.leafId);
    if (p.length - summaryCut(chat, p) > Number(S.settings.summary.threshold || 40)) summarize(false);
  }
}

async function send() {
  if (S.busy) { S.abort.abort(); return; }
  const input = $('#input');
  const text = input.value.trim();
  const leaf = S.msgs.get(S.chat.leafId);
  if (!text && !S.pending.length) {
    if (leaf?.role === 'user') generate(leaf.id);
    else if (leaf) continueFrom(leaf);
    return;
  }
  const m = { id: uid(), chatId: S.chat.id, parentId: S.chat.leafId ?? null, role: 'user', text, createdAt: Date.now() };
  if (S.pending.length) { m.files = S.pending; S.fileStore?.set(m.id, m.files); S.pending = []; renderPending(); }
  S.msgs.set(m.id, m);
  S.chat.leafId = m.id;
  if (!S.chat.title) S.chat.title = (text || m.files[0].name).replace(/\s+/g, ' ').slice(0, 24);
  input.value = '';
  $('#composer').classList.remove('tall');   // 大きくした入力欄は、送ったら元に戻す
  resizeInput();
  saveDraft();
  await Promise.all([db.put('messages', m), saveChat()]);
  generate(m.id);
}

async function switchBranch(target) {
  S.chat.leafId = deepest(target.id);
  S.error = '';
  render();
  await saveChat();
}

function editMessage(m) {
  S.moreFor = null;
  const isUser = m.role === 'user';
  openEditor({
    title: isUser ? '自分の発言を編集' : m.side ? '番外を編集' : '返事を編集',
    value: m.text,
    done: { label: isUser ? '送り直す' : '別の枝で保存', fn: (v) => saveEdit(m, v, true) },
    extra: [{ label: '上書きだけ（枝を作らない）', fn: (v) => saveEdit(m, v, false) }],
  });
}

async function saveEdit(m, text, asBranch) {
  S.editing = null;
  if (!text.trim()) { render(); return; }
  if (!asBranch) {
    m.text = text;
    await db.put('messages', m);
    render();
    return;
  }
  const copy = { id: uid(), chatId: m.chatId, parentId: m.parentId, role: m.role, text, createdAt: Date.now() };
  if (m.files) copy.filesRef = m.id; else if (m.filesRef) copy.filesRef = m.filesRef;
  S.msgs.set(copy.id, copy);
  S.chat.leafId = copy.id;
  await Promise.all([db.put('messages', copy), saveChat()]);
  if (copy.role === 'user') generate(copy.id);
  else render();
}

// ---------- ゴミ箱 ----------
// 削除したチャットとメッセージは30日間残し、ゴミ箱から戻せる。
const TRASH_DAYS = 30;

// 完全に消す。消すメッセージの添付を参照している枝があれば、添付をそちらへ移す。
async function eraseMessages(list) {
  const gone = new Set(list.map((m) => m.id));
  const byChat = new Map();
  for (const m of list) if (m.files) byChat.set(m.chatId, true);
  const fix = [];
  for (const chatId of byChat.keys()) {
    const all = await db.messagesOf(chatId);
    for (const src of list.filter((m) => m.chatId === chatId && m.files)) {
      const users = all.filter((x) => x.filesRef === src.id && !gone.has(x.id));
      if (!users.length) continue;
      const [heir, ...rest] = users;
      heir.files = src.files; delete heir.filesRef; fix.push(heir);
      for (const r of rest) { r.filesRef = heir.id; fix.push(r); }
      if (S.chat?.id === chatId) S.fileStore?.set(heir.id, heir.files);
    }
  }
  if (fix.length) await db.putMany('messages', fix);
  await db.delMany('messages', [...gone]);
}

async function purgeTrash() {
  const limit = Date.now() - TRASH_DAYS * 86400000;
  const [chats, messages] = await Promise.all([db.all('chats'), db.all('messages')]);
  const oldChats = chats.filter((c) => c.deletedAt && c.deletedAt < limit);
  const oldChatIds = new Set(oldChats.map((c) => c.id));
  const oldMsgs = messages.filter((m) => oldChatIds.has(m.chatId) || (m.deletedAt && m.deletedAt < limit));
  if (oldMsgs.length) await eraseMessages(oldMsgs);
  if (oldChats.length) await db.delMany('chats', [...oldChatIds]);
}

async function openTrash() {
  $('#sheetTitle').textContent = 'ゴミ箱';
  const [chats, messages] = await Promise.all([db.all('chats'), db.all('messages')]);
  const deadChats = chats.filter((c) => c.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
  const live = new Map(chats.filter((c) => !c.deletedAt).map((c) => [c.id, c]));
  const groups = new Map();
  for (const m of messages) if (m.deletedAt && live.has(m.chatId)) {
    const g = groups.get(m.trashGroup || m.id) || { id: m.trashGroup || m.id, chat: live.get(m.chatId), list: [] };
    g.list.push(m);
    groups.set(g.id, g);
  }
  const msgGroups = [...groups.values()].map((g) => ({ ...g, head: g.list.find((m) => m.id === g.id) || g.list[0], at: Math.max(...g.list.map((m) => m.deletedAt)) })).sort((a, b) => b.at - a.at);
  const left = (t) => Math.max(1, Math.ceil((t + TRASH_DAYS * 86400000 - Date.now()) / 86400000));
  const snippet = (t) => (t || '（添付のみ）').replace(/\s+/g, ' ').slice(0, 50);
  const row = (title, sub, restore, erase) => h('div', { class: 'trashrow' },
    h('div', { class: 'tmain' }, h('div', { class: 't', text: title }), h('div', { class: 'd', text: sub })),
    h('div', { class: 'acts' }, h('button', { text: '戻す', onclick: restore }), h('button', { class: 'danger', text: '完全に削除', onclick: erase })));
  $('#sheetBody').replaceChildren(...[
    h('p', { class: 'hint', text: `削除したチャットとメッセージは、${TRASH_DAYS}日間ここに残ります。過ぎると自動で完全に削除されます。` }),
    h('p', { class: 'grouphead', text: 'チャット' }),
    ...deadChats.map((c) => row(c.title || '（無題）', `削除 ${stamp(c.deletedAt)}・あと${left(c.deletedAt)}日`,
      async () => { delete c.deletedAt; await db.put('chats', c); S.chats.push(c); toast('チャットを戻しました'); openTrash(); },
      async () => {
        if (!confirm(`「${c.title || '無題'}」を完全に削除します。元に戻せません。`)) return;
        await eraseMessages(await db.messagesOf(c.id)); await db.del('chats', c.id); openTrash();
      })),
    !deadChats.length && h('p', { class: 'hint', text: 'ありません。' }),
    h('p', { class: 'grouphead', text: 'メッセージ' }),
    ...msgGroups.map((g) => row(`${g.head.role === 'user' ? '自分' : g.head.side ? '番外' : 'AI'}：${snippet(g.head.text)}`,
      `${g.chat.title || '（無題）'}${g.list.length > 1 ? `・続き ${g.list.length - 1} 件も` : ''}・あと${left(g.at)}日`,
      () => restoreGroup(g), async () => {
        if (!confirm('このメッセージを完全に削除します。元に戻せません。')) return;
        await eraseMessages(g.list); openTrash();
      })),
    !msgGroups.length && h('p', { class: 'hint', text: 'ありません。' }),
    (deadChats.length || msgGroups.length) && h('div', { class: 'btnrow' }, h('button', { class: 'danger', text: 'ゴミ箱を空にする', onclick: async () => {
      if (!confirm('ゴミ箱の中身をすべて完全に削除します。元に戻せません。')) return;
      await eraseMessages([...messages.filter((m) => m.deletedAt), ...messages.filter((m) => deadChats.some((c) => c.id === m.chatId))]);
      await db.delMany('chats', deadChats.map((c) => c.id));
      openTrash();
    } })),
  ].filter(Boolean));
  show('#sheet');
}

// 戻す。親がまだゴミ箱にあれば、親も一緒に戻す。番外を消したときに付け替えた続きは、番外の下へ戻す。
async function restoreGroup(g) {
  const all = await db.messagesOf(g.chat.id);
  const byId = new Map(all.map((m) => [m.id, m]));
  const back = new Set(g.list.map((m) => m.id));
  let p = byId.get(g.head.parentId);
  while (p) {
    if (p.deletedAt) for (const m of all) if (m.deletedAt && (m.trashGroup || m.id) === (p.trashGroup || p.id)) back.add(m.id);
    p = byId.get(p.parentId);
  }
  const changed = [];
  for (const id of back) {
    const m = byId.get(id);
    delete m.deletedAt; delete m.trashGroup;
    if (m.sideKids) {
      for (const kid of m.sideKids.map((k) => byId.get(k)).filter(Boolean)) if (kid.parentId === m.parentId) { kid.parentId = m.id; changed.push(kid); }
      delete m.sideKids;
    }
    changed.push(m);
  }
  await db.putMany('messages', changed);
  // 今のチャットの続きにあたる部分を戻したなら、表示もその先までつなぐ
  const chat = S.chats.find((c) => c.id === g.chat.id) || g.chat;
  const head = byId.get(g.head.id);
  let top = head;
  while (top.parentId && back.has(top.parentId)) top = byId.get(top.parentId);
  if ((chat.leafId ?? null) === (top.parentId ?? null)) {
    let id = head.prevLeaf && back.has(head.prevLeaf) ? head.prevLeaf : head.id;
    for (;;) {
      const kids = all.filter((m) => m.parentId === id && !m.deletedAt).sort((a, b) => a.createdAt - b.createdAt);
      if (!kids.length) break;
      id = kids[kids.length - 1].id;
    }
    chat.leafId = id;
    delete head.prevLeaf;
    await Promise.all([db.put('chats', chat), db.put('messages', head)]);
  }
  if (S.chat?.id === g.chat.id) await openChat(S.chat);
  toast('メッセージを戻しました');
  openTrash();
}

async function removeMessage(m) {
  if (m.side) {
    if (!S.settings.ui.skipDeleteConfirm && !confirm(`この番外を削除しますか？\nこのあとに続く会話は残ります。（${TRASH_DAYS}日間はゴミ箱から戻せます）`)) return;
    const kids = childrenOf(m.id);
    kids.forEach((k) => { k.parentId = m.parentId; });
    S.msgs.delete(m.id);
    if (S.chat.leafId === m.id) S.chat.leafId = m.parentId;
    Object.assign(m, { deletedAt: Date.now(), trashGroup: m.id, sideKids: kids.map((k) => k.id) });
    S.error = '';
    render();
    await Promise.all([db.putMany('messages', [...kids, m]), saveChat()]);
    return;
  }
  const ids = subtree(m.id);
  const more = ids.length > 1 ? `\nこの先に続く ${ids.length - 1} 件も一緒に消えます。` : '';
  if (!S.settings.ui.skipDeleteConfirm && !confirm(`このメッセージを削除しますか？${more}\n（${TRASH_DAYS}日間はゴミ箱から戻せます）`)) return;
  const onPath = pathTo(S.chat.leafId).includes(m);
  const now = Date.now();
  if (onPath) m.prevLeaf = S.chat.leafId;   // 戻したときに、読んでいた枝の先へ戻れるように
  const trashed = ids.map((id) => Object.assign(S.msgs.get(id), { deletedAt: now, trashGroup: m.id }));
  ids.forEach((id) => S.msgs.delete(id));
  if (onPath) {
    const sibs = childrenOf(m.parentId);
    S.chat.leafId = sibs.length ? deepest(sibs[sibs.length - 1].id) : m.parentId;
  }
  S.error = '';
  render();
  await Promise.all([db.putMany('messages', trashed), saveChat()]);
}

// ---------- パネル ----------
const PANELS = ['#drawer', '#sheet', '#settings', '#phone', '#setup'];

function show(sel) {
  PANELS.forEach((p) => ($(p).hidden = p !== sel));
  $('#backdrop').hidden = false;
}

function closePanels() {
  flushSaves();
  PANELS.forEach((p) => ($(p).hidden = true));
  $('#backdrop').hidden = true;
  render();
}

const stamp = (t) => new Date(t).toLocaleString('ja-JP', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

function pickFile(accept, fn) {
  const el = h('input', { type: 'file', accept, onchange: () => el.files[0] && fn(el.files[0]) });
  el.click();
}

let chatQuery = '';
let chatPerson = '';
let bodyIndex = null;

async function searchChats(q) {
  chatQuery = q.trim();
  if (chatQuery && !bodyIndex) {
    bodyIndex = new Map();
    for (const m of await db.all('messages')) if (!m.deletedAt) bodyIndex.set(m.chatId, `${bodyIndex.get(m.chatId) || ''}\n${m.text}`);
  }
  openDrawer(true);
}

function openDrawer(keepSearch) {
  if (keepSearch !== true) { chatQuery = ''; chatPerson = ''; bodyIndex = null; $('#chatSearch').value = ''; }
  const hit = (c) => (!chatQuery || (c.title || '').includes(chatQuery) || (bodyIndex?.get(c.id) || '').includes(chatQuery))
    && (!chatPerson || (c.charIds || []).includes(chatPerson) || c.heroId === chatPerson);
  const people = (c) => { normalizeChat(c); return [heroOf(c)?.name, chatChars(c).filter((x) => (x.type || 'char') === 'char').map((x) => x.name).join('・')].filter(Boolean).join(' × '); };
  const used = S.chars.filter((x) => x.type === 'hero' || (x.type || 'char') === 'char');
  $('#chatPerson').replaceChildren(h('option', { value: '', text: 'すべての人物' }), ...used.map((x) => h('option', { value: x.id, text: x.name || '（名前なし）' })));
  $('#chatPerson').value = used.some((x) => x.id === chatPerson) ? chatPerson : '';
  $('#drawerTools').replaceChildren(
    h('button', { text: '全出力', onclick: exportData }),
    h('button', { text: '取込', onclick: () => pickFile('.json,application/json', (f) => importData(f).then(openDrawer)) }),
    h('button', { text: 'テキスト取込', onclick: () => pickFile('.txt,text/plain', importText) }),
    h('button', { 'aria-label': 'ゴミ箱', class: 'trashbtn', onclick: openTrash }, icon('trash')),
  );
  $('#chatList').replaceChildren(...S.chats
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt)
    .filter(hit)
    .map((c) => h('div', { class: `chatrow ${c === S.chat ? 'on' : ''}` },
      h('button', { class: 'plain', onclick: async () => { await openChat(c); closePanels(); } },
        h('div', { class: 't' }, c.pinned && icon('pin'), c.title || '（無題）'),
        people(c) && h('div', { class: 'p', text: people(c) }),
        h('div', { class: 'd', text: `作成 ${stamp(c.createdAt)}　更新 ${stamp(c.updatedAt)}` })),
      h('div', { class: 'acts' },
        h('button', { class: c.pinned ? 'pinned' : '', 'aria-label': c.pinned ? 'ピン留めを外す' : 'ピン留め', onclick: async () => { c.pinned = !c.pinned; await db.put('chats', c); openDrawer(true); } }, icon('pin')),
        h('button', { 'aria-label': '名前を変える', onclick: async () => {
          const name = prompt('チャットの名前', c.title);
          if (name == null) return;
          c.title = name.trim();
          await db.put('chats', c);
          render();
          openDrawer();
        } }, icon('pencil')),
        h('button', { text: '出力', onclick: () => exportChat(c) }),
        h('button', { text: '複製', onclick: () => duplicateChat(c) }),
        h('button', { class: 'danger', text: '削除', onclick: () => removeChat(c) })),
    )));
  if (!$('#chatList').children.length) $('#chatList').append(h('p', { class: 'hint', text: chatQuery || chatPerson ? '見つかりませんでした。' : 'まだチャットはありません。' }));
  show('#drawer');
}

function liveMessages(all) {
  const byId = new Map(all.map((m) => [m.id, m]));
  return all.filter((m) => !m.deletedAt).map((m) => {
    if (!m.filesRef) return m;
    const src = byId.get(m.filesRef);
    if (src && !src.deletedAt) return m;
    const out = { ...m, files: src?.files || [] };
    delete out.filesRef;
    return out;
  });
}

async function exportChat(c) {
  const messages = liveMessages(await db.messagesOf(c.id));
  const data = { app: 'sousaku-pwa', version: 1, exportedAt: new Date().toISOString(), chats: [c], messages, chars: await packChars([...chatChars(normalizeChat(c)), heroOf(c)?.card].filter(Boolean)) };
  await saveFile(new File([JSON.stringify(data)], `${(c.title || 'チャット').replace(/[\\/:*?"<>|\n]/g, '_')}.json`, { type: 'application/json' }));
}

async function duplicateChat(c) {
  const msgs = liveMessages(await db.messagesOf(c.id));
  const ids = new Map(msgs.map((m) => [m.id, uid()]));
  const copy = { ...c, id: uid(), title: `${c.title || '無題'}（複製）`, createdAt: Date.now(), updatedAt: Date.now(), leafId: ids.get(c.leafId) ?? null };
  if (c.summary) copy.summary = { ...c.summary, uptoId: ids.get(c.summary.uptoId) };
  await db.putMany('messages', msgs.map((m) => ({ ...m, id: ids.get(m.id), chatId: copy.id, parentId: m.parentId ? ids.get(m.parentId) : null, ...(m.filesRef ? { filesRef: ids.get(m.filesRef) } : {}) })));
  await db.put('chats', copy);
  S.chats.unshift(copy);
  openDrawer();
  toast('複製しました');
}

async function importText(file) {
  const text = (await file.text()).trim();
  if (!text) { alert('ファイルが空です。'); return; }
  const chat = { ...blankChat(), title: file.name.replace(/\.[^.]+$/, '') };
  const m = { id: uid(), chatId: chat.id, parentId: null, role: 'assistant', text, createdAt: Date.now() };
  chat.leafId = m.id;
  await db.put('messages', m);
  await openChat(chat);
  await saveChat();
  closePanels();
  toast('テキストを新しいチャットとして取り込みました');
}

async function removeChat(c) {
  if (!confirm(`「${c.title || '無題'}」を削除しますか？\n${TRASH_DAYS}日間はゴミ箱から戻せます。`)) return;
  c.deletedAt = Date.now();
  await db.put('chats', c);
  S.chats = S.chats.filter((x) => x !== c);
  if (S.chat === c) await openChat(blankChat());
  openDrawer();
}

function modelEditor(c, onPick, again) {
  const input = h('input', { type: 'text', placeholder: 'モデル名を入力して追加', autocapitalize: 'off', autocorrect: 'off' });
  const choose = (name) => {
    c.model = name;
    saveSettings();
    if (onPick) onPick(); else again();
  };
  const add = () => {
    const name = input.value.trim();
    if (!name) return;
    if (!c.models.includes(name)) c.models.push(name);
    choose(name);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  const current = (name) => c.model === name && (!onPick || c.id === S.settings.activeConnId);
  return h('div', {},
    c.models.map((name) => h('div', { class: `row ${current(name) ? 'on' : ''}` },
      h('button', { class: 'plain', text: `${current(name) ? '✔ ' : ''}${name}`, onclick: () => choose(name) }),
      h('button', { class: 'iconbtn', text: '✕', 'aria-label': '一覧から消す', onclick: () => {
        c.models = c.models.filter((x) => x !== name);
        if (c.model === name) c.model = c.models[0] || '';
        saveSettings();
        again();
      } }))),
    h('div', { class: 'addrow' }, input, h('button', { text: '追加', onclick: add })));
}

// 右から出る「この話の設定」。このチャットだけの選択（主人公・登場人物・資料・今回の話・プロンプト）をまとめる。
function openSetup() {
  flushSaves();
  const chat = S.chat;
  const body = $('#setupBody');
  const keep = $('#setup').hidden ? 0 : body.scrollTop;
  const saveChatOnly = () => (S.chats.includes(chat) ? db.put('chats', chat) : null);
  const again = async () => { await saveSettings(); await saveChatOnly(); render(); openSetup(); };
  const row = (on, kind, label, onclick, card) => h('div', { class: `row pick ${on ? 'on' : ''}` },
    h('button', { class: 'plain withic', onclick }, icon(`${kind}${on ? 'On' : 'Off'}`), card && avatar(card, 'av sm'), label));
  const none = (text) => h('p', { class: 'hint', text });

  // 主人公（1人）
  const heroes = S.chars.filter((c) => c.type === 'hero');
  const setHero = (id) => { chat.heroId = id; if (id !== 'custom') S.settings.lastHeroId = id; again(); };
  const custom = (chat.heroCustom ||= { name: '', text: '' });
  const heroPart = [
    h('h3', { class: 'grouphead', text: '主人公' }),
    row(!chat.heroId, 'radio', 'なし', () => setHero(null)),
    ...heroes.map((c) => row(chat.heroId === c.id, 'radio', c.name || '（名前なし）', () => setHero(c.id), c)),
    row(chat.heroId === 'custom', 'radio', 'この話だけの主人公を書く', () => setHero('custom')),
    chat.heroId === 'custom' && h('div', { class: 'card inset' },
      field('名前', bound(custom, 'name', () => { saveChatOnly(); render(); }, { type: 'text', placeholder: '例: タイトロープ' })),
      field('設定', bound(custom, 'text', saveChatOnly, { placeholder: '年齢、容姿、立場、相手との関係など。このチャットのときだけ使います。' }, 'textarea')),
      h('div', { class: 'btnrow' }, h('button', { text: 'この主人公をカードとして保存', onclick: async () => {
        if (!custom.name?.trim() && !custom.text?.trim()) { alert('先に名前か設定を書いてください。'); return; }
        const card = { id: uid(), type: 'hero', name: custom.name.trim() || '主人公', core: custom.text, detail: '', keywords: '', greeting: '', createdAt: Date.now() };
        S.chars.push(card);
        await db.put('chars', card);
        chat.heroId = card.id;
        S.settings.lastHeroId = card.id;
        toast('主人公カードに保存しました');
        again();
      } }))),
  ];

  // 登場人物・世界設定・資料（いくつでも）
  const ids = (chat.charIds ||= []);
  const toggle = (c) => {
    const i = ids.indexOf(c.id);
    if (i >= 0) ids.splice(i, 1); else ids.push(c.id);
    S.settings.lastCharIds = [...ids];
    applyBg();
    again();
  };
  const group = (type, title, empty) => {
    const list = S.chars.filter((c) => (c.type || 'char') === type);
    return [h('h3', { class: 'grouphead', text: title }),
      ...list.map((c) => row(ids.includes(c.id), 'box', c.name || '（名前なし）', () => toggle(c), c)),
      !list.length && none(empty)];
  };

  // プロンプト（1つ）
  const setPrompt = (id) => { chat.promptId = id; S.settings.lastPromptId = id; again(); };

  body.replaceChildren(...[
    ...heroPart,
    ...group('char', '相手役・登場人物', 'まだありません。下の「作る・編集する」から追加できます。'),
    ...group('world', '世界設定', 'まだありません。'),
    ...group('doc', '資料', 'まだありません。'),
    h('h3', { class: 'grouphead', text: '今回の話' }),
    field('', bound(chat, 'note', saveChatOnly, { 'data-title': '今回の話', placeholder: 'このチャットだけの設定や、話の始まり。\n例: 文化祭の前日。二人がけんかするところから始める。' }, 'textarea')),
    h('h3', { class: 'grouphead', text: 'プロンプト' }),
    row(!chat.promptId, 'radio', 'なし', () => setPrompt(null)),
    ...S.prompts.map((p) => row(chat.promptId === p.id, 'radio', p.name || '（名前なし）', () => setPrompt(p.id))),
    h('div', { class: 'btnrow', style: 'margin-top:18px' },
      h('button', { text: 'カードを作る・編集する', onclick: () => openSettings('chars') }),
      h('button', { text: 'プロンプトを編集する', onclick: () => openSettings('prompts') })),
  ].filter(Boolean));
  show('#setup');
  body.scrollTop = keep;
}

// 上部の主人公ボタン：主人公だけをすぐ切り替える（全部の設定は右上の「この話の設定」）
function openHeroSheet() {
  $('#sheetTitle').textContent = '主人公を選ぶ';
  const chat = S.chat;
  const pick = async (id) => {
    chat.heroId = id;
    if (id !== 'custom') S.settings.lastHeroId = id;
    await saveSettings();
    if (S.chats.includes(chat)) await db.put('chats', chat);
    if (id === 'custom') { openSetup(); return; }
    closePanels();
  };
  const row = (on, label, id, card) => h('div', { class: `row pick ${on ? 'on' : ''}` },
    h('button', { class: 'plain withic', onclick: () => pick(id) }, icon(on ? 'radioOn' : 'radioOff'), card && avatar(card, 'av sm'), label));
  $('#sheetBody').replaceChildren(
    row(!chat.heroId, 'なし', null),
    ...S.chars.filter((c) => c.type === 'hero').map((c) => row(chat.heroId === c.id, c.name || '（名前なし）', c.id, c)),
    row(chat.heroId === 'custom', chat.heroId === 'custom' && heroOf(chat) ? `この話だけの主人公（${heroOf(chat).name}）` : 'この話だけの主人公を書く', 'custom'),
    h('div', { class: 'btnrow' }, h('button', { text: 'この話の設定をすべて開く', onclick: openSetup })),
  );
  show('#sheet');
}

function openModelSheet() {
  $('#sheetTitle').textContent = 'モデルを選ぶ';
  const many = S.settings.connections.length > 1;
  $('#sheetBody').replaceChildren(...S.settings.connections.flatMap((c) => [
    many && h('p', { class: 'hint', text: c.name || '（名前なし）' }),
    c.type === 'dummy'
      ? h('div', { class: `row ${c.id === S.settings.activeConnId ? 'on' : ''}` }, h('button', { class: 'plain', text: `${c.id === S.settings.activeConnId ? '✔ ' : ''}ダミーAI（通信しません）`, onclick: () => { S.settings.activeConnId = c.id; saveSettings(); closePanels(); } }))
      : modelEditor(c, () => { S.settings.activeConnId = c.id; saveSettings(); closePanels(); }, openModelSheet),
  ]).filter(Boolean));
  show('#sheet');
}

// ---------- 設定 ----------
function field(label, control, hint) {
  return h('label', { class: 'f' }, label, control, hint && h('div', { class: 'hint', text: hint }));
}

function bound(obj, key, save, props = {}, tag = 'input') {
  const el = h(tag, { ...props, value: obj[key] ?? '' });
  // iPhoneでは入力欄からフォーカスが外れないまま画面を閉じられることがあるので、
  // 入力のたびに値を反映し、少し待ってから保存する。
  let timer = 0;
  const flush = () => { clearTimeout(timer); pendingSaves.delete(flush); save(); };
  el.addEventListener('input', () => {
    obj[key] = el.value;
    clearTimeout(timer);
    pendingSaves.add(flush);
    timer = setTimeout(flush, 700);
  });
  el.addEventListener('change', () => { obj[key] = el.value; flush(); });
  if (tag === 'textarea') tapToEdit(el, (v) => { obj[key] = v; flush(); });
  return el;
}

// ---------- 長い文章の編集画面 ----------
// キーボードが出ると、設定画面の中では文章欄が細い帯しか見えなくなる。
// 長い文章は、見えている範囲いっぱいに広がる専用の画面で編集する。
// 打っている間も少し待って保存し、キャンセルなら元に戻す。
let editorState = null;
function openEditor({ title, value, onInput, done, extra = [] }) {
  const ta = $('#edText');
  editorState = { original: value, onInput, done, timer: 0 };
  $('#edTitle').textContent = title || 'テキストを編集';
  $('#edDone').textContent = done?.label || '完了';
  $('#edFoot').replaceChildren(...extra.map((x) => h('button', { text: x.label, onclick: () => { const v = ta.value; closeEditor(); x.fn(v); } })));
  $('#edFoot').hidden = !extra.length;
  ta.value = value || '';
  $('#editor').hidden = false;
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.scrollTop = ta.scrollHeight;
}
function closeEditor() {
  clearTimeout(editorState?.timer);
  $('#editor').hidden = true;
  $('#edText').blur();
  editorState = null;
}
$('#edText').addEventListener('input', () => {
  const st = editorState;
  if (!st?.onInput) return;
  clearTimeout(st.timer);
  st.timer = setTimeout(() => st.onInput($('#edText').value), 500);
});
$('#edDone').addEventListener('click', () => {
  const st = editorState;
  const v = $('#edText').value;
  closeEditor();
  if (st?.onInput) st.onInput(v);
  st?.done?.fn?.(v);
});
$('#edCancel').addEventListener('click', () => {
  const st = editorState;
  if (st && $('#edText').value !== (st.original || '') && !confirm('編集した内容を取り消して、元に戻しますか？')) return;
  closeEditor();
  if (st?.onInput) st.onInput(st.original || '');
});

// 文章欄をタップしたら編集画面を開く（欄そのものは読むだけにする）
function tapToEdit(el, apply) {
  el.readOnly = true;
  el.classList.add('tapedit');
  el.addEventListener('click', () => {
    const title = el.dataset.title || el.closest('.f')?.firstChild?.textContent?.trim() || el.closest('#sheet') && $('#sheetTitle').textContent || 'テキストを編集';
    openEditor({ title, value: el.value, onInput: (v) => { el.value = v; apply(v); } });
  });
  return el;
}

const pendingSaves = new Set();
const flushSaves = () => [...pendingSaves].forEach((f) => f());

function select(obj, key, options, save, after) {
  const el = h('select', {}, (Array.isArray(options) ? options : Object.entries(options)).map(([value, text]) => h('option', { value, text })));
  el.value = obj[key];
  el.addEventListener('change', () => { obj[key] = el.value; save(); after?.(); });
  return el;
}

const testResults = new Map();   // 接続テストの結果（画面を描き直しても残す）

function connCard(c) {
  const isActive = c.id === S.settings.activeConnId;
  const isDummy = c.type === 'dummy';
  const isGemini = c.type === 'vertex' || c.type === 'gemini';
  const again = () => renderSettings();
  const result = h('div', { class: 'result', text: testResults.get(c.id) || '' });

  const test = async (btn) => {
    btn.disabled = true;
    result.textContent = '接続を確認中…';
    let text = '';
    let msg = '';
    let learned = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        for await (const ev of streamChat(c, { purpose: '接続テスト', system: '', messages: [{ role: 'user', text: 'こんにちは。ひとことで返事をしてください。' }] })) {
          if (ev.text) text += ev.text;
        }
        msg = text ? `【成功】つながりました\n返事: ${text}` : '【注意】つながりましたが、返事が空でした。';
        break;
      } catch (e) {
        if (e.vertexProject && !c.project) {
          c.project = e.vertexProject;
          learned = true;
          saveSettings();
          if (c.location && attempt === 0) continue;   // 番号が分かったので、選んだリージョンでもう一度
        }
        msg = `【失敗】${e.message}`;
        break;
      }
    }
    testResults.set(c.id, msg);
    if (learned) renderSettings();   // 自動で入ったプロジェクト番号を画面にも出す（結果は描き直した画面に引き継ぐ）
    else { result.textContent = msg; btn.disabled = false; }
  };

  const card = h('details', { class: `card ${isActive ? 'active' : ''}`, open: S.openCard === c.id },
    h('summary', { text: `${c.name || '（名前なし）'}${isActive ? '　✔ 使用中' : ''}` }),
    field('名前', bound(c, 'name', () => { saveSettings(); card.querySelector('summary').textContent = `${c.name || '（名前なし）'}${isActive ? '　✔ 使用中' : ''}`; }, { type: 'text' })),
    field('種類', select(c, 'type', CONN_TYPES, saveSettings, again)),
    !isDummy && field('APIキー', bound(c, 'apiKey', saveSettings, { type: 'password', autocomplete: 'off' }), 'この端末の中だけに保存されます。'),
    !isDummy && !isGemini && field('接続先URL', bound(c, 'baseUrl', saveSettings, { type: 'text', placeholder: DEFAULT_BASE_URL, inputMode: 'url' }), '空欄ならOpenRouterにつなぎます。'),
    !isDummy && h('div', { class: 'f' }, 'モデル（タップで選ぶ。チャット画面上部のモデル名からも切り替えられます）', modelEditor(c, null, again)),
    !isDummy && field('温度（空欄＝おまかせ）', bound(c, 'temperature', saveSettings, { type: 'number', step: '0.1', min: '0', max: '2', inputMode: 'decimal' }), 'Gemini 4 など新しいモデルは温度に対応していません。空欄のままにしてください。古いモデルでは、高いほど自由な文章、低いほど安定した文章になります。'),
    !isDummy && field('最大出力トークン（空欄＝おまかせ）', bound(c, 'maxTokens', saveSettings, { type: 'number', min: '1', inputMode: 'numeric' })),
    !isDummy && field('思考の設定', select(c, 'thinkMode', { none: '指定しない（モデルの標準）', level: '思考レベルで指定（Gemini 3 以降）', budget: '思考予算で指定（Gemini 2.5 など古いモデル）' }, saveSettings, again)),
    !isDummy && c.thinkMode === 'budget' && field('思考予算', bound(c, 'thinkBudget', saveSettings, { type: 'number', inputMode: 'numeric' }), '0＝思考しない、-1＝自動。Gemini 4 では使えません（エラーになります）。'),
    !isDummy && c.thinkMode === 'level' && field('思考レベル', select(c, 'thinkLevel', { low: '低', medium: '中', high: '高', xhigh: '最高（Gemini 4 Hydrogen のみ）', minimal: '最小（Gemini 3 系のみ）' }, saveSettings), 'Gemini 4 は 低・中・高 の3段階です。対応していない段階を選ぶとエラーになります。'),
    !isDummy && h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!c.showThoughts, onchange: (e) => { c.showThoughts = e.target.checked; saveSettings(); } }), '思考の内容を表示する'),
    isDummy && field('返す文章（空欄＝受け取った文章をそのまま返す）', bound(c, 'dummyText', saveSettings, { placeholder: '画像URLや長文を入れて、表示の確認に使えます。' }, 'textarea'), 'APIを使わずに、画面の動き・分岐・画像表示などを試すための接続先です。料金はかかりません。'),
!isDummy && h('details', { class: 'sub' },
      h('summary', { text: 'ダミープロンプト（上級者向け）' }),
      h('div', { class: 'hint', text: '送信するたびに、会話の最後へ自動で付け足す文章です。画面や履歴には残りません。空欄なら何もしません。' }),
      field('ダミーUserプロンプト', bound(c, 'tailUser', saveSettings, { placeholder: '例: 上記の続きを、設定を守って書いてください。' }, 'textarea')),
      field('ダミーModelプロンプト（返事の書き出し）', bound(c, 'tailModel', saveSettings, { placeholder: '例: 承知しました。続きを書きます。' }, 'textarea'), 'モデルによっては対応しておらず、エラーになることがあります。'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!c.tailJoin, onchange: (e) => { c.tailJoin = e.target.checked; saveSettings(); } }), 'ダミーModelの文章を返事の先頭につなげて表示する')),
c.type === 'vertex' && h('details', { class: 'sub', open: !!c.location },
      h('summary', { text: `リージョン（場所）${c.location ? `：${c.location}` : ''}` }),
      h('div', { class: 'hint', text: '新しいモデル（gemini-4-carbon など）は、global にしかないことがあります。「見つからない」エラーが出たら global にしてください。指定しない場合は、プロジェクトの既定の場所で動きます。' }),
      field('リージョン', select(c, 'location', [['', '指定しない（プロジェクトの既定）'], ['global', 'global（おすすめ）'], ['us', 'us（米国）'], ['eu', 'eu（欧州）'], ['asia-northeast1', 'asia-northeast1（東京）'], ['asia-southeast1', 'asia-southeast1（シンガポール）'], ['us-central1', 'us-central1（米国中部）']], saveSettings, again)),
      field('プロジェクト（番号またはID）', bound(c, 'project', saveSettings, { type: 'text', placeholder: '例: 123456789012', autocapitalize: 'off', autocorrect: 'off', inputMode: 'text' }), '空のままでも、最初に呼んだときに自動で入ります。入らないときは、Google Cloud の画面にあるプロジェクト番号を入れてください。')),
!isDummy && field('混んでいるときの予備のモデル', select(c, 'fallbackModel', [['', '使わない'], ...c.models.map((name) => [name, name])], saveSettings), '自動のやり直しでも「混雑（429）」が続いたとき、このモデルで返事をもらいます。返事の下に、予備で返事したことが表示されます。'),
    isGemini && field('安全フィルター', select(c, 'safety', { default: '指定しない（標準）', BLOCK_ONLY_HIGH: '弱め', BLOCK_NONE: 'ブロックしない' }, saveSettings)),
    h('div', { class: 'btnrow' },
      !isActive && h('button', { class: 'primary', text: 'この接続を使う', onclick: () => { S.settings.activeConnId = c.id; saveSettings(); again(); } }),
      h('button', { text: '接続テスト', onclick: (e) => test(e.target) }),
      h('button', { class: 'danger', text: '削除', onclick: () => {
        if (!confirm(`接続先「${c.name}」を削除しますか？`)) return;
        S.settings.connections = S.settings.connections.filter((x) => x !== c);
        if (isActive) S.settings.activeConnId = S.settings.connections[0]?.id ?? null;
        saveSettings(); again();
      } }),
    ),
    result,
  );
  card.addEventListener('toggle', () => { if (card.open) S.openCard = c.id; else if (S.openCard === c.id) S.openCard = null; });
  return card;
}

function insertCard(i) {
  const saveIns = () => { i.savedAt = Date.now(); saveSettings(); };
  const card = h('details', { class: 'card', open: S.openCard === i.id },
    h('summary', { text: i.name || '（名前なし）' }),
    field('名前', bound(i, 'name', () => { saveIns(); card.querySelector('summary').textContent = i.name || '（名前なし）'; }, { type: 'text' })),
    field('出し方', select(i, 'mode', { side: '番外として別枠に出す（会話には影響しない）', steer: '本編に反映する（返事が続きになる）' }, saveIns)),
    field('指示', bound(i, 'text', saveIns, { class: 'big' }, 'textarea')),
    h('div', { class: 'btnrow' }, h('button', { class: 'danger', text: '削除', onclick: () => {
      if (!confirm(`「${i.name}」を削除しますか？`)) return;
      S.settings.inserts = S.settings.inserts.filter((x) => x !== i);
      saveSettings();
      renderSettings();
    } })),
  );
  card.addEventListener('toggle', () => { if (card.open) S.openCard = i.id; else if (S.openCard === i.id) S.openCard = null; });
  return card;
}

function promptCard(p) {
  const save = () => db.put('prompts', p);
  const card = h('details', { class: 'card', open: S.openCard === p.id },
    h('summary', { text: p.name || '（名前なし）' }),
    field('名前', bound(p, 'name', () => { save(); card.querySelector('summary').textContent = p.name || '（名前なし）'; }, { type: 'text' })),
    field('内容', bound(p, 'text', save, { class: 'big', placeholder: '文体の指示、ロールプレイの決まりごと、世界設定などを書きます。' }, 'textarea')),
    h('div', { class: 'btnrow' }, h('button', { class: 'danger', text: '削除', onclick: async () => {
      if (!confirm(`プロンプト「${p.name}」を削除しますか？`)) return;
      S.prompts = S.prompts.filter((x) => x !== p);
      await db.del('prompts', p.id);
      renderSettings();
    } })),
  );
  card.addEventListener('toggle', () => { if (card.open) S.openCard = p.id; else if (S.openCard === p.id) S.openCard = null; });
  return card;
}

const TIDY_PROMPT = `あなたは編集者です。ユーザーが渡すロールプレイ用の設定文を、内容を変えずに整理して、次のJSONだけを出力してください。前置きや説明、コードブロックの記号は書かないでください。

{"name": "人物の名前", "core": "...", "detail": "...", "keywords": ["..."], "greeting": "..."}

- core: 毎回読み込む要点。名前、外見、一人称や口調、性格、相手との関係、必ず守るルールを、箇条書きで800字以内にまとめる。
- detail: core に入らなかった細かい設定すべて。背景、世界観、隠し設定、台詞の例、展開の案など。情報を削らない。
- keywords: この人物を指す呼び名（名前、愛称、肩書き）の配列。
- greeting: 冒頭の場面（イントロ、最初のメッセージ）があれば一字一句そのまま。なければ空文字。
- 同じ内容が重複している箇所は1つにまとめる。
- 設定の中身や表現を言い換えたり、和らげたり、付け足したりしない。`;

async function tidyCard(c, btn) {
  const source = [c.core, c.detail, c.greeting && `【イントロ】\n${c.greeting}`].filter(Boolean).join('\n\n');
  if (!source.trim()) { alert('先に設定文を貼り付けてください。'); return; }
  if (!confirm(`今選んでいるモデル（${modelLabel(activeConn())}）に設定文を送り、整理したカードを新しく作ります。\n元のカードはそのまま残ります。`)) return;
  btn.disabled = true;
  btn.textContent = '整理中…（1分ほどかかることがあります）';
  try {
    let out = '';
    for await (const ev of streamChat({ ...activeConn(), tailUser: '', tailModel: '' }, { purpose: 'AI整理', system: TIDY_PROMPT, messages: [{ role: 'user', text: source }] })) {
      if (ev.text) out += ev.text;
      if (ev.notice && !out) throw new Error(ev.notice);
    }
    const json = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
    const made = {
      id: uid(), type: c.type || 'char', createdAt: Date.now(),
      name: `${json.name || c.name}（整理版）`,
      core: String(json.core || ''), detail: String(json.detail || ''),
      keywords: [].concat(json.keywords || []).join('、'), greeting: String(json.greeting || c.greeting || ''),
    };
    S.chars.push(made);
    S.openCard = made.id;
    await db.put('chars', made);
    renderSettings();
    toast('整理したカードを作りました');
  } catch (e) {
    alert(`整理できませんでした。\n${e instanceof SyntaxError ? 'AIの返事が決まった形になっていませんでした。もう一度試すか、別のモデルで試してください。' : e.message}`);
    btn.disabled = false;
    btn.replaceChildren(icon('spark'), 'AIに整理してもらう');
  }
}

function charCard(c) {
  const save = () => db.put('chars', c);
  const type = c.type || 'char';
  const simple = type === 'hero' || type === 'doc';
  const bgPick = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
    if (!bgPick.files[0]) return;
    try { c.bg = await shrinkImage(bgPick.files[0]); await save(); applyBg(); renderSettings(); } catch (e) { alert(`この画像は読み込めませんでした。\n${e.message}`); }
  } });
  const iconPick = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
    if (!iconPick.files[0]) return;
    try { c.icon = await shrinkImage(iconPick.files[0], 256); await save(); renderSettings(); render(); } catch (e) { alert(`この画像は読み込めませんでした。\n${e.message}`); }
  } });
  const card = h('details', { class: 'card', open: S.openCard === c.id },
    h('summary', { class: 'cardsum' }, avatar(c, 'av sm'), c.name || '（名前なし）'),
    (type === 'char' || type === 'hero') && h('div', { class: 'iconrow' },
      avatar(c, 'av lg') || h('span', { class: 'av lg blank' }, icon('user')),
      h('button', { text: c.icon ? 'アイコンを変える' : 'アイコン画像を選ぶ', onclick: () => iconPick.click() }),
      c.icon && h('button', { class: 'danger', text: '外す', onclick: async () => { delete c.icon; await save(); renderSettings(); render(); } }),
      iconPick),
    field('名前', bound(c, 'name', () => { save(); card.querySelector('summary').lastChild.textContent = c.name || '（名前なし）'; }, { type: 'text' })),
    field('種類', select(c, 'type', CHAR_TYPES, () => { save(); renderSettings(); })),
    simple
      ? field(type === 'doc' ? '本文' : '設定', bound(c, 'core', save, { class: 'big', placeholder: type === 'doc' ? '設定資料やこれまでの本文などを、そのまま貼り付けます。' : '年齢、容姿、性格、立場など。話によって主人公を変えたいときは、カードを複数作って切り替えます。' }, 'textarea'), `これを選んだチャットで、毎回まるごとAIに渡されます。${type === 'doc' ? `（今 ${(c.core || '').length.toLocaleString()} 文字）` : ''}`)
      : field(type === 'world' ? '基本（いつも読み込む）' : '核（いつも読み込む）', bound(c, 'core', save, { class: 'big', placeholder: type === 'world' ? '世界のあらまし、時代、決まりごとなど。短くまとめます。' : '性格、口調、一人称、外見など。他のアプリ用に書いた設定文を、そのまままるごと貼り付けても大丈夫です。' }, 'textarea'), 'このチャットで使うと決めたら、毎回AIに渡されます。'),
    !simple && field(type === 'world' ? '詳細（キーワードが出たときだけ読み込む）' : '詳細（名前が出たときだけ読み込む）', bound(c, 'detail', save, { class: 'big', placeholder: type === 'world' ? '地名、組織、用語、歴史など。長くても大丈夫です。' : '過去、人間関係、細かい設定、台詞の例など。長くても大丈夫です。' }, 'textarea'), '直近4つのメッセージに、名前か下のキーワードが出てきたときだけAIに渡されます。'),
    !simple && field('キーワード（「、」で区切る）', bound(c, 'keywords', save, { type: 'text', placeholder: type === 'world' ? '例: 王都、騎士団、魔法学院' : '例: ひよ、日和、先輩' })),
    !simple && h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!c.alwaysDetail, onchange: (e) => { c.alwaysDetail = e.target.checked; save(); } }), '詳細もいつも読み込む（名前やキーワードが出なくても）'),
    type === 'char' && field('始まり方（最初のメッセージ）', bound(c, 'greeting', save, { class: 'big', placeholder: '新しいチャットでこの人物を選ぶと、「この始まり方で始める」ボタンが出ます。空欄なら出ません。' }, 'textarea')),
    type === 'char' && h('div', { class: 'f' }, '背景画像（この人物を使うチャットの背景）',
      h('div', { class: 'btnrow' },
        h('button', { text: c.bg ? '画像を変える' : '画像を選ぶ', onclick: () => bgPick.click() }),
        c.bg && h('button', { class: 'danger', text: 'やめる', onclick: async () => { delete c.bg; await save(); applyBg(); renderSettings(); } }),
        bgPick)),
    h('div', { class: 'btnrow' },
      type === 'char' && h('button', { class: 'primary', onclick: () => startFromCard(c) }, icon('play'), 'この人物で新しく始める'),
      type === 'char' && h('button', { onclick: (e) => tidyCard(c, e.currentTarget) }, icon('spark'), 'AIに整理してもらう'),
      h('button', { class: 'danger', text: '削除', onclick: async () => {
      if (!confirm(`「${c.name}」を削除しますか？`)) return;
      S.chars = S.chars.filter((x) => x !== c);
      await db.del('chars', c.id);
      renderSettings();
    } })),
  );
  card.addEventListener('toggle', () => { if (card.open) S.openCard = c.id; else if (S.openCard === c.id) S.openCard = null; });
  return card;
}

// 人物アイコン（Blob）を表示用のURLにする。同じ画像は使い回す。
const iconUrls = new WeakMap();
function iconUrl(c) {
  if (!(c?.icon instanceof Blob)) return '';
  if (!iconUrls.has(c.icon)) iconUrls.set(c.icon, URL.createObjectURL(c.icon));
  return iconUrls.get(c.icon);
}
const avatar = (c, cls = 'av') => (iconUrl(c) ? h('img', { class: cls, src: iconUrl(c), alt: '' }) : null);

const toDataUrl = (blob) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
const packChars = (list) => Promise.all(list.map(async (c) => {
  const out = { ...c };
  for (const k of ['bg', 'icon']) if (c[k] instanceof Blob) out[k] = await toDataUrl(c[k]);
  return out;
}));
const unpackChars = (list) => Promise.all(list.map(async (c) => {
  const out = { ...c };
  for (const k of ['bg', 'icon']) if (typeof c[k] === 'string') out[k] = await (await fetch(c[k])).blob();
  return out;
}));

async function refreshApp() {
  try {
    for (const r of await navigator.serviceWorker?.getRegistrations?.() || []) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  } catch { /* 消せなくても読み込み直しは試す */ }
  location.reload();
}

// 起動に失敗したときの画面。データには触れず、書き出しと更新だけできるようにする。
function showFatal(e) {
  $('#messages').replaceChildren(h('div', { class: 'errbox' },
    `アプリの起動に失敗しました。保存してあるデータは消えていません。\n\n（${e?.message || e}）`,
    h('div', { class: 'btnrow' },
      h('button', { text: 'データをファイルに書き出す', onclick: () => exportData().catch((x) => alert(`書き出せませんでした。\n${x.message}`)) }),
      h('button', { text: 'キャッシュを削除して開き直す', onclick: refreshApp }))));
}

// しばらく書き出していなければ、上に知らせを出す
function checkBackup() {
  const last = S.settings.lastBackupAt || 0;
  const newest = Math.max(0, ...S.chats.map((c) => c.updatedAt || 0));
  const days = Math.floor((Date.now() - last) / 86400000);
  const due = S.chats.length && newest > last && days >= 7 && Date.now() > (S.settings.backupSnoozeUntil || 0);
  const bar = $('#backupBar');
  bar.hidden = !due;
  if (!due) return;
  bar.replaceChildren(
    h('span', { text: last ? `前回のバックアップから${days}日経っています。` : 'まだ一度もバックアップしていません。' }),
    h('button', { class: 'primary', text: '書き出す', onclick: exportData }),
    h('button', { text: 'あとで', onclick: async () => { S.settings.backupSnoozeUntil = Date.now() + 3 * 86400000; await saveSettings(); bar.hidden = true; } }));
}

async function exportData() {
  const [allChats, allMessages, prompts, chars, bg] = await Promise.all([db.all('chats'), db.all('messages'), db.all('prompts'), db.all('chars'), db.kvGet('bg')]);
  const chats = allChats.filter((c) => !c.deletedAt);
  const deadChats = new Set(allChats.filter((c) => c.deletedAt).map((c) => c.id));
  const messages = liveMessages(allMessages.filter((m) => !deadChats.has(m.chatId)));
  // 設定も入れる（APIキーは入れない）
  const settings = {
    connections: S.settings.connections.map(({ apiKey, ...rest }) => rest),
    activeConnId: S.settings.activeConnId, ui: S.settings.ui, summary: S.settings.summary,
    showImages: S.settings.showImages, bg: bg instanceof Blob ? await toDataUrl(bg) : null,
  };
  // 巨大な1本の文字列を作るとメモリ不足で失敗しやすいので、1件ずつ小分けにしてファイルにする
  const parts = [`{"app":"sousaku-pwa","version":1,"exportedAt":"${new Date().toISOString()}"`];
  for (const [key, list] of Object.entries({ chats, messages, prompts, chars: await packChars(chars), inserts: S.settings.inserts })) {
    parts.push(`,"${key}":[`);
    list.forEach((item, i) => parts.push((i ? ',' : '') + JSON.stringify(item)));
    parts.push(']');
  }
  parts.push(`,"settings":${JSON.stringify(settings)}}`);
  const saved = await saveFile(new File(parts, `sousaku-backup-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' }));
  if (saved !== false) {
    S.settings.lastBackupAt = Date.now();
    await saveSettings();
    $('#backupBar').hidden = true;
  }
}

async function saveFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = h('a', { href: URL.createObjectURL(file), download: file.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// 1つの保存場所に、ファイルの中身を合わせる。同じものは、保存日時が新しいほうを残す。
const stampOf = (x, store) => x.savedAt || (store === 'chats' ? x.updatedAt : 0) || 0;
async function mergeInto(store, list) {
  const local = new Map((await db.all(store)).map((x) => [x.id, x]));
  const put = [];
  const r = { added: 0, updated: 0, kept: 0 };
  for (const item of list) {
    const cur = local.get(item.id);
    if (!cur) { put.push(item); r.added++; continue; }
    if (stampOf(cur, store) > stampOf(item, store)) { r.kept++; continue; }
    if (store !== 'chars' && JSON.stringify(cur) === JSON.stringify(item)) continue;
    put.push(item);
    r.updated++;
  }
  if (put.length) await db.putMany(store, put, { keepStamp: true });
  return r;
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'sousaku-pwa') throw new Error('このアプリの書き出しファイルではありません。');
    // 手元のほうが新しいものは上書きしない。ファイルにしかないものは足す。
    const total = { added: 0, updated: 0, kept: 0 };
    for (const [store, list] of [['chats', data.chats], ['messages', data.messages], ['prompts', data.prompts], ['chars', await unpackChars(data.chars || [])]]) {
      const r = await mergeInto(store, list || []);
      for (const k in total) total[k] += r[k];
    }
    let insChanged = false;
    for (const ins of data.inserts || []) {
      const i = S.settings.inserts.findIndex((x) => x.id === ins.id);
      if (i < 0) { S.settings.inserts.push(ins); insChanged = true; total.added++; }
      else if ((S.settings.inserts[i].savedAt || 0) > (ins.savedAt || 0)) total.kept++;
      else if (JSON.stringify(S.settings.inserts[i]) !== JSON.stringify(ins)) { S.settings.inserts[i] = ins; insChanged = true; total.updated++; }
    }
    if (insChanged) await saveSettings();
    if (data.settings && confirm('このファイルには設定（接続先・表示・要約など）も入っています。今の設定を、ファイルの設定に置き換えますか？\nAPIキーは入っていないので、今のものがそのまま使われます。\n「キャンセル」なら設定は今のまま、チャットなどだけを読み込みます。')) {
      const st = data.settings;
      const keys = new Map(S.settings.connections.map((c) => [c.id, c.apiKey]));
      if (Array.isArray(st.connections) && st.connections.length) S.settings.connections = st.connections.map((c) => ({ ...c, apiKey: keys.get(c.id) || '' }));
      if (st.activeConnId) S.settings.activeConnId = st.activeConnId;
      for (const k of ['ui', 'summary']) if (st[k]) S.settings[k] = { ...S.settings[k], ...st[k] };
      if (st.showImages != null) S.settings.showImages = st.showImages;
      if (st.bg) await db.kvSet('bg', await (await fetch(st.bg)).blob());
      await saveSettings();
    }
    await loadAll();
    if (!$('#settings').hidden) renderSettings();
    toast(`読み込みました（新しく追加 ${total.added}・更新 ${total.updated}${total.kept ? `・手元が新しいので残した ${total.kept}` : ''}）`);
    if (total.kept) alert(`読み込みました。\n\n新しく追加：${total.added} 件\nファイルの内容で更新：${total.updated} 件\n手元のほうが新しいので残した：${total.kept} 件\n\n（件数は、チャット・メッセージ・プロンプト・カードなどを1つずつ数えています）`);
  } catch (e) {
    alert(`読み込めませんでした。\n${e.message}`);
  }
}

function renderSettings() {
  flushSaves();
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  const body = $('#settingsBody');
  if (S.tab === 'conn') {
    body.replaceChildren(
      h('p', { class: 'hint', text: '「✔ 使用中」の接続先でチャットします。入力した内容は自動で保存されます。' }),
      ...S.settings.connections.map(connCard),
      h('button', { class: 'wide', text: '＋ 接続先を追加', onclick: () => {
        const c = newConn();
        c.name = '新しい接続先';
        S.settings.connections.push(c);
        S.settings.activeConnId ??= c.id;
        S.openCard = c.id;
        saveSettings(); renderSettings();
      } }),
    );
  } else if (S.tab === 'prompts') {
    body.replaceChildren(
      h('p', { class: 'hint', text: '執筆用・ロールプレイ用などを保存しておき、チャット画面右上の「この話の設定」で切り替えます。' }),
      ...S.prompts.map(promptCard),
      h('button', { class: 'wide', text: '＋ プロンプトを追加', onclick: async () => {
        const p = { id: uid(), name: '新しいプロンプト', text: '', createdAt: Date.now() };
        S.prompts.push(p);
        S.openCard = p.id;
        await db.put('prompts', p);
        renderSettings();
      } }),
      h('h3', { class: 'grouphead', text: '差し込みプロンプト' }),
      h('p', { class: 'hint', text: '会話の途中で、入力欄の左の ✦ から呼び出す指示です。日記・夢・掲示板のような番外や、「エンディングへ向かう」のような進行の指示を登録しておけます。{{char}} は登場人物、{{user}} は主人公の名前に置き換わります。' }),
      ...S.settings.inserts.map(insertCard),
      h('button', { class: 'wide', text: '＋ 差し込みプロンプトを追加', onclick: () => {
        const i = { id: uid(), name: '新しい差し込み', mode: 'side', text: '' };
        S.settings.inserts.push(i);
        S.openCard = i.id;
        saveSettings();
        renderSettings();
      } }),
      h('button', { class: 'wide', style: 'margin-top:8px', text: '見本を追加し直す', onclick: () => {
        const have = new Set(S.settings.inserts.map((i) => i.name));
        const add = DEFAULT_INSERTS.filter((i) => !have.has(i.name)).map((i) => ({ id: uid(), ...i }));
        S.settings.inserts.push(...add);
        saveSettings();
        renderSettings();
        toast(add.length ? `${add.length} 件追加しました` : '見本はすべて入っています');
      } }),
    );
  } else if (S.tab === 'chars') {
    const section = (type, title, hint, label) => [
      h('h3', { class: 'grouphead', text: title }),
      h('p', { class: 'hint', text: hint }),
      ...S.chars.filter((c) => (c.type || 'char') === type).map(charCard),
      h('button', { class: 'wide', text: `＋ ${label}を追加`, onclick: async () => {
        const c = { id: uid(), name: `新しい${label}`, type, core: '', detail: '', keywords: '', greeting: '', createdAt: Date.now() };
        S.chars.push(c);
        S.openCard = c.id;
        await db.put('chars', c);
        renderSettings();
      } }),
    ];
    body.replaceChildren(
      h('p', { class: 'hint', text: 'ここはカードの保管庫です。チャットで使うものは、チャット画面右上の「この話の設定」で選びます。' }),
      ...section('hero', '主人公', '自分が演じる・語る人物。何度も使う主人公をここに保存しておきます。一度きりの主人公なら、カードを作らずに「この話の設定」で直接書けます。', '主人公'),
      ...section('char', '登場人物', '相手役や脇役。人数が多くても、詳細は名前が出た人の分だけ読み込まれます。', '登場人物'),
      ...section('world', '世界設定', '舞台や用語。キーワードが出たときだけ詳細を読み込みます（他のアプリの「ロアブック」と同じ働きです）。', '世界設定'),
      ...section('doc', '資料', '設定をまとめたテキストを、分けずにまるごと読み込ませたいとき用です。Geminiのノートブックや、Claudeのプロジェクトに入れるテキストと同じ使い方ができます。', '資料'),
      h('button', { class: 'wide', style: 'margin-top:8px', text: '＋ テキストファイルから資料を追加（複数可）', onclick: () => {
        const el = h('input', { type: 'file', accept: '.txt,.md,text/plain,text/markdown', multiple: true, onchange: async () => {
          for (const f of el.files) {
            const c = { id: uid(), name: f.name.replace(/\.[^.]+$/, ''), type: 'doc', core: await f.text(), detail: '', keywords: '', greeting: '', createdAt: Date.now() };
            S.chars.push(c);
            await db.put('chars', c);
          }
          renderSettings();
          toast(`${el.files.length} 件の資料を追加しました`);
        } });
        el.click();
      } }),
    );
  } else if (S.tab === 'ui') {
    const ui = S.settings.ui;
    const save = () => { saveSettings(); applyUi(); };
    const bgPicker = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => { if (bgPicker.files[0]) { await setBg(bgPicker.files[0]); S.hasBg = true; renderSettings(); } } });
    const range = (key, min, max) => {
      const el = h('input', { type: 'range', min, max, value: ui[key] });
      el.addEventListener('input', () => { ui[key] = Number(el.value); applyUi(); el.parentElement.firstChild.textContent = el.parentElement.firstChild.textContent.replace(/\d+％/, `${el.value}％`); });
      el.addEventListener('change', save);
      return el;
    };
    const check = (key, label, hint) => h('div', {},
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!ui[key], onchange: (e) => { ui[key] = e.target.checked; save(); } }), label),
      hint && h('div', { class: 'hint', text: hint }));
    body.replaceChildren(
      h('div', { class: 'card' },
        h('strong', { text: '配色' }),
        h('div', { class: 'swatches' }, Object.entries(THEMES).map(([key, [name, color]]) =>
          h('button', { class: `swatch ${ui.theme === key ? 'on' : ''}`, onclick: () => { ui.theme = key; save(); renderSettings(); } },
            h('i', { style: `background:${color}` }), name))),
        h('div', { class: 'hint', text: '「自動」はiPhoneのライト／ダーク設定に合わせます。' })),
      h('div', { class: 'card' },
        h('strong', { text: '文字' }),
        field('本文の文字サイズ', select(ui, 'fontSize', [['14', '小'], ['16', '標準'], ['18', '大'], ['20', '特大']], save)),
        field('本文の書体', select(ui, 'font', [['gothic', 'ゴシック体（標準）'], ['mincho', '明朝体（小説向け）']], save)),
        field('行の間隔', select(ui, 'lineHeight', [['1.6', '狭め'], ['1.75', '標準'], ['2', '広め'], ['2.3', 'とても広め']], save)),
        check('paper', 'AIの返事を吹き出しにせず、紙面のように表示する', '長い地の文を読みやすくします。自分の発言と番外は吹き出しのままです。')),
      h('div', { class: 'card' },
        h('strong', { text: '背景画像' }),
        h('div', { class: 'btnrow' },
          h('button', { text: S.hasBg ? '画像を変える' : '画像を選ぶ', onclick: () => bgPicker.click() }),
          S.hasBg && h('button', { class: 'danger', text: '背景をやめる', onclick: async () => { await db.del('kv', 'bg'); S.hasBg = await applyBg(); renderSettings(); } }),
          bgPicker),
        field(`背景の薄さ（${ui.bgVeil}％）`, range('bgVeil', 0, 100), '大きいほど画像が薄くなり、文字が読みやすくなります。'),
        h('div', { class: 'hint', text: 'ここで選ぶのは全体の背景です。登場人物のカードに背景画像を付けると、その人物を使うチャットではそちらが優先されます。' }),
        field(`吹き出しの濃さ（${ui.bubbleAlpha}％）`, range('bubbleAlpha', 20, 100), '小さいほど吹き出しが透けて、背景が見えます。')),
      h('div', { class: 'card' },
        h('strong', { text: '画像URLの短縮書き' }),
        h('div', { class: 'hint', text: 'ベースURLを入れておくと、AIが [[ひより/笑顔]] と書いただけで画像として表示します。プロンプトには「画像は [[キャラ名/表情]] の形で書く」と指示してください。空欄なら使いません。' }),
        field('ベースURL', bound(ui, 'imgBase', save, { type: 'text', placeholder: 'https://example.netlify.app/', inputMode: 'url', autocapitalize: 'off' })),
        field('拡張子', bound(ui, 'imgExt', save, { type: 'text', placeholder: '.avif', autocapitalize: 'off' }))),
      h('div', { class: 'card' },
        h('strong', { text: '操作' }),
        check('replaceUser', '設定文の「User」を主人公の名前に置き換える', '主人公を選んでいるチャットで、キャラ設定や始まり方に書かれた「User」「{{user}}」を主人公の名前に変えてからAIに渡します。'),
        field('キーボードが出ているときの、入力欄の下の余白', select(ui, 'kbGap', [['auto', '自動'], ['0', 'なし'], ['40', '小'], ['72', '中'], ['100', '大'], ['130', '特大']], save), '入力欄の下や送信ボタンがキーボードに隠れるときは大きく、入力欄とキーボードの間が空きすぎるときは小さくしてください。'),
        check('scrollbar', '右端にスクロールバーを表示する', '指でつまんで動かすと、長い会話をすばやく移動できます。'),
        field('「続き」ボタンでAIに送る指示', bound(ui, 'continueText', save, { type: 'text' }), '最後の返事の下の「続き」を押すと、この文章をこっそり送って続きを書かせます。画面には残りません。'),
        check('autoScroll', '返事が届いている間、自動で下へスクロールする'),
        check('showTimer', '返事を待っている間、秒数を表示する'),
        check('enterSend', 'Enterキーで送信する', 'オンにすると、iPhoneのキーボードでは「改行」キーで送信されます（改行できなくなります）。外付けキーボードやPC向けです。Shift+Enterで改行できます。'),
        check('skipDeleteConfirm', 'メッセージ削除のときに確認しない'),
        field('混んでいるときの自動やり直し', select(ui, 'retries', [['0', 'しない'], ['1', '1回まで'], ['2', '2回まで'], ['3', '3回まで'], ['4', '4回まで'], ['5', '5回まで']], save), '「利用上限（429）」やサーバーのエラーで失敗したとき、少し待って自動でやり直します。返事が途中まで来ていたらやり直しません。')),
      h('div', { class: 'card' },
        h('strong', { text: 'メッセージのボタン' }),
        field('ボタンの出し方', select(ui, 'toolsMode', { always: 'いつも表示する', tap: '吹き出しをタップしたときだけ表示する' }, save), '「タップしたときだけ」でも、最後のメッセージにはいつも表示されます。'),
        check('compactTools', 'よく使うボタンだけ出し、ほかは「…」にまとめる', '編集・コピー・削除・文字数・番号や使用量は「…」を押すと出ます。'),
        field('ボタンの色', select(ui, 'toolStyle', [['theme', '配色に合わせる'], ['color', '色分けする（緑・橙・赤など）'], ['plain', '色を付けない']], save)),
        check('showMeta', '番号・モデル名・時刻・使用量を表示する')),
    );
  } else {
    const usage = h('p', { class: 'hint', text: '' });
    navigator.storage?.estimate?.().then(async (e) => {
      const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
      usage.textContent = `保存しているデータ: 約 ${mb(e.usage || 0)}（チャット ${S.chats.length} 件）。この端末で使える目安: ${mb(e.quota || 0)}`;
    }).catch(() => {});
    const picker = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: () => picker.files[0] && importData(picker.files[0]) });
    body.replaceChildren(
      h('div', { class: 'card' },
        h('strong', { text: '書き出し（バックアップ）' }),
        h('p', { class: 'hint', text: 'チャット・枝分かれ・プロンプト・キャラ表を1つのファイルに保存します。APIキーは含まれません。' }),
        h('button', { class: 'primary', text: 'ファイルに書き出す', onclick: exportData })),
      h('div', { class: 'card' },
        h('strong', { text: '読み込み' }),
        h('p', { class: 'hint', text: '書き出したファイルを読み込みます。今あるチャットは消えません。同じチャットやメッセージは、手元とファイルのうち新しく保存されたほうを残します。' }),
        h('button', { text: 'ファイルを選ぶ', onclick: () => picker.click() }), picker),
      h('div', { class: 'card' },
        h('strong', { text: 'キャッシュ削除・アプリを更新' }),
        h('p', { class: 'hint', text: 'アプリ本体のキャッシュ（一時保存）を削除して、最新版を読み込み直します。新しい機能が反映されないときや、動きが重い・おかしいときに押してください。チャット・設定・APIキーは消えません。' }),
        h('button', { text: 'キャッシュを削除して開き直す', onclick: refreshApp })),
      usage,
      h('div', { class: 'card' },
        h('strong', { text: 'すべて消す' }),
        h('p', { class: 'hint', text: 'チャット・プロンプト・接続先（APIキー）をすべて削除します。元に戻せません。' }),
        h('button', { class: 'danger', text: '全データを削除する', onclick: async () => {
          if (!confirm('チャット・プロンプト・APIキーをすべて削除します。\n本当によろしいですか？')) return;
          if (!confirm('元に戻せません。先に「ファイルに書き出す」でバックアップを取りましたか？\nOKを押すと削除します。')) return;
          await Promise.all(['chats', 'messages', 'prompts', 'chars', 'kv'].map(async (st) => db.delMany(st, (await db.all(st)).map((x) => x.id ?? x.key))));
          location.reload();
        } })),
      h('p', { class: 'hint', text: 'データはこの端末のブラウザ内に保存されています。ホーム画面のアイコンを削除すると消えるので、ときどき書き出しておくと安心です。' }),
    );
  }
}

function openSettings(tab) {
  if (tab) S.tab = tab;
  if (S.tab === 'conn') S.openCard ??= S.settings.activeConnId;
  renderSettings();
  show('#settings');
}

// ---------- 起動 ----------
function resizeInput() {
  const el = $('#input');
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

async function loadAll() {
  await purgeTrash().catch(() => {});
  setTimeout(checkBackup, 1500);
  const [settings, prompts, allChats, chars] = await Promise.all([db.kvGet('settings'), db.all('prompts'), db.all('chats'), db.all('chars')]);
  const chats = allChats.filter((c) => !c.deletedAt);
  S.chars = chars.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const uiDefaults = S.settings.ui;
  Object.assign(S.settings, settings);
  S.settings.ui = { ...uiDefaults, ...settings?.ui };
  if (!S.settings.ui.toolStyle) S.settings.ui.toolStyle = S.settings.ui.toolColors === false ? 'plain' : 'theme';
  if (S.settings.lastHeroId === undefined) {
    const isHero = (id) => chars.find((c) => c.id === id)?.type === 'hero';
    S.settings.lastHeroId = (S.settings.lastCharIds || []).find(isHero) ?? null;
    S.settings.lastCharIds = (S.settings.lastCharIds || []).filter((id) => !isHero(id));
  }
  if (!Array.isArray(S.settings.inserts)) S.settings.inserts = DEFAULT_INSERTS.map((i) => ({ id: uid(), ...i }));
  S.settings.summary = { connId: '', model: '', auto: false, threshold: 40, keep: 10, ...settings?.summary };
  applyUi();
  const hasBg = await applyBg();
  S.hasBg = hasBg;
  for (const c of S.settings.connections) {
    c.location ??= '';
    c.fallbackModel ??= '';
    c.project ??= '';
    if (!Array.isArray(c.models)) c.models = c.type === 'openai' ? [] : [...DEFAULT_MODELS];
    if (c.model && !c.models.includes(c.model)) c.models.unshift(c.model);
  }
  S.prompts = prompts.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  S.chats = chats;
  if (!S.settings.connections.length) {
    const c = newConn();
    S.settings.connections.push(c);
    S.settings.activeConnId = c.id;
    await saveSettings();
  }
  await openChat(S.chats.find((c) => c.id === (S.chat?.id ?? S.settings.lastChatId)) || blankChat());
}

$('#btnSend').addEventListener('click', send);
$('#input').addEventListener('input', () => { resizeInput(); clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 400); });
$('#input').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
  if (e.metaKey || e.ctrlKey || (S.settings.ui.enterSend && !e.shiftKey)) { e.preventDefault(); send(); }
});
let jumpTimer = 0;
$('#btnBottom').addEventListener('click', scrollBottom);
$('#btnTop').addEventListener('click', () => { $('#messages').scrollTop = 0; });
$('#messages').addEventListener('scroll', updateBar, { passive: true });
window.addEventListener('resize', updateBar);
$('#scrollbar').addEventListener('pointerdown', (e) => { e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.classList.add('drag'); dragBar(e); });
$('#scrollbar').addEventListener('pointermove', (e) => { if (e.currentTarget.classList.contains('drag')) dragBar(e); });
for (const ev of ['pointerup', 'pointercancel']) $('#scrollbar').addEventListener(ev, (e) => e.currentTarget.classList.remove('drag'));
$('#messages').addEventListener('scroll', () => {
  const box = $('#messages');
  $('#btnBottom').hidden = box.scrollHeight - box.scrollTop - box.clientHeight < 300;
  $('#btnTop').hidden = box.scrollTop < 300;
  // ジャンプボタンはスクロール中だけ出し、止まったら消す（メッセージのボタンに重ならないように）
  document.querySelectorAll('.jump').forEach((b) => b.classList.add('show'));
  clearTimeout(jumpTimer);
  jumpTimer = setTimeout(() => document.querySelectorAll('.jump').forEach((b) => b.classList.remove('show')), 2500);
}, { passive: true });
$('#btnInsert').addEventListener('click', openInsertSheet);
$('#btnExpand').addEventListener('click', () => {
  const tall = $('#composer').classList.toggle('tall');
  $('#btnExpand').setAttribute('aria-label', tall ? '入力欄を小さくする' : '入力欄を大きくする');
  resizeInput();
  $('#input').focus();
});
$('#btnAttach').addEventListener('click', () => {
  const el = h('input', { type: 'file', accept: 'image/*,.txt,.md,text/plain,text/markdown', multiple: true, onchange: () => addFiles(el.files) });
  el.click();
});
$('#btnDrawer').addEventListener('click', openDrawer);
$('#chatSearch').addEventListener('input', (e) => searchChats(e.target.value));
$('#btnStartWith').addEventListener('click', openStartSheet);
$('#chatPerson').addEventListener('change', (e) => { chatPerson = e.target.value; openDrawer(true); });
$('#btnNewChat').addEventListener('click', async () => { await openChat(blankChat()); closePanels(); });
$('#btnSettings').addEventListener('click', () => openSettings());
$('#btnSetup').addEventListener('click', openSetup);
$('#heroChip').addEventListener('click', openHeroSheet);
$('#modelChip').addEventListener('click', openModelSheet);
// ---------- 読むモード ----------
// 上部・入力欄・操作ボタンを隠して本文だけにする。出入りしても、読んでいる位置を保つ。
function keepReadingPosition(change) {
  const box = $('#messages');
  const top = box.getBoundingClientRect().top;
  const anchor = [...box.querySelectorAll('.msg')].find((el) => el.getBoundingClientRect().bottom > top + 4);
  const offset = anchor ? anchor.getBoundingClientRect().top - top : 0;
  change();
  if (anchor) box.scrollTop += anchor.getBoundingClientRect().top - box.getBoundingClientRect().top - offset;
  updateBar();
}
function setReading(on) {
  keepReadingPosition(() => {
    document.body.classList.toggle('reading', on);
    $('#btnReadExit').hidden = !on;
    if (on) document.activeElement?.blur?.();
  });
}
$('#btnRead').addEventListener('click', () => setReading(true));
$('#btnReadExit').addEventListener('click', () => setReading(false));

// ---------- 入力欄：書いていないときは1行に縮める ----------
const composer = $('#composer');
let idleTimer = 0;
let pressing = false;
function updateIdle() {
  const active = composer.contains(document.activeElement) || composer.classList.contains('tall') || pressing;
  if (composer.classList.contains('idle') === !active) return;
  keepReadingPosition(() => composer.classList.toggle('idle', !active));
}
composer.addEventListener('focusin', () => { clearTimeout(idleTimer); updateIdle(); });
composer.addEventListener('focusout', () => { clearTimeout(idleTimer); idleTimer = setTimeout(updateIdle, 250); });
// ボタンを押している途中で縮むと押し損ねるので、押している間は縮めない
composer.addEventListener('pointerdown', () => { pressing = true; });
document.addEventListener('pointerup', () => { if (pressing) setTimeout(() => { pressing = false; updateIdle(); }, 350); });
composer.classList.add('idle');

$('#btnImages').addEventListener('click', () => {
  S.settings.showImages = !S.settings.showImages;
  saveSettings();
  render();
  toast(S.settings.showImages ? '画像を表示します' : '画像を隠します');
});
$('#chatTitle').addEventListener('click', openChatMenu);
$('#backdrop').addEventListener('click', closePanels);
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closePanels));
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; S.openCard = null; renderSettings(); }));

document.addEventListener('visibilitychange', () => { if (document.hidden) { flushSaves(); saveDraft(); } });
window.addEventListener('pagehide', saveDraft);
// iPhoneではキーボードが出ても画面の高さが変わらず、入力欄が宙に浮いたり隠れたりする。
// 実際に見えている範囲（visualViewport）に合わせて、画面全体の位置と高さを合わせ直す。
// 新しいiOSでは、キーボードの上に浮かぶ操作バー（∧ ∨ ✓）の分が「見えている範囲」に含まれて
// しまい、入力欄の下が隠れる。キーボードが出ている間だけ、その分の余白を追加で空ける。
const isAppleTouch = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const floatingBar = isAppleTouch && typeof CSS !== 'undefined' && CSS.supports?.('anchor-name: --a');
let fullHeight = 0;
let lastWidth = 0;
function fitViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  if (vv.width !== lastWidth) { lastWidth = vv.width; fullHeight = 0; }   // 向きが変わったら測り直す
  fullHeight = Math.max(fullHeight, vv.height);
  const keyboard = fullHeight - vv.height > 120;
  const pref = S.settings.ui.kbGap;
  const gap = !keyboard || pref === 'auto' || pref == null ? 0 : Number(pref) || 0;
  const box = $('#messages');
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const root = document.documentElement.style;
  root.setProperty('--vh', `${vv.height - gap}px`);
  root.setProperty('--vt', `${vv.offsetTop}px`);
  root.setProperty('--vb', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + gap}px`);
  if (stick) scrollBottom();
  updateBar();
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fitViewport);
  window.visualViewport.addEventListener('scroll', fitViewport);
  fitViewport();
}

navigator.storage?.persist?.();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
const phone = initPhone({ $, h, icon, ICONS, S, db, streamChat, uid, pathTo, chatChars, heroOf, buildSystem, summaryCut, apiMessage, activeConn, modelLabel, show, closePanels, toast, stamp });
loadAll().catch(showFatal);
