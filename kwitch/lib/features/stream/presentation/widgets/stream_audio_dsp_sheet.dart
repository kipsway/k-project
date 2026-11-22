import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/services/stream_audio_dsp_controller.dart';

class StreamAudioDspSheet extends StatelessWidget {
  final StreamAudioDspController dspController;

  const StreamAudioDspSheet({
    super.key,
    required this.dspController,
  });

  static void show(BuildContext context, StreamAudioDspController dspController) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => AnimatedBuilder(
        animation: dspController,
        builder: (context, _) => StreamAudioDspSheet(dspController: dspController),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
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

          // Заголовок и главный тумблер
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.sliders, size: 20, color: KColors.lav),
                  const SizedBox(width: 8),
                  Text('Аудио DSP Улучшайзер', style: KTypography.sectionHeader),
                ],
              ),
              Switch(
                value: dspController.isEnabled,
                activeColor: KColors.lav,
                onChanged: (val) {
                  HapticFeedback.selectionClick();
                  dspController.toggleDsp(val);
                },
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '32-битный эквалайзер и подавление шума/скримеров для наушников',
            style: KTypography.caption.copyWith(color: KColors.muted),
          ),
          const SizedBox(height: 16),

          // ПРЕСЕТЫ ОБРАБОТКИ
          Text('Готовые пресеты:', style: KTypography.caption.copyWith(color: KColors.muted)),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: AudioDspPreset.values.map((preset) {
                final isSelected = dspController.isEnabled && dspController.currentPreset == preset;
                return GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    dspController.setPreset(preset);
                  },
                  child: Container(
                    margin: const EdgeInsets.only(right: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: isSelected ? KColors.accBg : KColors.well,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected ? KColors.accBorder : KColors.panelBorder,
                        width: 1,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          preset.label,
                          style: KTypography.caption.copyWith(
                            color: isSelected ? KColors.lavInk : KColors.ink,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          preset == AudioDspPreset.speechClarity
                              ? 'Vocal +6dB • Бас -8dB'
                              : (preset == AudioDspPreset.nightMode
                                  ? 'Сжатие пиков 2.5x'
                                  : 'Оригинал'),
                          style: KTypography.monoStats.copyWith(
                            fontSize: 9,
                            color: isSelected ? KColors.lav : KColors.faint,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 16),

          // ПОЛЗУНКИ ТОЧНОЙ ПОДСТРОЙКИ
          Opacity(
            opacity: dspController.isEnabled ? 1.0 : 0.45,
            child: Column(
              children: [
                // 1. Усиление речи стримера (Vocal Boost)
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Усиление голоса (1.5–3.5 кГц):', style: KTypography.body),
                    Text(
                      '${dspController.vocalBoostDb > 0 ? '+' : ''}${dspController.vocalBoostDb.toStringAsFixed(1)} dB',
                      style: KTypography.monoStats.copyWith(color: KColors.lav),
                    ),
                  ],
                ),
                Slider(
                  value: dspController.vocalBoostDb,
                  min: -6.0,
                  max: 12.0,
                  activeColor: KColors.lav,
                  inactiveColor: KColors.cellOff,
                  onChanged: dspController.isEnabled ? dspController.setVocalBoost : null,
                ),

                // 2. Срез баса игр (Bass Cut)
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Срез гулкого баса игр (< 180 Гц):', style: KTypography.body),
                    Text(
                      '${dspController.bassCutDb.toStringAsFixed(1)} dB',
                      style: KTypography.monoStats.copyWith(color: KColors.lav),
                    ),
                  ],
                ),
                Slider(
                  value: dspController.bassCutDb,
                  min: -14.0,
                  max: 0.0,
                  activeColor: KColors.lav,
                  inactiveColor: KColors.cellOff,
                  onChanged: dspController.isEnabled ? dspController.setBassCut : null,
                ),

                // 3. Компрессия пиков (Night DRC)
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Анти-крик (компрессия пиков):', style: KTypography.body),
                    Text(
                      '${dspController.compressionRatio.toStringAsFixed(1)}x',
                      style: KTypography.monoStats.copyWith(color: KColors.lav),
                    ),
                  ],
                ),
                Slider(
                  value: dspController.compressionRatio,
                  min: 1.0,
                  max: 3.0,
                  activeColor: KColors.lav,
                  inactiveColor: KColors.cellOff,
                  onChanged: dspController.isEnabled ? dspController.setCompressionRatio : null,
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // Кнопка сброса
          Center(
            child: TextButton.icon(
              onPressed: () {
                HapticFeedback.lightImpact();
                dspController.resetToFlat();
              },
              icon: const Icon(LucideIcons.rotateCcw, size: 14, color: KColors.muted),
              label: Text(
                'Сбросить в Стандарт (Flat)',
                style: KTypography.caption.copyWith(color: KColors.muted),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
