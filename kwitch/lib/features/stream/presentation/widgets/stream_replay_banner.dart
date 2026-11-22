import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/services/stream_replay_buffer_service.dart';

class StreamReplayBanner extends StatelessWidget {
  final StreamReplayBufferService replayService;
  final VoidCallback onExitReplay;
  final VoidCallback onShareClip;

  const StreamReplayBanner({
    super.key,
    required this.replayService,
    required this.onExitReplay,
    required this.onShareClip,
  });

  @override
  Widget build(BuildContext context) {
    if (!replayService.isReplayActive) return const SizedBox.shrink();

    final isSlowMo = replayService.replayPlaybackSpeed == 0.5;

    return Positioned(
      bottom: 60,
      left: 12,
      right: 12,
      child: KGlassContainer(
        borderRadius: 18,
        blurSigma: 20,
        backgroundColor: const Color(0xE614121A),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Верхняя строка: статус повтора, смещение и кнопка клипа
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: Color(0xFFF59E0B), // Янтарный огонек повтора
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'МГНОВЕННЫЙ ПОВТОР',
                      style: KTypography.monoStats.copyWith(
                        fontSize: 11,
                        color: const Color(0xFFF59E0B),
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: KColors.well,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: KColors.panelBorder, width: 0.6),
                      ),
                      child: Text(
                        replayService.formattedOffset,
                        style: KTypography.monoStats.copyWith(
                          fontSize: 11,
                          color: KColors.ink,
                        ),
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    // Кнопка замедления Slow-Mo 0.5x
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        replayService.toggleSlowMotion();
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: isSlowMo ? KColors.accBorder : KColors.cellOff,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          isSlowMo ? '0.5x Slow-Mo' : '1.0x',
                          style: KTypography.monoStats.copyWith(
                            fontSize: 10,
                            color: isSlowMo ? KColors.lavInk : KColors.faint,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    // Кнопка сохранения клипа
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.mediumImpact();
                        onShareClip();
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: KColors.accBg,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: KColors.accBorder, width: 0.6),
                        ),
                        child: Row(
                          children: [
                            const Icon(LucideIcons.scissors, size: 12, color: KColors.lav),
                            const SizedBox(width: 4),
                            Text(
                              'Клип',
                              style: KTypography.caption.copyWith(
                                fontSize: 10,
                                color: KColors.lavInk,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 6),

            // Слайдер перемотки буфера повтора
            Row(
              children: [
                Expanded(
                  child: SliderTheme(
                    data: SliderTheme.of(context).copyWith(
                      trackHeight: 3,
                      activeTrackColor: const Color(0xFFF59E0B),
                      inactiveTrackColor: KColors.panelBorder,
                      thumbColor: const Color(0xFFF59E0B),
                      thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                      overlayShape: const RoundSliderOverlayShape(overlayRadius: 10),
                    ),
                    child: Slider(
                      value: replayService.replayOffsetSeconds,
                      min: 0.0,
                      max: replayService.maxBufferSeconds,
                      onChanged: (val) {
                        replayService.setReplayOffset(val);
                      },
                    ),
                  ),
                ),
                const SizedBox(width: 6),

                // Кнопка возврата в прямой эфир
                GestureDetector(
                  onTap: () {
                    HapticFeedback.heavyImpact();
                    onExitReplay();
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: KColors.redBg,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: KColors.redBorder, width: 0.8),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: KColors.redInk,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'В ЭФИР',
                          style: KTypography.caption.copyWith(
                            fontSize: 10,
                            color: KColors.redInk,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
