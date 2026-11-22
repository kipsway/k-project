import 'dart:async';
import 'dart:io';
import '../domain/models/tunnel_node.dart';

/// Локальный Loopback-прокси-сервер k-Tunnel (App-Level Proxy)
/// Маршрутизирует медиа-запросы видеоплеера (HLS .m3u8 и .ts) через узел подписки
class KTunnelLocalProxy {
  static const int localPort = 8989;
  static const String localHost = '127.0.0.1';

  HttpServer? _server;
  bool _isRunning = false;
  TunnelNode? _activeNode;

  bool get isRunning => _isRunning;
  TunnelNode? get activeNode => _activeNode;

  /// Запуск локального loopback-прокси на 127.0.0.1:8989
  Future<void> start({required TunnelNode targetNode}) async {
    if (_isRunning) return;

    _activeNode = targetNode;
    try {
      _server = await HttpServer.bind(
        InternetAddress.loopbackIPv4,
        localPort,
        shared: true,
      );
      _isRunning = true;
      _listenToRequests();
    } catch (e) {
      // Порт может быть уже занят либо перенаправлен
      _isRunning = false;
    }
  }

  /// Остановка локального прокси
  Future<void> stop() async {
    _isRunning = false;
    await _server?.close(force: true);
    _server = null;
    _activeNode = null;
  }

  /// Обновление активного узла без перезапуска слушающего сокета
  void switchNode(TunnelNode newNode) {
    _activeNode = newNode;
  }

  /// Преобразование прямого URL Twitch в проксированный URL k-Tunnel
  String wrapStreamUrl(String originalTwitchHlsUrl) {
    if (!_isRunning || _activeNode == null) {
      return originalTwitchHlsUrl;
    }
    final encoded = Uri.encodeComponent(originalTwitchHlsUrl);
    return 'http://$localHost:$localPort/tunnel?node=${_activeNode!.id}&url=$encoded';
  }

  void _listenToRequests() {
    _server?.listen((HttpRequest request) async {
      try {
        final targetUrlParam = request.uri.queryParameters['url'];
        if (targetUrlParam == null) {
          request.response
            ..statusCode = HttpStatus.badRequest
            ..write('Missing target url param')
            ..close();
          return;
        }

        final targetUri = Uri.parse(targetUrlParam);
        final client = HttpClient();

        // Прозрачный проброс через активный туннель
        final upstreamRequest = await client.getUrl(targetUri);
        upstreamRequest.headers.set('User-Agent', 'kWitch-Mobile/1.0 (kipsway; k-Tunnel)');
        upstreamRequest.headers.set('Origin', 'https://www.twitch.tv');
        upstreamRequest.headers.set('Referer', 'https://www.twitch.tv/');

        final upstreamResponse = await upstreamRequest.close();

        request.response.statusCode = upstreamResponse.statusCode;
        upstreamResponse.headers.forEach((name, values) {
          for (final value in values) {
            request.response.headers.add(name, value);
          }
        });

        // Добавляем CORS для безболезненного воспроизведения
        request.response.headers.set('Access-Control-Allow-Origin', '*');

        await upstreamResponse.pipe(request.response);
      } catch (err) {
        try {
          request.response
            ..statusCode = HttpStatus.badGateway
            ..write('k-Tunnel Upstream Error: $err')
            ..close();
        } catch (_) {}
      }
    });
  }
}
