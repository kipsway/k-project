import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'core/theme/k_colors.dart';
import 'features/stream/presentation/stream_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Настройка системных баров под темную тему оникса
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: KColors.bg,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  runApp(const KWitchApp());
}

class KWitchApp extends StatelessWidget {
  const KWitchApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'kWitch',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: KColors.bg,
        colorScheme: const ColorScheme.dark(
          primary: KColors.lav,
          onPrimary: KColors.bg,
          surface: KColors.panel,
          onSurface: KColors.ink,
          background: KColors.bg,
          onBackground: KColors.ink,
        ),
      ),
      home: const StreamScreen(
        streamerName: 'buda',
        categoryName: 'Just Chatting',
        initialViewers: 42890,
      ),
    );
  }
}
