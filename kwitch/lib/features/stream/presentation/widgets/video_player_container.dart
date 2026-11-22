import 'package:flutter/material.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../ktunnel/domain/services/network_adaptive_controller.dart';
import '../../domain/models/stream_nerd_stats.dart';
import '../../domain/services/audio_only_mode_controller.dart';
import '../../domain/services/battery_saver_controller.dart';
import '../../domain/services/player_gesture_controller.dart';
import '../../domain/services/stream_ambient_glow_controller.dart';
import '../../domain/services/stream_audio_dsp_controller.dart';
import '../../domain/services/stream_replay_buffer_service.dart';
import '../../domain/services/stream_zen_mode_controller.dart';
import 'ambient_glow_wrapper.dart';
import 'audio_only_visualizer.dart';
import 'glass_chat_overlay.dart';
import 'nerd_stats_overlay.dart';
import 'player_controls_overlay.dart';
import 'player_gesture_detector.dart';
import 'stream_replay_banner.dart';
import 'zen_mode_indicator_pill.dart';

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
  final bool isControlsLocked;
  final bool isMuted;
  final double latencySeconds;
  final double playbackSpeed;
  final bool isCatchingUp;
  final double bufferSeconds;
  final NetworkAdaptiveController? networkController;
  final AudioOnlyModeController? audioOnlyController;
  final StreamReplayBufferService? replayService;
  final StreamAudioDspController? audioDspController;
  final BatterySaverController? batteryController;
  final StreamAmbientGlowController? ambientGlowController;
  final StreamZenModeController? zenModeController;
  final int currentBookmarkCount;
  final StreamNerdStats nerdStats;
  final VoidCallback onPlayPause;
  final ValueChanged<bool> onToggleTunnel;
  final VoidCallback? onOpenNodesPicker;
  final ValueChanged<String> onSelectQuality;
  final VoidCallback onToggleFullscreen;
  final VoidCallback onToggleOverlayChat;
  final VoidCallback onToggleNerdStats;
  final VoidCallback onOpenSleepTimer;
  final VoidCallback onToggleLockControls;
  final VoidCallback onToggleMute;
  final VoidCallback? onToggleAudioOnly;
  final VoidCallback? onOpenAudioDsp;
  final VoidCallback? onOpenBookmarks;
  final VoidCallback? onOpenBatterySaver;
  final VoidCallback? onOpenAmbientGlow;
  final VoidCallback? onOpenVodClips;
  final VoidCallback? onStartInstantReplay;
  final VoidCallback? onExitReplay;
  final VoidCallback? onShareClip;
  final VoidCallback onCatchUpLive;
  final VoidCallback? onEnterPip;
  final VoidCallback? onOpenChannelsDrawer;
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
    this.isControlsLocked = false,
    this.isMuted = false,
    this.latencySeconds = 1.1,
    this.playbackSpeed = 1.0,
    this.isCatchingUp = false,
    this.bufferSeconds = 4.2,
    this.networkController,
    this.audioOnlyController,
    this.replayService,
    this.audioDspController,
    this.batteryController,
    this.ambientGlowController,
    this.zenModeController,
    this.currentBookmarkCount = 0,
    this.nerdStats = const StreamNerdStats(),
    required this.onPlayPause,
    required this.onToggleTunnel,
    this.onOpenNodesPicker,
    required this.onSelectQuality,
    required this.onToggleFullscreen,
    required this.onToggleOverlayChat,
    required this.onToggleNerdStats,
    required this.onOpenSleepTimer,
    required this.onToggleLockControls,
    required this.onToggleMute,
    this.onToggleAudioOnly,
    this.onOpenAudioDsp,
    this.onOpenBookmarks,
    this.onOpenBatterySaver,
    this.onOpenAmbientGlow,
    this.onToggleZenMode,
    this.onOpenVodClips,
    this.onStartInstantReplay,
    this.onExitReplay,
    this.onShareClip,
    required this.onCatchUpLive,
    this.onEnterPip,
    this.onOpenChannelsDrawer,
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
    return AmbientGlowWrapper(
      controller: widget.ambientGlowController,
      child: Container(
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
            // Подложка: если включен аудио-режим («Только радио»), показываем визуализатор, иначе видео
            if (widget.currentQuality == 'audio_only' || (widget.audioOnlyController?.isAudioOnly ?? false))
              AudioOnlyVisualizer(
                streamerName: widget.streamerName,
                categoryName: widget.categoryName,
                streamerAvatarUrl: widget.streamerAvatarUrl,
                controller: widget.audioOnlyController ?? AudioOnlyModeController(),
                onDisableAudioOnly: () {
                  widget.onSelectQuality('1440p60');
                  widget.onToggleAudioOnly?.call();
                },
              )
            else
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
            if (widget.isOverlayChatVisible && !widget.isControlsLocked)
              GlassChatOverlay(
                channel: widget.streamerName,
                isVisible: widget.isOverlayChatVisible,
                onClose: widget.onToggleOverlayChat,
                onSendMessage: widget.onSendOverlayMessage ?? (_) {},
              ),

            // Оверлей «Статистика для гиков» (Nerd Stats)
            if (widget.isNerdStatsVisible && !widget.isControlsLocked)
              NerdStatsOverlay(
                stats: widget.nerdStats,
                onClose: widget.onToggleNerdStats,
              ),

            // Баннер мгновенного повтора (Replay 30s)
            if (widget.replayService != null && widget.replayService!.isReplayActive && !widget.isControlsLocked)
              StreamReplayBanner(
                replayService: widget.replayService!,
                onExitReplay: widget.onExitReplay ?? () {},
                onShareClip: widget.onShareClip ?? () {},
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
                isControlsLocked: widget.isControlsLocked,
                isMuted: widget.isMuted,
                isAudioOnly: widget.currentQuality == 'audio_only' || (widget.audioOnlyController?.isAudioOnly ?? false),
                isReplayActive: widget.replayService?.isReplayActive ?? false,
                currentBookmarkCount: widget.currentBookmarkCount,
                latencySeconds: widget.latencySeconds,
                playbackSpeed: widget.replayService?.isReplayActive == true
                    ? widget.replayService!.replayPlaybackSpeed
                    : widget.playbackSpeed,
                isCatchingUp: widget.isCatchingUp,
                bufferSeconds: widget.bufferSeconds,
                networkController: widget.networkController,
                audioDspController: widget.audioDspController,
                batteryController: widget.batteryController,
                ambientGlowController: widget.ambientGlowController,
                zenModeController: widget.zenModeController,
                onPlayPause: widget.onPlayPause,
                onToggleTunnel: widget.onToggleTunnel,
                onOpenNodesPicker: widget.onOpenNodesPicker,
                onSelectQuality: widget.onSelectQuality,
                onToggleFullscreen: widget.onToggleFullscreen,
                onToggleOverlayChat: widget.onToggleOverlayChat,
                onToggleNerdStats: widget.onToggleNerdStats,
                onOpenSleepTimer: widget.onOpenSleepTimer,
                onOpenChannelsDrawer: widget.onOpenChannelsDrawer ?? () {},
                onToggleLockControls: widget.onToggleLockControls,
                onToggleMute: widget.onToggleMute,
                onToggleAudioOnly: widget.onToggleAudioOnly,
                onOpenAudioDsp: widget.onOpenAudioDsp,
                onOpenBookmarks: widget.onOpenBookmarks,
                onOpenBatterySaver: widget.onOpenBatterySaver,
                onOpenAmbientGlow: widget.onOpenAmbientGlow,
                onToggleZenMode: widget.onToggleZenMode,
                onOpenVodClips: widget.onOpenVodClips,
                onStartInstantReplay: widget.onStartInstantReplay,
                onCatchUpLive: widget.onCatchUpLive,
                onEnterPip: widget.onEnterPip,
              ),
            ),

            // Всплывающий индикатор Дзен-режима
            if (widget.zenModeController != null)
              ZenModeIndicatorPill(zenController: widget.zenModeController!),
          ],
        ),
      ),
    ),
  );
}
}
