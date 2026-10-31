/* =========================================================
   主程序：内容渲染 / 路由 / 动画 / 管理员登录
   数据来源：LMStore.load()（优先浏览器里保存的修改，
   否则使用 data/content.js 的初始内容）
   ========================================================= */
/* ★ 修复55：自动更新探针 —— 发版改这个版本号（与 index.html 的 ?v= 同步）。
   页面运行中每 10 分钟用 no-store 强拉一次最新 app.js，版本号变了就自动整页刷新：
   微信内置浏览器等缓存顽固的场景不再一直跑旧界面（内容数据本就每次 no-store 拉新，此探针管的是功能/样式代码） */
var LM_ASSET_VER = '105';
(function () {
  setInterval(function () {
    if (document.hidden) return; /* 后台标签不折腾 */
    if (document.body && (document.body.classList.contains('typing') || document.querySelector('.modal-mask'))) return; /* 输入中/弹窗中不打断 */
    fetch('js/app.js?probe=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
      const m = t && t.match(/LM_ASSET_VER\s*=\s*'([^']+)'/);
      if (m && m[1] && m[1] !== LM_ASSET_VER && !(sessionStorage.getItem('lm_ver_reload') === m[1])) {
        try { sessionStorage.setItem('lm_ver_reload', m[1]); } catch (eS) { /* noop */ }
        location.reload(); /* 新版本自动刷新一次（sessionStorage 防止异常循环刷新） */
      }
    }).catch(function () { /* 离线/网络失败静默跳过 */ });
  }, 600000);
})();
window.LMApp = (function () {
  const app = document.getElementById('app');
  const state = { content: null, admin: false, root: false, pageId: 'home', view: 'auto', ready: false };

  /* 登录凭据（v2 密钥拉伸）：只存 PBKDF2-SHA256 的结果 —— 本通道 60000 轮 + 固定盐，
     团队密码 21 万轮 + 独立随机盐（★ 修复102）。明文不出现在任何页面/代码/文档里；
     「修改密码」不会改动这条通道的凭据，忘记管理密码时仍可用它进入。
     即使整份代码被公开，从这份拉伸哈希反推密码的成本也被放大了数万倍 */
  const MASTER_AUTH = {
    v: 2, iters: 60000,
    salt: '4580218c326409846b91b430901b680a',
    hash: '3b8c87323db231ff7849b9e57012e9ad65b8c42d9eec416eb4e0c75ced63e562'
  };

  /* ---------- 文档历史：撤销 / 重做（最多 60 步，本次打开页面期间有效） ---------- */
  /* ★ 修复77：历史版本要能看出「这一步大概改了什么」——多存一条与快照并行的操作说明（hist.msg），
     记录不到时（协同同步 / 自动归位等）再由 histDiffLabel 对相邻快照做差分摘要兜底 */
  const hist = { arr: [], ts: [], msg: [], ptr: -1 };
  /* 快照比较前剥离协作时间戳 _ts：touchBlock 每次都写 Date.now()，会让「内容其实没变」的
     保存也生成不同快照 —— 撤销时按一次没反应（看着像要按两次）。剥离后比较，一次操作 = 一步撤销。
     用字符串正则剥离（快、无解析）：JSON 里字符串内的引号都带反斜杠转义，不会误伤正文。
     ★ 修复㉔：再把 nbsp(\u00A0) 归一成空格 —— 失焦重序列化常与刚存的源码只差这种不可见空格，
     原样比较会多记一步「假步骤」，撤销就要按两次 */
  function stripTsSnap(snap) {
    return String(snap == null ? '' : snap)
      .replace(/,"_ts":[0-9]+/g, '')
      .replace(/"_ts":[0-9]+,/g, '')
      .replace(/"_ts":[0-9]+/g, '')
      .replace(/\u00A0/g, ' ');
  }
  function hPush(msg) {
    if (!state.content) return;
    const snap = JSON.stringify(state.content);
    const cur = hist.arr[hist.ptr];
    if (cur === snap || stripTsSnap(cur) === stripTsSnap(snap)) {
      /* 内容没变（同一操作被多次 commit / render 尾兜底）：把后到的说明补给当前这一步，历史里就不空着 */
      if (msg && hist.msg && hist.ptr >= 0 && !hist.msg[hist.ptr]) hist.msg[hist.ptr] = String(msg);
      return;
    }
    hist.arr = hist.arr.slice(0, hist.ptr + 1);
    hist.ts = (hist.ts || []).slice(0, hist.ptr + 1);
    hist.msg = (hist.msg || []).slice(0, hist.ptr + 1);
    hist.arr.push(snap);
    hist.ts.push(Date.now());
    hist.msg.push(String(msg || ""));
    if (hist.arr.length > 60) hist.arr.shift();
    if (hist.ts.length > 60) hist.ts.shift();
    if (hist.msg.length > 60) hist.msg.shift();
    hist.ptr = hist.arr.length - 1;
    if (window.LMEditor && LMEditor.renderToolbar) { try { LMEditor.renderToolbar(); } catch (e) { /* noop */ } }
  }
  function canUndo() { return hist.ptr > 0; }
  function canRedo() { return hist.ptr < hist.arr.length - 1; }
  function undo() {
    if (!canUndo()) return;
    const cur = stripTsSnap(hist.arr[hist.ptr]);
    let p = hist.ptr - 1;
    while (p > 0 && stripTsSnap(hist.arr[p]) === cur) p--; /* 跳过「看着一样」的步（仅 _ts / 空拍差异） */
    if (p < 0 || stripTsSnap(hist.arr[p]) === cur) return;
    hist.ptr = p;
    state.content = JSON.parse(hist.arr[hist.ptr]);
    LMStore.saveLocal(state.content);
    /* ★ 撤销结果立即写入 Y.Doc（IDB 持久化 + 远端设备同步收敛）。旧版漏了这一步：
       ymap 里还留着重撤销前的内容，任何 applyKeys 重放（重连 / 离线恢复 / 对端广播 /
       协同重试重启）都会把刚撤销的格式「复活」，与之后的新编辑叠加——
       「明明撤回了，撤掉的样式和新改的样式同时出现」就是它 */
    try { if (window.LMYCollab && LMYCollab.pushLocal) LMYCollab.pushLocal(state.content); } catch (eY) { /* noop */ }
    const y = window.scrollY;
    render(true);
    window.scrollTo(0, y);
    toast('已撤销（可按 Ctrl+Y 重做）');
  }
  function redo() {
    if (!canRedo()) return;
    const cur = stripTsSnap(hist.arr[hist.ptr]);
    let p = hist.ptr + 1;
    while (p < hist.arr.length - 1 && stripTsSnap(hist.arr[p]) === cur) p++; /* 跳过「看着一样」的步 */
    if (stripTsSnap(hist.arr[p]) === cur) return;
    hist.ptr = p;
    state.content = JSON.parse(hist.arr[hist.ptr]);
    LMStore.saveLocal(state.content);
    try { if (window.LMYCollab && LMYCollab.pushLocal) LMYCollab.pushLocal(state.content); } catch (eY2) { /* noop */ } /* 同 undo：重做结果也要全网收敛 */
    const y = window.scrollY;
    render(true);
    window.scrollTo(0, y);
    toast('已重做');
  }

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* 行内排版：交给轻量 Markdown 引擎（**加粗** *斜体* __下划线__ ~~删除线~~ ==高亮== 等） */
  function md(s) {
    if (window.LMMD && LMMD.inlineFmt) return LMMD.inlineFmt(s);
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }
  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.hidden = true; }, 300);
    }, 2600);
  }

  /* ---------- 路由 ---------- */
  function currentId() {
    const m = location.hash.match(/^#\/p\/([A-Za-z0-9_-]+)/);
    if (m) {
      const p = state.content.pages.find(function (x) { return x.id === m[1]; });
      if (p) return p.id;
    }
    return 'home';
  }

  /* ---------- ★ 修复75：第 3 层「嵌套条目」= 带 parent 的子页面 ----------
     数据模型零迁移：子页面就是普通 page 对象多一个 parent:<父页 id>，于是
     表格 / 文本框 / 让位引擎 / 撤销 / 协同 在子页面里**原样可用**，渲染逻辑一行都不用改；
     只是它不进顶部导航、不进首页卡片（renderNav / renderHome 都加了 !p.parent 过滤）。
     同级顺序 = pages 数组里的相对顺序（条目树里的 ↑↓ 就是交换数组位置）。 */
  function pageById(id) {
    const arr = (state.content && state.content.pages) || [];
    for (let i = 0; i < arr.length; i++) { if (arr[i] && arr[i].id === id) return arr[i]; }
    return null;
  }
  function childPages(parentId) {
    const arr = (state.content && state.content.pages) || [];
    return arr.filter(function (p) { return p && p.parent === parentId; });
  }
  /* 祖先链（首页 → … → 本页），面包屑用；20 层护栏防脏数据成环 */
  function pagePath(id) {
    const out = [];
    let cur = pageById(id), guard = 0;
    while (cur && guard++ < 20) { out.unshift(cur); cur = cur.parent ? pageById(cur.parent) : null; }
    return out;
  }
  function pageTitle(p) { return (p && (p.label || p.title)) || (p && p.id) || ""; }
  /* ---------- ★ 修复80：访客也能「‹ 返回」（苹果式左上角返回键） ----------
     全站是 hash 路由（#/p/<id>），翻一页 = 一次 hashchange —— 这里记一条「浏览栈」：
     · 正常点链接 / 卡片 → 入栈；点返回键或浏览器后退 → 截断到今天这一屏（不会重复入栈）
     · 返回目标 = 栈里的上一屏；没有历史（分享链接直接进子页面）时退回它的上级页面
     · 只在本次打开期间有效，刷新即重置（不同设备 / 访客各记各的，互不影响） */
  const navHist = [];
  function navTrack(id) {
    if (!id) return;
    if (navHist[navHist.length - 1] !== id) {
      let at = -1;
      for (let i = navHist.length - 2; i >= 0; i--) { if (navHist[i] === id) { at = i; break; } }
      if (at >= 0) navHist.length = at + 1; /* 回到访问过的页面（返回 / 浏览器后退）→ 截断，不新起一条 */
      else { navHist.push(id); if (navHist.length > 60) navHist.shift(); }
    }
    refreshBackBtn();
  }
  /* 返回目标：{id, label}；无处可返 → null */
  function backTarget() {
    if (navHist.length > 1) {
      const prev = navHist[navHist.length - 2];
      const p = pageById(prev);
      if (prev !== state.pageId && p) return { id: prev, label: pageTitle(p) };
    }
    const cur = pageById(state.pageId);
    if (cur && cur.parent) { /* 直接打开的子页面：退回它的上级 */
      const par = pageById(cur.parent);
      if (par) return { id: par.id, label: pageTitle(par) };
    }
    return null;
  }
  /* 返回键的内容 = 上一屏的标题（iOS 风格：‹ 认知地图）；无可返回时隐藏 */
  function refreshBackBtn() {
    const btn = document.getElementById('navBack');
    if (!btn) return;
    const t = backTarget();
    if (!t) { btn.hidden = true; return; }
    btn.hidden = false;
    const lab = document.getElementById('navBackT');
    if (lab) lab.textContent = t.label || '返回';
    btn.setAttribute('title', '返回「' + (t.label || '上一页') + '」（浏览器后退同效）');
  }
  function navBack() {
    const t = backTarget();
    if (!t) return false;
    if (currentId() === t.id) { /* 极端情况：hash 已经是目标页 → 直接弹栈重绘 */
      navHist.length = Math.max(1, navHist.length - 1);
      render();
      return true;
    }
    location.hash = '#/p/' + t.id; /* hashchange → render → navTrack 自动截断栈 */
    return true;
  }

  document.addEventListener('click', function (e) {
    const t = e.target && e.target.closest ? e.target.closest('#navBack') : null;
    if (!t) return;
    e.preventDefault();
    navBack();
  });


  /* ---------- 导航与页脚 ---------- */
  function renderNav() {
    /* 导航名清空 → 导航里就不显示这个页面（不留空白项）；页面本身仍可从首页卡片进入 */
    const links = state.content.pages.filter(function (p) {
      if (p.id === 'home') return false;
      if (p.parent) return false; /* ★ 修复75：嵌套条目（子页面）不进顶部导航 */
      return !!(p.label || p.title || p.icon);
    });
    document.getElementById('navLinks').innerHTML = links.map(function (p) {
      const label = esc(p.label || p.title || p.icon || '');
      return '<a href="#/p/' + esc(p.id) + '" class="' + (p.id === state.pageId ? 'active' : '') + '">' + label + '</a>';
    }).join('');
    /* 右上角 ⚙：管理模式与界面版本都集成在这里（导航上不再放单独的管理员按钮） */
    const gear = document.getElementById('navGear');
    if (gear) gear.classList.toggle('admin-on', state.admin);
  }
  function renderFooter() {
    const cfg = state.content.config || {};
    const f = cfg.footer || {};
    document.getElementById('footTitle').textContent = state.content.site.title || '三张活地图';
    document.getElementById('footNote').innerHTML = state.admin
      ? '<span' + edSite('footerNote', 1, '页脚一句话') + '>' + esc(f.note || '') + '</span>'
      : esc(f.note || '');
    document.getElementById('footMeta').innerHTML = '人工智能前沿与创新 · 课程大作业'
      + (f.githubUrl ? ' · <a href="' + esc(f.githubUrl) + '" target="_blank" rel="noopener noreferrer">GitHub 仓库</a>' : '');
  }

  /* ---------- 管理模式：可编辑属性（Word 式点击修改） ---------- */
  function edB(i, f, line, extra) {
    return state.admin
      ? ' contenteditable="true" spellcheck="false" data-edit="1" data-bf="' + f + '" data-bi="' + i + '"'
        + (line ? ' data-line="1"' : '') + (extra || '')
      : '';
  }
  function edSite(f, line, ph) {
    return state.admin
      ? ' contenteditable="true" spellcheck="false" data-edit="1" data-site="' + f + '"'
        + (line ? ' data-line="1"' : '') + (ph ? ' data-ph="' + ph + '"' : '')
      : '';
  }
  function edPgf(f, line, ph) {
    return state.admin
      ? ' contenteditable="true" spellcheck="false" data-edit="1" data-pgf="' + f + '"'
        + (line ? ' data-line="1"' : '') + (ph ? ' data-ph="' + ph + '"' : '')
      : '';
  }
  /* 工具栏文字样式 → 行内样式（渐变色时颜色交给渐变类处理） */
  function textExtra(b) {
    const s = b.style || {};
    let css = '';
    if (s.font) css += 'font-family:' + String(s.font).replace(/"/g, "'") + ';';
    if (s.fs) css += 'font-size:' + (+s.fs) + 'px;';
    if (s.align) css += 'text-align:' + s.align + ';';
    if (s.color && !s.grad) css += 'color:' + s.color + ';';
    return css ? ' style="' + css + '"' : '';
  }

  /* ---------- 内容块渲染 ---------- */
  function blockHTML(b, pageId, i) {
    let inner = '';
    switch (b.type) {
      case 'heading': {
        const lv = Math.min(Math.max(+b.level || 2, 1), 3);
        const s = b.style || {};
        const cls = 'b-h b-h' + lv + (s.grad ? ' grad grad-' + esc(s.grad) : '');
        const body = (!s.grad && s.hl)
          ? '<span class="hl" style="background:' + esc(s.hl) + '">' + md(b.text || '') + '</span>'
          : md(b.text || '');
        inner = '<h' + (lv + 1) + ' class="' + cls + '"' + textExtra(b) + edB(i, 'text', 1) + '>'
          + body + '</h' + (lv + 1) + '>';
        break;
      }
      case 'paragraph': {
        const s = b.style || {};
        const cls = 'b-p' + (b.size === 'lead' ? ' lead' : '') + (s.grad ? ' grad grad-' + esc(s.grad) : '');
        const body = (!s.grad && s.hl)
          ? '<span class="hl" style="background:' + esc(s.hl) + '">' + md(b.text || '') + '</span>'
          : md(b.text || '');
        inner = '<p class="' + cls + '"' + textExtra(b) + edB(i, 'text') + (b.text ? '' : ' data-ph="点击输入正文…"') + '>'
          + body + '</p>';
        break;
      }
      case 'callout': {
        const s = b.style || {};
        let st = '';
        if (s.font) st += 'font-family:' + String(s.font).replace(/"/g, "'") + ';';
        if (s.fs) st += 'font-size:' + (+s.fs) + 'px;';
        if (s.align) st += 'text-align:' + s.align + ';';
        if (s.color && !s.grad) st += 'color:' + s.color + ';';
        if (s.hl) st += 'background:' + s.hl + ';';
        inner = '<div class="callout tone-' + esc(b.tone || 'gray') + '"' + (st ? ' style="' + st + '"' : '') + '>'
          + ((b.title || state.admin) ? '<div class="callout-title"' + edB(i, 'ctitle', 1) + (b.title ? '' : ' data-ph="小标题（可留空）"') + '>' + md(b.title || '') + '</div>' : '')
          + '<div class="callout-text' + (s.grad ? ' grad grad-' + esc(s.grad) : '') + '"' + edB(i, 'ctext') + (b.text ? '' : ' data-ph="点击输入内容…"') + '>' + md(b.text || '') + '</div></div>';
        break;
      }
      case 'image': {
        const w = Math.min(Math.max(+b.widthPct || 68, 12), 100);
        const rot = +b.rotate || 0;
        const shift = +b.shift || 0;
        const c = b.crop || { x: 0, y: 0, w: 1, h: 1 };
        const bd = b.border || { w: 0, color: '#d2d2d7', radius: 18 };
        const blur = +b.blur || 0;
        let bs = 'width:' + w + '%;border-radius:' + (+bd.radius || 0) + 'px;';
        let tf = '';
        if (shift) tf += 'translateX(' + shift + 'px)';
        if (rot) tf += (tf ? ' ' : '') + 'rotate(' + rot + 'deg)';
        if (tf) bs += 'transform:' + tf + ';';
        if (+bd.w > 0) bs += 'border:' + (+bd.w) + 'px solid ' + esc(bd.color || '#d2d2d7') + ';';
        const is = 'width:' + (100 / c.w) + '%;height:' + (100 / c.h) + '%;'
          + 'left:' + (-(c.x / c.w) * 100) + '%;top:' + (-(c.y / c.h) * 100) + '%;'
          + (blur ? 'filter:blur(' + blur + 'px);transform:scale(' + (1 + blur * 0.012).toFixed(3) + ');' : '');
        inner = '<figure class="b-fig">'
          + (b.src
            ? '<div class="img-box"' + (state.admin ? ' data-imgsel="' + i + '"' : '') + ' data-rot="' + rot + '" style="' + bs + '">'
              + '<div class="crop-box"><img src="' + esc(b.src) + '" alt="' + esc(b.caption || '') + '" loading="lazy" draggable="false" style="' + is + '"></div>'
              + '</div>'
            : '<p class="muted">' + (state.admin ? '（还没设置图片 — 悬停本块右上角点 ⚙ 设置）' : '（未设置图片地址）') + '</p>')
          + ((b.caption || state.admin) ? '<figcaption' + edB(i, 'caption', 1) + (b.caption ? '' : ' data-ph="点击添加图片说明"') + '>' + esc(b.caption || '') + '</figcaption>' : '')
          + '</figure>';
        break;
      }
      case 'table': {
        const hs = b.headers || [];
        const cw = (b.colW && b.colW.length === hs.length) ? b.colW : hs.map(function () { return 100 / (hs.length || 1); });
        inner = ((b.title || state.admin) ? '<h3 class="block-title"' + edB(i, 'title', 1) + (b.title ? '' : ' data-ph="表格标题（可留空）"') + '>' + esc(b.title || '') + '</h3>' : '')
          + '<div class="table-wrap"><table style="table-layout:fixed"><colgroup>'
          + cw.map(function (w) { return '<col style="width:' + w + '%">'; }).join('')
          + '</colgroup><thead><tr>'
          + hs.map(function (h, ci) {
              return '<th data-c="' + ci + '"' + edB(i, 'header', 1) + '>'
                + md(h)
                + (state.admin && ci < hs.length - 1 ? '<span class="col-grip" data-grip="' + ci + '" title="拖动调整列宽"></span>' : '')
                + '</th>';
            }).join('')
          + '</tr></thead><tbody>'
          + (b.rows || []).map(function (r, ri) {
              return '<tr>' + (r || []).map(function (c, ci) {
                  return '<td data-r="' + ri + '" data-c="' + ci + '"' + edB(i, 'cell', 1) + '>' + md(c) + '</td>';
                }).join('') + '</tr>';
            }).join('')
          + '</tbody></table></div>';
        break;
      }
      case 'chart': {
        inner = ((b.title || state.admin) ? '<h3 class="block-title"' + edB(i, 'title', 1) + (b.title ? '' : ' data-ph="图表标题（可留空）"') + '>' + esc(b.title || '') + '</h3>' : '')
          + '<div class="chart-slot" data-chart="1"></div>'
          + (state.admin ? '<p class="edit-note">图表的数据 / 类型 / 单位请点本块右上角 ⚙ 设置</p>' : '');
        break;
      }
      case 'files': {
        inner = ((b.title || state.admin) ? '<h3 class="block-title"' + edB(i, 'title', 1) + (b.title ? '' : ' data-ph="栏目标题"') + '>' + esc(b.title || '') + '</h3>' : '')
          + '<div class="file-list">'
          + ((b.items || []).map(function (it, ii) {
              return '<a class="file-item" href="' + esc(it.url || '#') + '" target="_blank" rel="noopener noreferrer">'
                + '<span class="file-ico">📎</span>'
                + '<span class="file-name"' + edB(i, 'fname', 1, ' data-ii="' + ii + '" data-ph="附件名称"') + '>' + esc(it.name || '') + '</span>'
                + '<span class="file-arrow">↗</span></a>';
            }).join('') || '<p class="muted">（暂无附件 — 悬停本块右上角点 ⚙ 添加）</p>')
          + '</div>';
        break;
      }
      case 'sources': {
        /* 来源条目带稳定 id：正文里的引用标记 [[r:ID,文字]] 靠 id 对号（同一条来源多处引用 → 同一编号） */
        if (!b.items) b.items = [];
        if (!b.seq) { b.seq = 0; b.items.forEach(function (it) { if (!it.id) it.id = 'r' + (++b.seq); }); }
        inner = ((b.title || state.admin) ? '<h3 class="block-title"' + edB(i, 'title', 1) + (b.title ? '' : ' data-ph="本页来源"') + '>' + esc(b.title || '') + '</h3>' : '')
          + '<ol class="src-list">'
          + ((b.items || []).map(function (it, ii) {
              if (state.admin) {
                return '<li data-ref-id="' + esc(it.id || '') + '"><span' + edB(i, 'slabel', 1, ' data-ii="' + ii + '" data-ph="来源名称"') + '>' + esc(it.label || '') + '</span>'
                  + '<a class="src-link" href="' + esc(it.url || '#') + '" target="_blank" rel="noopener noreferrer" title="打开链接">↗</a></li>';
              }
              return '<li data-ref-id="' + esc(it.id || '') + '"><a href="' + esc(it.url || '#') + '" target="_blank" rel="noopener noreferrer">' + esc(it.label || '') + '</a></li>';
            }).join('') || '<li class="muted">（暂无来源 — 悬停本块右上角点 ⚙ 添加）</li>')
          + '</ol>';
        break;
      }
      case 'md': {
        const s2 = b.style || {};
        const body2 = (window.LMMD && LMMD.mdToHtml) ? LMMD.mdToHtml(b.text || '') : md(b.text || '');
        inner = (state.admin
          ? '<div class="md-editor"><textarea class="md-src" spellcheck="false" placeholder="在这里写 Markdown：# 标题、- 列表、|表格|、**加粗**…">'
            + esc(b.text || '') + '</textarea>'
            + '<div class="md-actions"><span class="md-tip">输入时下方实时预览</span>'
            + '<button type="button" class="btn btn-mini" data-md="save">✓ 转换保存</button></div></div>'
          : '')
          + '<div class="md-body' + (s2.grad ? ' grad grad-' + esc(s2.grad) : '') + '"' + textExtra(b) + '>' + body2 + '</div>';
        break;
      }
      case 'related': {
        /* ★ 修复80：跨母项的「关联条目」—— links 存页面 id，可以勾选**任意母项下**的条目，
           于是「A 母项的子项」能直连「B 母项的子项」，多连几条就是网状；
           点卡片跳过去，左上角「‹ 返回」按浏览历史退回刚才那一屏 */
        const rIds = Array.isArray(b.links) ? b.links : [];
        const rCols = Math.min(Math.max(+b.cols || 3, 1), 4);
        const rList = b.mode === 'list';
        let rCards = rIds.map(function (id2) {
          const k = pageById(id2);
          if (!k || k.id === pageId) return ''; /* 自己连自己没意义 */
          const par = k.parent ? pageById(k.parent) : null;
          const fromTag = par
            ? '<span class="rel-from" title="这条属于另一个母项">来自「' + esc(pageTitle(par)) + '」</span>'
            : '';
          if (rList) {
            return '<a class="entry-row rel-row" href="#/p/' + esc(k.id) + '">'
              + '<span class="entry-ico">' + esc(k.icon || '📄') + '</span>'
              + '<span class="entry-t">' + md(pageTitle(k)) + '</span>'
              + (k.description ? '<span class="entry-d">' + esc(k.description) + '</span>' : '')
              + fromTag + '<span class="entry-go">→</span></a>';
          }
          return '<a class="entry-card rel-card" href="#/p/' + esc(k.id) + '">'
            + '<span class="entry-ico">' + esc(k.icon || '📄') + '</span>'
            + '<span class="entry-t">' + md(pageTitle(k)) + '</span>'
            + (k.description ? '<span class="entry-d">' + esc(k.description) + '</span>' : '')
            + fromTag + '<span class="entry-go">进入 →</span></a>';
        }).filter(Boolean).join('');
        if (!rCards) {
          rCards = state.admin
            ? '<div class="entry-empty">这一栏还没有关联条目 —— 点下面「＋ 挑选关联条目」，勾选任意母项下的条目（跨母项也能连）</div>'
            : '<div class="entry-empty">暂无关联条目</div>';
        }
        const rAdd = state.admin
          ? '<button type="button" class="entry-card entry-add" data-relpick="' + esc(pageId) + ':' + i
            + '" title="打开关联清单：勾选任意母项下的条目，保存后访客点卡片就能跳过去">＋ 挑选关联条目</button>'
          : '';
        inner = ((b.title || state.admin)
            ? '<h3 class="block-title"' + edB(i, 'title', 1) + (b.title ? '' : ' data-ph="栏目标题（可留空）"') + '>' + esc(b.title || '') + '</h3>'
            : '')
          + (b.note ? '<p class="entry-note">' + md(b.note) + '</p>' : '')
          + (rList ? '<div class="entry-list">'
            : '<div class="entry-grid" style="grid-template-columns:repeat(' + rCols + ',minmax(0,1fr))">')
          + rCards + rAdd + '</div>';
        break;
      }
      case 'entries': {
        /* ★ 修复75：嵌套条目块（第 3 层）—— 内容不写死，直接读这一页的子页面：
           在「🗂 条目树」里加一个分支，这里立刻多一张卡片；改名 / 换图标 / 改说明也同步。
           方块本身是普通文档流块（⠿ 拖排序、↑↓ 上下移、拖角调宽、可自由摆放），
           让位引擎（YIELD-V4 锁定段）照常把它当流块处理，不需要任何特判 */
        const allKids = childPages(pageId).slice();
        const only = Array.isArray(b.only) ? b.only : [];
        /* ★ 修复82：only 非空 = 这个框只装「分类」里勾选的下级条目，并按勾选顺序出卡片；
           only 为空 = 显示全部（老行为，零迁移）。此前 only 只参与排序、从不过滤 ——
           于是「同一页放多个分类框」压根做不到，所有子条目只能挤在一个框里往下加。
           过滤时还要求 parent 仍是本页：条目被挪到别处后旧 id 不该继续留在本框 */
        const kids = only.length
          ? only.map(function (id2) { return pageById(id2); })
              .filter(function (k) { return k && k.parent === pageId; })
          : allKids;
        const cols = Math.min(Math.max(+b.cols || 3, 1), 4);
        const isList = b.mode === 'list';
        let cards = kids.map(function (k) {
          const tt = pageTitle(k);
          if (isList) {
            return '<a class="entry-row" href="#/p/' + esc(k.id) + '">'
              + '<span class="entry-ico">' + esc(k.icon || '📄') + '</span>'
              + '<span class="entry-t">' + md(tt) + '</span>'
              + (k.description ? '<span class="entry-d">' + esc(k.description) + '</span>' : '')
              + '<span class="entry-go">→</span></a>';
          }
          return '<a class="entry-card" href="#/p/' + esc(k.id) + '">'
            + '<span class="entry-ico">' + esc(k.icon || '📄') + '</span>'
            + '<span class="entry-t">' + md(tt) + '</span>'
            + (k.description ? '<span class="entry-d">' + esc(k.description) + '</span>' : '')
            + '<span class="entry-go">进入 →</span></a>';
        }).join('');
        if (!kids.length && state.admin) {
          cards = only.length
            ? '<div class="entry-empty">这个分类框里还没有条目 —— 点本块右上角 ✎ 设置，勾选它要装哪些下级条目（也可以把别的框里的条目移过来）</div>'
            : '<div class="entry-empty">这一页还没有嵌套条目 —— 点右上角 ⚙ 设置，或在「🗂 条目树」里给本页加一个分支</div>';
        }
        /* ★ 修复82：分类框里也能新建 —— 建成后自动归到本框（见 editor.js openPageForm 的 onlyBlk）；
           不设限的框（显示全部）就是老行为：新建的子条目自然会出现 */
        const addTile = state.admin
          ? '<button type="button" class="entry-card entry-add" data-entryadd="' + esc(pageId) + '" data-entryadd-blk="' + i + '" title="'
            + (only.length
              ? '在本分类里新建一个下级条目：建成后自动加入本框'
              : '给本页新建一个嵌套条目（等于在条目树里加一个分支）：建好后点进卡片就能用原来的编辑器排版')
            + '">＋ 新建条目</button>'
          : '';
        inner = ((b.title || state.admin)
            ? '<h3 class="block-title"' + edB(i, 'title', 1) + (b.title ? '' : ' data-ph="栏目标题（可留空）"') + '>' + esc(b.title || '') + '</h3>'
            : '')
          + (b.note ? '<p class="entry-note">' + md(b.note) + '</p>' : '')
          + (isList
            ? '<div class="entry-list">'
            : '<div class="entry-grid" style="grid-template-columns:repeat(' + cols + ',minmax(0,1fr))">')
          + cards + addTile + '</div>';
        break;
      }
      case 'hr':
        inner = '<hr class="b-hr">';
        break;
      default:
        inner = '<p class="muted">未知内容块类型：' + esc(b.type) + '</p>';
    }
    const tools = (state.admin && window.LMEditor) ? LMEditor.tools(pageId, i, b) : '';
    /* 自由文本框：像 Word 一样可拖动 / 缩放（b.free = {x%, y px, w%, h px?}） */
    let wrapCls = 'block-wrap reveal', wrapSt = '', wrapX = '';
    if (b.hAlign) wrapCls += ' ha-' + b.hAlign;
    /* ★ 修复56：流块的「拉高 + 内容上下置中」——右下角手柄拖出 b.h（min-height），
       框体变高时内容垂直居中（苹果式留白），下方模块由文档流自动顺移；b.h ≤ 内容高时不生效 */
    if (b.h) { wrapCls += ' v-mid'; wrapSt += 'min-height:' + Math.max(0, +b.h) + 'px;'; }
    if (b.free) {
      wrapCls += ' free-box';
      const f = b.free;
      /* top 的兜底默认 60px 只在“从未设置过 y”时生效；y=0 必须真的渲染在 0，
         否则渲染位置和让位计算（用 f.y）会差 60px，框会凭空压住下面的模块 */
      /* 数据保险丝：历史 bug（框被 fixed 化时误写坐标）可能留下异常大的 y；超过 2 万像素按损坏数据封顶 */
      const yPx = (f.y == null || isNaN(+f.y)) ? 60 : Math.min(+f.y || 0, 20000);
      wrapSt = 'left:' + (+f.x || 0) + '%;top:' + yPx + 'px;width:' + Math.max(10, +f.w || 40) + '%;'
        + (f.h ? 'height:' + (+f.h) + 'px;' : '');
      wrapX = '<span class="fb-grip" title="拖动移动文本框">⠿</span>'
        + '<span class="fb-hd" data-h="e" title="调宽"></span><span class="fb-hd" data-h="w" title="调宽"></span>'
        + '<span class="fb-hd" data-h="s" title="调高"></span><span class="fb-hd" data-h="se" title="拖角调整大小"></span>';
    } else if (b.type !== 'image' && b.width != null) {
      /* Word 式四角拖宽：非图片块记录 width%（让位间距由 adjustFreeLayout 动态计算，不持久化）；
         ★ 修复51：水平对齐由 hAlign 统一裁决（⇤贴左 / ⇆居中 / ⇥贴右）——
         center 用 margin:0 auto（与图片/表格的 ha-center 同视觉），wAlign 仅作取消并排时的回落值：
         hAlign 存在时 wAlign 不再生效，用户点对齐钮的结果永远可预期 */
      const wp = Math.min(100, Math.max(20, Math.round(+b.width) || 100));
      if (wp < 100) {
        const al = b.hAlign || b.wAlign;
        wrapSt += 'width:' + wp + '%;'
          + (al === 'right' ? 'margin-left:auto;'
            : (al === 'center' ? 'margin-left:auto;margin-right:auto;' : ''));
      }
    }
    return '<div class="' + wrapCls + '" data-page="' + esc(pageId) + '" data-idx="' + i + '"' + (wrapSt ? ' style="' + wrapSt + '"' : '') + '>'
      + tools + wrapX + '<div class="block-body">' + inner + '</div></div>';
  }
  /* hero 大标题样式：渐变 / 字体 / 字号 / 颜色 / 对齐（首页与各页通用；align: left|center|right） */
  function heroBits(st, align) {
    st = st || {};
    let cls = '', css = '';
    if (st.grad) cls += ' grad grad-' + esc(st.grad);
    if (st.font) css += 'font-family:' + String(st.font).replace(/"/g, "'") + ';';
    if (st.fs) css += 'font-size:' + (+st.fs) + 'px;';
    if (st.color && !st.grad) css += 'color:' + esc(st.color) + ';-webkit-text-fill-color:' + esc(st.color) + ';';
    if (align) css += 'text-align:' + esc(align) + ';';
    return { cls: cls, css: css ? ' style="' + css + '"' : '' };
  }
  /* ---------- 页面渲染 ---------- */
  function renderPage(p) {
    const s = state.content.site;
    /* 各行独立样式：大标题 p.heroStyle / 页面说明 p.descStyle / 顶部小字 s.subStyle（工具栏点哪行改哪行） */
    const hb = heroBits(p.heroStyle, p.heroAlign);
    const eb = heroBits(s.subStyle);
    const db = heroBits(p.descStyle);
    const off = p.hero === false;
    const pgId = esc(p.id);
    /* ★ 修复75：嵌套条目（子页面）顶部显示面包屑 —— 一眼看出自己在地图第几层，点任一祖先直接回上级 */
    const trail = pagePath(p.id);
    let crumb = '';
    if (p.parent) {
      const kidN = childPages(p.id).length;
      crumb = '<nav class="crumb reveal">' + trail.map(function (a1, ai) {
        const last = ai === trail.length - 1;
        const nm = esc((a1.icon ? a1.icon + ' ' : '') + (pageTitle(a1) || ''));
        return last ? '<span class="crumb-cur">' + nm + '</span>'
          : '<a href="#/p/' + esc(a1.id) + '">' + nm + '</a><span class="crumb-sep">›</span>';
      }).join('') + (kidN ? '<span class="crumb-kids">共 ' + kidN + ' 个下级条目</span>' : '') + '</nav>';
    }
    /* 标题区工具条：与内容块统一（管理模式悬停显示；隐藏后常显"找回"按钮） */
    const heroTools = state.admin
      ? '<div class="block-tools hero-tools">'
        + (off
          ? '<button type="button" data-act="heroshow" data-page="' + pgId + '" title="恢复标题区">👁</button>'
          : '<button type="button" data-act="herohide" data-page="' + pgId + '" title="删除 / 隐藏标题区（可随时恢复）">🗑</button>')
        + '</div>'
      : '';
    /* 空字段不渲染：网站名 / 页面大标题 / 页面说明留空时，页面上不留空白行 */
    let hero = '<header class="page-hero reveal">' + heroTools;
    if (s.title) hero += '<p class="eyebrow"' + eb.css + edSite('title', 1, '网站名') + ' data-hf="subtitle">' + esc(s.title) + '</p>';
    const tShow = p.title || p.label;
    if (tShow) hero += '<h1 class="pg-title' + hb.cls + '"' + hb.css + '>' + (p.icon ? '<span class="pg-ico">' + esc(p.icon) + '</span> ' : '')
      + '<span' + edPgf('title', 1, '页面大标题') + '>' + md(tShow) + '</span></h1>';
    if (p.description) hero += '<p class="page-desc"' + db.css + edPgf('description', 0, '页面说明（可留空）') + '>' + md(p.description) + '</p>';
    hero += '</header>';
    const heroHtml = off ? (state.admin ? '<header class="page-hero hero-off reveal">' + heroTools + '</header>' : '') : hero;
    /* 有自由文本框时，给内容区留出足够高度，避免遮挡 */
    let padB = 0;
    p.blocks.forEach(function (b) { if (b.free) padB = Math.max(padB, (+b.free.y || 0) + (+b.free.h || 200) + 50); });
    padB = Math.min(padB, 4000); /* ★ 修复㉞：钳制占位上限——损坏/漂移的 free 坐标不再把页面撑出天文数字空白 */
    return crumb + heroHtml
      + '<div class="blocks"' + (padB ? ' style="padding-bottom:' + padB + 'px"' : '') + '>'
      + p.blocks.map(function (b, i) {
          /* 单块隔离：任何一个坏块渲染出错都只显示占位，绝不拖垮整页（防崩溃） */
          try { return blockHTML(b, p.id, i); }
          catch (eB) {
            return '<div class="block-wrap" data-idx="' + i + '"><div class="block-err">⚙ 此模块暂时无法显示'
              + '（内容已自动保存，切换页面或刷新后即可恢复）</div></div>';
          }
        }).join('')
      + '</div>'
      + (state.admin ? '<button class="add-block" data-act="add" data-page="' + esc(p.id) + '" type="button">＋ 添加内容块</button>' : '');
  }

  function renderHome() {
    const c = state.content, s = c.site;
    /* 首页入口卡片 = 全部页面（除首页与更新记录）：页面管理加几个模块，这里就同步出几张卡片 */
    /* ★ 修复75：首页卡片只列「第 2 层」导航页 —— 嵌套条目（p.parent）由所属页面里的条目块列出 */
    const maps = c.pages.filter(function (p) { return p.id !== 'home' && p.id !== 'updates' && !p.parent; });
    const first = maps.length ? maps[0].id : 'home';
    const upd = c.pages.find(function (p) { return p.id === 'updates'; });
    /* 各行独立样式：大标题 heroStyle / 顶部小字 subStyle / 点题 topicStyle / 简介 descStyle */
    const hb = heroBits(s.heroStyle, s.heroAlign);
    const eb = heroBits(s.subStyle), tb2 = heroBits(s.topicStyle), db = heroBits(s.descStyle);
    /* 首页特性行卡片：存进 site.homeFeatures（老数据自动迁移），全部可编辑、可增删 */
    if (!Array.isArray(s.homeFeatures) || !s.homeFeatures.length) {
      s.homeFeatures = [
        { icon: '🖐️', title: '可探索', desc: '点击内容，查看含义、作用与关系' },
        { icon: '🔗', title: '相关联', desc: '概念、工具、课程与案例相互链接' },
        { icon: '🔎', title: '可追溯', desc: '重要内容标注来源，区分事实与推断' },
        { icon: '🌱', title: '可更新', desc: '每周检查，让地图随学习持续生长' }
      ];
    }
    const feats = s.homeFeatures;
    let h = '<section class="hero">';
    /* 空字段不渲染：顶部小字 / 大标题 / 点题 / 简介留空时页面上不留空白 */
    if (s.subtitle) h += '<p class="eyebrow"' + eb.css + edSite('subtitle', 1, '顶部小字（课程名等）') + '>' + esc(s.subtitle) + '</p>';
    if (s.title) h += '<h1 class="hero-title' + hb.cls + '"' + hb.css + edSite('title', 1, '网站大标题') + '>' + md(s.title) + '</h1>';
    if (s.topic) h += '<p class="hero-topic"' + tb2.css + edSite('topic', 1, '一句话点题') + '>' + md(s.topic) + '</p>';
    if (s.description) h += '<p class="hero-desc"' + db.css + edSite('description', 0, '网站简介') + '>' + md(s.description) + '</p>';
    h += '<div class="hero-cta">'
      + '<a class="btn btn-primary" href="#/p/' + esc(first) + '">开始探索</a>'
      + (upd ? '<a class="btn btn-ghost-dark" href="#/p/updates">查看更新记录</a>' : '')
      + (state.content.pages.some(function (p) { return p.id === 'feedback'; }) ? '<a class="btn btn-ghost-dark" href="#/p/feedback">反馈与建议</a>' : '')
      + '</div></section>';
    const sec1 = s.homeSection1 != null ? s.homeSection1 : '三张地图，一个外脑。';
    const sec2 = s.homeSection2 != null ? s.homeSection2 : '让地图"活"起来。';
    h += '<section class="section">';
    if (sec1 || state.admin) h += '<h2 class="section-title reveal"' + edSite('homeSection1', 1, '栏目标题（可留空）') + '>' + esc(sec1) + '</h2>';
    h += '<div class="map-cards">'
      + maps.map(function (p) {
          const t = p.title || p.label || (p.icon || '未命名页面');
          return '<a class="map-card reveal" href="#/p/' + esc(p.id) + '">'
            + '<span class="card-ico">' + esc(p.icon || '🗺️') + '</span>'
            + '<h3>' + esc(t) + '</h3>'
            + (p.description ? '<p>' + esc(p.description) + '</p>' : '')
            + '<span class="card-link">进入地图 →</span></a>';
        }).join('')
      + '</div></section>';
    h += '<section class="section">';
    if (sec2 || state.admin) h += '<h2 class="section-title reveal"' + edSite('homeSection2', 1, '栏目标题（可留空）') + '>' + esc(sec2) + '</h2>';
    h += '<div class="feature-grid">'
      + feats.map(function (f, i) {
          const del = state.admin ? '<button type="button" class="feat-x" data-featdel="' + i + '" title="删除这张卡片（Ctrl+Z 可撤销）">✕</button>' : '';
          return '<div class="feature reveal">' + del
            + '<span class="fi"' + edSite('homeFeatures.' + i + '.icon', 1, '图标') + '>' + esc(f.icon || '') + '</span>'
            + '<h4' + edSite('homeFeatures.' + i + '.title', 1, '卡片标题') + '>' + esc(f.title || '') + '</h4>'
            + '<p' + edSite('homeFeatures.' + i + '.desc', 0, '卡片说明') + '>' + esc(f.desc || '') + '</p></div>';
        }).join('')
      + (state.admin ? '<button type="button" class="feat-add reveal" id="featAdd" title="添加一张卡片"><span>＋</span>添加卡片</button>' : '')
      + '</div></section>';
    return h;
  }

  /* ═════════════════════════════════════════════════════════════════════
     🔒🔒🔒 已锁定 · YIELD-V4 拖拽让位（2026-10-27 验证通过，用户确认效果良好）
     从这里到 endFreeDrag 结束（freeScan / freeDecide / applyFreeScan /
     adjustFreeLayout / beginFreeDrag / endFreeDrag），加上 editor.js 的 3 个
     拖拽接入点、style.css 里的 .free-box / .no-measure-anim / margin-top
     过渡规则，是一个整体 —— ★ 别只改其中一处、别随手重构！
     改动前必须重跑 node test_yield.js（须全部 PASS），并真机复核：
     拖动实时跟随 / 快甩不抖 / 松手零跳 / 横向拖开平滑回弹。
     ═════════════════════════════════════════════════════════════════════ */
  /* ---------- 自由文本框动态让位 v4 ----------
     框压住哪个文档流块，就给那个块临时腾出空间；框移走后空间自动消失（回弹）。
     ★ 抖动根因（v3 真机实测）：v3 每次重算都要「挂 no-measure-anim → 读布局 → 摘除」，
     这个同一任务内的挂/摘会让浏览器在过渡进行中「取消动画并从旧目标值重新起步」，
     于是每 110ms 就弹跳一次 —— 这就是拖动时下面的模块一直抖的原因。
     v4 方案（拖拽会话快照）：
       · 拖拽开始时测量一次「自然基线」几何（此刻布局静止，测得准）；
       · 拖拽中的每次重算 = 纯计算（快照 + 框实时位置 + 前缀和推算），完全不读流块布局
         → 流块的 margin 过渡从头到尾不被打断，每帧从当前动画值平滑重定目标 = 苹果式跟随；
       · 松手用同一快照收尾，目标值与最后一帧相同 → 零跳动。 */
  var FREE_GAP = 16;
  /* ★ 修复70 保险丝：data-idx 是「DOM 包裹 ↔ 块数据」的唯一映射，必须与 DOM 上的类别（.free-box）
     一致。历史上排序代码回写不全时会出现「自由框包裹指向流块数据 / 流块包裹指向自由框数据」甚至
     两个包裹同下标 —— 引擎若照单全收，就会把流块当自由框：让位整页失效，块直接压在框上
     （用户报的"文本框和表格重叠了"）。这里对不一致的包裹直接返回 null（本次不参与，console 留痕），
     由整页重绘（render）自愈 */
  function wrapBlock(page, w) {
    const b = page.blocks[+w.getAttribute('data-idx')];
    if (!b) return null;
    if (!!b.free !== w.classList.contains('free-box')) {
      try {
        console.warn('[让位保险丝] data-idx 与 DOM 类别不一致，本次跳过该块（整页重绘即自愈）',
          { idx: +w.getAttribute('data-idx'), 类: String(w.className) });
      } catch (eM) { /* noop */ }
      return null;
    }
    return b;
  }
  /* 一次性测量（仅拖拽开始与 渲染/窗口缩放/对齐操作 等静态时刻调用）：
     ★ 修复68（松手/抓框时下面的块「跳上去又弹下来」）：旧版先把所有流块的 margin-top 清零再量基线，
       而 margin-top 上带着 0.4s 过渡 → 浏览器按「归零后的位置」起步、再动画回让位量，
       视觉就是「跳上去又弹下来」。改为**完全不写 DOM**：
         · 自然顶端 = 实测顶端 − 上游（含自己）全部让位量之和 —— 与「清零后测量」数学等价
           （flex 列里每个块的 margin-top 会把自己及后续块一起推下，前缀和正好还原）；
         · 每个块当前的让位量取 computedStyle：过渡进行中它返回动画当前值，
           与同一时刻的矩形自洽 → 不会因「动画中途测量」而低估基线（修复㊾ 的老坑）。
       好处：不打断正在跑的过渡、不产生「归零帧」，松手时下面的块只做一次连续动画。
       注意：没有自由框时仍要把残留让位清掉（框被删/取消自由摆放后，让位必须归零） */
  function freeScan(col) {
    const page = state.content.pages.find(function (x) { return x.id === state.pageId; });
    if (!page || !page.blocks) return null;
    const flows = [], frees = [];
    col.querySelectorAll(':scope > .block-wrap').forEach(function (w) {
      const b = wrapBlock(page, w); /* ★ 修复70：映射/类别不一致的包裹一律跳过（见 wrapBlock） */
      if (!b) return;
      if (b.free) frees.push({ b: b, w: w });
      else flows.push({ b: b, w: w });
    });
    if (!frees.length) {
      /* 页面上已没有自由框：残留让位一次性清掉（关过渡执行，不产生动画） */
      if (flows.some(function (f) { return f.w.style.marginTop; })) {
        col.classList.add('no-measure-anim');
        flows.forEach(function (f) { if (f.w.style.marginTop) f.w.style.marginTop = ''; });
        void col.offsetWidth;
        col.classList.remove('no-measure-anim');
        void col.offsetWidth;
      }
      return null;
    }
    const sy = window.scrollY || window.pageYOffset || 0;
    const colTop = col.getBoundingClientRect().top + sy;
    let accM = 0; /* ★ 修复68：上游让位量前缀和（含自己） */
    flows.forEach(function (f) {
      const r = f.w.getBoundingClientRect();
      const m = parseFloat(getComputedStyle(f.w).marginTop) || 0;
      accM += m;
      f.natTop = r.top + sy - accM; /* ★ 修复68：反推自然基线（不清零 margin，零跳动） */
      f.h = r.height;
      f.left = r.left; f.right = r.right;
      f.m0 = 0;
    });
    return { col: col, colTop: colTop, flows: flows, frees: frees };
  }
  /* 纯计算核心（不碰 DOM；自动测试直接从源码提取本函数做验证）。
     规则与 v3 完全一致：主块 = 文档顺序第一个被框上缘压住的块；
     新主块需压过其下缘 24px（滞回），上一轮主块阈值 0（保持线）；让位量 = 框下端 - 块当前顶端（连续）；
     本轮未被任何框选中的块 margin 归零（回弹）。
     ★ 修复㉔ 多框夹缝扩展：并排的两框高矮不一时，矮框先把块推开、高框后到时块仍压在高框下
     （旧规则「每块只推一次」导致夹缝）→ 已推块若仍被本框压住，让位量抬到本框下端（取 max，幂等）。 */
  var freeDecide = function (flows, frees) {
    const margins = flows.map(function (f) { return f.m0 || 0; });
    const host = new Array(frees.length).fill(-1);
    const pushed = new Set(); /* 多框防重复：一次调整里每个块最多被推一次 */
    frees.map(function (v, k) { return k; })
      .sort(function (a, b) { return frees[a].top - frees[b].top; })
      .forEach(function (k) {
        const fd = frees[k];
        let acc = 0; /* 前缀和：上方块已被推下的量，累加进下方块的当前顶端 */
        for (let i = 0; i < flows.length; i++) {
          const f = flows[i];
          const top = f.natTop + acc, bot = top + f.h;
          let hit = false;
          if (!pushed.has(i) && f.h >= 4) {
            const ox = Math.min(fd.right, f.right) - Math.max(fd.left, f.left);
            /* 图表/图片真压上（>2px）就让位；普通块水平擦边 16px 内不推 */
            if (ox > ((f.type === 'chart' || f.type === 'image') ? 2 : 16)) {
              const thr = (i === fd.prevIdx) ? 0 : 24;
              if (fd.top < bot - thr) {
                const need = Math.round(fd.bot - top);
                if (need > 0) margins[i] = need;
                host[k] = i;
                pushed.add(i);
                hit = true;
              }
            }
          } else if (pushed.has(i) && f.h >= 4) {
            /* ★ 修复㉔（多框夹缝）：块已被另一个较矮的框推开、但仍被本框压住
               → 让位量抬到本框下端（取 max 不叠加，幂等）；动画仍走 margin 过渡，其余零改动 */
            const ox2 = Math.min(fd.right, f.right) - Math.max(fd.left, f.left);
            if (ox2 > ((f.type === 'chart' || f.type === 'image') ? 2 : 16)) {
              const thr2 = (i === fd.prevIdx) ? 0 : 24;
              const topNow = top + margins[i]; /* 含本轮已被推的量 = 块当前实际顶端 */
              if (fd.top < topNow + f.h - thr2 && fd.bot > topNow) {
                const need2 = Math.round(fd.bot - top);
                if (need2 > margins[i]) { margins[i] = need2; host[k] = i; }
              }
            }
          }
          if (hit) break; /* 只推第一个块，后续块由文档流自然推下 */
          acc += margins[i];
        }
      });
    return { margins: margins, host: host };
  };
  /* 用快照算一轮并写回。拖拽中框自身过渡已关（.free-drag）→ 框矩形读得准；
     全程不读流块布局 → 流块过渡动画从不被打断（治抖关键）。 */
  function applyFreeScan(S) {
    const flows = S.flows, frees = S.frees;
    /* ★ 修复67：自由框「随上文一起下移」的记账数据（供松手时的 commitFreeRide 烘焙，逐帧不动框位置）。
       框的位置是绝对像素，被让位的流块推开后框本身不动，流块就会从框身下钻过去排到框下面
       （「前置基础」钻到「核心概念速览」下面、上下顺序被翻掉）。位移 = 框上方「原本整块都在框顶之上」
       的流块让位量之和 —— 只累计这类块：否则框自己压出来的让位会推着自己跑（死循环） */
    S.order = new Map();
    Array.prototype.slice.call(S.col.querySelectorAll(':scope > .block-wrap')).forEach(function (w, i) { S.order.set(w, i); });
    S.flowGeo = flows.map(function (f) {
      return { w: f.w, b: f.b, oi: S.order.get(f.w) || 0, natTop: f.natTop, h: f.h, m: 0 };
    });
    frees.forEach(function (fd) {
      fd.top = S.colTop + (+fd.b.free.y || 0);
      fd.h = fd.w.offsetHeight || 60;
      fd.bot = fd.top + fd.h + FREE_GAP;
      const r = fd.w.getBoundingClientRect();
      fd.left = r.left; fd.right = r.right;
    });
    const res = freeDecide(
      flows.map(function (f) {
        return { natTop: f.natTop, h: f.h, left: f.left, right: f.right, type: f.b.type, m0: f.m0 };
      }),
      frees.map(function (fd) {
        const pi = flows.findIndex(function (f) { return f.w === fd.w._freeHost; });
        return { top: fd.top, bot: fd.bot, left: fd.left, right: fd.right, prevIdx: pi };
      })
    );
    flows.forEach(function (f, i) {
      const m = res.margins[i];
      if (m !== (parseFloat(f.w.style.marginTop) || 0)) f.w.style.marginTop = m + 'px';
      S.flowGeo[i].m = m; /* ★ 修复67：记下本轮实际让位量，供 commitFreeRide / 记账比对 */
    });
    frees.forEach(function (fd, k) {
      fd.w._freeHost = res.host[k] >= 0 ? flows[res.host[k]].w : null;
    });
  }
  function adjustFreeLayout() {
    const col = app.querySelector('.blocks');
    if (!col) return;
    let S = col._freeSession;
    /* ★ 修复66：丢手的会话自动作废 —— 拖到窗口外松开 / Alt+Tab / pointercancel 会吞掉 mouseup，
       让位会话就永久挂着：之后所有重算都吃「拖动开始时」的过期快照（内容改过不重新测量、
       块的基线高度是旧的）→ 让位量算错 → 块间大空隙/叠住，点别的块还会被残留让位撞飞。
       判定：有会话、但页面上没有任何 .free-drag（没人在拖）、且超过 2.5 秒没被刷新 → 泄漏，弃用 */
    if (S && !col.querySelector('.free-drag') && Date.now() - (S.ts || 0) > 2500) {
      col._freeSession = null; S = null;
    }
    const SS = S || freeScan(col);
    if (!SS) return;
    SS.ts = Date.now();
    applyFreeScan(SS);
    col._lastScan = SS; /* ★ 修复67：松手后 commitFreeRide 用这份扫描（含本轮让位量）烘焙框的随动位移 */
  }
  /* ★ 修复㉜（手机端并排重叠）：freeDecide 的 24px 滞回是防抖设计（test_yield B 场景锁死，🔒 锁定段一字未动），
     但「深压→浅压」回弹时块顶端会钻进框底最多 24px，手机上很明显（「下面东西飞上去和并排框重叠」）。
     这里在锁定段外做显示层兜底：布局计算后用实测矩形复查，凡「框压块（水平重叠>16px）」就把块顶端
     抬到框下端 —— 只抬不降（无滞回也不会抖），freeDecide 与 YIELD-V4 让位引擎零改动 */
  function fixFreeOverlapVisual() {
    try {
      const col = app.querySelector('.blocks');
      if (!col || col._freeSession) return; /* 拖拽会话中不跑（每帧路径），松手后 endFreeDrag 会再调 */
      const page = state.content.pages.find(function (x) { return x.id === state.pageId; });
      if (!page || !page.blocks) return;
      const flows = [], frees = [];
      col.querySelectorAll(':scope > .block-wrap').forEach(function (w) {
        const b = wrapBlock(page, w); /* ★ 修复70：映射/类别不一致的包裹一律跳过（见 wrapBlock） */
        if (!b) return;
        (b.free ? frees : flows).push({ b: b, w: w });
      });
      if (!frees.length) return;
      const sy = window.scrollY || window.pageYOffset || 0;
      const colTop = col.getBoundingClientRect().top + sy;
      const mobile = document.body && document.body.classList.contains('mobile-view');
      /* ★ 修复㉞：手机端并排组竖排 —— 两个 50% 框在窄屏上互相挤压、表格类内容折行爆高，
         是「手机并排排版乱」的直接来源。只在显示层把同组框按并排时的左右顺序（free.gi）
         改为上下全宽堆叠，数据模型一字不改 —— 桌面端照旧并排 */
      if (mobile) {
        const groups = {};
        frees.forEach(function (fd) { const g = fd.b.free.g; if (g != null) (groups[g] = groups[g] || []).push(fd); });
        Object.keys(groups).forEach(function (g) {
          const arr = groups[g].sort(function (a, c) { return (+a.b.free.gi || 0) - (+c.b.free.gi || 0); });
          let gy = Math.min.apply(null, arr.map(function (fd) { return +fd.b.free.y || 0; }));
          arr.forEach(function (fd) {
            fd.w.style.left = '1%'; fd.w.style.width = '98%'; fd.w.style.top = gy + 'px';
            gy += (fd.w.offsetHeight || 60) + 12;
          });
        });
      }
      frees.forEach(function (fd) {
        const r = fd.w.getBoundingClientRect();
        fd.top = r.top + sy; /* ★ 修复㉞：改用实测矩形（竖排重排后数据 y 已过时） */
        fd.h = r.height;
        fd.bot = fd.top + fd.h;
        fd.left = r.left; fd.right = r.right;
      });
      /* ★ 修复㉞：漂移自愈 —— 自由框的 y 是并排/拖动当时的绝对 px，页面内容一变（手机窄屏折行、
         上方内容增删）框就可能远远漂出文档流：表现为页面上出现巨大空白、怎么滚都找不到那个框。
         top 超过流内容底部 800px 的框判定为漂移，整组摘掉 free 回归文档流（数据自愈 + 落盘 +
         撤销基准），并提示一次。这治的是「并排一下就显示不了 / 空白一大截」的根 */
      /* ★ 修复㊹曾加「孤儿让位回收」，实测证实有害已回滚（修复㊾）：margin-top 带 0.3s 过渡，
         过渡进行中用 getBoundingClientRect 还原 natTop 会偏移 → 误判「无框压」→ 误清正在
         让位的 margin（重叠出现）→ 触发额外全量重算（margin 动画整体重放 = 乱飞）→
         布局在抓框前后持续抖动（拖动与鼠标差一个身位）。孤儿 margin 的根因路径
         （协同局部刷新等）本就会在末尾走 adjustFreeLayoutSafe 全量重算，此处不再重复 */
      let healed = false;
      const flowBottom = flows.length
        ? Math.max.apply(null, flows.map(function (f) { return f.w.getBoundingClientRect().bottom + sy; }))
        : colTop;
      frees.forEach(function (fd) {
        if (!fd.b.free) return;
        if (fd.top > flowBottom + 800) {
          /* ★ 修复69：自愈是唯一会把「浮动文本框」变回「普通文档流块」的地方（表现：框突然消失、
            内容跑到页面/块列表末尾）。误触发时这里留一条现场日志，便于定位（框顶/内容底/阈值） */
          try {
            console.warn('[布局自愈] 自由框判定漂出页面范围 → 已归还文档流',
              { 框顶: Math.round(fd.top), 内容底: Math.round(flowBottom), 触发阈值: Math.round(flowBottom + 800), 摘要: String(fd.b.title || fd.b.text || '').slice(0, 20) });
          } catch (eW) { /* noop */ }
          const g = fd.b.free.g;
          frees.forEach(function (fd2) {
            if (!fd2.b.free) return;
            if (fd2.b === fd.b || (g != null && fd2.b.free.g === g)) {
              delete fd2.b.free;
              renderBlockAt(page.id, page.blocks.indexOf(fd2.b));
            }
          });
          healed = true;
        }
      });
      if (healed) {
        try { LMStore.saveLocal(state.content); hPush('模块漂出页面，已自动归位'); } catch (eH) { /* noop */ }
        toast('⚠️ 有模块漂出了页面范围，已自动归位到文档流（原并排/自由摆放已解除）');
        setTimeout(function () { adjustFreeLayoutSafe(); }, 60); /* 归位后按新布局重算让位 */
        return; /* 本帧让位几何已失效 */
      }
      /* ★ 修复㉟：框压流块的消解改为「推框」而非「抬块」——此前兜底抬 margin 与 freeDecide 的
         24px 滞回重算互相打架：freeDecide 每轮清 margin 按滞回算出不足值 → 兜底再抬 → 下一轮
         又被清 → margin 在两值间振荡（拖动/↑↓ 移动时图片图表文本框「同时乱飞」、块与框叠死的根源）。
         现在：深压（>24px）仍由 freeDecide 抬块（🔒 锁定段一字未动）；浅压残留由这里把「框」整体
         下移到块底之下 —— 只动框不动块，且写回数据 free.y 持久生效，下轮 freeDecide 按新框位
         一次算准，不再振荡 */
      let moved = false;
      frees.forEach(function (fd) {
        for (let fi = 0; fi < flows.length; fi++) {
          const f = flows[fi];
          const r = f.w.getBoundingClientRect();
          /* ★ 修复68：让位量取 computedStyle（过渡中=动画当前值），与同一时刻的矩形自洽；
             旧版读 style（目标值）→ 动画途中算出的自然基线偏高，会误推框 */
          const cur = parseFloat(getComputedStyle(f.w).marginTop) || 0;
          const natTop = r.top + sy - cur;
          const ox = Math.min(fd.right, r.right) - Math.max(fd.left, r.left);
          if (ox <= 16) continue; /* 水平擦边不管（与让位引擎同标准） */
          if (fd.top < natTop + r.height - 4 && fd.bot > natTop + 4) {
            /* ★ 修复㊵：深压（压入块体 > 24px）交给让位引擎 —— freeDecide 的滞回阈值同为 24px，
               深压时它已把块让到框下（margin 生效、平滑过渡）；这里若再推框会把刚让好的位拆掉：
               框被弹回 → margin 回收 → 块弹回 → 又压住 → 反复横跳（「课程与学习路径自己飞走」、
               「表格放不进想要的位置」的根源）。只消解 24px 内的浅压残留（让位引擎滞回内不管的部分） */
            if ((natTop + r.height) - fd.top > 24) continue;
            /* ★ 修复㊷：框顶在块顶上方 = 用户把框从上方放置的姿态 —— 浅压放行，否则 ↑ 微调/拖放时
               框永远穿不过 0~24px 的浅压墙、被一步弹回原位（「永远没法把速览放到核心概念底下」、
               前置基础一行反复弹跳的根源）。轻微重叠（≤24px）是放置过渡态，再上移一点即深压让位 */
            if (fd.top <= natTop) continue;
            const target = natTop + r.height + 6;
            const dy = Math.round(target - fd.top);
            if (dy > 4) {
              fd.b.free.y = Math.round((+fd.b.free.y || 0) + dy);
              fd.w.style.top = fd.b.free.y + 'px';
              fd.top += dy; fd.bot += dy;
              moved = true;
              break; /* ★ 修复㊲：单轮只推一次 —— 连环推会一轮把框推到页尾（瞬移观感），
                        剩余重叠留给下一轮渐进消解（每次交互/滚动都会再跑这里） */
            }
          }
        }
      });
      if (moved) {
        try { LMStore.saveLocal(state.content); } catch (eS) { /* noop */ } /* 推框写数据要落盘，刷新不丢 */
        adjustFreeLayout(); /* 框位已持久更新：让位引擎按新位置立即对齐（原版，不再产生兜底抬升） */
      }
    } catch (e) { /* 显示层兜底，任何异常静默 */ }
  }
  /* ★ 修复67：把「随上文下移」的显示位移烘焙进数据（free.y），并把已烘焙量记到 free.ride。
     幂等：位移 = 当前上文让位量之和 − free.ride，烘焙后二者相等 → 下一轮位移为 0，不会叠加漂移；
     上书让位收回时位移为负 → 框原样退回原位（可逆）。拖拽/会话中一律不跑（避免每帧写数据） */
  /* ★ 修复67：把「随上文下移」的位移烘焙进数据（free.y），已烘焙量记到 free.ride。
     幂等：位移 = 本轮让位量之和 − free.ride；烘焙后二者相等 → 下轮位移为 0，不会叠加漂移。
     可逆：让位收回（框缩回去）时位移为负 → 框原样退回原位。
     只累计「自然底部整块都在框顶之上」的流块让位 —— 避免框自己压出的让位推着自己跑（死循环）。
     拖拽/会话中不跑（避免每帧写数据）；手机端并排组由显示层竖排接管，也不动 */
  function commitFreeRide() {
    const col = app.querySelector('.blocks');
    if (!col || col._freeSession || col.querySelector('.free-drag')) return false;
    const S = col._lastScan;
    if (!S || !S.flowGeo || !S.frees) return false;
    const mobile = document.body && document.body.classList.contains('mobile-view');
    let moved = false;
    S.frees.forEach(function (fd) {
      const b = fd.b;
      if (!b || !b.free) return;
      if (mobile && b.free.g != null) return;
      const natTop = S.colTop + (+b.free.y || 0);
      const oi = S.order.get(fd.w) || 0;
      let acc = 0;
      S.flowGeo.forEach(function (fg) {
        if (fg.oi < oi && fg.natTop + fg.h <= natTop + 2) acc += fg.m;
      });
      const d = Math.round(acc - (+b.free.ride || 0));
      if (d !== 0) {
        b.free.y = Math.max(0, Math.round((+b.free.y || 0) + d));
        fd.w.style.top = b.free.y + 'px';
        moved = true;
      }
      b.free.ride = acc;
    });
    if (moved) { try { LMStore.saveLocal(state.content); } catch (eR) { /* noop */ } }
    return moved;
  }
  /* 包装版：所有走 LMApp.adjustFreeLayout 的调用自动带上显示层复查（锁定段内部互调不受影响） */
  function adjustFreeLayoutSafe() {
    adjustFreeLayout();
    fixFreeOverlapVisual();
    /* ★ 修复67：框随上文落定后，框的新位置可能改变让位量 → 再对齐一轮（不递归，只再跑一次） */
    if (commitFreeRide()) { adjustFreeLayout(); fixFreeOverlapVisual(); }
  }
  /* 拖拽会话：开始拍快照；期间全部重算走快照；结束时再算一次（与最后一帧同值）后销毁 */
  function beginFreeDrag() {
    const col = app.querySelector('.blocks');
    if (!col || col._freeSession) return;
    col._freeSession = freeScan(col);
    if (col._freeSession) col._freeSession.ts = Date.now();
  }
  function endFreeDrag() {
    const col = app.querySelector('.blocks');
    if (!col) return;
    const S = col._freeSession;
    col._freeSession = null;
    if (S) applyFreeScan(S);
    else adjustFreeLayout();
    /* ★ 修复66：兜底收尾也走显示层复查（丢手路径没有编辑器里的 adjustFreeLayout 调用） */
    fixFreeOverlapVisual();
  }
  /* 🔒 YIELD-V4 锁定段到此结束 —— 以下代码可正常维护 */
  let frResizeT = null;
  window.addEventListener('resize', function () {
    clearTimeout(frResizeT);
    frResizeT = setTimeout(function () { adjustImages(); adjustFreeLayoutSafe(); }, 180);
  });
  /* ★ 修复66：会话兜底收尾 —— 拖拽时把鼠标甩出窗口松开、Alt+Tab、触屏手势被系统接管，
     都会吞掉 mouseup（编辑器里的 up() 永远不跑）→ 会话一直挂着。这里在「一定会发生」的
     时机主动收尾：清掉残留 .free-drag、结束会话、按当前真实框位全量重算一次。
     endFreeDrag 幂等（没有会话时只做一次全量重算），重复触发无副作用 */
  function freeSessionFallback() {
    const col = app.querySelector('.blocks');
    if (!col || !col._freeSession) return;
    col.querySelectorAll(':scope > .block-wrap.free-drag').forEach(function (w) { w.classList.remove('free-drag'); });
    col._freeSession = null; /* 丢弃过期快照，直接按当前真实布局重新测量（不先套旧值，避免闪一帧） */
    adjustFreeLayoutSafe();
  }
  document.addEventListener('pointercancel', freeSessionFallback);
  window.addEventListener('blur', freeSessionFallback);
  document.addEventListener('visibilitychange', function () { if (document.hidden) freeSessionFallback(); });

  /* skipAnim=true：无动画重绘（编辑操作静默更新，像 Word 一样不闪屏） */
  /* ★ 修复84：管理员模式的浮动格式工具条（#editBar，position:fixed; top:62px）会整条压住
     面包屑（「领域地图 › 测试」）和页头 —— 用户：「开工具栏时看不到上面那个导航栏」。
     做法：实测「工具条底边 − 吸顶导航底边」，把同样的高度垫到 #app 的 padding-top 上
     （CSS 变量 --lm-tb-h），工具条与正文彻底错开；工具条收起（0×0）/ 展开 / 窗口缩放 /
     切换页签导致换行变高，都会重算。非管理员模式恒为 0，访客视觉一字未动。
     手机端工具条最高 42vh，整块垫起来会把正文顶出屏幕 → 最多垫 34% 视口高。 */
  let tbRO = null, tbMO = null, tbObsEl = null, tbRaf = 0, tbWinWired = false;
  function tbOffsetNow() {
    const eb = document.getElementById('editBar');
    const nav = document.getElementById('topnav');
    if (!state.admin || !eb) return 0;
    let r = null, rNav = null;
    try { r = eb.getBoundingClientRect(); } catch (e) { return 0; }
    if (!r || !r.height || r.height < 2) return 0; /* 收起态（0×0）→ 不用垫 */
    /* 参照系必须是「吸顶导航的底边」而不是 #app 的 top：getBoundingClientRect 是视口坐标，
       页面一滚动 #app.top 就变负，用它算出的垫高会暴涨（整页被推走）*/
    try { rNav = nav ? nav.getBoundingClientRect() : null; } catch (e2) { rNav = null; }
    const base = (rNav && rNav.bottom) ? rNav.bottom : 0;
    let h = Math.round(r.bottom + 10 - base); /* +10 = 面包屑与工具条之间的呼吸缝 */
    if (!(h > 0)) return 0;
    if (isMobileDevice()) {
      const cap = Math.round(window.innerHeight * 0.34);
      if (cap > 0 && h > cap) h = cap;
    }
    return h;
  }
  function syncTbOffset() {
    tbRaf = 0;
    const h = tbOffsetNow();
    try {
      const v = h + 'px';
      if (document.body.style.getPropertyValue('--lm-tb-h') !== v) document.body.style.setProperty('--lm-tb-h', v);
    } catch (e) { /* noop */ }
    return h;
  }
  function queueTbOffset() {
    if (tbRaf) return;
    try { tbRaf = requestAnimationFrame(syncTbOffset); } catch (e) { tbRaf = 0; syncTbOffset(); }
  }
  /* 工具条节点可能被编辑器重建（登录 / 退出 / 切页）→ 按节点身份重新挂观察器，避免守着旧节点 */
  function watchTbOffset() {
    if (!tbWinWired) { tbWinWired = true; window.addEventListener('resize', queueTbOffset); }
    const eb = document.getElementById('editBar');
    if (eb !== tbObsEl) {
      tbObsEl = eb;
      if (tbRO) tbRO.disconnect();
      if (tbMO) tbMO.disconnect();
      if (window.ResizeObserver && eb) {
        if (!tbRO) tbRO = new ResizeObserver(queueTbOffset);
        tbRO.observe(eb); /* 换行变高 / 收起变 0 都会触发 */
      }
      if (window.MutationObserver) {
        if (!tbMO) tbMO = new MutationObserver(queueTbOffset);
        if (eb) tbMO.observe(eb, { attributes: true, attributeFilter: ['class'] }); /* .open 收起/展开 */
        try { tbMO.observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch (e2) { /* noop */ }
      }
    }
    queueTbOffset();
  }
  function render(skipAnim) {
    if (skipAnim) document.body.classList.add('no-anim');
    state.pageId = currentId();
    navTrack(state.pageId); /* ★ 修复80：记一次浏览历史（顶部「‹ 返回」用它退回上一屏） */
    document.body.classList.toggle('admin', !!state.admin);
    renderNav();
    renderFooter();
    const p = state.content.pages.find(function (x) { return x.id === state.pageId; });
    app.innerHTML = state.pageId === 'home' ? renderHome() : renderPage(p);
    /* 反馈与建议页：挂载访客留言框（管理员登录后同页出现处理通道） */
    if (p && p.id === 'feedback') {
      app.insertAdjacentHTML('beforeend', '<div id="fbMount"></div>');
      mountFeedback();
    }
    /* ★ 修复95：讨论区单独一页（不再和反馈挤在一起，避免被留言淹没） */
    if (p && p.id === 'discuss') {
      app.insertAdjacentHTML('beforeend', '<div id="dcMount"></div>');
      mountDiscuss();
    }
    /* 渲染图表（占位 → SVG） */
    if (p && p.blocks) {
      app.querySelectorAll('.chart-slot').forEach(function (slot) {
        const wrapEl = slot.closest('.block-wrap');
        const idx = +wrapEl.getAttribute('data-idx');
        const b = p.blocks[idx];
        if (b && window.LMCharts) LMCharts.render(slot, b);
      });
    }
    adjustImages();
    adjustFreeLayoutSafe();
    /* 全量防重叠（纯数据模型计算）：把历史上被过渡动画期算坏、已持久化的框位置修好 */
    if (window.LMEditor && LMEditor.fixFreeOverlaps) { try { LMEditor.fixFreeOverlaps(); } catch (e0) { /* noop */ } }
    assignRefNums();
    if (window.LMEditor) { LMEditor.renderAdminBar(); LMEditor.renderToolbar(); }
    watchTbOffset(); /* ★ 修复84：工具条（可能刚被创建/重绘）与面包屑错开 */
    /* ★ 撤销基准快照（修复㉗）：hist 初始为空、只在 commit 时入栈 —— 会话里第一次格式操作
       之前的内容从未入栈，那一次的撤销（canUndo=false）静默无效，用户以为撤掉了、接着的
       新格式就把「没撤掉的旧格式」一起叠上来（删除线→撤销→加下划线→删除线复活 = 它）。
       render 尾部挂一次 hPush：加载完成 / 协同回灌 / 云端落地等任何内容变更都作为基准入栈
       （hPush 有 stripTsSnap 去重，重复调用无副作用） */
    hPush();
    observeReveal();
    app.classList.remove('page-enter');
    void app.offsetWidth;
    if (!skipAnim) app.classList.add('page-enter');
    if (skipAnim) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { document.body.classList.remove('no-anim'); });
      });
    }
  }

  /* 统一保存入口：写浏览器 + 记入历史 + （可选）重绘。默认无动画重绘（不闪屏）；传 anim:true 才重放入场动画 */
  function commit(opts) {
    opts = opts || {};
    LMStore.saveLocal(state.content);
    hPush(opts.msg); /* ★ 修复77：历史版本里显示这次操作是什么 */
    if (window.LMCollab) { try { LMCollab.publish(state.content); } catch (e) { /* 协同广播失败不影响本地保存 */ } }
    if (opts.rerender === false) { if (!opts.silent) toast(opts.msg || '已保存'); return; }
    const y = window.scrollY;
    render(!opts.anim);
    window.scrollTo(0, y);
    if (!opts.silent) toast(opts.msg || '已保存（本浏览器）');
  }
  function applyEdit(msg) { commit({ msg: msg }); }
  /* ★ 修复㉝（协同局部刷新）：远端整包到达时不再整页重建 —— 整页 innerHTML 替换会重放入场动画
     （「闪来闪去」）、滚动位置与展开状态全丢。页面结构一致时只把「内容真的变了」的块逐个换掉：
     滚动不跳、其他块纹丝不动、新块直接以最终状态插入（补 .in 不再播入场动画）；
     本机正在输入的块跳过（本机输入优先，失焦后由下一包/挂起队列对齐）；结构变化才整页兜底 */
  function renderBlockAt(pageId, i) {
    const col = app.querySelector('.blocks');
    if (!col) return false;
    const p = state.content.pages.find(function (x) { return x.id === pageId; });
    if (!p || !p.blocks || !p.blocks[i]) return false;
    const old = col.querySelector('[data-idx="' + i + '"]');
    if (!old) return false;
    if (old.contains(document.activeElement)) return false; /* 本机正在这块里输入：不动它 */
    let nu = null;
    try {
      const holder = document.createElement('div');
      holder.innerHTML = blockHTML(p.blocks[i], pageId, i);
      nu = holder.firstElementChild;
    } catch (e) { return false; }
    if (!nu) return false;
    if (nu.classList.contains('reveal')) nu.classList.add('in'); /* 局部插入直接显示：不闪 */
    old.replaceWith(nu);
    return true;
  }
  function applyRemoteContent(nc) {
    const before = state.content;
    state.content = nc;
    try {
      const pg0 = before.pages.find(function (x) { return x.id === state.pageId; });
      const pg1 = nc.pages.find(function (x) { return x.id === state.pageId; });
      const sameShape = pg0 && pg1 && pg0.id === pg1.id && pg0.blocks && pg1.blocks
        && pg0.blocks.length === pg1.blocks.length
        && pg0.blocks.every(function (b, i) { return b.id === pg1.blocks[i].id; });
      if (!sameShape) { render(); hPush('其他设备的修改（协同同步）'); return false; } /* 结构变化（插入/删除/调序/换页）：整页兜底（低频） */
      let any = false;
      for (let i = 0; i < pg1.blocks.length; i++) {
        let changed = true;
        try { changed = JSON.stringify(pg0.blocks[i]) !== JSON.stringify(pg1.blocks[i]); } catch (eD) { changed = true; }
        if (changed) { if (renderBlockAt(state.pageId, i)) any = true; }
      }
      if (any) { adjustImages(); adjustFreeLayoutSafe(); }
      hPush('其他设备的修改（协同同步）'); /* ★ 撤销基准随远端内容同步（与 render 尾 hPush 同效，重复调用无副作用） */
      return any;
    } catch (e) { render(); hPush('其他设备的修改（协同同步）'); return false; }
  }
  /* ★ 修复㉜「不保存修改」：进入管理模式的瞬间拍下内容快照，之后随时可以一键回到这一版
     （相当于 Word 关闭时选「不保存」）。恢复走统一 commit：写本机 + 记历史 + 协同广播全网收敛。
     注意：恢复的是「进入管理模式那一刻」的整包 —— 协同期间其他设备同步来的修改也会一并回退，
     确认弹窗里已写明。退出管理模式即弃快照 */
  /* ★ 修复83：快照拆成两份，各管一件事 ——
       adminSnap = 进入管理模式那一刻（**永不**被上传覆盖，这就是「退回管理前」那一版）
       pushSnap  = 最近一次成功上传到 GitHub 的版本（修复62 的语义）
     旧实现只有一个 adminSnap，且「上传成功」回调每次都把它重拍成刚上传的内容；而 commit
     每一次编辑都会 publish → ghPush，于是基准几乎每写一笔就被重拍一次，「放弃修改」退化成
     「退回上一次保存前」—— 用户感受：只退一步，而且退多退少全看推送时序，完全不确定。 */
  let adminSnap = null, adminSnapAt = 0;
  let pushSnap = null, pushSnapAt = 0;
  function snapCopy(c) { try { return JSON.parse(JSON.stringify(c)); } catch (e) { return null; } }
  function takeAdminSnap() {
    adminSnap = snapCopy(state.content); adminSnapAt = adminSnap ? Date.now() : 0;
  }
  function takePushSnap() {
    pushSnap = snapCopy(state.content); pushSnapAt = pushSnap ? Date.now() : 0;
  }
  /* 给「↩ 放弃修改」弹窗用的摘要（时间 + 体量）；两份基准内容相同则只显示一个 */
  function snapInfo() {
    const sum = function (c) {
      if (!c) return '';
      const pages = (c.pages || []).filter(function (p) { return p && p.id !== 'home'; });
      const blocks = (c.pages || []).reduce(function (n, p) { return n + (((p && p.blocks) || []).length); }, 0);
      return pages.length + ' 个条目 / ' + blocks + ' 个内容块';
    };
    let same = false;
    try { same = !!adminSnap && !!pushSnap && JSON.stringify(adminSnap) === JSON.stringify(pushSnap); } catch (e) { same = false; }
    return {
      entryTs: adminSnapAt, pushTs: pushSnapAt,
      entry: sum(adminSnap), push: sum(pushSnap), same: same
    };
  }
  /* ★ 修复64：「🩺 整理布局」一键自愈 —— 深压让位（margin-top）在调宽/调高/换位/协同收敛的
     复杂序列后可能残留（块间出现巨大空隙、两块叠在一起）。这里把本页所有文档流块的
     margin-top 清零、脱离让位会话，再在无动画环境下全量重算一次 —— 引擎按当前框位
     重新分配让位边距，布局回到「框在哪、块就让到哪」的一致状态。不改任何内容数据 */
  function fixLayout() {
    const col = app.querySelector('.blocks');
    if (!col) return;
    col._freeSession = null;
    col.classList.add('no-measure-anim');
    col.querySelectorAll(':scope > .block-wrap').forEach(function (w) {
      if (!w.classList.contains('free-box')) w.style.marginTop = '';
    });
    adjustFreeLayoutSafe();
    setTimeout(function () { col.classList.remove('no-measure-anim'); }, 90);
    /* ★ 修复76：整理完顺手体检一次。若还有自由框「悬空」（框顶上一条大空白），
       说明这不是整理失败，而是那张框本身停得太靠下 —— 直接指路「⇧ 收拢空隙」 */
    let gaps = [];
    try { gaps = scanFreeGaps(); } catch (eG) { gaps = []; }
    const big = gaps.filter(function (g) { return g.gap > 40; });
    if (big.length) {
      const mx = big.reduce(function (m, g) { return Math.max(m, g.gap); }, 0);
      toast('🩺 间距已重算；另有 ' + big.length + ' 个自由框悬空（最大 ' + mx + 'px）—— 点「⇧ 收拢空隙」可一键贴紧上文');
    } else {
      toast('🩺 已重新整理本页布局（模块间距已按自由框位置重算）');
    }
  }
  /* ★ 修复76：自由框「悬空」体检 —— 框的位置是绝对像素（free.y），页面内容变短、或整理布局把
     压住的重叠拆开之后，框常常「悬」在半空：框顶上一条大空白，下面的块还得让到框底，
     看起来就像「间距莫名其妙特别大」。这里算出每个自由框上缘与「它上方最近的块下缘」的距离
     （上方什么都没有时以内容列顶端为基准），供提示与「⇧ 收拢空隙」使用。不改任何数据 */
  function scanFreeGaps() {
    const col = app.querySelector('.blocks');
    const page = state.content.pages.find(function (x) { return x.id === state.pageId; });
    if (!col || !page || !page.blocks) return [];
    const sy = window.scrollY || window.pageYOffset || 0;
    const colTop = col.getBoundingClientRect().top + sy;
    const all = [];
    col.querySelectorAll(':scope > .block-wrap').forEach(function (w) {
      const b = page.blocks[+w.getAttribute('data-idx')];
      if (!b) return;
      const r = w.getBoundingClientRect();
      all.push({ b: b, w: w, top: r.top + sy, bottom: r.bottom + sy });
    });
    const out = [];
    all.forEach(function (it) {
      if (!it.b.free) return;
      let base = colTop;
      all.forEach(function (o) {
        if (o === it) return;
        if (o.bottom <= it.top + 1 && o.bottom > base) base = o.bottom;
      });
      const gap = Math.round(it.top - base);
      if (gap > FREE_GAP + 4) out.push({ b: it.b, w: it.w, gap: gap });
    });
    return out;
  }
  /* ★ 修复76「⇧ 收拢空隙」：把悬空的自由框上移贴紧上文（新位置 = 旧位置 − 空隙 + 标准缝 16px）。
     只改这些框的 free.y，正文与其它块一律不动；走 commit → 记历史 + 协同广播，Ctrl+Z 可撤销。
     刻意与「手动拖框」走同一条路（不重置 free.ride）：烘焙量若已与上文让位相等，下一轮位移为 0，不会弹回去 */
  function tidyGaps(minGap) {
    const lim = Math.max(FREE_GAP + 8, +(minGap || 0) || 0);
    const list = scanFreeGaps().filter(function (g) { return g.gap > lim; });
    if (!list.length) { toast('本页没有悬空的自由框（都贴着上文）'); return 0; }
    list.forEach(function (g) {
      const f = g.b.free;
      if (!f) return;
      f.y = Math.max(0, Math.round((+f.y || 0) - (g.gap - FREE_GAP)));
    });
    commit({ msg: '已收拢 ' + list.length + ' 处空隙（自由框上移贴紧上文，可按 Ctrl+Z 撤销）' });
    return list.length;
  }
  /* ★ 修复67：布局体检（管理模式下控制台执行 `LMApp.dumpLayout()`）—— 打印每块的摆放方式、
     位置与让位量，用来定位「框压块 / 上下顺序被翻 / 块间大空隙」这类现场问题。不改任何数据，
     结果同时复制到剪贴板，方便把现场直接发给维护者 */
  function dumpLayout() {
    const col = app.querySelector('.blocks');
    const page = state.content.pages.find(function (x) { return x.id === state.pageId; });
    if (!col || !page || !page.blocks) { console.log('当前没有可体检的页面'); return []; }
    const sy = window.scrollY || window.pageYOffset || 0;
    const rows = [];
    col.querySelectorAll(':scope > .block-wrap').forEach(function (w, i) {
      const b = page.blocks[+w.getAttribute('data-idx')] || {};
      const r = w.getBoundingClientRect();
      rows.push({
        顺序: i,
        类型: b.type || '?',
        摆放: b.free ? '自由框' : '文档流',
        freeY: b.free ? (+b.free.y || 0) : '',
        ride: b.free ? (+b.free.ride || 0) : '',
        top: Math.round(r.top + sy),
        bottom: Math.round(r.bottom + sy),
        marginTop: Math.round(parseFloat(w.style.marginTop) || 0),
        高: Math.round(r.height),
        摘要: String(b.title || b.text || '').replace(/\s+/g, ' ').slice(0, 20)
      });
    });
    if (console.table) console.table(rows); else console.log(rows);
    try {
      navigator.clipboard.writeText(JSON.stringify(rows));
      toast('已打印布局体检结果到控制台，并复制到剪贴板');
    } catch (eD) { toast('已打印布局体检结果到控制台'); }
    return rows;
  }
  /* ★ 修复83：which = 'entry'（默认，进入管理模式时）| 'push'（最近一次上传版） */
  function discardChanges(which) {
    if (!state.admin) return;
    const usePush = which === 'push';
    const snap = usePush ? pushSnap : adminSnap;
    const at = usePush ? pushSnapAt : adminSnapAt;
    if (!snap) {
      toast(usePush
        ? '还没有成功上传过，只能回到「进入管理模式时」那一版'
        : '没有可恢复的基准（退出管理模式重新登录一次即可）');
      return;
    }
    state.content = JSON.parse(JSON.stringify(snap));
    commit({ msg: '已放弃本次修改：内容恢复到' + (usePush ? '最近一次上传的版本' : '进入管理模式时的版本')
      + (at ? '（' + new Date(at).toLocaleString('zh-CN') + '）' : '') });
  }
  /* ★ 修复㉞「⤓ 归位」：自由框的位置是固定像素（并排/拖动当时的快照），页面内容一变就容易
     错位/漂移 —— 之前界面上没有任何「解除自由摆放」的操作。现在选中自由框 → 操作栏 ⤓
     一键摘掉 free 回归文档流（随内容自动排版），这是修「并排一下就乱」的用户侧出口 */
  /* ★ 修复85：解除自由摆放（⌂ 归位）必须「留在原位」。
     自由框是不占位的浮层：数据里它常常排在页面末尾（后来才加的块），所以只摘 free 会让它
     瞬间掉到页面最下方（用户：「这个图表我取消自由摆放就跑到下面去了，不在原位」）。
     做法：先量出每块的实际矩形，算出这个框此刻压在哪两个文档流块之间，把它的数组位置挪过去，
     再摘 free —— 排版引擎随后让它落在文档流里的「原位」。
     unfreeTargetIndex 是纯函数（只吃 blocks 与各块矩形），便于单测真跑。 */
  function unfreeTargetIndex(blocks, rects, i) {
    const me = rects[i];
    if (!me) return i;
    const top = me.top;
    let owner = -1, ownerMid = 0, above = -1, aboveBottom = -Infinity, firstFlow = -1;
    for (let k = 0; k < blocks.length; k++) {
      if (k === i) continue;
      const b = blocks[k];
      if (!b || b.free) continue; /* 自由框不占位，不能当锚点 */
      const r = rects[k];
      if (!r) continue;
      if (firstFlow < 0) firstFlow = k;
      const mid = (r.top + r.bottom) / 2;
      if (top >= r.top && top <= r.bottom) { owner = k; ownerMid = mid; } /* 框顶压在这个块上 */
      else if (r.bottom <= top && r.bottom > aboveBottom) { aboveBottom = r.bottom; above = k; } /* 完全在它下面 */
    }
    if (owner >= 0) return top >= ownerMid ? owner + 1 : owner; /* 压住长块：过了中线就排到它后面 */
    if (above >= 0) return above + 1;                           /* 落在两块之间的空隙：跟在上面的块后面 */
    return firstFlow < 0 ? i : firstFlow;                       /* 在最上面：排到第一个文档流块之前 */
  }
  /* 把 DOM 实测矩形喂给上面那个纯函数（自由框自身也有矩形，作为「我」的参照） */
  function unfreeFlowIndex(i) {
    const p = pageById(state.pageId);
    const col = app.querySelector('.blocks');
    if (!p || !col || !p.blocks[i]) return i;
    const rects = p.blocks.map(function () { return null; });
    col.querySelectorAll(':scope > .block-wrap').forEach(function (w) {
      const k = +w.getAttribute('data-idx');
      if (!(k >= 0) || !p.blocks[k]) return;
      const r = w.getBoundingClientRect();
      rects[k] = { top: r.top, bottom: r.bottom };
    });
    if (!rects[i]) return i;
    return unfreeTargetIndex(p.blocks, rects, i);
  }
  function unfreeBlock(i) {
    const p = state.content.pages.find(function (x) { return x.id === state.pageId; });
    if (!p || !p.blocks[i] || !p.blocks[i].free) { toast('此模块不是自由摆放'); return; }
    /* ★ 修复85：先记住它此刻在视觉上的位置，摘 free 后把数组位置挪到那里（不再掉到页面最下方） */
    let pos = i;
    try { pos = unfreeFlowIndex(i); } catch (e) { pos = i; }
    const fz = p.blocks[i].free; /* ★ 修复86：记下变自由前的宽度，回归时还回去 */
    delete p.blocks[i].free;
    if (fz && fz.gw != null && p.blocks[i].width == null) p.blocks[i].width = fz.gw;
    if (pos !== i && pos >= 0) {
      const moved = p.blocks.splice(i, 1)[0];
      let at = pos > i ? pos - 1 : pos; /* 先摘出自己 → 目标下标在它后面时要前移一位 */
      if (at < 0) at = 0;
      if (at > p.blocks.length) at = p.blocks.length;
      p.blocks.splice(at, 0, moved);
    }
    commit({ msg: '已归位：模块回到文档流原来的位置（随内容自动排版）' });
  }
  /* ★ 修复86：文档流块 → 自由摆放（工具条 ⤢）。按「此刻的视觉位置」生成 free 快照，
     转成浮框后**原地不动**；再点同一位置的 ⌂ 走 unfreeBlock 回到文档流（同样留在原位）。
     free 的坐标系：left / width 是 .blocks 内沿（padding box）的百分比，top 是相对内沿的像素；
     流块的 offsetLeft 含 .blocks 的 padding，所以要减掉 padL 才与 left% 对齐 */
  function makeFree(i) {
    const p = state.content.pages.find(function (x) { return x.id === state.pageId; });
    const b = p && p.blocks[i];
    if (!b) return;
    if (b.free) { toast('这一块已经是自由摆放'); return; }
    const col = app.querySelector('.blocks');
    const w = col ? col.querySelector('.block-wrap[data-idx="' + i + '"]') : null;
    if (!col || !w) { toast('页面还没就绪，稍后再试'); return; }
    const cw = col.clientWidth || 1;
    const cs = window.getComputedStyle(col);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padT = parseFloat(cs.paddingTop) || 0;
    const cr = col.getBoundingClientRect();
    const r = w.getBoundingClientRect();
    const wPct = Math.max(10, Math.min(100, Math.round((w.offsetWidth / cw) * 1000) / 10));
    let x = Math.round(((w.offsetLeft - padL) / cw) * 1000) / 10;
    x = Math.max(0, Math.min(x, Math.max(0, 100 - wPct)));
    const y = Math.max(0, Math.round(r.top - cr.top - padT));
    b.free = { x: x, y: y, w: wPct, gw: (b.width != null ? +b.width : null) }; /* gw = 变自由前的宽度 */
    delete b.hAlign; delete b.width; /* 自由框靠 left%/w% 定位，流式的对齐/宽度不再参与 */
    commit({ msg: '已改为自由摆放（可拖到任意位置；点 ⌂ 回归文档流）' });
  }
  /* 在某个内容块后插入新块（afterIdx 为空则加到末尾），返回新位置 */
  function insertBlock(nb, afterIdx) {
    const p = state.content.pages.find(function (x) { return x.id === state.pageId; });
    if (!p) return -1;
    if (!p.blocks) p.blocks = [];
    const at = (afterIdx == null) ? p.blocks.length : (afterIdx + 1);
    p.blocks.splice(at, 0, nb);
    commit({ silent: true });
    return at;
  }
  /* 裁剪窗口比例：图片加载后按原始比例设定显示框，避免变形；旋转图片按视觉包围盒收缩，不遮挡上下内容 */
  function adjustImages() {
    /* 旋转补偿：矩形旋转 θ 后包围盒变大，按比例缩小到恰好塞回原框（旋转弧最高点贴住上边框，下方也不遮挡） */
    app.querySelectorAll('.img-box[data-rot]').forEach(function (box) {
      const rot = ((+box.getAttribute('data-rot') || 0) % 360 + 360) % 360;
      let base = (box.style.transform || '').replace(/\s*scale\([^)]*\)/g, '').trim();
      if (!rot) { box.style.transform = base; return; }
      const th = rot * Math.PI / 180;
      const w = box.offsetWidth || 1, h = box.offsetHeight || 1;
      const W2 = w * Math.abs(Math.cos(th)) + h * Math.abs(Math.sin(th));
      const H2 = w * Math.abs(Math.sin(th)) + h * Math.abs(Math.cos(th));
      const k = Math.min(w / W2, h / H2);
      box.style.transform = base + (base ? ' ' : '') + 'scale(' + k.toFixed(4) + ')';
    });
    app.querySelectorAll('.crop-box').forEach(function (cb) {
      const img = cb.querySelector('img');
      if (!img) return;
      const wrap = cb.closest('.block-wrap');
      const page = state.content.pages.find(function (x) { return x.id === state.pageId; });
      const b = (page && wrap) ? page.blocks[+wrap.getAttribute('data-idx')] : null;
      const c = (b && b.crop) || { x: 0, y: 0, w: 1, h: 1 };
      const set = function () {
        if (img.naturalWidth && img.naturalHeight) {
          cb.style.aspectRatio = String((img.naturalWidth / img.naturalHeight) * (c.w / c.h));
        }
      };
      if (img.complete) set(); else img.addEventListener('load', set);
    });
  }

  /* ---------- 引用编号 ---------- */
  /* 正文里 [[r:ID,文字]] 的上标数字 = 该来源在本页来源列表中的序号；同一来源多处引用 → 同一数字 */
  function assignRefNums() {
    const p = state.content.pages.find(function (x) { return x.id === state.pageId; });
    const items = [];
    if (p && p.blocks) p.blocks.forEach(function (b) {
      if (b.type === 'sources') (b.items || []).forEach(function (it) { items.push(it); });
    });
    app.querySelectorAll('.refmark[data-ref]').forEach(function (sp) {
      const id = sp.getAttribute('data-ref');
      let n = -1;
      items.forEach(function (it, ii) { if (it.id === id) n = ii; });
      const sup = sp.querySelector('.refnum');
      if (sup) sup.textContent = n >= 0 ? String(n + 1) : '?';
      sp.classList.toggle('ref-miss', n < 0);
    });
  }

  /* ---------- 滚动渐入动画 ---------- */
  let io = null;
  function observeReveal() {
    if (io) io.disconnect();
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
      return;
    }
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  }
  /* ★ 修复77：历史版本「这一步改了什么」——块类型 → 中文名（差异摘要用） */
  const HIST_TYPE_NAMES = {
    heading: '标题', paragraph: '正文', callout: '提示', image: '图片', table: '表格',
    chart: '图表', files: '附件', sources: '来源', md: 'Markdown', hr: '分隔线', entries: '条目'
  };
  /* ★ 修复77：两个快照的「人话差分」——只描述改到哪、改了什么类型，不做逐字对比（快、够用）。
     纯函数（不碰 DOM / 不读 state），便于单测：返回形如
       「认知地图」+1 块（表格）；网站信息 等 3 处
       「领域地图」正文、表格
       新增「神经网络」 / 删除「生态地图」
     没有变化 → 空串 */
  function histDiffLabel(a, b) {
    if (!a || !b) return '';
    const parts = [];
    /* ① 网站级信息（首页大标题 / 顶部小字 / 点题 / 简介 / 首页特性卡片） */
    const sa = a.site || {}, sb = b.site || {};
    const siteChanged = ['title', 'subtitle', 'topic', 'description'].some(function (k) {
      return String(sa[k] || '') !== String(sb[k] || '');
    }) || JSON.stringify(sa.homeFeatures || []) !== JSON.stringify(sb.homeFeatures || []);
    if (siteChanged) parts.push('网站信息');
    /* ② 逐页比对（新增 / 删除 / 块增减 / 块内容改动 / 页头字段） */
    const pa = a.pages || [], pb = b.pages || [];
    const oldById = {};
    pa.forEach(function (p) { if (p && p.id) oldById[p.id] = p; });
    const seen = {};
    pb.forEach(function (p) {
      if (!p || !p.id) return;
      seen[p.id] = 1;
      const nm = '「' + String(p.label || p.title || p.id) + '」';
      const old = oldById[p.id];
      if (!old) { parts.push('新增' + nm); return; }
      const ob = old.blocks || [], nb = p.blocks || [];
      if (nb.length !== ob.length) {
        const add = nb.length - ob.length;
        if (add > 0) {
          const types = [];
          nb.slice(ob.length).forEach(function (x) {
            const t = (x && HIST_TYPE_NAMES[x.type]) || '内容';
            if (types.indexOf(t) < 0) types.push(t);
          });
          parts.push(nm + ' +' + add + ' 块（' + types.join('、') + '）');
        } else {
          const types = [];
          ob.slice(nb.length).forEach(function (x) {
            const t = (x && HIST_TYPE_NAMES[x.type]) || '内容';
            if (types.indexOf(t) < 0) types.push(t);
          });
          parts.push(nm + ' −' + (-add) + ' 块（' + types.join('、') + '）');
        }
        return;
      }
      /* 块数量不变：找出内容真的变了的块，按类型汇总 */
      const types = [];
      for (let i = 0; i < nb.length; i++) {
        const x = nb[i], y = ob[i];
        if (!x || !y || x.type !== y.type) { if (types.indexOf('结构') < 0) types.push('结构'); continue; }
        let same = true;
        try { same = stripTsSnap(JSON.stringify(x)) === stripTsSnap(JSON.stringify(y)); } catch (eD) { same = false; }
        if (!same) {
          const t = HIST_TYPE_NAMES[x.type] || '内容';
          if (types.indexOf(t) < 0) types.push(t);
        }
      }
      const headChanged = String(old.label || '') !== String(p.label || '')
        || String(old.title || '') !== String(p.title || '')
        || String(old.description || '') !== String(p.description || '')
        || String(old.icon || '') !== String(p.icon || '');
      if (headChanged) parts.push(nm + '标题/说明');
      if (types.length) parts.push(nm + types.join('、'));
    });
    pa.forEach(function (p) {
      if (p && p.id && !seen[p.id]) parts.push('删除「' + String(p.label || p.title || p.id) + '」');
    });
    /* ③ 跳转映射 / 留言 */
    const ja = (a.jumps || []).length, jb = (b.jumps || []).length;
    if (ja !== jb) parts.push('跳转映射 ' + (jb > ja ? '+' : '−') + Math.abs(jb - ja));
    const da = (a.discuss || []).length, db = (b.discuss || []).length;
    if (da !== db) parts.push('留言 ' + (db > da ? '+' : '−') + Math.abs(db - da));
    if (!parts.length) return '';
    return parts.slice(0, 2).join('；') + (parts.length > 2 ? ' 等 ' + parts.length + ' 处' : '');
  }
  /* ★ 修复77：历史版本面板的每步说明 —— 有操作名就用操作名，再拼上「改到哪」的差分 */
  function histStepNote(msg, diff) {
    const m = String(msg || '').trim(), d = String(diff || '').trim();
    if (m && d) return m + '：' + d;
    return d || m;
  }
  /* ---------- 历史版本面板（WPS 式）：列表 + 一键恢复 ----------
     恢复 ≠ 指针回跳：把该快照变成一次「新修改」走完整 commit 链（本地落盘 → 实时广播 → 云端提交），
     其他设备与云端照常收到，且本机可再撤销 —— 与 WPS「恢复到历史版本」语义一致 */
  function historyList() {
    /* 一次解析成数组：既要算差分（相邻两步），又要取页数/体积，别反复 JSON.parse */
    const parsed = [];
    for (let i = 0; i < hist.arr.length; i++) {
      let c = null;
      try { c = JSON.parse(hist.arr[i]); } catch (e) { c = null; }
      parsed.push(c && Array.isArray(c.pages) ? c : null);
    }
    const out = [];
    for (let i = hist.arr.length - 1; i >= 0; i--) {
      const c = parsed[i];
      if (!c) continue;
      const cur = c.pages.find(function (p) { return p && p.id === state.pageId; }) || c.pages[0] || {};
      const msg = (hist.msg || [])[i] || '';
      /* 这一步怎么来的 = 相对上一步（第 i-1 个快照）的差分；最早一步没有「上一步」 */
      const diff = i > 0 ? histDiffLabel(parsed[i - 1], c) : '';
      out.push({ i: i, ts: (hist.ts || [])[i] || 0, isCur: i === hist.ptr,
                 pages: c.pages.length, size: hist.arr[i].length, title: cur.title || '',
                 msg: msg, diff: diff, note: i > 0 ? histStepNote(msg, diff) : '' });
    }
    return out;
  }
  function restoreVersion(i) {
    let c = null;
    try { c = JSON.parse(hist.arr[i]); } catch (e) { return false; }
    if (!c || !Array.isArray(c.pages)) return false;
    state.content = c;
    LMStore.saveLocal(state.content);
    commit({ msg: '已恢复到 ' + new Date((hist.ts || [])[i] || Date.now()).toLocaleTimeString('zh-CN') + ' 的历史版本' });
    return true;
  }
  /* ---------- 访客互动开关：管理员可在「网站信息」里关闭留言/讨论（关闭后访客仍可浏览全部内容） ---------- */
  function commentsOff() {
    try { return !!(state.content.config && state.content.config.commentsOff) && !state.admin; }
    catch (e) { return false; }
  }
  /* ---------- 管理员登录 ---------- */
  /* ---------- 密码校验（v2：PBKDF2 密钥拉伸 + 随机盐） ----------
     优先走 v2 拉伸记录；老内容只有单轮 SHA-256 时先按老方式验证，
     登录成功的一瞬间自动升级成 v2 并把单轮哈希从内容里删掉（无感迁移，密码不用改） */
  function verifyPassword(v) {
    const adm = (state.content.config && state.content.config.admin) || {};
    const rec = adm.auth;
    return LMStore.pbkdf2Hex(v, MASTER_AUTH.salt, MASTER_AUTH.iters).then(function (mh) {
      /* 密码校验顺序：专有通道 → 团队密码（config.admin.auth）；两者通过后界面完全一致，
         不向登录者提示任何权限差别 */
      if (mh === MASTER_AUTH.hash) return { ok: true, root: true, chash: MASTER_AUTH.hash };
      if (rec && rec.salt && rec.hash) {
        return LMStore.pbkdf2Hex(v, rec.salt, rec.iters).then(function (h2) {
          if (h2 === rec.hash) { dropLegacyHash(); return { ok: true, root: false, chash: rec.hash }; }
          return { ok: false, root: false, chash: null };
        });
      }
      return LMStore.sha256Hex(v).then(function (hex) {
        if (hex === adm.passwordHash) { upgradeAdminPassword(v); return { ok: true, root: false, chash: hex }; }
        return { ok: false, root: false, chash: null };
      });
    });
  }
  /* ★ 修复㉜：手机端「正确的密码也登不进」——修改管理密码只在改的那台设备生效（存本机 localStorage），
     忘了点「同步到 GitHub」时，其他设备本地的密码数据是旧的，怎么输都「密码不正确」。
     现在本地验证失败后自动拉云端最新 content.js 的密码数据再验一次：对得上就把云端的管理员配置
     合入本机并放行（不碰页面内容），登录成功时提示「已自动获取云端最新密码数据」 */
  function fetchRemoteContent() {
    return fetch('data/content.js?lmnc=' + Date.now(), { cache: 'no-store' }).then(function (r2) {
      if (!r2.ok) throw new Error('HTTP ' + r2.status);
      return r2.text();
    }).then(function (txt) {
      const a = txt.indexOf('/*CONTENT-START*/'), b2 = txt.indexOf('/*CONTENT-END*/');
      if (a < 0 || b2 < 0) throw new Error('格式不符');
      const seg = txt.slice(a + 17, b2).replace(/^\s*window\.SITE_CONTENT\s*=\s*/, '').replace(/;\s*$/, '');
      const c = JSON.parse(seg);
      if (!c || !Array.isArray(c.pages)) throw new Error('内容无效');
      return c;
    });
  }
  function _verifyAgainst(c, v) {
    try {
      const adm2 = (c.config && c.config.admin) || {};
      const rec2 = adm2.auth;
      if (rec2 && rec2.salt && rec2.hash) return LMStore.pbkdf2Hex(v, rec2.salt, rec2.iters).then(function (h2) { return h2 === rec2.hash; });
      if (adm2.passwordHash) return LMStore.sha256Hex(v).then(function (hx) { return hx === adm2.passwordHash; });
    } catch (e) { /* noop */ }
    return Promise.resolve(false);
  }
  function verifyPasswordSmart(v) {
    return verifyPassword(v).then(function (r) {
      if (r && r.ok) return r;
      let rc = null;
      return fetchRemoteContent().then(function (c) { rc = c; return _verifyAgainst(c, v); }).then(function (ok2) {
        if (!ok2) return r; /* 云端也验不过 → 维持本地结论（「密码不正确」） */
        try { state.content.config.admin = rc.config.admin; LMStore.saveLocal(state.content); } catch (eS) { /* noop */ }
        return { ok: true, root: false, chash: (rc.config.admin.auth || {}).hash || null, refreshed: true };
      }).catch(function () { return r; /* 离线/拉取失败：维持本地结论 */ });
    }).catch(function () { return { ok: false, root: false, chash: null }; });
  }
  /* 老单轮哈希 → v2 拉伸记录（独立随机盐），并删除旧哈希 */
  function upgradeAdminPassword(pw) {
    const salt = LMStore.randomSaltHex(16);
    LMStore.pbkdf2Hex(pw, salt, LMStore.PBKDF2_ITERS).then(function (hash) {
      state.content.config.admin.auth = { v: 2, iters: LMStore.PBKDF2_ITERS, salt: salt, hash: hash };
      dropLegacyHash();
    }).catch(function (e) { /* 加密环境异常时保持旧格式，不影响本次登录 */ });
  }
  function dropLegacyHash() {
    if (state.content.config.admin && state.content.config.admin.passwordHash) {
      delete state.content.config.admin.passwordHash;
      LMStore.saveLocal(state.content);
    }
  }
  /* 登录弹窗（连续失败 5 次锁定 30 秒，防脚本穷举） */
  function loginModal() {
    /* ★ 修复57：打开弹窗就先检查锁定状态——避免输完长密码点提交才被告知"系统繁忙"白输一场 */
    const preLock = +(sessionStorage.getItem('lm_lock_until') || 0);
    const preNote = (Date.now() < preLock)
      ? '<p class="modal-note">⏳ 系统繁忙，请等 ' + Math.ceil((preLock - Date.now()) / 1000) + ' 秒后再试（错误码 0x2F）——现在输入不会被接受。</p>'
      : '';
    LMEditor.modal('<form id="pwForm">'
      + '<h3>管理员登录</h3>'
      + '<p class="modal-note">' + esc((state.content.config.admin && state.content.config.admin.hint) || '') + '</p>'
      + '<p class="modal-note">💡 在其他设备改过密码？请先在那台设备点「☁️ 同步到 GitHub」——本机验证失败时会自动尝试云端最新的密码数据。</p>'
      + preNote
      + '<label class="field"><span class="field-label">管理密码</span>'
      + '<div style="position:relative">'
      + '<input class="input" type="password" name="pw" placeholder="请输入管理密码" autocomplete="current-password" enterkeyhint="done" required style="padding-right:44px">'
      + '<button type="button" id="pwEye" title="显示 / 隐藏密码（长密码输入时可核对已打内容）" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:none;background:none;cursor:pointer;font-size:17px;padding:4px 6px;line-height:1;opacity:.65">👁</button>'
      + '</div></label>'
      + '<div class="form-actions"><button type="button" class="btn btn-ghost" data-close>取消</button>'
      + '<button class="btn btn-primary" type="submit">进入管理模式</button></div></form>', function (root) {
      /* ★ 修复58：👁 显示密码切换 —— 长密码输到一半"看不见也确认不了"是排查黑洞；点眼睛明文核对，
         再点恢复圆点；切换后焦点回到输入框，接着打不用重新点 */
      root.querySelector('#pwEye').addEventListener('click', function () {
        const inp = root.querySelector('[name=pw]');
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        this.textContent = show ? '🙈' : '👁';
        this.style.opacity = show ? '1' : '.65';
        try { inp.focus({ preventScroll: true }); } catch (eF) { inp.focus(); }
      });
      root.querySelector('#pwForm').addEventListener('submit', function (e) {
        e.preventDefault();
        const lockUntil = +(sessionStorage.getItem('lm_lock_until') || 0);
        if (Date.now() < lockUntil) {
          toast('系统繁忙，请 ' + Math.ceil((lockUntil - Date.now()) / 1000) + ' 秒后再试（错误码 0x2F）');
          return;
        }
        const v = root.querySelector('[name=pw]').value;
        const btn = root.querySelector('[type=submit]');
        btn.disabled = true; btn.textContent = '正在验证…';
        verifyPasswordSmart(v).then(function (r) {
          btn.disabled = false; btn.textContent = '进入管理模式';
          const ok = !!(r && r.ok);
          if (ok) {
            /* 屏蔽签名密钥：所有管理员共用一把 —— 统一从「团队管理密码」派生（与登录用的具体密码无关），
               这样用不同密码登录的管理员互相认可对方加的屏蔽记录（不会互判为篡改），界面上也看不出任何权限差别；
               仅存本会话不落盘 */
            const adminAuth = (state.content.config && state.content.config.admin && state.content.config.admin.auth) || '';
            if (adminAuth && window.LMStore) {
              LMStore.sha256Hex(String(adminAuth)).then(function (h1) {
                return LMStore.sha256Hex('lm-ban-key|' + h1);
              }).then(function (k) {
                try { sessionStorage.setItem('lm_ban_key', k); } catch (e2) { /* noop */ }
              }).catch(function () { /* noop */ });
            }
            /* 屏蔽名单检查：管理员级屏蔽挡登录；但「专有通道 + 仅自动限时条目」放行——
               专有通道验证通过即本人，登录流程里会自动清除限时条目（防自己把自己锁死）；
               手动屏蔽（另一台管理员设备有意加的）对专有通道依然生效，需在别台解禁 */
            if (window.LMCollab && LMCollab.banStateFor().admin) {
              const bs = LMCollab.banStateFor();
              if (r.root && bs.auto && !bs.manual) {
                /* 仅自动限时：放行，交给登录成功流程清除 */
              } else {
                toast('⛔ 本设备已被限制进入管理模式（设备号 #' + LMCollab.shortId(LMCollab.me().id) + (bs.auto ? '，限时限制将在 30 分钟内自动解除' : '') + '）');
                return;
              }
            }
            sessionStorage.removeItem('lm_fail_n');
            sessionStorage.setItem('lm_admin', '1');
            try { if (r.root) sessionStorage.setItem('lm_root', '1'); else sessionStorage.removeItem('lm_root'); } catch (eS) { /* noop */ }
            state.admin = true; state.root = !!r.root;
            takeAdminSnap(); /* ★ 修复㉜：进入管理模式的瞬间拍内容快照（「↩ 放弃修改」回到这一版） */
            LMEditor.closeModal();
            render();
            toast('管理模式已开启：直接点击文字就能修改（像 Word 一样），改动自动保存'
              + (r.refreshed ? '（已自动获取云端最新密码数据）' : ''));
            /* 密码试错自动限时限制：本机 1 小时内 ≥5 次密码错误 → 登录成功这一刻自动限制
               本设备管理员入口 30 分钟（banSelf 专用通道：等签名密钥就绪、允许作用于本机、
               条目带 until 自动过期）；专有通道登录成功会自动清除本机限时条目（防锁死），
               别的密码登录者被限制后，可由他人在 ⚙ 协作与设备 里提前解禁 */
            try {
              const fh = JSON.parse(localStorage.getItem('lm_fail_hist') || '[]')
                .filter(function (t2) { return Date.now() - t2 < 3600000; });
              if (fh.length >= 5 && window.LMCollab) {
                if (!r.root && LMCollab.banSelf) {
                  LMCollab.banSelf(1800000);
                  toast('⛔ 本设备 1 小时内密码错误 ' + fh.length + ' 次，管理员入口将被限制 30 分钟');
                } else if (r.root) {
                  const cleared = LMCollab.clearAutoBan ? LMCollab.clearAutoBan() : 0;
                  toast('⚠️ 本设备 1 小时内密码错误 ' + fh.length + ' 次' + (cleared ? '（已自动清除本机限时限制）' : ''));
                }
                localStorage.removeItem('lm_fail_hist');
              }
            } catch (eF2) { /* noop */ }
            /* 访客极简：管理员登录后才启动实时协同（信令 + 在线名单 + 同浏览器互连） */
            try { if (window.LMYCollabStart) window.LMYCollabStart(); } catch (eC0) { /* noop */ }
            /* 补启动旧协同通道（左下角徽章 + 同浏览器互连 + 心跳）：页面加载时还是访客，
               通道注册被跳过——登录成功这一刻必须补调，否则「先开页面再登录」协同永不出现 */
            try { if (window.LMCollab && LMCollab.startAsAdmin) LMCollab.startAsAdmin(); } catch (eS0) { /* noop */ }
            /* 云端上传通道（团队保险箱）：用「团队管理密码」登录时解密先前分发的 GitHub 配置，
               明文 Token 只进本机 sessionStorage，界面上任何地方都看不到、内容文件里只有密文 */
            if (!r.root && window.LMStore) {
              try {
                const box = ((state.content.config || {}).collab || {}).tokenVault;
                if (box) {
                  LMStore.decryptForTeam(box, v).then(function (json) {
                    const cfgT = JSON.parse(json);
                    if (cfgT && cfgT.owner && cfgT.repo && cfgT.token) {
                      LMStore.setGhCfg(cfgT);
                      try { if (window.LMCollab && LMCollab.refreshGh) LMCollab.refreshGh(); } catch (e5) { /* noop */ }
                      toast('☁️ 云端上传通道已开启：工具栏「☁️ 同步到 GitHub」可一键上传');
                    }
                  }).catch(function () { /* 通道未开启或团队密码已变更：上传时再提示 */ });
                }
              } catch (eV0) { /* noop */ }
            }
            /* 协作昵称：每台设备只提醒一次，改一次永久生效 */
            if (window.LMCollab) {
              try {
                if (!localStorage.getItem('lm_collab_named')) toast('💡 建议到 ⚙ 设置 → 协作与设备 给本机起个昵称（同昵称多设备也允许，靠设备号区分）');
              } catch (e3) { /* noop */ }
            }
          } else {
            /* 密码试错防护（1 小时滑动窗口）：失败时间戳持久化到 localStorage（关浏览器也记得）；
               5 次锁定时长指数退避（30 秒 → 2 分钟 → 10 分钟）；对外文案统一「系统繁忙」——
               不向尝试者暴露锁定机制与剩余次数，模拟服务器繁忙的假象 */
            let fh = [];
            try { fh = JSON.parse(localStorage.getItem('lm_fail_hist') || '[]').filter(function (t2) { return Date.now() - t2 < 3600000; }); } catch (eF0) { /* noop */ }
            fh.push(Date.now());
            try { localStorage.setItem('lm_fail_hist', JSON.stringify(fh)); } catch (eF1) { /* noop */ }
            const f = fh.length;
            if (f >= 5) {
              const lockMs = f >= 7 ? 600000 : (f >= 6 ? 120000 : 30000);
              sessionStorage.setItem('lm_lock_until', String(Date.now() + lockMs));
              sessionStorage.removeItem('lm_fail_n');
              toast('系统繁忙，请 ' + Math.ceil(lockMs / 1000) + ' 秒后再试（错误码 0x2F）');
            } else {
              sessionStorage.setItem('lm_fail_n', String(f));
              toast('密码不正确');
            }
          }
        }).catch(function (err) {
          btn.disabled = false; btn.textContent = '进入管理模式';
          toast(err.message);
        });
      });
    });
  }

  /* ---------- 界面版本：自动识别手机 / 电脑，也可在右上角 ⚙ 手动指定 ---------- */
  function isMobileDevice() {
    const ua = navigator.userAgent || '';
    const narrow = window.matchMedia('(max-width: 760px)').matches;   /* 窄屏 */
    const coarse = window.matchMedia('(pointer: coarse)').matches;    /* 主指针是手指 */
    const touch = (navigator.maxTouchPoints || 0) > 1;                /* 多点触控 */
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua);
    /* iPadOS 13+ 的 Safari 默认伪装成 Macintosh UA：用「Mac 平台 + 多点触控」兜底识别 */
    const ipadMasked = /Macintosh/i.test(ua) && touch;
    /* 触屏大屏设备（平板）：手指操作 + 短边 ≤ 820px 也走手机版 */
    const tablet = coarse && touch && Math.min(screen.width || 0, screen.height || 0) <= 820;
    return narrow || uaMobile || ipadMasked || tablet;
  }
  function applyView() {
    const mobile = state.view === 'mobile' ? true : (state.view === 'desktop' ? false : isMobileDevice());
    const changed = document.body.classList.contains('mobile-view') !== mobile;
    document.body.classList.toggle('mobile-view', mobile);
    document.body.classList.toggle('desktop-view', !mobile);
    /* 类变化后才重绘一次（图表按新宽度测量）；初始化阶段只挂类，交给 init() 的首次渲染 */
    if (changed && state.ready) { render(true); adjustImages(); adjustFreeLayoutSafe(); }
  }
  function setViewMode(v) {
    state.view = (v === 'mobile' || v === 'desktop') ? v : 'auto';
    try { localStorage.setItem('lm_view', state.view); } catch (e) { /* noop */ }
    applyView();
    toast(state.view === 'auto'
      ? ('界面版本：自动（识别为' + (isMobileDevice() ? '手机' : '电脑') + '版）')
      : (state.view === 'mobile' ? '界面版本：手机版（在电脑上可预览窄版布局）' : '界面版本：电脑版（在手机上可横向查看完整版）'));
  }

  /* ---------- 右上角 ⚙ 设置面板：管理模式 + 界面版本 ---------- */
  function gearOutside(e) {
    const pop = document.getElementById('gearPop');
    if (pop && !pop.contains(e.target) && !(e.target.closest && e.target.closest('#navGear'))) closeGearPop();
  }
  function closeGearPop() {
    const pop = document.getElementById('gearPop');
    if (pop) pop.remove();
    document.removeEventListener('mousedown', gearOutside, true);
  }
  function refreshGearPop() {
    const pop = document.getElementById('gearPop'); if (!pop) return;
    pop.querySelectorAll('#gearView [data-v]').forEach(function (b2) {
      b2.classList.toggle('on', state.view === b2.getAttribute('data-v'));
    });
    const adm = pop.querySelector('#gearAdmin');
    adm.textContent = state.admin ? '退出' : '进入';
    adm.className = 'btn ' + (state.admin ? 'btn-ghost' : 'btn-primary');
    pop.querySelector('#gearAdminDesc').textContent = state.admin
      ? '已开启：点击文字即可修改，改动自动保存'
      : '关闭：访客看到的是只读作品';
  }
  function toggleGearPop() {
    if (document.getElementById('gearPop')) { closeGearPop(); return; }
    const pop = document.createElement('div');
    pop.id = 'gearPop';
    pop.innerHTML = ''
      + '<div class="gp-row">'
      +   '<div class="gp-info"><div class="gp-t">管理员模式</div><div class="gp-d" id="gearAdminDesc"></div></div>'
      +   '<button class="btn btn-primary" id="gearAdmin" type="button">进入</button>'
      + '</div>'
      + '<div class="gp-div"></div>'
      + '<div class="gp-row gp-col">'
      +   '<div class="gp-t">界面版本</div>'
      +   '<div class="gp-seg" id="gearView">'
      +     '<button type="button" data-v="auto">自动</button>'
      +     '<button type="button" data-v="mobile">手机版</button>'
      +     '<button type="button" data-v="desktop">电脑版</button>'
      +   '</div>'
      +   '<div class="gp-d">自动 = 按设备识别（本机：' + (isMobileDevice() ? '手机' : '电脑') + '）</div>'
      + '</div>'
      + '<div class="gp-div"></div>'
      + '<div class="gp-row gp-col">'
      +   '<div class="gp-t">协作与设备</div>'
      +   '<div class="gp-d" id="gpCollabMode"></div>'
      +   '<label class="field" style="margin-top:8px"><span class="field-label">本机昵称（协同/屏蔽按设备识别，同昵称多设备允许）</span>'
      +     '<input class="input" id="gpNick" maxlength="16" placeholder="如：小明-笔记本"></label>'
      +   '<button class="btn btn-mini" id="gpNickSave" type="button" style="margin-top:6px">保存昵称</button>'
      + '</div>'
      + '<div class="gp-row gp-col" id="gpDevArea" style="display:none">'
      +   '<div class="gp-t">全部设备与屏蔽（仅管理员可见）</div>'
      +   '<div id="gpDevList"></div>'
      + '</div>';
    document.body.appendChild(pop);
    refreshGearPop();
    pop.querySelector('#gearAdmin').addEventListener('click', function () {
      closeGearPop();
      if (state.admin) {
        state.admin = false; state.root = false;
        adminSnap = null; pushSnap = null; /* ★ 修复㉜/83：退出管理模式即弃两份快照 */
        try { sessionStorage.removeItem('lm_admin'); sessionStorage.removeItem('lm_root'); } catch (e5) { /* noop */ }
        render(); toast('已退出管理模式');
      } else loginModal();
    });
    pop.querySelectorAll('#gearView [data-v]').forEach(function (b2) {
      b2.addEventListener('click', function () { setViewMode(b2.getAttribute('data-v')); refreshGearPop(); });
    });
    /* ---- 协作与设备 ---- */
    const cm = pop.querySelector('#gpCollabMode');
    if (cm) cm.textContent = window.LMCollab
      ? ('通道：' + LMCollab.mode() + '；在线 ' + (LMCollab.devices ? LMCollab.devices().filter(function (p) { return !p.recent && !p.lost; }).length : LMCollab.onlineList().length) + ' 台（左下角徽章点开看名单）')
      : '协同模块未加载';
    const nick = pop.querySelector('#gpNick');
    if (nick && window.LMCollab) nick.value = LMCollab.me().name;
    const ns = pop.querySelector('#gpNickSave');
    if (ns) ns.addEventListener('click', function () {
      if (!window.LMCollab) return;
      const v2 = pop.querySelector('#gpNick').value;
      if (!v2.trim()) { toast('昵称不能为空'); return; }
      if (LMCollab.setName(v2)) {
        try { localStorage.setItem('lm_collab_named', '1'); } catch (e3) { /* noop */ }
        toast('昵称已保存：' + v2.trim());
        renderDevList();
      }
    });
    function renderDevList() {
      const area = pop.querySelector('#gpDevArea');
      if (!area) return;
      if (!(window.LMApp && LMApp.state.admin && window.LMCollab)) { area.style.display = 'none'; return; }
      area.style.display = '';
      const listEl = pop.querySelector('#gpDevList');
      const meD = LMCollab.me();
      const now = Date.now();
      /* 所有管理员看到完全相同的设备面板（全部设备 + 屏蔽操作）——没有权限差异，谁也看不出谁是高权限 */
      let bans = [];
      try { bans = ((state.content.config || {}).collab || {}).bans || []; } catch (e4) { bans = []; }
      const isBanned = function (d, scope) {
        return (bans || []).some(function (b3) { return b3 && b3.scope === scope && ((b3.id && b3.id === d.id) || (b3.fp && d.fp && b3.fp === d.fp)); });
      };
      const seen2 = {}; const rows2 = [];
      (window.LMCollab ? LMCollab.rosterList() : []).forEach(function (d) { if (d && d.id && !seen2[d.id]) { seen2[d.id] = 1; rows2.push(d); } });
      if (meD && !seen2[meD.id]) rows2.push({ id: meD.id, name: meD.name, fp: meD.fp, lastSeen: Date.now() });
      listEl.innerHTML = rows2.length ? rows2.map(function (d) {
        const bSite = isBanned(d, 'site'), bAdmin = isBanned(d, 'admin');
        const self = d.id === meD.id;
        const tag = '<b>' + esc(d.name || '设备') + '</b><span class="gp-devid">#' + esc(LMCollab.shortId(d.id)) + '</span>'
          + (bSite ? '<span class="gp-btag">已屏蔽网页</span>' : '') + (bAdmin ? '<span class="gp-btag">已禁管理</span>' : '');
        let ops;
        if (self) ops = '<span class="gp-me">本机</span>';
        else if (bSite || bAdmin) {
          ops = ['site', 'admin'].filter(function (sc) { return isBanned(d, sc); }).map(function (sc) {
            return '<button type="button" class="btn btn-mini" data-unban="' + sc + '" data-dev="' + esc(d.id) + '" data-fp="' + esc(d.fp || '') + '">✅ 解除' + (sc === 'site' ? '网页屏蔽' : '管理限制') + '</button>';
          }).join(' ');
        } else {
          ops = '<button type="button" class="btn btn-mini danger" data-ban="site" data-dev="' + esc(d.id) + '" data-fp="' + esc(d.fp || '') + '" data-nm="' + esc(d.name || '') + '">🚫 屏蔽网页</button> '
              + '<button type="button" class="btn btn-mini danger" data-ban="admin" data-dev="' + esc(d.id) + '" data-fp="' + esc(d.fp || '') + '" data-nm="' + esc(d.name || '') + '">🔒 禁进管理</button>';
        }
        return '<div class="gp-dev"><div class="gp-devm">' + tag + '</div><div class="gp-ops">' + ops + '</div></div>';
      }).join('') : '<div class="gp-d">还没有其他设备连入过（打开本站的设备会自动登记到这里）</div>';
    }
    renderDevList();
    pop.addEventListener('click', function (e) {
      const bn = e.target.closest ? e.target.closest('[data-ban]') : null;
      const ub = e.target.closest ? e.target.closest('[data-unban]') : null;
      if (bn && window.LMCollab) {
        LMCollab.banDevice(bn.getAttribute('data-dev'), bn.getAttribute('data-fp'), bn.getAttribute('data-ban'), bn.getAttribute('data-nm'));
        setTimeout(renderDevList, 400);
      }
      if (ub && window.LMCollab) {
        LMCollab.unbanDevice(ub.getAttribute('data-dev'), ub.getAttribute('data-fp'), ub.getAttribute('data-unban'));
        setTimeout(renderDevList, 400);
      }
    });
    setTimeout(function () { document.addEventListener('mousedown', gearOutside, true); }, 0);
  }

  /* 「反馈与建议」页（老师要求的六个页面之一：首页 / 领域 / 生态 / 认知 / 更新记录 / 反馈与建议）。
     v2：这是给访客看的「留言提交」页，不是组内公示表 —— 文案面向访客；
     留言框与管理员查看通道由 mountFeedback() 动态渲染（静态页存浏览器本地） */
  const FEEDBACK_PAGE = {
    id: 'feedback', kind: 'page', icon: '💬', label: '反馈与建议', title: '反馈与建议',
    description: '对我们的工作有疑问、发现错误或有改进建议？在下方留言（可匿名）。留言与处理记录对所有人公开，我们会逐条回应。',
    blocks: [
      { type: 'paragraph', size: 'lead', text: '如果你对我们的**选题、页面、资料或分工**有疑问、发现错误，或者有改进建议，欢迎在下方留言——**可以匿名**。留言和我们的处理记录（怎样核实 → 改了什么 → 为什么这样处理）**对所有人公开**，既方便互相参考，也便于课程检查。' },
      { type: 'callout', tone: 'blue', title: '我们会怎么处理（作业要求）', text: '**每组应获得至少 3 名非本组同学的独立反馈**，且每条都要回应：记录「同学提出了什么 → 我们怎样核实 → 修改了什么 → 为什么调整或保留原判断」；**不采纳也会写明理由**。提问题时建议说清楚：针对哪个页面或哪项工作、遇到了什么问题、期望是什么。' }
    ]
  };
  /* ★ 修复95：讨论区独立成页（老内容缺这一页时由 migrate() 自动补，避免与反馈挤在一起） */
  const DISCUSS_PAGE = {
    id: 'discuss', kind: 'page', icon: '🗣️', label: '讨论区', title: '讨论区',
    description: '围绕三张地图自由讨论：提问、补充材料、互相质疑都可以。与「反馈与建议」分开，避免正式反馈被聊天淹没。',
    blocks: [
      { type: 'paragraph', size: 'lead', text: '这里像一个小型讨论版：可以**提问、补充材料、质疑某条判断**，也可以只看别人在聊什么。发言请遵守基本礼貌；恶意刷屏会被屏蔽身份码。' },
      { type: 'callout', tone: 'green', title: '讨论区与反馈页的分工', text: '**本页**用于自由讨论（想法、补充材料、互相答疑）；**「反馈与建议」页**用于希望我们动手修改的正式意见——那边每条都会记录「怎样核实 → 改了什么 → 为什么这样处理」并对所有人公开。想让我们改内容的，建议写到反馈页。' }
    ]
  };

  /* ---------- 访客反馈（留言框 + 管理员通道）----------
     静态站方案：反馈保存在本机 localStorage（lm_feedback_v1），不进内容 JSON。
     ★ 修复95：反馈现在对所有人公开（不再是「只有管理员可见」）——
       · 列表来源：① 本机已有的记录；② 有 Token 的管理员设备从数据分支 API 合并；
         ③ 访客无 Token 时直接读公开仓库 raw 的 data/feedback.json（只读）；
         ④ MQTT 实时流（管理员可补收，访客只收在线新留言）。
       三/四路都汇进 fbMergeIncoming()，按 id + updatedAt 去重（删除用墓碑）。
     所有输出都经 esc() 转义防注入。 */
  var FB_KEY = 'lm_feedback_v1';
  /* ★ 修复92：本机存「全量」（含删除墓碑 del），界面只看未删除的 —— 云端同步靠墓碑
     才能做到「A 删了，B 不会又把它同步回来」 */
  function fbRaw() {
    try { const a = JSON.parse(localStorage.getItem(FB_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function fbList() { return fbRaw().filter(function (it) { return it && !it.del; }); }
  function fbStore(list) {
    try { localStorage.setItem(FB_KEY, JSON.stringify(list)); } catch (e) { toast('反馈保存失败：浏览器存储不可用'); }
    fbPushSoon();   /* ★ 修复92：有 Token 的设备顺手同步到数据分支；没有 Token 什么也不做 */
  }
  /* ★ 修复92：反馈云端同步（只写数据分支 lm-data → 不触发 Pages 构建；无 Token 直接跳过） */
  var _fbPushT = null, _fbBusy = false;
  function fbPushSoon() {
    if (!window.LMFB || !LMFB.hasCloud() || _fbBusy) return;
    if (_fbPushT) clearTimeout(_fbPushT);
    _fbPushT = setTimeout(function () { _fbPushT = null; fbSyncNow(false); }, 1500);
  }
  function fbSyncNow(showToast) {
    if (!window.LMFB || !LMFB.hasCloud() || _fbBusy) return Promise.resolve(false);
    _fbBusy = true;
    return LMFB.sync(fbRaw()).then(function (r) {
      _fbBusy = false;
      if (r && r.ok && r.changed) {
        try { localStorage.setItem(FB_KEY, JSON.stringify(r.list)); } catch (e) { /* noop */ }
        if (document.getElementById('fbMount')) mountFeedback();
      }
      if (showToast) toast(r && r.ok ? '☁ 反馈已同步到云端' : '⚠ 反馈云端同步失败（内容已存在本机）');
      return !!(r && r.ok);
    }, function () { _fbBusy = false; return false; });
  }
  /* ★ 修复93：把收到的留言并进本机 —— MQTT 实时送达 / 链接接力 / 云端拉取 三条路都走这一个漏斗 */
  function fbMergeIncoming(list) {
    if (!list || !list.length) return 0;
    const raw = fbRaw();
    const merged = LMFB.merge(raw, list);
    if (JSON.stringify(merged) === JSON.stringify(raw)) return 0;
    try { localStorage.setItem(FB_KEY, JSON.stringify(merged)); } catch (e) { return 0; }
    fbPushSoon();
    if (document.getElementById('fbMount')) mountFeedback();
    /* ★ 修复96：返回「真正新增 / 被更新」的条数 —— 原来返回入参条数，重复拉同一份也会报「收到 N 条」 */
    const old = {};
    raw.forEach(function (x) { old[x.id] = x.updatedAt || x.ts || 0; });
    let n = 0;
    merged.forEach(function (x) {
      const t = x.updatedAt || x.ts || 0;
      if (old[x.id] === undefined || t > old[x.id]) n++;
    });
    return n;
  }
  /* ★ 修复92：URL 里带着别人的留言（#fb=…）→ 收进来（按 id 去重），有 Token 就顺手上传 */
  function fbIngestUrl() {
    try {
      if (!window.LMFB) return;
      const n = fbMergeIncoming(LMFB.readFromUrl());
      if (n) toast('📥 已收下 ' + n + ' 条同学留言' + (LMFB.hasCloud() ? '（正在同步到云端）' : '（先存在本机）'));
    } catch (e) { /* noop */ }
  }
  function fbNextId(list) {
    let mx = 0;
    list.forEach(function (it) { const m = String(it.id || '').match(/(\d+)$/); if (m) mx = Math.max(mx, +m[1]); });
    return 'F-' + (mx + 1 < 10 ? '0' : '') + (mx + 1);
  }
  function fbTs(ts) {
    const d = new Date(ts), p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  /* v3 迁移：老数据补设备身份码（老数据本就存在这台浏览器里，归属本机设备） */
  function fbMigrate() {
    const meD = LMCommunity.me(), list = fbRaw();   /* ★ 修复92：用全量（含墓碑），别把已删记录「复活」 */
    let changed = false;
    list.forEach(function (it) { if (!it.dev) { it.dev = meD.code; changed = true; } });
    if (changed) fbStore(list);
  }
  /* ★ 修复95：状态徽章（待处理 / 已采纳 / 已修改 / 保留原判断） */
  function fbStatusChip(st) {
    const s = (window.LMFB && LMFB.fixStatus) ? LMFB.fixStatus(st) : (st || '待处理');
    const map = { '待处理': 'wait', '已采纳': 'ok', '已修改': 'done', '保留原判断': 'keep' };
    return '<span class="fb-st fb-st-' + (map[s] || 'wait') + '">' + esc(s) + '</span>';
  }
  /* ★ 修复95：处理记录 —— 老师原文「同学提出了什么 → 我们怎样核实 → 修改了什么 →
     为什么调整或保留原判断；不采纳建议时也应说明理由」 */
  function fbRecordHtml(it) {
    const rows = [
      ['🔎 我们怎样核实', it.check],
      ['✏️ 修改了什么', it.change],
      ['💬 为什么这样处理', it.why],
      ['📝 小组回复', it.reply]
    ].filter(function (r) { return r[1]; });
    if (!rows.length) return '';
    return '<div class="fb-record">' + rows.map(function (r) {
      return '<p><b>' + r[0] + '</b>' + esc(r[1]) + '</p>';
    }).join('') + '</div>';
  }
  /* 一条反馈。opt: { admin, mine } */
  function fbItemHtml(it, opt) {
    const o = opt || {};
    const isAdmin = !!o.admin;
    const safeUrl = /^https?:\/\//i.test(String(it.url || '')) ? it.url : '';
    const devChip = isAdmin && it.dev ? '<span class="fb-code">🆔 ' + esc(it.dev) + '</span>' : '';
    const mineChip = o.mine ? '<span class="fb-code">我提的</span>' : '';
    const maskBtn = isAdmin ? '<button type="button" class="fb-mini fb-mask" data-fbmask title="屏蔽该身份码（累计3次将禁言1个月）">🚫 屏蔽</button>' : '';
    const acts = isAdmin ? '<div class="fb-acts">'
      + '<button type="button" class="fb-mini fb-ac" data-fbact="已采纳">✔ 采纳</button>'
      + '<button type="button" class="fb-mini fb-ac" data-fbact="已修改">✅ 已修改</button>'
      + '<button type="button" class="fb-mini fb-ac" data-fbact="保留原判断">✖ 保留原判断</button>'
      + '<button type="button" class="fb-mini" data-fbact="待处理">↺ 待处理</button>'
      + '</div>'
      + '<div class="fb-ops fb-ops-rec">'
      + '<input class="fb-input" data-fbcheck maxlength="300" placeholder="① 我们怎样核实（查了哪页 / 有无来源 / 问了谁）" value="' + esc(it.check || '') + '">'
      + '<input class="fb-input" data-fbchange maxlength="300" placeholder="② 修改了什么（改了哪页 / 哪条关系 / 补了什么来源）" value="' + esc(it.change || '') + '">'
      + '<input class="fb-input" data-fbwhy maxlength="300" placeholder="③ 为什么调整或保留原判断（不采纳也要写理由）" value="' + esc(it.why || '') + '">'
      + '<input class="fb-input fb-reply" data-fbreply maxlength="200" placeholder="给同学的回复（选填，公开可见）" value="' + esc(it.reply || '') + '">'
      + '<button type="button" class="fb-mini fb-del" data-fbdel>删除</button>' + maskBtn + '</div>' : '';
    return '<div class="fb-item' + (o.mine ? ' fb-mine' : '') + '" data-fbid="' + esc(it.id) + '">'
      + '<div class="fb-meta"><b>' + esc(it.id) + '</b><span>' + fbTs(it.ts) + '</span><span>' + esc(it.type || '')
      + '</span><span>' + esc(it.name || '匿名') + '</span>' + mineChip + devChip + fbStatusChip(it.status) + '</div>'
      + '<p class="fb-text">' + esc(it.text || '') + '</p>'
      + (safeUrl ? '<p class="fb-url">相关链接：<a href="' + esc(safeUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(safeUrl) + '</a></p>' : '')
      + (isAdmin ? '' : fbRecordHtml(it))
      + acts
      + '</div>';
  }
  /* ★ 修复95：公开列表 —— 所有人都能看到「大家提了什么 + 我们怎么处理的」 */
  function fbPublicHtml(list, meCode) {
    const n = list.length;
    return '<section class="fb-sec fb-public"><h2 class="fb-title">📋 大家的反馈与处理（' + n + '）</h2>'
      + '<p class="fb-hint">这里对所有人公开：谁提了什么、我们怎样核实、改了哪些内容、哪些建议暂时没采纳以及理由。</p>'
      + (n
        ? '<div class="fb-list">' + list.slice().reverse().map(function (it) {
          return fbItemHtml(it, { mine: !!(meCode && it.dev === meCode) });
        }).join('') + '</div>'
        : '<p class="fb-empty">还没有人提反馈 —— 你可以是第一个，上面的留言会显示在这里。</p>')
      + '</section>';
  }
  /* 渲染反馈区 v3：反馈表单 + 我的反馈（含小组回复）+ 讨论区（帖子/楼中楼/昵称）+ 管理员通道 */
  function fbFormHtml() {
    return '<section class="fb-sec">'
      + '<h2 class="fb-title">📝 提交反馈</h2>'
      + '<form id="fbForm" novalidate>'
      + '<div class="fb-row">'
      + '<label class="fb-field"><span>称呼（选填，留空则匿名）</span><input id="fbName" class="fb-input" maxlength="30" placeholder="匿名"></label>'
      + '<label class="fb-field"><span>类型</span><select id="fbType" class="fb-input"><option>提出问题</option><option>提建议</option></select></label>'
      + '</div>'
      + '<label class="fb-field"><span>内容（必填，最多 800 字）</span><textarea id="fbText" class="fb-input" rows="4" maxlength="800" placeholder="请写清楚：针对哪个页面 / 哪项工作，遇到了什么问题或有什么建议…"></textarea></label>'
      + '<label class="fb-field"><span>相关链接（选填）</span><input id="fbUrl" class="fb-input" maxlength="300" placeholder="https://…"></label>'
      + '<div class="fb-actions"><button type="submit" class="fb-send">发送</button><span class="fb-hint">提交后会显示在下方「大家的反馈」里，<b>对所有人公开</b>（可匿名）；我们会在每条下面写清「怎样核实 → 改了什么 → 为什么这样处理」。</span></div>'
      + '<p class="fb-ok" id="fbOk" hidden></p>'
      + '</form></section>';
  }
  /* ★ 修复95：「我的反馈」并入公开列表（带「我提的」标记），页面不再分两处重复展示 */
  /* 讨论区：昵称栏（7 天可改一次）+ 帖子 + 楼中楼回复；管理员可见身份码并可屏蔽 */
  function dcBarHtml(meD) {
    const DAY = 86400000;
    const lockLeft = meD.nick ? Math.max(0, meD.nickAt + 7 * DAY - Date.now()) : 0;
    const lockTip = lockLeft > 0 ? '（' + Math.ceil(lockLeft / DAY) + ' 天后可再改）' : '';
    return '<div class="dc-bar"><span class="dc-me">当前昵称：<b>' + esc(LMCommunity.displayName()) + '</b>'
      + '<span class="dc-code" title="设备身份码：仅自己与管理员可见">' + esc(meD.code) + '</span></span>'
      + '<span class="dc-nick-edit"><input id="dcNick" class="fb-input" maxlength="16" placeholder="新昵称（7天一次）">'
      + '<button type="button" class="fb-mini" id="dcNickSave">改昵称</button><span>' + lockTip + '</span></span></div>'
      + (LMCommunity.isBlocked() ? '<p class="dc-warn">🚫 你的账号已被屏蔽（多次严重违规），无法发言。</p>'
        : LMCommunity.isMuted() ? '<p class="dc-warn">⏳ 你已被禁言，还剩 ' + LMCommunity.muteLeftDays() + ' 天。</p>' : '');
  }
  function dcMsgHtml(m, isAdmin) {
    const hid = LMCommunity.isHidden(m.id);
    const code = isAdmin ? '<span class="dc-code">🆔 ' + esc(m.dev || '?') + '</span>' : '';
    const mine = !!(m.dev && m.dev === LMCommunity.me().code);
    let ops = (isAdmin || mine) ? '<button type="button" class="fb-mini" data-dcdel="' + esc(m.id) + '" title="' + (isAdmin ? '删除' : '删除我发的') + '">🗑</button>' : '';
    if (isAdmin) ops += '<button type="button" class="fb-mini" data-dcmask="' + esc(m.id) + '" title="屏蔽该言论并记录身份码（累计3次禁言1个月）">🚫</button>';
    const canTalk = !LMCommunity.isBlocked() && !LMCommunity.isMuted();
    return '<div class="dc-msg' + (m.pid ? ' dc-reply' : '') + (hid ? ' dc-hid' : '') + '" data-dcid="' + esc(m.id) + '">'
      + '<div class="dc-head"><b class="dc-nick">' + esc(m.nick || '访客') + '</b>' + code
      + (m.rto ? '<span class="dc-rto">回复 @' + esc(m.rto) + '</span>' : '')
      + '<span class="dc-time">' + fbTs(m.ts) + '</span>' + (hid ? '<span class="fb-st">已屏蔽</span>' : '') + '</div>'
      + '<p class="dc-text">' + esc(m.text || '') + '</p>'
      + '<div class="dc-ops">'
      + (canTalk ? '<button type="button" class="fb-mini" data-dcshow="' + esc(m.id) + '">💬 回复</button>' : '')
      + ops + '</div>'
      + '<form class="dc-replyform" data-dcreply="' + esc(m.pid || m.id) + '" hidden novalidate>'
      + '<input type="hidden" name="rto" value="">'
      + '<textarea name="text" class="fb-input" rows="2" maxlength="300" placeholder="回复（最多 300 字）…"></textarea>'
      + '<button type="submit" class="fb-mini">发送回复</button></form>'
      + '</div>';
  }
  /* 讨论区数据 v4：正本在 state.content.discuss（随协作三通道跨设备同步），
     localStorage lm_discuss_v1 只是本机镜像（离线兜底 + 老数据迁移源）。
     dcPersist：写镜像 + 落盘 + 把新发言广播给其他设备（dcommit 帧只带增量，防止整包覆盖正文） */
  function dcAll() { if (!Array.isArray(state.content.discuss)) state.content.discuss = []; return state.content.discuss; }
  function dcPersist(changed) {
    LMCommunity.dcStore(dcAll());
    try { LMStore.saveLocal(state.content); } catch (e) { /* noop */ }
    if (changed && changed.length && window.LMCollab) { try { LMCollab.dcSend(changed); } catch (e2) { /* noop */ } }
    /* ★ 修复100：顺手写云存档 —— 否则「谁都没开网页」或「对方没连协作」时，这条发言永远只在本机。
       失败不打扰用户：下次打开讨论区会按「云端缺的本机补推」再补一次。 */
    if (changed && changed.length && window.LMFB && LMFB.dcSave) { try { LMFB.dcSave(changed); } catch (e3) { /* noop */ } }
  }
  /* ★ 修复100：讨论区云存档（独立表 lm_discuss）
     —— 打开讨论区时拉一次（60 秒节流）：云端有、本机没有的并进来（删除墓碑优先）；
     本机有、云端没有的（离线发的、上次写失败、刚换表）补推一次，双向自愈。 */
  var _dcPullAt = 0, _dcPulling = false;
  /* ★ 修复103（额度保护）：没人说话的时候自动降频，别让「挂着讨论区一整天」把云存档流量耗光。
     30 秒（有人在说话）→ 60 秒 → 120 秒（上限）；一检测到变化立刻回到 30 秒。
     15 秒自检不变，所以最多 120 秒内必定发现别人的新帖/删除，正常聊天时段仍是 30 秒。 */
  var _dcGap = 30000;
  function dcCloudApply(list) {
    const cur = dcAll();
    const have = {};
    cur.forEach(function (m) { if (m && m.id) have[m.id] = 1; });
    let added = 0;
    (list || []).forEach(function (m) { if (m && m.id && !have[m.id]) added++; });
    const merged = window.LMFB.dcMerge(cur, list);
    const sig = function (l) {
      return l.length + '|' + l.map(function (m) { return (m && m.id) + ':' + ((m && m.del) || 0); }).join(',');
    };
    const before = sig(cur);
    if (sig(merged) === before) return { added: 0, changed: false };
    state.content.discuss = merged;
    try { LMCommunity.dcStore(merged); } catch (e1) { /* noop */ }
    try { LMStore.saveLocal(state.content); } catch (e2) { /* noop */ }
    return { added: added, changed: true };
  }
  /* ★ 修复102：自动刷新不许吞掉正在输入的草稿
     —— 重绘会重建整段 HTML，正在写的「发帖 / 回复」文本会一起消失。
     有人正在讨论区的输入框里打字时先记个账（_dcDirty），等他离开输入框后的下一次自检再重绘。 */
  var _dcDirty = false;
  function dcBusy() {
    const a = document.activeElement;
    if (!a || !a.tagName) return false;
    const tag = String(a.tagName).toLowerCase();
    if (tag !== 'textarea' && tag !== 'input') return false;
    const host = document.getElementById('dcMount');
    return !!(host && host.contains(a));
  }
  function dcRepaint() {
    if (!document.getElementById('dcMount')) return;
    if (dcBusy()) { _dcDirty = true; return; }   /* 打字中：只记账，不动 DOM */
    _dcDirty = false;
    mountDiscuss();
  }
  function dcCloudPull() {
    if (!window.LMFB || !LMFB.dcList || !LMFB.cloudCfg) return;
    let cfg = null;
    try { cfg = LMFB.cloudCfg(); } catch (e0) { cfg = null; }
    if (!cfg) return;                                   /* 没配云存档：一个字都不提，界面照旧 */
    const now = Date.now();
    if (now - _dcPullAt < _dcGap || _dcPulling) return;
    _dcPullAt = now; _dcPulling = true;
    LMFB.dcList().then(function (r) {
      _dcPulling = false;
      if (!r || !r.ok || !Array.isArray(r.list)) return;   /* 失败：节奏保持不变，下次照常重试 */
      const cloudIds = {};
      r.list.forEach(function (m) { if (m && m.id) cloudIds[m.id] = 1; });
      let changedNow = false;
      if (r.list.length) {
        const res = dcCloudApply(r.list);
        changedNow = !!res.changed;
        if (changedNow) dcRepaint();   /* ★ 修复101/102：删除也要重绘；但正在打字时不打断 */
        if (res.added && document.getElementById('dcMount')) {
          toast('☁ 讨论区从云存档补齐 ' + res.added + ' 条');
        }
      }
      /* ★ 修复103：有变化 → 回到 30 秒；一直没变化 → 逐步放宽到 120 秒（省云存档流量） */
      _dcGap = changedNow ? 30000 : Math.min(Math.round(_dcGap * 2), 120000);
      /* 本机有、云端没有 → 补推（含删除墓碑），一次最多 30 条，避免把整库怼上去 */
      const miss = dcAll().filter(function (m) { return m && m.id && !cloudIds[m.id] && m.dev !== 'import'; }).slice(0, 30);
      if (miss.length) { try { LMFB.dcSave(miss); } catch (e3) { /* noop */ } }
    }).catch(function () { _dcPulling = false; });
  }
  /* ★ 修复101：讨论区页面开着不动时也要自己刷新
     —— 以前 dcCloudPull 只在「打开讨论区那一刻」调用，于是别人发的帖 / 删的帖要等你自己重进页面才看得到
     （而且 60 秒节流还会再挡一次）。现在每 15 秒看一眼：不在讨论区页 / 浏览器后台时一次请求都不发，
     真拉取仍按 dcCloudPull 内部 30 秒节流，所以最多 30 秒后别人的删除与新增就会出现在你眼前。
     ★ 修复102：顺手补一次「记账中的重绘」—— 你刚才在打字、我压着没刷的那次，等你不打字了就补上。 */
  setInterval(function () {
    if (document.hidden) return;
    if (!document.getElementById('dcMount')) { _dcDirty = false; return; }
    if (_dcDirty) dcRepaint();
    dcCloudPull();
  }, 15000);
  function dcHtml() {
    const isAdmin = state.admin; /* 被屏蔽的言论所有管理员都能看到（与普通权限一致，看不出谁有特殊通道） */
    const all = dcAll().filter(function (m) { return m && !m.del; });
    const posts = all.filter(function (m) { return !m.pid && (!LMCommunity.isHidden(m.id) || isAdmin); });
    const replies = all.filter(function (m) { return m.pid && (!LMCommunity.isHidden(m.id) || isAdmin); });
    let h = '<section class="fb-sec dc-sec"><h2 class="fb-title">🗣️ 讨论区</h2>'
      + '<p class="fb-hint">大家可以在这里互相交流；默认以设备身份码作为昵称，可改成昵称（7 天一次）。含不当内容的发言会被自动拦截。</p>'
      + dcBarHtml(LMCommunity.me())
      + '<form id="dcForm" novalidate>'
      + '<textarea name="text" class="fb-input" rows="3" maxlength="500" placeholder="说点什么…（最多 500 字）"></textarea>'
      + '<div class="fb-actions"><button type="submit" class="fb-send">发表</button></div></form>'
      + '<div class="dc-list">';
    if (!posts.length) h += '<p class="fb-empty">还没有讨论内容，来发第一帖吧。</p>';
    posts.forEach(function (p) {
      h += dcMsgHtml(p, isAdmin);
      const rs = replies.filter(function (r) { return r.pid === p.id; });
      if (rs.length) h += '<div class="dc-replies">' + rs.map(function (r) { return dcMsgHtml(r, isAdmin); }).join('') + '</div>';
    });
    h += '</div></section>';
    return h;
  }
  /* ★ 修复96：云存档配置区（管理员填一次，随内容同步给所有访客 —— 端点本来就该公开） */
  /* ★ 修复97：云存档测试结果常驻显示（toast 2.6 秒就消失，错误信息必须留在面板上） */
  let fbCloudMsg = '';
  function cloudMsg(txt) {
    fbCloudMsg = String(txt || '');
    const el = document.getElementById('fbCloudMsg');
    if (el) el.textContent = fbCloudMsg;
  }
  function fbCloudHtml() {
    const info = (window.LMFB && LMFB.cloudInfo) ? LMFB.cloudInfo() : { on: false, text: '模块未加载' };
    const C = (function () {
      try { return (state.content.config && state.content.config.fbCloud) || {}; } catch (e) { return {}; }
    })();
    const opts = [['', '关闭'], ['supabase', 'Supabase（推荐 · 可读回）'],
      ['worker', '自建 Worker（可读回）'], ['webhook', '群机器人（只提醒，不读回）']];
    return '<details class="fb-cloud"' + (info.on ? '' : ' open') + '>'
      + '<summary>☁ 云存档：让「谁都没开网页」时也不丢（不受 6 小时限制）</summary>'
      + '<p class="fb-hint">现状：<b>' + esc(info.text) + '</b>。原理 —— 同学点「发送」时，'
      + '<b>他自己的浏览器</b>把这条留言写进云存档，所以不需要我们任何人在线；下次谁打开反馈页都会自动拉回来。'
      + '（MQTT 只是「秒级提醒」，它的离线补收窗口由公共 broker 定死 6 小时，改不了。）</p>'
      + '<div class="fb-row">'
      + '<label class="fb-field"><span>类型</span><select id="fbCloudKind" class="fb-input">'
      + opts.map(function (o) {
        return '<option value="' + o[0] + '"' + ((C.kind || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('')
      + '</select></label>'
      + '<label class="fb-field"><span>URL（Worker 填端点；Supabase 填项目地址）</span>'
      + '<input id="fbCloudUrl" class="fb-input" maxlength="300" placeholder="https://xxxx.supabase.co" value="' + esc(C.url || '') + '"></label>'
      + '</div>'
      + '<div class="fb-row">'
      + '<label class="fb-field"><span>anon key（仅 Supabase；可公开，靠 RLS 限制权限）</span>'
      + '<input id="fbCloudKey" class="fb-input" maxlength="400" placeholder="eyJhbGciOi…（anon public）" value="' + esc(C.key || '') + '"></label>'
      + '<label class="fb-field"><span>表名（Supabase）</span>'
      + '<input id="fbCloudTable" class="fb-input" maxlength="60" value="' + esc(C.table || 'lm_feedback') + '"></label>'
      + '</div>'
      + '<div class="fb-actions"><button type="button" class="fb-mini" id="fbCloudSave">保存云存档设置</button>'
      + '<button type="button" class="fb-mini" id="fbCloudTest">测试 / 立即拉取</button>'
      + '<span class="fb-hint">保存后请点顶部「☁️ 同步到 GitHub」，访客才拿得到这个端点。</span></div>'
      + '<p class="fb-hint fb-cloud-msg" id="fbCloudMsg">' + esc(fbCloudMsg) + '</p>'
      + '<label class="fb-field fb-imp"><span>粘贴导入（飞书多维表格 / 腾讯文档 / Excel：框选复制，带表头直接粘）</span>'
      + '<textarea id="fbImport" class="fb-input" rows="3" placeholder="时间&#9;称呼&#9;类型&#9;内容&#10;2026-10-30 14:20&#9;小明&#9;提建议&#9;建议给生态地图补一条公开来源"></textarea></label>'
      + '<div class="fb-actions"><button type="button" class="fb-mini" id="fbImportGo">导入到反馈列表</button>'
      + '<span class="fb-hint">也支持 JSON 数组；按 id 去重，重复导入不会翻倍。</span></div>'
      + '</details>';
  }
  function fbAdminHtml(fb) {
    const pending = fb.filter(function (it) { return fixSt(it.status) === '待处理'; }).length;
    /* ★ 修复95：按「设备身份码」去重统计 —— 作业要求「至少 3 名非本组同学的独立反馈」，这里可直接自检 */
    const devs = {};
    fb.forEach(function (it) { if (it.dev) devs[it.dev] = 1; });
    const devN = Object.keys(devs).length;
    return '<section class="fb-sec fb-admin"><h2 class="fb-title">🔐 反馈处理（管理员通道）</h2>'
      /* ★ 修复95：先讲清老师要求的「四段记录」，再加统计 */
      + '<p class="fb-hint">待处理 <b>' + pending + '</b> / 共 ' + fb.length + ' 条 · 来自 <b>' + devN + '</b> 个设备身份码'
      + (devN < 3 ? '（作业要求至少 3 名非本组同学，还差 ' + (3 - devN) + ' 位）' : '（已满足「至少 3 名非本组同学」）') + '。'
      + '作业要求记下：<b>① 我们怎样核实 → ② 修改了什么 → ③ 为什么调整或保留原判断</b>（不采纳也要写理由）。'
      + '点 <b>✔ 采纳 / ✅ 已修改 / ✖ 保留原判断</b> 标记状态，填的说明会同步到下面的公开列表。</p>'
      /* ★ 修复92：云端同步状态 + 手动同步（只写数据分支，不触发构建） */
      + '<p class="fb-hint">'
      + (window.LMFB && LMFB.hasCloud()
        ? '☁ 已连接云端（分支 <b>' + esc(LMFB.refName()) + '</b> · <code>' + esc(LMFB.path) + '</code>）：'
          + '同学发来的留言会自动收进来，你改状态 / 写回复也会同步到其他设备。'
          + ' <button type="button" class="fb-mini" id="fbSyncNow">立即同步</button>'
        : '⚠ 当前设备没有绑定 Token：新留言会实时到达，但改状态/写回复只存在本机。'
          + '建议登录后到「设置 → 同步」绑定一次仓库，处理记录才会写进数据分支、让所有人看到。')
      + '</p>'
      /* ★ 修复93：实时通道状态（复用 EMQX 公共 MQTT，免费匿名；离线期间的留言会补收） */
      + (window.LMFB && LMFB.mqInfo
        ? (function () {
          const mi = LMFB.mqInfo();
          return '<p class="fb-hint">📡 实时通道 <code>' + esc(mi.url) + '</code>（主题 <code>' + esc(mi.topic) + '</code>）：'
            + (mi.on ? '<b>订阅中</b> —— 同学一提交就能到；你关机期间收到的留言，只要在 <b>' + esc(mi.keepText)
              + '</b> 内打开本页就会自动补收（时长由公共 broker 决定，实测 EMQX 6 小时 / HiveMQ 30 分钟）。'
              : '未连上（不影响留言保存；打开本页会自动重连）。')
            + '</p>';
        })()
        : '')
      /* ★ 修复98：「云存档」属于后台运维配置（端点 / anon key / 表名 / 导入），
         只在专有通道登录时渲染 —— 其他管理员只看到批阅区（列表 + 四个动作按钮），
         页面上不出现任何端点、密钥，也不出现任何权限说明。
         数据通道不受影响：cloudCfg() 读的是已公开的 content.config.fbCloud，照常收发。 */
      + (state.root ? fbCloudHtml() : '')
      + fbModHtml()   /* ★ 修复103：词表编辑（词条只在数据里，代码不含任何词） */
      + (fb.length
        ? '<div class="fb-list">' + fb.slice().reverse().map(function (it) { return fbItemHtml(it, { admin: true }); }).join('') + '</div>'
          + '<div class="fb-actions"><button type="button" class="fb-mini" id="fbCopy">📋 复制全部反馈（含处理记录）</button></div>'
        : '<p class="fb-empty">还没有收到反馈。同学在留言页提交后会实时到达；'
          + '若他当时网络异常，也可以点「📤 复制给组长」把链接发给你，你打开就自动收进来。</p>')
      + '</section>';
  }
  /* ★ 修复103：言论过滤词表（管理员维护）
     —— 词条只存在**数据**里（config.modWords，随「同步到 GitHub」发给所有访客），
        源码里一个词都没有。界面只显示数量，不列出词条内容。 */
  function fbModHtml() {
    const st = (window.LMCommunity && LMCommunity.wordStats) ? LMCommunity.wordStats() : { file: 0, mod: 0, active: 0 };
    const arr = (function () {
      try { return (state.content.config && state.content.config.modWords) || []; } catch (e) { return []; }
    })();
    return '<details class="fb-cloud">'
      + '<summary>🛡️ 言论过滤：敏感词 / 广告 / 联系方式（当前生效 ' + st.active + ' 条）</summary>'
      + '<p class="fb-hint">反馈与讨论区在**发布前**都会过一遍：① <b>词表命中</b>（含变体：全角、插空格、加符号、零宽字符）；'
      + '② <b>手机号 / 引导到站外私聊</b>；③ <b>链接刷屏</b>（≥3 条）；④ <b>长串重复字符</b>；⑤ <b>几乎全是符号</b>。'
      + '命中直接拦下并当场提示，不会发出去；词表命中连续 3 次自动禁言 1 个月（防硬试）。<br>'
      + '速度限制：同一设备 <b>10 秒 1 条</b>；讨论区 <b>10 分钟最多 8 条</b>、反馈 <b>10 分钟最多 4 条</b>（刷新页面也照样生效）。</p>'
      + '<label class="fb-field"><span>自定义词表（一行一条，2–30 字；可从公开词表清单整段粘贴，留空 = 只用文件内置）</span>'
      + '<textarea id="fbModWords" class="fb-input" rows="4" maxlength="20000" placeholder="每行一条，保存后随内容同步给所有访客">'
      + esc(arr.join('\n')) + '</textarea></label>'
      + '<div class="fb-actions"><button type="button" class="fb-mini" id="fbModSave">保存词表</button>'
      + '<span class="fb-hint">当前：文件内置 <b>' + st.file + '</b> 条 + 后台 <b>' + st.mod + '</b> 条。'
      + '保存后点顶部「☁️ 同步到 GitHub」才对访客生效。</span></div>'
      + '</details>';
  }
  /* ★ 修复95：状态归一（页面里也有一份，避免依赖顺序） */
  function fixSt(s) {
    return (window.LMFB && LMFB.fixStatus) ? LMFB.fixStatus(s) : (s || '待处理');
  }
  /* ★ 修复95：反馈对外公开 + 实时
     - 有 Token 的管理员：走 API 读写数据分支（多设备合并）
     - 所有人（含访客）：pullPublic 从 raw 读公开列表（不需要 Token）+ 订阅 MQTT 实时流
     - 拉取 60 秒节流；管理员 clean=false（可补收），访客 clean=true（只收在线） */
  var _fbPullAt = 0;
  function fbWatch() {
    if (!window.LMFB) return;
    try {
      LMFB.listen(function (it) {
        const n = fbMergeIncoming([it]);
        /* 只有正看着反馈页才弹提示（离开页面后仍会收下并保存，只是不打扰） */
        if (n && document.getElementById('fbMount')) toast('📥 收到新反馈 ' + it.id + '（' + (it.name || '匿名') + '）');
      }, { visitor: !state.admin });
    } catch (eL) { /* noop */ }
    const now = Date.now();
    if (now - _fbPullAt < 60000) return;
    _fbPullAt = now;
    if (LMFB.hasCloud()) {
      fbSyncNow(false);
    } else {
      LMFB.pullPublic().then(function (r) {
        if (!r || !r.ok || !r.list.length) return;
        const n = fbMergeIncoming(r.list);
        if (n) toast('📥 收到 ' + n + ' 条反馈（公开列表）');
      });
    }
    /* ★ 修复96：云存档是「永不丢」的那一份 —— 管理员设备也要拉（他可能没绑 Token / 换了浏览器） */
    try {
      if (LMFB.cloudCfg && LMFB.cloudCfg()) {
        LMFB.cloudList().then(function (r) {
          if (!r || !r.ok || !r.list.length) return;
          const n = fbMergeIncoming(r.list);
          if (n) toast('☁ 从云存档收到 ' + n + ' 条反馈');
        });
      }
    } catch (eC) { /* noop */ }
  }
  function mountFeedback() {
    const host = document.getElementById('fbMount');
    if (!host) return;
    if (!window.LMCommunity) { host.innerHTML = '<p class="fb-empty">社区模块未加载（js/community.js）。</p>'; return; }
    /* ★ 修复95：所有人都会「拉公开列表 + 订阅实时流」（管理员有 Token 时改走 API 合并）。
       ⚠ 必须先跑 fbWatch 再拼 html：管理面板要读 mqInfo().on。 */
    fbWatch();
    fbMigrate();
    const meD = LMCommunity.me();
    const fb = fbList();
    let html;
    if (commentsOff()) {
      html = '<p class="fb-empty">💬 反馈已由管理员暂时关闭。你可以继续浏览全部内容；有需要请通过课程渠道联系小组。</p>';
    } else {
      html = fbFormHtml() + fbPublicHtml(fb, meD.code);
    }
    if (state.admin) html += fbAdminHtml(fb);
    host.innerHTML = html;
  }
  /* ★ 修复95：讨论区独立成页（不再和反馈挤在一页，避免被留言淹没） */
  function mountDiscuss() {
    const host = document.getElementById('dcMount');
    if (!host) return;
    if (!window.LMCommunity) { host.innerHTML = '<p class="fb-empty">社区模块未加载（js/community.js）。</p>'; return; }
    host.innerHTML = commentsOff()
      ? '<p class="fb-empty">🗣️ 讨论区已由管理员暂时关闭。你可以继续浏览全部内容；有需要请通过课程渠道联系小组。</p>'
      : dcHtml();
    dcCloudPull();   /* ★ 修复100：打开讨论区就把云存档里的发言补回来（60 秒节流，未配置则什么也不做） */
  }
  /* 提交统一处理：#fbForm 反馈 / #dcForm 讨论帖 / [data-dcreply] 楼中楼回复
     全部经 LMCommunity.gate()：限流 → 屏蔽 → 禁言 → 敏感词拦截（连续拦截累计禁言） */
  document.addEventListener('submit', function (e) {
    const f = e.target;
    if (!f || !window.LMCommunity) return;
    if (f.id === 'fbForm') {
      e.preventDefault();
      if (commentsOff()) { toast('留言已由管理员关闭'); return; }
      const text = (f.querySelector('#fbText').value || '').trim();
      const url = (f.querySelector('#fbUrl').value || '').trim();
      const g = LMCommunity.gate('feedback', text);
      if (!g.ok) { toast(g.msg); return; }
      const list = fbRaw();   /* ★ 修复92：必须用全量（含墓碑），否则推送会把别人的删除记录丢掉 */
      const it = {
        id: fbNextId(list), ts: Date.now(),
        type: f.querySelector('#fbType').value || '提出问题',
        name: (f.querySelector('#fbName').value || '').trim().slice(0, 30) || '匿名',
        text: g.text, dev: LMCommunity.me().code,
        url: /^https?:\/\//i.test(url) ? url.slice(0, 300) : '',
        status: '待处理', reply: ''
      };
      list.push(it);
      fbStore(list);
      f.reset();
      mountFeedback();
      /* ★ 修复93：先重渲染再取提示条 —— 原来先写 #fbOk 再 mountFeedback()，提示条会被重渲染冲掉 */
      const fbOkEl = document.getElementById('fbOk');
      if (fbOkEl) { fbOkEl.hidden = false; fbOkEl.textContent = '✅ 已提交（' + it.id + '），正在发给小组…'; }
      /* ★ 修复93：把留言「隔空发出去」（MQTT QoS1）。组长开着页面就秒收；他当时没开机也不会丢
         —— broker 会把离线期间的留言攒着，他下次打开自动补收（已实测）。
         只有连 broker 都发不出去（断网 / 被墙）才退回「复制链接」兜底。 */
      const fbFallback = function () {
        const el = document.getElementById('fbOk');
        if (!el || !window.LMFB) return;
        const link = LMFB.shareLink([it]);
        if (!link) return;
        el.innerHTML = '⚠ 已存在你这台设备，但没能直接送达小组 —— 点'
          + ' <button type="button" class="fb-mini" id="fbShare">📤 复制给组长</button> 发到班级群即可。';
        const sb = el.querySelector('#fbShare');
        if (!sb) return;
        sb.addEventListener('click', function () {
          const ask = function () { window.prompt('复制这条链接发给组长：', link); };
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(function () { toast('链接已复制'); }, ask);
            else ask();
          } catch (eC) { ask(); }
        });
      };
      /* ★ 修复96：先把留言写进「云存档」（提交者浏览器直接写永久存储 → 谁都不用开着网页，也不受 6 小时限制）；
         同时发 MQTT 实时通知；两条都失败才退回「复制给组长」链接。 */
      const cloudP = (window.LMFB && LMFB.cloudSave) ? LMFB.cloudSave(it) : Promise.resolve(false);
      const mqP = (window.LMFB && LMFB.publish) ? LMFB.publish(it) : Promise.resolve(false);
      Promise.all([cloudP, mqP]).then(function (r) {
        const el = document.getElementById('fbOk');
        if (!el) return;
        const saved = !!r[0], sent = !!r[1];
        if (sent) {
          el.textContent = '✅ 已提交（' + it.id + '）并已直达小组：组长下次打开反馈页会自动看到（他当时没开电脑也不会丢）。'
            + (saved ? ' 同时已存进云存档。' : '');
        } else if (saved) {
          el.textContent = '✅ 已提交（' + it.id + '）并已存进云存档：小组下次打开反馈页会自动收取（不受 6 小时补收窗口限制）。';
        } else {
          fbFallback();
        }
      }).catch(function () { fbFallback(); });
    } else if (f.id === 'dcForm') {
      e.preventDefault();
      if (commentsOff()) { toast('讨论区已由管理员关闭'); return; }
      const ta = f.querySelector('textarea[name="text"]');
      const g = LMCommunity.gate('post', ta ? ta.value : '');
      if (!g.ok) { toast(g.msg); return; }
      const post = { id: LMCommunity.dcNextId(dcAll()), pid: '', dev: LMCommunity.me().code,
        nick: LMCommunity.displayName(), text: g.text, ts: Date.now() };
      dcAll().push(post);
      dcPersist([post]);
      mountDiscuss();   /* ★ 修复95：讨论区独立成页后只重渲染讨论区 */
      toast(window.LMCollab ? '已发表（实时同步给其他设备；云端设备随轮询可见）' : '已发表');
    } else if (f.hasAttribute && f.hasAttribute('data-dcreply')) {
      e.preventDefault();
      if (commentsOff()) { toast('回复已由管理员关闭'); return; }
      const pid = f.getAttribute('data-dcreply');
      const ta = f.querySelector('textarea[name="text"]');
      const g = LMCommunity.gate('reply', ta ? ta.value : '');
      if (!g.ok) { toast(g.msg); return; }
      const rto = f.querySelector('input[name="rto"]');
      const rep = { id: LMCommunity.dcNextId(dcAll()), pid: pid, dev: LMCommunity.me().code,
        nick: LMCommunity.displayName(), text: g.text, ts: Date.now(), rto: (rto && rto.value) || '' };
      dcAll().push(rep);
      dcPersist([rep]);
      mountDiscuss();   /* ★ 修复95 */
      toast('回复已发布');
    }
  });
  /* ★ 修复95：管理员一键「✔ 采纳 / ✅ 已修改 / ✖ 保留原判断 / ↺ 待处理」
     —— 对应作业要求「反馈必须得到回应」，状态与三段说明会同步到公开列表 */
  document.addEventListener('click', function (e) {
    const b = (e.target && e.target.closest) ? e.target.closest('[data-fbact]') : null;
    if (!b) return;
    const item = b.closest('.fb-item');
    const id = item ? item.getAttribute('data-fbid') : '';
    const to = b.getAttribute('data-fbact') || '';
    const raw = fbRaw();
    const it = raw.find(function (x) { return x.id === id; });
    if (!it) return;
    e.preventDefault();
    it.status = fixSt(to);
    it.updatedAt = Date.now();
    fbStore(raw);
    mountFeedback();
    toast(id + ' → ' + it.status + (it.check || it.change || it.why ? '' : '（建议再填 ①核实 ②改了什么 ③为什么）'));
  });
  /* ★ 修复92：手动「立即同步」反馈（只有带 Token 的设备才会渲染这个按钮） */
  document.addEventListener('click', function (e) {
    const b = (e.target && e.target.closest) ? e.target.closest('#fbSyncNow') : null;
    if (!b) return;
    e.preventDefault();
    toast('☁ 正在与云端核对反馈…');
    fbSyncNow(true);
  });
  /* ★ 修复96：云存档 —— 保存配置 / 测试拉取 / 表格粘贴导入 */
  document.addEventListener('click', function (e) {
    const t = e.target;
    if (!t || !t.closest) return;

    if (t.id === 'fbCloudSave') {
      const v = function (id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
      if (!state.content.config) state.content.config = {};
      state.content.config.fbCloud = {
        kind: v('fbCloudKind'), url: v('fbCloudUrl'),
        key: v('fbCloudKey'), table: v('fbCloudTable') || 'lm_feedback'
      };
      applyEdit('云存档设置已保存');
      cloudMsg('已保存。点下面「测试 / 立即拉取」就能验证到底通不通。');
      mountFeedback();
      toast('已保存云存档设置；点顶部「☁️ 同步到 GitHub」后访客生效');
      return;
    }

    if (t.id === 'fbModSave') {
      const ta = document.getElementById('fbModWords');
      const seen = {}, arr = [];
      String(ta ? ta.value : '').split(/\r?\n/).forEach(function (w) {
        w = String(w || '').replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim();
        if (w.length < 2 || w.length > 30 || seen[w]) return;
        seen[w] = 1;
        arr.push(w);
      });
      if (!state.content.config) state.content.config = {};
      state.content.config.modWords = arr;
      try { if (window.LMCommunity && LMCommunity.rebuildWords) LMCommunity.rebuildWords(); } catch (e1) { /* noop */ }
      applyEdit('言论过滤词表已更新（' + arr.length + ' 条）');
      mountFeedback();
      toast('词表已保存：生效 ' + arr.length + ' 条（点顶部「☁️ 同步到 GitHub」后对所有访客生效）');
      return;
    }

    if (t.id === 'fbCloudTest') {
      if (!window.LMFB || !LMFB.cloudCfg || !LMFB.cloudCfg()) { toast('还没配置云存档（先选类型、填 URL、点保存）'); return; }
      toast('☁ 正在读取云存档…');
      LMFB.cloudList().then(function (r) {
        if (!r || !r.ok) {
          const why = (r && r.why) || '未知原因';
          cloudMsg('❌ 读取失败：' + why);
          toast('读取失败：' + why);
          return;
        }
        const n = fbMergeIncoming(r.list);
        cloudMsg('✅ 云存档可读：共 ' + r.list.length + ' 条' + (n ? '，本次新增/更新 ' + n + ' 条' : ''));
        toast(n ? ('云存档可读：共 ' + r.list.length + ' 条，本次新增/更新 ' + n + ' 条') : ('云存档可读：共 ' + r.list.length + ' 条，没有新内容'));
        mountFeedback();
      });
      return;
    }

    if (t.id === 'fbImportGo') {
      const ta = document.getElementById('fbImport');
      const arr = (window.LMFB && LMFB.parseImport) ? LMFB.parseImport(ta ? ta.value : '') : [];
      if (!arr.length) { toast('没解析出条目：需要「表头 + 至少一行」，或直接粘 JSON 数组'); return; }
      const n = fbMergeIncoming(arr);
      if (ta) ta.value = '';
      toast('已导入 ' + arr.length + ' 条，并入本机列表' + (n ? '（新增/更新 ' + n + ' 条）' : '（都已存在）'));
      mountFeedback();
      return;
    }
  });

  document.addEventListener('change', function (e) {
    const t = e.target;
    if (!t || !t.closest || !t.closest('.fb-item')) return;
    const id = t.closest('.fb-item').getAttribute('data-fbid');
    const list = fbRaw();   /* ★ 修复92：全量（含墓碑），避免推送时丢掉删除记录 */
    const it = list.find(function (x) { return x.id === id; });
    if (!it) return;
    if (t.hasAttribute('data-fbst')) {
      it.status = fixSt(t.value); it.updatedAt = Date.now();   /* ★ 修复95：状态归一 */
      fbStore(list); mountFeedback();
      toast(it.id + ' 状态已改为「' + it.status + '」');
    } else if (t.hasAttribute('data-fbreply')) {
      it.reply = (t.value || '').slice(0, 200); it.updatedAt = Date.now();   /* ★ 修复92 */
      fbStore(list);
    } else if (t.hasAttribute('data-fbcheck') || t.hasAttribute('data-fbchange') || t.hasAttribute('data-fbwhy')) {
      /* ★ 修复95：三段处理记录（核实 / 修改 / 理由）—— 失焦即保存，随 next push 同步到公开列表 */
      const k = t.hasAttribute('data-fbcheck') ? 'check' : (t.hasAttribute('data-fbchange') ? 'change' : 'why');
      it[k] = (t.value || '').slice(0, 300);
      it.updatedAt = Date.now();
      fbStore(list);
      toast('已保存「' + (k === 'check' ? '怎样核实' : k === 'change' ? '修改了什么' : '为什么这样处理') + '」');
    }
  });
  /* 点击统一处理：反馈删除/复制/屏蔽 + 讨论区（改昵称 / 展开回复 / 删除 / 屏蔽发言者） */
  document.addEventListener('click', function (e) {
    const t = e.target;
    if (!t || !t.closest) return;
    const del = t.closest('[data-fbdel]');
    if (del) {
      const item = del.closest('.fb-item');
      const id = item ? item.getAttribute('data-fbid') : '';
      LMEditor.confirmModal('删除反馈', '确定删除 ' + id + ' 这条反馈？删除后不可恢复。', '删除', function () {
        /* ★ 修复92：写「墓碑」而不是直接抹掉 —— 否则别的设备一同步又把它带回来 */
        const raw = fbRaw();
        raw.forEach(function (x) { if (x && x.id === id) { x.del = 1; x.updatedAt = Date.now(); } });
        fbStore(raw);
        mountFeedback();
        toast('已删除 ' + id);
      });
      return;
    }
    const mask = t.closest('[data-fbmask]');
    if (mask) {
      const item = mask.closest('.fb-item');
      const id = item ? item.getAttribute('data-fbid') : '';
      const it = fbList().find(function (x) { return x.id === id; });
      if (!it || !it.dev) { toast('这条反馈没有身份码（旧数据）'); return; }
      LMEditor.confirmModal('屏蔽该身份码', '屏蔽身份码 ' + it.dev + '？（累计 3 次将禁言 1 个月；当前 ' + LMCommunity.manualCount(it.dev) + ' 次）', '屏蔽', function () {
        const r = LMCommunity.manualStrike(it.dev);
        toast('已记录屏蔽（' + r.count + '/3）' + (r.muted ? '：该身份码已被禁言 1 个月' : ''));
        mountFeedback();
      });
      return;
    }
    if (t.id === 'fbCopy') {
      const list = fbList();
      /* ★ 修复95：导出的文本带「四段记录」，可直接贴进期末材料的「同学反馈及处理结果」 */
      const txt = list.map(function (it) {
        return it.id + ' | ' + fbTs(it.ts) + ' | ' + it.type + ' | ' + (it.name || '匿名') + ' | 🆔' + (it.dev || '?')
          + ' | ' + fixSt(it.status)
          + '\n【同学提出】' + it.text
          + (it.url ? '\n链接：' + it.url : '')
          + '\n【我们怎样核实】' + (it.check || '（未填）')
          + '\n【修改了什么】' + (it.change || '（未填）')
          + '\n【为什么这样处理】' + (it.why || '（未填）')
          + (it.reply ? '\n【给同学的回复】' + it.reply : '');
      }).join('\n\n');
      const done = function () { toast('已复制 ' + list.length + ' 条反馈（含处理记录）'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { toast('复制失败，请手动选择文本复制'); });
      else toast('当前环境不支持一键复制，请手动选择文本');
      return;
    }
    /* —— 讨论区 —— */
    const nickSave = t.closest('#dcNickSave');
    if (nickSave) {
      const input = document.getElementById('dcNick');
      const r = LMCommunity.setNick(input ? input.value : '');
      toast(r.ok ? '昵称已改为「' + LMCommunity.displayName() + '」（7 天后可再改）' : r.msg);
      if (r.ok) mountDiscuss();
      return;
    }
    const show = t.closest('[data-dcshow]');
    if (show) {
      const msg = show.closest('.dc-msg');
      const form = msg ? msg.querySelector('.dc-replyform') : null;
      if (form) {
        form.hidden = !form.hidden;
        const rtoInput = form.querySelector('input[name="rto"]');
        const nickEl = msg.querySelector('.dc-nick');
        if (rtoInput) rtoInput.value = (msg.classList.contains('dc-reply') && nickEl) ? nickEl.textContent : '';
        if (!form.hidden) { const ta = form.querySelector('textarea'); if (ta) ta.focus(); }
      }
      return;
    }
    const dcdel = t.closest('[data-dcdel]');
    if (dcdel) {
      const id = dcdel.getAttribute('data-dcdel');
      const list = dcAll();
      const target = list.find(function (m) { return m.id === id && !m.del; });
      if (!target) return;
      /* 删除权限：本人（同浏览器身份码）或管理员；跨设备靠设备身份码识别作者 */
      if (!state.admin && target.dev !== LMCommunity.me().code) { toast('只能删除自己发的发言（管理员可删除任何发言）'); return; }
      const isPost = !target.pid;
      LMEditor.confirmModal('删除讨论发言', isPost ? '删除该帖及其全部回复？删除后其他设备也会同步删除。' : '删除该条回复？删除后其他设备也会同步删除。', '删除', function () {
        const now = Date.now();
        const affected = list.filter(function (m) { return m && !m.del && (m.id === id || (isPost && m.pid === id)); });
        affected.forEach(function (m) { m.del = now; }); /* 墓碑标记：删除会跨设备传播，而不是静默复活 */
        dcPersist(affected);
        mountDiscuss();
        toast(window.LMCollab ? '已删除（其他设备同步删除）' : '已删除');
      });
      return;
    }
    const dcmask = t.closest('[data-dcmask]');
    if (dcmask) {
      const id = dcmask.getAttribute('data-dcmask');
      const m = dcAll().find(function (x) { return x.id === id; });
      if (!m) return;
      LMEditor.confirmModal('屏蔽该言论', '屏蔽并记录身份码 ' + m.dev + '？（累计 3 次将禁言 1 个月；当前 ' + LMCommunity.manualCount(m.dev) + ' 次）', '屏蔽', function () {
        LMCommunity.hideMsg(id);
        const r = LMCommunity.manualStrike(m.dev);
        toast('已屏蔽该言论；身份码记录 ' + r.count + '/3' + (r.muted ? '，已禁言 1 个月' : ''));
        mountDiscuss();
      });
      return;
    }
  });

  /* ---------- 初始化 ---------- */
  function ensureConfig() {
    const c = state.content;
    if (!c.config) c.config = {};
    /* 管理密码记录：v2 拉伸记录（auth）或老版单轮哈希（passwordHash）至少要有一个；
       两者都没有时才重置为初始密码。登录成功后会自动升级成 v2 并删除旧哈希 */
    if (!c.config.admin || (!c.config.admin.passwordHash && !(c.config.admin.auth && c.config.admin.auth.hash))) {
      c.config.admin = {
        passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
        hint: '初始密码：admin123（登录后可在底部「修改密码」里更改）'
      };
    }
    if (!c.config.footer) c.config.footer = {};
    /* ★ 修复96：云存档配置（缺省关闭；管理员在反馈处理面板里填，随内容同步给所有访客） */
    if (!c.config.fbCloud || typeof c.config.fbCloud !== 'object') {
      c.config.fbCloud = { kind: '', url: '', key: '', table: 'lm_feedback' };
    }
    /* 老师要求六个页面：缺「反馈与建议」页时自动补齐（老内容无感升级，只加框架不代填内容） */
    if (!c.pages.some(function (p) { return p && p.id === 'feedback'; })) {
      const fb = JSON.parse(JSON.stringify(FEEDBACK_PAGE));
      const at = c.pages.findIndex(function (p) { return p && p.id === 'about'; });
      if (at >= 0) c.pages.splice(at, 0, fb); else c.pages.push(fb);
    }
    /* ★ 修复95：缺「讨论区」页同样自动补齐（老内容 / 云端旧内容无感升级）
       —— 讨论区以前挤在反馈页里，现在独立成页，否则云端旧内容一覆盖就没了 */
    if (!c.pages.some(function (p) { return p && p.id === 'discuss'; })) {
      const dc = JSON.parse(JSON.stringify(DISCUSS_PAGE));
      const atDc = c.pages.findIndex(function (p) { return p && p.id === 'about'; });
      if (atDc >= 0) c.pages.splice(atDc, 0, dc); else c.pages.push(dc);
    }
    /* 反馈页 v3（修复95）：把「仅小组管理员可见」的旧文案换成公开口径 —— 只在检测到旧句子时改，不动用户自己写的内容 */
    const fbp3 = c.pages.find(function (p) { return p && p.id === 'feedback'; });
    if (fbp3) {
      const oldLead = '提交后只有我们小组的管理员能看到，其他访客互相看不到留言';
      if (Array.isArray(fbp3.blocks)) {
        fbp3.blocks.forEach(function (bk) {
          if (bk && typeof bk.text === 'string' && bk.text.indexOf(oldLead) >= 0) {
            bk.text = '留言和我们的处理记录（怎样核实 → 改了什么 → 为什么这样处理）**对所有人公开**，既方便互相参考，也便于课程检查。';
          }
        });
      }
      if (typeof fbp3.description === 'string' && fbp3.description.indexOf('仅小组管理员可见') >= 0) {
        fbp3.description = '对我们的工作有疑问、发现错误或有改进建议？在下方留言（可匿名）。留言与处理记录对所有人公开，我们会逐条回应。';
      }
    }
    /* 反馈页 v2：从「组内公示表」升级为「访客留言框」—— 老内容里检测到旧占位表格就整体替换文案 */
    const fbp = c.pages.find(function (p) { return p && p.id === 'feedback'; });
    if (fbp && Array.isArray(fbp.blocks) && fbp.blocks.some(function (bk) {
      return bk && bk.type === 'table' && String(bk.title || '').indexOf('反馈与回复') >= 0;
    })) {
      const fb2 = JSON.parse(JSON.stringify(FEEDBACK_PAGE));
      fbp.blocks = fb2.blocks;
      fbp.description = fb2.description;
    }
    c.pages.forEach(function (p) { if (!p.blocks) p.blocks = []; });
    /* 讨论区数据（v4 起随内容跨设备同步；老内容无此字段时补空数组） */
    if (!Array.isArray(c.discuss)) c.discuss = [];
  }

  /* ---------- 防崩溃兜底（全局） ----------
     1) 任何未捕获错误只弹一条轻提示（5 秒内同类只提示一次），绝不打断编辑；
     2) 每 20 秒自动保存当前内容（输入/拖动中途出意外也不丢）；
     3) 每 60 秒写一份崩溃快照（保留最近 3 份）——主存储损坏时启动自动用最近快照恢复 */
  let _lastErrMsg = '', _lastErrAt = 0;
  function softErrToast(m) {
    const t = Date.now();
    if (m === _lastErrMsg && t - _lastErrAt < 5000) return;
    _lastErrMsg = m; _lastErrAt = t;
    try { toast(m); } catch (e) { /* noop */ }
  }
  window.addEventListener('error', function (ev) {
    /* ★ 修复81：把真实错误写进控制台 —— 提示语是给用户看的，排查必须靠这一行 */
    try {
      console.error('[LM] 未捕获错误：' + (ev && ev.message) + '  @'
        + (ev && ev.filename ? String(ev.filename).split('/').pop() : '?') + ':' + (ev && ev.lineno)
        + (ev && ev.error && ev.error.stack ? '\n' + ev.error.stack : ''));
    } catch (e0) { /* noop */ }
    softErrToast('⚠ 页面出现一个小问题，已自动跳过（内容已保存）');
  });
  window.addEventListener('unhandledrejection', function () { softErrToast('⚠ 一个后台任务失败了，已自动跳过'); });
  function setupResilience() {
    try {
      setInterval(function () { try { if (state.content && window.LMStore) LMStore.saveLocal(state.content); } catch (e) { /* noop */ } }, 20000);
      setInterval(function () {
        try {
          if (!state.content) return;
          const arr = JSON.parse(localStorage.getItem('lm_snap_v1') || '[]');
          arr.push(JSON.stringify({ ts: Date.now(), c: state.content }));
          while (arr.length > 3) arr.shift();
          localStorage.setItem('lm_snap_v1', JSON.stringify(arr));
        } catch (e2) { /* 存储满 / 隐私模式 → 静默跳过 */ }
      }, 60000);
    } catch (e3) { /* noop */ }
  }

  function init() {
    state.content = LMStore.load();
    ensureConfig();
    setupResilience();
    hist.arr = [JSON.stringify(state.content)];
    hist.ts = [Date.now()];
    hist.msg = [''];
    hist.ptr = 0;
    state.admin = sessionStorage.getItem('lm_admin') === '1';
    state.root = state.admin && sessionStorage.getItem('lm_root') === '1';
    if (state.admin) takeAdminSnap(); /* ★ 修复㉜：刷新后恢复的管理模式同样以此刻内容为「放弃修改」基准 */
    watchTbOffset(); /* ★ 修复84：管理员模式浮动工具条不压面包屑/页头（垫 --lm-tb-h） */
    /* 讨论区 v4：把本机历史发言并入内容 JSON（state.content.discuss），
       之后随协作三通道（本机互连 / 课堂服务器 / GitHub 云端）跨设备同步 */
    try {
      if (window.LMCommunity) state.content.discuss = LMCommunity.merge(state.content.discuss, LMCommunity.dcList());
      else if (!Array.isArray(state.content.discuss)) state.content.discuss = [];
    } catch (eD) { if (!Array.isArray(state.content.discuss)) state.content.discuss = []; }
    try { state.view = localStorage.getItem('lm_view') || 'auto'; } catch (e) { /* noop */ }
    applyView(); /* 先按 设备/手动选择 挂上手机版或电脑版类，再渲染（图表按正确宽度测量） */
    render();
    state.ready = true;
    window.addEventListener('hashchange', render);
    window.addEventListener('scroll', function () {
      document.getElementById('topnav').classList.toggle('scrolled', window.scrollY > 4);
    }, { passive: true });
    const gear = document.getElementById('navGear');
    if (gear) gear.addEventListener('click', toggleGearPop);
    const mq = window.matchMedia('(max-width: 760px)');
    const onMq = function () { if (state.view === 'auto') applyView(); };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
    window.addEventListener('resize', onMq);
    if (window.LMEditor) LMEditor.init();
    /* ★ 修复92：启动时先把 URL 里带来的同学留言收进来（#fb=…），再进入正常渲染 */
    fbIngestUrl();
    window.addEventListener('hashchange', function () { fbIngestUrl(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    state: state, render: render, applyEdit: applyEdit, toast: toast,
    /* ★ 修复101：对方 dcommit 到达后要重绘「讨论区」——以前错接成 mountFeedback，
       结果数据合进来了、页面还不刷新（要手动切页才看到别人的发言/删除）。
       ★ 修复102：走 dcRepaint()，正在打字时不打断输入。 */
    refreshDiscuss: function () {
      mountFeedback();
      dcRepaint();
    },
    historyList: historyList, restoreVersion: restoreVersion,
    esc: esc, md: md, currentId: currentId, ensureConfig: ensureConfig,
    commit: commit, insertBlock: insertBlock, adjustFreeLayout: adjustFreeLayoutSafe,
    fixFreeOverlapVisual: fixFreeOverlapVisual, discardChanges: discardChanges,
    fixLayout: fixLayout, /* ★ 修复64：一键整理布局（清残留让位边距 + 全量重算，用户自救重叠/大空隙） */
    navBack: navBack, backTarget: backTarget, navHist: navHist, /* ★ 修复80：浏览历史栈 + 左上角返回键 */
    dumpLayout: dumpLayout, /* ★ 修复67：控制台布局体检（打印每块摆放方式/位置/让位量并复制到剪贴板） */
    takeAdminSnap: takeAdminSnap, /* ★ 修复㉜：进入管理模式时拍「退回管理前」基准（不再被上传覆盖） */
    takePushSnap: takePushSnap, snapInfo: snapInfo, /* ★ 修复83：上传成功只重拍「最近上传版」+ 弹窗摘要 */
    syncTbOffset: syncTbOffset, watchTbOffset: watchTbOffset, /* ★ 修复84：工具条与面包屑错开（--lm-tb-h） */
    unfreeBlock: unfreeBlock, unfreeTargetIndex: unfreeTargetIndex, /* ★ 修复85：归位按视觉位置插回文档流 */
    makeFree: makeFree, /* ★ 修复86：文档流块 → 自由摆放（工具条 ⤢，与 ⌂ 互为反向） */
    applyRemoteContent: applyRemoteContent, renderBlockAt: renderBlockAt,
    beginFreeDrag: beginFreeDrag, endFreeDrag: endFreeDrag,
    adjustImages: adjustImages,
    setViewMode: setViewMode, applyView: applyView, isMobileDevice: isMobileDevice,
    pageById: pageById, pageChildren: childPages, pagePath: pagePath, pageTitle: pageTitle, /* ★ 修复75：第 3 层嵌套条目 */
    scanFreeGaps: scanFreeGaps, tidyGaps: tidyGaps, /* ★ 修复76：悬空体检 / 收拢空隙 */
    undo: undo, redo: redo, canUndo: canUndo, canRedo: canRedo
  };
})();


