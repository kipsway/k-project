import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';

class EmoteModel {
  final String name;
  final String provider; // '7TV', 'BTTV', 'FFZ', 'Twitch'
  final bool isAnimated;

  const EmoteModel({
    required this.name,
    required this.provider,
    this.isAnimated = false,
  });
}

class ChatterinoEmotesSheet extends StatefulWidget {
  final String channel;
  final ValueChanged<String> onSelectEmote;

  const ChatterinoEmotesSheet({
    super.key,
    required this.channel,
    required this.onSelectEmote,
  });

  @override
  State<ChatterinoEmotesSheet> createState() => _ChatterinoEmotesSheetState();
}

class _ChatterinoEmotesSheetState extends State<ChatterinoEmotesSheet> {
  String _searchQuery = '';
  String _selectedTab = '7TV';

  static const List<EmoteModel> allEmotes = [
    // 7TV
    EmoteModel(name: 'catJAM', provider: '7TV', isAnimated: true),
    EmoteModel(name: 'Clap', provider: '7TV', isAnimated: true),
    EmoteModel(name: 'monkaW', provider: '7TV'),
    EmoteModel(name: 'PogU', provider: '7TV'),
    EmoteModel(name: '5Head', provider: '7TV'),
    EmoteModel(name: 'PepeLa', provider: '7TV'),
    EmoteModel(name: 'EZ', provider: '7TV'),
    EmoteModel(name: 'KEKW', provider: '7TV'),
    EmoteModel(name: 'modCheck', provider: '7TV', isAnimated: true),
    EmoteModel(name: 'pepeD', provider: '7TV', isAnimated: true),
    EmoteModel(name: 'widepeepoHappy', provider: '7TV'),
    EmoteModel(name: 'Sadge', provider: '7TV'),

    // BTTV
    EmoteModel(name: 'LULW', provider: 'BTTV'),
    EmoteModel(name: 'monkaS', provider: 'BTTV'),
    EmoteModel(name: 'OMEGALUL', provider: 'BTTV'),
    EmoteModel(name: 'pepeJAM', provider: 'BTTV', isAnimated: true),

    // FFZ
    EmoteModel(name: 'AYAYA', provider: 'FFZ'),
    EmoteModel(name: 'Pog', provider: 'FFZ'),
    EmoteModel(name: 'FeelsWeirdMan', provider: 'FFZ'),
  ];

  @override
  Widget build(BuildContext context) {
    final filtered = allEmotes.where((e) {
      final matchesTab = _selectedTab == 'Все' || e.provider == _selectedTab;
      final matchesSearch = _searchQuery.isEmpty ||
          e.name.toLowerCase().contains(_searchQuery.toLowerCase());
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
          // Хэндл
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

          // Заголовок и провайдер
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Смайлы', style: KTypography.sectionHeader),
              Row(
                children: [
                  Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(
                      color: KColors.green,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 5),
                  Text(
                    'ws.rish098.xyz',
                    style: KTypography.monoStats.copyWith(
                      color: KColors.greenInk,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Поле поиска смайлов
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
                      hintText: 'Поиск по имени (например: catJAM)...',
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

          // Табы провайдеров (7TV, BTTV, FFZ, Все)
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: ['7TV', 'BTTV', 'FFZ', 'Все'].map((tab) {
                final isSelected = _selectedTab == tab;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() => _selectedTab = tab);
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: isSelected ? KColors.accBg : KColors.cellOff,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: isSelected ? KColors.accBorder : KColors.panelBorder,
                          width: 1,
                        ),
                      ),
                      child: Text(
                        tab,
                        style: KTypography.chipLabel.copyWith(
                          fontSize: 11,
                          color: isSelected ? KColors.lavInk : KColors.muted,
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 14),

          // Сетка смайлов
          SizedBox(
            height: 220,
            child: filtered.isEmpty
                ? Center(
                    child: Text(
                      'Смайлы не найдены',
                      style: KTypography.caption.copyWith(color: KColors.faint),
                    ),
                  )
                : GridView.builder(
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 4,
                      crossAxisSpacing: 8,
                      mainAxisSpacing: 8,
                      childAspectRatio: 1.8,
                    ),
                    itemCount: filtered.length,
                    itemBuilder: (context, index) {
                      final item = filtered[index];
                      return GestureDetector(
                        onTap: () {
                          HapticFeedback.lightImpact();
                          widget.onSelectEmote(item.name);
                          Navigator.pop(context);
                        },
                        child: Container(
                          decoration: BoxDecoration(
                            color: KColors.cellOff,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: KColors.panelBorder,
                              width: 0.8,
                            ),
                          ),
                          padding: const EdgeInsets.all(6),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                item.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: KColors.lavInk,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                item.provider,
                                style: TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w600,
                                  color: item.isAnimated
                                      ? KColors.lav
                                      : KColors.faint,
                                ),
                              ),
                            ],
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
}
