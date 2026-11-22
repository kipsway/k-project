import 'package:flutter/material.dart';
import '../theme/colors.dart';
import '../theme/text_styles.dart';
import 'glass_container.dart';

/// Модель элемента навигационного дока
class DockItem {
  final IconData icon;
  final String label;

  const DockItem({
    required this.icon,
    required this.label,
  });
}

/// Парящий стеклянный док навигации kStore (Floating Dock).
/// Реализует монолитный дизайн из жидкого стекла со скруглением 32px,
/// деликатную подсветку активного раздела и мягкие тактильные анимации.
class FloatingDock extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onItemSelected;

  const FloatingDock({
    super.key,
    required this.selectedIndex,
    required this.onItemSelected,
  });

  static const List<DockItem> items = [
    DockItem(icon: Icons.grid_view_rounded, label: 'Каталог'),
    DockItem(icon: Icons.download_rounded, label: 'Загрузки'),
    DockItem(icon: Icons.info_outline_rounded, label: 'Инфо'),
  ];

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 16.0, left: 24.0, right: 24.0),
        child: Align(
          alignment: Alignment.bottomCenter,
          child: GlassContainer(
            radius: 32.0,
            showShadow: true,
            padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 6.0),
            backgroundColor: KColors.panel.withOpacity(0.82),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(items.length, (index) {
                final isSelected = selectedIndex == index;
                final item = items[index];

                return _DockTab(
                  item: item,
                  isSelected: isSelected,
                  onTap: () => onItemSelected(index),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }
}

class _DockTab extends StatelessWidget {
  final DockItem item;
  final bool isSelected;
  final VoidCallback onTap;

  const _DockTab({
    required this.item,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOutCubic,
      decoration: BoxDecoration(
        color: isSelected ? KColors.accBg : Colors.transparent,
        borderRadius: BorderRadius.circular(24.0),
        border: isSelected
            ? Border.all(color: KColors.accBorder.withOpacity(0.8), width: 1.0)
            : Border.all(color: Colors.transparent, width: 1.0),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(24.0),
          splashColor: KColors.lav.withOpacity(0.12),
          highlightColor: KColors.lav.withOpacity(0.06),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 10.0),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  item.icon,
                  size: 20,
                  color: isSelected ? KColors.lav : KColors.muted,
                ),
                if (isSelected) ...[
                  const SizedBox(width: 8),
                  Text(
                    item.label,
                    style: KTextStyles.dockLabelActive,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
