import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../features/auth/screens/phone_entry_screen.dart';
import '../../features/auth/screens/otp_screen.dart';
import '../../features/onboarding/screens/dob_screen.dart';
import '../../features/onboarding/screens/complete_profile_screen.dart';
import '../../features/onboarding/screens/select_city_screen.dart';
import '../../features/onboarding/screens/select_area_screen.dart';
import '../../features/onboarding/screens/select_interests_screen.dart';
import '../../features/onboarding/screens/profile_photo_screen.dart';
import '../../features/activities/screens/activity_discovery_screen.dart';
import '../../features/activities/screens/activity_details_screen.dart';
import '../../features/activities/screens/create_activity_screen.dart';
import '../../features/activities/screens/chat_screen.dart';
import '../../shared/screens/splash_screen.dart';
import '../../shared/screens/home_shell_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/splash',
  redirect: _globalRedirect,
  routes: [
    GoRoute(
      path: '/splash',
      builder: (_, _) => const SplashScreen(),
    ),

    // ── Auth ───────────────────────────────────────────────────────────────────
    GoRoute(
      path: '/auth/phone',
      builder: (_, _) => const PhoneEntryScreen(),
    ),
    GoRoute(
      path: '/auth/otp',
      builder: (context, state) {
        final extra = state.extra as Map<String, dynamic>? ?? {};
        final phone = extra['phone'] as String? ?? '';
        return OtpScreen(phoneNumber: phone);
      },
    ),

    // ── Onboarding ─────────────────────────────────────────────────────────────
    GoRoute(
      path: '/onboarding/dob',
      builder: (_, _) => const DobScreen(),
    ),
    GoRoute(
      path: '/onboarding/profile',
      builder: (_, _) => const CompleteProfileScreen(),
    ),
    GoRoute(
      path: '/onboarding/city',
      builder: (_, _) => const SelectCityScreen(),
    ),
    GoRoute(
      path: '/onboarding/area',
      builder: (context, state) {
        final extra = state.extra as Map<String, dynamic>? ?? {};
        final cityId = extra['cityId'] as String? ?? '';
        return SelectAreaScreen(cityId: cityId);
      },
    ),
    GoRoute(
      path: '/onboarding/interests',
      builder: (_, _) => const SelectInterestsScreen(),
    ),
    GoRoute(
      path: '/onboarding/photo',
      builder: (_, _) => const ProfilePhotoScreen(),
    ),

    // ── Home ───────────────────────────────────────────────────────────────────
    GoRoute(
      path: '/home',
      builder: (_, _) => const HomeShellScreen(),
    ),

    // ── Activities ─────────────────────────────────────────────────────────────
    GoRoute(
      path: '/activities',
      builder: (_, _) => const ActivityDiscoveryScreen(),
    ),
    GoRoute(
      path: '/activities/create',
      builder: (_, _) => const CreateActivityScreen(),
    ),
    GoRoute(
      path: '/activities/:id',
      builder: (context, state) {
        final id = state.pathParameters['id']!;
        return ActivityDetailsScreen(activityId: id);
      },
    ),
    // Phase 5: group chat screen — only reachable by eligible users
    GoRoute(
      path: '/activities/:id/chat',
      builder: (context, state) {
        final id = state.pathParameters['id']!;
        final extra = state.extra as Map<String, dynamic>? ?? {};
        final title = extra['title'] as String? ?? 'Group Chat';
        return ChatScreen(activityId: id, activityTitle: title);
      },
    ),
  ],
);

String? _globalRedirect(BuildContext context, GoRouterState state) {
  final isLoggedIn = FirebaseAuth.instance.currentUser != null;
  final isSplash = state.matchedLocation == '/splash';
  final isAuth = state.matchedLocation.startsWith('/auth');

  if (isSplash) return null; // Splash handles its own redirect
  if (!isLoggedIn && !isAuth) return '/auth/phone';
  return null;
}
