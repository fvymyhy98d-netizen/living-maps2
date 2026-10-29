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
  var RATE_MS = 10000; /* 两次发言最小间隔（防刷屏） */

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
  var FLAT = (ROOT && ROOT.LM_SENSITIVE_WORDS) ? ROOT.LM_SENSITIVE_WORDS : [];
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
  var INDEX = null;
  function index() { /* 懒构建：词库词 → 归一化 key（词内容不外泄到任何日志） */
    if (INDEX) return INDEX;
    INDEX = [];
    var seen = {};
    for (var i = 0; i < FLAT.length; i++) {
      var w = String(FLAT[i] || '').trim().toLowerCase();
      if (w.length < 2 || w.length > 30 || seen[w]) continue;
      seen[w] = 1;
      var n = normalize(w);
      INDEX.push({ key: n.squash, spaced: n.spaced, latin: /^[a-z0-9]+$/.test(w) });
    }
    return INDEX;
  }
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

  /* ---------- 发言闸门：限流 → 屏蔽 → 禁言 → 敏感词（拦截即累计违规） ---------- */
  var lastSend = 0;
  function rateOk() { var t = Date.now(); if (t - lastSend < RATE_MS) return false; lastSend = t; return true; }
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
    if (!rateOk()) return { ok: false, msg: '发言太快，请稍候 10 秒再试' };
    if (isBlocked()) return { ok: false, msg: '你的账号已被屏蔽（多次严重违规），无法发言' };
    if (isMuted()) return { ok: false, msg: '你已被禁言，还剩 ' + muteLeftDays() + ' 天' };
    var chk = check(text);
    if (!chk.ok) {
      var d = onBlocked(chk.cats);
      var extra = d.blocked ? ' 已永久屏蔽！'
        : (d.muteUntil > Date.now() ? ' 已禁言 ' + muteLeftDays() + ' 天！'
        : ' 再连续被拦截 ' + (3 - d.blockStreak) + ' 次将被禁言 1 个月');
      return { ok: false, msg: '内容含不当词汇，已被拦截，不能发布。' + extra };
    }
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
    wordCount: wordCount,
    check: check, gate: gate, onBlocked: onBlocked,
    dcList: dcList, dcStore: dcStore, dcNextId: dcNextId, merge: merge,
    modData: modData, manualCount: manualCount, manualStrike: manualStrike, hideMsg: hideMsg, delMsg: delMsg, isHidden: isHidden
  };
})();