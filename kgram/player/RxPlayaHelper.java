package org.kipsway.kgram.player;

import android.content.Context;
import android.graphics.Bitmap;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import org.kipsway.kgram.settings.KGramConfig;

/**
 * Вспомогательный мост для интеграции плеера RX Playa с ядром Telegram (MediaController).
 */
public class RxPlayaHelper {

    private static RxPlayaPlayerView activePlayerView;

    public static boolean isEnabled(Context context) {
        return KGramConfig.isRxPlayaEnabled(context);
    }

    /**
     * Создает и монтирует RxPlayaPlayerView в контейнер плеера AudioPlayerAlert.
     */
    public static RxPlayaPlayerView attachPlayer(Context context, FrameLayout container) {
        if (!isEnabled(context) || container == null) {
            return null;
        }

        RxPlayaPlayerView player = new RxPlayaPlayerView(context);
        activePlayerView = player;

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        container.addView(player, lp);

        player.setPlaybackListener(new RxPlayaPlayerView.PlaybackListener() {
            @Override
            public void onPlayPauseToggle() {
                try {
                    Class<?> mcClass = Class.forName("org.telegram.messenger.MediaController");
                    Object mc = mcClass.getMethod("getInstance").invoke(null);
                    Object msg = mcClass.getMethod("getPlayingMessageObject").invoke(mc);
                    if (msg != null) {
                        boolean isPaused = (boolean) mcClass.getMethod("isMessagePaused").invoke(mc);
                        if (isPaused) {
                            mcClass.getMethod("playMessage", msg.getClass()).invoke(mc, msg);
                        } else {
                            mcClass.getMethod("pauseMessage", msg.getClass()).invoke(mc, msg);
                        }
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }

            @Override
            public void onNextTrack() {
                try {
                    Class<?> mcClass = Class.forName("org.telegram.messenger.MediaController");
                    Object mc = mcClass.getMethod("getInstance").invoke(null);
                    mcClass.getMethod("playNextMessage", boolean.class).invoke(mc, false);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }

            @Override
            public void onPreviousTrack() {
                try {
                    Class<?> mcClass = Class.forName("org.telegram.messenger.MediaController");
                    Object mc = mcClass.getMethod("getInstance").invoke(null);
                    mcClass.getMethod("playPreviousMessage", boolean.class).invoke(mc, false);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }

            @Override
            public void onSeekTo(float progress) {
                try {
                    Class<?> mcClass = Class.forName("org.telegram.messenger.MediaController");
                    Object mc = mcClass.getMethod("getInstance").invoke(null);
                    Object msg = mcClass.getMethod("getPlayingMessageObject").invoke(mc);
                    if (msg != null) {
                        mcClass.getMethod("seekToProgress", msg.getClass(), float.class).invoke(mc, msg, progress);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }

            @Override
            public void onDismissRequest() {
                // Закрытие/сворачивание плеера
            }

            @Override
            public void onToggleRepeat() {}

            @Override
            public void onToggleShuffle() {}
        });

        return player;
    }

    public static void updatePlayingState(boolean isPlaying) {
        if (activePlayerView != null) {
            activePlayerView.setPlaying(isPlaying);
        }
    }

    public static void updateTrackMetadata(String title, String artist, int durationSeconds, Bitmap artwork) {
        if (activePlayerView != null) {
            activePlayerView.setTrackInfo(title, artist, durationSeconds, artwork);
        }
    }

    public static void updateProgress(float fraction, int currentSeconds) {
        if (activePlayerView != null) {
            activePlayerView.setProgress(fraction, currentSeconds);
        }
    }
}
