import 'package:flutter/foundation.dart';
import '../models/chat_channel_tab.dart';

/// Сервис управления вкладками мульти-чата (Multi-Chat Split) в kWitch.
/// Позволяет одновременно отслеживать и переключаться между чатами нескольких стримеров
/// (например, турнирный стрим + комьюнити кастер + чат друзей) без обрыва сокетов.
class ChatterinoMultiChatService extends ChangeNotifier {
  final List<ChatChannelTab> _tabs = [];
  late String _activeChannelId;
  static const int maxTabs = 5;

  String get activeChannelId => _activeChannelId;
  List<ChatChannelTab> get tabs => List.unmodifiable(_tabs);

  ChatChannelTab get activeTab => _tabs.firstWhere(
        (t) => t.channelId == _activeChannelId,
        orElse: () => _tabs.isNotEmpty
            ? _tabs.first
            : const ChatChannelTab(channelId: 'buda', displayName: 'buda', isPrimary: true),
      );

  ChatterinoMultiChatService({String initialChannel = 'buda'}) {
    _activeChannelId = initialChannel.toLowerCase();
    _tabs.add(ChatChannelTab(
      channelId: _activeChannelId,
      displayName: initialChannel,
      isPrimary: true,
    ));
  }

  /// Обновление основного канала стрима (при переключении трансляции)
  void setPrimaryChannel(String channelId, {String? displayName}) {
    final cleanId = channelId.trim().toLowerCase();
    if (cleanId.isEmpty) return;

    final primaryIndex = _tabs.indexWhere((t) => t.isPrimary);
    if (primaryIndex != -1) {
      _tabs[primaryIndex] = _tabs[primaryIndex].copyWith(
        channelId: cleanId,
        displayName: displayName ?? cleanId,
      );
    } else {
      _tabs.insert(0, ChatChannelTab(
        channelId: cleanId,
        displayName: displayName ?? cleanId,
        isPrimary: true,
      ));
    }
    _activeChannelId = cleanId;
    notifyListeners();
  }

  /// Добавление дополнительного чат-канала во вкладки
  bool addChannel(String channelId, {String? displayName}) {
    final cleanId = channelId.trim().toLowerCase();
    if (cleanId.isEmpty) return false;

    // Если уже открыт, переключаемся на него
    final existingIndex = _tabs.indexWhere((t) => t.channelId == cleanId);
    if (existingIndex != -1) {
      switchChannel(cleanId);
      return true;
    }

    // Ограничение максимум 5 вкладок
    if (_tabs.length >= maxTabs) {
      return false;
    }

    _tabs.add(ChatChannelTab(
      channelId: cleanId,
      displayName: displayName ?? cleanId,
      isPrimary: false,
    ));
    _activeChannelId = cleanId;
    notifyListeners();
    return true;
  }

  /// Закрытие вкладки
  void closeChannel(String channelId) {
    final cleanId = channelId.trim().toLowerCase();
    final index = _tabs.indexWhere((t) => t.channelId == cleanId);
    if (index == -1) return;

    // Основной канал стрима не закрывается
    if (_tabs[index].isPrimary) return;

    _tabs.removeAt(index);
    if (_activeChannelId == cleanId) {
      _activeChannelId = _tabs.first.channelId;
    }
    notifyListeners();
  }

  /// Переключение на другую вкладку
  void switchChannel(String channelId) {
    final cleanId = channelId.trim().toLowerCase();
    final index = _tabs.indexWhere((t) => t.channelId == cleanId);
    if (index == -1 || _activeChannelId == cleanId) return;

    _activeChannelId = cleanId;
    // Сброс непрочитанных на активной вкладке
    _tabs[index] = _tabs[index].copyWith(unreadCount: 0, hasMention: false);
    notifyListeners();
  }

  /// Фиксация нового сообщения в канале
  void recordMessage(String channelId, {bool hasMention = false}) {
    final cleanId = channelId.trim().toLowerCase();
    final index = _tabs.indexWhere((t) => t.channelId == cleanId);
    if (index == -1) return;

    // Если этот канал сейчас открыт, счетчик не увеличиваем
    if (_activeChannelId == cleanId) return;

    final current = _tabs[index];
    _tabs[index] = current.copyWith(
      unreadCount: current.unreadCount + 1,
      hasMention: current.hasMention || hasMention,
    );
    notifyListeners();
  }
}
