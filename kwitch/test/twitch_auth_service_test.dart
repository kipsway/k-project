import 'package:flutter_test/flutter_test.dart';
import '../lib/features/chat/domain/services/twitch_auth_service.dart';

void main() {
  group('TwitchAuthService Tests', () {
    test('Initial state is anonymous guest with default channels', () {
      final service = TwitchAuthService();

      expect(service.isAuthenticated, isFalse);
      expect(service.session.isGuest, isTrue);
      expect(service.currentUsername, startsWith('Гость_'));
      expect(service.session.maskedToken, equals('Гостевой режим'));
      expect(service.followedChannels.length, greaterThanOrEqualTo(3));

      final script = service.generateChatterinoAuthScript();
      expect(script, contains('isGuest: true'));
    });

    test('loginWithOAuthToken validates inputs and normalizes oauth prefix', () async {
      final service = TwitchAuthService();
      bool notified = false;
      service.addListener(() => notified = true);

      // Неуспешный логин с пустыми данными
      final failResult = await service.loginWithOAuthToken(token: '', username: '');
      expect(failResult, isFalse);
      expect(service.isAuthenticated, isFalse);

      // Успешный логин без префикса "oauth:"
      final successResult = await service.loginWithOAuthToken(
        token: 'abcd1234efgh5678',
        username: 'ProGamer99',
      );

      expect(successResult, isTrue);
      expect(notified, isTrue);
      expect(service.isAuthenticated, isTrue);
      expect(service.currentUsername, equals('progamer99'));
      expect(service.session.accessToken, startsWith('oauth:'));
      expect(service.session.maskedToken, contains('••••'));

      final script = service.generateChatterinoAuthScript();
      expect(script, contains('isGuest: false'));
      expect(script, contains('progamer99'));
    });

    test('Demo kipsway login activates verified developer session', () {
      final service = TwitchAuthService();

      service.loginWithDemoKipsway();

      expect(service.isAuthenticated, isTrue);
      expect(service.currentUsername, equals('kipsway'));
      expect(service.session.displayName, equals('kipsway'));
      expect(service.session.isTurboOrPrime, isTrue);
      expect(service.followedChannels.any((c) => c.id == 'kipsway'), isTrue);

      final script = service.generateChatterinoAuthScript();
      expect(script, contains('kipsway'));
    });

    test('Logout clears authenticated session and restores guest defaults', () async {
      final service = TwitchAuthService();

      service.loginWithDemoKipsway();
      expect(service.isAuthenticated, isTrue);

      service.logout();
      expect(service.isAuthenticated, isFalse);
      expect(service.session.isGuest, isTrue);
      expect(service.currentUsername, startsWith('Гость_'));
      expect(service.followedChannels.any((c) => c.id == 'kipsway'), isFalse);
    });
  });
}
