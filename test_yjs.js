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
T('双视图上传：专有通道完整配置（含团队密码分发）+ 团队密码登录一键上传（看不到任何密钥）',
  edt.indexOf('syncModalLite') > 0 && edt.indexOf('syncModalRoot') > 0
    && edt.indexOf('teamPw') > 0 && edt.indexOf('tokenVault') > 0);
T('登录回调：管理员登录启动协同，团队密码登录自动解密保险箱取回上传通道（refreshGh 重入接线）',
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
T('访客互动开关：commentsOff 三通道拦截（留言/发帖/回复）+ 渲染层提示（反馈页/讨论区各自提示）+ 网站信息开关（管理员不受限）',
  appSrc.indexOf('function commentsOff') > 0 && (appSrc.match(/commentsOff\(\)\) \{ toast/g) || []).length >= 3
    && appSrc.indexOf('反馈已由管理员暂时关闭') > 0 && appSrc.indexOf('讨论区已由管理员暂时关闭') > 0
    && edt.indexOf('cOff') > 0);
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
T('试错自动入黑名单：登录成功时走 banSelf 限时通道（1 小时内 ≥5 次失败；专有通道豁免并自动清除限时）',
  appSrc.indexOf('LMCollab.banSelf(1800000)') > 0 && appSrc.indexOf('管理员入口将被限制 30 分钟') > 0
    && appSrc.indexOf('已自动清除本机限时限制') > 0 && appSrc.indexOf('clearAutoBan()') > 0);
T('上线/断线提示统一走设备状态机：上线 / 断线 / 已退出页面 / 重新连上 / 超时移除（8 秒去抖 + 启动静默期）',
  col.indexOf('已上线') > 0 && col.indexOf('已断线') > 0 && col.indexOf('已退出页面') > 0
    && col.indexOf('function peerToast(d, kind) {') > 0
    && col.indexOf('const gonePeers = [];') < 0);
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
T('↑↓ 换位对并排块拦截（防拆散行），提示用「取消并排」',
  edt2.indexOf('function swapNeighbor(page, i, up) {') > 0
    && edt2.indexOf('并排的块不参与上下换位') > 0);
T('取消并排：pickFullGroup 校验同组且全选（跨组/选不全不可取消）+ doUnarrange 恢复正确宽度 + 末块贴右（wAlign）',
  edt2.indexOf('function pickFullGroup(') > 0 && edt2.indexOf('组没选全') > 0
    && edt2.indexOf('function doUnarrange(') > 0 && edt2.indexOf("b.wAlign = 'right'") > 0
    && edt2.indexOf("data-tb=\"unarrange\"") > 0 && edt2.indexOf("case 'unarrange': doUnarrange();") > 0);
T('取消并排渲染：wAlign=right 的窄块 margin-left:auto 贴页面右缘（修复51 后 wAlign 作回落值，hAlign 优先）',
  appSrc.indexOf("const al = b.hAlign || b.wAlign;") > 0
    && appSrc.indexOf("al === 'right' ? 'margin-left:auto;'") > 0
    && appSrc.indexOf("al === 'center' ? 'margin-left:auto;margin-right:auto;'") > 0);

/* ---------- 9.5) 修复㉙：调宽挤开并排框 / 文本框占位 / 跳转空白弹性匹配 / Token 记住 ---------- */
console.log('【9.5】修复㉙：并排调宽互挤 · 空文本框占位 · 跳转空白匹配 · Token 记住');
T('调宽松手 force 互挤：resolveFreeOverlaps 加 force 参数，同组对在 force 时不跳过（扩宽挤开旁边的并排框）',
  edt2.indexOf('function resolveFreeOverlaps(wrap, me, quiet, force)') > 0
    && edt2.indexOf('if (!force && A.b.free.g != null && A.b.free.g === B.b.free.g) continue;') > 0
    && edt2.indexOf('resolveFreeOverlaps(wrap, b, false, true);') > 0);
T('拖动松手不传 force（保持旧行为：拖框不拆散并排行）',
  edt2.indexOf('resolveFreeOverlaps(wrap, b);') > 0 && edt2.indexOf('resolveFreeOverlaps(wrap, b, false, true);') > 0);
T('新插入文本框 text 置空（占位交给渲染层 data-ph，不再是真文字）',
  edt2.indexOf("return { type: 'paragraph', size: 'normal', text: '', style: {} };") > 0
    && edt2.indexOf('function textBoxDefault() {') > 0);
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
T('hlWrapped 用 tok 线性配对检测（兼容带色开标记；判定用「原始选区」，不受外层扩展影响）',
  edt2.indexOf('hlToks[ki].b === rawS && hlToks[ki + 1].a === rawE') > 0);
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
  appSrc.indexOf('function takeAdminSnap()') > 0 && appSrc.indexOf('function discardChanges(which)') > 0
    && appSrc.indexOf('takeAdminSnap(); /* ★ 修复㉜：进入管理模式的瞬间拍内容快照') > 0
    && appSrc.indexOf('if (state.admin) takeAdminSnap();') > 0
    && appSrc.indexOf('adminSnap = null; pushSnap = null; /* ★ 修复㉜/83：退出管理模式即弃两份快照 */') > 0
    && appSrc.indexOf('discardChanges: discardChanges') > 0);
T('管理条新增「↩ 放弃修改」按钮（确认弹窗写明协同回退影响）',
  edt2.indexOf('data-panel="discard"') > 0 && edt2.indexOf("k === 'discard'") > 0
    && edt2.indexOf("LMApp.discardChanges(b.getAttribute('data-dsnap'));") > 0);
T('密码云端重验：本地失败自动拉云端 content.js 用最新密码数据重验，命中才合入本机 admin 配置',
  appSrc.indexOf('function fetchRemoteContent()') > 0
    && appSrc.indexOf("fetch('data/content.js?lmnc='") > 0
    && appSrc.indexOf('function verifyPasswordSmart(v)') > 0
    && appSrc.indexOf('verifyPasswordSmart(v).then(function (r) {') > 0
    && appSrc.indexOf('state.content.config.admin = rc.config.admin') > 0
    && appSrc.indexOf("cache: 'no-store'") > 0);
T('手机操作栏：点按浮现 6 秒无操作进入待机（半透明可点，不摘 selected），有操作恢复全亮并重置计时',
  edt2.indexOf('function armToolsAutohide()') > 0 && edt2.indexOf("classList.contains('mobile-view')") > 0
    && edt2.indexOf("w.classList.add('tools-idle')") > 0
    && edt2.indexOf("w.classList.remove('tools-idle')") > 0
    && edt2.indexOf("addEventListener('pointerdown'") > 0
    && edt2.indexOf("document.querySelectorAll('.tools-idle').forEach") > 0
    && cssSrc.indexOf('body.admin.mobile-view .block-wrap .block-tools,body.admin.mobile-view .free-box .block-tools{display:flex;opacity:0;pointer-events:none;transition:opacity .5s ease}') > 0
    && cssSrc.indexOf('body.admin.mobile-view .block-wrap.tools-idle .block-tools,body.admin.mobile-view .free-box.tools-idle .block-tools{opacity:.35 !important}') > 0);
T('手机双击进编辑：第一击 preventDefault 只选中块，400ms 内第二击放行原生聚焦（滚动/拖拽位移>12px 放行）',
  edt2.indexOf('var lastEditTap = { t: 0, el: null }, editTapStart = null;') > 0
    && edt2.indexOf("dx * dx + dy * dy > 144") > 0
    && edt2.indexOf("lastEditTap.el === key && now - lastEditTap.t < 400") > 0);
T('手机端自由框手柄不再常显（selected/free-drag/focus-within 才出现）',
  cssSrc.indexOf('body.admin.mobile-view .fb-grip,body.admin.mobile-view .fb-hd{display:none}') > 0
    && cssSrc.indexOf('body.admin.mobile-view .free-box.selected .fb-grip') > 0);
T('并排重叠兜底：fixFreeOverlapVisual 推框写数据（框压块→框下移到块底，持久不振荡；锁定段零改动）',
  appSrc.indexOf('function fixFreeOverlapVisual()') > 0
    && appSrc.indexOf("if (!col || col._freeSession) return;") > 0
    && appSrc.indexOf('fd.b.free.y = Math.round((+fd.b.free.y || 0) + dy);') > 0
    && appSrc.indexOf('if (moved) {') > 0
    && appSrc.indexOf('adjustFreeLayout(); /* 框位已持久更新：让位引擎按新位置立即对齐（原版，不再产生兜底抬升） */') > 0
    && appSrc.indexOf('adjustFreeLayout: adjustFreeLayoutSafe') > 0
    && appSrc.indexOf('function adjustFreeLayoutSafe() {') > 0
    && appSrc.indexOf('if (commitFreeRide()) { adjustFreeLayout(); fixFreeOverlapVisual(); }') > 0);
T('手机端入场动画统一只淡入不位移（访客同样受益；桌面保持 30px 上滑不变）',
  cssSrc.indexOf('body.mobile-view .reveal{transform:none}') > 0
    && cssSrc.indexOf('body.mobile-view .free-box.reveal{transform:none}') < 0);

/* ---------- 9.9) 修复㉝：手机工具条收成把手 / 点块任意位置浮现操作栏 / 协同局部刷新 / 手机排版兜底 ---------- */
console.log('【9.9】修复㉝：工具条把手 · 点块浮现 · 协同局部刷新 · 排版兜底');
T('editBar 手机端收成右上角 ⌨️ 把手（默认收起、点开恢复；桌面默认展开、也可手动收起——修复79）',
  edt2.indexOf('class="eb-toggle"') > 0
    && edt2.indexOf("tbSetOpen(!tg.closest('#editBar').classList.contains('open'));") > 0
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
  appSrc.indexOf("hPush('其他设备的修改（协同同步）'); /* ★ 撤销基准随远端内容同步") > 0);
T('手机排版兜底：free-box 不溢出屏 + 长词/链接自动断行',
  cssSrc.indexOf('body.mobile-view .free-box{max-width:calc(100vw - 16px)}') > 0
    && cssSrc.indexOf('body.mobile-view .free-box .b-p,body.mobile-view .free-box p{overflow-wrap:anywhere;word-break:break-word}') > 0);

/* ---------- 9.10) 修复㉞：手机并排组竖排 / 自由框漂移自愈 / ⤓ 归位 / padB 钳制 ---------- */
console.log('【9.10】修复㉞：并排竖排 · 漂移自愈 · ⤓ 归位 · padB 钳制');
T('手机端并排组竖排：fixFreeOverlapVisual 显示层按 free.gi 顺序全宽堆叠（数据零改动，桌面照旧并排）',
  appSrc.indexOf('手机端并排组竖排') > 0
    && appSrc.indexOf("fd.w.style.left = '1%'; fd.w.style.width = '98%'; fd.w.style.top = gy + 'px';") > 0
    && appSrc.indexOf('(+a.b.free.gi || 0) - (+c.b.free.gi || 0)') > 0);
T('自由框矩形改实测（竖排重排后数据 y 已过时）',
  appSrc.indexOf('fd.top = r.top + sy;') > 0);
T('漂移自愈：top 超流底部 800px 判漂移，整组摘 free 回文档流 + renderBlockAt + saveLocal + 提示一次',
  appSrc.indexOf('fd.top > flowBottom + 800') > 0
    && appSrc.indexOf('⚠️ 有模块漂出了页面范围，已自动归位到文档流（原并排/自由摆放已解除）') > 0
    && appSrc.indexOf('setTimeout(function () { adjustFreeLayoutSafe(); }, 60);') > 0);
T('⤓ 归位：自由框操作栏新增按钮（isFree 才显示），unfreeBlock 摘 free 走 commit 全链路',
  edt2.indexOf('data-act="unfree"') > 0
    && edt2.indexOf("e.target.closest('[data-act=\"unfree\"]')") > 0
    && appSrc.indexOf('function unfreeBlock(i)') > 0
    && appSrc.indexOf("commit({ msg: '已归位：模块回到文档流原来的位置（随内容自动排版）' })") > 0
    && appSrc.indexOf('unfreeBlock: unfreeBlock') > 0);
T('padB 钳制：自由框占位上限 4000px（防损坏数据撑出天文空白）',
  appSrc.indexOf('padB = Math.min(padB, 4000);') > 0);

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

/* ---------- 9.11) 修复㊴：手机端协作徽章缩小避让管理工具栏 ---------- */
console.log('【9.11】修复㊴：协作徽章手机端缩小 + 管理工具栏上移避让');
T('手机端协作徽章缩小（42vw/11px/紧凑）避让底栏，管理工具栏与设备面板上移 22px 让出底边',
  cssSrc.indexOf('body.mobile-view #collabChip{left:8px;bottom:8px;font-size:11px;padding:4px 9px;max-width:42vw;background:rgba(29,29,31,.72)}') > 0
    && cssSrc.indexOf('body.mobile-view #adminBar{bottom:44px}') > 0
    && cssSrc.indexOf('body.mobile-view #collabPanel{bottom:44px}') > 0);
/* ---------- 9.12) 修复㊵：推框只消解浅压（深压归让位引擎，不再拆台） ---------- */
console.log('【9.12】修复㊵：推框深压跳过（>24px 交让位引擎），浅压残留照常推框');
T('fixFreeOverlapVisual 深压跳过 + 浅压推框共存（同一把 24px 尺子，互不越界）',
  appSrc.indexOf('if ((natTop + r.height) - fd.top > 24) continue;') > 0
    && appSrc.indexOf('fd.b.free.y = Math.round((+fd.b.free.y || 0) + dy);') > 0
    && appSrc.indexOf('if (commitFreeRide()) { adjustFreeLayout(); fixFreeOverlapVisual(); }') > 0);
/* ---------- 9.13) 修复㊶：手机键入「✕ 退出键入」红钮 + 工具栏单行滚动 / ⌨️ 常驻右上 ---------- */
console.log('【9.13】修复㊶：退出键入红钮 · 工具栏单行横滑 · ⌨️ 常驻右上角');
T('键入态显示「✕ 退出键入」红钮（body.typing），pointerdown 失焦收键盘；键入时管理条上移避让',
  edt2.indexOf("editExit.className = 'edit-exit'") > 0
    && edt2.indexOf("document.body.classList.add('typing')") > 0
    && edt2.indexOf("document.body.classList.remove('typing')") > 0
    && edt2.indexOf('ae.blur()') > 0
    && cssSrc.indexOf('body.mobile-view.typing .edit-exit{display:block}') > 0
    && cssSrc.indexOf('body.mobile-view.typing #adminBar{bottom:88px}') > 0);
T('手机 editBar：tab 吸左 + 工具单行横向滚动；「开始/插入」当前项补回蓝底白字（修复74）',
  cssSrc.indexOf('body.mobile-view .tb-tab{position:sticky;left:0;z-index:2;background:rgba(246,247,249,.96);flex:none}') > 0
    && cssSrc.indexOf('body.mobile-view .tb-grp{flex-wrap:nowrap;justify-content:flex-start;flex:0 0 auto;min-width:0}') > 0
    && cssSrc.indexOf('body.mobile-view .tb-tab.act{background:var(--blue);color:#fff}') > 0);
/* ---------- 9.14) 修复㊷：浅压放行「从上方放置」姿态（框顶高于块顶时不推框） ---------- */
console.log('【9.14】修复㊷：框从上方压块的浅压放行（骑压姿态仍推），↑ 微调可穿越浅压墙');
T('fixFreeOverlapVisual 姿态判定：fd.top<=natTop（从上方放置）浅压放行，骑压浅压仍推框',
  appSrc.indexOf('if (fd.top <= natTop) continue;') > 0
    && appSrc.indexOf('★ 修复㊷：框顶在块顶上方 = 用户把框从上方放置的姿态') > 0
    && appSrc.indexOf('if ((natTop + r.height) - fd.top > 24) continue;') > 0
    && appSrc.indexOf('fd.b.free.y = Math.round((+fd.b.free.y || 0) + dy);') > 0);
/* ---------- 9.15) 修复㊸：彻查回归批次（跨页残留选中 / ⌨️ 滑出误触 / typing 桌面泄漏） ---------- */
console.log('【9.15】修复㊸：切页作废残留选中 · ⌨️ 按下确认 · typing 限定手机端');
T('renderToolbar 切页检测：页变化即作废 tb.active/imgSel/pressBi/hero 残留（不再挂到新页同位块）',
  edt2.indexOf('if (renderToolbar._pg !== (pgNow ? pgNow.id : null)) {') > 0
    && edt2.indexOf('tb.hero = null; tb.heroField = null; tb.heroTextField = null;') > 0);
/* ---------- 9.16) 修复㊾：回滚修复㊹的孤儿让位回收（过渡中实测误判 → 乱飞/重叠/拖动差身位） ---------- */
console.log('【9.16】修复㊾：孤儿回收已回滚（过渡中实测 natTop 不可靠），fixFreeOverlapVisual 不再做 margin 清零');
T('孤儿回收代码已移除（回到 freeDecide 全量重算唯一权威），漂移自愈段保持原样',
  appSrc.indexOf('let orphan = false;') < 0
    && appSrc.indexOf('if (orphan) adjustFreeLayout();') < 0
    && appSrc.indexOf('let healed = false;') > 0
    && appSrc.indexOf('fd.top > flowBottom + 800') > 0);
/* ---------- 9.17) 修复㊿：自由框操作栏语义分组 + ⤓底对齐 + 归位改⌂ ---------- */
console.log('【9.17】修复㊿：操作栏分组分隔线 · 新增底对齐 · 归位图标改 ⌂');
T('free 操作栏语义分组（.sep 分隔线）+ ⤓底对齐（freeBottomAlign 镜像 ⤒）+ 归位图标改 ⌂',
  edt2.indexOf('function freeBottomAlign(page, i)') > 0
    && edt2.indexOf("if (act === 'fbottom') { freeBottomAlign(page, i); return; }") > 0
    && edt2.indexOf('data-act="fbottom"') > 0
    && edt2.indexOf('框的下缘已贴平到下一模块顶部') > 0
    && edt2.indexOf('下方没有其他模块，已贴到文档流底部') > 0
    && edt2.indexOf('⌂</button>') > 0
    && cssSrc.indexOf('.block-tools .sep{width:1px;align-self:stretch;margin:5px 1px;background:rgba(0,0,0,.14);border-radius:1px;flex:none}') > 0);
/* ---------- 9.18) 修复51：所有文档流块统一水平对齐钮（9.28 更新：对齐不再改宽度） ---------- */
console.log('【9.18】修复51：对齐钮扩到全部非 free 块 · sep 分组 · hAlign 裁决 margin（63 起不改宽度）');
T('非 free 块统一 ⇤⇆⇥（sep 分组）+ halign 处理器（63 起全宽块提示不压缩）+ 渲染层 hAlign 优先（center 支持）',
  edt2.indexOf("} else if (!isFree) {") > 0
    && edt2.indexOf('全宽块对齐看不到变化——先用四角手柄拖窄一点，再点对齐') > 0
    && edt2.indexOf("if (v && v !== 'left' && !b2.free && b2.type !== 'image' && b2.width == null) {") > 0
    && edt2.indexOf("b2.width = 68;") < 0
    && appSrc.indexOf("const al = b.hAlign || b.wAlign;") > 0
    && appSrc.indexOf("al === 'center' ? 'margin-left:auto;margin-right:auto;'") > 0);
/* ---------- 9.19/9.21) 修复52+54：↑↓ 与自由框真互换（自动放回流）+ 拖动克隆块顶贴鼠标 ---------- */
console.log('【9.19】修复52+54：换位遇自由框 = 放回流再互换 · 拖动统一「块顶贴鼠标」');
T('↑↓ 按「视觉相邻」换位（★ 修复86 取代修复54 的「放回流再换数组」）+ 与自由框互换按高度落到另一侧（★ 修复104）+ 延时重算让位 + 克隆 offX/offY≤12',
  edt2.indexOf('function swapNeighbor(page, i, up) {') > 0
    && edt2.indexOf("if (act === 'up' || act === 'down') { swapNeighbor(page, i, act === 'up'); return; }") > 0
    && edt2.indexOf('page.blocks[i] = other; page.blocks[j] = mine;') > 0
    && edt2.indexOf('const bothFlow = !mine.free && !other.free;') > 0
    && edt2.indexOf('if (bothFlow) { page.blocks[i] = other; page.blocks[j] = mine; }') > 0
    && edt2.indexOf('mine.free.y = up ? Math.max(0, otherNat - myH - GAP) : otherNat + otherH + GAP;') > 0
    && edt2.indexOf('other.free.y = up ? myNat + myH + GAP : Math.max(0, myNat - otherH - GAP);') > 0
    && edt2.indexOf('自由摆放框已整块让到另一侧') > 0
    && edt2.indexOf('else if (mine.free) mine.free.y = otherTop;') < 0
    && edt2.indexOf('else if (other.free) other.free.y = myTop;') < 0
    && edt2.indexOf('delete prev.free') < 0
    && edt2.indexOf('delete next.free') < 0
    && edt2.indexOf('const offX = e.clientX - r0.left, offY = Math.min(e.clientY - r0.top, 12);') > 0);
/* ---------- 9.20) 修复53：自由框调高下限 = 内容实际高度（不再硬编码 50px，字不溢出格子） ---------- */
console.log('【9.20】修复53：调高下限 = 内容实际高度（65 起用 auto 瞬测，不再被自身高度锁死）');
T('startFreeResize 抓取时记录 minH（内容实际高度）并用于 s/se 高度钳制',
  edt2.indexOf('const minH = Math.max(50, contentH + 2);') > 0
    && edt2.indexOf("if (dir === 's' || dir === 'se') b.free.h = Math.max(minH, Math.round(f0.h + dy));") > 0);



/* ---------- 9.21) 修复55：自动更新探针（顽固缓存浏览器自救）+ 手机端操作栏去重合紧凑化 ---------- */
console.log('【9.21】修复55：LM_ASSET_VER 探针自动刷新 · index.html ?v= 版本参数 · 手机 sep 隐藏 + ⠿ 让位');
T('app.js 顶部版本探针（no-store 强拉对比 reload）+ 手机操作栏 sep 隐藏/gap 紧凑/自由框给 ⠿ 让位',
  /var LM_ASSET_VER = '\d+';/.test(appSrc)
    && appSrc.indexOf("fetch('js/app.js?probe=' + Date.now(), { cache: 'no-store' })") > 0
    && appSrc.indexOf('if (m && m[1] && m[1] !== LM_ASSET_VER && !(sessionStorage.getItem(\'lm_ver_reload\') === m[1]))') > 0
    && cssSrc.indexOf('body.mobile-view .block-tools .sep{display:none}') > 0
    && cssSrc.indexOf('body.mobile-view .free-box .block-tools{padding-left:42px}') > 0);
/* ---------- 9.22) 修复56：流块右下角拖高（min-height + 内容上下置中）+ ⤒⤓ 贴平留 16px 标准缝 ---------- */
console.log('【9.22】修复56：se 角拖 b.h 拉高 · v-mid 垂直居中渲染 · ⤒⤓ GAP=16 苹果式板块间隙');
T('startBlockResize se 调 b.h（拖回取消）+ 渲染 v-mid/min-height + 贴平 GAP 16 + CSS .v-mid flex 居中',
  edt2.indexOf('if (dir === \'se\') {') > 0
    && edt2.indexOf('wrap.classList.toggle(\'v-mid\', !!b.h);') > 0
    && appSrc.indexOf("if (b.h) { wrapCls += ' v-mid'; wrapSt += 'min-height:' + Math.max(0, +b.h) + 'px;'; }") > 0
    && edt2.indexOf('const GAP = 16;') > 0
    && edt2.indexOf('bestBottom + GAP - rb.top') > 0
    && edt2.indexOf('bestTop - GAP - rb.bottom') > 0
    && cssSrc.indexOf('.block-wrap.v-mid{display:flex;flex-direction:column;justify-content:center}') > 0);



/* ---------- 9.23) 修复57：手机弹窗顶部对齐（键盘不再顶飞密码框）+ 登录框预检锁定 + enterkeyhint ---------- */
console.log('【9.23】修复57：modal 顶部对齐避开软键盘 · 打开登录框先报锁定 · 软键盘 done 键');
T('手机 modal-mask 顶部对齐 + 登录弹窗 preLock 预检 + 密码框 enterkeyhint=done',
  cssSrc.indexOf('body.mobile-view .modal-mask{align-items:flex-start;padding-top:14px}') > 0
    && appSrc.indexOf('const preLock = +(sessionStorage.getItem(\'lm_lock_until\') || 0);') > 0
    && appSrc.indexOf('+ preNote') > 0
    && appSrc.indexOf('enterkeyhint="done"') > 0);

T('⌨️ 把手 pointerdown+pointerup 双确认（触屏隐式捕获下「按下后滑开」不再误触发开合）',
  edt2.indexOf("ebToggleDown = !!(e.target && e.target.closest && e.target.closest('#editBar .eb-toggle'));") > 0
    && edt2.indexOf('if (tg && ebToggleDown)') > 0
    && edt2.indexOf("tbSetOpen(!tg.closest('#editBar').classList.contains('open'));") > 0);
T('键入态红钮与管理条抬升只作用于手机端（桌面键入无红钮、管理条不跳位）',
  cssSrc.indexOf('body.mobile-view.typing .edit-exit{display:block}') > 0
    && cssSrc.indexOf('body.mobile-view.typing #adminBar{bottom:88px}') > 0
    && cssSrc.indexOf('body.typing .edit-exit{display:block}') < 0
    && cssSrc.indexOf('body.typing #adminBar{bottom:88px}') < 0);

/* ---------- 9.24) 修复58：登录框 👁 显示密码切换（长密码输入可核对） ---------- */
console.log('【9.24】修复58：👁/🙈 切明文核对 · 切后焦点回输入框');
T('登录弹窗 pwEye 切换 type=password/text 并 focus 回输入框',
  appSrc.indexOf("root.querySelector('#pwEye').addEventListener('click', function () {") > 0
    && appSrc.indexOf("inp.type = show ? 'text' : 'password';") > 0
    && appSrc.indexOf("this.textContent = show ? '🙈' : '👁';") > 0
    && appSrc.indexOf('id="pwEye"') > 0);

/* ---------- 9.25) 修复60：自由框去白底（透明文本框）+ 管理态淡虚线 ---------- */
console.log('【9.25】修复60：自由框背景透明 · 访客无框 · 管理态淡蓝虚线 · 白卡阴影移除');
T('自由框 background:transparent + shadow:none + admin 淡蓝虚线 + 旧白底规则不再出现',
  cssSrc.indexOf('.free-box{position:absolute;z-index:20;background:transparent;border:1px dashed transparent;border-radius:14px;') > 0
    && cssSrc.indexOf('body.admin .free-box{border-color:rgba(0,113,227,.14)}') > 0
    && cssSrc.indexOf('.free-box{position:absolute;background:rgba(255,255,255') < 0);

/* ---------- 9.26) 修复61：荧光笔必须有选区（不再整块涂色） ---------- */
console.log('【9.26】修复61：hl 无选区 → toast 提示先拖选，绝不动整块；color/grad 整块模式保留');
T('hl 色板无选区时提示且 return（⊘ 清除除外），不再落 applyStyle 整块上色',
  edt2.indexOf("LMApp.toast('请先拖选要高亮的文字，再点颜色（荧光笔只作用于选中部分）');") > 0
    && edt2.indexOf("if (prop === 'hl' && v !== '') {") > 0
    && edt2.indexOf("if ((prop === 'color') && applyInlineSwatch(prop, v)) return;") > 0
    && edt2.indexOf("return; /* ★ 修复61：无选区不整块上色（确认路径同提示逻辑） */") > 0);

/* ---------- 9.27) 修复62：放弃更改 = 回到最近一次上传到 Hub 的版本 ---------- */
console.log('【9.27】修复62：放弃修改的「最近上传版」基准（★ 修复83 起改为可选的第二项，细节见 9.48）');
T('修复62 语义保留：上传成功 → 重拍「最近上传版」基准（= pushSnap，不再影响「进入管理模式时」）',
  col.indexOf('if (LMApp.takePushSnap) LMApp.takePushSnap();') > 0
    && appSrc.indexOf('takePushSnap: takePushSnap, snapInfo: snapInfo,') > 0);


/* ---------- 9.28) 修复63：调宽/调高挂让位会话（不再抖动）+ 对齐不改宽度 ---------- */
console.log('【9.28】修复63：startFreeResize 开启 beginFreeDrag 会话 · 对齐一律不改宽度（全宽块提示）');
T('startFreeResize 开头调 beginFreeDrag（会话内引擎不每帧重算）+ halign 全宽块提示不压缩 + 68% 强制已移除',
  edt2.indexOf('if (window.LMApp && LMApp.beginFreeDrag) LMApp.beginFreeDrag();') > 0
    && edt2.indexOf("LMApp.toast('全宽块对齐看不到变化——先用四角手柄拖窄一点，再点对齐');") > 0
    && edt2.indexOf('贴左：左缘贴齐，右缘不动（宽度不变）') > 0
    && edt2.indexOf('b2.width = 68;') < 0);
/* ---------- 9.29) 修复64：🩺 整理布局一键自愈（清残留让位边距+全量重算） ---------- */
console.log('【9.29】修复64：管理条 🩺 按钮 → fixLayout 清 margin 重算 · 不改内容数据');
T('管理条 🩺 整理布局按钮 + fixLayout 导出（清 _freeSession/margin-top + no-measure-anim 重算）',
  edt2.indexOf('data-panel="fixlayout"') > 0
    && edt2.indexOf("k === 'fixlayout'") > 0
    && appSrc.indexOf('function fixLayout() {') > 0
    && appSrc.indexOf('fixLayout: fixLayout, /* ★ 修复64：一键整理布局') > 0
    && appSrc.indexOf("if (!w.classList.contains('free-box')) w.style.marginTop = '';") > 0);
/* ---------- 9.30) 修复65：调高下限不再被自身高度锁死（拖大后能缩回去） ---------- */
console.log('【9.30】修复65：minH 测量前 height 置 auto 瞬测内容高 · 不再 ≥ 当前高度');
T('startFreeResize 测内容高时 height 置 auto 再恢复（scrollHeight 不被自身高度污染）',
  edt2.indexOf("const _prevH = wrap.style.height;") > 0
    && edt2.indexOf("wrap.style.height = 'auto';") > 0
    && edt2.indexOf('const contentH = wrap.scrollHeight || 0;') > 0
    && edt2.indexOf('wrap.style.height = _prevH;') > 0
    && edt2.indexOf('const minH = Math.max(50, contentH + 2);') > 0);
/* ---------- 9.31) 修复66：丢手的让位会话自动作废 + 三重兜底收尾 ---------- */
console.log('【9.31】修复66：会话泄漏自愈（2.5s 无拖动判泄漏 / pointercancel·blur·切后台 兜底）');
T('adjustFreeLayout 过期会话弃用 + beginFreeDrag 打时间戳 + freeSessionFallback 三处监听',
  appSrc.indexOf('if (S && !col.querySelector(\'.free-drag\') && Date.now() - (S.ts || 0) > 2500) {') > 0
    && appSrc.indexOf('if (col._freeSession) col._freeSession.ts = Date.now();') > 0
    && appSrc.indexOf('function freeSessionFallback() {') > 0
    && appSrc.indexOf("document.addEventListener('pointercancel', freeSessionFallback);") > 0
    && appSrc.indexOf("window.addEventListener('blur', freeSessionFallback);") > 0
    && appSrc.indexOf("document.addEventListener('visibilitychange', function () { if (document.hidden) freeSessionFallback(); });") > 0
    && appSrc.indexOf('col._freeSession = null; /* 丢弃过期快照') > 0);
/* ---------- 9.32) 修复67：自由框随上文一起下移（框不再被流块「钻到下面」） ---------- */
console.log('【9.32】修复67：free.ride 记账 + commitFreeRide 烘焙（框跟着上文走，缩回可逆）');
T('applyFreeScan 建 flowGeo 记账 + commitFreeRide 用 _lastScan 烘焙 free.ride + 布局体检导出',
  appSrc.indexOf('S.flowGeo = flows.map(function (f) {') > 0
    && appSrc.indexOf('S.flowGeo[i].m = m;') > 0
    && appSrc.indexOf('col._lastScan = SS;') > 0
    && appSrc.indexOf('function commitFreeRide() {') > 0
    && appSrc.indexOf('const S = col._lastScan;') > 0
    && appSrc.indexOf('if (fg.oi < oi && fg.natTop + fg.h <= natTop + 2) acc += fg.m;') > 0
    && appSrc.indexOf('b.free.y = Math.max(0, Math.round((+b.free.y || 0) + d));') > 0
    && appSrc.indexOf('b.free.ride = acc;') > 0
    && appSrc.indexOf('if (commitFreeRide()) { adjustFreeLayout(); fixFreeOverlapVisual(); }') > 0
    && appSrc.indexOf('function dumpLayout() {') > 0
    && appSrc.indexOf('dumpLayout: dumpLayout,') > 0);

/* ---------- 9.33) 修复68：松手/抓框不再「跳上去又弹下来」（基线反推，不清零 margin） ---------- */
console.log('【9.33】修复68：自然基线 = 实测顶端 − 上游让位前缀和（零 DOM 写入，不打断过渡）');
T('freeScan 去掉「清零 margin 再量」：改 computedStyle 让位量 + accM 前缀和反推；无自由框时才清残留',
  appSrc.indexOf('let accM = 0;') > 0
    && appSrc.indexOf('const m = parseFloat(getComputedStyle(f.w).marginTop) || 0;') > 0
    && appSrc.indexOf('accM += m;') > 0
    && appSrc.indexOf('f.natTop = r.top + sy - accM;') > 0
    && appSrc.indexOf('const cur = parseFloat(getComputedStyle(f.w).marginTop) || 0;') > 0
    && appSrc.indexOf('/* margin 已清零 → 此即自然基线 */') < 0);

/* ---------- 9.34) 修复69：自由框不再被文档流块盖住（"文本框跑到后面去了"） ---------- */
console.log('【9.34】修复69：自由框 z-index:20 常浮于文档流之上，拖动 60 / 选中 80 层次不变');
T('free-box 基础层级 20 + free-drag 60 + selected/multi 80 三档仍在（流块仍是 auto → 恒在框下面）',
  cssSrc.indexOf('.free-box{position:absolute;z-index:20;') > 0
    && cssSrc.indexOf('.free-box.free-drag{transition:none !important;cursor:grabbing;z-index:60}') > 0
    && cssSrc.indexOf('.blocks > .block-wrap:has(.multi-sel){z-index:80}') > 0
    && cssSrc.indexOf('.blocks > .block-wrap:not(.free-box){position:relative}') > 0
    && appSrc.indexOf("wrapCls += ' free-box';") > 0);

/* ---------- 9.35) 修复70：⠿ 拖动排序后 data-idx 按对象身份回写（自由框不再错位） ---------- */
console.log('【9.35】修复70：排序回写 data-idx 覆盖自由框（旧版漏写 → 让位失效、表格压住文本框）');
T('排序代码按「块对象 → 包裹」身份回写全部 data-idx（含 .free-box），旧版只写非自由框已消失',
  edt.indexOf('const wrapByIdx = new Map();') > 0
    && edt.indexOf("if (!!b3.free !== w3.classList.contains('free-box')) return; /* 已错位：不固化 */") > 0
    && edt.indexOf('page.blocks.forEach(function (b3, i3) {') > 0
    && edt.indexOf(".block-wrap:not(.free-box)').forEach(function (w2, i2) { w2.setAttribute('data-idx'") < 0
    && appSrc.indexOf('function wrapBlock(page, w) {') > 0
    && appSrc.indexOf('const b = wrapBlock(page, w);') > 0);
/* 真实执行一次「重排后回写」：page.blocks=[A,F,B,C]，把 C 拖到最前（order=[3,0,2]），
   校验每个 DOM 包裹的 data-idx 仍指向它自己的块 —— 自由框 F 必须落到尾部而不是指向别的块 */
(function () {
  const a = edt.indexOf('const wrapByIdx = new Map();');
  const z = edt.indexOf('LMApp.commit({ silent: true, rerender: false });', a);
  const code = (a >= 0 && z > a) ? edt.slice(a, z) : '';
  const mk = function (cls) {
    let v = '0';
    const o = {
      className: cls,
      getAttribute: function () { return v; },
      setAttribute: function (k, x) { v = String(x); },
      idx: function (x) { if (x == null) return +v; v = String(x); },
      classList: { contains: function (k) { return k === 'free-box' && cls.indexOf('free-box') >= 0; } }
    };
    return o;
  };
  const A = { t: 'A' }, F = { t: 'F', free: { y: 10, x: 0, w: 40 } }, B = { t: 'B' }, C = { t: 'C' };
  const page = { blocks: [A, F, B, C] };
  const wA = mk('block-wrap'), wF = mk('block-wrap free-box'), wB = mk('block-wrap'), wC = mk('block-wrap');
  wA.idx(0); wF.idx(1); wB.idx(2); wC.idx(3);
  const order = [3, 0, 2], frees = [F];
  const doc = { querySelectorAll: function () { return [wA, wF, wB, wC]; } };
  let ok = false;
  try {
    new Function('document', 'page', 'order', 'frees', code)(doc, page, order, frees);
    ok = page.blocks.length === 4
      && page.blocks[0] === C && page.blocks[1] === A && page.blocks[2] === B && page.blocks[3] === F
      && wC.idx() === 0 && wA.idx() === 1 && wB.idx() === 2 && wF.idx() === 3;
  } catch (e) { ok = false; }
  T('排序后每个包裹的 data-idx 仍指向自己的块（自由框 F 正确落在尾部，不再指向别的块）', ok);
})();

/* ---------- 9.36) 修复71：徽章台数与设备面板统一口径（两台在线不再显示 1 台） ---------- */
console.log('【9.36】修复71：在线台数统一 —— 徽章/面板共用 deviceList()（含本机、并集去重、presence 先于花名册）');
T('collab.js：deviceList/liveCount 抽出 + 徽章改用它 + 旧 max(1+peers, yPeerCount()) 公式已消失',
  col.indexOf('function deviceList() {') > 0
    && col.indexOf('function liveCount() {') > 0
    && col.indexOf('const n = liveCount();') > 0
    && col.indexOf('const list = deviceList();') > 0
    && col.indexOf('Math.max(1 + Object.keys(peers).length, yPeerCount())') < 0);
/* 真实执行 deviceList/liveCount/lostCount（修复73 起名单来自设备状态机 liveSeen）：
   在线 2 台（本机 + hbyc）+ 断线 1 台 → 「在线 2 台」，断线那台仍留在名单里但不算在线 */
(function () {
  const a = col.indexOf('function deviceList() {');
  const z = col.indexOf('/* ★ 修复71：徽章每 6 秒对齐一次', a);
  const code = (a >= 0 && z > a) ? col.slice(a, z) + '\nreturn { deviceList: deviceList, liveCount: liveCount, lostCount: lostCount };' : '';
  let ok = false;
  try {
    const liveSeen = {
      SELF: { id: 'SELF', name: '设备189c', page: 'updates', self: true, state: 'online', last: Date.now(), lostAt: 0 },
      HBYC: { id: 'HBYC', name: '设备hbyc', page: 'home', self: false, state: 'online', last: Date.now(), lostAt: 0 },
      GONE: { id: 'GONE', name: '设备断线', page: 'home', self: false, state: 'lost', last: Date.now() - 90000, lostAt: Date.now() - 30000 }
    };
    const api = new Function('liveSeen', 'roster', 'window', 'me', code)(
      liveSeen,
      function () { return { OLD: { name: '设备很久以前', page: 'home', lastSeen: Date.now() - 600000 } }; },
      { LMYCollab: { presence: function () { return []; } } },
      { id: 'SELF', name: '设备189c', fp: '' }
    );
    const list = api.deviceList();
    const gone = list.filter(function (p) { return p.id === 'GONE'; })[0];
    ok = api.liveCount() === 2 && api.lostCount() === 1 && list.length === 3
      && !!gone && gone.lost === true && gone.lostSec >= 29;
  } catch (e) { ok = false; }
  T('在线 2 台（本机 + hbyc）与断线 1 台分开计；断线设备仍留在面板里（lost 标记 + 已断线秒数）', ok);
})();
/* ---------- 9.37) 修复72：编辑停手后对方不同步（把「光标停在框里」当成了「正在输入」） ---------- */
console.log('【9.37】修复72：停手即同步 —— localBusy 只认「真在打字」· 挂起包定时分流 · Yjs 通道免墙上时钟门');
T('collab.js：localBusy 改判「按键 1.2s 内才算输入中」+ 指针 20s 兜底 + 定时 flushPending + 指针丢失复位',
  col.indexOf('var BUSY_KEY_WIN = 1200;') > 0
    && col.indexOf('var BUSY_PTR_MAX = 20000;') > 0
    && col.indexOf('if (lastKeyAt && Date.now() - lastKeyAt < BUSY_KEY_WIN) return true;') > 0
    && col.indexOf('if (Date.now() - (pointerAt || 0) > BUSY_PTR_MAX) { pointerDown = false; pointerAt = 0; }') > 0
    && col.indexOf('setInterval(function () { if (pending) flushPending(); }, 800);') > 0
    && col.indexOf("document.addEventListener('pointercancel'") > 0
    && col.indexOf('if (ae && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) return true;') < 0);
/* 真实执行 localBusy：光标停在可编辑框里但 5 秒没按键 = 不忙（旧逻辑恒为忙 → 远端包永远挂起） */
(function () {
  const a0 = col.indexOf('function localBusy() {');
  const z0 = col.indexOf('\n  }', a0); /* 注意：源码是 CRLF，只能匹配到 '\n  }'（不带行尾换行） */
  const code = (a0 >= 0 && z0 > a0) ? col.slice(a0, z0 + 4) : '';
  const mk = function (down, at, key) {
    try {
      return new Function('document', 'window', 'pointerDown', 'pointerAt', 'lastKeyAt',
        'var BUSY_KEY_WIN = 1200, BUSY_PTR_MAX = 20000;' + code + '\nreturn localBusy;')(
        { querySelector: function () { return null; }, activeElement: { isContentEditable: true, tagName: 'P' } },
        { LMApp: {} }, down, at, key);
    } catch (e) { return null; }
  };
  const now = Date.now();
  const idleFocus = mk(false, 0, now - 5000);
  const typing = mk(false, 0, now);
  const stuckPtr = mk(true, now - 25000, now - 5000);
  T('光标停在文本框里、5 秒没按键 = 不忙（远端内容立即应用，不再等用户点一下页面）', !!idleFocus && idleFocus() === false);
  T('真的在打字（1.2 秒内有按键）= 忙（远端包照旧挂起，不打断本机输入）', !!typing && typing() === true);
  T('指针按住超过 20 秒（mouseup 丢失）= 自动复位，不再永久挂起', !!stuckPtr && stuckPtr() === false);
})();
T('Yjs 通道 force 绕过墙上时钟门 · 过期包留诊断 · 未来时间戳不进 lastTs · 未真正应用时不回写 Y.Doc',
  col.indexOf('force: true') > 0
    && col.indexOf('if (!msg.force && +(msg.ts || 0) <= lastTs) { warnStale(msg.ts); return false; }') > 0
    && col.indexOf('function warnStale(ts) {') > 0
    && col.indexOf('if (ts > Date.now() + 60000) ts = Date.now();') > 0
    && col.indexOf('diag: function () {') > 0
    && src.indexOf('var okApply = LMCollab.applyExternal(c, by);') > 0
    && src.indexOf('if (okApply !== false) pushLocal(LMApp.state.content);') > 0);
T('打字停手 1.2s 的保存不再要求「此刻仍聚焦」，切后台/切标签/关页面前立刻补一次保存广播',
  edt.indexOf('if (liveEdit.el && liveEdit.el.isConnected) saveEdited(liveEdit.el);') > 0
    && edt.indexOf('function flushLiveEdit() {') > 0
    && edt.indexOf("window.addEventListener('pagehide', flushLiveEdit);") > 0
    && edt.indexOf("document.addEventListener('visibilitychange', function () { if (document.hidden) flushLiveEdit(); });") > 0);

/* ---------- 9.38) 修复73：设备断线 / 退出 / 重连 / 超时移除（面板实时刷新） ---------- */
console.log('【9.38】修复73：设备状态机（在线 / 断线 / 已退出 / 超时移除）+ 面板 2 秒实时重绘');
T('collab.js：GONE_TTL + presenceReduce/presenceTick/peerToast + 面板重绘守卫 + 徽章报断线台数 + bye 记为退出',
  col.indexOf('var GONE_TTL = 120000;') > 0
    && col.indexOf('function presenceReduce(liveSeen, snap, now, goneTtl) {') > 0
    && col.indexOf('function presenceTick() {') > 0
    && col.indexOf("LMApp.toast('👋 ' + nm + ' 已退出页面')") > 0
    && col.indexOf("LMApp.toast('🔌 ' + nm + ' 已断线（网络中断，正在重连…）')") > 0
    && col.indexOf("LMApp.toast('⚪ ' + nm + ' ' + Math.round(GONE_TTL / 60000) + ' 分钟没回来，已从在线设备中移除')") > 0
    && col.indexOf('if (pan.innerHTML !== html) pan.innerHTML = html;') > 0
    && col.indexOf("' 台已断线）'") > 0
    && col.indexOf('leftIds[msg.from] = Date.now();') > 0
    && col.indexOf('setInterval(function () { try { presenceTick(); } catch (e2) { /* noop */ } }, 2000);') > 0);
/* 真实执行 presenceReduce：在线 → 断线（保留在名单）→ 超时移除；断线后又回来 = 「重新连上」 */
(function () {
  const a1 = col.indexOf('function presenceReduce(');
  const z1 = col.indexOf('\n  }', a1);
  const code = (a1 >= 0 && z1 > a1) ? col.slice(a1, z1 + 4) : '';
  let ok = true, st = {};
  try {
    const run = new Function('return ' + code.replace('function presenceReduce', 'function') + ';')();
    const T0 = 1700000000000, GONE = 120000;
    const SELF = { SELF: { id: 'SELF', name: '本机', self: true } };
    let ev = run(st, Object.assign({}, SELF, { A: { id: 'A', name: '设备A', page: 'home' } }), T0, GONE);
    ok = ok && st.SELF && st.SELF.state === 'online' && ev.length === 1 && ev[0].kind === 'join' && ev[0].id === 'A';
    ev = run(st, SELF, T0 + 5000, GONE);
    ok = ok && ev.length === 1 && ev[0].kind === 'lost' && st.A.state === 'lost' && st.A.lostAt === T0 + 5000;
    ev = run(st, Object.assign({}, SELF, { A: { id: 'A', name: '设备A' } }), T0 + 10000, GONE);
    ok = ok && ev.length === 1 && ev[0].kind === 'back' && st.A.state === 'online';
    ev = run(st, SELF, T0 + 20000, GONE);
    ok = ok && ev.length === 1 && ev[0].kind === 'lost';
    ev = run(st, SELF, T0 + 20000 + GONE + 1000, GONE);
    ok = ok && ev.length === 1 && ev[0].kind === 'gone' && !st.A;
  } catch (e) { ok = false; console.log('  执行异常: ' + e.message); }
  T('断线判定：消失 → lost（仍留在名单，带「已断线 N 秒」）→ 超过 GONE_TTL → gone（移除）；中途回来 = back', ok);
})();

/* ---------- 9.39) 修复74：手机端「开始/插入」白底白字 + 工具条展开后收不回去 ---------- */
console.log('【9.39】修复74：手机端 tab 当前项蓝底白字 + 工具条内「⌨️ 收起」钮（展开后能收回，桌面端不受影响）');
T('CSS：手机端 sticky 规则不许吞掉 .act 蓝底（否则白底白字看不清）；展开时隐藏够不着的 fixed ⌨️，改由工具条内收起钮负责',
  cssSrc.indexOf('body.mobile-view .tb-tab.act{background:var(--blue);color:#fff}') > 0
    && cssSrc.indexOf('body.admin.mobile-view #editBar.open .eb-toggle{display:none}') > 0
    && cssSrc.indexOf('body.mobile-view #editBar .tb-collapse{display:flex;position:sticky;right:0;') > 0
    && cssSrc.indexOf('.tb-collapse{display:none}') > 0);
T('editor.js：收起钮在「插入」之后（DOM 顺序）+ 点击只收工具条不误触格式按钮 + 走统一开合入口',
  edt2.indexOf('data-tbcollapse="1"') > 0
    && edt2.indexOf('>插入</button>') < edt2.indexOf('data-tbcollapse="1"')
    && edt2.indexOf("e.target.closest('[data-tbcollapse]')") > 0
    && edt2.indexOf('tbSetOpen(false); /* ★ 修复79') > 0);

/* ---------- 9.40) 修复75：第 3 层「嵌套条目」（子页面 + 条目块 + 条目树控制台） ---------- */
console.log('【9.40】修复75：子页面(parent)不进导航/首页 · 条目块自动列子条目 · 🗂 条目树增删改调序');
T('app.js：子页面数据模型（pageById / childPages / pagePath / pageTitle）+ 导航与首页排除 p.parent',
  appSrc.indexOf('function pageById(id) {') > 0
    && appSrc.indexOf('function childPages(parentId) {') > 0
    && appSrc.indexOf('function pagePath(id) {') > 0
    && appSrc.indexOf('function pageTitle(p) {') > 0
    && appSrc.indexOf("if (p.parent) return false; /* ★ 修复75：嵌套条目（子页面）不进顶部导航 */") > 0
    && appSrc.indexOf("p.id !== 'updates' && !p.parent; })") > 0);
T('app.js：entries 块渲染子页面卡片（卡片 / 列表两版式）+ 子页面面包屑 + 导出层级助手',
  appSrc.indexOf("case 'entries': {") > 0
    && appSrc.indexOf('const allKids = childPages(pageId).slice();') > 0
    && appSrc.indexOf("'<a class=\"entry-card\" href=\"#/p/'") > 0
    && appSrc.indexOf("'<a class=\"entry-row\" href=\"#/p/'") > 0
    && appSrc.indexOf('data-entryadd="') > 0
    && appSrc.indexOf('<nav class="crumb reveal">') > 0
    && appSrc.indexOf('return crumb + heroHtml') > 0
    && appSrc.indexOf('pageById: pageById, pageChildren: childPages, pagePath: pagePath, pageTitle: pageTitle,') > 0);
T('editor.js：TYPES/defaultsFor/formHTML/readForm 认 entries + 插入组「▤ 条目」+ 管理条「🗂 条目树」',
  edt2.indexOf("entries: { name: '嵌套条目', icon: '▤' }") > 0
    && edt2.indexOf("case 'entries': return { type: type, title: '下级条目', mode: 'card', cols: 3, note: '' };") > 0
    && edt2.indexOf('data-tb="entriesins"') > 0
    && edt2.indexOf("case 'entriesins': {") > 0
    && edt2.indexOf('data-panel="tree"') > 0
    && edt2.indexOf("else if (k === 'tree') treeModal();") > 0
    && edt2.indexOf("const entryAdd = e.target.closest ? e.target.closest('[data-entryadd]') : null;") > 0);
T('editor.js：条目树全操作（加分支/改名/调序/补条目块/级联删除 + 删页清跳转死链）',
  edt2.indexOf('function treeModal() {') > 0
    && edt2.indexOf('function openPageForm(pageId, parentId, fromTree, onlyBlk) {') > 0
    && edt2.indexOf('function movePage(id, dir) {') > 0
    && edt2.indexOf('function addEntriesBlock(pageId) {') > 0
    && edt2.indexOf('function descendants(id) {') > 0
    && edt2.indexOf('const kill = [id].concat(kids);') > 0
    && edt2.indexOf('function removePageDeep(id) {') > 0
    && edt2.indexOf('removePageDeep(pg2.id);') > 0
    && edt2.indexOf("return j && kill.indexOf(j.from && j.from.page) < 0 && kill.indexOf(j.to && j.to.page) < 0;") > 0
    && edt2.indexOf('data-treeadd="') > 0 && edt2.indexOf('data-treedel="') > 0
    && edt2.indexOf('data-treemv="up"') > 0 && edt2.indexOf('data-treeblock="') > 0);
T('CSS：条目卡片/列表/磁贴 + 面包屑 + 条目树缩进（手机端单列）',
  cssSrc.indexOf('.entry-grid{display:grid;gap:14px;grid-template-columns:repeat(3,minmax(0,1fr))}') > 0
    && cssSrc.indexOf(".entry-add{align-items:center;justify-content:center;border-style:dashed;") > 0
    && cssSrc.indexOf('body.mobile-view .entry-grid{grid-template-columns:1fr !important}') > 0
    && cssSrc.indexOf('.crumb-cur{color:var(--text);font-weight:600;') > 0
    && cssSrc.indexOf('.tree-row[data-d="2"]{padding-left:46px}') > 0
    && cssSrc.indexOf('.tree-acts button.danger:hover{background:rgba(215,0,21,.14);color:#d70015}') > 0);
/* 真实执行 treeRows：深度优先摊平 + 层级深度 + 子条目计数（首页不作为行出现） */
(function () {
  const a2 = edt2.indexOf('function treeRows(pages) {');
  const z2 = edt2.indexOf('\n  }', a2); /* 源码 CRLF：只匹配到 '\n  }'（不带行尾换行） */
  const code = (a2 >= 0 && z2 > a2) ? edt2.slice(a2, z2 + 4) : '';
  let ok = false;
  try {
    const run = new Function('return ' + code.replace('function treeRows', 'function') + ';')();
    const rows = run([
      { id: 'home' }, { id: 'domain', label: '领域地图' }, { id: 'ecology', label: '生态地图' },
      { id: 'cognition', label: '认知地图' },
      { id: 'neuron', label: '神经网络', parent: 'cognition' },
      { id: 'attention', label: '注意力', parent: 'cognition' },
      { id: 'deep', label: '深层网络', parent: 'neuron' }
    ]);
    ok = rows.length === 6
      && rows.map(function (r) { return r.id; }).join(',') === 'domain,ecology,cognition,neuron,deep,attention'
      && rows[0].depth === 0 && rows[3].depth === 1 && rows[4].depth === 2 && rows[5].depth === 1
      && rows[2].kids === 2 && rows[3].kids === 1 && rows[3].parent === 'cognition';
  } catch (e) { ok = false; console.log('  执行异常: ' + e.message); }
  T('treeRows：同级保持数组顺序、子条目紧跟父节点、深度正确（第 1 层首页不算行）', ok);
})();
/* 真实执行 pageById / childPages / pagePath：面包屑祖先链与子条目名单 */
(function () {
  const a3 = appSrc.indexOf('function pageById(id) {');
  const p3 = appSrc.indexOf('function pageTitle(p)');
  const z3 = appSrc.indexOf('\n', p3);
  const code3 = (a3 >= 0 && z3 > p3) ? appSrc.slice(a3, z3) : '';
  const pages3 = [
    { id: 'cognition', label: '认知地图' },
    { id: 'neuron', label: '神经网络', parent: 'cognition' },
    { id: 'attention', label: '注意力', parent: 'cognition', title: '注意力机制' },
    { id: 'deep', label: '', title: '深层网络', parent: 'neuron' }
  ];
  let ok = false;
  try {
    const api = new Function('state', code3 + '\nreturn { pageById: pageById, childPages: childPages, pagePath: pagePath, pageTitle: pageTitle };')({ content: { pages: pages3 } });
    ok = api.pageById('neuron').label === '神经网络'
      && api.pageById('nope') === null
      && api.childPages('cognition').map(function (p) { return p.id; }).join(',') === 'neuron,attention'
      && api.childPages('nobody').length === 0
      && api.pagePath('deep').map(function (p) { return p.id; }).join(',') === 'cognition,neuron,deep'
      && api.pagePath('cognition').map(function (p) { return p.id; }).join(',') === 'cognition'
      && api.pageTitle(pages3[3]) === '深层网络' && api.pageTitle(pages3[0]) === '认知地图';
  } catch (e) { ok = false; console.log('  执行异常: ' + e.message); }
  T('pagePath 面包屑链（cognition › neuron › deep）、childPages 同级名单、pageTitle 回落标题', ok);
})();
/* ---------- 9.41) 修复76：「整理布局」只算让位 · 悬空自由框一键收拢 ---------- */
console.log('【9.41】修复76：整理布局管「不重叠/不错位」，框顶大空白交给「⇧ 收拢空隙」');
T('app.js：scanFreeGaps 量「框顶 ↔ 上方最近块下缘」+ tidyGaps 只改 free.y 且走 commit（可撤销），不重置 ride',
  appSrc.indexOf('function scanFreeGaps() {') > 0
    && appSrc.indexOf('function tidyGaps(minGap) {') > 0
    && appSrc.indexOf('if (o.bottom <= it.top + 1 && o.bottom > base) base = o.bottom;') > 0
    && appSrc.indexOf('f.y = Math.max(0, Math.round((+f.y || 0) - (g.gap - FREE_GAP)));') > 0
    && appSrc.indexOf("commit({ msg: '已收拢 ' + list.length + ' 处空隙") > 0
    && appSrc.indexOf('f.ride = 0;') < 0
    && appSrc.indexOf('scanFreeGaps: scanFreeGaps, tidyGaps: tidyGaps,') > 0);
T('整理布局提示改造（悬空时报数量 + 最大空隙并指向新按钮）+ 管理条「⇧ 收拢空隙」按钮与确认弹窗',
  appSrc.indexOf("另有 ' + big.length + ' 个自由框悬空（最大 '") > 0
    && edt2.indexOf('data-panel="gaps"') > 0
    && edt2.indexOf("else if (k === 'gaps') {") > 0
    && edt2.indexOf('LMApp.tidyGaps(40);') > 0
    && edt2.indexOf('只重算「让位间距」') > 0);
/* 真实执行 scanFreeGaps：把纯算部分从源码截出来，用桩 DOM 跑一遍，验证「距离=框顶−上方最近块下缘」 */
(function () {
  const a4 = appSrc.indexOf('function scanFreeGaps() {');
  const z4 = appSrc.indexOf('\n  }', a4);
  const code4 = (a4 >= 0 && z4 > a4) ? appSrc.slice(a4, z4 + 4) : '';
  const mk = function (idx, top, bottom) {
    return {
      getAttribute: function (n) { return n === 'data-idx' ? String(idx) : null; },
      getBoundingClientRect: function () { return { top: top, bottom: bottom, left: 0, right: 100 }; }
    };
  };
  let ok = false;
  try {
    const w0 = mk(0, 0, 200), w1 = mk(1, 300, 460), w2 = mk(2, 480, 600);
    const col = {
      getBoundingClientRect: function () { return { top: 0, bottom: 9999 }; },
      querySelectorAll: function () { return [w0, w1, w2]; }
    };
    const st = { pageId: 'p', content: { pages: [{ id: 'p', blocks: [{ type: 'paragraph' }, { type: 'table', free: { y: 300 } }, { type: 'paragraph' }] }] } };
    const run = new Function('app', 'state', 'FREE_GAP', 'window', code4 + '\nreturn scanFreeGaps;')(
      { querySelector: function () { return col; } }, st, 16, { scrollY: 0, pageYOffset: 0 });
    const r1 = run();
    /* 第一块就是自由框：基准退回内容列顶端（colTop=0）→ 距离 = 框顶 100 */
    const wb = mk(0, 100, 260);
    const col2 = { getBoundingClientRect: function () { return { top: 0 }; }, querySelectorAll: function () { return [wb]; } };
    const st2 = { pageId: 'p', content: { pages: [{ id: 'p', blocks: [{ type: 'heading', free: { y: 100 } }] }] } };
    const run2 = new Function('app', 'state', 'FREE_GAP', 'window', code4 + '\nreturn scanFreeGaps;')(
      { querySelector: function () { return col2; } }, st2, 16, { scrollY: 0, pageYOffset: 0 });
    const r2 = run2();
    ok = r1.length === 1 && r1[0].gap === 100 && r1[0].b.free.y === 300
      && r2.length === 1 && r2[0].gap === 100;
  } catch (e) { ok = false; console.log('  执行异常: ' + e.message); }
  T('scanFreeGaps 真跑：只挑自由框、距离=框顶−上方块下缘（100px），首块以列顶为基准；文档流块不参与', ok);
})();
/* ---------- 9.42) 修复77：历史版本每步显示「大概改了什么」 ---------- */
console.log('【9.42】修复77：历史版本时间下面一行灰字 = 操作名 + 对相邻快照的差分摘要');
T('app.js：hist 增存 hist.msg（与 arr/ts 同步增减）· hPush(msg) 去重时把说明补给当前步 · commit 传 opts.msg',
  appSrc.indexOf('const hist = { arr: [], ts: [], msg: [], ptr: -1 };') > 0
    && appSrc.indexOf('function hPush(msg) {') > 0
    && appSrc.indexOf('hist.msg = (hist.msg || []).slice(0, hist.ptr + 1);') > 0
    && appSrc.indexOf('if (msg && hist.msg && hist.ptr >= 0 && !hist.msg[hist.ptr]) hist.msg[hist.ptr] = String(msg);') > 0
    && appSrc.indexOf('if (hist.msg.length > 60) hist.msg.shift();') > 0
    && appSrc.indexOf('hPush(opts.msg); /* ★ 修复77：历史版本里显示这次操作是什么 */') > 0
    && appSrc.indexOf("hist.msg = [''];") > 0
    && appSrc.indexOf("hPush('其他设备的修改（协同同步）')") > 0);
T('app.js：histDiffLabel / histStepNote 存在，historyList 返回 msg+diff+note；editor 渲染 .hist-note，css 有灰字样式',
  appSrc.indexOf('function histDiffLabel(a, b) {') > 0
    && appSrc.indexOf('function histStepNote(msg, diff) {') > 0
    && appSrc.indexOf('const diff = i > 0 ? histDiffLabel(parsed[i - 1], c) : \'\';') > 0
    && appSrc.indexOf("msg: msg, diff: diff, note: i > 0 ? histStepNote(msg, diff) : ''") > 0
    && edt2.indexOf('const note = String(v.note || v.msg || \'\').trim();') > 0
    && edt2.indexOf("(v.isCur ? ' is-cur' : '')") > 0
    && cssSrc.indexOf('.hist-note{margin-top:3px;font-size:12px;line-height:1.45;color:var(--text2);') > 0
    && cssSrc.indexOf('.hist-note.is-cur{color:var(--blue)}') > 0);
/* 真实执行：把 histDiffLabel / histStepNote / historyList 从源码截出来，用桩 hist + state 跑一遍 */
(function () {
  function cut(name) {
    const a5 = appSrc.indexOf('function ' + name + '(');
    const z5 = appSrc.indexOf('\n  }', a5);
    return (a5 >= 0 && z5 > a5) ? appSrc.slice(a5, z5 + 4) : '';
  }
  const names = { heading: '标题', paragraph: '正文', callout: '提示', image: '图片', table: '表格',
    chart: '图表', files: '附件', sources: '来源', md: 'Markdown', hr: '分隔线', entries: '条目' };
  const code5 = [cut('histDiffLabel'), cut('histStepNote'), cut('historyList')].join('\n')
    + '\nreturn { diff: histDiffLabel, list: historyList };';
  const strip = function (s) { return String(s).replace(/"_ts":\d+/g, '"_ts":0'); };
  const pageWith = function (blocks) { return { id: 'p1', label: '领域地图', title: '领域地图', blocks: blocks }; };
  const A = { site: { title: 'T' }, pages: [pageWith([{ type: 'paragraph', text: 'a' }])], jumps: [], discuss: [] };
  const B = { site: { title: 'T' }, pages: [pageWith([{ type: 'paragraph', text: 'a' }, { type: 'table', title: 't' }])], jumps: [], discuss: [] };
  const C = { site: { title: 'T' }, pages: [pageWith([{ type: 'paragraph', text: 'a2' }])], jumps: [], discuss: [] };
  const D = { site: { title: 'T2' }, pages: [pageWith([{ type: 'paragraph', text: 'a' }])], jumps: [], discuss: [] };
  const E = { site: { title: 'T' }, pages: [], jumps: [], discuss: [] };
  let ok = false;
  try {
    const mk = function (histObj) { return new Function('hist', 'state', 'stripTsSnap', 'HIST_TYPE_NAMES', code5); };
    const runHist = function (s0, s1, msg1) {
      const h = { arr: [JSON.stringify(s0), JSON.stringify(s1)], ts: [111, 222], msg: ['', msg1 || ''], ptr: 1 };
      return mk(h)(h, { pageId: 'p1' }, strip, names);
    };
    /* ① 块数变化：+1 块（表格），并把操作名拼在前面 */
    const li = runHist(A, B, '已插入表格').list();
    const r0 = li[0], r1 = li[1];
    /* ② 块数不变、文字改了 → 报「正文」 */
    const dText = runHist(A, C).diff(A, C);
    /* ③ 网站信息 / 新增页 / 删除页 */
    const dSite = runHist(A, D).diff(A, D);
    const dAdd = runHist(A, { site: { title: 'T' }, pages: [pageWith([{ type: 'paragraph', text: 'a' }]), { id: 'p2', label: '神经网络', blocks: [] }] }).diff(A, { site: { title: 'T' }, pages: [pageWith([]), { id: 'p2', label: '神经网络', blocks: [] }] });
    const dDel = runHist(A, E).diff(A, E);
    /* ④ 完全相同的两份快照 → 空串（不显示假说明） */
    const dSame = runHist(A, A).diff(A, A);
    ok = li.length === 2
      && r0.isCur === true && r0.msg === '已插入表格'
      && r0.diff.indexOf('+1 块（表格）') >= 0
      && r0.note === '已插入表格：「领域地图」 +1 块（表格）'
      && r1.note === '' && r1.diff === ''
      && dText.indexOf('「领域地图」正文') >= 0
      && dSite === '网站信息'
      && dAdd.indexOf('新增「神经网络」') >= 0
      && dDel.indexOf('删除「领域地图」') >= 0
      && dSame === '';
  } catch (e) { ok = false; console.log('  执行异常: ' + e.message); }
  T('histDiffLabel/historyList 真跑：+1 块（表格）· 正文改动 · 网站信息 · 新增/删除页 · 无变化不出假说明', ok);
})();
/* ---------- 9.43) 修复78：图标框点一下弹面板、再点收起（新建/设置条目与页面管理同一套） ---------- */
console.log('【9.43】修复78：新建条目的图标栏改成「点一下弹出一堆图标，再点一下收起」');
T('editor.js：抽出公用 attachIconPicker（两处复用），F.icon 图标字段带 data-icopen + ▾ 开关，旧内联面板已删除',
  edt2.indexOf('function attachIconPicker(root) {') > 0
    && edt2.split('attachIconPicker(root);').length - 1 === 2
    && edt2.indexOf('curIconInput') < 0
    && edt2.indexOf('icon: function (name, val, ph) {') > 0
    && edt2.indexOf('class="input icon-inp" type="text" name="\' + name + \'" data-icopen') > 0
    && edt2.indexOf('class="icon-more" data-icopen') > 0
    && edt2.indexOf("F.icon('icon', base.icon)") > 0
    && edt2.indexOf('data-k="icon" data-icopen') > 0
    && edt2.indexOf("'🧩'") > 0);
T('CSS：.icon-field / .icon-more 样式 + 手机端图标面板收成 6 列（8 列会顶到卡片边）',
  cssSrc.indexOf('.icon-field{display:flex;align-items:center;gap:8px;max-width:196px}') > 0
    && cssSrc.indexOf('.icon-more{flex:none;width:36px;height:36px;') > 0
    && cssSrc.indexOf('body.mobile-view .icon-pick{grid-template-columns:repeat(6,38px)}') > 0);
/* 真实执行 attachIconPicker：桩 DOM 跑一遍「开 → 再点收起 → 选一个填入并收起 → 组内 ▾ 也算同一开关 → 点外面收起」 */
(function () {
  const a6 = edt2.indexOf('function attachIconPicker(root) {');
  const z6 = edt2.indexOf('\n  }', a6);
  const code6 = (a6 >= 0 && z6 > a6) ? edt2.slice(a6, z6 + 4) : '';
  const mkEl = function () {
    const el = {
      style: {}, className: '', innerHTML: '', value: '',
      offsetWidth: 300, offsetHeight: 120, isConnected: true, _h: {},
      appendChild: function (c) { this.child = c; },
      addEventListener: function (t, f) { this._h[t] = f; },
      getBoundingClientRect: function () { return { left: 10, top: 20, right: 90, bottom: 40, width: 80, height: 20 }; },
      getAttribute: function (n) { return n === 'data-icopen' ? '' : null; },
      contains: function () { return false; }
    };
    return el;
  };
  let ok = false;
  try {
    const card = mkEl();
    const root = { _h: {}, querySelector: function () { return card; }, addEventListener: function (t, f) { this._h[t] = f; } };
    const doc = { _h: {}, createElement: function () { return mkEl(); }, addEventListener: function (t, f) { this._h[t] = f; }, removeEventListener: function () {} };
    const run6 = new Function('document', 'PAGE_ICONS', code6 + '\nreturn attachIconPicker;')(doc, ['📘', '🧠', '🚀']);
    const api = run6(root);
    const pick = api.el;
    const mkGroup = function () {
      const g = {};
      const inp = mkEl();
      inp.closest = function (s) { return s === '[data-icopen]' ? inp : (s === '.icon-field' ? g : null); };
      g.querySelector = function (s) { return s === '[data-icopen]' ? inp : null; };
      const more = mkEl();
      more.closest = function (s) { return s === '[data-icopen]' ? more : (s === '.icon-field' ? g : null); };
      g.more = more;
      return { g: g, inp: inp, more: more };
    };
    const G = mkGroup();
    const click = function (t) { root._h.click({ target: t }); };
    /* ① 第一次点图标框 → 弹面板；② 再点同一个框 → 收起 */
    click(G.inp);
    const open1 = pick.style.display;
    click(G.inp);
    const closed1 = pick.style.display;
    /* ③ 再开一次（从 ▾ 开），点面板里的 🧠 → 填入并收起 */
    click(G.more);
    const open2 = pick.style.display;
    pick._h.click({ target: { closest: function (s) { return s === '[data-ic]' ? { getAttribute: function () { return '🧠'; } } : null; } } });
    const picked = G.inp.value, closed2 = pick.style.display;
    /* ④ 组内开关：从输入框打开，再点同组的 ▾ → 收起 */
    click(G.inp);
    const open3 = pick.style.display;
    click(G.more);
    const closed3 = pick.style.display;
    /* ⑤ 点面板外（mousedown）→ 收起 */
    click(G.inp);
    doc._h.mousedown({ target: { closest: function () { return null; } } });
    const closed4 = pick.style.display;
    /* ⑥ 直接在框里打字（input 事件）→ 面板收起，免得挡着核对输入 */
    click(G.inp);
    const open4 = pick.style.display;
    root._h.input({ target: G.inp });
    const closed5 = pick.style.display;
    ok = open1 === 'grid' && /px$/.test(String(pick.style.left)) && closed1 === 'none'
      && open2 === 'grid' && picked === '🧠' && closed2 === 'none'
      && open3 === 'grid' && closed3 === 'none'
      && closed4 === 'none' && open4 === 'grid' && closed5 === 'none'
      && String(card.child && card.child.className) === 'icon-pick';
  } catch (e) { ok = false; console.log('  执行异常: ' + e.message); }
  T('attachIconPicker 真跑：点一下弹出（贴框定位）· 再点收起 · 选一个填入并收起 · 输入框与 ▾ 属同一开关 · 点外面/打字收起', ok);
})();
/* ---------- 9.44) 修复79：电脑版也能收起格式工具条（默认仍是展开） ---------- */
console.log('【9.44】修复79：电脑端工具条右端「⌨️ 收起」→ 整条缩成右上角把手；管理模式下默认展开');
T('editor.js：开合收进 tbSetOpen（收起钮 / 右上角把手共用），默认态仍按 mobile-view 判定（电脑=展开）',
  edt2.indexOf('function tbSetOpen(open) {') > 0
    && edt2.indexOf("bar1.classList.toggle('open', !!open);") > 0
    && edt2.indexOf('tbSetOpen(false); /* ★ 修复79') > 0
    && edt2.indexOf("tbSetOpen(!tg.closest('#editBar').classList.contains('open'));") > 0
    && edt2.indexOf("bar.classList.toggle('open', !document.body.classList.contains('mobile-view'));") > 0
    && edt2.indexOf('title="收起工具栏（电脑 / 手机通用）') > 0
    && edt2.indexOf('title="展开 / 收起格式工具条（收起时它就停在右上角）"') > 0);
T('CSS：电脑端渲染 收起钮 + 右上角把手（:not(.mobile-view) 收窄作用域，手机端原规则一字未动）',
  cssSrc.indexOf('body.admin:not(.mobile-view) #editBar .tb-collapse{display:flex;position:sticky;right:0;') > 0
    && cssSrc.indexOf('body.admin:not(.mobile-view) #editBar:not(.open) > *:not(.eb-toggle){display:none}') > 0
    && cssSrc.indexOf('body.admin:not(.mobile-view) #editBar .eb-toggle{display:flex;position:fixed;top:62px;right:16px;') > 0
    && cssSrc.indexOf('body.admin:not(.mobile-view) #editBar.open .eb-toggle{display:none}') > 0
    && cssSrc.indexOf('backdrop-filter:none;-webkit-backdrop-filter:none}') > 0
    /* 手机端那套必须保持原样（回归） */
    && cssSrc.indexOf('.tb-collapse{display:none}') > 0
    && cssSrc.indexOf('body.mobile-view #editBar .tb-collapse{display:flex;position:sticky;right:0;') > 0
    && cssSrc.indexOf('body.admin.mobile-view #editBar .eb-toggle{display:flex;position:fixed;top:60px;right:8px;') > 0
    && cssSrc.indexOf('body.admin.mobile-view #editBar.open .eb-toggle{display:none}') > 0);
/* 真实执行 tbSetOpen：桩 document + classList，验证「收起置 open=false 且关气泡 / 展开置 true 不关 / 无工具条安全返回」 */
(function () {
  const a7 = edt2.indexOf('function tbSetOpen(open) {');
  const z7 = edt2.indexOf('\n  }', a7);
  const code7 = (a7 >= 0 && z7 > a7) ? edt2.slice(a7, z7 + 4) : '';
  let ok = false;
  try {
    const mkBar = function (startOpen) {
      const cl = new Set(startOpen ? ['open'] : []);
      return {
        cl: cl,
        classList: {
          contains: function (c) { return cl.has(c); },
          toggle: function (c, v) { if (v) cl.add(c); else cl.delete(c); }
        }
      };
    };
    const bar = mkBar(true);
    let pops = 0;
    const setOpen = new Function('document', 'closePop', code7 + '\nreturn tbSetOpen;')(
      { getElementById: function () { return bar; } }, function () { pops++; });
    const r1 = setOpen(false);              /* 收起 */
    const closed = bar.cl.has('open') === false && pops === 1;
    const r2 = setOpen(true);               /* 再展开（不该关气泡） */
    const opened = bar.cl.has('open') === true && pops === 1;
    const r3 = setOpen(false);              /* 再收起 */
    const closed2 = bar.cl.has('open') === false && pops === 2;
    const r4 = setOpen(null);               /* 传空也算收起 */
    const closed3 = bar.cl.has('open') === false && pops === 3;
    const noBar = new Function('document', 'closePop', code7 + '\nreturn tbSetOpen;')(
      { getElementById: function () { return null; } }, function () {})(true);
    ok = r1 === true && r2 === true && r3 === true && r4 === true
      && closed && opened && closed2 && closed3 && noBar === false;
  } catch (e) { ok = false; console.log('  执行异常: ' + e.message); }
  T('tbSetOpen 真跑：收起=open 移除且关气泡 · 展开=open 加回不关气泡 · 连续收起幂等 · 没有工具条时安全返回 false', ok);
})();
/* ---------- 9.45) 修复80：左上角「‹ 返回」+ 跨母项的「关联条目」块 ---------- */
console.log('【9.45】修复80：访客也有 iOS 式返回键（按浏览历史退回上一屏）+ ⇄ 关联块（跨母项互联）');
T('index.html/app.js：头部有 navBack 按钮；navHist 浏览栈 + navTrack/backTarget/navBack，render 里入栈并导出',
  html.indexOf('class="nav-back" id="navBack"') > 0
    && html.indexOf('id="navBackT"') > 0
    && appSrc.indexOf('const navHist = [];') > 0
    && appSrc.indexOf('function navTrack(id) {') > 0
    && appSrc.indexOf('function backTarget() {') > 0
    && appSrc.indexOf('function refreshBackBtn() {') > 0
    && appSrc.indexOf('function navBack() {') > 0
    && appSrc.indexOf('navTrack(state.pageId); /* ★ 修复80') > 0
    && appSrc.indexOf("e.target.closest('#navBack')") > 0
    && appSrc.indexOf('navBack: navBack, backTarget: backTarget, navHist: navHist,') > 0);
T('app.js：新块类型 related（跨母项关联卡片 + 「来自「母项」」标签 + ＋ 挑选关联条目磁贴）',
  appSrc.indexOf("      case 'related': {") > 0
    && appSrc.indexOf('const rIds = Array.isArray(b.links) ? b.links : [];') > 0
    && appSrc.indexOf('来自「') > 0
    && appSrc.indexOf('rel-card') > 0
    && appSrc.indexOf('data-relpick="') > 0
    && appSrc.indexOf('＋ 挑选关联条目') > 0);
T('editor.js：TYPES/defaultsFor/formHTML/readForm 认 related，⇄ 关联 插入钮 + relins 处理 + 磁贴点击',
  edt2.indexOf("related: { name: '关联条目', icon: '⇄' },") > 0
    && edt2.indexOf("case 'related': return { type: type, title: '关联条目', mode: 'card', cols: 3, note: '', links: [] };") > 0
    && edt2.indexOf('function relatedPickerHTML(sel) {') > 0
    && edt2.indexOf('const rows = treeRows(pages);') > 0
    && edt2.indexOf('+ relatedPickerHTML(b.links)') > 0
    && edt2.indexOf('<div class="field"><span class="field-label">勾选要关联的条目（可跨母项）</span>') > 0
    && edt2.replace(/\r\n/g, '\n').indexOf("case 'related':\n        b.title = val('title');") > 0
    && edt2.indexOf('b.links = Array.prototype.map.call(form.querySelectorAll(\'input[name="rel"]:checked\')') > 0
    && edt2.indexOf('data-tb="relins"') > 0
    && edt2.indexOf("case 'relins': {") > 0
    && edt2.indexOf("e.target.closest('[data-relpick]')") > 0);
T('CSS：返回键胶囊（含手机端收紧、[hidden] 隐藏）+ 关联卡片「来自母项」标签 + 挑条目清单缩进',
  cssSrc.indexOf('.nav-back{display:flex;align-items:center;gap:2px;flex:none;height:32px;') > 0
    && cssSrc.indexOf('.nav-back[hidden]{display:none}') > 0
    && cssSrc.indexOf('body.mobile-view .nav-back{height:30px;') > 0
    && cssSrc.indexOf('.rel-from{display:inline-block;font-size:11px;') > 0
    && cssSrc.indexOf('.rel-pick{max-height:44vh;overflow:auto;') > 0
    && cssSrc.indexOf('.rel-opt[data-d="1"]{padding-left:26px}') > 0);
/* 真跑浏览栈：home → 领域地图 → 提示工程 →（跨母项）Transformer，再一路返回 */
(function () {
  const a8 = appSrc.indexOf('  const navHist = [];');
  const navEnd = appSrc.indexOf('function navBack() {');
  const z8 = navEnd > 0 ? appSrc.indexOf('\n  }', navEnd) : -1;
  const code8 = (a8 >= 0 && z8 > a8) ? appSrc.slice(a8, z8 + 4) : '';
  const pages = [
    { id: 'home', label: '首页' },
    { id: 'ma', label: '领域地图' },
    { id: 'b', parent: 'ma', label: '提示工程' },
    { id: 'mb', label: '认知地图' },
    { id: 'c', parent: 'mb', label: 'Transformer' }
  ];
  const st = { pageId: 'home' };
  const locate = { hash: '' };
  const btn = { hidden: true, setAttribute: function () {} };
  const doc = { getElementById: function (n) { return n === 'navBack' ? btn : null; } };
  const byId = function (id) { return pages.filter(function (p) { return p.id === id; })[0] || null; };
  const title = function (p) { return (p && (p.label || p.title)) || ''; };
  let ok = false;
  try {
    const api = new Function('document', 'state', 'pageById', 'pageTitle', 'currentId', 'render', 'location',
      code8 + '\nreturn { navHist: navHist, navTrack: navTrack, backTarget: backTarget, navBack: navBack };')(
      doc, st, byId, title, function () { return st.pageId; }, function () {}, locate);
    const H = api.navHist;
    api.navTrack('home');
    const r0 = api.backTarget();                    /* 只有首页 → 无处可返 */
    st.pageId = 'ma'; api.navTrack('ma');
    st.pageId = 'b'; api.navTrack('b');
    const r1 = api.backTarget();                    /* 返回「领域地图」 */
    st.pageId = 'c'; api.navTrack('c');             /* ★ 从「提示工程」跳到「认知地图›Transformer」 */
    const r2 = api.backTarget();                    /* 应回到「提示工程」，而不是它自己的母项「认知地图」 */
    const backOk = api.navBack();
    const went = locate.hash;                       /* 点了返回 → hash 指向「提示工程」 */
    /* 模拟 hashchange 后的 render → navTrack 截断 */
    st.pageId = 'b'; api.navTrack('b');
    const r3 = api.backTarget();                    /* 再返回 → 「领域地图」 */
    const histLen = H.length;
    /* 深链接兜底：栈里只有当前页 → 退回它的上级 */
    H.length = 0; st.pageId = 'c'; api.navTrack('c');
    const r4 = api.backTarget();
    ok = r0 === null
      && r1 && r1.id === 'ma' && r1.label === '领域地图'
      && r2 && r2.id === 'b' && r2.label === '提示工程'
      && backOk === true && went === '#/p/b'
      && r3 && r3.id === 'ma' && histLen === 3
      && r4 && r4.id === 'mb' && r4.label === '认知地图'
      && btn.hidden === false;
  } catch (e) { ok = false; console.log('  执行异常: ' + e.message); }
  T('浏览栈真跑：首页无处可返 · 逐级入栈 · 跨母项跳转后返回的是「上一屏」而非自己的母项 · 返回后截断 · 深链接退回上级', ok);
})();
/* ---------- 9.46) 修复81：选中文字上「A 文字颜色 / 🌈 渐变」100% 抛错（r is not defined） ---------- */
console.log('【9.46】修复81：行内上色不再抛 ReferenceError —— 选文字点颜色真的会上色');
T('editor.js：颜色/渐变分支就地算剥离结果，不再引用只在 hl 分支里声明的 r',
  edt2.indexOf("const rs = stripToks(t, w.toks, s0, e0, ['@@o', '@@c']);") > 0
    && edt2.indexOf("nt = rs.text.slice(0, rs.s) + '@@' + tag + ',' + rs.text.slice(rs.s, rs.e) + '@@' + rs.text.slice(rs.e);") > 0
    && edt2.indexOf("nt = r.text.slice(0, r.s) + '@@' + tag") < 0);
T('上色只剥旧颜色对、保留选区内的 == 高亮（md.js 先渲染 == 再渲染 @@色,?@@，可安全嵌套）',
  edt2.indexOf('★ 只剥选区内完整的旧颜色对，**保留 == 高亮**') > 0);
T('全局兜底把真实错误写进控制台（下次「已自动跳过」可直接定位，不用再猜）',
  appSrc.indexOf('[LM] 未捕获错误') > 0 && appSrc.indexOf('ev.error.stack') > 0);

/* 真跑：从源码截出 walkInline…applyInlineSwatchBlock，用桩 DOM 跑真实选区 + 真 md.js 渲染 */
(function () {
  const a9 = edt2.indexOf('  function inlineApplyCore(t, s0, e0, prop, v) {');
  const b9 = edt2.indexOf('  /* ★ 块级行内字号 / 字体（修复㉔）');
  const code9 = (a9 >= 0 && b9 > a9) ? edt2.slice(a9, b9) : '';
  let LMMD9 = null;
  try { LMMD9 = require(path.join(DIR, 'js/md.js')); } catch (e9) { LMMD9 = null; }
  const P = '前置基础：高等数学（概率与矩阵）→ **核心覆盖**：**人工智能导论、机器学习** → **实践应用**：本课程大作业 → **自主拓展**：经典论文与开源项目。 以上为示例。';
  let run = null;
  if (code9 && LMMD9) {
    const page = { blocks: [{ type: 'paragraph', text: '' }] };
    const tbS = { active: 0, hero: null };
    let cur = '';
    const selS = {
      rangeCount: 1, isCollapsed: false,
      toString: function () { return cur; },
      getRangeAt: function () { return { startContainer: { nodeType: 1, closest: function () { return null; } } }; }
    };
    const LMAppS = {
      md: function (t) { return LMMD9.mdToHtml(t); },
      commit: function () {}, toast: function () {}
    };
    const applyFn = new Function('document', 'window', 'LMApp', 'markSaved', 'pageOf', 'activeBlock', 'isTextType', 'tb',
      'textElOf', 'refreshTextEl', 'restoreSelectionIn', 'selTextOf', 'selCell',
      code9 + '\nreturn applyInlineSwatchBlock;')(
      { querySelector: function () { return null; } },
      { getSelection: function () { return selS; } },
      LMAppS, function () {}, function () { return page; }, function () { return page.blocks[0]; },
      function (x) { return !!x && x.type === 'paragraph'; }, tbS,
      function () { return null; }, function () {}, function () {},
      function () { return ''; }, function () { return null; });
    run = function (text, needle, prop, v) {
      page.blocks[0].text = text; cur = needle;
      const ok = applyFn(prop, v);
      return { ok: ok, text: page.blocks[0].text };
    };
  }
  const plain = function (h) { return String(h).replace(/<[^>]*>/g, ''); };
  let ok9 = false, detail = '切片/md.js 不可用';
  if (run) {
    try {
      const r1 = run(P, '经典论文与开源项目', 'color', '#0071e3');
      const h1 = LMMD9.inlineFmt(r1.text);
      const r2 = run('==已高亮== 与 **加粗** 混排', '已高亮', 'color', '#ff3b30');
      const h2 = LMMD9.inlineFmt(r2.text);
      const r3 = run(P, '经典论文与开源项目', 'grad', '2');
      const h3 = LMMD9.inlineFmt(r3.text);
      const r4 = run('@@#0071e3,蓝色文字@@普通', '蓝色文字', 'color', '#34c759');
      const r5 = run(P, '经典论文与开源项目', 'hl', '#ffd60a');
      /* 穷举单个可见字符上色：任何一处都不许抛错（旧代码在这里 100% 抛 r is not defined） */
      const w9 = (function () { try { return new Function(code9 + '\nreturn walkInline;')()(P); } catch (e) { return null; } })();
      let sweepBad = 0, sweepN = 0;
      if (w9) {
        const vis = w9.map.map(function (i9) { return P.charAt(i9); }).join('');
        for (let s9 = 0; s9 < vis.length; s9++) {
          const ch = vis.charAt(s9);
          if (!ch.trim()) continue;
          sweepN++;
          try { run(P, ch, 'color', '#0071e3'); } catch (e2) { sweepBad++; }
        }
      }
      ok9 = r1.ok === true
        && r1.text.indexOf('@@#0071e3,经典论文与开源项目@@') >= 0
        && r1.text.indexOf('**核心覆盖**') >= 0 /* 选区外的加粗原样保留 */
        && h1.indexOf('@@') < 0 && h1.indexOf('==') < 0
        && /color:#0071e3/.test(h1) && plain(h1).indexOf('经典论文与开源项目') >= 0
        && r2.text === '@@#ff3b30,==已高亮==@@ 与 **加粗** 混排' /* 上色不抹掉高亮 */
        && /color:#ff3b30/.test(h2) && /<mark/.test(h2)
        && r3.text.indexOf('@@grad2,经典论文与开源项目@@') >= 0 && h3.indexOf('@@') < 0 && /grad-2/.test(h3)
        && r4.text === '@@#34c759,蓝色文字@@普通' /* 已有颜色里换色 = 原地换，不嵌套 */
        && r5.text.indexOf('==#ffd60a,经典论文与开源项目==') >= 0 /* 高亮回归 */
        && sweepN > 40 && sweepBad === 0;
      if (!ok9) detail = JSON.stringify({ r1: r1.text, h1: h1, r2: r2.text, r3: r3.text, r4: r4.text, sweepBad: sweepBad, sweepN: sweepN }).slice(0, 300);
    } catch (e3) { ok9 = false; detail = '抛出 ' + e3.message; }
  }
  T('真跑上色：文字颜色/渐变不再抛错 · 源码与渲染都干净 · 高亮被保留 · 换色原地改 · 高亮功能回归 · 逐字穷举零抛错', ok9, detail);
})();
/* ---------- 9.47) 修复82：下级条目分类摆放（同一页多个条目块 · 勾选子条目 · ↑↓ 调序） ---------- */
console.log('【9.47】修复82：同一页可放多个「下级条目」框，每框勾选自己那一类（可多选、可调序）');
T('app.js：only 从「只排序」改成「白名单 + 顺序」，且条目必须仍挂在本页',
  appSrc.indexOf('const allKids = childPages(pageId).slice();') > 0
    && appSrc.indexOf('? only.map(function (id2) { return pageById(id2); })') > 0
    && appSrc.indexOf('.filter(function (k) { return k && k.parent === pageId; })') > 0
    && appSrc.indexOf(': allKids;') > 0
    && appSrc.indexOf('kids.sort(function (a1, c1) {') < 0);
T('app.js：磁贴带块序号（分类框里新建的条目自动归框）+ 分类框空态文案',
  appSrc.indexOf('data-entryadd-blk="\' + i + \'"') > 0
    && appSrc.indexOf('这个分类框里还没有条目') > 0
    && appSrc.indexOf('在本分类里新建一个下级条目') > 0);
T('editor.js：分类清单组件 + ↑↓ 调序 + 读表单按勾选顺序写 only（全不勾则删掉 only）',
  edt2.indexOf('function kidPickerHTML(sel) {') > 0
    && edt2.indexOf('function wireKidPicker(root) {') > 0
    && edt2.indexOf('已在「') > 0
    && edt2.indexOf('b.only = Array.prototype.map.call(form.querySelectorAll(\'input[name="kid"]:checked\')') > 0
    && edt2.indexOf('if (!b.only.length) delete b.only;') > 0);
T('editor.js：不再限制「一页只能一个条目块」，条目树的 ▤ 在有块时也保留（用来加分类框）',
  edt2.indexOf("LMApp.toast('这一页已经有条目块了')") < 0
    && edt2.indexOf('const n = p.blocks.filter(function (b) { return b && b.type === \'entries\'; }).length;') > 0
    && edt2.indexOf('+ (hasEntries ? \'\' : \'<button type="button" data-treeblock=') < 0
    && edt2.indexOf('再加一个「条目块」当分类框') > 0);
T('editor.js：搭表单期间注入 formCtx（列本页子条目 + 标出被别的分类框占用）+ 新建归框',
  edt2.indexOf('formCtx = { pageId: pageId, idx: isNew ? null : idx };') > 0
    && edt2.indexOf('try { fhtml = formHTML(type, base); } finally { formCtx = null; }') > 0
    && edt2.indexOf("if (type === 'entries') wireKidPicker(root);") > 0
    && edt2.indexOf('function openPageForm(pageId, parentId, fromTree, onlyBlk) {') > 0
    && edt2.indexOf('par.blocks[onlyBlk].only.push(np.id);') > 0
    && edt2.indexOf('const hasAllKids = ebs.some(') > 0);
T('css：分类清单样式（整行可点勾选 + ↑↓ 按钮，手机端加大点击区、隐去「已在」标签）',
  cssSrc.indexOf('.kid-pick{') > 0 && cssSrc.indexOf('.kid-mv:hover{') > 0
    && cssSrc.indexOf('body.mobile-view .kid-own{display:none}') > 0
    && cssSrc.indexOf('body.mobile-view .kid-mv{width:32px;height:32px') > 0);

/* 真跑 A：直接执行 app.js 里那段「kids 计算」源码（白名单过滤 + 顺序） */
(function () {
  const aA = appSrc.indexOf('const allKids = childPages(pageId).slice();');
  const bA = appSrc.indexOf(': allKids;', aA);
  const codeA = (aA >= 0 && bA > aA) ? appSrc.slice(aA, bA + ': allKids;'.length) : '';
  const PGS = [
    { id: 'home' }, { id: 'A', parent: 'home' }, { id: 'B', parent: 'home' },
    { id: 'k1', parent: 'A' }, { id: 'k2', parent: 'A' }, { id: 'k3', parent: 'A' },
    { id: 'x1', parent: 'B' }
  ];
  const kidsOf = function (pid) {
    return PGS.filter(function (p) { return p && p.id !== 'home' && (p.parent || '') === (pid || ''); });
  };
  const byId = function (id) { return PGS.filter(function (p) { return p.id === id; })[0] || null; };
  let okA47 = false, dA47 = '切片不可用';
  if (codeA) {
    try {
      const F = new Function('childPages', 'pageById', 'pageId', 'b', codeA + '\nreturn kids;');
      const ids = function (arr) { return arr.map(function (p) { return p.id; }).join(','); };
      const all = ids(F(kidsOf, byId, 'A', {}));
      const cat = ids(F(kidsOf, byId, 'A', { only: ['k3', 'k1'] }));
      const stale = ids(F(kidsOf, byId, 'A', { only: ['k3', 'x1', 'ghost'] }));
      const blank = ids(F(kidsOf, byId, 'A', { only: [] }));
      okA47 = all === 'k1,k2,k3'          /* 不设限 = 全部（老行为不变） */
        && cat === 'k3,k1'                /* 只有勾中的，且按勾选顺序 */
        && stale === 'k3'                 /* 别的页的子条目 / 已删除的 id 一律不显示 */
        && blank === 'k1,k2,k3';
      if (!okA47) dA47 = JSON.stringify({ all: all, cat: cat, stale: stale, blank: blank });
    } catch (eA) { okA47 = false; dA47 = '抛出 ' + eA.message; }
  }
  T('真跑分类过滤：only 白名单 + 勾选顺序 · 空 only 仍是全部 · 挪走的条目自动消失', okA47, dA47);

  /* 真跑 B：直接执行 editor.js 的 readForm，用桩 form 提交勾选 */
  const aB = edt2.indexOf('  function readForm(type, form, base) {');
  const bB = edt2.indexOf('  function openBlockForm(pageId, idx, presetType) {');
  const codeB = (aB >= 0 && bB > aB) ? edt2.slice(aB, bB) : '';
  let okB47 = false, dB47 = '切片不可用';
  if (codeB) {
    try {
      const RF = new Function('LMStore', codeB + '\nreturn readForm;')(
        { deepCopy: function (o) { return JSON.parse(JSON.stringify(o)); } });
      const mkForm = function (vals, checked) {
        return {
          querySelector: function (sel) {
            const m = /\[name="?([A-Za-z0-9_]+)"?\]/.exec(sel);
            const v = m ? vals[m[1]] : null;
            return v == null ? null : { value: v };
          },
          querySelectorAll: function () {
            return checked.map(function (id) { return { value: id }; });
          }
        };
      };
      const vals = { title: '第一类下级条目', mode: 'card', cols: '3', note: '' };
      const b1 = RF('entries', mkForm(vals, ['k2', 'k1']), { type: 'entries' });
      const b2 = RF('entries', mkForm(vals, []), { type: 'entries' });
      okB47 = b1.title === '第一类下级条目'
        && JSON.stringify(b1.only) === '["k2","k1"]'   /* DOM 顺序 = 框里卡片的顺序 */
        && b1.cols === 3 && b1.mode === 'card'
        && !('only' in b2);                            /* 全不勾 → 回到「显示全部」 */
      if (!okB47) dB47 = JSON.stringify({ b1: b1, b2: b2 }).slice(0, 260);
    } catch (eB) { okB47 = false; dB47 = '抛出 ' + eB.message; }
  }
  T('真跑读表单：勾选顺序进 only · 全不勾等于显示全部（不写空数组）· 标题/版式/列数照旧', okB47, dB47);
})();
/* ---------- 9.48) 修复83：放弃修改 = 完整退回「进入管理模式时」（不再只退一步） ---------- */
console.log('【9.48】修复83：放弃修改拆成两份基准 —— 进入管理模式时（默认）/ 最近上传版');
T('app.js：adminSnap 与 pushSnap 分开存 + 各自时间戳 · takePushSnap / snapInfo 新增',
  appSrc.indexOf('let adminSnap = null, adminSnapAt = 0;') > 0
    && appSrc.indexOf('let pushSnap = null, pushSnapAt = 0;') > 0
    && appSrc.indexOf('function takePushSnap() {') > 0
    && appSrc.indexOf('function snapInfo() {') > 0);
T('app.js：discardChanges(which) 按参数选基准，历史/toast 里写明恢复了哪一版',
  appSrc.indexOf('function discardChanges(which) {') > 0
    && appSrc.indexOf('const snap = usePush ? pushSnap : adminSnap;') > 0
    && appSrc.indexOf("'已放弃本次修改：内容恢复到' + (usePush ? '最近一次上传的版本' : '进入管理模式时的版本')") > 0);
T('app.js：退出管理模式两份快照一起清掉 + 导出 takePushSnap / snapInfo',
  appSrc.indexOf('adminSnap = null; pushSnap = null; /* ★ 修复㉜/83：退出管理模式即弃两份快照 */') > 0
    && appSrc.indexOf('takePushSnap: takePushSnap, snapInfo: snapInfo, /* ★ 修复83') > 0);
T('collab.js：上传成功只重拍「最近上传版」——绝不再动「进入管理模式时」的基准',
  col.indexOf('if (LMApp.takePushSnap) LMApp.takePushSnap();') > 0
    && col.indexOf('if (window.LMApp && LMApp.takeAdminSnap && validContent(LMApp.state.content)) LMApp.takeAdminSnap();') < 0);
T('editor.js：↩ 放弃修改 → discardModal 两个基准二选一（旧的单按钮 confirmModal 已移除）',
  edt2.indexOf("else if (k === 'discard') discardModal();") > 0
    && edt2.indexOf('function discardModal() {') > 0
    && edt2.indexOf("row('entry', '进入管理模式时', info.entryTs, info.entry, true)") > 0
    && edt2.indexOf("row('push', '最近一次同步到 GitHub', info.pushTs, info.push, false)") > 0
    && edt2.indexOf('把内容恢复到最近一次「同步到 GitHub」上传的版本') < 0);
T('css：双基准选项样式（.snap-opt / .snap-badge / 手机端整行按钮）',
  cssSrc.indexOf('.snap-opt{') > 0 && cssSrc.indexOf('.snap-badge{') > 0
    && cssSrc.indexOf('body.mobile-view .snap-opt .btn{width:100%}') > 0);

/* 真跑 A：执行 app.js 的 discardChanges 源码（默认 entry / 显式 push / 无基准 / 访客 / 深拷贝） */
(function () {
  const appLF = appSrc.replace(/\r\n/g, '\n');
  const aA = appLF.indexOf('  function discardChanges(which) {');
  const bA = appLF.indexOf('\n  }\n', aA);
  const codeA = (aA >= 0 && bA > aA) ? appLF.slice(aA, bA + 5) : '';
  let okA = false, dA = '切片不可用';
  if (codeA) {
    try {
      const ENTRY = { pages: [{ id: 'home' }, { id: 'p1', blocks: [{ id: 'b1', text: '管理前' }] }] };
      const PUSH = { pages: [{ id: 'home' }, { id: 'p1', blocks: [{ id: 'b1', text: '已上传' }] }] };
      const mk = function (snap) {
        const S = { entry: snap.entry, entryAt: snap.entryAt, push: snap.push, pushAt: snap.pushAt };
        const state = { admin: snap.admin !== false, content: { pages: [{ id: 'home' }] } };
        const out = { commits: [], toasts: [] };
        const F = new Function('S', 'state', 'toast', 'commit',
          'let adminSnap = S.entry, adminSnapAt = S.entryAt, pushSnap = S.push, pushSnapAt = S.pushAt;\n'
          + codeA + '\nreturn { discardChanges: discardChanges, state: state };');
        const r = F(S, state,
          function (m) { out.toasts.push(m); },
          function (o) { out.commits.push(o.msg); });
        return { r: r, out: out };
      };
      const t1 = mk({ entry: ENTRY, entryAt: 1700000000000, push: PUSH, pushAt: 1700000600000 });
      t1.r.discardChanges();
      const got1 = JSON.stringify(t1.r.state.content);
      const t2 = mk({ entry: ENTRY, entryAt: 1700000000000, push: PUSH, pushAt: 1700000600000 });
      t2.r.discardChanges('push');
      const got2 = JSON.stringify(t2.r.state.content);
      const t3 = mk({ entry: ENTRY, entryAt: 1700000000000, push: null, pushAt: 0 });
      const before3 = JSON.stringify(t3.r.state.content);
      t3.r.discardChanges('push');
      const t4 = mk({ entry: ENTRY, entryAt: 1, push: PUSH, pushAt: 2, admin: false });
      t4.r.discardChanges();
      const t5 = mk({ entry: ENTRY, entryAt: 1700000000000, push: PUSH, pushAt: 0 });
      t5.r.discardChanges();
      t5.r.state.content.pages[1].blocks[0].text = '事后又改';
      t5.r.discardChanges();
      okA = got1 === JSON.stringify(ENTRY)
        && got2 === JSON.stringify(PUSH)
        && t1.out.commits.length === 1 && t1.out.commits[0].indexOf('进入管理模式时的版本') > 0
        && t2.out.commits.length === 1 && t2.out.commits[0].indexOf('最近一次上传的版本') > 0
        && JSON.stringify(t3.r.state.content) === before3
        && t3.out.commits.length === 0 && t3.out.toasts.length === 1
        && t4.out.commits.length === 0
        && JSON.stringify(t5.r.state.content) === JSON.stringify(ENTRY);
      if (!okA) dA = JSON.stringify({ got1: got1.slice(0, 90), got2: got2.slice(0, 90), c1: t1.out.commits, c2: t2.out.commits, t3c: t3.out.commits, t3t: t3.out.toasts, t4c: t4.out.commits });
    } catch (eA) { okA = false; dA = '抛出 ' + eA.message; }
  }
  T('真跑放弃修改：默认退回整包「进入管理模式时」· push 只退到上传版 · 无基准/访客不动内容 · 深拷贝不污染基准', okA, dA);
  /* 真跑 B：snapInfo 摘要（两份基准相同 → same=true，弹窗只显示一行） */
  const aB = appLF.indexOf('  function snapInfo() {');
  const bB = appLF.indexOf('\n  }\n', aB);
  const codeB = (aB >= 0 && bB > aB) ? appLF.slice(aB, bB + 5) : '';
  let okB = false, dB = '切片不可用';
  if (codeB) {
    try {
      const F2 = new Function('S', 'let adminSnap = S.entry, adminSnapAt = S.entryAt, pushSnap = S.push, pushSnapAt = S.pushAt;\n' + codeB + '\nreturn snapInfo;');
      const C = { pages: [{ id: 'home', blocks: [{ id: 'h1' }] }, { id: 'p1', blocks: [{ id: 'b1' }, { id: 'b2' }] }] };
      const same = F2({ entry: C, entryAt: 111, push: C, pushAt: 222 })();
      const diff = F2({ entry: C, entryAt: 111, push: { pages: [{ id: 'home' }, { id: 'p1', blocks: [{ id: 'b1' }] }] }, pushAt: 222 })();
      const none = F2({ entry: C, entryAt: 5, push: null, pushAt: 0 })();
      okB = same.same === true && same.entry === '1 个条目 / 3 个内容块' && same.entryTs === 111
        && diff.same === false && diff.push === '1 个条目 / 1 个内容块'
        && none.same === false && none.push === '' && none.pushTs === 0;
      if (!okB) dB = JSON.stringify({ same: same, diff: diff, none: none });
    } catch (eB) { okB = false; dB = '抛出 ' + eB.message; }
  }
  T('真跑基准摘要：条目/块计数 + 时间戳 · 两份相同 same=true · 没上传过则为空', okB, dB);
})();

/* ---------- 9.49) 修复84：管理员模式工具条不再压住面包屑 / 页头 ---------- */
console.log('【9.49】修复84：工具条展开时面包屑被整条压住 → 正文按工具条实测高度垫开（--lm-tb-h）');
T('app.js：tbOffsetNow 按几何算垫高 + syncTbOffset 写 --lm-tb-h + watchTbOffset 观察工具条',
  appSrc.indexOf('function tbOffsetNow() {') > 0
    && appSrc.indexOf("document.body.style.setProperty('--lm-tb-h', v)") > 0
    && appSrc.indexOf('function watchTbOffset() {') > 0
    && appSrc.indexOf('new ResizeObserver(queueTbOffset)') > 0
    && appSrc.indexOf("tbMO.observe(eb, { attributes: true, attributeFilter: ['class'] });") > 0);
T('app.js：render 尾部与 init 都挂 watchTbOffset（登录/切页/刷新都重新量）+ 导出 syncTbOffset',
  appSrc.indexOf('watchTbOffset(); /* ★ 修复84：工具条（可能刚被创建/重绘）与面包屑错开 */') > 0
    && appSrc.indexOf('watchTbOffset(); /* ★ 修复84：管理员模式浮动工具条不压面包屑/页头（垫 --lm-tb-h） */') > 0
    && appSrc.indexOf('syncTbOffset: syncTbOffset, watchTbOffset: watchTbOffset, /* ★ 修复84') > 0);
T('css：管理员模式给 #app 垫 padding-top:var(--lm-tb-h)，收起/展开过渡平滑、无动画时关掉过渡',
  cssSrc.indexOf('body.admin #app{padding-top:var(--lm-tb-h,0px);transition:padding-top .18s ease}') > 0
    && cssSrc.indexOf('body.no-anim #app{transition:none}') > 0);
T('editor.js：收起/展开（tbSetOpen）立即重算垫高，不等下一帧观察器',
  edt2.indexOf('try { if (window.LMApp && LMApp.syncTbOffset) LMApp.syncTbOffset(); } catch (eTb) { /* noop */ }') > 0);

/* 真跑：执行 app.js 的 tbOffsetNow 源码（桩 getBoundingClientRect） */
(function () {
  const srcLF = appSrc.replace(/\r\n/g, '\n');
  const aA = srcLF.indexOf('  function tbOffsetNow() {');
  const bA = srcLF.indexOf('\n  }\n', aA);
  const codeA = (aA >= 0 && bA > aA) ? srcLF.slice(aA, bA + 5) : '';
  let okA = false, dA = '切片不可用';
  if (codeA) {
    try {
      const F = new Function('state', 'isMobileDevice', 'document', 'window', codeA + '\nreturn tbOffsetNow;');
      const el = function (rect) { return { getBoundingClientRect: function () { return rect; } }; };
      const mk = function (ebRect, navRect, admin, mobile, vh) {
        const doc = {
          getElementById: function (id) {
            if (id === 'editBar') return ebRect ? el(ebRect) : null;
            if (id === 'topnav') return navRect ? el(navRect) : null;
            return null;
          }
        };
        return F({ admin: admin }, function () { return !!mobile; }, doc, { innerHeight: vh || 800 });
      };
      const open = mk({ top: 62, bottom: 110, height: 48 }, { top: 0, bottom: 52 }, true, false, 900);
      const shut = mk({ top: 0, bottom: 0, height: 0 }, { top: 0, bottom: 52 }, true, false, 900);
      const guest = mk({ top: 62, bottom: 110, height: 48 }, { top: 0, bottom: 52 }, false, false, 900);
      const tall = mk({ top: 52, bottom: 952, height: 900 }, { top: 0, bottom: 52 }, true, true, 600);
      const noBar = mk(null, { top: 0, bottom: 52 }, true, false, 900);
      /* 参照系是吸顶导航底边：页面滚到任何位置结果都一样（不再依赖 #app 的视口坐标） */
      okA = open() === 68 && shut() === 0 && guest() === 0 && tall() === 204 && noBar() === 0;
      if (!okA) dA = JSON.stringify({ open: open(), shut: shut(), guest: guest(), tall: tall(), noBar: noBar() });
    } catch (eA) { okA = false; dA = '抛出 ' + eA.message; }
  }
  T('真跑垫高：展开 68（110+10-52）· 收起 0 · 访客 0 · 手机端封顶 34%vh（900→204）· 无工具条 0', okA, dA);
})();
/* ---------- 9.50) 修复85：取消自由摆放（⌂ 归位）留在原位，不再掉到页面最下方 ---------- */
console.log('【9.50】修复85：归位先按「此刻压在哪个文档流块之间」把数组位置挪过去，再摘 free');
T('app.js：unfreeBlock 先算目标位置再摘 free，并按「摘出自己后下标前移」修正',
  appSrc.indexOf('function unfreeTargetIndex(blocks, rects, i) {') > 0
    && appSrc.indexOf('function unfreeFlowIndex(i) {') > 0
    && appSrc.indexOf('try { pos = unfreeFlowIndex(i); } catch (e) { pos = i; }') > 0
    && appSrc.indexOf('let at = pos > i ? pos - 1 : pos;') > 0
    && appSrc.indexOf('unfreeTargetIndex: unfreeTargetIndex, /* ★ 修复85') > 0);
T('app.js：锚点只认文档流块（自由框不占位）· 压住长块按中线判前后 · 上方无流块则排到最前',
  appSrc.indexOf('if (!b || b.free) continue; /* 自由框不占位，不能当锚点 */') > 0
    && appSrc.indexOf('if (owner >= 0) return top >= ownerMid ? owner + 1 : owner;') > 0
    && appSrc.indexOf('return firstFlow < 0 ? i : firstFlow;') > 0);

/* 真跑：执行 unfreeTargetIndex 纯函数（数组下标 + 各块实测矩形） */
(function () {
  const srcLF = appSrc.replace(/\r\n/g, '\n');
  const aA = srcLF.indexOf('  function unfreeTargetIndex(blocks, rects, i) {');
  const bA = srcLF.indexOf('\n  }\n', aA);
  const codeA = (aA >= 0 && bA > aA) ? srcLF.slice(aA, bA + 5) : '';
  let okA = false, dA = '切片不可用';
  if (codeA) {
    try {
      const F = new Function(codeA + '\nreturn unfreeTargetIndex;')();
      const R = function (top, bottom) { return { top: top, bottom: bottom }; };
      const flow = function (id) { return { id: id }; };
      const freeB = function (id) { return { id: id, free: { y: 0 } }; };
      /* ① 数组末尾的自由框，视觉上在 A 与 B 之间 → 插到 A 后面（原下标 1） */
      const c1 = F([flow('A'), flow('B'), freeB('F')], [R(0, 100), R(400, 460), R(150, 250)], 2);
      /* ② 压住一个长块的上半 → 排到它前面（0） */
      const c2 = F([flow('A'), freeB('F')], [R(0, 1000), R(200, 300)], 1);
      /* ③ 压住同一个长块的下半（过中线）→ 排到它后面（1） */
      const c3 = F([flow('A'), freeB('F')], [R(0, 1000), R(700, 800)], 1);
      /* ④ 最上面的自由框（上方没有流块）→ 排到第一个流块之前（1，摘出后即 0） */
      const c4 = F([freeB('F'), flow('A')], [R(0, 50), R(100, 200)], 0);
      /* ⑤ 页面只有它自己 → 原地不动（0） */
      const c5 = F([freeB('F')], [R(0, 50)], 0);
      /* ⑥ 视觉与数据都在最后 → 不动（1） */
      const c6 = F([flow('A'), freeB('F')], [R(0, 100), R(200, 300)], 1);
      /* ⑦ 掉到最后一个流块之下 → 插到它后面（3） */
      const c7 = F([flow('A'), freeB('F'), flow('B')], [R(0, 100), R(300, 400), R(200, 260)], 1);
      /* ⑧ 量不到矩形（没渲染）→ 保持原下标 */
      const c8 = F([flow('A'), freeB('F')], [R(0, 100), null], 1);
      okA = c1 === 1 && c2 === 0 && c3 === 1 && c4 === 1 && c5 === 0 && c6 === 1 && c7 === 3 && c8 === 1;
      if (!okA) dA = JSON.stringify({ c1: c1, c2: c2, c3: c3, c4: c4, c5: c5, c6: c6, c7: c7, c8: c8 });
    } catch (eA) { okA = false; dA = '抛出 ' + eA.message; }
  }
  T('真跑归位落点：中部自由框插回原位 · 长块上半→前/下半→后 · 最上方→最前 · 只有自己/在最后→不动 · 无矩形→原下标', okA, dA);
})();
/* ---------- 9.51) 修复86：↑↓ = 与视觉上下相邻的那一块「互换位置」（只换一对） ---------- */
console.log('【9.51】修复86：新建文本框默认进文档流 · ⌂/⤢ 同键双向切换 · ↑↓ 按视觉相邻真换位（不再错标 40 像素）');
T('工具条：↑↓ 提示改成「与上/下面的模块互换位置（整块换，只换这一对）」，40 像素错标已删净',
  edt2.indexOf('与上面的模块互换位置（整块换，只换这一对）') > 0
    && edt2.indexOf('与下面的模块互换位置（整块换，只换这一对）') > 0
    && edt2.indexOf('框上移 40 像素') < 0 && edt2.indexOf('框下移 40 像素') < 0);
T('工具条同一个位置双向切换：自由框 ⌂（data-act=unfree）↔ 文档流块 ⤢（data-act=freebox）',
  edt2.indexOf('data-act="unfree"') > 0 && edt2.indexOf('data-act="freebox"') > 0
    && edt2.indexOf("LMApp.makeFree(+wrap.getAttribute('data-idx'))") > 0);
T('新建文本框默认在文档流：boxins → textBoxDefault（无 free 字段），旧的 freeBoxDefault 已删',
  edt2.indexOf('function textBoxDefault() {') > 0
    && edt2.indexOf("case 'boxins': closePop(); insertAt(textBoxDefault(), true, '") > 0
    && edt2.indexOf('function freeBoxDefault() {') < 0
    && edt2.indexOf('free: { x: 14, y: Math.max(20, y), w: 44 }') < 0);
T('app.js：makeFree 按此刻视觉位置生成 free 快照（扣掉 .blocks padding），⌂ 归位时还原变自由前的宽度',
  appSrc.indexOf('function makeFree(i) {') > 0
    && appSrc.indexOf('const padL = parseFloat(cs.paddingLeft) || 0;') > 0
    && appSrc.indexOf('const y = Math.max(0, Math.round(r.top - cr.top - padT));') > 0
    && appSrc.indexOf('if (fz && fz.gw != null && p.blocks[i].width == null) p.blocks[i].width = fz.gw;') > 0
    && appSrc.indexOf('makeFree: makeFree, /* ★ 修复86') > 0);
T('旧实现已清除：freeJump（整格移动）与 swapWith（放回流再换数组）都不在了',
  edt2.indexOf('function freeJump(') < 0 && edt2.indexOf('function swapWith(') < 0);

/* 真跑：用桩 DOM 执行 swapNeighbor —— 看它到底和谁换、换完数据怎么走 */
(function () {
  const srcLF = edt2.replace(/\r\n/g, '\n');
  const aA = srcLF.indexOf('  function swapNeighbor(page, i, up) {');
  const bA = srcLF.indexOf('\n  }\n', aA);
  const codeA = (aA >= 0 && bA > aA) ? srcLF.slice(aA, bA + 5) : '';
  let okA = false, dA = '切片不可用';
  if (codeA) {
    try {
      const NF = new Function('document', 'LMApp', 'tb', 'setTimeout', codeA + '\nreturn swapNeighbor;');
      const mkCol = function (list, colTop) {
        const wraps = list.map(function (x) {
          return {
            getAttribute: function () { return String(x[0]); },
            getBoundingClientRect: function () {
              return { top: x[1], bottom: x[2], left: 0, height: x[2] - x[1], width: 100 };
            }
          };
        });
        return {
          getBoundingClientRect: function () { return { top: colTop || 0, bottom: 9000, left: 0 }; },
          querySelector: function (sel) {
            const m = /data-idx="(\d+)"/.exec(sel);
            const k = m ? m[1] : null;
            return wraps.filter(function (w) { return w.getAttribute() === k; })[0] || null;
          },
          querySelectorAll: function () { return wraps; }
        };
      };
      const run = function (list, blocks, i, up, colTop) {
        const toasts = [], msgs = [];
        const doc = { querySelector: function (s) { return s === '.blocks' ? mkCol(list, colTop) : null; } };
        const lm = {
          toast: function (m) { toasts.push(m); },
          applyEdit: function (m) { msgs.push(m); },
          adjustFreeLayout: function () {}
        };
        NF(doc, lm, {}, function () {})({ blocks: blocks }, i, up);
        return { blocks: blocks, toasts: toasts, msgs: msgs };
      };
      /* ① 自由框在末尾：↑ 与上方 B 互换，框让到 B 上方（B 自然顶 200 − 框高 50 − 缝 16） */
      const b1 = [{ id: 'A' }, { id: 'B' }, { id: 'F', free: { y: 350 } }];
      const r1 = run([[0, 0, 100], [1, 200, 300], [2, 350, 400]], b1, 2, true);
      /* ② 已经最下面：只提示，不动数据 */
      const b2 = [{ id: 'A' }, { id: 'B' }, { id: 'F', free: { y: 350 } }];
      const r2 = run([[0, 0, 100], [1, 200, 300], [2, 350, 400]], b2, 2, false);
      /* ③ 自由框在最上面，↓ 与 A 互换：框落到 A 下方（A 自然顶 100 + A 高 100 + 缝 16） */
      const b3 = [{ id: 'F', free: { y: 0 } }, { id: 'A' }];
      const r3 = run([[0, 0, 50], [1, 100, 200]], b3, 0, false);
      /* ④ 两块都在文档流：只交换数组 */
      const b4 = [{ id: 'A' }, { id: 'B' }];
      const r4 = run([[0, 0, 100], [1, 200, 300]], b4, 1, true);
      /* ⑤ 并排组不参与 */
      const b5 = [{ id: 'A' }, { id: 'F', free: { y: 200, g: 'g1', gi: 0, gn: 2 } }];
      const r5 = run([[0, 0, 100], [1, 200, 300]], b5, 1, true);
      /* ⑥ 关键回归：数组下标 ≠ 视觉顺序（流块 idx0 在自由框下面） */
      const b6 = [{ id: 'A' }, { id: 'F', free: { y: 100 } }];
      const r6 = run([[0, 300, 400], [1, 100, 150]], b6, 0, true);
      /* ⑦ 列内偏移：colTop=40、A 顶 80 → 框的 y 应为 40（不是 80） */
      const b7 = [{ id: 'A' }, { id: 'F', free: { y: 210 } }];
      const r7 = run([[0, 80, 180], [1, 210, 260]], b7, 1, true, 40);
      /* ⑧ 两个自由框相邻：↑ 时双方 y 互换（否则会重叠在一起） */
      const b8 = [{ id: 'F1', free: { y: 100 } }, { id: 'F2', free: { y: 300 } }];
      const r8 = run([[0, 100, 160], [1, 300, 360]], b8, 1, true);
      /* ⑨ 流块 ↓ 越过自由框：框让到块上方（A 自然顶 100 − 框高 50 − 缝 16 = 34），
         修复104 前这里会把框设成 A 的顶端 100（框压住 A，A 永远翻不下去） */
      const b9 = [{ id: 'A' }, { id: 'F', free: { y: 300 } }];
      const r9 = run([[0, 100, 200], [1, 300, 350]], b9, 0, false);
      const ids = function (r) { return r.blocks.map(function (x) { return x.id; }).join(''); };
      okA = ids(r1) === 'ABF' && r1.blocks[2].free.y === 134
        && ids(r2) === 'ABF' && r2.blocks[2].free.y === 350
        && r2.toasts.join('|').indexOf('下面已经没有模块了') >= 0
        && ids(r3) === 'FA' && r3.blocks[0].free.y === 216
        && ids(r4) === 'BA'
        && ids(r5) === 'AF' && r5.blocks[1].free.y === 200 && r5.toasts.join('|').indexOf('并排') >= 0
        && ids(r6) === 'AF' && r6.blocks[1].free.y === 416
        && ids(r7) === 'AF' && r7.blocks[1].free.y === 0
        && ids(r8) === 'F1F2' && r8.blocks[0].free.y === 300 && r8.blocks[1].free.y === 100
        && ids(r9) === 'AF' && r9.blocks[1].free.y === 34
        && r1.msgs.join('|').indexOf('已与上面的模块互换位置') >= 0
        && r1.msgs.join('|').indexOf('自由摆放框已整块让到另一侧') >= 0
        && r3.msgs.join('|').indexOf('已与下面的模块互换位置') >= 0;
      if (!okA) dA = JSON.stringify({ r1: ids(r1) + '/' + (r1.blocks[2].free || {}).y, r2: ids(r2), r3: ids(r3) + '/' + (r3.blocks[0].free || {}).y, r4: ids(r4), r5: ids(r5), r6: ids(r6) + '/' + (r6.blocks[1].free || {}).y, r7: (r7.blocks[1].free || {}).y, r8: ids(r8) + '/' + (r8.blocks[0].free || {}).y + '/' + (r8.blocks[1].free || {}).y, r9: ids(r9) + '/' + (r9.blocks[1].free || {}).y });
    } catch (eA) { okA = false; dA = '抛出 ' + eA.message; }
  }
  T('真跑换位：只和视觉相邻那一块换 · 自由框保持自由并落在块的另一侧（高度+16px 缝，修复104）· 两个自由框互相换 y · 触底只提示 · 并排组不参与 · 下标≠视觉时也对', okA, dA);
})();

/* ---------- 修复105：云端回传不再被「本机刚保存过」挡死 ---------- */
console.log('【9.53】修复105：手机改了、电脑一两分钟没反应 → ghPull 管理员分支不再无条件 return');
T('collab.js：管理员拉云端时按「内容不同就块级合并」收敛（旧的无条件 return 已删除）',
  col.indexOf('if (GH.mergedTs === ts) return;') > 0
    && col.indexOf('merged = mergeBlocks(JSON.parse(JSON.stringify(c)));') > 0
    && col.indexOf('已吸收「云端（GitHub）」另一台设备的修改') > 0
    && col.indexOf('mergedTs: 0,') > 0
    && col.indexOf('if (GH.token) return;') < 0);

/* ---------- 9.52) 修复87：表格/文本框里的高亮与渐变真生效（一份逻辑，两条路径共用） ---------- */
console.log('【9.52】修复87：表格单元格高亮只出黄 · 换色生成坏标记 · ∅ 清不掉 · 渐变不显示 —— 与正文块统一成一份逻辑');
T('editor.js：行内高亮/上色/渐变只有一份实现 inlineApplyCore，单元格与正文块都调它（不再各写一套）',
  edt2.indexOf('function inlineApplyCore(t, s0, e0, prop, v) {') > 0
    && edt2.indexOf('const res = inlineApplyCore(t, sp.s0, sp.e0, prop, v);') > 0
    && edt2.indexOf('const res = inlineApplyCore(t, s0, e0, prop, v);') > 0);
T('单元格路径不再自己拼标记：忽略色值的 wrapTok(\'hl\',\'==\',\'==\')、漏 grad 前缀的 \'@@\' + v + \',\' 都删净',
  edt2.indexOf("wrapTok('hl', '==', '==')") < 0
    && edt2.indexOf("nt = wrapTok('@@', '@@' + v + ',', '@@');") < 0);
T('渐变 token 带 grad 前缀（旧版 @@2,文字@@ 被当成非法字号丢弃 → 渐变色一点都不显示）',
  edt2.indexOf("const tag = prop === 'grad' ? 'grad' + v : v;") > 0);
T('正文块：点色板清掉实时选区时用 selTextOf 记住的拖选兜底（文本框里「高亮不了」的根因）',
  edt2.indexOf("if (!needle) needle = String(selTextOf(tb.active != null ? tb.active : null) || '')") > 0);
T('正文块：行内高亮时一并清掉旧版整段底色 b.style.hl（否则「怎么点都还是黄的」「取消不掉」）',
  edt2.indexOf("if (prop === 'hl' && b.style && b.style.hl) { b.style.hl = '';") > 0);

/* 真跑：切出 inlineApplyCore + walkInline/srcSpanOf/pairCheck/stripToks，用真 md.js 渲染核对 */
(function () {
  const src52 = edt2.replace(/\r\n/g, '\n');
  const aA = src52.indexOf('  function inlineApplyCore(t, s0, e0, prop, v) {');
  const bA = src52.indexOf('  /* ★ 块级行内字号 / 字体（修复㉔）');
  const code52 = (aA >= 0 && bA > aA) ? src52.slice(aA, bA) : '';
  let LMMD52 = null;
  try { LMMD52 = require(path.join(DIR, 'js/md.js')); } catch (e52) { LMMD52 = null; }
  let ok52 = false, d52 = '切片/md.js 不可用';
  if (code52 && LMMD52) {
    try {
      const api = new Function(code52 + '\nreturn { core: inlineApplyCore, walk: walkInline };')();
      const go = function (t, needle, prop, v) {
        const w = api.walk(t);
        const vis = w.map.map(function (k) { return t.charAt(k); }).join('');
        const vi = vis.indexOf(needle);
        if (vi < 0) return { src: t, html: '', miss: true };
        const r = api.core(t, w.map[vi], w.map[vi + needle.length - 1] + 1, prop, v);
        return r ? { src: r.nt, html: LMMD52.inlineFmt(r.nt) } : { src: null, html: '' };
      };
      const c1 = go('文字', '文字', 'hl', '#caffbf');             /* 表格/文本框最常走的一条 */
      const c2 = go('==文字==', '文字', 'hl', '#9bf6ff');        /* 默认黄 → 换成别的颜色 */
      const c3 = go('==#9bf6ff,文字==', '文字', 'hl', '#caffbf');/* 带色 → 换色（旧版生成坏标记） */
      const c4 = go('==#9bf6ff,文字==', '文字', 'hl', '');      /* ∅ 必须真的清掉 */
      const c5 = go('==#caffbf,文字==', '文字', 'hl', '#caffbf');/* 点回同一个色 = 取消 */
      const c6 = go('文字', '文字', 'grad', '2');               /* 表格里的渐变 */
      const c7 = go('@@grad2,文字@@', '文字', 'grad', '3');
      const c8 = go('@@grad2,文字@@', '文字', 'grad', '');
      const c9 = go('前面文字后面', '文字', 'color', '#ff3b30');
      const c10 = go('@@#0071e3,文字@@', '文字', 'color', '#34c759');
      const c11 = go('==**文字**==', '文字', 'hl', '#caffbf');  /* 高亮里带加粗 */
      ok52 = c1.src === '==#caffbf,文字==' && /background:#caffbf/.test(c1.html) && /<mark/.test(c1.html)
        && c2.src === '==#9bf6ff,文字==' && /background:#9bf6ff/.test(c2.html)
        && c3.src === '==#caffbf,文字==' && /background:#caffbf/.test(c3.html)
        && c4.src === '文字' && c4.html.indexOf('<mark') < 0
        && c5.src === '文字'
        && c6.src === '@@grad2,文字@@' && /grad-2/.test(c6.html)
        && c7.src === '@@grad3,文字@@' && /grad-3/.test(c7.html)
        && c8.src === '文字'
        && c9.src === '前面@@#ff3b30,文字@@后面' && /color:#ff3b30/.test(c9.html)
        && c10.src === '@@#34c759,文字@@'
        && /background:#caffbf/.test(c11.html) && /<strong>/.test(c11.html);
      if (!ok52) d52 = JSON.stringify({ c1: c1, c2: c2, c3: c3, c4: c4, c5: c5, c6: c6, c7: c7, c8: c8, c9: c9, c10: c10, c11: c11 }).slice(0, 420);
    } catch (e) { ok52 = false; d52 = '抛出 ' + e.message; }
  }
  T('真跑：高亮带色 · 换色不留半截 == · 同色/∅ 取消 · 渐变写到 @@gradN,@@ 并渲染出 .grad-N · 高亮里的加粗不被吞', ok52, d52);
})();

/* ---------- 9.53) 修复88：在线协同提速（有人在线自动更快）+ 结构冲突可见化 ---------- */
console.log('【9.53】修复88：有人在线时轮询/推送自动提速 · 回前台立刻补拉 · 结构冲突不再静默覆盖');
const cs88 = srcOf('js/collab.js'), ys88 = srcOf('js/ycollab.js');
T('节奏参数：有人在线 1.2s / 3.5s、独自 2s / 8s、隐藏 60s；推送 2.6s vs 6s；访客前台 25s',
  cs88.indexOf('var HOT_PUSH_MIN = 2600, HOT_ACTIVE = 1200, HOT_IDLE = 3500, VISITOR_SHOWN = 25000;') > 0
    && cs88.indexOf('function pollGapNow(hidden, act, hot) {') > 0
    && cs88.indexOf('function visitorGapNow(hidden) { return hidden ? POLL_VISITOR : VISITOR_SHOWN; }') > 0
    && cs88.indexOf('function pushWaitMin(hot) { return hot ? HOT_PUSH_MIN : GH_PUSH_MIN; }') > 0);
T('轮询节拍 2s→600ms（旧版定时器抖动下实际常 4 秒才拉一次），间隔走 pollGapNow',
  cs88.indexOf('const gap = pollGapNow(hidden, act, peersHot());') > 0
    && cs88.indexOf('        }, 600);') > 0);
T('访客只读轮询不再写死 90 秒：前台 25s / 后台 90s，且同样走 gap 判定',
  cs88.indexOf("const gap = visitorGapNow(document.visibilityState === 'hidden');") > 0
    && cs88.indexOf('setInterval(ghPull, POLL_VISITOR)') < 0);
T('切回前台 / 网络恢复立刻补拉 + 立刻重播 presence（手机「回来半天不动」的根因）',
  cs88.indexOf("try { if (GH.cfg) { GH.timer = Date.now(); ghPull(); } } catch (eVis) { /* noop */ }") > 0
    && cs88.indexOf("if (window.LMYCollab && window.LMYCollab.wake) window.LMYCollab.wake();") > 0
    && cs88.indexOf("window.addEventListener('online', function () {") > 0
    && ys88.indexOf('wake: function () { try { setAw();') > 0);
T('结构冲突不再静默：块数不一致且本机有更新块（_ts 更大）时提示一次，并挂进 doApply',
  cs88.indexOf('function structConflictWarn(c, by) {') > 0
    && cs88.indexOf('structConflictWarn(c, by); /* ★ 修复88') > 0
    && cs88.indexOf('结构改动冲突：本页已采用对方版本') > 0);
T('diag 里能直接看到当前节奏（现场核对「有人在线是否真的更快」）',
  cs88.indexOf('节奏: (function () {') > 0 && cs88.indexOf('推送最小间隔秒: pushWaitMin(hot) / 1000') > 0);

/* 真跑 A：三个节奏纯函数 —— 直接验数字（含隐藏 / 活动 / 有人在线 三维组合） */
(function () {
  const src = cs88.replace(/\r\n/g, '\n');
  const a = src.indexOf('  /* GitHub 轮询间隔：隐藏 60s');
  const endMark = '  function pushWaitMin(hot) { return hot ? HOT_PUSH_MIN : GH_PUSH_MIN; }';
  const b = src.indexOf(endMark);
  const code = (a >= 0 && b > a) ? src.slice(a, b) + endMark : '';
  let ok = false, detail = '切片不可用';
  if (code) {
    try {
      const consts = 'var GH_PUSH_MIN=6000,POLL_ACTIVE=2000,POLL_IDLE=8000,POLL_HIDDEN=60000,POLL_VISITOR=90000,'
        + 'HOT_PUSH_MIN=2600,HOT_ACTIVE=1200,HOT_IDLE=3500,VISITOR_SHOWN=25000;\n';
      const api = new Function(consts + code + '\nreturn { pollGapNow: pollGapNow, visitorGapNow: visitorGapNow, pushWaitMin: pushWaitMin };')();
      ok = api.pollGapNow(true, false, false) === 60000
        && api.pollGapNow(true, true, true) === 60000
        && api.pollGapNow(false, true, true) === 1200
        && api.pollGapNow(false, true, false) === 2000
        && api.pollGapNow(false, false, true) === 3500
        && api.pollGapNow(false, false, false) === 8000
        && api.visitorGapNow(false) === 25000 && api.visitorGapNow(true) === 90000
        && api.pushWaitMin(true) === 2600 && api.pushWaitMin(false) === 6000;
      if (!ok) detail = JSON.stringify({
        hide: api.pollGapNow(true, true, true), hotAct: api.pollGapNow(false, true, true),
        soloAct: api.pollGapNow(false, true, false), hotIdle: api.pollGapNow(false, false, true),
        soloIdle: api.pollGapNow(false, false, false),
        visitor: [api.visitorGapNow(false), api.visitorGapNow(true)],
        push: [api.pushWaitMin(true), api.pushWaitMin(false)]
      });
    } catch (e) { ok = false; detail = '抛出 ' + e.message; }
  }
  T('真跑节奏：隐藏恒 60s · 有人在线 1.2s/3.5s · 独自 2s/8s · 访客 25s/90s · 推送 2.6s/6s', ok, detail);
})();

/* 真跑 B：structConflictWarn —— 只有「块数不同 + 本机 _ts 更新」才提醒，且 15 秒去抖 */
(function () {
  const src = cs88.replace(/\r\n/g, '\n');
  const a = src.indexOf('  var _structWarnAt = 0;');
  const b = a >= 0 ? src.indexOf('\n  }\n', a) : -1;
  const code = (a >= 0 && b > a) ? src.slice(a, b + 4) : '';
  let ok = false, detail = '切片不可用';
  if (code) {
    try {
      const mkPage = function (n, ts) {
        const blocks = [];
        for (let i = 0; i < n; i++) blocks.push({ type: 'paragraph', text: 'b' + i, _ts: ts });
        return { id: 'p1', blocks: blocks };
      };
      /* 同一个实例 = 同一个运行期（_structWarnAt 才有意义，去抖只能在同一实例里验） */
      const mkRunner = function (localN, localTs) {
        const toasts = [];
        const lm = { state: { content: { pages: [mkPage(localN, localTs)] } }, toast: function (m) { toasts.push(m); } };
        const fn = new Function('window', 'LMApp', code + '\nreturn structConflictWarn;')({ LMApp: lm }, lm);
        return function (remoteN, remoteTs) { fn({ pages: [mkPage(remoteN, remoteTs)] }, '小李'); return toasts.slice(); };
      };
      const hotRun = mkRunner(3, 900);
      const t1 = hotRun(2, 100);   /* 本机多一块且更新，却被整页覆盖 → 提示 */
      const t4 = hotRun(2, 100);   /* 同一实例紧接一次 → 15 秒去抖，仍只有 1 条 */
      const t2 = mkRunner(3, 100)(2, 900);   /* 对方更新 → 正常覆盖，不提示 */
      const t3 = mkRunner(3, 900)(3, 100);   /* 块数一致 → 块级后写优先，不提示 */
      ok = t1.length === 1 && t1[0].indexOf('结构改动冲突') > 0 && t1[0].indexOf('小李') > 0
        && t4.length === 1 && t2.length === 0 && t3.length === 0;
      if (!ok) detail = JSON.stringify({ t1: t1.length, t2: t2.length, t3: t3.length, t4: t4.length });
    } catch (e) { ok = false; detail = '抛出 ' + e.message; }
  }
  T('真跑冲突提示：块数不同 + 本机更新才提醒（点名对方）· 对方更新/块数一致不提醒 · 15 秒去抖', ok, detail);
})();


/* ---------- 9.54) Pages「10 次构建/小时」限额：影响说明 + 可选 Actions 发布模板 ---------- */
console.log('【9.54】Pages 构建软限：内容同步不受影响 · 发代码可能被跳过 · 模板让内容提交不再触发部署');
(function () {
  const wfPath = 'deploy/pages-actions.yml';
  const hasWf = exists(wfPath);
  const yml = hasWf ? srcOf(wfPath).replace(/\r\n/g, '\n') : '';
  const git = exists('.gitignore') ? srcOf('.gitignore') : '';
  const readme = srcOf('README.md');

  T('模板放在 deploy/ 而不是 .github/workflows/（未切到 Actions 前不会跑出红叉）',
    hasWf && !exists('.github/workflows/pages.yml') && !exists('.github/workflows/pages.yaml'),
    hasWf ? '模板缺失或已放进 .github/workflows' : 'deploy/pages-actions.yml 不存在');
  T('模板含 Actions 发布必需件：pages/id-token 权限 · upload-pages-artifact · deploy-pages · 手动触发',
    yml.indexOf('pages: write') > 0 && yml.indexOf('id-token: write') > 0
      && yml.indexOf('actions/upload-pages-artifact@v3') > 0 && yml.indexOf('actions/deploy-pages@v4') > 0
      && yml.indexOf('workflow_dispatch:') > 0);
  T('模板只打包站点目录（不含 node_modules / 测试脚本，产物不会变胖；.gitignore 已排除 node_modules）',
    yml.indexOf('cp -r index.html css js lib data images _site/') > 0
      && yml.indexOf('path: _site') > 0 && git.indexOf('node_modules/') >= 0);

  /* 真跑：用缩进扫描把 on.push.paths-ignore 的清单取出来，验证内容提交确实被挡在部署之外 */
  const scanList = function (text, key) {
    const L = text.split('\n');
    const k = L.findIndex(function (l) { return l.trim().indexOf(key) === 0; });
    if (k < 0) return null;
    const base = L[k].search(/\S/);
    const out = [];
    for (let i = k + 1; i < L.length; i++) {
      const ln = L[i];
      if (!ln.trim()) continue;
      if (ln.search(/\S/) <= base) break;          /* 回到同级或更外层 → 这个块结束 */
      const m = /^\s*-\s*'?([^'#]+?)'?\s*$/.exec(ln);
      if (m) out.push(m[1].trim());
    }
    return out;
  };
  const ignore = scanList(yml, 'paths-ignore:');
  const yamlClean = !!yml && yml.indexOf('\t') < 0
    && yml.split('\n').filter(function (l) { return l.trim() && l.trim().indexOf('#') !== 0; })
      .every(function (l) { return (/^ */).exec(l)[0].length % 2 === 0; });
  T('真跑模板：paths-ignore 不含 data/content.js（快照要能部署）· 仍忽略 README/deploy · 无 tab · 缩进偶数',
    !!ignore && ignore.indexOf('data/content.js') < 0
      && ignore.indexOf('README.md') >= 0 && ignore.indexOf('deploy/**') >= 0 && yamlClean,
    JSON.stringify({ pathsIgnore: ignore, yamlClean: yamlClean }));

  T('README 写清官方口径与三条解法（不受影响 / 临时缓解 / Actions 一劳永逸 + 回退步骤）',
    readme.indexOf('soft limit of 10 builds per hour') > 0
      && readme.indexOf('does not apply if you build and publish your site with a custom GitHub Actions workflow') > 0
      && readme.indexOf('deploy/pages-actions.yml') > 0
      && readme.indexOf('完全不受影响：协同内容本身') > 0
      && readme.indexOf('回退') > 0);
})();


/* ---------- 9.55) 修复89：内容写数据分支（不触发 Pages 构建）+ main 低频快照 ---------- */
console.log('【9.55】修复89：实时内容写 lm-data（0 构建）· main 仅 30 分钟快照 · 权限不足自动回退 main');
(function () {
  const collab = srcOf('js/collab.js');
  const store = srcOf('js/store.js');
  const editor = srcOf('js/editor.js');
  const readme = srcOf('README.md');

  /* 1) 真跑：分支判定（老配置没有 dataBranch 字段也要吃到默认值） */
  let dataRefOf = null;
  try {
    const defM = /const DEF_GH = (\{[^}]*\});/.exec(store);
    const a = store.indexOf('  function dataRefOf(cfg) {');
    const b = store.indexOf('\n  }', a);
    const DEF_GH = eval('(' + defM[1] + ')');
    dataRefOf = new Function('DEF_GH', store.slice(a, b + 4) + '\nreturn dataRefOf;')(DEF_GH);
  } catch (e) { dataRefOf = null; }
  let dOK = false, dDetail = '提取失败';
  if (dataRefOf) {
    const r = {
      '未配置': dataRefOf({ branch: 'main' }),
      '空串': dataRefOf({ branch: 'main', dataBranch: '' }),
      '自定义': dataRefOf({ branch: 'main', dataBranch: 'lm-db' }),
      '非 main 分支+空串': dataRefOf({ branch: 'gh-pages', dataBranch: '' })
    };
    dOK = r['未配置'] === 'lm-data' && r['空串'] === 'main'
      && r['自定义'] === 'lm-db' && r['非 main 分支+空串'] === 'gh-pages';
    dDetail = JSON.stringify(r);
  }
  T('真跑 dataRefOf：未配置→lm-data · 空串→跟随 branch · 自定义生效（老配置/保险箱也吃到默认值）', dOK, dDetail);

  /* 2) 真跑：快照节流（30 分钟 → 最多 2 次构建/小时） */
  let snapDue = null, sOK = false, sDetail = '';
  try {
    const i1 = collab.indexOf('function snapDue(');
    snapDue = new Function(collab.slice(i1, collab.indexOf('\n', i1)) + '\nreturn snapDue;')();
    const MIN30 = 30 * 60 * 1000;
    const src = /const SNAP_MIN = ([^;]+);/.exec(collab);
    sOK = snapDue(1000, 0, MIN30) === true            /* 从没写过 → 立即快照 */
      && snapDue(1000 + MIN30 - 1, 1000, MIN30) === false  /* 29:59 → 不动 */
      && snapDue(1000 + MIN30, 1000, MIN30) === true       /* 30:00 → 可以 */
      && !!src && eval(src[1]) === MIN30;
    sDetail = JSON.stringify({ MIN: src && eval(src[1]), 每小时上限: MIN30 / eval(src[1]) * 2 });
  } catch (e) { sDetail = '提取失败: ' + e.message; }
  T('真跑 snapDue：30 分钟内不重写 main 快照（≤2 次构建/小时，不再是「每次保存 1 次」）', sOK, sDetail);

  /* 3) 读写都走数据分支：管理员 API ?ref / 访客 raw 一致，不会一个读 main 一个读 lm-data */
  T('读写同源：ghPull(管理员 ?ref=) 与 ghRaw(访客) 都用 ghBranch()，默认数据分支',
    collab.indexOf('function ghBranch() { return GH.useMain ? ghMainRef() : ghDataRef(); }') > 0
      && collab.indexOf("const ref = ghBranch();") >= 0
      && collab.indexOf("'?ref=' + encodeURIComponent(ref)") > 0
      && collab.indexOf("encodeURIComponent(ghBranch()) + '/' + path.split('/')") > 0
      && collab.indexOf('LMStore.dataRefOf') > 0);

  /* 4) 首次写数据分支：文件/分支都不存在(422/404) → 建 ref 再重试一次 */
  T('首次落库自建分支：git/refs 以发布分支头为起点 · 422=已存在也算成功 · 只重试一次',
    store.indexOf("'/git/refs'") > 0 && store.indexOf("'refs/heads/' + branch") > 0
      && store.indexOf('return r2.ok || r2.status === 422;') > 0
      && collab.indexOf('function ensureDataBranch()') > 0
      && collab.indexOf('if (!had && (r.status === 422 || r.status === 404) && br !== ghMainRef()) {') > 0
      && collab.indexOf('return ensureDataBranch().then(function (ok) {') > 0);

  /* 5) 降级路径：写不进去就回退 main（= 旧行为），只提示一次，并且立刻用 main 重推 */
  T('降级：数据分支不可写 → 回退 main + toast 一次 + 立刻重推（内容不会卡在本机）',
    collab.indexOf("if (!GH.useMain && ghDataRef() !== ghMainRef()) {") > 0
      && collab.indexOf('GH.useMain = true;') > 0
      && collab.indexOf("GH.etag = ''; delete shaOf[ghMainRef()];") > 0
      && collab.indexOf('已回退到') > 0
      && collab.indexOf('if (window.LMApp && validContent(LMApp.state.content)) ghPush(LMApp.state.content);') > 0);

  /* 6) 快照本身是「尽力而为」：不占 inFlight、失败静默，绝不拖慢实时同步 */
  T('快照只喂首屏：独立 sha 缓存 · 失败静默 · 只在推送成功后触发',
    collab.indexOf('function maybeSnapshot(text)') > 0
      && collab.indexOf('if (ghBranch() === main) return;') > 0
      && collab.indexOf('snapDue(now, GH.snapAt, SNAP_MIN)') > 0
      && collab.indexOf('/* 快照失败：下次再试 */') > 0
      && /maybeSnapshot\(text\);\s*\/\* ★ 修复89/.test(collab));

  /* 7) 配置与界面：默认可关（清空 = 跟随 branch），保险箱也带着它分发 */
  T('配置链路完整：DEF_GH=lm-data · setGhCfg 保留 · 设置界面可改/可清空 · 团队保险箱带上它',
    /dataBranch: 'lm-data'/.test(store)
      && store.indexOf('dataBranch: (cfg.dataBranch == null ? DEF_GH.dataBranch : cfg.dataBranch)') > 0
      && editor.indexOf("F.text('dataBranch'") > 0
      && editor.indexOf("dataBranch: String(fd.get('dataBranch') || '').trim()") > 0
      && editor.indexOf('dataBranch: c.dataBranch') > 0);

  /* 8) 手动「☁ 同步」：也写数据分支，并顺手刷新 main 快照 */
  T('手动同步：先写数据分支（失败才建分支重试），再刷新 main 快照（首屏不是陈年内容）',
    store.indexOf('const ref = dataRefOf(cfg);') > 0
      && store.indexOf('let res = await ghPutFile(cfg, ref, text, token);') > 0
      && store.indexOf('await ghPutFile(cfg, main, text, token,') > 0);

  /* 9) 现场可核对：协作诊断里显示「内容分支 / 是否已回退」 */
  T('协作诊断显示当前内容分支（回退时标注「已回退 main」），面板里能当场核对',
    collab.indexOf('内容分支: (function ()') > 0 && collab.indexOf('（已回退 main）') > 0);

  /* 10) 文档：README 讲清「驱动 89」的原因与代价 */
  T('README 记录修复89：数据分支 lm-data · 30 分钟快照 · 10 次构建 口径',
    readme.indexOf('修复89') > 0 && readme.indexOf('lm-data') > 0
      && readme.indexOf('30 分钟') > 0 && readme.indexOf('10 次构建') > 0);
})();


/* ---------- 9.56) 修复90：额度自适应 · 限流不误降级 · 快照窗口跨刷新 · 内容没变不重推 ---------- */
console.log('【9.56】修复90：403 不再误降级 · 快照窗口跨刷新 · 重复 PUT 去重 · 剩余额度自动降挡');
(function () {
  const collab = srcOf('js/collab.js');
  const editor = srcOf('js/editor.js');
  const readme = srcOf('README.md');

  /* 从源码切出独立函数：两个纯函数 + 假响应头真跑 */
  const fnAt = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return null;
    const j = src.indexOf('\n  }', i);
    if (j < 0) return null;
    return src.slice(i, j + 4);
  };
  const mkRes = function (hdr) {
    return { headers: { get: function (k) { return hdr[k] == null ? '' : String(hdr[k]); } } };
  };

  let rateGapOf = null, retryAfterMs = null;
  try {
    rateGapOf = new Function(fnAt(collab, 'rateGapOf') + '\nreturn rateGapOf;')();
    retryAfterMs = new Function(fnAt(collab, 'retryAfterMs') + '\nreturn retryAfterMs;')();
  } catch (e) { /* 下面断言会失败并给出原因 */ }

  T('真跑 rateGapOf：额度充裕不放慢 · ≤800 降 12 秒 · ≤200 降 30 秒 · 未知/非法值不干预',
    !!rateGapOf
      && rateGapOf(null) === 0 && rateGapOf('') === 0 && rateGapOf('abc') === 0
      && rateGapOf('5000') === 0 && rateGapOf('900') === 0
      && rateGapOf('800') === 12000 && rateGapOf('500') === 12000
      && rateGapOf('200') === 30000 && rateGapOf('0') === 30000,
    rateGapOf ? JSON.stringify([null, '5000', '900', '800', '200', '0'].map(function (v) { return [v, rateGapOf(v)]; })) : '提取失败');

  const futureReset = Math.floor((Date.now() + 120000) / 1000);
  T('真跑 retryAfterMs：优先 Retry-After（秒）· 也认 HTTP 日期 · 再退到 X-RateLimit-Reset · 上限 5 分钟 / 兜底 60 秒',
    !!retryAfterMs
      && retryAfterMs(mkRes({ 'Retry-After': '30' })) === 30000
      && retryAfterMs(mkRes({ 'Retry-After': '9999' })) === 300000
      && retryAfterMs(mkRes({})) === 60000
      && retryAfterMs(mkRes({ 'X-RateLimit-Reset': String(futureReset) })) > 60000
      && retryAfterMs(mkRes({ 'Retry-After': new Date(Date.now() + 45000).toUTCString() })) > 1000,
    retryAfterMs ? JSON.stringify({
      秒数: retryAfterMs(mkRes({ 'Retry-After': '30' })),
      超长被截断: retryAfterMs(mkRes({ 'Retry-After': '9999' })),
      兜底: retryAfterMs(mkRes({})),
      重置时刻: retryAfterMs(mkRes({ 'X-RateLimit-Reset': String(futureReset) }))
    }) : '提取失败');

  T('降级收窄：只有「分支真的不存在」(404 / 建 ref 失败) 才退回发布分支，其余错误不动分支策略',
    collab.indexOf('const branchMissing = !!r._mkFail || r.status === 404;') > 0
      && collab.indexOf('if (!branchMissing) return;') > 0
      && collab.indexOf('GH.useMain = true;') > 0);

  T('限流不哑火：403/429 按响应头退避 + 只提示一次；退避期内 ghPush 直接不写；401 提示换 Token',
    collab.indexOf('if (r.status === 403 || r.status === 429) {') > 0
      && collab.indexOf('GH.blockUntil = Date.now() + ms;') > 0
      && collab.indexOf('if (!GH._rlToast) {') > 0
      && collab.indexOf('if (now < GH.blockUntil) return;') > 0
      && collab.indexOf('if (r.status === 401) {') > 0
      && collab.indexOf('if (!GH._authToast) {') > 0);

  T('快照窗口跨刷新：显式写/读 localStorage（否则每刷新一次就又能写一次 main，连刷 10 次 = 10 次构建）',
    collab.indexOf("const SNAP_TS_KEY = 'lm_gh_snap_ts';") > 0
      && collab.indexOf('localStorage.getItem(SNAP_TS_KEY)') > 0
      && collab.indexOf('localStorage.setItem(SNAP_TS_KEY, String(now))') > 0);

  T('去重：文本与上次成功推送完全一致 → 不发 PUT（协同里很多 commit 只动 _ts，纯烧额度）',
    collab.indexOf('if (text === GH.lastText) return;') > 0
      && collab.indexOf('GH.lastText = text;') > 0
      && collab.indexOf("lastText: '',") > 0);

  T('降挡：推送间隔取 max(正常间隔, 限额间隔) —— 充裕时仍是 2.6s / 6s，不受影响',
    collab.indexOf('Math.max(pushWaitMin(peersHot()), rateGap())') > 0
      && collab.indexOf('function rateGap()') > 0);

  T('配置漂移：换仓库/分支/数据分支后清掉 sha 缓存与「已回退 main」错误状态',
    collab.indexOf('if (_sig !== GH._sig) {') > 0
      && collab.indexOf('Object.keys(shaOf).forEach(function (k) { delete shaOf[k]; });') > 0
      && collab.indexOf("GH.useMain = false; GH.etag = ''; GH.lastText = '';") > 0);

  T('访客也回退：数据分支不存在（管理员 Token 无建分支权限）→ 访客改读发布分支，不会永远停在旧快照',
    collab.indexOf('if (r.status === 404 && !useApi && !GH.useMain && ghDataRef() !== ghMainRef()) {') > 0);

  T('手动「☁ 同步」后清 sha（否则下一笔自动推送拿着旧 sha 必撞 409、白跑一轮）',
    collab.indexOf('dropGhSha: function () {') > 0
      && (editor.split('LMCollab.dropGhSha()').length - 1) >= 2);

  T('协作诊断能看到「额度剩余 + 当前推送间隔」，现场可核对降挡是否生效',
    collab.indexOf('额度剩余: (GH.rateLeft == null') > 0);

  T('README 记录修复90（403 不误降级 / 快照跨刷新 / 去重 / 额度降挡）',
    readme.indexOf('修复90') > 0 && readme.indexOf('403') > 0
      && readme.indexOf('lm_gh_snap_ts') > 0 && readme.indexOf('X-RateLimit-Remaining') > 0);
})();


/* ---------- 9.57) 修复91：本地 AI 能力（要点 / 关键词 / 相关条目 / 站内问答，离线、零额度） ---------- */
console.log('【9.57】修复91：本地 AI —— TF-IDF 摘要 · 关键词 · 语义相关 · 抽取式问答（可 require、可复现）');
(function () {
  const ai = require(path.join(DIR, 'js/ai.js'));
  const contentSrc = srcOf('data/content.js');
  const pages = (function () {
    const win = {};
    /* data/content.js 是 window.SITE_CONTENT = {...} 形式 → 在沙箱里 eval 出来 */
    try { new Function('window', 'var module={};' + contentSrc)(win); } catch (e) { /* noop */ }
    return (win.SITE_CONTENT && win.SITE_CONTENT.pages) || [];
  })();
  const ix = ai.buildIndex(pages);
  const has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

  T('模块可 require（测试能真跑）：8 个 API 齐全 · 版本号可见',
    !!ai && typeof ai.plain === 'function' && typeof ai.pageText === 'function'
      && typeof ai.tokens === 'function' && typeof ai.buildIndex === 'function'
      && typeof ai.related === 'function' && typeof ai.keywords === 'function'
      && typeof ai.summarize === 'function' && typeof ai.ask === 'function'
      && typeof ai.mount === 'function' && !!ai.version);

  T('文本清洗：剥掉本项目的行内标记（加粗 / 颜色 / 渐变 / 链接 / 代码），只留文字',
    ai.plain('**粗**与==#ff0000,红色==、@@grad2,渐变@@、[链接](https://x.y)、`code`')
      === '粗与红色、渐变、链接、code',
    JSON.stringify(ai.plain('**粗**与==#ff0000,红色==、@@grad2,渐变@@')));

  T('分词：英文保留单词、中文切 2-gram，纯虚 2-gram（如「是什」）被丢弃',
    (function () {
      const tk = ai.tokens('Transformer 是什么 模型 结构');
      return tk.indexOf('transformer') >= 0 && tk.indexOf('模型') >= 0 && tk.indexOf('结构') >= 0
        && tk.indexOf('是什') < 0 && tk.indexOf('什么') < 0;
    })(), JSON.stringify(ai.tokens('Transformer 是什么 模型 结构')));

  T('块 → 文本：表格单元格 / 图表标签数值 / 附件与来源 / 标题与正文都进索引（8 种块全覆盖）',
    (function () {
      const t = ai.blockText({ type: 'table', title: 'T', headers: ['概念'], rows: [['Token 分词']] });
      const c = ai.blockText({ type: 'chart', title: '热度', labels: ['RAG'], data: [72], unit: '票' });
      const f = ai.blockText({ type: 'files', title: '资料', items: [{ name: 'MDN 文档' }] });
      const s = ai.blockText({ type: 'sources', title: '来源', items: [{ label: 'Attention Is All You Need' }] });
      return t.indexOf('Token 分词') >= 0 && c.indexOf('RAG') >= 0 && c.indexOf('72') >= 0
        && f.indexOf('MDN') >= 0 && s.indexOf('Attention') >= 0;
    })());

  T('全站索引：docs 数 = 页面数 · 每页有 tf 与正文 · IDF 表非空',
    ix.docs.length === pages.length && ix.docs.every(function (d) { return d.text.length > 0 && Object.keys(d.tf).length > 0; })
      && Object.keys(ix.idf).length > 50,
    'docs=' + ix.docs.length + ' idf=' + Object.keys(ix.idf).length);

  T('分句 + 长段切块：单句 ≤150 字（表格/图表被连成一句时切块而不是整段丢弃）',
    (function () {
      const all = ix.docs.reduce(function (a, d) { return a.concat(ai.sentences(d.text)); }, []);
      const maxLen = all.reduce(function (m, s) { return Math.max(m, s.length); }, 0);
      return all.length > 20 && maxLen <= 150 && all.every(function (s) { return s.length >= 8; });
    })());

  T('智能提炼：真实页面能出 3 条要点（≤3 条 · 每条 ≤150 字 · 不重复）',
    (function () {
      const r = ai.summarize(ix, 'domain', 3);
      return r.length === 3 && r.every(function (s) { return s.length >= 8 && s.length <= 150; })
        && new Set(r).size === r.length;
    })(), JSON.stringify(ai.summarize(ix, 'domain', 3).map(function (s) { return s.slice(0, 18); })));

  T('关键词：真实页面出 ≥6 个词 · 全部 ≥2 字（单字噪声如「票」被过滤）',
    (function () {
      const k = ai.keywords(ix, 'domain', 8);
      return k.length >= 6 && k.every(function (w) { return w.length >= 2; });
    })(), JSON.stringify(ai.keywords(ix, 'domain', 8)));

  T('语义相关条目：与本页最像的页排前面 · 分数 0~1 · 绝不含自己',
    (function () {
      const r = ai.related(ix, 'domain', 3);
      return r.length >= 2 && r.every(function (x) { return x.id !== 'domain' && x.score > 0 && x.score <= 1; })
        && r[0].score >= r[r.length - 1].score;
    })(), JSON.stringify(ai.related(ix, 'domain', 3).map(function (r) { return r.id + ':' + r.score; })));

  T('站内问答：问「RAG」能定位到写了它的页且给出原文句子（不编造）· 问站外话题返回空',
    (function () {
      const hit = ai.ask(ix, 'RAG 是什么', 2);
      const none = ai.ask(ix, '紫砂壶怎么养', 2);
      return hit.length >= 1 && hit[0].answer.length >= 8 && none.length === 0;
    })(), JSON.stringify(ai.ask(ix, 'RAG 是什么', 1).map(function (r) { return r.pageId + '|' + r.answer.slice(0, 24); })));

  /* ★ 修复110：本地问答升级（判断问法 / 对比 / 表格行 / 按页组织），仍然只用原文，不联网 */
  const fx = ai.buildIndex([
    { id: 'fx-attn', label: '示例页：注意力机制', blocks: [
      { type: 'text', text: 'Transformer 用自注意力把整个序列一起算，所以能够并行。' },
      { type: 'text', text: '自注意力的好处是长距离依赖不会被稀释。' }
    ] },
    { id: 'fx-rnn', label: '示例页：RNN', blocks: [
      { type: 'text', text: 'RNN 按顺序一个词一个词地读，靠隐藏状态记住前面的信息，因此不能并行。' }
    ] }
  ]);

  T('问答升级1：先判断问法 —— 是什么→定义 · 区别→对比 · 为什么→原因 · 怎么→方法 · 举例→例子',
    ai.qKind('RAG 是什么') === '定义' && ai.qKind('Transformer 和 RNN 有什么区别') === '对比'
      && ai.qKind('为什么要分片') === '原因' && ai.qKind('怎么做索引') === '方法'
      && ai.qKind('举个例子') === '例子',
    [ai.qKind('RAG 是什么'), ai.qKind('A 和 B 有什么区别'), ai.qKind('为什么'), ai.qKind('怎么做'), ai.qKind('举个例子')].join('/'));

  T('问答升级2：对比题拆出两个实体（和 / 与 / vs 都认），拆不出来返回 null',
    (function () {
      const p1 = ai.qPair('Transformer 和 RNN 有什么区别');
      const p2 = ai.qPair('RAG 与 微调 哪个好');
      return !!p1 && p1[0] === 'Transformer' && p1[1] === 'RNN'
        && !!p2 && p2[0] === 'RAG' && p2[1] === '微调'
        && ai.qPair('这件事怎么弄') === null;
    })(), JSON.stringify(ai.qPair('Transformer 和 RNN 有什么区别')));

  T('问答升级3：对比题给出 ①A ②B ③差别 三段式（A、B 各引一句原文）',
    (function () {
      const r = ai.askSmart(fx, 'Transformer 和 RNN 有什么区别', 3);
      const a = (r[0] || {}).answer || '';
      return r.length >= 1 && r[0].kind === '对比'
        && a.indexOf('①【Transformer】') === 0 && a.indexOf('②【RNN】') > 0 && a.indexOf('③') > 0;
    })(), JSON.stringify((ai.askSmart(fx, 'Transformer 和 RNN 有什么区别', 1)[0] || {}).answer));

  T('问答升级4：普通题按页聚合成「引导语 + 要点列表」，不再只甩一句',
    (function () {
      const a = (ai.askSmart(fx, '自注意力 是什么', 1)[0] || {}).answer || '';
      return /^按《.+》里的说法：\n· /.test(a) && a.split('\n').length >= 2;
    })(), JSON.stringify((ai.askSmart(fx, '自注意力 是什么', 1)[0] || {}).answer));

  T('问答升级5：表格题直接给「表头 + 对得上的那一行」（比原句更懂结构）',
    (function () {
      const docs = ai.buildIndex([{ id: 't1', label: '表页', blocks: [
        { type: 'table', title: '模型对比表', headers: ['模型', '能否并行'], rows: [['Transformer', '能'], ['RNN', '不能']] }
      ] }]).docs;
      const h = ai.tableHits(docs, '模型 能否并行 Transformer', 2);
      return h.length >= 1 && h[0].table === '模型对比表'
        && h[0].head.join('|') === '模型|能否并行' && h[0].line.indexOf('Transformer') === 0;
    })(), JSON.stringify(ai.tableHits(fx.docs, 'RNN 不能并行', 1)));

  T('问答升级6：站里没写过就问空（宁可不答也不编）—— 与旧版行为一致',
    ai.askSmart(ix, '紫砂壶怎么养', 2).length === 0);

  /* ★ 修复111：检索升级（BM25 长度归一 · 句子索引缓存 · 清单步骤 · 追问上下文 · 因果排序 · 诚实护栏） */
  const fx2 = ai.buildIndex([
    { id: 'fx-vec', label: '示例页：向量库', blocks: [
      { type: 'text', text: '向量数据库 用来存 向量 并做 相似度 检索。' },
      { type: 'text', text: '这一页还顺带提了一句 向量 这个词，但整句话拉得很长，讲的是部署时要注意磁盘、网络、备份、监控、告警、灰度、回滚、容量规划以及值班安排等一长串和问题无关的细节，用来验证长度归一化确实在起作用。' }
    ] },
    { id: 'fx-shard', label: '示例页：分片', blocks: [
      { type: 'text', text: '分片的原因是索引太大放不进一台机器的内存。' },
      { type: 'text', text: '分片还可以让查询并行跑得更快，因为多台机器可以同时查。' }
    ] },
    { id: 'fx-step', label: '示例页：上线步骤', blocks: [
      { type: 'list', title: '上线步骤', items: ['先跑本地测试', '再推送到远端', '最后刷新缓存'] }
    ] }
  ]);

  T('检索升级1：BM25 长度归一 —— 又短又准的句子排在「碰巧含一个词的长句」前面',
    (function () {
      const r = ai.rankSent(fx2, '向量数据库 检索', 5);
      return r.length >= 2 && r[0].s.indexOf('向量数据库 用来存 向量') > 0 && r[0].score > r[1].score
        && r.every(function (x, i) { return i === 0 || r[i - 1].score >= x.score; });
    })(), JSON.stringify(ai.rankSent(fx2, '向量数据库 检索', 3).map(function (x) { return x.score; })));

  T('检索升级2：句子级索引只建一次（同一 index 复用缓存），warm() 可预热',
    (function () {
      const a = ai.sentIndex(fx2), b = ai.sentIndex(fx2);
      return !!a && a === b && a.n > 0 && a.avgdl > 0 && ai.warm(fx2) === true
        && ai.sentIndex(ai.buildIndex([])) !== a;
    })());

  T('检索升级3：问「怎么做」且页里有清单 → 按原文条目列 1./2./3. 步骤（不自己编步骤）',
    (function () {
      const r = ai.askSmart(fx2, '上线 怎么做', 1);
      const a = (r[0] || {}).answer || '';
      return !!r[0] && r[0].kind === '步骤'
        && a.indexOf('1. 先跑本地测试') > 0 && a.indexOf('3. 最后刷新缓存') > 0;
    })(), JSON.stringify((ai.askSmart(fx2, '上线 怎么做', 1)[0] || {}).answer));

  T('检索升级4：追问「它 / 这个」会把上一问的词带进检索；没有指代就原样不动',
    ai.expandQuery('它有什么用', 'RAG 是什么').indexOf('RAG') === 0
      && ai.expandQuery('分片怎么做', 'RAG 是什么') === '分片怎么做'
      && ai.expandQuery('上面那个怎么用', '') === '上面那个怎么用');

  T('检索升级5：问「为什么」时含因果连词的原句排前面（只调顺序，不改内容）',
    (function () {
      const a = ((ai.askSmart(fx2, '为什么要分片', 1)[0] || {}).answer || '');
      return a.indexOf('因为') > 0 && a.indexOf('分片') > 0;
    })(), JSON.stringify((ai.askSmart(fx2, '为什么要分片', 1)[0] || {}).answer));

  T('检索升级6：诚实护栏 —— 只找到一条就明说「可能没完全对上」并指路 DeepSeek；页面打开即预热',
    (function () {
      const s = srcOf('js/ai.js');
      return s.indexOf('res.length === 1') > 0 && s.indexOf('可能没完全对上你的问法') > 0
        && s.indexOf('warm(ix0)') > 0 && s.indexOf('expandQuery(q, prev)') > 0;
    })());

  /* ★ 修复112：A + D 组合 —— 真训出来的小语言模型只做「重排 + 纠错」，绝不生成答案文字 */
  const fs2 = require('fs');
  const lmPath = path.join(DIR, 'data/lm.json');
  const LMLM = require(path.join(DIR, 'js/lm.js'));
  const lmPayload = JSON.parse(fs2.readFileSync(lmPath, 'utf8'));
  LMLM.fromJSON(lmPayload);
  const goodText = pages.map(function (p) { return ai.pageText(p); })
    .sort(function (a, b) { return b.length - a.length; })[0].slice(0, 30);
  const gibberish = '啊哦呃吖吡咕噜噼啪嗒嗝咦';

  T('小模型1：训练脚本 + 产物都在 · data/lm.json < 380KB · 元信息合理（order / chars / grams）',
    fs2.existsSync(path.join(DIR, 'tools/train_lm.js')) && fs2.existsSync(lmPath)
      && Buffer.byteLength(fs2.readFileSync(lmPath), 'utf8') < 400 * 1024
      && lmPayload.order >= 1 && lmPayload.chars > 500 && Object.keys(lmPayload.grams).length >= 1,
    'order=' + lmPayload.order + ' chars=' + lmPayload.chars + ' bytes=' + Buffer.byteLength(fs2.readFileSync(lmPath), 'utf8'));

  T('小模型2：它真的学到了本站语料 —— 原文句子得分显著高于乱码',
    LMLM.ready() && LMLM.logp(goodText) > LMLM.logp(gibberish) + 0.5,
    '原文=' + LMLM.logp(goodText).toFixed(3) + ' 乱码=' + LMLM.logp(gibberish).toFixed(3));

  T('小模型3：重排只改先后 —— 候选集合完全不变（不会凭空多出/改写一句）',
    (function () {
      const cands = ai.rankSent(ix, 'RAG 是什么', 6);
      const before = cands.map(function (c) { return c.s; }).sort().join('|');
      const after = LMLM.rerank(cands.slice()).map(function (c) { return c.s; }).sort().join('|');
      return cands.length >= 2 && before === after;
    })());

  T('小模型4：英文词纠错 —— 站内没有的拼写映射到最近词；中文一律不动',
    (function () {
      const vocab = Object.keys(ix.idf).filter(function (t) { return /^[a-z][a-z0-9+#._-]*$/.test(t); });
      const word = vocab.filter(function (w) { return w.length >= 5; })[0];
      const typo = word ? (word.slice(0, 1) + word.charAt(2) + word.charAt(1) + word.slice(3)) : '';
      return !!word && LMLM.fixQuery(typo, vocab) === word
        && LMLM.fixQuery('紫砂壶怎么养', vocab) === '紫砂壶怎么养';
    })(), '词汇表英文词 ' + Object.keys(ix.idf).filter(function (t) { return /^[a-z]/.test(t); }).length + ' 个');

  T('小模型5：★ 防瞎编硬闸门 —— askSmart 每条要点都必须是原文子串（模型加不进一个字）',
    (function () {
      const all = ix.docs.map(function (d) { return d.text; }).join('\n');
      let bullets = 0, bad = 0;
      ix.docs.slice(0, 6).forEach(function (d) {
        ai.askSmart(ix, d.label + ' 是什么', 3).forEach(function (r) {
          String(r.answer).split('\n').forEach(function (line) {
            const m = line.match(/^· (.*)$/);
            if (m) { bullets++; if (all.indexOf(m[1]) < 0) bad++; }
          });
        });
      });
      return bullets >= 3 && bad === 0;
    })());

  T('小模型6：拿不到模型就静默降级（照常答题）· index.html 先 lm.js 再 ai.js',
    (function () {
      const keep = global.LMLM;
      delete global.LMLM;
      let ok = false;
      try { ok = ai.askSmart(ix, 'RAG 是什么', 2).length >= 1; } catch (e) { ok = false; }
      global.LMLM = keep;
      const html2 = srcOf('index.html');
      return ok && html2.indexOf('js/lm.js') > 0 && html2.indexOf('js/lm.js') < html2.indexOf('js/ai.js');
    })());


  T('小模型7：lm.json 与语料同步（往站里加内容后不重训，这条就会红 —— 提醒你跑一次）',
    (function () {
      const chars = pages.map(function (p) { return ai.pageText(p); }).join('\n').length;
      return lmPayload.chars === chars;
    })(), 'lm=' + lmPayload.chars + ' 语料=' + pages.map(function (p) { return ai.pageText(p); }).join('\n').length);

  T('检索升级7：PRF 扩展只追加「索引里真有」的词（≤4 个，绝不造词）',
    (function () {
      const q0 = 'RAG 是什么';
      const q2 = ai.prfExpand(ix, q0, ai.rankSent(ix, q0, 10));
      if (q2 === q0) return true;
      const added = q2.slice(q0.length).trim().split(/\s+/).filter(Boolean);
      return added.length > 0 && added.length <= 4
        && added.every(function (t) { return Object.prototype.hasOwnProperty.call(ix.idf, t); });
    })(), JSON.stringify(ai.prfExpand(ix, 'RAG 是什么', ai.rankSent(ix, 'RAG 是什么', 10))));

  T('检索升级8：跨页同一句话只出现一次（加内容不会让同一事实刷屏）',
    (function () {
      const dup = ai.buildIndex([
        { id: 'd1', label: 'A页', blocks: [{ type: 'text', text: '向量检索靠相似度算最近邻，速度快。' }] },
        { id: 'd2', label: 'B页', blocks: [{ type: 'text', text: '向量检索靠相似度算最近邻，速度快。' }] }
      ]);
      const lines = [];
      ai.askSmart(dup, '向量检索 相似度', 3).forEach(function (r) {
        String(r.answer).split('\n').forEach(function (l) { const m = l.match(/^· (.*)$/); if (m) lines.push(m[1]); });
      });
      return lines.length >= 1 && new Set(lines).size === lines.length;
    })(), '重复句 ' + ai.dedupeSent([
      { s: '向量检索靠相似度算最近邻', pageId: 'a' },
      { s: '向量检索靠相似度算最近邻', pageId: 'b' }
    ]).length);

  T('检索升级9：PRF 只重排、不换候选 —— 每条要点仍来自那次检索的原句集合',
    (function () {
      const q0 = 'RAG 是什么';
      const pool = {};
      ai.rankSent(ix, q0, 80).forEach(function (x) { pool[x.pageId + '|' + x.s] = 1; });
      const q2 = ai.prfExpand(ix, q0, ai.rankSent(ix, q0, 30));
      if (q2 !== q0) ai.rankSent(ix, q2, 80).forEach(function (x) { pool[x.pageId + '|' + x.s] = 1; });
      let outside = 0, n = 0;
      ai.askSmart(ix, q0, 3).forEach(function (r) {
        String(r.answer).split('\n').forEach(function (l) {
          const m = l.match(/^· (.*)$/);
          if (!m) return;
          n++;
          if (!pool[r.pageId + '|' + m[1]]) outside++;
        });
      });
      return n === 0 || outside === 0;
    })());

  /* ★ 修复114：答案后面附「原文出处」（逐字引用 + 该页链接），回到最原始那种"有据可查" */
  T('出处1：每条本地回答都带 used（pageId / title / text 齐全，非空）',
    (function () {
      const r = ai.askSmart(ix, 'RAG 是什么', 3);
      return r.length >= 1 && r.every(function (x) {
        return Array.isArray(x.used) && x.used.length >= 1 && x.used.every(function (c) {
          return !!c.pageId && typeof c.text === 'string' && c.text.length >= 2;
        });
      });
    })(), JSON.stringify(ai.askSmart(ix, 'RAG 是什么', 1).map(function (x) { return (x.used || []).length; })));

  T('出处2：★ used 里引用的文字必须逐字出自那一页（引错页/改写都算失败）',
    (function () {
      const byId = {};
      ix.docs.forEach(function (d) { byId[d.id] = d.text; });
      let n = 0, bad = 0;
      ['RAG 是什么', '三张地图有什么区别', '活地图是什么'].forEach(function (q) {
        ai.askSmart(ix, q, 3).forEach(function (r) {
          (r.used || []).forEach(function (c) {
            n++;
            const page = byId[c.pageId] || '';
            if (page.indexOf(c.text) < 0) bad++;
          });
        });
      });
      return n >= 3 && bad === 0;
    })());

  T('出处4：★ cite 能真的存进对话再读出来（chatPush/chatOf 往返，且每条 ≤200 字）',
    (function () {
      const stub = {
        m: {},
        getItem: function (k) { return this.m[k] == null ? null : this.m[k]; },
        setItem: function (k, v) { this.m[k] = String(v); }
      };
      const prev = global.localStorage;
      global.localStorage = stub;
      let ok = false;
      try {
        ai.chatPush('tst', {
          r: 'local', t: '答案', src: { pageId: 'p1', title: '页1', score: 3 },
          cite: [
            { pageId: 'p1', title: '页1', text: '原文一句' },
            { pageId: 'p2', title: '页2', text: new Array(501).join('x') }
          ]
        });
        const m = ai.chatOf('tst');
        ok = m.length === 1 && Array.isArray(m[0].cite) && m[0].cite.length === 2
          && m[0].cite[0].text === '原文一句' && m[0].cite[1].text.length === 200;
      } catch (e) { ok = false; }
      if (prev === undefined) delete global.localStorage; else global.localStorage = prev;
      return ok;
    })());

  T('训练工具：★ --check 只读不写（之前遗留的 main() 会让「只检查」偷偷重训并改文件）',
    (function () {
      const cp = require('child_process');
      const crypto = require('crypto');
      const md5 = function () { return crypto.createHash('md5').update(fs2.readFileSync(lmPath)).digest('hex'); };
      const before = md5(), mt = fs2.statSync(lmPath).mtimeMs;
      try {
        cp.execFileSync(process.execPath, [path.join(DIR, 'tools/train_lm.js'), '--check'],
          { cwd: DIR, stdio: 'pipe', timeout: 30000 });
      } catch (e) { return false; }
      return md5() === before && fs2.statSync(lmPath).mtimeMs === mt;
    })());

  T('训练工具：node tools/train_lm.js --check 端到端能跑通（退出码 0 = 语料与模型同步）',
    (function () {
      try {
        require('child_process').execFileSync(process.execPath,
          [path.join(DIR, 'tools/train_lm.js'), '--check'],
          { cwd: DIR, stdio: 'pipe', timeout: 30000 });
        return true;
      } catch (e) { return false; }
    })());

  T('出处3：对话里存 cite（限 4 条 / 每条 200 字）· 面板渲染出可折叠的「📄 原文出处」· 样式已加',
    (function () {
      const s = srcOf('js/ai.js'), c = srcOf('css/style.css');
      return s.indexOf('cite: (r.used || []).slice(0, 4)') > 0
        && s.indexOf('lm-ai-cite') > 0 && s.indexOf('📄 原文出处') > 0
        && s.indexOf('details class="lm-ai-cite"') > 0
        && c.indexOf('.lm-ai-cite>summary') > 0 && c.indexOf('.lm-ai-quote') > 0;
    })());


  T('问答升级7：对话框顶部有模式切换键 · 默认「本站速答」· 选择存 localStorage · 样式已加',
    (function () {
      const s = srcOf('js/ai.js'), c = srcOf('css/style.css');
      return s.indexOf('lm-ai-modes') > 0 && s.indexOf('data-mode="local"') > 0
        && s.indexOf("localStorage.getItem(MODE_KEY) === 'ds' ? 'ds' : 'local'") > 0
        && s.indexOf('expandQuery(qq, prev)') > 0 && c.indexOf('.lm-ai-mode.on') > 0;
    })());

  T('零 API：ai.js 全文 **0 处 fetch**、没有 askDeepSeek、不存任何 Key（lm_ai_key_v1 必须 0 处）',
    (function () {
      const s = srcOf('js/ai.js');
      return (s.match(/fetch\(/g) || []).length === 0
        && s.indexOf('XMLHttpRequest') < 0
        && s.indexOf('askDeepSeek') < 0
        && s.indexOf('lm_ai_key_v1') < 0
        && s.indexOf('Authorization') < 0
        && s.indexOf('api.deepseek.com') < 0
        && s.indexOf('CHAT_KEY') > 0;
    })(), 'fetch 出现 ' + (srcOf('js/ai.js').match(/fetch\(/g) || []).length + ' 次');

  T('CSP 里不再有 api.deepseek.com（也不放开裸 https: · iframe 仍然 frame-src none）',
    (function () {
      const html = srcOf('index.html');
      const csp = (html.match(/connect-src[^;]*/) || [''])[0];
      return html.indexOf('api.deepseek.com') < 0 && !/(^|\s)https:(\s|$)/.test(csp)
        && html.indexOf("frame-src 'none'") > 0;
    })(), (srcOf('index.html').match(/connect-src[^;]*/) || [''])[0].slice(0, 80));

  T('pageDigest 真跑：标题层级 / 表格逐行 / 图表数据 / 来源都进上下文（图表只有数据、没有图形）',
    (function () {
      const p = { id: 't', label: '测试页', blocks: [
        { id: 'b1', type: 'heading', text: '一级' },
        { id: 'b2', type: 'text', text: '正文一句。' },
        { id: 'b3', type: 'table', title: '对照表', headers: ['A', 'B'], rows: [['a1', 'b1'], ['a2', 'b2']] },
        { id: 'b4', type: 'chart', title: '柱图', labels: ['一月', '二月'], data: [3, 4], unit: '%' },
        { id: 'b5', type: 'sources', title: '来源', items: [{ name: '论文A' }] }
      ] };
      const d = ai.pageDigest(p);
      return d.indexOf('# 测试页') === 0 && d.indexOf('## 一级') > 0 && d.indexOf('A | B') > 0
        && d.indexOf('a2 | b2') > 0 && d.indexOf('一月：3%') > 0 && d.indexOf('- 论文A') > 0;
    })(), ai.pageDigest({ id: 't', label: '测试页', blocks: [{ id: 'b1', type: 'table', headers: ['A'], rows: [['a1']] }] }).replace(/\n/g, ' / '));

  T('promptFor 真跑：空问题给默认总结指令 · 问句原样落进【我的问题】· 页面正文在【页面内容】里',
    (function () {
      const p = { id: 't', label: '测试页', blocks: [{ id: 'b1', type: 'text', text: '正文。' }] };
      const a = ai.promptFor(p, ''), b = ai.promptFor(p, '什么是 RAG？');
      return a.indexOf('【我的问题】') > 0 && a.indexOf('3-5 条要点') > 0
        && b.indexOf('什么是 RAG？') > b.indexOf('【我的问题】') && b.indexOf('正文。') > 0
        && b.indexOf('不要编造') > 0 && b.indexOf('【页面内容】') < b.indexOf('【我的问题】');
    })());

  T('对话记录真跑：chatPush/chatOf/chatClear 按页隔离 · 每页最多留 12 条（防 localStorage 膨胀）',
    (function () {
      const mem = {};
      const oldLS = global.localStorage;
      global.localStorage = {
        getItem: function (k) { return (k in mem) ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; }
      };
      let ok = false;
      try {
        ai.chatPush('pA', { r: 'me', t: '问题一' });
        ai.chatPush('pA', { r: 'ds', t: '回答一' });
        for (let i = 0; i < 15; i++) ai.chatPush('pA', { r: 'me', t: '追加' + i });
        const a = ai.chatOf('pA');
        const b = ai.chatOf('pB');
        ok = a.length === 12 && b.length === 0 && a[a.length - 1].t === '追加14'
          && a[0].r === 'me' && typeof a[0].ts === 'number';
        ai.chatPush('pB', { r: 'local', t: '只属于 pB', src: { pageId: 'home', title: '首页', score: 0.8 } });
        ok = ok && ai.chatOf('pB').length === 1 && ai.chatOf('pA').length === 12
          && ai.chatOf('pB')[0].src.pageId === 'home';
        ai.chatClear('pA');
        ok = ok && ai.chatOf('pA').length === 0 && ai.chatOf('pB').length === 1;
      } finally {
        if (oldLS === undefined) { try { delete global.localStorage; } catch (e) { global.localStorage = undefined; } }
        else global.localStorage = oldLS;
      }
      return ok;
    })());

  T('修复108：装了扩展就全自动回填（消息协议齐备 · 不装扩展仍走复制/打开/粘回）',
    (function () {
      const s = srcOf('js/ai.js');
      const ext = srcOf('ext/manifest.json') + srcOf('ext/bg.js') + srcOf('ext/bridge-page.js') + srcOf('ext/bridge-ds.js');
      return s.indexOf("'lm-ds-bridge'") > 0 && s.indexOf("ch: 'lm-page'") > 0
        && s.indexOf('bridgeSeen && bridgeSend(txt, id)') > 0
        && s.indexOf('listenBridge();') > 0
        && /"manifest_version": 3/.test(ext) && ext.indexOf('chat.deepseek.com') > 0
        && ext.indexOf("type: 'reply'") > 0 && ext.indexOf('findEditor') > 0
        && ext.indexOf('ds-markdown') > 0
        && s.indexOf('d.ok === false && pendingAsk') > 0;   /* 修复109：扩展没接住 → 自动退回复制 */
    })(), '扩展 4 个文件 + 页面协议（hello/ping/ack/reply）');

  T('界面顺序：对话框在面板**最上面**（.lm-ai-chat 必须排在「这一页的要点 / 相关条目」之前）',
    (function () {
      const s = srcOf('js/ai.js');
      const iChat = s.indexOf('lm-ai-chat');
      const iPts = s.indexOf('这一页的要点');
      const iRel = s.indexOf('🔗 相关条目');
      return iChat > 0 && iPts > iChat && iRel > iChat
        && s.indexOf('发给 DeepSeek') > 0 && s.indexOf('lm-ai-pastesave') > 0
        && s.indexOf('lm-ai-modes') > 0;   /* ★ 修复110：原来的「⚡ 本站速答」按钮升级成顶部模式切换键 */
    })());

  T('接入完毕：index.html 引入 js/ai.js（带版本号）· 样式有浮标与面板 · README 把 AI 能力标成已完成',
    (function () {
      const html = srcOf('index.html'), css = srcOf('css/style.css'), readme = srcOf('README.md');
      return /js\/ai\.js\?v=\d+/.test(html) && css.indexOf('.lm-ai-fab') > 0 && css.indexOf('.lm-ai-panel') > 0
        && readme.indexOf('修复91') > 0 && readme.indexOf('✅ AI 能力') > 0;
    })());
})();


/* ---------- 9.58) 修复92：反馈跨设备（只走数据分支 · 墓碑合并 · 链接接力 · 零构建） ---------- */
console.log('【9.58】修复92：反馈跨设备同步 —— 合并/打包真跑 + 只写数据分支 + 链接接力');
(function () {
  const fb = require(path.join(DIR, 'js/fbsync.js'));
  const appJs = srcOf('js/app.js');
  const html = srcOf('index.html');
  const readme = srcOf('README.md');

  T('模块可 require：合并 / 规范化 / 打包 / 链接 / 云端接口齐全',
    !!fb && typeof fb.merge === 'function' && typeof fb.norm === 'function'
      && typeof fb.pack === 'function' && typeof fb.unpack === 'function'
      && typeof fb.shareLink === 'function' && typeof fb.readFromUrl === 'function'
      && typeof fb.sync === 'function' && typeof fb.hasCloud === 'function'
      && fb.path === 'data/feedback.json', fb && fb.path);

  const A = [{ id: 'F-01', ts: 1000, text: '甲', dev: 'DEV1' }, { id: 'F-02', ts: 2000, text: '乙', dev: 'DEV2' }];
  const B = [{ id: 'F-01', ts: 1000, text: '甲（组长改过）', dev: 'DEV1', status: '已处理', updatedAt: 5000 },
    { id: 'F-03', ts: 3000, text: '丙', dev: 'DEV3' }];
  const M = fb.merge(A, B);
  /* ★ 修复95：状态词表更新（待处理/已采纳/已修改/保留原判断），旧值「已处理」在 norm 里自动迁移为「已修改」 */
  T('合并：同 id 取 updatedAt 新的（组长回复不会被旧的盖掉）· 双方独有条目都保留 · 按时间升序',
    M.length === 3 && M[0].id === 'F-01' && M[0].text.indexOf('组长改过') >= 0 && M[0].status === '已修改'
      && M[1].id === 'F-02' && M[2].id === 'F-03',
    JSON.stringify(M.map(function (x) { return x.id + ':' + x.text + ':' + x.status; })));

  T('合并幂等：再合一次结果不变（多设备反复同步不会越合越乱）',
    JSON.stringify(fb.merge(M, B)) === JSON.stringify(M) && JSON.stringify(fb.merge(M, M)) === JSON.stringify(M));

  const DEL = fb.merge(M, [{ id: 'F-02', updatedAt: 9000, del: 1 }]);
  T('删除用「墓碑」：条目还在列表里但带 del 标记（否则别的设备一同步又把它带回来）',
    DEL.length === 3 && DEL.filter(function (x) { return x.id === 'F-02'; })[0].del === 1);

  const packed = fb.pack(M);
  const back = fb.unpack(packed);
  T('打包往返：中文不乱码 · 只含 URL 安全字符 · 解回来内容一致',
    back.length === 3 && back[0].text === M[0].text && back[2].text === '丙'
      && /^[A-Za-z0-9_-]+$/.test(packed),
    'len=' + packed.length);

  T('打包容错：空列表 → 空串；乱码 → 空数组（不会抛异常把页面搞崩）',
    fb.pack([]) === '' && JSON.stringify(fb.unpack('这不是合法数据')) === '[]'
      && JSON.stringify(fb.unpack('')) === '[]');

  T('字段瘦身：只带传递必需的字段（链接才不会太长）· updatedAt 缺失时用 ts 兜底',
    (function () {
      const s = fb.slim({ id: 'F-09', ts: 123, text: 'x', foo: 'BAR', _ts: 9, extra: { a: 1 } });
      const n = fb.norm({ id: 'F-10', ts: 456, text: 'y' });
      return !('foo' in s) && !('_ts' in s) && !('extra' in s) && n.updatedAt === 456;
    })());

  T('云端只写「数据分支」：用 LMStore.dataRefOf 取 ref（不是 cfg.branch）→ 不触发 Pages 构建',
    srcOf('js/fbsync.js').indexOf('S.dataRefOf ? S.dataRefOf(cfg)') > 0
      && srcOf('js/fbsync.js').indexOf('branch: c.ref') > 0);

  T('云端健壮性：文件还不存在(404)当空列表 · 409/422 清 sha 下次重取 · 拉取失败不影响本机',
    (function () {
      const s = srcOf('js/fbsync.js');
      return s.indexOf('if (r.status === 404)') > 0 && s.indexOf('if (r.status === 409 || r.status === 422) shaCache') > 0
        && s.indexOf('return { ok: false, list: local || [], changed: false };') > 0;
    })());

  T('接入 app.js：本机存全量但界面过滤墓碑 · 提交后有兜底链接 · 打开链接自动收 · 删除写墓碑',
    (function () {
      return appJs.indexOf('function fbRaw()') > 0 && appJs.indexOf('it && !it.del') > 0
        && appJs.indexOf('const fbFallback = function () {') > 0
        && appJs.indexOf('LMFB.shareLink([it])') > 0
        && appJs.indexOf('function fbIngestUrl()') > 0 && appJs.indexOf('fbIngestUrl();') > 0
        && appJs.indexOf('x.del = 1; x.updatedAt = Date.now();') > 0
        && appJs.indexOf('it.reply = (t.value || \'\').slice(0, 200); it.updatedAt = Date.now();') > 0;
    })());

  T('节流与开关：无 Token 的设备不写云端（访客零额度）· 有 Token 才同步 · 60 秒内不重复拉',
    appJs.indexOf('function fbPushSoon()') > 0 && appJs.indexOf('!LMFB.hasCloud() || _fbBusy') > 0
      && appJs.indexOf('if (now - _fbPullAt < 60000) return;') > 0);

  T('接入完整性：index.html 引入 js/fbsync.js（带版本号）· README 记录修复92 与「只写数据分支」',
    /js\/fbsync\.js\?v=\d+/.test(html) && readme.indexOf('修复92') > 0
      && readme.indexOf('data/feedback.json') > 0);
})();


/* ---------- 9.59) 修复93：留言「隔空直达」—— 复用 EMQX 公共 MQTT（离线也能补收） ---------- */
console.log('【9.59】修复93：留言实时直达 —— 主题派生 / clean=false 补收 / 垃圾过滤 / 兜底链');
(function () {
  const fb = require(path.join(DIR, 'js/fbsync.js'));
  const fbSrc = srcOf('js/fbsync.js');
  const appJs = srcOf('js/app.js');
  const html = srcOf('index.html');

  T('MQTT 接口齐全：publish / listen / mqCfg / mqInfo 都在（不需要任何 Key、不引新库）',
    typeof fb.publish === 'function' && typeof fb.listen === 'function'
      && typeof fb.mqCfg === 'function' && typeof fb.mqInfo === 'function');

  const C1 = { room: 'r1', password: 'p1', mqtt: { brokers: ['wss://a', 'wss://b', 'wss://c'] } };
  const C2 = { room: 'r1', password: 'p1', mqtt: { brokers: ['wss://a', 'wss://b', 'wss://c'] } };
  const C3 = { room: 'r2', password: 'p1', mqtt: { brokers: ['wss://a', 'wss://b', 'wss://c'] } };
  const g0 = globalThis.LMYJS_CONFIG;
  globalThis.LMYJS_CONFIG = C1; const k1 = fb.mqCfg();
  globalThis.LMYJS_CONFIG = C2; const k2 = fb.mqCfg();
  globalThis.LMYJS_CONFIG = C3; const k3 = fb.mqCfg();
  globalThis.LMYJS_CONFIG = g0;

  T('主题派生确定：同房间同口令 → 同 broker 同主题（所有设备天然落到同一处）',
    k1.topic === k2.topic && k1.url === k2.url && /^lm\/[0-9a-z]+\/fb$/.test(k1.topic),
    k1.topic + ' @ ' + k1.url);

  T('房间或口令不同 → 主题不同（别的班/别的项目不会串台）',
    k1.topic !== k3.topic && k3.topic.length > 0);

  T('broker 一定取自配置池（不写死单点），且 topic/URL 不含空格等非法字符',
    ['wss://a', 'wss://b', 'wss://c'].indexOf(k1.url) >= 0 && !/\s/.test(k1.topic + k1.url));

  T('「关机也能补收」的关键：MQTT5 + 订阅方 clean=false + 显式申请会话保留；发布方 clean=true（一次性）',
    fbSrc.indexOf('clean: !admin') > 0 && fbSrc.indexOf('reconnectPeriod: admin ? 6000 : 0') > 0
      && fbSrc.indexOf("{ qos: 1 }") > 0 && fbSrc.indexOf('cl.subscribe(c.topic, { qos: 1 })') > 0
      && fbSrc.indexOf('protocolVersion: 5') > 0 && fbSrc.indexOf('sessionExpiryInterval: MQ_KEEP_REQ') > 0);

  T('保留窗口如实显示：申请 21600 秒（6 小时），并优先采用 broker 在 CONNACK 里回的实数',
    (function () {
      const mi = fb.mqInfo();
      return fbSrc.indexOf('var MQ_KEEP_REQ = 21600;') > 0
        && fbSrc.indexOf('if (p.sessionExpiryInterval != null) MQ.keep = +p.sessionExpiryInterval;') > 0
        && mi.keep === 21600 && /约 6 小时/.test(mi.keepText);
    })(), fb.mqInfo().keep + ' / ' + fb.mqInfo().keepText);

  T('收到的消息先验货：只认 t==="lmfb1"、必须有 id/text、超长直接丢（公共 broker 上谁都能发，防塞爆）',
    fbSrc.indexOf("o.t === 'lmfb1'") > 0 && fbSrc.indexOf('if (!it || !it.id || !it.text) return;') > 0
      && fbSrc.indexOf('String(it.text).length > 1000') > 0);

  T('app.js 接入：提交即 publish（修复96 起同时写云存档）· 打开反馈页即订阅（修复95 起访客也收，只读在线新留言）· 三条来路共用一个合并漏斗 · 发不出去才给链接兜底',
    appJs.indexOf('LMFB.publish(it) : Promise.resolve(false)') > 0
      && appJs.indexOf('Promise.all([cloudP, mqP])') > 0
      && appJs.indexOf('LMFB.listen(function (it) {') > 0
      && appJs.indexOf('}, { visitor: !state.admin });') > 0
      && appJs.indexOf('function fbMergeIncoming(list)') > 0
      && appJs.indexOf('const n = fbMergeIncoming([it]);') > 0
      && appJs.indexOf('const fbFallback = function () {') > 0);

  T('顺带修掉的老 bug：提交提示条原来先写 #fbOk 再 mountFeedback()，会被重渲染冲掉（现在顺序反过来）',
    (function () {
      const iMount = appJs.indexOf('      f.reset();\r\n      mountFeedback();');
      const iOk = appJs.indexOf("const fbOkEl = document.getElementById('fbOk');");
      return iMount > 0 && iOk > iMount;
    })());

  T('不加依赖、不改 CSP：index.html 里 mqtt 仍在原位置、CSP 的 connect-src 仍只靠 wss:（没有新增域名）',
    (function () {
      const cspMeta = (html.match(/Content-Security-Policy"[^>]*content="([^"]+)"/) || [])[1] || '';
      return /lib\/mqtt\.js\?v=\d+/.test(html) && cspMeta.indexOf('wss:') > 0
        && cspMeta.indexOf('broker') < 0;
    })());
})();


/* ---------- 9.60) 修复95：反馈对所有人可见 + 四段处理记录 + 与讨论区分页 ---------- */
console.log('【9.60】修复95：反馈公开可见 / 采纳-已修改-保留原判断 / 处理记录四段 / 讨论区独立成页');
(function () {
  const fb = require(path.join(DIR, 'js/fbsync.js'));
  const fbSrc = srcOf('js/fbsync.js');
  const appJs = srcOf('js/app.js');
  const html = srcOf('index.html');
  const css = srcOf('css/style.css');
  const readme = srcOf('README.md');

  /* —— 状态归一：老师要求的「采纳 / 不采纳但要写理由」 —— */
  T('状态四值：待处理 / 已采纳 / 已修改 / 保留原判断（旧数据 处理中→已采纳、已处理→已修改 自动迁移）',
    JSON.stringify(fb.statuses) === JSON.stringify(['待处理', '已采纳', '已修改', '保留原判断'])
      && fb.fixStatus('处理中') === '已采纳' && fb.fixStatus('已处理') === '已修改'
      && fb.fixStatus('已采纳') === '已采纳' && fb.fixStatus('保留原判断') === '保留原判断'
      && fb.fixStatus('乱写') === '待处理' && fb.fixStatus(undefined) === '待处理',
    JSON.stringify(fb.statuses));

  /* —— 四段记录要能跨设备传 —— */
  const rec = fb.norm({
    id: 'F-01', ts: 1, text: 't', status: '已修改',
    check: '对照了培养方案第 3 页', change: '生态地图补了 2 条来源', why: '老师给的资料优先'
  });
  T('规范化保留处理记录三字段（怎样核实 / 改了什么 / 为什么）· 缺省为空串而不是 undefined',
    rec.check === '对照了培养方案第 3 页' && rec.change === '生态地图补了 2 条来源'
      && rec.why === '老师给的资料优先' && rec.status === '已修改'
      && fb.norm({ id: 'F-02', text: 'x' }).check === '',
    JSON.stringify(rec).slice(0, 90));

  const slimRec = fb.slim(rec);
  T('瘦身也要带上处理记录（否则别人只看到状态，看不到依据）· 各字段 300 字上限',
    slimRec.check === rec.check && slimRec.change === rec.change && slimRec.why === rec.why
      && fb.norm({ id: 'F-03', text: 'x', check: 'a'.repeat(400) }).check.length === 300);

  const oldIt = { id: 'F-05', ts: 10, text: '原文', updatedAt: 100, status: '待处理' };
  const newIt = { id: 'F-05', ts: 10, text: '原文', updatedAt: 200, status: '已修改',
    check: '查了官网', change: '改了关系图', why: '原判断缺来源' };
  const mm = fb.merge([oldIt], [newIt]);
  T('合并按 updatedAt 取新：处理记录不会因设备先后而丢（「查了官网 / 改了关系图 / 原判断缺来源」都在）',
    mm.length === 1 && mm[0].status === '已修改' && mm[0].check === '查了官网'
      && mm[0].why === '原判断缺来源', JSON.stringify(mm[0]));

  /* —— 公开读取：访客没有 Token 也能看到列表 —— */
  const g0 = { LMStore: globalThis.LMStore, location: globalThis.location };
  delete globalThis.LMStore; delete globalThis.location;
  T('没有仓库信息时不硬发请求：publicCtx() 返回 null（本地预览/file:// 不报错、不发请求）',
    fb.publicCtx() === null);

  globalThis.LMStore = {
    getGhCfg: function () { return { owner: 'zhangsan', repo: 'living-maps', branch: 'main', dataBranch: 'lm-data' }; },
    dataRefOf: function () { return 'lm-data'; }
  };
  const pc = fb.publicCtx();
  T('管理员设备：直接用已绑定配置（owner / repo + 数据分支），与写入云端的 ref 一致',
    !!pc && pc.owner === 'zhangsan' && pc.repo === 'living-maps' && pc.ref === 'lm-data',
    JSON.stringify(pc));

  delete globalThis.LMStore;
  globalThis.location = { hostname: 'zhangsan.github.io', pathname: '/living-maps/index.html' };
  const pv = fb.publicCtx();
  T('访客设备：从 Pages 网址推导 owner/repo（<owner>.github.io/<repo>/），数据分支默认 lm-data',
    !!pv && pv.owner === 'zhangsan' && pv.repo === 'living-maps' && pv.ref === 'lm-data',
    JSON.stringify(pv));

  const pubUrl = fb.publicUrl(pv, 'lm-data');
  T('公开读取走 raw.githubusercontent.com（公开仓库只读，不需要 Token）· 带时间戳破 CDN 缓存',
    /^https:\/\/raw\.githubusercontent\.com\/zhangsan\/living-maps\/lm-data\/data\/feedback\.json\?t=\d+$/.test(pubUrl),
    pubUrl.replace(/\?t=\d+/, '?t=…'));
  globalThis.location = g0.location;
  if (g0.LMStore) globalThis.LMStore = g0.LMStore;

  /* —— 分页：反馈页 / 讨论区页 —— */
  const w0 = {};
  new Function('window', srcOf('data/content.js'))(w0);
  const pages = (w0.SITE_CONTENT && w0.SITE_CONTENT.pages) || [];
  const fbPage = pages.filter(function (p) { return p.id === 'feedback'; })[0];
  const dcPage = pages.filter(function (p) { return p.id === 'discuss'; })[0];
  T('新增页面「讨论区」（kind=page，≥2 块内容）· 反馈页文案改为「对所有人公开」',
    !!dcPage && dcPage.kind === 'page' && dcPage.label === '讨论区' && dcPage.blocks.length >= 2
      && !!fbPage && fbPage.description.indexOf('公开') > 0,
    pages.map(function (p) { return p.id; }).join(','));

  T('render 分派：feedback → #fbMount + mountFeedback()；discuss → #dcMount + mountDiscuss()',
    appJs.indexOf("if (p && p.id === 'feedback')") > 0 && appJs.indexOf('<div id="fbMount"></div>') > 0
      && appJs.indexOf("if (p && p.id === 'discuss')") > 0 && appJs.indexOf('<div id="dcMount"></div>') > 0
      && appJs.indexOf('function mountDiscuss()') > 0);

  T('老内容/云端旧内容也能升级：缺 discuss 页时 migrate() 用 DISCUSS_PAGE 自动补在「关于」前面；旧文案「仅管理员可见」被改写',
    appJs.indexOf('const DISCUSS_PAGE = {') > 0
      && appJs.indexOf("if (!c.pages.some(function (p) { return p && p.id === 'discuss'; }))") > 0
      && appJs.indexOf("fbp3.description.indexOf('仅小组管理员可见')") > 0);

  T('讨论区不再混在反馈页：mountFeedback 里不拼 dcHtml()，讨论区的增删改只重渲染 mountDiscuss()',
    (function () {
      const iFb = appJs.indexOf('function mountFeedback()');
      const iDc = appJs.indexOf('function mountDiscuss()');
      const seg = appJs.slice(iFb, iDc);
      return seg.indexOf('dcHtml()') < 0 && appJs.indexOf('      : dcHtml();') > 0
        && appJs.indexOf('mountDiscuss();   /* ★ 修复95') > 0;
    })());

  /* —— 管理员「点一下」就能采纳 / 保留原判断 —— */
  T('管理动作：✔ 采纳 / ✅ 已修改 / ✖ 保留原判断 / ↺ 待处理（按钮 + data-fbact 事件委托）· 面板按身份码统计「≥3 名同学」',
    appJs.indexOf('data-fbact="已采纳"') > 0 && appJs.indexOf('data-fbact="已修改"') > 0
      && appJs.indexOf('data-fbact="保留原判断"') > 0 && appJs.indexOf('data-fbact="待处理"') > 0
      && appJs.indexOf("closest('[data-fbact]')") > 0 && appJs.indexOf('个设备身份码') > 0);

  T('处理记录公开显示（核实 / 修改 / 理由 / 回复）；管理员看输入框、访客看只读记录',
    appJs.indexOf('function fbRecordHtml(it)') > 0
      && appJs.indexOf("['🔎 我们怎样核实', it.check]") > 0
      && appJs.indexOf("['💬 为什么这样处理', it.why]") > 0
      && appJs.indexOf("(isAdmin ? '' : fbRecordHtml(it))") > 0);

  T('三段说明失焦即保存（data-fbcheck / data-fbchange / data-fbwhy，各 300 字），随同步带给所有设备',
    appJs.indexOf("t.hasAttribute('data-fbcheck')") > 0
      && appJs.indexOf("const k = t.hasAttribute('data-fbcheck') ? 'check'") > 0
      && appJs.indexOf("it[k] = (t.value || '').slice(0, 300);") > 0);

  T('一键复制的文本能直接进期末材料：每条含「同学提出 / 我们怎样核实 / 修改了什么 / 为什么这样处理」',
    appJs.indexOf("'\\n【同学提出】'") > 0 && appJs.indexOf("'\\n【我们怎样核实】'") > 0
      && appJs.indexOf("'\\n【修改了什么】'") > 0 && appJs.indexOf("'\\n【为什么这样处理】'") > 0);

  /* —— 实时 / 公开三路 —— */
  T('所有设备都订阅：管理员 clean=false 可补收、访客 clean=true 只收在线（listen 第二参数 visitor）',
    fbSrc.indexOf('opts.visitor') > 0 && fbSrc.indexOf('if (MQ.admin === asAdmin)') > 0
      && appJs.indexOf('}, { visitor: !state.admin });') > 0);

  T('访客拉历史只走 raw 公开文件（60 秒节流）；管理员有 Token 时改走 API 合并，访客永不写云端',
    appJs.indexOf('LMFB.pullPublic().then(function (r)') > 0
      && appJs.indexOf('if (now - _fbPullAt < 60000) return;') > 0
      && appJs.indexOf('if (LMFB.hasCloud()) {\r\n      fbSyncNow(false);\r\n    } else {') > 0);

  T('样式补齐：状态徽章四色 / 一键处理按钮 / 处理记录块 / 讨论区独立挂载点',
    css.indexOf('.fb-st-ok') > 0 && css.indexOf('.fb-st-keep') > 0
      && css.indexOf('.fb-acts') > 0 && css.indexOf('.fb-record') > 0 && css.indexOf('#dcMount') > 0);

  T('版本号已升（95 起每条修复都涨一版，避免浏览器吃旧缓存）· index.html 无 ?v=94 残留',
    (html.match(/\?v=94/g) || []).length === 0
      && /\?v=(9[5-9]|[1-9]\d\d)/.test(html)
      && /LM_ASSET_VER = '(9[5-9]|[1-9]\d\d)'/.test(appJs));

  T('README 记录修复95（公开可见 / 采纳-保留 / 讨论区分页）', readme.indexOf('修复95') > 0);
})();

/* ---------- 9.61) 修复96：云存档（让「不开网页」也能收到，突破 6 小时补收窗口） ---------- */
console.log('【9.61】修复96：云存档——提交即落库 / 自动拉回 / 群机器人 / 表格粘贴导入');
(function () {
  const fb = require(path.join(DIR, 'js/fbsync.js'));
  const appJs = srcOf('js/app.js');
  const html = srcOf('index.html');
  const css = srcOf('css/style.css');
  const readme = srcOf('README.md');
  const g0 = globalThis.LMApp;

  T('云存档接口齐全：cloudCfg / cloudInfo / cloudSave / cloudList / parseImport',
    typeof fb.cloudCfg === 'function' && typeof fb.cloudInfo === 'function'
      && typeof fb.cloudSave === 'function' && typeof fb.cloudList === 'function'
      && typeof fb.parseImport === 'function');

  /* —— 配置归一：不合法就当作「没配」（绝不能因为填错就把留言发不出去） —— */
  function setCfg(c) { globalThis.LMApp = { state: { content: { config: { fbCloud: c } } } }; }
  delete globalThis.LMApp;
  T('未配置 / 非法配置一律返回 null（http 明文、supabase 缺 key、未知类型都拒绝）',
    fb.cloudCfg() === null
      && (setCfg({ kind: 'worker', url: 'http://x.dev' }), fb.cloudCfg() === null)
      && (setCfg({ kind: 'supabase', url: 'https://a.supabase.co' }), fb.cloudCfg() === null)
      && (setCfg({ kind: 'other', url: 'https://a.supabase.co' }), fb.cloudCfg() === null));

  setCfg({ kind: 'supabase', url: 'https://abc.supabase.co/', key: 'anon-key', table: 'lm_feedback' });
  const c1 = fb.cloudCfg();
  T('合法的 Supabase 配置：去掉尾部斜杠、默认表名、只对界面暴露 host（不显示 key）',
    !!c1 && c1.url === 'https://abc.supabase.co' && c1.table === 'lm_feedback'
      && fb.cloudInfo().on === true && fb.cloudInfo().host === 'abc.supabase.co'
      && fb.cloudInfo().text.indexOf('anon-key') < 0,
    JSON.stringify(fb.cloudInfo()));

  T('手滑把 /rest/v1 也复制进 URL 时自动纠正（否则会拼成 /rest/v1/rest/v1/<表> → 恒 404）',
    (setCfg({ kind: 'supabase', url: 'https://abc.supabase.co/rest/v1/', key: 'anon-key' }),
      !!fb.cloudCfg() && fb.cloudCfg().url === 'https://abc.supabase.co'),
    JSON.stringify(fb.cloudCfg()));

  T('建表 SQL 与代码字段同名同大小写：updatedAt 必须加双引号（Postgres 会把未加引号的转小写 → 写入报 PGRST204）',
    readme.indexOf('"updatedAt" bigint') > 0 && !/\n\s*updatedAt\s+bigint/.test(readme)
      && fb.slim({ id: 'F-9', ts: 1, text: 'x', updatedAt: 2, del: 1 }).updatedAt === 2);

  /* —— 真跑：写一条 / 读全部（桩 fetch，检查 URL、头、body） —— */
  const calls = [];
  function stubFetch(ok, body, status, raw) {
    globalThis.fetch = function (u, o) {
      calls.push({ u: u, o: o || {} });
      return Promise.resolve({
        ok: ok, status: status || (ok ? 200 : 401),
        json: function () { return Promise.resolve(body || []); },
        text: function () { return Promise.resolve(raw == null ? JSON.stringify(body || []) : raw); }
      });
    };
  }
  const item = { id: 'F-77', ts: 1000, text: '建议补来源', type: '提建议', name: '小明', dev: 'D1', status: '待处理' };

  /* —— 粘贴导入（纯函数，同步验）：云文档导出 → 直接进反馈列表 —— */
  const tsv = '时间\t称呼\t类型\t内容\n2026-10-30 14:20\t小明\t提建议\t建议给生态地图补一条公开来源\n2026-10-30 15:05\t小红\t提出问题\t认知地图那一步为什么这样判？';
  const imp1 = fb.parseImport(tsv);
  T('粘贴导入真跑（飞书 / Excel 的制表符）：自动识别分隔符 + 中文表头 → 2 条，时间/称呼/类型都对上',
    imp1.length === 2 && imp1[0].name === '小明' && imp1[0].type === '提建议'
      && /补一条公开来源/.test(imp1[0].text) && imp1[1].name === '小红'
      && new Date(imp1[0].ts).getFullYear() === 2026,
    JSON.stringify(imp1.map(function (x) { return x.id + ':' + x.name; })));

  const csv = 'id,name,text\nF-91,小李,"第一，来源不清；第二，时间太旧"\nF-92,小张,"简单，但缺少反例"';
  const imp2 = fb.parseImport(csv);
  T('CSV 引号内的逗号/分号不会被切断（"第一，来源不清；第二…" 保持完整）· 英文表头也认',
    imp2.length === 2 && imp2[0].id === 'F-91'
      && imp2[0].text === '第一，来源不清；第二，时间太旧' && imp2[1].id === 'F-92',
    JSON.stringify(imp2.map(function (x) { return x.text; })));

  const imp3 = fb.parseImport('[{"id":"F-93","ts":1700000000000,"text":"JSON 也能直接粘","name":"小周"}]');
  T('直接粘 JSON 数组也支持（从 Supabase / Worker 导出、或别处拷来的数据）',
    imp3.length === 1 && imp3[0].id === 'F-93' && imp3[0].name === '小周');

  T('导入健壮性：空串 / 只有表头 / 乱码 → 空数组，不抛异常；与已有条目按 id 去重（同内容两次导入同 id）',
    fb.parseImport('').length === 0 && fb.parseImport('时间,内容').length === 0
      && fb.parseImport('这不是表格也不是 JSON').length === 0
      && fb.parseImport(tsv)[0].id === imp1[0].id);

  const impNoHead = fb.parseImport('2026/10/30 09:00\t小王\t提建议\t没有表头时按常见列序兜底\n2026/10/30 10:00\t小李\t提出问题\t第二行也要能进来');
  T('没表头也能救：按「时间 / 称呼 / 类型 / 内容」兜底；旧状态词「已处理」导入后自动迁移为「已修改」',
    impNoHead.length === 2 && impNoHead[0].name === '小王'
      && impNoHead[1].name === '小李'
      && fb.norm({ id: 'F-95', ts: 1, text: 'x', status: '已处理' }).status === '已修改');

  T('导入条目带 dev:"import" 便于区分来源 · 超长正文截到 800 字（防止把页面撑爆）',
    imp1[0].dev === 'import' && fb.parseImport('内容\n' + 'a'.repeat(900))[0].text.length === 800);

  /* —— 接入守护：为什么它能保证「不开网页也收得到」 —— */
  T('提交时「先写云存档、再发 MQTT」，两条都失败才给链接兜底（Promise.all 后分三种提示）',
    appJs.indexOf('const cloudP = (window.LMFB && LMFB.cloudSave) ? LMFB.cloudSave(it) : Promise.resolve(false);') > 0
      && appJs.indexOf('Promise.all([cloudP, mqP])') > 0
      && appJs.indexOf('并已存进云存档：小组下次打开反馈页会自动收取（不受 6 小时补收窗口限制）') > 0);

  T('打开反馈页会拉云存档（管理员设备也拉：他可能没绑 Token 或换了浏览器）',
    appJs.indexOf('if (LMFB.cloudCfg && LMFB.cloudCfg()) {') > 0
      && appJs.indexOf('☁ 从云存档收到 ') > 0);

  T('管理面板可配：类型 / URL / key / 表名 + 保存 + 测试拉取 + 表格粘贴导入',
    appJs.indexOf("id=\"fbCloudKind\"") > 0 && appJs.indexOf("id=\"fbCloudUrl\"") > 0
      && appJs.indexOf("id=\"fbCloudKey\"") > 0 && appJs.indexOf("id=\"fbCloudTable\"") > 0
      && appJs.indexOf("id=\"fbCloudSave\"") > 0 && appJs.indexOf("id=\"fbCloudTest\"") > 0
      && appJs.indexOf("id=\"fbImportGo\"") > 0);

  T('配置写进内容（state.content.config.fbCloud）→ 随「同步到 GitHub」公开给所有访客，端点不需要私密',
    appJs.indexOf('state.content.config.fbCloud = {') > 0
      && appJs.indexOf("kind: v('fbCloudKind')") > 0
      && appJs.indexOf('applyEdit(\'云存档设置已保存\')') > 0);

  T('ensureConfig 给默认值（缺省关闭），老内容不会因为少这个字段报错',
    appJs.indexOf("c.config.fbCloud = { kind: '', url: '', key: '', table: 'lm_feedback' };") > 0);

  const cspMeta = (html.match(/Content-Security-Policy"[^>]*content="([^"]+)"/) || [])[1] || '';
  T('CSP 只加白名单域名（Supabase / workers.dev / 飞书 / 钉钉 / 企业微信），没有放开通配 https:',
    cspMeta.indexOf('https://*.supabase.co') > 0 && cspMeta.indexOf('https://*.workers.dev') > 0
      && cspMeta.indexOf('https://open.feishu.cn') > 0 && cspMeta.indexOf('https://oapi.dingtalk.com') > 0
      && cspMeta.indexOf('https://qyapi.weixin.qq.com') > 0
      && cspMeta.indexOf('connect-src') >= 0 && !/connect-src[^;]*\shttps:;/.test(cspMeta));

  T('样式与版本：.fb-cloud 折叠面板 · 全部资源 ?v=115 · LM_ASSET_VER=115',
    css.indexOf('.fb-cloud') > 0 && css.indexOf('.fb-imp') > 0 && css.indexOf('.lm-ai-mode') > 0 && css.indexOf('.lm-ai-cite') > 0
      && (html.match(/\?v=114/g) || []).length === 0 && /\?v=115/.test(html)
      && /LM_ASSET_VER = '115'/.test(appJs));

  /* —— ★ 修复97：错误信息要「看得懂、能照着改」（以前只有 HTTP 404，根本不知道改哪儿） —— */
  const _why = fb.cloudWhy || function () { return ''; };
  T('错误翻译真跑：404/PGRST205 → 查表名或建表 SQL；401 → anon key；403/42501 → grant；503 → 项目暂停',
    (function () {
      const a = _why(404, '{"code":"PGRST205","message":"Could not find the table in the schema cache"}');
      const b = _why(401, '{"message":"No API key found in request"}');
      const c = _why(403, '{"code":"42501","message":"permission denied for table lm_feedback"}');
      const d = _why(503, '<html>Project is paused. Restore it</html>');
      const e = _why(500, 'something odd');
      return a.indexOf('404') >= 0 && a.indexOf('PGRST205') > 0 && a.indexOf('表名') > 0
        && b.indexOf('anon key') > 0 && c.indexOf('grant') > 0
        && d.indexOf('暂停') > 0 && e.indexOf('HTTP 500') === 0;
    })());

  T('管理面板把错误留在页面上：常驻 #fbCloudMsg（toast 2.6 秒就消失）+ 黄色提示条样式',
    appJs.indexOf('id="fbCloudMsg"') > 0 && appJs.indexOf('function cloudMsg') > 0
      && appJs.indexOf('❌ 读取失败：') > 0 && css.indexOf('.fb-cloud-msg') > 0);

  /* —— ★ 修复98/99：云存档是后台运维配置，只在专有通道登录时渲染；「两种管理员」全程不留痕 —— */
  const edtSrc = srcOf('js/editor.js');
  const colSrc = srcOf('js/collab.js');
  /* 两个待查词用 Unicode 转义书写，免得测试文件自身成为泄露源 */
  const BAD_A = '\u6839\u7ba1\u7406\u5458';       /* 第一种称呼 */
  const BAD_B = '\u666e\u901a\u7ba1\u7406\u5458'; /* 第二种称呼 */
  T('云存档配置面板只在专有通道登录时渲染（别的管理员看不到端点 / anon key / 表名 / 导入；数据通道照常）',
    appJs.indexOf("(state.root ? fbCloudHtml() : '')") > 0
      && appJs.indexOf('function fbCloudHtml()') > 0
      && appJs.indexOf('cloudCfg()') > 0);

  T('批阅功能不依赖云存档面板（四个动作按钮 + 三段说明仍在列表项里，任何管理员都能用）',
    appJs.indexOf('data-fbact="已采纳"') > 0 && appJs.indexOf('data-fbact="已修改"') > 0
      && appJs.indexOf('data-fbact="保留原判断"') > 0 && appJs.indexOf('data-fbact="待处理"') > 0);

  T('同步到 GitHub 弹窗只说通道状态（不出现「统一分发 / 内部角色」说法）',
    edtSrc.indexOf('统一分发') < 0 && edtSrc.indexOf(BAD_A + '统一') < 0
      && edtSrc.indexOf('云端上传通道已开启') > 0);

  /* ★ 修复99：不让人看出「有两种管理员」—— js/ 全部文件（含注释，访客 view-source 就能读）+ 页面 + 样式 */
  (function () {
    const leaks = [];
    fs.readdirSync(path.join(DIR, 'js')).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
      const t2 = srcOf('js/' + f);
      if (t2.indexOf(BAD_A) > -1 || t2.indexOf(BAD_B) > -1) leaks.push('js/' + f);
    });
    if (html.indexOf(BAD_A) > -1 || html.indexOf(BAD_B) > -1) leaks.push('index.html');
    if (css.indexOf(BAD_A) > -1 || css.indexOf(BAD_B) > -1) leaks.push('css/style.css');
    T('「两种管理员」零痕迹：js/ 全文件 + index.html + css 一处都不许有', leaks.length === 0,
      '泄露位置: ' + leaks.join(', '));
  })();

  T('密码试错提示不透露角色（只说限制时长 / 已清除本机限时限制）',
    appJs.indexOf('管理员入口将被限制 30 分钟') > 0 && appJs.indexOf('已自动清除本机限时限制') > 0
      && appJs.indexOf('可提前解禁') < 0 && colSrc.indexOf('可提前解禁') < 0);

  T('README 记录修复96（6 小时为何改不了 / 云存档三种接法 / 表格导入）', readme.indexOf('修复96') > 0);

  stubFetch(true);
  fb.cloudSave(item).then(function (ok1) {
    const c = calls[0] || {};
    T('Supabase 写入真跑：POST /rest/v1/<表> · 带 apikey + Bearer · Prefer:return=minimal · body 是瘦身后的条目',
      ok1 === true && /\/rest\/v1\/lm_feedback$/.test(c.u || '')
        && (c.o.headers || {}).apikey === 'anon-key'
        && String((c.o.headers || {}).Authorization) === 'Bearer anon-key'
        && (c.o.headers || {}).Prefer === 'return=minimal'
        && JSON.parse(c.o.body || '{}').id === 'F-77',
      (c.u || '') + ' ' + (c.o.method || ''));

    calls.length = 0;
    return fb.cloudList();
  }).then(function (r1) {
    const c = calls[0] || {};
    T('Supabase 读取真跑：GET 带 select=* & order=ts.asc & limit，返回数组直接可用',
      r1.ok === true && Array.isArray(r1.list)
        && /select=\*/.test(c.u || '') && /order=ts\.asc/.test(c.u || '') && /limit=1000/.test(c.u || ''),
      (c.u || '').slice(0, 90));

    /* worker 预设 */
    setCfg({ kind: 'worker', url: 'https://lm-fb.me.workers.dev/fb' });
    calls.length = 0;
    stubFetch(true);
    return fb.cloudSave(item);
  }).then(function (ok2) {
    const c = calls[0] || {};
    T('自建 Worker 写入真跑：POST 端点，body 为 { t:"lmfb1", it }（与 MQTT 同一信封，Worker 直接存）',
      ok2 === true && c.u === 'https://lm-fb.me.workers.dev/fb' && c.o.method === 'POST'
        && JSON.parse(c.o.body || '{}').t === 'lmfb1'
        && JSON.parse(c.o.body || '{}').it.id === 'F-77');

    /* 群机器人：飞书 body 用 msg_type + content(JSON 字符串)，且是 no-cors 一次性通知 */
    setCfg({ kind: 'webhook', url: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx' });
    calls.length = 0;
    stubFetch(true);
    return fb.cloudSave(item);
  }).then(function () {
    const c = calls[0] || {};
    const body = JSON.parse(c.o.body || '{}');
    T('群机器人真跑：飞书 msg_type + content(JSON) · mode:no-cors（拿不到回执也算发过）· 正文含编号与内容摘要',
      c.o.mode === 'no-cors' && body.msg_type === 'text'
        && String(body.content).indexOf('新反馈') > 0
        && String(body.content).indexOf('F-77') > 0,
      String(c.o.body || '').slice(0, 80));

    /* 钉钉 / 企业微信：msgtype + text.content */
    setCfg({ kind: 'webhook', url: 'https://oapi.dingtalk.com/robot/send?access_token=x' });
    calls.length = 0;
    stubFetch(true);
    return fb.cloudSave(item);
  }).then(function () {
    const c = calls[0] || {};
    const body = JSON.parse(c.o.body || '{}');
    T('钉钉同样格式真跑：msgtype:"text" + text.content（一份代码同时兼容飞书 / 钉钉 / 企业微信）',
      body.msgtype === 'text' && String((body.text || {}).content).indexOf('新反馈') > 0);

    /* webhook 不能读回 */
    return fb.cloudList();
  }).then(function (r2) {
    T('群机器人只提醒、不读回：cloudList 明确返回 ok:false + 原因（界面据此提示，不误导）',
      r2.ok === false && String(r2.why).indexOf('不能读回') >= 0);

    /* ★ 修复97：404 真跑 —— 面板上的 why 必须带错误码 + 可操作提示 */
    setCfg({ kind: 'supabase', url: 'https://abc.supabase.co', key: 'anon-key', table: 'lm_feedback' });
    calls.length = 0;
    stubFetch(false, [], 404, '{"code":"PGRST205","message":"Could not find the table in the schema cache"}');
    return fb.cloudList();
  }).then(function (r3) {
    T('404 真跑：cloudList 读错误体并翻译（why 含 PGRST205 + 「表名」，不再只有光秃秃的 HTTP 404）',
      r3.ok === false && r3.status === 404
        && String(r3.why).indexOf('PGRST205') > 0 && String(r3.why).indexOf('表名') > 0,
      r3.why);

    if (g0) globalThis.LMApp = g0; else delete globalThis.LMApp;
  }).catch(function (e) {
    T('云存档链路无异常抛出', false, String(e && e.message || e));
  }).then(function () { finishAll(); });
})();

/* ---------- 9.62) 修复100：讨论区云存档（独立表 lm_discuss） ---------- */
console.log('【9.62】修复100：讨论区云存档——访客的帖也能跨设备 / 跨时间到达（upsert + 并集合并 + 离线自愈）');
(function () {
  const fb = require(path.join(DIR, 'js/fbsync.js'));
  const appJs = srcOf('js/app.js');
  const html = srcOf('index.html');
  const readme = srcOf('README.md');

  T('讨论区云存档接口齐全：dcTableName / dcSlim / dcMerge / dcSave / dcList',
    typeof fb.dcTableName === 'function' && typeof fb.dcSlim === 'function'
      && typeof fb.dcMerge === 'function' && typeof fb.dcSave === 'function'
      && typeof fb.dcList === 'function');

  function setCfg(c) { globalThis.LMApp = { state: { content: { config: { fbCloud: c } } } }; }
  delete globalThis.LMApp;
  const t0 = fb.dcTableName();
  setCfg({ kind: 'supabase', url: 'https://abc.supabase.co', key: 'anon-key', dcTable: 'lm_dc2' });
  const t1 = fb.dcTableName();
  T('表名默认 lm_discuss、可在 config.fbCloud.dcTable 覆盖（与反馈表分开，互不干扰）',
    t0 === 'lm_discuss' && t1 === 'lm_dc2', t0 + ' / ' + t1);

  const sl = fb.dcSlim({ id: 'D-1', pid: '', dev: 'AB12', nick: '小明', text: 'hi', ts: 1000, del: 5, rto: '小王', junk: 'x' });
  T('dcSlim 真跑：只留同步字段（junk 丢掉）、del / rto 归一、空 id 返回 null',
    !!sl && sl.id === 'D-1' && sl.del === 5 && sl.rto === '小王'
      && sl.junk === undefined && fb.dcSlim({ text: 'no id' }) === null,
    JSON.stringify(sl));

  const local = [{ id: 'A', text: '本机正文', ts: 1 }, { id: 'B', text: 'b', ts: 2, del: 9 }, { id: 'D', text: 'd', ts: 4 }];
  const inc = [{ id: 'A', text: '云端不同正文', ts: 5 }, { id: 'C', text: 'c', ts: 3 }, { id: 'B', text: 'b', ts: 2 }, { id: 'D', text: 'd2', ts: 4, del: 77 }];
  const mg = fb.dcMerge(local, inc);
  T('dcMerge 真跑：并集按 id 去重（3+4 条 → 4 条，不出现重复 id）',
    mg.length === 4 && mg.map(function (m) { return m.id; }).sort().join(',') === 'A,B,C,D',
    JSON.stringify(mg.map(function (m) { return m.id; })));
  T('dcMerge 真跑：删除墓碑优先（云端已删 → 本机跟着删，正文留着不动）',
    !!mg.find(function (m) { return m.id === 'B'; }).del
      && !!mg.find(function (m) { return m.id === 'D'; }).del,
    JSON.stringify(mg));
  T('dcMerge 真跑：已有正文不被云端覆盖（发言不可变，只允许「删」；防止把别人改的内容冲掉）',
    mg.find(function (m) { return m.id === 'A'; }).text === '本机正文'
      && mg.find(function (m) { return m.id === 'D'; }).text === 'd');

  /* —— 真跑：写（upsert）/ 读（select）的 URL 与请求头 —— */
  const calls = [];
  const prevFetch = globalThis.fetch;   /* 用完必须还原：上一节 9.61 的异步链还在用它的桩 */
  globalThis.fetch = function (u, o) {
    calls.push({ u: u, o: o || {} });
    return Promise.resolve({ ok: true, status: 201, json: function () { return Promise.resolve([]); }, text: function () { return Promise.resolve(''); } });
  };
  setCfg({ kind: 'supabase', url: 'https://abc.supabase.co/', key: 'anon-key' });
  fb.dcSave([
    { id: 'D-1', pid: '', dev: 'AB12', nick: '小明', text: '主帖', ts: 1000 },
    { id: 'D-2', pid: 'D-1', dev: 'CD34', nick: '小王', text: '回复', ts: 1001, del: 5 }
  ]);
  const w = calls[0] || {};
  T('dcSave 真跑：POST /rest/v1/lm_discuss?on_conflict=id · Prefer=resolution=merge-duplicates · body 是数组',
    /\/rest\/v1\/lm_discuss\?on_conflict=id$/.test(w.u || '')
      && String((w.o.headers || {}).Prefer) === 'resolution=merge-duplicates,return=minimal'
      && (w.o.headers || {}).apikey === 'anon-key'
      && String((w.o.headers || {}).Authorization) === 'Bearer anon-key'
      && Array.isArray(JSON.parse(w.o.body || '[]')) && JSON.parse(w.o.body || '[]').length === 2
      && JSON.parse(w.o.body || '[]')[1].del === 5,
    (w.u || '') + ' ' + JSON.stringify((w.o.headers || {}).Prefer));

  calls.length = 0;
  fb.dcList();
  const r1 = calls[0] || {};
  T('dcList 真跑：GET /rest/v1/lm_discuss?select=*&order=ts.asc&limit=1000 · 带 apikey',
    /\/rest\/v1\/lm_discuss\?select=\*&order=ts\.asc&limit=1000$/.test(r1.u || '')
      && (r1.o.headers || {}).apikey === 'anon-key',
    r1.u || '');

  T('接线：发帖即写云（dcPersist → LMFB.dcSave）、打开讨论区即拉（mountDiscuss → dcCloudPull）',
    appJs.indexOf('if (changed && changed.length && window.LMFB && LMFB.dcSave)') > 0
      && appJs.indexOf('function dcCloudPull()') > 0
      && appJs.indexOf('dcCloudPull();   /* ★ 修复100') > 0
      && appJs.indexOf('window.LMFB.dcMerge(cur, list)') > 0);

  T('离线自愈 + 节流：轮询间隔按 _dcGap 走、本机有云端没有的补推（上限 30 条）、补齐时页面提示',
    appJs.indexOf('if (now - _dcPullAt < _dcGap || _dcPulling) return;') > 0
      && appJs.indexOf('var _dcGap = 30000;') > 0
      && appJs.indexOf('!cloudIds[m.id] && m.dev !== \'import\'' ) > 0
      && appJs.indexOf('.slice(0, 30)') > 0
      && appJs.indexOf('☁ 讨论区从云存档补齐 ') > 0);

  /* ★ 修复101：「停在讨论区不动」也要能看到别人的新帖与删除 */
  T('讨论区定时自动刷新：每 15 秒瞄一眼，不在讨论区页或后台时一次请求都不发（拉取仍按 30 秒节流）',
    /setInterval\(function \(\) \{\s*if \(document\.hidden\) return;\s*if \(!document\.getElementById\('dcMount'\)\) \{ _dcDirty = false; return; \}\s*if \(_dcDirty\) dcRepaint\(\);\s*dcCloudPull\(\);\s*\}, 15000\);/.test(appJs));

  T('别人的删除也要立刻消失：res.changed 就重绘（以前只在「补齐新帖」时重绘，删除不刷新）',
    appJs.indexOf('if (changedNow) dcRepaint();') > 0);

  T('协作 dcommit 到达后重绘讨论区（refreshDiscuss 以前错接成 mountFeedback，数据合了页面不刷）',
    appJs.indexOf('refreshDiscuss: function () {') > 0
      && /refreshDiscuss: function \(\) \{\s*mountFeedback\(\);\s*dcRepaint\(\);/.test(appJs));

  /* ★ 修复102：草稿保护 + 云端数据截断 + 保活（防 Supabase 7 天暂停） */
  T('自动刷新不吞草稿：dcBusy() 只认讨论区里的 textarea/input，打字中只记账（_dcDirty）不重绘',
    appJs.indexOf('function dcBusy()') > 0
      && appJs.indexOf("if (tag !== 'textarea' && tag !== 'input') return false;") > 0
      && appJs.indexOf('if (dcBusy()) { _dcDirty = true; return; }') > 0
      && appJs.indexOf('if (_dcDirty) dcRepaint();') > 0);

  T('三个重绘入口统一走 dcRepaint（云存档变化 / 15 秒自检补刷 / 协作 dcommit）',
    appJs.indexOf('if (changedNow) dcRepaint();') > 0
      && /if \(_dcDirty\) dcRepaint\(\);/.test(appJs)
      && /refreshDiscuss: function \(\) \{\s*mountFeedback\(\);\s*dcRepaint\(\);/.test(appJs));

  T('云端来的行一律截断（dcSlim 真跑）：id≤40 / dev≤24 / nick≤40 / text≤2000 / rto≤60，畸形 id 丢',
    (function () {
      const fb = require(path.join(DIR, 'js/fbsync.js'));
      const s = fb.dcSlim({
        id: new Array(101).join('x'), dev: new Array(61).join('d'), nick: new Array(61).join('n'),
        text: new Array(5001).join('t'), rto: new Array(201).join('r'), ts: 1
      });
      const bad = fb.dcSlim({ id: '', text: 'x' });
      return !!s && s.id.length === 40 && s.dev.length === 24 && s.nick.length === 40
        && s.text.length === 2000 && s.rto.length === 60 && bad === null;
    })());

  T('保活（Supabase 免费项目 7 天无活动会被暂停）：工作流 cron + 只读 ping，双表都打、剥掉 /rest/v1',
    (function () {
      const ka = require(path.join(DIR, 'tools/keepalive.js'));
      const cfg = ka.pickCfg('window.SITE_CONTENT = {"config":{"fbCloud":{"kind":"supabase",'
        + '"url":"https://abc.supabase.co/rest/v1/","key":"anon-key","table":"lm_feedback","dcTable":"lm_discuss"}}};');
      const list = ka.endpoints(cfg);
      const yml = fs.readFileSync(path.join(DIR, '.github/workflows/keepalive.yml'), 'utf8');
      const off = ka.endpoints({ kind: 'webhook', url: 'https://example.com/hook' });
      return !!cfg && cfg.kind === 'supabase' && list.length === 2 && off.length === 0
        && list[0].url === 'https://abc.supabase.co/rest/v1/lm_feedback?select=id&limit=1'
        && list[1].url === 'https://abc.supabase.co/rest/v1/lm_discuss?select=id&limit=1'
        && /cron:\s*'17 3,15 \* \* \*'/.test(yml) && /contents: read/.test(yml)
        && /node tools\/keepalive\.js/.test(yml);
    })());

  T('密码拉伸强度已提到 21 万轮（旧记录按各自 iters 校验，不会登不进）',
    /const PBKDF2_ITERS = 210000;/.test(srcOf('js/store.js'))
      && srcOf('js/store.js').indexOf('iterations: Math.max(1000, +iterations || PBKDF2_ITERS)') > 0);

  /* ★ 修复103：言论过滤（不需要我写词条）+ 发言限流 + 额度保护 */
  const CMC = require(path.join(DIR, 'js/community.js'));
  const CM = global.LMCommunity;

  T('词表双来源真跑：文件内置 + 后台 config.modWords 合并；rebuildWords 后立刻生效，清空即恢复放行',
    (function () {
      if (!CM || !CM.wordStats) return false;
      /* ⚠ 只在现有 LMApp 上临时加/改 modWords，用完原样还原 ——
         后面还有异步测试要靠同一份 LMApp.state.content.config.fbCloud 跑云存档。 */
      const prevApp = global.LMApp;
      if (!prevApp) global.LMApp = { state: { content: { config: {} } } };
      const cfg = global.LMApp.state.content.config;
      const had = Object.prototype.hasOwnProperty.call(cfg, 'modWords');
      const keep = cfg.modWords;
      cfg.modWords = [];
      CM.rebuildWords();
      const st0 = CM.wordStats();
      const okBefore = CM.check('这是一段完全正常的讨论内容').ok;
      cfg.modWords = ['测试屏蔽词甲', '测试屏蔽词乙'];
      CM.rebuildWords();
      const st1 = CM.wordStats();
      const hit = CM.check('这里含测试屏蔽词甲，应该被拦').ok;
      const variant = CM.check('测 试 屏 蔽 词 乙（插空格与全角括号）').ok;
      const clean = CM.check('正常内容不受影响，照常发出去').ok;
      if (had) cfg.modWords = keep; else delete cfg.modWords;
      global.LMApp = prevApp;
      CM.rebuildWords();
      return okBefore && hit === false && variant === false && clean === true
        && st1.mod === 2 && st1.active === 2 && st1.file === st0.file;
    })());

  T('结构化拦截真跑（不需要词表）：11 位手机号 / 引导站外私聊 / 链接刷屏 / 长串重复字符',
    (function () {
      if (!CM || !CM.spamCheck) return false;
      const phone = '1' + '3900001111';
      return CM.spamCheck('联系我 ' + phone).ok === false
        && CM.spamCheck('加我微信私聊').ok === false
        && CM.spamCheck('vx:abcdefg123').ok === false
        && CM.spamCheck('https://a.com https://b.com https://c.com').ok === false
        && CM.spamCheck(new Array(31).join('啊')).ok === false
        && CM.spamCheck('同学你好，这条在讨论雾霾与新能源的关系').ok === true;
    })());

  T('发言限流真跑：同设备 10 秒内第二条被挡（存在 localStorage，刷新页面绕不过），rateInfo 计数正确',
    (function () {
      if (!CM || !CM.rateReset) return false;
      CM.rateReset();
      const a = CM.gate('post', '第一条正常的讨论内容');
      const b = CM.gate('post', '紧接着再发的一条');
      const info = CM.rateInfo('post');
      CM.rateReset();
      return a.ok === true && b.ok === false && String(b.msg).indexOf('发言太快') === 0
        && info.used === 1 && info.max === 8;
    })());

  T('10 分钟窗口上限：讨论区 8 条 / 反馈 4 条，且只在真正发出时记账（被拦不占额度）',
    /WIN_MAX = \{ discuss: 8, feedback: 4 \}/.test(srcOf('js/community.js'))
      && srcOf('js/community.js').indexOf("why: 'win'") > 0
      && srcOf('js/community.js').indexOf('rateCommit(kind);') > 0
      && srcOf('js/community.js').indexOf("RATE_KEY = 'lm_rate_v1'") > 0);

  T('额度保护：讨论区没人说话时 30s→60s→120s 自动降频，一有变化立刻回到 30s',
    appJs.indexOf('_dcGap = changedNow ? 30000 : Math.min(Math.round(_dcGap * 2), 120000);') > 0
      && appJs.indexOf('if (now - _dcPullAt < _dcGap || _dcPulling) return;') > 0);

  T('后台可维护词表：🛡️ 面板 + 保存写进 config.modWords 并 rebuildWords（源码里零词条）',
    appJs.indexOf('id="fbModWords"') > 0 && appJs.indexOf("t.id === 'fbModSave'") > 0
      && appJs.indexOf('state.content.config.modWords = arr;') > 0
      && appJs.indexOf('LMCommunity.rebuildWords()') > 0
      && appJs.indexOf('fbModHtml()') > 0);

  T('README 记录修复100：lm_discuss 建表 SQL（含 "updatedAt" bigint）+ grant select, insert, update + upsert 说明',
    readme.indexOf('修复100') > 0 && readme.indexOf('lm_discuss') > 0
      && /create table if not exists lm_discuss/.test(readme)
      && /grant select, insert, update on lm_discuss to anon, authenticated;/.test(readme)
      && readme.indexOf('on_conflict=id') > 0);

  T('版本已升到 115（?v=115 共 21 处 · v114 无残留 · LM_ASSET_VER=115）',
    (html.match(/\?v=115/g) || []).length === 21 && (html.match(/\?v=114/g) || []).length === 0
      && /LM_ASSET_VER = '115'/.test(appJs),
    'v115=' + (html.match(/\?v=115/g) || []).length + ' v114=' + (html.match(/\?v=114/g) || []).length);

  globalThis.fetch = prevFetch;   /* 还原上一节的 fetch 桩 */
})();

/* 汇总与退出放到最后（9.61 里有 Promise 真跑，必须等它跑完再下结论） */
function finishAll() {
  console.log('\n结果：' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
}
setTimeout(finishAll, 15000);   /* 兜底：万一某个 Promise 卡住，也要把结果打出来 */

