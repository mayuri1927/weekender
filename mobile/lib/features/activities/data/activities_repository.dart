import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';

class ActivitiesRepository {
  final Dio _dio = ApiClient.instance;

  Future<Map<String, dynamic>> createActivity(
      Map<String, dynamic> data) async {
    final response = await _dio.post('/activities', data: data);
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> listActivities({
    String? cityId,
    String? areaId,
    String? category,
    String? fromDate,
    String? toDate,
    int page = 1,
    int limit = 20,
  }) async {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      if (cityId != null) 'cityId': cityId,
      if (areaId != null) 'areaId': areaId,
      if (category != null) 'category': category,
      if (fromDate != null) 'fromDate': fromDate,
      if (toDate != null) 'toDate': toDate,
    };
    final response =
        await _dio.get('/activities', queryParameters: params);
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getActivity(String id) async {
    final response = await _dio.get('/activities/$id');
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> updateActivity(
      String id, Map<String, dynamic> data) async {
    final response = await _dio.patch('/activities/$id', data: data);
    return response.data as Map<String, dynamic>;
  }

  Future<void> cancelActivity(String id) async {
    await _dio.delete('/activities/$id');
  }

  // ─── Participant actions ───────────────────────────────────────────────────

  // OPEN activity: creates JOINED. REQUEST activity: creates PENDING.
  Future<Map<String, dynamic>> joinActivity(String activityId) async {
    final response = await _dio.post('/activities/$activityId/join');
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> leaveActivity(String activityId) async {
    final response = await _dio.delete('/activities/$activityId/join');
    return response.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> listParticipants(String activityId) async {
    final response = await _dio.get('/activities/$activityId/participants');
    return response.data as List<dynamic>;
  }

  // ─── Host approval actions (Phase 4) ──────────────────────────────────────

  Future<Map<String, dynamic>> approveParticipant(
      String activityId, String participantId) async {
    final response = await _dio
        .post('/activities/$activityId/participants/$participantId/approve');
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> rejectParticipant(
      String activityId, String participantId) async {
    final response = await _dio
        .post('/activities/$activityId/participants/$participantId/reject');
    return response.data as Map<String, dynamic>;
  }

  // ─── Match + group eligibility (Phase 4) ──────────────────────────────────

  Future<Map<String, dynamic>> getMatch(String activityId) async {
    final response = await _dio.get('/activities/$activityId/match');
    return response.data as Map<String, dynamic>;
  }

  // Returns { groupEligible: bool, participantStatus: string? }
  // participantStatus drives the join/leave/pending button state.
  Future<Map<String, dynamic>> getGroupEligibility(String activityId) async {
    final response =
        await _dio.get('/activities/$activityId/group-eligibility');
    return response.data as Map<String, dynamic>;
  }

  // Returns { token, channelId, channelType, apiKey } from the backend.
  // Only eligible users (host or JOINED) receive a token.
  // The client must use the token to connect to Stream Chat and never call
  // Stream Chat admin APIs directly (server-side membership only).
  Future<Map<String, dynamic>> getChatToken(String activityId) async {
    final response = await _dio.get('/activities/$activityId/chat/token');
    return response.data as Map<String, dynamic>;
  }
}
