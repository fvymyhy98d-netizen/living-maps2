#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
天禧本地模型 -> 网页 的小桥（只用 Python 标准库，不需要下载/安装任何东西）

背景：
  联想天禧（xiaotian）本身就在本机跑着 Qwen3-4B-Thinking，
  并且已经开了一个 OpenAI 兼容接口： http://[::1]:11466/v1/chat/completions
  但它没有返回 Access-Control-Allow-Origin，也不处理 OPTIONS 预检，
  所以浏览器里的网页（https://xxx.github.io）会被 CORS 挡掉。

这个脚本做三件事：
  1) 在 127.0.0.1:11468 起一个本地小服务（IPv4）
  2) 把请求原样转给 [::1]:11466（天禧）
  3) 补上 CORS 头，并把流式响应一块一块实时转发（不积压）

用法（不需要管理员）：
  py tools\\tianxi-bridge.py
  py tools\\tianxi-bridge.py --port 11468 --target http://[::1]:11466

然后用网页的「⚙ 接本机模型」→「一键检测并启用」即可。
"""

import argparse
import http.server
import socketserver
import sys
import urllib.error
import urllib.request

DEFAULT_PORT = 11468
DEFAULT_TARGET = "http://[::1]:11466"

HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length",
}


class Bridge(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"   # 不设 Content-Length 也能靠关闭连接结束流
    server_version = "tianxi-bridge/1.0"

    target = DEFAULT_TARGET

    # ---------- CORS ----------
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Expose-Headers", "*")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    # ---------- 转发 ----------
    def _proxy(self, method):
        url = self.target + self.path
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None

        req = urllib.request.Request(url, data=body, method=method)
        for k, v in self.headers.items():
            if k.lower() not in HOP:
                req.add_header(k, v)
        if body is not None:
            req.add_header("Content-Length", str(length))

        try:
            resp = urllib.request.urlopen(req, timeout=600)
        except urllib.error.HTTPError as e:
            resp = e
        except Exception as e:                      # 天禧没开 / 端口变了
            msg = ("bridge: 连不上天禧 %s（%s）。\n"
                   "确认天禧在运行；端口不是 11466 就用 --target 指定。\n" % (self.target, e))
            self.send_response(502)
            self._cors()
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(msg.encode("utf-8"))
            return

        self.send_response(getattr(resp, "status", getattr(resp, "code", 200)))
        # 先补 CORS，再透传上游的头（同名的 CORS 头跳过，避免重复）
        self._cors()
        ctype = resp.headers.get("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Type", ctype)
        self.end_headers()

        # 关键：边读边写，保证 SSE 逐字到达浏览器
        try:
            while True:
                chunk = resp.read(512)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass                                # 用户切走了页面
        finally:
            try:
                resp.close()
            except Exception:
                pass

    def do_GET(self):
        self._proxy("GET")

    def do_POST(self):
        self._proxy("POST")

    def log_message(self, fmt, *args):
        sys.stdout.write("  %s\n" % (fmt % args))
        sys.stdout.flush()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    ap = argparse.ArgumentParser(description="天禧模型 <-> 网页 的 CORS 小桥（零依赖）")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT, help="本地监听端口，默认 11468")
    ap.add_argument("--host", default="127.0.0.1", help="监听地址，默认 127.0.0.1（只本机）")
    ap.add_argument("--target", default=DEFAULT_TARGET, help="天禧接口地址，默认 http://[::1]:11466")
    a = ap.parse_args()

    Bridge.target = a.target.rstrip("/")
    for stream in (sys.stdout, sys.stderr):      # Windows 控制台默认 GBK，避免中文/符号炸掉
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    with Server((a.host, a.port), Bridge) as httpd:
        print("天禧桥已启动： http://%s:%d  ->  %s" % (a.host, a.port, Bridge.target))
        print("网页里点 [接本机模型] -> [一键检测并启用] 即可。Ctrl+C 结束。")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止。")


if __name__ == "__main__":
    main()
