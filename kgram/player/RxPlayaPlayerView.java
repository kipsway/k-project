package org.kipsway.kgram.player;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.util.AttributeSet;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import org.kipsway.kgram.theme.MozaikThemeManager;

/**
 * Кастомный плеер аудиозаписей в эстетике RX Playa для kGram.
 * Особенности:
 * - Крупная обложка трека со скруглением сквиркла 28dp и мягким радиальным виньетированием.
 * - Цветовая палитра «Мозаика» (#0A0A0C, лаванда #B8A7F0).
 * - Тактильные кнопки-капсулы Material You 3.
 * - Жесты свайпа: влево/вправо — переключение трека, вниз — сворачивание.
 */
public class RxPlayaPlayerView extends FrameLayout {

    private ImageView artworkImageView;
    private TextView titleTextView;
    private TextView artistTextView;
    private SeekBar progressBar;
    private TextView currentTimeText;
    private TextView totalTimeText;

    private ImageView playPauseButton;
    private ImageView prevButton;
    private ImageView nextButton;
    private ImageView repeatButton;
    private ImageView shuffleButton;

    private boolean isPlaying = false;
    private GestureDetector gestureDetector;
    private PlaybackListener listener;

    private final Paint vignettePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path artworkClipPath = new Path();
    private final RectF artworkRect = new RectF();

    public interface PlaybackListener {
        void onPlayPauseToggle();
        void onNextTrack();
        void onPreviousTrack();
        void onSeekTo(int progress);
        void onDismissRequest();
    }

    public RxPlayaPlayerView(Context context) {
        super(context);
        init(context);
    }

    public RxPlayaPlayerView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init(context);
    }

    private void init(Context context) {
        setBackgroundColor(MozaikThemeManager.COLOR_BG_ONYX);

        // Инициализация детектора жестов (свайпы по плееру)
        gestureDetector = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
            private static final int SWIPE_THRESHOLD = 80;
            private static final int SWIPE_VELOCITY_THRESHOLD = 100;

            @Override
            public boolean onFling(MotionEvent e1, MotionEvent e2, float velocityX, float velocityY) {
                if (e1 == null || e2 == null) return false;
                float diffX = e2.getX() - e1.getX();
                float diffY = e2.getY() - e1.getY();

                if (Math.abs(diffX) > Math.abs(diffY)) {
                    if (Math.abs(diffX) > SWIPE_THRESHOLD && Math.abs(velocityX) > SWIPE_VELOCITY_THRESHOLD) {
                        if (diffX > 0) {
                            if (listener != null) listener.onPreviousTrack();
                        } else {
                            if (listener != null) listener.onNextTrack();
                        }
                        return true;
                    }
                } else if (diffY > SWIPE_THRESHOLD && Math.abs(velocityY) > SWIPE_VELOCITY_THRESHOLD) {
                    if (listener != null) listener.onDismissRequest();
                    return true;
                }
                return false;
            }
        });

        // Контейнер контента
        LinearLayout contentLayout = new LinearLayout(context);
        contentLayout.setOrientation(LinearLayout.VERTICAL);
        contentLayout.setGravity(Gravity.CENTER_HORIZONTAL);
        contentLayout.setPadding(dp(24), dp(32), dp(24), dp(32));

        // 1. Полоска индикатора сворачивания (Liquid Grabber)
        View grabber = new View(context);
        grabber.setBackgroundColor(MozaikThemeManager.COLOR_BORDER);
        LayoutParams grabberLp = new LayoutParams(dp(40), dp(4));
        grabberLp.gravity = Gravity.CENTER_HORIZONTAL;
        grabberLp.bottomMargin = dp(24);
        contentLayout.addView(grabber, grabberLp);

        // 2. Крупная обложка трека (RX Playa Artwork 280x280)
        artworkImageView = new ImageView(context) {
            @Override
            protected void onSizeChanged(int w, int h, int oldw, int oldh) {
                super.onSizeChanged(w, h, oldw, oldh);
                artworkRect.set(0, 0, w, h);
                artworkClipPath.reset();
                artworkClipPath.addRoundRect(artworkRect, dp(28), dp(28), Path.Direction.CW);

                // Мягкое виньетирование по нижнему краю обложки
                vignettePaint.setShader(new LinearGradient(
                    0, h * 0.65f, 0, h,
                    0x00000000, 0x880A0A0C,
                    Shader.TileMode.CLAMP
                ));
            }

            @Override
            protected void onDraw(Canvas canvas) {
                canvas.save();
                canvas.clipPath(artworkClipPath);
                super.onDraw(canvas);
                canvas.drawRect(artworkRect, vignettePaint);
                canvas.restore();
            }
        };
        artworkImageView.setScaleType(ImageView.ScaleType.CENTER_CROP);
        artworkImageView.setBackgroundColor(MozaikThemeManager.COLOR_PANEL);

        LinearLayout.LayoutParams artLp = new LinearLayout.LayoutParams(dp(280), dp(280));
        artLp.gravity = Gravity.CENTER_HORIZONTAL;
        artLp.bottomMargin = dp(24);
        contentLayout.addView(artworkImageView, artLp);

        // 3. Метаданные трека
        titleTextView = new TextView(context);
        titleTextView.setTextColor(MozaikThemeManager.COLOR_INK);
        titleTextView.setTextSize(20);
        titleTextView.setText("Название трека");
        titleTextView.setGravity(Gravity.CENTER);
        contentLayout.addView(titleTextView);

        artistTextView = new TextView(context);
        artistTextView.setTextColor(MozaikThemeManager.COLOR_LAVENDER);
        artistTextView.setTextSize(14);
        artistTextView.setText("Исполнитель");
        artistTextView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams artistLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        artistLp.topMargin = dp(4);
        artistLp.bottomMargin = dp(20);
        contentLayout.addView(artistTextView, artistLp);

        // 4. Тонкий прогресс-бар трека
        progressBar = new SeekBar(context);
        progressBar.setMax(100);
        progressBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser && listener != null) {
                    listener.onSeekTo(progress);
                }
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        contentLayout.addView(progressBar);

        // Временные метки (0:00 / 3:45)
        LinearLayout timeRow = new LinearLayout(context);
        timeRow.setOrientation(LinearLayout.HORIZONTAL);
        currentTimeText = new TextView(context);
        currentTimeText.setTextColor(MozaikThemeManager.COLOR_MUTED);
        currentTimeText.setTextSize(12);
        currentTimeText.setText("0:00");

        totalTimeText = new TextView(context);
        totalTimeText.setTextColor(MozaikThemeManager.COLOR_MUTED);
        totalTimeText.setTextSize(12);
        totalTimeText.setText("0:00");
        totalTimeText.setGravity(Gravity.END);

        timeRow.addView(currentTimeText, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f));
        timeRow.addView(totalTimeText, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f));
        contentLayout.addView(timeRow);

        // 5. Органы управления капсульного вида
        LinearLayout controlsLayout = new LinearLayout(context);
        controlsLayout.setOrientation(LinearLayout.HORIZONTAL);
        controlsLayout.setGravity(Gravity.CENTER);
        controlsLayout.setPadding(0, dp(24), 0, dp(16));

        playPauseButton = new ImageView(context);
        playPauseButton.setBackgroundColor(MozaikThemeManager.COLOR_LAVENDER);
        playPauseButton.setOnClickListener(v -> {
            if (listener != null) listener.onPlayPauseToggle();
        });

        LinearLayout.LayoutParams playLp = new LinearLayout.LayoutParams(dp(56), dp(56));
        playLp.setMargins(dp(20), 0, dp(20), 0);
        controlsLayout.addView(playPauseButton, playLp);

        contentLayout.addView(controlsLayout);
        addView(contentLayout);
    }

    public void setPlaybackListener(PlaybackListener listener) {
        this.listener = listener;
    }

    public void updateTrackInfo(String title, String artist, int durationSeconds) {
        titleTextView.setText(title);
        artistTextView.setText(artist);
        totalTimeText.setText(formatTime(durationSeconds));
    }

    public void updateProgress(int currentSeconds) {
        currentTimeText.setText(formatTime(currentSeconds));
    }

    public void setPlaying(boolean playing) {
        this.isPlaying = playing;
        // Переключение иконки play/pause
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (gestureDetector.onTouchEvent(event)) {
            return true;
        }
        return super.onTouchEvent(event);
    }

    private String formatTime(int totalSeconds) {
        int m = totalSeconds / 60;
        int s = totalSeconds % 60;
        return String.format("%d:%02d", m, s);
    }

    private int dp(float val) {
        return (int) Math.ceil(getContext().getResources().getDisplayMetrics().density * val);
    }
}
