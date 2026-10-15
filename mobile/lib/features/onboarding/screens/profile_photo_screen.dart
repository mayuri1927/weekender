import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import '../../users/data/users_repository.dart';

class ProfilePhotoScreen extends ConsumerStatefulWidget {
  const ProfilePhotoScreen({super.key});

  @override
  ConsumerState<ProfilePhotoScreen> createState() =>
      _ProfilePhotoScreenState();
}

class _ProfilePhotoScreenState
    extends ConsumerState<ProfilePhotoScreen> {
  File? _pickedFile;
  bool _uploading = false;
  String? _error;

  Future<void> _pickImage(ImageSource source) async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: source,
      maxWidth: 1080,
      maxHeight: 1080,
      imageQuality: 85,
    );
    if (picked != null) {
      setState(() {
        _pickedFile = File(picked.path);
        _error = null;
      });
    }
  }

  Future<void> _upload() async {
    final file = _pickedFile;
    if (file == null) return;

    setState(() {
      _uploading = true;
      _error = null;
    });

    try {
      final bytes = await file.readAsBytes();
      final contentLength = bytes.length;
      const contentType = 'image/jpeg';

      final repo = UsersRepository();
      final urlData = await repo.getUploadUrl(
        contentType: contentType,
        contentLength: contentLength,
      );

      final uploadUrl = urlData['uploadUrl'] as String;
      final key = urlData['key'] as String;

      // PUT directly to S3 pre-signed URL
      final dio = Dio();
      await dio.put(
        uploadUrl,
        data: bytes,
        options: Options(headers: {
          'Content-Type': contentType,
          'Content-Length': contentLength,
        }),
      );

      // Build the public URL from the key (dev: uploadUrl itself for mock)
      final publicUrl = uploadUrl.contains('mock')
          ? 'https://cdn.weekender.app/$key'
          : uploadUrl.split('?').first;

      await repo.updatePhoto(publicUrl);

      if (mounted) context.go('/home');
    } on DioException catch (e) {
      final msg = e.response?.data?['message'];
      setState(() {
        _error = (msg is String) ? msg : 'Upload failed. Try again.';
      });
    } catch (e) {
      setState(() => _error = 'Upload failed. Try again.');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile photo')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Text('Add a photo',
                  style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              const Text(
                'A photo helps others recognise you at activities.',
                style: TextStyle(color: Colors.grey),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              Center(
                child: Stack(
                  children: [
                    CircleAvatar(
                      radius: 72,
                      backgroundImage: _pickedFile != null
                          ? FileImage(_pickedFile!)
                          : null,
                      backgroundColor: Colors.grey[200],
                      child: _pickedFile == null
                          ? const Icon(Icons.person,
                              size: 60, color: Colors.grey)
                          : null,
                    ),
                    Positioned(
                      bottom: 4,
                      right: 4,
                      child: GestureDetector(
                        onTap: () => _showPicker(context),
                        child: Container(
                          padding: const EdgeInsets.all(6),
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.primary,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.camera_alt,
                              size: 18, color: Colors.white),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  OutlinedButton.icon(
                    onPressed:
                        _uploading ? null : () => _pickImage(ImageSource.camera),
                    icon: const Icon(Icons.camera_alt),
                    label: const Text('Camera'),
                  ),
                  const SizedBox(width: 16),
                  OutlinedButton.icon(
                    onPressed: _uploading
                        ? null
                        : () => _pickImage(ImageSource.gallery),
                    icon: const Icon(Icons.photo_library),
                    label: const Text('Gallery'),
                  ),
                ],
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                Text(_error!,
                    style: const TextStyle(color: Colors.red),
                    textAlign: TextAlign.center),
              ],
              const Spacer(),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed:
                          _uploading ? null : () => context.go('/home'),
                      child: const Text('Skip for now'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: (_uploading || _pickedFile == null)
                          ? null
                          : _upload,
                      child: _uploading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white),
                            )
                          : const Text('Upload & finish'),
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

  void _showPicker(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Take photo'),
              onTap: () {
                Navigator.pop(context);
                _pickImage(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Choose from gallery'),
              onTap: () {
                Navigator.pop(context);
                _pickImage(ImageSource.gallery);
              },
            ),
          ],
        ),
      ),
    );
  }
}
