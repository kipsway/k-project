enum TunnelProtocol {
  shadowsocks,
  v2ray,
  trojan,
  httpLoopback,
}

class TunnelNode {
  final String id;
  final String name;
  final String countryCode;
  final String flagEmoji;
  final String host;
  final int port;
  final int pingMs;
  final bool isHealthy;
  final TunnelProtocol protocol;
  final double loadPercentage;

  const TunnelNode({
    required this.id,
    required this.name,
    required this.countryCode,
    required this.flagEmoji,
    required this.host,
    required this.port,
    this.pingMs = 32,
    this.isHealthy = true,
    this.protocol = TunnelProtocol.shadowsocks,
    this.loadPercentage = 24.0,
  });

  TunnelNode copyWith({
    String? id,
    String? name,
    String? countryCode,
    String? flagEmoji,
    String? host,
    int? port,
    int? pingMs,
    bool? isHealthy,
    TunnelProtocol? protocol,
    double? loadPercentage,
  }) {
    return TunnelNode(
      id: id ?? this.id,
      name: name ?? this.name,
      countryCode: countryCode ?? this.countryCode,
      flagEmoji: flagEmoji ?? this.flagEmoji,
      host: host ?? this.host,
      port: port ?? this.port,
      pingMs: pingMs ?? this.pingMs,
      isHealthy: isHealthy ?? this.isHealthy,
      protocol: protocol ?? this.protocol,
      loadPercentage: loadPercentage ?? this.loadPercentage,
    );
  }
}

/// Серверный пул подписки k-Tunnel (https://s.wistfalls.cc/...)
class KTunnelPresets {
  static const String subscriptionUrl = 'https://s.wistfalls.cc/sub/kwitch_nodes';

  static const List<TunnelNode> defaultNodes = [
    TunnelNode(
      id: 'fra-fast-01',
      name: 'Frankfurt Ultra-Edge (1440p)',
      countryCode: 'DE',
      flagEmoji: '🇩🇪',
      host: 'fra1.wistfalls.cc',
      port: 8443,
      pingMs: 28,
      loadPercentage: 18.5,
    ),
    TunnelNode(
      id: 'hel-fast-02',
      name: 'Helsinki Direct (Low Jitter)',
      countryCode: 'FI',
      flagEmoji: '🇫🇮',
      host: 'hel2.wistfalls.cc',
      port: 8443,
      pingMs: 32,
      loadPercentage: 22.0,
    ),
    TunnelNode(
      id: 'ams-fast-01',
      name: 'Amsterdam Core (Zero-Drop)',
      countryCode: 'NL',
      flagEmoji: '🇳🇱',
      host: 'ams1.wistfalls.cc',
      port: 8443,
      pingMs: 35,
      loadPercentage: 31.0,
    ),
    TunnelNode(
      id: 'waw-fast-01',
      name: 'Warsaw Fast-Track',
      countryCode: 'PL',
      flagEmoji: '🇵🇱',
      host: 'waw1.wistfalls.cc',
      port: 8443,
      pingMs: 38,
      loadPercentage: 27.4,
    ),
    TunnelNode(
      id: 'tyo-fast-01',
      name: 'Tokyo Trans-Pacific',
      countryCode: 'JP',
      flagEmoji: '🇯🇵',
      host: 'tyo1.wistfalls.cc',
      port: 8443,
      pingMs: 142,
      loadPercentage: 14.0,
    ),
  ];
}
