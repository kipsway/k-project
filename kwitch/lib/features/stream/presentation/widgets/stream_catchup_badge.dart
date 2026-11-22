import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_typography.dart';

class StreamCatchupBadge extends StatelessWidget {
  final double latencySeconds;
  final double playbackSpeed;
  final bool isCatchingUp;
  final VoidCallback onCatchUp;

  const StreamCatchupBadge({
    super.key,
    required this.latencySeconds,
    required this.playbackSpeed,
    this.isCatchingUp = false,
    required this.onCatchUp,
  });

  @override
  Widget build(BuildContext context) {
    if (latencySeconds <= 1.0 && !isCatchingUp) return const SizedBox.shrink();

    final is15x = playbackSpeed >= 1.45;

    return GestureDetector(
      onTap: () {
        HapticFeedback.mediumImpact();
        onCatchUp();
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: is15x ? KColors.accBg : KColors.cellOff,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: is15x ? KColors.accBorder : KColors.panelBorder,
            width: 1.2,
          ),
          boxShadow: is15x
              ? [
                  BoxShadow(
                    color: KColors.accBorder.withOpacity(0.45),
                    blurRadius: 12,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Иконка ускорения / молнии
            Icon(
              is15x ? LucideIcons.fastForward : LucideIcons.rotateCw,
              size: 15,
              color: is15x ? KColors.lav : KColors.muted,
            ),
            const SizedBox(width: 6),
            // Статус догона с отставанием
            Text(
              is15x
                  ? '⚡ 1.5x Догон прямого эфира (-${latencySeconds.toStringAsFixed(1)}с)'
                  : 'Отставание ${latencySeconds.toStringAsFixed(0)}с • К эфиру',
              style: KTypography.chipLabel.copyWith(
                fontSize: 11,
                color: is15x ? KColors.lavInk : KColors.ink,
                fontWeight: is15x ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
            const SizedBox(width: 6),
            // Активный бейдж
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: is15x ? KColors.green.withOpacity(0.25) : KColors.well,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: is15x ? KColors.green : KColors.panelBorder,
                  width: 0.8,
                ),
              ),
              child: Text(
                is15x ? '1.5x' : 'LIVE',
                style: KTypography.monoStats.copyWith(
                  fontSize: 10,
                  color: is15x ? KColors.greenInk : KColors.faint,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
