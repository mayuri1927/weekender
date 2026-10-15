import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class CitiesRepository {
  final Dio _dio = ApiClient.instance;

  Future<List<Map<String, dynamic>>> getCities() async {
    final response = await _dio.get('/cities');
    return (response.data as List).cast<Map<String, dynamic>>();
  }

  Future<List<Map<String, dynamic>>> getAreas(String cityId) async {
    final response = await _dio.get('/cities/$cityId/areas');
    return (response.data as List).cast<Map<String, dynamic>>();
  }
}
