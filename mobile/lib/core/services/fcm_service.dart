import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import '../network/api_client.dart';

/// Top-level background message handler.
/// Must be a top-level function — no instance state or UI access.
@pragma('vm:entry-point')
Future<void> _onBackgroundMessage(RemoteMessage message) async {
  debugPrint('[FCM] Background message: ${message.messageId}');
}

/// Handles Firebase Cloud Messaging for the Weekender app.
///
/// Usage:
///   - Call [initialize] once at app startup (after Firebase.initializeApp).
///   - Call [registerToken] after the user authenticates or on token refresh.
///   - Foreground and tap messages are handled internally; extend
///     [_handleForeground] and [_handleTap] for deep-link navigation.
class FcmService {
  FcmService._();

  static final FcmService instance = FcmService._();

  final _messaging = FirebaseMessaging.instance;

  /// Requests notification permission and wires background/foreground handlers.
  /// Returns the current FCM token, or null if permission is denied.
  Future<String?> initialize() async {
    try {
      FirebaseMessaging.onBackgroundMessage(_onBackgroundMessage);

      final settings = await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        debugPrint('[FCM] Permission denied by user');
        return null;
      }

      FirebaseMessaging.onMessage.listen(_handleForeground);
      FirebaseMessaging.onMessageOpenedApp.listen(_handleTap);

      // On iOS, APNs token must be obtained before FCM token
      if (Platform.isIOS) {
        await _messaging.getAPNSToken();
      }

      final token = await _messaging.getToken();

      // Re-register whenever the token rotates
      _messaging.onTokenRefresh.listen((_) => registerToken());

      return token;
    } catch (e) {
      debugPrint('[FCM] initialize failed: $e');
      return null;
    }
  }

  /// Registers (or refreshes) the current FCM token with the backend.
  /// Safe to call multiple times — the backend upserts by (userId, fcmToken).
  Future<void> registerToken() async {
    try {
      final token = await _messaging.getToken();
      if (token == null) return;

      final platform = Platform.isIOS ? 'IOS' : 'ANDROID';
      final dio = ApiClient.instance;
      await dio.post(
        '/auth/device-token',
        data: {'fcmToken': token, 'platform': platform},
      );
      debugPrint('[FCM] Token registered');
    } catch (e) {
      // Best-effort — failure here does not block authentication
      debugPrint('[FCM] Token registration failed: $e');
    }
  }

  void _handleForeground(RemoteMessage message) {
    debugPrint(
      '[FCM] Foreground: ${message.notification?.title} — ${message.notification?.body}',
    );
    // TODO (Phase 6+): show in-app snackbar/banner using the message payload.
  }

  void _handleTap(RemoteMessage message) {
    debugPrint('[FCM] Tap: type=${message.data['type']} activityId=${message.data['activityId']}');
    // TODO (Phase 6+): navigate to the relevant activity screen using message.data.
  }
}
