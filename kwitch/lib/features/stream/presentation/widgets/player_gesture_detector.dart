import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/services/player_gesture_controller.dart';

class PlayerGestureDetector extends StatelessWidget {
  final Widget child;
  final PlayerGestureController controller;
  final VoidCallback onSeekBackward;
  final VoidCallback onCatchUpLive;

  const PlayerGestureDetector({
    super.key,
    required this.child,
    required this.controller,
    required this.onSeekBackward,
    required this.onCatchUpLive,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final halfWidth = constraints.maxWidth / 2;

        return Stack(
          fit: StackFit.expand,
          children: [
            // Основной контент (видеопоток)
            child,

            // Жестовые зоны (левая половина = яркость, правая = громкость)
            Positioned.fill(
              child: Row(
                children: [
                  // Левая зона: яркость и двойной тап -10с
                  Expanded(
                    child: GestureDetector(
                      behavior: HitTestBehavior.translucent,
                      onVerticalDragUpdate: (details) {
                        controller.onBrightnessDrag(details.primaryDelta ?? 0);
                      },
                      onDoubleTap: () {
                        controller.onDoubleTapLeft();
                        onSeekBackward();
                      },
                    ),
                  ),

                  // Правая зона: громкость и двойной тап В ЭФИР
                  Expanded(
                    child: GestureDetector(
                      behavior: HitTestBehavior.translucent,
                      onVerticalDragUpdate: (details) {
                        controller.onVolumeDrag(details.primaryDelta ?? 0);
                      },
                      onDoubleTap: () {
                        controller.onDoubleTapRight();
                        onCatchUpLive();
                      },
                    ),
                  ),
                ],
              ),
            ),

            // Индикатор яркости по левому краю
            if (controller.showBrightnessHud)
              Positioned(
                left: 20,
                top: 0,
                bottom: 0,
                child: Center(
                  child: _buildHudIndicator(
                    icon: LucideIcons.sun,
                    value: controller.brightness,
                    label: '${(controller.brightness * 100).toInt()}%',
                  ),
                ),
              ),

            // Индикатор громкости по правому краю
            if (controller.showVolumeHud)
              Positioned(
                right: 20,
                top: 0,
                bottom: 0,
                child: Center(
                  child: _buildHudIndicator(
                    icon: controller.volume == 0 ? LucideIcons.volumeX : LucideIcons.volume2,
                    value: controller.volume,
                    label: '${(controller.volume * 100).toInt()}%',
                  ),
                ),
              ),

            // Всплывающая анимация двойного тапа (Перемотка назад)
            if (controller.doubleTapAction == DoubleTapAction.seekBackward)
              Positioned(
                left: halfWidth / 2 - 40,
                top: 0,
                bottom: 0,
                child: Center(
                  child: _buildDoubleTapBadge(
                    icon: LucideIcons.rotateCcw,
                    label: '-10с',
                  ),
                ),
              ),

            // Всплывающая анимация двойного тапа (Догон в эфир)
            if (controller.doubleTapAction == DoubleTapAction.catchUpLive)
              Positioned(
                right: halfWidth / 2 - 40,
                top: 0,
                bottom: 0,
                child: Center(
                  child: _buildDoubleTapBadge(
                    icon: LucideIcons.zap,
                    label: 'В ЭФИР',
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _buildHudIndicator({
    required IconData icon,
    required double value,
    required String label,
  }) {
    return KGlassContainer(
      borderRadius: 16,
      blurSigma: 20,
      backgroundColor: const Color(0xDD0F0F12),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 14),
      width: 46,
      height: 140,
      child: Column(
        children: [
          Icon(icon, size: 18, color: KColors.lav),
          const SizedBox(height: 8),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: RotatedBox(
                quarterTurns: 3,
                child: LinearProgressIndicator(
                  value: value,
                  backgroundColor: KColors.cellOff,
                  valueColor: const AlwaysStoppedAnimation<Color>(KColors.lav),
                ),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(label, style: KTypography.monoStats.copyWith(fontSize: 10)),
        ],
      ),
    );
  }

  Widget _buildDoubleTapBadge({
    required IconData icon,
    required String label,
  }) {
    return KGlassContainer(
      borderRadius: 999,
      blurSigma: 24,
      backgroundColor: const Color(0xEE2A2442),
      customBorder: Border.all(color: KColors.accBorder, width: 1.2),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18, color: KColors.lav),
          const SizedBox(width: 8),
          Text(label, style: KTypography.chipLabel.copyWith(color: KColors.lavInk)),
        ],
      ),
    );
  }
}
