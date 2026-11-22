import 'package:flutter_test/flutter_test.dart';
import '../lib/features/chat/domain/services/emote_index_service.dart';

void main() {
  group('Emote Autocomplete Tests (Chatterino+ Colon Trigger :)', () {
    test('Prefix search :cat returns catJAM with 7TV provider', () {
      final index = EmoteIndexService();
      final results = index.search(':cat');

      expect(results.isNotEmpty, isTrue);
      expect(results.first.name, equals('catJAM'));
      expect(results.first.provider, equals('7TV'));
      expect(results.first.isAnimated, isTrue);
    });

    test('Prefix search :pog returns PogU and Pog', () {
      final index = EmoteIndexService();
      final results = index.search(':pog');

      final names = results.map((e) => e.name).toList();
      expect(names, contains('PogU'));
      expect(names, contains('Pog'));
    });

    test('Empty prefix : returns top popular emotes', () {
      final index = EmoteIndexService();
      final results = index.search(':');

      expect(results.length, equals(6));
      expect(results.first.name, equals('KEKW')); // Самый высокий usageCount = 50
    });

    test('recordUsage dynamically promotes emote to top rank', () {
      final index = EmoteIndexService();
      // Повышаем популярность PepeLa 100 раз
      for (int i = 0; i < 100; i++) {
        index.recordUsage('PepeLa');
      }

      final top = index.search(':');
      expect(top.first.name, equals('PepeLa'));
    });
  });
}
