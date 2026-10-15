import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/interests_repository.dart';

final interestsRepositoryProvider = Provider((_) => InterestsRepository());

final interestCategoriesProvider =
    FutureProvider<List<Map<String, dynamic>>>((ref) {
  return ref.watch(interestsRepositoryProvider).getCategories();
});

final myInterestsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) {
  return ref.watch(interestsRepositoryProvider).getMyInterests();
});

class SelectedInterestsNotifier extends StateNotifier<Set<String>> {
  SelectedInterestsNotifier() : super({});

  void toggle(String id) {
    if (state.contains(id)) {
      state = {...state}..remove(id);
    } else {
      state = {...state, id};
    }
  }

  void setAll(Iterable<String> ids) {
    state = Set.from(ids);
  }
}

final selectedInterestsProvider =
    StateNotifierProvider<SelectedInterestsNotifier, Set<String>>(
  (_) => SelectedInterestsNotifier(),
);
