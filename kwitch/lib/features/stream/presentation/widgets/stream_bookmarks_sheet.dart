import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/models/stream_bookmark_item.dart';
import '../../domain/services/stream_bookmarks_service.dart';

class StreamBookmarksSheet extends StatelessWidget {
  final StreamBookmarksService bookmarksService;
  final String streamerName;
  final String categoryName;
  final int currentTimestampSeconds;

  const StreamBookmarksSheet({
    super.key,
    required this.bookmarksService,
    required this.streamerName,
    required this.categoryName,
    required this.currentTimestampSeconds,
  });

  static void show(
    BuildContext context, {
    required StreamBookmarksService bookmarksService,
    required String streamerName,
    required String categoryName,
    required int currentTimestampSeconds,
  }) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => AnimatedBuilder(
        animation: bookmarksService,
        builder: (context, _) => StreamBookmarksSheet(
          bookmarksService: bookmarksService,
          streamerName: streamerName,
          categoryName: categoryName,
          currentTimestampSeconds: currentTimestampSeconds,
        ),
      ),
    );
  }

  void _showAddBookmarkDialog(BuildContext context) {
    final titleController = TextEditingController(text: 'Интересный момент');
    final noteController = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: KColors.panel,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: KColors.accBorder, width: 1),
        ),
        title: Text(
          'Новая закладка',
          style: KTypography.titleBold.copyWith(fontSize: 16),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: titleController,
              autofocus: true,
              style: KTypography.body.copyWith(color: KColors.ink),
              decoration: InputDecoration(
                labelText: 'Название момента',
                labelStyle: KTypography.caption.copyWith(color: KColors.muted),
                filled: true,
                fillColor: KColors.well,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: KColors.panelBorder),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: noteController,
              style: KTypography.body.copyWith(color: KColors.ink),
              decoration: InputDecoration(
                labelText: 'Заметка (необязательно)',
                labelStyle: KTypography.caption.copyWith(color: KColors.muted),
                filled: true,
                fillColor: KColors.well,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: KColors.panelBorder),
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Отмена', style: KTypography.caption.copyWith(color: KColors.muted)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: KColors.accBorder,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () {
              bookmarksService.addBookmark(
                streamerName: streamerName,
                categoryName: categoryName,
                timestampSeconds: currentTimestampSeconds,
                title: titleController.text,
                note: noteController.text,
              );
              Navigator.pop(ctx);
            },
            child: Text(
              'Сохранить',
              style: KTypography.caption.copyWith(color: KColors.ink, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bookmarks = bookmarksService.getBookmarksForStreamer(streamerName);

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
                  const Icon(LucideIcons.bookmark, size: 20, color: KColors.lav),
                  const SizedBox(width: 8),
                  Text('Закладки и таймкоды', style: KTypography.sectionHeader),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: KColors.accBg,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: KColors.accBorder, width: 0.8),
                ),
                child: Text(
                  '${bookmarks.length} сохранено',
                  style: KTypography.monoStats.copyWith(
                    fontSize: 10,
                    color: KColors.lavInk,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Список закладок
          if (bookmarks.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Column(
                  children: [
                    const Icon(LucideIcons.bookmarkPlus, size: 36, color: KColors.faint),
                    const SizedBox(height: 10),
                    Text(
                      'Нет сохраненных закладок для этого стрима',
                      style: KTypography.bodyText.copyWith(color: KColors.muted),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Сохраняйте яркие моменты и клатчи для повторного просмотра',
                      style: KTypography.caption.copyWith(color: KColors.faint),
                    ),
                  ],
                ),
              ),
            )
          else
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 280),
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: bookmarks.length,
                itemBuilder: (context, index) {
                  final bm = bookmarks[index];
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: KColors.panel,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: KColors.panelBorder, width: 0.8),
                    ),
                    child: Row(
                      children: [
                        // Таймкод бейдж
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: KColors.accBg,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: KColors.accBorder, width: 0.6),
                          ),
                          child: Text(
                            bm.formattedTimestamp,
                            style: KTypography.monoStats.copyWith(
                              fontSize: 11,
                              color: KColors.lav,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        // Название и заметка
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                bm.title,
                                style: KTypography.body.copyWith(
                                  color: KColors.ink,
                                  fontWeight: FontWeight.w600,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if (bm.note.isNotEmpty)
                                Text(
                                  bm.note,
                                  style: KTypography.caption.copyWith(color: KColors.muted),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                            ],
                          ),
                        ),
                        // Копирование ссылки
                        IconButton(
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: bm.shareUrl));
                            HapticFeedback.lightImpact();
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                backgroundColor: KColors.panel,
                                duration: const Duration(seconds: 1),
                                content: Text(
                                  'Ссылка с таймкодом скопирована',
                                  style: KTypography.caption.copyWith(color: KColors.ink),
                                ),
                              ),
                            );
                          },
                          icon: const Icon(LucideIcons.copy, size: 16, color: KColors.lav),
                          tooltip: 'Скопировать ссылку',
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          constraints: const BoxConstraints(),
                        ),
                        const SizedBox(width: 6),
                        // Удаление
                        IconButton(
                          onPressed: () {
                            bookmarksService.removeBookmark(bm.id);
                          },
                          icon: const Icon(LucideIcons.trash2, size: 16, color: KColors.faint),
                          tooltip: 'Удалить закладку',
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          constraints: const BoxConstraints(),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          const SizedBox(height: 12),

          // Кнопка сохранения текущего момента
          GestureDetector(
            onTap: () => _showAddBookmarkDialog(context),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: KColors.accBg,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: KColors.accBorder, width: 1),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(LucideIcons.bookmarkPlus, size: 18, color: KColors.lav),
                  const SizedBox(width: 8),
                  Text(
                    'Сохранить текущий момент',
                    style: KTypography.bodyText.copyWith(
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
    );
  }
}
