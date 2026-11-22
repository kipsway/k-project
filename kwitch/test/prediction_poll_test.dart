import 'package:flutter_test/flutter_test.dart';
import 'package:kwitch/features/chat/domain/models/twitch_prediction_poll.dart';
import 'package:kwitch/features/chat/domain/services/twitch_prediction_service.dart';

void main() {
  group('TwitchPredictionService & Models Tests', () {
    late TwitchPredictionService service;

    setUp(() {
      service = TwitchPredictionService();
    });

    tearDown(() {
      service.dispose();
    });

    test('Initial prediction is correctly configured', () {
      final pred = service.currentPrediction.value;
      expect(pred, isNotNull);
      expect(pred!.title, 'Выиграет ли стример эту катку?');
      expect(pred.status, PredictionStatus.active);
      expect(pred.outcomes.length, 2);
      expect(pred.remainingSeconds, 95);
      expect(pred.isUserParticipating, isFalse);
    });

    test('Percentage and ratio calculations are accurate', () {
      final pred = service.currentPrediction.value!;
      final percentYes = pred.getOutcomePercentage('out_yes');
      final percentNo = pred.getOutcomePercentage('out_no');

      expect(percentYes, greaterThan(0.6));
      expect(percentYes, lessThan(0.75));
      expect(percentNo, greaterThan(0.25));
      expect(percentNo, lessThan(0.4));
      expect((percentYes + percentNo), closeTo(1.0, 0.01));
    });

    test('Placing a valid prediction bet deducts points and updates totals', () {
      final initialBalance = service.userChannelPoints.value;
      const betPoints = 500;

      final success = service.placePredictionBet('out_yes', betPoints);
      expect(success, isTrue);

      // Проверка списания баллов
      expect(service.userChannelPoints.value, initialBalance - betPoints);

      // Проверка обновления состояния предикшена
      final updatedPred = service.currentPrediction.value!;
      expect(updatedPred.userVotedOutcomeId, 'out_yes');
      expect(updatedPred.userVotedPoints, betPoints);
      expect(updatedPred.isUserParticipating, isTrue);

      final outcomeYes = updatedPred.outcomes.firstWhere((o) => o.id == 'out_yes');
      expect(outcomeYes.totalPoints, 1254000 + betPoints);
    });

    test('Placing an invalid bet (more than balance or negative) fails gracefully', () {
      final tooBigBet = service.userChannelPoints.value + 10000;
      final fail1 = service.placePredictionBet('out_yes', tooBigBet);
      expect(fail1, isFalse);

      final fail2 = service.placePredictionBet('out_yes', -50);
      expect(fail2, isFalse);

      final fail3 = service.placePredictionBet('out_yes', 0);
      expect(fail3, isFalse);
    });

    test('Toggling collapse and dismissal works correctly', () {
      expect(service.isCollapsed.value, isFalse);
      service.toggleCollapse();
      expect(service.isCollapsed.value, isTrue);
      service.toggleCollapse();
      expect(service.isCollapsed.value, isFalse);

      expect(service.isVisible.value, isTrue);
      service.dismiss();
      expect(service.isVisible.value, isFalse);
    });

    test('Starting a new prediction replaces current and resets participation', () {
      service.startNewPrediction(
        title: 'Убьет ли Рошана до 20 минуты?',
        outcome1Title: 'Да, изи',
        outcome2Title: 'Нет, закинут',
        durationSeconds: 180,
      );

      final pred = service.currentPrediction.value!;
      expect(pred.title, 'Убьет ли Рошана до 20 минуты?');
      expect(pred.remainingSeconds, 180);
      expect(pred.userVotedOutcomeId, isNull);
      expect(pred.isUserParticipating, isFalse);
    });

    test('Resolving a prediction locks and declares winner', () {
      service.resolvePrediction('out_yes');

      final pred = service.currentPrediction.value!;
      expect(pred.status, PredictionStatus.resolved);
      expect(pred.winningOutcomeId, 'out_yes');
      expect(pred.remainingSeconds, 0);

      // Нельзя ставить на завершенный предикшен
      final betAttempt = service.placePredictionBet('out_yes', 100);
      expect(betAttempt, isFalse);
    });

    test('Poll voting registers once per user', () {
      service.currentPoll.value = const TwitchPoll(
        id: 'poll_hero_1',
        title: 'Какого героя пикать следующим?',
        channelLogin: 'stray228',
        status: PollStatus.active,
        remainingSeconds: 60,
        totalVotes: 100,
        choices: [
          PollChoice(id: 'c1', title: 'Invoker', votes: 60),
          PollChoice(id: 'c2', title: 'Pudge', votes: 40),
        ],
      );

      final voted = service.votePoll('c2');
      expect(voted, isTrue);
      expect(service.currentPoll.value!.totalVotes, 101);
      expect(service.currentPoll.value!.userVotedChoiceId, 'c2');

      // Повторное голосование должно отклоняться
      final secondVote = service.votePoll('c1');
      expect(secondVote, isFalse);
    });
  });
}
