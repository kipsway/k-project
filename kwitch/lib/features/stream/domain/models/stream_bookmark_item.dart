/// Модель закладки момента стрима в kWitch
class StreamBookmarkItem {
  final String id;
  final String streamerName;
  final String categoryName;
  final int timestampSeconds;
  final String title;
  final String note;
  final DateTime createdAt;

  const StreamBookmarkItem({
    required this.id,
    required this.streamerName,
    required this.categoryName,
    required this.timestampSeconds,
    required this.title,
    this.note = '',
    required this.createdAt,
  });

  /// Форматированное время стрима (например, "01:24:35")
  String get formattedTimestamp {
    final h = timestampSeconds ~/ 3600;
    final m = (timestampSeconds % 3600) ~/ 60;
    final s = timestampSeconds % 60;

    final hStr = h > 0 ? '${h.toString().padLeft(2, '0')}:' : '';
    final mStr = m.toString().padLeft(2, '0');
    final sStr = s.toString().padLeft(2, '0');
    return '$hStr$mStr:$sStr';
  }

  /// Ссылка с таймкодом для шаринга
  String get shareUrl {
    final h = timestampSeconds ~/ 3600;
    final m = (timestampSeconds % 3600) ~/ 60;
    final s = timestampSeconds % 60;
    final timeParam = '${h}h${m}m${s}s';
    return 'https://twitch.tv/$streamerName?t=$timeParam';
  }

  StreamBookmarkItem copyWith({
    String? title,
    String? note,
  }) {
    return StreamBookmarkItem(
      id: id,
      streamerName: streamerName,
      categoryName: categoryName,
      timestampSeconds: timestampSeconds,
      title: title ?? this.title,
      note: note ?? this.note,
      createdAt: createdAt,
    );
  }
}
