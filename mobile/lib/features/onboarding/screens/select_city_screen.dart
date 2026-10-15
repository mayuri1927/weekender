import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../../cities/providers/cities_provider.dart';
import '../../users/data/users_repository.dart';

class SelectCityScreen extends ConsumerStatefulWidget {
  const SelectCityScreen({super.key});

  @override
  ConsumerState<SelectCityScreen> createState() => _SelectCityScreenState();
}

class _SelectCityScreenState extends ConsumerState<SelectCityScreen> {
  String? _selectedCityId;
  bool _loading = false;
  String? _error;

  Future<void> _submit() async {
    if (_selectedCityId == null) {
      setState(() => _error = 'Please select a city.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await UsersRepository().updateProfile(cityId: _selectedCityId);
      if (mounted) {
        context.go('/onboarding/area', extra: {'cityId': _selectedCityId});
      }
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
    final citiesAsync = ref.watch(citiesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Your city')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Where are you based?',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              const Text(
                "We'll show you weekend activities near you.",
                style: TextStyle(color: Colors.grey),
              ),
              const SizedBox(height: 24),
              citiesAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Text('Failed to load cities: $e',
                    style: const TextStyle(color: Colors.red)),
                data: (cities) => Expanded(
                  child: ListView.separated(
                    itemCount: cities.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      final city = cities[i];
                      final id = city['id'] as String;
                      final name = city['name'] as String;
                      final state = city['state'] as String? ?? '';
                      final isSelected = _selectedCityId == id;
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
                        subtitle: state.isNotEmpty ? Text(state) : null,
                        onTap: () =>
                            setState(() => _selectedCityId = id),
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
              SizedBox(
                width: double.infinity,
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
        ),
      ),
    );
  }
}
