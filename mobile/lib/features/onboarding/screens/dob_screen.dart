import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../users/data/users_repository.dart';

class DobScreen extends ConsumerStatefulWidget {
  const DobScreen({super.key});

  @override
  ConsumerState<DobScreen> createState() => _DobScreenState();
}

class _DobScreenState extends ConsumerState<DobScreen> {
  final _repo = UsersRepository();
  DateTime? _selectedDate;
  String? _error;
  bool _loading = false;

  static const int _minimumAge = 18;

  bool _isEligible(DateTime dob) {
    final today = DateTime.now();
    int age = today.year - dob.year;
    if (today.month < dob.month ||
        (today.month == dob.month && today.day < dob.day)) {
      age--;
    }
    return age >= _minimumAge;
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final maxDate = DateTime(now.year - _minimumAge, now.month, now.day);
    final initialDate = _selectedDate ?? DateTime(now.year - 28, now.month, now.day);

    final picked = await showDatePicker(
      context: context,
      initialDate: initialDate.isBefore(maxDate) ? initialDate : maxDate,
      firstDate: DateTime(1940),
      lastDate: maxDate,
      helpText: 'Select your date of birth',
    );

    if (picked != null) {
      setState(() {
        _selectedDate = picked;
        _error = null;
      });
    }
  }

  Future<void> _continue() async {
    if (_selectedDate == null) {
      setState(() => _error = 'Please select your date of birth');
      return;
    }
    // Client-side pre-check — friendlier UX before the network round-trip.
    // The server is the authoritative enforcement point.
    if (!_isEligible(_selectedDate!)) {
      setState(() =>
          _error = 'You need to be at least 18 years old to use Weekender');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      // ISO 8601 date string — server parses and validates age server-side.
      final dob =
          '${_selectedDate!.year.toString().padLeft(4, '0')}'
          '-${_selectedDate!.month.toString().padLeft(2, '0')}'
          '-${_selectedDate!.day.toString().padLeft(2, '0')}';

      await _repo.updateProfile(dateOfBirth: dob);

      if (!mounted) return;
      context.go('/home');
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;
      final serverMessage =
          e.response?.data is Map ? e.response?.data['message'] : null;

      setState(() {
        _loading = false;
        if (statusCode == 400) {
          // Server rejected the age — treat as hard eligibility failure.
          _error = 'You need to be at least 18 years old to use Weekender';
        } else {
          _error = serverMessage as String? ??
              'Could not save your date of birth. Please try again.';
        }
      });
    } catch (_) {
      setState(() {
        _loading = false;
        _error = 'Something went wrong. Please try again.';
      });
    }
  }

  String _formatDate(DateTime date) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return '${date.day} ${months[date.month - 1]} ${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(),
              Text(
                'When were you born?',
                style: Theme.of(context)
                    .textTheme
                    .headlineLarge
                    ?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text(
                'You must be 18 or older to join Weekender.',
                style: Theme.of(context)
                    .textTheme
                    .bodyMedium
                    ?.copyWith(color: Colors.grey[600]),
              ),
              const SizedBox(height: 32),
              GestureDetector(
                onTap: _loading ? null : _pickDate,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 18),
                  decoration: BoxDecoration(
                    border: Border.all(
                      color:
                          _error != null ? Colors.red : Colors.grey[300]!,
                    ),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _selectedDate != null
                        ? _formatDate(_selectedDate!)
                        : 'Select date of birth',
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: _selectedDate != null
                              ? null
                              : Colors.grey[500],
                        ),
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!,
                    style:
                        const TextStyle(color: Colors.red, fontSize: 13)),
              ],
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _loading ? null : _continue,
                  child: _loading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Continue'),
                ),
              ),
              const Spacer(flex: 2),
            ],
          ),
        ),
      ),
    );
  }
}
