# Course Compass

Course Compass is a full-stack academic planning app built to help students manage courses, assignments, and weekly study schedules in one place. The project includes a MERN-based API, a React web frontend, and a Flutter mobile client.

## Live Links
- **Web App:** https://team12.me
- **API:** https://team12.me/api
- **Mobile Web:** https://mobile.team12.me

## Team
- **Seddik Belbikkey** — API & Backend Integration
- **Alessandra Duque** — Project Manager
- **Zineb Kazzaz** — Website Frontend
- **William Southerland** — Database
- **Sami Djahankhah** — Mobile Frontend

## Project Overview
Course Compass was built as a professional academic productivity platform for students. It allows users to keep track of courses, assignments, due dates, and progress from both web and mobile. It also adds planning tools such as AI-generated time estimates and a weekly study planner based on user availability.

The goal of the project is to give students one central place to organize school work instead of relying on scattered tools.

## Main Features
- User authentication with email verification
- Login, forgot password, and reset password flows
- Account update and account deletion
- Course creation, editing, and deletion
- Assignment creation, editing, deletion, and completion tracking
- Canvas integration for importing courses and assignments
- AI-generated assignment time estimates
- Weekly study plan generation
- User preferences for theme, first day of week, and planner settings
- Access through both web and mobile clients

## Tech Stack

### Backend / API
- Node.js
- Express
- MongoDB
- Mongoose
- JWT authentication
- Nodemailer
- Axios
- dotenv
- Groq API integration

### Web Frontend
- React
- TypeScript
- Vite
- React Router DOM
- Axios

### Mobile Frontend
- Flutter
- Dart

## API Overview
Base URL:

```text
https://team12.me/api
```

### Route Groups
- `/auth` — registration, login, email verification, password reset, account settings, preferences
- `/courses` — create, read, update, and delete courses
- `/assignments` — create, read, update, delete, and estimate assignment time
- `/canvas` — Canvas settings, sync, and auto-sync checks
- `/planner` — planner preferences, schedule generation, saved schedules, and session updates

## Core Data Models
- **User** — account info, verification state, preferences, Canvas settings, study planner settings
- **Course** — course title, code, instructor, semester, color, Canvas mapping
- **Assignment** — course link, due date, type, completion state, estimated time, source
- **StudyPlan** — weekly sessions, warnings, and unscheduled items
- **CanvasIntegration** — Canvas connection metadata

## Authentication Flow
Course Compass uses an email verification flow before full registration. After login, protected API routes are accessed with a JWT token. The system also supports forgot password and reset password through email verification codes.

## Canvas Integration
Users can connect Canvas by saving a Canvas token and Canvas URL. Once connected, the app can:
- import active Canvas courses
- import assignments
- mirror assignment completion state when possible
- store sync settings such as daily, weekly, or monthly sync frequency

## AI and Planning Features
The app includes two planning-focused features:
- **AI time estimation:** estimates how many hours an assignment may take
- **Study planner:** generates weekly study sessions based on due dates, remaining workload, and the user's available time blocks

This makes the project more than a basic task tracker and turns it into a planning tool.

## Local Setup

### Backend
```bash
cd api
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Mobile
```bash
cd mobile
flutter pub get
flutter run
```

## Environment Variables
Create a `.env` file inside `api/`:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
EMAIL_USER=your_email_address
EMAIL_PASS=your_email_password_or_app_password
GROQ_API_KEY=your_groq_api_key
```

## License
UCF-COP4331C Team 12.
