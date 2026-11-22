import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import 'ktunnel_toggle_chip.dart';
import 'stream_catchup_badge.dart';
import 'stream_quality_selector.dart';

class PlayerControlsOverlay extends StatefulWidget {
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
  final VoidCallback onCatchUpLive;
  final VoidCallback? onEnterPip;

  const PlayerControlsOverlay({
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
    required this.onCatchUpLive,
    this.onEnterPip,
  });

  @override
  State<PlayerControlsOverlay> createState() => _PlayerControlsOverlayState();
}

class _PlayerControlsOverlayState extends State<PlayerControlsOverlay> {
  bool _isVisible = true;
  Timer? _hideTimer;

  @override
  void initState() {
    super.initState();
    _startHideTimer();
  }

  void _startHideTimer() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(seconds: 4), () {
      if (mounted && widget.isPlaying) {
        setState(() => _isVisible = false);
      }
    });
  }

  void _toggleVisibility() {
    setState(() => _isVisible = !_isVisible);
    if (_isVisible) {
      _startHideTimer();
    }
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // РЕЖИМ БЛОКИРОВКИ ЭКРАНА (Замок от случайных нажатий)
    if (widget.isControlsLocked) {
      return Positioned(
        left: 20,
        top: 20,
        child: SafeArea(
          child: GestureDetector(
            onTap: () {
              HapticFeedback.heavyImpact();
              widget.onToggleLockControls();
            },
            child: KGlassContainer.capsule(
              blurSigma: 24,
              backgroundColor: const Color(0xCC0F0F12),
              customBorder: Border.all(color: KColors.accBorder, width: 1.2),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(LucideIcons.lock, size: 16, color: KColors.lav),
                  const SizedBox(width: 8),
                  Text(
                    'Экран заблокирован (Нажмите для снятия)',
                    style: KTypography.caption.copyWith(color: KColors.lavInk),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: _toggleVisibility,
      child: AnimatedOpacity(
        opacity: _isVisible ? 1.0 : 0.0,
        duration: const Duration(milliseconds: 250),
        child: IgnorePointer(
          ignoring: !_isVisible,
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withOpacity(0.75),
                  Colors.transparent,
                  Colors.transparent,
                  Colors.black.withOpacity(0.85),
                ],
                stops: const [0.0, 0.25, 0.7, 1.0],
              ),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: SafeArea(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // ВЕРХНИЙ БАР: инфо о стримере, звук, замок, таймер, PiP, онлайн
                  Row(
                    children: [
                      // Кнопка Назад
                      IconButton(
                        onPressed: () => Navigator.maybePop(context),
                        icon: const Icon(LucideIcons.arrowLeft, color: KColors.ink, size: 24),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                      const SizedBox(width: 10),
                      // Аватар стримера
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: KColors.lav, width: 1.5),
                          color: KColors.panel,
                        ),
                        child: ClipOval(
                          child: widget.streamerAvatarUrl != null
                              ? Image.network(widget.streamerAvatarUrl!, fit: BoxFit.cover)
                              : const Icon(LucideIcons.user, size: 20, color: KColors.lav),
                        ),
                      ),
                      const SizedBox(width: 10),
                      // Название канала и категория
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              widget.streamerName,
                              style: KTypography.titleBold.copyWith(fontSize: 15),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              widget.categoryName,
                              style: KTypography.caption.copyWith(color: KColors.lavInk),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 6),

                      // Кнопка Mute / Unmute
                      IconButton(
                        onPressed: () {
                          widget.onToggleMute();
                          _startHideTimer();
                        },
                        icon: Icon(
                          widget.isMuted ? LucideIcons.volumeX : LucideIcons.volume2,
                          color: widget.isMuted ? KColors.redInk : KColors.ink,
                          size: 18,
                        ),
                        tooltip: widget.isMuted ? 'Включить звук' : 'Выключить звук',
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        constraints: const BoxConstraints(),
                      ),

                      // Кнопка Замка управления
                      IconButton(
                        onPressed: () {
                          widget.onToggleLockControls();
                        },
                        icon: const Icon(LucideIcons.unlock, color: KColors.muted, size: 18),
                        tooltip: 'Заблокировать экран',
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        constraints: const BoxConstraints(),
                      ),

                      // Кнопка Спящего таймера
                      IconButton(
                        onPressed: () {
                          HapticFeedback.selectionClick();
                          widget.onOpenSleepTimer();
                        },
                        icon: Icon(
                          LucideIcons.moon,
                          color: widget.isSleepTimerActive ? KColors.lav : KColors.muted,
                          size: 18,
                        ),
                        tooltip: 'Спящий таймер',
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        constraints: const BoxConstraints(),
                      ),

                      // Кнопка Статистики для гиков
                      IconButton(
                        onPressed: () {
                          HapticFeedback.selectionClick();
                          widget.onToggleNerdStats();
                        },
                        icon: Icon(
                          LucideIcons.activity,
                          color: widget.isNerdStatsVisible ? KColors.lav : KColors.muted,
                          size: 18,
                        ),
                        tooltip: 'Статистика для гиков',
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        constraints: const BoxConstraints(),
                      ),

                      // Кнопка PiP
                      if (widget.onEnterPip != null)
                        IconButton(
                          onPressed: () {
                            HapticFeedback.lightImpact();
                            widget.onEnterPip!();
                          },
                          icon: const Icon(LucideIcons.pip, color: KColors.ink, size: 20),
                          tooltip: 'Картинка в картинке',
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          constraints: const BoxConstraints(),
                        ),
                      const SizedBox(width: 4),

                      // Живой индикатор онлайна
                      if (widget.isLive)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: KColors.red.withOpacity(0.18),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: KColors.red, width: 1),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 6,
                                height: 6,
                                decoration: const BoxDecoration(
                                  color: KColors.red,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 5),
                              Text(
                                '${widget.viewerCount}',
                                style: KTypography.monoStats.copyWith(
                                  color: KColors.ink,
                                  fontSize: 10,
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),

                  // ЦЕНТРАЛЬНАЯ КНОПКА PLAY/PAUSE И БЕЙДЖ ДОГОНА 1.5x
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      StreamCatchupBadge(
                        latencySeconds: widget.latencySeconds,
                        playbackSpeed: widget.playbackSpeed,
                        isCatchingUp: widget.isCatchingUp,
                        onCatchUp: widget.onCatchUpLive,
                      ),
                      const SizedBox(height: 8),
                      IconButton(
                        iconSize: 48,
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          widget.onPlayPause();
                          _startHideTimer();
                        },
                        icon: Icon(
                          widget.isPlaying ? LucideIcons.pauseCircle : LucideIcons.playCircle,
                          color: KColors.lav,
                        ),
                      ),
                    ],
                  ),

                  // НИЖНИЙ БАР КОНТРОЛЛЕРОВ И ПОЛОСА БУФЕРА
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Тонкая линия здоровья буфера
                      Container(
                        height: 2,
                        margin: const EdgeInsets.only(bottom: 8),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(1),
                          color: KColors.panelBorder,
                        ),
                        child: FractionallySizedBox(
                          alignment: Alignment.centerLeft,
                          widthFactor: (widget.bufferSeconds / 10.0).clamp(0.0, 1.0),
                          child: Container(
                            decoration: BoxDecoration(
                              color: KColors.lav.withOpacity(0.8),
                              borderRadius: BorderRadius.circular(1),
                            ),
                          ),
                        ),
                      ),

                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          // Переключатель k-Tunnel
                          KTunnelToggleChip(
                            isEnabled: widget.isTunnelEnabled,
                            pingMs: widget.currentPingMs,
                            onToggle: (val) {
                              widget.onToggleTunnel(val);
                              _startHideTimer();
                            },
                            onOpenNodesPicker: widget.onOpenNodesPicker,
                          ),

                          // Правый стек: оверлей чата, выбор качества и полноэкранный режим
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                onPressed: () {
                                  HapticFeedback.lightImpact();
                                  widget.onToggleOverlayChat();
                                },
                                icon: Icon(
                                  LucideIcons.messageSquare,
                                  color: widget.isOverlayChatVisible ? KColors.lav : KColors.muted,
                                  size: 20,
                                ),
                                tooltip: 'Чат-оверлей',
                                padding: const EdgeInsets.all(8),
                                constraints: const BoxConstraints(),
                              ),
                              const SizedBox(width: 6),
                              StreamQualitySelector(
                                currentQuality: widget.currentQuality,
                                isTunnelEnabled: widget.isTunnelEnabled,
                                onQualitySelected: (q) {
                                  widget.onSelectQuality(q);
                                  _startHideTimer();
                                },
                              ),
                              const SizedBox(width: 8),
                              IconButton(
                                onPressed: () {
                                  HapticFeedback.lightImpact();
                                  widget.onToggleFullscreen();
                                },
                                icon: Icon(
                                  widget.isFullscreen ? LucideIcons.minimize2 : LucideIcons.maximize2,
                                  color: KColors.ink,
                                  size: 20,
                                ),
                                padding: const EdgeInsets.all(8),
                                constraints: const BoxConstraints(),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
