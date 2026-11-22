import 'package:flutter/foundation.dart';
import '../models/vod_clip_item.dart';

enum VodClipSortOrder { latest, mostViewed }

/// Сервис управления и быстрого просмотра записей стримов (VOD) и клипов в kWitch.
/// Поддерживает кэширование, поиск по названию, фильтрацию по типу,
/// сортировку и локальное сохранение прогресса просмотра.
class VodClipsService extends ChangeNotifier {
  VodClipType? _filterType; // null = все, vod = только VOD, clip = только клипы
  VodClipSortOrder _sortOrder = VodClipSortOrder.latest;
  String _searchQuery = '';
  final Map<String, int> _savedProgress = {}; // id -> секунды

  VodClipType? get filterType => _filterType;
  VodClipSortOrder get sortOrder => _sortOrder;
  String get searchQuery => _searchQuery;

  // Локальная база VOD и клипов каналов
  final List<VodClipItem> _allItems = [
    const VodClipItem(
      id: 'vod_buda_01',
      title: 'Большой марафон Just Chatting • Обсуждаем треки и мемы',
      streamerName: 'buda',
      category: 'Just Chatting',
      type: VodClipType.vod,
      durationSeconds: 14820, // 4ч 7м
      viewsCount: 184500,
      createdAtFormatted: 'Вчера',
      videoUrl: 'https://video.twitch.tv/vod/buda_01.m3u8',
    ),
    const VodClipItem(
      id: 'clip_buda_01',
      title: 'Случайно дропнул бит на 140 BPM 🔥',
      streamerName: 'buda',
      category: 'Just Chatting',
      type: VodClipType.clip,
      durationSeconds: 38,
      viewsCount: 52300,
      createdAtFormatted: '3 дня назад',
      videoUrl: 'https://clips.twitch.tv/clip_buda_01.mp4',
    ),
    const VodClipItem(
      id: 'clip_buda_02',
      title: 'Реакция на донат 100 000 рублей KEKW',
      streamerName: 'buda',
      category: 'Just Chatting',
      type: VodClipType.clip,
      durationSeconds: 52,
      viewsCount: 94100,
      createdAtFormatted: '5 дней назад',
      videoUrl: 'https://clips.twitch.tv/clip_buda_02.mp4',
    ),
    const VodClipItem(
      id: 'vod_buda_02',
      title: 'Ночной чилл и просмотр хайлайтов комьюнити',
      streamerName: 'buda',
      category: 'Just Chatting',
      type: VodClipType.vod,
      durationSeconds: 9340, // 2ч 35м
      viewsCount: 121000,
      createdAtFormatted: '4 дня назад',
      videoUrl: 'https://video.twitch.tv/vod/buda_02.m3u8',
    ),
    const VodClipItem(
      id: 'vod_bratishkin_01',
      title: 'Турнир стримеров по CS2 • Финальный плей-офф',
      streamerName: 'bratishkinoff',
      category: 'Counter-Strike 2',
      type: VodClipType.vod,
      durationSeconds: 19800, // 5ч 30м
      viewsCount: 312000,
      createdAtFormatted: 'Вчера',
      videoUrl: 'https://video.twitch.tv/vod/bratishkin_01.m3u8',
    ),
    const VodClipItem(
      id: 'clip_bratishkin_01',
      title: 'Безумный клатч 1 в 4 на B пленте Mirage!',
      streamerName: 'bratishkinoff',
      category: 'Counter-Strike 2',
      type: VodClipType.clip,
      durationSeconds: 44,
      viewsCount: 142000,
      createdAtFormatted: '2 дня назад',
      videoUrl: 'https://clips.twitch.tv/clip_bratishkin_01.mp4',
    ),
  ];

  /// Получить список элементов для конкретного стримера с учетом фильтра и поиска
  List<VodClipItem> getItemsForStreamer(String streamerName) {
    final lowerStreamer = streamerName.toLowerCase();
    var list = _allItems.where((item) {
      final matchesStreamer = item.streamerName.toLowerCase() == lowerStreamer ||
          lowerStreamer.contains(item.streamerName.toLowerCase());
      if (!matchesStreamer) return false;

      if (_filterType != null && item.type != _filterType) return false;

      if (_searchQuery.isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        final matchesQuery = item.title.toLowerCase().contains(q) ||
            item.category.toLowerCase().contains(q);
        if (!matchesQuery) return false;
      }

      return true;
    }).map((item) {
      if (_savedProgress.containsKey(item.id)) {
        return item.copyWith(savedProgressSeconds: _savedProgress[item.id]);
      }
      return item;
    }).toList();

    // Сортировка
    if (_sortOrder == VodClipSortOrder.mostViewed) {
      list.sort((a, b) => b.viewsCount.compareTo(a.viewsCount));
    } else {
      // Latest (по умолчанию)
      list.sort((a, b) => b.durationSeconds.compareTo(a.durationSeconds));
    }

    return list;
  }

  /// Установка фильтра по типу (Все / Только VOD / Только Клипы)
  void setFilterType(VodClipType? type) {
    if (_filterType == type) return;
    _filterType = type;
    notifyListeners();
  }

  /// Смена порядка сортировки
  void setSortOrder(VodClipSortOrder order) {
    if (_sortOrder == order) return;
    _sortOrder = order;
    notifyListeners();
  }

  /// Поиск по названию
  void setSearchQuery(String query) {
    if (_searchQuery == query) return;
    _searchQuery = query;
    notifyListeners();
  }

  /// Сохранение позиции воспроизведения
  void saveProgress(String id, int seconds) {
    if (_savedProgress[id] == seconds) return;
    _savedProgress[id] = seconds;
    notifyListeners();
  }

  /// Сброс прогресса просмотра
  void clearProgress(String id) {
    if (!_savedProgress.containsKey(id)) return;
    _savedProgress.remove(id);
    notifyListeners();
  }
}
