import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/services/stream_audio_dsp_controller.dart';

void main() {
  group('StreamAudioDspController Tests', () {
    test('Default preset is speechClarity with vocal boost and bass cut', () {
      final controller = StreamAudioDspController();
      expect(controller.isEnabled, isTrue);
      expect(controller.currentPreset, equals(AudioDspPreset.speechClarity));
      expect(controller.vocalBoostDb, equals(6.0));
      expect(controller.bassCutDb, equals(-8.0));
      expect(controller.compressionRatio, equals(1.4));
    });

    test('Disabling DSP returns flat zero values without losing custom configuration', () {
      final controller = StreamAudioDspController();
      controller.toggleDsp(false);

      expect(controller.isEnabled, isFalse);
      expect(controller.vocalBoostDb, equals(0.0));
      expect(controller.bassCutDb, equals(0.0));
      expect(controller.compressionRatio, equals(1.0));

      // Включаем обратно
      controller.toggleDsp(true);
      expect(controller.isEnabled, isTrue);
      expect(controller.vocalBoostDb, equals(6.0));
    });

    test('Selecting nightMode applies anti-scream dynamic range compression', () {
      final controller = StreamAudioDspController();
      controller.setPreset(AudioDspPreset.nightMode);

      expect(controller.currentPreset, equals(AudioDspPreset.nightMode));
      expect(controller.compressionRatio, equals(2.5));
      expect(controller.vocalBoostDb, equals(3.0));
      expect(controller.bassCutDb, equals(-4.0));
    });

    test('Manual adjustments clamp values within safe hardware audio limits', () {
      final controller = StreamAudioDspController();

      // Усиление голоса ограничено от -6 до +12 dB
      controller.setVocalBoost(25.0);
      expect(controller.vocalBoostDb, equals(12.0));

      controller.setVocalBoost(-20.0);
      expect(controller.vocalBoostDb, equals(-6.0));

      // Срез баса от -14 до 0 dB
      controller.setBassCut(-30.0);
      expect(controller.bassCutDb, equals(-14.0));

      // Компрессия от 1.0x до 3.0x
      controller.setCompressionRatio(5.0);
      expect(controller.compressionRatio, equals(3.0));
    });

    test('resetToFlat restores direct neutral audio', () {
      final controller = StreamAudioDspController();
      controller.resetToFlat();

      expect(controller.currentPreset, equals(AudioDspPreset.flat));
      expect(controller.vocalBoostDb, equals(0.0));
      expect(controller.bassCutDb, equals(0.0));
      expect(controller.compressionRatio, equals(1.0));
    });
  });
}
