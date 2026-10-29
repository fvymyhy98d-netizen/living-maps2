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
T('信令只走 MQTT 定向 publish（/to/<peerId> topic，QoS0）',
  tcb.indexOf('function sig(payload)') > 0 && tcb.indexOf('peerTopic(payload.to') > 0 && tcb.indexOf('mq.publish') > 0);
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
T('broker 池确定性选择（房间哈希 % 池大小 → 同房间同台互通）',
  tcb.indexOf('parseInt(shortHash(topic), 36) % brokers.length') > 0 && tcb.indexOf('opts.brokers') > 0);
T('yjs-config.js broker 池三供应商（EMQX 中国/国际 + HiveMQ），tcb/signalMode 已删',
  cfg.indexOf('broker-cn.emqx.io') > 0 && cfg.indexOf('broker.emqx.io') > 0 && cfg.indexOf('broker.hivemq.com') > 0 && cfg.indexOf('signalMode') < 0 && cfg.indexOf('tcb:') < 0);
T('ycollab.js 传递 brokers 给传输层',
  src.indexOf('CFG.mqtt && CFG.mqtt.brokers') > 0);
T('MQTT 断线状态去重（offStatus 防重连风暴刷屏）',
  tcb.indexOf('function offStatus') > 0);

console.log('\n结果：' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
