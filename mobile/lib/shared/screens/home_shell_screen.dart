import 'package:flutter/material.dart';

// Phase 1: empty home shell. Populated in Phase 2+.
class HomeShellScreen extends StatelessWidget {
  const HomeShellScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Weekender')),
      body: const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('You\'re in 🎉', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            SizedBox(height: 8),
            Text('Activity discovery coming in Phase 2', style: TextStyle(color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}
