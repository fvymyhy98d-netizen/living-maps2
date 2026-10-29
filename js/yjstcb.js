/* =========================================================
   yjstcb.js —— Yjs 传输层（EMQX 公共 MQTT 信令 + 原生 WebRTC Mesh）
   （文件名 yjstcb 与全局名 LMYjsTCB 为历史遗留——曾接腾讯 CloudBase 实时推送，
   因免费体验版环境未开通 realtime 模块（WS 握手 503）已整段移除，历史见 README 三·补12）
   信令：EMQX 公共 MQTT Broker（免费、匿名、免注册、国内直连）：
   ▸ broker 池确定性选择：broker 下标 = 房间 topic 哈希 % 池大小 —— 同一房间的
     所有设备算出同一台 broker，天然互通；池内主备（broker-cn / broker.emqx.io）
     统一在 js/yjs-config.js 的 mqtt.brokers 维护（两端同 config 才能互通）。
   ▸ pub/sub 模拟 Broadcast：定向握手 topic lm/<口令哈希>/to/<peerId>（QoS0）+
     presence topic（15s 心跳 + MQTT LWT 遗言自动报退 + 45s 超时清扫三保险）。
   架构（README 三·补12）：
   ▸ 信令只"牵线"：只传 SDP Offer/Answer 与 ICE 候选（握手完毕即闲置），文档内容绝不经过服务器；
   ▸ 数据 P2P 网状 Mesh：原生 RTCPeerConnection DataChannel，每台设备与其他每台直连，
     直连失败自动 TURN 兜底（iceServers 来自 yjs-config.js）；
   ▸ 同步：新 DataChannel 建立时双方互发全量 Y update（CRDT 幂等收敛），
     之后 doc.on('update') 增量广播 —— 无需状态向量协商，5 人小房间完全够用；
   ▸ 在线/光标：y-protocols Awareness（超时剔除 + 心跳续约）。
   依赖（lib/ 本地化，零 CDN）：Yjs(window.Yjs)、y-protocols(window.YProtocols)、mqtt(window.mqtt)。
   ========================================================= */
(function () {
  'use strict';

  var MSG_DOC = 1;   /* DataChannel 帧类型：Yjs 文档 update（Uint8Array 原始字节） */
  var MSG_AWARE = 2; /* DataChannel 帧类型：Awareness update（y-protocols 编码） */

  function isReady() { /* 基础件检查；信令后端库（CloudBase/mqtt）缺失时 start() 内按 mode 报 error */
    return !!(window.Yjs && window.Yjs.Doc && window.YProtocols);
  }
  function pickAwarenessNs() {
    var p = window.YProtocols || {};
    var aw = p.awareness || (p.default && p.default.awareness) || null;
    return aw && aw.Awareness ? aw : null;
  }
  /* 频道名派生：频道 + 口令哈希 —— 不知道口令就订阅不到同一频道（拦截陌生人，非加密） */
  function shortHash(s) {
    var h = 5381; s = String(s || '');
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function nowSec() { return Math.floor(Date.now() / 1000); } /* 秒级时间戳（presence 心跳/去重用） */

  /* ---------- Provider 工厂 ----------
     opts: { env, channel, password, iceServers, doc, onStatus(kind, detail) }
     返回：{ awareness, getPeerPCs, destroy }（awareness 与 y-webrtc 的 WebrtcProvider 同形状，
     ycollab.js 的 setAw/probe/presence 逻辑无需感知传输层切换） */
  function start(opts) {
    var doc = opts.doc;
    var status = opts.onStatus || function () {};
    var NS = pickAwarenessNs();
    var awareness = NS ? new NS.Awareness(doc) : null;
    var conns = {};          /* peerId -> { pc, dc, initiator } */
    var presStates = {};     /* peerId -> presence state（在线名单驱动建连） */
    var destroyed = false;
    var sigReady = false;  /* 信令通道就绪（MQTT client connected） */
    var lastOff = '';      /* signaling-off 去重（防重连风暴刷屏） */
    var mq = null, myPeer = '', topic = '';
    var mqPing = null, mqSweep = null;
    /* ★ mqs 必须在 bootMQTT() 被调用（下方 start 流程）之前完成赋值 —— 旧版把它声明在
       函数体后部（bootMQTT 定义旁边），var 声明提升但赋值不提升：bootMQTT() 一进来就执行
       mqs.push(mq)，此时 mqs 还是 undefined → 「Cannot read properties of undefined
       (reading 'push')」→ 协同初始化失败降级。电脑端靠旧缓存一直没暴露，手机无痕首载必现 */
    var mqs = [], mqUp = 0; /* 多 broker 全连：同时连池内所有公共 broker */
    var api = {
      awareness: awareness,
      getPeerPCs: function () { return Object.keys(conns).map(function (k) { return conns[k].pc; }); },
      destroy: function () { destroyed = true; try { cleanupAll(); } catch (e0) { /* noop */ } }
    };
    if (!awareness) { status('error', 'y-protocols 未加载'); return api; }

    function statusSafely(k, d) { try { status(k, d); } catch (e) { /* noop */ } }
    function offStatus(d) { if (d !== lastOff) { lastOff = d; statusSafely('signaling-off', d); } } /* 去重防刷屏 */

    /* CloudBase 信令线路已移除（免费体验版 realtime 未开通 → WS 503；历史与替代见 README 三·补12） */

    /* ---------- DataChannel 帧与 Yjs 同步 ---------- */
    function sendFrame(dc, type, bytes) {
      try {
        var out = new Uint8Array(bytes.length + 1);
        out[0] = type; out.set(bytes, 1);
        dc.send(out.buffer);
      } catch (e) { /* 对端断开时静默 */ }
    }
    function broadcastFrame(type, bytes) {
      Object.keys(conns).forEach(function (p) {
        var c = conns[p];
        if (c && c.dc && c.dc.readyState === 'open') sendFrame(c.dc, type, bytes);
      });
    }
    function handleFrame(ev) {
      try {
        var u8 = new Uint8Array(ev.data);
        var type = u8[0], body = u8.subarray(1);
        if (type === MSG_DOC) window.Yjs.applyUpdate(doc, body, api); /* origin=api：非 'lm-local'，走漏斗 */
        else if (type === MSG_AWARE) NS.applyAwarenessUpdate(awareness, body, api);
      } catch (e) { /* 坏帧忽略 */ }
    }

    /* ---------- Awareness 广播（本地变化 → 所有对端；新连接 → 全量） ---------- */
    function broadcastAwareness(clients) {
      try { broadcastFrame(MSG_AWARE, NS.encodeAwarenessUpdate(awareness, clients)); } catch (e) { /* noop */ }
    }
    awareness.on('update', function (chg, origin) {
      if (origin === api) return; /* 远端来的不再转发（防回环） */
      var ids = (chg.added || []).concat(chg.updated || []).concat(chg.removed || []);
      if (ids.length) broadcastAwareness(ids);
    });

    /* ---------- WebRTC Peer ---------- */
    function cleanupPeer(pid) {
      var c = conns[pid]; if (!c) return;
      delete conns[pid];
      try { if (c.dc) c.dc.close(); } catch (e1) { /* noop */ }
      try { c.pc.close(); } catch (e2) { /* noop */ }
    }
    function cleanupAll() {
      Object.keys(conns).forEach(cleanupPeer);
      try { if (mqPing) clearInterval(mqPing); } catch (e5) { /* noop */ }
      try { if (mqSweep) clearInterval(mqSweep); } catch (e6) { /* noop */ }
      try { if (mq) { mq.end(true); mq = null; } } catch (e7) { /* noop */ }
      sigReady = false;
    }
    function wireDc(dc, peerId) {
      dc.binaryType = 'arraybuffer';
      dc.onmessage = function (ev) { handleFrame(ev); };
      dc.onopen = function () {
        try { sendFrame(dc, MSG_DOC, window.Yjs.encodeStateAsUpdate(doc)); } catch (e1) { /* noop */ }
        try {
          var all = Array.from(awareness.getStates().keys());
          sendFrame(dc, MSG_AWARE, NS.encodeAwarenessUpdate(awareness, all));
        } catch (e2) { /* noop */ }
        statusSafely('peer-open', peerId);
      };
      dc.onclose = function () { if (conns[peerId] && conns[peerId].dc === dc) { cleanupPeer(peerId); maybeOffer(); } };
    }
    function makePC(peerId, initiator) {
      var pc = new RTCPeerConnection({ iceServers: opts.iceServers || [] });
      conns[peerId] = { pc: pc, dc: null, initiator: !!initiator };
      pc.onicecandidate = function (ev) {
        if (ev.candidate) sig({ k: 'ice', from: myPeer, to: peerId, candidate: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate });
      };
      pc.ondatachannel = function (ev) { conns[peerId].dc = ev.channel; wireDc(ev.channel, peerId); };
      pc.onconnectionstatechange = function () {
        if (pc.connectionState === 'failed') { /* 直连+TURN 都失败：清理后延迟重新协商 */
          cleanupPeer(peerId);
          if (initiator) setTimeout(function () { if (!destroyed && !conns[peerId]) maybeOffer(); }, 2500);
        }
      };
      return pc;
    }
    function maybeOffer() { /* 我对字典序更小的 peer 主动发 offer（消除 glare 冲突） */
      if (destroyed || !sigReady) return;
      Object.keys(presStates).forEach(function (pid) {
        if (pid === myPeer || conns[pid] || myPeer > pid) return;
        var pc = makePC(pid, true);
        var dc = pc.createDataChannel('lm', { ordered: true });
        conns[pid].dc = dc; wireDc(dc, pid);
        pc.createOffer().then(function (offer) { return pc.setLocalDescription(offer); }).then(function () {
          return sig({ k: 'offer', from: myPeer, to: pid, sdp: pc.localDescription });
        }).catch(function () { cleanupPeer(pid); });
      });
    }

    /* ---------- 信令发送（MQTT 定向 publish 到对端 topic；失败只记录不中断流程） ---------- */
    var sigSeen = {}; /* 多 broker 全连后同一握手帧会从多路到达 → 帧唯一号去重，只消费第一路 */
    function sig(payload) { /* 定向 topic：lm/<room>/to/<peerId>（QoS0；丢失由 ICE 重发/重协商兜底） */
      if (!mqUp) return Promise.resolve('no-mq');
      payload.n = Math.floor(Math.random() * 1e9).toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
      mqPublish(peerTopic(payload.to || ''), payload);
      return Promise.resolve('ok');
    }
    /* MQTT topic 派生：房间基座 = lm/<口令哈希>（不知道口令就撞不出 topic）；presence 广播 + 定向握手 */
    function baseTopic() { return 'lm/' + shortHash((opts.channel || 'living-maps') + '|' + (opts.password || '')); }
    function presTopic() { return baseTopic() + '/presence'; }
    function selfTopic() { return baseTopic() + '/to/' + myPeer; }
    function peerTopic(pid) { return baseTopic() + '/to/' + pid; }
    function onSignal(p) {
      if (!p || p.from === myPeer) return;
      var sk = (p.from || '') + '|' + (p.n || '');
      if (sigSeen[sk]) return;
      sigSeen[sk] = Date.now();
      var skKeys = Object.keys(sigSeen);
      if (skKeys.length > 200) { var cutT = Date.now() - 30000; skKeys.forEach(function (k2) { if (sigSeen[k2] < cutT) delete sigSeen[k2]; }); }
      if (p.k === 'offer' && (!p.to || p.to === myPeer)) {
        var pc = conns[p.from] && conns[p.from].pc;
        if (!pc) pc = makePC(p.from, false);
        pc.setRemoteDescription(p.sdp).then(function () { return pc.createAnswer(); }).then(function (ans) {
          return pc.setLocalDescription(ans);
        }).then(function () {
          return sig({ k: 'answer', from: myPeer, to: p.from, sdp: pc.localDescription });
        }).catch(function () { cleanupPeer(p.from); });
      } else if (p.k === 'answer' && p.to === myPeer) {
        var c = conns[p.from];
        if (c && c.pc && c.pc.signalingState !== 'stable') {
          c.pc.setRemoteDescription(p.sdp).catch(function () { cleanupPeer(p.from); });
        }
      } else if (p.k === 'ice' && p.to === myPeer) {
        var c2 = conns[p.from];
        if (c2 && c2.pc) { try { c2.pc.addIceCandidate(p.candidate); } catch (e) { /* noop */ } }
      }
    }

    /* ---------- Presence：在线名单驱动建连（mqtt 名单由 presence 消息驱动维护） ---------- */
    function scanPresence() { maybeOffer(); }

    /* ---------- 启动：生成身份 → MQTT 信令 ---------- */
    myPeer = shortHash(String(Math.random()) + String(nowSec()) + String(doc.clientID)) + '-' + Math.floor(Math.random() * 1e4).toString(36);
    topic = 'lm-' + shortHash((opts.channel || 'living-maps') + '|' + (opts.password || ''));
    bootMQTT();
    return api;

    /* ---------- MQTT 信令：公共 Broker 池（EMQX 中国/国际 + HiveMQ，免费匿名） ---------- */
    function bootMQTT() {
      if (!window.mqtt || typeof window.mqtt.connect !== 'function') { status('error', 'MQTT 库未加载（lib/mqtt.js）'); return; }
      /* ★ 全连而非单点选台：握手帧向所有已连接 broker 三路广播。
         旧「确定性选台」在公共 broker 对某些网络（校园网/移动流量）不可达时，
         设备会永远卡在死服务器上重试 → 全员互相看不见（实测 3 台设备同时孤岛）。
         全连后任何一台公共服务器抽风都不影响互联，代价只是几条极小的握手帧重复（帧唯一号去重）。 */
      var brokers = (opts.brokers && opts.brokers.length) ? opts.brokers : ['wss://broker-cn.emqx.io:8084/mqtt', 'wss://broker.emqx.io:8084/mqtt'];
      var willMsg = JSON.stringify({ peer: myPeer, t: nowSec(), leave: 1 });
      brokers.forEach(function (url, bi) {
        var mq;
        try {
          mq = window.mqtt.connect(url, {
            clientId: 'lmsig' + bi + '-' + shortHash(myPeer) + Math.floor(Math.random() * 1e4).toString(36),
            keepalive: 30, clean: true, reconnectPeriod: 5000, connectTimeout: 12000,
            will: { topic: presTopic(), payload: willMsg, qos: 0, retain: false }
          });
        } catch (eM) { statusSafely('signaling-off', 'MQTT 连接失败：' + eM); return; }
        mqs.push(mq);
        mq.on('connect', function () {
          mq.__wasUp = true; mqUp++;
          sigReady = true; lastOff = '';
          try { mq.subscribe(presTopic()); mq.subscribe(selfTopic()); } catch (e0) { /* noop */ }
          statusSafely('signaling-on', topic + '（' + mqUp + '/' + mqs.length + ' 路信令）');
          mqPublish(presTopic(), { peer: myPeer, t: nowSec() });
          if (mqPing) clearInterval(mqPing);
          mqPing = setInterval(function () { if (!destroyed && mqUp) mqPublish(presTopic(), { peer: myPeer, t: nowSec() }); }, 15000);
        });
        mq.on('message', function (t, payload) {
          if (destroyed) return;
          var p = null;
          try { p = JSON.parse(payload.toString()); } catch (eP) { return; }
          if (!p) return;
          if (t === presTopic()) { onMqPresence(p); return; }
          if (t === selfTopic()) onSignal(p); /* 定向握手帧：offer/answer/ice */
        });
        mq.on('offline', function () { mqDown(mq); });
        mq.on('close', function () { mqDown(mq); });
        mq.on('error', function (eE) { /* 断线自动重连（reconnectPeriod=5s）；只降状态不弹终态错误 */
          statusSafely('signaling-off', String((eE && eE.message) || eE));
        });
      });
      if (!mqs.length) { status('error', 'MQTT 全部连接失败'); return; }
      if (mqSweep) clearInterval(mqSweep);
      mqSweep = setInterval(function () { /* 心跳超时清扫：45s 无心跳视为离开（LWT 漏网兜底） */
        if (destroyed || !mqs.length) return;
        var now = nowSec(), gone = [];
        Object.keys(presStates).forEach(function (pid) {
          if (!presStates[pid] || (now - (presStates[pid].t || 0)) > 45) gone.push(pid);
        });
        gone.forEach(function (pid) { delete presStates[pid]; cleanupPeer(pid); });
        if (gone.length) scanPresence();
      }, 20000);
    }
    function mqDown(mq) { /* 单路断开只减计数；全部断掉才置 signaling-off（重连循环里状态不闪烁） */
      if (!mq || !mq.__wasUp) return;
      mq.__wasUp = false; mqUp = Math.max(0, mqUp - 1);
      if (!mqUp) { sigReady = false; offStatus('MQTT offline'); }
    }
    function mqPublish(t, obj) { /* 发到所有已连接的 broker（对端按帧唯一号去重） */
      var s = JSON.stringify(obj);
      mqs.forEach(function (m) { try { if (m.connected) m.publish(t, s); } catch (e) { /* noop */ } });
    }
    function onMqPresence(p) {
      if (!p || !p.peer || p.peer === myPeer) return;
      if (p.leave) {
        if (presStates[p.peer]) { delete presStates[p.peer]; cleanupPeer(p.peer); scanPresence(); }
        return;
      }
      var isNew = !presStates[p.peer];
      presStates[p.peer] = p;
      if (isNew) scanPresence(); /* 新设备上线 → 触发建连；重复心跳不重扫 */
    }
  }

  window.LMYjsTCB = {
    isReady: isReady,
    start: start
  };
})();
