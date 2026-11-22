import 'package:flutter/material.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/models/twitch_prediction_poll.dart';
import '../../domain/services/twitch_prediction_service.dart';

/// Модальный экран подробностей и ставки на предикшен канала.
class PredictionDetailsSheet extends StatefulWidget {
  final TwitchPrediction prediction;
  final TwitchPredictionService service;

  const PredictionDetailsSheet({
    super.key,
    required this.prediction,
    required this.service,
  });

  static Future<void> show(BuildContext context, TwitchPrediction prediction, TwitchPredictionService service) {
    return showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => PredictionDetailsSheet(prediction: prediction, service: service),
    );
  }

  @override
  State<PredictionDetailsSheet> createState() => _PredictionDetailsSheetState();
}

class _PredictionDetailsSheetState extends State<PredictionDetailsSheet> {
  String? _selectedOutcomeId;
  int _betAmount = 250;

  @override
  void initState() {
    super.initState();
    if (widget.prediction.outcomes.isNotEmpty) {
      _selectedOutcomeId = widget.prediction.outcomes.first.id;
    }
  }

  @override
  Widget build(BuildContext context) {
    final pred = widget.prediction;
    final total = pred.totalPoints > 0 ? pred.totalPoints : 1;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: KGlassContainer(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Хэндл шторки
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: KColors.faint.withOpacity(0.4),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Заголовок и баланс баллов
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Ставки на баллы канала',
                    style: KTypography.heading2.copyWith(color: KColors.ink),
                  ),
                ),
                ValueListenableBuilder<int>(
                  valueListenable: widget.service.userChannelPoints,
                  builder: (context, points, _) {
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: KColors.accBg,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: KColors.accBorder.withOpacity(0.6)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.circle, size: 10, color: KColors.lav),
                          const SizedBox(width: 6),
                          Text(
                            '$points баллов',
                            style: KTypography.monoSmall.copyWith(
                              color: KColors.lavInk,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Вопрос предикшена
            Text(
              pred.title,
              style: KTypography.body.copyWith(
                color: KColors.ink,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 16),

            // Карточки исходов
            ...pred.outcomes.map((outcome) {
              final isSelected = _selectedOutcomeId == outcome.id;
              final percent = ((outcome.totalPoints / total) * 100).toStringAsFixed(0);

              return GestureDetector(
                onTap: () {
                  setState(() {
                    _selectedOutcomeId = outcome.id;
                  });
                },
                child: Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: isSelected ? KColors.accBg : KColors.cellOff,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: isSelected ? KColors.accBorder : KColors.panelBorder,
                      width: isSelected ? 1.5 : 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 14,
                        height: 14,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: isSelected ? KColors.lav : KColors.faint,
                            width: isSelected ? 4 : 1.5,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              outcome.title,
                              style: KTypography.body.copyWith(
                                color: KColors.ink,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${outcome.totalPoints} баллов (${outcome.totalUsers} чел.)',
                              style: KTypography.caption.copyWith(color: KColors.muted),
                            ),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '$percent%',
                            style: KTypography.heading2.copyWith(
                              color: isSelected ? KColors.lav : KColors.ink,
                              fontSize: 18,
                            ),
                          ),
                          Text(
                            'x${outcome.ratio.toStringAsFixed(2)}',
                            style: KTypography.monoSmall.copyWith(color: KColors.lavInk),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),

            const SizedBox(height: 8),

            // Быстрый выбор суммы ставки
            Text(
              'Размер ставки:',
              style: KTypography.caption.copyWith(color: KColors.muted),
            ),
            const SizedBox(height: 8),
            Row(
              children: [100, 250, 500, 1000, 2500].map((amount) {
                final isCurrent = _betAmount == amount;
                return Expanded(
                  child: GestureDetector(
                    onTap: () {
                      setState(() {
                        _betAmount = amount;
                      });
                    },
                    child: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: isCurrent ? KColors.lav : KColors.cellOff,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isCurrent ? KColors.lav : KColors.panelBorder,
                        ),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        '$amount',
                        style: KTypography.monoSmall.copyWith(
                          color: isCurrent ? KColors.bg : KColors.ink,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),

            const SizedBox(height: 20),

            // Кнопка подтверждения ставки
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: KColors.lav,
                  foregroundColor: KColors.bg,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(24),
                  ),
                  elevation: 0,
                ),
                onPressed: _selectedOutcomeId == null
                    ? null
                    : () {
                        final success = widget.service.placePredictionBet(
                          _selectedOutcomeId!,
                          _betAmount,
                        );
                        Navigator.pop(context);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            backgroundColor: KColors.panel,
                            content: Text(
                              success
                                  ? 'Ставка $_betAmount баллов принята!'
                                  : 'Недостаточно баллов или ставка закрыта',
                              style: KTypography.body.copyWith(
                                color: success ? KColors.lavInk : KColors.red,
                              ),
                            ),
                          ),
                        );
                      },
                child: Text(
                  'Поставить $_betAmount баллов',
                  style: KTypography.body.copyWith(
                    fontWeight: FontWeight.bold,
                    color: KColors.bg,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}
