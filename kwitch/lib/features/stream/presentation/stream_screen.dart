import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../core/theme/k_colors.dart';
import '../../../core/theme/k_typography.dart';
import '../../chat/presentation/widgets/chatterino_emotes_sheet.dart';
import '../../ktunnel/domain/services/network_adaptive_controller.dart';
import '../../ktunnel/presentation/controllers/ktunnel_controller.dart';
import '../../ktunnel/presentation/widgets/ktunnel_node_picker_sheet.dart';
import '../domain/models/stream_nerd_stats.dart';
import '../domain/models/twitch_channel_item.dart';
import '../domain/models/vod_clip_item.dart';
import '../domain/services/amoled_mode_controller.dart';
import '../domain/services/audio_only_mode_controller.dart';
import '../domain/services/battery_saver_controller.dart';
import '../domain/services/pip_background_service.dart';
import '../domain/services/player_stability_controller.dart';
import '../domain/services/sleep_timer_service.dart';
import '../domain/services/stream_ambient_glow_controller.dart';
import '../domain/services/stream_audio_dsp_controller.dart';
import '../domain/services/stream_bookmarks_service.dart';
import '../domain/services/stream_catchup_service.dart';
import '../domain/services/stream_replay_buffer_service.dart';
import '../domain/services/stream_zen_mode_controller.dart';
import '../domain/services/vod_clips_service.dart';
import 'widgets/battery_saver_sheet.dart';
import 'widgets/channel_search_drawer.dart';
import 'widgets/chat_panel_container.dart';
import 'widgets/sleep_timer_sheet.dart';
import 'widgets/split_divider_handle.dart';
import 'widgets/stream_ambient_glow_sheet.dart';
import 'widgets/stream_audio_dsp_sheet.dart';
import 'widgets/stream_bookmarks_sheet.dart';
import 'widgets/video_player_container.dart';
import 'widgets/vod_clips_browser_sheet.dart';

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

  // Контроллер аудио-режима «Только радио»
  late final AudioOnlyModeController _audioOnlyController;

  // Сервис мгновенного повтора (Instant 30s DVR Replay)
  late final StreamReplayBufferService _replayService;

  // Контроллер аудиопроцессора (DSP эквалайзер)
  late final StreamAudioDspController _audioDspController;

  // Сервис закладок и таймкодов моментов стрима
  late final StreamBookmarksService _bookmarksService;

  // Контроллер адаптивного режима энергосбережения батареи
  late final BatterySaverController _batteryController;

  // Контроллер фоновой динамической эмбиент-подсветки Ambilight
  late final StreamAmbientGlowController _ambientGlowController;

  // Контроллер Дзен-режима фокуса стримера
  late final StreamZenModeController _zenModeController;

  // Сервис браузера VOD-записей и клипов канала
  late final VodClipsService _vodClipsService;

  // Состояния воспроизведения
  bool _isPlaying = true;
  String _currentQuality = '1440p60';
  late String _streamerName;
  late String _categoryName;
  late String? _streamerAvatarUrl;
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
    _streamerName = widget.streamerName;
    _categoryName = widget.categoryName;
    _streamerAvatarUrl = widget.streamerAvatarUrl;
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

    _audioOnlyController = AudioOnlyModeController();
    _audioOnlyController.addListener(_onStateChanged);

    _replayService = StreamReplayBufferService();
    _replayService.addListener(_onStateChanged);

    _audioDspController = StreamAudioDspController();
    _audioDspController.addListener(_onStateChanged);

    _bookmarksService = StreamBookmarksService();
    _bookmarksService.addListener(_onStateChanged);

    _batteryController = BatterySaverController();
    _batteryController.addListener(_onStateChanged);

    _ambientGlowController = StreamAmbientGlowController();
    _ambientGlowController.updateCategory(_categoryName);
    _ambientGlowController.addListener(_onStateChanged);

    _zenModeController = StreamZenModeController();
    _zenModeController.addListener(_onStateChanged);

    _vodClipsService = VodClipsService();
    _vodClipsService.addListener(_onStateChanged);

    _updateNotification();
  }

  void _onStateChanged() {
    if (mounted) setState(() {});
  }

  void _updateNotification() {
    final titleSuffix = _audioOnlyController.isAudioOnly ? ' [Радио 160k]' : '';
    _pipService.updateNotification(
      streamerName: _streamerName,
      categoryName: '$_categoryName$titleSuffix',
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
    _audioOnlyController.removeListener(_onStateChanged);
    _audioOnlyController.dispose();
    _replayService.removeListener(_onStateChanged);
    _replayService.dispose();
    _audioDspController.removeListener(_onStateChanged);
    _audioDspController.dispose();
    _bookmarksService.removeListener(_onStateChanged);
    _bookmarksService.dispose();
    _batteryController.removeListener(_onStateChanged);
    _batteryController.dispose();
    _ambientGlowController.removeListener(_onStateChanged);
    _ambientGlowController.dispose();
    _zenModeController.removeListener(_onStateChanged);
    _zenModeController.dispose();
    _vodClipsService.removeListener(_onStateChanged);
    _vodClipsService.dispose();
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
    setState(() {
      _currentQuality = quality;
      _audioOnlyController.toggleAudioOnly(quality == 'audio_only');
    });
    _updateNotification();
  }

  void _toggleAudioOnly() {
    setState(() {
      final willBeAudio = !_audioOnlyController.isAudioOnly;
      _audioOnlyController.toggleAudioOnly(willBeAudio);
      _currentQuality = willBeAudio ? 'audio_only' : '1440p60';
    });
    _updateNotification();
    HapticFeedback.lightImpact();
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
              _audioOnlyController.isAudioOnly ? LucideIcons.radio : LucideIcons.video,
              color: KColors.lav,
              size: 18,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                _audioOnlyController.isAudioOnly
                    ? 'Режим радио активен: экономия до 98% трафика'
                    : 'Видео 1440p60 восстановлено',
                style: KTypography.caption.copyWith(color: KColors.ink),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _startInstantReplay() {
    HapticFeedback.mediumImpact();
    _replayService.startInstantReplay(30.0);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: KColors.panel,
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: Color(0xFFF59E0B), width: 1),
        ),
        content: Row(
          children: [
            const Icon(LucideIcons.rotateCcw, color: Color(0xFFF59E0B), size: 18),
            const SizedBox(width: 8),
            Text(
              'Мгновенный повтор: -30с прямого эфира',
              style: KTypography.caption.copyWith(color: KColors.ink),
            ),
          ],
        ),
      ),
    );
  }

  void _exitReplayAndJumpToLive() {
    HapticFeedback.heavyImpact();
    _replayService.exitReplayAndJumpToLive();
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
          'Возврат к прямому эфиру',
          style: KTypography.caption.copyWith(color: KColors.ink),
        ),
      ),
    );
  }

  void _shareClip() {
    final markers = _replayService.generateClipMarkers();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: KColors.panel,
        duration: const Duration(seconds: 3),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: KColors.accBorder, width: 1),
        ),
        content: Row(
          children: [
            const Icon(LucideIcons.scissors, color: KColors.lav, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Клип сохранен: ${_replayService.formattedOffset} (${markers['clipTitle']})',
                style: KTypography.caption.copyWith(color: KColors.ink),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openAudioDsp() {
    StreamAudioDspSheet.show(context, _audioDspController);
  }

  void _openBookmarks() {
    StreamBookmarksSheet.show(
      context,
      bookmarksService: _bookmarksService,
      streamerName: _streamerName,
      categoryName: _categoryName,
      currentTimestampSeconds: 3600,
    );
  }

  void _openBatterySaver() {
    BatterySaverSheet.show(context, _batteryController);
  }

  void _openAmbientGlow() {
    StreamAmbientGlowSheet.show(context, _ambientGlowController);
  }

  void _toggleZenMode() {
    HapticFeedback.mediumImpact();
    _zenModeController.toggleZenMode();
    if (_zenModeController.isZenMode) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    } else if (!_isFullscreen) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    }
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

  void _openChannelsDrawer() {
    ChannelSearchDrawer.show(
      context,
      onSelectChannel: _switchChannel,
    );
  }

  void _switchChannel(TwitchChannelItem channel) {
    setState(() {
      _streamerName = channel.id;
      _categoryName = channel.category;
      _streamerAvatarUrl = channel.avatarUrl;
      _viewerCount = channel.viewerCount;
    });
    _ambientGlowController.updateCategory(channel.category);
    _updateNotification();
    _catchupService.jumpToLiveEdge();
    HapticFeedback.mediumImpact();
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
            const Icon(LucideIcons.tv, color: KColors.lav, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                'Переключено на ${channel.displayName} (${channel.category})',
                style: KTypography.caption.copyWith(color: KColors.ink),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openEmotesSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) {
        return ChatterinoEmotesSheet(
          channel: _streamerName,
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
      fps: _batteryController.targetFps,
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
          streamerName: _streamerName,
          categoryName: _categoryName,
          streamerAvatarUrl: _streamerAvatarUrl,
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
          audioOnlyController: _audioOnlyController,
          replayService: _replayService,
          audioDspController: _audioDspController,
          batteryController: _batteryController,
          ambientGlowController: _ambientGlowController,
          zenModeController: _zenModeController,
          currentBookmarkCount: _bookmarksService.getBookmarksForStreamer(_streamerName).length,
          nerdStats: nerdStats,
          onPlayPause: _togglePlayPause,
          onToggleTunnel: _toggleTunnel,
          onOpenNodesPicker: _openNodesPicker,
          onSelectQuality: _selectQuality,
          onToggleFullscreen: _toggleFullscreen,
          onToggleOverlayChat: _toggleOverlayChat,
          onToggleNerdStats: _toggleNerdStats,
          onOpenSleepTimer: _openSleepTimer,
          onOpenChannelsDrawer: _openChannelsDrawer,
          onToggleLockControls: _stabilityController.toggleControlsLock,
          onToggleMute: () => _stabilityController.toggleMute(1.0),
          onToggleAudioOnly: _toggleAudioOnly,
          onOpenAudioDsp: _openAudioDsp,
          onOpenBookmarks: _openBookmarks,
          onOpenBatterySaver: _openBatterySaver,
          onOpenAmbientGlow: _openAmbientGlow,
          onToggleZenMode: _toggleZenMode,
          onStartInstantReplay: _startInstantReplay,
          onExitReplay: _exitReplayAndJumpToLive,
          onShareClip: _shareClip,
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
          streamerName: _streamerName,
          categoryName: _categoryName,
          streamerAvatarUrl: _streamerAvatarUrl,
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
          audioOnlyController: _audioOnlyController,
          replayService: _replayService,
          audioDspController: _audioDspController,
          batteryController: _batteryController,
          ambientGlowController: _ambientGlowController,
          zenModeController: _zenModeController,
          currentBookmarkCount: _bookmarksService.getBookmarksForStreamer(_streamerName).length,
          nerdStats: nerdStats,
          onPlayPause: _togglePlayPause,
          onToggleTunnel: _toggleTunnel,
          onOpenNodesPicker: _openNodesPicker,
          onSelectQuality: _selectQuality,
          onToggleFullscreen: _toggleFullscreen,
          onToggleOverlayChat: _toggleOverlayChat,
          onToggleNerdStats: _toggleNerdStats,
          onOpenSleepTimer: _openSleepTimer,
          onOpenChannelsDrawer: _openChannelsDrawer,
          onToggleLockControls: _stabilityController.toggleControlsLock,
          onToggleMute: () => _stabilityController.toggleMute(1.0),
          onToggleAudioOnly: _toggleAudioOnly,
          onOpenAudioDsp: _openAudioDsp,
          onOpenBookmarks: _openBookmarks,
          onOpenBatterySaver: _openBatterySaver,
          onOpenAmbientGlow: _openAmbientGlow,
          onToggleZenMode: _toggleZenMode,
          onStartInstantReplay: _startInstantReplay,
          onExitReplay: _exitReplayAndJumpToLive,
          onShareClip: _shareClip,
          onCatchUpLive: _catchUpLive,
          onEnterPip: _enterPipMode,
        ),
      );
    }

    // Портретный сплит-режим (в Дзен-режиме плеер раскрывается на весь экран)
    return Scaffold(
      backgroundColor: currentBg,
      body: SafeArea(
        child: Column(
          children: [
            if (_zenModeController.isZenMode)
              Expanded(
                child: VideoPlayerContainer(
                  isPlaying: _isPlaying,
                  isTunnelEnabled: _tunnelController.isEnabled,
                  currentPingMs: _tunnelController.currentPing,
                  currentQuality: _currentQuality,
                  viewerCount: _viewerCount,
                  streamerName: _streamerName,
                  categoryName: _categoryName,
                  streamerAvatarUrl: _streamerAvatarUrl,
                  isLive: true,
                  isFullscreen: false,
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
                  audioOnlyController: _audioOnlyController,
                  replayService: _replayService,
                  audioDspController: _audioDspController,
                  batteryController: _batteryController,
                  ambientGlowController: _ambientGlowController,
                  zenModeController: _zenModeController,
                  currentBookmarkCount: _bookmarksService.getBookmarksForStreamer(_streamerName).length,
                  nerdStats: nerdStats,
                  onPlayPause: _togglePlayPause,
                  onToggleTunnel: _toggleTunnel,
                  onOpenNodesPicker: _openNodesPicker,
                  onSelectQuality: _selectQuality,
                  onToggleFullscreen: _toggleFullscreen,
                  onToggleOverlayChat: _toggleOverlayChat,
                  onToggleNerdStats: _toggleNerdStats,
                  onOpenSleepTimer: _openSleepTimer,
                  onOpenChannelsDrawer: _openChannelsDrawer,
                  onToggleLockControls: _stabilityController.toggleControlsLock,
                  onToggleMute: () => _stabilityController.toggleMute(1.0),
                  onToggleAudioOnly: _toggleAudioOnly,
                  onOpenAudioDsp: _openAudioDsp,
                  onOpenBookmarks: _openBookmarks,
                  onOpenBatterySaver: _openBatterySaver,
                  onOpenAmbientGlow: _openAmbientGlow,
                  onToggleZenMode: _toggleZenMode,
                  onStartInstantReplay: _startInstantReplay,
                  onExitReplay: _exitReplayAndJumpToLive,
                  onShareClip: _shareClip,
                  onCatchUpLive: _catchUpLive,
                  onEnterPip: _enterPipMode,
                ),
              )
            else ...[
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
                  streamerName: _streamerName,
                  categoryName: _categoryName,
                  streamerAvatarUrl: _streamerAvatarUrl,
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
                  audioOnlyController: _audioOnlyController,
                  replayService: _replayService,
                  audioDspController: _audioDspController,
                  batteryController: _batteryController,
                  ambientGlowController: _ambientGlowController,
                  zenModeController: _zenModeController,
                  currentBookmarkCount: _bookmarksService.getBookmarksForStreamer(_streamerName).length,
                  nerdStats: nerdStats,
                  onPlayPause: _togglePlayPause,
                  onToggleTunnel: _toggleTunnel,
                  onOpenNodesPicker: _openNodesPicker,
                  onSelectQuality: _selectQuality,
                  onToggleFullscreen: _toggleFullscreen,
                  onToggleOverlayChat: _toggleOverlayChat,
                  onToggleNerdStats: _toggleNerdStats,
                  onOpenSleepTimer: _openSleepTimer,
                  onOpenChannelsDrawer: _openChannelsDrawer,
                  onToggleLockControls: _stabilityController.toggleControlsLock,
                  onToggleMute: () => _stabilityController.toggleMute(1.0),
                  onToggleAudioOnly: _toggleAudioOnly,
                  onOpenAudioDsp: _openAudioDsp,
                  onOpenBookmarks: _openBookmarks,
                  onOpenBatterySaver: _openBatterySaver,
                  onOpenAmbientGlow: _openAmbientGlow,
                  onToggleZenMode: _toggleZenMode,
                  onStartInstantReplay: _startInstantReplay,
                  onExitReplay: _exitReplayAndJumpToLive,
                  onShareClip: _shareClip,
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
                  channelName: _streamerName,
                  onOpenEmotes: _openEmotesSheet,
                  onSendMessage: (msg) {
                    // Отправка в сокет чата
                  },
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
