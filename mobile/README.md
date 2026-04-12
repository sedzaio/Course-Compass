# Course Compass - Mobile App

Mobile frontend for Course Compass, built with Flutter and Dart.

## Tech Stack
- Flutter
- Dart
- HTTP package for API calls
- Shared Preferences for JWT token storage

## Backend
Connects to the Course Compass REST API at `https://team12.me/api`

## Screens
- Login (with email validation and forgot password)
- Register (3-step email verification flow)
- Dashboard (assignments list, add assignment)
- Courses (list, add, delete courses)
- Study Planner (weekly view, AI plan generation)
- Settings (account, Canvas LMS integration, logout, close account)

## Getting Started
```bash
flutter pub get
flutter run -d chrome
```

## Notes
- JWT token is stored locally and persists across sessions
- All protected routes send Authorization: Bearer <token> header
- Canvas LMS integration available in Settings