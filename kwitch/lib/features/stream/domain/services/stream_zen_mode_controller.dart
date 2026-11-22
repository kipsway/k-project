import 'dart:async';
import 'package:flutter/foundation.dart';

/// Контроллер «Дзен-режима» фокуса стримера (Streamer Zen Mode).
/// Позволяет мгновенно скрыть весь интерфейс, оверлеи, плашки туннеля,
/// чат и статистику для максимального кинематографичного погружения в стрим.
class StreamZenModeController extends ChangeNotifier {
  bool _isZenMode = false;
  bool _keepAmbientGlow = true; // Сохранять Ambilight в Дзен-режиме
  bool _showPillIndicator = false;
  Timer? _pillTimer;

  bool get isZenMode => _isZenMode;
  bool get keepAmbientGlow => _keepAmbientGlow;
  bool get showPillIndicator => _showPillIndicator;

  /// Переключение Дзен-режима
  void toggleZenMode([bool? enabled]) {
    final newState = enabled ?? !_isZenMode;
    if (_isZenMode == newState) return;
    _isZenMode = newState;

    if (_isZenMode) {
      _triggerPillIndicator();
    } else {
      _showPillIndicator = false;
      _pillTimer?.cancel();
    }

    notifyListeners();
  }

  /// Вход в Дзен-режим
  void enterZenMode() => toggleZenMode(true);

  /// Выход из Дзен-режима
  void exitZenMode() => toggleZenMode(false);

  /// Переключение сохранения подсветки Ambilight в Дзен-режиме
  void toggleKeepAmbientGlow([bool? val]) {
    final newState = val ?? !_keepAmbientGlow;
    if (_keepAmbientGlow == newState) return;
    _keepAmbientGlow = newState;
    notifyListeners();
  }

  /// Активация временного бейджа-индикатора при включении
  void _triggerPillIndicator() {
    _showPillIndicator = true;
    _pillTimer?.cancel();
    _pillTimer = Timer(const Duration(seconds: 3), () {
      _showPillIndicator = false;
      notifyListeners();
    });
  }

  /// Ручное скрытие плашки-индикатора
  void dismissPill() {
    if (!_showPillIndicator) return;
    _showPillIndicator = false;
    _pillTimer?.cancel();
    notifyListeners();
  }

  @override
  void dispose() {
    _pillTimer?.cancel();
    super.dispose();
  }
}
