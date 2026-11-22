import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/services/stream_bookmarks_service.dart';

void main() {
  group('StreamBookmarksService & StreamBookmarkItem Tests', () {
    test('addBookmark creates bookmark with accurate timestamp and metadata', () {
      final service = StreamBookmarksService();
      int notifyCount = 0;
      service.addListener(() => notifyCount++);

      // Закладка на 1 час 24 минуты 35 секунд (5075 секунд)
      final bm = service.addBookmark(
        streamerName: 'buda',
        categoryName: 'Just Chatting',
        timestampSeconds: 5075,
        title: 'Смешной донат',
        note: 'Реакция на клип',
      );

      expect(service.count, equals(1));
      expect(bm.streamerName, equals('buda'));
      expect(bm.formattedTimestamp, equals('01:24:35'));
      expect(bm.title, equals('Смешной донат'));
      expect(bm.note, equals('Реакция на клип'));
      expect(bm.shareUrl, equals('https://twitch.tv/buda?t=1h24m35s'));
      expect(notifyCount, equals(1));
    });

    test('Short timestamps under 1 hour are formatted without 00h', () {
      final service = StreamBookmarksService();

      // Закладка на 5 минут 12 секунд (312 секунд)
      final bm = service.addBookmark(
        streamerName: 'bratishkinoff',
        categoryName: 'Special Events',
        timestampSeconds: 312,
      );

      expect(bm.formattedTimestamp, equals('05:12'));
      expect(bm.shareUrl, equals('https://twitch.tv/bratishkinoff?t=0h5m12s'));
    });

    test('getBookmarksForStreamer filters bookmarks per channel accurately', () {
      final service = StreamBookmarksService();

      service.addBookmark(
        streamerName: 'buda',
        categoryName: 'Just Chatting',
        timestampSeconds: 100,
      );
      service.addBookmark(
        streamerName: 'buda',
        categoryName: 'Just Chatting',
        timestampSeconds: 500,
      );
      service.addBookmark(
        streamerName: 'nix',
        categoryName: 'Dota 2',
        timestampSeconds: 300,
      );

      final budaBookmarks = service.getBookmarksForStreamer('buda');
      final nixBookmarks = service.getBookmarksForStreamer('nix');

      expect(budaBookmarks.length, equals(2));
      expect(nixBookmarks.length, equals(1));
      expect(budaBookmarks.every((b) => b.streamerName == 'buda'), isTrue);
    });

    test('removeBookmark and clearAll manage bookmark list accurately', () {
      final service = StreamBookmarksService();

      final bm1 = service.addBookmark(
        streamerName: 'buda',
        categoryName: 'Just Chatting',
        timestampSeconds: 100,
      );
      final bm2 = service.addBookmark(
        streamerName: 'buda',
        categoryName: 'Just Chatting',
        timestampSeconds: 200,
      );

      expect(service.count, equals(2));

      service.removeBookmark(bm1.id);
      expect(service.count, equals(1));
      expect(service.bookmarks.first.id, equals(bm2.id));

      service.clearAll();
      expect(service.count, equals(0));
    });
  });
}
