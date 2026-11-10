/* ★ 修复164：站内语义层（无监督新词发现 + 概念共现 + 页面主题）
 * ---------------------------------------------------------------------------
 * 为什么需要它：js/ai.js 的 tokens() 对中文是「相邻两字硬切」(2-gram)，
 *   「这样核对」→「样核」、「工具有」→「工有」。于是关键词全是碎片、相关条目靠字面重合、
 *   问答换个说法就一条都召回不到。字符 n-gram 模型只管重排/纠错，救不了这三件事。
 *
 * 这一层做的三件"基础语义"活（全部是统计，不生成任何文字、不接任何 API）：
 *   ① 从本站语料里**无监督挖出完整词**（凝固度 PMI + 左右邻字自由度），
 *      再加页面标题 / 块标题 / 条目名这些人工写好的结构化词 → 得到词典；
 *   ② 按"同一句里一起出现"统计词共现，算 PMI → 每个词有一张概念关联表；
 *   ③ 每页算 tf-idf 主题词 → 相关条目不再靠字面对齐。
 *
 * 产物 data/sem.json，由 tools/train_lm.js 训练时一起生成（网页「🧠 重训小模型」调同一份 build）。
 * 浏览器由 js/ai.js 在打开面板时懒加载；**加载不到就整层降级**，原来的 2-gram 逻辑一丁点不变。
 *
 * 硬规矩：本模块只输出「词 / 词表 / 分数」，绝不产出答案文字。
 *         语义召回只是把更多**原文句子**送进候选池，答案仍逐字来自站内原句。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LMSE = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}), function () {
  'use strict';

  const MAX_BYTES = 600 * 1024;
  let M = null;                 /* { v, chars, words, rel, topics, df, nDoc, stop } */
  let cutMap = null;

  /* ---------------- 公共小工具 ---------------- */
  function isCn(ch) {
    if (!ch) return false;
    const c = ch.charCodeAt(0);
    return c >= 0x4e00 && c <= 0x9fa5;
  }
  function clean(s) {
    return String(s == null ? '' : s)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/==[^=,，]*?[,，]([\s\S]*?)==/g, '$1')
      .replace(/==([\s\S]*?)==/g, '$1')
      .replace(/@@[^@,，]*?[,，]([\s\S]*?)@@/g, '$1')
      .replace(/@@([\s\S]*?)@@/g, '$1')
      .replace(/\*\*([\s\S]*?)\*\*/g, '$1')
      .replace(/__([\s\S]*?)__/g, '$1')
      .replace(/~~([\s\S]*?)~~/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/[*_~`#>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  /* 虚词：既用于过滤候选词，也用于运行时分词降噪。
     注意这里只放"单字虚词 + 常见双字虚词"，专业词（如「模型」「语料」）一律不拦。 */
  const BAD_CHAR = {};
  ('的了和与及或在是有为以对从把被而也都就还又很更最会能可要让使这那我你他它其个种些不没如果'
    + '因为所以但是然后并且以及等等通过进行需要应该可能主要已经正在还有同时因此例如比如更加非常'
    + '目前现在时候方面问题内容这里那里什么怎么如何哪些可以一')
    .split('').forEach(function (c) { BAD_CHAR[c] = 1; });
  /* 只用于「关键词展示」的弱词：它们是合法词，但太通用，做成胶囊毫无信息量。
     词典和检索里仍然保留 —— 「处理」「记录」在回答问题时要用来召回原句。 */
  const WEAK_WORD = {};
  ('提出 处理 说清 互相 至少 参考 使用 需要 应该 可能 主要 已经 正在 还有 同时 例如 比如 '
    + '通过 进行 以及 其中 之后 之前 目前 现在 时候 这里 那里 期待 针对 遇到 知道 决定 选择 '
    + '支持 补充 全部 公开 位置 范围 多少 建议 说明 描述 独立 完整 直接 实际 自己 具体 '
    + '一些 一种 一个 这些 那些 不同 一样 这样 那样 相关 有关 之类 而已 部分 情况 方式'
  ).split(/\s+/).forEach(function (w) { if (w) WEAK_WORD[w] = 1; });
  /* 以这些字收尾的中文串几乎都是「被截断的更长词」（如「保留原」=「保留原判断」的一截） */
  const TAIL_BAD = /[原了着过在的和与或把被使让为以对从]$/;
  const BAD_WORD = {};
  ('我们 你们 他们 它们 这个 那个 这些 那些 什么 怎么 如何 因为 所以 但是 而且 如果 就是 可以 '
    + '一个 一种 一些 不是 没有 需要 应该 可能 主要 已经 正在 还有 同时 例如 比如 通过 进行 以及 '
    + '其中 之后 之前 目前 现在 时候 方面 问题 内容 这样 那样 这里 那里 等等 为什么 怎么办 什么样 '
    + '建议 提问 说明 描述 期待 针对 遇到 哪个 哪些 这些 那些 一种 一个 就是 而已 之类 有关 相关 '
    + '改了 用了 做了 说了 看了 写了 有了 是的 不是 也会 就会 都是 还有 只有 可以 能够'
  ).split(/\s+/).forEach(function (w) { if (w) BAD_WORD[w] = 1; });
  const EN_STOP = {};
  ('the a an and or but of to in on for with by as at from is are was were be been it its this that '
    + 'these those we you they he she not no can will would should could may might have has had do does '
    + 'did so such than then there here what which who whom how why when where if else about into over'
  ).split(/\s+/).forEach(function (w) { if (w) EN_STOP[w] = 1; });

  function utf8Bytes(s) {
    s = String(s == null ? '' : s);
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }
  function entropy(m) {
    let tot = 0;
    Object.keys(m).forEach(function (k) { tot += m[k]; });
    if (!tot) return 0;
    let h = 0;
    Object.keys(m).forEach(function (k) { const p = m[k] / tot; h -= p * Math.log(p); });
    return h;
  }

  /* ---------------- ① 无监督新词发现 ----------------
     凝固度：一个串若能拆成左右两半，且 P(whole) 远大于 P(left)P(right)，说明它是个词而非偶然拼接。
     自由度：左右邻字越丰富，越说明它能独立使用（不是更长词的一截）。 */
  function discover(text) {
    const runs = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    const freq = {};            /* 子串 → 次数（含长度 1，算 PMI 要用） */
    const left = {}, right = {};
    let total = 0;
    runs.forEach(function (run) {
      total += run.length;
      for (let i = 0; i < run.length; i++) {
        for (let L = 1; L <= 6 && i + L <= run.length; L++) {
          const w = run.substr(i, L);
          freq[w] = (freq[w] || 0) + 1;
          if (L >= 2) {
            (left[w] = left[w] || {})[i > 0 ? run.charAt(i - 1) : '^'] = ((left[w] || {})[i > 0 ? run.charAt(i - 1) : '^'] || 0) + 1;
            (right[w] = right[w] || {})[i + L < run.length ? run.charAt(i + L) : '$'] = ((right[w] || {})[i + L < run.length ? run.charAt(i + L) : '$'] || 0) + 1;
          }
        }
      }
    });
    const words = [];
    Object.keys(freq).forEach(function (w) {
      const L = w.length, f = freq[w];
      if (L < 2 || L > 6 || f < (L === 2 ? 4 : 3)) return;
      if (BAD_WORD[w] || TAIL_BAD.test(w) || BAD_CHAR[w.charAt(0)] || BAD_CHAR[w.charAt(L - 1)]) return;
      /* 虚词夹在中间也会产生大量假词（「的那就」之类）：整词里虚字占比过高就丢 */
      let bad = 0;
      for (let i = 0; i < L; i++) if (BAD_CHAR[w.charAt(i)]) bad++;
      if (bad / L > 0.5) return;
      /* 最小凝固度：所有切法里最弱的那一刀仍要够强 */
      let minPmi = Infinity;
      for (let i = 1; i < L; i++) {
        const a = w.slice(0, i), b = w.slice(i);
        const pmi = Math.log((f * total) / (freq[a] * freq[b] || 1));
        if (pmi < minPmi) minPmi = pmi;
      }
      const lh = entropy(left[w] || {}), rh = entropy(right[w] || {});
      const free = Math.min(lh, rh);
      if (minPmi < (L === 2 ? 3.0 : 2.2)) return;
      if (free < (L === 2 ? 1.0 : 0.7)) return;
      /* 得分：频次（对数）× 凝固度 × 自由度，用来在体积不够时优先保留好词 */
      words.push({ w: w, f: f, s: Math.log(1 + f) * minPmi * (0.5 + free) });
    });
    words.sort(function (a, b) { return b.s - a.s; });
    return words;
  }

  /* ② 结构化词：页面名 / 块标题 / 条目名是人工写的高质量词，强制进词典 */
  function structWords(pages) {
    const out = {};
    (pages || []).forEach(function (p) {
      const add = function (s) {
        clean(s).split(/[\s，,。；;、：:（）()\[\]【】|/!?？！"'“”·—\-]+/).forEach(function (x) {
          const w = x.replace(/[^\u4e00-\u9fa5a-zA-Z0-9+#._-]/g, '');
          /* 只收「2~8 字、含汉字、不是纯数字」的短名称。
             早先放宽到 12 字且不滤虚词，把「我们会怎么处理」这类整句标题塞进了词典，
             最大匹配分词就会切出怪词 —— 这正是要避免的。 */
          if (w.length < 2 || w.length > 8 || !/[\u4e00-\u9fa5]/.test(w)) return;
          if (/^\d+$/.test(w) || BAD_WORD[w]) return;
          if (TAIL_BAD.test(w) || BAD_CHAR[w.charAt(0)] || BAD_CHAR[w.charAt(w.length - 1)]) return;
          let bad = 0;
          for (let i = 0; i < w.length; i++) if (BAD_CHAR[w.charAt(i)]) bad++;
          if (bad / w.length > 0.34) return;
          out[w] = 1;
        });
      };
      add(p && p.label);
      ((p && p.blocks) || []).forEach(function (b) {
        if (!b) return;
        add(b.title);
        if (b.items && Array.isArray(b.items)) {
          b.items.forEach(function (it) {
            if (typeof it === 'string') add(it);
            else if (it) add(it.name || it.label || it.t || it.text);
          });
        }
        if (b.only && Array.isArray(b.only)) b.only.forEach(add);
      });
    });
    return Object.keys(out);
  }

  /* ③ 最大匹配分词（运行时也用同一份） */
  function buildCutMap(words) {
    const m = {}, max = {};
    words.forEach(function (w) {
      if (!isCn(w.charAt(0))) return;
      const c = w.charAt(0);
      (m[c] = m[c] || []).push(w);
      if (!max[c] || w.length > max[c]) max[c] = w.length;
    });
    Object.keys(m).forEach(function (c) { m[c].sort(function (a, b) { return b.length - a.length; }); });
    return { m: m, max: max };
  }
  function cut(text) {
    if (!cutMap) return [];
    const s = clean(String(text || '')).toLowerCase();
    const out = [];
    /* 英文词整取（≥2 且非停用词）；中文走最大匹配 */
    const parts = s.match(/[\u4e00-\u9fa5]+|[a-z][a-z0-9+#._-]*/g) || [];
    parts.forEach(function (part) {
      if (!isCn(part.charAt(0))) {
        if (part.length >= 2 && !EN_STOP[part]) out.push(part);
        return;
      }
      let i = 0;
      while (i < part.length) {
        const c = part.charAt(i);
        const list = cutMap.m[c];
        let hit = '';
        if (list) {
          const upto = Math.min(cutMap.max[c] || 2, part.length - i);
          for (let L = upto; L >= 2; L--) {
            const w = part.substr(i, L);
            /* list 已按长度降序，用 indexOf 足够（词表按首字母分组，通常几十条） */
            if (list.indexOf(w) >= 0) { hit = w; break; }
          }
        }
        if (hit) { out.push(hit); i += hit.length; }
        else i++;               /* 落单的字直接跳过：单字几乎都是噪声 */
      }
    });
    return out;
  }

  /* ---------------- ④ 概念共现 / 页面主题 ---------------- */
  function sentSplit(text) {
    return String(text || '')
      .split(/[。！？；!?;\n]|[，,、]{1,}(?=[^\s]{40,})/)
      .map(function (s) { return clean(s); })
      .filter(function (s) { return s.length >= 4; });
  }
  function buildRel(sents, words, dfDoc) {
    const co = {}, sentFreq = {};
    let n = 0;
    const valid = {};
    words.forEach(function (w) { valid[w] = 1; });
    sents.forEach(function (s) {
      const seen = {};
      cut(s).forEach(function (w) { if (valid[w]) seen[w] = 1; });
      const ws = Object.keys(seen);
      if (ws.length < 2) return;
      n++;
      ws.forEach(function (w) { sentFreq[w] = (sentFreq[w] || 0) + 1; });
      for (let i = 0; i < ws.length; i++) {
        for (let j = i + 1; j < ws.length; j++) {
          const a = ws[i] < ws[j] ? ws[i] : ws[j], b = ws[i] < ws[j] ? ws[j] : ws[i];
          (co[a] = co[a] || {})[b] = ((co[a] || {})[b] || 0) + 1;
          (co[b] = co[b] || {})[a] = ((co[b] || {})[a] || 0) + 1;
        }
      }
    });
    const rel = {};
    Object.keys(co).forEach(function (a) {
      /* 只把「全站每页都有」的词排除；「模型/训练」这类高频核心词恰恰最该有扩展表，
         否则用户最常问的词反而扩不出东西（早期 0.72 的阈值把它们全砍了）。 */
      if ((dfDoc[a] || 0) > 0.90 * (M && M.nDoc ? M.nDoc : 39)) return;
      const pa = (sentFreq[a] || 1) / Math.max(n, 1);
      const cand = [];
      Object.keys(co[a]).forEach(function (b) {
        const c = co[a][b];
        if (c < 2) return;
        const pb = (sentFreq[b] || 1) / Math.max(n, 1);
        const pmi = Math.log((c / Math.max(n, 1)) / (pa * pb));
        if (pmi <= 0.7) return;
        cand.push({ w: b, v: Math.min(1, pmi / 5) });
      });
      cand.sort(function (x, y) { return y.v - x.v; });
      if (cand.length) rel[a] = cand.slice(0, 8).map(function (x) { return [x.w, Math.round(x.v * 100) / 100]; });
    });
    return rel;
  }

  /* ---------------- 训练主入口 ---------------- */
  function build(text, pages, opts) {
    const o = opts || {};
    const t0 = Date.now();
    /* chars 记**原始语料长度**（与 data/lm.json 的口径一致，--check 才不会误报"语料变了"）；
       内部统计用清洗后的文本，两者可能差几个标点/标记字符，属正常。 */
    const rawLen = String(text || '').length;
    text = clean(text || '');
    if (text.length < 500) throw new Error('语料太小（' + text.length + ' 字）');
    const found = discover(text);
    const extra = structWords(pages);
    const wordSet = {};
    found.forEach(function (x) { wordSet[x.w] = 1; });
    extra.forEach(function (w) { wordSet[w] = 1; });
    let words = Object.keys(wordSet);
    /* 体积护栏：词太多就按 discover 的得分砍掉尾部（结构化词永远保留） */
    const keepExtra = {};
    extra.forEach(function (w) { keepExtra[w] = 1; });
    if (words.length > (o.maxWords || 9000)) {
      const score = {};
      found.forEach(function (x) { score[x.w] = x.s; });
      words.sort(function (a, b) { return (score[b] || 0) - (score[a] || 0); });
      words = words.slice(0, o.maxWords || 9000);
      extra.forEach(function (w) { if (words.indexOf(w) < 0) words.push(w); });
    }
    /* 装词典：buildRel / topics 都要用 cut()。训完**保持就绪** —— CLI 与网页按钮
       调完 build 就能直接展示/使用语义层，不必再记着手动 fromJSON。 */
    cutMap = buildCutMap(words);
    const docTerms = {}, df = {};
    (pages || []).forEach(function (p) {
      const t = {};
      const chunks = [clean((p && p.label) || '')];
      ((p && p.blocks) || []).forEach(function (b) {
        if (!b) return;
        chunks.push(clean(b.title || ''), clean(b.text || ''));
        if (b.type === 'table') {
          (b.rows || []).forEach(function (r) { chunks.push(clean((r || []).join(' '))); });
        }
        if (Array.isArray(b.items)) {
          b.items.forEach(function (it) {
            chunks.push(clean(typeof it === 'string' ? it : (it && (it.name || it.label || it.text)) || ''));
          });
        }
      });
      cut(chunks.join(' ')).forEach(function (w) { t[w] = (t[w] || 0) + 1; });
      docTerms[p.id] = t;
      Object.keys(t).forEach(function (w) { df[w] = (df[w] || 0) + 1; });
    });
    const nDoc = Math.max(1, (pages || []).length);
    const idf = {};
    Object.keys(df).forEach(function (w) { idf[w] = Math.log(1 + nDoc / (1 + df[w])) + 0.1; });
    const topics = {};
    Object.keys(docTerms).forEach(function (id) {
      const t = docTerms[id];
      topics[id] = Object.keys(t).map(function (w) {
        return [w, Math.round((1 + Math.log(t[w])) * (idf[w] || 0.1) * 100) / 100];
      }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 24);
    });
    M = { v: 1, chars: rawLen, words: words, rel: {}, topics: topics, df: df, idf: idf, nDoc: nDoc };
    const sents = sentSplit(text);
    M.rel = buildRel(sents, words, df);
    let payload = {
      v: 1, chars: rawLen, words: words, rel: M.rel,
      topics: topics, df: df, idf: idf, nDoc: nDoc
    };
    let bytes = utf8Bytes(JSON.stringify(payload));
    /* 超体积 → 先砍关联表（保留关联最强的），再砍主题词 */
    if (bytes > (o.maxBytes || MAX_BYTES)) {
      const rel2 = {};
      Object.keys(M.rel).forEach(function (w) { rel2[w] = M.rel[w].slice(0, 4); });
      payload.rel = rel2; M.rel = rel2;
      bytes = utf8Bytes(JSON.stringify(payload));
    }
    const res = {
      payload: payload, bytes: bytes, chars: rawLen,
      words: words.length, relWords: Object.keys(payload.rel).length,
      topics: Object.keys(topics).length, ms: Date.now() - t0
    };
    return res;
  }

  /* ---------------- 运行时 ---------------- */
  function fromJSON(j) {
    if (!j || !j.words || !j.topics) return null;
    M = {
      v: j.v || 1, chars: j.chars || 0, words: j.words, rel: j.rel || {},
      topics: j.topics || {}, df: j.df || {}, idf: j.idf || {}, nDoc: j.nDoc || 0
    };
    cutMap = buildCutMap(M.words);
    return M;
  }
  function ready() { return !!M; }
  function info() { return M ? { words: M.words.length, rel: Object.keys(M.rel).length, pages: Object.keys(M.topics).length, chars: M.chars } : null; }
  function load(url) {
    if (M) return Promise.resolve(true);
    if (typeof fetch !== 'function') return Promise.resolve(false);
    return fetch(url, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return !!fromJSON(j); })
      .catch(function () { return false; });
  }

  /* 关键词：完整词 + tf-idf，滤掉碎片与虚词；返回词数组 */
  function keywords(pageText, k) {
    if (!M) return [];
    const tf = {};
    cut(pageText).forEach(function (w) { tf[w] = (tf[w] || 0) + 1; });
    const scored = Object.keys(tf).map(function (w) {
      /* 长词（「大语言模型」「反馈与建议」）信息量更高，优先出；两字通用词压一压 */
      return { w: w, s: (1 + Math.log(tf[w])) * (M.idf[w] || 0.1) * (w.length >= 3 ? 1.45 : 0.85) };
    }).filter(function (x) {
      return x.w.length >= 2 && !BAD_WORD[x.w] && !WEAK_WORD[x.w] && !TAIL_BAD.test(x.w);
    })
      .sort(function (a, b) { return b.s - a.s; });
    const out = [];
    scored.forEach(function (x) {
      if (out.length >= (k || 8)) return;
      /* 有包含关系时只留更长的那个（「语言模型」vs「大语言模型」→ 留后者） */
      if (out.some(function (o) { return o.length > x.w.length && o.indexOf(x.w) >= 0; })) return;
      if (out.some(function (o) { return x.w.length > o.length && x.w.indexOf(o) >= 0; })) {
        const i = out.findIndex(function (o) { return x.w.length > o.length && x.w.indexOf(o) >= 0; });
        out.splice(i, 1);
      }
      out.push(x.w);
    });
    return out;
  }

  /* 概念扩展：把问句里的词扩成"站里常一起出现"的词；原词权重 1，扩展词 ≤0.55 */
  function expand(terms, k) {
    if (!M) return [];
    const acc = {};
    (terms || []).forEach(function (t) { acc[t] = 1; });
    (terms || []).forEach(function (t) {
      (M.rel[t] || []).slice(0, 4).forEach(function (p) {
        const w = p[0], v = 0.55 * p[1];
        if (!acc[w] || acc[w] < v) acc[w] = Math.max(acc[w] || 0, v);
      });
    });
    return Object.keys(acc).map(function (w) { return [w, Math.round(acc[w] * 100) / 100]; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, k || 12);
  }
  /* 语义扩展词（拼进查询串用，ai.js 的 tokens() 会把它们切成 2-gram 与句子索引对齐） */
  function expandWords(q, k) {
    if (!M) return [];
    const base = cut(q);
    const ex = expand(base, (k || 8) + base.length);
    const out = [];
    ex.forEach(function (p) {
      if (base.indexOf(p[0]) >= 0) return;
      if (out.length >= (k || 8)) return;
      out.push(p[0]);
    });
    return out;
  }
  /* 页面主题余弦：相关条目用 */
  function topicVec(id) {
    if (!M) return null;
    return M.topics[id] || null;
  }
  function topicSim(idA, idB) {
    const a = topicVec(idA), b = topicVec(idB);
    if (!a || !b) return 0;
    const vb = {};
    b.forEach(function (p) { vb[p[0]] = p[1]; });
    let dot = 0, na = 0, nb = 0;
    a.forEach(function (p) { na += p[1] * p[1]; if (vb[p[0]]) dot += p[1] * vb[p[0]]; });
    b.forEach(function (p) { nb += p[1] * p[1]; });
    return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  }

  return {
    build: build, fromJSON: fromJSON, load: load, ready: ready, info: info,
    cut: cut, keywords: keywords, expand: expand, expandWords: expandWords,
    topicSim: topicSim, topicVec: topicVec,
    clean: clean, utf8Bytes: utf8Bytes, MAX_BYTES: MAX_BYTES
  };
});
