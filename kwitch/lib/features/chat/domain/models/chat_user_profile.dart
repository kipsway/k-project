import 'package:flutter/material.dart';

enum ModActionType {
  mention,
  timeout10m,
  timeout1h,
  deleteMessage,
  ban,
}

class ChatUserProfile {
  final String username;
  final String displayName;
  final String? avatarUrl;
  final Color userColor;
  final bool hasNamePaint;
  final List<Color>? paintColors;
  final List<String> badges;
  final bool isSubscribed;
  final int monthsSubscribed;
  final List<String> recentMessages;

  const ChatUserProfile({
    required this.username,
    required this.displayName,
    this.avatarUrl,
    required this.userColor,
    this.hasNamePaint = false,
    this.paintColors,
    this.badges = const [],
    this.isSubscribed = false,
    this.monthsSubscribed = 0,
    this.recentMessages = const [],
  });

  /// Формирование Twitch/IRC команды модератора
  String getIrcCommand(ModActionType action) {
    switch (action) {
      case ModActionType.mention:
        return '@$username ';
      case ModActionType.timeout10m:
        return '/timeout $username 600';
      case ModActionType.timeout1h:
        return '/timeout $username 3600';
      case ModActionType.deleteMessage:
        return '/delete $username';
      case ModActionType.ban:
        return '/ban $username';
    }
  }
}
