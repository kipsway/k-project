import 'package:flutter/material.dart';
import '../../../../core/theme/k_colors.dart';
import '../../domain/models/stream_nerd_stats.dart';
import '../../domain/services/player_gesture_controller.dart';
import 'glass_chat_overlay.dart';
import 'nerd_stats_overlay.dart';
import 'player_controls_overlay.dart';
import 'player_gesture_detector.dart';

class VideoPlayerContainer extends StatefulWidget {
  final bool isPlaying;
  final bool isTunnelEnabled;
  final int currentPingMs;
  final String currentQuality;
  final int viewerCount;
  final String streamerName;
  final String categoryName;
  final String? streamerAvatarUrl;
  final bool isLive;
  final bool isFullscreen;
  final bool isOverlayChatVisible;
  final bool isNerdStatsVisible;
  final bool isSleepTimerActive;
  final double latencySeconds;
  final double playbackSpeed;
  final StreamNerdStats nerdStats;
  final VoidCallback onPlayPause;
  final ValueChanged<bool> onToggleTunnel;
  final VoidCallback? onOpenNodesPicker;
  final ValueChanged<String> onSelectQuality;
  final VoidCallback onToggleFullscreen;
  final VoidCallback onToggleOverlayChat;
  final VoidCallback onToggleNerdStats;
  final VoidCallback onOpenSleepTimer;
  final VoidCallback onCatchUpLive;
  final VoidCallback? onEnterPip;
  final ValueChanged<String>? onSendOverlayMessage;

  const VideoPlayerContainer({
    super.key,
    required this.isPlaying,
    required this.isTunnelEnabled,
    this.currentPingMs = 32,
    required this.currentQuality,
    required this.viewerCount,
    required this.streamerName,
    required this.categoryName,
    this.streamerAvatarUrl,
    required this.isLive,
    required this.isFullscreen,
    this.isOverlayChatVisible = false,
    this.isNerdStatsVisible = false,
    this.isSleepTimerActive = false,
    this.latencySeconds = 1.1,
    this.playbackSpeed = 1.0,
    this.nerdStats = const StreamNerdStats(),
    required this.onPlayPause,
    required this.onToggleTunnel,
    this.onOpenNodesPicker,
    required this.onSelectQuality,
    required this.onToggleFullscreen,
    required this.onToggleOverlayChat,
    required this.onToggleNerdStats,
    required this.onOpenSleepTimer,
    required this.onCatchUpLive,
    this.onEnterPip,
    this.onSendOverlayMessage,
  });

  @override
  State<VideoPlayerContainer> createState() => _VideoPlayerContainerState();
}

class _VideoPlayerContainerState extends State<VideoPlayerContainer> {
  late final PlayerGestureController _gestureController;

  @override
  void initState() {
    super.initState();
    _gestureController = PlayerGestureController();
    _gestureController.addListener(_onGestureUpdate);
  }

  void _onGestureUpdate() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _gestureController.removeListener(_onGestureUpdate);
    _gestureController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black,
      child: PlayerGestureDetector(
        controller: _gestureController,
        onSeekBackward: () {
          // Обработка перемотки назад на 10с
        },
        onCatchUpLive: widget.onCatchUpLive,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Подложка видеопотока с лавандовым свечением активного k-Tunnel
            AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(0.0, -0.2),
                  radius: 1.2,
                  colors: [
                    widget.isTunnelEnabled
                        ? KColors.accBg.withOpacity(0.55)
                        : const Color(0xFF16151D),
                    Colors.black,
                  ],
                ),
              ),
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.tv,
                      size: 48,
                      color: widget.isTunnelEnabled ? KColors.lav : KColors.faint,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      widget.isTunnelEnabled
                          ? '1440p60 Ultra HD • Ускорение k-Tunnel (${widget.currentPingMs} мс)'
                          : '1080p60 • Прямой эфир',
                      style: TextStyle(
                        color: widget.isTunnelEnabled ? KColors.lavInk : KColors.muted,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Плавающий стеклянный оверлей чата поверх видео
            if (widget.isOverlayChatVisible)
              GlassChatOverlay(
                channel: widget.streamerName,
                isVisible: widget.isOverlayChatVisible,
                onClose: widget.onToggleOverlayChat,
                onSendMessage: widget.onSendOverlayMessage ?? (_) {},
              ),

            // Оверлей «Статистика для гиков» (Nerd Stats)
            if (widget.isNerdStatsVisible)
              NerdStatsOverlay(
                stats: widget.nerdStats,
                onClose: widget.onToggleNerdStats,
              ),

            // Наложение контроллеров плеера
            Positioned.fill(
              child: PlayerControlsOverlay(
                isPlaying: widget.isPlaying,
                isTunnelEnabled: widget.isTunnelEnabled,
                currentPingMs: widget.currentPingMs,
                currentQuality: widget.currentQuality,
                viewerCount: widget.viewerCount,
                streamerName: widget.streamerName,
                categoryName: widget.categoryName,
                streamerAvatarUrl: widget.streamerAvatarUrl,
                isLive: widget.isLive,
                isFullscreen: widget.isFullscreen,
                isOverlayChatVisible: widget.isOverlayChatVisible,
                isNerdStatsVisible: widget.isNerdStatsVisible,
                isSleepTimerActive: widget.isSleepTimerActive,
                latencySeconds: widget.latencySeconds,
                playbackSpeed: widget.playbackSpeed,
                onPlayPause: widget.onPlayPause,
                onToggleTunnel: widget.onToggleTunnel,
                onOpenNodesPicker: widget.onOpenNodesPicker,
                onSelectQuality: widget.onSelectQuality,
                onToggleFullscreen: widget.onToggleFullscreen,
                onToggleOverlayChat: widget.onToggleOverlayChat,
                onToggleNerdStats: widget.onToggleNerdStats,
                onOpenSleepTimer: widget.onOpenSleepTimer,
                onCatchUpLive: widget.onCatchUpLive,
                onEnterPip: widget.onEnterPip,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
