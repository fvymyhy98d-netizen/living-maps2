/* =========================================================
   管理模式：内容块编辑 / 页面管理 / GitHub 同步 / 备份
   通过事件委托处理 [data-act] 与 [data-panel] 点击
   ========================================================= */
window.LMEditor = (function () {
  const modalRoot = document.getElementById('modalRoot');

  /* ---------- 浮动工具栏状态 ---------- */
  const tb = { active: null, imgSel: null, tab: 'start', brushOn: false, copyArm: false, brushBuf: null, hero: null, heroField: null, heroTextField: null, pressBi: null, multi: false, multiSel: [] };
  function clamp(v, a, b2) { return Math.min(Math.max(v, a), b2); }
  /* HTML 转义：editor 内部拼气泡/弹层用（内部无定义，走 app.js 的同一实现，防注入） */
  function esc(s) {
    if (window.LMApp && LMApp.esc) return LMApp.esc(s);
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  let popEl = null;
  function closePop() {
    if (popEl) { popEl.remove(); popEl = null; document.removeEventListener('mousedown', popOutside); document.dispatchEvent(new Event('lm-pop-close')); }
  }
  function popOutside(e) { if (popEl && !popEl.contains(e.target)) closePop(); }
  function popover(anchor, html, onOpen, forId) {
    closePop();
    popEl = document.createElement('div');
    popEl.className = 'popover';
    popEl.innerHTML = html;
    popEl._for = forId || '';
    document.body.appendChild(popEl);
    let r = anchor.getBoundingClientRect();
    /* ★ 锚点已被重建（工具栏在气泡打开前被重绘 → 按钮成了游离节点）→ 矩形全零、气泡飞到左上角。
       用点击瞬间记录的坐标兜底（click 处理器会把 clientX/Y 写进 btn._lmXY） */
    if ((!r.width && !r.height) && anchor._lmXY) {
      popEl.style.left = Math.max(8, Math.min(anchor._lmXY.x, window.innerWidth - 300)) + 'px';
      popEl.style.top = (anchor._lmXY.y + 26) + 'px';
      if (onOpen) onOpen(popEl);
      setTimeout(function () { document.addEventListener('mousedown', popOutside); }, 0);
      return;
    }
    const pr = popEl.getBoundingClientRect();
    popEl.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pr.width - 12)) + 'px';
    popEl.style.top = (r.bottom + 8) + 'px';
    if (onOpen) onOpen(popEl);
    setTimeout(function () { document.addEventListener('mousedown', popOutside); }, 0);
  }

  /* ---------- 通用弹窗 ---------- */
  function modal(html, onOpen) {
    modalRoot.innerHTML = '<div class="modal-mask"><div class="modal-card">' + html + '</div></div>';
    /* 锁定背后页面滚动：弹窗打开期间 body 不可滚，弹窗内容自身可滚（modal-card overflow:auto） */
    document.body.style.overflow = 'hidden';
    const mask = modalRoot.querySelector('.modal-mask');
    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.closest('[data-close]')) closeModal();
    });
    document.addEventListener('keydown', escClose);
    if (onOpen) onOpen(mask);
    return mask;
  }
  function escClose(e) { if (e.key === 'Escape') closeModal(); }
  function closeModal() {
    modalRoot.innerHTML = '';
    document.body.style.overflow = '';
    document.removeEventListener('keydown', escClose);
  }
  /* 站内确认弹窗（替代浏览器原生 confirm；独立叠加层，可与其它弹窗共存） */
  function confirmModal(title, msg, okText, onOk) {
    const ov = document.createElement('div');
    ov.className = 'modal-mask cfm-mask';
    ov.innerHTML = '<div class="modal-card cfm-card"><h3>' + title + '</h3><p class="modal-note">' + msg + '</p>'
      + '<div class="form-actions"><button type="button" class="btn btn-ghost" data-cfm-no>取消</button>'
      + '<button type="button" class="btn btn-primary" data-cfm-yes>' + okText + '</button></div></div>';
    document.body.appendChild(ov);
    const wasLocked = document.body.style.overflow === 'hidden';
    if (!wasLocked) document.body.style.overflow = 'hidden';
    const close = function () {
      ov.remove();
      document.removeEventListener('keydown', esc, true);
      if (!wasLocked) document.body.style.overflow = '';
    };
    const esc = function (e) { if (e.key === 'Escape') close(); };
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-cfm-no]')) close();
      else if (e.target.closest('[data-cfm-yes]')) { close(); onOk(); }
    });
    document.addEventListener('keydown', esc, true);
  }

  /* ---------- 表单控件快捷方式 ---------- */
  function field(label, inner, hint) {
    return '<label class="field"><span class="field-label">' + label + '</span>' + inner
      + (hint ? '<span class="field-hint">' + hint + '</span>' : '') + '</label>';
  }
  const F = {
    text: function (name, val, ph) {
      return '<input class="input" type="text" name="' + name + '" value="' + LMApp.esc(val || '') + '" placeholder="' + LMApp.esc(ph || '') + '">';
    },
    area: function (name, val, ph, rows) {
      return '<textarea class="input" name="' + name + '" rows="' + (rows || 4) + '" placeholder="' + LMApp.esc(ph || '') + '">' + LMApp.esc(val || '') + '</textarea>';
    },
    select: function (name, opts, val) {
      /* 自定义下拉（苹果风）：原生 <select> 的展开列表是操作系统样式（Windows 上是蓝色高亮白底），
         与全站风格割裂；这里用隐藏 input 保存值（form.querySelector('[name=x]').value 照常工作） */
      const cur = opts.filter(function (o) { return String(o[0]) === String(val); })[0] || opts[0] || ['', ''];
      return '<span class="lmsel" data-lmsel="' + name + '">'
        + '<input type="hidden" name="' + name + '" value="' + LMApp.esc(val == null ? cur[0] : val) + '">'
        + '<button type="button" class="input lmsel-btn"><span class="lmsel-txt">' + LMApp.esc(cur[1]) + '</span><span class="lmsel-ar">▾</span></button>'
        + '<span class="lmsel-list" hidden>' + opts.map(function (o) {
          return '<button type="button" class="lmsel-it' + (String(o[0]) === String(val) ? ' on' : '') + '" data-v="' + LMApp.esc(o[0]) + '">' + LMApp.esc(o[1]) + '</button>';
        }).join('') + '</span></span>';
    },
    color: function (name, val) {
      return '<span class="color-row"><input type="color" name="' + name + '" value="' + (val || '#1d1d1f') + '">'
        + '<label class="chk"><input type="checkbox" name="' + name + '_default"' + (val ? '' : ' checked') + '> 使用默认颜色</label></span>';
    }
  };

  /* 工具栏字体/字号下拉：与 F.select 同一套自定义组件（hidden input 保留 .tb-sel 类，
     原有 change 委托照常工作；展开列表不再是 Windows 系统样式） */
  function tbSelect(name, title, opts, val) {
    const cur = opts.filter(function (o) { return String(o[0]) === String(val); })[0] || opts[0] || ['', title];
    return '<span class="lmsel tb-compact" data-lmsel="' + name + '">'
      + '<input type="hidden" class="tb-sel" data-tb="' + name + '" value="' + LMApp.esc(val == null ? cur[0] : val) + '">'
      + '<button type="button" class="lmsel-btn tb-sel-btn" tabindex="-1" title="' + title + '"><span class="lmsel-txt">' + LMApp.esc(cur[1]) + '</span><span class="lmsel-ar">▾</span></button>'
      + '<span class="lmsel-list" hidden>' + opts.map(function (o) {
        return '<button type="button" class="lmsel-it' + (String(o[0]) === String(val) ? ' on' : '') + '" data-v="' + LMApp.esc(o[0]) + '">' + LMApp.esc(o[1]) + '</button>';
      }).join('') + '</span></span>';
  }
  const TYPES = {
    heading: { name: '标题', icon: '🅷' },
    paragraph: { name: '段落', icon: '¶' },
    callout: { name: '重点提示', icon: '💡' },
    image: { name: '图片', icon: '🖼️' },
    table: { name: '表格', icon: '▦' },
    chart: { name: '图表', icon: '📊' },
    files: { name: '附件列表', icon: '📎' },
    md: { name: 'Markdown', icon: '📝' },
    sources: { name: '来源引用', icon: '🔗' },
    hr: { name: '分隔线', icon: '─' }
  };

  function defaultsFor(type) {
    switch (type) {
      case 'heading': return { type: type, level: 2, text: '新标题' };
      case 'paragraph': return { type: type, size: 'normal', text: '' };
      case 'callout': return { type: type, tone: 'blue', title: '', text: '' };
      case 'image': return { type: type, src: '', caption: '', widthPct: 68 };
      case 'table': return { type: type, title: '', headers: ['列一', '列二', '列三'], rows: [['', '', '']] };
      case 'chart': return { type: type, chartType: 'bar', title: '', labels: ['A', 'B', 'C'], data: [1, 2, 3], unit: '数量' };
      case 'files': return { type: type, title: '学习资料与附件', items: [] };
      case 'sources': return { type: type, title: '本页来源', items: [] };
      case 'md': return { type: type, text: '## 这里是小标题\n\n正文支持 **加粗**、*斜体*、__下划线__、~~删除线~~、==高亮==\n\n- 列表一\n- 列表二\n\n| 列A | 列B |\n|---|---|\n| 内容1 | 内容2 |' };
      case 'hr': return { type: type };
    }
    return { type: type };
  }
  function lines(v) { return String(v || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }
  function pairs(v) { return lines(v).map(function (l) { return l.split('|').map(function (s) { return s.trim(); }); }); }

  /* ---------- 编辑表单 ---------- */
  function formHTML(type, b) {
    switch (type) {
      case 'heading': return ''
        + field('标题文字', F.area('text', b.text, '输入标题', 2))
        + field('级别', F.select('level', [[1, '大标题 H1'], [2, '中标题 H2'], [3, '小标题 H3']], b.level || 2))
        + field('文字颜色（可选）', F.color('color', b.color));
      case 'paragraph': return ''
        + field('正文内容', F.area('text', b.text, '支持 **加粗** 和换行', 7))
        + field('样式', F.select('size', [['normal', '普通段落'], ['lead', '大字导语']], b.size || 'normal'))
        + field('文字颜色（可选）', F.color('color', b.color));
      case 'callout': return ''
        + field('小标题（可留空）', F.text('title', b.title, '例如：研究边界'))
        + field('内容', F.area('text', b.text, '支持 **加粗** 和换行', 5))
        + field('底色', F.select('tone', [['gray', '浅灰'], ['blue', '浅蓝'], ['green', '浅绿'], ['orange', '浅橙'], ['pink', '浅粉']], b.tone || 'blue'));
      case 'image': return ''
        + field('图片地址', F.text('src', b.src, '仓库内：images/xxx.png 或外部图床 https://...'))
        + field('图片说明（可留空）', F.text('caption', b.caption, '显示在图片下方'))
        + field('宽度（页面上也可直接拖角调整 / 旋转 / 裁剪）', F.select('width', [['normal', '标准宽度（68%）'], ['full', '更宽（100%）']], b.widthPct === 100 ? 'full' : 'normal'));
      case 'table': return ''
        + field('表格标题（可留空）', F.text('title', b.title, ''))
        + field('表头（每行一个）', F.area('headers', (b.headers || []).join('\n'), '概念\n一句话解释\n相关工具', 3))
        + field('表格行（每行一条，单元格用 | 分隔）', F.area('rows', (b.rows || []).map(function (r) { return (r || []).join(' | '); }).join('\n'), '第一格 | 第二格 | 第三格', 6));
      case 'chart': return ''
        + field('图表标题（可留空）', F.text('title', b.title, ''))
        + field('图表类型', F.select('chartType', [['bar', '柱状图'], ['line', '折线图'], ['pie', '饼图（环形）']], b.chartType || 'bar'))
        + field('分类标签（每行一个）', F.area('labels', (b.labels || []).join('\n'), '一月\n二月\n三月', 3))
        + field('数值（每行一个，与标签一一对应）', F.area('data', (b.data || []).join('\n'), '10\n20\n30', 3))
        + field('数值单位', F.text('unit', b.unit, '例如：票 / 人 / %'));
      case 'files': return ''
        + field('栏目标题', F.text('title', b.title, '学习资料与附件'))
        + field('附件列表（每行一条：名称|链接）', F.area('items', (b.items || []).map(function (it) { return (it.name || '') + ' | ' + (it.url || ''); }).join('\n'), '课程讲义 | https://... 或 files/讲义.pdf', 5), '链接可以是网页，也可以是仓库内文件（如 files/讲义.pdf）');
      case 'sources': return ''
        + field('栏目标题', F.text('title', b.title, '本页来源'))
        + field('来源列表（每行一条：名称|链接）', F.area('items', (b.items || []).map(function (it) { return (it.label || '') + ' | ' + (it.url || ''); }).join('\n'), '论文名 | https://arxiv.org/...', 5));
      case 'md': return ''
        + field('Markdown 源码', F.area('text', b.text, '# 标题、- 列表、| 表格 |、**加粗**、[链接](网址)', 12),
          '页面上也可以直接在块里编辑：输入时实时预览，点「✓ 转换保存」生效。');
      case 'hr': return '<p class="modal-note">分隔线：一条水平分割，用于分区（无其他设置）。</p>';
    }
    return '';
  }
  /* ---------- 读取表单 → 内容块对象 ---------- */
  function readForm(type, form, base) {
    const val = function (n) {
      const el = form.querySelector('[name="' + n + '"]');
      return el ? el.value.trim() : '';
    };
    const colorVal = function () {
      const def = form.querySelector('[name="color_default"]');
      const c = form.querySelector('[name="color"]');
      if (!c) return '';
      return (def && def.checked) ? '' : c.value;
    };
    const b = LMStore.deepCopy(base || { type: type });
    b.type = type;
    switch (type) {
      case 'heading': b.text = val('text'); b.level = +val('level') || 2; b.color = colorVal(); break;
      case 'paragraph': b.text = val('text'); b.size = val('size'); b.color = colorVal(); break;
      case 'callout': b.title = val('title'); b.text = val('text'); b.tone = val('tone'); break;
      case 'image': b.src = val('src'); b.caption = val('caption'); b.widthPct = val('width') === 'full' ? 100 : 68; break;
      case 'table':
        b.title = val('title');
        b.headers = lines(form.querySelector('[name=headers]').value);
        b.rows = pairs(form.querySelector('[name=rows]').value);
        break;
      case 'chart':
        b.title = val('title'); b.chartType = val('chartType'); b.unit = val('unit');
        b.labels = lines(form.querySelector('[name=labels]').value);
        b.data = lines(form.querySelector('[name=data]').value).map(Number).filter(function (n) { return Number.isFinite(n); });
        break;
      case 'files':
        b.title = val('title');
        b.items = pairs(form.querySelector('[name=items]').value).map(function (p) { return { name: p[0] || '附件', url: p[1] || '#' }; });
        break;
      case 'sources':
        b.title = val('title');
        b.items = pairs(form.querySelector('[name=items]').value).map(function (p) { return { label: p[0] || '来源', url: p[1] || '#' }; });
        break;
      case 'md': b.text = val('text'); break;
      case 'hr': break;
    }
    return b;
  }

  function openBlockForm(pageId, idx, presetType) {
    const page = LMApp.state.content.pages.find(function (p) { return p.id === pageId; });
    if (!page) return;
    const isNew = idx == null;
    const type = presetType || (page.blocks[idx] && page.blocks[idx].type);
    if (!type || !TYPES[type]) { LMApp.toast('未知的内容块类型'); return; }
    const base = isNew ? defaultsFor(type) : page.blocks[idx];
    modal('<form id="blockForm">'
      + '<h3>' + (isNew ? '添加' : '编辑') + '「' + TYPES[type].name + '」内容块</h3>'
      + formHTML(type, base)
      + '<div class="form-actions"><button type="button" class="btn btn-ghost" data-close>取消</button>'
      + '<button class="btn btn-primary" type="submit">保存</button></div></form>', function (root) {
      root.querySelector('#blockForm').addEventListener('submit', function (e) {
        e.preventDefault();
        const nb = readForm(type, e.target, base);
        if (type === 'chart' && nb.labels.length !== nb.data.length) {
          LMApp.toast('分类标签与数值的行数需要一致（当前 ' + nb.labels.length + ' vs ' + nb.data.length + '）');
          return;
        }
        if (isNew) page.blocks.push(nb); else page.blocks[idx] = nb;
        closeModal();
        LMApp.applyEdit(isNew ? '已添加内容块' : '已保存修改');
      });
    });
  }

  function pickType(pageId) {
    modal('<h3>选择要添加的内容块</h3><div class="type-grid">'
      + Object.keys(TYPES).map(function (k) {
          return '<button type="button" class="type-btn" data-type="' + k + '"><span class="ti">' + TYPES[k].icon + '</span>' + TYPES[k].name + '</button>';
        }).join('')
      + '</div>', function (root) {
      root.querySelectorAll('.type-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          closeModal();
          openBlockForm(pageId, null, btn.getAttribute('data-type'));
        });
      });
    });
  }

  /* ---------- 内容块工具条（管理模式悬停显示） ---------- */
  function tools(pageId, i, b) {
    const isFree = !!(b && b.free);
    const isImg = !!(b && b.type === 'image');
    const isTbl = !!(b && b.type === 'table');
    const pg = ' data-page="' + pageId + '" data-idx="' + i + '"';
    /* 对齐模块：自由文本框 → 贴左/贴右（被同排的块挡住时自动"手拉手"贴到它旁边）；
       图片 / 表格 → 贴左 / 居中 / 贴右（图片等比缩放，不会被拉变形） */
    let alignBtns = '';
    if (isFree) {
      alignBtns = '<button type="button" data-act="fsnap" data-side="left"' + pg + ' title="向左拉伸：右边缘不动，左边伸到文档最左（被挡住则停在旁边块右侧，留小缝）">⇤</button>'
        + '<button type="button" data-act="fmove" data-val="left"' + pg + ' title="贴左：整框平移到文档最左，宽度不变（不拉伸）">左</button>'
        + '<button type="button" data-act="fmove" data-val="center"' + pg + ' title="水平居中：整框平移到文档中央，宽度不变（不拉伸）">中</button>'
        + '<button type="button" data-act="fmove" data-val="right"' + pg + ' title="贴右：整框平移到文档最右，宽度不变（不拉伸）">右</button>'
        + '<button type="button" data-act="fsnap" data-side="right"' + pg + ' title="向右拉伸：左边缘不动，右边伸到文档最右（被挡住则停在旁边块左侧，留小缝）">⇥</button>'
        + '<button type="button" data-act="ftop"' + pg + ' title="顶到上一模块底部：框的上缘与上一个内容块的下缘对齐（只位移）">⤒</button>';
    } else if (isImg || isTbl) {
      alignBtns = '<button type="button" data-act="halign" data-val="left"' + pg + ' title="贴左">⇤</button>'
        + '<button type="button" data-act="halign" data-val="center"' + pg + ' title="居中">⇆</button>'
        + '<button type="button" data-act="halign" data-val="right"' + pg + ' title="贴右">⇥</button>';
    }
    return '<div class="block-tools">'
      + (isFree ? '' : '<button type="button" data-drag="' + i + '" title="按住拖动调整顺序：其他块自动让路，拖到屏幕上下边缘会自动滚页">⠿</button>')
      + alignBtns
      + '<button type="button" data-act="up" data-page="' + pageId + '" data-idx="' + i + '" title="' + (isFree ? '框上移 40 像素（只位移）' : '上移（调整文档顺序）') + '">↑</button>'
      + '<button type="button" data-act="down" data-page="' + pageId + '" data-idx="' + i + '" title="' + (isFree ? '框下移 40 像素（只位移）' : '下移（调整文档顺序）') + '">↓</button>'
      + '<button type="button" data-act="edit" data-page="' + pageId + '" data-idx="' + i + '" title="更多设置：颜色 / 图片 / 图表数据 / 表格结构 / 链接">⚙</button>'
      + '<button type="button" data-act="del" data-page="' + pageId + '" data-idx="' + i + '" title="删除此内容块">🗑</button>'
      + '</div>';
  }

  /* ---------- 事件委托：内容块操作 ---------- */
  document.addEventListener('click', function (e) {
    if (!LMApp.state.admin) return;
    /* 首页特性行卡片：删除 / 添加（工具条外的小 ✕ 与虚线"添加卡片"块） */
    const fx = e.target.closest ? e.target.closest('[data-featdel]') : null;
    if (fx) {
      const s = LMApp.state.content.site;
      const fi = +fx.getAttribute('data-featdel');
      if (Array.isArray(s.homeFeatures) && s.homeFeatures[fi]) {
        s.homeFeatures.splice(fi, 1);
        LMApp.applyEdit('已删除卡片（Ctrl+Z 可撤销）');
      }
      return;
    }
    if (e.target.closest && e.target.closest('#featAdd')) {
      const s = LMApp.state.content.site;
      if (!Array.isArray(s.homeFeatures)) s.homeFeatures = [];
      s.homeFeatures.push({ icon: '📄', title: '新卡片', desc: '点击编辑这张卡片的说明' });
      LMApp.applyEdit('已添加卡片：点击卡片上的文字即可编辑');
      return;
    }
    /* 块类型切换条（选中标题/正文块时显示在块下方） */
    const tt = e.target.closest ? e.target.closest('.blk-typebar [data-tt]') : null;
    if (tt) {
      const wrap = tt.closest('.block-wrap[data-idx]');
      const page = pageOf();
      const i = wrap ? +wrap.getAttribute('data-idx') : -1;
      const b = (page && i >= 0) ? page.blocks[i] : null;
      const opt = TYPE_OPTS.find(function (o) { return o.t === tt.getAttribute('data-tt'); });
      if (b && opt && !opt.match(b)) {
        opt.apply(b);
        LMApp.applyEdit('已改为「' + opt.name + '」');
        setTimeout(function () {
          tb.active = i;
          const pg = pageOf();
          const bb2 = pg ? pg.blocks[i] : null;
          if (bb2 && (bb2.type === 'heading' || bb2.type === 'paragraph')) refreshHandles();
        }, 30);
      }
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const pageId = btn.getAttribute('data-page');
    const page = LMApp.state.content.pages.find(function (p) { return p.id === pageId; });
    if (!page) return;
    const i = +btn.getAttribute('data-idx');
    if (act === 'fsnap') { snapFree(page, i, btn.getAttribute('data-side')); return; }
    if (act === 'fmove') { freeMoveX(page, i, btn.getAttribute('data-val')); return; }
    if (act === 'ftop') { freeTopAlign(page, i); return; }
    if (act === 'halign') {
      const b2 = page.blocks[i]; if (!b2) return;
      const v = btn.getAttribute('data-val') || '';
      if (v) b2.hAlign = v; else delete b2.hAlign;
      LMApp.applyEdit(v === 'left' ? '已贴左（上下不变）' : (v === 'right' ? '已贴右（上下不变）' : '已居中'));
      return;
    }
    if (act === 'herohide' || act === 'heroshow') {
      const p2 = LMApp.state.content.pages.find(function (x) { return x.id === pageId; });
      if (p2) {
        if (act === 'herohide') p2.hero = false; else delete p2.hero;
        LMApp.applyEdit(act === 'herohide' ? '标题区已隐藏（可再显示）' : '标题区已显示');
      }
      return;
    }
    if (act === 'add') { pickType(pageId); return; }
    if (act === 'edit') { openBlockForm(pageId, i); return; }
    if (act === 'del') {
      confirmModal('删除内容块', '确定删除这个内容块？删除后可按 Ctrl+Z 撤销。', '确认删除', function () {
        page.blocks.splice(i, 1);
        LMApp.applyEdit('已删除内容块');
      });
      return;
    }
    if (act === 'up' || act === 'down') {
      const b2 = page.blocks[i];
      /* 自由框是绝对定位：↑/↓ = 整格移动 —— ↑ 跳到上一模块的上面，↓ 跳到下一模块的下面（带平滑动画） */
      if (b2 && b2.free) { freeJump(page, i, act === 'up' ? 'up' : 'down'); return; }
    }
    if (act === 'up' && i > 0) {
      const t = page.blocks[i - 1]; page.blocks[i - 1] = page.blocks[i]; page.blocks[i] = t;
      LMApp.applyEdit('已上移'); return;
    }
    if (act === 'down' && i < page.blocks.length - 1) {
      const t = page.blocks[i + 1]; page.blocks[i + 1] = page.blocks[i]; page.blocks[i] = t;
      LMApp.applyEdit('已下移'); return;
    }
  });
  /* ---------- 管理员工具条 ---------- */
  /* 内容列左右边缘（px，相对 .blocks 内沿）：以文档流块的实际位置为基准 ——
     表格、卡片、正文的对齐线是它们，而不是 .blocks 的内边距外缘；
     这样 ⇤/⇥ 延伸和贴左/贴右/居中都与内容块严丝合缝（修复“延伸得比内容块更宽”） */
  function contentEdges(col) {
    let L = Infinity, R = -Infinity;
    col.querySelectorAll(':scope > .block-wrap:not(.free-box)').forEach(function (w) {
      if (w.offsetHeight < 4) return;
      L = Math.min(L, w.offsetLeft);
      R = Math.max(R, w.offsetLeft + w.offsetWidth);
    });
    if (!isFinite(L) || R <= L) { L = 0; R = col.clientWidth || 0; }
    return { L: L, R: R };
  }
  /* 自由文本框贴边（拉伸语义，像 Word 拖边一样）：
     向左对齐 = 右边缘不动，左边缘伸到内容块左缘；向右对齐 = 左边缘不动，右边缘伸到内容块右缘；
     伸展途中被同一高度的其他文本框顶住 → 停在它旁边，手拉手留一条苹果风小缝 */
  function snapFree(page, i, side) {
    const b = page.blocks[i]; if (!b || !b.free) return;
    const col = document.querySelector('.blocks'); if (!col) return;
    const cw = col.clientWidth || 1;
    const ed = contentEdges(col);
    const XL = Math.round(ed.L / cw * 1000) / 10, XR = Math.round(ed.R / cw * 1000) / 10;
    const GAP = 16, GPP = GAP / cw * 100; /* 苹果风小缝 16px → 百分比 */
    const f = b.free;
    const x0 = +f.x || 0;
    const w0 = Math.min(100, Math.max(10, +f.w || 40));
    const r0 = x0 + w0;                     /* 固定不动的边：向左=右缘，向右=左缘 */
    let x = (side === 'left') ? XL : x0;
    let w = (side === 'left') ? (r0 - XL) : (XR - x0);
    const wrap = col.querySelector('.block-wrap[data-idx="' + i + '"]');
    const sy = window.scrollY || window.pageYOffset || 0;
    let myTop = 0, myBot = 0;
    if (wrap) { const rr = wrap.getBoundingClientRect(); myTop = rr.top + sy; myBot = rr.bottom + sy; }
    /* 找同一高度、挡在伸展路径上的文本框：向左取最靠右的障碍，向右取最靠左的障碍 */
    let blocker = null;
    col.querySelectorAll('.block-wrap.free-box').forEach(function (w2) {
      const oi = +w2.getAttribute('data-idx');
      if (oi === i) return;
      const ob = page.blocks[oi]; if (!ob || !ob.free) return;
      const rc = w2.getBoundingClientRect();
      const t2 = rc.top + sy, b2 = rc.bottom + sy;
      if (!(t2 < myBot - 8 && b2 > myTop + 8)) return;   /* 只看同一高度（垂直方向有重叠）的 */
      const ox = +ob.free.x || 0, ow = Math.min(100, Math.max(10, +ob.free.w || 40));
      if (side === 'left') {
        if (ox + ow <= x0 + 0.5 && (!blocker || ox + ow > blocker.right)) blocker = { right: ox + ow };
      } else {
        if (ox >= r0 - 0.5 && (!blocker || ox < blocker.left)) blocker = { left: ox };
      }
    });
    let wasHugged = false;
    if (side === 'left') {
      if (blocker) { const nx = blocker.right + GPP; if (nx < r0 - 5) { x = nx; w = r0 - nx; wasHugged = true; } }
    } else {
      if (blocker) { const nr = blocker.left - GPP; if (nr > r0 + 5) { w = nr - x0; wasHugged = true; } }
    }
    if (w < 8) { w = 8; if (side === 'left') x = r0 - w; }
    if (w > 100) w = 100;
    f.x = Math.round(x * 10) / 10;
    f.w = Math.round(w * 10) / 10;
    if (wrap) { wrap.style.left = f.x + '%'; wrap.style.width = f.w + '%'; }
    LMApp.commit({ silent: true, rerender: false });
    LMApp.adjustFreeLayout();
    markSaved();
    LMApp.toast(wasHugged
      ? (side === 'left' ? '已向左对齐：停在旁边块右侧（留缝）' : '已向右对齐：停在旁边块左侧（留缝）')
      : (side === 'left' ? '已向左对齐：左边缘与内容块左缘对齐（右边缘不动）' : '已向右对齐：右边缘与内容块右缘对齐（左边缘不动）'));
  }
  /* 自由框纯位移对齐（不拉伸，宽度始终不变）：左 = 贴内容块左缘，中 = 内容列居中，右 = 贴内容块右缘 */
  function freeMoveX(page, i, mode) {
    const b = page.blocks[i]; if (!b || !b.free) return;
    const col = document.querySelector('.blocks'); if (!col) return;
    const cw = col.clientWidth || 1;
    const ed = contentEdges(col);
    const XL = ed.L / cw * 100, XR = ed.R / cw * 100;
    const f = b.free;
    const w = Math.min(100, Math.max(10, +f.w || 40));
    if (mode === 'left') f.x = Math.round(XL * 10) / 10;
    else if (mode === 'right') f.x = Math.round((XR - w) * 10) / 10;
    else f.x = Math.round((XL + (XR - XL - w) / 2) * 10) / 10;
    const wrap = col.querySelector('.block-wrap[data-idx="' + i + '"]');
    if (wrap) wrap.style.left = f.x + '%';
    LMApp.commit({ silent: true, rerender: false });
    LMApp.adjustFreeLayout();
    markSaved();
    LMApp.toast(mode === 'left' ? '已贴左（与内容块左缘对齐）' : mode === 'right' ? '已贴右（与内容块右缘对齐）' : '已在内容列水平居中（宽度不变）');
  }
  /* 自由框整格移动（↑/↓）：↑ = 跳到「上一模块」的上面（框顶 = 该模块顶，原模块被让位机制推到框下方）；
     ↓ = 跳到「下一模块」的下面（框顶 = 该模块底 + 16px 缝）。按当前视觉位置找相邻模块，一步到位，
     不是机械的 ±40px。全程不重渲染、只改 style.top → 换位走 CSS 过渡（平滑滑动），也不会触发旧“飞升” */
  function freeJump(page, i, dir) {
    const b = page.blocks[i]; if (!b || !b.free) return;
    if (b.free.g != null) { LMApp.toast('并排的块请在本行内左右拖动微调（↑↓ 整格移动会拆散并排行；要拆散请用「取消并排」）'); return; }
    const col = document.querySelector('.blocks'); if (!col) return;
    const me = col.querySelector('.block-wrap[data-idx="' + i + '"]');
    if (!me) return;
    const rb = me.getBoundingClientRect();
    let best = null, bestKey = (dir === 'up') ? -Infinity : Infinity;
    col.querySelectorAll(':scope > .block-wrap').forEach(function (w) {
      if (w === me) return;
      if (!page.blocks[+w.getAttribute('data-idx')]) return;
      const r = w.getBoundingClientRect();
      if (r.height < 4) return; /* 空块跳过 */
      if (dir === 'up') { if (r.bottom <= rb.top + 8 && r.bottom > bestKey) { bestKey = r.bottom; best = w; } }
      else { if (r.top >= rb.bottom - 8 && r.top < bestKey) { bestKey = r.top; best = w; } }
    });
    if (!best) { LMApp.toast(dir === 'up' ? '上面已经没有模块了' : '下面已经没有模块了'); return; }
    const colTop = col.getBoundingClientRect().top;
    const r = best.getBoundingClientRect();
    const yNew = (dir === 'up')
      ? Math.max(0, Math.round(r.top - colTop))
      : Math.max(0, Math.round(r.bottom - colTop + 16));
    b.free.y = yNew;
    me.style.top = yNew + 'px';
    LMApp.commit({ silent: true, rerender: false });
    resolveFreeOverlaps(null, null); /* ↑/↓ 整格移动后同样全量防重叠 */
    LMApp.adjustFreeLayout();
    markSaved();
    LMApp.toast(dir === 'up' ? '已移到上一模块的上面（原模块被推到框下方）' : '已移到下一模块的下面');
  }
  /* 自由框顶到上一模块底部（⤒）：把框的上缘「贴平」到视觉上最近的上一模块的底缘。
     ★ 全程用当前视觉位置测量，所见即所得：
       目标 = 所有模块（内容块 + 其他文本框）里「底缘 ≤ 框上缘 + 容差」中最靠下的那个；
       容差 = max(24, 模块高 20%)，上限 96px —— 框的上缘只要落在某模块下沿附近，
       就算“贴着它”，哪怕需要向下挪几十像素也贴平过去（结果零缝隙）；
       贴平后框的上缘 = 目标底缘，绝无空隙；上方没有任何模块 → 移到文档顶部。
       提示里会报出实际移动的像素数，方便核对。 */
  function freeTopAlign(page, i) {
    const b = page.blocks[i]; if (!b || !b.free) return;
    const col = document.querySelector('.blocks'); if (!col) return;
    const me = col.querySelector('.block-wrap[data-idx="' + i + '"]');
    if (!me) return;
    const rb = me.getBoundingClientRect();
    let best = null, bestBottom = -Infinity;
    col.querySelectorAll(':scope > .block-wrap').forEach(function (w) {
      if (w === me) return;
      if (!page.blocks[+w.getAttribute('data-idx')]) return;
      const r = w.getBoundingClientRect();
      if (r.height < 4) return; /* 空块跳过 */
      const tol = Math.min(Math.max(24, Math.round(r.height * 0.2)), 96);
      if (r.bottom <= rb.top + tol && r.bottom > bestBottom) { best = w; bestBottom = r.bottom; }
    });
    let msg;
    if (best) {
      const dy = Math.round(bestBottom - rb.top);
      const yNew = Math.max(0, Math.round((+b.free.y || 0) + dy));
      b.free.y = yNew;
      me.style.top = yNew + 'px';
      msg = '框的上缘已贴平到上一模块底部（' + (dy >= 0 ? '下移 ' : '上移 ') + Math.abs(dy) + ' 像素）';
    } else {
      b.free.y = 0;
      me.style.top = '0px';
      msg = '上方没有其他模块，已移到文档顶部';
    }
    /* 不重渲染、只改 style.top：框平滑滑过去（CSS 过渡），让位块同步渐变，且不会触发旧“飞升” */
    LMApp.commit({ silent: true, rerender: false });
    resolveFreeOverlaps(null, null); /* ⤒ 贴平后全量防重叠 */
    LMApp.adjustFreeLayout();
    markSaved();
    LMApp.toast(msg);
  }
  /* 勾选并排：把勾选的 2-4 个内容块排成一排 —— 上下对齐、左右手拉手留缝、高度随内容自动 */
  function doArrange() {
    const page = pageOf(); if (!page) return;
    const idxs = tb.multiSel.slice().sort(function (a, b) { return a - b; }).filter(function (i) { return page.blocks[i]; });
    if (idxs.length < 2) { LMApp.toast('请先勾选至少 2 个内容块（先点工具栏 ☑ 进入勾选模式）'); return; }
    if (idxs.some(function (i) { return page.blocks[i].type === 'image'; })) {
      LMApp.toast('图片不能并排（会被拉变形 / 挡内容）— 图片请单独用 ⇤ 贴左 / ⇥ 贴右'); return;
    }
    const col = document.querySelector('.blocks'); if (!col) return;
    const cw = col.clientWidth || 1;
    const sy = window.scrollY || window.pageYOffset || 0;
    const colTop = col.getBoundingClientRect().top + sy;
    let top = Infinity;
    idxs.forEach(function (i) {
      const w = col.querySelector('.block-wrap[data-idx="' + i + '"]');
      if (w) { const r = w.getBoundingClientRect(); top = Math.min(top, r.top + sy - colTop); }
    });
    if (!isFinite(top)) top = 40;
    const n = idxs.length, GPP = 16 / cw * 100;
    const wPct = (100 - GPP * (n - 1)) / n;
    const gid = 'g' + Date.now().toString(36); /* 并排组标记：后台记住这几个块是并排过的（取消并排/行内拖动约束都靠它） */
    idxs.forEach(function (i, k) {
      const b = page.blocks[i];
      const gw0 = Math.min(100, Math.max(20, Math.round(+b.width) || 100)); /* 「正确的宽度」= 该块并排前的宽度 */
      const x0 = Math.round(k * (wPct + GPP) * 10) / 10;
      b.free = { x: x0, y: Math.round(top), w: Math.round(wPct * 10) / 10,
        g: gid, gi: k, gn: n, gw: gw0, gx0: x0 };
      delete b.hAlign; delete b.width;
    });
    exitMulti();
    renderToolbar(); /* ★ 立即熄灭 ☑、撤掉「▦ 并排」按钮（不等整页重绘），勾选模式就此结束 */
    LMApp.applyEdit('已并排排列，并已自动退出勾选模式（☑ 已熄灭、绿勾已清；要再排就再点 ☑）');
  }
  /* 「取消并排」：把并排组还原成普通内容块 —— 不恢复并排前的位置（文档流自然顺序，
     避免与后续修改冲突），宽度恢复各自并排前的「正确宽度」；按原并排顺序上下排列：
     第 1 块（原最左）贴页面左缘，最后 1 块（原最右）贴页面右缘，中间块按顺序排；
     顺序之后用块工具条 ⠿ 拖拽手动调。只能整组取消：勾选的块必须同组且一个不少
     （拆一半会留下残组，组内互相吸附/不互推的逻辑就坏了） */
  function pickFullGroup() {
    const page = pageOf(); if (!page) return null;
    const idxs = tb.multiSel.slice().sort(function (a, b) { return a - b; }).filter(function (i) {
      return page.blocks[i] && page.blocks[i].free && page.blocks[i].free.g;
    });
    if (idxs.length < 2) return null;
    const g = page.blocks[idxs[0]].free.g;
    if (idxs.some(function (i) { return page.blocks[i].free.g !== g; })) return null; /* 跨组混选 */
    const gn = +page.blocks[idxs[0]].free.gn || idxs.length;
    if (idxs.length !== gn) return null; /* 组没选全 */
    return { page: page, idxs: idxs, g: g, gn: gn };
  }
  function canUnarrange() { try { return !!pickFullGroup(); } catch (e) { return false; } }
  function doUnarrange() {
    const picked = pickFullGroup();
    if (!picked) { LMApp.toast('要取消并排，请先点 ☑ 勾选模式，把这一组的所有并排块都选上'); return; }
    const page = picked.page;
    const items = picked.idxs.map(function (i) { return page.blocks[i]; })
      .sort(function (a, c) { return (+a.free.gi || 0) - (+c.free.gi || 0); }); /* 按并排时的左右顺序 */
    const n = items.length;
    items.forEach(function (b, k) {
      b.width = Math.min(100, Math.max(20, Math.round(+b.free.gw) || 100)); /* 恢复「正确的宽度」 */
      if (n >= 2 && k === n - 1 && b.width < 100) b.wAlign = 'right'; /* 原最右的块贴页面右缘 */
      else if (b.wAlign) delete b.wAlign;
      delete b.free; /* 解除并排：回到文档流自然顺序位置（上一个、下一个），不回到并排前的旧位置 */
    });
    exitMulti();
    renderToolbar();
    LMApp.applyEdit('已取消并排：' + n + ' 个块恢复标准宽度、按顺序上下排列（第 1 块贴左、最后 1 块贴右）；要调前后顺序用块工具条的 ⠿ 拖拽');
  }
  /* 退出勾选模式：状态 + 视觉标记（块右上角绿色 ✓）一并清理 —— 修复“退出后勾选标记不消失” */
  function exitMulti() {
    tb.multi = false; tb.multiSel = [];
    document.body.classList.remove('multi-mode');
    document.querySelectorAll('.blocks > .block-wrap.multi-sel').forEach(function (w) { w.classList.remove('multi-sel'); });
    /* ★ 并排完成 / 退出勾选 = 本次任务结束：同时取消块选中态（绿勾、蓝框工具条一并消失），
       不留「模式已关但块还挂着选中」的中间态——那会引发连点误操作的连环 bug */
    tb.active = null; tb.imgSel = null; tb.pressBi = null;
    removeHandles();
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (tb.jumpPend && (tb.jumpPend.from || tb.jumpPend.to)) {
      tb.jumpPend = { from: null, to: null };
      renderToolbar();
      LMApp.toast('已退出跳转选择（起点/终点已作废）');
      return;
    }
    if (tb.multi) {
      exitMulti();
      renderToolbar();
      LMApp.toast('已退出勾选模式');
    }
    if (tb.brushOn) {
      tb.brushOn = false; tb.copyArm = false; tb.brushBuf = null;
      renderBrushPop();
      LMApp.toast('已关闭格式刷');
    }
  });
  function renderAdminBar() {
    renderBrushPop(); /* 登录 / 登出时同步格式刷气泡的显隐 */
    let bar = document.getElementById('adminBar');
    if (!LMApp.state.admin) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'adminBar';
      document.body.appendChild(bar);
    }
    bar.innerHTML = ''
      + '<button class="bar-toggle" type="button" title="收起 / 展开管理工具（手机端）">🛠️</button>'
      + '<span class="bar-tip">✏️ 点击文字直接修改</span>'
      + '<span class="save-dot" id="saveDot">自动保存已开启</span>'
      + '<button class="btn btn-primary" data-panel="sync" type="button">☁️ 同步到 GitHub</button>'
      + '<button class="btn btn-mini" data-panel="site" type="button">🏠 网站信息</button>'
      + '<button class="btn btn-mini" data-panel="pages" type="button">📄 页面管理</button>'
      + '<button class="btn btn-mini" data-panel="hist" type="button">🕘 历史版本</button>'
      + '<button class="btn btn-mini" data-panel="backup" type="button">💾 备份 / 恢复</button>'
      + '<button class="btn btn-mini" data-panel="password" type="button">🔑 修改密码</button>';
    if (!bar.dataset.init) {
      bar.dataset.init = '1';
      /* 手机端默认收起（只显示 🛠️ 把手，点一下展开）；电脑端常开展开态，行为不变 */
      bar.classList.toggle('open', !document.body.classList.contains('mobile-view'));
    }
    const btog = bar.querySelector('.bar-toggle');
    if (btog) btog.addEventListener('click', function () { bar.classList.toggle('open'); });
  }
  document.addEventListener('click', function (e) {
    const p = e.target.closest('[data-panel]');
    if (!p || !LMApp.state.admin) return;
    const k = p.getAttribute('data-panel');
    if (k === 'sync') syncModal();
    else if (k === 'site') siteModal();
    else if (k === 'hist') histModal();
    else if (k === 'pages') pagesModal();
    else if (k === 'backup') backupModal();
    else if (k === 'password') passwordModal();
  });

  /* ---------- GitHub 同步设置（双视图）----------
     根管理员：完整配置界面（本机专属通道 + 团队保险箱分发）；普通管理员：只见「确认上传」一键操作，
     看不到 Token/用户名/仓库名等任何配置（明文密钥永不出现在界面上） */
  function syncModal() {
    if (LMApp.state.root) syncModalRoot();
    else syncModalLite();
  }
  function syncModalLite() {
    const cfg = LMStore.getGhCfg();
    const canPush = !!(cfg && cfg.owner && cfg.repo && LMStore.ghToken());
    modal('<h3>同步到 GitHub（云端上传）</h3>'
      + '<p class="modal-note">' + (canPush
        ? '☁️ 云端上传通道已开启（由根管理员统一分发管理）。你的修改将上传到团队仓库，网页 1-2 分钟后自动更新。'
        : '⏳ 云端上传通道尚未开启：请让根管理员登录本站配置一次，之后本机自动可用。<br>你已做的修改都安全保存在本设备，不会丢失。') + '</p>'
      + (canPush
        ? '<div class="form-actions"><button type="button" class="btn btn-ghost" data-close>取消</button>'
          + '<button type="button" class="btn btn-primary" id="ghLitePush">☁️ 确认上传</button></div>'
        : '<div class="form-actions"><button type="button" class="btn btn-ghost" data-close>我知道了</button></div>'),
      function (root) {
        const b = root.querySelector('#ghLitePush');
        if (!b) return;
        b.addEventListener('click', function () {
          b.disabled = true; b.textContent = '正在上传…';
          const cfg2 = LMStore.getGhCfg();
          cfg2.token = cfg2.token || LMStore.ghToken();
          LMStore.saveGitHub(cfg2, LMApp.state.content).then(function () {
            LMEditor.closeModal();
            LMApp.toast('✅ 已上传到 GitHub，网页 1-2 分钟后自动更新');
          }).catch(function (err) {
            b.disabled = false; b.textContent = '☁️ 确认上传';
            LMApp.toast('上传失败：' + (err && err.message ? err.message : err));
          });
        });
      });
  }
  function syncModalRoot() {
    const cfg = LMStore.getGhCfg();
    const hasToken = !!LMStore.ghToken();
    const vault = ((LMApp.state.content.config || {}).collab || {}).tokenVault;
    modal('<h3>同步到 GitHub（云端保存 · 根管理员专属）</h3>'
      + '<p class="modal-note">在网站上保存的内容先存在<b>你自己的浏览器</b>里；配置下面信息后，即可把内容直接提交到 GitHub 仓库，GitHub Pages 会在 1-2 分钟后自动更新——<b>不需要手动上传文件</b>。</p>'
      + '<form id="ghForm">'
      + field('GitHub 用户名 / 组织名', F.text('owner', cfg.owner, '例如 fvymyhy98d-netizen'))
      + field('仓库名', F.text('repo', cfg.repo, '例如 living-maps2'))
      + field('分支', F.text('branch', cfg.branch || 'main', '一般保持 main'))
      + field('内容文件路径', F.text('path', cfg.path || 'data/content.js', '一般保持默认'))
      + field('GitHub Token（默认只存当前标签页，关闭浏览器即清除）',
          '<input class="input" type="password" name="token" autocomplete="off" placeholder="'
          + (hasToken ? '本次会话已有 Token，留空则继续使用' : '粘贴 Fine-grained Personal Access Token') + '">',
          '生成方法：GitHub → Settings → Developer settings → Fine-grained tokens → 生成时仅选择本仓库 → 权限里把 Contents 勾选为 Read and write')
      + '<label class="modal-note" style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="ghRemember"'
          + (cfg.remembered ? ' checked' : '') + '> 在本机记住 Token（关浏览器/刷新都不丢，不用每次重填；公共电脑请勿勾选）</label>'
      + field('团队管理密码（普通管理员的登录密码）',
          '<input class="input" type="password" name="teamPw" autocomplete="off" placeholder="'
          + (vault ? '已配置团队分发，留空则保持不变' : '填写后普通管理员登录即可一键上传') + '">',
          '可选：填写后会把上面的 GitHub 配置 AES-256-GCM 加密成「团队保险箱」随内容上云；普通管理员用这个密码登录时自动解密取回，一键上传。明文 Token 不会出现在任何界面与云端内容里。')
      + '<div class="form-actions">'
      + '<button type="button" class="btn btn-ghost" data-close>关闭</button>'
      + '<button type="button" class="btn btn-ghost" id="ghSaveCfg">只保存设置</button>'
      + '<button class="btn btn-primary" type="submit">保存并同步到 GitHub</button>'
      + '</div></form>', function (root) {
      const form = root.querySelector('#ghForm');
      const collect = function () {
        const fd = new FormData(form);
        return {
          owner: String(fd.get('owner') || '').trim(),
          repo: String(fd.get('repo') || '').trim(),
          branch: String(fd.get('branch') || '').trim() || 'main',
          path: String(fd.get('path') || '').trim() || 'data/content.js',
          token: String(fd.get('token') || ''),
          remember: !!(root.querySelector('#ghRemember') && root.querySelector('#ghRemember').checked)
        };
      };
      const vaultize = function (c) { /* 团队保险箱：填了团队密码才更新（随内容上云分发给普通管理员） */
        const pw = String((new FormData(form)).get('teamPw') || '').trim();
        if (!pw) return Promise.resolve(false);
        return LMStore.encryptForTeam(JSON.stringify({ owner: c.owner, repo: c.repo, branch: c.branch, path: c.path, token: c.token }), pw).then(function (box) {
          const cc = LMApp.state.content.config = LMApp.state.content.config || {};
          cc.collab = cc.collab || {};
          cc.collab.tokenVault = box;
          LMApp.commit({ silent: true, rerender: false });
          return true;
        });
      };
      root.querySelector('#ghSaveCfg').addEventListener('click', function () {
        const c = collect();
        LMStore.setGhCfg(c);
        vaultize(c).then(function (vOk) {
          LMApp.toast(vOk ? '设置已保存；团队保险箱已更新（随内容自动上云）' : '设置已保存（Token 仅本次会话有效）');
        }).catch(function (eV1) { LMApp.toast('设置已保存；但保险箱加密失败：' + (eV1 && eV1.message ? eV1.message : eV1)); });
      });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const c = collect();
        LMStore.setGhCfg(c);
        vaultize(c).catch(function (eV2) { LMApp.toast('团队保险箱加密失败：' + (eV2 && eV2.message ? eV2.message : eV2)); });
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = '正在同步…';
        LMStore.saveGitHub(c, LMApp.state.content).then(function () {
          closeModal();
          LMApp.toast('已提交到 GitHub！页面 1-2 分钟后自动更新' + (String((new FormData(form)).get('teamPw') || '').trim() ? '；团队分发已更新' : ''));
        }).catch(function (err) {
          LMApp.toast(err.message || String(err));
          btn.disabled = false; btn.textContent = '保存并同步到 GitHub';
        });
      });
    });
  }

  /* ---------- 历史版本面板（WPS 式）----------
     列出本次会话的编辑快照（最多 60 步，带时间与体量），一键恢复；
     恢复走完整 commit 链（保存 → 实时广播 → 云端提交），且本机可再撤销 */
  function histModal() {
    const list = LMApp.historyList ? LMApp.historyList() : [];
    if (!list.length) {
      modal('<h3>历史版本</h3><p class="modal-note">本次打开页面还没有可回退的编辑记录（编辑任意内容后这里就会出现快照）。</p>'
        + '<div class="form-actions"><button type="button" class="btn btn-ghost" data-close>关闭</button></div>');
      return;
    }
    modal('<h3>历史版本（本次会话 · 最多 60 步）</h3>'
      + '<p class="modal-note">点「恢复此版本」= 把该快照变成一次新修改：会同步给其他设备并提交云端，本机还能再撤销。撤销栈之外更早的版本请用「💾 备份 / 恢复」。</p>'
      + '<div style="max-height:52vh;overflow:auto">'
      + list.map(function (v) {
          const d = v.ts ? new Date(v.ts).toLocaleString('zh-CN') : '（更早）';
          return '<div style="display:flex;gap:10px;align-items:center;padding:7px 2px;border-bottom:1px solid rgba(0,0,0,.06)">'
            + '<b style="flex:1;font-size:.92rem">' + LMApp.esc(d) + (v.isCur ? ' <span style="color:#0a84ff;font-size:.8rem">← 当前</span>' : '') + '</b>'
            + '<span style="color:#86868b;font-size:.8rem">' + v.pages + ' 页 · ' + Math.max(1, Math.round(v.size / 1024)) + 'KB</span>'
            + (v.isCur ? '' : '<button type="button" class="btn btn-mini" data-restore="' + v.i + '">恢复此版本</button>')
            + '</div>';
        }).join('')
      + '</div>'
      + '<div class="form-actions"><button type="button" class="btn btn-ghost" data-close>关闭</button></div>', function (root) {
      root.querySelectorAll('[data-restore]').forEach(function (b) {
        b.addEventListener('click', function () {
          const ok = LMApp.restoreVersion(+b.getAttribute('data-restore'));
          if (ok) { closeModal(); LMApp.toast('✅ 已恢复历史版本（已同步其他设备并提交云端，可 Ctrl+Z 再撤销）'); }
          else LMApp.toast('该版本数据异常，无法恢复');
        });
      });
    });
  }
  /* ---------- 网站信息 ---------- */
  function siteModal() {
    const s = LMApp.state.content.site;
    const f = LMApp.state.content.config.footer;
    const cfgS = LMApp.state.content.config = LMApp.state.content.config || {};
    modal('<form id="siteForm"><h3>网站信息（首页与页脚）</h3>'
      + field('首页大标题', F.text('title', s.title))
      + field('顶部小字（课程名等）', F.text('subtitle', s.subtitle))
      + field('选题一句话（首页展示）', F.text('topic', s.topic, '上线前改成你们小组的选题！'))
      + field('网站简介', F.area('description', s.description, '', 3))
      + field('页脚一句话', F.text('note', f.note || ''))
      + field('GitHub 仓库链接（页脚展示，可留空）', F.text('githubUrl', f.githubUrl || '', 'https://github.com/用户名/仓库名'))
      + field('访客互动', '<label style="display:flex;gap:8px;align-items:center;font-weight:400;cursor:pointer"><input type="checkbox" name="cOff"' + (cfgS.commentsOff ? ' checked' : '') + ' style="width:16px;height:16px"> 关闭访客留言与讨论（访客只能浏览，不能留言发帖）</label>',
          'WPS 式权限分级里的「仅浏览」开关：关闭后访客仍能看到全部内容与已有讨论，只是不能再发言。')
      + '<div class="form-actions"><button type="button" class="btn btn-ghost" data-close>取消</button>'
      + '<button class="btn btn-primary" type="submit">保存</button></div></form>', function (root) {
      root.querySelector('#siteForm').addEventListener('submit', function (e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        s.title = String(fd.get('title') || '').trim();
        s.subtitle = String(fd.get('subtitle') || '').trim();
        s.topic = String(fd.get('topic') || '').trim();
        s.description = String(fd.get('description') || '').trim();
        f.note = String(fd.get('note') || '').trim();
        f.githubUrl = String(fd.get('githubUrl') || '').trim();
        cfgS.commentsOff = fd.get('cOff') === 'on';
        closeModal();
        LMApp.applyEdit('网站信息已保存');
      });
    });
  }
  /* ---------- 页面管理 ---------- */
  const PAGE_ICONS = ['📘', '📗', '📙', '📕', '📚', '🗺️', '🧭', '📍', '🌍', '🌐', '💡', '🔬', '🧪', '⚙️', '🛠️', '📊', '📈', '🧠', '🤖', '💬', '👥', '🎓', '✏️', '📝', '🗓️', '⭐', '🔥', '🚀', '🎯', '🔔', '📎', '🗂️'];
  function pagesModal() {
    const c = LMApp.state.content;
    const alignSel = function (p) {
      return '<select class="input" data-k="heroAlign" style="max-width:96px;flex:none">'
        + '<option value=""' + (!p.heroAlign ? ' selected' : '') + '>标题居中</option>'
        + '<option value="left"' + (p.heroAlign === 'left' ? ' selected' : '') + '>标题居左</option>'
        + '<option value="right"' + (p.heroAlign === 'right' ? ' selected' : '') + '>标题居右</option>'
        + '</select>';
    };
    const rows = c.pages.filter(function (p) { return p.id !== 'home'; }).map(function (p) {
      const i = c.pages.indexOf(p);
      return '<div class="page-row" data-i="' + i + '">'
        + '<input class="input" type="text" data-k="icon" value="' + LMApp.esc(p.icon || '') + '" placeholder="图标" style="max-width:64px;flex:none;text-align:center" title="点击弹出图标面板，也可以直接键入 emoji">'
        + '<input class="input" type="text" data-k="label" value="' + LMApp.esc(p.label || '') + '" placeholder="导航名">'
        + '<input class="input" type="text" data-k="title" value="' + LMApp.esc(p.title || '') + '" placeholder="页面大标题">'
        + '<input class="input" type="text" data-k="description" value="' + LMApp.esc(p.description || '') + '" placeholder="页面说明（可留空）">'
        + alignSel(p)
        + '<button type="button" class="btn btn-mini danger" data-delpage="' + i + '">删除</button>'
        + '</div>';
    }).join('');
    modal('<h3>页面管理</h3>'
      + '<p class="modal-note">修改导航名称、页面标题与说明（<b>留空的行页面上不会显示</b>）；点「图标」框弹出图标面板，<b>点选一个即填入</b>（想再选就再点一次图标框），也可以直接键入 emoji。新增页面：点最下面的虚线框，会多出一个空白模板行，填好后点「保存修改」。</p>'
      + '<div class="page-rows">' + rows + '</div>'
      + '<button type="button" class="page-row new-page" id="npAdd" title="点击添加一个空白页面模板，填好后点「保存修改」">＋ 点击新增空白页面模板</button>'
      + '<div class="form-actions"><button type="button" class="btn btn-ghost" data-close>取消</button>'
      + '<button type="button" class="btn btn-primary" id="pagesSave">保存修改</button></div>', function (root) {
      /* 图标选择面板：点图标框弹出；点选一个 = 填入并关闭面板（再点图标框可再选）；点面板外关闭；输入框仍可直接键入 */
      const card = root.querySelector('.modal-card');
      if (card) card.style.position = 'relative';
      const pick = document.createElement('div');
      pick.className = 'icon-pick';
      pick.style.display = 'none';
      pick.innerHTML = PAGE_ICONS.map(function (ic) { return '<button type="button" data-ic="' + ic + '">' + ic + '</button>'; }).join('');
      if (card) card.appendChild(pick);
      let curIconInput = null;
      const openPickFor = function (inp) {
        curIconInput = inp;
        const r = inp.getBoundingClientRect(), cr = card.getBoundingClientRect();
        pick.style.display = 'grid';
        pick.style.left = Math.max(8, r.left - cr.left) + 'px';
        pick.style.top = Math.min(r.bottom - cr.top + 6, cr.height - pick.offsetHeight - 8) + 'px';
      };
      /* 事件委托：模板行是动态加的，图标框统一在这里接管 */
      root.addEventListener('click', function (e) {
        const inp = e.target.closest ? e.target.closest('[data-k="icon"]') : null;
        if (inp) openPickFor(inp);
        const dt = e.target.closest ? e.target.closest('[data-deltpl]') : null;
        if (dt) { const row = dt.closest('.page-row'); if (row) row.remove(); }
      });
      pick.addEventListener('click', function (e) {
        const b = e.target.closest('[data-ic]');
        if (!b || !curIconInput) return;
        curIconInput.value += b.getAttribute('data-ic');
        pick.style.display = 'none'; /* 点一个就关：想再选就再点一次图标框 */
      });
      const offPick = function (e) {
        if (pick.style.display === 'none' || !pick.isConnected) {
          if (!pick.isConnected) document.removeEventListener('mousedown', offPick);
          return;
        }
        if (!pick.contains(e.target) && !(e.target.getAttribute && e.target.getAttribute('data-k') === 'icon')) pick.style.display = 'none';
      };
      document.addEventListener('mousedown', offPick);
      root.querySelector('#pagesSave').addEventListener('click', function () {
        root.querySelectorAll('.page-row[data-i]').forEach(function (row) {
          const p = c.pages[+row.getAttribute('data-i')];
          if (!p) return;
          row.querySelectorAll('[data-k]').forEach(function (inp) {
            p[inp.getAttribute('data-k')] = inp.value.trim();
          });
        });
        /* 虚线框添加的空白模板行 → 点「保存修改」时真正创建页面（导航与首页卡片同步出现） */
        root.querySelectorAll('.page-row.page-new').forEach(function (row) {
          const get = function (k) { const el = row.querySelector('[data-k="' + k + '"]'); return el ? el.value.trim() : ''; };
          const label = get('label') || '新页面';
          let id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || ('page-' + (c.pages.length + 1));
          while (c.pages.some(function (p) { return p.id === id; })) id += '-2';
          const alSel = row.querySelector('[data-k="heroAlign"]');
          c.pages.push({
            id: id, kind: 'page',
            icon: get('icon') || '📄',
            label: label,
            title: get('title'),
            description: get('description'),
            heroAlign: alSel ? alSel.value : '',
            blocks: []
          });
        });
        closeModal();
        LMApp.applyEdit('页面设置已保存');
      });
      root.querySelector('#npAdd').addEventListener('click', function () {
        /* 点虚线框 → 多出一个空白页面模板行（点几次加几个；填好点「保存修改」生效） */
        const div = document.createElement('div');
        div.className = 'page-row page-new';
        div.innerHTML = '<input class="input" type="text" data-k="icon" placeholder="图标" style="max-width:64px;flex:none;text-align:center" title="点击弹出图标面板，也可以直接键入 emoji">'
          + '<input class="input" type="text" data-k="label" placeholder="导航名">'
          + '<input class="input" type="text" data-k="title" placeholder="页面大标题（可留空）">'
          + '<input class="input" type="text" data-k="description" placeholder="页面说明（可留空）">'
          + alignSel({})
          + '<button type="button" class="btn btn-mini danger" data-deltpl title="移除这个模板（不保存）">移除</button>';
        root.querySelector('.page-rows').appendChild(div);
        const first = div.querySelector('[data-k="icon"]');
        if (first) first.focus();
      });
      root.querySelectorAll('[data-delpage]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const i = +btn.getAttribute('data-delpage');
          confirmModal('删除页面', '确定删除该页面及其全部内容？删除后可按 Ctrl+Z 撤销。', '确认删除', function () {
            c.pages.splice(i, 1);
            closeModal();
            LMApp.applyEdit('页面已删除');
          });
        });
      });
    });
  }

  /* ---------- 备份 / 恢复 ---------- */
  function backupModal() {
    modal('<h3>备份 / 恢复</h3>'
      + '<p class="modal-note">导出一个 JSON 备份文件，或从备份恢复。<b>换电脑、清理浏览器缓存前请先导出。</b>配置好 GitHub 同步后，内容会保存在仓库里，就不怕丢了。</p>'
      + '<div class="form-actions" style="justify-content:flex-start">'
      + '<button type="button" class="btn btn-primary" id="bkExport">⬇️ 导出备份</button>'
      + '<label class="btn btn-ghost">⬆️ 导入备份<input type="file" id="bkImport" accept=".json,application/json" hidden></label>'
      + '<button type="button" class="btn btn-ghost" id="bkReset">↺ 恢复初始示例内容</button>'
      + '</div>', function (root) {
      root.querySelector('#bkExport').addEventListener('click', function () {
        const blob = new Blob([JSON.stringify(LMApp.state.content, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'living-maps-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
      });
      root.querySelector('#bkImport').addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = function () {
          try {
            const data = JSON.parse(r.result);
            if (!data.pages || !data.site) throw new Error('文件格式不对');
            LMApp.state.content = data;
            LMApp.ensureConfig();
            LMApp.applyEdit('已从备份恢复');
            closeModal();
          } catch (err) {
            LMApp.toast('导入失败：' + err.message);
          }
        };
        r.readAsText(file);
      });
      root.querySelector('#bkReset').addEventListener('click', function () {
        confirmModal('恢复初始内容', '恢复为初始示例内容？当前浏览器里保存的修改将被清除（GitHub 上的内容不受影响）。', '确认恢复', function () {
          LMStore.resetLocal();
          LMApp.state.content = LMStore.deepCopy(window.SITE_CONTENT);
          LMApp.ensureConfig();
          LMApp.applyEdit('已恢复初始内容');
          closeModal();
        });
      });
    });
  }
  /* ---------- 修改管理密码 ---------- */
  function passwordModal() {
    modal('<form id="pwChange"><h3>修改管理密码</h3>'
      + '<p class="modal-note">密码以 PBKDF2 密钥拉伸哈希（60000 轮 + 独立随机盐）保存在内容文件里，不存明文；即使内容文件泄露也难以反推密码。修改后请记得「同步到 GitHub」，否则只在本浏览器生效。</p>'
      + field('新密码（至少 4 位）', '<input class="input" type="password" name="a" required minlength="4" autocomplete="new-password">')
      + field('再输入一次', '<input class="input" type="password" name="b" required minlength="4" autocomplete="new-password">')
      + '<div class="form-actions"><button type="button" class="btn btn-ghost" data-close>取消</button>'
      + '<button class="btn btn-primary" type="submit">确认修改</button></div></form>', function (root) {
      root.querySelector('#pwChange').addEventListener('submit', function (e) {
        e.preventDefault();
        const f = e.target;
        const a = f.querySelector('[name=a]').value;
        const b = f.querySelector('[name=b]').value;
        if (a !== b) { LMApp.toast('两次输入不一致'); return; }
        const salt = LMStore.randomSaltHex(16);
        LMStore.pbkdf2Hex(a, salt, LMStore.PBKDF2_ITERS).then(function (hash) {
          const adm = LMApp.state.content.config.admin;
          adm.auth = { v: 2, iters: LMStore.PBKDF2_ITERS, salt: salt, hash: hash };
          delete adm.passwordHash; /* 删除旧的单轮哈希 */
          adm.hint = '密码已于 ' + new Date().toLocaleString('zh-CN') + ' 修改';
          closeModal();
          LMApp.applyEdit('密码已更新（密钥拉伸加密），请同步到 GitHub');
        }).catch(function (err) { LMApp.toast(err.message); });
      });
    });
  }

  /* ---------- Word 式在线编辑：失焦自动保存 ---------- */
  function markSaved() {
    const d = document.getElementById('saveDot');
    if (!d) return;
    const t = new Date();
    d.textContent = '✓ 已自动保存 '
      + ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2) + ':' + ('0' + t.getSeconds()).slice(-2);
    d.classList.add('flash');
    setTimeout(function () { d.classList.remove('flash'); }, 700);
  }
  function pageOf() {
    return LMApp.state.content.pages.find(function (p) { return p.id === LMApp.state.pageId; });
  }
  function saveEdited(el) {
    if (!window.LMApp || !LMApp.state.admin) return;
    if (!el || !el.getAttribute || !el.getAttribute('data-edit')) return;
    const txt = htmlToMd(el).replace(/\u00A0/g, ' ').replace(/^\s+|\s+$/g, '').replace(/\n{3,}/g, '\n\n');
    /* ★ 无变化不落盘的统一归一化（修复㉔④ 同款，提到最外层给所有失焦保存路径共用）：
       失焦重序列化与刚存的源码常只差不可见空格 / 首尾空白 / 连续空行 —— 归一后相同就不提交 */
    const normTxt = function (s4) {
      return String(s4 == null ? '' : s4).replace(/\u00A0/g, ' ').replace(/^\s+|\s+$/g, '').replace(/\n{3,}/g, '\n\n');
    };
    const c = LMApp.state.content;
    const siteF = el.getAttribute('data-site');
    if (siteF) {
      const locateSite = function () {
        if (siteF === 'footerNote') { c.config.footer = c.config.footer || {}; return { o: c.config.footer, k: 'note' }; }
        if (siteF.indexOf('.') >= 0) {
          /* 路径字段（如 homeFeatures.0.title）：逐级定位到 site 里的嵌套对象 */
          const parts = siteF.split('.');
          let o = c.site;
          for (let k = 0; k < parts.length - 1; k++) {
            const key = parts[k];
            if (o[key] == null || typeof o[key] !== 'object') o[key] = (isNaN(+parts[k + 1]) ? {} : []);
            o = o[key];
          }
          return { o: o, k: parts[parts.length - 1] };
        }
        return { o: c.site, k: siteF };
      };
      /* ★ 无变化不落盘：大标题/首页字段此前失焦必提交，重序列化只要有一丝不可见差异
         就多记一步「假步骤」→ 大标题上加粗/斜体后撤销要按两次。与块字段同一守卫根治 */
      const tgt = locateSite();
      if (normTxt(tgt.o[tgt.k]) === txt) { markSaved(); return; }
      tgt.o[tgt.k] = txt;
      LMApp.commit({ silent: true, rerender: false }); markSaved(); return;
    }
    const pgF = el.getAttribute('data-pgf');
    if (pgF) {
      const page = pageOf(); if (!page) return;
      if (normTxt(page[pgF]) === txt) { markSaved(); return; }
      page[pgF] = txt;
      LMApp.commit({ silent: true, rerender: false }); markSaved(); return;
    }
    const f = el.getAttribute('data-bf');
    if (f) {
      const page = pageOf(); if (!page) return;
      const b = page.blocks[+el.getAttribute('data-bi')]; if (!b) return;
      /* ★ 无变化不落盘（修复㉔）：失焦重序列化的文字常与刚保存的源码只差首尾空格 /
         不可见 nbsp —— 原样提交会多记一步「假步骤」，撤销就得按两次。归一化后相同直接跳过 */
      const oldTxt = (function () {
        switch (f) {
          case 'header': return (b.headers || [])[+el.getAttribute('data-c')];
          case 'cell': { const r3 = +el.getAttribute('data-r'), c3 = +el.getAttribute('data-c'); return (b.rows && b.rows[r3]) ? b.rows[r3][c3] : undefined; }
          case 'fname': return (b.items || [])[+el.getAttribute('data-ii')] ? b.items[+el.getAttribute('data-ii')].name : undefined;
          case 'slabel': return (b.items || [])[+el.getAttribute('data-ii')] ? b.items[+el.getAttribute('data-ii')].label : undefined;
          case 'ctitle': return b.title;
          case 'ctext': return b.text;
          default: return b[f];
        }
      })();
      if (normTxt(oldTxt) === txt) { markSaved(); return; }
      switch (f) {
        case 'header': b.headers[+el.getAttribute('data-c')] = txt; break;
        case 'cell': {
          const r = +el.getAttribute('data-r'), ci = +el.getAttribute('data-c');
          if (!b.rows[r]) b.rows[r] = [];
          b.rows[r][ci] = txt; break;
        }
        case 'fname': if (b.items[+el.getAttribute('data-ii')]) b.items[+el.getAttribute('data-ii')].name = txt; break;
        case 'slabel': if (b.items[+el.getAttribute('data-ii')]) b.items[+el.getAttribute('data-ii')].label = txt; break;
        case 'ctitle': b.title = txt; break;
        case 'ctext': b.text = txt; break;
        default: b[f] = txt;
      }
      touchBlock(b); /* 块级后写优先的时间戳（冲突保护，见 collab.js mergeBlocks） */
      LMApp.commit({ silent: true, rerender: false }); markSaved();
    }
  }
  document.addEventListener('focusout', function (e) {
    saveEdited(e.target);
    liveStopEdit();
  });
  /* ★ 编辑期间节流广播（修复㉛）：字段/单元格此前只在失焦时保存 —— 对方一直不点别处，
     本机就一直收不到内容更新（只看得到「正在编辑」徽标）。现在输入停顿 1.2s 或持续输入
     每 3.5s 自动走一遍与失焦完全相同的保存（无变化不落盘，不产生空包）；本机自己输入期间
     远端包照旧挂起（localBusy → pending），不会被对方的重绘打断 */
  var liveEdit = { t1: 0, t2: 0, el: null };
  function liveStopEdit() {
    if (liveEdit.t1) { clearTimeout(liveEdit.t1); liveEdit.t1 = 0; }
    if (liveEdit.t2) { clearInterval(liveEdit.t2); liveEdit.t2 = 0; }
    liveEdit.el = null;
  }
  document.addEventListener('input', function (e) {
    if (!window.LMApp || !LMApp.state.admin) return;
    const el = e.target;
    if (!el || !el.getAttribute || !el.getAttribute('data-edit')) return;
    if (el.classList && el.classList.contains('md-src')) return; /* Markdown 源码框自带实时预览 */
    if (liveEdit.el !== el) {
      liveStopEdit();
      liveEdit.el = el;
      liveEdit.t2 = setInterval(function () {
        if (!liveEdit.el || document.activeElement !== liveEdit.el) { liveStopEdit(); return; }
        saveEdited(liveEdit.el); /* 持续输入也每 3.5s 强制同步一包 */
      }, 3500);
    }
    if (liveEdit.t1) clearTimeout(liveEdit.t1);
    liveEdit.t1 = setTimeout(function () {
      liveEdit.t1 = 0;
      if (liveEdit.el && document.activeElement === liveEdit.el) saveEdited(liveEdit.el); /* 停手 1.2s 保存 */
    }, 1200);
  });
  /* Markdown 源码框失焦 → 自动保存源码 */
  document.addEventListener('focusout', function (e) {
    if (!window.LMApp || !LMApp.state.admin) return;
    const el = e.target;
    if (!el || !el.classList || !el.classList.contains('md-src')) return;
    const b = blockOf(el.closest('.block-wrap'));
    if (b) {
      /* ★ 无变化不落盘：源码框没改字就失焦（去点工具栏/点别处）不再多记一步撤销 */
      if (String(b.text == null ? '' : b.text) === String(el.value == null ? '' : el.value)) { markSaved(); return; }
      b.text = el.value; touchBlock(b); LMApp.commit({ silent: true, rerender: false }); markSaved();
    }
  });
  /* 单行字段：回车直接提交（多行字段 Shift+回车 换行） */
  document.addEventListener('keydown', function (e) {
    if (!window.LMApp || !LMApp.state.admin) return;
    const el = e.target;
    if (!el || !el.getAttribute || !el.getAttribute('data-edit')) return;
    if (e.key === 'Enter' && !e.shiftKey && el.getAttribute('data-line') === '1') {
      e.preventDefault(); el.blur();
    }
  });
  /* 粘贴时只保留纯文字（防止从 Word/网页复制带入乱格式） */
  document.addEventListener('paste', function (e) {
    if (!window.LMApp || !LMApp.state.admin) return;
    const el = e.target;
    if (!el || !el.getAttribute || !el.getAttribute('data-edit')) return;
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, t);
  });
  /* 块级后写优先：被编辑的块打上时间戳（应用远端内容时「谁改这个块更晚谁赢」） */
  function touchBlock(b) { if (b && typeof b === 'object') b._ts = Date.now(); }
  /* 管理模式下，点链接默认不跳转（方便编辑文字）；Ctrl+点击 或点 ↗ 才打开 */
  document.addEventListener('click', function (e) {
    if (!window.LMApp || !LMApp.state.admin) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.getAttribute('href').charAt(0) === '#') return;
    if (!(e.ctrlKey || e.metaKey || e.target.closest('.file-arrow') || e.target.closest('.src-link'))) e.preventDefault();
  });

  /* =========================================================
     Word / WPS 式浮动工具栏（苹果风）
     ========================================================= */
  function activeBlock() {
    if (tb.active == null) return null;
    const page = pageOf(); if (!page) return null;
    return page.blocks[tb.active] || null;
  }
  function imgBlock() {
    if (tb.imgSel == null) return null;
    const page = pageOf(); if (!page) return null;
    return page.blocks[tb.imgSel] || null;
  }
  const FONTS = [
    ['', '字体'],
    ['"Songti SC","SimSun",serif', '宋体'],
    ['"Kaiti SC","KaiTi","STKaiti",serif', '楷体'],
    ['"Heiti SC","SimHei",sans-serif', '黑体'],
    ['"PingFang SC","Microsoft YaHei",sans-serif', '苹方 / 雅黑'],
    ['Georgia,"Times New Roman",serif', 'Georgia'],
    ['"SF Mono",Consolas,monospace', '等宽字体']
  ];
  /* 字体栈 → 行内字体标记 key（@@f:key,..@@）：选中文字改字体时只改选中部分（修复㉔） */
  const FONT_KEYS = {};
  FONTS.forEach(function (f3) {
    const k3 = ({ '宋体': 'song', '楷体': 'kai', '黑体': 'hei', '苹方 / 雅黑': 'yahei', 'Georgia': 'georgia', '等宽字体': 'mono' })[f3[1]];
    if (f3[0] && k3) FONT_KEYS[f3[0]] = k3;
  });
  const SIZES = ['', '13', '15', '17', '19', '22', '26', '32', '40'];
  const COLORS = ['', '#1d1d1f', '#6e6e73', '#0066cc', '#bf3f3f', '#b45309', '#1f7a33', '#8e44ad', '#ec4899'];
  const HLS = ['', '#fff3b0', '#ffe08a', '#ffd6a5', '#caffbf', '#9bf6ff', '#cdb4f6', '#ffc9de'];
  const GRADS = [['', ''], ['1', ''], ['2', ''], ['3', ''], ['4', ''], ['5', ''], ['6', '']];

  function renderToolbar() {
    let bar = document.getElementById('editBar');
    if (!window.LMApp || !LMApp.state.admin) {
      if (bar) bar.remove();
      document.body.classList.remove('multi-mode');
      return;
    }
    if (!bar) { bar = document.createElement('div'); bar.id = 'editBar'; document.body.appendChild(bar); }
    const b = activeBlock();
    const isText = isTextType(b);
    const s = (isText && b.style) ? b.style : (tb.hero ? (heroStyleRef() || {}) : {});
    const tbl = (b && b.type === 'table') ? b : null;
    const ib = imgBlock();
    const tab = tb.tab === 'insert' ? 'insert' : 'start';
    bar.dataset.tab = tab;
    document.body.classList.toggle('multi-mode', !!tb.multi);
    const tHtml = ''
      + '<button class="tb-tab' + (tab === 'start' ? ' act' : '') + '" data-tbtab="start" tabindex="-1">开始</button>'
      + '<button class="tb-tab' + (tab === 'insert' ? ' act' : '') + '" data-tbtab="insert" tabindex="-1">插入</button>'
      + '<span class="tb-grp grp-start">'
      + '<button class="tb-btn" data-tb="undo" tabindex="-1" title="撤销 (Ctrl+Z)"' + (LMApp.canUndo() ? '' : ' disabled') + '>↶</button>'
      + '<button class="tb-btn" data-tb="redo" tabindex="-1" title="重做 (Ctrl+Y)"' + (LMApp.canRedo() ? '' : ' disabled') + '>↷</button>'
      + '<span class="tb-div"></span>'
      + '<button class="tb-btn' + (tb.brushOn ? ' on' : '') + '" data-tb="brush" tabindex="-1" title="格式刷：点一下开启（不会自动关）；已选中带格式的文字时点它 = 直接复制该格式">🖌</button>'
      + '<button class="tb-btn" data-tb="bold" tabindex="-1" title="加粗（先选中文字）"><b>B</b></button>'
      + '<button class="tb-btn" data-tb="italic" tabindex="-1" title="斜体（先选中文字）"><i>I</i></button>'
      + '<button class="tb-btn" data-tb="under" tabindex="-1" title="下划线（先选中文字）"><u>U</u></button>'
      + '<button class="tb-btn" data-tb="strike" tabindex="-1" title="删除线（先选中文字）"><s>S</s></button>'
      + '<button class="tb-btn" data-tb="sup" tabindex="-1" title="上标（先选中文字）">x²</button>'
      + '<button class="tb-btn" data-tb="sub" tabindex="-1" title="下标（先选中文字）">x₂</button>'
      + '<button class="tb-btn" data-tb="clear" tabindex="-1" title="清除格式">⌫</button>'
      + '<button class="tb-btn' + (tb.multi ? ' on' : '') + '" data-tb="multi" tabindex="-1" title="并排排列：先点我进入勾选模式，再点选 2-4 个内容块，然后点「▦ 并排」">☑</button>'
      + (tb.multi ? '<button class="tb-btn wide primary" data-tb="arrange" tabindex="-1" title="把勾选的块并排成一排：上下对齐、左右留缝、高度随内容">▦ 并排 ' + tb.multiSel.length + '</button>' : '')
      + (tb.multi && canUnarrange() ? '<button class="tb-btn wide" data-tb="unarrange" tabindex="-1" title="解除这组并排：恢复各自的标准宽度、按原顺序上下排列（第 1 块贴左、最后 1 块贴右）">⌫ 取消并排</button>' : '')
      + '<span class="tb-div"></span>'
      + tbSelect('font', '字体', FONTS, (s.font || '') === '' ? '' : s.font)
      + tbSelect('fs', '字号', SIZES.map(function (v) { return [v, v === '' ? '字号' : v]; }), s.fs == null ? '' : String(s.fs))
      + '<span class="tb-div"></span>'
      + '<button class="tb-btn" data-tb="aleft" tabindex="-1" title="左对齐">⇤</button>'
      + '<button class="tb-btn" data-tb="acenter" tabindex="-1" title="居中对齐">⇆</button>'
      + '<button class="tb-btn" data-tb="aright" tabindex="-1" title="右对齐">⇥</button>'
      + '<span class="tb-div"></span>'
      + '<button class="tb-btn" data-tb="color" tabindex="-1" title="文字颜色"><b style="color:var(--blue)">A</b></button>'
      + '<button class="tb-btn" data-tb="hl" tabindex="-1" title="高亮"><span class="hl-demo">ab</span></button>'
      + '<button class="tb-btn" data-tb="grad" tabindex="-1" title="渐变色">🌈</button>'
      + '<button class="tb-btn" data-tb="ref" tabindex="-1" title="来源引用：为选中的一句话挂页尾来源，自动编号（可新建或选已有来源）">🔗 来源</button>'
      + '<button class="tb-btn' + (tb.jumpPend && tb.jumpPend.from ? ' jump-pend' : '') + '" data-tb="jump" tabindex="-1" title="条目级跳转：选中文字点我记为「起点」（支持带格式文字和表格单元格；按钮亮起）；再去别处（可跨页面）选中另一段点我记为「终点」→ 建立映射。访客点起点虚线字即跳转；同一起点只能有一个终点（可多跳一）">' + (tb.jumpPend && tb.jumpPend.from ? '⇄ 选终点…' : '⇄ 跳转') + '</button>'
      + '<button class="tb-btn" data-tb="jlist" tabindex="-1" title="⇄ 设置：随时查看全站所有跳转、删除或试跳 —— 不需要选中文字、不用进入跳转模式">⇄ 设置</button>'
      + (tb.jumpPend && tb.jumpPend.from && !tb.jumpPend.to
        ? '<button class="tb-btn" data-tb="jcancel" tabindex="-1" style="color:#d70015" title="取消跳转选择：作废已记的起点、退出跳转选择（Esc 同效）">✕ 取消</button>'
        : '')
      + (tbl
        ? '<span class="tb-div"></span><span class="tb-lab">表格</span>'
          + '<button class="tb-btn" data-tb="row+" tabindex="-1" title="加一行">＋行</button>'
          + '<button class="tb-btn" data-tb="row-" tabindex="-1" title="减一行">−行</button>'
          + '<button class="tb-btn" data-tb="col+" tabindex="-1" title="加一列">＋列</button>'
          + '<button class="tb-btn" data-tb="col-" tabindex="-1" title="减一列">−列</button>'
        : '')
      + (ib
        ? '<span class="tb-div"></span><span class="tb-lab">图片</span>'
          + '<button class="tb-btn" data-tb="crop" tabindex="-1" title="裁剪">裁剪</button>'
          + '<button class="tb-btn" data-tb="border" tabindex="-1" title="边框 / 圆角">边框</button>'
          + '<button class="tb-btn" data-tb="blur" tabindex="-1" title="虚化">虚化</button>'
          + '<button class="tb-btn" data-tb="imgreset" tabindex="-1" title="恢复默认">↺</button>'
        : '')
      + '</span>'
      + '<span class="tb-grp grp-insert">'
      + '<button class="tb-btn" data-tb="undo" tabindex="-1" title="撤销 (Ctrl+Z)"' + (LMApp.canUndo() ? '' : ' disabled') + '>↶</button>'
      + '<button class="tb-btn" data-tb="redo" tabindex="-1" title="重做 (Ctrl+Y)"' + (LMApp.canRedo() ? '' : ' disabled') + '>↷</button>'
      + '<span class="tb-div"></span>'
      + '<button class="tb-btn" data-tb="grid" tabindex="-1" title="插入表格（选大小）">▦ 表格</button>'
      + '<button class="tb-btn" data-tb="imgins" tabindex="-1" title="插入图片（本地 / 链接）">🖼 图片</button>'
      + '<button class="tb-btn" data-tb="mdins" tabindex="-1" title="插入 Markdown 块">📝 Markdown</button>'
      + '<button class="tb-btn" data-tb="boxins" tabindex="-1" title="插入文本框（可拖动缩放）">▢ 文本框</button>'
      + '<button class="tb-btn" data-tb="chartins" tabindex="-1" title="插入图表">📊 图表</button>'
      + '<button class="tb-btn" data-tb="filesins" tabindex="-1" title="插入附件列表">📎 附件</button>'
      + '<button class="tb-btn" data-tb="srcins" tabindex="-1" title="插入来源列表块（页尾参考文献区域）">📑 引用列表</button>'
      + '<button class="tb-btn" data-tb="hrins" tabindex="-1" title="插入分隔线">─ 分隔线</button>'
      + '</span>'
      + '<span class="tb-div"></span>'
      + '<button class="tb-btn wide primary" data-tb="sync" tabindex="-1">☁ 同步</button>';
    /* 内容没变就不重建工具栏：防止下拉刚点开就被重渲染吞掉，也省下每次保存的重建开销 */
    if (bar.__lmHtml !== tHtml) { bar.__lmHtml = tHtml; bar.innerHTML = tHtml; }
    refreshHandles();
    refreshFmtState();
  }

  function isTextType(b) {
    return !!b && (b.type === 'heading' || b.type === 'paragraph' || b.type === 'callout' || b.type === 'md');
  }
  /* 大标题各字段独立样式：点哪行改哪行（顶部小字 / 大标题 / 点题 / 简介 / 页面标题 / 页面说明互不串色） */
  function heroTargetInfo() {
    const c = LMApp.state.content;
    const home = LMApp.state.pageId === 'home';
    if (tb.hero === 'site') {
      const s = c.site;
      const f = tb.heroField || 'title';
      if (f === 'subtitle') return { st: (s.subStyle = s.subStyle || {}), sel: home ? '.hero .eyebrow' : '.page-hero .eyebrow' };
      if (f === 'topic') return { st: (s.topicStyle = s.topicStyle || {}), sel: '.hero .hero-topic' };
      if (f === 'description') return { st: (s.descStyle = s.descStyle || {}), sel: '.hero .hero-desc' };
      return { st: (s.heroStyle = s.heroStyle || {}), sel: '.hero .hero-title' };
    }
    if (tb.hero === 'page') {
      const p = pageOf(); if (!p) return null;
      if (tb.heroField === 'description') return { st: (p.descStyle = p.descStyle || {}), sel: '.page-hero .page-desc' };
      return { st: (p.heroStyle = p.heroStyle || {}), sel: '.page-hero .pg-title' };
    }
    return null;
  }
  /* 当前大标题（首页 / 页面顶部）的样式对象；tb.hero 为 'site' | 'page' | null */
  function heroStyleRef() {
    const t = heroTargetInfo();
    return t ? t.st : null;
  }
  function applyStyle(prop, val2, quiet, preview) {
    let st, hostEl = null;
    /* 大标题对齐：存在 page.heroAlign / site.heroAlign，整块生效（与页面管理里的下拉一致） */
    if (tb.hero && prop === 'align') {
      const host = (tb.hero === 'site') ? LMApp.state.content.site : pageOf();
      if (!host) { LMApp.toast('请先点击要修改的大标题文字'); return; }
      host.heroAlign = val2 || '';
      LMApp.commit({ silent: true });
      if (!quiet) LMApp.toast('标题对齐：' + (val2 === 'left' ? '居左' : (val2 === 'right' ? '居右' : '居中')));
      return;
    }
    if (tb.hero) {
      const ht = heroTargetInfo();
      if (!ht) { LMApp.toast('请先点击要修改的大标题文字'); return; }
      st = ht.st;
      hostEl = document.querySelector(ht.sel);
    } else {
      let b = activeBlock();
      /* 兜底：刚拖完框 / 点过框体但文字未聚焦时，用最近一次点选的块 —— 否则字号/颜色“点了没反应” */
      if (!b && tb.pressBi != null && pageOf()) b = pageOf().blocks[tb.pressBi];
      if (!b || !isTextType(b)) { LMApp.toast('请先点击要修改的文字（标题/段落/提示框/Markdown/大标题）'); return; }
      /* 编辑互斥：这块正被别人编辑且未确认共同编辑 → 弹「某某人正在编辑」确认框，确认后自动重试 */
      if (tb.active != null && window.LMCollab && LMCollab.coEditAsk) {
        const lkA = LMCollab.lockInfoFor ? LMCollab.lockInfoFor(tb.active) : null;
        if (lkA) { LMCollab.coEditAsk(tb.active, function () { applyStyle(prop, val2, quiet); }); return; }
      }
      if (!b.style) b.style = {};
      st = b.style;
      touchBlock(b); /* 工具栏改样式同样计入块级后写优先 */
    }
    st[prop] = val2;
    /* Word 式静默更新：字体/字号/颜色/对齐直接改 DOM 不重绘；渐变/高亮涉及结构 → 无动画重绘。
       preview=true：只改 DOM 与数据、不提交不提示 —— 自定义取色拖动时用，确认(change)后才记一步撤销 */
    if (prop === 'grad' || prop === 'hl') {
      if (!preview) LMApp.commit({ silent: true });
    } else if (tb.hero) {
      if (hostEl) {
        if (prop === 'font') hostEl.style.fontFamily = val2 ? String(val2).replace(/"/g, "'") : '';
        else if (prop === 'fs') hostEl.style.fontSize = val2 ? (+val2) + 'px' : '';
        else if (prop === 'color') {
          hostEl.style.color = (val2 && !st.grad) ? val2 : '';
          hostEl.style.webkitTextFillColor = (val2 && !st.grad) ? val2 : '';
        }
      }
      if (!preview) LMApp.commit({ silent: true, rerender: false });
    } else {
      syncBlockDom();
      if (!preview) LMApp.commit({ silent: true, rerender: false });
    }
    if (!quiet && !preview) LMApp.toast(val2 === '' ? '已清除' : '已应用');
  }

  /* ---------- Word 式行内格式（选中文字 → 加粗/斜体/下划线/删除线/上下标） ---------- */
  const MARKS = {
    bold: ['**', '**'], italic: ['*', '*'], under: ['__', '__'],
    strike: ['~~', '~~'], sup: ['^', '^'], sub: ['~', '~'], mark: ['==', '==']
  };
  /* 选区所在表格单元格 / 表头（支持在表格里直接加粗、高亮、变色） */
  function selCell() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let n = sel.anchorNode;
    while (n && n !== document.body) {
      if (n.getAttribute && n.getAttribute('data-bf') === 'cell') {
        const b = blockOf(n.closest('.block-wrap'));
        if (!b || !b.rows) return null;
        const r = +n.getAttribute('data-r'), c = +n.getAttribute('data-c');
        if (!b.rows[r]) return null;
        return { b: b, el: n, r: r, c: c, get: function () { return b.rows[r][c]; }, set: function (v) { b.rows[r][c] = v; } };
      }
      if (n.getAttribute && n.getAttribute('data-bf') === 'header') {
        const b = blockOf(n.closest('.block-wrap'));
        if (!b || !b.headers) return null;
        const c = +n.getAttribute('data-c');
        return { b: b, el: n, r: -1, c: c, get: function () { return b.headers[c]; }, set: function (v) { b.headers[c] = v; } };
      }
      n = n.parentNode;
    }
    return null;
  }
  /* 选区（起点或终点）是否已带该格式——存在即算激活（像 Word 的混合格式判定）。
     用祖先标签检测而不用 queryCommandState：标题本身是粗体，queryCommandState('bold')
     在标题里恒为真，会导致「想加粗却走取消」的误判 */
  function fmtActive(k) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return false;
    const TAGS = {
      bold: ['STRONG', 'B'], italic: ['EM', 'I'], under: ['U'],
      strike: ['S', 'STRIKE', 'DEL'], sup: ['SUP'], sub: ['SUB'], mark: ['MARK']
    };
    const tags = TAGS[k];
    if (!tags) return false;
    const r = sel.getRangeAt(0);
    const ends = [r.startContainer, r.endContainer];
    for (let i = 0; i < ends.length; i++) {
      let n = ends[i];
      while (n && n !== document.body) {
        if (tags.indexOf(n.nodeName) >= 0) return true;
        n = n.parentNode;
      }
    }
    return false;
  }
  /* 工具栏 B/I/U/S/x²/x₂/高亮按钮激活态（选中带格式的文字时按钮亮起） */
  function refreshFmtState() {
    const bar = document.getElementById('editBar');
    if (!bar || !window.LMApp || !LMApp.state.admin) return;
    const pairs = { bold: 'bold', italic: 'italic', under: 'under', strike: 'strike', sup: 'sup', sub: 'sub', hl: 'mark' };
    Object.keys(pairs).forEach(function (btn) {
      const el = bar.querySelector('[data-tb="' + btn + '"]');
      if (el) el.classList.toggle('on', fmtActive(pairs[btn]));
    });
  }
  document.addEventListener('selectionchange', function () {
    if (!window.LMApp || !LMApp.state.admin) return;
    refreshFmtState();
  });
  /* ★ 打字时把光标滚进可视区（修复㉛·手机端）：顶部工具栏展开 + 软键盘把可视区夹得很窄，
     光标常被压在工具栏下面看不见 —— 节流跟随，光标一出可见范围就滚回中间 */
  var caretT = 0;
  document.addEventListener('selectionchange', function () {
    if (!window.LMApp || !LMApp.state.admin) return;
    const el = document.activeElement;
    if (!el || !el.getAttribute || !el.getAttribute('data-edit')) return;
    const now = Date.now(); if (now - caretT < 400) return; caretT = now;
    try {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (!r || (!r.top && !r.bottom)) { el.scrollIntoView({ block: 'center' }); return; }
      const bar = document.getElementById('editBar');
      const top = bar ? bar.getBoundingClientRect().bottom + 8 : 0;
      const bottom = window.innerHeight - 8;
      if (r.top < top || r.bottom > bottom) {
        try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e2) { el.scrollIntoView(); }
      }
    } catch (e) { /* noop */ }
  });
  /* 在文本片段里剥离某标记（处理 ** 与 *、~~ 与 ~ 的嵌套冲突） */
  function stripMark(seg, k) {
    let s = String(seg);
    if (k === 'bold') s = s.split('**').join('');
    else if (k === 'under') s = s.split('__').join('');
    else if (k === 'mark') s = s.split('==').join('');
    else if (k === 'sup') s = s.split('^').join('');
    else if (k === 'italic') { s = s.split('**').join('\u0001'); s = s.split('*').join(''); s = s.split('\u0001').join('**'); }
    else if (k === 'strike') { s = s.split('~~').join('\u0001'); s = s.split('~').join(''); s = s.split('\u0001').join('~~'); }
    else if (k === 'sub') { s = s.split('~~').join('\u0001'); s = s.split('~').join(''); s = s.split('\u0001').join('~~'); }
    return s;
  }
  function stripInline(t) {
    return String(t || '')
      .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1').replace(/~([^~]+)~/g, '$1')
      .replace(/__([^_]+)__/g, '$1').replace(/==([^=]+)==/g, '$1')
      .replace(/\^([^^]+)\^/g, '$1')
      .replace(/@@[#a-zA-Z0-9:]+,/g, '').replace(/@@/g, '')
      .replace(/\[\[r:[a-zA-Z0-9_-]+,/g, '').replace(/\]\]/g, '');
  }
  /* DOM 片段 → Markdown 源码（保留 **、__、~~、==、^、~、@@色@@、[[r:ID,…]] 引用、[文字](链接)、`代码`）。
     直接编辑文字不再丢格式标记：保存时把浏览器生成的 HTML 反向转回源码标记 */
  function htmlToMd(node) {
    let out = '';
    node.childNodes.forEach(function (n) {
      if (n.nodeType === 3) { out += String(n.nodeValue).replace(/\u00A0/g, ' '); return; }
      if (n.nodeType !== 1) return;
      const tg = n.nodeName;
      if (tg === 'BR') { out += '\n'; return; }
      const inner = htmlToMd(n);
      if (tg === 'STRONG' || tg === 'B') { out += '**' + inner + '**'; return; }
      if (tg === 'EM' || tg === 'I') { out += '*' + inner + '*'; return; }
      if (tg === 'U') { out += '__' + inner + '__'; return; }
      if (tg === 'S' || tg === 'STRIKE' || tg === 'DEL') { out += '~~' + inner + '~~'; return; }
      if (tg === 'MARK') {
        /* ★ 带色高亮往返（修复㉚）：mark 自带 background 色 → 还原 ==#hex,文字==（默认黄不写前缀），
           编辑保存不再把彩色高亮打回默认黄 */
        const hb = (n.getAttribute && n.getAttribute('style') || '').match(/background\s*:\s*([^;]+)/);
        const hc = hb ? hb[1].trim() : '';
        out += '==' + (/^#[0-9a-fA-F]{3,8}$/.test(hc) && hc.toLowerCase() !== '#fff3b0' ? hc + ',' : '') + inner + '==';
        return;
      }
      if (tg === 'SUP') { out += '^' + inner + '^'; return; }
      if (tg === 'SUB') { out += '~' + inner + '~'; return; }
      if (tg === 'CODE') { out += '`' + inner + '`'; return; }
      if (tg === 'A') { out += '[' + inner + '](' + (n.getAttribute('href') || '#') + ')'; return; }
      if (n.classList && n.classList.contains('refnum')) return; /* 引用编号不进源码 */
      if (n.classList && n.classList.contains('refmark')) { out += '[[r:' + (n.getAttribute('data-ref') || '') + ',' + inner + ']]'; return; }
      if (n.classList && n.classList.contains('jumplink')) { out += '[[j:' + (n.getAttribute('data-jump') || '') + ',' + inner + ']]'; return; }
      if (n.classList && n.classList.contains('jumpdst')) { out += inner; return; } /* 终点绿线装饰是纯显示层，不进源码 */
      if (n.classList && n.classList.contains('grad')) { /* 渐变 span → 还原 @@gradN,..@@：旧版透传，编辑往返一次渐变就悄悄消失 */
        const g2 = (n.getAttribute('class') || '').match(/(?:^|\s)grad-([1-6])(?:\s|$)/);
        if (g2) { out += '@@grad' + g2[1] + ',' + inner + '@@'; return; }
      }
      if (tg === 'SPAN' && n.getAttribute && n.getAttribute('data-lmf')) { /* 字体 span → 还原 @@f:key,..@@（防编辑往返丢字体，修复㉔） */
        out += '@@f:' + n.getAttribute('data-lmf') + ',' + inner + '@@'; return;
      }
      const sty = n.getAttribute && n.getAttribute('style');
      if (tg === 'SPAN' && sty && /(?:^|;)\s*font-size\s*:/.test(sty)) { /* 字号 span → 还原 @@N,..@@（同上，防往返丢字号） */
        const f2 = sty.match(/font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/i);
        if (f2) { out += '@@' + Math.round(+f2[1]) + ',' + inner + '@@'; return; }
      }
      if (tg === 'SPAN' && sty && /(?:^|;)\s*color\s*:/.test(sty) && !/background/.test(sty)) {
        const m2 = sty.match(/color\s*:\s*([^;]+)/);
        out += '@@' + (m2 ? m2[1].trim() : '#1d1d1f') + ',' + inner + '@@'; return;
      }
      if (tg === 'DIV' || tg === 'P') { out += (out ? '\n' : '') + inner; return; }
      out += inner; /* span.hl 等样式容器与未知标签：透传内容 */
    });
    return out;
  }
  /* 只重刷一个块（或单元格）的文字 HTML，不整页重绘 */
  function refreshTextEl(el, b) {
    const s = b.style || {};
    el.innerHTML = (!s.grad && s.hl)
      ? '<span class="hl" style="background:' + (s.hl || '') + '">' + LMApp.md(b.text || '') + '</span>'
      : LMApp.md(b.text || '');
  }
  /* ★ 找到「承载 b.text 的那个可编辑元素」（B/I/U/清除格式刷新目标）。
     多字段块（提示框 = 标题 + 正文）里，标题在前正文在后——过去固定取第一个，
     结果「选中正文几个字点 B」把整段正文写进了标题行（标题样式又自带加粗 → 全变黑体）。
     现在：① 选区实际所在的 [data-edit] 优先；② 带所选文字的元素次之；③ 缺省取最后一个
     （提示框正文在最后）。单字段块行为不变。 */
  function textElOf(wrap, sel, needle) {
    if (!wrap) return null;
    const all = wrap.querySelectorAll('[data-edit]');
    if (!all.length) return null;
    if (all.length === 1) return all[0];
    try {
      if (sel && sel.rangeCount) {
        const hn = sel.getRangeAt(0).startContainer;
        const host2 = hn.nodeType === 1 ? hn : hn.parentNode;
        const cand = host2 && host2.closest ? host2.closest('[data-edit]') : null;
        if (cand && wrap.contains(cand)) return cand;
      }
    } catch (err) { /* 选区不可用就走下面的回退 */ }
    const nd = String(needle || '').replace(/\u00A0/g, ' ');
    if (nd) {
      for (let i = 0; i < all.length; i++) {
        if (String(all[i].textContent || '').replace(/\u00A0/g, ' ').indexOf(nd) >= 0) return all[i];
      }
    }
    return all[all.length - 1];
  }
  /* 把当前块的文字样式直接同步到 DOM（免整页重绘，Word 式静默更新） */
  function syncBlockDom() {
    const b = activeBlock();
    if (!b) return;
    const wrap = document.querySelector('.block-wrap[data-idx="' + tb.active + '"]');
    if (!wrap) return;
    const host = wrap.querySelector('.callout') || wrap.querySelector('[data-edit]') || wrap;
    const s = b.style || {};
    host.style.fontFamily = s.font ? String(s.font).replace(/"/g, "'") : '';
    host.style.fontSize = s.fs ? (+s.fs) + 'px' : '';
    host.style.textAlign = s.align || '';
    host.style.color = (s.color && !s.grad) ? s.color : '';
    host.style.webkitTextFillColor = (s.color && !s.grad) ? s.color : '';
  }
  /* 把选区“接回来”：工具栏操作会重写块的 innerHTML（Word 式静默更新），选区会随之丢失；
     按文字内容在新 DOM 里找到同一段文字并恢复选区 ——
     这样选中一次就可以连续点 B / I / U / 颜色 等多个按钮，不用每改一个属性就重新选一次 */
  function restoreSelectionIn(el, needle) {
    try {
      const target = String(needle || '').replace(/\u00A0/g, ' ');
      if (!el || !target) return;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
      let node, full = '';
      const map = [];
      while ((node = walker.nextNode())) {
        map.push({ n: node, at: full.length });
        full += String(node.nodeValue).replace(/\u00A0/g, ' ');
      }
      const s0 = full.indexOf(target);
      if (s0 < 0) return;
      const e0 = s0 + target.length;
      const rng = document.createRange();
      let gotS = false;
      for (let i = 0; i < map.length; i++) {
        const m = map[i];
        const len = String(m.n.nodeValue).replace(/\u00A0/g, ' ').length;
        const a = m.at, z = m.at + len;
        if (!gotS && s0 >= a && s0 <= z) { rng.setStart(m.n, s0 - a); gotS = true; }
        if (e0 >= a && e0 <= z) { rng.setEnd(m.n, e0 - a); break; }
      }
      if (!gotS) return;
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(rng);
    } catch (err) { /* 恢复失败不影响已保存的结果 */ }
  }
  function applyInline(k, forceOn, forceBi) {
    const m = MARKS[k];
    if (!m) return false;
    const sel = window.getSelection();
    const ta = document.activeElement;
    if (ta && ta.classList && ta.classList.contains('md-src')) {
      const v = ta.value, a = ta.selectionStart, z = ta.selectionEnd;
      ta.value = v.slice(0, a) + m[0] + v.slice(a, z) + m[1] + v.slice(z);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
      return true;
    }
    if (tb.hero) {
      const tf = tb.heroTextField || tb.heroField; /* 文本字段（data-hf 只影响样式目标，不影响文字存哪） */
      const host = (tb.hero === 'site') ? LMApp.state.content.site : pageOf();
      if (!host || !tf) { LMApp.toast('请先点击要修改的大标题文字'); return false; }
      const t = String(host[tf] || '');
      let needle = '';
      try { if (sel && sel.rangeCount && !sel.isCollapsed) needle = sel.toString(); } catch (err) { /* noop */ }
      /* 渲染文本里可能是不换行空格(\u00A0)，源文本里是普通空格：等长替换后索引不变 */
      needle = String(needle).replace(/\u00A0/g, ' ');
      const ht = String(t).replace(/\u00A0/g, ' ');
      if (!needle || ht.indexOf(needle) < 0) { LMApp.toast('请先在大标题上按住拖动选中文字，再点格式按钮'); return false; }
      const at = ht.indexOf(needle);
      let nt;
      if (!forceOn && ht.slice(at - m[0].length, at) === m[0] && ht.slice(at + needle.length, at + needle.length + m[1].length) === m[1]) {
        nt = ht.slice(0, at - m[0].length) + needle + ht.slice(at + needle.length + m[1].length);
        LMApp.toast('已取消该格式');
      } else {
        nt = ht.slice(0, at) + m[0] + needle + m[1] + ht.slice(at + needle.length);
        LMApp.toast('已应用');
      }
      host[tf] = nt;
      LMApp.commit({ silent: true });
      return true;
    }
    const cell = selCell();
    const tgt = (forceBi != null) ? forceBi : tb.active;
    const b = cell ? cell.b : (pageOf().blocks[tgt] || activeBlock());
    if (!cell && (!b || !isTextType(b))) { LMApp.toast('请先用鼠标按住拖动选中一段文字（大标题 / 标题 / 段落 / 表格 / Markdown 内），再点格式按钮'); return false; }
    let needle = '';
    try { if (sel && sel.rangeCount && !sel.isCollapsed) needle = sel.toString(); } catch (err) { /* noop */ }
    /* 渲染文本 \u00A0 → 源文本空格；源里可能已带 **、==、@@ 等标记 → indexOf 找不到时
       按「可见字符→源下标」映射定位（修复：带格式文字里再加粗/高亮没反应） */
    needle = String(needle).replace(/\u00A0/g, ' ');
    if (!needle) { LMApp.toast('请先按住拖动选中一段文字，再点格式按钮'); return false; }
    const t = String(cell ? cell.get() : (b.text || '')).replace(/\u00A0/g, ' ');
    const sp = srcSpanOf(t, needle);
    if (!sp) { LMApp.toast('请选中同一块（格）里的文字，再点格式按钮'); return false; }
    const at = sp.s0, e0 = sp.e0, seg = sp.seg;
    let nt;
    if (!forceOn && fmtActive(k)) {
      /* 已带该格式 → 再点一次 = 取消（选区内同类标记一并移除） */
      if (t.slice(at - m[0].length, at) === m[0] && t.slice(e0, e0 + m[1].length) === m[1]) {
        nt = t.slice(0, at - m[0].length) + seg + t.slice(e0 + m[1].length);
      } else {
        nt = t.slice(0, at) + stripMark(seg, k) + t.slice(e0);
      }
      LMApp.toast('已取消该格式');
    } else {
      nt = t.slice(0, at) + m[0] + seg + m[1] + t.slice(e0);
      LMApp.toast('已应用');
    }
    if (nt === t) { refreshFmtState(); return true; } /* ★ 无变化不提交：绝不产生「空操作假步骤」 */
    if (cell) {
      cell.set(nt);
      cell.el.innerHTML = LMApp.md(nt);
      restoreSelectionIn(cell.el, needle);
      LMApp.commit({ silent: true, rerender: false });
      markSaved();
    } else {
      b.text = nt;
      const wrap = document.querySelector('.block-wrap[data-idx="' + tgt + '"]');
      /* ★ 修复（提示框标题被正文覆盖）：按「选区实际所在的可编辑元素」刷新，
         不再固定取第一个（提示框第一个是标题行 → 选中正文4个字点B = 整段正文写进标题且全变黑体） */
      const el = textElOf(wrap, sel, needle);
      if (el) { refreshTextEl(el, b); restoreSelectionIn(el, needle); LMApp.commit({ silent: true, rerender: false }); }
      else LMApp.commit({ silent: true });
    }
    refreshFmtState();
    return true;
  }
  function clearFmt() {
    if (tb.hero) {
      const st = heroStyleRef();
      if (st) {
        ['font', 'fs', 'color', 'grad'].forEach(function (k) { delete st[k]; });
        LMApp.commit({ silent: true }); LMApp.toast('已清除标题格式');
      }
      return;
    }
    const sel = window.getSelection();
    let needle = '';
    try { if (sel && sel.rangeCount && !sel.isCollapsed) needle = sel.toString(); } catch (err) { /* noop */ }
    needle = String(needle).replace(/\u00A0/g, ' ');
    const cell = selCell();
    if (cell) {
      const nt = stripInline(cell.get());
      cell.set(nt);
      cell.el.innerHTML = LMApp.md(nt);
      restoreSelectionIn(cell.el, needle);
      LMApp.commit({ silent: true, rerender: false }); markSaved();
      LMApp.toast('已清除格式');
      return;
    }
    const b = activeBlock();
    if (!b || !isTextType(b)) { LMApp.toast('请先点击要清除格式的文字'); return; }
    b.text = stripInline(b.text);
    b.style = {};
    const wrap = document.querySelector('.block-wrap[data-idx="' + tb.active + '"]');
    const el = textElOf(wrap, sel, needle); /* ★ 同 applyInline：多字段块按选区定位，别刷到标题上 */
    if (el) { refreshTextEl(el, b); syncBlockDom(); restoreSelectionIn(el, needle); LMApp.commit({ silent: true, rerender: false }); }
    else LMApp.commit({ silent: true });
    LMApp.toast('已清除格式');
  }
  /* 表格单元格里直接上颜色 / 高亮 / 渐变（选中格内文字 → 色板），返回是否命中单元格 */
  function applyInlineSwatch(prop, v, preview) {
    const cell = selCell();
    if (!cell) return false;
    let cellBi = null;
    try { const cw = cell.el.closest('.block-wrap[data-idx]'); if (cw) cellBi = +cw.getAttribute('data-idx'); } catch (err) { /* noop */ }
    const needle = selTextOf(cellBi); /* 选区被点色板/下拉清掉时用记住的上一次拖选 */
    const t = String(cell.get() || '').replace(/\u00A0/g, ' ');
    const sp = needle ? srcSpanOf(t, needle) : null;
    if (!sp) { LMApp.toast('请先选中同一单元格里的文字，再选样式'); return true; }
    const s0 = sp.s0, e0 = sp.e0, seg = sp.seg;
    const w = walkInline(t);
    /* 骑跨引用/链接/已有跳转或颜色标记 → 拒绝（防坏源码），与块级行内同一保守策略 */
    const cross = w.toks.some(function (k) { return k.b > s0 && k.a < e0 && (k.t === 'ref' || k.t === 'jump' || k.t === 'link'); });
    if (cross || !pairCheck(w.toks, s0, e0)) { LMApp.toast('选区骑跨了引用/链接/跳转或颜色标记，请调整选区'); return true; }
    const wrapTok = function (type, open, close) { /* 先剥选区内同类标记再包新标记；★ 只包选区，不向外扩展 */
      /* 旧版在这里「向外扩展完整包裹选区的 @@ 配对」再整体重包 —— 结果选区外的文字也被拖进
         新标记，用户看到「明明只画了一个词，整段都变色」。现在 md.js 已支持嵌套渲染（自内向外
         循环解析），直接只包选区即可：外层字号/渐变原样保留、互不干扰，也不再产生泄漏乱码 */
      const r = stripToks(t, w.toks, s0, e0, type === '@@' ? ['@@o', '@@c'] : [type]);
      return r.text.slice(0, r.s) + open + r.text.slice(r.s, r.e) + close + r.text.slice(r.e);
    };
    let nt, msg;
    if (prop === 'hl') {
      if (t.slice(s0 - 2, s0) === '==' && t.slice(e0, e0 + 2) === '==') { nt = t.slice(0, s0 - 2) + seg + t.slice(e0 + 2); msg = '已清除高亮'; }
      else if (v === '') { nt = t.slice(0, s0) + stripInline(seg) + t.slice(e0); msg = '已清除高亮'; }
      else { nt = wrapTok('hl', '==', '=='); msg = '已高亮'; }
    } else if (prop === 'grad') {
      const gm = (t.slice(0, s0).match(/@@grad[1-6],$/) || [])[0];
      if (gm && t.slice(e0, e0 + 2) === '@@') { nt = t.slice(0, s0 - gm.length) + seg + t.slice(e0 + 2); msg = '已清除渐变'; }
      else if (v === '') { nt = t.slice(0, s0) + stripInline(seg) + t.slice(e0); msg = '已清除渐变'; }
      else { nt = wrapTok('@@', '@@' + v + ',', '@@'); msg = '已上渐变'; }
    } else { /* color */
      const om = (t.slice(0, s0).match(/@@[#a-zA-Z][#a-zA-Z0-9]*,$/) || [])[0];
      if (om && t.slice(e0, e0 + 2) === '@@') { nt = t.slice(0, s0 - om.length) + seg + t.slice(e0 + 2); msg = '已清除颜色'; }
      else if (v === '') { nt = t.slice(0, s0) + stripInline(seg) + t.slice(e0); msg = '已清除颜色'; }
      else { nt = wrapTok('@@', '@@' + v + ',', '@@'); msg = '已变色'; }
    }
    cell.set(nt);
    cell.el.innerHTML = LMApp.md(nt);
    restoreSelectionIn(cell.el, needle);
    if (!preview) { /* 预览模式：数据已改但不提交/不记撤销/不提示，等确认后统一补一步 */
      LMApp.commit({ silent: true, rerender: false });
      markSaved();
      LMApp.toast(msg + '（仅选中文字）');
    }
    return true;
  }
  /* ★ 选区定位（配合 applyInlineSwatchBlock）：
     选区文字来自渲染后的 DOM（不含任何标记），而源文本里可能已带 **、==、@@色,@@ 标记
     （如源是 '==旧高亮=='，用户看到的选区是 '旧高亮'）。直接 indexOf 会找不到而回退成
     整段改样式——正是本次要修的 bug。这里逐字跳过标记，记录「可见字符 → 源下标」映射。 */
  function walkInline(t, depth) {
    depth = depth || 0;
    const RULES = [
      ['ref', /^\[\[r:[a-zA-Z0-9_-]+,([^\]]*)\]\]/],
      ['jump', /^\[\[j:[a-zA-Z0-9_-]+,([\s\S]*?)\]\]/],
      ['link', /^\[([^\]]*)\]\([^()]*\)/],
      ['@@o', /^@@[#a-zA-Z0-9]+,/],
      ['@@c', /^@@/],
      ['hl', /^==/],
      ['bold', /^\*\*/], ['em', /^\*/], ['u', /^__/], ['s', /^~~/],
      ['sup', /^\^/], ['sub', /^~/], ['code', /^`/]
    ];
    const map = [], toks = [];
    function rec(str, base) {
      let i = 0, hlOpen = false; /* ★ hl 线性开闭状态（与 md.js 渲染配对一致）：开标记可带 #hex, 色值前缀 */
      while (i < str.length) {
        const rest = str.slice(i);
        let hit = null;
        for (let r = 0; r < RULES.length; r++) { const m = rest.match(RULES[r][1]); if (m) { hit = { t: RULES[r][0], m: m }; break; } }
        if (hit) {
          let len = hit.m[0].length;
          /* ★ 带色高亮（修复㉚）：== 开标记紧跟 #hex, 前缀 → 并入开 tok（前缀不进可见字符），
             选区文字匹配 / 换色 / 清除都以 tok 边界为准，与 md.js 的线性配对一致 */
          if (hit.t === 'hl' && !hlOpen) {
            const pv = rest.slice(2).match(/^(#[0-9a-fA-F]{3,8}),/);
            if (pv) len = 2 + pv[0].length;
          }
          if (hit.t === 'hl') hlOpen = !hlOpen;
          toks.push({ a: base + i, b: base + i + len, t: hit.t });
          /* 引用/跳转/链接的「内部文字」递归下钻：里层的 **、==、@@ 也按标记跳过，
             这样「跳转里带格式」「格式里选字」都能拿到正确的 可见字符→源下标 映射 */
          if (depth < 6 && (hit.t === 'ref' || hit.t === 'jump' || hit.t === 'link')) {
            const inner = hit.m[1];
            const pre = base + i + hit.m[0].length - inner.length - (hit.t === 'link' ? 1 : 2);
            rec(inner, pre);
          }
          i += len;
          continue;
        }
        map.push(base + i);
        i += 1;
      }
    }
    rec(t, 0);
    return { map: map, toks: toks };
  }
  /* 选区文字 → 源码位置：先直接 indexOf（纯文字最快），失败则按「可见字符→源下标」映射
     （源里可能已带 **、==、@@色@@、[[j:]] 等标记 —— 渲染后的选区文字不含标记字符） */
  function srcSpanOf(t, needle) {
    const at = t.indexOf(needle);
    if (at >= 0) return { s0: at, e0: at + needle.length, seg: needle };
    const w = walkInline(t);
    const vis = w.map.map(function (i2) { return t.charAt(i2); }).join('');
    const vi = vis.indexOf(needle);
    if (vi < 0) return null;
    const s0 = w.map[vi];
    const e0 = w.map[vi + needle.length - 1] + 1;
    return { s0: s0, e0: e0, seg: t.slice(s0, e0) };
  }
  /* @@ 开闭配对检查：开标记在选区外而闭标记落在选区内（或反之）→ 剥除会失衡，放弃行内 */
  function pairCheck(toks, s, e) {
    const stack = [];
    for (let i = 0; i < toks.length; i++) {
      const k = toks[i];
      if (k.t === '@@o') stack.push(k);
      else if (k.t === '@@c' && stack.length) {
        const o = stack.pop();
        if ((o.a < s && k.a >= s && k.a < e) || (o.a >= s && o.a < e && k.a >= e)) return false;
      }
    }
    return true;
  }
  /* ★ 安全规则（配合 applyInlineSwatchBlock）：
     - 选区与任何标记「骑跨」→ 回退整段（绝不产生坏源码 / 游离标记）；加粗等 SYM 标记
       骑跨时先把选区扩展到完整包含该标记再包裹（见 applyInlineSwatchBlock 开头）
     - 选区紧贴 == / @@ 标记但不是完整包裹 → 回退整段（标记配对会被换位打散）
     - 颜色/渐变包最外层（md.js 最后处理 @@），内部完整标记对可共存；
       高亮 == 在 md.js 里晚于加粗等处理（加粗/斜体等先渲染、== 后渲染），== 内嵌套标记
       正常解析 —— 选区内完整包含的标记可共存（旧版一律回退整段是过虑，已放宽） */
  /* 从 t 的 [s,e) 里剥掉指定类型的标记 token（返回新文本与平移后的坐标） */
  function stripToks(t, toks, s, e, types) {
    const rm = toks.filter(function (k) { return types.indexOf(k.t) >= 0 && k.a >= s && k.b <= e; })
      .sort(function (x, y) { return y.a - x.a; });
    let out = t, cut = 0;
    rm.forEach(function (k) { out = out.slice(0, k.a) + out.slice(k.b); cut += k.b - k.a; });
    return { text: out, s: s, e: e - cut };
  }
  /* ★ 块内选区的行内颜色 / 高亮 / 渐变：只改选中文字，不改整段（返回 true = 已按行内处理）。
     color → @@色值,选区@@；grad → @@gradN,选区@@（md.js 渲染为渐变 span）；hl → ==选区==。
     与 **加粗**、*斜体* 等标记自由嵌套；对同一选区重复点同一色 = 取消；选区内旧颜色/旧高亮
     先剥掉再包新标记，避免 @@ 与 == 嵌套破坏解析；选区骑跨已有标记时回退整段（不出坏源码）。
     没有选中文字时返回 false → 交给整块 applyStyle（保持老行为：点一下块改整段）。 */
  function applyInlineSwatchBlock(prop, v, preview) {
    if (tb.hero) return false; /* 大标题字段保持整块样式体系 */
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return false;
    const pg = pageOf();
    const b = (pg && pg.blocks && pg.blocks[tb.active]) || activeBlock();
    if (!b || !isTextType(b) || b.type === 'md') return false;
    let needle = '';
    try { needle = sel.toString(); } catch (err) { /* noop */ }
    needle = String(needle).replace(/\u00A0/g, ' ');
    if (!needle) return false;
    const t = String(b.text || '').replace(/\u00A0/g, ' ');
    const w = walkInline(t);
    const vis = w.map.map(function (i2) { return t.charAt(i2); }).join('');
    const vi = vis.indexOf(needle);
    if (vi < 0) return false;
    let s0 = w.map[vi];
    let e0 = w.map[vi + needle.length - 1] + 1; /* ★ 最后一个选中字符的源结尾（紧贴其后的闭合 @@/== 才能被边界检测到） */
    const SYM = ['hl', 'bold', 'em', 'u', 's', 'sup', 'sub'];
    /* ★ 选区边界切在加粗/斜体/高亮等标记中间（如从加粗词中间开始拖选）→ 自动扩展到完整
       包含该标记。旧版不扩展：跨着标记边界的选区一律静默 return false 交给整段
       applyStyle ——「选中带加粗的词再高亮，整个文本框都被高亮」「跨加粗/非加粗设色失败」
       两个 bug 都从这里来。@@ 颜色/字号标记不在此扩展（见下方外层包裹扩展）。
       md.js 渲染加粗/斜体等先于 ==、@@ 自内向外循环，扩展后 == / @@ 内嵌套加粗等标记
       都能正常解析 */
    w.toks.forEach(function (k) {
      if (SYM.indexOf(k.t) < 0) return;
      if (k.b > s0 && k.a < e0 && (k.a < s0 || k.b > e0)) { s0 = Math.min(s0, k.a); e0 = Math.max(e0, k.b); }
    });
    /* ★ 外层 hl / @@ 包裹「骑跨」选区（开标记在选区前、闭标记在选区后）→ 把选区扩展到该
       包裹的完整范围，随后 stripToks 会把（现已完整包含的）外层对剥掉再包新标记 —— 全程
       无嵌套。修复㉖⑦放宽后踩过的坑：外层已 ==…== 时在其内部再包 == / @@，md.js 的 ==
       配对是线性最近闭合、@@ 的 [^@]+ 会被内层开标记截断，嵌套必然错配 →「选中的不高亮、
       没选中的高亮」「调色后冒出可见 ==」全是它。配对方式与 md.js 一致：hl 单槽交替
       （线性最近闭合），@@ 用 @@o/@@c 栈配对 */
    (function () {
      var openHl = null, stAt = [], pairs = [];
      w.toks.forEach(function (k) {
        if (k.t === 'hl') { if (openHl === null) { openHl = k; } else { pairs.push([openHl, k]); openHl = null; } }
        else if (k.t === '@@o') stAt.push(k);
        else if (k.t === '@@c' && stAt.length) pairs.push([stAt.pop(), k]);
      });
      pairs.forEach(function (p) {
        if (p[0].a < s0 && p[1].b > e0) { s0 = p[0].a; e0 = p[1].b; }
      });
    })();
    const inter = w.toks.filter(function (k) { return k.b > s0 && k.a < e0; }); /* 与选区相交的标记 */
    const touchHl = w.toks.some(function (k) { /* 紧贴选区边界的 ==/@@（非完整包裹）→ 配对会被打散 */
      if (k.a >= s0 && k.b <= e0) return false;
      if (k.t === '@@o' && k.b === s0) return true;  /* 开标记贴左：选区在其内部，包裹会嵌套 @@ */
      if (k.t === '@@c' && k.a === e0) return true;  /* 闭标记贴右：选区在其内部（且未按完整包裹处理） */
      if (k.t === 'hl' && (k.b === s0 || k.a === e0)) return true; /* == 自由配对，保守拒绝 */
      return false;
    });
    const splitSym = SYM.some(function (ty) { /* 同类标记一半在选区内一半在外 → 换位打散 */
      const ks = w.toks.filter(function (k) { return k.t === ty && k.b >= s0 && k.a <= e0; });
      return ks.some(function (k) { return k.a < s0 || k.b > e0; }) && ks.some(function (k) { return k.a >= s0 && k.b <= e0; });
    });
    /* ★ hlWrapped 用 tok 线性配对检测（修复㉚）：带色高亮的开 tok 是 ==#hex,（不止 2 字符），
       旧版 t.slice(s0-2,s0)==='==' 对它失效 —— 相邻两个 hl tok（开紧贴选区左、闭紧贴选区右）
       即为「选区正好是高亮内容」，与 md.js 的线性最近闭合配对一致 */
    const hlToks = w.toks.filter(function (k) { return k.t === 'hl'; });
    let hlWrapPair = null;
    for (let ki = 0; ki + 1 < hlToks.length; ki++) {
      if (hlToks[ki].b === s0 && hlToks[ki + 1].a === e0) { hlWrapPair = { o: hlToks[ki], c: hlToks[ki + 1] }; break; }
    }
    const hlWrapped = !!hlWrapPair;
    const open = t.lastIndexOf('@@', s0 - 1);
    /* 色值须以 # 或字母开头（纯数字是字号标记 @@28,x@@，换色会丢字号 → 走回退） */
    const atWrapped = open >= 0 && t.slice(e0, e0 + 2) === '@@' && /^[#a-zA-Z][#a-zA-Z0-9]*,$/.test(t.slice(open + 2, s0));
    let nt, msg;
    if (prop === 'hl') {
      if (hlWrapped) { /* 选区正好是 ==…== 的内容：∅ / 同色 = 取消；异色 = 原地换色（只改前缀） */
        const cur = t.slice(hlWrapPair.o.a + 2, hlWrapPair.o.b).replace(/,$/, '');
        if (!v || v === cur) {
          nt = t.slice(0, hlWrapPair.o.a) + t.slice(hlWrapPair.o.b, hlWrapPair.c.a) + t.slice(hlWrapPair.c.b);
          msg = '已清除高亮（仅选中文字）';
        } else {
          nt = t.slice(0, hlWrapPair.o.a + 2) + v + ',' + t.slice(hlWrapPair.o.b, hlWrapPair.c.a) + t.slice(hlWrapPair.c.b);
          msg = '已换高亮颜色';
        }
      } else if (v === '') {
        const rm = inter.filter(function (k) { return k.t === 'hl' && k.a >= s0 && k.b <= e0; });
        if (!rm.length || touchHl || inter.some(function (k) { return k.t === 'hl' && !(k.a >= s0 && k.b <= e0); })) return false;
        nt = stripToks(t, w.toks, s0, e0, ['hl']).text;
        msg = '已清除高亮（仅选中文字）';
      } else {
        /* 与颜色/渐变分支同一保守策略：骑跨任何标记（一半在内一半在外）→ 回退整段；
           完整包含在选区内的标记可共存 —— md.js 里加粗等先渲染、== 后渲染，
           == 内的加粗/斜体正常解析；只剥选区内完整的旧颜色/旧高亮（== 里不能再套 ==）。
           外层 hl/@@ 包裹骑跨的情况已在上方扩展为整个包裹范围（此处不会遇到） */
        if (inter.some(function (k) { return !(k.a >= s0 && k.b <= e0); })) return false;
        if (touchHl || splitSym || !pairCheck(w.toks, s0, e0)) return false;
        const r = stripToks(t, w.toks, s0, e0, ['@@o', '@@c', 'hl']);
        /* ★ 带色包裹（修复㉚）：色值写进 == 前缀（==#hex,文字==），色板 7 色行内全部可用 */
        nt = r.text.slice(0, r.s) + '==' + (v ? v + ',' : '') + r.text.slice(r.s, r.e) + '==' + r.text.slice(r.e);
        msg = '已高亮选中文字';
      }
      /* ★ 行内高亮清干净后，整段底色（b.style.hl）还在会让人以为「清不掉」→ 一并清 */
      if (msg.indexOf('清除高亮') >= 0 && b.style && b.style.hl) {
        b.style.hl = '';
        msg = '已清除高亮（含整段底色）';
      }
    } else {
      const tag = prop === 'grad' ? 'grad' + v : v;
      const kind = prop === 'grad' ? '渐变' : '颜色';
      if (atWrapped && (v === '' || t.slice(open + 2, s0).replace(/,$/, '') === tag)) {
        nt = t.slice(0, open) + t.slice(s0, e0) + t.slice(e0 + 2); /* 同色/清空 → 取消包裹 */
        msg = '已清除' + kind + '（仅选中文字）';
      } else if (atWrapped) { /* 异色 → 原地换色（补回闭合 @@） */
        nt = t.slice(0, open) + '@@' + tag + ',' + t.slice(s0, e0) + '@@' + t.slice(e0 + 2);
        msg = '已换' + kind + '（仅选中文字）';
      } else if (hlWrapped && v !== '') { /* 选区是 ==…== 的内容 → 高亮转颜色/渐变（tok 边界，兼容带色开标记） */
        nt = t.slice(0, hlWrapPair.o.a) + '@@' + tag + ',' + t.slice(hlWrapPair.o.b, hlWrapPair.c.a) + '@@' + t.slice(hlWrapPair.c.b);
        msg = '已对选中文字应用' + kind + '（原高亮转为' + kind + '）';
      } else if (hlWrapped) {
        nt = t.slice(0, hlWrapPair.o.a) + t.slice(hlWrapPair.o.b, hlWrapPair.c.a) + t.slice(hlWrapPair.c.b);
        msg = '已清除高亮（仅选中文字）';
      } else if (v === '') { /* 清除：剥掉完整落在选区内的 @@ 配对 */
        const stack = [], rm = [];
        w.toks.forEach(function (k) {
          if (k.t === '@@o') stack.push(k);
          else if (k.t === '@@c' && stack.length) {
            const o = stack.pop();
            if (o.a >= s0 && o.b <= e0 && k.a >= s0 && k.b <= e0) rm.push(o, k);
          }
        });
        if (!rm.length || touchHl || inter.some(function (k) { return (k.t === '@@o' || k.t === '@@c') && rm.indexOf(k) < 0; })) return false;
        nt = stripToks(t, rm, s0, e0, ['@@o', '@@c']).text;
        msg = '已清除' + kind + '（仅选中文字）';
      } else {
        if (inter.some(function (k) { return !(k.a >= s0 && k.b <= e0); })) return false; /* ref/jump/link 等骑跨 → 回退整段 */
        if (touchHl || splitSym || !pairCheck(w.toks, s0, e0)) return false;
        /* ★ 只包选区；选区内完整的旧颜色/高亮对先剥掉再包新标记（嵌套安全：内层对紧贴
           新外层开标记，md.js 的 [^@]+ 空匹配失败会先消耗内层）。外层包裹骑跨选区的
           情况已在上方整体外扩（= 换掉外层包裹的语义）—— 那种嵌套永不安全：外层
           [^@]+ 内容非空时会抢内层 @@ 的开标记当闭合，配对全线错乱 */
        nt = r.text.slice(0, r.s) + '@@' + tag + ',' + r.text.slice(r.s, r.e) + '@@' + r.text.slice(r.e);
        msg = '已对选中文字应用' + kind;
      }
    }
    b.text = nt;
    const wrap = document.querySelector('.block-wrap[data-idx="' + tb.active + '"]');
    const el = textElOf(wrap, sel, needle);
    if (el) { refreshTextEl(el, b); restoreSelectionIn(el, needle); }
    if (!preview) { /* 预览模式：数据已改但不提交/不记撤销/不提示，等确认后统一补一步 */
      if (el) LMApp.commit({ silent: true, rerender: false });
      else LMApp.commit({ silent: true });
      markSaved();
      LMApp.toast(msg);
    }
    return true;
  }
  /* ★ 块级行内字号 / 字体（修复㉔）：选中文字 → 只改选中部分
     字号存 @@N,..@@（md.js 渲染 font-size span），字体存 @@f:key,..@@（md.js 渲染 data-lmf
     字体 span，htmlToMd 按 data-lmf 还原 → 编辑往返不丢）。同款再点 = 取消、异档原地换、
     骑跨标记保守回退整段；无选中文字返回 false → 走整块 applyStyle（老行为）。
     目标块三级兜底：① 选区所在块 ② 上次拖选记忆的块 ③ 最近点选的块 ——
     「明明选了字却提示要先选中」就此根治 */
  function blockInlineWrap(kind, val) {
    if (tb.hero) return false;
    const sel = window.getSelection();
    const pg = pageOf();
    let bi = null;
    try {
      if (sel && sel.rangeCount && !sel.isCollapsed) {
        const hn = sel.getRangeAt(0).startContainer;
        const hw = (hn.nodeType === 1 ? hn : hn.parentNode).closest('.block-wrap[data-idx]');
        if (hw) bi = +hw.getAttribute('data-idx');
      }
    } catch (e0) { /* noop */ }
    if (bi == null && lastSelInfo.bi != null) bi = lastSelInfo.bi;
    if (bi == null && tb.active != null) bi = tb.active;
    if (bi == null || !pg || !pg.blocks) return false;
    const b = pg.blocks[bi];
    if (!b || !isTextType(b) || b.type === 'md' || typeof b.text !== 'string') return false;
    const needle = selTextOf(bi);
    if (!needle) return false;
    const t = String(b.text || '').replace(/\u00A0/g, ' ');
    const w = walkInline(t);
    const vis = w.map.map(function (i2) { return t.charAt(i2); }).join('');
    const vi = vis.indexOf(needle);
    if (vi < 0) return false;
    const s0 = w.map[vi];
    const e0 = w.map[vi + needle.length - 1] + 1;
    const SYM = ['hl', 'bold', 'em', 'u', 's', 'sup', 'sub'];
    const inter = w.toks.filter(function (k) { return k.b > s0 && k.a < e0; });
    const touchHl = w.toks.some(function (k) {
      if (k.a >= s0 && k.b <= e0) return false;
      if (k.t === '@@o' && k.b === s0) return true;
      if (k.t === '@@c' && k.a === e0) return true;
      if (k.t === 'hl' && (k.b === s0 || k.a === e0)) return true;
      return false;
    });
    const splitSym = SYM.some(function (ty) {
      const ks = w.toks.filter(function (k) { return k.t === ty && k.b >= s0 && k.a <= e0; });
      return ks.some(function (k) { return k.a < s0 || k.b > e0; }) && ks.some(function (k) { return k.a >= s0 && k.b <= e0; });
    });
    const open = t.lastIndexOf('@@', s0 - 1);
    const tag = kind === 'fs' ? String(val) : ('f:' + val);
    const kindCn = kind === 'fs' ? '字号' : '字体';
    const atWrapped = open >= 0 && t.slice(e0, e0 + 2) === '@@' && /^[#a-zA-Z0-9:]+,$/.test(t.slice(open + 2, s0));
    const sameWrapped = atWrapped && t.slice(open + 2, s0).replace(/,$/, '') === tag;
    let nt, msg;
    if (val === '') { /* 默认字号 / 清除字体：剥紧贴包裹，或完整落在选区内的 @@ 配对 */
      if (atWrapped) {
        nt = t.slice(0, open) + t.slice(s0, e0) + t.slice(e0 + 2);
        msg = '已清除' + kindCn + '（仅选中文字）';
      } else {
        const stack = [], rm = [];
        w.toks.forEach(function (k) {
          if (k.t === '@@o') stack.push(k);
          else if (k.t === '@@c' && stack.length) {
            const o2 = stack.pop();
            if (o2.a >= s0 && o2.b <= e0 && k.a >= s0 && k.b <= e0) rm.push(o2, k);
          }
        });
        if (!rm.length || touchHl || inter.some(function (k) { return (k.t === '@@o' || k.t === '@@c') && rm.indexOf(k) < 0; })) return false;
        nt = stripToks(t, rm, s0, e0, ['@@o', '@@c']).text;
        msg = '已清除' + kindCn + '（仅选中文字）';
      }
    } else if (sameWrapped) { /* 同款再点 = 取消 */
      nt = t.slice(0, open) + t.slice(s0, e0) + t.slice(e0 + 2);
      msg = '已清除' + kindCn + '（仅选中文字）';
    } else if (atWrapped) { /* 异档 → 原地换（补回闭合 @@） */
      nt = t.slice(0, open) + '@@' + tag + ',' + t.slice(s0, e0) + '@@' + t.slice(e0 + 2);
      msg = '已改' + kindCn + '（仅选中文字）';
    } else {
      if (inter.some(function (k) { return !(k.a >= s0 && k.b <= e0); })) return false; /* 骑跨 → 回退整段 */
      if (touchHl || splitSym || !pairCheck(w.toks, s0, e0)) return false;
      nt = t.slice(0, s0) + '@@' + tag + ',' + t.slice(s0, e0) + '@@' + t.slice(e0);
      msg = '已应用' + kindCn + (kind === 'fs' ? ' ' + val + 'px' : '') + '（仅选中文字）';
    }
    b.text = nt;
    touchBlock(b);
    const wrap = document.querySelector('.block-wrap[data-idx="' + bi + '"]');
    const el = textElOf(wrap, sel, needle);
    if (el) { refreshTextEl(el, b); restoreSelectionIn(el, needle); }
    LMApp.commit({ silent: true, rerender: false });
    markSaved();
    LMApp.toast(msg);
    return true;
  }
  function applyInlineFsBlock(v) { return blockInlineWrap('fs', v); }
  function applyInlineFontBlock(stackStr) {
    const key = FONT_KEYS[String(stackStr)];
    if (!key) return false;
    return blockInlineWrap('font', key);
  }
  /* 表格单元格里改字号（选中格内文字 → 字号下拉）：以 @@28,文字@@ 标记存进单元格文本（md.js 渲染为对应字号）。
     返回 false = 选区不在单元格内 → 交给块级 applyStyle 处理 */
  function applyInlineFs(v) {
    const cell = selCell();
    if (!cell) return false;
    let cellBi = null;
    try { const cw = cell.el.closest('.block-wrap[data-idx]'); if (cw) cellBi = +cw.getAttribute('data-idx'); } catch (err) { /* noop */ }
    const needle = selTextOf(cellBi); /* 选区被点开下拉的动作清掉时，用记住的上一次拖选 —— 不再要求"重新画字" */
    const t = String(cell.get() || '');
    if (!needle) { LMApp.toast('请先选中单元格里的文字，再选字号'); return true; }
    /* 可见文字 → 源码定位（与颜色/渐变同一套映射）。★ 只在选区外包标记，不向外扩展：
       md.js 已支持嵌套渲染（@@13,@@grad1,字@@@@ → 字号 span 包渐变 span），
       旧版「外扩剥净再重包」会把选区外的文字也改掉字号，已移除 */
    const sp = srcSpanOf(t, needle);
    if (!sp) { LMApp.toast('请先选中单元格里的文字，再选字号'); return true; }
    const s0 = sp.s0, e0 = sp.e0;
    const pre = '@@' + v + ',';
    let nt, msg;
    if (v === '') {
      const bare = t.slice(s0, e0).replace(/@@[#a-zA-Z0-9]+,/g, '').replace(/@@/g, '');
      nt = t.slice(0, s0) + bare + t.slice(e0);
      msg = '已清除字号';
    } else if (t.slice(s0 - pre.length, s0) === pre && t.slice(e0, e0 + 2) === '@@') {
      nt = t.slice(0, s0 - pre.length) + t.slice(s0, e0) + t.slice(e0 + 2);
      msg = '已取消该字号';
    } else {
      nt = t.slice(0, s0) + pre + t.slice(s0, e0) + '@@' + t.slice(e0);
      msg = '已应用字号 ' + v;
    }
    cell.set(nt);
    cell.el.innerHTML = LMApp.md(nt);
    restoreSelectionIn(cell.el, needle);
    LMApp.commit({ silent: true, rerender: false });
    markSaved();
    return true;
  }
  /* ---------- 来源引用：选中一句话 → 🔗来源 → 新建 / 选已有 → 页尾自动编号 → 阅读模式点击跳转 ---------- */
  function sourcesBlockOf(page) {
    let sb = null;
    page.blocks.forEach(function (b) { if (b.type === 'sources') sb = b; });
    return sb;
  }
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* 这句话当前挂在哪个来源上（未引用返回 null） */
  function refWrapOf(b, needle) {
    const t = String(b.text || '');
    const m2 = t.match(new RegExp('\\[\\[r:([a-zA-Z0-9_-]+),' + escRe(needle) + '\\]\\]'));
    if (!m2) return null;
    const sb = sourcesBlockOf(pageOf());
    let hit = null;
    if (sb) (sb.items || []).forEach(function (it) { if (it.id === m2[1]) hit = it; });
    return hit || { label: m2[1] };
  }
  /* 选区记忆：点工具栏按钮等操作把选区清掉时，「来源」仍能用上一次拖选的话 */
  let lastSelInfo = { text: '', bi: null, cell: null };
  document.addEventListener('selectionchange', function () {
    if (!window.LMApp || !LMApp.state.admin) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return;
    const t = sel.toString();
    if (!t.trim()) return;
    let bi = null;
    try {
      const hn = sel.getRangeAt(0).startContainer;
      const hw = (hn.nodeType === 1 ? hn : hn.parentNode).closest('.block-wrap[data-idx]');
      if (hw) bi = +hw.getAttribute('data-idx');
    } catch (e) { /* noop */ }
    /* 连格子坐标一起记：表格里选字后点 ⇄，选区被按钮清掉时 selCell() 拿不到格子，
       兜底恢复时需要这份坐标（否则表格里的字当起点/终点永远报错） */
    let cell = null;
    try { const cc = selCell(); if (cc) cell = { r: (cc.r == null ? -1 : cc.r), c: cc.c }; } catch (e2) { /* noop */ }
    lastSelInfo = { text: t, bi: bi, cell: cell };
  });
  /* 统一取「当前选区文字」：点工具栏按钮 / 展开下拉等动作常把选区清掉（浏览器失焦行为），
     此时回退到 selectionchange 记住的上一次拖选文字（同块内才可信）——
     字号 / 颜色 / 渐变 / 格式刷因此不再出现「明明选过字却让我重新画字」 */
  function selTextOf(bi) {
    const sel = window.getSelection();
    let s = '';
    try { if (sel && sel.rangeCount && !sel.isCollapsed) s = sel.toString(); } catch (err) { /* noop */ }
    if (!String(s).trim() && lastSelInfo.text && (bi == null || lastSelInfo.bi == null || lastSelInfo.bi === bi)) s = lastSelInfo.text;
    return String(s || '').replace(/\u00A0/g, ' ').trim();
  }
  function openRefPop(anchor) {
    const page = pageOf(); if (!page) return;
    const sel = window.getSelection();
    let needle = '';
    try { if (sel && sel.rangeCount && !sel.isCollapsed) needle = sel.toString(); } catch (e) { /* noop */ }
    let bi = null;
    try {
      const hn = sel.getRangeAt(0).startContainer;
      const hw = (hn.nodeType === 1 ? hn : hn.parentNode).closest('.block-wrap[data-idx]');
      if (hw) bi = +hw.getAttribute('data-idx');
    } catch (e2) { /* noop */ }
    if (!needle.trim() && lastSelInfo.text) { needle = lastSelInfo.text; bi = lastSelInfo.bi; } /* 选区被点按钮清掉 → 用记住的 */
    needle = String(needle || '').trim();
    const tb2 = (bi != null) ? page.blocks[bi] : null;
    if (!needle) { LMApp.toast('先按住拖动选中一句话（段落 / 标题 / 提示框 / Markdown / 文本框里），再点「来源」'); return; }
    if (!tb2 || !isTextType(tb2)) { LMApp.toast('「来源」要加在正文内容块里（段落 / 标题 / 提示框 / Markdown / 文本框）；大标题、表格暂不支持'); return; }
    if (needle.indexOf('[') >= 0 || needle.indexOf(']') >= 0) { LMApp.toast('选中的文字里不能包含 [ ] 符号，请重新选择'); return; }
    if (!sourcesBlockOf(page)) {
      page.blocks.push({ type: 'sources', title: '本页来源', items: [], seq: 0 });
      LMApp.commit({ silent: true });
    }
    const sb = sourcesBlockOf(page);
    const cur = refWrapOf(tb2, needle);
    let html = '<h4 class="pop-t">来源引用</h4>'
      + '<div class="pop-note">选中的话：<b>' + esc(needle.slice(0, 24)) + (needle.length > 24 ? '…' : '') + '</b>'
      + (cur ? '<br>当前引用：' + esc(cur.label || '') : '') + '</div>';
    html += '<div class="ref-list">';
    (sb.items || []).forEach(function (it, ii) {
      html += '<button type="button" class="ref-item' + (cur && cur.id === it.id ? ' on' : '') + '" data-rref="' + esc(it.id) + '">'
        + '<span class="ref-n">' + (ii + 1) + '</span>' + esc(it.label || '') + '</button>'
        /* 点条目 = 展开操作行（✔ 使用 / ✕ 删除），不再一点就直接套用 —— 想删除不再困难 */
        + '<div class="ref-ops" data-rops="' + esc(it.id) + '">'
        + '<button type="button" class="btn btn-mini" data-ruse="' + esc(it.id) + '">✔ 使用这条</button>'
        + '<button type="button" class="btn btn-mini danger" data-rdel="' + esc(it.id) + '">✕ 删除这条</button></div>';
    });
    if (!(sb.items || []).length) html += '<div class="pop-note muted">还没有来源，在下面新建一条：</div>';
    html += '</div>';
    if (cur) html += '<button type="button" class="btn btn-mini danger" id="refRemove" style="margin:2px 0 8px">✕ 移除这句的引用</button>';
    html += '<div class="ref-new"><input class="input" id="refLabel" placeholder="来源名称（如：Vaswani 等, 2017）">'
      + '<input class="input" id="refUrl" placeholder="链接 / 文献说明（可留空）">'
      + '<button type="button" class="btn btn-mini" id="refAdd">＋ 创建并引用</button></div>';
    popover(anchor, html, function (root) {
      const showOps = function (id) {
        const ops = root.querySelector('[data-rops="' + id + '"]');
        const wasOpen = ops && ops.classList.contains('open');
        root.querySelectorAll('.ref-ops').forEach(function (n) { n.classList.remove('open'); });
        if (ops && !wasOpen) ops.classList.add('open');
      };
      root.querySelectorAll('[data-rref]').forEach(function (bt) {
        bt.addEventListener('click', function () { showOps(bt.getAttribute('data-rref')); });
      });
      root.querySelectorAll('[data-ruse]').forEach(function (bt) {
        bt.addEventListener('click', function () { applyRefInline(bi, needle, bt.getAttribute('data-ruse')); closePop(); });
      });
      root.querySelectorAll('[data-rdel]').forEach(function (bt) {
        bt.addEventListener('click', function () {
          const id = bt.getAttribute('data-rdel');
          const it = (sb.items || []).find(function (x) { return x.id === id; });
          deleteRefItem(sb, id, it ? it.label : '');
          closePop();
        });
      });
      const ra = root.querySelector('#refAdd');
      if (ra) ra.addEventListener('click', function () {
        const label = root.querySelector('#refLabel').value.trim();
        if (!label) { LMApp.toast('请填写来源名称'); return; }
        sb.seq = (sb.seq || 0) + 1;
        const id = 'r' + sb.seq;
        sb.items.push({ id: id, label: label, url: root.querySelector('#refUrl').value.trim() });
        applyRefInline(bi, needle, id);
        closePop();
      });
      const rr = root.querySelector('#refRemove');
      if (rr) rr.addEventListener('click', function () { applyRefInline(bi, needle, null); closePop(); });
    });
  }
  /* 删除一条来源：列表移除 + 全站把已挂的这条引用还原成普通文字（不留 "? " 编号） */
  function deleteRefItem(sb, id, label) {
    sb.items = (sb.items || []).filter(function (x) { return x.id !== id; });
    const re = new RegExp('\\[\\[r:' + id + ',([\\s\\S]*?)\\]\\]');
    (LMApp.state.content.pages || []).forEach(function (p) {
      (p.blocks || []).forEach(function (b) {
        if (!b) return;
        if (typeof b.text === 'string' && re.test(b.text)) { b.text = b.text.replace(re, '$1'); return; }
        if (b.type === 'table') {
          (b.headers || []).forEach(function (h, i2) { if (typeof h === 'string' && re.test(h)) b.headers[i2] = h.replace(re, '$1'); });
          (b.rows || []).forEach(function (r, ri) { (r || []).forEach(function (c2, ci) { if (typeof c2 === 'string' && re.test(c2)) r[ci] = c2.replace(re, '$1'); }); });
        }
      });
    });
    LMApp.commit({ silent: true });
    LMApp.toast('已删除来源「' + (label || id) + '」，引用处已还原为普通文字');
  }
  function applyRefInline(bi, needle, refId) {
    const page = pageOf(); const b = page.blocks[bi];
    if (!b || !isTextType(b)) return;
    const t = String(b.text || '');
    const at = t.indexOf(needle);
    if (at < 0) { LMApp.toast('请选中同一块里的文字'); return; }
    const re = new RegExp('\\[\\[r:[a-zA-Z0-9_-]+,' + escRe(needle) + '\\]\\]');
    let nt;
    if (refId == null) {
      if (!re.test(t)) { LMApp.toast('这句话还没有引用'); return; }
      nt = t.replace(re, needle);
      LMApp.toast('已移除这句的引用');
    } else if (re.test(t)) {
      nt = t.replace(re, '[[r:' + refId + ',' + needle + ']]');
      LMApp.toast('已改挂到新来源，页尾自动编号');
    } else {
      nt = t.slice(0, at) + '[[r:' + refId + ',' + needle + ']]' + t.slice(at + needle.length);
      LMApp.toast('已添加引用，页尾自动编号');
    }
    b.text = nt;
    LMApp.commit({ silent: true });
  }

  /* ---------- 条目级跳转（起点 ⇄ 终点映射，支持跨页面） ----------
     · 选中文字点「⇄ 跳转」→ 记为起点，气泡自动关；再到别处（可跨页面）选中另一段点「⇄ 跳转」→ 记为终点并弹出确认
     · 建立 = 起点文字包 [[j:ID,…]] 行内标记（回到那页渲染成绿色虚线可点字）+ 全站映射表 state.content.jumps
     · 规则：同一起点只能有一个终点（重复建立 = 更新目标 → 天然不存在“一跳多”）；多个起点指向同一终点（多跳一）允许
     · 访客点起点文字平滑滚到终点块并闪光；管理员模式 Ctrl/Cmd+点 试跳（普通点击仍是编辑） */
  /* 表格单元格里按可见文字定位格子（r=-1 → 表头）：点 ⇄ 按钮瞬间选区被清、selCell()
     拿不到格子时，用「选过的文字」反查它落在哪一格 —— 表格里的字当跳转起点/终点不再失败 */
  function findCellByText(page, bi, needle) {
    const b = page && page.blocks ? page.blocks[bi] : null;
    if (!b || b.type !== 'table') return null;
    const probe = function (src) {
      if (typeof src !== 'string' || !src) return false;
      try { return !!srcSpanOf(src.replace(/\u00A0/g, ' '), needle); } catch (e0) { return false; }
    };
    const hs = Array.isArray(b.headers) ? b.headers : [];
    for (let c = 0; c < hs.length; c++) { if (probe(hs[c])) return { r: -1, c: c }; }
    const rows = Array.isArray(b.rows) ? b.rows : [];
    for (let r = 0; r < rows.length; r++) {
      const row = Array.isArray(rows[r]) ? rows[r] : [];
      for (let c2 = 0; c2 < row.length; c2++) { if (probe(row[c2])) return { r: r, c: c2 }; }
    }
    return null;
  }
  function jumpPageLabel(pid) {
    const p = (LMApp.state.content.pages || []).find(function (x) { return x.id === pid; });
    return p ? (p.label || p.title || p.id) : (pid === 'home' ? '首页' : pid);
  }
  function jumpSelInfo() {
    const page = pageOf(); if (!page) return null;
    const sel = window.getSelection();
    let needle = '', bi = null, cell = null;
    try { if (sel && sel.rangeCount && !sel.isCollapsed) needle = sel.toString(); } catch (e) { /* noop */ }
    try {
      const hn = sel.getRangeAt(0).startContainer;
      const hw = (hn.nodeType === 1 ? hn : hn.parentNode).closest('.block-wrap[data-idx]');
      if (hw) bi = +hw.getAttribute('data-idx');
    } catch (e2) { /* noop */ }
    /* 表格：选区直接落在 td/th 上 → 记录单元格坐标（r=-1 表示表头） */
    try {
      const cel = selCell();
      if (cel && cel.el) {
        const wrap = cel.el.closest('.block-wrap[data-idx]');
        const wb = wrap ? page.blocks[+wrap.getAttribute('data-idx')] : null;
        if (wb && wb.type === 'table') {
          bi = +wrap.getAttribute('data-idx');
          cell = { r: (cel.r == null ? -1 : cel.r), c: cel.c };
        }
      }
    } catch (e3) { /* noop */ }
    const hadText = !!(needle && needle.trim());
    if (!hadText && lastSelInfo.text) { needle = lastSelInfo.text; bi = lastSelInfo.bi; if (!cell) cell = lastSelInfo.cell || null; } /* 选区被清掉 → 用记住的（含格子坐标） */
    needle = String(needle || '').replace(/\u00A0/g, ' ').trim();
    if (!needle) return null; /* 没有任何选区 → 返回 null：⇄ 气泡照常打开（管理已有跳转 / 取消 / 新建），不再卡死 */
    if (bi == null) return { err: '这里选不了起点：请点进正文内容块（段落 / 标题 / 提示框 / 表格 / 文本框），在里面选中文字' };
    const blk = page.blocks[bi];
    if (!blk) return { err: '所在的块不存在了，请重新选择' };
    const isTbl = blk.type === 'table';
    if (!isTextType(blk) && !isTbl) return { err: '这种块暂不支持跳转起点（支持：段落 / 标题 / 提示框 / 文本框 / 表格单元格）' };
    if (blk.type === 'md') return { err: 'Markdown 块暂不支持点选建立跳转（请改用普通文字块）' };
    if (isTbl && !cell) {
      /* 手机上点 ⇄ 按钮的瞬间选区被清 → selCell() 返回 null → 按记住的文字反查所在格子 */
      const fc = findCellByText(page, bi, needle);
      if (fc) cell = fc;
    }
    if (isTbl && !cell) return { err: '表格块请直接在某个单元格里选中文字，再点 ⇄ 跳转' };
    if (needle.length > 80) return { err: '跳转文字请选短一点（≤80 字的关键词）' };
    return { page: page.id, bi: bi, text: needle, cell: cell, fb: !hadText }; /* fb=用了记忆选区（可能已失效，定位失败时提示语更明确） */
  }
  /* 在块/单元格源码里定位选区文字（可见字符 → 源下标映射）。返回 {at,end,seg} 或 {err}：
     · 加粗/斜体/高亮/颜色/渐变等格式标记可以与跳转共存（md.js 先渲染格式再渲染跳转）
     · 只拒绝「不能嵌套」的：来源引用 / 已有跳转 / 链接，以及骑跨颜色标记（@@ 配对会被打散） */
  function jumpSpanOf(t, selText) {
    const w = walkInline(t);
    const vis = w.map.map(function (i2) { return t.charAt(i2); }).join('');
    let want = String(selText);
    let vi = vis.indexOf(want);
    /* ★ 空白弹性回退（修复㉙「在文本框里选字经常建不了跳转」）：HTML 渲染会把连续空格折叠成
       一个、nbsp 与普通空格互换（"双击  输入"渲染后变"双击 输入"），DOM 选区文字因此和
       源码对不上 → indexOf 必失败。失败时把选区文字的空白段当作 [ \u00A0]+ 弹性匹配重找 */
    if (vi < 0 && /[\s\u00A0]/.test(want)) {
      const parts = want.split(/[\s\u00A0]+/).filter(function (x) { return x; });
      if (parts.length) {
        const re = new RegExp(parts.map(function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('[\\s\\u00A0]+'));
        const m2 = re.exec(vis);
        if (m2) { vi = m2.index; want = m2[0]; }
      }
    }
    if (vi < 0) return { err: '那段文字在源码里定位不到（可能刚被编辑过），请重新选择' };
    const s0 = w.map[vi];
    const e0 = w.map[vi + want.length - 1] + 1;
    const bad = w.toks.some(function (k) { return k.b > s0 && k.a < e0 && (k.t === 'ref' || k.t === 'jump' || k.t === 'link'); });
    if (bad) return { err: '所选文字里含有来源引用 / 链接 / 已有跳转，请选不含这些的文字（已有跳转可在 ⇄ 气泡里改目标）' };
    if (!pairCheck(w.toks, s0, e0)) return { err: '所选文字骑跨了颜色标记，请调整选区' };
    return { at: s0, end: e0, seg: t.slice(s0, e0) };
  }
  function openJumpPop(anchor) {
    const jp = LMApp.state.content.jumps || (LMApp.state.content.jumps = []);
    const pend = tb.jumpPend || (tb.jumpPend = { from: null, to: null });
    const info = jumpSelInfo();
    if (info && info.err) { LMApp.toast(info.err); return; }
    if (info) {
      /* ★ 表格块没有 .text 字段（内容在 headers/rows 里）—— 旧版对表格取 cur.text 得到空串，
         jumpSpanOf 必然「定位不到」→ 表格里的字永远建不成跳转起点/终点。改走 cellSrcOf 取单元格源码 */
      const curp = pageOf();
      let srcTxt;
      if (info.cell) {
        const cs = cellSrcOf(curp, info.bi, info.cell);
        if (!cs) { LMApp.toast('那个单元格不存在了，请重新选择'); return; }
        srcTxt = String(cs.get() || '');
      } else {
        const cur = curp.blocks[info.bi];
        srcTxt = String((cur && cur.text) || '');
      }
      const chk = jumpSpanOf(srcTxt.replace(/\u00A0/g, ' '), info.text);
      if (chk.err) { LMApp.toast(info.fb ? '刚才选中的文字已失效（点按钮/切页会清掉选区），请重新拖选后再点 ⇄' : chk.err); return; }
      if (!pend.from) {
        pend.from = info; /* 记完起点就收起：用户去别处选终点（气泡不开 = 自动关） */
        renderToolbar(); /* ⇄ 按钮亮起「等终点」状态，一眼可见记上了 */
        LMApp.toast('✅ 起点已记下「' + info.text.slice(0, 16) + (info.text.length > 16 ? '…' : '') + '」（⇄ 按钮已亮起）：去选中终点文字（可在其他页面），再点 ⇄ 跳转；不想建了就再点一次 ⇄ 或按 Esc 取消');
        return;
      }
      pend.to = info; /* 已有起点 → 这次选择填终点（可反复改选，直到确认） */
    }
    if (!pend.from) {
      /* 没选文字就点 ⇄ → 直接打开「全站跳转列表」：查看 / 删除 / 试跳，不需要先进跳转模式 */
      jumpListPop(anchor);
      return;
    }
    if (!pend.to && !info) {
      /* 等终点状态下没选文字就再点 ⇄ → 视为取消请求（最快的退出方式；Esc 同效） */
      tb.jumpPend = { from: null, to: null };
      renderToolbar();
      LMApp.toast('已取消跳转选择（查看全部跳转请点旁边「⇄ 设置」）');
      return;
    }
    let html = '<h4 class="pop-t">条目级跳转</h4>';
    html += '<div class="pop-note">起点：<b>' + esc(pend.from.text.slice(0, 20)) + (pend.from.text.length > 20 ? '…' : '') + '</b> · ' + esc(jumpPosLabel(pend.from)) + '</div>';
    html += pend.to
      ? '<div class="pop-note">终点：<b>' + esc(pend.to.text.slice(0, 20)) + (pend.to.text.length > 20 ? '…' : '') + '</b> · ' + esc(jumpPosLabel(pend.to)) + '</div>'
      : '<div class="pop-note muted">终点待填：去选中另一段文字（可在其他页面），再点 ⇄ 跳转</div>';
    if (pend.to) html += '<button type="button" class="btn btn-mini" id="jumpGo" style="margin:2px 0 6px">⇄ 建立跳转</button>';
    html += '<button type="button" class="btn btn-mini danger" id="jumpClear" style="margin:2px 0 6px">✕ 取消当前选择（清空重来）</button>';
    html += '<button type="button" class="btn btn-mini" id="jumpNew" style="margin:2px 0 8px">➕ 新建跳转（作废当前，重选起点）</button>';
    html += '<div class="pop-note muted">已有跳转（✕ 删除，起点虚线字一并还原）：</div><div class="ref-list">';
    if (!jp.length) html += '<div class="pop-note muted">还没有跳转</div>';
    jp.forEach(function (jm) {
      html += '<div class="jump-item" data-jgo="' + esc(jm.id) + '" title="点这一行试跳（滚到终点）"><span class="jump-a">' + esc(jm.from.text.slice(0, 14)) + (jm.from.text.length > 14 ? '…' : '') + '</span>'
        + '<span class="jump-arrow">→</span><span class="jump-b">' + esc(jm.to.text.slice(0, 14)) + (jm.to.text.length > 14 ? '…' : '') + '</span>'
        + '<span class="jump-pg">' + esc(jumpPageLabel(jm.to.page)) + '</span>'
        + '<button type="button" class="jump-del" data-jdel="' + esc(jm.id) + '" title="删除此跳转">✕</button></div>';
    });
    html += '</div><div class="pop-note muted">双向互跳：访客点起点虚线字 → 跳到终点；点终点文字 → 跳回起点。管理员模式 Ctrl/Cmd+点 试跳。同一起点只能有一个终点（可多跳一）。</div>';
    popover(anchor, html, function (root) {
      const go = root.querySelector('#jumpGo');
      if (go) go.addEventListener('click', function () { jumpCreate(pend); closePop(); });
      const cl = root.querySelector('#jumpClear');
      if (cl) cl.addEventListener('click', function () { tb.jumpPend = { from: null, to: null }; renderToolbar(); closePop(); LMApp.toast('已取消当前选择（Esc 也可退出跳转选择）'); });
      const nw = root.querySelector('#jumpNew');
      if (nw) nw.addEventListener('click', function () { tb.jumpPend = { from: null, to: null }; renderToolbar(); closePop(); LMApp.toast('已重置：现在选中起点文字，再点 ⇄ 跳转'); });
      root.querySelectorAll('[data-jgo]').forEach(function (row) {
        row.addEventListener('click', function (e) {
          if (e.target.closest('.jump-del')) return; /* ✕ 走删除，不试跳 */
          jumpGo(row.getAttribute('data-jgo'));
        });
      });
      root.querySelectorAll('[data-jdel]').forEach(function (bt) {
        bt.addEventListener('click', function () { jumpDelete(bt.getAttribute('data-jdel')); closePop(); });
      });
    }, 'jump');
  }
  /* ⇄ 列表：全站跳转管理面板 —— 不需要选中文字、不需要进入跳转模式，随时点开：
     查看全部跳转、✕ 删除（起点虚线字一并还原）、点行试跳；删除后自动重开面板便于连续管理 */
  function jumpListPop(anchor) {
    const jp = LMApp.state.content.jumps || (LMApp.state.content.jumps = []);
    let html = '<h4 class="pop-t">跳转设置（' + jp.length + ' 条）</h4>';
    html += '<div class="pop-note muted">点行试跳（滚到终点）· ✕ 删除（起点虚线字一并还原）</div><div class="ref-list">';
    if (!jp.length) html += '<div class="pop-note muted">还没有跳转。新建：选中一段文字 → 点旁边「⇄ 跳转」记起点，再到别处（可跨页面）选中终点文字再点 ⇄ → 建立跳转</div>';
    jp.forEach(function (jm) {
      html += '<div class="jump-item" data-jgo="' + esc(jm.id) + '" title="点这一行试跳（滚到终点）"><span class="jump-a">' + esc(jm.from.text.slice(0, 14)) + (jm.from.text.length > 14 ? '…' : '') + '</span>'
        + '<span class="jump-arrow">→</span><span class="jump-b">' + esc(jm.to.text.slice(0, 14)) + (jm.to.text.length > 14 ? '…' : '') + '</span>'
        + '<span class="jump-pg">' + esc(jumpPageLabel(jm.to.page)) + '</span>'
        + '<button type="button" class="jump-del" data-jdel="' + esc(jm.id) + '" title="删除此跳转">✕</button></div>';
    });
    html += '</div><div class="pop-note muted">规则：同一起点只能有一个终点（可多跳一）。双向互跳：访客点起点虚线字 → 终点；点终点文字 → 跳回起点。</div>';
    popover(anchor, html, function (root) {
      root.querySelectorAll('[data-jgo]').forEach(function (row) {
        row.addEventListener('click', function (e) {
          if (e.target.closest('.jump-del')) return; /* ✕ 走删除，不试跳 */
          jumpGo(row.getAttribute('data-jgo'));
        });
      });
      root.querySelectorAll('[data-jdel]').forEach(function (bt) {
        bt.addEventListener('click', function () {
          jumpDelete(bt.getAttribute('data-jdel'));
          closePop();
          const nb = document.querySelector('#editBar [data-tb="jlist"]');
          if (nb) jumpListPop(nb); /* 删完自动重开面板，方便连续管理多条 */
        });
      });
    }, 'jlist');
  }
  function jumpPosLabel(pt) {
    let s = jumpPageLabel(pt.page);
    if (pt.cell) s += ' · 表格' + (pt.cell.r >= 0 ? '第' + (pt.cell.r + 1) + '行' : '表头') + '第' + (pt.cell.c + 1) + '列';
    return s;
  }
  /* 表格单元getter/setter（r=-1 → 表头），找不到返回 null */
  function cellSrcOf(p, bi, cell) {
    const b = p && p.blocks[bi];
    if (!b || b.type !== 'table' || !cell) return null;
    if (cell.r < 0) return b.headers[cell.c] == null ? null : { get: function () { return b.headers[cell.c]; }, set: function (v2) { b.headers[cell.c] = v2; } };
    if (!b.rows[cell.r] || b.rows[cell.r][cell.c] == null) return null;
    return { get: function () { return b.rows[cell.r][cell.c]; }, set: function (v2) { b.rows[cell.r][cell.c] = v2; } };
  }
  function jumpCreate(pend) {
    if (!pend || !pend.from || !pend.to) { LMApp.toast('起点或终点还没选好'); return; }
    const jp = LMApp.state.content.jumps || (LMApp.state.content.jumps = []);
    const samePt = function (a, b2) {
      return a.page === b2.page && a.bi === b2.bi && a.text === b2.text
        && JSON.stringify(a.cell || null) === JSON.stringify(b2.cell || null);
    };
    const ex = jp.find(function (jm) { /* 同一起点（同页同块同格同句）→ 只更新目标，天然不存在“一跳多” */
      return samePt(jm.from, pend.from);
    });
    if (ex) {
      if (samePt(ex.to, pend.to)) { LMApp.toast('这个跳转已存在'); return; }
      ex.to = { page: pend.to.page, bi: pend.to.bi, text: pend.to.text, cell: pend.to.cell || null };
      tb.jumpPend = { from: null, to: null };
      renderToolbar();
      /* 只改了映射数据，任何页面的正文源码都没动 → 不重渲染。旧版整页重绘，
        正是「确认终点时界面跳一下」的原因；终点绿线由装饰轮询自动跟上 */
      LMApp.commit({ silent: true, rerender: false });
      LMApp.toast('已更新跳转目标：' + pend.from.text.slice(0, 12) + ' → ' + pend.to.text.slice(0, 12));
      decorateJumpDests(true); /* 终点文字变了但条数没变 → 强制重包绿线 */
      return;
    }
    if (samePt(pend.from, pend.to)) { LMApp.toast('起点和终点选的是同一段文字，终点请换一处'); return; }
    const fp = (LMApp.state.content.pages || []).find(function (x) { return x.id === pend.from.page; });
    let fget = null;
    if (fp) {
      if (pend.from.cell) fget = cellSrcOf(fp, pend.from.bi, pend.from.cell);
      else {
        const fb = fp.blocks[pend.from.bi];
        if (fb && isTextType(fb)) fget = { get: function () { return fb.text; }, set: function (v2) { fb.text = v2; } };
      }
    }
    if (!fget) { LMApp.toast('起点所在的块已变化，请重新选择起点'); tb.jumpPend = { from: null, to: null }; renderToolbar(); return; }
    const t = String(fget.get() || '').replace(/\u00A0/g, ' ');
    const chk = jumpSpanOf(t, pend.from.text);
    if (chk.err) { LMApp.toast(chk.err); return; }
    const id = 'J' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    fget.set(t.slice(0, chk.at) + '[[j:' + id + ',' + chk.seg + ']]' + t.slice(chk.end));
    jp.push({ id: id, from: { page: pend.from.page, bi: pend.from.bi, text: pend.from.text, cell: pend.from.cell || null }, to: { page: pend.to.page, bi: pend.to.bi, text: pend.to.text, cell: pend.to.cell || null } });
    tb.jumpPend = { from: null, to: null };
    renderToolbar();
    /* 只有起点所在页正在显示时才需要重渲染（起点虚线在那页的 DOM 里）；
      改的是别的页就纯落盘不重绘 —— 消除「建完跳转界面跳一下」 */
    if (pend.from.page === LMApp.state.pageId) {
      LMApp.commit({ silent: true });
      LMApp.toast('已建立跳转：' + pend.from.text.slice(0, 12) + ' → ' + pend.to.text.slice(0, 12));
      decorateJumpDests();
    } else {
      LMApp.commit({ silent: true, rerender: false });
      LMApp.toast('已建立跳转（起点在「' + jumpPageLabel(pend.from.page) + '」页）：' + pend.from.text.slice(0, 12) + ' → ' + pend.to.text.slice(0, 12));
    }
  }
  function jumpDelete(id) {
    const jp = LMApp.state.content.jumps || [];
    const ix = jp.findIndex(function (jm) { return jm.id === id; });
    if (ix < 0) return;
    const wasFrom = jp.length > ix ? (jp[ix].from && jp[ix].from.page) : null;
    jp.splice(ix, 1);
    /* 起点可能在任何页面的块或表格单元格里：数据层直接把 [[j:ID,…]] 还原成纯文字 */
    const re = new RegExp('\\[\\[j:' + id + ',([\\s\\S]*?)\\]\\]');
    (LMApp.state.content.pages || []).forEach(function (p) {
      (p.blocks || []).forEach(function (b) {
        if (!b) return;
        if (typeof b.text === 'string' && re.test(b.text)) { b.text = b.text.replace(re, '$1'); return; }
        if (b.type === 'table') {
          (b.headers || []).forEach(function (h, i2) { if (typeof h === 'string' && re.test(h)) b.headers[i2] = h.replace(re, '$1'); });
          (b.rows || []).forEach(function (r, ri) { (r || []).forEach(function (c2, ci) { if (typeof c2 === 'string' && re.test(c2)) r[ci] = c2.replace(re, '$1'); }); });
        }
      });
    });
    /* 只有起点所在页正在显示才重渲染（虚线消失）；在别的页删跳转不整页重绘 —— 消除「删完界面跳一下」 */
    if (wasFrom === LMApp.state.pageId) LMApp.commit({ silent: true });
    else LMApp.commit({ silent: true, rerender: false });
    LMApp.toast('已删除跳转');
    decorateJumpDests();
  }
  /* ---------- 临时「返回」键：跳转是双向等价的互跳 ----------
     任何方向的跳转（起点→终点 / 终点→起点 / 列表试跳）落定后，屏幕下方都会浮出
     「↩ 返回」：点一下回到出发的那一端（角色互换：原终点变起点），返回键随之消失；
     8 秒不动自动收起 = 本轮跳转结束。再跳时同样出现，机制完全对称。 */
  let jumpBackTimer = null;
  function showJumpBack(id, back) {
    let bt = document.getElementById('lmJumpBack');
    if (!bt) {
      bt = document.createElement('button');
      bt.type = 'button'; bt.id = 'lmJumpBack'; bt.className = 'lm-jump-back';
      bt.innerHTML = '↩ 返回';
      bt.addEventListener('click', function () {
        const info = bt._info;
        hideJumpBack(); /* 先收起：返回跳不再弹新键（点一下回出发端，键即消失） */
        if (info) jumpGo(info.id, !info.back, true);
      });
      document.body.appendChild(bt);
    }
    bt._info = { id: id, back: !!back };
    bt.classList.add('on');
    if (jumpBackTimer) clearTimeout(jumpBackTimer);
    jumpBackTimer = setTimeout(hideJumpBack, 8000); /* 长时间不点自动收起，本轮跳转结束 */
  }
  function hideJumpBack() {
    const bt = document.getElementById('lmJumpBack');
    if (bt) bt.classList.remove('on');
    if (jumpBackTimer) { clearTimeout(jumpBackTimer); jumpBackTimer = null; }
  }
  function jumpGo(id, back, noBack) {
    /* back=true → 反向跳：从终点文字跳回起点（双向互跳）；默认正向：起点 → 终点；
       noBack=true → 这次跳完不弹「返回」键（返回键自己的点击就走这条，防止键不消失） */
    const jm = (LMApp.state.content.jumps || []).find(function (x) { return x.id === id; });
    if (!jm) { LMApp.toast('这条跳转在当前内容里还不存在：如果是在别的设备/访客页面，请管理员先点「同步到 GitHub」把最新内容推上云'); return; }
    const goal = back ? jm.from : jm.to;
    if (!goal) { LMApp.toast('跳转信息不完整'); return; }
    const goPage = goal.page;
    const after = function () {
      const p = (LMApp.state.content.pages || []).find(function (x) { return x.id === goPage; });
      if (!p || !p.blocks) { LMApp.toast('跳转目标页面不存在'); return; }
      let bi = goal.bi;
      if (!(p.blocks[bi] && typeof p.blocks[bi].text === 'string' && p.blocks[bi].text.indexOf(goal.text) >= 0)) {
        bi = -1; /* 块被挪过位 → 按目标文字全页搜 */
        p.blocks.some(function (b, i) { if (b && typeof b.text === 'string' && b.text.indexOf(goal.text) >= 0) { bi = i; return true; } return false; });
      }
      let el = bi >= 0 ? document.querySelector('.block-wrap[data-idx="' + bi + '"]') : null;
      if (el && goal.cell) { /* 目标是表格单元格 → 精确滚到那个格 */
        const cel = (goal.cell.r >= 0)
          ? el.querySelector('td[data-r="' + goal.cell.r + '"][data-c="' + goal.cell.c + '"]')
          : el.querySelector('th[data-c="' + goal.cell.c + '"]');
        if (cel) el = cel;
      }
      if (!el) { /* 首页等非标准块容器兜底：按文字找可见元素 */
        el = Array.prototype.find.call(document.querySelectorAll('[data-edit],[data-pgf],.block-wrap'), function (n) {
          return n.textContent && n.textContent.indexOf(goal.text) >= 0;
        }) || null;
      }
      if (!el) { LMApp.toast('跳转目标内容可能已被移动或删除'); return; }
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { el.scrollIntoView(); }
      el.classList.remove('jump-flash');
      void el.offsetWidth;
      el.classList.add('jump-flash');
      setTimeout(function () { el.classList.remove('jump-flash'); }, 1800);
      if (!noBack) showJumpBack(id, back); /* 双向等价：无论从哪端跳，都给临时「返回」键 */
    };
    if (LMApp.state.pageId !== goPage) {
      location.hash = '#/p/' + goPage;
      setTimeout(after, 180); /* 等 hashchange → render 完成再滚 */
    } else after();
  }
  /* ---------- 跳转终点「绿虚线」装饰（与起点视觉对称） ----------
     终点在正文里是纯文字（没有标记），渲染层无法直接上虚线 —— 在渲染后按映射数据
     用 Range 把终点文字包一层 span.jumpdst（纯显示层：htmlToMd 遇到它原样透传，
     永不进源码；点击行为仍走原有的「光标位置反查」，装饰不拦截）。幂等：1.2s 轮询 +
     建跳/删跳后即时刷新；数量一致就跳过，成本极低。 */
  function dstHostOf(goal) {
    const p = (LMApp.state.content.pages || []).find(function (x) { return x.id === goal.page; });
    if (!p || !p.blocks) return null;
    /* ★ 匹配增强：终点文字所在块后来被加了跳转/引用/颜色等标记时，
       源码里不再是裸文字（如 [[j:J1,生态…]] / @@13,生态…@@）→ 裸 indexOf 找不到 → 绿线消失。
       先按源码裸匹配，失败再按「剥掉行内标记后的纯文字」匹配 */
    const want = String(goal.text || '').replace(/\u00A0/g, ' ');
    const bare = function (t) { return stripInline(String(t || '').replace(/\[\[j:[a-zA-Z0-9_-]+,/g, '')); };
    const hit = function (b) {
      if (!b || typeof b.text !== 'string') return false;
      const t = String(b.text).replace(/\u00A0/g, ' ');
      return t.indexOf(want) >= 0 || bare(t).indexOf(want) >= 0;
    };
    let bi = goal.bi;
    if (!(p.blocks[bi] && hit(p.blocks[bi]))) {
      bi = -1;
      p.blocks.some(function (b, i) { if (hit(b)) { bi = i; return true; } return false; });
    }
    if (bi < 0) return null;
    const w = document.querySelector('.block-wrap[data-idx="' + bi + '"]');
    if (!w) return null;
    if (goal.cell) {
      return (goal.cell.r >= 0)
        ? w.querySelector('td[data-r="' + goal.cell.r + '"][data-c="' + goal.cell.c + '"]')
        : w.querySelector('th[data-c="' + goal.cell.c + '"]');
    }
    const eds = w.querySelectorAll('[data-edit],[data-pgf]');
    const normSp = function (s2) { return String(s2 || '').replace(/[\s\u00A0]+/g, ' '); }; /* 渲染折叠空格/nbsp ↔ 源码差异（修复㉙） */
    for (let i = 0; i < eds.length; i++) { if (eds[i].textContent && normSp(eds[i].textContent).indexOf(normSp(goal.text)) >= 0) return eds[i]; }
    for (let i = 0; i < eds.length; i++) { if (eds[i].textContent && normSp(eds[i].textContent).indexOf(normSp(want)) >= 0) return eds[i]; }
    /* ★ 访客态兜底（修复㉔）：data-edit/data-pgf 只在管理模式渲染，访客页两者皆无 ——
       旧版直接返回 null → 终点绿线在访客页永远挂不上。按标签找承载文字的元素 */
    const cands = w.querySelectorAll('p,h1,h2,h3,h4,h5,.callout,td,th,div');
    for (let i = 0; i < cands.length; i++) { if (cands[i].textContent && cands[i].textContent.indexOf(goal.text) >= 0) return cands[i]; }
    for (let i = 0; i < cands.length; i++) { if (cands[i].textContent && bare(String(cands[i].textContent)).indexOf(want) >= 0) return cands[i]; }
    return eds[0] || cands[0] || null;
  }
  function decorateJumpDests(force) {
    if (!window.LMApp || !LMApp.state || !LMApp.state.content) return;
    const cur = LMApp.state.pageId;
    const jumps = (LMApp.state.content.jumps || []).filter(function (jm) {
      return jm && jm.to && jm.to.page === cur && jm.to.text && jm.from;
    });
    const olds = document.querySelectorAll('span.jumpdst');
    const wantIds = jumps.map(function (jm) { return jm.id; });
    /* ★ 增量装饰：只拆「不再需要的」旧装饰（对应跳转被删除/转移到别页）——
       旧版只要数量对不上就把已包好的也全部拆掉重包：只要有条包装失败
       （终点文字后来被编辑过等），每 1.2s 成功的绿线也跟着拆装一次 → 整体闪烁，
       看起来就像「终点绿线没有了」。现在已对位的装饰一律不动，绝不闪 */
    olds.forEach(function (n) {
      if (!force && wantIds.indexOf(n.getAttribute('data-jdst')) >= 0) return;
      const p2 = n.parentNode; if (!p2) return;
      while (n.firstChild) p2.insertBefore(n.firstChild, n);
      p2.removeChild(n); p2.normalize();
    });
    const done = {};
    document.querySelectorAll('span.jumpdst[data-jdst]').forEach(function (n) { done[n.getAttribute('data-jdst')] = true; });
    jumps.forEach(function (jm) {
      if (!force && done[jm.id]) return; /* 已包好 → 不动 */
      const host = dstHostOf(jm.to);
      if (!host) return;
      const t = String(jm.to.text).replace(/\u00A0/g, ' ');
      if (!t) return;
      const full = String(host.textContent).replace(/\u00A0/g, ' ');
      const at = full.indexOf(t);
      if (at < 0) return; /* 终点文字真的被改过 → 包不上（⇄ 设置里删掉这条重建即可）；出现多次时包第一处 */
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null);
      let pos = 0, sN = null, sO = 0, eN = null, eO = 0, n;
      while ((n = walker.nextNode()) && !eN) {
        const len = (n.nodeValue || '').length;
        if (!sN && pos + len > at) { sN = n; sO = at - pos; }
        if (sN && pos + len >= at + t.length) { eN = n; eO = at + t.length - pos; }
        pos += len;
      }
      if (!sN || !eN) return;
      try {
        const rng = document.createRange();
        rng.setStart(sN, sO); rng.setEnd(eN, eO);
        const sp = document.createElement('span');
        sp.className = 'jumpdst';
        sp.setAttribute('data-jdst', jm.id);
        try { rng.surroundContents(sp); }
        catch (eR) { const fr = rng.extractContents(); sp.appendChild(fr); rng.insertNode(sp); } /* 跨粗体等节点边界时拆分包裹 */
      } catch (eD) { /* 装饰失败不影响内容显示，下轮重试 */ }
    });
  }
  setInterval(decorateJumpDests, 1200);
  setTimeout(decorateJumpDests, 400);
  document.addEventListener('click', function (e) {
    const jl = e.target.closest && e.target.closest('.jumplink');
    if (!jl || !window.LMApp) return;
    if (LMApp.state.admin && !e.ctrlKey && !e.metaKey) { LMApp.toast('💡 这是跳转起点：按住 Ctrl（Mac 用 Cmd）再点可试跳；退出管理员后，普通访客点它就直接跳'); return; } /* 管理模式：普通点击=编辑文字 */
    e.preventDefault();
    jumpGo(jl.getAttribute('data-jump'));
  });
  /* ---------- 跳转双向：点「终点文字」→ 跳回起点 ----------
     终点在正文里是纯文字（没有标记 span，不能像起点那样渲染成虚线字），
     所以在点击瞬间用光标位置反查：取点击处文本节点/偏移 → 算出它在所在容器
     （段落/标题/提示框/单元格）里的字符位置 → 若正好落在当前页某个跳转的
     「终点文字」区间内 → 平滑滚回起点并绿光闪烁。
     管理员模式普通点击仍是编辑文字（不打扰编辑），Ctrl/Cmd+点 才跳回；
     访客点击终点文字直接跳回。起点（绿虚线字）永远优先走上面的起点逻辑，
     两者互不干扰 —— 同一段文字既是 A 的起点又是 B 的终点时也各自正确。 */
  function caretOffsetIn(container, node, offset) {
    let total = 0, found = false;
    (function walk(n) {
      if (found) return;
      if (n === node) { found = true; total += offset; return; }
      if (n.nodeType === 3) { total += (n.nodeValue || '').length; return; }
      for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
    })(container);
    return found ? total : -1;
  }
  document.addEventListener('click', function (e) {
    if (!window.LMApp || e.clientX == null) return;
    if (e.target.closest && e.target.closest('.jumplink,#editBar,#brushPop,.popover,#navGear,#gearPop,#adminBar,.modal-mask,.cfm-mask,#collabPanel,button,input,textarea')) return;
    const wantBack = !LMApp.state.admin || e.ctrlKey || e.metaKey;
    if (!wantBack) return; /* 管理员普通点击 = 编辑文字 */
    let hit = null;
    try {
      let node = null, off = 0;
      if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(e.clientX, e.clientY); if (r) { node = r.startContainer; off = r.startOffset; } }
      else if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(e.clientX, e.clientY); if (p) { node = p.offsetNode; off = p.offset; } }
      if (!node || node.nodeType !== 3) return; /* 只处理点在文字上的情形 */
      const host = node.parentNode && node.parentNode.closest
        ? (node.parentNode.closest('td,th,[data-edit],[data-pgf],p,h1,h2,h3,h4,h5,.callout') || node.parentNode.closest('.block-wrap')) : null; /* ★ 访客态无 data-edit → 逐级兜底到 .block-wrap（修复㉔） */
      if (!host || !host.textContent) return;
      const text = String(host.textContent).replace(/\u00A0/g, ' ');
      const cpos = caretOffsetIn(host, node, off);
      if (cpos < 0) return;
      const jumps = (LMApp.state.content.jumps || []).filter(function (jm) {
        return jm && jm.to && jm.to.page === LMApp.state.pageId && jm.to.text && jm.from;
      });
      for (let ji = 0; ji < jumps.length && !hit; ji++) {
        const t = String(jumps[ji].to.text).replace(/\u00A0/g, ' ');
        if (!t) continue;
        let at = text.indexOf(t);
        while (at >= 0 && !hit) {
          if (cpos >= at && cpos < at + t.length) hit = jumps[ji];
          at = text.indexOf(t, at + 1);
        }
      }
    } catch (eJ) { return; }
    if (!hit) return;
    e.preventDefault();
    jumpGo(hit.id, true);
  });

  /* ---------- 格式刷（常开模式 + 工具栏下方聊天气泡） ----------
     · 点🖌开启：若此刻已选中带格式的文字 → 直接复制进缓冲（兼容老习惯）；否则缓冲为空
     · 气泡里只有「📋 复制格式」一个按钮：有选区 → 立即复制；没有 → 进入等待复制态，
       下一段选区松手即复制；不设「粘贴格式」按钮 —— 划选目标文字本身就是粘贴
     · 格式刷不会自动关：粘贴后保持开启，可连续刷多处；气泡也一直不关；再点🖌或按 Esc 退出 */
  var BRUSH_MARK_NAMES = { bold: '加粗', italic: '斜体', under: '下划线', strike: '删除线', sup: '上标', sub: '下标' };
  function brushPopEl() {
    let el = document.getElementById('brushPop');
    if (!el) {
      el = document.createElement('div');
      el.id = 'brushPop';
      el.innerHTML = '<span class="bp-status" id="brushStatus"></span>'
        + '<button type="button" id="brushCopy">📋 复制格式</button>';
      document.body.appendChild(el);
      el.querySelector('#brushCopy').addEventListener('click', brushCopyClick);
    }
    return el;
  }
  function brushStatusText() {
    if (tb.copyArm) return '正在复制：去选中一段带格式的文字，松手即复制';
    const buf = tb.brushBuf;
    if (buf && buf.inline && buf.inline.length) {
      return '已复制：' + buf.inline.map(function (k) { return BRUSH_MARK_NAMES[k] || k; }).join('、')
        + ' —— 划选目标文字即粘贴（格式刷保持开启，再点🖌退出）';
    }
    if (buf && buf.style && Object.keys(buf.style).length) {
      return '已复制块样式 —— 点目标块整块套用；划选文字则粘贴文字格式';
    }
    return '点「复制格式」再选中要复制的文字；或先选中带格式的文字，再点🖌即可复制';
  }
  function renderBrushPop() {
    const el = brushPopEl();
    const on = !!tb.brushOn && !!(window.LMApp && LMApp.state.admin);
    el.style.display = on ? 'flex' : 'none';
    if (on) el.querySelector('#brushStatus').textContent = brushStatusText();
    const btn = document.querySelector('#editBar [data-tb="brush"]');
    if (btn) btn.classList.toggle('on', on);
  }
  function brushCopyFromSelection() {
    const sel = window.getSelection();
    const inline = ['bold', 'italic', 'under', 'strike', 'sup', 'sub'].filter(fmtActive);
    let src = null;
    if (tb.hero) src = heroStyleRef();
    else {
      try {
        const hn = sel && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
        const hw = hn ? (hn.nodeType === 1 ? hn : hn.parentNode).closest('.block-wrap[data-idx]') : null;
        if (hw) {
          const b = pageOf().blocks[+hw.getAttribute('data-idx')];
          if (b && isTextType(b)) src = b.style || null;
        }
      } catch (e0) { /* noop */ }
      if (!src) { const b = activeBlock(); if (b && isTextType(b)) src = b.style || null; }
    }
    const hasInline = inline.length > 0;
    const hasStyle = !!(src && Object.keys(src).length);
    if (!hasInline && !hasStyle) return false;
    tb.brushBuf = { inline: hasInline ? inline : [], style: hasStyle ? JSON.parse(JSON.stringify(src)) : null };
    tb.copyArm = false;
    return true;
  }
  /* 点🖌 / 点「复制格式」时选区常已被点按钮的动作清掉 → 先按 selectionchange 记住的
     上一次拖选把选区接回来再复制一遍（与字号/颜色的兜底同一套机制） */
  function tryBrushCopy() {
    if (brushCopyFromSelection()) return true;
    if (lastSelInfo.text && lastSelInfo.bi != null) {
      const wrap = document.querySelector('.block-wrap[data-idx="' + lastSelInfo.bi + '"]');
      const el = textElOf(wrap, null, lastSelInfo.text);
      if (el) {
        restoreSelectionIn(el, lastSelInfo.text);
        if (brushCopyFromSelection()) return true;
      }
    }
    return false;
  }
  function brushCopyClick() {
    if (!tb.brushOn) toggleBrush();
    const sel = window.getSelection();
    const has = !!(sel && sel.rangeCount && !sel.isCollapsed);
    if (tryBrushCopy()) {
      renderBrushPop();
      LMApp.toast('已复制格式：现在划选目标文字即粘贴');
      return;
    }
    if (has) {
      LMApp.toast('这段文字没有可复制的格式（加粗 / 斜体 / 下划线 / 删除线 / 上下标 / 块样式）');
      return;
    }
    tb.copyArm = true;
    renderBrushPop();
    LMApp.toast('正在等待复制：选中一段带格式的文字，松手即复制');
  }
  function toggleBrush() {
    if (tb.brushOn) {
      tb.brushOn = false; tb.copyArm = false; tb.brushBuf = null;
      renderBrushPop();
      LMApp.toast('已关闭格式刷');
      return;
    }
    /* ★ 点🖌 = 进入「复制模式」（清掉旧缓冲，绝不偷偷复制上一次记的词）：
       画选一段带格式的文字松手 → 复制完成 → 自动进入「粘贴模式」→ 再画到目标文字上即粘贴。
       复制/粘贴的画字动作由下方 mouseup 消费器统一处理 */
    tb.brushOn = true; tb.copyArm = true; tb.brushBuf = null;
    renderBrushPop();
    LMApp.toast('格式刷（复制模式）：画选一段带格式的文字，松手即复制；复制完自动进入粘贴模式');
  }
  /* 格式刷消费：等待复制态 → 选区=复制源；已复制 → 划选文字=粘贴（不自动关）；单纯点击 → 整块套样式。
     目标块一律由「选区起点 / 按下位置」锁定，源块永远不会被改动（复制格式 ≠ 剪切格式） */
  document.addEventListener('mouseup', function (e) {
    if (!window.LMApp || !LMApp.state.admin || !tb.brushOn) return;
    const sel = window.getSelection();
    const hasSel = !!(sel && sel.rangeCount && !sel.isCollapsed);
    if (hasSel && tb.copyArm) {
      if (brushCopyFromSelection()) LMApp.toast('已复制格式（自动进入粘贴模式）：现在画选目标文字，松手即粘贴');
      else LMApp.toast('这段文字没有可复制的格式，继续等待复制…');
      renderBrushPop();
      return;
    }
    if (hasSel) {
      const buf = tb.brushBuf;
      const hasInline = !!(buf && buf.inline && buf.inline.length);
      const hasStyle = !!(buf && buf.style && Object.keys(buf.style).length);
      if (!hasInline && !hasStyle) {
        LMApp.toast('格式刷里还没有格式：点工具栏下方的「复制格式」，先复制一段带格式的文字');
        renderBrushPop();
        return;
      }
      if (hasInline) {
        const k = buf.inline[0];
        let bi = null;
        try {
          const hn = sel.getRangeAt(0).startContainer;
          const hw = (hn.nodeType === 1 ? hn : hn.parentNode).closest('.block-wrap[data-idx]');
          if (hw) bi = +hw.getAttribute('data-idx');
        } catch (e2) { /* noop */ }
        /* 匹配失败不消耗格式刷（保持开启）；跨块拖选兜底：起点块没刷上再试终点块 */
        let ok = applyInline(k, true, bi);
        if (!ok) {
          try {
            const en = sel.getRangeAt(0).endContainer;
            const ew = (en.nodeType === 1 ? en : en.parentNode).closest('.block-wrap[data-idx]');
            if (ew) { const bi2 = +ew.getAttribute('data-idx'); if (bi2 !== bi) ok = applyInline(k, true, bi2); }
          } catch (e3) { /* noop */ }
        }
        if (ok) LMApp.toast('已粘贴格式（格式刷保持开启，可继续刷）');
        renderBrushPop();
        return;
      }
      /* 只有块样式 → 落到下面的整块套用 */
    }
    /* 整块套用只发生在「真的点在某个内容块上」：点工具条 / 气泡 / 弹窗等界面元素时，
       pressBi / tb.hero 都是老状态，不许把样式误刷到不相关的块上 */
    if (e.target && e.target.closest && e.target.closest('#editBar,#brushPop,#navGear,#gearPop,.popover,#adminBar,.modal-mask,.block-tools,.blk-typebar,.blk-handles,.crop-bar')) { renderBrushPop(); return; }
    const st = tb.hero ? heroStyleRef() : null;
    const pb = (tb.pressBi != null && pageOf()) ? pageOf().blocks[tb.pressBi] : null;
    const bb = tb.hero ? null : pb;
    const buf = tb.brushBuf;
    const stBuf = (buf && buf.style && Object.keys(buf.style).length) ? buf.style : null;
    if (tb.hero && st && stBuf) {
      Object.keys(stBuf).forEach(function (k2) { st[k2] = stBuf[k2]; });
      LMApp.commit({ silent: true }); LMApp.toast('样式已应用到标题（格式刷保持开启）');
    } else if (bb && isTextType(bb) && stBuf) {
      bb.style = JSON.parse(JSON.stringify(stBuf));
      if (tb.active !== tb.pressBi) { tb.active = tb.pressBi; renderToolbar(); }
      syncBlockDom();
      LMApp.commit({ silent: true, rerender: false }); LMApp.toast('已套用到整块（格式刷保持开启）');
    }
    renderBrushPop();
  });

  /* ---------- 插入辅助 ---------- */
  /* 插入锚点：优先当前选中块；否则取视口垂直中点所在的块（翻到哪里就插到哪里，不再总在末尾）；
     视口中点还在标题区（没有任何块）→ 插到最前面，也不掉到最底部 */
  function insertAnchor() {
    if (tb.active != null) return tb.active;
    const midY = window.innerHeight * 0.5;
    let best = -1;
    document.querySelectorAll('.blocks > .block-wrap:not(.free-box)').forEach(function (w) {
      const r = w.getBoundingClientRect();
      if (r.top <= midY && r.bottom > 0) best = +w.getAttribute('data-idx');
    });
    return best >= 0 ? best : 0;
  }
  function insertAt(nb, focusText, msg) {
    const sy = window.scrollY || window.pageYOffset || 0;
    const at = LMApp.insertBlock(nb, insertAnchor());
    if (at < 0) return;
    if (focusText) {
      const el = document.querySelector('.block-wrap[data-idx="' + at + '"] [data-edit]');
      if (el) { try { el.focus({ preventScroll: true }); } catch (e1) { el.focus(); } }
    }
    /* 焦点/重排把视口滚走了 → 原地拉回：翻到哪里就加到哪里，屏幕一寸不动 */
    if (Math.abs((window.scrollY || window.pageYOffset || 0) - sy) > 2) window.scrollTo(0, sy);
    if (msg) LMApp.toast(msg);
  }
  function freeBoxDefault() {
    /* 新文本框默认出现在当前视口中部（而不是页面固定位置） */
    const col = document.querySelector('.blocks');
    let y = 240;
    if (col) y = Math.round(window.innerHeight * 0.45 - col.getBoundingClientRect().top);
    return { type: 'paragraph', size: 'normal', text: '', style: {}, free: { x: 14, y: Math.max(20, y), w: 44 } };
    /* ★ text 置空（修复㉙）：渲染层对空段落自带 data-ph 占位（css :empty::before）——
       「双击输入文字」不再作为真文字写进数据，点进去直接打字，不用先手动删掉那几个字 */
  }
  /* 插入图片：本地文件（Base64）或链接；已选中图片块时直接替换 */
  function imgInsertPop(anchor) {
    popover(anchor, '<div class="pop-title">插入图片</div>'
      + '<label class="pop-row pop-btn">📁 选择本地图片<input type="file" id="imgFile" accept="image/*" hidden></label>'
      + '<label class="pop-row">🔗 链接 <input class="input" id="imgUrl" placeholder="https://… 或 images/xx.png"></label>'
      + '<button type="button" class="btn btn-primary" id="imgUrlGo" style="margin-top:10px">插入链接图片</button>'
      + '<p class="pop-note">已选中图片块时，插入会替换它的图。本地图片存在浏览器里，大于 2.5MB 请先压缩。</p>',
      function (root) {
        const useSrc = function (src) {
          const ib = imgBlock();
          if (ib && ib.type === 'image') { ib.src = src; LMApp.commit({ silent: true }); LMApp.toast('图片已更新'); return; }
          insertAt({ type: 'image', src: src, caption: '', widthPct: 68 }, false, '图片已插入：悬停右上角 ⚙ 可加说明');
        };
        root.querySelector('#imgFile').addEventListener('change', function (e) {
          const f = e.target.files[0];
          if (!f) return;
          if (f.size > 2600 * 1024) { LMApp.toast('图片太大（' + Math.round(f.size / 1024) + 'KB），请先压缩再插入'); return; }
          const r = new FileReader();
          r.onload = function () { closePop(); useSrc(r.result); };
          r.readAsDataURL(f);
        });
        root.querySelector('#imgUrlGo').addEventListener('click', function () {
          const u = root.querySelector('#imgUrl').value.trim();
          if (!u) { LMApp.toast('请填写图片链接'); return; }
          closePop(); useSrc(u);
        });
      }, 'imgins');
  }

  /* ---------- 自由文本框：移动 / 缩放 ---------- */
  function blockOf(wrap) {
    const page = pageOf();
    if (!page || !wrap) return null;
    return page.blocks[+wrap.getAttribute('data-idx')] || null;
  }
  /* 拖动期间：屏幕上下边缘自动滚页 + 按住时滚滚轮不脱手（comp 为累计滚动补偿） */
  function edgeScroller(onComp) {
    let dir = 0, raf = null, comp = 0;
    /* ★ 根因修复（拖动“飞到鼠标下面 / 脱手”）：comp 只累计“真实发生的”滚动量（scrollY 前后差）。
       旧写法按请求数累加 —— 页面滚到顶/底后 scrollBy 被截断（实际滚动 = 0），补偿却每帧虚增，
       框就以极快速度冲出鼠标下方；平滑滚动动画期间同理。读实际差值后两种情况都分毫不差 */
    const scrollDelta = function (dy) {
      const before = window.scrollY || window.pageYOffset || 0;
      window.scrollBy(0, dy);
      comp += (window.scrollY || window.pageYOffset || 0) - before;
    };
    const wheel = function (ev) { ev.preventDefault(); scrollDelta(ev.deltaY); onComp(); };
    const tick = function () {
      if (dir) { scrollDelta(dir); onComp(); }
      raf = requestAnimationFrame(tick);
    };
    return {
      comp: function () { return comp; },
      feed: function (clientY) {
        const m = 80, vh = window.innerHeight;
        dir = clientY < m ? -Math.ceil((m - clientY) / 5)
          : (clientY > vh - m ? Math.ceil((clientY - (vh - m)) / 5) : 0);
      },
      /* 拖拽期间强制“立即滚动”（临时关闭全局平滑滚动）：scrollBy 立刻生效，滚动补偿 comp 才分毫不差；
         否则 html{scroll-behavior:smooth} 让实际滚动位置落后于补偿值 → 框“飞到鼠标下方 / 脱手 / 中间有位移” */
      start: function () {
        document.documentElement.style.scrollBehavior = 'auto';
        window.addEventListener('wheel', wheel, { passive: false });
        raf = requestAnimationFrame(tick);
      },
      stop: function () {
        window.removeEventListener('wheel', wheel);
        if (raf) cancelAnimationFrame(raf);
        document.documentElement.style.scrollBehavior = '';
      }
    };
  }
  /* 自由文本框之间的重叠：被拖的框让位到对方下方；
     与文档流块的重叠交给 LMApp.adjustFreeLayout() 动态占位（紧凑让位、移走自动回弹） */
  function resolveFreeOverlap(wrap, me) {
    if (!me || !me.free) return;
    const col = document.querySelector('.blocks');
    if (!col) return;
    const colTop = col.getBoundingClientRect().top;
    const fr = wrap.getBoundingClientRect();
    let best = null, bestArea = 0;
    document.querySelectorAll('.blocks > .block-wrap.free-box').forEach(function (w2) {
      if (w2 === wrap) return;
      const r2 = w2.getBoundingClientRect();
      const ox = Math.min(fr.right, r2.right) - Math.max(fr.left, r2.left);
      const oy = Math.min(fr.bottom, r2.bottom) - Math.max(fr.top, r2.top);
      if (ox > 16 && oy > 10 && ox * oy > bestArea) { bestArea = ox * oy; best = r2; }
    });
    if (!best) return;
    me.free.y = Math.max(0, Math.round(best.bottom - colTop) + 16);
    wrap.style.top = me.free.y + 'px';
    LMApp.toast('已下移文本框，避免与另一个文本框重叠');
  }
  /* ★ 全量防重叠：所有自由框两两检查，后一个（y 更大的）自动推到前一个下方，
     多轮收敛 —— 修「两个框并排后把上面的移下来，几个框叠在一起」。
     ★★ 计算全部走数据模型（free.x/y/w + offsetHeight），绝不读 getBoundingClientRect：
     框的 top 有 .4s 过渡，拖完瞬间矩形还在动画中途，按矩形推挤会算出互相矛盾的 y
     并把坏位置写进数据（页面上就是「几个框叠成一坨」）。模型值是落定的，纯计算必然收敛。
     只动 free.y / style.top，不碰 🔒 YIELD-V4 的让位引擎（margin/freeDecide 一概不碰） */
  function resolveFreeOverlaps(wrap, me, quiet, force) {
    const col = document.querySelector('.blocks');
    if (!col) return;
    const colW = col.clientWidth || 1;
    const boxes = [];
    col.querySelectorAll(':scope > .block-wrap.free-box').forEach(function (w2) {
      const b2 = blockOf(w2);
      if (!b2 || !b2.free) return;
      boxes.push({
        w: w2, b: b2,
        x: (+b2.free.x || 0), wp: Math.min(100, Math.max(10, +b2.free.w || 40)),
        y: (+b2.free.y || 0), h: w2.offsetHeight || 60
      });
    });
    if (boxes.length < 2) return;
    let moved = false;
    for (let pass = 0; pass < 5; pass++) {
      let any = false;
      boxes.sort(function (a, c) { return a.y - c.y; });
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const A = boxes[i], B = boxes[j];
          /* 同一并排组的框默认同处一行：拼位过程不互推（防「松手时行被拆散、下方乱跳」）。
             ★ force（调宽松手）：扩宽就是要挤开旁边 —— 同组对不再跳过，被压的框挤到本框
             下一行（下方的文档流块由 adjustFreeLayout 自动让位），级联循环继续排开 */
          if (!force && A.b.free.g != null && A.b.free.g === B.b.free.g) continue;
          if (A.y + A.h <= B.y + 0.5) continue; /* A 完全在 B 上方，无重叠 */
          const ax = A.x / 100 * colW, aw = A.wp / 100 * colW;
          const bx = B.x / 100 * colW, bw = B.wp / 100 * colW;
          const ox = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
          const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
          if (ox > 16 && oy > 10) {
            B.y = Math.max(0, Math.round(A.y + A.h + 16));
            B.b.free.y = B.y;
            B.w.style.top = B.y + 'px';
            moved = true; any = true;
          }
        }
      }
      if (!any) break;
    }
    if (moved && !quiet) LMApp.toast(force ? '已把调宽后压住的并排框挤到下一行（下方内容已自动让位）' : '已自动下移重叠的文本框');
  }
  function startFreeMove(e, wrap) {
    const b = blockOf(wrap);
    if (!b || !b.free) return;
    e.preventDefault();
    /* ★ 修复（并排/贴边后抓框「和鼠标有位移、乱飘」）：抓取基线必须取「视觉位置」。
       框的 left/top 带 0.4s 过渡（并排重排、上一次拖完 resolveFreeOverlaps 的推位、
       ↑↓整格移动都会让框处在动画中），此刻抓框：数据位置 ≠ 屏幕位置 ——
       旧版直接拿 b.free.x/y 当基线，框先瞬移到数据位置（=位移），之后带着恒定偏移跟鼠标（=乱飘）。
       现在：在过渡还开着（.free-drag 关过渡之前）先量一次框的当前视觉矩形，
       把基线校准成「数据位置 + 视觉修正量」—— 布局静止时修正量恒为 0，行为与旧版完全一致 */
    const col = document.querySelector('.blocks');
    const cr = col ? col.getBoundingClientRect() : null;
    const wr = wrap.getBoundingClientRect();
    const colW = (col ? cr.width : window.innerWidth) || 1;
    const fxData = +b.free.x || 0, fyData = +b.free.y || 0;
    let fx0 = fxData, fy0 = fyData;
    if (cr && col) {
      /* 绝对定位子元素锚在容器 padding 盒：原点 = 容器矩形左上 + 边框宽（clientTop/clientLeft） */
      const ox = (wr.left - (cr.left + col.clientLeft)) - fxData / 100 * colW;
      const oy = (wr.top - (cr.top + col.clientTop)) - fyData;
      fx0 = Math.round((fxData + ox / colW * 100) * 10) / 10;
      fy0 = Math.round(fyData + oy);
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    /* ★ 根因修复（一按手柄框就“飞到底下”）：自由框绝不能复用块排序的 .dragging 类 ——
       那个类带 position:fixed + scale(1.01)（悬浮克隆专用），框一挂上就以「视口坐标」解释
       inline 的 top:几百px → 瞬间飞出屏幕下方，表格让位量随之爆炸、不停抖动。
       自由框改用专属 .free-drag：只关过渡，绝不动定位 */
    wrap.classList.add('free-drag');
    /* 🔒 YIELD-V4 锁定接入点①：拍「自然基线」快照（拖拽期间重算只用快照，勿改） */
    if (window.LMApp && LMApp.beginFreeDrag) LMApp.beginFreeDrag();
    /* 拖动即选中该框：拖完直接点工具栏改字号/颜色不再“没反应” */
    const myIdx = +wrap.getAttribute('data-idx');
    if (!isNaN(myIdx) && tb.active !== myIdx) selectBlock(myIdx);
    const x0 = e.clientX, y0 = e.clientY;
    let lastX = e.clientX, lastY = e.clientY;
    const sc = edgeScroller(apply);
    function apply() {
      let nx = Math.round(clamp(fx0 + (lastX - x0) / colW * 100, 0, 96) * 10) / 10;
      /* ★ 并排组内的框：只在本行内左右滑动（y 锁定在组行上）——
         行不被拆散、下方内容的让位基线稳定，松手不再「跳来跳去」；
         拖近组内原始位置（±1.5%）自动吸附，轻松「拼回去」。
         只是拖动约束，🔒 YIELD-V4 让位引擎一字未动 */
      if (b.free.g != null) {
        if (b.free.gx0 != null && Math.abs(nx - b.free.gx0) <= 1.5) nx = b.free.gx0;
        b.free.x = nx;
        wrap.style.left = b.free.x + '%';
        if (window.LMApp && LMApp.adjustFreeLayout) LMApp.adjustFreeLayout(); /* 🔒 锁定接入点②：每帧直调 */
        return;
      }
      b.free.x = nx;
      b.free.y = Math.max(0, Math.round(fy0 + (lastY - y0) + sc.comp()));
      wrap.style.left = b.free.x + '%';
      wrap.style.top = b.free.y + 'px';
      /* ★ 实时让位 v4：每次移动都重算 —— 会话内是「快照 + 框实时位置」纯计算，开销极小；
         不读流块布局 → margin 过渡从不被打断，每帧从当前动画值重定目标 = 苹果式平滑跟随。
         （v3 的 110ms 节流 + 测量期挂/摘过渡开关会取消-重启动画，正是发抖根因，已废）
         🔒 YIELD-V4 锁定接入点②：每帧直调，勿恢复节流 */
      if (window.LMApp && LMApp.adjustFreeLayout) LMApp.adjustFreeLayout();
    }
    /* ★ 抓框瞬间先落一帧让位：freeScan 清掉旧 margin（自然基线测量）后，立刻按「框在抓取点」
       的位置重算填回 —— 清与填在同一个任务里完成，浏览器一帧中间态都不画。
       并排后框大面积压着下方内容时，旧版要等第一帧 mousemove 才重新推回去 →
       抓框瞬间下方内容先弹起再压回（=「下面的东西全乱掉」）；现在抓框即静止，随拖随推，全程平滑 */
    apply();
    const mv = function (ev) {
      lastX = ev.clientX; lastY = ev.clientY;
      apply();
      sc.feed(ev.clientY);
    };
    const up = function () {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      sc.stop();
      wrap.classList.remove('free-drag');
      resolveFreeOverlaps(wrap, b);
      if (window.LMApp && LMApp.endFreeDrag) LMApp.endFreeDrag();
      else if (window.LMApp && LMApp.adjustFreeLayout) LMApp.adjustFreeLayout();
      LMApp.commit({ silent: true, rerender: false });
      markSaved();
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
    sc.start();
  }

  function startFreeResize(e, h) {
    const wrap = h.closest('.free-box');
    const b = blockOf(wrap);
    if (!b || !b.free) return;
    e.preventDefault();
    /* 同 startFreeMove：用专属 .free-drag，绝不复用带 position:fixed 的 .dragging */
    wrap.classList.add('free-drag');
    const dir = h.getAttribute('data-h');
    /* 缩放也视为选中该框（工具栏字号/颜色随之可用） */
    const myIdx = +wrap.getAttribute('data-idx');
    if (!isNaN(myIdx) && tb.active !== myIdx) selectBlock(myIdx);
    const x0 = e.clientX, y0 = e.clientY;
    const f0 = { x: +b.free.x || 0, w: +b.free.w || 40, h: b.free.h ? +b.free.h : wrap.offsetHeight };
    const col = document.querySelector('.blocks');
    const colW = (col ? col.getBoundingClientRect().width : window.innerWidth) || 1;
    let lastX = e.clientX, lastY = e.clientY;
    const sc = edgeScroller(apply);
    function apply() {
      const dx = (lastX - x0) / colW * 100;
      const dy = lastY - y0 + ((dir === 's' || dir === 'se') ? sc.comp() : 0);
      let x = f0.x, w = f0.w;
      if (dir === 'e' || dir === 'se') w = clamp(f0.w + dx, 10, 100 - f0.x);
      if (dir === 'w') {
        const nx = clamp(f0.x + dx, 0, f0.x + f0.w - 10);
        w = f0.x + f0.w - nx; x = nx;
      }
      b.free.x = Math.round(x * 10) / 10;
      b.free.w = Math.round(w * 10) / 10;
      if (dir === 's' || dir === 'se') b.free.h = Math.max(50, Math.round(f0.h + dy));
      wrap.style.left = b.free.x + '%';
      wrap.style.width = b.free.w + '%';
      /* ★ 同 startFreeMove：实时让位 v2（连续模型 + 滞回，低频重算，平滑跟随不抖） */
      wrap.style.height = b.free.h ? b.free.h + 'px' : '';
      /* ★ 同 startFreeMove v4：每帧直调（🔒 YIELD-V4 锁定接入点③，勿恢复节流） */
      if (window.LMApp && LMApp.adjustFreeLayout) LMApp.adjustFreeLayout();
    }
    const mv = function (ev) {
      lastX = ev.clientX; lastY = ev.clientY;
      apply();
      if (dir === 's' || dir === 'se') sc.feed(ev.clientY);
    };
    const up = function () {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      sc.stop();
      wrap.classList.remove('free-drag');
      /* ★ force=true（修复㉙）：调宽松手时同组并排框也参与互挤 —— 向右/向左扩宽压到旁边
         的并排框就把对方挤到下一行（旧版同组跳过 → 两个框叠在一起），被挤的框下方的
         内容块再由让位引擎自动推开 */
      resolveFreeOverlaps(wrap, b, false, true);
      if (window.LMApp && LMApp.endFreeDrag) LMApp.endFreeDrag();
      else if (window.LMApp && LMApp.adjustFreeLayout) LMApp.adjustFreeLayout();
      LMApp.commit({ silent: true, rerender: false });
      markSaved();
      LMApp.toast('文本框已调整（字号固定，用工具栏「字号」下拉修改）');
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
    sc.start();
  }

  function swatchPop(anchor, prop, title, list, isColor) {
    const html = '<div class="pop-title">' + title + '</div><div class="swatches">'
      + list.map(function (c) {
          return '<button type="button" class="sw' + (c === '' ? ' sw-none' : '') + '" data-v="' + LMApp.esc(c) + '"'
            + (c ? ' style="background:' + c + '"' : '') + '>' + (c ? '' : '∅') + '</button>';
        }).join('')
      + '</div>'
      + (isColor ? '<label class="pop-custom">自定义 <input type="color" class="sw-custom"></label>' : '');
    popover(anchor, html, function (root) {
      root.querySelectorAll('.sw').forEach(function (sw) {
        sw.addEventListener('click', function () {
          closePop();
          const v = sw.getAttribute('data-v');
          if ((prop === 'color' || prop === 'hl') && applyInlineSwatch(prop, v)) return;
          if (applyInlineSwatchBlock(prop, v)) return; /* ★ 有选中文字 → 只改选中部分，不动整段 */
          applyStyle(prop, v);
        });
      });
      const ci = root.querySelector('.sw-custom');
      if (ci) {
        let ciBusy = false; /* 拖动取色中：只预览，不记撤销/不广播 —— 确认后才算一次修改步骤 */
        ci.addEventListener('input', function () {
          ciBusy = true;
          if ((prop === 'color' || prop === 'hl') && applyInlineSwatch(prop, ci.value, true)) return;
          if (applyInlineSwatchBlock(prop, ci.value, true)) return; /* ★ 同上：有选中文字只改选中部分 */
          applyStyle(prop, ci.value, true, true);
        });
        const settle = function () { /* 确认（关闭系统取色器 / 关闭弹层）→ 补一次提交 = 只记一步撤销 */
          if (!ciBusy) return;
          ciBusy = false;
          try { LMApp.commit({ silent: true }); markSaved(); LMApp.toast('已应用自定义颜色'); } catch (e) { /* noop */ }
        };
        ci.addEventListener('change', settle);
        document.addEventListener('lm-pop-close', settle, { once: true });
      }
    }, prop);
  }
  function gradPop(anchor) {
    const html = '<div class="pop-title">渐变色</div><div class="swatches">'
      + GRADS.map(function (g) {
          return g[0] === ''
            ? '<button type="button" class="sw sw-none" data-v="">∅</button>'
            : '<button type="button" class="sw grad-b grad-b' + g[0] + '" data-v="' + g[0] + '"></button>';
        }).join('') + '</div>';
    popover(anchor, html, function (root) {
      root.querySelectorAll('.sw').forEach(function (sw) {
        sw.addEventListener('click', function () {
          closePop();
          const gv = sw.getAttribute('data-v');
          const done = applyInlineSwatch('grad', gv) || applyInlineSwatchBlock('grad', gv); /* ★ 表格单元格里选中文字 → 直接上渐变 */
          if (!done) applyStyle('grad', gv);
          if (done) { /* 应用后立刻折叠选区：避开 Chrome 对「选中态渐变字」的整块底色渲染（否则像文字消失/变小） */
            try { const s2 = window.getSelection(); if (s2 && s2.rangeCount) s2.collapseToEnd(); } catch (e2) { /* noop */ }
          }
        });
      });
    }, 'grad');
  }
  function pickGrid() {
    const anchor = document.querySelector('[data-tb="grid"]') || document.body;
    let cells = '';
    for (let r = 1; r <= 8; r++) for (let c = 1; c <= 10; c++) cells += '<span class="gp" data-r="' + r + '" data-c="' + c + '"></span>';
    popover(anchor, '<div class="pop-title">选择表格大小（像 Word 一样划过再点）</div>'
      + '<div class="grid-pick">' + cells + '</div><div class="gp-lab" id="gpLab">拖动选择行列</div>',
      function (root) {
        root.addEventListener('mouseover', function (e) {
          const g = e.target.closest('.gp'); if (!g) return;
          const r = +g.getAttribute('data-r'), c = +g.getAttribute('data-c');
          root.querySelectorAll('.gp').forEach(function (el) {
            el.classList.toggle('on', +el.getAttribute('data-r') <= r && +el.getAttribute('data-c') <= c);
          });
          root.querySelector('#gpLab').textContent = c + ' 列 × ' + r + ' 行';
        });
        root.addEventListener('click', function (e) {
          const g = e.target.closest('.gp'); if (!g) return;
          const r = +g.getAttribute('data-r'), c = +g.getAttribute('data-c');
          closePop();
          const headers = [], body = [];
          for (let k = 1; k <= c; k++) headers.push('列' + k);
          for (let k = 0; k < r; k++) body.push(headers.map(function () { return ''; })); /* ★ 行数修复：按所选行数建满（旧版写死 1 行） */
          insertAt({ type: 'table', title: '', headers: headers, rows: body }, false, '已插入 ' + c + ' 列 × ' + r + ' 行表格：点击格子直接输入；表头竖条拖动调列宽');
        });
      }, '');
  }

  /* ---------- 图片 / 表格直接操作 ---------- */
  function removeHandles() {
    document.querySelectorAll('.img-box.selected').forEach(function (b2) { b2.classList.remove('selected'); });
    document.querySelectorAll('.img-handles').forEach(function (h) { h.remove(); });
    document.querySelectorAll('.block-wrap.selected').forEach(function (w) { w.classList.remove('selected'); });
    document.querySelectorAll('.blk-handles').forEach(function (h) { h.remove(); });
  }
  function addHandles(box) {
    removeHandles();
    box.classList.add('selected');
    const hd = document.createElement('div');
    hd.className = 'img-handles';
    hd.innerHTML = '<span class="ih" data-h="nw"></span><span class="ih" data-h="ne"></span>'
      + '<span class="ih" data-h="sw"></span><span class="ih" data-h="se"></span>'
      + '<span class="ih-rot" title="拖动旋转"></span>';
    box.appendChild(hd);
  }
  function refreshSel() {
    if (tb.imgSel == null) { removeHandles(); return; }
    const box = document.querySelector('[data-imgsel="' + tb.imgSel + '"]');
    if (box) addHandles(box);
    else { tb.imgSel = null; removeHandles(); }
  }
  /* ---------- Word 式块选中：点击任意内容块 → 蓝框 + 四角手柄（拖动调宽） ---------- */
  function selectBlock(idx) {
    tb.active = idx;
    tb.hero = null; tb.heroField = null; tb.heroTextField = null; /* 点了内容块就退出大标题模式，避免格式操作误入标题 */
    const b = activeBlock();
    tb.imgSel = (b && b.type === 'image') ? idx : null;
    renderToolbar();
  }
  /* 块类型切换：标题/正文块可互相转换（大标题 ↔ 小标题 ↔ 正文解释），让页面结构自由编辑 */
  const TYPE_OPTS = [
    { t: 'h12', name: '大标题', match: function (b) { return b.type === 'heading' && (+b.level || 2) <= 2; }, apply: function (b) { b.type = 'heading'; b.level = 1; delete b.size; } },
    { t: 'h3', name: '小标题', match: function (b) { return b.type === 'heading' && (+b.level || 2) >= 3; }, apply: function (b) { b.type = 'heading'; b.level = 3; delete b.size; } },
    { t: 'p', name: '正文解释', match: function (b) { return b.type === 'paragraph'; }, apply: function (b) { b.type = 'paragraph'; delete b.level; } }
  ];
  function refreshHandles() {
    document.querySelectorAll('.block-wrap.selected').forEach(function (w) { w.classList.remove('selected'); });
    document.querySelectorAll('.blk-handles,.blk-typebar').forEach(function (h) { h.remove(); });
    const b = activeBlock();
    if (!b || b.free || b.type === 'image') { refreshSel(); return; }
    const wrap = document.querySelector('.block-wrap[data-idx="' + tb.active + '"]');
    if (!wrap) { refreshSel(); return; }
    wrap.classList.add('selected');
    if (b.type === 'heading' || b.type === 'paragraph') {
      const bar = document.createElement('div');
      bar.className = 'blk-typebar';
      bar.innerHTML = TYPE_OPTS.map(function (o) {
        return '<button type="button" data-tt="' + o.t + '"' + (o.match(b) ? ' class="on"' : '') + '>' + o.name + '</button>';
      }).join('');
      wrap.appendChild(bar);
    }
    const hd = document.createElement('div');
    hd.className = 'blk-handles';
    hd.innerHTML = '<span class="bh" data-h="nw"></span><span class="bh" data-h="ne"></span>'
      + '<span class="bh" data-h="sw"></span><span class="bh" data-h="se"></span>';
    wrap.appendChild(hd);
    refreshSel();
  }
  function startBlockResize(e, h) {
    const wrap = h.closest('.block-wrap'); if (!wrap) return;
    const page = pageOf(); if (!page) return;
    const b = page.blocks[+wrap.getAttribute('data-idx')];
    if (!b || b.free || b.type === 'image') return;
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX;
    const dir = h.getAttribute('data-h');
    const col = document.querySelector('.blocks');
    const colW = (col ? col.getBoundingClientRect().width : window.innerWidth) || 1;
    const w0 = (b.width == null ? 100 : +b.width);
    const mv = function (ev) {
      let d = (ev.clientX - x0) / colW * 100;
      if (dir === 'nw' || dir === 'sw') d = -d;
      b.width = clamp(Math.round((w0 + d) * 10) / 10, 20, 100);
      wrap.style.width = b.width + '%';
    };
    const up = function () {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      LMApp.commit({ silent: true, rerender: false });
      LMApp.toast('宽度 ' + Math.round(b.width) + '%，四角可再拖');
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  }
  /* ---------- 块拖拽排序：拖动让位动画 + 屏幕边缘自动滚页 ---------- */
  function startBlockDrag(e, handle) {
    const wrap = handle.closest('.block-wrap');
    const page = pageOf();
    if (!wrap || !page || wrap.classList.contains('free-box')) return;
    const from = +wrap.getAttribute('data-idx');
    if (isNaN(from) || from < 0 || from >= page.blocks.length) return;
    if (page.blocks.length < 2) { LMApp.toast('只有一个内容块，无需排序'); return; }
    e.preventDefault(); e.stopPropagation();
    closePop();
    if (tb.active != null || tb.imgSel != null) { tb.active = null; tb.imgSel = null; removeHandles(); renderToolbar(); }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

    const r0 = wrap.getBoundingClientRect();
    const origStyle = wrap.getAttribute('style') || '';
    const ph = document.createElement('div');
    ph.className = 'block-wrap drag-ph';
    ph.style.height = Math.max(40, r0.height) + 'px';
    wrap.parentNode.insertBefore(ph, wrap);
    wrap.classList.add('dragging');
    wrap.style.width = r0.width + 'px';
    wrap.style.left = r0.left + 'px';
    wrap.style.top = r0.top + 'px';
    document.body.classList.add('block-dragging');

    const offX = e.clientX - r0.left, offY = e.clientY - r0.top;
    let scrollDir = 0, raf = null, moved = false, lastY = e.clientY;

    function flowList() {
      return Array.prototype.filter.call(
        document.querySelectorAll('.blocks > .block-wrap'),
        function (w) { return w !== wrap && !w.classList.contains('free-box'); }
      );
    }
    function reorder(clientY) {
      const list = flowList();
      let k = 0;
      for (let j = 0; j < list.length; j++) {
        const rr = list[j].getBoundingClientRect();
        if (clientY > rr.top + rr.height / 2) k = j + 1;
      }
      const ref = list[k] || null;
      if (ref === ph || ph.nextSibling === ref) return;
      const others = list.filter(function (w) { return w !== ph; }).map(function (w) {
        return { w: w, top: w.getBoundingClientRect().top };
      });
      ph.parentNode.insertBefore(ph, ref);
      others.forEach(function (o) {
        const d = o.top - o.w.getBoundingClientRect().top;
        if (!d) return;
        o.w.style.transition = 'none';
        o.w.style.transform = 'translateY(' + d + 'px)';
        void o.w.offsetHeight;
        o.w.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)';
        o.w.style.transform = '';
      });
    }
    function tick() {
      if (scrollDir) { window.scrollBy(0, scrollDir); reorder(lastY); }
      raf = requestAnimationFrame(tick);
    }
    const mv = function (ev) {
      lastY = ev.clientY;
      moved = true;
      wrap.style.left = (ev.clientX - offX) + 'px';
      wrap.style.top = (ev.clientY - offY) + 'px';
      const m = 80, vh = window.innerHeight;
      if (ev.clientY < m) scrollDir = -Math.ceil((m - ev.clientY) / 5);
      else if (ev.clientY > vh - m) scrollDir = Math.ceil((ev.clientY - (vh - m)) / 5);
      else scrollDir = 0;
      reorder(ev.clientY);
    };
    const finish = function (apply) {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      document.removeEventListener('keydown', esc);
      if (raf) cancelAnimationFrame(raf);
      document.body.classList.remove('block-dragging');
      wrap.classList.remove('dragging');
      wrap.setAttribute('style', origStyle);
      if (ph.parentNode) ph.parentNode.insertBefore(wrap, ph);
      if (ph.parentNode) ph.remove();
      if (!apply || !moved) return; /* 没拖动 = 数据没变：恢复现场即可，绝不整页重绘（render() 会重放入场动画 → 松手整页闪） */
      const order = Array.prototype.map.call(
        document.querySelectorAll('.blocks > .block-wrap:not(.free-box)'),
        function (w) { return +w.getAttribute('data-idx'); }
      ).filter(function (n) { return !isNaN(n); });
      const same = order.every(function (n, i2) { return n === i2; });
      if (same) return; /* 拖回原位 = 数据没变：同理不重绘（防闪屏） */
      /* 只重排文档流块；自由文本框（绝对定位）对象保留、集中到数组尾部（渲染先后不影响其摆放位置） */
      const frees = page.blocks.filter(function (b3) { return b3 && b3.free; });
      page.blocks = order.map(function (n) { return page.blocks[n]; }).concat(frees);
      /* DOM 顺序已是最终结果：只把 data-idx 归位（与新下标对齐）+ 静默落盘 + 重算一次让位布局，
         全程零整页重建 —— 整页 innerHTML 重建会重放入场动画，正是「松手整页闪」的根因 */
      document.querySelectorAll('.blocks > .block-wrap:not(.free-box)').forEach(function (w2, i2) { w2.setAttribute('data-idx', String(i2)); });
      LMApp.commit({ silent: true, rerender: false });
      markSaved();
      if (window.LMApp && LMApp.adjustFreeLayout) LMApp.adjustFreeLayout();
      LMApp.toast('顺序已调整');
    };
    const up = function () { finish(true); };
    const esc = function (ev) { if (ev.key === 'Escape') finish(false); };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
    document.addEventListener('keydown', esc);
    raf = requestAnimationFrame(tick);
    LMApp.toast('拖动调整位置：其他块自动让路，靠近屏幕上下边缘自动滚页（Esc 取消）');
  }
  let guideEl = null;
  function showGuide(x) {
    if (!guideEl) { guideEl = document.createElement('div'); guideEl.id = 'guideV'; document.body.appendChild(guideEl); }
    guideEl.style.left = x + 'px';
    guideEl.style.display = 'block';
  }
  function hideGuide() { if (guideEl) guideEl.style.display = 'none'; }
  function startColDrag(e, grip) {
    const table = grip.closest('table');
    const wrap = grip.closest('.block-wrap');
    const page = pageOf(); if (!page || !wrap) return;
    const b = page.blocks[+wrap.getAttribute('data-idx')]; if (!b || !b.headers) return;
    const i = +grip.getAttribute('data-grip');
    if (i >= b.headers.length - 1) return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = (b.colW && b.colW.length === b.headers.length) ? b.colW.slice() : b.headers.map(function () { return 100 / b.headers.length; });
    if (!b.colW || b.colW.length !== b.headers.length) b.colW = w0;
    const cols = table.querySelectorAll('col');
    const total = table.getBoundingClientRect().width || 1;
    const mv = function (ev) {
      ev.preventDefault();
      const d = (ev.clientX - x0) / total * 100;
      let a = w0[i] + d, c2 = w0[i + 1] - d;
      if (a < 6) { a = 6; c2 = w0[i] + w0[i + 1] - 6; }
      if (c2 < 6) { c2 = 6; a = w0[i] + w0[i + 1] - 6; }
      b.colW[i] = a; b.colW[i + 1] = c2;
      if (cols[i]) cols[i].style.width = a + '%';
      if (cols[i + 1]) cols[i + 1].style.width = c2 + '%';
    };
    const up = function () {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      LMApp.commit({ silent: true, rerender: false });
      LMApp.toast('列宽已调整');
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  }
  function startMove(e, box) {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    tb.imgSel = +box.getAttribute('data-imgsel');
    tb.active = null;
    renderToolbar();
    refreshSel();
    const b = imgBlock(); if (!b) return;
    e.preventDefault();
    const b0 = +b.shift || 0, x0 = e.clientX;
    const r0 = box.getBoundingClientRect();
    const col = document.querySelector('.blocks') || document.getElementById('app');
    const colR = col.getBoundingClientRect();
    const colC = colR.left + colR.width / 2;
    const imgC = r0.left + r0.width / 2;
    let lastShift = b0;
    const mv = function (ev) {
      let s = b0 + (ev.clientX - x0);
      hideGuide();
      if (Math.abs(imgC + (s - b0) - colC) < 12) { s = b0 + (colC - imgC); showGuide(colC); }
      else if (Math.abs((r0.left + (s - b0)) - colR.left) < 12) { s = b0 + (colR.left - r0.left); showGuide(colR.left); }
      else if (Math.abs((r0.right + (s - b0)) - colR.right) < 12) { s = b0 + (colR.right - r0.right); showGuide(colR.right); }
      lastShift = Math.round(s);
      box.style.transform = (lastShift || (+b.rotate || 0))
        ? 'translateX(' + lastShift + 'px)' + ((+b.rotate) ? ' rotate(' + b.rotate + 'deg)' : '')
        : '';
    };
    const up = function () {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      hideGuide();
      if (lastShift !== b0) { b.shift = lastShift; LMApp.commit({ silent: true }); }
      else render();
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  }

  function startRotate(e, box) {
    const b = imgBlock(); if (!b) return;
    e.preventDefault();
    const r0 = box.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    const rot0 = +b.rotate || 0;
    const mv = function (ev) {
      let a = rot0 + (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI - a0);
      [0, 90, 180, 270, -90, -180, -270].forEach(function (t) { if (Math.abs(a - t) < 4) a = t; });
      b.rotate = Math.round(a);
      box.style.transform = ((+b.shift) ? 'translateX(' + b.shift + 'px) ' : '') + 'rotate(' + b.rotate + 'deg)';
      box.setAttribute('data-rot', String(b.rotate));
      /* 拖动中也实时按视觉包围盒收缩，旋转不遮挡上下内容 */
      LMApp.adjustImages();
    };
    const up = function () {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      LMApp.commit({ silent: true });
      LMApp.toast('已旋转 ' + b.rotate + '°（可拖回 0°）');
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  }
  function startResize(e, h) {
    const box = h.closest('[data-imgsel]');
    const b = imgBlock(); if (!box || !b) return;
    e.preventDefault();
    const dir = h.getAttribute('data-h');
    const w0 = +b.widthPct || 68, x0 = e.clientX;
    const col = document.querySelector('.blocks') || document.getElementById('app');
    const colW = col.getBoundingClientRect().width || 1;
    const mv = function (ev) {
      let d = (ev.clientX - x0) / colW * 100;
      if (dir === 'nw' || dir === 'sw') d = -d;
      b.widthPct = Math.round(clamp(w0 + d, 12, 100));
      box.style.width = b.widthPct + '%';
    };
    const up = function () {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      LMApp.commit({ silent: true });
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  }
  function startCrop() {
    const b = imgBlock();
    if (!b || !b.src) { LMApp.toast('请先点 ⚙ 设置图片地址，再裁剪'); return; }
    const box = document.querySelector('[data-imgsel="' + tb.imgSel + '"]');
    const img = box ? box.querySelector('img') : null;
    if (!box || !img) return;
    closePop();
    removeHandles();
    box.classList.add('cropping');
    document.body.style.overflow = 'hidden';
    const ir = img.getBoundingClientRect();
    const ov = document.createElement('div');
    ov.className = 'crop-overlay';
    ov.style.left = ir.left + 'px'; ov.style.top = ir.top + 'px';
    ov.style.width = ir.width + 'px'; ov.style.height = ir.height + 'px';
    const rect = document.createElement('div');
    rect.className = 'crop-rect';
    rect.innerHTML = '<span class="crop-h" data-h="nw"></span><span class="crop-h" data-h="ne"></span>'
      + '<span class="crop-h" data-h="sw"></span><span class="crop-h" data-h="se"></span>';
    ov.appendChild(rect);
    const bar = document.createElement('div');
    bar.className = 'crop-bar';
    bar.innerHTML = '<button type="button" class="btn btn-mini" id="cropReset">↺ 重置</button>'
      + '<button type="button" class="btn btn-ghost" id="cropCancel">取消</button>'
      + '<button type="button" class="btn btn-primary" id="cropDone">✓ 完成裁剪</button>';
    document.body.appendChild(ov);
    document.body.appendChild(bar);
    let st = { l: 0, t: 0, w: 100, h: 100 };
    const setRect = function () {
      rect.style.left = st.l + '%'; rect.style.top = st.t + '%';
      rect.style.width = st.w + '%'; rect.style.height = st.h + '%';
    };
    setRect();
    ov.addEventListener('mousedown', function (e2) {
      const h = e2.target.closest('.crop-h');
      const mode = h ? h.getAttribute('data-h') : (e2.target === rect ? 'move' : null);
      if (!mode) return;
      e2.preventDefault();
      const p0 = { x: e2.clientX, y: e2.clientY };
      const s0 = { l: st.l, t: st.t, w: st.w, h: st.h };
      const or2 = ov.getBoundingClientRect();
      const mv = function (ev) {
        const dx = (ev.clientX - p0.x) / (or2.width || 1) * 100;
        const dy = (ev.clientY - p0.y) / (or2.height || 1) * 100;
        if (mode === 'move') {
          st.l = clamp(s0.l + dx, 0, 100 - s0.w);
          st.t = clamp(s0.t + dy, 0, 100 - s0.h);
        } else {
          if (mode.indexOf('w') >= 0) { const nl = clamp(s0.l + dx, 0, s0.l + s0.w - 5); st.w = s0.w + s0.l - nl; st.l = nl; }
          if (mode.indexOf('e') >= 0) { st.w = clamp(s0.w + dx, 5, 100 - s0.l); }
          if (mode.indexOf('n') >= 0) { const nt = clamp(s0.t + dy, 0, s0.t + s0.h - 5); st.h = s0.h + s0.t - nt; st.t = nt; }
          if (mode.indexOf('s') >= 0) { st.h = clamp(s0.h + dy, 5, 100 - s0.t); }
        }
        setRect();
      };
      const up = function () { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
    const cleanup = function () {
      ov.remove(); bar.remove();
      document.body.style.overflow = '';
      box.classList.remove('cropping');
      refreshSel();
    };
    bar.querySelector('#cropReset').addEventListener('click', function () { st = { l: 0, t: 0, w: 100, h: 100 }; setRect(); });
    bar.querySelector('#cropCancel').addEventListener('click', cleanup);
    bar.querySelector('#cropDone').addEventListener('click', function () {
      const c = { x: +(st.l / 100).toFixed(4), y: +(st.t / 100).toFixed(4), w: +(st.w / 100).toFixed(4), h: +(st.h / 100).toFixed(4) };
      b.crop = (c.w > 0.995 && c.h > 0.995) ? null : c;
      cleanup();
      LMApp.commit({ silent: true });
      LMApp.toast(b.crop ? '已裁剪' : '已恢复完整图片');
    });
    LMApp.toast('拖动四角选择保留区域，拖中间移动选框');
  }

  function borderPop(anchor) {
    const b = imgBlock(); if (!b) return;
    const bd = b.border || { w: 0, color: '#d2d2d7', radius: 18 };
    popover(anchor, '<div class="pop-title">图片边框</div>'
      + '<label class="pop-row">粗细 <select class="input" id="bdW">'
      + [0, 1, 2, 4, 6].map(function (w) {
          return '<option value="' + w + '"' + ((+bd.w || 0) === w ? ' selected' : '') + '>' + (w === 0 ? '无边框' : w + 'px') + '</option>';
        }).join('')
      + '</select></label>'
      + '<label class="pop-row">颜色 <input type="color" id="bdC" value="' + (bd.color || '#d2d2d7') + '"></label>'
      + '<label class="pop-row">圆角 <input type="range" id="bdR" min="0" max="40" value="' + (+bd.radius || 0) + '"><b id="bdRv">' + (+bd.radius || 0) + '</b></label>',
      function (root) {
        const live = function () {
          const box = document.querySelector('[data-imgsel="' + tb.imgSel + '"]');
          if (!box) return;
          const w = +root.querySelector('#bdW').value;
          box.style.borderRadius = root.querySelector('#bdR').value + 'px';
          box.style.border = w > 0 ? w + 'px solid ' + root.querySelector('#bdC').value : 'none';
          const rv = root.querySelector('#bdRv'); if (rv) rv.textContent = root.querySelector('#bdR').value;
        };
        root.addEventListener('input', live);
        root.addEventListener('change', function () {
          live();
          const b2 = imgBlock(); if (!b2) return;
          b2.border = { w: +root.querySelector('#bdW').value, color: root.querySelector('#bdC').value, radius: +root.querySelector('#bdR').value };
          LMApp.commit({ silent: true });
        });
      }, 'border');
  }
  function blurPop(anchor) {
    const b = imgBlock(); if (!b) return;
    popover(anchor, '<div class="pop-title">虚化（模糊）</div>'
      + '<label class="pop-row">程度 <input type="range" id="blV" min="0" max="10" step="0.5" value="' + (+b.blur || 0) + '"><b id="blO">' + (+b.blur || 0) + '</b></label>'
      + '<p class="pop-note">数值越大越朦胧，0 为清晰</p>',
      function (root) {
        const rng = root.querySelector('#blV');
        rng.addEventListener('input', function () {
          root.querySelector('#blO').textContent = rng.value;
          const box = document.querySelector('[data-imgsel="' + tb.imgSel + '"]');
          const im = box ? box.querySelector('img') : null;
          if (im) im.style.filter = (+rng.value) ? 'blur(' + rng.value + 'px)' : '';
        });
        rng.addEventListener('change', function () {
          const b2 = imgBlock(); if (!b2) return;
          b2.blur = +rng.value;
          LMApp.commit({ silent: true });
        });
      }, 'blur');
  }
  function tblOp(k) {
    const b = activeBlock();
    if (!b || b.type !== 'table') { LMApp.toast('请先点击表格的某个单元格'); return; }
    if (k === 'row+') b.rows.push(b.headers.map(function () { return ''; }));
    if (k === 'row-' && b.rows.length > 1) b.rows.pop();
    if (k === 'col+') { b.headers.push('列' + (b.headers.length + 1)); b.rows.forEach(function (r) { r.push(''); }); }
    if (k === 'col-' && b.headers.length > 1) {
      b.headers.pop();
      b.rows.forEach(function (r) { r.pop(); });
      if (b.colW) b.colW = b.colW.slice(0, b.headers.length);
    }
    LMApp.commit({ silent: true });
    LMApp.toast(k === 'row+' ? '已加一行' : k === 'row-' ? '已减一行' : k === 'col+' ? '已加一列' : '已减一列');
  }

  /* ---------- 阅读模式：点击引用文字 → 平滑跳到页尾来源条目；右上浮出「返回」按钮丝滑回到原位 ---------- */
  let refBackY = 0;
  document.addEventListener('click', function (e) {
    const rm = e.target.closest && e.target.closest('.refmark');
    if (!rm || !window.LMApp || LMApp.state.admin) return;
    const id = rm.getAttribute('data-ref');
    const li = document.querySelector('[data-ref-id="' + id + '"]');
    if (!li) { LMApp.toast('本页来源列表里没有这条来源'); return; }
    refBackY = window.scrollY;
    li.scrollIntoView({ behavior: 'smooth', block: 'center' });
    li.classList.remove('ref-flash'); void li.offsetWidth; li.classList.add('ref-flash');
    setTimeout(function () { li.classList.remove('ref-flash'); }, 1800);
    const back = document.getElementById('refBack');
    if (back) back.classList.add('show');
  });
  (function () {
    const b = document.createElement('button');
    b.id = 'refBack'; b.type = 'button'; b.innerHTML = '↩ 返回阅读位置';
    b.addEventListener('click', function () {
      window.scrollTo({ top: refBackY, behavior: 'smooth' });
      b.classList.remove('show');
    });
    document.body.appendChild(b);
  })();
  window.addEventListener('scroll', function () {
    const b = document.getElementById('refBack');
    if (b && Math.abs(window.scrollY - refBackY) < 40) b.classList.remove('show');
  }, { passive: true });

  /* ---------- 工具栏与页面的全局事件 ---------- */
  /* 工具栏溢出时：指针悬在工具栏上滚滚轮 → 横向滑动查看右侧（不影响页面滚动） */
  document.addEventListener('wheel', function (e) {
    if (!window.LMApp || !LMApp.state.admin) return;
    const bar = e.target && e.target.closest ? e.target.closest('#editBar') : null;
    if (!bar || bar.scrollWidth <= bar.clientWidth + 1) return;
    const d = (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) ? e.deltaY : e.deltaX;
    if (!d) return;
    e.preventDefault();
    bar.scrollLeft += d;
  }, { passive: false });
  document.addEventListener('mousedown', function (e) {
    if (!window.LMApp || !LMApp.state.admin) return;
    if (document.querySelector('.crop-overlay')) return;
    const dgh = e.target.closest ? e.target.closest('[data-drag]') : null;
    if (dgh) { startBlockDrag(e, dgh); return; }
    if (e.target.closest && e.target.closest('#editBar,#brushPop,#navGear,#gearPop,.popover,#adminBar,.modal-mask,.block-tools,.crop-bar')) return;
    const fbg = e.target.closest('.fb-grip');
    if (fbg) { startFreeMove(e, fbg.closest('.free-box')); return; }
    const fbh = e.target.closest('.fb-hd');
    if (fbh) { startFreeResize(e, fbh); return; }
    const grip = e.target.closest('.col-grip');
    if (grip) { startColDrag(e, grip); return; }
    const ih = e.target.closest('.ih');
    if (ih) { startResize(e, ih); return; }
    const rot = e.target.closest('.ih-rot');
    if (rot) { const bx = rot.closest('[data-imgsel]'); if (bx) startRotate(e, bx); return; }
    const box = e.target.closest('[data-imgsel]');
    if (box) { startMove(e, box); return; }
    const bh = e.target.closest('.bh');
    if (bh) { startBlockResize(e, bh); return; }
    const bw = e.target.closest('.block-wrap');
    if (bw) {
      const wi = +bw.getAttribute('data-idx');
      /* 勾选模式：点击块 = 选中 / 取消勾选（最多 4 个），不进入单选编辑 */
      if (tb.multi && !isNaN(wi)) {
        const at = tb.multiSel.indexOf(wi);
        if (at >= 0) { tb.multiSel.splice(at, 1); bw.classList.remove('multi-sel'); }
        else if (tb.multiSel.length >= 4) { LMApp.toast('最多并排 4 个块'); }
        else { tb.multiSel.push(wi); bw.classList.add('multi-sel'); }
        renderToolbar();
        return;
      }
      tb.pressBi = isNaN(wi) ? null : wi;
      if (!isNaN(wi) && wi !== tb.active) {
        selectBlock(wi);
        /* 编辑占位锁提前：点选块即广播「我在编辑」，别人立刻看到 ✍ 角标（不必等开始打字） */
        if (window.LMCollab && LMCollab.lockBlock) { try { LMCollab.lockBlock(bw.querySelector('[data-edit],[contenteditable]') || bw); } catch (eL) { /* noop */ } }
      }
      return;
    }
    if (tb.active != null || tb.imgSel != null) {
      tb.active = null; tb.imgSel = null; tb.pressBi = null;
      tb.hero = null; tb.heroField = null; tb.heroTextField = null;
      removeHandles();
      if (window.LMCollab && LMCollab.unlockBlock) { try { LMCollab.unlockBlock(); } catch (eU) { /* noop */ } }
      renderToolbar();
    }
  });
  /* ---------- 触屏桥：手机上把「拖拽把手」的触摸事件桥接成鼠标事件 ----------
     touchmove 不会触发 mousemove，所有靠 mousemove/mouseup 驱动的拖拽
     （自由框移动/缩放、图片缩放旋转、块宽手柄、表格列宽、⠿ 排序）在手机上都会失灵；
     这里统一桥接：touchstart 命中把手 → 合成 mousedown，随后 touchmove/touchend
     → 合成 mousemove/mouseup。仅管理模式生效；桌面端没有触摸序列，互不干扰 */
  var TOUCH_DRAG_SEL = '.fb-grip,.fb-hd,.ih,.ih-rot,.bh,.col-grip,[data-drag],[data-imgsel]';
  var touchDragOn = false;
  document.addEventListener('touchstart', function (e) {
    if (!window.LMApp || !LMApp.state.admin) return;
    if (!e.touches || e.touches.length !== 1) return;
    const t = e.target && e.target.closest ? e.target.closest(TOUCH_DRAG_SEL) : null;
    if (!t) return;
    e.preventDefault(); /* 命中把手：阻止页面滚动，进入拖拽 */
    touchDragOn = true;
    const c = e.touches[0];
    t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: c.clientX, clientY: c.clientY, button: 0 }));
  }, { passive: false });
  document.addEventListener('touchmove', function (e) {
    if (!touchDragOn) return;
    e.preventDefault();
    const c = e.touches[0];
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window, clientX: c.clientX, clientY: c.clientY }));
  }, { passive: false });
  function touchDragEnd(e) {
    if (!touchDragOn) return;
    touchDragOn = false;
    const c = e.changedTouches[0];
    if (!c) return;
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: c.clientX, clientY: c.clientY }));
  }
  document.addEventListener('touchend', touchDragEnd);
  document.addEventListener('touchcancel', touchDragEnd);
  document.addEventListener('focusin', function (e) {
    if (!window.LMApp || !LMApp.state.admin) return;
    /* ★ .lmsel-list（悬浮下拉挂在 body 下）也必须排除：否则点下拉选项的瞬间触发工具栏重建，
       正在被读取的 hidden input / 按钮 / 气泡锚点全部变成游离节点 —— 字号/字体/块设置下拉
       的 change 事件再也冒泡不到 document（表现为「改字号没反应」「改字体没反应」），
       跳转/来源气泡的定位也拿到全零矩形。同一根源，一处根治 */
    if (e.target.closest && e.target.closest('#editBar,#brushPop,#navGear,#gearPop,.popover,#adminBar,.modal-mask,.crop-bar,.lmsel-list')) return;
    const el = e.target.closest ? e.target.closest('[data-bi]') : null;
    let active = el ? +el.getAttribute('data-bi') : null;
    /* 自由文本框：点到框内任意可聚焦处都算选中该框（data-bi 在内层文字上，框体本身没有） */
    if (active == null) {
      const fw = e.target.closest ? e.target.closest('.blocks > .free-box') : null;
      if (fw) active = +fw.getAttribute('data-idx');
    }
    /* Markdown 源码框聚焦 → 视为该 Markdown 块被选中 */
    if (active == null && e.target.classList && e.target.classList.contains('md-src')) {
      const wrap = e.target.closest('.block-wrap');
      if (wrap) active = +wrap.getAttribute('data-idx');
    }
    /* 大标题（首页 / 页面顶部）也纳入样式与行内格式目标；heroField 记住样式字段，heroTextField 记住文字字段 */
    const siteAttr = (e.target.getAttribute && e.target.getAttribute('data-site')) || null;
    const pgAttr = (e.target.getAttribute && e.target.getAttribute('data-pgf')) || null;
    const hfAttr = (e.target.getAttribute && e.target.getAttribute('data-hf')) || null;
    tb.hero = siteAttr ? 'site' : (pgAttr ? 'page' : null);
    tb.heroTextField = siteAttr || pgAttr || null;
    tb.heroField = hfAttr || tb.heroTextField;
    /* 格式刷的消费统一放到 mouseup（区分"拖选文字刷格式"与"点击块套样式"） */
    let changed = (active !== tb.active);
    if (tb.imgSel != null) { tb.imgSel = null; removeHandles(); changed = true; }
    tb.active = active;
    if (changed) renderToolbar();
  });
  document.addEventListener('click', function (e) {
    const btn = e.target.closest && e.target.closest('[data-tb]');
    if (!btn || btn.tagName === 'SELECT' || !window.LMApp || !LMApp.state.admin) return;
    /* 记录点击坐标：万一工具栏在气泡打开前被重建（按钮变游离节点），popover 用它兜底定位 */
    btn._lmXY = { x: e.clientX || 0, y: e.clientY || 0 };
    const k = btn.getAttribute('data-tb');
    switch (k) {
      case 'undo': closePop(); LMApp.undo(); break;
      case 'redo': closePop(); LMApp.redo(); break;
      case 'brush': closePop(); toggleBrush(); break;
      case 'ref': closePop(); openRefPop(btn); break;
      case 'jump':
        try { if (popEl && popEl._for === 'jump') closePop(); openJumpPop(btn); }
        catch (err) { LMApp.toast('跳转功能出错：' + (err && err.message ? err.message : err)); }
        break;
      case 'bold': applyInline('bold'); break;
      case 'italic': applyInline('italic'); break;
      case 'under': applyInline('under'); break;
      case 'strike': applyInline('strike'); break;
      case 'sup': applyInline('sup'); break;
      case 'sub': applyInline('sub'); break;
      case 'clear': clearFmt(); break;
      case 'multi': {
        const turningOn = !tb.multi;
        exitMulti(); /* 先清掉残留的勾选标记 —— 再点 ☑ 退出时绿勾必须一起消失 */
        if (turningOn) { tb.multi = true; document.body.classList.add('multi-mode'); }
        renderToolbar();
        LMApp.toast(tb.multi ? '勾选模式：点选 2-4 个内容块（再点一下取消勾选），然后点「▦ 并排」' : '已退出勾选模式');
        break;
      }
      case 'arrange': doArrange(); break;
      case 'unarrange': doUnarrange(); break;
      case 'aleft': applyStyle('align', 'left'); break;
      case 'acenter': applyStyle('align', 'center'); break;
      case 'aright': applyStyle('align', 'right'); break;
      case 'grid': closePop(); pickGrid(); break;
      case 'imgins': if (popEl && popEl._for === 'imgins') closePop(); else imgInsertPop(btn); break;
      case 'mdins': closePop(); insertAt(defaultsFor('md'), false, '已插入 Markdown 块：写完点「✓ 转换保存」'); break;
      case 'boxins': closePop(); insertAt(freeBoxDefault(), true, '已插入文本框：拖 ⠿ 移动，拖边角缩放'); break;
      case 'chartins': case 'filesins': case 'srcins': {
        closePop();
        const t2 = k === 'chartins' ? 'chart' : (k === 'filesins' ? 'files' : 'sources');
        const at1 = LMApp.insertBlock(defaultsFor(t2), insertAnchor());
        if (at1 >= 0) openBlockForm(LMApp.state.pageId, at1);
        break;
      }
      case 'hrins': closePop(); insertAt({ type: 'hr' }, false, '已插入分隔线'); break;
      case 'color': if (popEl && popEl._for === 'color') closePop(); else swatchPop(btn, 'color', '文字颜色', COLORS, true); break;
      case 'hl': if (popEl && popEl._for === 'hl') closePop(); else swatchPop(btn, 'hl', '高亮', HLS, false); break;
      case 'grad': if (popEl && popEl._for === 'grad') closePop(); else gradPop(btn); break;
      case 'jlist': if (popEl && popEl._for === 'jlist') closePop(); else jumpListPop(btn); break;
      case 'jcancel': tb.jumpPend = { from: null, to: null }; renderToolbar(); LMApp.toast('已取消跳转选择（起点作废；Esc 同效）'); break;
      case 'row+': case 'row-': case 'col+': case 'col-': tblOp(k); break;
      case 'crop': startCrop(); break;
      case 'border': if (popEl && popEl._for === 'border') closePop(); else borderPop(btn); break;
      case 'blur': if (popEl && popEl._for === 'blur') closePop(); else blurPop(btn); break;
      case 'imgreset': {
        const b = imgBlock();
        if (b) {
          b.rotate = 0; b.shift = 0; b.crop = null; b.blur = 0; b.widthPct = 68; b.border = null;
          LMApp.commit({ silent: true });
          LMApp.toast('已恢复默认');
        }
        break;
      }
      case 'sync': syncModal(); break;
    }
  });
  /* 选项卡切换（开始 / 插入） */
  document.addEventListener('click', function (e) {
    const t = e.target.closest && e.target.closest('[data-tbtab]');
    if (!t || !window.LMApp || !LMApp.state.admin) return;
    tb.tab = t.getAttribute('data-tbtab');
    closePop();
    renderToolbar();
  });
  /* 点工具栏按钮不清空已选中的文字（像 Word 一样：选中 → 点 B/I/U 直接生效） */
  document.addEventListener('mousedown', function (e) {
    if (!e.target.closest || !e.target.closest('#editBar,#brushPop,#navGear,#gearPop')) return;
    const t = e.target;
    if (t.tagName === 'SELECT' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.closest('.popover')) return;
    e.preventDefault();
  }, true);
  /* 字体 / 字号下拉（修复：此前未绑定 change，换字号没反应）。
     ★ 应用逻辑提取成独立函数：lmsel 的 hidden input 若因工具栏重建变成游离节点，
     change 事件无法冒泡到 document —— 条目点击处理会直接调这里兜底 */
  function applyTbSelValue(name, value) {
    if (!window.LMApp || !LMApp.state.admin) return;
    if (name === 'font') { if (!applyInlineFontBlock(value)) applyStyle('font', value); }
    if (name === 'fs') { const v2 = value ? +value : ''; if (!applyInlineFs(v2) && !applyInlineFsBlock(v2)) applyStyle('fs', v2); }
  }
  document.addEventListener('change', function (e) {
    if (!window.LMApp || !LMApp.state.admin) return;
    const sel = e.target;
    if (!sel || !sel.classList || !sel.classList.contains('tb-sel')) return;
    applyTbSelValue(sel.getAttribute('data-tb'), sel.value);
  });
  /* Markdown 块：输入实时预览 + 「✓ 转换保存」 */
  document.addEventListener('input', function (e) {
    if (!e.target || !e.target.classList || !e.target.classList.contains('md-src')) return;
    const wrap = e.target.closest('.block-wrap');
    const body = wrap ? wrap.querySelector('.md-body') : null;
    if (body && window.LMMD) body.innerHTML = LMMD.mdToHtml(e.target.value);
  });
  document.addEventListener('click', function (e) {
    const btn = e.target.closest && e.target.closest('[data-md="save"]');
    if (!btn || !window.LMApp || !LMApp.state.admin) return;
    const wrap = btn.closest('.block-wrap');
    const ta = wrap ? wrap.querySelector('.md-src') : null;
    const b2 = blockOf(wrap);
    if (!ta || !b2) return;
    b2.text = ta.value;
    LMApp.commit({ silent: true });
    LMApp.toast('Markdown 已转换保存');
  });
  /* Ctrl+Z / Ctrl+Y：文档级撤销 / 重做（弹窗输入框内仍用系统原生撤销） */
  document.addEventListener('keydown', function (e) {
    if (!window.LMApp || !LMApp.state.admin) return;
    if (e.target.closest && e.target.closest('.modal-mask')) return;
    /* Markdown 源码框内保留原生撤销 */
    if (e.target.classList && e.target.classList.contains('md-src')) return;
    const k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      closePop();
      if (e.shiftKey) LMApp.redo(); else LMApp.undo();
    } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      closePop();
      LMApp.redo();
    }
  });

  /* ---------- 自定义下拉（F.select 生成的苹果风组件）：点按钮展开、选项点击即选、点外面收起。
     列表在展开瞬间搬进 body 悬浮显示（position:fixed，脱离工具栏/弹窗容器）——
     容器的 overflow-x:auto 不再把它裁掉，而工具栏的布局与横向滚动完全保持原样；
     选完或收起时自动搬回原位，DOM 结构复原，不留孤儿节点 ---------- */
  function lmselStash(list) { /* 收起：搬回宿主、清除悬浮定位 */
    list.hidden = true;
    if (list.parentElement === document.body) {
      if (list._host && list._host.isConnected) list._host.appendChild(list);
      else { list.remove(); return; } /* 宿主已被重建 → 清理孤儿 */
    }
    list.classList.remove('lmsel-fly');
    list.style.position = ''; list.style.left = ''; list.style.top = ''; list.style.right = ''; list.style.minWidth = ''; list.style.zIndex = ''; list.style.fontSize = '';
  }
  document.addEventListener('click', function (e) {
    const t = e.target;
    if (!t || !t.closest) return;
    const btn = t.closest('.lmsel-btn');
    if (btn) {
      const w = btn.closest('.lmsel');
      if (!w) return;
      let list = w.querySelector('.lmsel-list') || w._list; /* 展开中：列表正挂在 body 下 */
      if (!list) return;
      if (list.parentElement === document.body && !list.hidden) { lmselStash(list); return; } /* 再点一下 = 收起 */
      document.querySelectorAll('.lmsel-list').forEach(lmselStash); /* 其他展开中的先收起 */
      const r = btn.getBoundingClientRect();
      list._host = w; w._list = list;
      document.body.appendChild(list);
      list.style.position = 'fixed';
      list.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 180)) + 'px';
      list.style.top = (r.bottom + 6) + 'px';
      list.style.right = 'auto'; /* 类样式里的 right:0 会把悬浮列表拉宽，必须显式清掉 */
      list.style.minWidth = r.width + 'px';
      list.style.zIndex = 700; /* 高于弹窗遮罩，弹窗里的下拉也能正常浮在最上层 */
      list.style.fontSize = getComputedStyle(btn).fontSize; /* 跟随所在场景字号（工具栏 13px/表单 14px），不再继承 body 的大字 */
      list.classList.add('lmsel-fly');
      list.hidden = false;
      return;
    }
    const it = t.closest('.lmsel-it');
    if (it) {
      const list = it.closest('.lmsel-list');
      const w = list ? (list._host || list.parentElement) : null;
      if (!w) return;
      const input = w.querySelector('input[type=hidden]');
      if (!input) return;
      input.value = it.getAttribute('data-v');
      const txt = w.querySelector('.lmsel-txt');
      if (txt) txt.textContent = it.textContent;
      list.querySelectorAll('.lmsel-it').forEach(function (x) { x.classList.toggle('on', x === it); });
      lmselStash(list);
      /* ★ input 若已成游离节点（宿主被重建），change 冒泡不到 document —— 直接调应用函数兜底 */
      if (document.contains(input)) input.dispatchEvent(new Event('change', { bubbles: true }));
      else if (window.LMEditor && LMEditor.applyTbSelValue) LMEditor.applyTbSelValue(input.getAttribute('data-tb') || '', input.value);
      return;
    }
    if (!t.closest('.lmsel')) document.querySelectorAll('.lmsel-list').forEach(lmselStash);
  });
  /* 页面滚动时收起悬浮下拉（fixed 列表不跟随按钮）；列表自身的滚轮滚动不算 —— 不然在列表里
     一滚动整个下拉就消失了。capture 捕获工具栏内部横向滚动 */
  document.addEventListener('scroll', function (e) {
    if (e.target && e.target.closest && e.target.closest('.lmsel-list')) return; /* 列表自己滚动 → 保留展开 */
    document.querySelectorAll('body > .lmsel-list').forEach(lmselStash);
  }, { passive: true, capture: true });
  /* 勾选模式：点空白处（非内容块 / 非界面元素）= 一次清空全部已勾选（模式保留，可重新点选）；
     Esc 退出整个模式。解决「不知道怎么取消勾选」 */
  document.addEventListener('click', function (e) {
    if (!tb.multi || !window.LMApp || !LMApp.state.admin) return;
    if (e.target.closest && e.target.closest('.block-wrap,#editBar,#brushPop,#navGear,#gearPop,.popover,#adminBar,.modal-mask')) return;
    if (!tb.multiSel.length) return;
    tb.multiSel = [];
    document.querySelectorAll('.blocks > .block-wrap.multi-sel').forEach(function (w) { w.classList.remove('multi-sel'); });
    renderToolbar();
    LMApp.toast('已清空全部勾选（再点块可重新勾选，Esc 退出勾选模式）');
  });

  /* ---------- 对外接口 ---------- */
  function init() { renderAdminBar(); renderToolbar(); }
  return {
    init: init, tools: tools, renderAdminBar: renderAdminBar,
    renderToolbar: renderToolbar, refreshSel: refreshSel,
    modal: modal, closeModal: closeModal, confirmModal: confirmModal,
    applyTbSelValue: applyTbSelValue, fixFreeOverlaps: function () { resolveFreeOverlaps(null, null, true); }
  };
})();





