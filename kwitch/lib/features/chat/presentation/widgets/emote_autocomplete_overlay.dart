import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/services/emote_index_service.dart';

class EmoteAutocompleteOverlay extends StatelessWidget {
  final List<IndexedEmote> suggestions;
  final ValueChanged<IndexedEmote> onSelect;

  const EmoteAutocompleteOverlay({
    super.key,
    required this.suggestions,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    if (suggestions.isEmpty) return const SizedBox.shrink();

    return KGlassContainer(
      borderRadius: 16,
      blurSigma: 20,
      backgroundColor: const Color(0xEE0F0F12),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      margin: const EdgeInsets.only(bottom: 6, left: 12, right: 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Смайлы Chatterino+ (7TV, BTTV, FFZ)',
                  style: KTypography.caption.copyWith(
                    fontSize: 10,
                    color: KColors.faint,
                  ),
                ),
                Text(
                  'автодополнение :',
                  style: KTypography.monoStats.copyWith(
                    fontSize: 9,
                    color: KColors.lav,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: suggestions.map((emote) {
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        onSelect(emote);
                      },
                      borderRadius: BorderRadius.circular(10),
                      splashColor: KColors.lav.withOpacity(0.15),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: KColors.cellOff,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: KColors.panelBorder, width: 0.8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              emote.name,
                              style: KTypography.chipLabel.copyWith(
                                fontSize: 11,
                                color: KColors.lavInk,
                              ),
                            ),
                            const SizedBox(width: 5),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                              decoration: BoxDecoration(
                                color: emote.isAnimated
                                    ? KColors.accBg
                                    : KColors.well,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                emote.provider,
                                style: TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w700,
                                  color: emote.isAnimated ? KColors.lav : KColors.faint,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}
