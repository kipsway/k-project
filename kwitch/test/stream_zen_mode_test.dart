import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/services/stream_zen_mode_controller.dart';

void main() {
  group('StreamZenModeController Tests', () {
    test('Initial state has Zen Mode disabled and ambient glow enabled', () {
      final controller = StreamZenModeController();

      expect(controller.isZenMode, isFalse);
      expect(controller.keepAmbientGlow, isTrue);
      expect(controller.showPillIndicator, isFalse);
    });

    test('Entering Zen Mode activates flag and displays indicator pill', () {
      final controller = StreamZenModeController();
      bool notified = false;
      controller.addListener(() => notified = true);

      controller.enterZenMode();

      expect(notified, isTrue);
      expect(controller.isZenMode, isTrue);
      expect(controller.showPillIndicator, isTrue);

      // Ручное скрытие плашки-индикатора
      controller.dismissPill();
      expect(controller.showPillIndicator, isFalse);
      expect(controller.isZenMode, isTrue); // Сам режим остается активным
    });

    test('Exiting Zen Mode turns off flag and cleans up indicator', () {
      final controller = StreamZenModeController();

      controller.enterZenMode();
      expect(controller.isZenMode, isTrue);

      controller.exitZenMode();
      expect(controller.isZenMode, isFalse);
      expect(controller.showPillIndicator, isFalse);
    });

    test('Toggling Zen Mode alternates state properly', () {
      final controller = StreamZenModeController();

      controller.toggleZenMode();
      expect(controller.isZenMode, isTrue);

      controller.toggleZenMode();
      expect(controller.isZenMode, isFalse);
    });

    test('Toggling keepAmbientGlow updates setting and notifies listeners', () {
      final controller = StreamZenModeController();
      int notifyCount = 0;
      controller.addListener(() => notifyCount++);

      controller.toggleKeepAmbientGlow(false);
      expect(controller.keepAmbientGlow, isFalse);
      expect(notifyCount, equals(1));

      controller.toggleKeepAmbientGlow(true);
      expect(controller.keepAmbientGlow, isTrue);
      expect(notifyCount, equals(2));
    });

    test('Dispose safely cleans up active timers', () {
      final controller = StreamZenModeController();
      controller.enterZenMode();
      expect(controller.showPillIndicator, isTrue);

      expect(() => controller.dispose(), returnsNormally);
    });
  });
}
