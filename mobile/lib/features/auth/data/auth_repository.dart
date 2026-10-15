import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class AuthRepository {
  final Dio _dio = ApiClient.instance;

  /// Called after Firebase phone OTP is verified on device.
  /// Sends the resulting idToken to the backend to create/login the user.
  Future<Map<String, dynamic>> verifyWithBackend({
    required String idToken,
    String? fcmToken,
    String? platform,
  }) async {
    final response = await _dio.post('/auth/otp/verify', data: {
      'idToken': idToken,
      if (fcmToken != null) 'fcmToken': fcmToken,
      if (platform != null) 'platform': platform,
    });
    return response.data as Map<String, dynamic>;
  }

  Future<void> logout() async {
    await _dio.post('/auth/logout');
  }
}
