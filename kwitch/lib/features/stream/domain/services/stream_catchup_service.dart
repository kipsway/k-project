import 'dart:async';
import 'package:flutter/foundation.dart';

/// Сервис умного догона прямого эфира (1.5x Stream Catch-up Engine)
/// При отставании стрима автоматически включает скорость 1.5x с коррекцией тональности звука
class StreamCatchupService extends ChangeNotifier {
  double _latencySeconds = 0.0;
  double _playbackSpeed = 1.0;
  bool _isAutoCatchupEnabled = true;
  bool _isCatchingUp = false;

  // Порог срабатывания: если отставание > 2.0 сек, включаем 1.5x
  static const double triggerLatencyThreshold = 2.0;
  // Порог возврата: если отставание <= 0.4 сек, возвращаем 1.0x
  static const double targetLiveThreshold = 0.4;
  // Скорость догона по требованию пользователя
  static const double catchupSpeedMultiplier = 1.5;

  double get latencySeconds => _latencySeconds;
  double get playbackSpeed => _playbackSpeed;
  bool get isDelayed => _latencySeconds > triggerLatencyThreshold;
  bool get isCatchingUp => _isCatchingUp;
  bool get isAutoCatchupEnabled => _isAutoCatchupEnabled;

  /// Обновление текущего отставания от живого края трансляции
  void updateLatency(double seconds) {
    _latencySeconds = seconds.clamp(0.0, 120.0);

    if (_isAutoCatchupEnabled) {
      if (_latencySeconds > triggerLatencyThreshold) {
        // Включаем 1.5x для быстрого догона
        _setSpeed(catchupSpeedMultiplier);
        _isCatchingUp = true;
      } else if (_latencySeconds <= targetLiveThreshold) {
        // Полностью догнали актуальное время трансляции -> возвращаем 1.0x
        _setSpeed(1.0);
        _isCatchingUp = false;
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

  /// Принудительный ручной запуск догона 1.5x
  void forceCatchup15x() {
    _setSpeed(catchupSpeedMultiplier);
    _isCatchingUp = true;
    notifyListeners();
  }

  /// Мгновенный скачок прямо к живому кадру трансляции (0.2с)
  void jumpToLiveEdge() {
    _latencySeconds = 0.2;
    _setSpeed(1.0);
    _isCatchingUp = false;
    notifyListeners();
  }

  /// Включение/выключение автоматического режима догона
  void toggleAutoCatchup(bool enabled) {
    _isAutoCatchupEnabled = enabled;
    if (!enabled) {
      _setSpeed(1.0);
      _isCatchingUp = false;
    }
    notifyListeners();
  }
}
