import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/services/battery_saver_controller.dart';

void main() {
  group('BatterySaverController Tests', () {
    test('Initial state has default battery level and standard 60 FPS', () {
      final controller = BatterySaverController();

      expect(controller.batteryLevel, equals(84));
      expect(controller.isCharging, isFalse);
      expect(controller.isAutoSaverEnabled, isTrue);
      expect(controller.isManualSaverEnabled, isFalse);
      expect(controller.isSaverActive, isFalse);
      expect(controller.targetFps, equals(60));
      expect(controller.pauseEmoteAnimations, isFalse);
      expect(controller.generateCssPauseAnimationsRule(), isEmpty);
      expect(controller.estimatedBatteryBonus, equals('Стандартный расход'));
    });

    test('Auto-saver activates when battery level drops to <= 20% and not charging', () {
      final controller = BatterySaverController();
      bool notified = false;
      controller.addListener(() => notified = true);

      controller.updateBatteryStatus(level: 18, isCharging: false);

      expect(notified, isTrue);
      expect(controller.batteryLevel, equals(18));
      expect(controller.isSaverActive, isTrue);
      expect(controller.targetFps, equals(30));
      expect(controller.pauseEmoteAnimations, isTrue);
      expect(controller.estimatedBatteryBonus, contains('+45%'));
      expect(controller.formattedStatus, contains('Эко 30 FPS'));

      final css = controller.generateCssPauseAnimationsRule();
      expect(css, contains('animation-play-state: paused !important'));
      expect(css, contains('.cpx-emote'));
    });

    test('Charging suppresses auto-saver even when battery is low', () {
      final controller = BatterySaverController();

      controller.updateBatteryStatus(level: 15, isCharging: true);

      expect(controller.isCharging, isTrue);
      expect(controller.isSaverActive, isFalse);
      expect(controller.targetFps, equals(60));
      expect(controller.formattedStatus, contains('⚡'));
      expect(controller.formattedStatus, isNot(contains('Эко 30 FPS')));
    });

    test('Manual saver toggle forces saverActive regardless of battery percentage', () {
      final controller = BatterySaverController();

      // Заряд 95%, не заряжается
      controller.updateBatteryStatus(level: 95, isCharging: false);
      expect(controller.isSaverActive, isFalse);

      // Включаем ручной режим энергосбережения
      controller.toggleManualSaver(true);
      expect(controller.isManualSaverEnabled, isTrue);
      expect(controller.isSaverActive, isTrue);
      expect(controller.targetFps, equals(30));

      // Выключаем обратно
      controller.toggleManualSaver(false);
      expect(controller.isManualSaverEnabled, isFalse);
      expect(controller.isSaverActive, isFalse);
      expect(controller.targetFps, equals(60));
    });

    test('Disabling auto-saver prevents activation at low battery', () {
      final controller = BatterySaverController();

      controller.toggleAutoSaver(false);
      expect(controller.isAutoSaverEnabled, isFalse);

      controller.updateBatteryStatus(level: 10, isCharging: false);
      expect(controller.isSaverActive, isFalse);
      expect(controller.targetFps, equals(60));
    });

    test('Battery level is clamped between 0 and 100', () {
      final controller = BatterySaverController();

      controller.updateBatteryStatus(level: 150, isCharging: false);
      expect(controller.batteryLevel, equals(100));

      controller.updateBatteryStatus(level: -10, isCharging: false);
      expect(controller.batteryLevel, equals(0));
    });
  });
}
