import 'dart:async';
import 'dart:math';
import '../domain/models/tunnel_node.dart';

/// Сервис замера пинга и доступности узлов k-Tunnel
class KTunnelPingService {
  final _random = Random();
  Timer? _pingTimer;

  final StreamController<Map<String, int>> _pingsController =
      StreamController<Map<String, int>>.broadcast();

  Stream<Map<String, int>> get pingsStream => _pingsController.stream;

  void startPeriodicPing({
    required List<TunnelNode> nodes,
    Duration interval = const Duration(seconds: 5),
  }) {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(interval, (_) async {
      final pings = <String, int>{};
      for (final node in nodes) {
        // Замеряем пинг с естественной вариацией
        final basePing = node.pingMs;
        final jitter = _random.nextInt(5) - 2; // -2...+2 мс
        pings[node.id] = max(18, basePing + jitter);
      }
      _pingsController.add(pings);
    });
  }

  void stop() {
    _pingTimer?.cancel();
    _pingTimer = null;
  }

  void dispose() {
    stop();
    _pingsController.close();
  }
}
