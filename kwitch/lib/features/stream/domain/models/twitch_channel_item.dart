class TwitchChannelItem {
  final String id;
  final String name;
  final String displayName;
  final String? avatarUrl;
  final String category;
  final String title;
  final int viewerCount;
  final bool isLive;
  final bool isFollowed;

  const TwitchChannelItem({
    required this.id,
    required this.name,
    required this.displayName,
    this.avatarUrl,
    required this.category,
    required this.title,
    required this.viewerCount,
    this.isLive = true,
    this.isFollowed = false,
  });

  static const List<TwitchChannelItem> featuredChannels = [
    TwitchChannelItem(
      id: 'buda',
      name: 'buda',
      displayName: 'buda',
      category: 'Just Chatting',
      title: 'Чиллим, общаемся, смотрим видосы и тиктоки! kWitch 1440p',
      viewerCount: 42890,
      isLive: true,
      isFollowed: true,
    ),
    TwitchChannelItem(
      id: 'bratishkinoff',
      name: 'bratishkinoff',
      displayName: 'BratishkinOFF',
      category: 'Special Events',
      title: 'Смотрим аукцион фильмов и новинки сериалов',
      viewerCount: 38450,
      isLive: true,
      isFollowed: true,
    ),
    TwitchChannelItem(
      id: 'evelone192',
      name: 'evelone192',
      displayName: 'Evelone192',
      category: 'Counter-Strike 2',
      title: 'Мафия с топовыми стримерами • kWitch Chat active',
      viewerCount: 51200,
      isLive: true,
      isFollowed: true,
    ),
    TwitchChannelItem(
      id: 'nix',
      name: 'nix',
      displayName: 'Nix',
      category: 'Dota 2',
      title: 'Комьюнити каст финала турнира в 1440p60 через k-Tunnel',
      viewerCount: 64100,
      isLive: true,
      isFollowed: false,
    ),
    TwitchChannelItem(
      id: 'stray228',
      name: 'stray228',
      displayName: 'Stray228',
      category: 'Dota 2',
      title: 'Калибровка и поднятие рейтинга • Чат Chatterino+',
      viewerCount: 18200,
      isLive: true,
      isFollowed: false,
    ),
  ];
}
