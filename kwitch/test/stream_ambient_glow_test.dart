import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/services/stream_ambient_glow_controller.dart';

void main() {
  group('StreamAmbientGlowController Tests', () {
    test('Initial state is enabled with adaptive category and 0.65 intensity', () {
      final controller = StreamAmbientGlowController();

      expect(controller.isEnabled, isTrue);
      expect(controller.intensity, equals(0.65));
      expect(controller.spreadRadius, equals(38.0));
      expect(controller.mode, equals(AmbientGlowMode.categoryAdaptive));
      expect(controller.currentCategory, equals('Just Chatting'));

      // Для Just Chatting дефолтный цвет - Twitch Purple
      final color = controller.activeGlowColor;
      expect(color.value, isNonZero);
      expect(color.opacity, closeTo(0.65, 0.01));
    });

    test('Category adaptive mode adjusts color for different games', () {
      final controller = StreamAmbientGlowController();

      // Шутер / Valorant -> Красный
      controller.updateCategory('Valorant');
      expect(controller.activeGlowColor.red, greaterThan(200));

      // MOBA / Dota 2 -> Золотой
      controller.updateCategory('Dota 2');
      expect(controller.activeGlowColor.red, greaterThan(200));
      expect(controller.activeGlowColor.green, greaterThan(150));

      // Minecraft -> Зеленый
      controller.updateCategory('Minecraft');
      expect(controller.activeGlowColor.green, greaterThan(controller.activeGlowColor.red));
    });

    test('Switching color modes applies specific profile colors', () {
      final controller = StreamAmbientGlowController();

      // Лаванда Chatterino+
      controller.setMode(AmbientGlowMode.chatterinoLavender);
      expect(controller.activeGlowColor, equals(const Color(0xFFB8A7F0).withOpacity(0.65)));
      expect(controller.modeDisplayName, contains('Лаванда'));

      // Киберпанк Циан
      controller.setMode(AmbientGlowMode.cyberpunkCyan);
      expect(controller.modeDisplayName, contains('Киберпанк'));

      // Теплый закат
      controller.setMode(AmbientGlowMode.warmSunset);
      expect(controller.modeDisplayName, contains('камин'));

      // Изумруд
      controller.setMode(AmbientGlowMode.emeraldClean);
      expect(controller.modeDisplayName, contains('Изумруд'));
    });

    test('Disabling glow returns transparent color', () {
      final controller = StreamAmbientGlowController();

      controller.toggleGlow(false);
      expect(controller.isEnabled, isFalse);
      expect(controller.activeGlowColor, equals(Colors.transparent));

      controller.toggleGlow(true);
      expect(controller.isEnabled, isTrue);
      expect(controller.activeGlowColor, isNot(equals(Colors.transparent)));
    });

    test('Intensity and spread radius are clamped properly', () {
      final controller = StreamAmbientGlowController();

      controller.setIntensity(1.5);
      expect(controller.intensity, equals(1.0));

      controller.setIntensity(0.01);
      expect(controller.intensity, equals(0.1));

      controller.setSpreadRadius(100.0);
      expect(controller.spreadRadius, equals(60.0));

      controller.setSpreadRadius(2.0);
      expect(controller.spreadRadius, equals(10.0));
    });

    test('Notifies listeners on parameter updates', () {
      final controller = StreamAmbientGlowController();
      int notifyCount = 0;
      controller.addListener(() => notifyCount++);

      controller.setIntensity(0.8);
      controller.setSpreadRadius(45.0);
      controller.setMode(AmbientGlowMode.warmSunset);
      controller.toggleGlow(false);

      expect(notifyCount, equals(4));
    });
  });
}
