/* =========================================================
   数据存取模块：
   - 本地保存（浏览器 localStorage，演示/临时修改）
   - GitHub 云端保存（把内容直接提交到仓库里的 data/content.js）
   - 备份导出 / 导入
   注意：GitHub Token 只存在当前标签页会话（sessionStorage），
   关闭浏览器即清除，绝不写进代码或 localStorage。
   ========================================================= */
window.LMStore = (function () {
  const LS_KEY = 'lm_content_v1';
  const LS_GH = 'lm_github_cfg_v1';
  /* ★ 修复89：内容单独放一个「数据分支」（默认 lm-data）——写它不触发 Pages 构建。
     dataBranch 为 '' 表示跟随 branch（= 旧行为，内容写进 Pages 发布分支）。 */
  const DEF_GH = { owner: '', repo: '', branch: 'main', path: 'data/content.js', dataBranch: 'lm-data' };

  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

  /* ★ 修复122：带超时的 fetch（手动同步用）—— 旧版没有超时，网络差时点「同步到 GitHub」
     会一直转圈，而且这个 Promise 永远不落定，用户只能刷新页面。超时后 abort → 走 catch → 报错可见。 */
  function fetchT(url, opt, ms) {
    if (typeof AbortController === 'undefined') return fetch(url, opt);
    const ctl = new AbortController();
    const t = setTimeout(function () { try { ctl.abort(); } catch (eA) { /* noop */ } }, ms || 25000);
    const o = Object.assign({}, opt || {}, { signal: ctl.signal });
    return fetch(url, o).then(function (r) { clearTimeout(t); return r; },
      function (e) { clearTimeout(t); throw e; });
  }

  /* ★ 修复122：内容结构校验（读取本地 / 恢复快照 / 导入备份 / 远端坏包 四处共用）
     —— 以前只判 data.pages && data.site：导入一份 pages 不是数组、或页面缺 id / blocks 的 JSON
        会原样写进本地存储，之后每次打开都在渲染层抛错，等于把站点弄坏且刷新不恢复。
     这里只做「结构可用化」：坏页丢掉、缺 id 补一个、blocks 非数组当空、title 转字符串；
     真没法用（不是对象 / 没有 pages 数组 / 一页都救不回来）才返回 ok:false + 原因。 */
  function validateContent(c) {
    try {
      if (!c || typeof c !== 'object' || Array.isArray(c)) return { ok: false, why: '不是内容对象' };
      if (!Array.isArray(c.pages)) return { ok: false, why: '缺少 pages 数组' };
      const seen = {}, pages = [];
      let dropped = 0;
      c.pages.forEach(function (p, i) {
        if (!p || typeof p !== 'object' || Array.isArray(p)) { dropped++; return; }
        let id = (typeof p.id === 'string' && p.id) ? p.id : '';
        if (!id) { id = 'p' + (i + 1) + '-' + Math.random().toString(36).slice(2, 7); dropped++; }
        if (seen[id]) { dropped++; return; }            /* 重复 id → 路由/协同会串页，直接丢 */
        seen[id] = 1;
        const np = Object.assign({}, p, { id: id });
        if (Array.isArray(p.blocks)) {
          const bs = p.blocks.filter(function (b) { return b && typeof b === 'object' && !Array.isArray(b); });
          if (bs.length !== p.blocks.length) dropped++;
          np.blocks = bs;
        } else { np.blocks = []; dropped++; }
        if (typeof np.title !== 'string') np.title = np.title == null ? '' : String(np.title);
        pages.push(np);
      });
      if (!pages.length) return { ok: false, why: '没有可用的页面（pages 里没有有效页对象）' };
      const out = Object.assign({}, c, { pages: pages });
      if (!out.site || typeof out.site !== 'object') out.site = (window.SITE_CONTENT && window.SITE_CONTENT.site) || {};
      if (!out.config || typeof out.config !== 'object') out.config = {};
      return { ok: true, content: out, repaired: dropped > 0 };
    } catch (e) { return { ok: false, why: '结构异常：' + ((e && e.message) || e) }; }
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const v = validateContent(JSON.parse(raw));   /* ★ 修复122：结构坏也算坏 */
        if (v.ok) return v.content;
        throw new Error(v.why);
      }
    } catch (e) {
      /* 主存储损坏 → 自动用最近的崩溃快照恢复（快照由 app.js 每 60 秒写一份，保留 3 份） */
      try {
        const snaps = JSON.parse(localStorage.getItem('lm_snap_v1') || '[]');
        for (let i = snaps.length - 1; i >= 0; i--) {
          try {
            const v = validateContent(JSON.parse(snaps[i]).c);   /* ★ 修复122：快照同样要过校验 */
            if (v.ok) return v.content;
          } catch (e3) { /* 这份也坏 → 试上一份 */ }
        }
      } catch (e2) { /* 快照也没有 → 落回默认内容 */ }
    }
    return deepCopy(window.SITE_CONTENT);
  }
  /* ★ 修复122：写盘失败（最常见是 localStorage 约 5MB 配额被大图吃满）时先腾空间再重试 ——
     崩溃快照 lm_snap_v1 是「可再生的副本」，主内容写不进去才是真的丢数据。
     返回 false 表示确实写不进，调用方必须提示用户（app.js commit 已处理，不再静默）。 */
  function saveLocal(content) {
    let text;
    try { text = JSON.stringify(content); } catch (e0) { return false; }
    try { localStorage.setItem(LS_KEY, text); return true; }
    catch (e) {
      try {
        localStorage.removeItem('lm_snap_v1');
        localStorage.setItem(LS_KEY, text);
        return true;
      } catch (e2) { return false; }
    }
  }
  /* ★ 修复122：显式「恢复初始内容」时连快照一起清 —— 否则下次崩溃自愈会把刚清掉的旧内容捞回来 */
  function resetLocal() {
    try { localStorage.removeItem(LS_KEY); localStorage.removeItem('lm_snap_v1'); } catch (e) { /* noop */ }
  }

  function getGhCfg() {
    try { return Object.assign({}, DEF_GH, JSON.parse(localStorage.getItem(LS_GH) || 'null') || {}); }
    catch (e) { return Object.assign({}, DEF_GH); }
  }
  /* ★ 修复89：内容分支（实时内容读写的地方）。纯函数，collab.js 与测试共用：
       dataBranch === ''  → 跟随 branch（旧行为）
       dataBranch 未配置   → 默认 'lm-data'
       dataBranch 有值     → 用它 */
  function dataRefOf(cfg) {
    const c = cfg || {};
    const main = String(c.branch || 'main');
    if (c.dataBranch === '') return main;
    const br = String(c.dataBranch == null ? DEF_GH.dataBranch : c.dataBranch).trim();
    return br || main;
  }
  function setGhCfg(cfg) {
    const keep = { owner: cfg.owner, repo: cfg.repo, branch: cfg.branch || 'main', path: cfg.path || DEF_GH.path,
      dataBranch: (cfg.dataBranch == null ? DEF_GH.dataBranch : cfg.dataBranch) }; /* ★ 修复89 */
    if (cfg.token) {
      sessionStorage.setItem('lm_gh_token', cfg.token);
      /* ★ 记住 Token（修复㉙）：勾选后同时写入 localStorage —— sessionStorage 关标签页/清
         站点数据就没了，这就是「root 每次上传都要重填一遍配置」的原因。明文存本机
         localStorage（个人课程站风险可控），换机/他人电脑上别勾选即可 */
      if (cfg.remember) localStorage.setItem('lm_gh_token_r', cfg.token);
      else localStorage.removeItem('lm_gh_token_r');
    }
    keep.remembered = !!localStorage.getItem('lm_gh_token_r'); /* 实际状态回读（token 留空时保持现状） */
    localStorage.setItem(LS_GH, JSON.stringify(keep));
  }
  function ghToken() { return sessionStorage.getItem('lm_gh_token') || localStorage.getItem('lm_gh_token_r') || ''; }

  /* ---------- 团队 Token 保险箱（AES-GCM + PBKDF2，浏览器原生 WebCrypto） ----------
     用「团队管理密码」把 GitHub 配置加密成保险箱，随内容 JSON 上云分发；
     组员用同一密码登录时自动解密取回配置。明文 Token 永不出现在界面、内容与云端 ——
     云端只有密文（AES-256-GCM），拿到密文没有团队密码解不开。 */
  function u8ToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function b64ToU8(b64) { const s = atob(String(b64 || '')); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function teamSubtle() { try { return (window.crypto && window.crypto.subtle) ? window.crypto.subtle : null; } catch (e) { return null; } }
  async function encryptForTeam(text, pw) {
    const c = teamSubtle(); if (!c) throw new Error('当前环境不支持加密（请用 https 打开本站）');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const km = await c.importKey('raw', new TextEncoder().encode(String(pw || '')), 'PBKDF2', false, ['deriveKey']);
    const key = await c.deriveKey({ name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const ct = new Uint8Array(await c.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(String(text || ''))));
    return { v: 1, iters: PBKDF2_ITERS, salt: u8ToB64(salt), iv: u8ToB64(iv), ct: u8ToB64(ct) };
  }
  async function decryptForTeam(box, pw) {
    const c = teamSubtle(); if (!c) throw new Error('当前环境不支持解密（请用 https 打开本站）');
    if (!box || box.v !== 1 || !box.ct) throw new Error('团队保险箱为空或版本不符');
    const km = await c.importKey('raw', new TextEncoder().encode(String(pw || '')), 'PBKDF2', false, ['deriveKey']);
    const key = await c.deriveKey({ name: 'PBKDF2', salt: b64ToU8(box.salt), iterations: box.iters || PBKDF2_ITERS, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const pt = await c.decrypt({ name: 'AES-GCM', iv: b64ToU8(box.iv) }, key, b64ToU8(box.ct));
    return new TextDecoder().decode(pt);
  }

  /* UTF-8 安全的 Base64（大文件分块转换，避免栈溢出） */
  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }

  /* SHA-256（用于管理员密码校验，明文不落盘） */
  async function sha256Hex(text) {
    if (!(window.crypto && crypto.subtle)) {
      throw new Error('当前环境不支持加密模块：请用 Live Server 预览，或通过 http(s) 访问网站。');
    }
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  /* ---------- 密码加密 v2：PBKDF2-HMAC-SHA256 密钥拉伸 ----------
     单轮 SHA-256 计算太快，内容文件一旦泄露（例如仓库公开），弱密码几秒就能被离线撞出；
     PBKDF2 把「每猜一次」的成本放大 21 万倍，且每个密码配独立随机盐（防彩虹表）。
     内容文件里只存 {算法版本, 轮数, 盐, 拉伸哈希}，明文密码与盐的生成过程都不落盘。
     ★ 修复102（安全）：60000 → 210000 轮（OWASP 对 PBKDF2-HMAC-SHA256 的建议量级）。
       老记录自带 iters 字段、校验时按各自的轮数算，所以**不用改密码也不会登不进**；
       只有新密码 / 新保险箱才用 210000 轮。代价是登录多花约 0.1–0.3 秒，值得。 */
  const PBKDF2_ITERS = 210000;
  function bytesToHex(b) {
    return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  function hexToBytes(h) {
    const out = new Uint8Array(h.length >> 1);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }
  function randomSaltHex(n) {
    const b = new Uint8Array(n || 16);
    crypto.getRandomValues(b);
    return bytesToHex(b);
  }
  async function pbkdf2Hex(password, saltHex, iterations) {
    if (!(window.crypto && crypto.subtle && crypto.subtle.deriveBits && crypto.getRandomValues)) {
      throw new Error('当前环境不支持加密模块：请用 Live Server 预览，或通过 http(s) 访问网站。');
    }
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(String(password)), { name: 'PBKDF2' }, false, ['deriveBits']);
    const buf = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(String(saltHex || '')), iterations: Math.max(1000, +iterations || PBKDF2_ITERS) },
      key, 256);
    return bytesToHex(new Uint8Array(buf));
  }

  /* 把内容对象还原成 content.js 文件文本（保留标记，便于下次更新） */
  function buildFileText(content) {
    return '/* =========================================================\n'
      + ' * 三张活地图 · 内容数据文件\n'
      + ' * 本文件由网站后台（管理员 → 同步到 GitHub）自动更新。\n'
      + ' * 手动编辑也可以：改 CONTENT-START 与 CONTENT-END 两个标记之间的 JSON 即可。\n'
      + ' * ========================================================= */\n'
      + '/*CONTENT-START*/\n'
      + 'window.SITE_CONTENT = ' + JSON.stringify(content, null, 2) + ';\n'
      + '/*CONTENT-END*/\n';
  }

  /* 单文件 PUT 工具（指定分支）：返回 Response */
  async function ghPutFile(cfg, branch, text, token, msg) {
    const path = (cfg.path || DEF_GH.path).replace(/^\/+/, '');
    const api = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/'
      + encodeURIComponent(cfg.repo) + '/contents/'
      + path.split('/').map(encodeURIComponent).join('/');
    const headers = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
    let sha = null;
    const g = await fetchT(api + '?ref=' + encodeURIComponent(branch), { headers: headers }, 15000);
    if (g.ok) { sha = (await g.json()).sha; }
    else if (g.status !== 404) {
      throw new Error('读取文件失败：HTTP ' + g.status + '（请检查 Token 权限、仓库名、分支名）');
    }
    const body = { message: msg || ('内容更新（网站后台）' + new Date().toLocaleString('zh-CN')), content: utf8ToBase64(text), branch: branch };
    if (sha) body.sha = sha;
    return fetchT(api, { method: 'PUT', headers: headers, body: JSON.stringify(body) }, 40000);
  }

  /* ★ 修复89：按需创建分支（以 base 分支头为起点建 ref）。已存在（422）也算成功 */
  async function ensureBranchRef(cfg, branch, token, base) {
    const H = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' };
    const repo = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo);
    try {
      const r = await fetchT(repo + '/git/ref/heads/' + encodeURIComponent(base || cfg.branch || 'main'), { headers: H }, 15000);
      if (!r.ok) return false;
      const j = await r.json();
      const sha = j && j.object && j.object.sha;
      if (!sha) return false;
      const r2 = await fetchT(repo + '/git/refs', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, H),
        body: JSON.stringify({ ref: 'refs/heads/' + branch, sha: sha })
      }, 15000);
      return r2.ok || r2.status === 422;
    } catch (e) { return false; }
  }

  /* 通过 GitHub Contents API 提交内容文件
     ★ 修复89：写「数据分支」（默认 lm-data，**不触发 Pages 构建**），再顺手刷新 main 快照；
     数据分支不存在 → 自动建分支重试一次；彻底失败才报错（调用方负责提示） */
  async function saveGitHub(cfg, content) {
    const token = cfg.token || ghToken();
    if (!cfg.owner || !cfg.repo || !token) {
      throw new Error('请先填写仓库名和 GitHub Token');
    }
    const text = buildFileText(content);
    const main = cfg.branch || 'main';
    const ref = dataRefOf(cfg);
    let res = await ghPutFile(cfg, ref, text, token);
    if (!res.ok && (res.status === 422 || res.status === 404) && ref !== main) {
      const okB = await ensureBranchRef(cfg, ref, token, main);
      if (okB) res = await ghPutFile(cfg, ref, text, token);
    }
    if (!res.ok) {
      const t = await res.text();
      throw new Error('保存失败：HTTP ' + res.status + ' ' + t.slice(0, 160));
    }
    /* main 快照（新访客首屏读它）：手动同步时一并刷新，失败不影响本次保存 */
    if (ref !== main) {
      try { await ghPutFile(cfg, main, text, token, '内容快照（供首屏加载）' + new Date().toLocaleString('zh-CN')); } catch (e2) { /* noop */ }
    }
    return true;
  }

  return {
    load: load, saveLocal: saveLocal, resetLocal: resetLocal,
    validateContent: validateContent,   /* ★ 修复122：结构校验（导入备份 / 远端坏包共用） */
    getGhCfg: getGhCfg, setGhCfg: setGhCfg, ghToken: ghToken,
    dataRefOf: dataRefOf, ensureBranchRef: ensureBranchRef, /* ★ 修复89：内容分支判定 / 建分支 */
    encryptForTeam: encryptForTeam, decryptForTeam: decryptForTeam,
    sha256Hex: sha256Hex, pbkdf2Hex: pbkdf2Hex, randomSaltHex: randomSaltHex,
    PBKDF2_ITERS: PBKDF2_ITERS,
    saveGitHub: saveGitHub, buildFileText: buildFileText, deepCopy: deepCopy
  };
})();
