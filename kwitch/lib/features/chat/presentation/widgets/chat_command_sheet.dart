import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/models/chat_command_item.dart';
import '../../domain/services/chat_command_service.dart';

/// Шторка быстрых команд, каомодзи и шорткатов чата Chatterino+.
class ChatCommandSheet extends StatefulWidget {
  final ValueChanged<String> onSelectCommand;

  const ChatCommandSheet({
    super.key,
    required this.onSelectCommand,
  });

  static Future<void> show(BuildContext context, {required ValueChanged<String> onSelectCommand}) {
    return showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => ChatCommandSheet(onSelectCommand: onSelectCommand),
    );
  }

  @override
  State<ChatCommandSheet> createState() => _ChatCommandSheetState();
}

class _ChatCommandSheetState extends State<ChatCommandSheet> {
  final ChatCommandService _service = ChatCommandService();
  final TextEditingController _searchController = TextEditingController();

  CommandCategory? _selectedCategory;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() {
        _searchQuery = _searchController.text;
      });
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showAddCustomDialog() {
    final triggerController = TextEditingController();
    final titleController = TextEditingController();
    final outputController = TextEditingController();

    showDialog(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        backgroundColor: KColors.panel,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: const BorderSide(color: KColors.panelBorder),
        ),
        title: Text(
          'Новый макрос Chatterino+',
          style: KTypography.heading2.copyWith(color: KColors.ink),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: triggerController,
              style: KTypography.body.copyWith(color: KColors.ink),
              decoration: InputDecoration(
                labelText: 'Триггер (например /gg)',
                labelStyle: KTypography.caption.copyWith(color: KColors.muted),
                enabledBorder: const UnderlineInputBorder(
                  borderSide: BorderSide(color: KColors.panelBorder),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: titleController,
              style: KTypography.body.copyWith(color: KColors.ink),
              decoration: InputDecoration(
                labelText: 'Название',
                labelStyle: KTypography.caption.copyWith(color: KColors.muted),
                enabledBorder: const UnderlineInputBorder(
                  borderSide: BorderSide(color: KColors.panelBorder),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: outputController,
              style: KTypography.body.copyWith(color: KColors.ink),
              decoration: InputDecoration(
                labelText: 'Текст подстановки',
                labelStyle: KTypography.caption.copyWith(color: KColors.muted),
                enabledBorder: const UnderlineInputBorder(
                  borderSide: BorderSide(color: KColors.panelBorder),
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx),
            child: Text('Отмена', style: KTypography.caption.copyWith(color: KColors.muted)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: KColors.lav,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
            onPressed: () {
              final trigger = triggerController.text.trim();
              final output = outputController.text.trim();
              if (trigger.isNotEmpty && output.isNotEmpty) {
                _service.addCustomMacro(
                  trigger: trigger,
                  title: titleController.text.trim().isNotEmpty ? titleController.text.trim() : trigger,
                  output: output,
                );
                setState(() {});
                Navigator.pop(dialogCtx);
              }
            },
            child: Text(
              'Сохранить',
              style: KTypography.caption.copyWith(
                color: KColors.bg,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    List<ChatCommandItem> list = _service.search(_searchQuery);
    if (_selectedCategory != null) {
      list = list.where((c) => c.category == _selectedCategory).toList();
    }

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: KGlassContainer(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: SizedBox(
          height: 480,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Хэндл
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
              const SizedBox(height: 12),

              // Шапка с кнопкой добавления макроса
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: KColors.accBg,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(LucideIcons.terminal, size: 16, color: KColors.lav),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        'Команды и каомодзи',
                        style: KTypography.heading2.copyWith(fontSize: 18),
                      ),
                    ],
                  ),
                  IconButton(
                    onPressed: _showAddCustomDialog,
                    icon: const Icon(LucideIcons.plusCircle, size: 20, color: KColors.lav),
                    tooltip: 'Добавить макрос',
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Поле поиска
              Container(
                height: 40,
                decoration: BoxDecoration(
                  color: KColors.cellOff,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: KColors.panelBorder),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  children: [
                    const Icon(LucideIcons.search, size: 16, color: KColors.muted),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        style: KTypography.body.copyWith(fontSize: 13),
                        decoration: InputDecoration(
                          hintText: 'Поиск команды (например /shrug, /flip)...',
                          hintStyle: KTypography.caption.copyWith(color: KColors.faint),
                          border: InputBorder.none,
                          isDense: true,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Чипы категорий
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _buildCategoryChip('Все', null),
                    _buildCategoryChip('Каомодзи', CommandCategory.fun),
                    _buildCategoryChip('Форматирование', CommandCategory.formatting),
                    _buildCategoryChip('Модерация', CommandCategory.moderation),
                    _buildCategoryChip('Мои макросы', CommandCategory.custom),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Список команд
              Expanded(
                child: list.isEmpty
                    ? Center(
                        child: Text(
                          'Команды не найдены',
                          style: KTypography.caption.copyWith(color: KColors.muted),
                        ),
                      )
                    : ListView.separated(
                        itemCount: list.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final item = list[index];
                          return GestureDetector(
                            onTap: () {
                              HapticFeedback.selectionClick();
                              widget.onSelectCommand(item.output);
                              Navigator.pop(context);
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              decoration: BoxDecoration(
                                color: KColors.cellOff,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: KColors.panelBorder),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    decoration: BoxDecoration(
                                      color: KColors.accBg,
                                      borderRadius: BorderRadius.circular(8),
                                      border: Border.all(color: KColors.accBorder.withOpacity(0.5)),
                                    ),
                                    child: Text(
                                      item.trigger,
                                      style: KTypography.monoSmall.copyWith(
                                        color: KColors.lavInk,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          item.title,
                                          style: KTypography.body.copyWith(
                                            color: KColors.ink,
                                            fontWeight: FontWeight.w600,
                                            fontSize: 13,
                                          ),
                                        ),
                                        Text(
                                          item.description,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: KTypography.caption.copyWith(
                                            color: KColors.muted,
                                            fontSize: 11,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Text(
                                    item.output,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: KTypography.body.copyWith(
                                      color: KColors.lav,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w500,
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
        ),
      ),
    );
  }

  Widget _buildCategoryChip(String label, CommandCategory? category) {
    final isSelected = _selectedCategory == category;
    return GestureDetector(
      onTap: () {
        setState(() {
          _selectedCategory = category;
        });
      },
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? KColors.lav : KColors.cellOff,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? KColors.lav : KColors.panelBorder,
          ),
        ),
        child: Text(
          label,
          style: KTypography.caption.copyWith(
            color: isSelected ? KColors.bg : KColors.ink,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}
