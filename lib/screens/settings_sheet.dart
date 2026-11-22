import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/colors.dart';
import '../theme/text_styles.dart';
import '../widgets/glass_container.dart';

/// Шторка настроек kStore (Liquid Glass Settings Sheet).
/// Открывается при нажатии на стеклянную кнопку настроек в шапке каталога.
class SettingsSheet extends StatefulWidget {
  const SettingsSheet({super.key});

  /// Статический метод для удобного открытия шторки настроек
  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withOpacity(0.65),
      builder: (context) => const SettingsSheet(),
    );
  }

  @override
  State<SettingsSheet> createState() => _SettingsSheetState();
}

class _SettingsSheetState extends State<SettingsSheet> {
  bool _autoCheckUpdates = true;
  bool _kTunnelEnabled = true;
  bool _notifyUpdates = true;
  String _selectedRegion = 'Авто (Европа, 42 мс)';
  int _cacheSizeMb = 94;

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          height: screenHeight * 0.85,
          decoration: BoxDecoration(
            color: KColors.panel.withOpacity(0.92),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
            border: const Border(
              top: BorderSide(
                color: Color(0x38FFFFFF), // Верхний оптический линзовый блик
                width: 1.2,
              ),
            ),
          ),
          child: Column(
            children: [
              // Верхний хэндл и кнопка закрытия
              _buildTopBar(),

              // Прокручиваемый список настроек
              Expanded(
                child: ListView(
                  physics: const BouncingScrollPhysics(),
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  children: [
                    // Заголовок шторки
                    const Text(
                      'Настройки',
                      style: TextStyle(
                        fontFamily: KTextStyles.fontFamily,
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        color: KColors.ink,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Раздел: Сетевое ядро k-Tunnel
                    _buildSectionHeader('Сетевое ядро k-Tunnel'),
                    const SizedBox(height: 10),
                    _buildSwitchTile(
                      title: 'Ускорение k-Tunnel',
                      subtitle: 'Прямой обход замедления и блокировок для kTube, kWitch и kGram',
                      value: _kTunnelEnabled,
                      onChanged: (val) => setState(() => _kTunnelEnabled = val),
                    ),
                    const SizedBox(height: 10),
                    _buildRegionSelector(),
                    const SizedBox(height: 24),

                    // Раздел: Обновления и каталог
                    _buildSectionHeader('Обновления'),
                    const SizedBox(height: 10),
                    _buildSwitchTile(
                      title: 'Автопроверка обновлений',
                      subtitle: 'Искать новые версии модов при каждом запуске приложения',
                      value: _autoCheckUpdates,
                      onChanged: (val) => setState(() => _autoCheckUpdates = val),
                    ),
                    const SizedBox(height: 10),
                    _buildSwitchTile(
                      title: 'Уведомления',
                      subtitle: 'Сообщать о выходе свежих сборок от kipsway',
                      value: _notifyUpdates,
                      onChanged: (val) => setState(() => _notifyUpdates = val),
                    ),
                    const SizedBox(height: 24),

                    // Раздел: Хранилище
                    _buildSectionHeader('Хранилище'),
                    const SizedBox(height: 10),
                    _buildStorageCard(),
                    const SizedBox(height: 24),

                    // Раздел: О приложении
                    _buildSectionHeader('О приложении'),
                    const SizedBox(height: 10),
                    _buildAboutCard(),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: KColors.faint.withOpacity(0.5),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: GlassContainer(
              radius: 999,
              width: 32,
              height: 32,
              backgroundColor: KColors.cellOff.withOpacity(0.7),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () => Navigator.of(context).pop(),
                  borderRadius: BorderRadius.circular(999),
                  child: const Center(
                    child: Icon(
                      Icons.close_rounded,
                      size: 18,
                      color: KColors.muted,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontFamily: KTextStyles.fontFamily,
        fontSize: 14,
        fontWeight: FontWeight.w800,
        color: KColors.lav,
        letterSpacing: -0.2,
      ),
    );
  }

  Widget _buildSwitchTile({
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return GlassContainer(
      radius: 20.0,
      padding: const EdgeInsets.all(16.0),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontFamily: KTextStyles.fontFamily,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: KColors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(subtitle, style: KTextStyles.description),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Switch(
            value: value,
            activeColor: KColors.lav,
            activeTrackColor: KColors.accBg,
            inactiveThumbColor: KColors.muted,
            inactiveTrackColor: KColors.cellOff,
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }

  Widget _buildRegionSelector() {
    return GlassContainer(
      radius: 20.0,
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Узел проксирования',
                style: TextStyle(
                  fontFamily: KTextStyles.fontFamily,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: KColors.ink,
                ),
              ),
              SizedBox(height: 2),
              Text(
                'Автоматический выбор наименьшего пинга',
                style: KTextStyles.description,
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: KColors.cellOff,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: KColors.panelBorder, width: 0.8),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _selectedRegion,
                  style: const TextStyle(
                    fontFamily: KTextStyles.fontFamily,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: KColors.lavInk,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStorageCard() {
    return GlassContainer(
      radius: 20.0,
      padding: const EdgeInsets.all(16.0),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Временные файлы APK',
                  style: TextStyle(
                    fontFamily: KTextStyles.fontFamily,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: KColors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _cacheSizeMb > 0
                      ? 'Занято кэшем загрузок: $_cacheSizeMb МБ'
                      : 'Кэш чист, временных файлов нет',
                  style: KTextStyles.description,
                ),
              ],
            ),
          ),
          if (_cacheSizeMb > 0)
            Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () {
                  setState(() => _cacheSizeMb = 0);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Кэш загрузок успешно очищен'),
                      backgroundColor: KColors.panel,
                      duration: Duration(seconds: 2),
                    ),
                  );
                },
                borderRadius: BorderRadius.circular(999),
                child: Ink(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: KColors.cellOff,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: KColors.panelBorder, width: 0.8),
                  ),
                  child: const Text(
                    'Очистить',
                    style: TextStyle(
                      fontFamily: KTextStyles.fontFamily,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: KColors.ink,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildAboutCard() {
    return GlassContainer(
      radius: 20.0,
      padding: const EdgeInsets.all(16.0),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'kStore by kipsway',
            style: TextStyle(
              fontFamily: KTextStyles.fontFamily,
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: KColors.ink,
            ),
          ),
          SizedBox(height: 4),
          Text(
            'Версия 1.0.0 (Сборка 102)\n'
            'Дизайн-система «Мозаика» от Rish (Chatterino+)\n'
            'Паттерн: Жидкое стекло + Material You 3 Expressive',
            style: KTextStyles.description,
          ),
        ],
      ),
    );
  }
}
