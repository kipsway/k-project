import 'dart:collection';
import 'package:flutter/foundation.dart';

class CachedEmoteEntry {
  final String id;
  final String name;
  final String provider; // '7TV', 'BTTV', 'FFZ'
  final Uint8List? rawBytes;
  final int byteSize;
  final DateTime cachedAt;
  int hitCount;

  CachedEmoteEntry({
    required this.id,
    required this.name,
    required this.provider,
    this.rawBytes,
    required this.byteSize,
    required this.cachedAt,
    this.hitCount = 1,
  });
}

/// Высокопроизводительный LRU-кэш графических ассетов смайлов (Zero-Lag Emote Rendering)
class EmoteCacheManager extends ChangeNotifier {
  static const int maxCacheEntries = 2000;
  static const int maxCacheSizeBytes = 250 * 1024 * 1024; // 250 МБ

  final LinkedHashMap<String, CachedEmoteEntry> _cache = LinkedHashMap();
  int _currentSizeBytes = 0;
  int _cacheHits = 0;
  int _cacheMisses = 0;

  int get totalCachedEmotes => _cache.length;
  int get currentSizeBytes => _currentSizeBytes;
  int get cacheHits => _cacheHits;
  int get cacheMisses => _cacheMisses;

  double get hitRatePercentage {
    final total = _cacheHits + _cacheMisses;
    return total > 0 ? (_cacheHits / total) * 100 : 100.0;
  }

  String get formattedCacheSize {
    final mb = _currentSizeBytes / (1024 * 1024);
    return '${mb.toStringAsFixed(1)} МБ';
  }

  /// Проверка наличия смайла в локальном кэше
  bool has(String emoteId) {
    return _cache.containsKey(emoteId.toLowerCase());
  }

  /// Получение кэшированного смайла с обновлением LRU-позиции
  CachedEmoteEntry? get(String emoteId) {
    final key = emoteId.toLowerCase();
    if (_cache.containsKey(key)) {
      _cacheHits++;
      final entry = _cache.remove(key)!;
      entry.hitCount++;
      _cache[key] = entry; // Перемещаем в конец (самый свежий)
      notifyListeners();
      return entry;
    }
    _cacheMisses++;
    notifyListeners();
    return null;
  }

  /// Сохранение смайла в локальный кэш с автоматической очисткой LRU
  void put({
    required String id,
    required String name,
    required String provider,
    Uint8List? bytes,
    int byteSize = 14500, // ~14 КБ средний размер WebP
  }) {
    final key = id.toLowerCase();

    // Если уже есть, вычитаем старый размер
    if (_cache.containsKey(key)) {
      _currentSizeBytes -= _cache[key]!.byteSize;
      _cache.remove(key);
    }

    // Вытесняем самые старые записи, если превышен лимит
    while (_cache.length >= maxCacheEntries ||
        (_currentSizeBytes + byteSize) > maxCacheSizeBytes) {
      if (_cache.isEmpty) break;
      final oldestKey = _cache.keys.first;
      final oldestEntry = _cache.remove(oldestKey);
      if (oldestEntry != null) {
        _currentSizeBytes -= oldestEntry.byteSize;
      }
    }

    final entry = CachedEmoteEntry(
      id: id,
      name: name,
      provider: provider,
      rawBytes: bytes,
      byteSize: byteSize,
      cachedAt: DateTime.now(),
    );

    _cache[key] = entry;
    _currentSizeBytes += byteSize;
    notifyListeners();
  }

  /// Предзагрузка дефолтного набора топ-смайлов для нулевой задержки
  void preloadDefaultEmotes() {
    final defaults = [
      ('catjam', 'catJAM', '7TV'),
      ('clap', 'Clap', '7TV'),
      ('pogu', 'PogU', '7TV'),
      ('monkaw', 'monkaW', '7TV'),
      ('kekw', 'KEKW', '7TV'),
      ('5head', '5Head', '7TV'),
      ('ez', 'EZ', '7TV'),
      ('pepela', 'PepeLa', '7TV'),
      ('lulw', 'LULW', 'BTTV'),
      ('monkas', 'monkaS', 'BTTV'),
      ('omegalul', 'OMEGALUL', 'BTTV'),
      ('ayaya', 'AYAYA', 'FFZ'),
    ];

    for (final item in defaults) {
      put(id: item.$1, name: item.$2, provider: item.$3);
    }
  }

  /// Полная очистка кэша
  void clear() {
    _cache.clear();
    _currentSizeBytes = 0;
    _cacheHits = 0;
    _cacheMisses = 0;
    notifyListeners();
  }
}
