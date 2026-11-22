import 'package:flutter_test/flutter_test.dart';
import 'package:kwitch/features/chat/domain/models/chat_command_item.dart';
import 'package:kwitch/features/chat/domain/services/chat_command_service.dart';

void main() {
  group('ChatCommandService & Macro Engine Tests', () {
    late ChatCommandService service;

    setUp(() {
      service = ChatCommandService();
    });

    test('Default Chatterino+ commands are initialized', () {
      final commands = service.commands;
      expect(commands.isNotEmpty, isTrue);

      final triggers = commands.map((c) => c.trigger).toList();
      expect(triggers, contains('/shrug'));
      expect(triggers, contains('/flip'));
      expect(triggers, contains('/unflip'));
      expect(triggers, contains('/clear'));
      expect(triggers, contains('/me'));
      expect(triggers, contains('/gg'));
      expect(triggers, contains('/pepel'));
    });

    test('Macro replacement converts /shrug into kaomoji', () {
      final output1 = service.processInput('/shrug');
      expect(output1, '¯\\_(ツ)_/¯');

      final output2 = service.processInput('Ну и ладно /shrug');
      expect(output2, 'Ну и ладно ¯\\_(ツ)_/¯');

      final output3 = service.processInput('/flip rage quit');
      expect(output3, '(╯°□°)╯︵ ┻━┻ rage quit');
    });

    test('Regular message without macros remains intact', () {
      const normal = 'Привет всем в чате! PogChamp';
      expect(service.processInput(normal), normal);
    });

    test('Search filters commands by trigger and description', () {
      final searchResults1 = service.search('shrug');
      expect(searchResults1.length, 1);
      expect(searchResults1.first.trigger, '/shrug');

      final searchResults2 = service.search('стол');
      expect(searchResults2.any((c) => c.trigger == '/flip'), isTrue);
      expect(searchResults2.any((c) => c.trigger == '/unflip'), isTrue);
    });

    test('Category filtering segregates fun and moderation commands', () {
      final funCommands = service.getByCategory(CommandCategory.fun);
      expect(funCommands.any((c) => c.trigger == '/shrug'), isTrue);
      expect(funCommands.any((c) => c.trigger == '/clear'), isFalse);

      final modCommands = service.getByCategory(CommandCategory.moderation);
      expect(modCommands.any((c) => c.trigger == '/clear'), isTrue);
    });

    test('Custom macro can be added, executed and removed', () {
      service.addCustomMacro(
        trigger: '/ez',
        title: 'Easy Peasy',
        output: 'EZ Clap GG',
      );

      final commands = service.commands;
      expect(commands.any((c) => c.trigger == '/ez'), isTrue);

      final replaced = service.processInput('/ez');
      expect(replaced, 'EZ Clap GG');

      // Удаление макроса
      service.removeCustomMacro('/ez');
      expect(service.commands.any((c) => c.trigger == '/ez'), isFalse);
    });
  });
}
