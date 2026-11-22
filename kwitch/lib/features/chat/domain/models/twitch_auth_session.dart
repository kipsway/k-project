/// Сессия авторизации пользователя Twitch в kWitch
class TwitchAuthSession {
  final String userId;
  final String username;
  final String displayName;
  final String? avatarUrl;
  final String accessToken;
  final bool isGuest;
  final bool isTurboOrPrime;
  final DateTime createdAt;

  const TwitchAuthSession({
    required this.userId,
    required this.username,
    required this.displayName,
    this.avatarUrl,
    required this.accessToken,
    this.isGuest = false,
    this.isTurboOrPrime = false,
    required this.createdAt,
  });

  /// Авторизован ли реальный пользователь Twitch
  bool get isAuthenticated => !isGuest && accessToken.isNotEmpty;

  /// Маскированный токен для безопасного отображения в интерфейсе (например: oauth:a1b2...9z)
  String get maskedToken {
    if (accessToken.isEmpty || isGuest) return 'Гостевой режим';
    if (accessToken.length <= 12) return 'oauth:••••••••';
    final prefix = accessToken.substring(0, 8);
    final suffix = accessToken.substring(accessToken.length - 4);
    return '$prefix••••$suffix';
  }

  /// Гостевая сессия по умолчанию
  factory TwitchAuthSession.guest([String? guestId]) {
    final id = guestId ?? 'anon_${DateTime.now().millisecondsSinceEpoch % 10000}';
    return TwitchAuthSession(
      userId: id,
      username: 'Гость_$id',
      displayName: 'Гость ($id)',
      accessToken: '',
      isGuest: true,
      createdAt: DateTime.now(),
    );
  }

  /// Демо-сессия разработчика kipsway
  factory TwitchAuthSession.kipswayDemo() {
    return TwitchAuthSession(
      userId: '77291044',
      username: 'kipsway',
      displayName: 'kipsway',
      avatarUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/kipsway-profile.png',
      accessToken: 'oauth:kipsway_verified_dev_token_2026',
      isGuest: false,
      isTurboOrPrime: true,
      createdAt: DateTime.now(),
    );
  }
}
