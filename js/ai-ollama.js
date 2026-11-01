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
  /* kind：ollama = 原生 /api/*；openai = 兼容 /v1/chat/completions；scope：page=连本页正文一起发，question=只发问题 */
  var DEF = { url: 'http://127.0.0.1:11434', model: 'qwen2.5:7b', kind: 'ollama', scope: 'page', on: false };
  /* 只认本机地址：外网域名一律拒绝（就算有人手改 localStorage 也发不出去） */
  var ALLOW = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/i;
  /* ★ 修复126：本机推理服务的「约定端口」—— 浏览器不能扫端口/枚举进程，只能试这些众所周知的口子。
     谁在线、谁放行了本站跨域（CORS），就用谁；都连不上就静默跳过，绝不报错骚扰用户。 */
  var ENDPOINTS = [
    { id: 'ollama', name: 'Ollama', base: 'http://127.0.0.1:11434', kind: 'ollama' },
    { id: 'lmstudio', name: 'LM Studio', base: 'http://127.0.0.1:1234', kind: 'openai' },
    { id: 'llamacpp', name: 'llama.cpp', base: 'http://127.0.0.1:8080', kind: 'openai' },
    { id: 'kobold', name: 'KoboldCpp', base: 'http://127.0.0.1:5001', kind: 'openai' },
    { id: 'vllm', name: 'vLLM', base: 'http://127.0.0.1:8000', kind: 'openai' },
    { id: 'textgen', name: 'text-generation-webui', base: 'http://127.0.0.1:5000', kind: 'openai' },
    { id: 'jan', name: 'Jan', base: 'http://127.0.0.1:1337', kind: 'openai' }
  ];

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

  /* 列某个本机服务里的模型：Ollama 走 /api/tags，其余兼容 /v1/models */
  function listAt(ep, ms) {
    var u = base(ep.base);
    var url = u + (ep.kind === 'ollama' ? '/api/tags' : '/v1/models');
    return fetchT(url, { cache: 'no-store' }, ms || 1500).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (ep.kind === 'ollama') {
        return ((j && j.models) || []).map(function (m) { return String((m && (m.name || m.model)) || ''); }).filter(Boolean);
      }
      return ((j && j.data) || []).map(function (m) { return String((m && (m.id || m.name)) || ''); }).filter(Boolean);
    });
  }
  /* 兼容老接口：只看某个地址（设置面板的「测试连接」用） */
  function probe(c) {
    var cc = c || cfg();
    return listAt({ base: cc.url, kind: cc.kind || 'ollama' }, 6000);
  }
  /* ★ 修复126：并行探测所有约定端口 —— 返回 [{id,name,base,kind,models:[...]}]（连不上的静默丢弃） */
  function detect(ms) {
    var out = [];
    return Promise.all(ENDPOINTS.map(function (ep) {
      return listAt(ep, ms).then(function (models) {
        out.push({ id: ep.id, name: ep.name, base: ep.base, kind: ep.kind, models: models });
      }, function () { /* 没启动 / 被 CORS 拦 / 端口不是默认值：跳过 */ });
    })).then(function () { return out; });
  }
  /* 从模型清单里挑一个「最可能是聊天用、8G 显存跑得动」的 */
  var PREF = ['qwen2.5', 'qwen2', 'qwen', 'llama3.1', 'llama3', 'llama', 'mistral', 'gemma2', 'gemma', 'phi', 'deepseek'];
  function pickBest(list) {
    var cand = (list || []).filter(function (m) { return !/embed|bge|nomic|rerank|clip|vision-only/i.test(m); });
    if (!cand.length) cand = list || [];
    var score = function (m) {
      var s = 0, low = String(m).toLowerCase();
      for (var i = 0; i < PREF.length; i++) if (low.indexOf(PREF[i]) >= 0) { s = 100 - i; break; }
      if (/instruct|chat/.test(low)) s += 8;
      var mb = low.match(/:(\d+(?:\.\d+)?)b/);
      if (mb) {
        var b = parseFloat(mb[1]);
        if (b >= 3 && b <= 9) s += 6;                 /* 8G 显存最舒服的一档 */
        else if (b > 9 && b <= 14) s += 2;
        else if (b > 30) s -= 12;
      }
      if (/70b|405b|mixtral|8x/.test(low)) s -= 20;
      return s;
    };
    return cand.slice().sort(function (a, b) { return score(b) - score(a); })[0] || '';
  }
  /* 一键：探测 → 挑服务 → 挑模型 → 存起来直接能用 */
  function autoDetect() {
    return detect(1500).then(function (list) {
      if (!list.length) return { ok: false, list: [] };
      var withModels = list.filter(function (e) { return e.models && e.models.length; });
      var ep = withModels[0] || list[0];
      return { ok: !!(ep && ep.models && ep.models.length), list: list, ep: ep, model: pickBest(ep && ep.models) };
    });
  }
  function autoConnect() {
    return autoDetect().then(function (r) {
      if (!r.ok) return r;
      var okSave = setCfg({ url: base(r.ep.base), kind: r.ep.kind, model: r.model, on: true });
      r.saved = okSave;
      r.ok = okSave;
      return r;
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

  /* ★ 修复126：粗看显卡 —— 浏览器拿不到显存、更读不了系统信息，只能从 WebGL 型号字符串猜一档。
     只用来「建议下载多大的模型」，不参与任何发送。 */
  function gpu() {
    var o = { name: '', tier: 'none' };
    try {
      var cv = document.createElement('canvas');
      var gl = cv.getContext('webgl2') || cv.getContext('webgl');
      if (gl) {
        var dbg = gl.getExtension('WEBGL_debug_renderer_info');
        o.name = String((dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '');
      }
    } catch (e) { /* 没 WebGL：当作看不出来 */ }
    var n = o.name.toLowerCase();
    if (/rtx\s?(50|40|30)\d\d|rx\s?[67]\d{3}|arc\s?a\d{3}|apple m[1-4]/.test(n)) o.tier = 'high';
    else if (/gtx\s?1[06]|gtx\s?9|rx\s?5[5-9]\d\d|geforce|radeon|nvidia|arc/.test(n)) o.tier = 'mid';
    else if (n) o.tier = 'low';
    return o;
  }
  function suggest(tier) {
    if (tier === 'high') return 'qwen2.5:7b';      /* 8G 上下：7B 跑得动，质量够用 */
    if (tier === 'mid') return 'qwen2.5:3b';
    return 'qwen2.5:1.5b';                          /* 核显也别放弃，1.5B 够答短问题 */
  }
  /* ★ 修复126：网页内直接下载模型（Ollama 的 POST /api/pull，流式进度）——
     这是「自动下载」能做的部分；装 Ollama 本身浏览器做不到（要管理员装软件）。 */
  function pull(name, onProg, ep) {
    var e = null;
    for (var i = 0; i < ENDPOINTS.length; i++) if (ENDPOINTS[i].kind === 'ollama') e = ENDPOINTS[i];
    if (ep && ep.base) e = ep;
    var u = base((e && e.base) || DEF.url);
    var body = { name: String(name || ''), stream: true };
    return fetchT(u + '/api/pull', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }, 1800000).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error('HTTP ' + r.status + (t ? '：' + String(t).slice(0, 140) : ''));
        });
      }
      if (!r.body || typeof r.body.getReader !== 'function') {
        return r.json().then(function (j) {
          if (onProg) onProg({ status: (j && j.status) || '完成', percent: 100 });
          return true;
        });
      }
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = '', pct = 0;
      var pump = function () {
        return reader.read().then(function (res) {
          if (res.done) { if (onProg) onProg({ status: '完成', percent: 100 }); return true; }
          buf += dec.decode(res.value, { stream: true });
          var nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            var line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            var j = null;
            try { j = JSON.parse(line); } catch (eJ) { continue; }
            if (j && j.total) pct = Math.round((j.completed / j.total) * 100);
            if (onProg) onProg({ status: String((j && (j.status || j.error)) || ''), percent: pct });
            if (j && j.error) throw new Error(String(j.error));
          }
          return pump();
        });
      };
      return pump();
    });
  }


  var SYS = '你是“三张活地图”学习站点的助教。只依据用户提供的页面内容回答，'
    + '页面里没有的就直接说没有，绝不要编造；回答用简体中文，简洁、分点。';
  /* 隐私开关：scope=question 时**完全不带页面正文**，只把问题交给本机模型 */
  function userMsg(c, q, digest) {
    return (c.scope === 'question' ? '' : '【页面内容】\n' + String(digest || '') + '\n\n') + '【我的问题】\n' + String(q || '');
  }
  /* 同时吃两种流：Ollama 的 NDJSON 与 OpenAI 兼容的 SSE（data: {...}） */
  function streamLines(r, got) {
    var reader = r.body.getReader(), dec = new TextDecoder(), buf = '';
    var pump = function () {
      return reader.read().then(function (res) {
        if (res.done) return true;
        buf += dec.decode(res.value, { stream: true });
        var nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          var line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          if (line.indexOf('data:') === 0) line = line.slice(5).trim();
          if (!line || line === '[DONE]') continue;
          var j = null;
          try { j = JSON.parse(line); } catch (e) { continue; }
          got(j);
        }
        return pump();
      });
    };
    return pump();
  }
  function ask(q, digest, onText) {
    var c = cfg();
    if (!ALLOW.test(String(c.url || ''))) return Promise.reject(new Error('地址不在白名单（只允许 127.0.0.1 / localhost）'));
    var u = base(c.url);
    var isOll = (c.kind || 'ollama') !== 'openai';
    var body = isOll
      ? {
        model: c.model, stream: true, options: { temperature: 0.2 },
        messages: [{ role: 'system', content: SYS }, { role: 'user', content: userMsg(c, q, digest) }]
      }
      : {
        model: c.model, stream: true, temperature: 0.2,
        messages: [{ role: 'system', content: SYS }, { role: 'user', content: userMsg(c, q, digest) }]
      };
    return fetchT(u + (isOll ? '/api/chat' : '/v1/chat/completions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, 180000).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error('HTTP ' + r.status + (t ? '：' + String(t).slice(0, 160) : ''));
        });
      }
      var all = '';
      var take = function (j) {
        var t = isOll
          ? (j && j.message && j.message.content)
          : (j && j.choices && j.choices[0]
            && ((j.choices[0].delta && j.choices[0].delta.content)
              || (j.choices[0].message && j.choices[0].message.content)));
        if (typeof t === 'string' && t) { all += t; if (onText) onText(all, false); }
      };
      if (!r.body || typeof r.body.getReader !== 'function') {
        return r.json().then(function (j) { take(j); if (onText) onText(all, true); return all; });
      }
      return streamLines(r, take).then(function () { if (onText) onText(all, true); return all; });
    });
  }

  /* 设置面板：自动识别本机服务 → 一键启用；也可手动填地址/模型、下模型、选隐私范围 */
  function openSettings(done) {
    if (typeof document === 'undefined') return;
    var old = document.getElementById('lmLlmCfg');
    if (old) old.remove();
    var c = cfg();
    var g = gpu();
    var wrap = document.createElement('div');
    wrap.id = 'lmLlmCfg';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', '接本机模型');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:1300;background:rgba(0,0,0,.32);'
      + 'display:flex;align-items:center;justify-content:center;padding:16px';
    wrap.innerHTML = '<div style="max-width:560px;width:100%;max-height:88vh;overflow:auto;background:#fff;border-radius:16px;'
      + 'padding:18px 18px 14px;box-shadow:0 18px 60px rgba(0,0,0,.25);font-size:14px;line-height:1.6;text-align:left">'
      + '<h3 style="margin:0 0 6px;font-size:17px">🧠 接本机模型</h3>'
      + '<p style="margin:0 0 8px;color:#6e6e73">模型跑在你自己电脑的显卡上，只跟 127.0.0.1 通信：'
      + '不填 Key、不经过任何服务器。别人打开这个网站看不到这一项。</p>'
      + '<div id="lmLlmProbe" style="background:#f5f5f7;border-radius:12px;padding:10px;margin:8px 0;color:#6e6e73">'
      + '🔍 正在识别本机服务（Ollama / LM Studio / llama.cpp / vLLM / Jan …）…</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button type="button" id="lmLlmAuto" class="btn btn-primary">一键检测并启用</button>'
      + '<button type="button" id="lmLlmGpu" class="btn btn-ghost">我该用多大的模型？</button>'
      + '</div>'
      + '<div id="lmLlmGpuBox" hidden style="color:#6e6e73;margin-top:6px;white-space:pre-wrap"></div>'
      + '<hr style="border:0;border-top:1px solid #ededf0;margin:12px 0">'
      + '<label style="display:block;margin:0 0 4px">地址（只允许本机）</label>'
      + '<input id="lmLlmUrl" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #d2d2d7;border-radius:10px" value="' + String(c.url) + '">'
      + '<label style="display:block;margin:10px 0 4px">模型名</label>'
      + '<input id="lmLlmModel" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #d2d2d7;border-radius:10px" value="' + String(c.model) + '">'
      + '<div style="margin:10px 0 0;color:#6e6e73">发给模型的内容：'
      + '<label style="display:block"><input type="radio" name="lmLlmScope" value="page"' + (c.scope !== 'question' ? ' checked' : '') + '> 本页正文 + 我的问题（答得更准）</label>'
      + '<label style="display:block"><input type="radio" name="lmLlmScope" value="question"' + (c.scope === 'question' ? ' checked' : '') + '> 只发我的问题（最保守，模型看不到页面）</label>'
      + '</div>'
      + '<div id="lmLlmMsg" style="margin:10px 0 0;color:#6e6e73;min-height:20px;white-space:pre-wrap"></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">'
      + '<button type="button" id="lmLlmTest" class="btn btn-ghost">测试连接</button>'
      + '<button type="button" id="lmLlmSave" class="btn btn-ghost">保存并启用</button>'
      + '<button type="button" id="lmLlmPull" class="btn btn-ghost">⬇ 下载推荐模型</button>'
      + '<button type="button" id="lmLlmOff" class="btn btn-ghost">关闭本机模型</button>'
      + '<button type="button" id="lmLlmX" class="btn btn-ghost" style="margin-left:auto">取消</button>'
      + '</div>'
      + '<details style="margin-top:12px"><summary style="cursor:pointer;color:#6e6e73">一个模型都没有？装一次就好（三步）</summary>'
      + '<pre style="white-space:pre-wrap;background:#f5f5f7;border-radius:10px;padding:10px;margin:8px 0 0;font-size:12.5px">'
      + '1) 装 Ollama：https://ollama.com/download（装完它会自动在 11434 端口跑起来）\n'
      + '2) 允许本站跨域（设完重启 Ollama）：\n'
      + '   setx OLLAMA_ORIGINS "' + (typeof location !== 'undefined' ? location.origin : 'https://你的站点') + '"\n'
      + '3) 回来点「⬇ 下载推荐模型」—— 网页里直接下，不用开命令行。</pre></details>'
      + '</div>';
    document.body.appendChild(wrap);
    var q = function (s) { return wrap.querySelector(s); };
    var msg = q('#lmLlmMsg');
    var say = function (t, bad) { if (msg) { msg.textContent = t; msg.style.color = bad ? '#c0392b' : '#2d7a2d'; } };
    var scopeOf = function () {
      var r = wrap.querySelector('input[name="lmLlmScope"]:checked');
      return (r && r.value) === 'question' ? 'question' : 'page';
    };
    var readForm = function () {
      return {
        url: String(q('#lmLlmUrl').value || '').trim(),
        model: String(q('#lmLlmModel').value || '').trim(),
        scope: scopeOf()
      };
    };
    var kindOf = function (u) { return /:11434\/?$/.test(String(u)) ? 'ollama' : 'openai'; };
    var fill = function (b, m) { q('#lmLlmUrl').value = b; if (m) q('#lmLlmModel').value = m; };
    /* 自动识别结果：既有服务列表，也有「一个都没有」的下一步指引 */
    var showProbe = function (list) {
      var box = q('#lmLlmProbe');
      if (!box) return;
      if (!list.length) {
        box.innerHTML = '❓ 没发现正在运行的本机模型服务。<br>'
          + '常见原因：还没装 Ollama / 装完没启动 / 没放行本站跨域（要设 <code>OLLAMA_ORIGINS</code>）。'
          + '<br>装好之后回来再点「一键检测并启用」。';
        return;
      }
      box.innerHTML = '✅ 发现 ' + list.length + ' 个本机服务（点一下就用）：'
        + '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">'
        + list.map(function (e, i) {
          var port = String(e.base).replace(/^https?:\/\/[^:]+:/, '');
          return '<button type="button" class="btn btn-ghost" data-i="' + i + '" style="font-size:12.5px">'
            + e.name + ' · ' + port + '（' + ((e.models && e.models.length) || 0) + ' 个模型）</button>';
        }).join('') + '</div>';
      Array.prototype.forEach.call(box.querySelectorAll('button[data-i]'), function (b) {
        b.addEventListener('click', function () {
          var e = list[Number(b.getAttribute('data-i'))];
          fill(e.base, pickBest(e.models));
          say('已填入 ' + e.name + '，模型 ' + pickBest(e.models) + '。点「保存并启用」即可。');
        });
      });
    };
    detect(1200).then(showProbe, function () { showProbe([]); });
    q('#lmLlmAuto').addEventListener('click', function () {
      say('正在检测并连接…');
      autoConnect().then(function (r) {
        if (!r.ok) {
          showProbe(r.list || []);
          say('没找到可直接用的本机模型。刚装好服务的话，先设 OLLAMA_ORIGINS 再重启它。', true);
          return;
        }
        say('✅ 已启用 ' + r.ep.name + ' 的 ' + r.model + '（' + r.ep.base + '）');
        setTimeout(function () { wrap.remove(); if (typeof done === 'function') done(); }, 700);
      }, function (e) { say('检测失败：' + ((e && e.message) || e), true); });
    });
    q('#lmLlmGpu').addEventListener('click', function () {
      var box = q('#lmLlmGpuBox');
      var tierName = { high: '不错（跑 7B 稳）', mid: '一般（3B 更稳）', low: '较弱（1.5B）', none: '看不出来' };
      box.hidden = false;
      box.textContent = '检测到的显卡：' + (g.name || '（浏览器没给，可能禁用了 WebGL）') + '\n'
        + '档位：' + (tierName[g.tier] || '看不出来') + '\n'
        + '建议模型：' + suggest(g.tier) + '\n'
        + '说明：浏览器**拿不到显存大小**，只能按型号粗估；能不能吃下，跑起来看速度就知道。';
    });
    q('#lmLlmTest').addEventListener('click', function () {
      var f = readForm();
      if (!ALLOW.test(f.url)) { say('地址只能是 127.0.0.1 / localhost（本机服务）', true); return; }
      say('正在连接…');
      probe({ url: f.url, kind: kindOf(f.url) }).then(function (list) {
        if (!list.length) { say('连上了，但一个模型都没有。点「⬇ 下载推荐模型」，或在终端 ollama pull ' + f.model, true); return; }
        var pick = pickModel(list, f.model);
        q('#lmLlmModel').value = pick;
        say('✅ 连上了，共有 ' + list.length + ' 个模型；将使用 ' + pick);
      }, function (e) {
        say('连不上：' + ((e && e.message) || e) + '\n常见原因：服务没启动 / 没设 OLLAMA_ORIGINS / 端口不是默认值', true);
      });
    });
    q('#lmLlmSave').addEventListener('click', function () {
      var f = readForm();
      if (!ALLOW.test(f.url)) { say('地址只能是 127.0.0.1 / localhost（本机服务）', true); return; }
      if (!f.model) { say('请填模型名', true); return; }
      if (!setCfg({ url: f.url, kind: kindOf(f.url), model: f.model, scope: f.scope, on: true })) {
        say('保存失败（无痕模式可能禁用了本地存储）', true); return;
      }
      say('✅ 已启用 ' + f.model + (f.scope === 'question' ? '（只发问题，不带页面正文）' : '（连本页正文一起发）'));
      setTimeout(function () { wrap.remove(); if (typeof done === 'function') done(); }, 700);
    });
    /* ★ 修复126：网页里直接下载模型 —— 不用开命令行，进度就在这一行里走 */
    q('#lmLlmPull').addEventListener('click', function () {
      var btn = q('#lmLlmPull');
      var name = String(q('#lmLlmModel').value || '').trim() || suggest(g.tier);
      q('#lmLlmModel').value = name;
      btn.disabled = true;
      say('开始下载 ' + name + '（先拉 manifest，然后分片下载，几个 GB，耐心等）…');
      pull(name, function (p) {
        say('⬇ ' + name + '\n' + (p.status || '下载中') + '  ' + (p.percent || 0) + '%');
      }).then(function () {
        btn.disabled = false;
        say('✅ ' + name + ' 下载完成。点「保存并启用」，之后提问就用它回答。');
      }, function (e) {
        btn.disabled = false;
        say('下载失败：' + ((e && e.message) || e)
          + '\n若是 CORS/404：确认 Ollama 在跑、地址 http://127.0.0.1:11434、并已设 OLLAMA_ORIGINS。', true);
      });
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
    probe: probe, pickModel: pickModel, ask: ask, openSettings: openSettings,
    /* ★ 修复126：自动识别 / 一键启用 / 显卡估算 / 网页内下载 */
    ENDPOINTS: ENDPOINTS, listAt: listAt, detect: detect, pickBest: pickBest,
    autoDetect: autoDetect, autoConnect: autoConnect, gpu: gpu, suggest: suggest, pull: pull,
    version: '2'
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}));
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).LMOllama;
}
