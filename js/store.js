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
    localStorage.setItem(LS_GH, JSON.stringify(keep));
    if (cfg.token) sessionStorage.setItem('lm_gh_token', cfg.token);
  }
  function ghToken() { return sessionStorage.getItem('lm_gh_token') || ''; }

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
    sha256Hex: sha256Hex, pbkdf2Hex: pbkdf2Hex, randomSaltHex: randomSaltHex,
    PBKDF2_ITERS: PBKDF2_ITERS,
    saveGitHub: saveGitHub, buildFileText: buildFileText, deepCopy: deepCopy
  };
})();
