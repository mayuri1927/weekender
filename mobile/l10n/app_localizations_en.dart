// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Weekender';

  @override
  String get welcomeTitle =>
      'Find something to do.\nFind people to do it with.';

  @override
  String get continueWithPhone => 'Continue with phone';

  @override
  String get enterPhoneNumber => 'Enter your phone number';

  @override
  String get phoneNumberHint => '+91 98765 43210';

  @override
  String get sendOtp => 'Send code';

  @override
  String enterOtp(String phone) {
    return 'Enter the code sent to $phone';
  }

  @override
  String get verifyOtp => 'Verify';

  @override
  String get resendOtp => 'Resend code';

  @override
  String resendOtpIn(int seconds) {
    return 'Resend in ${seconds}s';
  }

  @override
  String get invalidOtp => 'That code doesn\'t match. Try again.';

  @override
  String get phoneRequired => 'Phone number is required';

  @override
  String get invalidPhone => 'Enter a valid Indian mobile number';

  @override
  String get enterYourName => 'What\'s your name?';

  @override
  String get namePlaceholder => 'Full name';

  @override
  String get nameRequired => 'Your name is required';

  @override
  String get enterDateOfBirth => 'When were you born?';

  @override
  String get ageRequirement => 'You must be 18 or older to join Weekender';

  @override
  String get underAgeError =>
      'You need to be at least 18 years old to use Weekender';

  @override
  String get selectGender => 'How do you identify?';

  @override
  String get genderMale => 'Man';

  @override
  String get genderFemale => 'Woman';

  @override
  String get genderNonBinary => 'Non-binary';

  @override
  String get genderPreferNotToSay => 'Prefer not to say';

  @override
  String get continueButton => 'Continue';

  @override
  String get errorGeneric => 'Something went wrong. Try again.';

  @override
  String get errorNetwork =>
      'No internet connection. Check your connection and try again.';

  @override
  String get errorSessionExpired =>
      'Your session expired. Please log in again.';

  @override
  String get loading => 'Loading…';
}
