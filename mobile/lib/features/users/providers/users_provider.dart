import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/users_repository.dart';

final myProfileProvider = FutureProvider<Map<String, dynamic>>((ref) {
  return UsersRepository().getMe();
});
