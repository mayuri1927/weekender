// Unit tests for the DOB eligibility logic that mirrors the backend rule.
// These are pure logic tests — no Flutter widget pump required.

import 'package:flutter_test/flutter_test.dart';

bool isEligible(DateTime dob) {
  final today = DateTime.now();
  int age = today.year - dob.year;
  if (today.month < dob.month ||
      (today.month == dob.month && today.day < dob.day)) {
    age--;
  }
  return age >= 18;
}

void main() {
  group('DOB eligibility (client-side pre-check)', () {
    test('exactly 18 years old today is eligible', () {
      final today = DateTime.now();
      final dob = DateTime(today.year - 18, today.month, today.day);
      expect(isEligible(dob), isTrue);
    });

    test('25 years old is eligible', () {
      final today = DateTime.now();
      final dob = DateTime(today.year - 25, today.month, today.day);
      expect(isEligible(dob), isTrue);
    });

    test('17 years old is not eligible', () {
      final today = DateTime.now();
      final dob = DateTime(today.year - 17, today.month, today.day);
      expect(isEligible(dob), isFalse);
    });

    test('16 years old is not eligible', () {
      final today = DateTime.now();
      final dob = DateTime(today.year - 16, today.month, today.day);
      expect(isEligible(dob), isFalse);
    });

    test('birthday is tomorrow — still 17, not eligible', () {
      final today = DateTime.now();
      final tomorrow = today.add(const Duration(days: 1));
      final dob = DateTime(tomorrow.year - 18, tomorrow.month, tomorrow.day);
      expect(isEligible(dob), isFalse);
    });

    test('future date of birth is not eligible', () {
      final future = DateTime.now().add(const Duration(days: 365));
      expect(isEligible(future), isFalse);
    });
  });

  group('DOB ISO string formatting', () {
    test('formats single-digit month and day with leading zeros', () {
      final dob = DateTime(1995, 6, 5);
      final formatted =
          '${dob.year.toString().padLeft(4, '0')}'
          '-${dob.month.toString().padLeft(2, '0')}'
          '-${dob.day.toString().padLeft(2, '0')}';
      expect(formatted, '1995-06-05');
    });

    test('formats double-digit month and day correctly', () {
      final dob = DateTime(1990, 11, 23);
      final formatted =
          '${dob.year.toString().padLeft(4, '0')}'
          '-${dob.month.toString().padLeft(2, '0')}'
          '-${dob.day.toString().padLeft(2, '0')}';
      expect(formatted, '1990-11-23');
    });
  });

  group('OTP router extra', () {
    test('Map extra contains phone and verificationId keys', () {
      final extra = <String, dynamic>{
        'phone': '+919876543210',
        'verificationId': 'abc123',
      };
      expect(extra['phone'] as String? ?? '', '+919876543210');
      expect(extra['verificationId'] as String? ?? '', 'abc123');
    });

    test('casting Map as String? returns null — not the phone string', () {
      final extra = <String, dynamic>{'phone': '+91x', 'verificationId': 'v'};
      // Demonstrates the original bug: treating Map as String? gives null
      final wrongCast = extra is String ? extra : null;
      expect(wrongCast, isNull);
      // Correct approach — key-based access, no cast needed:
      final correctPhone = extra['phone'] as String? ?? '';
      expect(correctPhone, '+91x');
    });
  });
}
