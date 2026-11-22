import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

enum PlayerHealthStatus {
  stable,
  buffering,
  recovering,
  error,
}

/// Контроллер стабильности и удобства воспроизведения
class PlayerStabilityController extends ChangeNotifier {
  PlayerHealthStatus _status = PlayerHealthStatus.stable;
  bool _isControlsLocked = false;
  bool _isMuted = false;
  double _savedVolume = 0.8;
  double _bufferSeconds = 4.2;
  int _recoveryAttempts = 0;
  Timer? _recoveryTimer;

  PlayerHealthStatus get status => _status;
  bool get isControlsLocked => _isControlsLocked;
  bool get isMuted => _isMuted;
  double get bufferSeconds => _bufferSeconds;
  int get recoveryAttempts => _recoveryAttempts;

  /// Блокировка контроллеров от случайных касаний (Замок)
  void toggleControlsLock() {
    _isControlsLocked = !_isControlsLocked;
    HapticFeedback.mediumImpact();
    notifyListeners();
  }

  /// Быстрое отключение/включение звука в один клик
  double toggleMute(double currentVolume) {
    _isMuted = !_isMuted;
    HapticFeedback.lightImpact();

    if (_isMuted) {
      _savedVolume = currentVolume > 0 ? currentVolume : 0.8;
      notifyListeners();
      return 0.0;
    } else {
      notifyListeners();
      return _savedVolume;
    }
  }

  /// Обновление заполненности буфера видеопотока
  void updateBuffer(double seconds) {
    _bufferSeconds = seconds.clamp(0.0, 30.0);
    if (_bufferSeconds < 0.8 && _status == PlayerHealthStatus.stable) {
      _triggerAutoRecovery();
    } else if (_bufferSeconds >= 1.5 && _status != PlayerHealthStatus.stable) {
      _status = PlayerHealthStatus.stable;
      _recoveryAttempts = 0;
      notifyListeners();
    }
  }

  /// Автоматическое бесшовное восстановление стрима при сбоях сети
  void _triggerAutoRecovery() {
    if (_recoveryAttempts >= 5) {
      _status = PlayerHealthStatus.error;
      notifyListeners();
      return;
    }

    _status = PlayerHealthStatus.recovering;
    _recoveryAttempts++;
    notifyListeners();

    _recoveryTimer?.cancel();
    _recoveryTimer = Timer(const Duration(milliseconds: 1500), () {
      // Имитация успешного перезапроса HLS плейлиста через k-Tunnel
      _bufferSeconds = 3.5;
      _status = PlayerHealthStatus.stable;
      notifyListeners();
    });
  }

  @override
  void dispose() {
    _recoveryTimer?.cancel();
    super.dispose();
  }
}
