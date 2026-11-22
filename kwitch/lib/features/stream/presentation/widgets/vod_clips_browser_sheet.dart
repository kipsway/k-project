import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/models/vod_clip_item.dart';
import '../../domain/services/vod_clips_service.dart';

/// Шторка быстрого браузера прошедших записей стримов (VOD) и лучших клипов канала.
/// Позволяет находить моменты, смотреть длительность, число просмотров
/// и переключать воспроизведение на выбранный медиафайл.
class VodClipsBrowserSheet extends StatelessWidget {
  final VodClipsService service;
  final String streamerName;
  final ValueChanged<VodClipItem> onSelectVodClip;

  const VodClipsBrowserSheet({
    super.key,
    required this.service,
    required this.streamerName,
    required this.onSelectVodClip,
  });

  static void show(
    BuildContext context, {
    required VodClipsService service,
    required String streamerName,
    required ValueChanged<VodClipItem> onSelectVodClip,
  }) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => AnimatedBuilder(
        animation: service,
        builder: (context, _) => VodClipsBrowserSheet(
          service: service,
          streamerName: streamerName,
          onSelectVodClip: onSelectVodClip,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final items = service.getItemsForStreamer(streamerName);

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.82,
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

            // Заголовок
            Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: KColors.accBg,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: KColors.accBorder, width: 1),
                  ),
                  child: const Icon(LucideIcons.film, color: KColors.lav, size: 18),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Записи и Клипы • $streamerName',
                        style: KTypography.sheetTitle.copyWith(color: KColors.ink),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'VOD & Highlights Quick Browser',
                        style: KTypography.caption.copyWith(color: KColors.muted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // Фильтры категорий (Все / VOD / Клипы)
            Row(
              children: [
                _buildFilterChip(null, 'Все (${items.length})'),
                const SizedBox(width: 8),
                _buildFilterChip(VodClipType.vod, 'Записи VOD'),
                const SizedBox(width: 8),
                _buildFilterChip(VodClipType.clip, 'Топ-клипы 🔥'),
              ],
            ),
            const SizedBox(height: 12),

            // Список медиа-элементов
            Expanded(
              child: items.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(LucideIcons.videoOff, size: 36, color: KColors.faint),
                          const SizedBox(height: 8),
                          Text(
                            'Записей пока не найдено',
                            style: KTypography.bodySmall.copyWith(color: KColors.muted),
                          ),
                        ],
                      ),
                    )
                  : ListView.separated(
                      itemCount: items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final item = items[index];
                        return _buildItemCard(context, item);
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterChip(VodClipType? type, String label) {
    final isSelected = service.filterType == type;

    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        service.setFilterType(type);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? KColors.accBg : KColors.well,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: isSelected ? KColors.lav : KColors.panelBorder,
            width: isSelected ? 1.2 : 0.8,
          ),
        ),
        child: Text(
          label,
          style: KTypography.caption.copyWith(
            color: isSelected ? KColors.ink : KColors.muted,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
          ),
        ),
      ),
    );
  }

  Widget _buildItemCard(BuildContext context, VodClipItem item) {
    final isVod = item.type == VodClipType.vod;

    return GestureDetector(
      onTap: () {
        HapticFeedback.mediumImpact();
        Navigator.of(context).pop();
        onSelectVodClip(item);
      },
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: KColors.well,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: KColors.panelBorder, width: 0.8),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Превью-бокс с длительностью
            Container(
              width: 96,
              height: 60,
              decoration: BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: KColors.panelBorder, width: 0.8),
              ),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Center(
                    child: Icon(
                      isVod ? LucideIcons.playCircle : LucideIcons.scissors,
                      color: isVod ? KColors.lav : const Color(0xFFF59E0B),
                      size: 24,
                    ),
                  ),
                  Positioned(
                    right: 4,
                    bottom: 4,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.75),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        item.formattedDuration,
                        style: KTypography.monoStats.copyWith(
                          fontSize: 9.5,
                          color: KColors.ink,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                  if (item.progressPercentage > 0)
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: LinearProgressIndicator(
                        value: item.progressPercentage,
                        backgroundColor: Colors.transparent,
                        valueColor: const AlwaysStoppedAnimation(KColors.red),
                        minHeight: 2.5,
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 12),

            // Инфо о записи / клипе
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                        decoration: BoxDecoration(
                          color: isVod ? KColors.accBg : const Color(0x33F59E0B),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          isVod ? 'VOD' : 'КЛИП',
                          style: KTypography.monoStats.copyWith(
                            fontSize: 9,
                            color: isVod ? KColors.lavInk : const Color(0xFFF59E0B),
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        item.category,
                        style: KTypography.caption.copyWith(
                          color: KColors.muted,
                          fontSize: 10.5,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        item.createdAtFormatted,
                        style: KTypography.caption.copyWith(
                          color: KColors.faint,
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    item.title,
                    style: KTypography.bodySmall.copyWith(
                      color: KColors.ink,
                      fontWeight: FontWeight.w600,
                      fontSize: 12.5,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(LucideIcons.eye, size: 11, color: KColors.muted),
                      const SizedBox(width: 4),
                      Text(
                        '${item.formattedViews} просмотров',
                        style: KTypography.caption.copyWith(
                          color: KColors.muted,
                          fontSize: 10.5,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
