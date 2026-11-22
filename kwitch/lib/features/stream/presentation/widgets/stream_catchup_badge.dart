import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_typography.dart';

class StreamCatchupBadge extends StatelessWidget {
  final double latencySeconds;
  final double playbackSpeed;
  final VoidCallback onCatchUp;

  const StreamCatchupBadge({
    super.key,
    required this.latencySeconds,
    required this.playbackSpeed,
    required this.onCatchUp,
  });

  @override
  Widget build(BuildContext context) {
    if (latencySeconds <= 2.5) return const SizedBox.shrink();

    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        onCatchUp();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: KColors.accBg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: KColors.accBorder, width: 1.0),
          boxShadow: [
            BoxShadow(
              color: KColors.accBorder.withOpacity(0.35),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(LucideIcons.fastForward, size: 14, color: KColors.lav),
            const SizedBox(width: 5),
            Text(
              'Отставание ${latencySeconds.toStringAsFixed(0)}с • К эфиру',
              style: KTypography.chipLabel.copyWith(
                fontSize: 10,
                color: KColors.lavInk,
              ),
            ),
            if (playbackSpeed > 1.0) ...[
              const SizedBox(width: 5),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(
                  color: KColors.green.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  '${playbackSpeed}x',
                  style: KTypography.monoStats.copyWith(
                    fontSize: 9,
                    color: KColors.greenInk,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
