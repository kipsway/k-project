import 'dart:async';
import 'package:flutter/foundation.dart';

enum NetworkConnectionType {
  wifi,
  cellular,
  ethernet,
  offline,
}

class NetworkAdaptiveController extends ChangeNotifier {
  NetworkConnectionType _connectionType = NetworkConnectionType.wifi;
  bool _forceMaxQualityOnCellular = false;
  double _sessionBytesDownloaded = 0; // в байтах
  double _currentSpeedMbps = 14.2;
  Timer? _trafficTimer;

  NetworkConnectionType get connectionType => _connectionType;
  bool get forceMaxQualityOnCellular => _forceMaxQualityOnCellular;
  double get sessionBytesDownloaded => _sessionBytesDownloaded;
  double get currentSpeedMbps => _currentSpeedMbps;

  NetworkAdaptiveController() {
    _startSimulatedTrafficCounter();
  }

  /// Рекомендуемое качество видео в зависимости от типа сети
  String get recommendedQuality {
    switch (_connectionType) {
      case NetworkConnectionType.wifi:
      case NetworkConnectionType.ethernet:
        return '1440p60';
      case NetworkConnectionType.cellular:
        return _forceMaxQualityOnCellular ? '1440p60' : '1080p60';
      case NetworkConnectionType.offline:
        return 'audio_only';
    }
  }

  /// Форматированное значение переданного трафика за сессию
  String get formattedSessionTraffic {
    final mb = _sessionBytesDownloaded / (1024 * 1024);
    if (mb >= 1024) {
      final gb = mb / 1024;
      return '${gb.toStringAsFixed(2)} ГБ';
    }
    return '${mb.toStringAsFixed(1)} МБ';
  }

  /// Переключение типа сети (Wi-Fi ⇄ Мобильная сеть)
  void setConnectionType(NetworkConnectionType type) {
    if (_connectionType != type) {
      _connectionType = type;
      notifyListeners();
    }
  }

  /// Переключатель "Всегда 1440p в мобильной сети"
  void toggleForceMaxQuality(bool force) {
    _forceMaxQualityOnCellular = force;
    notifyListeners();
  }

  /// Добавление переданных байт в счетчик сессии
  void addTraffic(int bytes) {
    _sessionBytesDownloaded += bytes;
    notifyListeners();
  }

  void _startSimulatedTrafficCounter() {
    // В реальном воспроизведении байты инкрементируются из сокса k-Tunnel
    _trafficTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      // 14.2 Мбит/с = ~1.77 МБ/сек = ~3.5 МБ за 2 сек
      addTraffic((1.77 * 1024 * 1024 * 2).toInt());
    });
  }

  @override
  void dispose() {
    _trafficTimer?.cancel();
    super.dispose();
  }
}
