.class public Lcom/kipsway/ktok/KTokHook;
.super Ljava/lang/Object;
.source "KTokHook.java"

# static fields
.field private static final PREF_NAME:Ljava/lang/String; = "ktok_preferences"
.field private static final KEY_REGION:Ljava/lang/String; = "ktok_selected_region"
.field private static final DEFAULT_REGION:Ljava/lang/String; = "US"

# direct methods
.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    return-void
.end method

# Хук TelephonyManager.getSimCountryIso() и getNetworkCountryIso()
.method public static getRegion(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;
    .registers 4

    if-nez p0, :cond_5
    return-object p1

    :cond_5
    :try_start_5
    const-string v0, "ktok_preferences"
    const/4 v1, 0x0
    invoke-virtual {p0, v0, v1}, Landroid/content/Context;->getSharedPreferences(Ljava/lang/String;I)Landroid/content/SharedPreferences;
    move-result-object p0

    const-string v0, "ktok_selected_region"
    const-string v1, "US"
    invoke-interface {p0, v0, v1}, Landroid/content/SharedPreferences;->getString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    move-result-object p0
    :try_end_14
    .catchall {:try_start_5 .. :try_end_14} :catchall_15

    return-object p0

    :catchall_15
    return-object p1
.end method

# Хук проверки рекламы (вызывается в Aweme.isAd())
# Всегда возвращает 0 (false), принудительно скрывая статус рекламного ролика
.method public static isAdHook(Z)Z
    .registers 1
    const/4 p0, 0x0
    return p0
.end method

# Хук получения ссылки видео: подменяет download_addr на чистый play_addr
.method public static getCleanVideoUrl(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    .registers 3
    # p0: original download_addr
    # p1: clean play_addr
    if-eqz p1, :cond_8
    invoke-virtual {p1}, Ljava/lang/String;->isEmpty()Z
    move-result v0
    if-nez v0, :cond_8
    return-object p1

    :cond_8
    return-object p0
.end method
