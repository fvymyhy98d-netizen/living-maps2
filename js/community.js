/* ==========================================================================
   community.js — 访客身份 · 敏感词自动拦截 · 禁言机制 · 讨论区数据
   --------------------------------------------------------------------------
   静态站方案：全部数据保存在各自浏览器的 localStorage（不联网、不上传）：
     lm_device_v1  设备身份（身份码/昵称/改名时间/禁言/屏蔽/自动拦截计数）
     lm_discuss_v1 讨论区（pid 为空 = 帖子；pid = 帖子id = 楼中楼回复）
     lm_mod_v1     管理员审核台（人工屏蔽记录按身份码累计、隐藏的言论 id）
   ⚠ 静态站限制：数据不跨设备同步；访客换浏览器或清缓存 = 新身份。
     将来接入云数据库时，只需把 load/save 换成云接口，其余逻辑不变。
   敏感词库：data/sensitive-words.js（window.LM_SENSITIVE_WORDS，由 build_words.js
     从外部现成词库生成，源码与对话中都不出现词条）。词库为空时拦截功能不启用，
     其余机制照常工作 —— 符合“找不到现成词库就不做拦截”的要求。
   安全：入库前 clean()（控制符/零宽字符清洗 + 长度截断 + 限流）；
     渲染一律经 app.js 的 esc() 转义，用户内容永不按 HTML 解析（防 XSS）。
   ========================================================================== */
(function () {
  'use strict';
  var ROOT = (typeof window !== 'undefined') ? window : global;
  var LS = (typeof localStorage !== 'undefined') ? localStorage : (function () {
    var m = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; }
    };
  })();

  var DEV_KEY = 'lm_device_v1', DC_KEY = 'lm_discuss_v1', MOD_KEY = 'lm_mod_v1';
  var DAY = 86400000, MUTE_MS = 30 * DAY, NICK_LOCK = 7 * DAY;
  var MAX = { feedback: 800, post: 500, reply: 300, nick: 16 };
  /* 限流参数集中在「发言限流」小节（★ 修复103：冷却 + 10 分钟窗口上限，且持久化） */

  /* ---------- 基础 ---------- */
  function clean(text, max) {
    return String(text == null ? '' : text)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
      .trim().slice(0, max || 500);
  }
  function load(key, fb) { try { var v = JSON.parse(LS.getItem(key) || 'null'); return v == null ? fb : v; } catch (e) { return fb; } }
  function save(key, v) { try { LS.setItem(key, JSON.stringify(v)); } catch (e) { /* 只读环境静默降级 */ } }

  /* ---------- 设备身份 ---------- */
  function me() {
    var d = load(DEV_KEY, null);
    if (!d || !d.code) {
      d = { code: '访客' + Math.floor(1000 + Math.random() * 9000), nick: '', nickAt: 0,
            muteUntil: 0, blocked: false, blockStreak: 0, blockEvents: [] };
      save(DEV_KEY, d);
    }
    if (!d.blockEvents) d.blockEvents = [];
    return d;
  }
  function displayName() { var d = me(); return d.nick || d.code; }
  function setNick(nick) {
    nick = clean(nick, MAX.nick);
    if (!nick) return { ok: false, msg: '昵称不能为空' };
    var chk = check(nick);
    if (!chk.ok) return { ok: false, msg: '昵称含不当词汇，请更换' };
    var d = me(), left = d.nickAt + NICK_LOCK - Date.now();
    if (d.nick && left > 0) return { ok: false, msg: '昵称每 7 天只能修改一次，还需 ' + Math.ceil(left / DAY) + ' 天' };
    d.nick = nick; d.nickAt = Date.now(); save(DEV_KEY, d);
    return { ok: true };
  }
  function isMuted() { return me().muteUntil > Date.now(); }
  function isBlocked() { return !!me().blocked; }
  function muteLeftDays() { return Math.max(1, Math.ceil((me().muteUntil - Date.now()) / DAY)); }
  function strikeInfo() { var d = me(); return { streak: d.blockStreak || 0, events: (d.blockEvents || []).length }; }
  function wordCount() { return index().length; }

    /* ---------- 敏感词过滤（词库来自 data/sensitive-words.js；空词库 = 不启用拦截） ---------- */
  var FLAT_FILE = (ROOT && ROOT.LM_SENSITIVE_WORDS) ? ROOT.LM_SENSITIVE_WORDS : [];
  /* ★ 修复103：词表有两个来源 ——
     ① data/sensitive-words.js（由 build_words.js 从外部现成词库生成，代码与对话里都不出现词条）；
     ② 后台「🛡️ 言论过滤」粘贴的自定义词表（存在内容文件 config.modWords，随同步给所有访客）。
     两个都空 = 不启用词语拦截（其余机制照常工作）。 */
  function configWords() {
    try {
      var A = ROOT.LMApp, c = A && A.state && A.state.content;
      var list = c && c.config && c.config.modWords;
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function rawWords() {
    var out = [], i;
    for (i = 0; i < FLAT_FILE.length; i++) out.push(FLAT_FILE[i]);
    var extra = configWords();
    for (i = 0; i < extra.length; i++) out.push(extra[i]);
    return out;
  }
  /* 归一化：对抗变形 —— 全角→半角、小写、去零宽字符、分隔符压掉、@/$ 形近还原 */
  var FW = /[\uFF01-\uFF5E]/g;
  var SEPS = /[\s\-_\*\u00b7\u2022\u2027\u2014\u2015\u2013\u2012~`+=|/\\,:;!?'\"<>()\[\]{}【】（）《》「」『』、。，！？；：‘’“”…]/g;
  function normalize(text) {
    var s = String(text == null ? '' : text).toLowerCase();
    s = s.replace(FW, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    s = s.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
    var spaced = s.replace(SEPS, ' ').replace(/\s+/g, ' ').trim();
    var squash = spaced.replace(/\s+/g, '');
    squash = squash.replace(/[@＄]/g, function (c) { return c === '@' ? 'a' : 's'; });
    return { spaced: spaced, squash: squash };
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var INDEX = null, INDEX_SIG = '';
  function index() { /* 懒构建：词 → 归一化 key（词内容不外泄到任何日志）；
                       词表变了（后台保存 / 云端同步）自动重建 —— 用「条数 + 首尾词」做签名 */
    var all = rawWords();
    var sig = all.length + '#' + (all[0] || '') + '#' + (all[all.length - 1] || '');
    if (INDEX && INDEX_SIG === sig) return INDEX;
    INDEX = [];
    var seen = {};
    for (var i = 0; i < all.length; i++) {
      var w = String(all[i] || '').trim().toLowerCase();
      if (w.length < 2 || w.length > 30 || seen[w]) continue;
      seen[w] = 1;
      var n = normalize(w);
      INDEX.push({ key: n.squash, spaced: n.spaced, latin: /^[a-z0-9]+$/.test(w) });
    }
    INDEX_SIG = sig;
    return INDEX;
  }
  function rebuildWords() { INDEX = null; INDEX_SIG = ''; return index().length; }
  /* 给后台界面看的统计：只有数量，永不输出词条内容 */
  function wordStats() { return { file: FLAT_FILE.length, mod: configWords().length, active: index().length }; }
  function check(text) {
    var list = index();
    if (!list.length) return { ok: true, hits: [], cats: [] }; /* 词库未启用：放行 */
    var n = normalize(text), hits = 0, cats = [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var hit = (it.latin && it.key.length <= 4)
        ? new RegExp('(^|[^a-z0-9])' + escRe(it.key) + '([^a-z0-9]|$)').test(n.spaced)
        : n.squash.indexOf(it.key) >= 0;
      if (hit) { hits++; if (cats.indexOf('不当词汇') < 0) cats.push('不当词汇'); }
    }
    return { ok: hits === 0, hitsCount: hits, cats: cats };
  }

  /* ---------- 发言限流（★ 修复103：冷却 + 窗口上限，且**持久化**在 localStorage）----------
     以前 lastSend 只在内存里 → 刷新一下页面冷却就没了，等于没有。
     现在两条规则都存在 lm_rate_v1，刷新 / 重开标签页都照样生效：
       ① 冷却：任意两次发言至少隔 10 秒（防连点、防刷屏）；
       ② 窗口：讨论区 10 分钟最多 8 条、反馈 10 分钟最多 4 条（挡住"每隔 11 秒慢慢刷"）。
     说明：这是**客户端**限流，挡不住直接照抄 anon key 调 API 的脚本；
     那类滥用要靠数据库侧加固（README 三·补14）与「轮换 anon key」。 */
  var RATE_KEY = 'lm_rate_v1', RATE_MS = 10000, WIN_MS = 10 * 60000;
  var WIN_MAX = { discuss: 8, feedback: 4 };
  function rateGroup(kind) { return kind === 'feedback' ? 'feedback' : 'discuss'; }
  function rateData() {
    var d = load(RATE_KEY, null);
    if (!d || typeof d !== 'object') d = { last: 0, hits: {} };
    d.last = +d.last || 0;
    if (!d.hits || typeof d.hits !== 'object') d.hits = {};
    return d;
  }
  function recentHits(d, g, now) {
    return (d.hits[g] || []).filter(function (t) { return now - (+t || 0) < WIN_MS; });
  }
  function rateCheck(kind) {
    var d = rateData(), now = Date.now(), g = rateGroup(kind);
    if (now - d.last < RATE_MS) {
      return { ok: false, why: 'cool', left: Math.ceil((RATE_MS - (now - d.last)) / 1000) };
    }
    var arr = recentHits(d, g, now);
    d.hits[g] = arr;
    try { save(RATE_KEY, d); } catch (e) { /* 只读环境静默 */ }   /* 顺手清掉过期记录 */
    var max = WIN_MAX[g] || 8;
    if (arr.length >= max) {
      return { ok: false, why: 'win', max: max, left: Math.max(1, Math.ceil((WIN_MS - (now - arr[0])) / 1000)) };
    }
    return { ok: true };
  }
  function rateCommit(kind) {
    var d = rateData(), now = Date.now(), g = rateGroup(kind);
    var arr = recentHits(d, g, now);
    arr.push(now);
    d.hits[g] = arr; d.last = now;
    save(RATE_KEY, d);
  }
  function rateReset() { save(RATE_KEY, { last: 0, hits: {} }); }
  function rateInfo(kind) {
    var d = rateData(), now = Date.now(), g = rateGroup(kind);
    return {
      max: WIN_MAX[g] || 8, used: recentHits(d, g, now).length,
      coolLeft: Math.max(0, Math.ceil((RATE_MS - (now - d.last)) / 1000))
    };
  }

  /* ---------- 结构化不当内容（不需要词表也能拦）★ 修复103 ----------
     只认「客观形态」，不猜语义：手机号（同学隐私）、引导到站外私聊、链接刷屏、
     长串重复字符、几乎全是符号。语义类脏词仍交给词表（文件内置 或 后台粘贴），
     所以这份源码里一个词条都没有 —— 也就不存在"词表被当成违禁内容"的问题。 */
  var SPAM = [
    { re: /(?:^|[^0-9])(?:\+?86[-\s]?)?1[3-9]\d{9}(?:[^0-9]|$)/, why: '请不要在公开区留手机号（涉及同学隐私）' },
    { re: /(?:加|私|戳|找|联系)\s*(?:我|v|微信|weixin|威信|企鹅|扣扣|qq)/i, why: '疑似引导到站外私聊，请直接在讨论区交流' },
    { re: /(?:vx|wx|wechat|qq)\s*[:：]?\s*[a-z0-9_-]{5,}/i, why: '疑似留联系方式引流，请直接在讨论区交流' }
  ];
  function spamCheck(text) {
    var t = String(text == null ? '' : text);
    for (var i = 0; i < SPAM.length; i++) {
      if (SPAM[i].re.test(t)) return { ok: false, why: SPAM[i].why };
    }
    if ((t.match(/https?:\/\//gi) || []).length >= 3) return { ok: false, why: '链接太多了，请不要刷屏' };
    if (/(.)\1{19,}/.test(t)) return { ok: false, why: '重复字符过多，像是刷屏' };
    var solid = t.replace(/\s/g, '');
    if (solid.length >= 8) {
      var sym = (solid.match(/[!-/:-@\[-`{-~]/g) || []).length;
      if (sym / solid.length > 0.85) return { ok: false, why: '内容几乎全是符号，像是刷屏' };
    }
    return { ok: true };
  }

  /* ---------- 发言闸门：限流 → 屏蔽 → 禁言 → 结构化 → 敏感词（词表拦截即累计违规） ---------- */
  function onBlocked(cats) {
    var d = me(), now = Date.now();
    d.blockStreak = (d.blockStreak || 0) + 1;
    if (d.blockStreak >= 3) {                       /* 连续 3 条被拦截 → 禁言 1 个月，连击重新计数 */
      d.muteUntil = now + MUTE_MS;
      d.blockStreak = 0;
      d.blockEvents = (d.blockEvents || []).filter(function (t) { return now - t < MUTE_MS; });
      d.blockEvents.push(now);
      if (d.blockEvents.length > 3) d.blocked = true; /* 一个月内被禁言超过 3 次 → 永久屏蔽 */
    }
    save(DEV_KEY, d);
    return d;
  }
  function gate(kind, text) {
    text = clean(text, MAX[kind] || 500);
    if (!text) return { ok: false, msg: '内容不能为空' };
    var rt = rateCheck(kind);
    if (!rt.ok) {
      if (rt.why === 'win') {
        return { ok: false, msg: '10 分钟内最多发 ' + rt.max + ' 条，请 ' + Math.ceil(rt.left / 60) + ' 分钟后再试' };
      }
      return { ok: false, msg: '发言太快，请稍候 10 秒再试' };
    }
    if (isBlocked()) return { ok: false, msg: '你的账号已被屏蔽（多次严重违规），无法发言' };
    if (isMuted()) return { ok: false, msg: '你已被禁言，还剩 ' + muteLeftDays() + ' 天' };
    var sp = spamCheck(text);                       /* ★ 修复103：联系方式 / 引流 / 刷屏形态 */
    if (!sp.ok) return { ok: false, msg: sp.why };
    var chk = check(text);
    if (!chk.ok) {
      var d = onBlocked(chk.cats);
      var extra = d.blocked ? ' 已永久屏蔽！'
        : (d.muteUntil > Date.now() ? ' 已禁言 ' + muteLeftDays() + ' 天！'
        : ' 再连续被拦截 ' + (3 - d.blockStreak) + ' 次将被禁言 1 个月');
      return { ok: false, msg: '内容含不当词汇，已被拦截，不能发布。' + extra };
    }
    rateCommit(kind);                               /* 只在真正发出去时才记账 */
    return { ok: true, text: text };
  }

  /* ---------- 讨论区数据 ---------- */
  function dcList() { var a = load(DC_KEY, []); return Array.isArray(a) ? a : []; }
  function dcStore(list) { save(DC_KEY, list); }
  function dcNextId(list) {
    /* id 形如 D-07-9f3k：数字段取全量最大值防撞；尾巴带随机段，多设备同时发帖也不会重号 */
    var mx = 0;
    list.forEach(function (it) { var m = String(it && it.id || '').match(/^D-(\d+)/); if (m) mx = Math.max(mx, +m[1]); });
    return 'D-' + (mx + 1 < 10 ? '0' : '') + (mx + 1) + '-' + Math.random().toString(36).slice(2, 6);
  }
  /* ---------- 跨设备合并（纯函数，node 可直接测试） ----------
     规则：按 id 并集；两边都有时 —— 带 del（删除墓碑）的一方赢（删除要能跨设备生效），
     否则新 ts 赢；结果按 ts 升序。墓碑保留 30 天后随容量清理。
     上限 500 条（最老的先出），防止内容 JSON 无限膨胀。 */
  function merge(a, b) {
    var map = {};
    (Array.isArray(a) ? a : []).forEach(function (m) { if (m && m.id) map[m.id] = m; });
    (Array.isArray(b) ? b : []).forEach(function (m) {
      if (!m || !m.id) return;
      var old = map[m.id];
      if (!old) { map[m.id] = m; return; }
      var oldDel = +(old.del || 0), newDel = +(m.del || 0);
      if (newDel && !oldDel) map[m.id] = m;                       /* 删除标记传播 */
      else if (!newDel && oldDel) { /* keep old (tombstone) */ }
      else if (newDel && oldDel) { if (newDel > oldDel) map[m.id] = m; }
      else if ((+m.ts || 0) > (+old.ts || 0)) map[m.id] = m;      /* 内容冲突：新者胜 */
    });
    var out = Object.keys(map).map(function (k) { return map[k]; });
    out.sort(function (x, y) { return (+x.ts || 0) - (+y.ts || 0); });
    var month = Date.now() - 30 * DAY;
    out = out.filter(function (m) { return !(+m.del || 0) || (+m.del || 0) > month; }); /* 30 天前的墓碑清掉 */
    while (out.length > 500) out.shift();
    return out;
  }

  /* ---------- 管理员审核台（人工屏蔽：按身份码累计，满 3 次 → 该身份码禁言 1 个月） ---------- */
  function modData() { var m = load(MOD_KEY, { manual: {}, hid: {} }); if (!m.manual) m.manual = {}; if (!m.hid) m.hid = {}; return m; }
  function manualCount(code) { return (modData().manual[code] || []).length; }
  function manualStrike(code) {
    var m = modData(), now = Date.now();
    m.manual[code] = (m.manual[code] || []).filter(function (t) { return now - t < 90 * DAY; });
    m.manual[code].push(now);
    save(MOD_KEY, m);
    var n = m.manual[code].length, muted = false;
    if (n >= 3) {
      muted = true;
      if (me().code === code) { var d = me(); d.muteUntil = now + MUTE_MS; save(DEV_KEY, d); }
    }
    return { count: n, muted: muted };
  }
  function hideMsg(id) { var m = modData(); m.hid[id] = Date.now(); save(MOD_KEY, m); }
  function delMsg(id) { var m = modData(); delete m.hid[id]; save(MOD_KEY, m); }
  function isHidden(id) { return !!modData().hid[id]; }

  ROOT.LMCommunity = {
    MAX: MAX, clean: clean, me: me, displayName: displayName, setNick: setNick,
    isMuted: isMuted, isBlocked: isBlocked, muteLeftDays: muteLeftDays, strikeInfo: strikeInfo,
    wordCount: wordCount, wordStats: wordStats, rebuildWords: rebuildWords,
    check: check, gate: gate, onBlocked: onBlocked, spamCheck: spamCheck,
    rateInfo: rateInfo, rateReset: rateReset,
    dcList: dcList, dcStore: dcStore, dcNextId: dcNextId, merge: merge,
    modData: modData, manualCount: manualCount, manualStrike: manualStrike, hideMsg: hideMsg, delMsg: delMsg, isHidden: isHidden
  };
})();