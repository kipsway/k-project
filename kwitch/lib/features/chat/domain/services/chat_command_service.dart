import 'package:flutter/foundation.dart';
import '../models/chat_command_item.dart';

/// Сервис шорткатов, быстрых каомодзи и команд чата Chatterino+.
class ChatCommandService extends ChangeNotifier {
  static final ChatCommandService _instance = ChatCommandService._internal();
  factory ChatCommandService() => _instance;

  final List<ChatCommandItem> _commands = [];

  ChatCommandService._internal() {
    _initDefaultCommands();
  }

  void _initDefaultCommands() {
    _commands.addAll([
      const ChatCommandItem(
        trigger: '/shrug',
        title: 'Shrug',
        description: 'Пожать плечами ¯\\_(ツ)_/¯',
        output: '¯\\_(ツ)_/¯',
        category: CommandCategory.fun,
      ),
      const ChatCommandItem(
        trigger: '/flip',
        title: 'Tableflip',
        description: 'Перевернуть стол (╯°□°)╯︵ ┻━┻',
        output: '(╯°□°)╯︵ ┻━┻',
        category: CommandCategory.fun,
      ),
      const ChatCommandItem(
        trigger: '/unflip',
        title: 'Unflip',
        description: 'Вернуть стол на место ┬─┬ノ( º _ ºノ)',
        output: '┬─┬ノ( º _ ºノ)',
        category: CommandCategory.fun,
      ),
      const ChatCommandItem(
        trigger: '/disapprove',
        title: 'Disapprove',
        description: 'Взгляд неодобрения ಠ_ಠ',
        output: 'ಠ_ಠ',
        category: CommandCategory.fun,
      ),
      const ChatCommandItem(
        trigger: '/lenny',
        title: 'Lenny Face',
        description: 'Хитрый смайлик ( ͡° ͜ʖ ͡°)',
        output: '( ͡° ͜ʖ ͡°)',
        category: CommandCategory.fun,
      ),
      const ChatCommandItem(
        trigger: '/me',
        title: 'Курсив /me',
        description: 'Выделение текста другим цветом',
        output: '/me ',
        category: CommandCategory.formatting,
        isClientMacro: false,
      ),
      const ChatCommandItem(
        trigger: '/clear',
        title: 'Очистить чат',
        description: 'Очистить историю сообщений в окне',
        output: '/clear',
        category: CommandCategory.moderation,
        isClientMacro: false,
      ),
      const ChatCommandItem(
        trigger: '/gg',
        title: 'GG WP',
        description: 'Быстрое поздравление с хорошей игрой',
        output: 'GG WP Clap',
        category: CommandCategory.fun,
      ),
      const ChatCommandItem(
        trigger: '/pepel',
        title: 'pepeL',
        description: 'Уютный перерыв на чай или кофе',
        output: 'pepeL ☕',
        category: CommandCategory.fun,
      ),
      const ChatCommandItem(
        trigger: '/tunnel',
        title: 'k-Tunnel Core',
        description: 'Индикатор статуса туннеля 1440p',
        output: '⚡ kWitch v1.0: k-Tunnel 1440p Active',
        category: CommandCategory.custom,
      ),
    ]);
  }

  List<ChatCommandItem> get commands => List.unmodifiable(_commands);

  /// Поиск команд по префиксу или названию
  List<ChatCommandItem> search(String query) {
    final clean = query.trim().toLowerCase();
    if (clean.isEmpty) return commands;

    return _commands.where((cmd) {
      return cmd.trigger.toLowerCase().contains(clean) ||
          cmd.title.toLowerCase().contains(clean) ||
          cmd.description.toLowerCase().contains(clean);
    }).toList();
  }

  /// Фильтрация по категории
  List<ChatCommandItem> getByCategory(CommandCategory category) {
    return _commands.where((cmd) => cmd.category == category).toList();
  }

  /// Автоматическая замена макроса в тексте при отправке
  String processInput(String raw) {
    var text = raw.trim();
    if (text.isEmpty) return text;

    for (final cmd in _commands) {
      if (cmd.isClientMacro) {
        // Замена отдельного триггера (например "/shrug" на смайлик)
        if (text == cmd.trigger) {
          return cmd.output;
        }
        if (text.startsWith('${cmd.trigger} ')) {
          text = text.replaceFirst(cmd.trigger, cmd.output);
        } else if (text.endsWith(' ${cmd.trigger}')) {
          text = text.replaceRange(text.length - cmd.trigger.length, text.length, cmd.output);
        } else if (text.contains(' ${cmd.trigger} ')) {
          text = text.replaceAll(' ${cmd.trigger} ', ' ${cmd.output} ');
        }
      }
    }
    return text;
  }

  /// Добавление пользовательского макроса
  void addCustomMacro({
    required String trigger,
    required String title,
    required String output,
    String description = 'Пользовательский макрос',
  }) {
    final normalizedTrigger = trigger.startsWith('/') ? trigger : '/$trigger';
    _commands.removeWhere((c) => c.trigger.toLowerCase() == normalizedTrigger.toLowerCase());
    _commands.add(ChatCommandItem(
      trigger: normalizedTrigger,
      title: title,
      description: description,
      output: output,
      category: CommandCategory.custom,
      isCustom: true,
    ));
    notifyListeners();
  }

  /// Удаление пользовательского макроса
  void removeCustomMacro(String trigger) {
    final normalizedTrigger = trigger.startsWith('/') ? trigger : '/$trigger';
    _commands.removeWhere((c) => c.trigger.toLowerCase() == normalizedTrigger.toLowerCase() && c.isCustom);
    notifyListeners();
  }
}
