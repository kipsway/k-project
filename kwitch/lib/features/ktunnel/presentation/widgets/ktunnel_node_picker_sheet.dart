import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/models/tunnel_node.dart';
import '../controllers/ktunnel_controller.dart';

class KTunnelNodePickerSheet extends StatelessWidget {
  final KTunnelController controller;

  const KTunnelNodePickerSheet({
    super.key,
    required this.controller,
  });

  static void show(BuildContext context, KTunnelController controller) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => KTunnelNodePickerSheet(controller: controller),
    );
  }

  @override
  Widget build(BuildContext context) {
    final nodes = controller.nodes;
    final active = controller.activeNode;

    return KGlassContainer(
      borderRadius: 24,
      blurSigma: 24,
      backgroundColor: const Color(0xF20F0F12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
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
          const SizedBox(height: 16),

          // Заголовок и инфо
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.zap, size: 20, color: KColors.lav),
                  const SizedBox(width: 8),
                  Text('Узлы k-Tunnel', style: KTypography.sectionHeader),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: KColors.accBg,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: KColors.accBorder, width: 0.8),
                ),
                child: Text(
                  'wistfalls.cc pool',
                  style: KTypography.monoStats.copyWith(fontSize: 10),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Выберите сервер для максимального битрейта 1440p без дропов кадров',
            style: KTypography.bodyMuted.copyWith(fontSize: 12),
          ),
          const SizedBox(height: 16),

          // Список серверов
          ...nodes.map((node) {
            final isSelected = active?.id == node.id;
            return Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () {
                  HapticFeedback.selectionClick();
                  controller.selectNode(node);
                  Navigator.pop(context);
                },
                borderRadius: BorderRadius.circular(16),
                splashColor: KColors.lav.withOpacity(0.12),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  decoration: BoxDecoration(
                    color: isSelected ? KColors.accBg : KColors.cellOff,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: isSelected ? KColors.accBorder : KColors.panelBorder,
                      width: 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      Text(node.flagEmoji, style: const TextStyle(fontSize: 20)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              node.name,
                              style: KTypography.body.copyWith(
                                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                                color: isSelected ? KColors.ink : KColors.muted,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '${node.host} • Нагрузка: ${node.loadPercentage.toStringAsFixed(0)}%',
                              style: KTypography.caption.copyWith(
                                fontSize: 10,
                                color: KColors.faint,
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Индикатор пинга
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: node.pingMs < 60
                              ? KColors.green.withOpacity(0.15)
                              : KColors.yellow.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: node.pingMs < 60
                                ? KColors.green.withOpacity(0.4)
                                : KColors.yellow.withOpacity(0.4),
                            width: 0.8,
                          ),
                        ),
                        child: Text(
                          '${node.pingMs} мс',
                          style: KTypography.monoStats.copyWith(
                            color: node.pingMs < 60 ? KColors.greenInk : KColors.yellow,
                            fontSize: 11,
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
  }
}
