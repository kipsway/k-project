import 'dart:ui';
import 'package:flutter/material.dart';
import '../models/mod_item.dart';
import '../theme/colors.dart';
import '../theme/text_styles.dart';
import '../widgets/glass_container.dart';
import '../widgets/mod_card.dart';
import 'mod_detail_sheet.dart';

/// Модальный экран быстрого поиска модов kStore.
/// Открывается при нажатии на стеклянную кнопку поиска в шапке каталога.
class SearchModal extends StatefulWidget {
  final List<ModItem> allMods;
  final void Function(ModItem mod) onInstallMod;

  const SearchModal({
    super.key,
    required this.allMods,
    required this.onInstallMod,
  });

  /// Статический метод для удобного открытия поиска
  static Future<void> show(
    BuildContext context, {
    required List<ModItem> allMods,
    required void Function(ModItem mod) onInstallMod,
  }) {
    return showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Search',
      barrierColor: Colors.black.withOpacity(0.7),
      transitionDuration: const Duration(milliseconds: 220),
      transitionBuilder: (context, anim1, anim2, child) {
        return FadeTransition(
          opacity: CurvedAnimation(parent: anim1, curve: Curves.easeOutCubic),
          child: child,
        );
      },
      pageBuilder: (context, _, __) => SearchModal(
        allMods: allMods,
        onInstallMod: onInstallMod,
      ),
    );
  }

  @override
  State<SearchModal> createState() => _SearchModalState();
}

class _SearchModalState extends State<SearchModal> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  String _query = '';

  @override
  void initState() {
    super.initState();
    // Автофокус на поле ввода при открытии
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  List<ModItem> get _filteredMods {
    final cleanQuery = _query.trim().toLowerCase();
    if (cleanQuery.isEmpty) return widget.allMods;

    return widget.allMods.where((mod) {
      final inName = mod.name.toLowerCase().contains(cleanQuery);
      final inDesc = mod.description.toLowerCase().contains(cleanQuery);
      final inAuthor = mod.author.toLowerCase().contains(cleanQuery);
      return inName || inDesc || inAuthor;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filteredMods;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          color: KColors.bg.withOpacity(0.92),
          child: SafeArea(
            child: Column(
              children: [
                // Панель ввода поиска
                _buildSearchHeader(),

                // Результаты поиска
                Expanded(
                  child: filtered.isEmpty
                      ? _buildEmptyState()
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                          physics: const BouncingScrollPhysics(),
                          itemCount: filtered.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 14),
                          itemBuilder: (context, index) {
                            final mod = filtered[index];
                            return ModCard(
                              mod: mod,
                              onTap: () {
                                ModDetailSheet.show(
                                  context,
                                  mod: mod,
                                  onActionTap: () => widget.onInstallMod(mod),
                                );
                              },
                              onActionTap: () => widget.onInstallMod(mod),
                            );
                          },
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Верхняя панель поиска с полем ввода и кнопкой «Закрыть»
  Widget _buildSearchHeader() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Row(
        children: [
          // Стеклянное поле ввода
          Expanded(
            child: GlassContainer(
              radius: 20.0,
              backgroundColor: KColors.cellOff.withOpacity(0.8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              child: Row(
                children: [
                  const Icon(
                    Icons.search_rounded,
                    size: 20,
                    color: KColors.lav,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      focusNode: _focusNode,
                      style: const TextStyle(
                        fontFamily: KTextStyles.fontFamily,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: KColors.ink,
                      ),
                      cursorColor: KColors.lav,
                      decoration: const InputDecoration(
                        hintText: 'Поиск модов (название, DPI, YouTube)...',
                        hintStyle: TextStyle(
                          fontFamily: KTextStyles.fontFamily,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: KColors.faint,
                        ),
                        border: InputBorder.none,
                        isDense: true,
                        contentPadding: EdgeInsets.symmetric(vertical: 8),
                      ),
                      onChanged: (val) {
                        setState(() => _query = val);
                      },
                    ),
                  ),
                  if (_query.isNotEmpty)
                    GestureDetector(
                      onTap: () {
                        _controller.clear();
                        setState(() => _query = '');
                      },
                      child: const Padding(
                        padding: EdgeInsets.all(4.0),
                        child: Icon(
                          Icons.close_rounded,
                          size: 18,
                          color: KColors.muted,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 10),
          // Кнопка закрытия
          GlassContainer(
            radius: 999.0,
            width: 44,
            height: 44,
            backgroundColor: KColors.cellOff.withOpacity(0.7),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () => Navigator.of(context).pop(),
                borderRadius: BorderRadius.circular(999),
                splashColor: KColors.lav.withOpacity(0.15),
                child: const Center(
                  child: Icon(
                    Icons.close_rounded,
                    size: 20,
                    color: KColors.ink,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Состояние «Ничего не найдено»
  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: KColors.cellOff,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: KColors.panelBorder, width: 1.0),
              ),
              child: const Icon(
                Icons.search_off_rounded,
                size: 32,
                color: KColors.faint,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Ничего не найдено',
              style: TextStyle(
                fontFamily: KTextStyles.fontFamily,
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: KColors.ink,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Попробуйте ввести другое ключевое слово, например: TikTok, k-Tunnel или Twitch.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: KTextStyles.fontFamily,
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: KColors.muted,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
