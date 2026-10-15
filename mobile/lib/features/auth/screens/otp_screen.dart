import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../providers/auth_provider.dart';

class OtpScreen extends ConsumerStatefulWidget {
  final String phoneNumber;

  const OtpScreen({super.key, required this.phoneNumber});

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _controller = TextEditingController();
  bool _loading = false;
  String? _error;
  int _resendCountdown = 60;
  Timer? _timer;

  // verificationId is passed via GoRouter extra — retrieved in didChangeDependencies
  String _verificationId = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final extra = GoRouterState.of(context).extra;
    if (extra is Map) {
      _verificationId = extra['verificationId'] as String? ?? '';
    }
    _startResendTimer();
  }

  void _startResendTimer() {
    _timer?.cancel();
    setState(() => _resendCountdown = 60);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_resendCountdown <= 0) {
        t.cancel();
        return;
      }
      setState(() => _resendCountdown--);
    });
  }

  Future<void> _verify() async {
    final code = _controller.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Enter the 6-digit code');
      return;
    }
    setState(() { _loading = true; _error = null; });

    try {
      final credential = PhoneAuthProvider.credential(
        verificationId: _verificationId,
        smsCode: code,
      );
      final result = await FirebaseAuth.instance.signInWithCredential(credential);
      final idToken = await result.user!.getIdToken();

      await ref.read(authNotifierProvider.notifier).syncWithBackend(idToken!);

      final authState = ref.read(authNotifierProvider);
      if (!mounted) return;

      if (authState.profileComplete) {
        context.go('/home');
      } else {
        context.go('/onboarding/dob');
      }
    } on FirebaseAuthException catch (e) {
      setState(() {
        _loading = false;
        _error = e.code == 'invalid-verification-code'
            ? 'That code doesn\'t match. Try again.'
            : 'Verification failed. Try again.';
      });
    } catch (_) {
      setState(() {
        _loading = false;
        _error = 'Something went wrong. Try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(leading: const BackButton()),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(),
              Text(
                'Enter the code',
                style: Theme.of(context).textTheme.headlineLarge?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text(
                'Sent to ${widget.phoneNumber}',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey[600]),
              ),
              const SizedBox(height: 32),
              TextFormField(
                controller: _controller,
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(6),
                ],
                decoration: InputDecoration(
                  hintText: '------',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  errorText: _error,
                ),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _loading ? null : _verify,
                  child: _loading
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Verify'),
                ),
              ),
              const SizedBox(height: 16),
              Center(
                child: _resendCountdown > 0
                    ? Text(
                        'Resend code in ${_resendCountdown}s',
                        style: TextStyle(color: Colors.grey[500]),
                      )
                    : TextButton(
                        onPressed: () => context.pop(),
                        child: const Text('Resend code'),
                      ),
              ),
              const Spacer(flex: 2),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }
}
