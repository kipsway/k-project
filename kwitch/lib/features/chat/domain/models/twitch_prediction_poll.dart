/// Модели данных для предикшенов (ставок на баллы канала) и опросов Twitch.

enum PredictionStatus {
  active,
  locked,
  resolved,
  cancelled,
}

enum PollStatus {
  active,
  completed,
}

class PredictionOutcome {
  final String id;
  final String title;
  final int totalPoints;
  final int totalUsers;
  final double ratio; // Множитель коэффициента (например, 1.45)
  final int colorHex;

  const PredictionOutcome({
    required this.id,
    required this.title,
    required this.totalPoints,
    required this.totalUsers,
    required this.ratio,
    this.colorHex = 0xFFB8A7F0,
  });

  PredictionOutcome copyWith({
    String? id,
    String? title,
    int? totalPoints,
    int? totalUsers,
    double? ratio,
    int? colorHex,
  }) {
    return PredictionOutcome(
      id: id ?? this.id,
      title: title ?? this.title,
      totalPoints: totalPoints ?? this.totalPoints,
      totalUsers: totalUsers ?? this.totalUsers,
      ratio: ratio ?? this.ratio,
      colorHex: colorHex ?? this.colorHex,
    );
  }
}

class TwitchPrediction {
  final String id;
  final String title;
  final String channelLogin;
  final PredictionStatus status;
  final List<PredictionOutcome> outcomes;
  final int totalPoints;
  final int remainingSeconds;
  final String? winningOutcomeId;
  final String? userVotedOutcomeId;
  final int userVotedPoints;

  const TwitchPrediction({
    required this.id,
    required this.title,
    required this.channelLogin,
    required this.status,
    required this.outcomes,
    required this.totalPoints,
    required this.remainingSeconds,
    this.winningOutcomeId,
    this.userVotedOutcomeId,
    this.userVotedPoints = 0,
  });

  bool get isUserParticipating => userVotedOutcomeId != null && userVotedPoints > 0;

  double getOutcomePercentage(String outcomeId) {
    if (totalPoints == 0) return 0.0;
    final outcome = outcomes.firstWhere(
      (o) => o.id == outcomeId,
      orElse: () => const PredictionOutcome(id: '', title: '', totalPoints: 0, totalUsers: 0, ratio: 1.0),
    );
    return (outcome.totalPoints / totalPoints).clamp(0.0, 1.0);
  }

  TwitchPrediction copyWith({
    String? id,
    String? title,
    String? channelLogin,
    PredictionStatus? status,
    List<PredictionOutcome>? outcomes,
    int? totalPoints,
    int? remainingSeconds,
    String? winningOutcomeId,
    String? userVotedOutcomeId,
    int? userVotedPoints,
  }) {
    return TwitchPrediction(
      id: id ?? this.id,
      title: title ?? this.title,
      channelLogin: channelLogin ?? this.channelLogin,
      status: status ?? this.status,
      outcomes: outcomes ?? this.outcomes,
      totalPoints: totalPoints ?? this.totalPoints,
      remainingSeconds: remainingSeconds ?? this.remainingSeconds,
      winningOutcomeId: winningOutcomeId ?? this.winningOutcomeId,
      userVotedOutcomeId: userVotedOutcomeId ?? this.userVotedOutcomeId,
      userVotedPoints: userVotedPoints ?? this.userVotedPoints,
    );
  }
}

class PollChoice {
  final String id;
  final String title;
  final int votes;

  const PollChoice({
    required this.id,
    required this.title,
    required this.votes,
  });

  PollChoice copyWith({
    String? id,
    String? title,
    int? votes,
  }) {
    return PollChoice(
      id: id ?? this.id,
      title: title ?? this.title,
      votes: votes ?? this.votes,
    );
  }
}

class TwitchPoll {
  final String id;
  final String title;
  final String channelLogin;
  final PollStatus status;
  final List<PollChoice> choices;
  final int totalVotes;
  final int remainingSeconds;
  final String? userVotedChoiceId;

  const TwitchPoll({
    required this.id,
    required this.title,
    required this.channelLogin,
    required this.status,
    required this.choices,
    required this.totalVotes,
    required this.remainingSeconds,
    this.userVotedChoiceId,
  });

  double getChoicePercentage(String choiceId) {
    if (totalVotes == 0) return 0.0;
    final choice = choices.firstWhere(
      (c) => c.id == choiceId,
      orElse: () => const PollChoice(id: '', title: '', votes: 0),
    );
    return (choice.votes / totalVotes).clamp(0.0, 1.0);
  }

  TwitchPoll copyWith({
    String? id,
    String? title,
    String? channelLogin,
    PollStatus? status,
    List<PollChoice>? choices,
    int? totalVotes,
    int? remainingSeconds,
    String? userVotedChoiceId,
  }) {
    return TwitchPoll(
      id: id ?? this.id,
      title: title ?? this.title,
      channelLogin: channelLogin ?? this.channelLogin,
      status: status ?? this.status,
      choices: choices ?? this.choices,
      totalVotes: totalVotes ?? this.totalVotes,
      remainingSeconds: remainingSeconds ?? this.remainingSeconds,
      userVotedChoiceId: userVotedChoiceId ?? this.userVotedChoiceId,
    );
  }
}
