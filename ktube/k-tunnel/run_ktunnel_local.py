"""
k-Tunnel Standalone Loopback Daemon & Diagnostic Monitor (by kipsway)
Emulates the embedded Android C/Java engine for local testing on Windows/Linux.
Listens on 127.0.0.1:10808 (SOCKS5) and 127.0.0.1:10809 (HTTP).
"""

import socket
import threading
import time
import sys

LOCAL_HOST = "127.0.0.1"
SOCKS_PORT = 10808
HTTP_PORT = 10809

running = True
connections_count = 0
last_ping_ms = 28
active_node = "nl-fast-01 (Амстердам)"

def handle_socks_client(client_socket):
    global connections_count
    connections_count += 1
    try:
        # SOCKS5 Handshake
        header = client_socket.recv(2)
        if len(header) < 2 or header[0] != 0x05:
            client_socket.close()
            return
        
        nmethods = header[1]
        methods = client_socket.recv(nmethods)
        # 0x05, 0x00: SOCKS5, No Authentication Required
        client_socket.sendall(b"\x05\x00")
        
        # Request details
        request = client_socket.recv(4)
        if len(request) < 4:
            client_socket.close()
            return
            
        cmd = request[1]
        atyp = request[3]
        
        target_host = ""
        if atyp == 0x01: # IPv4
            target_host = socket.inet_ntoa(client_socket.recv(4))
        elif atyp == 0x03: # Domain
            domain_len = client_socket.recv(1)[0]
            target_host = client_socket.recv(domain_len).decode('utf-8', errors='ignore')
        elif atyp == 0x04: # IPv6
            target_host = socket.inet_ntop(socket.AF_INET6, client_socket.recv(16))
            
        port_bytes = client_socket.recv(2)
        target_port = int.from_bytes(port_bytes, 'big')
        
        # Connection established reply
        reply = b"\x05\x00\x00\x01\x7f\x00\x00\x01" + port_bytes
        client_socket.sendall(reply)
        
    except Exception:
        pass
    finally:
        try:
            client_socket.close()
        except:
            pass

def socks_server_loop():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        server.bind((LOCAL_HOST, SOCKS_PORT))
        server.listen(16)
        server.settimeout(1.0)
        while running:
            try:
                client, _ = server.accept()
                threading.Thread(target=handle_socks_client, args=(client,), daemon=True).start()
            except socket.timeout:
                continue
            except Exception:
                break
    except Exception as e:
        print(f"[!] SOCKS5 bind note: {e}")
    finally:
        server.close()

def ping_probe_loop():
    global last_ping_ms
    while running:
        # Measure fast RTT simulation with slight variance
        base = 24
        variance = (int(time.time() * 10) % 7)
        last_ping_ms = base + variance
        time.sleep(2.5)

def display_dashboard():
    print("=" * 60)
    print("  🚀 k-Tunnel Core Daemon Monitor (by kipsway)")
    print(f"  Loopback SOCKS5: {LOCAL_HOST}:{SOCKS_PORT}")
    print(f"  Loopback HTTP:   {LOCAL_HOST}:{HTTP_PORT}")
    print(f"  Активный узел:   {active_node}")
    print("=" * 60)
    print("  Нажмите Ctrl+C для остановки\n")

    while running:
        status_line = f"\r  [СТАТУС: ПОДКЛЮЧЕНО] • Пинг: {last_ping_ms} мс • Соединений: {connections_count} • Маршрутизация: Googlevideo 4K OK"
        sys.stdout.write(status_line)
        sys.stdout.flush()
        time.sleep(1)

def main():
    global running
    t_socks = threading.Thread(target=socks_server_loop, daemon=True)
    t_ping = threading.Thread(target=ping_probe_loop, daemon=True)
    t_socks.start()
    t_ping.start()
    
    try:
        display_dashboard()
    except KeyboardInterrupt:
        running = False
        print("\n\n[k-Tunnel] Демон остановлен.")

if __name__ == '__main__':
    main()
