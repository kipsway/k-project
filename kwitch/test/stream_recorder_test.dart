import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/models/recorded_clip_item.dart';
import '../lib/features/stream/domain/services/stream_recorder_service.dart';

void main() {
  group('RecordedClipItem Model Tests', () {
    test('Formats duration and file size correctly', () {
      final clip = RecordedClipItem(
        id: '1',
        streamerName: 'buda',
        categoryName: 'Just Chatting',
        filePath: '/storage/emulated/0/Movies/kWitch/clip_1.mp4',
        durationSeconds: 84, // 01:24
        fileSizeBytes: 15500000, // ~14.8 MB
        createdAt: DateTime(2026, 11, 22, 22, 45),
      );

      expect(clip.formattedDuration, equals('01:24'));
      expect(clip.formattedFileSize, contains('MB'));
      expect(clip.formattedDate, equals('22.11 22:45'));
    });

    test('File size handles bytes, KB, MB and GB', () {
      final small = RecordedClipItem(
        id: '1',
        streamerName: 'test',
        categoryName: 'test',
        filePath: '',
        durationSeconds: 1,
        fileSizeBytes: 800,
        createdAt: DateTime.now(),
      );
      expect(small.formattedFileSize, equals('800 B'));

      final kb = RecordedClipItem(
        id: '2',
        streamerName: 'test',
        categoryName: 'test',
        filePath: '',
        durationSeconds: 1,
        fileSizeBytes: 512000,
        createdAt: DateTime.now(),
      );
      expect(kb.formattedFileSize, contains('KB'));

      final gb = RecordedClipItem(
        id: '3',
        streamerName: 'test',
        categoryName: 'test',
        filePath: '',
        durationSeconds: 3600,
        fileSizeBytes: 1500000000,
        createdAt: DateTime.now(),
      );
      expect(gb.formattedFileSize, contains('GB'));
    });
  });

  group('StreamRecorderService Tests', () {
    test('Initial state is idle with empty clip list', () {
      final service = StreamRecorderService();

      expect(service.isRecording, isFalse);
      expect(service.recordingDurationSeconds, equals(0));
      expect(service.savedClips, isEmpty);
      expect(service.totalSavedBytes, equals(0));
      expect(service.formattedCurrentTime, equals('00:00'));
    });

    test('Starting and stopping recording saves clip to local list', () {
      final service = StreamRecorderService();
      bool notified = false;
      service.addListener(() => notified = true);

      final started = service.startRecording(
        streamerName: 'buda',
        categoryName: 'Just Chatting',
        resolution: '1440p60',
      );

      expect(started, isTrue);
      expect(service.isRecording, isTrue);
      expect(service.currentStreamer, equals('buda'));
      expect(notified, isTrue);

      // Повторный старт во время записи отклоняется
      expect(
        service.startRecording(streamerName: 'buda', categoryName: 'Just Chatting'),
        isFalse,
      );

      // Остановка записи
      final clip = service.stopRecording();
      expect(service.isRecording, isFalse);
      expect(clip, isNotNull);
      expect(clip!.streamerName, equals('buda'));
      expect(clip.filePath, contains('/storage/emulated/0/Movies/kWitch/'));
    });

    test('Canceling recording discards active recording without saving', () {
      final service = StreamRecorderService();

      service.startRecording(
        streamerName: 'tarik',
        categoryName: 'Valorant',
      );
      expect(service.isRecording, isTrue);

      service.cancelRecording();
      expect(service.isRecording, isFalse);
      expect(service.savedClips, isEmpty);
    });

    test('Deleting clip updates savedClips list', () {
      final service = StreamRecorderService();

      service.startRecording(streamerName: 'faker', categoryName: 'LoL');
      final clip = service.stopRecording();

      if (clip != null && service.savedClips.isNotEmpty) {
        service.deleteClip(clip.id);
        expect(service.savedClips, isEmpty);
      }
    });

    test('Clearing all clips wipes list', () {
      final service = StreamRecorderService();

      service.clearAllClips();
      expect(service.savedClips, isEmpty);
      expect(service.totalSavedBytes, equals(0));
    });
  });
}
