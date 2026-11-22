import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

enum DoubleTapAction {
  none,
  seekBackward,
  catchUpLive,
}

class PlayerGestureController extends ChangeNotifier {
  double _brightness = 0.75;
  double _volume = 0.80;

  bool _showBrightnessHud = false;
  bool _showVolumeHud = false;
  DoubleTapAction _doubleTapAction = DoubleTapAction.none;

  Timer? _brightnessTimer;
  Timer? _volumeTimer;
  Timer? _doubleTapTimer;

  double get brightness => _brightness;
  double get volume => _volume;
  bool get showBrightnessHud => _showBrightnessHud;
  bool get showVolumeHud => _showVolumeHud;
  DoubleTapAction get doubleTapAction => _doubleTapAction;

  /// Изменение яркости свайпом по левой стороне экрана
  void onBrightnessDrag(double delta) {
    // Инвертируем дельту (свайп вверх = увеличение)
    final change = -delta / 250.0;
    _brightness = (_brightness + change).clamp(0.05, 1.0);
    _showBrightnessHud = true;
    _brightnessTimer?.cancel();
    _brightnessTimer = Timer(const Duration(milliseconds: 1200), () {
      _showBrightnessHud = false;
      notifyListeners();
    });

    HapticFeedback.selectionClick();
    notifyListeners();
  }

  /// Изменение громкости свайпом по правой стороне экрана
  void onVolumeDrag(double delta) {
    final change = -delta / 250.0;
    _volume = (_volume + change).clamp(0.0, 1.0);
    _showVolumeHud = true;
    _volumeTimer?.cancel();
    _volumeTimer = Timer(const Duration(milliseconds: 1200), () {
      _showVolumeHud = false;
      notifyListeners();
    });

    HapticFeedback.selectionClick();
    notifyListeners();
  }

  /// Двойной тап слева (перемотка -10с)
  void onDoubleTapLeft() {
    _doubleTapAction = DoubleTapAction.seekBackward;
    HapticFeedback.mediumImpact();
    _doubleTapTimer?.cancel();
    _doubleTapTimer = Timer(const Duration(milliseconds: 700), () {
      _doubleTapAction = DoubleTapAction.none;
      notifyListeners();
    });
    notifyListeners();
  }

  /// Двойной тап справа (прыжок к прямому эфиру)
  void onDoubleTapRight() {
    _doubleTapAction = DoubleTapAction.catchUpLive;
    HapticFeedback.mediumImpact();
    _doubleTapTimer?.cancel();
    _doubleTapTimer = Timer(const Duration(milliseconds: 700), () {
      _doubleTapAction = DoubleTapAction.none;
      notifyListeners();
    });
    notifyListeners();
  }

  @override
  void dispose() {
    _brightnessTimer?.cancel();
    _volumeTimer?.cancel();
    _doubleTapTimer?.cancel();
    super.dispose();
  }
}
