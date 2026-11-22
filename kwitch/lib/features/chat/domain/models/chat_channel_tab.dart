/// Модель вкладки мульти-чата Chatterino+ в kWitch
class ChatChannelTab {
  final String channelId;
  final String displayName;
  final bool isPrimary;
  final int unreadCount;
  final bool hasMention;

  const ChatChannelTab({
    required this.channelId,
    required this.displayName,
    this.isPrimary = false,
    this.unreadCount = 0,
    this.hasMention = false,
  });

  ChatChannelTab copyWith({
    String? channelId,
    String? displayName,
    bool? isPrimary,
    int? unreadCount,
    bool? hasMention,
  }) {
    return ChatChannelTab(
      channelId: channelId ?? this.channelId,
      displayName: displayName ?? this.displayName,
      isPrimary: isPrimary ?? this.isPrimary,
      unreadCount: unreadCount ?? this.unreadCount,
      hasMention: hasMention ?? this.hasMention,
    );
  }
}
