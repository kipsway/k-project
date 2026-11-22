# 🏪 kStore Specification (Prompt Brief for Gemini 3.8 Flash)

## 🎯 Роль и задача
Ты — старший Flutter-разработчик и UI/UX-дизайнер. Мы разрабатываем **kStore** — минималистичный и ультра-стильный мобильный каталог и загрузчик модов для Android от автора **kipsway**.

## 🛑 Строгие ограничения (Чего делать НЕЛЬЗЯ)
- ❌ **Никаких верхних вкладок и фильтров** («Все», «Категории», «Топ») — каталог компактный, модов немного, экран должен быть монолитным и чистым.
- ❌ **Никаких ссылок на сторонние Telegram-каналы** или соцсети.
- ❌ **Никаких пестрых «ИИ»-градиентов и несогласованных иконок.** Только строгая сетка 8pt и единый стиль.
- ❌ **Никакого корпоративного робо-языка** (B2B, Enterprise, AI-driven). Только живой русский: «Установить», «Обновить», «Установлено», «by kipsway».
- ❌ **Не пиши огромные файлы.** Пиши строго по одному виджету/файлу за раз по шагам.

---

## 🎨 Дизайн-триумвират: «Жидкое стекло + Material You 3 + акценты Chatterino+»

1. **Жидкое стекло (Liquid Glass):**
   - Размытие заднего плана: `BackdropFilter` с `sigmaX: 24, sigmaY: 24`.
   - Градиентная верхняя рамка (линзовый блик): от `rgba(255,255,255,0.18)` сверху к `rgba(255,255,255,0.02)` снизу.
   - Парящий стеклянный док навигации и парящий бар загрузки.

2. **Material You 3 Expressive (M3):**
   - Большие скругления: карточки `24px` / `28px`, кнопки-капсулы `999px` (`StadiumBorder`).
   - Жирные заголовки шрифтом `Montserrat` (`FontWeight.w800`, плотный трекинг `-0.5`).

3. **Цветовая палитра из Chatterino+ (Дизайн-система «Мозаика» от Rish, chat.eblo.id):**
   - Исходные CSS-файлы лежат на диске: `C:\Users\ДДД\Desktop\s\chatterino_plus\page.css`.
   - Точные константы для Flutter:
```dart
import 'package:flutter/material.dart';

class KColors {
  static const bg = Color(0xFF0A0A0C);         // Глубокий оникс (фон)
  static const panel = Color(0xFF0F0F12);      // Карточки модов
  static const cellOff = Color(0xFF1C1B21);    // Вторичные подложки
  static const panelBorder = Color(0xFF2C2B32);// Тонкая рамка 1px
  static const ink = Color(0xFFECEBF1);        // Главный текст
  static const muted = Color(0xFF8D8A99);      // Второстепенный текст
  static const faint = Color(0xFF6F6C7A);      // Неактивные элементы
  static const lav = Color(0xFFB8A7F0);        // Лавандовый акцент (кнопки)
  static const lavInk = Color(0xFFD9CFFD);     // Светлая лаванда
  static const accBg = Color(0xFF2A2442);      // Подложка активной кнопки
  static const accBorder = Color(0xFF7E6FC4);  // Рамка активной кнопки
  static const green = Color(0xFF3FB950);      // Установлено
  static const red = Color(0xFFF24D5C);        // Ошибка
}
```

---

## 📦 Модель данных каталога (`ModItem`)
```dart
class ModItem {
  final String id;
  final String name;        // "kTok", "kGram", "kTube", "kWitch"
  final String author;      // "by kipsway"
  final String description; // Краткое описание в 2 строки
  final String version;     // "2.3.0"
  final double rating;      // 4.9
  final String iconUrl;     // Ассет иконки
  final String apkUrl;      // Ссылка на APK
  final bool isInstalled;
  final bool hasUpdate;
}
```

---

## 📱 Архитектура экрана
1. **Header:** 
   - Заголовок `kStore` жирным шрифтом `Montserrat` 28pt слева.
   - Справа две круглые стеклянные кнопки `24x24` иконки: Поиск (`LucideIcons.search`) и Настройки (`LucideIcons.settings`).
2. **Body:** 
   - `ListView.separated` с отступами `16px`.
   - Карточки модов `ModCard`.
3. **Floating Progress Bar (при активной загрузке):**
   - Парящая капсула из жидкого стекла прямо над доком: `[ ⬇ Загрузка kTok: 65% ]`.
4. **Floating Dock (Навбар):**
   - Парящий стеклянный док снизу со скруглением `32px` и 3 иконками (Каталог, Загрузки, Инфо).

---

## 🛠 Пошаговый план разработки (По одной задаче)
- **Шаг 1:** Файлы `theme/colors.dart` и `theme/text_styles.dart`.
- **Шаг 2:** Виджет `widgets/glass_container.dart` (жидкое стекло с блюром и градиентной рамкой).
- **Шаг 3:** Виджет карточки `widgets/mod_card.dart` с тактильной пружинной анимацией нажатия.
- **Шаг 4:** Главный экран `screens/store_screen.dart` с чистым списком и плавающим доком.
- **Шаг 5:** Сервис скачивания APK и вызова Android PackageInstaller.
