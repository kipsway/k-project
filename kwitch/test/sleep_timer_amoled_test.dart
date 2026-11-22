import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/services/amoled_mode_controller.dart';
import '../lib/features/stream/domain/services/sleep_timer_service.dart';

void main() {
  group('Sleep Timer & AMOLED Mode Tests', () {
    test('SleepTimerService manages countdown and volume fade multiplier', () {
      final timer = SleepTimerService();
      expect(timer.isActive, isFalse);

      timer.startTimer(const Duration(minutes: 15), onCompleted: () {});
      expect(timer.isActive, isTrue);
      expect(timer.formattedRemaining, equals('15:00'));
      expect(timer.volumeFadeMultiplier, equals(1.0));

      timer.cancelTimer();
      expect(timer.isActive, isFalse);
      expect(timer.remainingTime, equals(Duration.zero));
    });

    test('AmoledModeController toggles pure black #000000 background', () {
      final controller = AmoledModeController();
      expect(controller.isAmoledEnabled, isFalse);
      expect(controller.currentBgColor.value, equals(0xFF0A0A0C));

      controller.toggleAmoled(true);
      expect(controller.isAmoledEnabled, isTrue);
      expect(controller.currentBgColor, equals(const Color(0xFF000000)));
      expect(controller.currentPanelColor, equals(const Color(0xFF040406)));
    });
  });
}
