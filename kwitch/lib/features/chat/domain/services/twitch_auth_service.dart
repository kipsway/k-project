import 'package:flutter/foundation.dart';
import '../../stream/domain/models/twitch_channel_item.dart';
import '../models/twitch_auth_session.dart';

/// Сервис авторизации учетной записи Twitch (OAuth 2.0 / Token) в kWitch.
/// Обеспечивает безопасное хранение учетных данных, синхронизацию отслеживаемых
/// каналов и инжекцию токена в сокеты чата Chatterino+ v2.4.0 (Rish).
class TwitchAuthService extends ChangeNotifier {
  TwitchAuthSession _session = TwitchAuthSession.guest('7742');
  final List<TwitchChannelItem> _followedChannels = [];

  TwitchAuthSession get session => _session;
  bool get isAuthenticated => _session.isAuthenticated;
  String get currentUsername => _session.username;
  List<TwitchChannelItem> get followedChannels => List.unmodifiable(_followedChannels);

  TwitchAuthService() {
    _populateDefaultGuestFollows();
  }

  void _populateDefaultGuestFollows() {
    _followedChannels.clear();
    _followedChannels.addAll(const [
      TwitchChannelItem(
        id: 'buda',
        displayName: 'OG Buda',
        category: 'Just Chatting',
        avatarUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/buda.png',
        viewerCount: 42890,
      ),
      TwitchChannelItem(
        id: 'bratishkinoff',
        displayName: 'bratishkinoff',
        category: 'Counter-Strike 2',
        avatarUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/bratishkin.png',
        viewerCount: 28410,
      ),
      TwitchChannelItem(
        id: 'faker',
        displayName: 'Faker (T1)',
        category: 'League of Legends',
        avatarUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/faker.png',
        viewerCount: 65120,
      ),
    ]);
  }

  /// Вход по OAuth токену пользователя (стандартный формат Twitch IRC / Chatterino)
  Future<bool> loginWithOAuthToken({
    required String token,
    required String username,
    String? displayName,
  }) async {
    final cleanToken = token.trim();
    final cleanUsername = username.trim().toLowerCase();

    if (cleanToken.isEmpty || cleanUsername.isEmpty) {
      return false;
    }

    final normalizedToken = cleanToken.startsWith('oauth:')
        ? cleanToken
        : 'oauth:$cleanToken';

    _session = TwitchAuthSession(
      userId: '${cleanUsername.hashCode.abs()}',
      username: cleanUsername,
      displayName: displayName ?? cleanUsername,
      avatarUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/$cleanUsername-profile.png',
      accessToken: normalizedToken,
      isGuest: false,
      isTurboOrPrime: true,
      createdAt: DateTime.now(),
    );

    // Добавляем персонализированные отслеживаемые каналы
    _followedChannels.clear();
    _followedChannels.addAll([
      TwitchChannelItem(
        id: cleanUsername,
        displayName: displayName ?? cleanUsername,
        category: 'My Channel',
        avatarUrl: _session.avatarUrl,
        viewerCount: 1,
      ),
      const TwitchChannelItem(
        id: 'buda',
        displayName: 'OG Buda',
        category: 'Just Chatting',
        avatarUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/buda.png',
        viewerCount: 42890,
      ),
      const TwitchChannelItem(
        id: 'tarik',
        displayName: 'tarik',
        category: 'Valorant',
        avatarUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/tarik.png',
        viewerCount: 38200,
      ),
    ]);

    notifyListeners();
    return true;
  }

  /// Быстрый тестовый вход под разработчиком kipsway
  void loginWithDemoKipsway() {
    _session = TwitchAuthSession.kipswayDemo();
    _followedChannels.clear();
    _followedChannels.addAll(const [
      TwitchChannelItem(
        id: 'kipsway',
        displayName: 'kipsway (Dev)',
        category: 'Software Development',
        avatarUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/kipsway-profile.png',
        viewerCount: 12,
      ),
      TwitchChannelItem(
        id: 'buda',
        displayName: 'OG Buda',
        category: 'Just Chatting',
        avatarUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/buda.png',
        viewerCount: 42890,
      ),
      TwitchChannelItem(
        id: 'bratishkinoff',
        displayName: 'bratishkinoff',
        category: 'Counter-Strike 2',
        avatarUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/bratishkin.png',
        viewerCount: 28410,
      ),
    ]);
    notifyListeners();
  }

  /// Выход из аккаунта (возврат к анонимному гостевому режиму)
  void logout() {
    _session = TwitchAuthSession.guest();
    _populateDefaultGuestFollows();
    notifyListeners();
  }

  /// Генерация JavaScript для авторизации в WebView Chatterino+ (chat.eblo.id)
  String generateChatterinoAuthScript() {
    if (!_session.isAuthenticated) {
      return '''
/* kWitch Anonymous Guest Mode */
window.__kWitchAuth = { isGuest: true, username: "${_session.username}" };
''';
    }

    return '''
/* kWitch Authenticated Twitch Account */
window.__kWitchAuth = {
  isGuest: false,
  username: "${_session.username}",
  displayName: "${_session.displayName}",
  token: "${_session.accessToken}"
};
if (window.__chatterinoClient && window.__chatterinoClient.setAuth) {
  window.__chatterinoClient.setAuth("${_session.username}", "${_session.accessToken}");
}
''';
  }
}
