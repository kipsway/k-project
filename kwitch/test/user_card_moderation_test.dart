import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import '../lib/features/chat/domain/models/chat_user_profile.dart';

void main() {
  group('Chatterino+ 1-Click Moderation & User Profile Tests', () {
    const profile = ChatUserProfile(
      username: 'toxic_spammer',
      displayName: 'Toxic_Spammer',
      userColor: Colors.blue,
      badges: ['sub'],
    );

    test('getIrcCommand correctly formats timeout and ban commands', () {
      expect(profile.getIrcCommand(ModActionType.timeout10m), equals('/timeout toxic_spammer 600'));
      expect(profile.getIrcCommand(ModActionType.timeout1h), equals('/timeout toxic_spammer 3600'));
      expect(profile.getIrcCommand(ModActionType.ban), equals('/ban toxic_spammer'));
      expect(profile.getIrcCommand(ModActionType.deleteMessage), equals('/delete toxic_spammer'));
      expect(profile.getIrcCommand(ModActionType.mention), equals('@toxic_spammer '));
    });

    test('ChatUserProfile handles 7TV Name Paints gradients', () {
      const paintProfile = ChatUserProfile(
        username: 'kipsway',
        displayName: 'kipsway',
        userColor: Color(0xFFB8A7F0),
        hasNamePaint: true,
        paintColors: [Color(0xFFB8A7F0), Color(0xFF7E6FC4)],
        badges: ['dev', 'mod'],
      );

      expect(paintProfile.hasNamePaint, isTrue);
      expect(paintProfile.paintColors?.length, equals(2));
      expect(paintProfile.badges, contains('mod'));
    });
  });
}
