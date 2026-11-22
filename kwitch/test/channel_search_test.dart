import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/models/twitch_channel_item.dart';

void main() {
  group('TwitchChannelItem & Search Filter Tests', () {
    test('featuredChannels contains valid pre-seeded channels with correct flags', () {
      final channels = TwitchChannelItem.featuredChannels;
      expect(channels, isNotEmpty);
      expect(channels.length, greaterThanOrEqualTo(5));

      final buda = channels.firstWhere((c) => c.id == 'buda');
      expect(buda.displayName, equals('buda'));
      expect(buda.isFollowed, isTrue);
      expect(buda.isLive, isTrue);
      expect(buda.viewerCount, greaterThan(40000));
    });

    test('Filtering by followed tab accurately subsets channels', () {
      final allChannels = TwitchChannelItem.featuredChannels;
      final followed = allChannels.where((c) => c.isFollowed).toList();
      final nonFollowed = allChannels.where((c) => !c.isFollowed).toList();

      expect(followed.length, equals(3));
      expect(nonFollowed.length, equals(2));
      expect(followed.any((c) => c.id == 'buda'), isTrue);
      expect(followed.any((c) => c.id == 'bratishkinoff'), isTrue);
      expect(followed.any((c) => c.id == 'evelone192'), isTrue);
      expect(nonFollowed.any((c) => c.id == 'nix'), isTrue);
    });

    test('Filtering by search query matches channel displayName or category', () {
      final allChannels = TwitchChannelItem.featuredChannels;

      // Поиск по категории 'Dota'
      final dotaChannels = allChannels.where((c) =>
          c.displayName.toLowerCase().contains('dota') ||
          c.category.toLowerCase().contains('dota')).toList();
      expect(dotaChannels.length, equals(2));
      expect(dotaChannels.any((c) => c.id == 'nix'), isTrue);
      expect(dotaChannels.any((c) => c.id == 'stray228'), isTrue);

      // Поиск по имени 'Bratishkin'
      final bratishkin = allChannels.where((c) =>
          c.displayName.toLowerCase().contains('bratishkin') ||
          c.category.toLowerCase().contains('bratishkin')).toList();
      expect(bratishkin.length, equals(1));
      expect(bratishkin.first.id, equals('bratishkinoff'));
    });
  });
}
