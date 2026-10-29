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
  const DEF_GH = { owner: '', repo: '', branch: 'main', path: 'data/content.js' };

  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      /* 主存储损坏 → 自动用最近的崩溃快照恢复（快照由 app.js 每 60 秒写一份，保留 3 份） */
      try {
        const snaps = JSON.parse(localStorage.getItem('lm_snap_v1') || '[]');
        for (let i = snaps.length - 1; i >= 0; i--) {
          try {
            const c = JSON.parse(snaps[i]).c;
            if (c && Array.isArray(c.pages) && c.pages.length) return c;
          } catch (e3) { /* 这份也坏 → 试上一份 */ }
        }
      } catch (e2) { /* 快照也没有 → 落回默认内容 */ }
    }
    return deepCopy(window.SITE_CONTENT);
  }
  function saveLocal(content) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(content)); return true; }
    catch (e) { return false; }
  }
  function resetLocal() { localStorage.removeItem(LS_KEY); }

  function getGhCfg() {
    try { return JSON.parse(localStorage.getItem(LS_GH) || 'null') || Object.assign({}, DEF_GH); }
    catch (e) { return Object.assign({}, DEF_GH); }
  }
  function setGhCfg(cfg) {
    const keep = { owner: cfg.owner, repo: cfg.repo, branch: cfg.branch || 'main', path: cfg.path || DEF_GH.path };
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
     根管理员用「团队管理密码」把 GitHub 配置加密成保险箱，随内容 JSON 上云分发；
     普通管理员登录（同一密码）自动解密取回配置。明文 Token 永不出现在界面、内容与云端 ——
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
     PBKDF2 把「每猜一次」的成本放大 60000 倍，且每个密码配独立随机盐（防彩虹表）。
     内容文件里只存 {算法版本, 轮数, 盐, 拉伸哈希}，明文密码与盐的生成过程都不落盘 */
  const PBKDF2_ITERS = 60000;
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

  /* 通过 GitHub Contents API 提交内容文件 */
  async function saveGitHub(cfg, content) {
    const token = cfg.token || ghToken();
    if (!cfg.owner || !cfg.repo || !token) {
      throw new Error('请先填写仓库名和 GitHub Token');
    }
    const path = (cfg.path || DEF_GH.path).replace(/^\/+/, '');
    const api = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/'
      + encodeURIComponent(cfg.repo) + '/contents/'
      + path.split('/').map(encodeURIComponent).join('/');
    const headers = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' };

    let sha = null;
    const g = await fetch(api + '?ref=' + encodeURIComponent(cfg.branch || 'main'), { headers: headers });
    if (g.ok) { sha = (await g.json()).sha; }
    else if (g.status !== 404) {
      throw new Error('读取文件失败：HTTP ' + g.status + '（请检查 Token 权限、仓库名、分支名）');
    }
    const body = {
      message: '内容更新（网站后台）' + new Date().toLocaleString('zh-CN'),
      content: utf8ToBase64(buildFileText(content)),
      branch: cfg.branch || 'main'
    };
    if (sha) body.sha = sha;
    const res = await fetch(api, { method: 'PUT', headers: headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const t = await res.text();
      throw new Error('保存失败：HTTP ' + res.status + ' ' + t.slice(0, 160));
    }
    return true;
  }

  return {
    load: load, saveLocal: saveLocal, resetLocal: resetLocal,
    getGhCfg: getGhCfg, setGhCfg: setGhCfg, ghToken: ghToken,
    encryptForTeam: encryptForTeam, decryptForTeam: decryptForTeam,
    sha256Hex: sha256Hex, pbkdf2Hex: pbkdf2Hex, randomSaltHex: randomSaltHex,
    PBKDF2_ITERS: PBKDF2_ITERS,
    saveGitHub: saveGitHub, buildFileText: buildFileText, deepCopy: deepCopy
  };
})();
