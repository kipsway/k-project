import 'package:flutter/material.dart';
import '../theme/colors.dart';
import '../theme/text_styles.dart';
import 'glass_container.dart';

/// Парящий индикатор активной загрузки APK (Floating Progress Bar).
/// Располагается прямо над навигационным доком при скачивании мода.
class FloatingProgressBar extends StatelessWidget {
  final String modName;
  final double progress; // от 0.0 до 1.0
  final VoidCallback? onCancel;

  const FloatingProgressBar({
    super.key,
    required this.modName,
    required this.progress,
    this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final percent = (progress.clamp(0.0, 1.0) * 100).toInt();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20.0),
      child: GlassContainer(
        radius: 999.0,
        showShadow: true,
        backgroundColor: KColors.panel.withOpacity(0.88),
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 10.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                // Иконка загрузки
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: KColors.accBg,
                    shape: BoxShape.circle,
                    border: Border.all(color: KColors.accBorder, width: 1.0),
                  ),
                  child: const Center(
                    child: Icon(
                      Icons.arrow_downward_rounded,
                      size: 16,
                      color: KColors.lav,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                // Текст прогресса
                Expanded(
                  child: Text(
                    'Загрузка $modName: $percent%',
                    style: KTextStyles.progressText,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                // Кнопка отмены
                if (onCancel != null)
                  Material(
                    color: Colors.transparent,
                    child: InkWell(
                      onTap: onCancel,
                      borderRadius: BorderRadius.circular(999),
                      splashColor: KColors.lav.withOpacity(0.15),
                      child: const Padding(
                        padding: EdgeInsets.all(4.0),
                        child: Icon(
                          Icons.close_rounded,
                          size: 18,
                          color: KColors.muted,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            // Встроенный тонкий трекер прогресса
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: SizedBox(
                height: 3,
                child: LinearProgressIndicator(
                  value: progress.clamp(0.0, 1.0),
                  backgroundColor: KColors.cellOff,
                  valueColor: const AlwaysStoppedAnimation<Color>(KColors.lav),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
