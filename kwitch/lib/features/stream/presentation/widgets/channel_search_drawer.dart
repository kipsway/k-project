import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/models/twitch_channel_item.dart';

class ChannelSearchDrawer extends StatefulWidget {
  final ValueChanged<TwitchChannelItem> onSelectChannel;

  const ChannelSearchDrawer({
    super.key,
    required this.onSelectChannel,
  });

  static void show(
    BuildContext context, {
    required ValueChanged<TwitchChannelItem> onSelectChannel,
  }) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => ChannelSearchDrawer(onSelectChannel: onSelectChannel),
    );
  }

  @override
  State<ChannelSearchDrawer> createState() => _ChannelSearchDrawerState();
}

class _ChannelSearchDrawerState extends State<ChannelSearchDrawer> {
  String _searchQuery = '';
  int _selectedTab = 0; // 0 = Отслеживаемые, 1 = Топ

  @override
  Widget build(BuildContext context) {
    final channels = TwitchChannelItem.featuredChannels.where((c) {
      final matchesTab = _selectedTab == 0 ? c.isFollowed : true;
      final matchesSearch = _searchQuery.isEmpty ||
          c.displayName.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          c.category.toLowerCase().contains(_searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    }).toList();

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
                  const Icon(LucideIcons.tv, size: 20, color: KColors.lav),
                  const SizedBox(width: 8),
                  Text('Каналы и стримы', style: KTypography.sectionHeader),
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
                  'k-Tunnel 1440p Ready',
                  style: KTypography.monoStats.copyWith(
                    fontSize: 9,
                    color: KColors.lavInk,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Поле поиска каналов
          Container(
            height: 38,
            decoration: BoxDecoration(
              color: KColors.well,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: KColors.wellBorder, width: 1),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                const Icon(LucideIcons.search, size: 16, color: KColors.faint),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    onChanged: (val) => setState(() => _searchQuery = val),
                    style: KTypography.body.copyWith(fontSize: 12),
                    decoration: InputDecoration(
                      hintText: 'Поиск канала или игры...',
                      hintStyle: KTypography.bodyMuted.copyWith(
                        color: KColors.faint,
                        fontSize: 12,
                      ),
                      border: InputBorder.none,
                      isDense: true,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Табы переключения
          Row(
            children: [
              _buildTabPill('Отслеживаемые', index: 0),
              const SizedBox(width: 8),
              _buildTabPill('Топ стримы', index: 1),
            ],
          ),
          const SizedBox(height: 14),

          // Список каналов
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 280),
            child: channels.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24.0),
                      child: Text(
                        'Каналы не найдены',
                        style: KTypography.caption.copyWith(color: KColors.faint),
                      ),
                    ),
                  )
                : ListView.builder(
                    shrinkWrap: true,
                    itemCount: channels.length,
                    itemBuilder: (context, index) {
                      final item = channels[index];
                      return Material(
                        color: Colors.transparent,
                        child: InkWell(
                          onTap: () {
                            HapticFeedback.lightImpact();
                            widget.onSelectChannel(item);
                            Navigator.pop(context);
                          },
                          borderRadius: BorderRadius.circular(16),
                          splashColor: KColors.lav.withOpacity(0.15),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            margin: const EdgeInsets.symmetric(vertical: 4),
                            decoration: BoxDecoration(
                              color: KColors.cellOff,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: KColors.panelBorder, width: 0.8),
                            ),
                            child: Row(
                              children: [
                                // Аватар стримера с лавандовым ободком
                                Container(
                                  width: 42,
                                  height: 42,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    border: Border.all(color: KColors.lav, width: 1.5),
                                    color: KColors.well,
                                  ),
                                  child: Center(
                                    child: Text(
                                      item.displayName[0].toUpperCase(),
                                      style: KTypography.chipLabel.copyWith(
                                        color: KColors.lavInk,
                                        fontSize: 16,
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                // Инфо
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Text(
                                            item.displayName,
                                            style: KTypography.body.copyWith(
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                          if (item.isFollowed) ...[
                                            const SizedBox(width: 4),
                                            const Icon(LucideIcons.star, size: 12, color: KColors.yellow),
                                          ],
                                        ],
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        item.category,
                                        style: KTypography.caption.copyWith(
                                          color: KColors.lavInk,
                                          fontSize: 11,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        item.title,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: KTypography.caption.copyWith(
                                          color: KColors.faint,
                                          fontSize: 10,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 8),
                                // Онлайн бейдж
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: KColors.red.withOpacity(0.18),
                                    borderRadius: BorderRadius.circular(999),
                                    border: Border.all(color: KColors.red, width: 0.8),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Container(
                                        width: 5,
                                        height: 5,
                                        decoration: const BoxDecoration(
                                          color: KColors.red,
                                          shape: BoxShape.circle,
                                        ),
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        '${(item.viewerCount / 1000).toStringAsFixed(1)}k',
                                        style: KTypography.monoStats.copyWith(
                                          fontSize: 9,
                                          color: KColors.ink,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabPill(String label, {required int index}) {
    final isSelected = _selectedTab == index;
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        setState(() => _selectedTab = index);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? KColors.accBg : KColors.cellOff,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: isSelected ? KColors.accBorder : KColors.panelBorder,
            width: 1,
          ),
        ),
        child: Text(
          label,
          style: KTypography.chipLabel.copyWith(
            fontSize: 11,
            color: isSelected ? KColors.lavInk : KColors.muted,
          ),
        ),
      ),
    );
  }
}
