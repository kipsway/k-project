import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/services/stream_ambient_glow_controller.dart';

/// Шторка управления фоновой эмбиент-подсветкой Ambilight Glow в kWitch.
/// Позволяет регулировать интенсивность рассеивания, радиус свечения и
/// выбирать динамический цветовой профиль под текущую игру или ночной режим.
class StreamAmbientGlowSheet extends StatelessWidget {
  final StreamAmbientGlowController glowController;

  const StreamAmbientGlowSheet({
    super.key,
    required this.glowController,
  });

  static void show(BuildContext context, StreamAmbientGlowController glowController) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => AnimatedBuilder(
        animation: glowController,
        builder: (context, _) => StreamAmbientGlowSheet(glowController: glowController),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final activeColor = glowController.activeGlowColor;
    final isEnabled = glowController.isEnabled;

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

          // Заголовок и выключатель
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: isEnabled ? activeColor.withOpacity(0.2) : KColors.well,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: isEnabled ? activeColor : KColors.panelBorder,
                    width: 1,
                  ),
                ),
                child: Icon(
                  LucideIcons.sparkles,
                  color: isEnabled ? activeColor : KColors.muted,
                  size: 18,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Фоновая Ambilight подсветка',
                      style: KTypography.sheetTitle.copyWith(color: KColors.ink),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      glowController.modeDisplayName,
                      style: KTypography.caption.copyWith(color: KColors.muted),
                    ),
                  ],
                ),
              ),
              Switch(
                value: isEnabled,
                activeColor: KColors.lav,
                activeTrackColor: KColors.accBorder,
                inactiveThumbColor: KColors.muted,
                inactiveTrackColor: KColors.well,
                onChanged: (val) {
                  HapticFeedback.selectionClick();
                  glowController.toggleGlow(val);
                },
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Карточка превью свечения Ambilight
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: KColors.well,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isEnabled ? activeColor.withOpacity(0.4) : KColors.panelBorder,
                width: 1,
              ),
              boxShadow: isEnabled
                  ? [
                      BoxShadow(
                        color: activeColor.withOpacity(glowController.intensity * 0.4),
                        blurRadius: glowController.spreadRadius,
                        spreadRadius: glowController.spreadRadius * 0.2,
                      ),
                    ]
                  : null,
            ),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 32,
                  decoration: BoxDecoration(
                    color: Colors.black,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: KColors.panelBorder, width: 0.8),
                  ),
                  child: Center(
                    child: Icon(
                      LucideIcons.tv,
                      size: 16,
                      color: isEnabled ? activeColor : KColors.faint,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        isEnabled ? 'Динамический ореол активен' : 'Подсветка отключена',
                        style: KTypography.bodySmall.copyWith(
                          color: KColors.ink,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Яркость ${(glowController.intensity * 100).toInt()}% • Радиус ${glowController.spreadRadius.toInt()} dp',
                        style: KTypography.caption.copyWith(color: KColors.muted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Выбор режима / профиля свечения
          Text(
            'ЦВЕТОВОЙ ПРОФИЛЬ АУРЫ',
            style: KTypography.caption.copyWith(
              color: KColors.faint,
              fontSize: 10,
              letterSpacing: 1.0,
            ),
          ),
          const SizedBox(height: 8),

          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _buildModeChip(
                mode: AmbientGlowMode.categoryAdaptive,
                title: 'По игре (${glowController.currentCategory})',
                icon: LucideIcons.gamepad2,
                color: const Color(0xFF9146FF),
              ),
              _buildModeChip(
                mode: AmbientGlowMode.chatterinoLavender,
                title: 'Лаванда Chatterino+',
                icon: LucideIcons.palette,
                color: const Color(0xFFB8A7F0),
              ),
              _buildModeChip(
                mode: AmbientGlowMode.cyberpunkCyan,
                title: 'Киберпанк Неон',
                icon: LucideIcons.zap,
                color: const Color(0xFF00F0FF),
              ),
              _buildModeChip(
                mode: AmbientGlowMode.warmSunset,
                title: 'Теплый камин',
                icon: LucideIcons.flame,
                color: const Color(0xFFFF8C42),
              ),
              _buildModeChip(
                mode: AmbientGlowMode.emeraldClean,
                title: 'Изумруд',
                icon: LucideIcons.shield,
                color: const Color(0xFF10B981),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Слайдер интенсивности (яркости)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Яркость свечения',
                style: KTypography.bodySmall.copyWith(color: KColors.ink),
              ),
              Text(
                '${(glowController.intensity * 100).toInt()}%',
                style: KTypography.monoStats.copyWith(
                  color: isEnabled ? KColors.lav : KColors.muted,
                ),
              ),
            ],
          ),
          Slider(
            value: glowController.intensity,
            min: 0.1,
            max: 1.0,
            activeColor: isEnabled ? KColors.lav : KColors.muted,
            inactiveColor: KColors.well,
            onChanged: isEnabled
                ? (val) {
                    glowController.setIntensity(val);
                  }
                : null,
          ),

          // Слайдер радиуса рассеивания
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Радиус рассеивания (Spread)',
                style: KTypography.bodySmall.copyWith(color: KColors.ink),
              ),
              Text(
                '${glowController.spreadRadius.toInt()} dp',
                style: KTypography.monoStats.copyWith(
                  color: isEnabled ? KColors.lav : KColors.muted,
                ),
              ),
            ],
          ),
          Slider(
            value: glowController.spreadRadius,
            min: 10.0,
            max: 60.0,
            activeColor: isEnabled ? KColors.lav : KColors.muted,
            inactiveColor: KColors.well,
            onChanged: isEnabled
                ? (val) {
                    glowController.setSpreadRadius(val);
                  }
                : null,
          ),
          const SizedBox(height: 10),

          // Подсказка о комфорте зрения
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: KColors.well.withOpacity(0.5),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: KColors.panelBorder, width: 0.8),
            ),
            child: Row(
              children: [
                const Icon(LucideIcons.eye, size: 14, color: KColors.muted),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Мягкая аура размывает границу дисплея, снижая нагрузку на зрительный нерв в темноте.',
                    style: KTypography.caption.copyWith(
                      color: KColors.muted,
                      fontSize: 10.5,
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

  Widget _buildModeChip({
    required AmbientGlowMode mode,
    required String title,
    required IconData icon,
    required Color color,
  }) {
    final isSelected = glowController.mode == mode;

    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        glowController.setMode(mode);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? color.withOpacity(0.18) : KColors.well,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? color : KColors.panelBorder,
            width: isSelected ? 1.2 : 0.8,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 13,
              color: isSelected ? color : KColors.muted,
            ),
            const SizedBox(width: 6),
            Text(
              title,
              style: KTypography.caption.copyWith(
                color: isSelected ? KColors.ink : KColors.muted,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
