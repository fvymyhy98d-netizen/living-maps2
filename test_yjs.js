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
T('↑↓ 整格移动对并排块拦截（防拆散行），提示用「取消并排」',
  edt2.indexOf('function freeJump(page, i, dir)') > 0
    && edt2.indexOf('并排的块请在本行内左右拖动微调') > 0);
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
    && appSrc.indexOf("commit({ msg: '已归位：模块回到文档流（随内容自动排版）' })") > 0
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
T('↑↓ 邻居为自由框时 delete free 放回流再 swapWith 互换 + 延时重算让位 + 克隆 offX 真实抓取点/offY≤12',
  edt2.indexOf('function swapWith(j, msg) {') > 0
    && edt2.indexOf('delete prev.free; /* ★ 修复54：自由框放回文档流（自动归位）参与互换 */') > 0
    && edt2.indexOf('delete next.free; /* ★ 修复54：自由框放回文档流（自动归位）参与互换 */') > 0
    && edt2.indexOf('已上移并与自由框互换（自由框已放回文档流，可再拖成自由摆放）') > 0
    && edt2.indexOf('已下移并与自由框互换（自由框已放回文档流，可再拖成自由摆放）') > 0
    && edt2.indexOf('const offX = e.clientX - r0.left, offY = Math.min(e.clientY - r0.top, 12);') > 0);
/* ---------- 9.20) 修复53：自由框调高下限 = 内容实际高度（不再硬编码 50px，字不溢出格子） ---------- */
console.log('【9.20】修复53：调高下限 = 内容实际高度（65 起用 auto 瞬测，不再被自身高度锁死）');
T('startFreeResize 抓取时记录 minH（内容实际高度）并用于 s/se 高度钳制',
  edt2.indexOf('const minH = Math.max(50, contentH + 2);') > 0
    && edt2.indexOf("if (dir === 's' || dir === 'se') b.free.h = Math.max(minH, Math.round(f0.h + dy));") > 0);



/* ---------- 9.21) 修复55：自动更新探针（顽固缓存浏览器自救）+ 手机端操作栏去重合紧凑化 ---------- */
console.log('【9.21】修复55：LM_ASSET_VER 探针自动刷新 · index.html ?v= 版本参数 · 手机 sep 隐藏 + ⠿ 让位');
T('app.js 顶部版本探针（no-store 强拉对比 reload）+ 手机操作栏 sep 隐藏/gap 紧凑/自由框给 ⠿ 让位',
  appSrc.indexOf("var LM_ASSET_VER = '79';") > 0
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
console.log('【9.27】修复62：ghPush 成功重拍基准快照 · takeAdminSnap 导出 · 确认弹窗文案更新');
T('GitHub 上传成功回调 LMApp.takeAdminSnap() 重拍基准 + app 导出 takeAdminSnap + discard 弹窗写明新语义',
  col.indexOf('try { if (window.LMApp && LMApp.takeAdminSnap && validContent(LMApp.state.content)) LMApp.takeAdminSnap(); } catch (eSnap) { /* noop */ }') > 0
    && appSrc.indexOf('takeAdminSnap: takeAdminSnap, /* ★ 修复62：推送云端成功后由 collab 回调重拍快照') > 0
    && edt2.indexOf('把内容恢复到最近一次「同步到 GitHub」上传的版本（从未同步过则回到进入管理模式时的版本）') > 0);


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
    && appSrc.indexOf('const kids = childPages(pageId).slice();') > 0
    && appSrc.indexOf("'<a class=\"entry-card\" href=\"#/p/'") > 0
    && appSrc.indexOf("'<a class=\"entry-row\" href=\"#/p/'") > 0
    && appSrc.indexOf('data-entryadd="') > 0
    && appSrc.indexOf('<nav class="crumb reveal">') > 0
    && appSrc.indexOf('return crumb + heroHtml') > 0
    && appSrc.indexOf('pageById: pageById, pageChildren: childPages, pagePath: pagePath, pageTitle: pageTitle,') > 0);
T('editor.js：TYPES/defaultsFor/formHTML/readForm 认 entries + 插入组「▤ 条目」+ 管理条「🗂 条目树」',
  edt2.indexOf("entries: { name: '嵌套条目', icon: '▤' }") > 0
    && edt2.indexOf("case 'entries': return { type: type, title: '相关条目', mode: 'card', cols: 3, note: '' };") > 0
    && edt2.indexOf('data-tb="entriesins"') > 0
    && edt2.indexOf("case 'entriesins': {") > 0
    && edt2.indexOf('data-panel="tree"') > 0
    && edt2.indexOf("else if (k === 'tree') treeModal();") > 0
    && edt2.indexOf("const entryAdd = e.target.closest ? e.target.closest('[data-entryadd]') : null;") > 0);
T('editor.js：条目树全操作（加分支/改名/调序/补条目块/级联删除 + 删页清跳转死链）',
  edt2.indexOf('function treeModal() {') > 0
    && edt2.indexOf('function openPageForm(pageId, parentId, fromTree) {') > 0
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
console.log('\n结果：' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
