import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../cities/providers/cities_provider.dart';
import '../../users/data/users_repository.dart';

class SelectAreaScreen extends ConsumerStatefulWidget {
  final String cityId;

  const SelectAreaScreen({super.key, required this.cityId});

  @override
  ConsumerState<SelectAreaScreen> createState() => _SelectAreaScreenState();
}

class _SelectAreaScreenState extends ConsumerState<SelectAreaScreen> {
  String? _selectedAreaId;
  bool _loading = false;
  String? _error;

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await UsersRepository().updateProfile(areaId: _selectedAreaId);
      if (mounted) context.go('/onboarding/interests');
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      setState(() {
        _error = (msg is String) ? msg : 'Something went wrong. Try again.';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final areasAsync = ref.watch(areasProvider(widget.cityId));

    return Scaffold(
      appBar: AppBar(title: const Text('Your area')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Which area?',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              const Text(
                'Optional — helps us surface nearby activities.',
                style: TextStyle(color: Colors.grey),
              ),
              const SizedBox(height: 24),
              areasAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Text('Failed to load areas: $e',
                    style: const TextStyle(color: Colors.red)),
                data: (areas) => Expanded(
                  child: ListView.separated(
                    itemCount: areas.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      final area = areas[i];
                      final id = area['id'] as String;
                      final name = area['name'] as String;
                      final isSelected = _selectedAreaId == id;
                      return ListTile(
                        leading: Icon(
                          isSelected
                              ? Icons.radio_button_checked
                              : Icons.radio_button_unchecked,
                          color: isSelected
                              ? Theme.of(context).colorScheme.primary
                              : null,
                        ),
                        title: Text(name),
                        onTap: () =>
                            setState(() => _selectedAreaId = id),
                      );
                    },
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _loading
                          ? null
                          : () => context.go('/onboarding/interests'),
                      child: const Text('Skip'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: _loading ? null : _submit,
                      child: _loading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white),
                            )
                          : const Text('Continue'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
