import 'dart:async';
import 'package:flutter/foundation.dart';

/// Сервис догона прямого эфира (Stream Catch-up)
/// Автоматически ускоряет воспроизведение (1.15x - 1.25x) при отставании от прямого эфира
class StreamCatchupService extends ChangeNotifier {
  double _latencySeconds = 0.0;
  double _playbackSpeed = 1.0;
  bool _isAutoCatchupEnabled = true;

  double get latencySeconds => _latencySeconds;
  double get playbackSpeed => _playbackSpeed;
  bool get isDelayed => _latencySeconds > 3.0;
  bool get isAutoCatchupEnabled => _isAutoCatchupEnabled;

  /// Обновление задержки до живого края трансляции
  void updateLatency(double seconds) {
    _latencySeconds = seconds;

    if (_isAutoCatchupEnabled) {
      if (_latencySeconds > 5.0) {
        _setSpeed(1.25);
      } else if (_latencySeconds > 2.5) {
        _setSpeed(1.15);
      } else if (_latencySeconds <= 0.8) {
        _setSpeed(1.0);
      }
    } else {
      notifyListeners();
    }
  }

  void _setSpeed(double speed) {
    if (_playbackSpeed != speed) {
      _playbackSpeed = speed;
      notifyListeners();
    }
  }

  /// Мгновенный скачок к живому краю эфира (Zero-Latency Jump)
  void jumpToLiveEdge() {
    _latencySeconds = 0.5;
    _setSpeed(1.0);
    notifyListeners();
  }

  /// Переключение режима автодогона
  void setAutoCatchup(bool enabled) {
    _isAutoCatchupEnabled = enabled;
    if (!enabled) _setSpeed(1.0);
    notifyListeners();
  }
}
