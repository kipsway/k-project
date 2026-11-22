package org.kipsway.kgram.player;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.util.AttributeSet;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import org.kipsway.kgram.theme.MozaikThemeManager;

/**
 * Аудиоплеер в эстетике RX Playa для kGram (by kipsway).
 * 
 * Архитектурные правила:
 * - Крупная обложка трека (280x280dp) со скруглением сквиркла 28dp и мягким нижним виньетированием.
 * - Цветовая палитра «Мозаика»: оникс #0A0A0C, панели #0F0F12, акцентная лаванда #B8A7F0.
 * - Кнопки-капсулы Material You 3 со StadiumBorder (скругление 999px).
 * - Управление свайпами: свайп влево — следующий трек, свайп вправо — предыдущий, свайп вниз — сворачивание.
 */
public class RxPlayaPlayerView extends FrameLayout {

    private ImageView artworkImageView;
    private TextView titleTextView;
    private TextView artistTextView;
    private SeekBar progressBar;
    private TextView currentTimeText;
    private TextView totalTimeText;

    private FrameLayout playPauseContainer;
    private ImageView playPauseIcon;
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
        void onSeekTo(float progress);
        void onDismissRequest();
        void onToggleRepeat();
        void onToggleShuffle();
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

        // Инициализация детектора жестов
        gestureDetector = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
            private static final int SWIPE_THRESHOLD = 80;
            private static final int SWIPE_VELOCITY_THRESHOLD = 120;

            @Override
            public boolean onFling(MotionEvent e1, MotionEvent e2, float velocityX, float velocityY) {
                if (e1 == null || e2 == null) return false;
                float diffX = e2.getX() - e1.getX();
                float diffY = e2.getY() - e1.getY();

                if (Math.abs(diffX) > Math.abs(diffY)) {
                    if (Math.abs(diffX) > SWIPE_THRESHOLD && Math.abs(velocityX) > SWIPE_VELOCITY_THRESHOLD) {
                        triggerHaptic();
                        if (diffX > 0) {
                            if (listener != null) listener.onPreviousTrack();
                        } else {
                            if (listener != null) listener.onNextTrack();
                        }
                        return true;
                    }
                } else if (diffY > SWIPE_THRESHOLD && Math.abs(velocityY) > SWIPE_VELOCITY_THRESHOLD) {
                    triggerHaptic();
                    if (listener != null) listener.onDismissRequest();
                    return true;
                }
                return false;
            }
        });

        // Основной вертикальный контейнер
        LinearLayout contentLayout = new LinearLayout(context);
        contentLayout.setOrientation(LinearLayout.VERTICAL);
        contentLayout.setGravity(Gravity.CENTER_HORIZONTAL);
        contentLayout.setPadding(dp(24), dp(20), dp(24), dp(32));

        // 1. Полоска индикатора сворачивания (Liquid Glass Grabber)
        View grabber = new View(context);
        GradientDrawable grabberBg = new GradientDrawable();
        grabberBg.setColor(MozaikThemeManager.COLOR_BORDER);
        grabberBg.setCornerRadius(dp(2));
        grabber.setBackground(grabberBg);
        LinearLayout.LayoutParams grabberLp = new LinearLayout.LayoutParams(dp(44), dp(4));
        grabberLp.bottomMargin = dp(28);
        contentLayout.addView(grabber, grabberLp);

        // 2. Крупная обложка трека (RX Playa Artwork со сквирклом 28dp)
        artworkImageView = new ImageView(context) {
            @Override
            protected void onSizeChanged(int w, int h, int oldw, int oldh) {
                super.onSizeChanged(w, h, oldw, oldh);
                artworkRect.set(0, 0, w, h);
                artworkClipPath.reset();
                artworkClipPath.addRoundRect(artworkRect, dp(28), dp(28), Path.Direction.CW);

                // Мягкое виньетирование по нижнему краю обложки
                vignettePaint.setShader(new LinearGradient(
                    0, h * 0.60f, 0, h,
                    0x00000000, 0x990A0A0C,
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
        GradientDrawable artPlaceholder = new GradientDrawable();
        artPlaceholder.setColor(MozaikThemeManager.COLOR_PANEL);
        artPlaceholder.setCornerRadius(dp(28));
        artPlaceholder.setStroke(dp(1), MozaikThemeManager.COLOR_BORDER);
        artworkImageView.setBackground(artPlaceholder);

        LinearLayout.LayoutParams artLp = new LinearLayout.LayoutParams(dp(280), dp(280));
        artLp.gravity = Gravity.CENTER_HORIZONTAL;
        artLp.bottomMargin = dp(28);
        contentLayout.addView(artworkImageView, artLp);

        // 3. Метаданные трека
        titleTextView = new TextView(context);
        titleTextView.setTextColor(MozaikThemeManager.COLOR_INK);
        titleTextView.setTextSize(20);
        titleTextView.setTypeface(null, android.graphics.Typeface.BOLD);
        titleTextView.setText("kGram Track");
        titleTextView.setSingleLine(true);
        titleTextView.setGravity(Gravity.CENTER);
        contentLayout.addView(titleTextView);

        artistTextView = new TextView(context);
        artistTextView.setTextColor(MozaikThemeManager.COLOR_LAVENDER);
        artistTextView.setTextSize(14);
        artistTextView.setText("RX Playa Audio");
        artistTextView.setSingleLine(true);
        artistTextView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams artistLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        artistLp.topMargin = dp(6);
        artistLp.bottomMargin = dp(24);
        contentLayout.addView(artistTextView, artistLp);

        // 4. Тонкий прогресс-бар трека с лавандовой заливкой
        progressBar = new SeekBar(context);
        progressBar.setMax(1000);
        applyProgressColors();
        progressBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser && listener != null) {
                    listener.onSeekTo(progress / 1000.0f);
                }
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        contentLayout.addView(progressBar);

        // Временные метки
        LinearLayout timeRow = new LinearLayout(context);
        timeRow.setOrientation(LinearLayout.HORIZONTAL);
        timeRow.setPadding(dp(8), dp(4), dp(8), dp(16));

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

        // 5. Органы управления в стиле Material You 3 (капсулы 999px)
        LinearLayout controlsLayout = new LinearLayout(context);
        controlsLayout.setOrientation(LinearLayout.HORIZONTAL);
        controlsLayout.setGravity(Gravity.CENTER);

        // Prev Button
        prevButton = createControlButton(dp(22), v -> {
            triggerHaptic();
            if (listener != null) listener.onPreviousTrack();
        });
        drawPrevIcon(prevButton);
        controlsLayout.addView(prevButton, new LinearLayout.LayoutParams(dp(48), dp(48)));

        // Central Play/Pause Capsule
        playPauseContainer = new FrameLayout(context);
        GradientDrawable playBg = new GradientDrawable();
        playBg.setColor(MozaikThemeManager.COLOR_LAVENDER);
        playBg.setCornerRadius(dp(28));
        playPauseContainer.setBackground(playBg);
        playPauseContainer.setOnClickListener(v -> {
            triggerHaptic();
            if (listener != null) listener.onPlayPauseToggle();
        });

        playPauseIcon = new ImageView(context);
        updatePlayPauseVisual(isPlaying);
        FrameLayout.LayoutParams iconLp = new FrameLayout.LayoutParams(dp(24), dp(24));
        iconLp.gravity = Gravity.CENTER;
        playPauseContainer.addView(playPauseIcon, iconLp);

        LinearLayout.LayoutParams playLp = new LinearLayout.LayoutParams(dp(64), dp(64));
        playLp.setMargins(dp(24), 0, dp(24), 0);
        controlsLayout.addView(playPauseContainer, playLp);

        // Next Button
        nextButton = createControlButton(dp(22), v -> {
            triggerHaptic();
            if (listener != null) listener.onNextTrack();
        });
        drawNextIcon(nextButton);
        controlsLayout.addView(nextButton, new LinearLayout.LayoutParams(dp(48), dp(48)));

        contentLayout.addView(controlsLayout);
        addView(contentLayout);
    }

    private ImageView createControlButton(int iconSize, OnClickListener clickListener) {
        ImageView btn = new ImageView(getContext());
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(MozaikThemeManager.COLOR_PANEL);
        bg.setCornerRadius(dp(24));
        bg.setStroke(dp(1), MozaikThemeManager.COLOR_BORDER);
        btn.setBackground(bg);
        btn.setScaleType(ImageView.ScaleType.CENTER);
        btn.setOnClickListener(clickListener);
        return btn;
    }

    private void applyProgressColors() {
        if (Build.VERSION.SDK_INT >= 29) {
            progressBar.setProgressTintBlendMode(android.graphics.BlendMode.SRC_IN);
        }
    }

    private void updatePlayPauseVisual(boolean playing) {
        // Отрисовка векторной иконки Play или Pause
        Bitmap bmp = Bitmap.createBitmap(dp(24), dp(24), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(MozaikThemeManager.COLOR_BG_ONYX);

        float w = dp(24);
        float h = dp(24);

        if (playing) {
            // Две полоски Pause
            float barW = w * 0.22f;
            float barH = h * 0.65f;
            float top = h * 0.175f;
            canvas.drawRoundRect(new RectF(w * 0.22f, top, w * 0.22f + barW, top + barH), dp(2), dp(2), p);
            canvas.drawRoundRect(new RectF(w * 0.56f, top, w * 0.56f + barW, top + barH), dp(2), dp(2), p);
        } else {
            // Треугольник Play
            Path path = new Path();
            path.moveTo(w * 0.30f, h * 0.18f);
            path.lineTo(w * 0.78f, h * 0.50f);
            path.lineTo(w * 0.30f, h * 0.82f);
            path.close();
            canvas.drawPath(path, p);
        }
        playPauseIcon.setImageBitmap(bmp);
    }

    private void drawPrevIcon(ImageView iv) {
        Bitmap bmp = Bitmap.createBitmap(dp(22), dp(22), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(MozaikThemeManager.COLOR_INK);

        float w = dp(22);
        float h = dp(22);

        // Линия стопа слева
        canvas.drawRoundRect(new RectF(w * 0.15f, h * 0.20f, w * 0.25f, h * 0.80f), dp(1), dp(1), p);

        // Стрелка влево
        Path path = new Path();
        path.moveTo(w * 0.78f, h * 0.20f);
        path.lineTo(w * 0.32f, h * 0.50f);
        path.lineTo(w * 0.78f, h * 0.80f);
        path.close();
        canvas.drawPath(path, p);
        iv.setImageBitmap(bmp);
    }

    private void drawNextIcon(ImageView iv) {
        Bitmap bmp = Bitmap.createBitmap(dp(22), dp(22), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(MozaikThemeManager.COLOR_INK);

        float w = dp(22);
        float h = dp(22);

        // Стрелка вправо
        Path path = new Path();
        path.moveTo(w * 0.22f, h * 0.20f);
        path.lineTo(w * 0.68f, h * 0.50f);
        path.lineTo(w * 0.22f, h * 0.80f);
        path.close();
        canvas.drawPath(path, p);

        // Линия стопа справа
        canvas.drawRoundRect(new RectF(w * 0.75f, h * 0.20f, w * 0.85f, h * 0.80f), dp(1), dp(1), p);
        iv.setImageBitmap(bmp);
    }

    private void triggerHaptic() {
        performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
    }

    public void setPlaybackListener(PlaybackListener listener) {
        this.listener = listener;
    }

    public void setTrackInfo(String title, String artist, int durationSeconds, Bitmap artwork) {
        titleTextView.setText(title != null ? title : "kGram Audio");
        artistTextView.setText(artist != null ? artist : "by kipsway");
        totalTimeText.setText(formatTime(durationSeconds));
        if (artwork != null) {
            artworkImageView.setImageBitmap(artwork);
        }
    }

    public void setProgress(float fraction, int currentSeconds) {
        progressBar.setProgress((int) (fraction * 1000));
        currentTimeText.setText(formatTime(currentSeconds));
    }

    public void setPlaying(boolean playing) {
        this.isPlaying = playing;
        updatePlayPauseVisual(playing);
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
