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
      return { id: p.id, label: plain(p.label || p.id), kind: p.kind || '', text: text, tf: tf, n: tk.length || 1 };
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
  /* ---------- ⑨.1 ★ 修复106：DeepSeek 接入（两条路，都不把 Key 写进代码） ----------
     ① 「复制给 DeepSeek 网页」：把本页**结构化正文** + 你的问题拼成提示词，一键复制并打开
        chat.deepseek.com —— 零 Key、零费用，等效于「先让 DeepSeek 看一眼这个网页再提问」。
     ② 「用我的 Key 直连」：Key 只存**这台设备的浏览器**（localStorage），请求直连 api.deepseek.com。
        硬事实：静态网页里没有秘密 —— 写进代码 / 提交到仓库的 Key，任何人 view-source 或打开
        Network 面板都能看到；所以只做「每台设备自己填」，不做「全班共用一把 Key」。
        真要共用，必须放在服务端代理（如 Cloudflare Worker 的 Secret）里，前端只调你的代理。 */
  const AI_KEY = 'lm_ai_key_v1', AI_MODEL = 'lm_ai_model_v1';
  const AI_BASE = 'https://api.deepseek.com';
  function aiKey() { try { return localStorage.getItem(AI_KEY) || ''; } catch (e) { return ''; } }
  function setAiKey(k) {
    try { if (k) localStorage.setItem(AI_KEY, String(k).trim()); else localStorage.removeItem(AI_KEY); } catch (e) { /* noop */ }
  }
  function aiModel() { try { return localStorage.getItem(AI_MODEL) || 'deepseek-chat'; } catch (e) { return 'deepseek-chat'; } }
  function setAiModel(m) { try { localStorage.setItem(AI_MODEL, (m === 'deepseek-reasoner' ? 'deepseek-reasoner' : 'deepseek-chat')); } catch (e) { /* noop */ } }
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
  /* 直连 DeepSeek（OpenAI 兼容 /chat/completions）；失败给出人话原因 */
  function askDeepSeek(q, p) {
    const key = aiKey();
    if (!key) return Promise.reject(new Error('还没填 API Key：点 ⚙ 填一个（只存本机），或者用「📋 复制给 DeepSeek 网页」'));
    const body = {
      model: aiModel(),
      messages: [
        { role: 'system', content: '你是学习站点里的助教，回答必须基于用户给出的页面内容，简洁、分点、不编造。' },
        { role: 'user', content: promptFor(p, q) }
      ],
      temperature: 0.3, stream: false, max_tokens: 900
    };
    return fetch(AI_BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (r.status === 401) throw new Error('API Key 无效或已撤销（401）：点 ⚙ 重新填');
      if (r.status === 402) throw new Error('DeepSeek 账户余额不足（402）：去 platform.deepseek.com 充值后再试');
      if (r.status === 429) throw new Error('请求太频繁（429）：等一下再问，或在 DeepSeek 后台看用量');
      if (!r.ok) throw new Error('DeepSeek 返回 HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      const t = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!t) throw new Error('DeepSeek 没有返回内容（响应格式不对）');
      return String(t).trim();
    });
  }

  function renderPanel() {
    if (!panel) return;
    const body = panel.querySelector('.lm-ai-body');
    if (!body) return;
    const ix = indexNow();
    if (!ix) { body.innerHTML = '<p class="lm-ai-tip">内容还在加载，稍等一下下…</p>'; return; }
    const id = curId();
    const pts = summarize(ix, id, 3);
    const kws = keywords(ix, id, 8);
    const rel = related(ix, id, 3);
    const title = ix.docs.filter(function (d) { return d.id === id; }).map(function (d) { return d.label; })[0] || id;
    let h = '<div class="lm-ai-cur">正在看：<b>' + esc(title) + '</b></div>';
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
    const hasKey = !!aiKey();
    h += '<h4 class="lm-ai-h">💬 问一句' + (hasKey ? '（DeepSeek 会读这一页正文）' : '（没填 Key 时只回答本站写过的内容）') + '</h4>'
      + '<div class="lm-ai-ask"><input class="lm-ai-input" type="search" placeholder="例如：Transformer 是什么？" aria-label="提问">'
      + '<button class="btn btn-primary lm-ai-go" type="button">提问</button></div>'
      + '<div class="lm-ai-row">'
      + '<button class="btn lm-ai-ai" type="button" title="用 DeepSeek 读这一页并总结（需要 Key）">🤖 DeepSeek 总结本页</button>'
      + '<button class="btn lm-ai-copy" type="button" title="把本页正文 + 你的问题复制成提示词，并打开 DeepSeek 网页版，粘贴即可提问（不需要 Key）">📋 复制给 DeepSeek 网页</button>'
      + '<button class="btn lm-ai-set" type="button" title="设置 API Key（只存这台设备）">⚙</button>'
      + '</div>'
      + '<div class="lm-ai-keybox" hidden>'
      + '<input class="lm-ai-key" type="password" placeholder="sk-…（只存这台设备）" autocomplete="off" aria-label="DeepSeek API Key">'
      + '<button class="btn lm-ai-save" type="button">保存</button>'
      + '<button class="btn lm-ai-clear" type="button">清除</button>'
      + '<select class="lm-ai-model" aria-label="模型"><option value="deepseek-chat">deepseek-chat（快 · 便宜）</option><option value="deepseek-reasoner">deepseek-reasoner（推理强 · 慢）</option></select>'
      + '<p class="lm-ai-tip">Key 只保存在<b>这台设备的浏览器</b>（localStorage），不上传、不同步给别人。<b>别写进仓库、别在群里发同一把</b>：静态网页里任何 Key 都等于公开（view-source 就能看到）。要给全班共用，只能放到服务端代理（Cloudflare Worker 的 Secret）。</p>'
      + '</div>'
      + '<div class="lm-ai-ans"></div>';
    body.innerHTML = h;
    const input = body.querySelector('.lm-ai-input');
    const go = body.querySelector('.lm-ai-go');
    const ans = body.querySelector('.lm-ai-ans');
    const kb = body.querySelector('.lm-ai-keybox');
    const kIn = body.querySelector('.lm-ai-key');
    const mdl = body.querySelector('.lm-ai-model');
    if (kIn) kIn.value = aiKey();
    if (mdl) mdl.value = aiModel();
    const setBtn = body.querySelector('.lm-ai-set');
    if (setBtn) setBtn.addEventListener('click', function () {
      if (!kb) return;
      kb.hidden = !kb.hidden;
      if (!kb.hidden && kIn) kIn.focus();
    });
    const saveBtn = body.querySelector('.lm-ai-save');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      setAiKey(kIn && kIn.value);
      setAiModel(mdl && mdl.value);
      if (window.LMApp && LMApp.toast) LMApp.toast(aiKey() ? '✅ Key 已保存到本机（刷新也在，别人看不到）' : '已清除本机 Key');
      renderPanel();
    });
    const clrBtn = body.querySelector('.lm-ai-clear');
    if (clrBtn) clrBtn.addEventListener('click', function () {
      setAiKey('');
      if (window.LMApp && LMApp.toast) LMApp.toast('已清除本机 Key');
      renderPanel();
    });
    if (mdl) mdl.addEventListener('change', function () { setAiModel(mdl.value); });
    const showAI = function (q) {
      ans.innerHTML = '<p class="lm-ai-tip">DeepSeek 正在读这一页…（通常 2–8 秒）</p>';
      askDeepSeek(q, pageById(id)).then(function (txt) {
        ans.innerHTML = '<div class="lm-ai-a lm-ai-a-ai"><p>' + esc(txt).replace(/\n/g, '<br>') + '</p>'
          + '<span class="lm-ai-src">由 DeepSeek（' + esc(aiModel()) + '）基于本页生成 · 请自行核对</span></div>';
      }, function (err) {
        ans.innerHTML = '<p class="lm-ai-tip">' + esc((err && err.message) || '调用失败') + '</p>';
      });
    };
    const runAsk = function () {
      const q = String((input && input.value) || '').trim();
      if (!q) { ans.innerHTML = '<p class="lm-ai-tip">先写个问题，比如「什么是 RAG」。</p>'; return; }
      if (aiKey()) { showAI(q); return; }          /* 有 Key → 大模型（会带上本页正文） */
      const res = ask(ix, q, 3);                   /* 没 Key → 本地抽取式，零联网 */
      ans.innerHTML = res.length
        ? res.map(function (r) {
          return '<div class="lm-ai-a"><p>' + esc(r.answer) + '</p>'
            + '<a class="lm-ai-src" href="#/p/' + encodeURIComponent(r.pageId) + '">出自《' + esc(r.title) + '》· 相关度 ' + r.score + '</a></div>';
        }).join('')
        : '<p class="lm-ai-tip">本站没写过相关内容 —— 换个说法试试；想让 AI 结合通用知识回答，点上面「📋 复制给 DeepSeek 网页」。</p>';
    };
    if (go) go.addEventListener('click', runAsk);
    if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runAsk(); } });
    const aiBtn = body.querySelector('.lm-ai-ai');
    if (aiBtn) aiBtn.addEventListener('click', function () {
      if (!aiKey()) {
        if (kb) kb.hidden = false;
        if (kIn) kIn.focus();
        ans.innerHTML = '<p class="lm-ai-tip">先点 ⚙ 填一个 Key（只存本机），或者用「📋 复制给 DeepSeek 网页」——那条不需要 Key。</p>';
        return;
      }
      showAI(String((input && input.value) || '').trim());
    });
    const cpBtn = body.querySelector('.lm-ai-copy');
    if (cpBtn) cpBtn.addEventListener('click', function () {
      const txt = promptFor(pageById(id), String((input && input.value) || '').trim());
      copyText(txt).then(function () {
        ans.innerHTML = '<p class="lm-ai-tip">已复制这一页正文 + 你的问题（约 ' + txt.length + ' 字）。DeepSeek 网页已在新标签打开 —— 在输入框按 <b>Ctrl/⌘+V</b> 粘贴发送即可。</p>';
        try { window.open('https://chat.deepseek.com/', '_blank', 'noopener'); } catch (e) { /* 弹窗被拦就只给提示 */ }
      }, function () {
        ans.innerHTML = '<p class="lm-ai-tip">复制失败（浏览器限制剪贴板）：手动全选下面这段再复制 ——'
          + '<textarea class="lm-ai-fallback">' + esc(txt) + '</textarea></p>';
      });
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
    fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'lm-ai-fab';
    fab.id = 'lmAiFab';
    fab.title = '智能提炼：要点 / 关键词 / 相关条目 / 站内问答（本地运行，离线可用）';
    fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML = '✨<span class="lm-ai-fab-t">智能提炼</span>';
    fab.addEventListener('click', function () { toggle(); });
    document.body.appendChild(fab);

    panel = document.createElement('div');
    panel.className = 'lm-ai-panel';
    panel.id = 'lmAiPanel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '智能提炼面板');
    panel.innerHTML = '<div class="lm-ai-head"><b>✨ 智能提炼</b>'
      + '<span class="lm-ai-badge">本地 AI · 可选 DeepSeek</span>'
      + '<button type="button" class="lm-ai-x" aria-label="关闭">×</button></div>'
      + '<div class="lm-ai-body"></div>';
    document.body.appendChild(panel);
    const x = panel.querySelector('.lm-ai-x');
    if (x) x.addEventListener('click', function () { toggle(false); });

    /* 内容就绪后自动出浮标（访客与管理员都能用；纯阅读辅助，不写内容） */
    let tries = 0;
    const wait = setInterval(function () {
      if (indexNow()) { clearInterval(wait); fab.hidden = false; if (!panel.hidden) renderPanel(); }
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
    pageDigest: pageDigest, promptFor: promptFor, aiKey: aiKey, setAiKey: setAiKey, aiModel: aiModel, setAiModel: setAiModel,
    askDeepSeek: askDeepSeek,
    mount: mount, version: '1.1'
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
