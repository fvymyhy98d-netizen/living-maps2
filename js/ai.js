/* =========================================================
   本地 AI 能力（课程作业要求「至少一项 AI 能力」）
   —— 纯前端、零依赖、零 API Key、离线可用，不发任何网络请求、不耗任何额度。
   技术：中文 2-gram + 英文词 分词 → TF-IDF 向量 → 余弦相似度 / IDF 加权句子打分
   功能：① 智能提炼（本页 3 条要点）② 关键词 ③ 语义相关条目 ④ 站内问答（抽取式，不编造）
   注：算法全在本文件，test_yjs.js 9.57 节直接 require 本文件用真内容跑。
   ========================================================= */
(function (W) {  /* ★ 修复91：Node 里（单元测试）没有 window → 用 globalThis 兜底，模块才能被 require */
W.LMAI = (function () {
  'use strict';

  /* ---------- 停用词（只影响权重，不影响可读性） ---------- */
  const CN_STOP = {};
  ('的了和与及或在是有为以对从把被而也都就还又很更最会能可要让使这个那个我们你们他们它们自己'
    + '什么怎么为什么如何哪些可以一个一种不是没有如果因为所以但是然后并且以及等等通过进行需要'
    + '应该可能主要已经正在还有同时因此例如比如更加非常目前现在时候方面问题内容这里那里这种'
  ).split('').forEach(function (c) { CN_STOP[c] = 1; });
  ('我们 你们 他们 它们 这个 那个 这些 那些 什么 怎么 如何 因为 所以 但是 而且 如果 就是 可以 '
    + '一个 一种 一些 不是 没有 需要 应该 可能 主要 已经 正在 还有 同时 例如 比如 通过 进行 以及 '
    + '其中 之后 之前 目前 现在 时候 方面 问题 内容 这样 那样 这里 那里 等等 为什么 怎么办 什么样 '
    + '建议 提问 说明 描述 期待 针对 遇到 哪个 哪些 什么'
  ).split(/\s+/).forEach(function (w) { if (w) CN_STOP[w] = 1; });
  /* 单字虚词（「是什」这类纯虚 2-gram 会在下面被整体丢掉，避免问答被噪声带偏） */
  ('什 吗 呢 吧 啊 呀 嘛 哦 诶 的 了 是 在 和 与 或 就 才 又 再 很 更 最 都 也 还 被 把 给 让 使'
  ).split('').forEach(function (c) { CN_STOP[c] = 1; });

  const EN_STOP = {};
  ('the a an and or but of to in on for with by as at from is are was were be been it its this that '
    + 'these those we you they he she not no can will would should could may might have has had do does '
    + 'did so such than then there here what which who whom how why when where if else about into over'
  ).split(/\s+/).forEach(function (w) { if (w) EN_STOP[w] = 1; });

  /* ---------- ① 文本清洗：剥掉本项目的行内标记 ---------- */
  function plain(s) {
    return String(s == null ? '' : s)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/==[^=,，]*?[,，]([\s\S]*?)==/g, '$1')  /* ==#色,文字== */
      .replace(/==([\s\S]*?)==/g, '$1')                /* ==文字== */
      .replace(/@@[^@,，]*?[,，]([\s\S]*?)@@/g, '$1')  /* @@grad2,文字@@ / @@f16,文字@@ */
      .replace(/\*\*([\s\S]*?)\*\*/g, '$1')
      .replace(/__([\s\S]*?)__/g, '$1')
      .replace(/~~([\s\S]*?)~~/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/[*_~`#>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ---------- ② 块 → 纯文本（按本项目 8 种块类型） ---------- */
  function blockText(b) {
    if (!b || typeof b !== 'object') return '';
    const parts = [];
    if (b.title) parts.push(b.title);
    if (b.text) parts.push(b.text);
    if (b.html) parts.push(b.html);
    if (b.type === 'table') {
      (b.headers || []).forEach(function (h) { parts.push(h); });
      (b.rows || []).forEach(function (r) { (r || []).forEach(function (c) { parts.push(c); }); });
    }
    if (b.type === 'chart') {
      (b.labels || []).forEach(function (l, i) {
        parts.push(l + ' ' + ((b.data || [])[i] == null ? '' : (b.data || [])[i]) + (b.unit || ''));
      });
    }
    if (b.type === 'files' || b.type === 'sources' || b.type === 'attach') {
      (b.items || []).forEach(function (it) { parts.push(it && (it.name || it.label || it.title || '')); });
    }
    if (b.type === 'list' && Array.isArray(b.items)) {
      b.items.forEach(function (it) { parts.push(typeof it === 'string' ? it : (it && (it.text || it.label)) || ''); });
    }
    return plain(parts.filter(Boolean).join(' '));
  }
  function pageText(p) {
    if (!p) return '';
    const out = [plain(p.label || p.id || '')];
    (p.blocks || []).forEach(function (b) { const t = blockText(b); if (t) out.push(t); });
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }

  /* ---------- ③ 分句 / 分词 ---------- */
  function sentences(text) {
    const out = [];
    String(text || '').split(/[。！？；!?;]|\s{2,}/).forEach(function (seg) {
      const s = plain(seg).replace(/^[、，,。；;：:\s]+/, '').trim();
      if (!s) return;
      if (s.length <= 150) { if (s.length >= 8) out.push(s); return; }
      /* 超长段（表格 / 图表被连成一句）→ 再按逗号顿号空格切成 ≤150 的块，
         否则整段会被丢掉，问「Transformer 注意力」就搜不到表格里的内容 */
      const chunks = s.match(/[^，,、；;\s][^，,、；;]{0,148}[，,、；;]?/g) || [s];
      chunks.forEach(function (c) {
        const t = c.trim();
        if (t.length >= 8) out.push(t.length > 150 ? t.slice(0, 150) : t);
      });
    });
    return out;
  }
  function tokens(s) {
    const out = [];
    const txt = plain(s).toLowerCase();
    (txt.match(/[a-z][a-z0-9+#._-]*/g) || []).forEach(function (w) {
      if (w.length >= 2 && !EN_STOP[w]) out.push(w);
    });
    (txt.match(/[\u4e00-\u9fa5]+/g) || []).forEach(function (run) {
      if (run.length === 1) { if (!CN_STOP[run]) out.push(run); return; }
      for (let i = 0; i + 1 < run.length; i++) {
        const bi = run.substr(i, 2);
        if (CN_STOP[bi]) continue;
        /* 「是什 / 这个」这类两端都是虚词的 2-gram 直接丢（纯噪声，会把问答排序带偏） */
        if (CN_STOP[bi.charAt(0)] && CN_STOP[bi.charAt(1)]) continue;
        out.push(bi);
      }
    });
    return out;
  }

  /* ---------- ④ 全站索引（TF-IDF） ---------- */
  function buildIndex(pages) {
    const list = (pages || []).filter(function (p) { return p && p.id; });
    const docs = list.map(function (p) {
      const text = pageText(p);
      const tk = tokens(text);
      const tf = {};
      tk.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
      return { id: p.id, label: plain(p.label || p.id), kind: p.kind || '', text: text, tf: tf, n: tk.length || 1, blocks: p.blocks || [] };
    });
    const df = {};
    docs.forEach(function (d) { Object.keys(d.tf).forEach(function (t) { df[t] = (df[t] || 0) + 1; }); });
    const idf = {};
    Object.keys(df).forEach(function (t) { idf[t] = Math.log(1 + docs.length / (1 + df[t])) + 0.1; });
    return { docs: docs, df: df, idf: idf };
  }
  function weight(tf, idf, t) { return (1 + Math.log(tf[t] || 1)) * (idf[t] || 0.1); }
  function cosOf(tfA, tfB, idf) {
    let dot = 0, na = 0, nb = 0;
    Object.keys(tfA).forEach(function (t) {
      const a = weight(tfA, idf, t);
      na += a * a;
      if (tfB[t]) dot += a * weight(tfB, idf, t);
    });
    Object.keys(tfB).forEach(function (t) { const b = weight(tfB, idf, t); nb += b * b; });
    if (!na || !nb) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  /* ---------- ⑤ 相关条目（全站语义相近页面） ---------- */
  function related(index, id, k) {
    if (!index || !index.docs) return [];
    const d0 = index.docs.filter(function (d) { return d.id === id; })[0];
    if (!d0) return [];
    return index.docs
      .filter(function (d) { return d.id !== id; })
      .map(function (d) {
        return { id: d.id, label: d.label, kind: d.kind, score: Math.round(cosOf(d0.tf, d.tf, index.idf) * 1000) / 1000 };
      })
      .filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, k || 3);
  }

  /* ---------- ⑥ 关键词 ---------- */
  function keywords(index, id, k) {
    if (!index || !index.docs) return [];
    const d = index.docs.filter(function (x) { return x.id === id; })[0];
    if (!d) return [];
    const scored = Object.keys(d.tf).map(function (t) {
      return { t: t, s: weight(d.tf, index.idf, t) };
    }).sort(function (a, b) { return b.s - a.s; });
    const out = [];
    scored.forEach(function (x) {
      if (out.length >= (k || 8)) return;
      /* 中文 2-gram 去重：已选过包含它的更长词就跳过，避免「语言/言模/模型」刷屏 */
      if (out.some(function (o) { return o.length > x.t.length && o.indexOf(x.t) >= 0; })) return;
      if (out.indexOf(x.t) >= 0) return;
      if (x.t.length < 2) return;      /* 单字多半是噪声（如「票」） */
      out.push(x.t);
    });
    return out;
  }

  /* ---------- ⑦ 抽取式摘要（要点） ---------- */
  function summarize(index, id, k) {
    if (!index || !index.docs) return [];
    const d = index.docs.filter(function (x) { return x.id === id; })[0];
    if (!d) return [];
    const cands = sentences(d.text).filter(function (s) { return s !== d.label; });
    if (!cands.length) return [];
    const scored = cands.map(function (s, i) {
      const st = tokens(s);
      if (!st.length) return { s: s, i: i, sc: 0 };
      let mass = 0;
      const uniq = {};
      st.forEach(function (t) { if (!uniq[t]) { uniq[t] = 1; mass += (index.idf[t] || 0.1); } });
      const len = Math.min(st.length, 40);
      /* 信息量/长度惩罚 + 首句加权（常是总起）+ 含数字或英文专业词略加分 */
      const bonus = (i === 0 ? 0.18 : 0) + (/\d/.test(s) ? 0.06 : 0) + (/[a-zA-Z]{3,}/.test(s) ? 0.04 : 0);
      return { s: s, i: i, sc: (mass / Math.sqrt(len || 1)) * (1 + bonus) };
    }).filter(function (x) { return x.sc > 0; })
      .sort(function (a, b) { return b.sc - a.sc; });

    /* 去重：与已选句子 2-gram 重合 > 55% 就跳过（MMR 简化版） */
    const picked = [];
    const bag = {};
    scored.forEach(function (x) {
      if (picked.length >= (k || 3)) return;
      const tk = tokens(x.s);
      let overlap = 0;
      tk.forEach(function (t) { if (bag[t]) overlap++; });
      if (tk.length && overlap / tk.length > 0.55) return;
      tk.forEach(function (t) { bag[t] = 1; });
      picked.push(x);
    });
    return picked.sort(function (a, b) { return a.i - b.i; }).map(function (x) { return x.s; });
  }

  /* ---------- ⑧ 站内问答（抽取式：只引用原文，不编造） ---------- */
  function ask(index, q, k) {
    const qt = tokens(q);
    if (!index || !index.docs || !qt.length) return [];
    const qset = {};
    qt.forEach(function (t) { qset[t] = 1; });
    const qUniq = Object.keys(qset);
    const res = [];
    index.docs.forEach(function (d) {
      /* 页面标题命中查询词 → 该页所有句子略加权（问「三张地图」时优先给「…地图」的页） */
      const labHas = {};
      tokens(d.label).forEach(function (t) { labHas[t] = 1; });
      const labHitN = qUniq.filter(function (t) { return labHas[t]; }).length;
      const labelBoost = 1 + 0.35 * (labHitN / qUniq.length);
      sentences(d.text).forEach(function (s) {
        const st = tokens(s);
        if (!st.length) return;
        const has = {};
        let mass = 0;
        st.forEach(function (t) { if (has[t]) return; has[t] = 1; mass += (index.idf[t] || 0.1); });
        /* 命中「几个不同的查询词」比命中「一个稀有词」更能说明相关 ——
           否则「是什」这类噪声 2-gram 会把不相关段落顶上来 */
        let hitN = 0, hitW = 0;
        qUniq.forEach(function (t) { if (has[t]) { hitN++; hitW += (index.idf[t] || 0.1); } });
        if (!hitN) return;
        const cover = hitN / qUniq.length;
        res.push({
          answer: s, pageId: d.id, title: d.label, cover: cover,
          score: Math.round((cover * hitW) * (1 + hitW / (mass || 1)) * labelBoost * 100) / 100
        });
      });
    });
    const keep = res.filter(function (r) { return r.cover >= 0.3; });   /* 多词提问：至少命中三成才算 */
    keep.sort(function (a, b) { return (b.score - a.score) || (b.cover - a.cover); });
    const seenPage = {}, out = [];
    keep.forEach(function (r) {
      if (seenPage[r.pageId]) return;
      seenPage[r.pageId] = 1; out.push(r);
    });
    return out.slice(0, k || 3);
  }

  /* ---------- ⑧.2 ★ 修复110：本地「会组织答案」的问答引擎 ----------
     仍然**只用站里写过的原文**（不联网、不接 API），但不再"只丢回一句"：
       · 先判断问题类型（是什么 / 区别 / 为什么 / 怎么做 / 举例 / 概览）
       · 对比题拆成 A、B 两个实体，各取最贴切的一句，做原文对照
       · 表格题直接定位到某一行（表头 + 该行）
       · 其余题按页聚合 2–3 句原句，前面加"按《某页》里的说法："这类引导语
     引导语/连接词都是**模板**（不含事实），事实全部来自原文 —— 会写，但不会编。 */
  const Q_KIND = [
    { k: '对比', re: /(区别|差异|对比|相比|不同|哪个好|vs\.?)/i },
    { k: '原因', re: /(为什么|为何|原因|怎么会|凭什么)/ },
    { k: '方法', re: /(怎么|如何|怎样|步骤|做法|流程)/ },
    { k: '例子', re: /(举例|例子|比如|案例)/ },
    { k: '定义', re: /(是什么|什么叫|什么是|定义|含义|概念|指什么)/ }
  ];
  function qKind(q) {
    const s = plain(q);
    for (let i = 0; i < Q_KIND.length; i++) if (Q_KIND[i].re.test(s)) return Q_KIND[i].k;
    return '概览';
  }
  /* 「RNN 和 Transformer 有什么区别」→ ['RNN','Transformer'] */
  function qPair(q) {
    const s = plain(q).replace(/[？?。!！,，、]/g, ' ');
    const m = s.match(/([A-Za-z0-9\u4e00-\u9fa5][^\s和与跟]{0,11})\s*(?:和|与|跟|vs\.?)\s*([A-Za-z0-9\u4e00-\u9fa5][^\s和与跟]{0,11})/i);
    if (!m) return null;
    const strip = function (x) { return String(x).replace(/^(请问|那么|所以|到底)/, '').trim(); };
    const a = strip(m[1]), b = strip(m[2]);
    if (!a || !b || a === b) return null;
    return [a, b];
  }
  function headLead(kind, label) {
    const pre = {
      定义: '按《' + label + '》里的说法：',
      对比: '《' + label + '》里的对照：',
      原因: '《' + label + '》给出的原因是：',
      方法: '《' + label + '》里的做法是：',
      例子: '《' + label + '》举的例子：',
      概览: '《' + label + '》里相关的说法：'
    };
    return pre[kind] || pre['概览'];
  }
  /* ---------- ⑧.3 ★ 修复111：句子级 BM25 检索（懒建 + 缓存，换内容自动重建） ----------
     比原来的「覆盖度 × 稀有词权重」更稳：长句不会被无脑抬高，碰巧命中一个怪词也压不住正常句子。 */
  let sentCache = null;
  function sentIndex(index) {
    if (!index || !index.docs) return null;
    if (sentCache && sentCache.src === index) return sentCache;
    const docs = [], df = {};
    let total = 0, cnt = 0;
    index.docs.forEach(function (d) {
      const sents = [];
      sentences(d.text).forEach(function (s, i) {
        const tk = tokens(s);
        if (!tk.length) return;
        const tf = {};
        tk.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
        Object.keys(tf).forEach(function (t) { df[t] = (df[t] || 0) + 1; });
        total += tk.length; cnt++;
        sents.push({ s: s, i: i, tf: tf, len: tk.length });
      });
      docs.push({ pageId: d.id, title: d.label, blocks: d.blocks || [], sents: sents });
    });
    const idf = {};
    Object.keys(df).forEach(function (t) { idf[t] = Math.log(1 + (cnt - df[t] + 0.5) / (df[t] + 0.5)); });
    sentCache = { src: index, docs: docs, idf: idf, avgdl: (total / Math.max(cnt, 1)) || 1, n: cnt };
    return sentCache;
  }
  function warm(index) { return !!sentIndex(index); }        /* 空闲预热：打开页面就先算好 */
  function bm25(se, qTerms, si) {
    const k1 = 1.2, b = 0.75;
    let sc = 0, hitN = 0;
    qTerms.forEach(function (t) {
      const f = si.tf[t];
      if (!f) return;
      hitN++;
      sc += (se.idf[t] || 0) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * si.len / se.avgdl));
    });
    return { sc: sc, hitN: hitN };
  }
  /* 句子级打分（BM25）：按页/序号命中，供"按页聚合成一段回答"用 */
  function rankSent(index, q, limit) {
    const se = sentIndex(index);
    const qt = tokens(q);
    if (!se || !qt.length) return [];
    const qset = {};
    qt.forEach(function (t) { qset[t] = 1; });
    const qUniq = Object.keys(qset);
    const out = [];
    se.docs.forEach(function (d) {
      const labHas = {};
      tokens(d.title).forEach(function (t) { labHas[t] = 1; });
      const labHit = qUniq.filter(function (t) { return labHas[t]; }).length;
      const labelBoost = 1 + 0.35 * (labHit / qUniq.length);
      d.sents.forEach(function (si) {
        const r = bm25(se, qUniq, si);
        if (!r.hitN) return;
        const bonus = 1 + (si.i === 0 ? 0.12 : 0) + (/\d/.test(si.s) ? 0.06 : 0) + (/[a-zA-Z]{3,}/.test(si.s) ? 0.04 : 0);
        out.push({
          s: si.s, i: si.i, pageId: d.pageId, title: d.title,
          cover: r.hitN / qUniq.length,
          score: Math.round(r.sc * labelBoost * bonus * 100) / 100
        });
      });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, limit || 40);
  }

  /* 表格里"对得上的那一行"（表头 + 该行）—— 比只丢一句原话更贴近人找资料的方式 */
  function tableHits(pages, q, limit) {
    const qt = tokens(q);
    const qset = {};
    qt.forEach(function (t) { qset[t] = 1; });
    const uniq = Object.keys(qset);
    if (!uniq.length) return [];
    const out = [];
    (pages || []).forEach(function (p) {
      if (!p || !p.blocks) return;
      p.blocks.forEach(function (b) {
        if (!b || b.type !== 'table' || !b.rows) return;
        const head = (b.headers || []).map(function (h) { return plain(h); });
        b.rows.forEach(function (row) {
          const cells = (row || []).map(function (c) { return plain(c); });
          const line = cells.join(' | ');
          const hay = tokens(line + ' ' + plain(b.title || ''));
          if (!hay.length) return;
          let hit = 0;
          uniq.forEach(function (t) { if (hay.indexOf(t) >= 0) hit++; });
          if (hit < Math.max(1, Math.ceil(uniq.length * 0.5))) return;
          out.push({ pageId: p.id, title: plain(p.label || p.id), table: plain(b.title || '表格'), head: head, line: line, raw: cells.join(' '), hit: hit });
        });
      });
    });
    out.sort(function (a, b) { return b.hit - a.hit; });
    return out.slice(0, limit || 2);
  }
  /* 方法/步骤题：页里本来就有清单块 → 直接按它的条目列步骤（结构来自原文，不是猜的） */
  function listSteps(index, q, limit) {
    const se = sentIndex(index);
    const qset = {};
    tokens(q).forEach(function (t) { qset[t] = 1; });
    const uniq = Object.keys(qset);
    if (!se || !uniq.length) return [];
    const out = [];
    se.docs.forEach(function (d) {
      (d.blocks || []).forEach(function (b) {
        if (!b || b.type !== 'list' || !Array.isArray(b.items) || b.items.length < 2) return;
        const items = b.items.map(function (it) {
          return plain(typeof it === 'string' ? it : (it && (it.text || it.label)) || '');
        }).filter(Boolean);
        if (!items.length) return;
        const hay = tokens(plain(b.title || '') + ' ' + items.join(' '));
        let hit = 0;
        uniq.forEach(function (t) { if (hay.indexOf(t) >= 0) hit++; });
        if (!hit) return;
        out.push({ pageId: d.pageId, title: d.title, list: plain(b.title || '步骤'), items: items, hit: hit });
      });
    });
    out.sort(function (a, b) { return b.hit - a.hit; });
    return out.slice(0, limit || 1);
  }
  /* 追问时补一句上下文：「它 / 这个 / 上面」这类指代，把上一问的词一起拿去检索（不生成新内容） */
  function expandQuery(q, prev) {
    const s = plain(q);
    if (!prev || !/(它|它们|这个|那个|该|其|上面|刚才|前面|这些|那些)/.test(s)) return q;
    return plain(prev) + ' ' + s;
  }
  /* 对比题：A、B 各取最贴切的一句，做"原文对照" */
  function compareAnswer(index, q) {
    const pair = qPair(q);
    if (!pair) return null;
    const A = rankSent(index, pair[0], 8).filter(function (x) { return x.cover >= 0.5; });
    const B = rankSent(index, pair[1], 8).filter(function (x) { return x.cover >= 0.5; });
    if (!A.length || !B.length) return null;
    const a = A[0], b = B[0];
    const tail = (a.pageId === b.pageId)
      ? '（两句都在《' + a.title + '》里，可以直接对着看）'
      : '（分别出自《' + a.title + '》和《' + b.title + '》）';
    return {
      answer: '①【' + pair[0] + '】' + a.s + '\n②【' + pair[1] + '】' + b.s + '\n③ 差别就看这两句：' + tail,
      pageId: a.pageId, title: a.title, score: Math.round((a.score + b.score) / 2 * 100) / 100, kind: '对比',
      used: [
        { pageId: a.pageId, title: a.title, text: a.s },
        { pageId: b.pageId, title: b.title, text: b.s }
      ]
    };
  }
  /* ★ 修复113：伪相关反馈（PRF）—— 第一轮排得最好的几句里，挑"站内高频信息词"补进查询再排一次。
     只动"排哪些原句/排多前"，一个字都不生成；补进去的词必须是索引里真实存在的词。 */
  function prfExpand(index, q, ranked) {
    if (!index || !ranked || !ranked.length) return q;
    if ((ranked[0].score || 0) < 1.5) return q;      /* 第一轮就没把握 → 不扩展，免得越扩越偏 */
    const qset = {};
    tokens(q).forEach(function (t) { qset[t] = 1; });
    const cand = [], seen = {};
    ranked.slice(0, 3).forEach(function (r) {
      tokens(r.s).forEach(function (t) {
        if (qset[t] || seen[t] || t.length < 2) return;
        seen[t] = 1;
        const w = index.idf[t] || 0;
        if (w >= 1.6) cand.push({ t: t, w: w });
      });
    });
    cand.sort(function (a, b) { return b.w - a.w; });
    const extra = [], used = {};
    cand.forEach(function (x) { if (!used[x.t] && extra.length < 4) { used[x.t] = 1; extra.push(x.t); } });
    return extra.length ? q + ' ' + extra.join(' ') : q;
  }
  /* ★ 修复113：跨页近似重复只留一条（同一句话写了两遍，不该刷屏占掉三个名额） */
  function dedupeSent(ranked) {
    const out = [], sig = {};
    (ranked || []).forEach(function (x) {
      const s = tokens(x.s).sort().join('');
      if (sig[s]) return;
      sig[s] = 1;
      out.push(x);
    });
    return out;
  }
  /* ★ 本地问答主入口：类型判断 → 对比/表格 → 按页聚合成"有结构的回答" */
  function askSmart(index, q, k) {
    const want = k || 3;
    const kind = qKind(q);
    const res = [];
    if (kind === '对比') {
      const c = compareAnswer(index, q);
      if (c) res.push(c);
    }
    /* ★ 修复111：问"怎么做"且页里本来就有清单 → 按它自己的条目列步骤（不自己编步骤） */
    if (kind === '方法') {
      listSteps(index, q, 1).forEach(function (r) {
        res.push({
          answer: '按《' + r.title + '》里的步骤（原文条目，共 ' + r.items.length + ' 条）：\n'
            + r.items.map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n'),
          pageId: r.pageId, title: r.title, score: 9 + r.hit, kind: '步骤',
          used: r.items.map(function (t) { return { pageId: r.pageId, title: r.title, text: t }; })
        });
      });
    }
    tableHits(index.docs, q, 2).forEach(function (r) {
      res.push({
        answer: '📊 表格《' + r.table + '》里有一行对得上：\n'
          + (r.head.length ? r.head.join(' | ') + '\n' : '') + r.line,
        pageId: r.pageId, title: r.title, score: 8 + r.hit, kind: '表格',
        /* ★ 修复114：引用用网页里的真实拼法（空格分隔），不是给人看的 " | " 版 */
        used: [{ pageId: r.pageId, title: r.title, text: r.raw || r.line }]
      });
    });
    let ranked = rankSent(index, q, 30).filter(function (x) { return x.cover >= 0.3; });
    /* ★ 修复113：PRF 二次打分 —— 只用「已经命中的原句」里的词加重权重，候选集一个字都不变 */
    const q2 = prfExpand(index, q, ranked);
    if (q2 !== q && ranked.length) {
      const bonus = {};
      rankSent(index, q2, 80).forEach(function (x) { bonus[x.pageId + '|' + x.s] = x.score; });
      ranked = ranked.map(function (x) {
        const b = bonus[x.pageId + '|' + x.s] || 0;
        return {
          s: x.s, i: x.i, pageId: x.pageId, title: x.title, cover: x.cover,
          score: Math.round((x.score + 0.35 * b) * 100) / 100
        };
      }).sort(function (a, b) { return b.score - a.score; });
    }
    ranked = dedupeSent(ranked);
    /* ★ 修复112：语言模型只做「重排」（±15% 微调），出字仍然 100% 是原文子串 */
    if (W.LMLM && W.LMLM.ready && W.LMLM.ready()) ranked = W.LMLM.rerank(ranked);
    const byPage = {};
    ranked.forEach(function (x) {
      if (!byPage[x.pageId]) byPage[x.pageId] = [];
      if (byPage[x.pageId].length < 3) byPage[x.pageId].push(x);
    });
    const order = Object.keys(byPage).sort(function (a, b) { return byPage[b][0].score - byPage[a][0].score; });
    const room = Math.max(1, want - res.length);
    order.slice(0, room).forEach(function (pid) {
      if (res.some(function (r) { return r.pageId === pid; })) return;   /* 这页已经给过对比/表格答案 */
      const list = byPage[pid];
      /* ★ 修复111：问「为什么」时，含因果连词的原句排前面（只调顺序，不改内容） */
      if (kind === '原因') {
        const cause = /(因为|由于|导致|带来|所以|因此|从而)/;
        list.sort(function (a, b) {
          return (cause.test(b.s) ? 1 : 0) - (cause.test(a.s) ? 1 : 0) || (b.score - a.score);
        });
      }
      const d = list[0];
      const pts = list.map(function (x) { return '· ' + x.s; }).join('\n');
      res.push({
        answer: headLead(kind, d.title) + '\n' + pts,
        pageId: pid, title: d.title, score: Math.round(d.score * 100) / 100, kind: kind,
        used: list.map(function (x) { return { pageId: pid, title: d.title, text: x.s }; })
      });
    });
    return res.slice(0, want);
  }

  /* ★ 修复112：语言模型懒加载 —— 只在第一次打开面板时拉 data/lm.json（约 10KB）；
     拉不到就当没有：纯 BM25 + 模板照常工作，一丁点功能都不少 */
  let lmTried = false;
  function ensureLM() {
    if (lmTried) return;
    lmTried = true;
    try {
      if (!W.LMLM || typeof W.LMLM.load !== 'function') return;
      const p = W.LMLM.load('data/lm.json');
      /* ★ 修复115：加载失败（断网/文件 404）允许下次再试，以前一次失败就永久放弃 */
      if (p && typeof p.then === 'function') p.then(function (ok) { if (!ok) lmTried = false; }, function () { lmTried = false; });
    } catch (e) { lmTried = false; }
  }
  /* ★ 修复117：把「引文里对上你问题的字」标出来 —— 只做高亮，不改一个字（可核对性↑） */
  function hiText(raw, q) {
    const body = String(raw == null ? '' : raw);
    const terms = tokens(q || '').filter(function (t) { return t.length >= 2; })
      .map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    if (!terms.length) return esc(body);
    terms.sort(function (a, b) { return b.length - a.length; });
    const re = new RegExp('(' + terms.slice(0, 8).join('|') + ')', 'gi');
    return body.split(re).map(function (seg, i) {
      return (i % 2) ? '<mark class="lm-ai-hit">' + esc(seg) + '</mark>' : esc(seg);
    }).join('');
  }
  /* ---------- ⑨ 界面：右下角「✨ 智能提炼」浮标 + 面板 ---------- */
  let panel = null, fab = null, idx = null, idxSrc = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function content() {
    try { return (window.LMApp && LMApp.state && LMApp.state.content) || null; } catch (e) { return null; }
  }
  function curId() {
    const m = (String(location.hash || '')).match(/#\/p\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : 'home';
  }
  function indexNow() {
    const c = content();
    if (!c || !c.pages || !c.pages.length) return null;
    if (idx && idxSrc === c.pages) return idx;       /* 内容没变就复用索引 */
    idxSrc = c.pages;
    idx = buildIndex(c.pages);
    return idx;
  }
  /* ---------- ⑨.1 ★ 修复107：和 DeepSeek 对话（**不用 API**） ----------
     明确结论：本站**不接 API、不存任何 Key**。原因不是保守 —— 静态网页里没有秘密，
     任何写进前端的 Key 都等于公开（view-source 就能看到），而且你也不想要按量计费的 API。
     所以走的是「一键接力」：
       ① 发送：把**当前页的结构化正文**（pageDigest：标题层级 / 表格逐行 / 图表数据 / 来源附件）
          + 你的问题拼成一条消息，整条复制到剪贴板，并打开 chat.deepseek.com；
       ② 你在 DeepSeek 输入框按一次 Ctrl/⌘+V 就发出去（网页正文已经"附在前面"）；
       ③ 回来后点「把 DeepSeek 的回答粘回来」，回答就存进这个对话框（按页保存在本机 localStorage），
          下次打开还在 —— 看起来就是"在这里和 DeepSeek 聊天"。
     为什么不能真把官网的回答拉进页面：chat.deepseek.com 有 X-Frame-Options/CSP 禁止被 iframe 嵌；
     跨域也拿不到别的标签页的输入框与回答（同源策略）；不接 API 就没有合法的机器可读通道。 */
  const CHAT_KEY = 'lm_ai_chat_v1';
  function chatAll() {
    try {
      const j = JSON.parse(localStorage.getItem(CHAT_KEY) || '{}');
      return (j && typeof j === 'object') ? j : {};
    } catch (e) { return {}; }
  }
  function chatOf(id) {
    const a = chatAll()[id];
    return Array.isArray(a) ? a : [];
  }
  function chatPush(id, msg) {
    if (!id || !msg) return;
    const all = chatAll();
    const arr = Array.isArray(all[id]) ? all[id] : [];
    const rec = { r: msg.r || 'me', t: String(msg.t || '').slice(0, 4000), ts: Date.now(), src: msg.src || null };
    if (msg.q) rec.q = String(msg.q).slice(0, 120);   /* ★ 修复117：记下这一问，供出处高亮用 */
    /* ★ 修复115：以前这里只存 {r,t,ts,src}，把 cite 悄悄丢了 → 「📄 原文出处」存不进对话、重绘就消失。
       现在把出处一起存（≤4 条 / 每条 ≤200 字），并做长度裁剪防膨胀。 */
    if (Array.isArray(msg.cite) && msg.cite.length) {
      rec.cite = msg.cite.slice(0, 4).map(function (c) {
        return {
          pageId: String(c.pageId || ''),
          title: String(c.title || '').slice(0, 60),
          text: String(c.text || '').slice(0, 200)
        };
      }).filter(function (c) { return c.pageId && c.text; });
      if (!rec.cite.length) delete rec.cite;
    }
    arr.push(rec);
    all[id] = arr.slice(-12);                       /* 每页最多留 12 条，防 localStorage 膨胀 */
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(all)); } catch (e) { /* 隐私模式：只在本页内存生效 */ }
  }
  function chatClear(id) {
    const all = chatAll();
    delete all[id];
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(all)); } catch (e) { /* noop */ }
  }
  /* ---------- ⑨.2 ★ 修复108：可选的「浏览器扩展」桥 ----------
     装仓里的 ext/ 扩展后：问题经扩展送进 chat.deepseek.com，DeepSeek 的回答再**自动**回到
     这个对话框 —— 这就是"全自动"，但**必须装一次扩展**（网页本身读不到别的标签页，同源策略）。
     没装扩展：bridgeSeen 一直是 false → 走原来的「复制 + 打开网页 + 粘回」，功能不受影响。 */
  const BRIDGE_TAG = 'lm-ds-bridge';
  let bridgeSeen = false;
  let pendingAsk = null;            /* 等扩展回执的那一次提问（扩展不可用时用来退回复制） */
  /* ★ 修复118：扩展接下了问题、但回答一直不回来（DeepSeek 标签页被关 / 掉登录 / 卡在人机验证）时，
     以前 pendingAsk 会一直挂着、面板停在「⏳ 已交给 DeepSeek」，用户只能干等。现在 4 分钟没回音就明确告知。 */
  let askTimer = null;
  function clearAskTimer() { if (askTimer) { clearTimeout(askTimer); askTimer = null; } }
  function armAskTimer(id) {
    clearAskTimer();
    askTimer = setTimeout(function () {
      askTimer = null;
      if (!pendingAsk) return;
      const pa = pendingAsk;
      pendingAsk = null;
      chatPush(pa.id || id, { r: 'ds', t: '⚠️ 等了 4 分钟没等到回答：多半是 DeepSeek 那个标签页被关了、掉登录，或者卡在人机验证。\n可以先用 ⚡本站速答，或去那个标签页处理完再问一次。' });
      if (panel && !panel.hidden) renderPanel();
    }, 240000);
  }
  /* ★ 修复110：问答模式 —— 默认「本站速答」（免配置），DeepSeek 作为可切换的备选 */
  const MODE_KEY = 'lm_ai_mode_v1';
  function aiMode() {
    try { return localStorage.getItem(MODE_KEY) === 'ds' ? 'ds' : 'local'; } catch (e) { return 'local'; }
  }
  function setAiMode(m) {
    try { localStorage.setItem(MODE_KEY, m === 'ds' ? 'ds' : 'local'); } catch (e) { /* 无痕模式存不了就算了 */ }
  }
  function bridgeSend(txt, id) {
    try {
      window.postMessage({ ch: 'lm-page', type: 'ask', text: txt, pageId: id }, location.origin);
      return true;
    } catch (e) { return false; }
  }
  function listenBridge() {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    if (listenBridge.done) return;
    listenBridge.done = true;
    window.addEventListener('message', function (e) {
      const d = e && e.data;
      if (!d || d.ch !== BRIDGE_TAG) return;
      if (d.type === 'hello') {
        bridgeSeen = true;
        if (panel && !panel.hidden) renderPanel();
        return;
      }
      if (d.type === 'ack') {
        bridgeSeen = true;
        /* ★ 修复109：扩展装了、但 DeepSeek 标签页没开（或没登录）→ 自动退回「复制 + 打开」
           （以前这里只是把提示留在那儿，用户会以为卡住了） */
        if (d.ok === false && pendingAsk) {
          const pa = pendingAsk;
          pendingAsk = null;
          clearAskTimer();          /* ★ 修复118：已经退回复制流程，别让超时计时器再插一条「等了 4 分钟」 */
          copyText(pa.txt).then(function () {
            try { window.open('https://chat.deepseek.com/', '_blank', 'noopener'); } catch (e) { /* noop */ }
            chatPush(pa.id, { r: 'ds', t: '扩展在，但没找到已登录的 DeepSeek 标签页 —— 已自动退回「复制 + 打开」：在输入框按 Ctrl/⌘+V 就能发。\n（让扩展全自动：先开一个 chat.deepseek.com 标签页并保持登录。）' });
            if (panel && !panel.hidden) renderPanel();
          }, function () {
            chatPush(pa.id, { r: 'ds', t: '既没找到 DeepSeek 标签页，剪贴板也被浏览器拦了。请先打开 chat.deepseek.com 登录，再回来说一声。' });
            if (panel && !panel.hidden) renderPanel();
          });
        } else if (panel && !panel.hidden) renderPanel();
        return;
      }
      if (d.type === 'reply') {
        /* ★ 修复118：回答必须回到「提问的那一页」。以前一律 chatPush(curId()) —— DeepSeek 要想几十秒，
           用户在等待期间翻到别页，答案就落到那一页的对话框里，原页面永远空着、他还以为没回。
           顺带：以前 reply 带空文本时 pendingAsk 不会清，后面任何一次 ack 失败都会误触发「退回复制」。 */
        const pa = pendingAsk;
        const toId = (pa && pa.id) || curId();
        pendingAsk = null;
        clearAskTimer();
        chatPush(toId, {
          r: 'ds',
          t: d.text ? d.text : '（扩展回了一个空回答 —— DeepSeek 那边可能没渲染完，再问一次试试。）'
        });
        if (panel && !panel.hidden) renderPanel();
        else if (window.LMApp && LMApp.toast) {
          LMApp.toast(toId === curId() ? '✅ DeepSeek 的回答已回到对话框' : '✅ DeepSeek 的回答已回到你提问的那一页');
        }
      }
    });
    try { window.postMessage({ ch: 'lm-page', type: 'ping' }, location.origin); } catch (e) { /* noop */ }
  }
  function pageById(id) {
    const c = content();
    if (!c || !Array.isArray(c.pages)) return null;
    return c.pages.filter(function (p) { return p && p.id === id; })[0] || null;
  }
  /* 页面 → 结构化正文（标题层级 / 表格逐行 / 图表数据 / 来源与附件），给大模型当上下文 */
  function pageDigest(p) {
    if (!p) return '';
    const out = ['# ' + plain(p.label || p.id || '')];
    (p.blocks || []).forEach(function (b) {
      if (!b) return;
      if (b.type === 'heading') { const t = plain(b.text || b.title || ''); if (t) out.push('## ' + t); return; }
      if (b.type === 'table') {
        if (b.title) out.push('### ' + plain(b.title));
        const head = (b.headers || []).map(function (h) { return plain(h); }).join(' | ');
        if (head) out.push(head);
        (b.rows || []).forEach(function (r) { out.push((r || []).map(function (c) { return plain(c); }).join(' | ')); });
        return;
      }
      if (b.type === 'chart') {
        out.push('### ' + plain(b.title || '图表'));
        out.push((b.labels || []).map(function (l, i) {
          return plain(l) + '：' + ((b.data || [])[i] == null ? '' : (b.data || [])[i]) + (b.unit || '');
        }).join('；'));
        return;
      }
      if (b.type === 'sources' || b.type === 'files' || b.type === 'attach') {
        if (b.title) out.push('### ' + plain(b.title));
        (b.items || []).forEach(function (it) { out.push('- ' + plain(it && (it.name || it.label || it.title || it.url || ''))); });
        return;
      }
      const t = blockText(b);
      if (t) out.push((b.title ? plain(b.title) + '：' : '') + t);
    });
    return out.filter(Boolean).join('\n');
  }
  function promptFor(p, q) {
    return '你是“活地图”学习站点的助教。下面是当前页面《' + plain((p && (p.label || p.id)) || '')
      + '》的正文，由站点自动提取（图表只有数据、没有图形）。\n'
      + '请只依据这些内容回答，不要编造页面里没有的结论；内容不够就直接说缺什么。\n\n'
      + '【页面内容】\n' + pageDigest(p) + '\n\n【我的问题】\n'
      + (q || '请用 3-5 条要点总结这一页在讲什么，并指出它和相邻主题的关系。');
  }
  function copyText(t) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    } catch (e) { /* 落回下面的兜底 */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok ? Promise.resolve() : Promise.reject(new Error('copy-fail'));
    } catch (e2) { return Promise.reject(e2); }
  }
  /* ★ 修复107：这里原本有一个「带 Key 直连官方接口」的函数 —— 已按要求**整块删除**。
     现在本站**没有任何 API 调用、不读写任何 Key**，`test_yjs` 断言「ai.js 全文 0 处 fetch」。 */

  function renderPanel() {
    if (!panel) return;
    const body = panel.querySelector('.lm-ai-body');
    ensureLM();                 /* ★ 修复112：面板一开就懒加载小模型（非阻塞） */
    if (!body) return;
    const badge = panel.querySelector('.lm-ai-badge');
    if (badge) badge.textContent = bridgeSeen ? '已装扩展 · 全自动' : '不用 API · 不存 Key';
    const ix = indexNow();
    if (!ix) { body.innerHTML = '<p class="lm-ai-tip">内容还在加载，稍等一下下…</p>'; return; }
    const id = curId();
    const pts = summarize(ix, id, 3);
    const kws = keywords(ix, id, 8);
    const rel = related(ix, id, 3);
    const title = ix.docs.filter(function (d) { return d.id === id; }).map(function (d) { return d.label; })[0] || id;
    /* ① 对话框**放最上面**（用户明确要求：不要让"相关条目 / 生态地图 / 更新记录"这些模块压在上面） */
    const msgs = chatOf(id);
    let h = '<div class="lm-ai-chat" role="log" aria-label="与 DeepSeek 的对话">';
    h += msgs.length
      ? msgs.map(function (m) {
        const cls = m.r === 'me' ? 'me' : (m.r === 'local' ? 'local' : 'ds');
        const who = m.r === 'me' ? '我' : (m.r === 'local' ? '本站速答' : 'DeepSeek');
        const src = (m.src && m.src.pageId)
          ? '<a class="lm-ai-src" href="#/p/' + encodeURIComponent(m.src.pageId) + '">出自《' + esc(m.src.title || '') + '》· 相关度 ' + m.src.score + '</a>'
          : '';
        /* ★ 修复114：答案下面挂「📄 原文出处」——逐字引用 + 该页链接（可折叠，不挡视线） */
        const cite = (m.cite && m.cite.length)
          ? '<details class="lm-ai-cite"><summary>📄 原文出处（' + m.cite.length + ' 条）</summary>'
            + m.cite.map(function (c) {
              const body = String(c.text || '');
              return '<div class="lm-ai-quote">'
                + '<a class="lm-ai-src" href="#/p/' + encodeURIComponent(c.pageId) + '">《' + esc(c.title || c.pageId) + '》</a>'
                + '<p>' + hiText(body.length > 200 ? body.slice(0, 200) + '…' : body, m.q) + '</p></div>';
            }).join('')
            + '</details>'
          : '';
        return '<div class="lm-ai-msg ' + cls + '"><span class="lm-ai-who">' + who + '</span><p>'
          + esc(m.t).replace(/\n/g, '<br>') + '</p>' + src + cite + '</div>';
      }).join('')
      : '<p class="lm-ai-tip">还没有对话。先在下面选一种模式，写个问题按回车：\n<b>⚡ 本站速答</b>＝只在站里找、自己组织成一段话（免配置）；<b>🐋 DeepSeek</b>＝把这页正文附上交给网页版（更全面，但要装扩展或手动粘贴）。</p>';
    h += '</div>';
    const mode = aiMode();
    /* ★ 修复110：聊天框上方一个切换键 —— 默认「本站速答」 */
    h += '<div class="lm-ai-modes" role="tablist" aria-label="问答模式">'
      + '<button type="button" class="lm-ai-mode' + (mode === 'local' ? ' on' : '') + '" data-mode="local" role="tab" aria-selected="' + (mode === 'local') + '">'
      + '⚡ 本站速答<em>免配置 · 只用站里写过的内容</em></button>'
      + '<button type="button" class="lm-ai-mode' + (mode === 'ds' ? ' on' : '') + '" data-mode="ds" role="tab" aria-selected="' + (mode === 'ds') + '">'
      + '🐋 DeepSeek<em>更全面 · 需装扩展或手动粘贴</em></button>'
      + '</div>';
    h += '<div class="lm-ai-ask"><input class="lm-ai-input" type="search" placeholder="'
      + (mode === 'local' ? '问点什么…（回车即可，只用本站内容）' : '问点什么…（会自动附上本页正文）')
      + '" aria-label="提问">'
      + '<button class="btn btn-primary lm-ai-go" type="button">' + (mode === 'local' ? '问一句' : '发给 DeepSeek') + '</button></div>'
      + '<div class="lm-ai-row">'
      + '<button class="btn lm-ai-paste" type="button" title="在 DeepSeek 网页里选中回答复制，粘回这里保存进对话">📥 粘回回答</button>'
      + '<button class="btn lm-ai-clear" type="button" title="清空这一页的对话">🗑 清空</button>'
      + '</div>'
      + '<div class="lm-ai-pastebox" hidden><textarea class="lm-ai-pasteta" placeholder="把 DeepSeek 的回答粘到这里（Ctrl/⌘+V），再点「保存到对话」"></textarea>'
      + '<button class="btn lm-ai-pastesave" type="button">保存到对话</button></div>'
      + '<div class="lm-ai-ans"></div>';
    /* ② 其余的辅助卡片放在对话框**下面** */
    h += '<div class="lm-ai-cur">正在看：<b>' + esc(title) + '</b></div>';
    h += '<h4 class="lm-ai-h">📌 这一页的要点</h4>';
    h += pts.length
      ? '<ol class="lm-ai-list">' + pts.map(function (s) {
        const t = s.length > 120 ? s.slice(0, 120) + '…' : s;
        return '<li>' + esc(t) + '</li>';
      }).join('') + '</ol>'
      : '<p class="lm-ai-tip">这一页文字还少，写点内容再来看要点。</p>';
    h += '<h4 class="lm-ai-h">🔑 关键词</h4>';
    h += kws.length
      ? '<div class="lm-ai-kw">' + kws.map(function (k) { return '<span class="lm-ai-chip">' + esc(k) + '</span>'; }).join('') + '</div>'
      : '<p class="lm-ai-tip">—</p>';
    h += '<h4 class="lm-ai-h">🔗 相关条目</h4>';
    h += rel.length
      ? '<div class="lm-ai-rel">' + rel.map(function (r) {
        return '<a href="#/p/' + encodeURIComponent(r.id) + '">' + esc(r.label)
          + '<span class="lm-ai-score">' + Math.round(r.score * 100) + '%</span></a>';
      }).join('') + '</div>'
      : '<p class="lm-ai-tip">—</p>';
    /* ★ 修复116：重绘前保存「输入内容 / 焦点 / 已展开的出处 / 提示文字 / 粘贴框 / 滚动位置」，绘完恢复。
       以前每次切模式、提问、换页，输入框内容和光标都会丢（因为这里是 innerHTML 全量重建）。 */
    const keepInput = body.querySelector('.lm-ai-input');
    const keep = {
      val: keepInput ? String(keepInput.value || '') : '',
      focus: keepInput && document.activeElement === keepInput,
      sel: (keepInput && typeof keepInput.selectionStart === 'number') ? keepInput.selectionStart : 0,
      open: [],
      ans: (function () { const a = body.querySelector('.lm-ai-ans'); return a ? a.innerHTML : ''; })(),
      paste: !!body.querySelector('.lm-ai-pastebox:not([hidden])'),
      scroll: panel.scrollTop || 0
    };
    body.querySelectorAll('details.lm-ai-cite').forEach(function (d, i) { keep.open[i] = !!d.open; });
    body.innerHTML = h;
    const input = body.querySelector('.lm-ai-input');
    const go = body.querySelector('.lm-ai-go');
    const ans = body.querySelector('.lm-ai-ans');
    const chatEl = body.querySelector('.lm-ai-chat');
    if (input && keep.val) input.value = keep.val;
    if (ans && keep.ans) ans.innerHTML = keep.ans;
    if (keep.paste) { const pb0 = body.querySelector('.lm-ai-pastebox'); if (pb0) pb0.hidden = false; }
    body.querySelectorAll('details.lm-ai-cite').forEach(function (d, i) { if (keep.open[i]) d.open = true; });
    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
    if (input && keep.focus) {
      try { input.focus({ preventScroll: true }); input.setSelectionRange(keep.sel, keep.sel); } catch (e) { /* 忽略 */ }
    }
    panel.scrollTop = keep.scroll;
    /* ★ 修复110：本地问答（默认模式）—— 判断问法 → 组织成一段回答；仍然只用原文，不编造 */
    const runLocal = function (q) {
      /* ★ 修复111：追问（「它 / 这个 / 上面」）→ 把上一问的词一起拿去检索，免得答非所问 */
      const prevAsk = chatOf(id).filter(function (m) { return m.r === 'me'; });
      const prev = prevAsk.length ? prevAsk[prevAsk.length - 1].t : '';
      /* ★ 修复112：站内词表里没有的英文词 → 先按词表纠错（中文一律不碰），再带上追问上下文 */
      let qq = q;
      if (W.LMLM && W.LMLM.ready && W.LMLM.ready()) {
        const vocab = Object.keys(ix.idf).filter(function (t) { return /^[a-z][a-z0-9+#._-]*$/.test(t); });
        qq = W.LMLM.fixQuery(q, vocab);
      }
      const res = askSmart(ix, expandQuery(qq, prev), 3);
      if (input) input.value = '';        /* ★ 修复116：发出去就清空（重绘会保留输入内容，所以要主动清） */
      chatPush(id, { r: 'me', t: q });
      if (qq !== q) {
        chatPush(id, { r: 'local', t: '（「' + q + '」里有站内没有的词，已按词表当成「' + qq + '」来查）' });
      }
      if (!res.length) {
        chatPush(id, { r: 'local', t: '本站没写过相关内容。换个说法再试；想让它用通用知识回答，把上面的模式切到 🐋 DeepSeek。' });
      } else {
        res.forEach(function (r) {
          chatPush(id, {
            r: 'local', t: r.answer,
            src: { pageId: r.pageId, title: r.title, score: r.score },
            q: qq,                     /* ★ 修复117：出处里的命中词高亮要用原始提问的关键词 */
            /* ★ 修复114：把"这句答案是从哪段原文来的"一起存进对话（限 4 条、每条 200 字，免得占满 storage） */
            cite: (r.used || []).slice(0, 4).map(function (c) {
              const t = String(c.text || '');
              return { pageId: c.pageId, title: c.title, text: t.length > 200 ? t.slice(0, 200) : t };
            })
          });
        });
        /* ★ 诚实护栏：只找到一条就明说"可能没完全对上"，不假装很懂 */
        if (res.length === 1) {
          chatPush(id, { r: 'local', t: '⚠️ 站里跟这个问题直接相关的只有上面这一条（可能没完全对上你的问法）。要更完整的解释，把模式切到 🐋 DeepSeek。' });
        }
      }
      renderPanel();
    };
    /* 发送：按模式分流（默认「本站速答」；DeepSeek 是备选） */
    const send = function () {
      const q = String((input && input.value) || '').trim();
      if (!q) { ans.innerHTML = '<p class="lm-ai-tip">先写个问题，比如「Transformer 和 RNN 有什么区别」。</p>'; return; }
      if (aiMode() === 'local') { runLocal(q); return; }
      const txt = promptFor(pageById(id), q);
      if (input) input.value = '';        /* ★ 修复116：发出去就清空（配合重绘时的状态保留，不会把你打了一半的字留下） */
      chatPush(id, { r: 'me', t: q });
      /* 装了扩展 → 全自动：送过去、等回答自己回来（不用复制/粘贴） */
      if (bridgeSeen && bridgeSend(txt, id)) {
        pendingAsk = { id: id, txt: txt };     /* 存着：扩展没接住就自动退回复制 */
        armAskTimer(id);                       /* ★ 修复118：扩展接了却一直不回，4 分钟后明说，不让用户干等 */
        chatPush(id, { r: 'ds', t: '⏳ 已交给 DeepSeek（浏览器扩展在接管）—— 它会在标签页里自己发出去，回答好了**自动**回到这里，你不用复制粘贴。' });
        renderPanel();
        return;
      }
      const okHint = function () {
        chatPush(id, {
          r: 'ds',
          t: '✅ 已复制「这一页正文 + 你的问题」（约 ' + txt.length + ' 字），DeepSeek 网页在新标签打开了。\n① 在它的输入框按 Ctrl/⌘+V 粘贴并发送；\n② 回来点「📥 粘回回答」，把它的回答存进这个对话。'
        });
        renderPanel();
      };
      copyText(txt).then(function () {
        try { window.open('https://chat.deepseek.com/', '_blank', 'noopener'); } catch (e) { /* 弹窗被拦也留提示 */ }
        okHint();
      }, function () {
        chatPush(id, { r: 'ds', t: '浏览器拦了剪贴板：下面是完整的消息，手动全选复制后粘到 DeepSeek。\n\n' + txt });
        renderPanel();
      });
    };
    if (go) go.addEventListener('click', send);
    if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    /* ★ 修复110：模式切换键（点了就记住，下次打开还是这个模式） */
    body.querySelectorAll('.lm-ai-mode').forEach(function (b) {
      b.addEventListener('click', function () {
        const m = b.getAttribute('data-mode');
        if (m === aiMode()) return;
        setAiMode(m);
        renderPanel();
        if (m === 'ds' && !bridgeSeen && ans) {
          ans.innerHTML = '<p class="lm-ai-tip">DeepSeek 模式：装了扩展就全自动；没装也没关系 —— 点「发给 DeepSeek」会自动复制，你去网页按 Ctrl/⌘+V 发送，回来「📥 粘回回答」。</p>';
        }
      });
    });
    /* 📥 把 DeepSeek 的回答粘回来，存进这个对话 */
    const pb = body.querySelector('.lm-ai-pastebox');
    const pta = body.querySelector('.lm-ai-pasteta');
    const pasteBtn = body.querySelector('.lm-ai-paste');
    if (pasteBtn) pasteBtn.addEventListener('click', function () {
      if (!pb) return;
      pb.hidden = !pb.hidden;
      if (!pb.hidden && pta) pta.focus();
    });
    const pasteSave = body.querySelector('.lm-ai-pastesave');
    if (pasteSave) pasteSave.addEventListener('click', function () {
      const t = String((pta && pta.value) || '').trim();
      if (!t) { if (pta) pta.focus(); return; }
      chatPush(id, { r: 'ds', t: t });
      renderPanel();
    });
    const clrBtn = body.querySelector('.lm-ai-clear');
    if (clrBtn) clrBtn.addEventListener('click', function () {
      chatClear(id);
      if (window.LMApp && LMApp.toast) LMApp.toast('已清空这一页的对话');
      renderPanel();
    });
  }
  function toggle(force) {
    if (!panel) return;
    const open = force === true ? true : (force === false ? false : panel.hidden);
    panel.hidden = !open;
    if (fab) fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) renderPanel();
  }
  function mount() {
    if (fab || typeof document === 'undefined') return;
    listenBridge();                 /* ★ 修复108：先挂上扩展桥（没装扩展就什么都不发生） */
    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'lm-ai-fab';
    fab.id = 'lmAiFab';
    fab.title = '和 DeepSeek 对话：自动把这一页正文附在问题前面（不接 API、不存 Key）· 另有要点 / 关键词 / 相关条目';
    fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML = '✨<span class="lm-ai-fab-t">问 DeepSeek</span>';
    fab.addEventListener('click', function () { toggle(); });
    document.body.appendChild(fab);

    panel = document.createElement('div');
    panel.className = 'lm-ai-panel';
    panel.id = 'lmAiPanel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '和 DeepSeek 对话');
    panel.innerHTML = '<div class="lm-ai-head"><b>💬 和 DeepSeek 对话</b>'
      + '<span class="lm-ai-badge">不用 API · 不存 Key</span>'
      + '<button type="button" class="lm-ai-x" aria-label="关闭">×</button></div>'
      + '<div class="lm-ai-body"></div>';
    document.body.appendChild(panel);
    /* ★ 修复116：手机上键盘弹出会把 fixed 面板顶出可视区，导致输入框被盖住。
       用 visualViewport 判断"键盘是否弹起"，弹起时给面板加 .lm-kb 收窄高度。 */
    if (typeof window !== 'undefined' && window.visualViewport) {
      const fitKb = function () {
        if (!panel) return;
        const vv = window.visualViewport;
        const opened = (window.innerHeight - vv.height) > 120;
        panel.classList.toggle('lm-kb', opened);
      };
      window.visualViewport.addEventListener('resize', fitKb);
      window.visualViewport.addEventListener('scroll', fitKb);
    }
    const x = panel.querySelector('.lm-ai-x');
    if (x) x.addEventListener('click', function () { toggle(false); });

    /* 内容就绪后自动出浮标（访客与管理员都能用；纯阅读辅助，不写内容） */
    let tries = 0;
    const wait = setInterval(function () {
      const ix0 = indexNow();
      if (ix0) {
        clearInterval(wait);
        warm(ix0);        /* ★ 修复111：页面一打开就把句子级索引算好（后台 0.4s 后），点「问一句」几乎瞬回 */
        fab.hidden = false;
        if (!panel.hidden) renderPanel();
      }
      else if (++tries > 40) { clearInterval(wait); fab.hidden = false; }
    }, 400);
    fab.hidden = false;
    window.addEventListener('hashchange', function () { if (panel && !panel.hidden) renderPanel(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel && !panel.hidden) toggle(false);
    });
  }

  return {
    plain: plain, blockText: blockText, pageText: pageText, sentences: sentences, tokens: tokens,
    buildIndex: buildIndex, related: related, keywords: keywords, summarize: summarize, ask: ask,
    askSmart: askSmart, qKind: qKind, qPair: qPair, rankSent: rankSent, tableHits: tableHits,
    sentIndex: sentIndex, warm: warm, listSteps: listSteps, expandQuery: expandQuery,
    prfExpand: prfExpand, dedupeSent: dedupeSent,
    aiMode: aiMode, setAiMode: setAiMode,
    pageDigest: pageDigest, promptFor: promptFor,
    chatOf: chatOf, chatPush: chatPush, chatClear: chatClear,
    listenBridge: listenBridge, bridgeSeen: function () { return bridgeSeen; },
    mount: mount, version: '1.3'
  };
})();
  /* Node（单元测试）也能 require 到同一份实现；浏览器里没有 module，自然跳过 */
  if (typeof module !== 'undefined' && module.exports) module.exports = W.LMAI;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}));

/* 自动挂载：DOM 就绪即装（Node 里 require 本文件时不会执行这一段） */
(function () {
  if (typeof document === 'undefined') return;
  const boot = function () { try { if (window.LMAI && window.LMAI.mount) window.LMAI.mount(); } catch (e) { /* noop */ } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
