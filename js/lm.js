/* ★ 修复112：字符级 n-gram 语言模型（本站语料训练，tools/train_lm.js 产出）
 *
 * 硬规矩：这个模型**只输出数字**（对数概率 / 重排顺序 / 纠错后的词），
 *         它没有任何"生成文字"的接口 —— 所以它不可能让答案编出新东西。
 *
 * 浏览器：<script src="js/lm.js"> 后由 ai.js 在打开面板时懒加载 data/lm.json
 * Node：  require('./js/lm.js').fromJSON(JSON.parse(fs.readFileSync('data/lm.json')))
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LMLM = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}), function () {
  let M = null;                     /* { order, grams, chars } */
  const BACKOFF = 0.4;              /* 老 k-gram 打不过就退一阶，乘这个折扣 */
  const rowTotal = {};

  function fromJSON(j) {
    if (!j || !j.grams) return null;
    M = { order: j.order || 3, grams: j.grams, chars: j.chars || 0 };
    Object.keys(rowTotal).forEach(function (k) { delete rowTotal[k]; });
    return M;
  }
  function ready() { return !!M; }
  function info() { return M ? { order: M.order, chars: M.chars } : null; }

  /* 浏览器侧：拿不到就返回 false，调用方照常走纯 BM25（不报错、不挡路）
     ★ 修复144：以前是 cache:'force-cache' —— 它的语义是「有缓存就用，哪怕是过期的」，
     于是你在电脑上重训了 data/lm.json、推上去了，**老访客那边永远是旧语料**的重排/纠错，
     而且没有任何提示（URL 又没有版本参数，不存在「换地址自然失效」）。
     改成 no-cache：照样吃缓存，但每次先向服务器确认（Pages 带 ETag → 没变就 304，几乎零流量）。 */
  function load(url) {
    if (M) return Promise.resolve(true);
    if (typeof fetch !== 'function') return Promise.resolve(false);
    return fetch(url, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return !!fromJSON(j); })
      .catch(function () { return false; });
  }

  function total(row) {
    let t = 0;
    for (const k in row) t += row[k];
    return t || 1;
  }
  /* 每字符平均对数概率（越接近 0 越"像站里的话"）
     没见过的组合**重罚**（不是跳过）—— 否则一串乱码会因为"一次都没匹配上"而拿到 0 分，
     反而比真实句子（负分）更高。这个语义错误会让重排把乱码排到前面。 */
  const FLOOR = 1e-6;
  function logp(str) {
    if (!M) return 0;
    const s = String(str || '');
    if (s.length < 2) return 0;
    let sum = 0, n = 0;
    for (let i = 1; i < s.length; i++) {
      let p = 0;
      for (let k = Math.min(M.order, i); k >= 1; k--) {
        const row = (M.grams[k] || {})[s.slice(i - k, i)];
        const c = row && row[s.charAt(i)];
        if (c) { p = (c / total(row)) * Math.pow(BACKOFF, M.order - k); break; }
      }
      sum += Math.log(p > 0 ? p : FLOOR);
      n++;
    }
    return n ? sum / n : 0;
  }

  /* 候选重排：主排序仍是 BM25（score），语言模型只做 ±15% 的微调 */
  function rerank(cands, weight) {
    if (!M || !cands || cands.length < 2) return cands || [];
    const w = weight == null ? 0.15 : weight;
    const scored = cands.map(function (c) {
      const lp = logp(c.s);
      const norm = Math.max(0, Math.min(1, (lp + 12) / 9));
      return { c: c, v: (c.score || 0) * (1 + w * norm) };
    });
    scored.sort(function (a, b) { return b.v - a.v; });
    return scored.map(function (x) { return x.c; });
  }

  function dist(a, b) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 2) return 9;
    let prev = [], cur = [];
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      prev = cur;
    }
    return cur[n];
  }
  /* 检索词纠错：只动"站内词表里没有的英文词"，中文一律不碰（乱改中文才是瞎编的源头） */
  function fixQuery(q, vocab) {
    if (!M || !vocab || !vocab.length) return q;
    const set = {};
    vocab.forEach(function (w) { set[String(w).toLowerCase()] = 1; });
    return String(q || '').replace(/[A-Za-z][A-Za-z0-9+#._-]{2,}/g, function (w) {
      const lw = w.toLowerCase();
      if (set[lw]) return w;
      let best = null, bd = 3;
      vocab.forEach(function (v) {
        const s = String(v).toLowerCase();
        if (s.charAt(0) !== lw.charAt(0) || s === lw) return;
        const d = dist(lw, s);
        if (d < bd) { bd = d; best = v; }
      });
      return best || w;
    });
  }

  /* ================= 训练（★ 修复145：网页里也能训，管理条「🧠 重训小模型」）=================
     以前训练算法只存在于 tools/train_lm.js（Node），网页改不了仓库文件，所以只能敲命令行。
     现在把算法放在这里：CLI（tools/train_lm.js）和网页（js/app.js → LMApp.trainLM）**调用同一份代码**，
     两边训出来的 JSON 逐字节一致，不会出现「两套实现慢慢漂移」。
     仍然是纯统计（数「前 k 个字 → 下一个字」的频次），这里不生成任何文字。 */
  const MAX_BYTES = 900 * 1024;

  /* UTF-8 字节数：浏览器没有 Buffer，这里手算（与 Node 的 Buffer.byteLength 等价） */
  function utf8Bytes(s) {
    s = String(s == null ? '' : s);
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }  /* 代理对 = 4 字节 */
      else n += 3;
    }
    return n;
  }

  /* 统计 k=1..order 的字符上下文 → { 下一个字符: 次数 } */
  function countGrams(text, order) {
    const ctx = [];
    for (let k = 1; k <= order; k++) ctx[k] = {};
    for (let i = 1; i < text.length; i++) {
      for (let k = 1; k <= order; k++) {
        if (i - k < 0) break;
        const key = text.slice(i - k, i);
        const row = (ctx[k][key] = ctx[k][key] || {});
        row[text[i]] = (row[text[i]] || 0) + 1;
      }
    }
    return ctx;
  }

  /* 裁剪：丢掉出现太少的上下文/字符，每个上下文最多留 cap 个后继。
     ★ 一元（k=1）不裁剪 —— 否则大量单字查不到概率、全落到 FLOOR（困惑度会失真）。 */
  function pruneGrams(ctx, order, minC, cap) {
    const out = {};
    for (let k = 1; k <= order; k++) {
      const src = ctx[k] || {};
      out[k] = {};
      Object.keys(src).forEach(function (key) {
        const row = src[key];
        const chars = (k === 1)
          ? Object.keys(row)
          : Object.keys(row).filter(function (c) { return row[c] >= minC; });
        if (!chars.length) return;
        chars.sort(function (a, b) { return row[b] - row[a]; });
        const o = {};
        chars.slice(0, k === 1 ? chars.length : cap).forEach(function (c) { o[c] = row[c]; });
        out[k][key] = o;
      });
    }
    return out;
  }

  /* 训练主入口：语料文本 → { payload, order, chars, bytes, contexts, entries, minCount, cap, ms }
     payload 就是 data/lm.json 的完整内容，直接 JSON.stringify 落盘即可。 */
  function buildModel(text, order, maxBytes) {
    const t0 = (typeof Date !== 'undefined') ? Date.now() : 0;
    order = Math.max(1, Math.min(5, parseInt(order, 10) || 4));
    text = String(text == null ? '' : text);
    if (text.length < 500) throw new Error('语料太小（' + text.length + ' 字），先多写几页');
    const raw = countGrams(text, order);
    const limit = maxBytes || MAX_BYTES;
    let grams = null, bytes = 0, minC = 2, cap = 8, guard = 0;
    for (;;) {
      grams = pruneGrams(raw, order, minC, cap);
      bytes = utf8Bytes(JSON.stringify({ order: order, chars: text.length, grams: grams }));
      if (bytes <= limit || ++guard > 40) break;
      if (minC < 10) minC++;
      else if (cap > 2) cap--;
      else break;
    }
    let entries = 0, contexts = 0;
    for (let k = 1; k <= order; k++) {
      Object.keys(grams[k]).forEach(function (key) {
        contexts++;
        entries += Object.keys(grams[k][key]).length;
      });
    }
    return {
      payload: { order: order, chars: text.length, grams: grams },
      order: order, chars: text.length, bytes: bytes, contexts: contexts, entries: entries,
      minCount: minC, cap: cap,
      ms: (typeof Date !== 'undefined') ? (Date.now() - t0) : 0
    };
  }

  return {
    fromJSON: fromJSON, load: load, ready: ready, info: info,
    logp: logp, rerank: rerank, fixQuery: fixQuery, dist: dist,
    buildModel: buildModel, utf8Bytes: utf8Bytes, MAX_BYTES: MAX_BYTES   /* ★ 修复145 */
  };
});
