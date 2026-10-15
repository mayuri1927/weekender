// ignore_for_file: deprecated_member_use
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../data/activities_repository.dart';
import '../providers/activities_provider.dart';
import '../../cities/providers/cities_provider.dart';

const _categories = [
  'SPORTS',
  'SOCIAL',
  'ADVENTURE',
  'FUN',
  'CREATIVE',
  'ENTERTAINMENT',
];

class CreateActivityScreen extends ConsumerStatefulWidget {
  const CreateActivityScreen({super.key});

  @override
  ConsumerState<CreateActivityScreen> createState() =>
      _CreateActivityScreenState();
}

class _CreateActivityScreenState
    extends ConsumerState<CreateActivityScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descController = TextEditingController();
  final _maxController = TextEditingController(text: '10');

  String? _selectedCategory;
  String? _selectedCityId;
  String? _selectedAreaId;
  DateTime? _scheduledDate;
  TimeOfDay? _startTime;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _titleController.dispose();
    _descController.dispose();
    _maxController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 7)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (date != null) setState(() => _scheduledDate = date);
  }

  Future<void> _pickTime() async {
    final time = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 10, minute: 0),
    );
    if (time != null) setState(() => _startTime = time);
  }

  String _formatDate(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  String _formatTime(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedCategory == null) {
      setState(() => _error = 'Please select a category.');
      return;
    }
    if (_selectedCityId == null) {
      setState(() => _error = 'Please select a city.');
      return;
    }
    if (_scheduledDate == null) {
      setState(() => _error = 'Please pick a date.');
      return;
    }
    if (_startTime == null) {
      setState(() => _error = 'Please pick a start time.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final data = <String, dynamic>{
        'title': _titleController.text.trim(),
        'description': _descController.text.trim(),
        'category': _selectedCategory,
        'cityId': _selectedCityId,
        if (_selectedAreaId != null) 'areaId': _selectedAreaId,
        'scheduledDate': _formatDate(_scheduledDate!),
        'startTime': _formatTime(_startTime!),
        'maxParticipants': int.parse(_maxController.text.trim()),
      };

      final activity = await ActivitiesRepository().createActivity(data);
      ref.invalidate(activitiesListProvider);

      if (mounted) {
        context.pushReplacement('/activities/${activity['id']}');
      }
    } on DioException catch (e) {
      final raw = e.response?.data?['message'];
      String msg;
      if (raw is List) {
        msg = raw.join(', ');
      } else if (raw is String) {
        msg = raw;
      } else {
        msg = 'Something went wrong. Try again.';
      }
      setState(() => _error = msg);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final citiesAsync = ref.watch(citiesProvider);
    final areasAsync = _selectedCityId != null
        ? ref.watch(areasProvider(_selectedCityId!))
        : null;

    return Scaffold(
      appBar: AppBar(title: const Text('Create activity')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Title
                TextFormField(
                  controller: _titleController,
                  decoration: const InputDecoration(
                    labelText: 'Title *',
                    border: OutlineInputBorder(),
                    helperText: '5–120 characters',
                  ),
                  validator: (v) {
                    if (v == null || v.trim().length < 5) {
                      return 'Title must be at least 5 characters';
                    }
                    if (v.trim().length > 120) {
                      return 'Title must be 120 characters or fewer';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                // Description
                TextFormField(
                  controller: _descController,
                  minLines: 3,
                  maxLines: 6,
                  decoration: const InputDecoration(
                    labelText: 'Description *',
                    border: OutlineInputBorder(),
                    helperText: '20–2000 characters',
                  ),
                  validator: (v) {
                    if (v == null || v.trim().length < 20) {
                      return 'Description must be at least 20 characters';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                // Category
                Text('Category *',
                    style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: _categories.map((cat) {
                    return ChoiceChip(
                      label: Text(_label(cat)),
                      selected: _selectedCategory == cat,
                      onSelected: (_) =>
                          setState(() => _selectedCategory = cat),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 16),

                // City
                citiesAsync.when(
                  loading: () => const CircularProgressIndicator(),
                  error: (e, _) =>
                      Text('Cities unavailable: $e'),
                  data: (cities) => DropdownButtonFormField<String>(
                    value: _selectedCityId,
                    decoration: const InputDecoration(
                      labelText: 'City *',
                      border: OutlineInputBorder(),
                    ),
                    items: cities
                        .map((c) => DropdownMenuItem<String>(
                              value: c['id'] as String,
                              child: Text(c['name'] as String),
                            ))
                        .toList(),
                    onChanged: (v) {
                      setState(() {
                        _selectedCityId = v;
                        _selectedAreaId = null;
                      });
                    },
                    validator: (v) =>
                        v == null ? 'Please select a city' : null,
                  ),
                ),
                const SizedBox(height: 16),

                // Area (optional)
                if (areasAsync != null)
                  areasAsync.when(
                    loading: () => const SizedBox.shrink(),
                    error: (_, _) => const SizedBox.shrink(),
                    data: (areas) => DropdownButtonFormField<String?>(
                      value: _selectedAreaId,
                      decoration: const InputDecoration(
                        labelText: 'Area (optional)',
                        border: OutlineInputBorder(),
                      ),
                      items: [
                        const DropdownMenuItem<String?>(
                            value: null, child: Text('— Any area —')),
                        ...areas.map((a) => DropdownMenuItem<String?>(
                              value: a['id'] as String,
                              child: Text(a['name'] as String),
                            )),
                      ],
                      onChanged: (v) =>
                          setState(() => _selectedAreaId = v),
                    ),
                  ),
                if (areasAsync != null) const SizedBox(height: 16),

                // Date & Time
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _pickDate,
                        icon: const Icon(Icons.calendar_today),
                        label: Text(_scheduledDate != null
                            ? _formatDate(_scheduledDate!)
                            : 'Pick date *'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _pickTime,
                        icon: const Icon(Icons.access_time),
                        label: Text(_startTime != null
                            ? _formatTime(_startTime!)
                            : 'Start time *'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Max participants
                TextFormField(
                  controller: _maxController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Max participants *',
                    border: OutlineInputBorder(),
                    helperText: 'Minimum 2',
                  ),
                  validator: (v) {
                    final n = int.tryParse(v ?? '');
                    if (n == null || n < 2) {
                      return 'Must be at least 2';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 24),

                if (_error != null) ...[
                  Text(_error!,
                      style: const TextStyle(color: Colors.red)),
                  const SizedBox(height: 12),
                ],

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
                        : const Text('Create activity'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _label(String cat) =>
      cat[0] + cat.substring(1).toLowerCase();
}
