class ChatterinoConfig {
  final String channel;
  final bool enable7TV;
  final bool enableBTTV;
  final bool enableFFZ;
  final bool enableNamePaints;
  final bool enableCustomBadges;
  final List<String> mirrors;
  final String eventApiUrl;

  const ChatterinoConfig({
    required this.channel,
    this.enable7TV = true,
    this.enableBTTV = true,
    this.enableFFZ = true,
    this.enableNamePaints = true,
    this.enableCustomBadges = true,
    this.mirrors = const [
      'https://ws.chat.eblo.id',
      'https://ws.rish098.xyz',
    ],
    this.eventApiUrl = 'https://events.7tv.io/v3',
  });
}
