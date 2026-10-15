import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/auth_repository.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../core/services/fcm_service.dart';

// ─── Auth state ───────────────────────────────────────────────────────────────

enum AuthStatus { initial, authenticated, unauthenticated }

class AuthState {
  final AuthStatus status;
  final String? userId;
  final bool profileComplete;
  final String? error;

  const AuthState({
    this.status = AuthStatus.initial,
    this.userId,
    this.profileComplete = false,
    this.error,
  });

  AuthState copyWith({
    AuthStatus? status,
    String? userId,
    bool? profileComplete,
    String? error,
  }) =>
      AuthState(
        status: status ?? this.status,
        userId: userId ?? this.userId,
        profileComplete: profileComplete ?? this.profileComplete,
        error: error,
      );
}

// ─── Providers ────────────────────────────────────────────────────────────────

final authRepositoryProvider = Provider((_) => AuthRepository());

final firebaseAuthProvider = Provider((_) => FirebaseAuth.instance);

/// Tracks the Firebase auth stream — rebuilds on sign in / sign out
final firebaseUserProvider = StreamProvider<User?>(
  (ref) => ref.watch(firebaseAuthProvider).authStateChanges(),
);

// ─── Auth Notifier ────────────────────────────────────────────────────────────

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthRepository _repo;

  AuthNotifier(this._repo) : super(const AuthState());

  /// After Firebase OTP is verified on device, sync with backend.
  /// Also registers the FCM token with the backend (best-effort).
  Future<void> syncWithBackend(String idToken) async {
    try {
      final result = await _repo.verifyWithBackend(idToken: idToken);
      final userId = result['userId'] as String;
      final profileComplete = result['profileComplete'] as bool? ?? false;

      await SecureStorage.saveUserId(userId);

      state = state.copyWith(
        status: AuthStatus.authenticated,
        userId: userId,
        profileComplete: profileComplete,
      );

      // Register FCM token after backend auth succeeds so the API client
      // sends the Firebase ID token in the Authorization header.
      FcmService.instance.registerToken();
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        error: 'Could not connect to Weekender. Try again.',
      );
    }
  }

  Future<void> signOut() async {
    try {
      await _repo.logout();
    } catch (_) {}
    await FirebaseAuth.instance.signOut();
    await SecureStorage.clear();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}

final authNotifierProvider = StateNotifierProvider<AuthNotifier, AuthState>(
  (ref) => AuthNotifier(ref.watch(authRepositoryProvider)),
);
