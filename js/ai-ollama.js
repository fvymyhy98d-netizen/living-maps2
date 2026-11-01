/* =========================================================
   本机大模型连接器（Ollama）—— 可选、可关、只连本机
   ---------------------------------------------------------
   为什么单独一个文件：js/ai.js 有一条硬性护栏（全文 0 处 fetch、不存任何 Key），
   那是「不碰云服务、不泄密」的承诺。本文件只做一件事：把「你的问题 + 这一页正文」
   发给**你自己电脑上**的模型（默认 http://127.0.0.1:11434）。

   · 只允许 127.0.0.1 / localhost（ALLOW 白名单写死在代码里）
   · 不存任何 Key（本机模型不需要 Key）
   · 没装 Ollama / 没启动 / 跨域被拦 → 明确说缺哪一步，站内速答与其余功能一样能用

   装一次（每台电脑）三步：
     1) 装 Ollama：https://ollama.com/download
     2) 拉模型（8GB 显存够用）：ollama pull qwen2.5:7b        （想更快：qwen2.5:3b）
     3) 允许本站跨域（浏览器安全模型要求，不设就会 CORS 报错）：
        Windows:  setx OLLAMA_ORIGINS "https://<你的站点域名>"    然后重启 Ollama
   配好后在「提问」面板点「🧠 接本机模型」→ 测试连接 → 保存并启用。
   ========================================================= */
(function (W) {
  'use strict';
  var KEY = 'lm_llm_cfg_v1';
  var DEF = { url: 'http://127.0.0.1:11434', model: 'qwen2.5:7b', on: false };
  /* 只认本机地址：外网域名一律拒绝（就算有人手改 localStorage 也发不出去） */
  var ALLOW = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/i;

  function cfg() {
    try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || 'null') || {}); }
    catch (e) { return Object.assign({}, DEF); }
  }
  function setCfg(c) {
    var next = Object.assign(cfg(), c || {});
    if (!ALLOW.test(String(next.url || ''))) return false;    /* 白名单：只允许本机 */
    try { localStorage.setItem(KEY, JSON.stringify(next)); return true; } catch (e) { return false; }
  }
  function ready() { var c = cfg(); return !!(c.on && ALLOW.test(String(c.url || '')) && c.model); }
  function base(u) { return String(u || DEF.url).replace(/\/+$/, ''); }

  /* 带超时的 fetch —— 本机服务也会卡（模型在加载 / 显存不够在换页） */
  function fetchT(url, opt, ms) {
    if (typeof AbortController === 'undefined') return fetch(url, opt);
    var ctl = new AbortController();
    var t = setTimeout(function () { try { ctl.abort(); } catch (eA) { /* noop */ } }, ms || 20000);
    var o = Object.assign({}, opt || {}, { signal: ctl.signal });
    return fetch(url, o).then(function (r) { clearTimeout(t); return r; },
      function (e) { clearTimeout(t); throw e; });
  }
  function helpText() {
    return '本机模型是「可选增强」，三步就能接上：\n'
      + '1) 装 Ollama：https://ollama.com/download\n'
      + '2) 打开终端拉一个模型：ollama pull ' + cfg().model + '\n'
      + '3) 让它允许本站跨域（Windows 命令行，设完要重启 Ollama）：\n'
      + '   setx OLLAMA_ORIGINS "' + (typeof location !== 'undefined' ? location.origin : 'https://你的站点') + '"\n'
      + '做完回到这里点「🧠 接本机模型」→ 测试连接。没配也不影响：⚡ 本站速答 照旧可用。';
  }

  /* 看本机装了哪些模型（GET /api/tags） */
  function probe(c) {
    var cc = c || cfg();
    return fetchT(base(cc.url) + '/api/tags', { cache: 'no-store' }, 6000).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      return ((j && j.models) || []).map(function (m) { return String((m && (m.name || m.model)) || ''); }).filter(Boolean);
    });
  }
  /* 名字不完全一致也能用：'qwen2.5:7b' ↔ 'qwen2.5:7b-instruct-q4_K_M' */
  function pickModel(list, want) {
    var w = String(want || '');
    if (!list || !list.length) return '';
    if (list.indexOf(w) >= 0) return w;
    var hit = list.filter(function (m) { return m.indexOf(w) === 0; })[0];
    if (hit) return hit;
    var loose = list.filter(function (m) { return m.indexOf(w.split(':')[0]) === 0; })[0];
    return loose || list[0];
  }

  /* 提问：把这一页正文当上下文（RAG），流式返回 —— onText(当前全文, 是否结束) */
  function ask(q, digest, onText) {
    var c = cfg();
    if (!ALLOW.test(String(c.url || ''))) return Promise.reject(new Error('地址不在白名单（只允许 127.0.0.1 / localhost）'));
    var body = {
      model: c.model,
      stream: true,
      options: { temperature: 0.2 },
      messages: [
        {
          role: 'system',
          content: '你是“三张活地图”学习站点的助教。只依据用户提供的页面内容回答，'
            + '页面里没有的就直接说没有，绝不要编造；回答用简体中文，简洁、分点。'
        },
        { role: 'user', content: '【页面内容】\n' + String(digest || '') + '\n\n【我的问题】\n' + String(q || '') }
      ]
    };
    return fetchT(base(c.url) + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, 180000).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error('HTTP ' + r.status + (t ? '：' + String(t).slice(0, 160) : ''));
        });
      }
      if (!r.body || typeof r.body.getReader !== 'function') {
        return r.json().then(function (j) {
          var t = (j && j.message && j.message.content) || '';
          if (t && onText) onText(t, true);
          return t;
        });
      }
      var reader = r.body.getReader();
      var dec = new TextDecoder();
      var buf = '', all = '';
      var pump = function () {
        return reader.read().then(function (res) {
          if (res.done) { if (onText) onText(all, true); return all; }
          buf += dec.decode(res.value, { stream: true });
          var nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            var line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            var j = null;
            try { j = JSON.parse(line); } catch (e) { continue; }
            var t = j && j.message && j.message.content;
            if (t) { all += t; if (onText) onText(all, false); }
          }
          return pump();
        });
      };
      return pump();
    });
  }

  /* 设置面板：地址 / 模型 / 测试连接 / 保存并启用（内联样式，不依赖别的组件） */
  function openSettings(done) {
    if (typeof document === 'undefined') return;
    var old = document.getElementById('lmLlmCfg');
    if (old) old.remove();
    var c = cfg();
    var wrap = document.createElement('div');
    wrap.id = 'lmLlmCfg';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', '接本机模型');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:1300;background:rgba(0,0,0,.32);'
      + 'display:flex;align-items:center;justify-content:center;padding:16px';
    wrap.innerHTML = '<div style="max-width:520px;width:100%;background:#fff;border-radius:16px;padding:18px 18px 14px;'
      + 'box-shadow:0 18px 60px rgba(0,0,0,.25);font-size:14px;line-height:1.6;text-align:left">'
      + '<h3 style="margin:0 0 6px;font-size:17px">🧠 接本机模型（可选）</h3>'
      + '<p style="margin:0 0 8px;color:#6e6e73">模型跑在你自己电脑的显卡上，只跟本机通信：'
      + '不填 Key、不经过任何服务器。别人打开这个网站不会看到这一项。</p>'
      + '<label style="display:block;margin:8px 0 4px">地址</label>'
      + '<input id="lmLlmUrl" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #d2d2d7;border-radius:10px" value="' + String(c.url) + '">'
      + '<label style="display:block;margin:10px 0 4px">模型名</label>'
      + '<input id="lmLlmModel" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #d2d2d7;border-radius:10px" value="' + String(c.model) + '">'
      + '<div id="lmLlmMsg" style="margin:10px 0 0;color:#6e6e73;min-height:20px;white-space:pre-wrap"></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'
      + '<button type="button" id="lmLlmTest" class="btn btn-ghost">测试连接</button>'
      + '<button type="button" id="lmLlmSave" class="btn btn-primary">保存并启用</button>'
      + '<button type="button" id="lmLlmOff" class="btn btn-ghost">关闭本机模型</button>'
      + '<button type="button" id="lmLlmX" class="btn btn-ghost" style="margin-left:auto">取消</button>'
      + '</div>'
      + '<details style="margin-top:12px"><summary style="cursor:pointer;color:#6e6e73">装一次要做什么（三步）</summary>'
      + '<pre style="white-space:pre-wrap;background:#f5f5f7;border-radius:10px;padding:10px;margin:8px 0 0;font-size:12.5px">'
      + '1) 装 Ollama：https://ollama.com/download\n'
      + '2) 拉模型：ollama pull ' + String(c.model) + '\n'
      + '3) 允许本站跨域（设完重启 Ollama）：\n'
      + '   setx OLLAMA_ORIGINS "' + (typeof location !== 'undefined' ? location.origin : 'https://你的站点') + '"\n'
      + '   然后在本页点「测试连接」。</pre></details>'
      + '</div>';
    document.body.appendChild(wrap);
    var q = function (s) { return wrap.querySelector(s); };
    var msg = q('#lmLlmMsg');
    var say = function (t, bad) { if (msg) { msg.textContent = t; msg.style.color = bad ? '#c0392b' : '#2d7a2d'; } };
    var readForm = function () {
      return { url: String(q('#lmLlmUrl').value || '').trim(), model: String(q('#lmLlmModel').value || '').trim() };
    };
    q('#lmLlmTest').addEventListener('click', function () {
      var f = readForm();
      if (!ALLOW.test(f.url)) { say('地址只能是 127.0.0.1 / localhost（本机服务）', true); return; }
      say('正在连接…');
      probe({ url: f.url }).then(function (list) {
        if (!list.length) { say('连上了，但一个模型都没有。先执行：ollama pull ' + f.model, true); return; }
        var pick = pickModel(list, f.model);
        q('#lmLlmModel').value = pick;
        say('✅ 连上了，共有 ' + list.length + ' 个模型；将使用 ' + pick);
      }, function (e) {
        say('连不上：' + ((e && e.message) || e) + '\n常见原因：Ollama 没启动 / 没设 OLLAMA_ORIGINS / 端口不是 11434', true);
      });
    });
    q('#lmLlmSave').addEventListener('click', function () {
      var f = readForm();
      if (!ALLOW.test(f.url)) { say('地址只能是 127.0.0.1 / localhost（本机服务）', true); return; }
      if (!f.model) { say('请填模型名', true); return; }
      if (!setCfg({ url: f.url, model: f.model, on: true })) { say('保存失败（无痕模式可能禁用了本地存储）', true); return; }
      wrap.remove();
      if (typeof done === 'function') done();
    });
    q('#lmLlmOff').addEventListener('click', function () {
      setCfg({ on: false });
      wrap.remove();
      if (typeof done === 'function') done();
    });
    q('#lmLlmX').addEventListener('click', function () { wrap.remove(); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) wrap.remove(); });
  }

  W.LMOllama = {
    cfg: cfg, setCfg: setCfg, ready: ready, base: base, ALLOW: ALLOW, helpText: helpText,
    probe: probe, pickModel: pickModel, ask: ask, openSettings: openSettings, version: '1'
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}));
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).LMOllama;
}
