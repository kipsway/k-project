import 'package:flutter/material.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/models/twitch_prediction_poll.dart';
import '../../domain/services/twitch_prediction_service.dart';
import 'prediction_details_sheet.dart';

/// Плавающий интерактивный баннер ставок (Twitch Predictions) и опросов поверх чата.
class PredictionPollBanner extends StatelessWidget {
  final TwitchPredictionService service;

  const PredictionPollBanner({
    super.key,
    required this.service,
  });

  String _formatTime(int totalSeconds) {
    final m = (totalSeconds ~/ 60).toString().padLeft(2, '0');
    final s = (totalSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: service.isVisible,
      builder: (context, isVisible, _) {
        if (!isVisible) return const SizedBox.shrink();

        return ValueListenableBuilder<TwitchPrediction?>(
          valueListenable: service.currentPrediction,
          builder: (context, pred, _) {
            if (pred == null) return const SizedBox.shrink();

            return ValueListenableBuilder<bool>(
              valueListenable: service.isCollapsed,
              builder: (context, isCollapsed, _) {
                if (isCollapsed) {
                  return _buildCollapsedPill(context, pred);
                }
                return _buildExpandedCard(context, pred);
              },
            );
          },
        );
      },
    );
  }

  Widget _buildCollapsedPill(BuildContext context, TwitchPrediction pred) {
    final outcomeA = pred.outcomes.isNotEmpty ? pred.outcomes[0] : null;
    final percentA = outcomeA != null ? (pred.getOutcomePercentage(outcomeA.id) * 100).toStringAsFixed(0) : '0';

    return GestureDetector(
      onTap: service.toggleCollapse,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: KColors.panel.withOpacity(0.9),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: KColors.accBorder.withOpacity(0.5)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.auto_awesome, size: 14, color: KColors.lav),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                '${pred.title} ($percentA%)',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: KTypography.caption.copyWith(color: KColors.ink),
              ),
            ),
            const SizedBox(width: 6),
            Text(
              _formatTime(pred.remainingSeconds),
              style: KTypography.monoSmall.copyWith(
                color: KColors.lavInk,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(width: 6),
            const Icon(Icons.expand_more, size: 16, color: KColors.muted),
          ],
        ),
      ),
    );
  }

  Widget _buildExpandedCard(BuildContext context, TwitchPrediction pred) {
    final outcomeA = pred.outcomes.length > 0 ? pred.outcomes[0] : null;
    final outcomeB = pred.outcomes.length > 1 ? pred.outcomes[1] : null;

    final ratioA = outcomeA != null ? pred.getOutcomePercentage(outcomeA.id) : 0.5;
    final percentAStr = (ratioA * 100).toStringAsFixed(0);
    final percentBStr = ((1.0 - ratioA) * 100).toStringAsFixed(0);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      child: KGlassContainer(
        borderRadius: BorderRadius.circular(18),
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Верхняя строка: иконка, заголовок, таймер и сворачивание
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: KColors.accBg,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.auto_awesome, size: 14, color: KColors.lav),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    pred.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: KTypography.body.copyWith(
                      color: KColors.ink,
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: KColors.cellOff,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: KColors.panelBorder),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.timer_outlined, size: 12, color: KColors.muted),
                      const SizedBox(width: 4),
                      Text(
                        _formatTime(pred.remainingSeconds),
                        style: KTypography.monoSmall.copyWith(
                          fontSize: 11,
                          color: pred.remainingSeconds <= 30 ? KColors.red : KColors.lavInk,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 4),
                GestureDetector(
                  onTap: service.toggleCollapse,
                  child: const Padding(
                    padding: EdgeInsets.all(4),
                    child: Icon(Icons.expand_less, size: 18, color: KColors.muted),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Полоса распределения вероятностей (A vs B)
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                height: 10,
                child: Row(
                  children: [
                    Expanded(
                      flex: (ratioA * 100).toInt().clamp(5, 95),
                      child: Container(color: KColors.lav),
                    ),
                    Expanded(
                      flex: ((1.0 - ratioA) * 100).toInt().clamp(5, 95),
                      child: Container(color: KColors.accBorder),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),

            // Подписи исходов с множителями
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (outcomeA != null)
                  Expanded(
                    child: Text(
                      '${outcomeA.title} ($percentAStr%) · x${outcomeA.ratio.toStringAsFixed(2)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: KTypography.caption.copyWith(color: KColors.lavInk, fontSize: 11),
                    ),
                  ),
                if (outcomeB != null)
                  Text(
                    '$percentBStr% (${outcomeB.title})',
                    style: KTypography.caption.copyWith(color: KColors.muted, fontSize: 11),
                  ),
              ],
            ),
            const SizedBox(height: 8),

            // Быстрые кнопки действия
            Row(
              children: [
                if (pred.userVotedOutcomeId != null)
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      decoration: BoxDecoration(
                        color: KColors.accBg,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: KColors.accBorder.withOpacity(0.5)),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        'Ваша ставка: ${pred.userVotedPoints} баллов',
                        style: KTypography.caption.copyWith(
                          color: KColors.lavInk,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  )
                else ...[
                  Expanded(
                    child: GestureDetector(
                      onTap: () {
                        if (outcomeA != null) {
                          service.placePredictionBet(outcomeA.id, 100);
                        }
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 6),
                        decoration: BoxDecoration(
                          color: KColors.cellOff,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: KColors.panelBorder),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          '+100 на «${outcomeA?.title ?? "Да"}»',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: KTypography.caption.copyWith(
                            color: KColors.ink,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () {
                      PredictionDetailsSheet.show(context, pred, service);
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: KColors.lav,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        'Ставка...',
                        style: KTypography.caption.copyWith(
                          color: KColors.bg,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
