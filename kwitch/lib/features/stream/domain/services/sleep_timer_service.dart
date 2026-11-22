import 'dart:async';
import 'package:flutter/foundation.dart';

/// Сервис спящего таймера с плавным затуханием звука
class SleepTimerService extends ChangeNotifier {
  Timer? _countdownTimer;
  Duration _remainingTime = Duration.zero;
  bool _isActive = false;
  double _volumeFadeMultiplier = 1.0;
  VoidCallback? _onCompleted;

  Duration get remainingTime => _remainingTime;
  bool get isActive => _isActive;
  double get volumeFadeMultiplier => _volumeFadeMultiplier;

  String get formattedRemaining {
    if (!_isActive) return '';
    final minutes = _remainingTime.inMinutes;
    final seconds = _remainingTime.inSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  /// Запуск таймера на заданную длительность
  void startTimer(Duration duration, {required VoidCallback onCompleted}) {
    cancelTimer();
    _remainingTime = duration;
    _isActive = true;
    _volumeFadeMultiplier = 1.0;
    _onCompleted = onCompleted;
    notifyListeners();

    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_remainingTime.inSeconds <= 1) {
        cancelTimer();
        _onCompleted?.call();
      } else {
        _remainingTime -= const Duration(seconds: 1);

        // Плавное затухание громкости в последние 60 секунд
        if (_remainingTime.inSeconds <= 60) {
          _volumeFadeMultiplier = _remainingTime.inSeconds / 60.0;
        } else {
          _volumeFadeMultiplier = 1.0;
        }
        notifyListeners();
      }
    });
  }

  /// Отмена спящего таймера
  void cancelTimer() {
    _countdownTimer?.cancel();
    _countdownTimer = null;
    _isActive = false;
    _remainingTime = Duration.zero;
    _volumeFadeMultiplier = 1.0;
    notifyListeners();
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }
}
