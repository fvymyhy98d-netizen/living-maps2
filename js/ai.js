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
    /* ★ 修复164：页面主题向量算相似度 —— 靠"讲同一件事"而不是"恰好有一样的两个字"。
       原来的 2-gram 余弦常给出「讨论区 13%」这种字面碰巧重合、语义毫不相干的结果。 */
    if (W.LMSE && W.LMSE.ready && W.LMSE.ready() && W.LMSE.topicVec(id)) {
      try {
        const sr = index.docs.filter(function (d) { return d.id !== id; })
          .map(function (d) {
            return { id: d.id, label: d.label, kind: d.kind, score: Math.round(W.LMSE.topicSim(id, d.id) * 1000) / 1000 };
          })
          .filter(function (x) { return x.score > 0.02; })
          .sort(function (a, b) { return b.score - a.score; })
          .slice(0, k || 3);
        if (sr.length) return sr;
      } catch (e) { /* 降级 */ }
    }
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
    /* ★ 修复164：语义层就绪时，用「完整词 + tf-idf」出关键词。
       老逻辑挑的是 2-gram 里权重最高的，于是「这样核对」→「样核」这类碎片全冒出来了。
       语义层没加载（Node 单测 / 断网 / 旧缓存）就整段跳过，行为与以前完全一致。 */
    if (W.LMSE && W.LMSE.ready && W.LMSE.ready()) {
      try {
        const sk = W.LMSE.keywords(d.text, k || 8);
        if (sk && sk.length) return sk;
      } catch (e) { /* 降级 */ }
    }
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
  /* ★ 修复125：跨页近似重复只留一条（同一句话写了两遍，不该刷屏占掉三个名额） */
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
  /* ---------- ⑧.4 ★ 修复125：原句直搜（不依赖分词的兜底通道） ----------
     真实故障：问「主要问题」，而页里明明有「主要问题与典型任务」，却回「本站没写过相关内容」。
     原因 —— 分词是「相邻两字」2-gram + 停用词表：「主要」「要问」「问题」全被滤掉 →
     查询词表变成空数组 → BM25 一条都算不出来（`tokens('主要问题') === []`）。
     这里再加一条**完全不用分词**的通道：把问句本身（去标点/空格）当子串去原句里找。
     中文里「用户问的短语原样出现在正文」是极强的相关信号，比 2-gram 更接近人的直觉。 */
  function normPhrase(s) {
    return plain(s)
      .replace(/[\s，,。.、；;：:！!？?"'“”‘’()（）\[\]【】/\\|·—\-_~]+/g, '')
      .toLowerCase();
  }
  function literalHits(index, q, limit) {
    const se = sentIndex(index);
    const nq = normPhrase(q);
    if (!se || nq.length < 2) return [];
    /* 第一遍：只收「原句里真的含这个短语」的句子 */
    const hits = [];
    se.docs.forEach(function (d) {
      d.sents.forEach(function (si) {
        const ns = normPhrase(si.s);
        const at = ns.indexOf(nq);
        if (at < 0) return;
        /* 命中得越完整、位置越靠前、句子越短 → 这条越可能就是要找的那句 */
        const cov = nq.length / Math.max(ns.length, 1);
        const score = Math.round((5 + 8 * cov + (at === 0 ? 1.5 : 0) + (si.i === 0 ? 0.5 : 0)) * 100) / 100;
        hits.push({ d: d, si: si, score: score });
      });
    });
    if (!hits.length) return [];
    /* 第二遍：命中的常是小标题（很短）→ 把紧跟的 1–2 句一起带出来当上下文，
       否则用户看到的回答就只有「主要问题与典型任务」这一行，等于没说 */
    const isHit = {};
    hits.forEach(function (h) { isHit[h.d.pageId + '|' + h.si.i] = 1; });
    const out = hits.map(function (h) {
      return { s: h.si.s, i: h.si.i, pageId: h.d.pageId, title: h.d.title, cover: 1, score: h.score, literal: true };
    });
    const seen = {};
    out.forEach(function (x) { seen[x.pageId + '|' + x.i] = 1; });
    hits.forEach(function (h) {
      for (let k = 1; k <= 2; k++) {
        const nx = h.d.sents[h.si.i + k];
        if (!nx || isHit[h.d.pageId + '|' + nx.i] || seen[h.d.pageId + '|' + nx.i]) continue;
        seen[h.d.pageId + '|' + nx.i] = 1;
        out.push({
          s: nx.s, i: nx.i, pageId: h.d.pageId, title: h.d.title, cover: 1,
          score: Math.round(h.score * (k === 1 ? 0.6 : 0.45) * 100) / 100, literal: true
        });
      }
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, limit || 8);
  }
  /* ---------- ⑧.5 ★ 修复164：词级语义召回（解决"换个说法就一问三不知"） ----------
     原通道把中文切成相邻两字，用户问「训练要喂多少东西」时，查询词和正文里的
     「预训练 / 语料」一个都对不上 → BM25 零命中。这里另开一条**独立**通道：
       ① 用语义层词典把问句切成完整词（「训练」「多少」「东西」）
       ② 用概念关联表补几个站里常一起出现的词（「语料」「数据集」）
       ③ 用同一份词典把句子切成词集合，按命中权重打分
     候选句子依然全部来自 sentIndex() 的**原文原句**，只是被"多找出来"一些；
     答案文字一个字都不生成。语义层没加载 → 直接返回空，原流程毫发无损。 */
  let semSentCache = null;
  function semanticHits(index, q, limit) {
    const SE = W.LMSE;
    if (!SE || !SE.ready || !SE.ready()) return [];
    const se = sentIndex(index);
    if (!se) return [];
    const base = SE.cut(q);
    const ext = SE.expandWords(q, 6);
    const qw = {};
    base.forEach(function (w) { qw[w] = 1; });
    ext.forEach(function (w) { qw[w] = Math.max(qw[w] || 0, 0.55); });
    const keys = Object.keys(qw);
    if (!keys.length) return [];
    /* 词级句子索引按 index 缓存（与 sentIndex 同样的换内容自动重建） */
    if (!semSentCache || semSentCache.src !== index) {
      const rows = [];
      se.docs.forEach(function (d) {
        d.sents.forEach(function (si) {
          const set = {};
          SE.cut(si.s).forEach(function (w) { set[w] = 1; });
          if (Object.keys(set).length) rows.push({ d: d, si: si, set: set });
        });
      });
      semSentCache = { src: index, rows: rows };
    }
    const out = [];
    semSentCache.rows.forEach(function (r) {
      let hit = 0, wsum = 0;
      keys.forEach(function (w) { if (r.set[w]) { hit++; wsum += qw[w]; } });
      if (!hit) return;
      const cover = hit / keys.length;
      if (cover < 0.18) return;
      const score = Math.round((1.2 + 2.6 * wsum / keys.length + 0.25 * hit) * 100) / 100;
      out.push({
        s: r.si.s, i: r.si.i, pageId: r.d.pageId, title: r.d.title,
        cover: cover, score: score, sem: true
      });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, limit || 40);
  }
  /* 语义候选与字面候选合并：同一句加分，新句子补进候选池（不删任何原候选） */
  /* ★ 修复166：句向量召回 —— 字面一个词都对不上、但意思接近的原句也要能被找到。
     sem.json 里存的是量化后的词向量；这里只算一次查询向量，再和缓存好的全站句向量点积。
     ★ 只把「原文句子」送进候选池，绝不生成文字；没有向量层时整段等于不存在。 */
  let vecSentCache = null;
  function vectorHits(index, q, limit) {
    const SE = W.LMSE;
    if (!SE || !SE.ready || !SE.ready() || typeof SE.sentVec !== 'function') return [];
    const qv = SE.sentVec(q);
    if (!qv) return [];
    const se = sentIndex(index);
    if (!se) return [];
    if (!vecSentCache || vecSentCache.src !== index) {
      const rows = [];
      se.docs.forEach(function (d) {
        d.sents.forEach(function (si) {
          const v = SE.sentVec(si.s);
          if (v) rows.push({ d: d, si: si, v: v });
        });
      });
      vecSentCache = { src: index, rows: rows };
    }
    const out = [];
    vecSentCache.rows.forEach(function (r) {
      let dot = 0;
      for (let i = 0; i < qv.length; i++) dot += qv[i] * r.v[i];
      if (dot < 0.46) return;
      out.push({
        s: r.si.s, i: r.si.i, pageId: r.d.pageId, title: r.d.title,
        cover: Math.max(0, dot), score: Math.round((1.1 + 2.4 * dot) * 100) / 100,
        sem: true, vec: true
      });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, limit || 16);
  }

  function mergeSemantic(base, sem) {
    const map = {};
    base.forEach(function (x) { map[x.pageId + '|' + x.s] = x; });
    sem.forEach(function (x) {
      const key = x.pageId + '|' + x.s;
      const old = map[key];
      if (old) {
        old.score = Math.round((old.score + 0.45 * x.score) * 100) / 100;
        old.cover = Math.max(old.cover, x.cover);
      } else map[key] = x;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.score - a.score; });
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
    /* ★ 修复125：分词通道一条都没命中 → 换成「原句直搜」再试一次。
       解决「主要问题」这类**整个查询被停用词表吃掉**的情况（tokens 为空 → BM25 必然 0 条），
       以及用户直接问页里某个小标题原文的情况。 */
    if (!ranked.length) ranked = literalHits(index, q, 12);
    /* ★ 修复164：语义召回只做"补充候选 + 给已命中句加分"，放在字面/直搜之后，
       保证精确命中的原句仍排前面；没有语义层时 semanticHits 返回空，这一行等于不存在。 */
    const sem = semanticHits(index, q, 40);
    /* ★ 修复166：句向量召回叠加（去重后并入同一批候选，不删任何原候选） */
    const vec = vectorHits(index, q, 16);
    const extra = sem.slice(), seenSem = {};
    sem.forEach(function (x) { seenSem[x.pageId + '|' + x.s] = 1; });
    vec.forEach(function (x) { if (!seenSem[x.pageId + '|' + x.s]) extra.push(x); });
    if (extra.length) ranked = mergeSemantic(ranked, extra);
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

  /* ★ 修复164：语义层懒加载 —— 同样只在第一次打开面板时拉 data/sem.json。
     拉不到就整层降级（关键词/相关条目/问答全部照旧），不会报错、不挡路。
     加载成功后重绘一次面板，让关键词和相关条目立刻换成"完整词"版本；
     用户一旦开始打字就不重绘，免得打断输入。 */
  let semTried = false;
  function ensureSem() {
    if (semTried) return;
    semTried = true;
    try {
      if (!W.LMSE || typeof W.LMSE.load !== 'function') return;
      const p = W.LMSE.load('data/sem.json');
      if (p && typeof p.then === 'function') {
        p.then(function (ok) {
          if (!ok) { semTried = false; return; }
          try {
            const inp = panel && panel.querySelector('.lm-ai-input');
            if ((!inp || !inp.value) && typeof renderPanel === 'function') renderPanel();
          } catch (e0) { /* noop */ }
        }, function () { semTried = false; });
      }
    } catch (e) { semTried = false; }
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
  /* ★ 修复119：引文为了不撑爆 localStorage 只存前 200 字，但「想看完整原句」不该逼人跳页。
     引文本来就是原文的逐字切片 —— 拿前 40 字去同一页的句子里一找，就能把整句取回来。 */
  function fullQuote(pageId, short) {
    const s = String(short || '');
    if (!s) return s;
    try {
      const ix = indexNow();
      if (!ix || !ix.docs) return s;
      const doc = ix.docs.filter(function (d) { return d.pageId === pageId; })[0];
      if (!doc || !Array.isArray(doc.sents)) return s;
      const bare = s.replace(/…$/, '');
      const probe = bare.slice(0, 40);
      if (!probe) return s;
      for (let i = 0; i < doc.sents.length; i++) {
        const t = String((doc.sents[i] && doc.sents[i].s) || '');
        if (t.indexOf(probe) >= 0) return t.length > bare.length ? t.slice(0, 900) : s;
      }
    } catch (e) { /* 索引还没好就退回存下来的那一段 */ }
    return s;
  }
  /* 短引文原样显示；能找回更长的原句时，给一个「展开全文」就地看，不用跳页 */
  function quoteHtml(short, q, pageId) {
    const full = fullQuote(pageId, short);
    const bare = String(short || '').replace(/…$/, '');
    if (!full || full.length <= bare.length + 4) return hiText(short, q);
    const lbl = esc('展开全文（' + full.length + ' 字）');
    return '<span class="lm-ai-qshort">' + hiText(short, q) + '</span>'
      + ' <button type="button" class="lm-ai-more" data-lbl="' + lbl + '">' + lbl + '</button>'
      + '<span class="lm-ai-qfull" hidden>' + hiText(full, q) + '</span>';
  }
  /* ---------- ⑨ 界面：右下角「✨ 智能提炼」浮标 + 面板 ---------- */
  let panel = null, fab = null, idx = null, idxSrc = null;
  /* ★ 修复135：有新消息进来时必须把对话区拽到底（不然用户在往上翻，发完看不到自己的话）；
     用户只是点个勾选/切个档位时则保持原位置。由 chatPush 置位、renderPanel 消费。 */
  let chatForceBottom = false;

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
  const CHAT_KEY = 'lm_ai_chat_v1';   /* 旧结构 { 页面id: [消息…] } —— 现在只读（迁移用），不再写 */
  /* ★ 修复132：一页可以有**好几个对话**（像 DeepSeek 左侧那种列表），每个对话单独存、可单独删。
     新结构：{ v:2, cur:{ 页面id: 对话id }, pages:{ 页面id: [ { id, title, ts, msgs:[…] } … ] } }
     还是只存在你这台电脑的浏览器里（localStorage），别人看不到、也不上传。 */
  const TH_KEY = 'lm_ai_threads_v1';
  const PER_THREAD = 12;              /* 每个对话最多留 12 条（和以前一样，防 localStorage 越用越大） */
  const MAX_THREADS = 30;             /* 每一页最多留 30 个对话 */
  function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  /* 对话标题 = 第一句「我说的」话（超过 18 字截断），没有就用「新对话」 */
  function titleOf(msgs) {
    const m = (msgs || []).filter(function (x) { return x && x.r === 'me' && x.t; })[0];
    const s = m ? String(m.t).replace(/\s+/g, ' ').trim() : '';
    return s ? (s.length > 18 ? s.slice(0, 18) + '…' : s) : '新对话';
  }
  /* 老版本存的 {页面:[消息…]} → 每页折成 1 个对话。旧键不清：万一又想退回老版本，记录还在。 */
  function tMigrate() {
    const st = { v: 2, cur: {}, pages: {} };
    let old = null;
    try { old = JSON.parse(localStorage.getItem(CHAT_KEY) || 'null'); } catch (e) { old = null; }
    if (old && typeof old === 'object') {
      Object.keys(old).forEach(function (pid) {
        const msgs = Array.isArray(old[pid]) ? old[pid] : [];
        if (!msgs.length) return;
        const t = { id: uid(), title: titleOf(msgs), ts: msgs[msgs.length - 1].ts || Date.now(), msgs: msgs.slice(-PER_THREAD) };
        st.pages[pid] = [t];
        st.cur[pid] = t.id;
      });
    }
    return st;
  }
  function tList(st, id) {
    const a = (st && st.pages) ? st.pages[id] : null;
    return Array.isArray(a) ? a : [];
  }
  function tSave(st) {
    try { localStorage.setItem(TH_KEY, JSON.stringify(st)); } catch (e) { /* 隐私模式：只在本次页面里生效 */ }
  }
  function tStore() {
    let st = null;
    try { st = JSON.parse(localStorage.getItem(TH_KEY) || 'null'); } catch (e) { st = null; }
    if (!st || typeof st !== 'object' || Number(st.v) !== 2 || !st.pages || typeof st.pages !== 'object') {
      st = tMigrate();          /* 第一次用新结构：顺手把老记录搬过来 */
      tSave(st);
    }
    if (!st.cur || typeof st.cur !== 'object') st.cur = {};
    return st;
  }
  /* 当前对话（没有就建一个空的并切过去）。内部用：拿到后改完自己 tSave(st) */
  function tCur(st, pageId) {
    let arr = tList(st, pageId);
    let t = arr.filter(function (x) { return x && x.id === st.cur[pageId]; })[0];
    if (!t) {
      t = arr[0];
      if (!t) {
        t = { id: uid(), title: '新对话', ts: Date.now(), msgs: [] };
        arr = [t];
        st.pages[pageId] = arr;
      }
      st.cur[pageId] = t.id;
    }
    if (!Array.isArray(t.msgs)) t.msgs = [];
    return t;
  }
  /* 这一页所有对话的摘要（标题 / 条数 / 时间 / 是不是当前这个），给列表用 */
  function threadsOf(pageId) {
    const st = tStore();
    return tList(st, pageId).map(function (t) {
      return {
        id: t.id, title: t.title || '新对话', ts: t.ts || 0,
        n: Array.isArray(t.msgs) ? t.msgs.length : 0, cur: t.id === st.cur[pageId]
      };
    });
  }
  function curTid(pageId) { const st = tStore(); return tCur(st, pageId).id; }
  function ensureThread(pageId) { const st = tStore(); tCur(st, pageId); tSave(st); }
  function threadNew(pageId) {
    const st = tStore();
    const t = { id: uid(), title: '新对话', ts: Date.now(), msgs: [] };
    st.pages[pageId] = tList(st, pageId).concat([t]).slice(-MAX_THREADS);
    st.cur[pageId] = t.id;
    tSave(st);
    return t.id;
  }
  function threadSet(pageId, id) {
    const st = tStore();
    const hit = tList(st, pageId).filter(function (t) { return t.id === id; })[0];
    if (!hit) return false;
    st.cur[pageId] = id;
    tSave(st);
    return true;
  }
  /* 批量删（ids 传数组，也接受单个 id）。删光了自动补一个空对话，面板不会变白。 */
  function threadDel(pageId, ids) {
    const st = tStore();
    const kill = {};
    (Array.isArray(ids) ? ids : [ids]).forEach(function (x) { if (x) kill[x] = 1; });
    const left = tList(st, pageId).filter(function (t) { return !kill[t.id]; });
    if (!left.length) {
      const t = { id: uid(), title: '新对话', ts: Date.now(), msgs: [] };
      st.pages[pageId] = [t];
      st.cur[pageId] = t.id;
    } else {
      st.pages[pageId] = left;
      if (!left.filter(function (t) { return t.id === st.cur[pageId]; }).length) st.cur[pageId] = left[0].id;
    }
    tSave(st);
    return left.length;
  }
  function threadRename(pageId, id, title) {
    const st = tStore();
    const hit = tList(st, pageId).filter(function (t) { return t.id === id; })[0];
    if (!hit) return false;
    hit.title = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 24) || '新对话';
    tSave(st);
    return true;
  }
  /* —— 下面三个是老接口（站内别处 + 单元测试都在用）：一律作用在「当前对话」上 —— */
  function chatOf(id) {
    const st = tStore();
    const arr = tList(st, id);
    const t = arr.filter(function (x) { return x.id === st.cur[id]; })[0] || arr[0];
    return (t && Array.isArray(t.msgs)) ? t.msgs.slice() : [];
  }
  /* ★ 修复135：tid 可选 —— 传了就写进指定的那个对话。
     为什么要这个：流式回答要几十秒，用户中途点 ☰ 切到别的对话时，
     原逻辑会把这句回答塞进**新**对话（串台）。提问时记下 tid，回答到了再按 tid 落库。 */
  function chatPush(id, msg, tid) {
    if (!id || !msg) return;
    const rec = { r: msg.r || 'me', t: String(msg.t || '').slice(0, 4000), ts: Date.now(), src: msg.src || null };
    if (msg.q) rec.q = String(msg.q).slice(0, 120);   /* ★ 修复117：记下这一问，供出处高亮用 */
    /* ★ 修复131：「这次送了什么」那行小字也要存，否则重绘就没了 */
    if (msg.note) rec.note = String(msg.note).slice(0, 120);
    /* ★ 修复133：思考过程也存进对话（截断到 1200 字，别撑爆 localStorage），重绘后还能点开看。
       ★ 修复135：被截断时记下原始字数，界面上如实写「只存了前 1200 字」，不假装是全的。 */
    if (msg.think) {
      const th = String(msg.think);
      rec.think = th.slice(0, 1200);
      if (th.length > 1200) rec.thinkFull = th.length;
    }
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
    const st = tStore();
    const t = (tid && tList(st, id).filter(function (x) { return x.id === tid; })[0]) || tCur(st, id);
    t.msgs.push(rec);
    t.msgs = t.msgs.slice(-PER_THREAD);             /* 每个对话最多留 12 条，防 localStorage 膨胀 */
    t.ts = rec.ts;
    if (!t.title || t.title === '新对话') t.title = titleOf(t.msgs);
    tSave(st);
    chatForceBottom = true;       /* ★ 修复135：新消息来了就把对话区拽到底 */
  }
  /* 清空 = 只清「当前这个对话」的内容，别的对话一条不动、对话本身也还在（标题回到「新对话」） */
  function chatClear(id) {
    const st = tStore();
    const arr = tList(st, id);
    const t = arr.filter(function (x) { return x.id === st.cur[id]; })[0] || arr[0];
    if (t) { t.msgs = []; t.title = '新对话'; t.ts = Date.now(); }
    tSave(st);
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
  /* ★ 修复125：本机模型（可选，跑在自己电脑的显卡上）—— 只有用户自己配过才出现 */
  function llmReady() { return !!(W.LMOllama && W.LMOllama.ready && W.LMOllama.ready()); }
  /* ★ 修复134：这一问要不要带本页正文 —— 就是设置里的 scope；输入框下面那个勾选框直接改它。
     默认带（page）；用户取消勾选＝只发问题，想查别的就查别的。 */
  function llmScope() {
    try {
      const c = (W.LMOllama && W.LMOllama.cfg && W.LMOllama.cfg()) || {};
      return c.scope !== 'question';
    } catch (e) { return true; }
  }
  /* ★ 修复126：打开面板时**自动探一次**本机模型服务（每种最多 1.2 秒、失败静默；一次会话只探一次）。
     探到就把「检测到 Ollama · qwen2.5:7b · 点此启用」摆出来 —— 一按就接管，不用手填地址。 */
  let llmProbed = false, llmFound = null;
  /* ★ 修复133：面板浮层（四档菜单 / 对话列表）的「点别处收起」监听只挂一次 */
  let outsideHooked = false;
  function probeLLM() {
    if (llmProbed || llmReady() || !W.LMOllama || typeof W.LMOllama.autoDetect !== 'function') return;
    llmProbed = true;
    try {
      W.LMOllama.autoDetect().then(function (r) {
        if (r && r.ok && r.ep && r.model) { llmFound = r; renderPanel(); }
      }, function () { /* 没有就没有，静默（不给用户任何打扰） */ });
    } catch (e) { /* noop */ }
  }
  function aiMode() {
    try {
      const m = localStorage.getItem(MODE_KEY);
      if (m === 'ds') return 'ds';
      if (m === 'ollama' && llmReady()) return 'ollama';   /* 关掉本机模型后自动退回本站速答 */
      return 'local';
    } catch (e) { return 'local'; }
  }
  function setAiMode(m) {
    const v = (m === 'ds' || (m === 'ollama' && llmReady())) ? m : 'local';
    try { localStorage.setItem(MODE_KEY, v); } catch (e) { /* 无痕模式存不了就算了 */ }
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
          t: d.text ? d.text : '（扩展回了个空回答，再问一次试试）'
        });
        if (panel && !panel.hidden) renderPanel();
        else if (window.LMApp && LMApp.toast) {
          LMApp.toast(toId === curId() ? '✅ 回答已回到对话' : '✅ 回答已回到提问那页');
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
  /* ★ 修复124：读剪贴板 —— 「粘回回答」直接取，不用你再按 Ctrl/⌘+V。
     浏览器没给权限（或老浏览器）时会 reject，调用方安静地回落到手动粘贴。 */
  function readClip() {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) return navigator.clipboard.readText();
    } catch (e) { /* 落到下面 */ }
    return Promise.reject(new Error('no-clip-read'));
  }
  /* 「发出去、正在等回答」的记账：切回本页时据此去剪贴板找回答 */
  let awaitBack = null;
  /* ★ 修复107：这里原本有一个「带 Key 直连官方接口」的函数 —— 已按要求**整块删除**。
     现在本站**没有任何 API 调用、不读写任何 Key**，`test_yjs` 断言「ai.js 全文 0 处 fetch」。 */

  /* ★ 修复132：面板大小 —— 标准 / 加宽 / 加高 / 满屏 四档（点 ⤢ 轮换），桌面端还能拖左上角那个
     小把手自由缩放（记成「自定义」）。选过的档位存在本机，下次打开还是这个大小。
     手机端不进拖拽逻辑（手指拖角落很容易和滚动打架），只用这四档。 */
  const SIZE_KEY = 'lm_ai_size_v1';
  const SIZES = ['std', 'wide', 'tall', 'max'];
  const SIZE_NAME = { std: '标准', wide: '加宽', tall: '加高', max: '满屏', custom: '自定义' };
  let sizeMode = 'std', sizeCus = null;
  function sizeLoad() {
    try {
      const s = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
      if (!s) return;
      if (s.mode === 'custom' && s.w && s.h) { sizeMode = 'custom'; sizeCus = { w: s.w, h: s.h }; return; }
      if (SIZES.indexOf(s.mode) >= 0) sizeMode = s.mode;
    } catch (e) { sizeMode = 'std'; sizeCus = null; }
  }
  function sizeSave() {
    try {
      localStorage.setItem(SIZE_KEY, JSON.stringify({ mode: sizeMode, w: sizeCus ? sizeCus.w : 0, h: sizeCus ? sizeCus.h : 0 }));
    } catch (e) { /* 隐私模式：这次有效，下次回到标准 */ }
  }
  function applySize() {
    if (!panel) return;
    panel.setAttribute('data-size', sizeMode);
    if (sizeMode === 'custom' && sizeCus) {
      /* 自定义：宽高写死，对话区跟着长高（面板本身不再整体滚，对话区自己滚） */
      panel.style.width = sizeCus.w + 'px';
      panel.style.height = sizeCus.h + 'px';
      panel.style.maxHeight = 'none';
      panel.style.setProperty('--chat', Math.max(120, sizeCus.h - 300) + 'px');
    } else {
      panel.style.width = '';
      panel.style.height = '';
      panel.style.maxHeight = '';
      try { panel.style.removeProperty('--chat'); } catch (e) { /* 老浏览器：忽略 */ }
    }
    /* ★ 修复135：换档位会改变面板高度，开着的浮层要重新贴一下，否则会悬在半空 */
    const flyT = panel.querySelector('.lm-ai-threads');
    const flyS = panel.querySelector('.lm-ai-sizemenu');
    if (flyT && !flyT.hidden) placeFly(flyT);
    if (flyS && !flyS.hidden) placeFly(flyS);
    const b = panel.querySelector('.lm-ai-size');
    if (b) {
      b.textContent = (sizeMode === 'max') ? '⤡' : '⤢';
      b.title = '面板大小：' + (SIZE_NAME[sizeMode] || '标准');
    }
    const mb = panel.querySelector('.lm-ai-sizemenu');
    if (mb && !mb.hidden) renderSizeMenu();   /* 菜单开着就顺手把打勾挪过去 */
  }
  function sizeNext() {
    const i = SIZES.indexOf(sizeMode);            /* 自定义(=-1) → 回到标准 */
    sizeSet(SIZES[(i + 1) % SIZES.length]);
  }
  /* ★ 修复133：直接选某一档（菜单用）。以前只能一格一格点 ⤢ 轮换，太绕。 */
  function sizeSet(m) {
    if (SIZES.indexOf(m) < 0) return false;
    sizeMode = m;
    sizeCus = null;
    applySize(); sizeSave();
    if (typeof window !== 'undefined' && window.LMApp && LMApp.toast) LMApp.toast('面板：' + SIZE_NAME[m]);
    return true;
  }
  const SIZE_HINT = { std: '380px · 贴着右下角', wide: '560px · 宽一点', tall: '560px · 高一点', max: '720px · 居中满屏' };
  /* 点 ⤢ 弹出的四档菜单（当前档打勾；拖过大小就多一行提示） */
  function renderSizeMenu() {
    const box = panel && panel.querySelector('.lm-ai-sizemenu');
    if (!box) return;
    let h = '<div class="lm-ai-sz-hd">面板大小</div>';
    SIZES.forEach(function (s) {
      h += '<button type="button" class="lm-ai-sz-it' + (s === sizeMode ? ' on' : '') + '" data-size="' + s + '">'
        + '<span>' + SIZE_NAME[s] + '<em>' + (SIZE_HINT[s] || '') + '</em></span>'
        + (s === sizeMode ? '<i class="lm-ai-sz-ck">✓</i>' : '') + '</button>';
    });
    if (sizeMode === 'custom') h += '<div class="lm-ai-sz-tip">你拖出来的大小 · 选一档覆盖</div>';
    box.innerHTML = h;
  }
  /* ★ 修复135：浮层（对话列表 / 四档菜单）的 top 不能写死。
     手机「满屏」档的顶栏会因为 env(safe-area-inset-top) 变高（刘海屏），
     写死 46/50px 就会把浮层压到顶栏按钮上。打开时按顶栏的真实下沿算一次。 */
  function placeFly(el) {
    if (!el || !panel) return;
    const head = panel.querySelector('.lm-ai-head');
    if (!head) return;
    const pr = panel.getBoundingClientRect();
    const hr = head.getBoundingClientRect();
    const top = Math.max(0, Math.round(hr.bottom - pr.top) + 6);
    el.style.top = top + 'px';
    el.style.maxHeight = Math.max(120, Math.round(pr.height - top - 10)) + 'px';
  }
  /* ★ 修复132：对话列表（顶栏 ☰ 点开）。每行 = 勾选框 + 标题（点它切过去）+ 单个删除；
     顶部「全选 / 删除选中」，删之前要点两次（第一次变成「再点一次确认」，3 秒不管就复原）。 */
  function renderThreads(pageId) {
    const box = panel && panel.querySelector('.lm-ai-threads');
    if (!box) return;
    const id = pageId || curId();
    const ths = threadsOf(id);
    /* ★ 修复135：重绘（发消息 / 切模式 / 新建对话都会触发）不该把已经勾选的那些清掉 */
    const prev = {};
    box.querySelectorAll('.lm-ai-th-ck:checked').forEach(function (c) {
      const k = c.getAttribute('data-tid');
      if (k) prev[k] = 1;
    });
    let h = '<div class="lm-ai-th-top">'
      + '<label class="lm-ai-th-all"><input type="checkbox" class="lm-ai-thallck"> 全选</label>'
      + '<span class="lm-ai-th-n">共 ' + ths.length + ' 个对话</span>'
      + '<button type="button" class="btn lm-ai-th-del" disabled>删除选中</button>'
      + '</div>';
    if (!ths.length) {
      h += '<p class="lm-ai-tip">还没有对话。</p>';
    } else {
      h += '<div class="lm-ai-th-list">' + ths.map(function (t) {
        const d = t.ts ? new Date(t.ts) : null;
        const when = d ? ((d.getMonth() + 1) + '-' + d.getDate() + ' ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2)) : '';
        return '<div class="lm-ai-th-row' + (t.cur ? ' on' : '') + '" data-tid="' + esc(t.id) + '">'
          + '<input type="checkbox" class="lm-ai-th-ck" data-tid="' + esc(t.id) + '" aria-label="选择这个对话">'
          + '<button type="button" class="lm-ai-th-go" data-tid="' + esc(t.id) + '">' + esc(t.title)
          + '<em>' + t.n + ' 条' + (when ? ' · ' + when : '') + (t.cur ? ' · 当前' : '') + '</em></button>'
          + '<button type="button" class="lm-ai-th-one" data-tid="' + esc(t.id) + '" title="删掉这个对话">🗑</button>'
          + '</div>';
      }).join('') + '</div>';
    }
    h += '<div class="lm-ai-th-foot"><button type="button" class="btn lm-ai-new2">＋ 新对话</button>'
      + '<button type="button" class="btn lm-ai-th-close">收起</button></div>';
    box.innerHTML = h;
    /* 把刚才勾着的补回来（勾满 → 全选框也跟着选中） */
    let any = false;
    box.querySelectorAll('.lm-ai-th-ck').forEach(function (c) {
      if (prev[c.getAttribute('data-tid')]) { c.checked = true; any = true; }
    });
    if (any) thSyncDel();
  }
  /* 勾选框一变就刷新「删除选中（n）」和「全选」的半选状态 */
  function thSyncDel() {
    const box = panel && panel.querySelector('.lm-ai-threads');
    if (!box) return;
    const cks = box.querySelectorAll('.lm-ai-th-ck');
    const on = box.querySelectorAll('.lm-ai-th-ck:checked');
    const del = box.querySelector('.lm-ai-th-del');
    if (del) {
      del.disabled = on.length === 0;
      del.textContent = on.length ? ('删除选中（' + on.length + '）') : '删除选中';
      del.classList.remove('arm');
    }
    const all = box.querySelector('.lm-ai-thallck');
    if (all) {
      all.checked = cks.length > 0 && on.length === cks.length;
      try { all.indeterminate = on.length > 0 && on.length < cks.length; } catch (e) { /* noop */ }
    }
  }

  /* 顶栏那个「☰ 对话 n」的数字，顺带把开着的列表重画一遍 */
  function syncThreads(pageId) {
    if (!panel) return;
    const cnt = panel.querySelector('.lm-ai-cnt');
    if (cnt) cnt.textContent = String(threadsOf(pageId).length);
    const box = panel.querySelector('.lm-ai-threads');
    if (box && !box.hidden) renderThreads(pageId);
  }

  function renderPanel() {
    if (!panel) return;
    const body = panel.querySelector('.lm-ai-body');
    ensureLM();                 /* ★ 修复112：面板一开就懒加载小模型（非阻塞） */
    ensureSem();                /* ★ 修复164：同一时机加载语义层（完整词 / 概念关联 / 页面主题） */
    if (!body) return;
    const badge = panel.querySelector('.lm-ai-badge');
    if (badge) badge.textContent = bridgeSeen ? '已装扩展 · 全自动' : '不用 API · 不存 Key';
    const ix = indexNow();
    if (!ix) { body.innerHTML = '<p class="lm-ai-tip">内容还在加载，稍等一下下…</p>'; return; }
    const id = curId();
    ensureThread(id);            /* ★ 修复132：这一页至少留一个对话（新页面打开面板就有一个「新对话」） */
    syncThreads(id);
    const pts = summarize(ix, id, 3);
    const kws = keywords(ix, id, 8);
    const rel = related(ix, id, 3);
    const title = ix.docs.filter(function (d) { return d.id === id; }).map(function (d) { return d.label; })[0] || id;
    /* ① 对话框**放最上面**（用户明确要求：不要让"相关条目 / 生态地图 / 更新记录"这些模块压在上面） */
    const msgs = chatOf(id);
    let h = '<div class="lm-ai-chat" role="log" aria-label="与 DeepSeek 的对话">';
    h += msgs.length
      ? msgs.map(function (m) {
        const cls = m.r === 'me' ? 'me' : (m.r === 'local' ? 'local' : (m.r === 'ollama' ? 'ollama' : 'ds'));
        const who = m.r === 'me' ? '我' : (m.r === 'local' ? '本站速答' : (m.r === 'ollama' ? '🧠 本机模型' : 'DeepSeek'));
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
                + '<p>' + quoteHtml(body.length > 200 ? body.slice(0, 200) + '…' : body, m.q, c.pageId) + '</p></div>';
            }).join('')
            + '</details>'
          : '';
        return '<div class="lm-ai-msg ' + cls + '"><span class="lm-ai-who">' + who + '</span>'
          /* ★ 修复133：思考过程放在正文**上方**，默认收起（点开才看）—— 和 DeepSeek 一样 */
          + (m.think
            ? '<details class="lm-ai-thk"><summary>💭 思考过程 · ' + (m.thinkFull || String(m.think).length) + ' 字'
              + (m.thinkFull ? '（只存前 1200）' : '') + '</summary>'
              + '<div class="lm-ai-thk-bd">' + esc(String(m.think)).replace(/\n/g, '<br>') + '</div></details>'
            : '')
          + '<p>' + esc(m.t).replace(/\n/g, '<br>') + '</p>'
          + (m.note ? '<span class="lm-ai-note">' + esc(String(m.note)) + '</span>' : '')
          + src + cite + '</div>';
      }).join('')
      : '<p class="lm-ai-tip">写个问题，按回车就行。</p>';
    h += '</div>';
    const mode = aiMode();
    /* ★ 修复110：聊天框上方一个切换键 —— 默认「本站速答」
       ★ 修复136：文案瘦身 —— 输入框只留「问点什么…」，说明全挪到 title（悬停才看） */
    const ph = '问点什么…';
    const goLabel = mode === 'local' ? '问一句' : (mode === 'ollama' ? '问本机模型' : '发给 DeepSeek');
    h += '<div class="lm-ai-modes" role="tablist" aria-label="问答模式">'
      + '<button type="button" class="lm-ai-mode' + (mode === 'local' ? ' on' : '') + '" data-mode="local" role="tab" aria-selected="' + (mode === 'local') + '"'
      + ' title="只用站内写过的内容，不用配置">'
      + '⚡ 本站速答<em>免配置</em></button>'
      + '<button type="button" class="lm-ai-mode' + (mode === 'ds' ? ' on' : '') + '" data-mode="ds" role="tab" aria-selected="' + (mode === 'ds') + '"'
      + ' title="把这页正文交给网页版 DeepSeek（更全面；需装扩展或手动粘贴）">'
      + '🐋 DeepSeek<em>网页版</em></button>'
      /* ★ 修复133：三格**固定都在**。没接本机模型时这一格写「未接 · 点此配置」，
         点它直接打开配置面板（以前整格会隐藏，用户以为功能没了）。 */
      + '<button type="button" class="lm-ai-mode' + ((mode === 'ollama' && llmReady()) ? ' on' : '') + (llmReady() ? '' : ' off')
      + '" data-mode="ollama" role="tab" aria-selected="' + (mode === 'ollama' && llmReady()) + '"'
      + ' title="' + (llmReady() ? '用你电脑上的显卡跑，会组织语言' : '还没接本机模型 · 点此配置（只用你的显卡，不填 Key）') + '">'
      + '🧠 本机模型<em>' + (llmReady() ? '已接上' : '未接 · 点此配置') + '</em></button>'
      + '</div>';
    h += '<div class="lm-ai-ask"><input class="lm-ai-input" type="search" placeholder="' + ph + '" aria-label="提问">'
      + '<button class="btn btn-primary lm-ai-go" type="button">' + goLabel + '</button></div>'
      /* ★ 修复134：一个直观的勾选 —— 勾上＝把这页正文一起发给本机模型；不勾＝只发问题（可以随便查别的）。
         只在本机模型模式下出现：本站速答只用站内内容，DeepSeek 走的是复制粘贴那一套。 */
      + (mode === 'ollama' && llmReady()
        ? '<label class="lm-ai-scope" title="勾上＝以这一页为准；不勾＝只发问题，可以问任何东西">'
          + '<input type="checkbox" class="lm-ai-scopeck"' + (llmScope() ? ' checked' : '') + '>'
          + '<span>根据本页内容回答<em>' + (llmScope() ? '带本页正文' : '只发问题') + '</em></span>'
          + '</label>'
        : '')
      + '<div class="lm-ai-row">'
      + '<button class="btn lm-ai-paste" type="button" title="把 DeepSeek 的回答粘回来">📥 粘回回答</button>'
      + '<button class="btn lm-llm-cfg" type="button" title="接本机模型（可选）">⚙ 接本机模型</button>'
      /* ★ 修复126：自动探测到的本机模型 —— 一键接管（只在本页出现，不会打扰别的访客） */
      + (llmFound && !llmReady()
        ? '<button class="btn lm-llm-use" type="button" title="点一下就用它">🧠 检测到 ' + esc(llmFound.ep.name) + ' · ' + esc(llmFound.model) + ' · 点此启用</button>'
        : '')
      + '<button class="btn lm-ai-clear" type="button" title="清空这个对话">🗑 清空</button>'
      + '</div>'
      + '<div class="lm-ai-pastebox" hidden><textarea class="lm-ai-pasteta" placeholder="把回答粘到这里（Ctrl/⌘+V）"></textarea>'
      + '<button class="btn lm-ai-pastesave" type="button">保存到对话</button></div>'
      + '<div class="lm-ai-ans"></div>';
    /* ② 其余的辅助卡片放在对话框**下面** */
    h += '<div class="lm-ai-cur">正在看：<b>' + esc(title) + '</b></div>';
    h += '<h4 class="lm-ai-h">📌 这一页的要点</h4>';
    h += pts.length
      ? '<ol class="lm-ai-list">' + pts.map(function (s) {
        /* ★ 修复124：要点不再截断。以前超过 120 字就切掉补「…」，用户看到的是一条半句，
           以为「要点没写完」；面板本身可以上下滚，没必要替用户做这个删减。 */
        return '<li>' + esc(String(s || '').trim()) + '</li>';
      }).join('') + '</ol>'
      : '<p class="lm-ai-tip">这一页内容还少。</p>';
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
      thk: [],
      ans: (function () { const a = body.querySelector('.lm-ai-ans'); return a ? a.innerHTML : ''; })(),
      paste: !!body.querySelector('.lm-ai-pastebox:not([hidden])'),
      /* ★ 修复135：勾选框点完会整块重绘，焦点会掉到 <body> 上 —— 键盘用户按空格连点第二下就没反应了。
         记一下焦点，绘完还给新的那个勾选框。 */
      scopeFocus: (function () {
        const c = body.querySelector('.lm-ai-scopeck');
        return !!c && document.activeElement === c;
      })(),
      /* ★ 修复135：滚动位置要从 .lm-ai-body 读 —— 面板本身已经不滚了（它 overflow:hidden），
         以前读 panel.scrollTop 恒为 0，等于每次重绘都把用户滚到的地方拉回顶部。 */
      scroll: body.scrollTop || 0,
      /* ★ 修复135：对话区也别无条件拽到底 —— 你正翻着旧消息时（比如去点「根据本页内容回答」），
         重绘一下就被踢到最底很烦。原来停在底部就继续贴底，否则原地不动。 */
      chatTop: (function () { const c = body.querySelector('.lm-ai-chat'); return c ? c.scrollTop : 0; })(),
      chatBottom: chatForceBottom || (function () {
        const c = body.querySelector('.lm-ai-chat');
        return !!c && (c.scrollHeight - c.scrollTop - c.clientHeight) < 24;
      })()
    };
    chatForceBottom = false;      /* 只对这一次重绘生效 */
    body.querySelectorAll('details.lm-ai-cite').forEach(function (d, i) { keep.open[i] = !!d.open; });
    /* ★ 修复135：思考框的展开状态也要留住（点了「点开看」，重绘一次又收起来会很烦） */
    body.querySelectorAll('details.lm-ai-thk').forEach(function (d, i) { keep.thk[i] = !!d.open; });
    body.innerHTML = h;
    const input = body.querySelector('.lm-ai-input');
    const go = body.querySelector('.lm-ai-go');
    const ans = body.querySelector('.lm-ai-ans');
    const chatEl = body.querySelector('.lm-ai-chat');
    if (input && keep.val) input.value = keep.val;
    if (ans && keep.ans) ans.innerHTML = keep.ans;
    if (keep.paste) { const pb0 = body.querySelector('.lm-ai-pastebox'); if (pb0) pb0.hidden = false; }
    body.querySelectorAll('details.lm-ai-cite').forEach(function (d, i) { if (keep.open[i]) d.open = true; });
    body.querySelectorAll('details.lm-ai-thk').forEach(function (d, i) { if (keep.thk[i]) d.open = true; });
    if (chatEl) chatEl.scrollTop = keep.chatBottom ? chatEl.scrollHeight : keep.chatTop;
    if (input && keep.focus) {
      try { input.focus({ preventScroll: true }); input.setSelectionRange(keep.sel, keep.sel); } catch (e) { /* 忽略 */ }
    }
    body.scrollTop = keep.scroll;
    if (keep.scopeFocus) {
      const ck0 = body.querySelector('.lm-ai-scopeck');
      if (ck0) { try { ck0.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ } }
    }
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
        /* ★ 修复125：以前只丢一句「本站没写过相关内容」就完事（用户感受就是「一问三不知」）。
           现在至少把**这一页的要点**摆出来，并说清下一步（换用页里出现的词 / 切到 DeepSeek）。 */
        const tips = summarize(ix, id, 2).map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n');
        chatPush(id, {
          r: 'local',
          t: '站内没找到对应的句子。\n'
            + (tips ? '这一页的要点：\n' + tips + '\n\n' : '')
            + '换个页里出现过的词再问，或切到 🐋 DeepSeek。'
        });
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
          chatPush(id, { r: 'local', t: '⚠️ 站内只对得上这一条，可能不准。要更完整，切 🐋 DeepSeek。' });
        }
      }
      renderPanel();
    };
    /* 发送：按模式分流（默认「本站速答」；DeepSeek 是备选） */
    /* ★ 修复125：本机模型（可选）—— 把这一页正文交给用户自己电脑上的 Ollama。
       模型在显卡上跑，不联网、不用 Key；连不上就明说缺哪一步，站内速答不受影响。 */
    const runLLM = function (q) {
      if (!W.LMOllama || typeof W.LMOllama.ask !== 'function') { runLocal(q); return; }
      const digest = pageDigest(pageById(id));
      /* ★ 修复131：追问（“我说明了什么”“上面那条”）必须有上下文 —— 取这一页最近的 2 轮对话一起发。
         注意：必须在 chatPush 这一问**之前**取，否则历史里会混进重复的当前问题。 */
      const history = chatOf(id).filter(function (m) {
        return m && m.t && (m.r === 'me' || m.r === 'ollama' || m.r === 'local');
      }).slice(-4);
      const model = (W.LMOllama.cfg() || {}).model || '本机模型';
      /* ★ 修复135：记住这一问落在哪个对话（中途切走，回答也不会串到别的对话里） */
      const tid0 = curTid(id);
      chatPush(id, { r: 'me', t: q });
      if (input) input.value = '';        /* 发出去就清空（同 runLocal） */
      renderPanel();
      let chatBox = panel.querySelector('.lm-ai-chat');
      let streamEl = null;
      let thinkTxt = '';
      /* ★ 修复134：DeepSeek 式「跟随」—— 只在你本来就停在底部时才自动往下滚。
         你手动往上翻（想看前面写了什么），就立刻停止跟随、不再抢你的滚动位置；
         重新滚到底部，跟随自动恢复。思考框内部也是同一套规则。 */
      let chatStick = true, thkStick = true, thkTouch = 0;
      const bindChat = function (box) {
        if (!box || box.__lmStickBound) return;
        box.__lmStickBound = true;
        box.addEventListener('scroll', function () {
          chatStick = (box.scrollHeight - box.scrollTop - box.clientHeight) < 32;
        }, { passive: true });
      };
      bindChat(chatBox);
      /* ★ 修复135：重绘（切模式 / 切对话 / 清空）会把 .lm-ai-chat 整块换掉，
         此时旧节点已脱离文档 —— 以前还往旧节点里画，等于流式内容「消失」。
         现在自动跟到新节点；如果用户已经切到别的对话，就不再画了（回答最后会按 tid0 落库）。 */
      const liveBox = function () {
        if (chatBox && (chatBox.isConnected == null ? document.body.contains(chatBox) : chatBox.isConnected)) return chatBox;
        if (curTid(id) !== tid0) return null;
        const fresh = panel.querySelector('.lm-ai-chat');
        if (!fresh) return null;
        chatBox = fresh; streamEl = null; chatStick = true;
        bindChat(chatBox);
        return chatBox;
      };
      const drawLive = function (txt, think) {
        const cb = liveBox();
        if (!cb) return;
        if (!streamEl || streamEl.parentNode !== cb) {
          streamEl = document.createElement('div');
          streamEl.className = 'lm-ai-msg ollama lm-ai-stream';
          /* 思考框的滚动事件不冒泡，用 capture 接住；程序自己滚动的那一下不算「用户上滚」 */
          streamEl.addEventListener('scroll', function (e) {
            const b = e.target;
            if (!b || !b.classList || !b.classList.contains('lm-ai-thk-bd')) return;
            if (Date.now() - thkTouch < 220) return;
            thkStick = (b.scrollHeight - b.scrollTop - b.clientHeight) < 24;
          }, true);
          cb.appendChild(streamEl);
        }
        let s = '';
        if (think) {
          s += '<details class="lm-ai-thk live" open><summary>💭 思考中… · ' + String(think).length
            + ' 字</summary><div class="lm-ai-thk-bd">'
            + esc(String(think)).replace(/\n/g, '<br>') + '</div></details>';
        }
        if (txt) s += '<p>' + esc(String(txt)).replace(/\n/g, '<br>') + '</p>';
        if (!think && !txt) s += '<p class="lm-ai-tip">正在生成…</p>';
        /* ★ 修复136：模型名不再占一行字，挂到悬停里 */
        streamEl.innerHTML = '<span class="lm-ai-who" title="' + esc(model) + '">🧠 本机模型</span>' + s;
        /* 思考框：粘底（重建 DOM 会把滚动位置归零，所以每次更新都拉回底部） */
        const tbd = streamEl.querySelector('.lm-ai-thk-bd');
        if (tbd && thkStick && tbd.scrollHeight > tbd.clientHeight) {
          thkTouch = Date.now();
          try { tbd.scrollTop = tbd.scrollHeight; } catch (eT) { /* noop */ }
        }
        if (chatStick) { try { cb.scrollTop = cb.scrollHeight; } catch (eS) { /* noop */ } }
      };
      drawLive('', '');
      W.LMOllama.ask(q, digest, function (txt, final, think) {
        if (think) thinkTxt = String(think);
        if (final) {
          /* 思考结束：把那个框自己收起来（内容还在，点一下还能展开看） */
          if (streamEl) {
            const d = streamEl.querySelector('.lm-ai-thk');
            if (d) d.removeAttribute('open');
          }
          return;
        }
        drawLive(String(txt || ''), thinkTxt);
      }, history).then(function (txt) {
        let t = String(txt || '').trim();
        /* ★ 修复131：模型明明收到了正文却说「没有页面内容」—— 站点直接把矛盾点摆出来，别让用户以为功能坏了 */
        const info = (W.LMOllama.lastAsk && W.LMOllama.lastAsk()) || {};
        if (info.pageChars > 0 && /(没有|未包含|不含|缺少|无法看到).{0,8}页面内容|无页面内容/.test(t)) {
          t += '\n\n（说明：本页正文 ' + info.pageChars + ' 字确实一起发出去了，是模型自己判断失误，重问一次通常就好。）';
        }
        chatPush(id, { r: 'ollama', t: t || '（本机模型没返回内容：模型可能还在加载，稍等几秒再问一次。）', note: llmNote(), think: thinkTxt }, tid0);
        renderPanel();
      }, function (e) {
        chatPush(id, {
          r: 'local',
          t: '🧠 本机模型没连上：' + ((e && e.message) || e) + '\n\n'
            + (W.LMOllama.helpText ? W.LMOllama.helpText() : '')
            + '\n\n（可以先用 ⚡ 本站速答）'
        }, tid0);
        renderPanel();
      });
    };
    /* ★ 修复131：一行小字交代「这次到底送了什么」，避免再出现「明明有正文却答没正文」的困惑
       ★ 修复136：压到最短 —— 一行就够，别在每条答案下面挂半句话说明 */
    const llmNote = function () {
      try {
        const i = (W.LMOllama.lastAsk && W.LMOllama.lastAsk()) || null;
        if (!i) return '';
        if (i.scope === 'question') return '只发了问题（没勾本页）';
        return '附本页正文 ' + i.pageChars + ' 字'
          + (i.history ? ' · 上文 ' + Math.ceil(i.history / 2) + ' 轮' : '');
      } catch (e) { return ''; }
    };
    /* 发送：按模式分流（默认「本站速答」；DeepSeek / 本机模型是备选） */
    const send = function () {
      const q = String((input && input.value) || '').trim();
      if (!q) { ans.innerHTML = '<p class="lm-ai-tip">先写个问题。</p>'; return; }
      if (aiMode() === 'ollama') { runLLM(q); return; }
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
        awaitBack = { id: id, prompt: txt, at: Date.now() };
        chatPush(id, {
          r: 'ds',
          t: '✅ 已复制「这一页正文 + 你的问题」（约 ' + txt.length + ' 字），DeepSeek 网页已在新标签打开。\n'
            + '① 在它的输入框按 Ctrl/⌘+V 粘贴并发送 —— **跨网站替你打字这件事浏览器不允许**（只有装 ext/ 扩展才能全自动）；\n'
            + '② 回答出来后复制它，再回到这里点「📥 粘回回答」：剪贴板内容会**自动填进去**，你核对一下保存即可。'
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
        /* ★ 修复133：本机模型还没接上 —— 不静默失败，直接说清楚并把配置面板打开 */
        if (m === 'ollama' && !llmReady()) {
          if (window.LMApp && LMApp.toast) LMApp.toast('还没接本机模型，下面配一下');
          if (W.LMOllama && typeof W.LMOllama.openSettings === 'function') {
            W.LMOllama.openSettings(function () { renderPanel(); });
          } else if (ans) {
            ans.innerHTML = '<p class="lm-ai-tip">本机模型模块没加载（js/ai-ollama.js）。刷新一下页面再试；这一步是可选的，不影响站内速答。</p>';
          }
          return;
        }
        if (m === aiMode()) return;
        setAiMode(m);
        renderPanel();
        if (m === 'ds' && !bridgeSeen && ans) {
          ans.innerHTML = '<p class="lm-ai-tip">DeepSeek 模式：装了扩展就全自动；没装也没关系 —— 点「发给 DeepSeek」会自动复制，你去网页按 Ctrl/⌘+V 发送，回来「📥 粘回回答」。</p>';
        }
      });
    });
    /* ★ 修复125：本机模型设置入口（可选，只连本机；配好后模式里会多出「🧠 本机模型」） */
    const llmCfg = body.querySelector('.lm-llm-cfg');
    if (llmCfg) llmCfg.addEventListener('click', function () {
      if (W.LMOllama && typeof W.LMOllama.openSettings === 'function') {
        W.LMOllama.openSettings(function () { renderPanel(); });
      } else if (ans) {
        ans.innerHTML = '<p class="lm-ai-tip">本机模型模块没加载（js/ai-ollama.js）。刷新一下页面再试；这一步是可选的，不影响站内速答。</p>';
      }
    });
    /* 📥 把 DeepSeek 的回答粘回来，存进这个对话 */
    const pb = body.querySelector('.lm-ai-pastebox');
    const pta = body.querySelector('.lm-ai-pasteta');
    const pasteBtn = body.querySelector('.lm-ai-paste');
    if (pasteBtn) pasteBtn.addEventListener('click', function () {
      if (!pb) return;
      pb.hidden = !pb.hidden;
      if (pb.hidden) return;
      if (pta) pta.focus();
      /* ★ 修复124：直接读剪贴板自动填入（浏览器没授权就保持手动粘贴，功能不降级） */
      readClip().then(function (t) {
        t = String(t || '').trim();
        if (!pta || pta.value || t.length < 20) return;
        pta.value = t;
        if (window.LMApp && LMApp.toast) LMApp.toast('读到 ' + t.length + ' 字，确认后点「保存到对话」');
      }, function () { /* 没权限：手动 Ctrl/⌘+V */ });
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
      if (window.LMApp && LMApp.toast) LMApp.toast('已清空当前对话');
      renderPanel();
    });
    /* ★ 修复126：把「检测到 XXX」那个按钮点掉 → 自动接上并切成这个模式，不用填任何东西 */
    const llmUse = body.querySelector('.lm-llm-use');
    if (llmUse) llmUse.addEventListener('click', function () {
      if (!W.LMOllama || typeof W.LMOllama.autoConnect !== 'function') return;
      if (ans) ans.innerHTML = '<p class="lm-ai-tip">正在接上本机模型（只跟 127.0.0.1 通信）…</p>';
      W.LMOllama.autoConnect().then(function (r) {
        llmProbed = true;
        if (r && r.ok) {
          llmFound = null;
          setAiMode('ollama');
          if (window.LMApp && LMApp.toast) LMApp.toast('✅ 已接上 ' + r.model);
          renderPanel();
          return;
        }
        if (ans) ans.innerHTML = '<p class="lm-ai-tip">没能自动接上（服务可能在启动 / 没放行跨域）。点「⚙ 接本机模型」手动确认一下。</p>';
      }, function () {
        if (ans) ans.innerHTML = '<p class="lm-ai-tip">没能自动接上。点「⚙ 接本机模型」手动确认一下。</p>';
      });
    });
    /* ★ 修复134：勾选框「根据本页内容回答」—— 点一下就把 scope 存下来，下一次提问立刻生效。
       勾上＝page（带本页正文）；不勾＝question（只发问题，可以随便查别的）。 */
    const scopeCk = body.querySelector('.lm-ai-scopeck');
    if (scopeCk) scopeCk.addEventListener('change', function () {
      const on = !!scopeCk.checked;
      if (W.LMOllama && typeof W.LMOllama.setCfg === 'function') W.LMOllama.setCfg({ scope: on ? 'page' : 'question' });
      if (window.LMApp && LMApp.toast) {
        LMApp.toast(on ? '带本页正文' : '只发问题');
      }
      renderPanel();
    });
    probeLLM();          /* 第一次打开面板时顺手探一下（没有本机服务就什么都不发生） */
  }
  /* ★ 修复119：手机上面板打开时锁住背景滚动。
     直接给 body 加 overflow:hidden 在 iOS 上会把页面位置顶掉（关掉后跳回顶部），
     所以用更稳的老办法：body 改 position:fixed + 负 top 记住位置，关面板时把 scrollY 还原。 */
  let lockY = 0;
  function isNarrow() {
    try { return !!(window.matchMedia && window.matchMedia('(max-width:640px)').matches); }
    catch (e) { return false; }
  }
  function lockScroll() {
    if (typeof document === 'undefined' || !isNarrow()) return;
    if (document.body.classList.contains('lm-lock')) return;
    lockY = window.pageYOffset || document.documentElement.scrollTop || 0;
    document.body.style.top = (-lockY) + 'px';
    document.body.classList.add('lm-lock');
  }
  function unlockScroll() {
    if (typeof document === 'undefined' || !document.body.classList.contains('lm-lock')) return;
    document.body.classList.remove('lm-lock');
    document.body.style.top = '';
    try { window.scrollTo(0, lockY); } catch (e) { /* noop */ }
  }
  function toggle(force) {
    if (!panel) return;
    const open = force === true ? true : (force === false ? false : panel.hidden);
    panel.hidden = !open;
    if (fab) fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { lockScroll(); applySize(); renderPanel(); } else unlockScroll();
  }
  function mount() {
    if (fab || typeof document === 'undefined') return;
    listenBridge();                 /* ★ 修复108：先挂上扩展桥（没装扩展就什么都不发生） */
    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'lm-ai-fab';
    fab.id = 'lmAiFab';
    fab.title = '提问（本站速答 / 本机模型 / DeepSeek）';
    fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML = '✨<span class="lm-ai-fab-t">提问</span>';
    fab.addEventListener('click', function () { toggle(); });
    document.body.appendChild(fab);

    panel = document.createElement('div');
    panel.className = 'lm-ai-panel';
    panel.id = 'lmAiPanel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '提问 · 这一页的要点与问答');
    panel.innerHTML = '<div class="lm-ai-head"><b>💬 提问</b>'
      + '<span class="lm-ai-badge">不用 API · 不存 Key</span>'
      /* ★ 修复132：三个小键 —— 开新对话 / 这一页的所有对话（可勾选批量删）/ 面板放大缩小 */
      + '<button type="button" class="lm-ai-hbtn lm-ai-new" title="开一个新对话">＋<span class="lm-ai-hbtn-t"> 新对话</span></button>'
      + '<button type="button" class="lm-ai-hbtn lm-ai-list" title="这一页的对话（可批量删）">☰<span class="lm-ai-hbtn-t"> 对话</span><i class="lm-ai-cnt">0</i></button>'
      + '<button type="button" class="lm-ai-hbtn lm-ai-size" title="面板大小">⤢</button>'
      + '<button type="button" class="lm-ai-x" aria-label="关闭">×</button></div>'
      + '<div class="lm-ai-threads" hidden></div>'
      /* ★ 修复133：⤢ 的四个选项（弹出来选，不用一格一格点） */
      + '<div class="lm-ai-sizemenu" hidden></div>'
      + '<div class="lm-ai-body"></div>'
      /* 左上角的小把手：桌面上拖动可自由缩放；双击回到标准大小 */
      + '<div class="lm-ai-resize" title="拖动缩放 · 双击复位"></div>';
    document.body.appendChild(panel);
    /* ★ 修复119：「展开全文」用事件委托 —— 面板每次都是整段重绘，绑在按钮上重绘一次就失效 */
    panel.addEventListener('click', function (e) {
      const b = (e.target && e.target.closest) ? e.target.closest('.lm-ai-more') : null;
      if (!b) return;
      e.preventDefault();
      const box = b.parentNode;
      const fullEl = box ? box.querySelector('.lm-ai-qfull') : null;
      const shortEl = box ? box.querySelector('.lm-ai-qshort') : null;
      if (!fullEl) return;
      const willOpen = fullEl.hidden;
      fullEl.hidden = !willOpen;
      if (shortEl) shortEl.hidden = willOpen;
      b.textContent = willOpen ? '收起' : (b.getAttribute('data-lbl') || '展开全文');
    });
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
    /* ★ 修复119：横屏 / 放大到桌面宽度时自动解锁，避免「锁上了忘了关」
       （必须放在 mount() 里，不能写在模块顶层 —— node 里 require 本文件时没有 window） */
    window.addEventListener('resize', function () {
      if (!panel || panel.hidden || !isNarrow()) unlockScroll();
      /* ★ 修复135：转屏 / 改窗口大小时，开着的浮层要重新贴到顶栏下沿 */
      if (!panel || panel.hidden) return;
      const sz = panel.querySelector('.lm-ai-sizemenu');
      const tb = panel.querySelector('.lm-ai-threads');
      if (sz && !sz.hidden) placeFly(sz);
      if (tb && !tb.hidden) placeFly(tb);
    });
    const x = panel.querySelector('.lm-ai-x');
    if (x) x.addEventListener('click', function () { toggle(false); });

    /* ---------- ★ 修复132：多对话 / 批量删除 / 面板缩放 ---------- */
    sizeLoad();
    applySize();
    /* 「＋ 新对话」：开一个空的并切过去（旧对话留着） */
    const newBtn = panel.querySelector('.lm-ai-new');
    if (newBtn) newBtn.addEventListener('click', function () {
      const pid = curId();
      if (!pid) return;
      threadNew(pid);
      const box = panel.querySelector('.lm-ai-threads');
      if (box) box.hidden = true;
      const lb = panel.querySelector('.lm-ai-list');
      if (lb) lb.classList.remove('on');
      renderPanel();
      if (typeof window !== 'undefined' && window.LMApp && LMApp.toast) LMApp.toast('新对话已开（☰ 能找回旧的）');
      const inp = panel.querySelector('.lm-ai-input');
      if (inp) inp.focus();
    });
    /* 「☰ 对话」：展开 / 收起这一页的对话列表 */
    const listBtn = panel.querySelector('.lm-ai-list');
    const thBox = panel.querySelector('.lm-ai-threads');
    if (listBtn && thBox) listBtn.addEventListener('click', function () {
      const open = thBox.hidden;
      if (open) { renderThreads(); placeFly(thBox); }
      thBox.hidden = !open;
      listBtn.classList.toggle('on', open);
    });
    const closeTh = function () {
      if (thBox) thBox.hidden = true;
      if (listBtn) listBtn.classList.remove('on');
    };
    /* 列表整段重绘，所以点击 / 勾选都走事件委托 */
    if (thBox) {
      thBox.addEventListener('change', function (e) {
        const el = e.target;
        if (!el || !el.classList) return;
        if (el.classList.contains('lm-ai-thallck')) {
          const want = !!el.checked;
          const cks = thBox.querySelectorAll('.lm-ai-th-ck');
          for (let i = 0; i < cks.length; i++) cks[i].checked = want;
        }
        if (el.classList.contains('lm-ai-thallck') || el.classList.contains('lm-ai-th-ck')) thSyncDel();
      });
      thBox.addEventListener('click', function (e) {
        const b = (e.target && e.target.closest) ? e.target.closest('button') : null;
        if (!b) return;
        const pid = curId();
        if (b.classList.contains('lm-ai-th-go')) {
          if (threadSet(pid, b.getAttribute('data-tid'))) { closeTh(); renderPanel(); }
          return;
        }
        if (b.classList.contains('lm-ai-th-one')) {          /* 删单个：第一次只是「上膛」 */
          if (!b.classList.contains('arm')) {
            b.classList.add('arm');
            b.textContent = '确认？';
            setTimeout(function () {
              if (!b.parentNode) return;
              b.classList.remove('arm');
              b.textContent = '🗑';
            }, 3000);
            return;
          }
          threadDel(pid, [b.getAttribute('data-tid')]);
          renderThreads(); renderPanel();
          if (typeof window !== 'undefined' && window.LMApp && LMApp.toast) LMApp.toast('已删掉这个对话');
          return;
        }
        if (b.classList.contains('lm-ai-th-del')) {          /* 批量删：也要点两次 */
          const ids = [];
          const cks = thBox.querySelectorAll('.lm-ai-th-ck');
          for (let i = 0; i < cks.length; i++) if (cks[i].checked) ids.push(cks[i].getAttribute('data-tid'));
          if (!ids.length) return;
          if (!b.classList.contains('arm')) {
            b.classList.add('arm');
            b.textContent = '再点一次确认删除 ' + ids.length + ' 个';
            setTimeout(function () { thSyncDel(); }, 3000);
            return;
          }
          threadDel(pid, ids);
          renderThreads(); renderPanel();
          if (typeof window !== 'undefined' && window.LMApp && LMApp.toast) LMApp.toast('已删掉 ' + ids.length + ' 个对话');
          return;
        }
        if (b.classList.contains('lm-ai-new2')) {
          threadNew(pid); closeTh(); renderPanel();
          if (typeof window !== 'undefined' && window.LMApp && LMApp.toast) LMApp.toast('开了一个新对话');
          return;
        }
        if (b.classList.contains('lm-ai-th-close')) closeTh();
      });
    }
    /* 「⤢」：弹出四档菜单（标准 / 加宽 / 加高 / 满屏），选完自动收起 */
    const sizeBtn = panel.querySelector('.lm-ai-size');
    const szMenu = panel.querySelector('.lm-ai-sizemenu');
    if (sizeBtn && szMenu) sizeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const open = szMenu.hidden;
      if (open) { renderSizeMenu(); placeFly(szMenu); }
      szMenu.hidden = !open;
      sizeBtn.classList.toggle('on', open);
    });
    if (szMenu) szMenu.addEventListener('click', function (e) {
      const b = (e.target && e.target.closest) ? e.target.closest('.lm-ai-sz-it') : null;
      if (!b) return;
      sizeSet(b.getAttribute('data-size'));
      szMenu.hidden = true;
      if (sizeBtn) sizeBtn.classList.remove('on');
    });
    /* 点别处 / 按 Esc 收起浮层（四档菜单、对话列表）。★ 修复133：只在第一次挂一次监听，
       每次现查当前 DOM —— 否则 renderPanel 重绘一次就多一份监听、还握着已经作废的节点。 */
    if (!outsideHooked) {
      outsideHooked = true;
      document.addEventListener('click', function (e) {
        const t = e.target;
        const sz = panel.querySelector('.lm-ai-sizemenu');
        const sb = panel.querySelector('.lm-ai-size');
        if (sz && !sz.hidden && sz !== t && !sz.contains(t) && !(sb && sb.contains(t))) {
          sz.hidden = true;
          if (sb) sb.classList.remove('on');
        }
        const tb = panel.querySelector('.lm-ai-threads');
        const lb = panel.querySelector('.lm-ai-list');
        if (tb && !tb.hidden && tb !== t && !tb.contains(t) && !(lb && lb.contains(t))) {
          tb.hidden = true;
          if (lb) lb.classList.remove('on');
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        /* 先收浮层：这里有东西开着就别顺手把整个面板也关了 */
        let hit = false;
        const sz = panel.querySelector('.lm-ai-sizemenu');
        const sb = panel.querySelector('.lm-ai-size');
        const tb = panel.querySelector('.lm-ai-threads');
        const lb = panel.querySelector('.lm-ai-list');
        if (sz && !sz.hidden) { sz.hidden = true; if (sb) sb.classList.remove('on'); hit = true; }
        if (tb && !tb.hidden) { tb.hidden = true; if (lb) lb.classList.remove('on'); hit = true; }
        if (hit) { e.stopImmediatePropagation(); e.preventDefault(); }
      });
    }
    /* 左上角把手拖动自由缩放（只在桌面；手机上靠 ⤢ 的四档，避免和页面滚动抢手指） */
    const grip = panel.querySelector('.lm-ai-resize');
    if (grip) {
      let drag = null;
      grip.addEventListener('pointerdown', function (e) {
        if (isNarrow()) return;
        e.preventDefault();
        const r = panel.getBoundingClientRect();
        drag = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
        try { grip.setPointerCapture(e.pointerId); } catch (err) { /* 没有指针捕获也能拖 */ }
        panel.classList.add('is-resizing');
      });
      grip.addEventListener('pointermove', function (e) {
        if (!drag) return;
        const maxW = Math.max(320, Math.min(760, window.innerWidth - 40));
        const maxH = Math.max(320, window.innerHeight - 110);
        const w = Math.max(320, Math.min(maxW, drag.w + (drag.x - e.clientX)));
        const h = Math.max(320, Math.min(maxH, drag.h + (drag.y - e.clientY)));
        sizeMode = 'custom';
        sizeCus = { w: Math.round(w), h: Math.round(h) };
        applySize();
      });
      const stopDrag = function () {
        if (!drag) return;
        drag = null;
        panel.classList.remove('is-resizing');
        sizeSave();
      };
      grip.addEventListener('pointerup', stopDrag);
      grip.addEventListener('pointercancel', stopDrag);
      grip.addEventListener('dblclick', function () {
        sizeMode = 'std'; sizeCus = null; applySize(); sizeSave();
        if (typeof window !== 'undefined' && window.LMApp && LMApp.toast) LMApp.toast('面板回到标准大小');
      });
    }

    /* ★ 修复124：从 DeepSeek 标签页切回来的那一刻，自动把回答读进「粘回」框 ——
       以前必须自己点「粘回回答」再按 Ctrl+V。剪贴板里还是我们复制的那段提问时会跳过，
       所以不会把问题当成回答。读不到（没授权）就安静退出，用户仍可手动粘贴。 */
    const tryAutoBack = function () {
      if (!awaitBack || !panel || document.hidden) return;
      if (Date.now() - awaitBack.at < 1500) return;   /* 刚复制完就切回来 → 剪贴板还是提问本身 */
      const ab = awaitBack;
      readClip().then(function (t) {
        t = String(t || '').trim();
        if (awaitBack !== ab) return;                  /* 期间又问了别的 */
        if (t.length < 40 || t === ab.prompt) return;   /* 太短 / 还是我们的提问 → 不算回答 */
        awaitBack = null;
        if (panel.hidden) toggle(true);                /* 先开面板（会重绘，再填） */
        const pb2 = panel.querySelector('.lm-ai-pastebox');
        const pta2 = panel.querySelector('.lm-ai-pasteta');
        if (pb2) pb2.hidden = false;
        if (pta2) pta2.value = t;
        if (window.LMApp && LMApp.toast) LMApp.toast('读到 ' + t.length + ' 字，确认后点「保存到对话」');
      }, function () { /* 没权限 / 没剪贴板 → 什么都不说 */ });
    };
    window.addEventListener('focus', tryAutoBack);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tryAutoBack(); });

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
    literalHits: literalHits, normPhrase: normPhrase,
    prfExpand: prfExpand, dedupeSent: dedupeSent,
    aiMode: aiMode, setAiMode: setAiMode,
    pageDigest: pageDigest, promptFor: promptFor,
    chatOf: chatOf, chatPush: chatPush, chatClear: chatClear,
    /* ★ 修复132：多对话（每页多个，各存各的）+ 面板大小 */
    threadsOf: threadsOf, threadNew: threadNew, threadSet: threadSet, threadDel: threadDel,
    threadRename: threadRename, curTid: curTid, ensureThread: ensureThread,
    sizeMode: function () { return sizeMode; }, sizeNext: sizeNext, sizeSet: sizeSet,
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
