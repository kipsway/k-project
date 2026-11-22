import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../domain/models/tunnel_node.dart';
import '../../domain/models/tunnel_state.dart';
import '../../data/ktunnel_local_proxy.dart';
import '../../data/ktunnel_ping_service.dart';

class KTunnelController extends ChangeNotifier {
  final KTunnelLocalProxy _proxy = KTunnelLocalProxy();
  final KTunnelPingService _pingService = KTunnelPingService();

  List<TunnelNode> _nodes = List.from(KTunnelPresets.defaultNodes);
  TunnelState _state = const TunnelState();
  StreamSubscription? _pingSub;

  KTunnelController() {
    _init();
  }

  TunnelState get state => _state;
  List<TunnelNode> get nodes => List.unmodifiable(_nodes);
  bool get isEnabled => _state.isEnabled;
  int get currentPing => _state.currentPingMs;
  TunnelNode? get activeNode => _state.activeNode;

  void _init() {
    // По умолчанию выбираем самый быстрый европейский узел
    final fastest = _nodes.first;
    _state = _state.copyWith(
      activeNode: fastest,
      currentPingMs: fastest.pingMs,
    );

    _pingService.startPeriodicPing(nodes: _nodes);
    _pingSub = _pingService.pingsStream.listen((pings) {
      bool updated = false;
      _nodes = _nodes.map((node) {
        if (pings.containsKey(node.id)) {
          updated = true;
          return node.copyWith(pingMs: pings[node.id]);
        }
        return node;
      }).toList();

      if (updated) {
        if (_state.activeNode != null && pings.containsKey(_state.activeNode!.id)) {
          _state = _state.copyWith(
            currentPingMs: pings[_state.activeNode!.id],
          );
        }
        notifyListeners();
      }
    });

    // Автоматический старт туннеля (киллер-фича)
    enableTunnel();
  }

  /// Включение ускорения k-Tunnel
  Future<void> enableTunnel() async {
    final target = _state.activeNode ?? _nodes.first;
    _state = _state.copyWith(
      status: TunnelStatus.connecting,
    );
    notifyListeners();

    await _proxy.start(targetNode: target);

    _state = _state.copyWith(
      isEnabled: true,
      status: TunnelStatus.connected,
      activeNode: target,
      currentPingMs: target.pingMs,
      currentBitrateMbps: 14.2, // Разблокировка 1440p
      droppedFrames: 0,
    );
    notifyListeners();
  }

  /// Отключение k-Tunnel
  Future<void> disableTunnel() async {
    await _proxy.stop();
    _state = _state.copyWith(
      isEnabled: false,
      status: TunnelStatus.disconnected,
    );
    notifyListeners();
  }

  /// Переключение состояния тумблера
  Future<void> toggleTunnel(bool enable) async {
    if (enable) {
      await enableTunnel();
    } else {
      await disableTunnel();
    }
  }

  /// Выбор конкретного узла из пула
  Future<void> selectNode(TunnelNode node) async {
    _state = _state.copyWith(
      activeNode: node,
      currentPingMs: node.pingMs,
    );
    _proxy.switchNode(node);
    notifyListeners();
  }

  /// Оборачивание URL видеопотока
  String processStreamUrl(String rawTwitchUrl) {
    if (!_state.isEnabled) return rawTwitchUrl;
    return _proxy.wrapStreamUrl(rawTwitchUrl);
  }

  @override
  void dispose() {
    _pingSub?.cancel();
    _pingService.dispose();
    _proxy.stop();
    super.dispose();
  }
}
