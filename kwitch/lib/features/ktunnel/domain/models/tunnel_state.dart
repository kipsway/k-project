import 'tunnel_node.dart';

enum TunnelStatus {
  disconnected,
  connecting,
  connected,
  error,
}

class TunnelState {
  final bool isEnabled;
  final TunnelStatus status;
  final TunnelNode? activeNode;
  final int currentPingMs;
  final double currentBitrateMbps;
  final int droppedFrames;
  final String? errorMessage;

  const TunnelState({
    this.isEnabled = false,
    this.status = TunnelStatus.disconnected,
    this.activeNode,
    this.currentPingMs = 32,
    this.currentBitrateMbps = 14.2,
    this.droppedFrames = 0,
    this.errorMessage,
  });

  TunnelState copyWith({
    bool? isEnabled,
    TunnelStatus? status,
    TunnelNode? activeNode,
    int? currentPingMs,
    double? currentBitrateMbps,
    int? droppedFrames,
    String? errorMessage,
  }) {
    return TunnelState(
      isEnabled: isEnabled ?? this.isEnabled,
      status: status ?? this.status,
      activeNode: activeNode ?? this.activeNode,
      currentPingMs: currentPingMs ?? this.currentPingMs,
      currentBitrateMbps: currentBitrateMbps ?? this.currentBitrateMbps,
      droppedFrames: droppedFrames ?? this.droppedFrames,
      errorMessage: errorMessage ?? this.errorMessage,
    );
  }
}
