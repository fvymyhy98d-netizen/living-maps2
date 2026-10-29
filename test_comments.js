/* =========================================================
   讨论区跨设备合并回归测试（node test_comments.js）
   覆盖 community.js 的 LMCommunity.merge 纯函数（v4 讨论区同步的核心）：
     1) 并集合并（两台设备各自发的帖互不丢失）
     2) 删除墓碑跨设备传播（A 发帖 → B 删除 → A 那边也消失）
     3) 墓碑不被迟到的旧版本复活
     4) 同 id 内容冲突 = 新时间戳胜
     5) 老 id 格式（D-05）与新格式（D-06-9f3k）都兼容，dcNextId 不撞号
     6) 容量上限 500（最老先出）
     7) 30 天前的墓碑自动清理
     8) 非法条目（无 id / 非数组）安全忽略
   改了 community.js 或 collab.js 的 dcommit 逻辑后必须重跑本文件
   ========================================================= */
'use strict';
require('./js/community.js');
const M = global.LMCommunity;
if (!M || typeof M.merge !== 'function') { console.error('FAIL: LMCommunity.merge 未导出'); process.exit(1); }
let pass = 0, fail = 0;
function T(name, ok, extra) {
  if (ok) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

/* 1) 并集 */
{
  const a = [{ id: 'D-01-x1', pid: '', text: 'A发', ts: 1000, dev: '访客1111' }];
  const b = [{ id: 'D-02-y2', pid: '', text: 'B发', ts: 2000, dev: '访客2222' }];
  const m = M.merge(a, b);
  T('并集：两台设备各发的帖都保留', m.length === 2 && m[0].id === 'D-01-x1' && m[1].id === 'D-02-y2', JSON.stringify(m));
}
/* 2) 删除墓碑传播 */
{
  const a = [{ id: 'D-01-x1', pid: '', text: 'A发', ts: 1000, dev: '访客1111' }];
  const b = [{ id: 'D-01-x1', pid: '', text: 'A发', ts: 1000, dev: '访客1111', del: Date.now() - 1000 }];
  const m = M.merge(a, b);
  T('删除墓碑传播：B 删了帖，合并后带 del 标记', m.length === 1 && +(m[0].del || 0) > 0, JSON.stringify(m));
}
/* 3) 墓碑不被旧版本复活 */
{
  const a = [{ id: 'D-01-x1', text: 'A发', ts: 1000, del: Date.now() - 1000 }]; /* 已删（刚删） */
  const b = [{ id: 'D-01-x1', text: 'A发', ts: 1000 }];                         /* 迟到的旧版本（无 del） */
  const m = M.merge(a, b);
  T('墓碑不被迟到旧版本复活', m.length === 1 && +(m[0].del || 0) > 0, JSON.stringify(m));
}
/* 4) 内容冲突新者胜 */
{
  const a = [{ id: 'D-01-x1', text: '旧内容', ts: 1000 }];
  const b = [{ id: 'D-01-x1', text: '新内容', ts: 3000 }];
  const m = M.merge(a, b);
  T('同 id 冲突：新时间戳胜', m.length === 1 && m[0].text === '新内容', JSON.stringify(m));
}
/* 5) id 格式兼容 + 不撞号 */
{
  const oldList = [{ id: 'D-05', text: '老格式', ts: 1 }, { id: 'D-06-9f3k', text: '新格式', ts: 2 }];
  const nid = M.dcNextId(oldList);
  T('dcNextId 兼容新老 id 格式且不撞号', /^D-07-[0-9a-z]{2,6}$/.test(nid), nid);
  const again = M.dcNextId(oldList.concat([{ id: nid, ts: 3 }]));
  T('dcNextId 连续递增', /^D-08-/.test(again), again);
}
/* 6) 容量上限 500 */
{
  const big = [];
  for (let i = 0; i < 620; i++) big.push({ id: 'D-' + i, text: 't' + i, ts: i });
  const m = M.merge(big, []);
  T('容量上限 500（最老先出）', m.length === 500 && m[0].id === 'D-120' && m[499].id === 'D-619', 'len=' + m.length);
}
/* 7) 30 天前墓碑清理 */
{
  const now = Date.now();
  const a = [{ id: 'D-01-x1', text: 'x', ts: now - 40 * 86400000, del: now - 40 * 86400000 }];
  const m = M.merge(a, []);
  T('30 天前的墓碑被清理', m.length === 0, JSON.stringify(m));
}
/* 8) 非法输入安全 */
{
  let threw = false;
  try { M.merge(null, undefined); M.merge([null, {}, { text: '无id' }], '不是数组'); } catch (e) { threw = true; }
  T('非法输入（null / 无 id / 非数组）不抛错', !threw);
}

console.log('');
console.log('COMMENTS ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
