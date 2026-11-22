import 'dart:convert';
import 'package:flutter/services.dart';

/// Сервис подготовки и инжекции стилей и скриптов Chatterino+ v2.4.0 (Rish)
class ChatterinoScriptInjector {
  /// JavaScript-код для создания моста Flutter ⇄ Chatterino+
  static String buildBridgeScript({
    required String channel,
    required bool darkTheme,
  }) {
    return '''
(function() {
  if (window.__kWitchChatterinoInitialized) return;
  window.__kWitchChatterinoInitialized = true;

  console.log("[kWitch] Инициализация движка Chatterino+ для канала: $channel");

  // Установка корневых стилей Мозаики
  document.documentElement.classList.add('cpx-own');
  document.documentElement.style.setProperty('--cpx-bg', '#0a0a0c');
  document.documentElement.style.setProperty('--cpx-panel-f', '#0f0f12');
  document.documentElement.style.setProperty('--cpx-lav', '#b8a7f0');
  document.documentElement.style.setProperty('--cpx-acc-r', '#7e6fc4');

  // Перехват кликов по смайлам и никам для нативного Flutter UI
  document.addEventListener('click', function(e) {
    const emote = e.target.closest('.cpx-emote, [data-7tv-emote]');
    if (emote) {
      const emoteName = emote.getAttribute('alt') || emote.getAttribute('data-name');
      if (emoteName && window.FlutterBridge) {
        window.FlutterBridge.postMessage(JSON.stringify({
          type: 'EMOTE_CLICK',
          name: emoteName
        }));
      }
    }
  }, true);

  // Канал отправки сообщений из Flutter в чат
  window.__kWitchSendMessage = function(text) {
    const input = document.querySelector('[data-a-target="chat-input"], textarea');
    if (input) {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const sendBtn = document.querySelector('[data-a-target="chat-send-button"], button[type="submit"]');
      if (sendBtn) {
        sendBtn.click();
      }
    }
  };
})();
''';
  }

  /// HTML-шаблон для автономного режима Chatterino+ (chat.eblo.id)
  static String buildStandaloneChatHtml({
    required String channel,
    required String customCss,
  }) {
    return '''
<!DOCTYPE html>
<html lang="ru" class="cpx-own">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Chatterino+ • $channel</title>
  <style>
    :root {
      --cpx-page-css: 1;
      --cpx-bg: #0a0a0c;
      --cpx-ink: #ecebf1;
      --cpx-muted: #8d8a99;
      --cpx-faint: #6f6c7a;
      --cpx-panel-f: #0f0f12;
      --cpx-panel-r: #2c2b32;
      --cpx-lav: #b8a7f0;
      --cpx-lav-ink: #d9cffd;
      --cpx-acc-f: #2a2442;
      --cpx-acc-r: #7e6fc4;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: var(--cpx-bg);
      color: var(--cpx-ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      overflow-x: hidden;
      overflow-y: auto;
    }
    #chat-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      box-sizing: border-box;
      padding: 8px 12px;
    }
    .chat-line {
      margin: 4px 0;
      line-height: 1.45;
      font-size: 13px;
      word-break: break-word;
    }
    .chat-time {
      color: var(--cpx-faint);
      font-size: 11px;
      margin-right: 6px;
      font-family: monospace;
    }
    .chat-badge {
      display: inline-block;
      vertical-align: middle;
      border-radius: 4px;
      margin-right: 4px;
      height: 16px;
    }
    .chat-author {
      font-weight: 700;
      margin-right: 4px;
    }
    .cpx-paint {
      background-clip: text;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .cpx-emote {
      display: inline-block;
      vertical-align: middle;
      max-height: 28px;
      margin: -2px 2px;
    }
    /* Пользовательский CSS Chatterino+ */
    $customCss
  </style>
</head>
<body>
  <div id="chat-container">
    <div id="messages"></div>
  </div>
  <script>
    // Подключение к WebSocket зеркалам ws.chat.eblo.id / ws.rish098.xyz
    const CHANNEL = "$channel";
    console.log("[Chatterino+] Движок запущен для канала:", CHANNEL);

    // Зеркала Rish для 7TV
    const MIRRORS = ["https://ws.chat.eblo.id", "https://ws.rish098.xyz"];
    window.__MIRRORS = MIRRORS;
  </script>
</body>
</html>
''';
  }
}
