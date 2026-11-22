#!/usr/bin/env bash
# ==============================================================================
# k-Tunnel Server Automated Deployment Script for VPS (by kipsway)
# Targets: Debian 11/12, Ubuntu 22.04/24.04
# Sets up sing-box (VLESS-Reality + Shadowsocks-2022) + BBR + Subscription API
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo "  🚀 Развертывание серверного узла k-Tunnel (by kipsway)"
echo "=========================================================="

# 1. Обновление пакетов и установка Docker
echo "[1/4] Проверка Docker и BBR..."
if ! command -v docker &> /dev/null; then
    echo "Установка Docker..."
    curl -fsSL https://get.docker.com | bash
fi

# Включение BBR congestion control для максимальной скорости 4K
sysctl -w net.core.default_qdisc=fq || true
sysctl -w net.ipv4.tcp_congestion_control=bbr || true

# 2. Определение внешнего IP
SERVER_IP=$(curl -s4 https://api.ipify.org || echo "127.0.0.1")
echo "[2/4] Обнаружен IP сервера: $SERVER_IP"

# 3. Сборка и запуск контейнеров
echo "[3/4] Запуск контейнеров sing-box и subscription-api..."
export SERVER_IP
docker compose down || true
docker compose up -d --build

# 4. Вывод ссылки на подписку
echo ""
echo "=========================================================="
echo "  🎉 Сервер k-Tunnel успешно запущен!"
echo "  - VLESS-Reality:   порт 443 (SNI: gateway.icloud.com)"
echo "  - Shadowsocks-2022: порт 8388 (blake3-aes-128-gcm)"
echo "  - URL подписки:     http://$SERVER_IP:8080/sub"
echo "  - Health Check:     http://$SERVER_IP:8080/health"
echo "=========================================================="
echo "Вставьте этот URL в настройки kTube или kStore для автоматического обновления нод!"
