import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_typography.dart';
import '../../../chat/domain/services/chat_command_service.dart';
import '../../../chat/domain/services/emote_index_service.dart';
import '../../../chat/presentation/widgets/chat_command_sheet.dart';
import '../../../chat/presentation/widgets/emote_autocomplete_overlay.dart';

class ChatInputBar extends StatefulWidget {
  final ValueChanged<String> onSendMessage;
  final VoidCallback onOpenEmotes;

  const ChatInputBar({
    super.key,
    required this.onSendMessage,
    required this.onOpenEmotes,
  });

  @override
  State<ChatInputBar> createState() => _ChatInputBarState();
}

class _ChatInputBarState extends State<ChatInputBar> {
  final TextEditingController _controller = TextEditingController();
  final EmoteIndexService _emoteIndex = EmoteIndexService();
  final ChatCommandService _commandService = ChatCommandService();

  bool _hasText = false;
  List<IndexedEmote> _autocompleteSuggestions = [];
  int _colonStartIndex = -1;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onTextChanged);
  }

  void _onTextChanged() {
    final text = _controller.text;
    final hasText = text.trim().isNotEmpty;
    if (hasText != _hasText) {
      setState(() => _hasText = hasText);
    }

    final selection = _controller.selection;
    if (selection.baseOffset > 0) {
      final textBeforeCursor = text.substring(0, selection.baseOffset);
      final lastColon = textBeforeCursor.lastIndexOf(':');

      if (lastColon != -1) {
        // Проверяем, нет ли пробелов между ':' и курсором
        final query = textBeforeCursor.substring(lastColon);
        if (!query.contains(' ')) {
          final results = _emoteIndex.search(query);
          setState(() {
            _colonStartIndex = lastColon;
            _autocompleteSuggestions = results;
          });
          return;
        }
      }
    }

    if (_autocompleteSuggestions.isNotEmpty) {
      setState(() {
        _colonStartIndex = -1;
        _autocompleteSuggestions = [];
      });
    }
  }

  void _insertAutocompleteEmote(IndexedEmote emote) {
    if (_colonStartIndex == -1) return;

    final text = _controller.text;
    final selection = _controller.selection;
    final beforeColon = text.substring(0, _colonStartIndex);
    final afterCursor = selection.baseOffset < text.length
        ? text.substring(selection.baseOffset)
        : '';

    final newText = '$beforeColon${emote.name} $afterCursor';
    _emoteIndex.recordUsage(emote.name);

    _controller.value = TextEditingValue(
      text: newText,
      selection: TextSelection.collapsed(
        offset: beforeColon.length + emote.name.length + 1,
      ),
    );

    setState(() {
      _colonStartIndex = -1;
      _autocompleteSuggestions = [];
    });
  }

  void _submit() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    HapticFeedback.lightImpact();
    final processed = _commandService.processInput(text);
    widget.onSendMessage(processed);
    _controller.clear();
    setState(() {
      _autocompleteSuggestions = [];
    });
  }

  void _openCommandsModal() {
    ChatCommandSheet.show(
      context,
      onSelectCommand: (commandOutput) {
        final current = _controller.text.trim();
        if (current.isEmpty) {
          _controller.text = '$commandOutput ';
        } else {
          _controller.text = '$current $commandOutput ';
        }
        _controller.selection = TextSelection.collapsed(offset: _controller.text.length);
      },
    );
  }

  @override
  void dispose() {
    _controller.removeListener(_onTextChanged);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Плавающее окно автодополнения смайлов по ':'
        if (_autocompleteSuggestions.isNotEmpty)
          EmoteAutocompleteOverlay(
            suggestions: _autocompleteSuggestions,
            onSelect: _insertAutocompleteEmote,
          ),

        // Основной инпут-бар
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: const BoxDecoration(
            color: KColors.panel,
            border: Border(
              top: BorderSide(color: KColors.panelBorder, width: 1.0),
            ),
          ),
          child: SafeArea(
            top: false,
            child: Row(
              children: [
                // Поле ввода сообщения
                Expanded(
                  child: Container(
                    height: 42,
                    decoration: BoxDecoration(
                      color: KColors.well,
                      borderRadius: BorderRadius.circular(999), // Stadium капсула M3
                      border: Border.all(color: KColors.wellBorder, width: 1.0),
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _controller,
                            style: KTypography.body.copyWith(fontSize: 13),
                            textInputAction: TextInputAction.send,
                            onSubmitted: (_) => _submit(),
                            decoration: InputDecoration(
                              hintText: 'Отправить сообщение (наберите : для смайла)...',
                              hintStyle: KTypography.bodyMuted.copyWith(
                                color: KColors.faint,
                                fontSize: 12,
                              ),
                              border: InputBorder.none,
                              isDense: true,
                              contentPadding: const EdgeInsets.symmetric(vertical: 10),
                            ),
                          ),
                        ),
                        // Кнопка команд / каомодзи (Chatterino+ Slash Commands)
                        GestureDetector(
                          onTap: () {
                            HapticFeedback.selectionClick();
                            _openCommandsModal();
                          },
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            child: const Icon(
                              LucideIcons.terminal,
                              size: 18,
                              color: KColors.lav,
                            ),
                          ),
                        ),
                        const SizedBox(width: 4),
                        // Кнопка смайлов (7TV / BTTV / FFZ)
                        GestureDetector(
                          onTap: () {
                            HapticFeedback.selectionClick();
                            widget.onOpenEmotes();
                          },
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            child: const Icon(
                              LucideIcons.smile,
                              size: 20,
                              color: KColors.muted,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),

                // Кнопка отправки
                GestureDetector(
                  onTap: _hasText ? _submit : null,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: _hasText ? KColors.lav : KColors.cellOff,
                      boxShadow: _hasText
                          ? [
                              BoxShadow(
                                color: KColors.lav.withOpacity(0.4),
                                blurRadius: 8,
                                offset: const Offset(0, 2),
                              ),
                            ]
                          : null,
                    ),
                    child: Center(
                      child: Icon(
                        LucideIcons.send,
                        size: 18,
                        color: _hasText ? KColors.bg : KColors.faint,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
