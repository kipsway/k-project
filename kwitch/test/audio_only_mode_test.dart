import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/services/audio_only_mode_controller.dart';

void main() {
  group('AudioOnlyModeController Tests', () {
    test('Initial state is disabled with 0 saved bytes', () {
      final controller = AudioOnlyModeController();
      expect(controller.isAudioOnly, isFalse);
      expect(controller.savedBytes, equals(0));
    });

    test('toggleAudioOnly changes state and notifies listeners', () {
      final controller = AudioOnlyModeController();
      int notifyCount = 0;
      controller.addListener(() => notifyCount++);

      controller.toggleAudioOnly(true);
      expect(controller.isAudioOnly, isTrue);
      expect(notifyCount, equals(1));

      controller.toggleAudioOnly(false);
      expect(controller.isAudioOnly, isFalse);
      expect(notifyCount, equals(2));
    });

    test('savingsPercentage calculates ~98.8% traffic savings over 1440p', () {
      final controller = AudioOnlyModeController();
      expect(controller.savingsPercentage, greaterThan(98.0));
      expect(controller.savingsPercentage, lessThan(99.5));
    });

    test('recordAudioSavings accumulates saved bytes only when audio-only is active', () {
      final controller = AudioOnlyModeController();

      // Неактивен -> 0 байт
      controller.recordAudioSavings(60);
      expect(controller.savedBytes, equals(0));

      // Активируем
      controller.toggleAudioOnly(true);
      controller.recordAudioSavings(60); // 60 секунд
      expect(controller.savedBytes, greaterThan(0));

      // 60 секунд разницы между 14200 и 160 kbps:
      // (14040 * 1000 / 8) * 60 = 1,755,000 * 60 = 105,300,000 байт (~100 МБ)
      expect(controller.savedBytes, greaterThan(100 * 1024 * 1024));
      expect(controller.formattedSavedTraffic, contains('МБ сэкономлено'));
    });

    test('resetSavings clears accumulated bytes', () {
      final controller = AudioOnlyModeController();
      controller.toggleAudioOnly(true);
      controller.recordAudioSavings(10);
      expect(controller.savedBytes, greaterThan(0));

      controller.resetSavings();
      expect(controller.savedBytes, equals(0));
      expect(controller.formattedSavedTraffic, contains('0.0 КБ'));
    });
  });
}
