import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../providers/activities_provider.dart';
import '../data/activities_repository.dart';
import '../../auth/providers/auth_provider.dart';

class ActivityDetailsScreen extends ConsumerStatefulWidget {
  final String activityId;

  const ActivityDetailsScreen({super.key, required this.activityId});

  @override
  ConsumerState<ActivityDetailsScreen> createState() =>
      _ActivityDetailsScreenState();
}

class _ActivityDetailsScreenState
    extends ConsumerState<ActivityDetailsScreen> {
  bool _actionInProgress = false;
  String? _error;

  Future<void> _cancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Cancel activity?'),
        content: const Text(
            'This cannot be undone. All participants will be notified.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep it')),
          TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Cancel activity',
                  style: TextStyle(color: Colors.red))),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() { _actionInProgress = true; _error = null; });
    try {
      await ActivitiesRepository().cancelActivity(widget.activityId);
      if (mounted) {
        ref.invalidate(activityDetailProvider(widget.activityId));
        ref.invalidate(activitiesListProvider);
        context.pop();
      }
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      setState(() => _error = (msg is String) ? msg : 'Could not cancel activity.');
    } finally {
      if (mounted) setState(() => _actionInProgress = false);
    }
  }

  // Used by both OPEN (immediate join) and REQUEST (creates PENDING) activities.
  Future<void> _joinOrRequest() async {
    setState(() { _actionInProgress = true; _error = null; });
    try {
      await ActivitiesRepository().joinActivity(widget.activityId);
      if (mounted) {
        ref.invalidate(activityDetailProvider(widget.activityId));
        ref.invalidate(participantsProvider(widget.activityId));
        ref.invalidate(groupEligibilityProvider(widget.activityId));
        ref.invalidate(activitiesListProvider);
      }
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      setState(() => _error = (msg is String) ? msg : 'Could not complete action.');
    } finally {
      if (mounted) setState(() => _actionInProgress = false);
    }
  }

  Future<void> _leave() async {
    setState(() { _actionInProgress = true; _error = null; });
    try {
      await ActivitiesRepository().leaveActivity(widget.activityId);
      if (mounted) {
        ref.invalidate(activityDetailProvider(widget.activityId));
        ref.invalidate(participantsProvider(widget.activityId));
        ref.invalidate(groupEligibilityProvider(widget.activityId));
        ref.invalidate(activitiesListProvider);
      }
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      setState(() => _error = (msg is String) ? msg : 'Could not leave activity.');
    } finally {
      if (mounted) setState(() => _actionInProgress = false);
    }
  }

  Future<void> _approve(String participantId) async {
    setState(() { _actionInProgress = true; _error = null; });
    try {
      await ActivitiesRepository()
          .approveParticipant(widget.activityId, participantId);
      if (mounted) {
        ref.invalidate(participantsProvider(widget.activityId));
        ref.invalidate(activityDetailProvider(widget.activityId));
        ref.invalidate(activitiesListProvider);
      }
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      setState(() => _error = (msg is String) ? msg : 'Could not approve request.');
    } finally {
      if (mounted) setState(() => _actionInProgress = false);
    }
  }

  Future<void> _reject(String participantId) async {
    setState(() { _actionInProgress = true; _error = null; });
    try {
      await ActivitiesRepository()
          .rejectParticipant(widget.activityId, participantId);
      if (mounted) {
        ref.invalidate(participantsProvider(widget.activityId));
      }
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      setState(() => _error = (msg is String) ? msg : 'Could not reject request.');
    } finally {
      if (mounted) setState(() => _actionInProgress = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final activityAsync =
        ref.watch(activityDetailProvider(widget.activityId));
    final participantsAsync =
        ref.watch(participantsProvider(widget.activityId));
    final eligibilityAsync =
        ref.watch(groupEligibilityProvider(widget.activityId));
    final authState = ref.watch(authNotifierProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Activity')),
      body: activityAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Failed to load: $e')),
        data: (activity) {
          final hostId = (activity['host'] as Map)['id'] as String;
          final isHost = authState.userId == hostId;
          final status = activity['status'] as String;
          final activityType =
              (activity['activityType'] as String?) ?? 'OPEN';
          final maxParticipants = activity['maxParticipants'] as int;
          final isCancellable = isHost &&
              status != 'CANCELLED' &&
              status != 'COMPLETED';
          final isClosed =
              status == 'CANCELLED' || status == 'COMPLETED';

          // Participant lists: host sees JOINED+PENDING+REJECTED, others see JOINED only
          final allParticipants = participantsAsync.valueOrNull ?? [];
          final joinedList = allParticipants
              .where((p) => (p as Map)['status'] == 'JOINED')
              .toList();
          final pendingList = allParticipants
              .where((p) => (p as Map)['status'] == 'PENDING')
              .toList();

          final activeCount = joinedList.length;
          final isFull = status == 'FULL';

          // The calling user's own participation status (from group-eligibility endpoint)
          final eligibility = eligibilityAsync.valueOrNull;
          final myStatus = eligibility?['participantStatus'] as String?;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (activity['coverImageUrl'] != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.network(
                      activity['coverImageUrl'] as String,
                      height: 200,
                      width: double.infinity,
                      fit: BoxFit.cover,
                    ),
                  ),
                if (activity['coverImageUrl'] != null)
                  const SizedBox(height: 16),
                Row(
                  children: [
                    _StatusChip(status: status),
                    const SizedBox(width: 8),
                    _CategoryChip(category: activity['category'] as String),
                    if (activityType == 'REQUEST') ...[
                      const SizedBox(width: 8),
                      _TypeChip(activityType: activityType),
                    ],
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  activity['title'] as String,
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 8),
                _DetailRow(
                  icon: Icons.calendar_today,
                  text:
                      '${(activity['scheduledDate'] as String).split('T').first}  ${activity['startTime'] as String}',
                ),
                _DetailRow(
                  icon: Icons.location_on,
                  text: [
                    (activity['city'] as Map?)?.get('name'),
                    (activity['area'] as Map?)?.get('name'),
                  ].whereType<String>().join(', '),
                ),
                _DetailRow(
                  icon: Icons.people,
                  text: participantsAsync.when(
                    data: (_) => '$activeCount / $maxParticipants joined'
                        '${pendingList.isNotEmpty && isHost ? ' · ${pendingList.length} pending' : ''}',
                    loading: () => '— / $maxParticipants',
                    error: (e, st) => 'Up to $maxParticipants people',
                  ),
                ),
                const SizedBox(height: 16),
                const Divider(),
                const SizedBox(height: 16),
                Text('About',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                Text(activity['description'] as String),
                const SizedBox(height: 16),
                const Divider(),
                const SizedBox(height: 16),
                Text('Hosted by',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                _HostTile(host: activity['host'] as Map),

                // Joined participants
                if (joinedList.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  const Divider(),
                  const SizedBox(height: 16),
                  Text('Participants',
                      style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  ...joinedList.map((p) =>
                      _ParticipantTile(participant: p as Map)),
                ],

                // Pending requests — visible to host only
                if (isHost && pendingList.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  const Divider(),
                  const SizedBox(height: 16),
                  Text('Pending Requests (${pendingList.length})',
                      style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  ...pendingList.map((p) {
                    final pMap = p as Map;
                    return _PendingRequestTile(
                      participant: pMap,
                      onApprove: _actionInProgress
                          ? null
                          : () => _approve(pMap['id'] as String),
                      onReject: _actionInProgress
                          ? null
                          : () => _reject(pMap['id'] as String),
                    );
                  }),
                ],

                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Text(_error!,
                      style: const TextStyle(color: Colors.red)),
                ],

                const SizedBox(height: 24),

                // ── Action buttons ─────────────────────────────────────────
                if (!isHost && !isClosed) ...[
                  _buildUserActionButton(
                    activityType: activityType,
                    myStatus: myStatus,
                    isFull: isFull,
                    activeCount: activeCount,
                    maxParticipants: maxParticipants,
                  ),
                ],

                if (isCancellable) ...[
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.red,
                          side: const BorderSide(color: Colors.red)),
                      onPressed: _actionInProgress ? null : _cancel,
                      child: _actionInProgress
                          ? const _LoadingIndicator()
                          : const Text('Cancel activity'),
                    ),
                  ),
                ],

                // Phase 5: Show "Open Chat" button for eligible users.
                // groupEligible = true when user is host or JOINED.
                // eligibility is derived server-side — the button is only
                // shown based on this value; the backend independently
                // enforces eligibility on the token endpoint.
                if (eligibility?['groupEligible'] == true) ...[
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      icon: const Icon(Icons.chat_bubble_outline),
                      label: const Text('Open Chat'),
                      onPressed: () => context.push(
                        '/activities/${widget.activityId}/chat',
                        extra: {'title': activity['title'] as String? ?? 'Group Chat'},
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 16),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildUserActionButton({
    required String activityType,
    required String? myStatus,
    required bool isFull,
    required int activeCount,
    required int maxParticipants,
  }) {
    // Already joined
    if (myStatus == 'JOINED') {
      return SizedBox(
        width: double.infinity,
        child: OutlinedButton(
          style: OutlinedButton.styleFrom(
              foregroundColor: Colors.red,
              side: const BorderSide(color: Colors.red)),
          onPressed: _actionInProgress ? null : _leave,
          child: _actionInProgress
              ? const _LoadingIndicator()
              : const Text('Leave activity'),
        ),
      );
    }

    // Request pending
    if (myStatus == 'PENDING') {
      return SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: null,
          style: FilledButton.styleFrom(backgroundColor: Colors.orange.shade200),
          child: const Text('Request pending…'),
        ),
      );
    }

    // Rejected (terminal in V1)
    if (myStatus == 'REJECTED') {
      return SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: null,
          style: FilledButton.styleFrom(backgroundColor: Colors.red.shade100),
          child: const Text('Request was rejected'),
        ),
      );
    }

    // Removed (terminal)
    if (myStatus == 'REMOVED') {
      return SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: null,
          style: FilledButton.styleFrom(backgroundColor: Colors.red.shade100),
          child: const Text('You have been removed'),
        ),
      );
    }

    // No participation — show join or request button
    if (activityType == 'REQUEST') {
      return SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: _actionInProgress ? null : _joinOrRequest,
          child: _actionInProgress
              ? const _LoadingIndicator()
              : const Text('Request to Join'),
        ),
      );
    }

    // OPEN activity
    if (isFull) {
      return SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: null,
          child: Text('Activity full ($activeCount / $maxParticipants)'),
        ),
      );
    }

    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: _actionInProgress ? null : _joinOrRequest,
        child: _actionInProgress
            ? const _LoadingIndicator()
            : Text('Join activity ($activeCount / $maxParticipants)'),
      ),
    );
  }
}

// ─── Widget helpers ───────────────────────────────────────────────────────────

class _LoadingIndicator extends StatelessWidget {
  const _LoadingIndicator();

  @override
  Widget build(BuildContext context) =>
      const SizedBox(height: 20, width: 20,
          child: CircularProgressIndicator(strokeWidth: 2));
}

class _DetailRow extends StatelessWidget {
  final IconData icon;
  final String text;

  const _DetailRow({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 16, color: Colors.grey),
          const SizedBox(width: 8),
          Expanded(
              child: Text(text,
                  style: Theme.of(context).textTheme.bodyMedium)),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;

  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (status) {
      case 'OPEN':   color = Colors.green; break;
      case 'FULL':   color = Colors.orange; break;
      case 'CANCELLED': color = Colors.red; break;
      default:       color = Colors.grey;
    }
    return _chip(status, color);
  }
}

class _CategoryChip extends StatelessWidget {
  final String category;

  const _CategoryChip({required this.category});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(category,
          style: TextStyle(
              color: Theme.of(context).colorScheme.onSecondaryContainer,
              fontSize: 12)),
    );
  }
}

class _TypeChip extends StatelessWidget {
  final String activityType;

  const _TypeChip({required this.activityType});

  @override
  Widget build(BuildContext context) {
    return _chip('REQUEST', Colors.purple);
  }
}

Widget _chip(String label, Color color) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(label,
          style: TextStyle(color: color, fontSize: 12)),
    );

class _HostTile extends StatelessWidget {
  final Map host;

  const _HostTile({required this.host});

  @override
  Widget build(BuildContext context) {
    final profile = host['profile'] as Map?;
    final name = profile?['name'] as String? ?? 'Unknown';
    final photoUrl = profile?['photoUrl'] as String?;

    return Row(
      children: [
        CircleAvatar(
          radius: 24,
          backgroundImage:
              photoUrl != null ? NetworkImage(photoUrl) : null,
          child: photoUrl == null
              ? const Icon(Icons.person, size: 24)
              : null,
        ),
        const SizedBox(width: 12),
        Text(name, style: Theme.of(context).textTheme.titleSmall),
      ],
    );
  }
}

class _ParticipantTile extends StatelessWidget {
  final Map participant;

  const _ParticipantTile({required this.participant});

  @override
  Widget build(BuildContext context) {
    final user = participant['user'] as Map? ?? {};
    final name = user['name'] as String? ?? 'Participant';
    final photoUrl = user['photoUrl'] as String?;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          CircleAvatar(
            radius: 18,
            backgroundImage:
                photoUrl != null ? NetworkImage(photoUrl) : null,
            child: photoUrl == null
                ? const Icon(Icons.person, size: 18)
                : null,
          ),
          const SizedBox(width: 10),
          Text(name, style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    );
  }
}

class _PendingRequestTile extends StatelessWidget {
  final Map participant;
  final VoidCallback? onApprove;
  final VoidCallback? onReject;

  const _PendingRequestTile({
    required this.participant,
    required this.onApprove,
    required this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    final user = participant['user'] as Map? ?? {};
    final name = user['name'] as String? ?? 'Unknown';
    final photoUrl = user['photoUrl'] as String?;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          CircleAvatar(
            radius: 18,
            backgroundImage:
                photoUrl != null ? NetworkImage(photoUrl) : null,
            child: photoUrl == null
                ? const Icon(Icons.person, size: 18)
                : null,
          ),
          const SizedBox(width: 10),
          Expanded(
              child: Text(name,
                  style: Theme.of(context).textTheme.bodyMedium)),
          TextButton(
            onPressed: onApprove,
            child: const Text('Approve',
                style: TextStyle(color: Colors.green)),
          ),
          TextButton(
            onPressed: onReject,
            child: const Text('Reject',
                style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}

extension on Map {
  dynamic get(String key) => this[key];
}
