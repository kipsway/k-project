import '../models/chatterino_config.dart';

class IndexedEmote {
  final String name;
  final String provider;
  final String? url;
  final bool isAnimated;
  int usageCount;

  IndexedEmote({
    required this.name,
    required this.provider,
    this.url,
    this.isAnimated = false,
    this.usageCount = 0,
  });
}

/// Сервис индексирования и быстрого поиска смайлов по двоеточию `:`
class EmoteIndexService {
  final Map<String, IndexedEmote> _emotes = {};

  EmoteIndexService() {
    _populateDefaultEmotes();
  }

  void _populateDefaultEmotes() {
    final list = [
      // 7TV
      IndexedEmote(name: 'catJAM', provider: '7TV', isAnimated: true, usageCount: 42),
      IndexedEmote(name: 'Clap', provider: '7TV', isAnimated: true, usageCount: 38),
      IndexedEmote(name: 'monkaW', provider: '7TV', usageCount: 29),
      IndexedEmote(name: 'PogU', provider: '7TV', usageCount: 31),
      IndexedEmote(name: '5Head', provider: '7TV', usageCount: 15),
      IndexedEmote(name: 'PepeLa', provider: '7TV', usageCount: 19),
      IndexedEmote(name: 'EZ', provider: '7TV', usageCount: 22),
      IndexedEmote(name: 'KEKW', provider: '7TV', usageCount: 50),
      IndexedEmote(name: 'modCheck', provider: '7TV', isAnimated: true, usageCount: 12),
      IndexedEmote(name: 'pepeD', provider: '7TV', isAnimated: true, usageCount: 25),
      IndexedEmote(name: 'widepeepoHappy', provider: '7TV', usageCount: 27),
      IndexedEmote(name: 'Sadge', provider: '7TV', usageCount: 33),

      // BTTV
      IndexedEmote(name: 'LULW', provider: 'BTTV', usageCount: 18),
      IndexedEmote(name: 'monkaS', provider: 'BTTV', usageCount: 24),
      IndexedEmote(name: 'OMEGALUL', provider: 'BTTV', usageCount: 45),
      IndexedEmote(name: 'pepeJAM', provider: 'BTTV', isAnimated: true, usageCount: 16),

      // FFZ
      IndexedEmote(name: 'AYAYA', provider: 'FFZ', usageCount: 20),
      IndexedEmote(name: 'Pog', provider: 'FFZ', usageCount: 28),
      IndexedEmote(name: 'FeelsWeirdMan', provider: 'FFZ', usageCount: 14),
    ];

    for (final emote in list) {
      _emotes[emote.name.toLowerCase()] = emote;
    }
  }

  /// Поиск подходящих смайлов по префиксу после двоеточия (например: 'cat' из ':cat')
  List<IndexedEmote> search(String query, {int limit = 6}) {
    final clean = query.replaceAll(':', '').toLowerCase().trim();
    if (clean.isEmpty) {
      // При вводе просто ':' возвращаем топ самых популярных
      final sorted = _emotes.values.toList()
        ..sort((a, b) => b.usageCount.compareTo(a.usageCount));
      return sorted.take(limit).toList();
    }

    final matches = _emotes.values.where((e) {
      return e.name.toLowerCase().startsWith(clean);
    }).toList();

    // Сортировка по популярности
    matches.sort((a, b) => b.usageCount.compareTo(a.usageCount));
    return matches.take(limit).toList();
  }

  /// Увеличение счетчика популярности при выборе смайла
  void recordUsage(String emoteName) {
    final key = emoteName.toLowerCase();
    if (_emotes.containsKey(key)) {
      _emotes[key]!.usageCount++;
    }
  }
}
