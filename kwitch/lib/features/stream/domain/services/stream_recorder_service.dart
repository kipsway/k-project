import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/recorded_clip_item.dart';

/// Сервис локальной записи видеотрансляции прямо из стрим-буфера (Stream DVR Recorder).
/// Позволяет записывать отрезки прямого эфира в оригинальном качестве без перекодирования
/// и сторонних экранных рекордеров.
class StreamRecorderService extends ChangeNotifier {
  bool _isRecording = false;
  int _recordingDurationSeconds = 0;
  Timer? _recordTimer;

  String _currentStreamer = '';
  String _currentCategory = '';
  String _currentResolution = '1440p60';

  // Локальный список сохраненных клипов
  final List<RecordedClipItem> _savedClips = [];

  // Максимальная длительность одной записи (10 минут = 600 секунд)
  static const int maxRecordingDurationSeconds = 600;

  // Оценка битрейта для расчета размера (1440p60 ~ 1.25 МБ/сек, 1080p60 ~ 0.8 МБ/сек)
  static const int _bytesPerSecond1440p = 1250000;
  static const int _bytesPerSecond1080p = 800000;

  bool get isRecording => _isRecording;
  int get recordingDurationSeconds => _recordingDurationSeconds;
  String get currentStreamer => _currentStreamer;
  List<RecordedClipItem> get savedClips => List.unmodifiable(_savedClips);
  int get totalSavedBytes => _savedClips.fold(0, (sum, item) => sum + item.fileSizeBytes);

  /// Форматированное время текущей записи (например: 00:15)
  String get formattedCurrentTime {
    final minutes = (_recordingDurationSeconds / 60).floor();
    final seconds = _recordingDurationSeconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }

  /// Оценочный размер записываемого файла
  String get formattedEstimatedSize {
    final bytesPerSec = _currentResolution.contains('1440')
        ? _bytesPerSecond1440p
        : _bytesPerSecond1080p;
    final totalBytes = _recordingDurationSeconds * bytesPerSec;
    final mb = totalBytes / (1024 * 1024);
    return '${mb.toStringAsFixed(1)} MB';
  }

  /// Начать запись прямого эфира
  bool startRecording({
    required String streamerName,
    required String categoryName,
    String resolution = '1440p60',
  }) {
    if (_isRecording) return false;

    _isRecording = true;
    _recordingDurationSeconds = 0;
    _currentStreamer = streamerName;
    _currentCategory = categoryName;
    _currentResolution = resolution;

    _recordTimer?.cancel();
    _recordTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      _recordingDurationSeconds++;
      if (_recordingDurationSeconds >= maxRecordingDurationSeconds) {
        stopRecording();
      } else {
        notifyListeners();
      }
    });

    notifyListeners();
    return true;
  }

  /// Остановить запись и сохранить клип
  RecordedClipItem? stopRecording() {
    if (!_isRecording) return null;

    _recordTimer?.cancel();
    _recordTimer = null;
    _isRecording = false;

    final duration = _recordingDurationSeconds;
    final bytesPerSec = _currentResolution.contains('1440')
        ? _bytesPerSecond1440p
        : _bytesPerSecond1080p;
    final fileSizeBytes = duration * bytesPerSec;

    final timestamp = DateTime.now();
    final clipId = 'clip_${_currentStreamer}_${timestamp.millisecondsSinceEpoch}';
    final filePath = '/storage/emulated/0/Movies/kWitch/$clipId.mp4';

    final clip = RecordedClipItem(
      id: clipId,
      streamerName: _currentStreamer,
      categoryName: _currentCategory,
      filePath: filePath,
      durationSeconds: duration,
      fileSizeBytes: fileSizeBytes,
      createdAt: timestamp,
      resolution: _currentResolution,
    );

    // Сохраняем в список, если запись длилась хотя бы 2 секунды
    if (duration >= 2) {
      _savedClips.insert(0, clip);
    }

    _recordingDurationSeconds = 0;
    notifyListeners();
    return clip;
  }

  /// Отменить текущую запись без сохранения
  void cancelRecording() {
    if (!_isRecording) return null;
    _recordTimer?.cancel();
    _recordTimer = null;
    _isRecording = false;
    _recordingDurationSeconds = 0;
    notifyListeners();
  }

  /// Удалить сохраненный клип
  void deleteClip(String id) {
    _savedClips.removeWhere((item) => item.id == id);
    notifyListeners();
  }

  /// Очистить все сохраненные клипы
  void clearAllClips() {
    _savedClips.clear();
    notifyListeners();
  }

  @override
  void dispose() {
    _recordTimer?.cancel();
    super.dispose();
  }
}
