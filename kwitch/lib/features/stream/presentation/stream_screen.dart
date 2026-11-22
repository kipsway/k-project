import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/theme/k_colors.dart';
import '../../../core/theme/k_typography.dart';
import '../../chat/presentation/widgets/chatterino_emotes_sheet.dart';
import '../../ktunnel/domain/services/network_adaptive_controller.dart';
import '../../ktunnel/presentation/controllers/ktunnel_controller.dart';
import '../../ktunnel/presentation/widgets/ktunnel_node_picker_sheet.dart';
import '../domain/models/stream_nerd_stats.dart';
import '../domain/services/amoled_mode_controller.dart';
import '../domain/services/pip_background_service.dart';
import '../domain/services/player_stability_controller.dart';
import '../domain/services/sleep_timer_service.dart';
import '../domain/services/stream_catchup_service.dart';
import 'widgets/chat_panel_container.dart';
import 'widgets/sleep_timer_sheet.dart';
import 'widgets/split_divider_handle.dart';
import 'widgets/video_player_container.dart';

class StreamScreen extends StatefulWidget {
  final String streamerName;
  final String categoryName;
  final String? streamerAvatarUrl;
  final int initialViewers;

  const StreamScreen({
    super.key,
    this.streamerName = 'buda',
    this.categoryName = 'Just Chatting',
    this.streamerAvatarUrl,
    this.initialViewers = 42890,
  });

  @override
  State<StreamScreen> createState() => _StreamScreenState();
}

class _StreamScreenState extends State<StreamScreen> with WidgetsBindingObserver {
  // Сетевой контроллер k-Tunnel
  late final KTunnelController _tunnelController;

  // Контроллер типа сети и трафика k-Tunnel
  late final NetworkAdaptiveController _networkController;

  // Сервис картинки-в-картинке и фонового аудио
  late final PipBackgroundService _pipService;

  // Сервис умного догона прямого эфира 1.5x
  late final StreamCatchupService _catchupService;

  // Контроллер стабильности плеера, замка и буфера
  late final PlayerStabilityController _stabilityController;

  // Спящий таймер и AMOLED-режим
  late final SleepTimerService _sleepTimerService;
  late final AmoledModeController _amoledController;

  // Состояния воспроизведения
  bool _isPlaying = true;
  String _currentQuality = '1440p60';
  late int _viewerCount;
  bool _isFullscreen = false;
  bool _isOverlayChatVisible = false;
  bool _isNerdStatsVisible = false;

  // Регулируемая высота плеера в портретном режиме (сетка 8pt)
  double _playerHeight = 240.0;
  final double _minPlayerHeight = 180.0;
  final double _maxPlayerHeight = 440.0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _viewerCount = widget.initialViewers;

    _tunnelController = KTunnelController();
    _tunnelController.addListener(_onStateChanged);

    _networkController = NetworkAdaptiveController();
    _networkController.addListener(_onStateChanged);

    _pipService = PipBackgroundService();
    _pipService.addListener(_onStateChanged);

    _catchupService = StreamCatchupService();
    _catchupService.addListener(_onStateChanged);

    _stabilityController = PlayerStabilityController();
    _stabilityController.addListener(_onStateChanged);

    _sleepTimerService = SleepTimerService();
    _sleepTimerService.addListener(_onStateChanged);

    _amoledController = AmoledModeController();
    _amoledController.addListener(_onStateChanged);

    _updateNotification();
  }

  void _onStateChanged() {
    if (mounted) setState(() {});
  }

  void _updateNotification() {
    _pipService.updateNotification(
      streamerName: widget.streamerName,
      categoryName: widget.categoryName,
      isLive: true,
      isTunnelEnabled: _tunnelController.isEnabled,
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      _updateNotification();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _tunnelController.removeListener(_onStateChanged);
    _tunnelController.dispose();
    _networkController.removeListener(_onStateChanged);
    _networkController.dispose();
    _pipService.removeListener(_onStateChanged);
    _pipService.dispose();
    _catchupService.removeListener(_onStateChanged);
    _catchupService.dispose();
    _stabilityController.removeListener(_onStateChanged);
    _stabilityController.dispose();
    _sleepTimerService.removeListener(_onStateChanged);
    _sleepTimerService.dispose();
    _amoledController.removeListener(_onStateChanged);
    _amoledController.dispose();
    super.dispose();
  }

  void _togglePlayPause() {
    setState(() => _isPlaying = !_isPlaying);
    _updateNotification();
  }

  void _toggleOverlayChat() {
    setState(() => _isOverlayChatVisible = !_isOverlayChatVisible);
    HapticFeedback.lightImpact();
  }

  void _toggleNerdStats() {
    setState(() => _isNerdStatsVisible = !_isNerdStatsVisible);
    HapticFeedback.lightImpact();
  }

  void _openSleepTimer() {
    SleepTimerSheet.show(
      context,
      timerService: _sleepTimerService,
      amoledController: _amoledController,
      onTimerFinished: () {
        setState(() => _isPlaying = false);
        _updateNotification();
      },
    );
  }

  void _enterPipMode() {
    _pipService.enterPictureInPicture();
  }

  void _catchUpLive() {
    HapticFeedback.heavyImpact();
    _catchupService.jumpToLiveEdge();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: KColors.panel,
        duration: const Duration(seconds: 1),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: KColors.accBorder, width: 1),
        ),
        content: Text(
          'Синхронизировано с прямым эфиром (задержка: ${_catchupService.latencySeconds.toStringAsFixed(1)}с)',
          style: KTypography.caption.copyWith(color: KColors.ink),
        ),
      ),
    );
  }

  void _toggleTunnel(bool enabled) {
    _tunnelController.toggleTunnel(enabled);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: KColors.panel,
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: KColors.accBorder, width: 1),
        ),
        content: Row(
          children: [
            Icon(
              Icons.bolt,
              color: enabled ? KColors.lav : KColors.faint,
              size: 20,
            ),
            const SizedBox(width: 10),
            Text(
              enabled
                  ? 'Ускорение k-Tunnel: 1440p без лагов (${_tunnelController.currentPing} мс)'
                  : 'Ускорение k-Tunnel отключено',
              style: KTypography.caption.copyWith(color: KColors.ink),
            ),
          ],
        ),
      ),
    );
  }

  void _openNodesPicker() {
    KTunnelNodePickerSheet.show(context, _tunnelController);
  }

  void _selectQuality(String quality) {
    setState(() => _currentQuality = quality);
  }

  void _toggleFullscreen() {
    setState(() {
      _isFullscreen = !_isFullscreen;
      if (_isFullscreen) {
        SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
        SystemChrome.setPreferredOrientations([
          DeviceOrientation.landscapeLeft,
          DeviceOrientation.landscapeRight,
        ]);
        _isOverlayChatVisible = true;
      } else {
        SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
        SystemChrome.setPreferredOrientations([
          DeviceOrientation.portraitUp,
        ]);
        _isOverlayChatVisible = false;
      }
    });
  }

  void _handleDividerDrag(double delta) {
    setState(() {
      _playerHeight = (_playerHeight + delta).clamp(_minPlayerHeight, _maxPlayerHeight);
    });
  }

  void _openEmotesSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) {
        return ChatterinoEmotesSheet(
          channel: widget.streamerName,
          onSelectEmote: (emote) {
            // Вставка смайла
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final activeNode = _tunnelController.activeNode;
    final nerdStats = StreamNerdStats(
      resolution: _currentQuality.contains('1440') ? '2560x1440' : '1920x1080',
      fps: 60,
      currentBitrateKbps: _currentQuality.contains('1440') ? 14280 : 8500,
      nodePingMs: _tunnelController.currentPing,
      activeNodeName: activeNode?.name ?? 'Frankfurt Ultra-Edge',
      latencyToLiveSeconds: _catchupService.latencySeconds,
      bufferHealthSeconds: _stabilityController.bufferSeconds,
    );

    final currentBg = _amoledController.currentBgColor;

    // Режим "Картинка в картинке" (PiP)
    if (_pipService.isPipActive) {
      return Scaffold(
        backgroundColor: Colors.black,
        body: VideoPlayerContainer(
          isPlaying: _isPlaying,
          isTunnelEnabled: _tunnelController.isEnabled,
          currentPingMs: _tunnelController.currentPing,
          currentQuality: _currentQuality,
          viewerCount: _viewerCount,
          streamerName: widget.streamerName,
          categoryName: widget.categoryName,
          streamerAvatarUrl: widget.streamerAvatarUrl,
          isLive: true,
          isFullscreen: true,
          isOverlayChatVisible: false,
          isNerdStatsVisible: false,
          isSleepTimerActive: _sleepTimerService.isActive,
          isControlsLocked: _stabilityController.isControlsLocked,
          isMuted: _stabilityController.isMuted,
          latencySeconds: _catchupService.latencySeconds,
          playbackSpeed: _catchupService.playbackSpeed,
          isCatchingUp: _catchupService.isCatchingUp,
          bufferSeconds: _stabilityController.bufferSeconds,
          networkController: _networkController,
          nerdStats: nerdStats,
          onPlayPause: _togglePlayPause,
          onToggleTunnel: _toggleTunnel,
          onOpenNodesPicker: _openNodesPicker,
          onSelectQuality: _selectQuality,
          onToggleFullscreen: _toggleFullscreen,
          onToggleOverlayChat: _toggleOverlayChat,
          onToggleNerdStats: _toggleNerdStats,
          onOpenSleepTimer: _openSleepTimer,
          onToggleLockControls: _stabilityController.toggleControlsLock,
          onToggleMute: () => _stabilityController.toggleMute(1.0),
          onCatchUpLive: _catchUpLive,
          onEnterPip: _enterPipMode,
        ),
      );
    }

    final orientation = MediaQuery.of(context).orientation;

    if (_isFullscreen || orientation == Orientation.landscape) {
      // Полноэкранный режим плеера с оверлеем
      return Scaffold(
        backgroundColor: Colors.black,
        body: VideoPlayerContainer(
          isPlaying: _isPlaying,
          isTunnelEnabled: _tunnelController.isEnabled,
          currentPingMs: _tunnelController.currentPing,
          currentQuality: _currentQuality,
          viewerCount: _viewerCount,
          streamerName: widget.streamerName,
          categoryName: widget.categoryName,
          streamerAvatarUrl: widget.streamerAvatarUrl,
          isLive: true,
          isFullscreen: true,
          isOverlayChatVisible: _isOverlayChatVisible,
          isNerdStatsVisible: _isNerdStatsVisible,
          isSleepTimerActive: _sleepTimerService.isActive,
          isControlsLocked: _stabilityController.isControlsLocked,
          isMuted: _stabilityController.isMuted,
          latencySeconds: _catchupService.latencySeconds,
          playbackSpeed: _catchupService.playbackSpeed,
          isCatchingUp: _catchupService.isCatchingUp,
          bufferSeconds: _stabilityController.bufferSeconds,
          networkController: _networkController,
          nerdStats: nerdStats,
          onPlayPause: _togglePlayPause,
          onToggleTunnel: _toggleTunnel,
          onOpenNodesPicker: _openNodesPicker,
          onSelectQuality: _selectQuality,
          onToggleFullscreen: _toggleFullscreen,
          onToggleOverlayChat: _toggleOverlayChat,
          onToggleNerdStats: _toggleNerdStats,
          onOpenSleepTimer: _openSleepTimer,
          onToggleLockControls: _stabilityController.toggleControlsLock,
          onToggleMute: () => _stabilityController.toggleMute(1.0),
          onCatchUpLive: _catchUpLive,
          onEnterPip: _enterPipMode,
        ),
      );
    }

    // Портретный сплит-режим
    return Scaffold(
      backgroundColor: currentBg,
      body: SafeArea(
        child: Column(
          children: [
            // Регулируемая зона плеера
            SizedBox(
              height: _playerHeight,
              width: double.infinity,
              child: VideoPlayerContainer(
                isPlaying: _isPlaying,
                isTunnelEnabled: _tunnelController.isEnabled,
                currentPingMs: _tunnelController.currentPing,
                currentQuality: _currentQuality,
                viewerCount: _viewerCount,
                streamerName: widget.streamerName,
                categoryName: widget.categoryName,
                streamerAvatarUrl: widget.streamerAvatarUrl,
                isLive: true,
                isFullscreen: false,
                isOverlayChatVisible: _isOverlayChatVisible,
                isNerdStatsVisible: _isNerdStatsVisible,
                isSleepTimerActive: _sleepTimerService.isActive,
                isControlsLocked: _stabilityController.isControlsLocked,
                isMuted: _stabilityController.isMuted,
                latencySeconds: _catchupService.latencySeconds,
                playbackSpeed: _catchupService.playbackSpeed,
                isCatchingUp: _catchupService.isCatchingUp,
                bufferSeconds: _stabilityController.bufferSeconds,
                networkController: _networkController,
                nerdStats: nerdStats,
                onPlayPause: _togglePlayPause,
                onToggleTunnel: _toggleTunnel,
                onOpenNodesPicker: _openNodesPicker,
                onSelectQuality: _selectQuality,
                onToggleFullscreen: _toggleFullscreen,
                onToggleOverlayChat: _toggleOverlayChat,
                onToggleNerdStats: _toggleNerdStats,
                onOpenSleepTimer: _openSleepTimer,
                onToggleLockControls: _stabilityController.toggleControlsLock,
                onToggleMute: () => _stabilityController.toggleMute(1.0),
                onCatchUpLive: _catchUpLive,
                onEnterPip: _enterPipMode,
              ),
            ),

            // Сплиттер регулировки высоты
            SplitDividerHandle(
              onVerticalDragUpdate: _handleDividerDrag,
            ),

            // Контейнер чата Chatterino+
            Expanded(
              child: ChatPanelContainer(
                channelName: widget.streamerName,
                onOpenEmotes: _openEmotesSheet,
                onSendMessage: (msg) {
                  // Отправка в сокет чата
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
