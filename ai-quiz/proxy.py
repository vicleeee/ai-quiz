"""
CORS 代理 - 解决 AI 答题系统前端跨域问题
启动方式: python proxy.py --port 8765
设置页面填入: http://localhost:8765/proxy
"""
import http.server
import json
import urllib.request
import urllib.error
import sys
import argparse
import ssl

class CORSProxy(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self._cors_headers()
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        if self.path != '/proxy':
            self._cors_headers()
            self.send_response(404)
            self.end_headers()
            return

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')

        try:
            req_data = json.loads(body)
            target_url = req_data['url']
            method = req_data.get('method', 'GET')
            headers = req_data.get('headers', {})
            req_body = req_data.get('body', None)
        except (json.JSONDecodeError, KeyError) as e:
            self._cors_headers()
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({'error': f'Invalid request: {e}'}).encode())
            return

        # 构建请求
        try:
            # 允许自签名证书（开发环境）
            ctx = ssl.create_default_context()

            req = urllib.request.Request(
                target_url,
                data=req_body.encode('utf-8') if req_body else None,
                headers=headers,
                method=method
            )

            resp = urllib.request.urlopen(req, timeout=60, context=ctx)
            resp_body = resp.read()
            resp_headers = dict(resp.headers)

            self._cors_headers()
            self.send_response(resp.status)
            for k, v in resp_headers.items():
                if k.lower() not in ('content-length', 'transfer-encoding', 'access-control-allow-origin',
                                      'access-control-allow-headers', 'access-control-allow-methods'):
                    self.send_header(k, v)
            self.end_headers()
            self.wfile.write(resp_body)

        except urllib.error.HTTPError as e:
            self._cors_headers()
            self.send_response(e.code)
            self.end_headers()
            try:
                self.wfile.write(e.read())
            except:
                pass
        except Exception as e:
            self._cors_headers()
            self.send_response(502)
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Max-Age', '86400')

    def log_message(self, format, *args):
        print(f"[Proxy] {self.client_address[0]} - {format % args}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='CORS 代理服务器')
    parser.add_argument('--port', type=int, default=8765, help='监听端口 (默认 8765)')
    args = parser.parse_args()

    server = http.server.HTTPServer(('0.0.0.0', args.port), CORSProxy)
    print(f'CORS 代理已启动 → http://localhost:{args.port}/proxy')
    print('在 AI 答题系统设置中填入上述地址即可解决跨域问题')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n代理已关闭')
