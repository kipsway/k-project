import 'package:flutter/foundation.dart';

/// Контроллер адаптивного режима энергосбережения батареи (Battery Saver) в kWitch.
/// Снижает нагрузку на видеопроцессор (GPU) и аккумулятор: ограничивает частоту
/// кадров до 30 FPS, отключает тяжелые цикличные GIF-анимации 7TV смайлов
/// и оптимизирует видеоповерхность при заряде < 20% или по требованию пользователя.
class BatterySaverController extends ChangeNotifier {
  int _batteryLevel = 84; // % заряда
  bool _isCharging = false;
  bool _isAutoSaverEnabled = true;
  bool _isManualSaverEnabled = false;
  static const int lowBatteryThreshold = 20;

  int get batteryLevel => _batteryLevel;
  bool get isCharging => _isCharging;
  bool get isAutoSaverEnabled => _isAutoSaverEnabled;
  bool get isManualSaverEnabled => _isManualSaverEnabled;

  /// Активен ли режим энергосбережения прямо сейчас
  bool get isSaverActive {
    if (_isManualSaverEnabled) return true;
    if (_isAutoSaverEnabled && _batteryLevel <= lowBatteryThreshold && !_isCharging) {
      return true;
    }
    return false;
  }

  /// Целевая частота кадров видеотрансляции (30 или 60 FPS)
  int get targetFps => isSaverActive ? 30 : 60;

  /// Приостановка цикличных анимированных смайлов в чате
  bool get pauseEmoteAnimations => isSaverActive;

  /// Оценка дополнительного времени работы от аккумулятора
  String get estimatedBatteryBonus => isSaverActive ? '+45% времени стрима' : 'Стандартный расход';

  /// Форматированное состояние батареи для плашки в плеере
  String get formattedStatus {
    final chargingStr = _isCharging ? ' ⚡' : '';
    final saverStr = isSaverActive ? ' • Эко 30 FPS' : '';
    return '$_batteryLevel%$chargingStr$saverStr';
  }

  /// Обновление статуса батареи от системы
  void updateBatteryStatus({required int level, required bool isCharging}) {
    final cleanLevel = level.clamp(0, 100);
    if (_batteryLevel == cleanLevel && _isCharging == isCharging) return;
    _batteryLevel = cleanLevel;
    _isCharging = isCharging;
    notifyListeners();
  }

  /// Переключение ручного режима энергосбережения
  void toggleManualSaver([bool? value]) {
    final newState = value ?? !_isManualSaverEnabled;
    if (_isManualSaverEnabled == newState) return;
    _isManualSaverEnabled = newState;
    notifyListeners();
  }

  /// Переключение авто-сбережения при низком заряде (< 20%)
  void toggleAutoSaver([bool? value]) {
    final newState = value ?? !_isAutoSaverEnabled;
    if (_isAutoSaverEnabled == newState) return;
    _isAutoSaverEnabled = newState;
    notifyListeners();
  }

  /// Генерация CSS-правила для остановки анимации GIF в WebView Chatterino+
  String generateCssPauseAnimationsRule() {
    if (!pauseEmoteAnimations) return '';
    return '''
/* kWitch Battery Saver: Pause Emote Animations */
.cpx-emote, [data-7tv-emote], img[src*=".gif"], img[src*=".webp"] {
  animation-play-state: paused !important;
}
''';
  }
}
