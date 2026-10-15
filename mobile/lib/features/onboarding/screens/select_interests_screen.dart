import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../interests/providers/interests_provider.dart';
import '../../interests/data/interests_repository.dart';

class SelectInterestsScreen extends ConsumerStatefulWidget {
  const SelectInterestsScreen({super.key});

  @override
  ConsumerState<SelectInterestsScreen> createState() =>
      _SelectInterestsScreenState();
}

class _SelectInterestsScreenState
    extends ConsumerState<SelectInterestsScreen> {
  bool _saving = false;
  String? _error;

  Future<void> _save() async {
    final selected =
        ref.read(selectedInterestsProvider).toList();
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await InterestsRepository().setMyInterests(selected);
      if (mounted) context.go('/onboarding/photo');
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      setState(() {
        _error = (msg is String) ? msg : 'Could not save interests.';
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final categoriesAsync = ref.watch(interestCategoriesProvider);
    final selected = ref.watch(selectedInterestsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Your interests')),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('What are you into?',
                      style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 4),
                  const Text(
                    'Pick at least one. We use this to personalise your feed.',
                    style: TextStyle(color: Colors.grey),
                  ),
                ],
              ),
            ),
            Expanded(
              child: categoriesAsync.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(
                    child: Text('Failed to load interests: $e')),
                data: (categories) => ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: categories.length,
                  itemBuilder: (_, i) {
                    final cat = categories[i];
                    final interests =
                        (cat['interests'] as List).cast<Map<String, dynamic>>();
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(
                              vertical: 8, horizontal: 4),
                          child: Text(
                            cat['name'] as String,
                            style: Theme.of(context)
                                .textTheme
                                .labelLarge
                                ?.copyWith(
                                    fontWeight: FontWeight.bold),
                          ),
                        ),
                        Wrap(
                          spacing: 8,
                          runSpacing: 4,
                          children: interests.map((interest) {
                            final id = interest['id'] as String;
                            final name = interest['name'] as String;
                            final isSelected = selected.contains(id);
                            return FilterChip(
                              label: Text(name),
                              selected: isSelected,
                              onSelected: (_) {
                                ref
                                    .read(selectedInterestsProvider.notifier)
                                    .toggle(id);
                              },
                            );
                          }).toList(),
                        ),
                        const SizedBox(height: 8),
                      ],
                    );
                  },
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(_error!,
                          style: const TextStyle(color: Colors.red)),
                    ),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: _saving
                              ? null
                              : () => context.go('/onboarding/photo'),
                          child: const Text('Skip'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: FilledButton(
                          onPressed:
                              (_saving || selected.isEmpty) ? null : _save,
                          child: _saving
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white),
                                )
                              : Text('Save (${selected.length})'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
