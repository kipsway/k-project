import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/services/player_gesture_controller.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Player Gesture Controller Tests', () {
    test('onBrightnessDrag changes brightness clamped between 0.05 and 1.0', () {
      final controller = PlayerGestureController();
      final initial = controller.brightness;

      // Свайп вверх (отрицательная дельта) увеличивает яркость
      controller.onBrightnessDrag(-50);
      expect(controller.brightness, greaterThan(initial));
      expect(controller.showBrightnessHud, isTrue);

      // Проверка верхнего предела
      controller.onBrightnessDrag(-1000);
      expect(controller.brightness, equals(1.0));

      // Проверка нижнего предела
      controller.onBrightnessDrag(2000);
      expect(controller.brightness, equals(0.05));
    });

    test('onVolumeDrag changes volume clamped between 0.0 and 1.0', () {
      final controller = PlayerGestureController();

      controller.onVolumeDrag(-100);
      expect(controller.showVolumeHud, isTrue);

      controller.onVolumeDrag(2000);
      expect(controller.volume, equals(0.0));
    });

    test('Double tap gestures trigger seek and catch-up actions', () {
      final controller = PlayerGestureController();

      controller.onDoubleTapLeft();
      expect(controller.doubleTapAction, equals(DoubleTapAction.seekBackward));

      controller.onDoubleTapRight();
      expect(controller.doubleTapAction, equals(DoubleTapAction.catchUpLive));
    });
  });
}
