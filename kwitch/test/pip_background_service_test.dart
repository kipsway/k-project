import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/services/pip_background_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('PipBackgroundService Tests (Background Audio & PiP)', () {
    test('Default states: background audio enabled, PiP inactive', () {
      final service = PipBackgroundService();
      expect(service.isBackgroundAudioEnabled, isTrue);
      expect(service.isPipActive, isFalse);
      expect(service.isPlaying, isTrue);
    });

    test('setBackgroundAudio toggles state and notifies listeners', () {
      final service = PipBackgroundService();
      bool notified = false;
      service.addListener(() => notified = true);

      service.setBackgroundAudio(false);
      expect(service.isBackgroundAudioEnabled, isFalse);
      expect(notified, isTrue);
    });

    test('enterPictureInPicture executes gracefully without crash', () async {
      final service = PipBackgroundService();
      final result = await service.enterPictureInPicture();
      // На fallback эмуляции возвращает true
      expect(result, isTrue);
      expect(service.isPipActive, isTrue);
    });
  });
}
