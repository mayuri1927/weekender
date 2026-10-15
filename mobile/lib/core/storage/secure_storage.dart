import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorage {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static const _keyUserId = 'weekender_user_id';

  static Future<void> saveUserId(String userId) =>
      _storage.write(key: _keyUserId, value: userId);

  static Future<String?> getUserId() => _storage.read(key: _keyUserId);

  static Future<void> clear() => _storage.deleteAll();
}
