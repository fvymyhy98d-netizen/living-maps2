/* =========================================================
   轻量 Markdown 引擎（纯前端 · 零依赖）
   - inlineFmt：行内标记 → HTML
     **加粗**  *斜体*  __下划线__  ~~删除线~~  ==高亮==  ^上标^  ~下标~
     `行内代码`  [文字](链接)
   - mdToHtml：整段 Markdown → HTML
     # 标题  - 列表  1. 有序列表  > 引用  | 表格 |  ``` 代码块 ```  --- 分隔线
   ========================================================= */
(function () {
  'use strict';
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* 行内标记（先转义 HTML，防止注入） */
  function inlineFmt(src) {
    let s = esc(src);
    const codes = [];
    s = s.replace(/`([^`]+)`/g, function (_, c) {
      codes.push('<code>' + c + '</code>');
      return '\u0001' + (codes.length - 1) + '\u0001';
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, u) {
      const safe = /^(https?:|mailto:|#|\.?\/|images\/|files\/)/i.test(u) ? u : '#';
      return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + t + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<u>$1</u>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/~~([^~]+)~~/g, '<s>$1</s>')
      .replace(/==([^=]+)==/g, function (_, inner) {
        /* ★ 带色高亮（修复㉚）：==#hex,文字== → 有色 <mark>；==文字== → 默认黄（旧内容零改动兼容）。
           色值严格校验（# 开头 3-8 位十六进制）才当色值，普通文字里的「#,」开头不受影响 */
        const cv = /^([#a-fA-F0-9]{3,8}),([\s\S]*)$/.exec(inner);
        return (cv && /^#[0-9a-fA-F]{3,8}$/.test(cv[1]))
          ? '<mark style="background:' + cv[1] + '">' + cv[2] + '</mark>'
          : '<mark>' + inner + '</mark>';
      })
      /* ★ 孤立 == 自愈（修复㉗）：历史坏数据里未配对的 == 会泄漏成可见文字（「具体==关系」）。
         配对消耗后仍残留的 == 一并清掉 —— 与下方孤立 @@ 的兜底同策略 */
      .replace(/==/g, '')
      .replace(/\^([^^]+)\^/g, '<sup>$1</sup>')
      .replace(/~([^~]+)~/g, '<sub>$1</sub>');
    /* @@色值,文字@@ → 彩色字体（色值白名单校验，防注入）；@@28,文字@@ → 字号 28px；@@gradN,@@ → 行内渐变。
       ★ 循环替换（自内向外）：支持合法嵌套 —— 外层字号/渐变可以只包住内层的几个字
       （@@13,@@#f00,生态@@地图@@ → 字号段里只有「生态」是红色）。每轮只消耗「内容里
       不含 @@ 的最内层标记」，外层下一轮接着消耗，直到没有配对可替换。
       行内样式从此能精准作用于选中的那几个字，与整段样式自由叠加 */
    const fmtTok = function (_, col, txt) {
      if (/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)?$/i.test(col)) {
        /* 字号只认工具栏字号的合法档位（13–40）。历史坏数据里被嵌套写坏的微小字号
          （如 @@9,x@@ / @@1,x@@）一律按坏数据处理 → 渲染成普通文字 —— 从显示层根除
          「点一下渐变/字号，字就变小」的效果；源码在该格下次编辑保存时随之净化 */
        if (/^(?:13|15|17|19|22|26|28|32|40)$/.test(col)) return '<span style="font-size:' + col + 'px">' + txt + '</span>';
        return txt;
      }
      /* @@f:key,文字@@ → 行内字体（修复㉔：字体下拉对选中文字生效时生成）。key 白名单 +
         单引号字体栈（避免打断 style=".." 属性）；htmlToMd 按 data-lmf 还原，编辑往返不丢 */
      const FST = {
        song: "'Songti SC','SimSun',serif",
        kai: "'Kaiti SC','KaiTi','STKaiti',serif",
        hei: "'Heiti SC','SimHei',sans-serif",
        yahei: "'PingFang SC','Microsoft YaHei',sans-serif",
        georgia: "Georgia,'Times New Roman',serif",
        mono: "'SF Mono',Consolas,monospace"
      };
      if (/^f:([a-z0-9]{2,8})$/.test(col) && FST[col.slice(2)]) {
        return '<span data-lmf="' + col.slice(2) + '" style="font-family:' + FST[col.slice(2)] + '">' + txt + '</span>';
      }
      /* @@gradN,文字@@ → 行内渐变字（工具栏 🌈 对选中文字生效时生成），复用整块渐变的 .grad-N 变量 */
      if (/^grad[1-6]$/.test(col)) return '<span class="grad grad-' + col.slice(4) + '">' + txt + '</span>';
      if (!(/^#[0-9a-fA-F]{3,8}$/.test(col) || /^[a-zA-Z]{3,20}$/.test(col))) return txt;
      return '<span style="color:' + col + '">' + txt + '</span>';
    };
    for (let loop = 0; loop < 6; loop++) {
      const nxt = s.replace(/@@([#a-zA-Z0-9:]+),([^@]+)@@/g, fmtTok);
      if (nxt === s) break;
      s = nxt;
    }
    s = s
      /* 历史坏数据兜底：真正无法配对的残留标记前缀和孤立 '@@' 一并清掉（循环渲染后正常嵌套都会被消耗，
        这里只兜「缺半边」的坏数据）—— 显示立即恢复正常；重新编辑该格保存后源码也随之净化 */
      .replace(/@@[#a-zA-Z0-9:]+,/g, '')
      .replace(/@@/g, '')
      /* [[r:ID,文字]] → 来源引用标记：虚线下划线 + 上标编号（编号由页面按来源列表顺序自动填充） */
      .replace(/\[\[r:([a-zA-Z0-9_-]+),([\s\S]*?)\]\]/g, function (_, id, txt) {
        return '<span class="refmark" data-ref="' + id + '">' + txt + '<sup class="refnum"></sup></span>';
      })
      /* [[j:ID,文字]] → 条目级跳转起点：点击（管理员 Ctrl/Cmd+点）平滑滚到映射的终点条目并闪光 */
      .replace(/\[\[j:([a-zA-Z0-9_-]+),([\s\S]*?)\]\]/g, function (_, id, txt) {
        return '<span class="jumplink" data-jump="' + id + '">' + txt + '</span>';
      });
    s = s.replace(/\u0001(\d+)\u0001/g, function (_, i) { return codes[+i] || ''; });
    return s;
  }
  function splitRow(l) {
    let s = String(l).trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
    return s.split('|').map(function (c) { return c.trim(); });
  }
  function isTableSep(l) {
    return /^\s*\|?\s*:?-{2,}[-:|\s]*\|?\s*$/.test(String(l)) && (String(l).match(/-/g) || []).length >= 2;
  }
  const SPECIAL = /^\s*(#{1,4}\s|>|\s*[-*+]\s|\s*\d+[.)]\s|```)/;
  /* 整段 Markdown → HTML */
  function mdToHtml(src) {
    const lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      /* 代码块 */
      if (/^\s*```/.test(l)) {
        const lang = l.replace(/^\s*```/, '').trim();
        i++;
        const buf = [];
        while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre class="md-code"' + (lang ? ' data-lang="' + esc(lang) + '"' : '') + '><code>' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }
      /* 标题 # ~ #### */
      const hm = l.match(/^\s{0,3}(#{1,4})\s+(.*)$/);
      if (hm) {
        const lv = hm[1].length + 1;
        out.push('<h' + lv + '>' + inlineFmt(hm[2]) + '</h' + lv + '>');
        i++; continue;
      }
      /* 分隔线 */
      if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(l)) { out.push('<hr class="md-hr">'); i++; continue; }
      /* 引用 */
      if (/^\s*>/.test(l)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push('<blockquote>' + mdToHtml(buf.join('\n')) + '</blockquote>');
        continue;
      }
      /* 表格 */
      if (l.indexOf('|') >= 0 && isTableSep(lines[i + 1] || '')) {
        const head = splitRow(l);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim() !== '') { rows.push(splitRow(lines[i])); i++; }
        let t = '<div class="md-tblwrap"><table><thead><tr>'
          + head.map(function (c) { return '<th>' + inlineFmt(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
        rows.forEach(function (r) {
          t += '<tr>' + head.map(function (_, ci) { return '<td>' + inlineFmt(r[ci] || '') + '</td>'; }).join('') + '</tr>';
        });
        t += '</tbody></table></div>';
        out.push(t);
        continue;
      }
      /* 无序列表 */
      if (/^\s*[-*+]\s+/.test(l)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*+]\s+/, '')); i++; }
        out.push('<ul>' + items.map(function (x) { return '<li>' + inlineFmt(x) + '</li>'; }).join('') + '</ul>');
        continue;
      }
      /* 有序列表 */
      if (/^\s*\d+[.)]\s+/.test(l)) {
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++; }
        out.push('<ol>' + items.map(function (x) { return '<li>' + inlineFmt(x) + '</li>'; }).join('') + '</ol>');
        continue;
      }
      if (l.trim() === '') { i++; continue; }
      /* 普通段落（连续行合并，<br> 换行） */
      const buf = [l];
      i++;
      while (i < lines.length && lines[i].trim() !== '' && !SPECIAL.test(lines[i])
        && !(lines[i].indexOf('|') >= 0 && isTableSep(lines[i + 1] || ''))) {
        buf.push(lines[i]); i++;
      }
      out.push('<p>' + buf.map(inlineFmt).join('<br>') + '</p>');
    }
    return out.join('\n');
  }
  if (typeof window !== 'undefined') window.LMMD = { inlineFmt: inlineFmt, mdToHtml: mdToHtml, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = { inlineFmt: inlineFmt, mdToHtml: mdToHtml, esc: esc };
})();