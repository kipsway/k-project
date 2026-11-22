import 'package:flutter/material.dart';
import '../../../../core/theme/k_colors.dart';

class AmoledModeController extends ChangeNotifier {
  bool _isAmoledEnabled = false;

  bool get isAmoledEnabled => _isAmoledEnabled;

  Color get currentBgColor =>
      _isAmoledEnabled ? const Color(0xFF000000) : KColors.bg;

  Color get currentPanelColor =>
      _isAmoledEnabled ? const Color(0xFF040406) : KColors.panel;

  void toggleAmoled(bool enabled) {
    if (_isAmoledEnabled != enabled) {
      _isAmoledEnabled = enabled;
      notifyListeners();
    }
  }
}
