import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/models/stream_nerd_stats.dart';
import '../lib/features/stream/domain/services/player_stability_controller.dart';
import '../lib/features/stream/domain/services/stream_catchup_service.dart';

void main() {
  group('1.5x Stream Catch-up Engine Tests', () {
    test('StreamCatchupService ramps up to 1.5x when latency > 2.0s and restores 1.0x on live edge', () {
      final service = StreamCatchupService();

      // Маленькая задержка -> скорость 1.0x
      service.updateLatency(1.0);
      expect(service.playbackSpeed, equals(1.0));
      expect(service.isCatchingUp, isFalse);

      // Задержка 3.5 секунды -> мгновенное включение 1.5x для догона
      service.updateLatency(3.5);
      expect(service.playbackSpeed, equals(1.5));
      expect(service.isCatchingUp, isTrue);

      // Задержка 8.0 секунд -> держит 1.5x
      service.updateLatency(8.0);
      expect(service.playbackSpeed, equals(1.5));

      // Догон прямого эфира (0.3с) -> плавный возврат к 1.0x
      service.updateLatency(0.3);
      expect(service.playbackSpeed, equals(1.0));
      expect(service.isCatchingUp, isFalse);
    });

    test('jumpToLiveEdge instantly resets latency and restores 1.0x speed', () {
      final service = StreamCatchupService();
      service.updateLatency(15.0);
      expect(service.playbackSpeed, equals(1.5));

      service.jumpToLiveEdge();
      expect(service.latencySeconds, equals(0.2));
      expect(service.playbackSpeed, equals(1.0));
      expect(service.isCatchingUp, isFalse);
    });

    test('PlayerStabilityController toggles screen lock and mute smoothly', () {
      final stability = PlayerStabilityController();
      expect(stability.isControlsLocked, isFalse);

      stability.toggleControlsLock();
      expect(stability.isControlsLocked, isTrue);

      final mutedVol = stability.toggleMute(0.85);
      expect(mutedVol, equals(0.0));
      expect(stability.isMuted, isTrue);

      final unmutedVol = stability.toggleMute(0.0);
      expect(unmutedVol, equals(0.85));
      expect(stability.isMuted, isFalse);
    });
  });
}
