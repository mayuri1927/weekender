import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class UsersRepository {
  final Dio _dio = ApiClient.instance;

  Future<Map<String, dynamic>> getMe() async {
    final response = await _dio.get('/users/me');
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateProfile({
    String? dateOfBirth,
    String? name,
    String? gender,
    String? bio,
    String? cityId,
    String? areaId,
    Map<String, dynamic>? notificationPreferences,
  }) async {
    final data = <String, dynamic>{
      if (dateOfBirth != null) 'dateOfBirth': dateOfBirth,
      if (name != null) 'name': name,
      if (gender != null) 'gender': gender,
      if (bio != null) 'bio': bio,
      if (cityId != null) 'cityId': cityId,
      if (areaId != null) 'areaId': areaId,
      if (notificationPreferences != null)
        'notificationPreferences': notificationPreferences,
    };
    final response = await _dio.patch('/users/me', data: data);
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updatePhoto(String photoUrl) async {
    final response =
        await _dio.post('/users/me/photo', data: {'photoUrl': photoUrl});
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getUploadUrl({
    required String contentType,
    required int contentLength,
  }) async {
    final response =
        await _dio.post('/storage/profile-photo/upload-url', data: {
      'contentType': contentType,
      'contentLength': contentLength,
    });
    return response.data as Map<String, dynamic>;
  }
}
