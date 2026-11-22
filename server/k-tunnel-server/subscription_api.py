"""
k-Tunnel Dynamic Subscription Server (by kipsway)
Provides formatted node lists for kTube, kWitch, and kGram clients.
Endpoints:
  GET /sub      - Base64 / plain node subscription list
  GET /health   - Health status and connected ping
"""

import os
import base64
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

SERVER_IP = os.getenv("SERVER_IP", "185.196.220.14")
UUID = "7a5a8f4c-12d4-4e9b-b530-9b8e9f2a0011"
PUBLIC_KEY = "9xR8_V0wQ1xP9LzXk7A6W3_B2Z1M5N4T"
SHORT_ID = "6a"
SNI = "gateway.icloud.com"

def get_subscription_content():
    # VLESS Reality URI format
    vless_uri = f"vless://{UUID}@{SERVER_IP}:443?security=reality&encryption=none&pbk={PUBLIC_KEY}&headerType=none&fp=chrome&type=tcp&flow=xtls-rprx-vision&sni={SNI}&sid={SHORT_ID}#k-Tunnel-Fast-01"
    
    # Shadowsocks-2022 URI format
    ss_credentials = base64.b64encode(b"2022-blake3-aes-128-gcm:kipsway-ktube-secret-key-32b-base64==").decode('utf-8')
    ss_uri = f"ss://{ss_credentials}@{SERVER_IP}:8388#k-Tunnel-Shadowsocks-Backup"
    
    combined = f"{vless_uri}\n{ss_uri}\n"
    return base64.b64encode(combined.encode('utf-8')).decode('utf-8')

class SubscriptionHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ('/sub', '/'):
            body = get_subscription_content().encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Profile-Update-Interval', '24')
            self.send_header('Subscription-Userinfo', 'upload=0; download=10485760; total=1073741824000; expire=2054-01-01')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == '/health':
            status = {"status": "ONLINE", "service": "k-Tunnel Server", "active_nodes": 2, "ping_target": "googlevideo.com"}
            body = json.dumps(status).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

def run():
    port = int(os.getenv("API_PORT", 8080))
    server = HTTPServer(('0.0.0.0', port), SubscriptionHandler)
    print(f"k-Tunnel Subscription Server listening on port {port}...")
    server.serve_forever()

if __name__ == '__main__':
    run()
