/* 云存档保活（★ 修复102）
   ---------------------------------------------------------------
   为什么需要：Supabase 免费版会把「一周内几乎没有数据库活动」的项目自动暂停
   （官方文档 Project Pausing："typically a few user requests to the database each day
   over the previous week is enough to keep the project from being paused"）。
   暂停后站点仍能浏览，但云存档的读 / 写全部失败，要进 Dashboard 手动 Resume
   （数据不丢，可恢复窗口 1 年）。

   做法：每天由 GitHub Actions 跑一次本脚本，对每张表发 **一条只读请求**
   （`?select=id&limit=1`）——这就算「有人来访问过数据库」，足够维持活跃。
   不写任何数据、不留垃圾行，所以不需要「发一条再删掉」那种笨办法。

   为什么放 tools/ 并且读 data/content.js：站点是纯静态的，云存档配置本来就
   印在 data/content.js 里给所有访客用（只有 anon key，本来就设计成可公开），
   所以脚本直接读这份已公开的真值即可 —— 改了配置不用动脚本，也不需要往
   GitHub Secrets 里塞东西。

   用法：
     node tools/keepalive.js            # 真跑（会发 2 个只读请求）
     node tools/keepalive.js --dry      # 只打印将要请求的地址，不联网
*/
const fs = require('fs');
const path = require('path');

/* 从 content.js 里抠出 config.fbCloud（括号配对，避免正则被正文里的花括号带偏） */
function pickCfg(text) {
  const src = String(text || '');
  const i = src.indexOf('"fbCloud"');
  if (i < 0) return null;
  const s = src.indexOf('{', i);
  if (s < 0) return null;
  let depth = 0, end = -1;
  for (let p = s; p < src.length; p++) {
    if (src[p] === '{') depth++;
    else if (src[p] === '}') { depth--; if (!depth) { end = p; break; } }
  }
  if (end < 0) return null;
  const body = src.slice(s, end + 1);
  let obj = null;
  try { obj = JSON.parse(body); } catch (e1) {
    try { obj = (new Function('return (' + body + ')'))(); } catch (e2) { return null; }
  }
  return (obj && typeof obj === 'object') ? obj : null;
}

/* 只支持 supabase：worker / 群机器人没有约定的「读回」接口，发请求也没意义 */
function endpoints(cfg) {
  if (!cfg) return [];
  if (String(cfg.kind || '').trim().toLowerCase() !== 'supabase') return [];
  let base = String(cfg.url || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '').replace(/\/+$/, '');
  const key = String(cfg.key || '').trim();
  if (!/^https:\/\//i.test(base) || !key) return [];
  const fbT = String(cfg.table || 'lm_feedback').trim() || 'lm_feedback';
  const dcT = String(cfg.dcTable || 'lm_discuss').trim() || 'lm_discuss';
  const q = '?select=id&limit=1';
  return [
    { name: fbT, url: base + '/rest/v1/' + encodeURIComponent(fbT) + q },
    { name: dcT, url: base + '/rest/v1/' + encodeURIComponent(dcT) + q }
  ];
}

async function main(argv) {
  const dry = (argv || []).indexOf('--dry') >= 0;
  const file = path.join(__dirname, '..', 'data', 'content.js');
  const cfg = pickCfg(fs.readFileSync(file, 'utf8'));
  const list = endpoints(cfg);
  if (!list.length) {
    console.log('云存档未配置（config.fbCloud.kind 不是 supabase）→ 跳过，项目暂停与否和本站无关。');
    return 0;
  }
  if (dry) {
    list.forEach(function (one) { console.log('[dry] ' + one.name + ' → ' + one.url); });
    return 0;
  }
  let ok = 0, threw = 0;
  for (let i = 0; i < list.length; i++) {
    const one = list[i];
    try {
      const r = await fetch(one.url, {
        cache: 'no-store',
        headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key }
      });
      const body = (await r.text()).replace(/\s+/g, ' ').slice(0, 140);
      if (r.ok) { ok++; console.log('✅ ' + one.name + ' → HTTP ' + r.status + ' ' + body); }
      else { console.log('⚠ ' + one.name + ' → HTTP ' + r.status + ' ' + body); }
    } catch (e) {
      threw++;
      console.log('❌ ' + one.name + ' → ' + String((e && e.message) || e));
    }
  }
  console.log('汇总：' + ok + '/' + list.length + ' 张表可读。'
    + '（个别失败也可能只是表还没建；只要请求真的到达 Supabase，就已经算一次「数据库活动」。）');
  /* 只有「全都连不上」才判定失败（域名写错 / 项目已删），单表 404 不算 */
  return threw === list.length ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then(function (code) { process.exit(code); })
    .catch(function (e) { console.error(e); process.exit(1); });
}

module.exports = { pickCfg: pickCfg, endpoints: endpoints, main: main };
