/// Категория команды чата или макроса.
enum CommandCategory {
  fun,         // Смайловые каомодзи и фановые макросы (/shrug, /flip)
  formatting,  // Форматирование текста (/me, /color)
  moderation,  // Действия модератора (/clear, /timeout, /ban)
  custom,      // Созданные пользователем шорткаты
}

/// Модель команды или макроса чата Chatterino+.
class ChatCommandItem {
  final String trigger;       // Например "/shrug", "/flip", "/gg"
  final String title;         // Название
  final String description;   // Описание действия
  final String output;        // То, что подставится или отправится в чат
  final CommandCategory category;
  final bool isClientMacro;   // true: подстановка текста на клиенте; false: IRC команда сервера
  final bool isCustom;        // true: создана пользователем

  const ChatCommandItem({
    required this.trigger,
    required this.title,
    required this.description,
    required this.output,
    required this.category,
    this.isClientMacro = true,
    this.isCustom = false,
  });

  ChatCommandItem copyWith({
    String? trigger,
    String? title,
    String? description,
    String? output,
    CommandCategory? category,
    bool? isClientMacro,
    bool? isCustom,
  }) {
    return ChatCommandItem(
      trigger: trigger ?? this.trigger,
      title: title ?? this.title,
      description: description ?? this.description,
      output: output ?? this.output,
      category: category ?? this.category,
      isClientMacro: isClientMacro ?? this.isClientMacro,
      isCustom: isCustom ?? this.isCustom,
    );
  }

  Map<String, dynamic> toJson() => {
    'trigger': trigger,
    'title': title,
    'description': description,
    'output': output,
    'category': category.name,
    'isClientMacro': isClientMacro,
    'isCustom': isCustom,
  };

  factory ChatCommandItem.fromJson(Map<String, dynamic> json) {
    return ChatCommandItem(
      trigger: json['trigger'] as String,
      title: json['title'] as String,
      description: json['description'] as String,
      output: json['output'] as String,
      category: CommandCategory.values.firstWhere(
        (c) => c.name == json['category'],
        orElse: () => CommandCategory.custom,
      ),
      isClientMacro: json['isClientMacro'] as bool? ?? true,
      isCustom: json['isCustom'] as bool? ?? true,
    );
  }
}
