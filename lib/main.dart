import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/store_screen.dart';
import 'theme/colors.dart';
import 'theme/text_styles.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Настройка прозрачных системных панелей Android для бесшовного эффекта жидкого стекла (Edge-to-Edge)
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
      systemNavigationBarColor: Colors.transparent,
      systemNavigationBarDividerColor: Colors.transparent,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  // Включение сквозного отображения контента под системными барами
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

  runApp(const KStoreApp());
}

/// Корневой виджет магазина модов kStore (by kipsway)
class KStoreApp extends StatelessWidget {
  const KStoreApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'kStore',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: KColors.bg,
        canvasColor: KColors.bg,
        fontFamily: KTextStyles.fontFamily,
        colorScheme: const ColorScheme.dark(
          primary: KColors.lav,
          onPrimary: KColors.bg,
          surface: KColors.panel,
          onSurface: KColors.ink,
          outline: KColors.panelBorder,
        ),
        splashColor: KColors.lav.withOpacity(0.10),
        highlightColor: KColors.lav.withOpacity(0.04),
        hoverColor: Colors.transparent,
      ),
      home: const StoreScreen(),
    );
  }
}
