import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/twitch_prediction_poll.dart';

/// Сервис управления ставками (Channel Points Predictions) и опросами (Polls).
class TwitchPredictionService {
  final ValueNotifier<TwitchPrediction?> currentPrediction = ValueNotifier(null);
  final ValueNotifier<TwitchPoll?> currentPoll = ValueNotifier(null);
  final ValueNotifier<bool> isCollapsed = ValueNotifier(false);
  final ValueNotifier<bool> isVisible = ValueNotifier(true);
  final ValueNotifier<int> userChannelPoints = ValueNotifier(48500);

  Timer? _tickerTimer;

  TwitchPredictionService() {
    // Запускаем начальный демонстрационный интерактив
    _initDefaultPrediction();
  }

  void _initDefaultPrediction() {
    currentPrediction.value = const TwitchPrediction(
      id: 'pred_dota_final_1',
      title: 'Выиграет ли стример эту катку?',
      channelLogin: 'stray228',
      status: PredictionStatus.active,
      totalPoints: 1845000,
      remainingSeconds: 95,
      outcomes: [
        PredictionOutcome(
          id: 'out_yes',
          title: 'Да, победа (EZ)',
          totalPoints: 1254000,
          totalUsers: 842,
          ratio: 1.47,
          colorHex: 0xFFB8A7F0, // Лаванда Мозаика
        ),
        PredictionOutcome(
          id: 'out_no',
          title: 'Нет, луз (-25)',
          totalPoints: 591000,
          totalUsers: 418,
          ratio: 3.12,
          colorHex: 0xFF7E6FC4, // Фиолетовый акцент
        ),
      ],
    );

    _startTicker();
  }

  void _startTicker() {
    _tickerTimer?.cancel();
    _tickerTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      final pred = currentPrediction.value;
      if (pred != null && pred.status == PredictionStatus.active) {
        if (pred.remainingSeconds > 1) {
          currentPrediction.value = pred.copyWith(
            remainingSeconds: pred.remainingSeconds - 1,
          );
        } else {
          currentPrediction.value = pred.copyWith(
            remainingSeconds: 0,
            status: PredictionStatus.locked,
          );
        }
      }

      final poll = currentPoll.value;
      if (poll != null && poll.status == PollStatus.active) {
        if (poll.remainingSeconds > 1) {
          currentPoll.value = poll.copyWith(
            remainingSeconds: poll.remainingSeconds - 1,
          );
        } else {
          currentPoll.value = poll.copyWith(
            remainingSeconds: 0,
            status: PollStatus.completed,
          );
        }
      }
    });
  }

  /// Сделать ставку баллами канала
  bool placePredictionBet(String outcomeId, int points) {
    final pred = currentPrediction.value;
    if (pred == null || pred.status != PredictionStatus.active) return false;
    if (points <= 0 || points > userChannelPoints.value) return false;

    userChannelPoints.value -= points;

    final updatedOutcomes = pred.outcomes.map((outcome) {
      if (outcome.id == outcomeId) {
        final newPoints = outcome.totalPoints + points;
        final newUsers = outcome.totalUsers + (pred.userVotedOutcomeId == null ? 1 : 0);
        return outcome.copyWith(
          totalPoints: newPoints,
          totalUsers: newUsers,
        );
      }
      return outcome;
    }).toList();

    currentPrediction.value = pred.copyWith(
      outcomes: updatedOutcomes,
      totalPoints: pred.totalPoints + points,
      userVotedOutcomeId: outcomeId,
      userVotedPoints: (pred.userVotedPoints) + points,
    );

    return true;
  }

  /// Проголосовать в опросе
  bool votePoll(String choiceId) {
    final poll = currentPoll.value;
    if (poll == null || poll.status != PollStatus.active) return false;
    if (poll.userVotedChoiceId != null) return false;

    final updatedChoices = poll.choices.map((choice) {
      if (choice.id == choiceId) {
        return choice.copyWith(votes: choice.votes + 1);
      }
      return choice;
    }).toList();

    currentPoll.value = poll.copyWith(
      choices: updatedChoices,
      totalVotes: poll.totalVotes + 1,
      userVotedChoiceId: choiceId,
    );

    return true;
  }

  /// Свернуть / Развернуть баннер в компактную капсулу
  void toggleCollapse() {
    isCollapsed.value = !isCollapsed.value;
  }

  /// Скрыть баннер
  void dismiss() {
    isVisible.value = false;
  }

  /// Запуск нового предикшена
  void startNewPrediction({
    required String title,
    required String outcome1Title,
    required String outcome2Title,
    int durationSeconds = 120,
  }) {
    currentPrediction.value = TwitchPrediction(
      id: 'pred_${DateTime.now().millisecondsSinceEpoch}',
      title: title,
      channelLogin: 'streamer',
      status: PredictionStatus.active,
      totalPoints: 10000,
      remainingSeconds: durationSeconds,
      outcomes: [
        PredictionOutcome(
          id: 'out_1',
          title: outcome1Title,
          totalPoints: 5000,
          totalUsers: 10,
          ratio: 2.0,
          colorHex: 0xFFB8A7F0,
        ),
        PredictionOutcome(
          id: 'out_2',
          title: outcome2Title,
          totalPoints: 5000,
          totalUsers: 10,
          ratio: 2.0,
          colorHex: 0xFF7E6FC4,
        ),
      ],
    );
    isVisible.value = true;
    isCollapsed.value = false;
    _startTicker();
  }

  /// Завершить предикшен победой конкретного исхода
  void resolvePrediction(String winningOutcomeId) {
    final pred = currentPrediction.value;
    if (pred == null) return;
    currentPrediction.value = pred.copyWith(
      status: PredictionStatus.resolved,
      winningOutcomeId: winningOutcomeId,
      remainingSeconds: 0,
    );
  }

  void dispose() {
    _tickerTimer?.cancel();
    currentPrediction.dispose();
    currentPoll.dispose();
    isCollapsed.dispose();
    isVisible.dispose();
    userChannelPoints.dispose();
  }
}
