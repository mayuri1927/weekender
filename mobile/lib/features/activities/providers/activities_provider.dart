import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/activities_repository.dart';

final activitiesRepositoryProvider = Provider((_) => ActivitiesRepository());

class ActivityFilter {
  final String? cityId;
  final String? areaId;
  final String? category;
  final String? fromDate;
  final String? toDate;
  final int page;

  const ActivityFilter({
    this.cityId,
    this.areaId,
    this.category,
    this.fromDate,
    this.toDate,
    this.page = 1,
  });

  ActivityFilter copyWith({
    String? cityId,
    String? areaId,
    String? category,
    String? fromDate,
    String? toDate,
    int? page,
  }) =>
      ActivityFilter(
        cityId: cityId ?? this.cityId,
        areaId: areaId ?? this.areaId,
        category: category ?? this.category,
        fromDate: fromDate ?? this.fromDate,
        toDate: toDate ?? this.toDate,
        page: page ?? this.page,
      );
}

final activityFilterProvider =
    StateProvider<ActivityFilter>((_) => const ActivityFilter());

final activitiesListProvider =
    FutureProvider<Map<String, dynamic>>((ref) {
  final repo = ref.watch(activitiesRepositoryProvider);
  final filter = ref.watch(activityFilterProvider);
  return repo.listActivities(
    cityId: filter.cityId,
    areaId: filter.areaId,
    category: filter.category,
    fromDate: filter.fromDate,
    toDate: filter.toDate,
    page: filter.page,
  );
});

final activityDetailProvider =
    FutureProvider.family<Map<String, dynamic>, String>((ref, id) {
  return ref.watch(activitiesRepositoryProvider).getActivity(id);
});

final participantsProvider =
    FutureProvider.family<List<dynamic>, String>((ref, activityId) {
  return ref.watch(activitiesRepositoryProvider).listParticipants(activityId);
});

// Phase 4: returns { groupEligible: bool, participantStatus: string? }
// Used to determine the correct join/leave/pending/rejected button state.
final groupEligibilityProvider =
    FutureProvider.family<Map<String, dynamic>, String>((ref, activityId) {
  return ref.watch(activitiesRepositoryProvider).getGroupEligibility(activityId);
});

// Phase 4: returns { matchScore: double, commonInterests: List }
final matchScoreProvider =
    FutureProvider.family<Map<String, dynamic>, String>((ref, activityId) {
  return ref.watch(activitiesRepositoryProvider).getMatch(activityId);
});

// Phase 5: returns { token, channelId, channelType, apiKey } from backend.
// Only fetched when groupEligible = true. The token is short-lived (24 h).
final chatTokenProvider =
    FutureProvider.family<Map<String, dynamic>, String>((ref, activityId) {
  return ref.watch(activitiesRepositoryProvider).getChatToken(activityId);
});
