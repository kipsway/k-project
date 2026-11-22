import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_typography.dart';

class KTunnelToggleChip extends StatelessWidget {
  final bool isEnabled;
  final int pingMs;
  final ValueChanged<bool> onToggle;
  final VoidCallback? onOpenNodesPicker;

  const KTunnelToggleChip({
    super.key,
    required this.isEnabled,
    this.pingMs = 32,
    required this.onToggle,
    this.onOpenNodesPicker,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        onToggle(!isEnabled);
      },
      onLongPress: () {
        if (onOpenNodesPicker != null) {
          HapticFeedback.mediumImpact();
          onOpenNodesPicker!();
        }
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: isEnabled ? KColors.accBg : KColors.cellOff.withOpacity(0.85),
          borderRadius: BorderRadius.circular(999), // Капсула M3
          border: Border.all(
            color: isEnabled ? KColors.accBorder : KColors.panelBorder,
            width: 1.2,
          ),
          boxShadow: isEnabled
              ? [
                  BoxShadow(
                    color: KColors.accBorder.withOpacity(0.35),
                    blurRadius: 10,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Иконка молнии/ускорения 20x20
            Icon(
              LucideIcons.zap,
              size: 16,
              color: isEnabled ? KColors.lav : KColors.faint,
            ),
            const SizedBox(width: 6),
            Text(
              'Ускорение k-Tunnel',
              style: KTypography.chipLabel.copyWith(
                fontSize: 11,
                color: isEnabled ? KColors.ink : KColors.muted,
              ),
            ),
            const SizedBox(width: 6),
            // Бейдж статуса/пинга (тап по нему открывает выбор узлов)
            GestureDetector(
              onTap: onOpenNodesPicker,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: isEnabled
                      ? KColors.green.withOpacity(0.2)
                      : KColors.cellOff,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: isEnabled
                        ? KColors.green.withOpacity(0.5)
                        : KColors.panelBorder,
                    width: 0.8,
                  ),
                ),
                child: Text(
                  isEnabled ? '$pingMs мс' : 'ВЫКЛ',
                  style: KTypography.monoStats.copyWith(
                    fontSize: 10,
                    color: isEnabled ? KColors.greenInk : KColors.faint,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
