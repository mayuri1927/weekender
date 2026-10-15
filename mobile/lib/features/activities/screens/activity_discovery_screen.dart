import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/activities_provider.dart';

const _categories = [
  'SPORTS',
  'SOCIAL',
  'ADVENTURE',
  'FUN',
  'CREATIVE',
  'ENTERTAINMENT',
];

class ActivityDiscoveryScreen extends ConsumerWidget {
  const ActivityDiscoveryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activitiesAsync = ref.watch(activitiesListProvider);
    final filter = ref.watch(activityFilterProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Discover'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => context.push('/activities/create'),
            tooltip: 'Create activity',
          ),
        ],
      ),
      body: Column(
        children: [
          // Category filter chips
          SizedBox(
            height: 48,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: _categories.length + 1,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                if (i == 0) {
                  return FilterChip(
                    label: const Text('All'),
                    selected: filter.category == null,
                    onSelected: (_) => ref
                        .read(activityFilterProvider.notifier)
                        .update((s) => s.copyWith()),
                  );
                }
                final cat = _categories[i - 1];
                return FilterChip(
                  label: Text(_labelFor(cat)),
                  selected: filter.category == cat,
                  onSelected: (_) {
                    final notifier = ref.read(activityFilterProvider.notifier);
                    if (filter.category == cat) {
                      notifier.update((s) => ActivityFilter(
                            cityId: s.cityId,
                            areaId: s.areaId,
                            fromDate: s.fromDate,
                            toDate: s.toDate,
                          ));
                    } else {
                      notifier.update((s) => s.copyWith(category: cat));
                    }
                  },
                );
              },
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: activitiesAsync.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                  child: Text('Failed to load activities: $e')),
              data: (data) {
                final items = (data['items'] as List)
                    .cast<Map<String, dynamic>>();
                if (items.isEmpty) {
                  return const Center(
                      child: Text('No activities found.'));
                }
                return RefreshIndicator(
                  onRefresh: () => ref.refresh(activitiesListProvider.future),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: items.length,
                    separatorBuilder: (_, _) =>
                        const SizedBox(height: 12),
                    itemBuilder: (_, i) =>
                        _ActivityCard(activity: items[i]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  String _labelFor(String cat) {
    return cat[0] + cat.substring(1).toLowerCase();
  }
}

class _ActivityCard extends StatelessWidget {
  final Map<String, dynamic> activity;

  const _ActivityCard({required this.activity});

  @override
  Widget build(BuildContext context) {
    final title = activity['title'] as String;
    final category = activity['category'] as String;
    final date = activity['scheduledDate'] as String;
    final city = (activity['city'] as Map?)?.get('name') ?? '';
    final area = (activity['area'] as Map?)?.get('name');
    final host =
        (activity['host'] as Map?)?.get('profile') as Map?;
    final hostName = host?.get('name') as String? ?? 'Unknown';
    final max = activity['maxParticipants'] as int;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () =>
            context.push('/activities/${activity['id']}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Theme.of(context)
                          .colorScheme
                          .primaryContainer,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      category,
                      style: Theme.of(context)
                          .textTheme
                          .labelSmall
                          ?.copyWith(
                              color: Theme.of(context)
                                  .colorScheme
                                  .onPrimaryContainer),
                    ),
                  ),
                  const Spacer(),
                  Text('Up to $max people',
                      style: Theme.of(context).textTheme.labelSmall),
                ],
              ),
              const SizedBox(height: 8),
              Text(title,
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(
                [city, ?area].join(', '),
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: Colors.grey),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.calendar_today,
                      size: 14, color: Colors.grey),
                  const SizedBox(width: 4),
                  Text(date.split('T').first,
                      style: Theme.of(context).textTheme.bodySmall),
                  const Spacer(),
                  const Icon(Icons.person, size: 14, color: Colors.grey),
                  const SizedBox(width: 4),
                  Text(hostName,
                      style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

extension on Map {
  dynamic get(String key) => this[key];
}
