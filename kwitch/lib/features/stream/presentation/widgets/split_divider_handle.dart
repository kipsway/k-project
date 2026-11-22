import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/theme/k_colors.dart';

class SplitDividerHandle extends StatelessWidget {
  final ValueChanged<double> onVerticalDragUpdate;
  final VoidCallback? onDragStart;
  final VoidCallback? onDragEnd;

  const SplitDividerHandle({
    super.key,
    required this.onVerticalDragUpdate,
    this.onDragStart,
    this.onDragEnd,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onVerticalDragStart: (_) {
        HapticFeedback.selectionClick();
        onDragStart?.call();
      },
      onVerticalDragUpdate: (details) {
        onVerticalDragUpdate(details.primaryDelta ?? 0);
      },
      onVerticalDragEnd: (_) {
        onDragEnd?.call();
      },
      child: Container(
        height: 16,
        width: double.infinity,
        color: KColors.bg,
        child: Center(
          child: Container(
            width: 44,
            height: 4,
            decoration: BoxDecoration(
              color: KColors.faint.withOpacity(0.5),
              borderRadius: BorderRadius.circular(999), // Stadium капсула
            ),
          ),
        ),
      ),
    );
  }
}
