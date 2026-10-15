import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class InterestsRepository {
  final Dio _dio = ApiClient.instance;

  Future<List<Map<String, dynamic>>> getCategories() async {
    final response = await _dio.get('/interests');
    return (response.data as List).cast<Map<String, dynamic>>();
  }

  Future<List<Map<String, dynamic>>> getMyInterests() async {
    final response = await _dio.get('/interests/me');
    return (response.data as List).cast<Map<String, dynamic>>();
  }

  Future<void> setMyInterests(List<String> interestIds) async {
    await _dio.put('/interests/me', data: {'interestIds': interestIds});
  }
}
