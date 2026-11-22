import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/services/battery_saver_controller.dart';

class BatterySaverSheet extends StatelessWidget {
  final BatterySaverController batteryController;

  const BatterySaverSheet({
    super.key,
    required this.batteryController,
  });

  static void show(BuildContext context, BatterySaverController batteryController) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => AnimatedBuilder(
        animation: batteryController,
        builder: (context, _) => BatterySaverSheet(batteryController: batteryController),
      ),
    );
  }

  Color _getBatteryColor(int level) {
    if (level <= 20) return const Color(0xFFEF4444); // Рубин
    if (level <= 50) return const Color(0xFFF59E0B); // Янтарь
    return const Color(0xFF10B981); // Изумруд
  }

  @override
  Widget build(BuildContext context) {
    final level = batteryController.batteryLevel;
    final batteryColor = _getBatteryColor(level);
    final isSaver = batteryController.isSaverActive;

    return KGlassContainer(
      borderRadius: 24,
      blurSigma: 24,
      backgroundColor: const Color(0xF20F0F12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      margin: const EdgeInsets.all(12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Верхний хэндл
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: KColors.faint.withOpacity(0.5),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Заголовок
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(LucideIcons.batteryMedium, size: 20, color: batteryColor),
                  const SizedBox(width: 8),
                  Text('Энергосбережение', style: KTypography.sectionHeader),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: isSaver ? KColors.accBg : KColors.well,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: isSaver ? KColors.accBorder : KColors.panelBorder,
                    width: 0.8,
                  ),
                ),
                child: Text(
                  isSaver ? 'Эко 30 FPS активен' : '60 FPS Full Performance',
                  style: KTypography.monoStats.copyWith(
                    fontSize: 9,
                    color: isSaver ? KColors.lavInk : KColors.muted,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Информационная карточка батареи
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: KColors.well,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: KColors.panelBorder, width: 0.8),
            ),
            child: Row(
              children: [
                // Индикатор заряда
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: batteryColor.withOpacity(0.15),
                    shape: BoxShape.circle,
                    border: Border.all(color: batteryColor, width: 2),
                  ),
                  child: Center(
                    child: Text(
                      '$level%',
                      style: KTypography.monoStats.copyWith(
                        color: batteryColor,
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            batteryController.isCharging ? 'Заряжается' : 'Работает от батареи',
                            style: KTypography.bodyText.copyWith(fontWeight: FontWeight.bold),
                          ),
                          if (batteryController.isCharging) ...[
                            const SizedBox(width: 4),
                            const Icon(LucideIcons.zap, size: 14, color: KColors.yellow),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        isSaver
                          ? 'Экономия: ограничение 30 FPS + пауза тяжелых GIF'
                          : 'Полная производительность экрана и чата',
                        style: KTypography.caption.copyWith(color: KColors.muted, fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Переключатели режимов
          _buildToggleRow(
            icon: LucideIcons.leaf,
            title: 'Принудительный Эко-режим (30 FPS)',
            subtitle: 'Снижает нагрев и нагрузку на видеочип (+45% времени)',
            value: batteryController.isManualSaverEnabled,
            onChanged: batteryController.toggleManualSaver,
          ),
          const Divider(color: KColors.panelBorder, height: 16),

          _buildToggleRow(
            icon: LucideIcons.batteryLow,
            title: 'Автоматически при заряде < 20%',
            subtitle: 'Плавный переход на 30 FPS для предотвращения выключения',
            value: batteryController.isAutoSaverEnabled,
            onChanged: batteryController.toggleAutoSaver,
          ),
          const SizedBox(height: 12),

          // Плашка бонуса времени работы
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: isSaver ? KColors.green.withOpacity(0.12) : KColors.panel,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: isSaver ? KColors.green.withOpacity(0.4) : KColors.panelBorder,
                width: 0.8,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  LucideIcons.sparkles,
                  size: 16,
                  color: isSaver ? KColors.greenInk : KColors.muted,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    isSaver
                        ? 'Прогноз: режим экономит ~45% аккумулятора при просмотре 1440p'
                        : 'Включите Эко-режим при длительном просмотре без розетки',
                    style: KTypography.caption.copyWith(
                      color: isSaver ? KColors.greenInk : KColors.muted,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildToggleRow({
    required IconData icon,
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Row(
      children: [
        Icon(icon, size: 20, color: value ? KColors.lav : KColors.muted),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: KTypography.bodyText.copyWith(fontWeight: FontWeight.w600)),
              Text(subtitle, style: KTypography.caption.copyWith(color: KColors.muted, fontSize: 11)),
            ],
          ),
        ),
        Switch(
          value: value,
          activeColor: KColors.lav,
          onChanged: (val) {
            HapticFeedback.selectionClick();
            onChanged(val);
          },
        ),
      ],
    );
  }
}
