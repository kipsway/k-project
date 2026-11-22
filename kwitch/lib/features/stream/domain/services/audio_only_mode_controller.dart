import 'package:flutter/foundation.dart';

/// Контроллер аудио-режима «Только радио» (Audio-Only Stream Mode) для kWitch.
/// Отключает видеопоток и видеодекодер, оставляя исключительно высококачественный
/// аудиопоток 160 kbps AAC-LC, экономя до 90-98% мобильного трафика и снижая разряд батареи.
class AudioOnlyModeController extends ChangeNotifier {
  bool _isAudioOnly = false;
  int _savedBytes = 0;

  bool get isAudioOnly => _isAudioOnly;
  int get savedBytes => _savedBytes;

  /// Битрейт аудиопотока в кбит/с
  final int audioBitrateKbps = 160;

  /// Битрейт полноценного 1440p/1080p видео в кбит/с
  final int videoBitrateKbps = 14200;

  /// Процент экономии трафика
  double get savingsPercentage {
    final diff = videoBitrateKbps - audioBitrateKbps;
    return (diff / videoBitrateKbps) * 100.0;
  }

  /// Включение / отключение режима «Только радио»
  void toggleAudioOnly([bool? forceState]) {
    final newState = forceState ?? !_isAudioOnly;
    if (_isAudioOnly == newState) return;
    _isAudioOnly = newState;
    notifyListeners();
  }

  /// Учет сэкономленного трафика за время работы аудио-режима
  void recordAudioSavings(int secondsActive) {
    if (!_isAudioOnly || secondsActive <= 0) return;
    // Разница между видео (14200 kbps) и аудио (160 kbps) в байтах в секунду
    final diffBps = ((videoBitrateKbps - audioBitrateKbps) * 1000) ~/ 8;
    _savedBytes += diffBps * secondsActive;
    notifyListeners();
  }

  /// Форматированная строка сэкономленного трафика
  String get formattedSavedTraffic {
    if (_savedBytes < 1024 * 1024) {
      final kb = (_savedBytes / 1024).toStringAsFixed(1);
      return '$kb КБ сэкономлено';
    } else if (_savedBytes < 1024 * 1024 * 1024) {
      final mb = (_savedBytes / (1024 * 1024)).toStringAsFixed(1);
      return '$mb МБ сэкономлено';
    } else {
      final gb = (_savedBytes / (1024 * 1024 * 1024)).toStringAsFixed(2);
      return '$gb ГБ сэкономлено';
    }
  }

  /// Сброс счетчика
  void resetSavings() {
    _savedBytes = 0;
    notifyListeners();
  }
}
