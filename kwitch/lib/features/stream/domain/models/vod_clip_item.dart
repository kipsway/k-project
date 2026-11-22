/// Тип медиаконтента: полная запись стрима (VOD) или хайлайт/клип
enum VodClipType { vod, clip }

/// Модель записи стрима или клипа в kWitch
class VodClipItem {
  final String id;
  final String title;
  final String streamerName;
  final String category;
  final VodClipType type;
  final int durationSeconds;
  final int viewsCount;
  final String createdAtFormatted;
  final String? thumbnailUrl;
  final String videoUrl;
  final int savedProgressSeconds; // Сохраненный прогресс просмотра

  const VodClipItem({
    required this.id,
    required this.title,
    required this.streamerName,
    required this.category,
    required this.type,
    required this.durationSeconds,
    required this.viewsCount,
    required this.createdAtFormatted,
    this.thumbnailUrl,
    required this.videoUrl,
    this.savedProgressSeconds = 0,
  });

  /// Форматированная длительность (например: 3ч 45м или 45с)
  String get formattedDuration {
    if (durationSeconds < 60) {
      return '${durationSeconds}с';
    }
    final minutes = (durationSeconds / 60).floor();
    final seconds = durationSeconds % 60;
    if (minutes < 60) {
      return '$minutes:${seconds.toString().padLeft(2, '0')}';
    }
    final hours = (minutes / 60).floor();
    final remMinutes = minutes % 60;
    return '${hours}ч ${remMinutes}м';
  }

  /// Форматированное число просмотров (например: 142.5K или 1.2M)
  String get formattedViews {
    if (viewsCount >= 1000000) {
      return '${(viewsCount / 1000000).toStringAsFixed(1)}M';
    }
    if (viewsCount >= 1000) {
      return '${(viewsCount / 1000).toStringAsFixed(1)}K';
    }
    return '$viewsCount';
  }

  /// Процент завершенности просмотра (0.0 .. 1.0)
  double get progressPercentage {
    if (durationSeconds <= 0 || savedProgressSeconds <= 0) return 0.0;
    return (savedProgressSeconds / durationSeconds).clamp(0.0, 1.0);
  }

  VodClipItem copyWith({
    int? savedProgressSeconds,
  }) {
    return VodClipItem(
      id: id,
      title: title,
      streamerName: streamerName,
      category: category,
      type: type,
      durationSeconds: durationSeconds,
      viewsCount: viewsCount,
      createdAtFormatted: createdAtFormatted,
      thumbnailUrl: thumbnailUrl,
      videoUrl: videoUrl,
      savedProgressSeconds: savedProgressSeconds ?? this.savedProgressSeconds,
    );
  }
}
