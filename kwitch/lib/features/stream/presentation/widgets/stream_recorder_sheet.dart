import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/models/recorded_clip_item.dart';
import '../../domain/services/stream_recorder_service.dart';

/// Шторка сохраненных локальных записей стрима (Stream DVR Clips).
/// Отображает список клипов, их размер, длительность и позволяет
/// экспортировать или удалять файлы.
class StreamRecorderSheet extends StatelessWidget {
  final StreamRecorderService recorderService;
  final ValueChanged<RecordedClipItem>? onShareClip;

  const StreamRecorderSheet({
    super.key,
    required this.recorderService,
    this.onShareClip,
  });

  static void show(
    BuildContext context, {
    required StreamRecorderService recorderService,
    ValueChanged<RecordedClipItem>? onShareClip,
  }) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => AnimatedBuilder(
        animation: recorderService,
        builder: (context, _) => StreamRecorderSheet(
          recorderService: recorderService,
          onShareClip: onShareClip,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final clips = recorderService.savedClips;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.78,
      ),
      child: KGlassContainer(
        borderRadius: 24,
        blurSigma: 24,
        backgroundColor: const Color(0xF20F0F12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
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

            // Заголовок и кнопка очистки
            Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: KColors.red.withOpacity(0.18),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: KColors.red.withOpacity(0.5), width: 1),
                  ),
                  child: const Icon(LucideIcons.video, color: KColors.red, size: 18),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Записи стрима (DVR Clips)',
                        style: KTypography.sheetTitle.copyWith(color: KColors.ink),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Сохранено: ${clips.length} файлов',
                        style: KTypography.caption.copyWith(color: KColors.muted),
                      ),
                    ],
                  ),
                ),
                if (clips.isNotEmpty)
                  TextButton(
                    onPressed: () {
                      HapticFeedback.mediumImpact();
                      recorderService.clearAllClips();
                    },
                    style: TextButton.styleFrom(
                      foregroundColor: KColors.red,
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    ),
                    child: const Text('Очистить'),
                  ),
              ],
            ),
            const SizedBox(height: 16),

            // Список клипов
            Expanded(
              child: clips.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(LucideIcons.film, size: 38, color: KColors.faint),
                          const SizedBox(height: 8),
                          Text(
                            'Нет сохраненных записей',
                            style: KTypography.bodySmall.copyWith(color: KColors.muted),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Нажмите кнопку REC в плеере для записи момента',
                            style: KTypography.caption.copyWith(color: KColors.faint),
                          ),
                        ],
                      ),
                    )
                  : ListView.separated(
                      itemCount: clips.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final clip = clips[index];
                        return _buildClipCard(context, clip);
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildClipCard(BuildContext context, RecordedClipItem clip) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: KColors.well,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: KColors.panelBorder, width: 0.8),
      ),
      child: Row(
        children: [
          // Иконка видеофайла с длительностью
          Container(
            width: 56,
            height: 42,
            decoration: BoxDecoration(
              color: Colors.black,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: KColors.panelBorder, width: 0.8),
            ),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(LucideIcons.play, size: 14, color: KColors.lav),
                  const SizedBox(height: 2),
                  Text(
                    clip.formattedDuration,
                    style: KTypography.monoStats.copyWith(
                      fontSize: 9,
                      color: KColors.ink,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),

          // Метаданные клипа
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      clip.streamerName,
                      style: KTypography.bodySmall.copyWith(
                        color: KColors.ink,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '• ${clip.categoryName}',
                      style: KTypography.caption.copyWith(
                        color: KColors.muted,
                        fontSize: 10.5,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  '${clip.formattedDate} • ${clip.formattedFileSize} • ${clip.resolution}',
                  style: KTypography.caption.copyWith(
                    color: KColors.faint,
                    fontSize: 10,
                  ),
                ),
              ],
            ),
          ),

          // Кнопка «Поделиться»
          IconButton(
            onPressed: () {
              HapticFeedback.selectionClick();
              onShareClip?.call(clip);
            },
            icon: const Icon(LucideIcons.share2, size: 16, color: KColors.lav),
            tooltip: 'Поделиться клипом',
            padding: const EdgeInsets.all(6),
            constraints: const BoxConstraints(),
          ),
          const SizedBox(width: 8),

          // Кнопка «Удалить»
          IconButton(
            onPressed: () {
              HapticFeedback.lightImpact();
              recorderService.deleteClip(clip.id);
            },
            icon: const Icon(LucideIcons.trash2, size: 16, color: KColors.muted),
            tooltip: 'Удалить запись',
            padding: const EdgeInsets.all(6),
            constraints: const BoxConstraints(),
          ),
        ],
      ),
    );
  }
}
