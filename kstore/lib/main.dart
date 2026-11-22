import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/store_screen.dart';
import 'theme/colors.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Настройка системных панелей (прозрачный статус-бар, ониксовый NavigationBar)
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: KColors.bg,
      systemNavigationBarIconBrightness: Brightness.light,
      systemNavigationBarDividerColor: Colors.transparent,
    ),
  );

  runApp(const KStoreApp());
}

/// Точка входа в приложение kStore (by kipsway).
class KStoreApp extends StatelessWidget {
  const KStoreApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'kStore by kipsway',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.dark,
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: KColors.bg,
        fontFamily: 'Montserrat',
        colorScheme: const ColorScheme.dark(
          primary: KColors.lav,
          surface: KColors.panel,
          onPrimary: KColors.bg,
          onSurface: KColors.ink,
        ),
        splashColor: KColors.lav.withOpacity(0.08),
        highlightColor: KColors.lav.withOpacity(0.04),
      ),
      home: const StoreScreen(),
    );
  }
}
