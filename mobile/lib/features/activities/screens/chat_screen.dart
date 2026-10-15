import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:stream_chat_flutter/stream_chat_flutter.dart';
import '../providers/activities_provider.dart';

/// Activity group chat screen.
///
/// The backend issues a short-lived Stream Chat token (24 h) via
/// `GET /activities/:id/chat/token`. Only host and JOINED participants
/// receive a token (403 otherwise).
///
/// The client connects to Stream Chat using that token and reads from the
/// pre-created channel. The client NEVER manages channel membership —
/// that is strictly server-side only (CLAUDE.md §17).
class ChatScreen extends ConsumerStatefulWidget {
  final String activityId;
  final String activityTitle;

  const ChatScreen({
    super.key,
    required this.activityId,
    required this.activityTitle,
  });

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  StreamChatClient? _client;
  Channel? _channel;
  bool _connecting = false;
  String? _error;

  @override
  void dispose() {
    // Disconnect client when leaving the screen. Membership is not changed;
    // the server controls channel membership.
    _client?.disconnectUser();
    super.dispose();
  }

  Future<void> _initChat(Map<String, dynamic> tokenData) async {
    if (_connecting || _client != null) return;
    setState(() {
      _connecting = true;
      _error = null;
    });

    try {
      final apiKey = tokenData['apiKey'] as String;
      final token = tokenData['token'] as String;
      final channelId = tokenData['channelId'] as String;
      final channelType = tokenData['channelType'] as String? ?? 'messaging';

      // NOTE: We do NOT call any Stream admin APIs here. We only connect
      // and watch the channel the server already added us to.
      final client = StreamChatClient(apiKey, logLevel: Level.WARNING);
      await client.connectUser(
        OwnUser(id: _extractUserIdFromToken(token)),
        token,
      );

      final channel = client.channel(channelType, id: channelId);
      await channel.watch();

      if (mounted) {
        setState(() {
          _client = client;
          _channel = channel;
          _connecting = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Could not connect to chat: ${e.toString()}';
          _connecting = false;
        });
      }
    }
  }

  /// Extracts the Stream user ID from the JWT payload (middle segment).
  /// The server embeds the DB UUID as the `user_id` claim.
  String _extractUserIdFromToken(String token) {
    final parts = token.split('.');
    if (parts.length != 3) return 'unknown';
    final payload = parts[1];
    final normalized = base64Url.normalize(payload);
    final decoded = utf8.decode(base64Url.decode(normalized));
    final map = jsonDecode(decoded) as Map<String, dynamic>;
    return map['user_id'] as String? ?? 'unknown';
  }

  @override
  Widget build(BuildContext context) {
    final tokenAsync = ref.watch(chatTokenProvider(widget.activityId));

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.activityTitle),
        elevation: 0,
      ),
      body: tokenAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => _buildError(
          err.toString().contains('403')
              ? 'You are not eligible to access this chat.'
              : 'Failed to load chat. Please try again.',
        ),
        data: (tokenData) {
          // Trigger the Stream Chat connection once we have the token
          if (_client == null && !_connecting && _error == null) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              _initChat(tokenData);
            });
          }

          if (_error != null) return _buildError(_error!);
          if (_connecting || _client == null || _channel == null) {
            return const Center(child: CircularProgressIndicator());
          }

          // Render the Stream Chat UI. The client and channel are fully
          // managed by the server; the widget only reads messages.
          return StreamChat(
            client: _client!,
            child: StreamChannel(
              channel: _channel!,
              child: Column(
                children: [
                  const Expanded(child: StreamMessageListView()),
                  StreamMessageComposer(),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildError(String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.chat_bubble_outline, size: 48, color: Colors.grey),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(color: Colors.grey[600]),
            ),
          ],
        ),
      ),
    );
  }
}
