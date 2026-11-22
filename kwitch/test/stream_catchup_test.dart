import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/models/stream_nerd_stats.dart';
import '../lib/features/stream/domain/services/stream_catchup_service.dart';

void main() {
  group('Stream Catch-up & Nerd Stats Tests', () {
    test('StreamCatchupService dynamically increases playback speed to 1.15x and 1.25x', () {
      final service = StreamCatchupService();

      // Маленькая задержка -> скорость 1.0x
      service.updateLatency(1.2);
      expect(service.playbackSpeed, equals(1.0));
      expect(service.isDelayed, isFalse);

      // Задержка 3.5 секунды -> скорость 1.15x
      service.updateLatency(3.5);
      expect(service.playbackSpeed, equals(1.15));
      expect(service.isDelayed, isTrue);

      // Задержка 6.0 секунд -> ускорение 1.25x
      service.updateLatency(6.0);
      expect(service.playbackSpeed, equals(1.25));

      // Догон прямого эфира (0.5с) -> возврат к 1.0x
      service.updateLatency(0.5);
      expect(service.playbackSpeed, equals(1.0));
      expect(service.isDelayed, isFalse);
    });

    test('jumpToLiveEdge instantly resets latency to 0.5s and normal speed', () {
      final service = StreamCatchupService();
      service.updateLatency(10.0);
      expect(service.playbackSpeed, equals(1.25));

      service.jumpToLiveEdge();
      expect(service.latencySeconds, equals(0.5));
      expect(service.playbackSpeed, equals(1.0));
    });

    test('StreamNerdStats formats 1440p bitrate and 0 dropped frames', () {
      const stats = StreamNerdStats(
        resolution: '2560x1440',
        fps: 60,
        currentBitrateKbps: 14280,
        droppedFrames: 0,
        totalFrames: 200000,
      );

      expect(stats.resolution, equals('2560x1440'));
      expect(stats.fps, equals(60));
      expect(stats.currentBitrateKbps, equals(14280));
      expect(stats.droppedFrames, equals(0));
      expect(stats.dropRatePercentage, equals(0.0));
    });
  });
}
