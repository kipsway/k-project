import 'package:flutter/material.dart';

/// Режимы работы динамической эмбиент-подсветки Ambilight в kWitch
enum AmbientGlowMode {
  categoryAdaptive, // Адаптация под цветовую гамму текущей игры/категории
  chatterinoLavender, // Фирменный лавандовый акцент Chatterino+ (#B8A7F0)
  cyberpunkCyan, // Неоновый киберпанк / киберспорт (#00F0FF)
  warmSunset, // Теплый закат / камин для ночного отдыха (#FF8C42)
  emeraldClean, // Изумрудный эко-оттенок (#10B981)
}

/// Контроллер фоновой эмбиент-подсветки (Ambilight Glow) вокруг видеоплеера.
/// Снижает нагрузку на зрение при ночном просмотре и создает эффект парящего
/// экрана с кинематографичным рассеиванием света текущей трансляции.
class StreamAmbientGlowController extends ChangeNotifier {
  bool _isEnabled = true;
  double _intensity = 0.65; // 0.1 .. 1.0
  double _spreadRadius = 38.0; // 10.0 .. 60.0 dp
  AmbientGlowMode _mode = AmbientGlowMode.categoryAdaptive;
  String _currentCategory = 'Just Chatting';

  bool get isEnabled => _isEnabled;
  double get intensity => _intensity;
  double get spreadRadius => _spreadRadius;
  AmbientGlowMode get mode => _mode;
  String get currentCategory => _currentCategory;

  /// Вычисляет доминирующий цвет свечения на основе режима и текущей категории
  Color get activeGlowColor {
    if (!_isEnabled) return Colors.transparent;

    switch (_mode) {
      case AmbientGlowMode.chatterinoLavender:
        return const Color(0xFFB8A7F0).withOpacity(_intensity);
      case AmbientGlowMode.cyberpunkCyan:
        return const Color(0xFF00F0FF).withOpacity(_intensity * 0.9);
      case AmbientGlowMode.warmSunset:
        return const Color(0xFFFF8C42).withOpacity(_intensity * 0.9);
      case AmbientGlowMode.emeraldClean:
        return const Color(0xFF10B981).withOpacity(_intensity * 0.9);
      case AmbientGlowMode.categoryAdaptive:
        return _resolveCategoryColor(_currentCategory).withOpacity(_intensity);
    }
  }

  /// Цветовая гамма по категории/игре Twitch
  Color _resolveCategoryColor(String category) {
    final lower = category.toLowerCase();
    if (lower.contains('chatting') || lower.contains('irl') || lower.contains('talk')) {
      return const Color(0xFF9146FF); // Классический Twitch Purple
    } else if (lower.contains('valorant') || lower.contains('cs') || lower.contains('shooter')) {
      return const Color(0xFFFF4655); // Valorant / CS Red
    } else if (lower.contains('dota') || lower.contains('league') || lower.contains('moba')) {
      return const Color(0xFFE5A93C); // Dota / LoL Gold
    } else if (lower.contains('minecraft') || lower.contains('terraria')) {
      return const Color(0xFF5B8C5A); // Minecraft Moss Green
    } else if (lower.contains('cyberpunk') || lower.contains('gta')) {
      return const Color(0xFF00E5FF); // Neon Cyan
    } else if (lower.contains('horror') || lower.contains('dead')) {
      return const Color(0xFF8B0000); // Dark Blood Crimson
    } else {
      return const Color(0xFF7E6FC4); // Дефолтный акцент kWitch
    }
  }

  /// Обновление текущей категории трансляции для адаптивного режима
  void updateCategory(String category) {
    if (_currentCategory == category) return;
    _currentCategory = category;
    if (_mode == AmbientGlowMode.categoryAdaptive && _isEnabled) {
      notifyListeners();
    }
  }

  /// Включение / выключение подсветки
  void toggleGlow([bool? enabled]) {
    final newState = enabled ?? !_isEnabled;
    if (_isEnabled == newState) return;
    _isEnabled = newState;
    notifyListeners();
  }

  /// Установка интенсивности (яркости) подсветки (0.1 .. 1.0)
  void setIntensity(double val) {
    final clamped = val.clamp(0.1, 1.0);
    if ((_intensity - clamped).abs() < 0.01) return;
    _intensity = clamped;
    notifyListeners();
  }

  /// Установка радиуса рассеивания свечения (10.0 .. 60.0 dp)
  void setSpreadRadius(double val) {
    final clamped = val.clamp(10.0, 60.0);
    if ((_spreadRadius - clamped).abs() < 0.1) return;
    _spreadRadius = clamped;
    notifyListeners();
  }

  /// Выбор режима свечения
  void setMode(AmbientGlowMode newMode) {
    if (_mode == newMode) return;
    _mode = newMode;
    notifyListeners();
  }

  /// Читаемое имя режима
  String get modeDisplayName {
    switch (_mode) {
      case AmbientGlowMode.categoryAdaptive:
        return 'Адаптивный по игре ($currentCategory)';
      case AmbientGlowMode.chatterinoLavender:
        return 'Лаванда Chatterino+';
      case AmbientGlowMode.cyberpunkCyan:
        return 'Неоновый Киберпанк';
      case AmbientGlowMode.warmSunset:
        return 'Теплый камин (Ночь)';
      case AmbientGlowMode.emeraldClean:
        return 'Изумрудная матрица';
    }
  }
}
