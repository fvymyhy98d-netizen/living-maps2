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

  /* 浏览器侧：拿不到就返回 false，调用方照常走纯 BM25（不报错、不挡路） */
  function load(url) {
    if (M) return Promise.resolve(true);
    if (typeof fetch !== 'function') return Promise.resolve(false);
    return fetch(url, { cache: 'force-cache' })
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

  return {
    fromJSON: fromJSON, load: load, ready: ready, info: info,
    logp: logp, rerank: rerank, fixQuery: fixQuery, dist: dist
  };
});
