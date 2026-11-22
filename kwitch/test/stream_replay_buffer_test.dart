import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/services/stream_replay_buffer_service.dart';

void main() {
  group('StreamReplayBufferService Tests', () {
    test('Initial state is inactive at live edge with 1.0x speed', () {
      final service = StreamReplayBufferService();
      expect(service.isReplayActive, isFalse);
      expect(service.replayOffsetSeconds, equals(0.0));
      expect(service.replayPlaybackSpeed, equals(1.0));
      expect(service.formattedOffset, equals('-0:00'));
    });

    test('startInstantReplay activates replay buffer and sets accurate offset', () {
      final service = StreamReplayBufferService();
      int notifyCount = 0;
      service.addListener(() => notifyCount++);

      service.startInstantReplay(30.0);
      expect(service.isReplayActive, isTrue);
      expect(service.replayOffsetSeconds, equals(30.0));
      expect(service.formattedOffset, equals('-0:30'));
      expect(notifyCount, equals(1));

      // Проверка 45 секунд
      service.startInstantReplay(45.0);
      expect(service.replayOffsetSeconds, equals(45.0));
      expect(service.formattedOffset, equals('-0:45'));
    });

    test('toggleSlowMotion alternates between 1.0x and 0.5x only when replay is active', () {
      final service = StreamReplayBufferService();

      // Не активно -> ничего не меняется
      service.toggleSlowMotion();
      expect(service.replayPlaybackSpeed, equals(1.0));

      // Активируем повтор
      service.startInstantReplay(20.0);
      expect(service.replayPlaybackSpeed, equals(1.0));

      // Переключаем в замедленный режим 0.5x
      service.toggleSlowMotion();
      expect(service.replayPlaybackSpeed, equals(0.5));

      // Возвращаем в 1.0x
      service.toggleSlowMotion();
      expect(service.replayPlaybackSpeed, equals(1.0));
    });

    test('seekReplay shifts offset and jumps to live when reaching end of replay window', () {
      final service = StreamReplayBufferService();
      service.startInstantReplay(10.0);

      // Перемотка вперед на 5с (осталось 5с)
      service.seekReplay(5.0);
      expect(service.isReplayActive, isTrue);
      expect(service.replayOffsetSeconds, equals(5.0));

      // Перемотка еще на 5с (достигли 0с) -> авто-выход в прямой эфир
      service.seekReplay(5.0);
      expect(service.isReplayActive, isFalse);
      expect(service.replayOffsetSeconds, equals(0.0));
    });

    test('exitReplayAndJumpToLive completely resets buffer state', () {
      final service = StreamReplayBufferService();
      service.startInstantReplay(30.0);
      service.toggleSlowMotion(); // 0.5x

      service.exitReplayAndJumpToLive();
      expect(service.isReplayActive, isFalse);
      expect(service.replayOffsetSeconds, equals(0.0));
      expect(service.replayPlaybackSpeed, equals(1.0));
    });

    test('generateClipMarkers returns valid metadata dictionary', () {
      final service = StreamReplayBufferService();
      service.startInstantReplay(30.0);

      final clipData = service.generateClipMarkers();
      expect(clipData['durationSeconds'], equals(30.0));
      expect(clipData['clipTitle'], contains('-0:30'));
      expect(clipData['createdAt'], isNotEmpty);
    });
  });
}
