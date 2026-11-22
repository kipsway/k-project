import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kstore/models/mod_item.dart';
import 'package:kstore/widgets/floating_dock.dart';
import 'package:kstore/widgets/floating_progress_bar.dart';
import 'package:kstore/widgets/glass_container.dart';
import 'package:kstore/widgets/mod_card.dart';

void main() {
  group('kStore UI & Widgets Tests', () {
    testWidgets('GlassContainer renders child with backdrop filter', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: GlassContainer(
              radius: 24.0,
              child: Text('Liquid Glass Content'),
            ),
          ),
        ),
      );

      expect(find.text('Liquid Glass Content'), findsOneWidget);
      expect(find.byType(BackdropFilter), findsOneWidget);
    });

    testWidgets('ModCard renders mod metadata and action button', (tester) async {
      const testMod = ModItem(
        id: 'ktok',
        name: 'kTok',
        author: 'by kipsway',
        description: 'Скачивание без водяного знака',
        version: '34.1.2',
        rating: 4.9,
        iconPath: 'assets/icons/ktok.png',
        apkUrl: 'https://example.com/ktok.apk',
        isInstalled: false,
        hasUpdate: false,
      );

      bool actionTapped = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ModCard(
              mod: testMod,
              onActionTap: () => actionTapped = true,
            ),
          ),
        ),
      );

      // Проверка наличия ключевых текстовых меток
      expect(find.text('kTok'), findsOneWidget);
      expect(find.text('by kipsway'), findsOneWidget);
      expect(find.text('v34.1.2'), findsOneWidget);
      expect(find.text('4.9'), findsOneWidget);
      expect(find.text('Установить'), findsOneWidget);

      // Проверка клика по кнопке действия
      await tester.tap(find.text('Установить'));
      await tester.pump();
      expect(actionTapped, isTrue);
    });

    testWidgets('FloatingProgressBar displays correct percentage and label', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: FloatingProgressBar(
              modName: 'kTube',
              progress: 0.65,
            ),
          ),
        ),
      );

      expect(find.text('Загрузка kTube: 65%'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
    });

    testWidgets('FloatingDock switches active tab on selection', (tester) async {
      int selected = 0;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: FloatingDock(
              selectedIndex: selected,
              onItemSelected: (index) => selected = index,
            ),
          ),
        ),
      );

      expect(find.text('Каталог'), findsOneWidget);
      expect(find.text('Загрузки'), findsNothing); // inactive tabs show only icon in compact dock

      // Клик по второй иконке (Загрузки)
      await tester.tap(find.byIcon(Icons.download_rounded));
      await tester.pump();
      expect(selected, 1);
    });
  });
}
