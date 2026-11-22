import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/models/vod_clip_item.dart';
import '../lib/features/stream/domain/services/vod_clips_service.dart';

void main() {
  group('VodClipItem Model Tests', () {
    test('Formats duration correctly across hours, minutes, and seconds', () {
      const longVod = VodClipItem(
        id: '1',
        title: 'Long Stream',
        streamerName: 'test',
        category: 'IRL',
        type: VodClipType.vod,
        durationSeconds: 14820, // 4ч 7м
        viewsCount: 1000,
        createdAtFormatted: 'Вчера',
        videoUrl: 'https://video.test/1.m3u8',
      );
      expect(longVod.formattedDuration, equals('4ч 7м'));

      const midVod = VodClipItem(
        id: '2',
        title: 'Short VOD',
        streamerName: 'test',
        category: 'IRL',
        type: VodClipType.vod,
        durationSeconds: 125, // 2:05
        viewsCount: 1000,
        createdAtFormatted: 'Вчера',
        videoUrl: 'https://video.test/2.m3u8',
      );
      expect(midVod.formattedDuration, equals('2:05'));

      const shortClip = VodClipItem(
        id: '3',
        title: 'Fast Clip',
        streamerName: 'test',
        category: 'IRL',
        type: VodClipType.clip,
        durationSeconds: 38,
        viewsCount: 500,
        createdAtFormatted: 'Сегодня',
        videoUrl: 'https://video.test/3.mp4',
      );
      expect(shortClip.formattedDuration, equals('38с'));
    });

    test('Formats views count correctly for K and M thresholds', () {
      const millionItem = VodClipItem(
        id: '1',
        title: 'Viral Clip',
        streamerName: 'test',
        category: 'Games',
        type: VodClipType.clip,
        durationSeconds: 30,
        viewsCount: 1420000,
        createdAtFormatted: 'Вчера',
        videoUrl: 'https://video.test/1.mp4',
      );
      expect(millionItem.formattedViews, equals('1.4M'));

      const thousandItem = VodClipItem(
        id: '2',
        title: 'Popular Stream',
        streamerName: 'test',
        category: 'Games',
        type: VodClipType.vod,
        durationSeconds: 3600,
        viewsCount: 184500,
        createdAtFormatted: 'Вчера',
        videoUrl: 'https://video.test/2.m3u8',
      );
      expect(thousandItem.formattedViews, equals('184.5K'));

      const smallItem = VodClipItem(
        id: '3',
        title: 'Small Clip',
        streamerName: 'test',
        category: 'Games',
        type: VodClipType.clip,
        durationSeconds: 20,
        viewsCount: 450,
        createdAtFormatted: 'Сегодня',
        videoUrl: 'https://video.test/3.mp4',
      );
      expect(smallItem.formattedViews, equals('450'));
    });

    test('Progress percentage calculates accurately', () {
      const item = VodClipItem(
        id: '1',
        title: 'VOD',
        streamerName: 'test',
        category: 'Games',
        type: VodClipType.vod,
        durationSeconds: 1000,
        viewsCount: 10,
        createdAtFormatted: 'Вчера',
        videoUrl: 'https://video.test/1.m3u8',
        savedProgressSeconds: 500,
      );
      expect(item.progressPercentage, equals(0.5));
    });
  });

  group('VodClipsService Tests', () {
    test('Returns items for streamer and filters by type', () {
      final service = VodClipsService();

      final allBuda = service.getItemsForStreamer('buda');
      expect(allBuda.length, greaterThanOrEqualTo(3));

      // Фильтр только VOD
      service.setFilterType(VodClipType.vod);
      final vodsOnly = service.getItemsForStreamer('buda');
      expect(vodsOnly.every((i) => i.type == VodClipType.vod), isTrue);

      // Фильтр только Клипы
      service.setFilterType(VodClipType.clip);
      final clipsOnly = service.getItemsForStreamer('buda');
      expect(clipsOnly.every((i) => i.type == VodClipType.clip), isTrue);

      // Сброс фильтра
      service.setFilterType(null);
      expect(service.getItemsForStreamer('buda').length, equals(allBuda.length));
    });

    test('Search query filters by title or category', () {
      final service = VodClipsService();

      service.setSearchQuery('марафон');
      final results = service.getItemsForStreamer('buda');
      expect(results.length, equals(1));
      expect(results.first.title, contains('марафон'));

      service.setSearchQuery('');
      expect(service.getItemsForStreamer('buda').length, greaterThan(1));
    });

    test('Sorting orders items by views count or date', () {
      final service = VodClipsService();

      service.setSortOrder(VodClipSortOrder.mostViewed);
      final mostViewed = service.getItemsForStreamer('buda');
      for (int i = 0; i < mostViewed.length - 1; i++) {
        expect(mostViewed[i].viewsCount, greaterThanOrEqualTo(mostViewed[i + 1].viewsCount));
      }
    });

    test('Saves and clears watch progress', () {
      final service = VodClipsService();
      bool notified = false;
      service.addListener(() => notified = true);

      service.saveProgress('vod_buda_01', 3600);
      expect(notified, isTrue);

      final items = service.getItemsForStreamer('buda');
      final target = items.firstWhere((i) => i.id == 'vod_buda_01');
      expect(target.savedProgressSeconds, equals(3600));

      service.clearProgress('vod_buda_01');
      final updated = service.getItemsForStreamer('buda');
      final cleared = updated.firstWhere((i) => i.id == 'vod_buda_01');
      expect(cleared.savedProgressSeconds, equals(0));
    });
  });
}
