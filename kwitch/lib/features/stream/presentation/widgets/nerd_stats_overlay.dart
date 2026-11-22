import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/models/stream_nerd_stats.dart';

class NerdStatsOverlay extends StatelessWidget {
  final StreamNerdStats stats;
  final VoidCallback onClose;

  const NerdStatsOverlay({
    super.key,
    required this.stats,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 50,
      left: 12,
      child: KGlassContainer(
        borderRadius: 16,
        blurSigma: 24,
        backgroundColor: const Color(0xEE0B0B0D),
        padding: const EdgeInsets.all(12),
        width: 290,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Заголовок панели
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(LucideIcons.activity, size: 16, color: KColors.lav),
                    const SizedBox(width: 6),
                    Text(
                      'Статистика для гиков',
                      style: KTypography.chipLabel.copyWith(fontSize: 12),
                    ),
                  ],
                ),
                IconButton(
                  onPressed: () {
                    HapticFeedback.lightImpact();
                    onClose();
                  },
                  icon: const Icon(LucideIcons.x, size: 16, color: KColors.faint),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ),
            const Divider(color: KColors.panelBorder, height: 16),

            // Строки параметров
            _buildStatRow('Качество:', '${stats.resolution}@${stats.fps}fps'),
            _buildStatRow('Битрейт:', '${stats.currentBitrateKbps} кбит/с (1440p)'),
            _buildStatRow('Видео кодек:', stats.videoCodec),
            _buildStatRow('Аудио:', stats.audioCodec),
            _buildStatRow(
              'Дропы кадров:',
              '${stats.droppedFrames} / ${stats.totalFrames} (${stats.dropRatePercentage.toStringAsFixed(2)}%)',
              highlightGreen: stats.droppedFrames == 0,
            ),
            _buildStatRow('Буфер видео:', '${stats.bufferHealthSeconds.toStringAsFixed(1)} сек'),
            _buildStatRow('Отставание:', '${stats.latencyToLiveSeconds.toStringAsFixed(1)} сек'),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: KColors.accBg,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: KColors.accBorder, width: 0.8),
              ),
              child: Row(
                children: [
                  const Icon(LucideIcons.zap, size: 14, color: KColors.lav),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'k-Tunnel: ${stats.localLoopbackPort} -> ${stats.activeNodeName} (${stats.nodePingMs} мс)',
                      style: KTypography.monoStats.copyWith(fontSize: 9),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatRow(String label, String value, {bool highlightGreen = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: KTypography.caption.copyWith(fontSize: 10, color: KColors.muted)),
          Text(
            value,
            style: KTypography.monoStats.copyWith(
              fontSize: 10,
              color: highlightGreen ? KColors.greenInk : KColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}
