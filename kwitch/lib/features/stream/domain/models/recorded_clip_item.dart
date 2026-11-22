/// Модель локально записанного фрагмента стрима (DVR Clip) в kWitch
class RecordedClipItem {
  final String id;
  final String streamerName;
  final String categoryName;
  final String filePath;
  final int durationSeconds;
  final int fileSizeBytes;
  final DateTime createdAt;
  final String resolution; // например: "1440p60" или "1080p60"

  const RecordedClipItem({
    required this.id,
    required this.streamerName,
    required this.categoryName,
    required this.filePath,
    required this.durationSeconds,
    required this.fileSizeBytes,
    required this.createdAt,
    this.resolution = '1440p60',
  });

  /// Форматированная длительность (например: 01:24 или 00:45)
  String get formattedDuration {
    final minutes = (durationSeconds / 60).floor();
    final seconds = durationSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  /// Форматированный размер файла (например: 14.8 MB)
  String get formattedFileSize {
    if (fileSizeBytes >= 1024 * 1024 * 1024) {
      return '${(fileSizeBytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
    }
    if (fileSizeBytes >= 1024 * 1024) {
      return '${(fileSizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    if (fileSizeBytes >= 1024) {
      return '${(fileSizeBytes / 1024).toStringAsFixed(0)} KB';
    }
    return '$fileSizeBytes B';
  }

  /// Читаемая дата создания (например: "22 нояб., 22:45")
  String get formattedDate {
    final day = createdAt.day.toString().padLeft(2, '0');
    final month = createdAt.month.toString().padLeft(2, '0');
    final hour = createdAt.hour.toString().padLeft(2, '0');
    final minute = createdAt.minute.toString().padLeft(2, '0');
    return '$day.$month $hour:$minute';
  }
}
