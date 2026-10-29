/* =========================================================
   图表模块：用 SVG 绘制柱状图 / 折线图 / 环形图
   不依赖任何外部库，离线也能用（国内访问友好）
   ========================================================= */
window.LMCharts = (function () {
  const PALETTE = ['#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#ffd60a', '#8e8e93'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmt(n) {
    const v = Number(n);
    return Number.isFinite(v) ? v.toLocaleString('zh-CN') : String(n);
  }
  function niceMax(v) {
    if (!(v > 0)) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const mults = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (let i = 0; i < mults.length; i++) { if (v <= mults[i] * pow) return mults[i] * pow; }
    return 10 * pow;
  }
  function wrap(svg) { return '<div class="chart-box">' + svg + '</div>'; }

  /* ---------- 柱状图 ---------- */
  function bar(block) {
    const labels = block.labels || [], data = (block.data || []).map(Number);
    const W = 760, H = 380, padL = 52, padB = 46, padT = 28, padR = 18;
    const max = niceMax(Math.max.apply(null, data.concat([0])));
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const n = data.length || 1;
    const step = innerW / n, bw = Math.min(step * 0.55, 64);
    let s = '';
    for (let i = 0; i <= 4; i++) {
      const y = padT + innerH - (innerH * i) / 4;
      s += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#e8e8ed" stroke-width="1"/>';
      s += '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#86868b">' + fmt((max * i) / 4) + '</text>';
    }
    data.forEach(function (v, i) {
      const h = max ? (v / max) * innerH : 0;
      const x = padL + step * i + (step - bw) / 2;
      const y = padT + innerH - h;
      const c = PALETTE[i % PALETTE.length];
      s += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + Math.max(h, 0) + '" rx="8" fill="' + c + '"><title>' + esc(labels[i] || '') + '：' + fmt(v) + '</title></rect>';
      s += '<text x="' + (x + bw / 2) + '" y="' + (y - 8) + '" text-anchor="middle" font-size="12" fill="#1d1d1f">' + fmt(v) + '</text>';
      s += '<text x="' + (x + bw / 2) + '" y="' + (H - padB + 20) + '" text-anchor="middle" font-size="12" fill="#86868b">' + esc(labels[i] || '') + '</text>';
    });
    return wrap('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">' + s + '</svg>');
  }

  /* ---------- 折线图 ---------- */
  function line(block) {
    const labels = block.labels || [], data = (block.data || []).map(Number);
    const W = 760, H = 380, padL = 52, padB = 46, padT = 28, padR = 26;
    const max = niceMax(Math.max.apply(null, data.concat([0])));
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const n = data.length || 1;
    function px(i) { return n === 1 ? padL + innerW / 2 : padL + (innerW * i) / (n - 1); }
    function py(v) { return padT + innerH - (max ? (v / max) * innerH : 0); }
    let s = '';
    for (let i = 0; i <= 4; i++) {
      const y = padT + innerH - (innerH * i) / 4;
      s += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#e8e8ed" stroke-width="1"/>';
      s += '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#86868b">' + fmt((max * i) / 4) + '</text>';
    }
    const pts = data.map(function (v, i) { return px(i) + ',' + py(v); }).join(' ');
    s += '<polyline points="' + pts + '" fill="none" stroke="#0a84ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
    data.forEach(function (v, i) {
      s += '<circle cx="' + px(i) + '" cy="' + py(v) + '" r="4.5" fill="#0a84ff"><title>' + esc(labels[i] || '') + '：' + fmt(v) + '</title></circle>';
      s += '<text x="' + px(i) + '" y="' + (py(v) - 12) + '" text-anchor="middle" font-size="12" fill="#1d1d1f">' + fmt(v) + '</text>';
      s += '<text x="' + px(i) + '" y="' + (H - padB + 20) + '" text-anchor="middle" font-size="12" fill="#86868b">' + esc(labels[i] || '') + '</text>';
    });
    return wrap('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">' + s + '</svg>');
  }
  /* ---------- 环形图 ---------- */
  function pie(block) {
    const labels = block.labels || [], data = (block.data || []).map(Number);
    const total = data.reduce(function (a, b) { return a + (Number.isFinite(b) ? b : 0); }, 0) || 1;
    const W = 760, H = 380, cx = 210, cy = 190, r = 118, sw = 46;
    const C = 2 * Math.PI * r;
    let off = 0, s = '';
    data.forEach(function (v, i) {
      const frac = (Number.isFinite(v) ? v : 0) / total;
      const len = frac * C;
      const c = PALETTE[i % PALETTE.length];
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + c + '" stroke-width="' + sw + '"'
        + ' stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + (-off) + '"'
        + ' transform="rotate(-90 ' + cx + ' ' + cy + ')"><title>' + esc(labels[i] || '') + '：' + fmt(v) + '</title></circle>';
      off += len;
      const ly = 64 + i * 34;
      s += '<rect x="420" y="' + (ly - 11) + '" width="12" height="12" rx="3" fill="' + c + '"/>';
      s += '<text x="442" y="' + ly + '" font-size="13" fill="#1d1d1f">' + esc(labels[i] || '') + '</text>';
      s += '<text x="742" y="' + ly + '" text-anchor="end" font-size="13" fill="#86868b">' + fmt(v) + ' · ' + (frac * 100).toFixed(1) + '%</text>';
    });
    s += '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" font-size="22" font-weight="700" fill="#1d1d1f">' + fmt(total) + '</text>';
    s += '<text x="' + cx + '" y="' + (cy + 18) + '" text-anchor="middle" font-size="12" fill="#86868b">' + esc(block.unit || '合计') + '</text>';
    return wrap('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img">' + s + '</svg>');
  }

  /* ---------- 对外接口 ---------- */
  function render(container, block) {
    if (!container) return;
    try {
      const t = block.chartType || 'bar';
      container.innerHTML = t === 'line' ? line(block) : t === 'pie' ? pie(block) : bar(block);
    } catch (e) {
      container.innerHTML = '<p class="muted">图表渲染失败：' + esc(e.message) + '</p>';
    }
  }
  return { render: render };
})();

