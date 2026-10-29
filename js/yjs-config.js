/* =========================================================
   yjs-config.js —— Yjs 实时协同配置（5 人左右 Mesh P2P 工程版）
   ▸ 信令：EMQX 公共 MQTT Broker（免费、匿名、免注册、国内直连）——只负责"牵线"
     （交换 WebRTC 握手），文档内容全部走设备间 P2P，不经过服务器。
     broker 池主备见下方 mqtt.brokers（传输层按房间哈希确定性选一台，同一房间天然同台）。
   ▸ 开通三步（README 三·补12）：①tcb.cloud.tencent.com 创建环境（记下「环境 ID」）
     ②身份认证 → 开启「匿名登录」 ③环境设置 →「Web 安全域名」加 localhost / 127.0.0.1 /
     你的.github.io 域名 —— 然后把环境 ID 填进下面 tcb.env，Ctrl+Shift+R 生效。
   ▸ TURN：保留 Metered OpenRelay 公共凭据兜底（无需注册；国内可能不稳，
     不可达时 ICE 自动跳过，不影响其他通道）。TURN 只是直连失败后的兜底，不是低延迟保证。
   ▸ STUN：Google / Twilio 公共 STUN（免费、无配额）。
   ▸ password：房间口令（防陌生人进房间；属拦截而非加密，内容级安全见 README）。
   ▸ 改完本文件无需改其他代码（改完 Ctrl+Shift+R 生效）。GitHub Pages 部署不受影响。
   ▸ 历史：曾用自建 Cloudflare Worker（workers.dev 被国内 DNS 污染弃用，README 三·补11）
     与腾讯 CloudBase realtime（体验版环境未开通 realtime 模块 → 503，README 三·补12），
     两条线路代码均已删除，现役线路为 EMQX 公共 MQTT。
   ========================================================= */
window.LMYJS_CONFIG = {
  enabled: true,
  room: 'living-maps-collab-v1',
  password: 'zju-lm-collab-2026',
  /* ▸ MQTT 信令：EMQX 公共 Broker 池（免费匿名，只传握手帧不传内容）。
     传输层按「房间哈希 % 池大小」确定性选一台——同一房间所有设备天然同台互通；
     池内为主备跨供应商（EMQX 中国 / EMQX 国际 / HiveMQ），主站故障时改池两端同步生效。 */
  mqtt: {
    brokers: [
      'wss://broker-cn.emqx.io:8084/mqtt',   /* 主：EMQX 公共 Broker 中国节点 */
      'wss://broker.emqx.io:8084/mqtt',      /* 备：EMQX 公共 Broker 国际节点 */
      'wss://broker.hivemq.com:8884/mqtt'    /* 备：HiveMQ 公共 Broker（不同供应商） */
    ]
  },
  /* 已弃用的 WebSocket 信令数组（y-webrtc 用）。保留字段避免旧版本报错，不再读取 */
  signaling: [],
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};

