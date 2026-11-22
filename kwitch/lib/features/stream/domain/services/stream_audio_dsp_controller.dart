import 'package:flutter/foundation.dart';

/// Пресеты цифровой обработки звука (Audio DSP) для kWitch
enum AudioDspPreset {
  flat(
    id: 'flat',
    label: 'Стандарт',
    description: 'Исходный звук без частотной коррекции',
    vocalBoostDb: 0.0,
    bassCutDb: 0.0,
    compressionRatio: 1.0,
  ),
  speechClarity(
    id: 'speech_clarity',
    label: 'Четкий голос',
    description: 'Усиление речи стримера (1.5–3.5 кГц) и срез гулкого баса игр',
    vocalBoostDb: 6.0,
    bassCutDb: -8.0,
    compressionRatio: 1.4,
  ),
  nightMode(
    id: 'night_mode',
    label: 'Ночной режим',
    description: 'Компрессия пиков: сглаживает крики и громкие донаты',
    vocalBoostDb: 3.0,
    bassCutDb: -4.0,
    compressionRatio: 2.5,
  ),
  bassBoost(
    id: 'bass_boost',
    label: 'Насыщенный бас',
    description: 'Глубокий низ для музыкальных стримов и атмосферы',
    vocalBoostDb: 0.0,
    bassCutDb: 0.0,
    compressionRatio: 1.0,
  );

  final String id;
  final String label;
  final String description;
  final double vocalBoostDb;
  final double bassCutDb;
  final double compressionRatio;

  const AudioDspPreset({
    required this.id,
    required this.label,
    required this.description,
    required this.vocalBoostDb,
    required this.bassCutDb,
    required this.compressionRatio,
  });
}

/// Контроллер аудиопроцессора (DSP) для мобильных наушников и динамиков
class StreamAudioDspController extends ChangeNotifier {
  bool _isEnabled = true;
  AudioDspPreset _currentPreset = AudioDspPreset.speechClarity;
  double _customVocalBoostDb = 6.0;
  double _customBassCutDb = -8.0;
  double _customCompressionRatio = 1.4;

  bool get isEnabled => _isEnabled;
  AudioDspPreset get currentPreset => _currentPreset;
  double get vocalBoostDb => _isEnabled ? _customVocalBoostDb : 0.0;
  double get bassCutDb => _isEnabled ? _customBassCutDb : 0.0;
  double get compressionRatio => _isEnabled ? _customCompressionRatio : 1.0;

  /// Включение / выключение DSP-обработки
  void toggleDsp([bool? enabled]) {
    final newState = enabled ?? !_isEnabled;
    if (_isEnabled == newState) return;
    _isEnabled = newState;
    notifyListeners();
  }

  /// Применение готового пресета
  void setPreset(AudioDspPreset preset) {
    _currentPreset = preset;
    _customVocalBoostDb = preset.vocalBoostDb;
    _customBassCutDb = preset.bassCutDb;
    _customCompressionRatio = preset.compressionRatio;
    _isEnabled = true;
    notifyListeners();
  }

  /// Пользовательская регулировка усиления голоса (-6 до +12 dB)
  void setVocalBoost(double db) {
    _customVocalBoostDb = db.clamp(-6.0, 12.0);
    _checkCustomPreset();
    notifyListeners();
  }

  /// Пользовательская регулировка среза баса (-14 до 0 dB)
  void setBassCut(double db) {
    _customBassCutDb = db.clamp(-14.0, 0.0);
    _checkCustomPreset();
    notifyListeners();
  }

  /// Регулировка сжатия динамического диапазона (1.0x до 3.0x)
  void setCompressionRatio(double ratio) {
    _customCompressionRatio = ratio.clamp(1.0, 3.0);
    _checkCustomPreset();
    notifyListeners();
  }

  void _checkCustomPreset() {
    for (final p in AudioDspPreset.values) {
      if (p.vocalBoostDb == _customVocalBoostDb &&
          p.bassCutDb == _customBassCutDb &&
          p.compressionRatio == _customCompressionRatio) {
        _currentPreset = p;
        return;
      }
    }
  }

  /// Сброс настроек эквалайзера к стандартным
  void resetToFlat() {
    setPreset(AudioDspPreset.flat);
  }
}
