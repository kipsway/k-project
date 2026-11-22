import 'package:flutter/foundation.dart';
import '../models/stream_bookmark_item.dart';

/// Сервис закладок и таймкодов моментов стрима в kWitch
class StreamBookmarksService extends ChangeNotifier {
  final List<StreamBookmarkItem> _bookmarks = [];

  List<StreamBookmarkItem> get bookmarks => List.unmodifiable(_bookmarks);

  int get count => _bookmarks.length;

  /// Добавление новой закладки
  StreamBookmarkItem addBookmark({
    required String streamerName,
    required String categoryName,
    required int timestampSeconds,
    String? title,
    String? note,
  }) {
    final item = StreamBookmarkItem(
      id: 'bm_${DateTime.now().millisecondsSinceEpoch}',
      streamerName: streamerName.toLowerCase(),
      categoryName: categoryName,
      timestampSeconds: timestampSeconds > 0 ? timestampSeconds : 1,
      title: title?.trim().isNotEmpty == true
          ? title!.trim()
          : 'Момент стрима #$_nextIndex',
      note: note?.trim() ?? '',
      createdAt: DateTime.now(),
    );

    _bookmarks.insert(0, item);
    notifyListeners();
    return item;
  }

  int get _nextIndex => _bookmarks.length + 1;

  /// Удаление закладки
  void removeBookmark(String id) {
    _bookmarks.removeWhere((b) => b.id == id);
    notifyListeners();
  }

  /// Получение закладок для конкретного стримера
  List<StreamBookmarkItem> getBookmarksForStreamer(String streamerName) {
    final clean = streamerName.toLowerCase();
    return _bookmarks.where((b) => b.streamerName == clean).toList();
  }

  /// Очистка всех закладок
  void clearAll() {
    _bookmarks.clear();
    notifyListeners();
  }
}
