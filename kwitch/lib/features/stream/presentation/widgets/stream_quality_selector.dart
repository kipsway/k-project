import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';

class QualityOption {
  final String id;
  final String label;
  final String? badge;
  final bool isHighTier;

  const QualityOption({
    required this.id,
    required this.label,
    this.badge,
    this.isHighTier = false,
  });
}

class StreamQualitySelector extends StatelessWidget {
  final String currentQuality;
  final bool isTunnelEnabled;
  final ValueChanged<String> onQualitySelected;

  static const List<QualityOption> qualities = [
    QualityOption(
      id: '1440p60',
      label: '1440p60 (Source)',
      badge: 'k-Tunnel 2K',
      isHighTier: true,
    ),
    QualityOption(
      id: '1080p60',
      label: '1080p60 (Full HD)',
      badge: 'Плавный эфир',
      isHighTier: true,
    ),
    QualityOption(
      id: '720p60',
      label: '720p60 (HD)',
    ),
    QualityOption(
      id: '480p',
      label: '480p (Экономия)',
    ),
    QualityOption(
      id: 'auto',
      label: 'Автоматически',
    ),
    QualityOption(
      id: 'audio_only',
      label: 'Только аудио',
    ),
  ];

  const StreamQualitySelector({
    super.key,
    required this.currentQuality,
    required this.isTunnelEnabled,
    required this.onQualitySelected,
  });

  void _showModal(BuildContext context) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) {
        return KGlassContainer(
          borderRadius: 24,
          blurSigma: 24,
          backgroundColor: const Color(0xEE0F0F12),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
          margin: const EdgeInsets.all(12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Верхний хэндл шторки
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: KColors.faint.withOpacity(0.4),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              // Заголовок
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Качество видео', style: KTypography.sectionHeader),
                  if (isTunnelEnabled)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: KColors.accBg,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: KColors.accBorder, width: 1),
                      ),
                      child: Row(
                        children: [
                          const Icon(LucideIcons.zap, size: 14, color: KColors.lav),
                          const SizedBox(width: 4),
                          Text(
                            'k-Tunnel активен',
                            style: KTypography.caption.copyWith(color: KColors.lavInk),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              // Список вариантов качества
              ...qualities.map((item) {
                final isSelected = item.id == currentQuality;
                return Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      onQualitySelected(item.id);
                      Navigator.pop(context);
                    },
                    borderRadius: BorderRadius.circular(16),
                    splashColor: KColors.lav.withOpacity(0.12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      decoration: BoxDecoration(
                        color: isSelected ? KColors.cellOff : Colors.transparent,
                        borderRadius: BorderRadius.circular(16),
                        border: isSelected
                            ? Border.all(color: KColors.accBorder, width: 1)
                            : null,
                      ),
                      child: Row(
                        children: [
                          Icon(
                            isSelected ? LucideIcons.checkCircle2 : LucideIcons.circle,
                            size: 18,
                            color: isSelected ? KColors.lav : KColors.faint,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              item.label,
                              style: KTypography.body.copyWith(
                                color: isSelected ? KColors.ink : KColors.muted,
                                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                              ),
                            ),
                          ),
                          if (item.badge != null)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: item.isHighTier
                                    ? (isTunnelEnabled
                                        ? KColors.green.withOpacity(0.18)
                                        : KColors.accBg)
                                    : KColors.cellOff,
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: item.isHighTier
                                      ? (isTunnelEnabled ? KColors.green : KColors.accBorder)
                                      : KColors.panelBorder,
                                  width: 0.8,
                                ),
                              ),
                              child: Text(
                                item.badge!,
                                style: KTypography.caption.copyWith(
                                  fontSize: 10,
                                  color: item.isHighTier
                                      ? (isTunnelEnabled ? KColors.greenInk : KColors.lav)
                                      : KColors.muted,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _showModal(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: KColors.cellOff.withOpacity(0.7),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: KColors.panelBorder, width: 1),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(LucideIcons.settings2, size: 16, color: KColors.muted),
            const SizedBox(width: 6),
            Text(
              currentQuality.toUpperCase(),
              style: KTypography.chipLabel.copyWith(fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}
