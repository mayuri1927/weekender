import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/cities_repository.dart';

final citiesRepositoryProvider = Provider((_) => CitiesRepository());

final citiesProvider = FutureProvider<List<Map<String, dynamic>>>((ref) {
  return ref.watch(citiesRepositoryProvider).getCities();
});

final areasProvider = FutureProvider.family<List<Map<String, dynamic>>, String>(
  (ref, cityId) => ref.watch(citiesRepositoryProvider).getAreas(cityId),
);
