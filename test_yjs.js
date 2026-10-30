/* test_yjs.js —— Yjs 网状协同层守护测试（node test_yjs.js）
   1) classifyChannel 通道判定纯函数（从 ycollab.js 提取执行）：IPv6/IPv4 直连 / TURN 中继 / 等待连接
   2) 前端集成点：collab 漏斗 / 徽章 / 面板 + Yjs 本地化（lib/，零 CDN）
   3) 硬性顺序：y-indexeddb 持久化先于网络同步（提示词 §0）
   4) 历史信令线路清理：Cloudflare Worker / CloudBase / Render 产物不得回潮
   5) 传输层：yjstcb.js（EMQX MQTT 信令 + 原生 WebRTC Mesh）产物与接入守护
   5·补) MQTT broker 池（EMQX×2 + HiveMQ）与 presence 三保险 */
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
let pass = 0, fail = 0;
function T(name, ok, extra) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' —— ' + extra : '')); }
}
function srcOf(f) { return fs.readFileSync(path.join(DIR, f), 'utf8'); }
function exists(f) { return fs.existsSync(path.join(DIR, f)); }

/* ---------- 1) classifyChannel 提取与执行 ---------- */
console.log('【1】通道判定 classifyChannel（直连优先 → TURN 兜底）');
const src = srcOf('js/ycollab.js');
const a = src.indexOf('function classifyChannel(');
const b = src.indexOf('\n  }', a);
T('ycollab.js 中找到 classifyChannel 纯函数', a > 0 && b > a);
let classify = null;
try { classify = new Function('return (' + src.slice(a, b + 4) + ')')(); } catch (e) { console.log('  提取失败: ' + e.message); }
if (classify) {
  T('选中 IPv6 直连候选对 → P2P直连 · IPv6',
    classify([{ state: 'succeeded', selected: true, type: 'host', addr: '2408:84ff::1' }]) === 'P2P直连 · IPv6');
  T('选中 IPv4 srflx（STUN 打洞）→ P2P直连 · IPv4',
    classify([{ state: 'succeeded', selected: true, type: 'srflx', addr: '10.71.12.3' }]) === 'P2P直连 · IPv4');
  T('只有 relay 候选对 → TURN 中继',
    classify([{ state: 'succeeded', selected: true, type: 'relay', addr: '1.2.3.4' }]) === 'TURN 中继');
  T('混合时直连优先（一台直连一台中继 → 报直连）',
    classify([{ state: 'succeeded', selected: true, type: 'relay', addr: '1.2.3.4' }, { state: 'succeeded', selected: true, type: 'host', addr: '192.168.1.5' }]) === 'P2P直连 · IPv4');
  T('无 succeeded 候选对 → 等待连接',
    classify([{ state: 'checking', selected: false, type: 'host', addr: '192.168.1.5' }]) === '等待连接');
  T('空入参 → 等待连接', classify([]) === '等待连接');
  T('未选定但有 succeeded → 兜底判定为直连',
    classify([{ state: 'succeeded', selected: false, type: 'srflx', addr: '8.8.8.8' }]) === 'P2P直连 · IPv4');
}
/* ---------- 2) 前端集成点 ---------- */
console.log('【2】与旧协同漏斗的集成点 + Yjs 三件套本地化');
const col = srcOf('js/collab.js');
T('collab.js exports applyExternal（Yjs 与旧通道共用同一漏斗）', /applyExternal:\s*function/.test(col));
T('collab.js exports paintChip（Yjs 变更可触发徽章刷新）', /paintChip:\s*paintChip/.test(col));
T('publish() 挂了 Yjs pushLocal 钩子（本地保存→Y.Doc 解耦上云）', /LMYCollab\.pushLocal\(content\)/.test(col));
T('徽章人数取 Awareness 与旧通道的较大值', /yPeerCount\(\)/.test(col));
T('面板合并 Awareness 名单（presence）', /yj\.presence\(\)\.forEach/.test(col));
const html = srcOf('index.html');
T('CSP script-src 收紧回 self（不再放行 CDN）', /script-src\s+'self'(;|")/.test(html) && html.indexOf('jsdelivr') < 0 && html.indexOf('unpkg') < 0);
T('CSP connect-src 仍放行 wss:（MQTT 信令 WebSocket）', /connect-src[^"]*wss:/.test(html));
T('CSP worker-src 放行 blob:（mqtt.js 内部 Worker）', /worker-src[^"]*blob:/.test(html));
T('lib/ 本地件齐备（yjs / y-protocols / y-indexeddb / mqtt）',
  exists('lib/yjs.js') && exists('lib/y-protocols.js') && exists('lib/y-indexeddb.js') && exists('lib/mqtt.js'));
T('lib 引入顺序：collab.js → yjs → y-protocols → mqtt → y-indexeddb → yjs-config → ycollab',
  html.indexOf('lib/yjs.js') > html.indexOf('js/collab.js')
  && html.indexOf('lib/y-protocols.js') > html.indexOf('lib/yjs.js')
  && html.indexOf('lib/mqtt.js') > html.indexOf('lib/y-protocols.js')
  && html.indexOf('lib/y-indexeddb.js') > html.indexOf('lib/mqtt.js')
  && html.indexOf('js/yjs-config.js') > html.indexOf('lib/y-indexeddb.js')
  && html.indexOf('js/ycollab.js') > html.indexOf('js/yjs-config.js'));
T('ycollab.js 从本地 lib/ 加载（不再有 CDN 镜像表）', src.indexOf("'lib/yjs.js'") > 0 && src.indexOf('MIRRORS') < 0 && src.indexOf('jsdelivr') < 0);
T('ycollab.js 不再内置 Metered 信令（信令一律来自 yjs-config.js）', src.indexOf('metered') < 0);
const cfg = srcOf('js/yjs-config.js');
T('yjs-config.js 保留 STUN + TURN 配置', cfg.indexOf('stun:') > 0 && cfg.indexOf('turn:') > 0);
T('yjs-config.js 含 MQTT broker 池配置（跨供应商主备）', cfg.indexOf('mqtt:') > 0 && cfg.indexOf('brokers') > 0);

/* ---------- 3) 硬性顺序校验 ---------- */
console.log('【3】硬性顺序：本地持久化（y-indexeddb）先于网络同步（TCB Provider）');
const iBoot = src.indexOf('function boot()');
const iBoot2 = src.indexOf('function boot2()');
const iIdb = src.indexOf('new IdbP(');
const iTcb = src.indexOf('TCB.start(');
T('IndexeddbPersistence 在 boot() 内、网络启动前创建', iIdb > -1 && iBoot > -1 && iIdb > iBoot);
T('传输层 Provider（TCB.start）只在 boot2()（IDB 完成/超时保护后的回调）内创建', iTcb > -1 && iBoot2 > -1 && iTcb > iBoot2 && iBoot > -1 && iTcb < iBoot);
T('boot() 在 whenSynced/超时保护后才进入 boot2()', src.indexOf('whenSynced') > iIdb && src.indexOf('3500') > iIdb);
T('含「本地持久化先于网络同步」顺序注记', src.indexOf('本地持久化先于网络同步') > -1);
T('Mesh 注记：明确不走 Host 模式（信令只牵线）', src.indexOf('信令只牵线') > -1);
T('远端 origin 过滤：本机写入（lm-local）不回灌', src.indexOf("origin === 'lm-local'") > -1);

/* ---------- 4) 历史信令线路清理 ---------- */
console.log('【4】历史信令线路清理（Cloudflare Worker / CloudBase / Render 不得回潮）');
T('signaling-worker/（Cloudflare Worker 留档目录）已删除', !exists('signaling-worker'));
T('lib/tcb.js（CloudBase SDK 产物）已删除', !exists('lib/tcb.js'));
T('lib/y-webrtc.js（弃用传输产物）已删除', !exists('lib/y-webrtc.js'));
T('server-signal.js / test_signal.js（Render 方案）不存在',
  !exists('server-signal.js') && !exists('test_signal.js'));
T('package.json 已移除 @cloudbase/js-sdk 与 y-webrtc 依赖',
  srcOf('package.json').indexOf('@cloudbase/js-sdk') < 0 && srcOf('package.json').indexOf('y-webrtc') < 0);
T('build-libs.js 存在（lib/ 升级通道保留）', exists('build-libs.js'));

/* ---------- 5) 传输层（MQTT 信令 + 原生 WebRTC Mesh） ---------- */
console.log('【5】传输层（js/yjstcb.js：EMQX MQTT 信令 + 原生 WebRTC Mesh）');
const tcb = srcOf('js/yjstcb.js');
T('yjstcb.js 存在且实现原生 WebRTC Mesh（RTCPeerConnection + DataChannel）',
  exists('js/yjstcb.js') && tcb.indexOf('new RTCPeerConnection') > 0 && tcb.indexOf('createDataChannel') > 0);
T('信令只走 MQTT 定向 publish（/to/<peerId> topic，QoS0；多路广播由 mqPublish 统一发送）',
  tcb.indexOf('function sig(payload)') > 0 && tcb.indexOf('peerTopic(payload.to') > 0 && tcb.indexOf('function mqPublish') > 0);
T('CloudBase 线路已移除（不再出现 ensureAuth / bootTCB / presenceState / window.CloudBase）',
  tcb.indexOf('ensureAuth') < 0 && tcb.indexOf('bootTCB') < 0 && tcb.indexOf('presenceState') < 0 && tcb.indexOf('window.CloudBase') < 0);
T('全量互换收敛：新连接互发 encodeStateAsUpdate（CRDT 幂等）',
  tcb.indexOf('encodeStateAsUpdate') > 0 && tcb.indexOf('applyUpdate') > 0);
T('Awareness 走 y-protocols（Awareness / encodeAwarenessUpdate / applyAwarenessUpdate）',
  tcb.indexOf('Awareness') > 0 && tcb.indexOf('encodeAwarenessUpdate') > 0 && tcb.indexOf('applyAwarenessUpdate') > 0);
T('glare 防护：字典序规则决定 offer 发起方', tcb.indexOf('myPeer > pid') > 0 || tcb.indexOf('myPeer < pid') > 0);
T('lib/y-protocols.js 与 lib/mqtt.js 产物齐备（lib/tcb.js、lib/y-webrtc.js 已删）',
  exists('lib/y-protocols.js') && exists('lib/mqtt.js') && !exists('lib/tcb.js') && !exists('lib/y-webrtc.js'));
const bl = srcOf('build-libs.js');
T('build-libs.js 产物表含 y-protocols 且不再打包 tcb/y-webrtc',
  bl.indexOf('lib/y-protocols.js') > 0 && bl.indexOf('lib/tcb.js') < 0 && bl.indexOf('y-webrtc.cjs') < 0);
T('ycollab.js 已切换到 MQTT 传输（brokers 传参，无 signalMode/y-webrtc 残留）',
  src.indexOf('LMYjsTCB') > 0 && src.indexOf('brokers') > 0 && src.indexOf('lib/y-webrtc.js') < 0 && src.indexOf('signalMode') < 0);
T('index.html 已引入 js/yjstcb.js（LMYjsTCB 定义方，漏引必降级 stub）',
  srcOf('index.html').indexOf('js/yjstcb.js') > 0);
T('yjstcb.js 工具函数定义完备（nowSec 曾在分段写入中丢失 → 登录后 ReferenceError 崩溃）',
  /function nowSec/.test(tcb) && (tcb.match(/nowSec\(/g) || []).length >= 3);

/* ---------- 5·补) MQTT 信令（EMQX 公共 Broker 池，免费匿名，跨供应商主备） ---------- */
console.log('【5·补】MQTT 信令（EMQX 公共 Broker 池 + HiveMQ 备用，免费匿名）');
T('MQTT 库已本地化（lib/mqtt.js 产物 + build-libs UMD 原样复制 + index.html 引入）',
  exists('lib/mqtt.js') && bl.indexOf('lib/mqtt.js') > 0 && srcOf('index.html').indexOf('lib/mqtt.js') > 0);
T('MQTT presence 三保险：15s 心跳 + LWT 遗言（will）+ 45s 超时清扫',
  tcb.indexOf('presTopic()') > 0 && tcb.indexOf('will:') > 0 && tcb.indexOf('leave') > 0 && tcb.indexOf('> 45') > 0);
T('MQTT 定向握手 topic（/to/<peerId>）与口令派生房间（防猜）',
  tcb.indexOf('peerTopic') > 0 && tcb.indexOf("shortHash((opts.channel || 'living-maps') + '|'") > 0);
T('MQTT 多 broker 全连（握手帧三路广播 + 帧唯一号去重 + 单路断开不掉线）',
  tcb.indexOf('mqs.push(mq)') > 0 && tcb.indexOf('function mqPublish') > 0 && tcb.indexOf('sigSeen') > 0
    && tcb.indexOf('function mqDown') > 0 && tcb.indexOf('payload.n =') > 0);
T('mqs 声明先于 bootMQTT() 调用（var 提升陷阱：旧版声明在调用之后，bootMQTT 一进来 mqs.push 就是 undefined → 手机无痕首载必现「协同初始化失败 (reading push)」）',
  tcb.indexOf('var mqs = [], mqUp = 0') > -1 && tcb.indexOf('bootMQTT();') > -1
    && tcb.indexOf('var mqs = [], mqUp = 0') < tcb.indexOf('bootMQTT();'));
T('yjs-config.js broker 池三供应商（EMQX 中国/国际 + HiveMQ），tcb/signalMode 已删',
  cfg.indexOf('broker-cn.emqx.io') > 0 && cfg.indexOf('broker.emqx.io') > 0 && cfg.indexOf('broker.hivemq.com') > 0 && cfg.indexOf('signalMode') < 0 && cfg.indexOf('tcb:') < 0);
T('ycollab.js 传递 brokers 给传输层',
  src.indexOf('CFG.mqtt && CFG.mqtt.brokers') > 0);
T('MQTT 断线状态去重（offStatus 防重连风暴刷屏）',
  tcb.indexOf('function offStatus') > 0);

/* ---------- 5·补2) 访客极简 + 团队保险箱 + 配置漂移自愈 ---------- */
console.log('【5·补2】访客极简 / 团队 Token 保险箱 / 配置漂移自愈');
const sto = srcOf('js/store.js'), edt = srcOf('js/editor.js'), appSrc = srcOf('js/app.js'), cssSrc = srcOf('css/style.css');
T('访客极简：未登录管理员不启动实时协同（maybeBoot 门禁 + 登录后 LMYCollabStart 按需启动 + boot 防重入）',
  src.indexOf('function maybeBoot') > 0 && src.indexOf('sessionStorage.getItem(\'lm_admin\')') > 0
    && src.indexOf('window.LMYCollabStart') > 0 && src.indexOf('if (booted) return;') > 0);
T('访客极简：collab.js 访客分支不再注册传输层（无「协作中」徽章），同浏览器互连仅管理员启用',
  col.indexOf('访客只读不上云') < 0 && col.indexOf('lmIsAdmin') > 0);
T('登录后补启动协同通道：registerAdminTransports 幂等（__bc 防重 + lm_admin 门禁）+ 登录成功回调调用 + ghInit 补探',
  col.indexOf('function registerAdminTransports(') > 0 && col.indexOf('__bc') > 0
    && col.indexOf('startAsAdmin: registerAdminTransports') > 0
    && appSrc.indexOf('LMCollab.startAsAdmin') > 0 && col.indexOf('eG1') > 0);
T('降级可观测 + 自愈：初始化失败 Console.error 留痕 + toast 带具体异常 + 失败后自动重试 2 次（60 秒间隔）',
  src.indexOf("console.error('[LMY-collab] 协同网络初始化失败") > 0
    && src.indexOf('String((eBoot && eBoot.message) || eBoot).slice(0, 80)') > 0
    && src.indexOf('function scheduleRetry(') > 0 && src.indexOf('bootTries >= 2') > 0);
T('团队 Token 保险箱：AES-256-GCM + PBKDF2（store 加解密导出，明文 Token 不进界面/内容/云端）',
  sto.indexOf('encryptForTeam') > 0 && sto.indexOf('decryptForTeam') > 0
    && sto.indexOf('AES-GCM') > 0 && sto.indexOf('PBKDF2') > 0);
T('双视图上传：根管理员完整配置（含团队密码分发）+ 普通管理员一键上传（看不到任何密钥）',
  edt.indexOf('syncModalLite') > 0 && edt.indexOf('syncModalRoot') > 0
    && edt.indexOf('teamPw') > 0 && edt.indexOf('tokenVault') > 0);
T('登录回调：管理员登录启动协同，普通管理员自动解密保险箱取回上传通道（refreshGh 重入接线）',
  appSrc.indexOf('LMYCollabStart') > 0 && appSrc.indexOf('decryptForTeam') > 0
    && col.indexOf('refreshGh: ghInit') > 0);
T('配置漂移自愈（防旧缓存分房：定时拉最新 config 对比 room/password，sessionStorage 防刷新循环）',
  col.indexOf('function cfgWatch') > 0 && col.indexOf('CFG_WATCH_KEY') > 0
    && col.indexOf('js/yjs-config.js?t=') > 0);

/* ---------- 6) WPS 式能力补齐：历史版本面板 / 访客互动开关 / 改动动态 / 同页提醒 ---------- */
console.log('【6】历史版本面板 / 访客互动开关 / 改动动态 / 同页多人提醒');
T('历史版本面板：快照带时间戳（hist.ts 平行数组）+ 列表/恢复导出（恢复走完整 commit 链，可再撤销）',
  appSrc.indexOf('hist.ts = (hist.ts || []).slice') > 0 && appSrc.indexOf('function historyList') > 0
    && appSrc.indexOf('function restoreVersion') > 0 && appSrc.indexOf('historyList: historyList') > 0
    && edt.indexOf('data-panel="hist"') > 0 && edt.indexOf('function histModal') > 0);
T('访客互动开关：commentsOff 三通道拦截（留言/发帖/回复）+ 渲染层提示 + 网站信息开关（管理员不受限）',
  appSrc.indexOf('function commentsOff') > 0 && (appSrc.match(/commentsOff\(\)\) \{ toast/g) || []).length >= 3
    && appSrc.indexOf('留言与讨论已由管理员暂时关闭') > 0 && edt.indexOf('cOff') > 0);
T('改动动态：合并前后页面签名 diff → 面板「最近动态」流水（复用 _t 时间戳，不加传输内容）',
  col.indexOf('function pushFeedFrom') > 0 && col.indexOf('pushFeedFrom(before, c, by)') > 0
    && col.indexOf('最近动态') > 0);
T('同页多人提醒：进页（hashchange）与心跳扫描双触发 + key 去重（仅管理员态提示）',
  col.indexOf('function notifyPagePeers') > 0 && col.indexOf('pageNotified') > 0
    && col.indexOf("setTimeout(notifyPagePeers, 900)") > 0 && col.indexOf('notifyPagePeers(); /*') > 0);

/* ---------- 7) 登录防护升级 / 上线断线提醒 / 409 尾随重推 ---------- */
console.log('【7】密码试错防护 / 上线断线 Toast / 冲突重推');
T('密码试错防护：1 小时滑动窗口持久化（localStorage）+ 指数退避锁定 + 「系统繁忙」假象文案',
  appSrc.indexOf('lm_fail_hist') > 0 && appSrc.indexOf('f >= 7 ? 600000') > 0
    && appSrc.indexOf('系统繁忙，请') > 0 && appSrc.indexOf('0x2F') > 0);
T('试错自动入黑名单：登录成功时走 banSelf 限时通道（1 小时内 ≥5 次失败；根管理员豁免并自动清除限时）',
  appSrc.indexOf('LMCollab.banSelf(1800000)') > 0 && appSrc.indexOf('管理员入口将被限制 30 分钟') > 0
    && appSrc.indexOf('根管理员身份不受限') > 0 && appSrc.indexOf('clearAutoBan()') > 0);
T('上线/断线 Toast：hello/iam 新设备提示、bye 提示、TTL 清扫合并提示（多台不轰炸）',
  col.indexOf('已上线') > 0 && col.indexOf('已断线') > 0
    && col.indexOf('const gonePeers = [];') > 0);
T('Toast 手机端不遮屏：宽度上限 min(86vw, 420px)，多行圆角 14px',
  fs.readFileSync(path.join(DIR, 'css/style.css'), 'utf8').indexOf('max-width:min(86vw,420px)') > 0);
T('409 冲突尾随重推：拉最新后 6 秒重试一次（防最后一笔只留本机），防覆盖守卫仍然生效',
  col.indexOf('GH._409T') > 0 && col.indexOf('}, 6000);') > 0);

/* ---------- 9) 并排组：行内拖动不跳 / 取消并排 ---------- */
const edt2 = srcOf('js/editor.js');
console.log('【9】并排组记忆 / 行内拖动不跳 / 取消并排');
T('并排时写入组标记：free.g/gi/gn/gw（正确宽度=并排前宽度）/gx0（吸附锚点）',
  edt2.indexOf('g: gid, gi: k, gn: n, gw: gw0, gx0: x0') > 0
    && edt2.indexOf('「正确的宽度」= 该块并排前的宽度') > 0);
T('行内拖动不跳：组框 y 锁定（只在本行左右滑）+ 拖近原始位置 ±1.5% 自动吸附「拼回去」',
  edt2.indexOf('if (b.free.g != null) {') > 0 && edt2.indexOf('Math.abs(nx - b.free.gx0) <= 1.5') > 0
    && edt2.indexOf('wrap.style.top = b.free.y') > 0);
T('组内互不推挤：resolveFreeOverlaps 跳过同一并排组的框对（松手不再拆散行、下方不乱跳）',
  edt2.indexOf('A.b.free.g != null && A.b.free.g === B.b.free.g') > 0);
T('↑↓ 整格移动对并排块拦截（防拆散行），提示用「取消并排」',
  edt2.indexOf('function freeJump(page, i, dir)') > 0
    && edt2.indexOf('并排的块请在本行内左右拖动微调') > 0);
T('取消并排：pickFullGroup 校验同组且全选（跨组/选不全不可取消）+ doUnarrange 恢复正确宽度 + 末块贴右（wAlign）',
  edt2.indexOf('function pickFullGroup(') > 0 && edt2.indexOf('组没选全') > 0
    && edt2.indexOf('function doUnarrange(') > 0 && edt2.indexOf("b.wAlign = 'right'") > 0
    && edt2.indexOf("data-tb=\"unarrange\"") > 0 && edt2.indexOf("case 'unarrange': doUnarrange();") > 0);
T('取消并排渲染：wAlign=right 的窄块 margin-left:auto 贴页面右缘（app.js 渲染层支持，无 wAlign 行为不变）',
  appSrc.indexOf("b.wAlign === 'right' ? 'margin-left:auto;' : ''") > 0);

/* ---------- 9.5) 修复㉙：调宽挤开并排框 / 文本框占位 / 跳转空白弹性匹配 / Token 记住 ---------- */
console.log('【9.5】修复㉙：并排调宽互挤 · 空文本框占位 · 跳转空白匹配 · Token 记住');
T('调宽松手 force 互挤：resolveFreeOverlaps 加 force 参数，同组对在 force 时不跳过（扩宽挤开旁边的并排框）',
  edt2.indexOf('function resolveFreeOverlaps(wrap, me, quiet, force)') > 0
    && edt2.indexOf('if (!force && A.b.free.g != null && A.b.free.g === B.b.free.g) continue;') > 0
    && edt2.indexOf('resolveFreeOverlaps(wrap, b, false, true);') > 0);
T('拖动松手不传 force（保持旧行为：拖框不拆散并排行）',
  edt2.indexOf('resolveFreeOverlaps(wrap, b);') > 0 && edt2.indexOf('resolveFreeOverlaps(wrap, b, false, true);') > 0);
T('新插入文本框 text 置空（占位交给渲染层 data-ph，不再是真文字）',
  edt2.indexOf("return { type: 'paragraph', size: 'normal', text: '', style: {}, free:") > 0);
T('jumpSpanOf 空白弹性回退：连续空格折叠/nbsp 差异不再导致「定位不到」',
  edt2.indexOf('空白弹性回退') > 0 && edt2.indexOf("join('[\\\\s\\\\u00A0]+')") > 0);
T('终点绿线宿主匹配空白归一（normSp）：渲染折叠空格后绿线仍挂得上',
  edt2.indexOf('const normSp = function (s2) { return String(s2 || \'\').replace(/[\\s\\u00A0]+/g, \' \'); };') > 0);
const storeSrc = srcOf('js/store.js');
T('Token 记住：setGhCfg 支持 remember 写 localStorage（lm_gh_token_r），ghToken 回退读取',
  storeSrc.indexOf("localStorage.setItem('lm_gh_token_r', cfg.token)") > 0
    && storeSrc.indexOf("sessionStorage.getItem('lm_gh_token') || localStorage.getItem('lm_gh_token_r')") > 0
    && storeSrc.indexOf("keep.remembered = !!localStorage.getItem('lm_gh_token_r');") > 0);
T('root 上传弹窗：勾选框 ghRemember（记住 Token）+ collect 带 remember',
  edt2.indexOf('id="ghRemember"') > 0 && edt2.indexOf('remember: !!(root.querySelector(\'#ghRemember\')') > 0);

/* ---------- 9.6) 修复㉚：高亮多色（==#hex, 前缀语法） ---------- */
console.log('【9.6】修复㉚：高亮多色');
const mds = srcOf('js/md.js');
T('md.js 带色 mark 渲染：==#hex,文字== → <mark style=background>（色值严格校验）',
  mds.indexOf('mark style="background:') > 0 && mds.indexOf('cv[1]') > 0);
T('walkInline 前缀并入开 tok（hlOpen 线性配对，前缀不进可见字符）',
  edt2.indexOf('let i = 0, hlOpen = false;') > 0
    && edt2.indexOf('rest.slice(2).match(/^(#[0-9a-fA-F]{3,8}),/)') > 0);
T('hlWrapped 用 tok 线性配对检测（兼容带色开标记）',
  edt2.indexOf('hlToks[ki].b === s0 && hlToks[ki + 1].a === e0') > 0);
T('包裹带色前缀 + 同色取消/异色换色/整段底色一并清',
  edt2.indexOf("(v ? v + ',' : '')") > 0 && edt2.indexOf('已换高亮颜色') > 0
    && edt2.indexOf("b.style.hl = '';") > 0);
T('htmlToMd 往返：mark background → ==#hex,文字==（默认黄不写前缀）',
  edt2.indexOf("hc.toLowerCase() !== '#fff3b0'") > 0);

/* ---------- 9.7) 修复㉛：协同实时（编辑期间节流广播）+ 手机打字可见 ---------- */
console.log('【9.7】修复㉛：协同实时 + 光标跟随');
T('失焦保存提取为 saveEdited（focusout 与 input 节流共用同一路径）',
  edt2.indexOf('function saveEdited(el)') > 0
    && edt2.indexOf('saveEdited(e.target)') > 0
    && edt2.indexOf('liveStopEdit()') > 0);
T('input 节流广播：停顿 1.2s 保存 / 持续 3.5s 强制一包（无变化不落盘不空包）',
  edt2.indexOf('liveEdit = { t1: 0, t2: 0, el: null }') > 0
    && edt2.indexOf(', 1200)') > 0 && edt2.indexOf(', 3500)') > 0
    && edt2.indexOf("classList.contains('md-src')") > 0);
T('光标跟随滚动：selectionchange 节流 + scrollIntoView（工具栏+键盘夹缝里可见）',
  (edt2.match(/selectionchange/g) || []).length >= 3
    && edt2.indexOf('caretT') > 0
    && edt2.indexOf("block: 'center'") > 0);
T('手机端工具栏限高可滚（max-height 42vh，展开不吞屏）',
  cssSrc.indexOf('max-height:42vh') > 0 && cssSrc.indexOf('-webkit-overflow-scrolling:touch') > 0);

/* ---------- 9.8) 修复㉜：放弃修改 / 密码云端重验 / 手机操作栏浮现淡出+双击编辑 / 并排重叠兜底 ---------- */
console.log('【9.8】修复㉜：放弃修改 · 密码云端重验 · 手机操作栏 · 并排重叠');
T('放弃修改：登录成功与刷新恢复两处拍快照，discardChanges 整包恢复走 commit（本机+历史+协同广播）',
  appSrc.indexOf('function takeAdminSnap()') > 0 && appSrc.indexOf('function discardChanges()') > 0
    && appSrc.indexOf('takeAdminSnap(); /* ★ 修复㉜：进入管理模式的瞬间拍内容快照') > 0
    && appSrc.indexOf('if (state.admin) takeAdminSnap();') > 0
    && appSrc.indexOf('adminSnap = null; /* ★ 修复㉜：退出管理模式即弃快照 */') > 0
    && appSrc.indexOf('discardChanges: discardChanges') > 0);
T('管理条新增「↩ 放弃修改」按钮（确认弹窗写明协同回退影响）',
  edt2.indexOf('data-panel="discard"') > 0 && edt2.indexOf("k === 'discard'") > 0
    && edt2.indexOf('LMApp.discardChanges();') > 0);
T('密码云端重验：本地失败自动拉云端 content.js 用最新密码数据重验，命中才合入本机 admin 配置',
  appSrc.indexOf('function fetchRemoteContent()') > 0
    && appSrc.indexOf("fetch('data/content.js?lmnc='") > 0
    && appSrc.indexOf('function verifyPasswordSmart(v)') > 0
    && appSrc.indexOf('verifyPasswordSmart(v).then(function (r) {') > 0
    && appSrc.indexOf('state.content.config.admin = rc.config.admin') > 0
    && appSrc.indexOf("cache: 'no-store'") > 0);
T('手机操作栏：点按浮现 6 秒无操作淡出（armToolsAutohide + opacity 过渡），有操作自动重置计时',
  edt2.indexOf('function armToolsAutohide()') > 0 && edt2.indexOf("classList.contains('mobile-view')") > 0
    && edt2.indexOf("addEventListener('pointerdown', function () { if (toolsHideT) armToolsAutohide(); }, true);") > 0
    && cssSrc.indexOf('body.admin.mobile-view .block-wrap .block-tools,body.admin.mobile-view .free-box .block-tools{display:flex;opacity:0;pointer-events:none;transition:opacity .5s ease}') > 0);
T('手机双击进编辑：第一击 preventDefault 只选中块，400ms 内第二击放行原生聚焦（滚动/拖拽位移>12px 放行）',
  edt2.indexOf('var lastEditTap = { t: 0, el: null }, editTapStart = null;') > 0
    && edt2.indexOf("dx * dx + dy * dy > 144") > 0
    && edt2.indexOf("lastEditTap.el === key && now - lastEditTap.t < 400") > 0);
T('手机端自由框手柄不再常显（selected/free-drag/focus-within 才出现）',
  cssSrc.indexOf('body.admin.mobile-view .fb-grip,body.admin.mobile-view .fb-hd{display:none}') > 0
    && cssSrc.indexOf('body.admin.mobile-view .free-box.selected .fb-grip') > 0);
T('并排重叠兜底：fixFreeOverlapVisual 只抬不降（锁定段外显示层复查，freeDecide/YIELD-V4 零改动）',
  appSrc.indexOf('function fixFreeOverlapVisual()') > 0
    && appSrc.indexOf("if (!col || col._freeSession) return;") > 0
    && appSrc.indexOf("if (want > cur + 1) f.w.style.marginTop = want + 'px';") > 0
    && appSrc.indexOf('adjustFreeLayout: adjustFreeLayoutSafe') > 0
    && appSrc.indexOf('function adjustFreeLayoutSafe() { adjustFreeLayout(); fixFreeOverlapVisual(); }') > 0);
T('手机端并排框入场只淡入不位移（滚动合成减负，访客同样受益；桌面观感不变）',
  cssSrc.indexOf('body.mobile-view .free-box.reveal{transform:none}') > 0);

/* ---------- 9.9) 修复㉝：手机工具条收成把手 / 点块任意位置浮现操作栏 / 协同局部刷新 / 手机排版兜底 ---------- */
console.log('【9.9】修复㉝：工具条把手 · 点块浮现 · 协同局部刷新 · 排版兜底');
T('editBar 手机端收成右上角 ⌨️ 把手（默认收起、点开恢复、桌面无把手常展开）',
  edt2.indexOf('class="eb-toggle"') > 0
    && edt2.indexOf("tg.closest('#editBar').classList.toggle('open')") > 0
    && edt2.indexOf("bar.classList.toggle('open', !document.body.classList.contains('mobile-view'))") > 0
    && cssSrc.indexOf('body.admin .eb-toggle{display:none}') > 0
    && cssSrc.indexOf('body.admin.mobile-view #editBar:not(.open) > *:not(.eb-toggle){display:none}') > 0);
T('点块任意位置浮现操作栏：touchend 从 data-edit 扩展到整个 block-wrap/free-box（双击文字仍进编辑）',
  edt2.indexOf("const blk = t.closest('.block-wrap[data-idx],.free-box[data-idx]');") > 0
    && edt2.indexOf('const wrap = blk || (el ? el.closest') > 0);
T('协同局部刷新：applyRemoteContent 结构一致时逐块 diff 替换（reveal 补 .in 不闪、编辑中块跳过），结构变化才整页兜底',
  appSrc.indexOf('function applyRemoteContent(nc)') > 0
    && appSrc.indexOf('function renderBlockAt(pageId, i)') > 0
    && appSrc.indexOf('if (old.contains(document.activeElement)) return false;') > 0
    && appSrc.indexOf("nu.classList.contains('reveal')") > 0
    && appSrc.indexOf('applyRemoteContent: applyRemoteContent') > 0
    && col.indexOf('LMApp.applyRemoteContent(c)') > 0
    && col.indexOf('LMApp.applyRemoteContent(mergeBlocks(c))') > 0);
T('撤销基准随远端局部更新同步（applyRemoteContent 尾部 hPush）',
  appSrc.indexOf('hPush(); /* ★ 撤销基准随远端内容同步') > 0);
T('手机排版兜底：free-box 不溢出屏 + 长词/链接自动断行',
  cssSrc.indexOf('body.mobile-view .free-box{max-width:calc(100vw - 16px)}') > 0
    && cssSrc.indexOf('body.mobile-view .free-box .b-p,body.mobile-view .free-box p{overflow-wrap:anywhere;word-break:break-word}') > 0);

/* ---------- 8) 自动限时限制（banSelf）修复：三拦截全部打通 + 防锁死 ---------- */
console.log('【8】密码试错自动限时限制（走通 + 防锁死）');
T('banSelf 专用通道：绕过「不能屏蔽本机」守卫 + 轮询等签名密钥（waitBanKey 最多 3 秒）',
  col.indexOf('function banSelf(') > 0 && col.indexOf('function waitBanKey(') > 0
    && col.indexOf('waitBanKey(30)') > 0 && col.indexOf("if (devId === me.id || devFp === me.fp)") > 0);
T('自动限时条目带 auto:1 + until（默认 30 分钟），过期自动失效（banStateFor 过滤）',
  col.indexOf('auto: 1, until:') > 0 && col.indexOf('1800000') > 0
    && col.indexOf('until < now') > 0);
T('root 防锁死：仅自动限时条目放行 root 登录（manual 标志区分手动屏蔽），登录成功自动清除（clearAutoBan）',
  col.indexOf('manual: manual') > 0 && appSrc.indexOf('bs.auto && !bs.manual') > 0
    && col.indexOf('function clearAutoBan(') > 0 && appSrc.indexOf('clearAutoBan()') > 0);

console.log('\n结果：' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
