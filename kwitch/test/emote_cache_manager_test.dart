import 'package:flutter_test/flutter_test.dart';
import '../lib/features/chat/domain/services/emote_cache_manager.dart';

void main() {
  group('Emote Cache Manager LRU Tests (Zero-Lag Rendering)', () {
    test('put and get store and retrieve cached emote entries', () {
      final cache = EmoteCacheManager();
      expect(cache.totalCachedEmotes, equals(0));

      cache.put(id: 'catjam', name: 'catJAM', provider: '7TV', byteSize: 15000);
      expect(cache.has('catJAM'), isTrue);

      final entry = cache.get('catJAM');
      expect(entry, isNotNull);
      expect(entry?.name, equals('catJAM'));
      expect(cache.cacheHits, equals(1));
      expect(cache.cacheMisses, equals(0));

      // Проверка промаха кэша
      final missing = cache.get('non_existent');
      expect(missing, isNull);
      expect(cache.cacheMisses, equals(1));
    });

    test('preloadDefaultEmotes populates top 12 emotes for instant rendering', () {
      final cache = EmoteCacheManager();
      cache.preloadDefaultEmotes();

      expect(cache.totalCachedEmotes, equals(12));
      expect(cache.has('catjam'), isTrue);
      expect(cache.has('pogu'), isTrue);
      expect(cache.has('kekw'), isTrue);
      expect(cache.has('ayaya'), isTrue);
    });

    test('clear empties cache and resets metrics', () {
      final cache = EmoteCacheManager();
      cache.preloadDefaultEmotes();
      expect(cache.totalCachedEmotes, greaterThan(0));

      cache.clear();
      expect(cache.totalCachedEmotes, equals(0));
      expect(cache.currentSizeBytes, equals(0));
      expect(cache.cacheHits, equals(0));
    });
  });
}
