# Weekender — Claude Engineering Rules

## Before you write any code

1. Read `docs/PRD.md` before implementing features.
2. Read `docs/ARCHITECTURE.md` before making architectural changes.
3. Check which phase the feature belongs to — do not implement future-phase functionality.

## Core rules — never break these

4. Do NOT introduce new technologies without explaining why and getting approval.
5. Do NOT change the database schema without a Prisma migration.
6. NEVER expose phone numbers in any API response or log.
7. NEVER store raw Aadhaar or PAN numbers — store only reference IDs from the KYC provider.
8. NEVER bypass KYC requirements for restricted activities.
9. NEVER trust client-side authorization — all access control is enforced server-side.
10. NEVER trust client-side payment confirmation — only Razorpay webhooks update payment status.
11. Every new business feature must have unit and integration tests.

## Phase discipline

12. Do NOT implement Phase 2 or later features until Phase 1 acceptance criteria pass.
13. Do NOT introduce microservices, Kubernetes, or Kafka without explicit architectural approval.

## Security rules

14. NEVER hardcode secrets or API keys in source code.
15. NEVER commit `.env` files — use `.env.example` only.
16. All file uploads must use S3 pre-signed URLs — never accept file data in the API body.
17. Stream Chat channel membership is managed server-side only — clients never manage their own channels.
18. Agora RTC tokens are short-lived and issued only to verified group members.
19. Exact activity locations are revealed only to approved participants after host finalisation.

## Code quality

20. Maintain Swagger/OpenAPI documentation for every backend endpoint.
21. Follow the feature-based architecture in both the backend and Flutter app.
22. Keep the backend as a modular monolith — no cross-module direct DB queries.
23. Ask for approval before any major architectural change.
24. Prefer simple, direct solutions over unnecessary abstractions.
25. Preserve backward compatibility when modifying existing API endpoints.

## Repository structure

```
weekender/
├── backend/          NestJS API
├── mobile/           Flutter app
├── admin/            Next.js admin dashboard
├── docs/             Architecture and API documentation
├── infrastructure/   AWS IaC (Phase 12)
├── docker-compose.yml
└── CLAUDE.md
```
