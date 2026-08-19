# Iron Log

A progressive web app for tracking workouts and strength training progress.

## Features

- **Program Management**: Import workout programs from Excel files (e.g., Jeff Nippard's Min-Max Program)
- **Workout Tracking**: Log sets, reps, and weight for each exercise, with last session's
  weight and reps shown inline so you know what to beat
- **Workout History**: Every logged session is saved and browsable, and an unfinished
  workout picks up where you left off
- **Rest Timer**: Keeps running when you switch screens, background the app, or reload
- **Progress Tracking**: Monitor your strength gains over time
- **PWA Support**: Install on mobile devices for offline access
- **Dark Mode**: Easy on the eyes during those late-night gym sessions

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Backend**: Netlify Functions (serverless)
- **Database**: Neon PostgreSQL (serverless)
- **Authentication**: Clerk
- **Build Tool**: Vite
- **PWA**: vite-plugin-pwa with Workbox

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Neon database account
- Clerk account

### Environment Variables

Create a `.env` file in the root directory:

```env
# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Database
DATABASE_URL=postgresql://...
```

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Database Setup

Run the schema migrations in `schema.sql` against your Neon database.

## Project Structure

```
iron-log/
├── src/
│   ├── components/     # Reusable UI components
│   ├── contexts/       # React context providers
│   ├── lib/            # API client and utilities
│   ├── pages/          # Page components
│   └── types/          # TypeScript type definitions
├── netlify/
│   └── functions/      # Serverless API endpoints
├── public/             # Static assets and PWA icons
└── index.html
```

## API Endpoints

- `GET/POST /api/users` - User management
- `GET/POST /api/programs` - Program CRUD
- `GET /api/programs/:id` - Program details with blocks/weeks/workouts
- `POST /api/excel-import` - Import programs from Excel
- `GET/POST /api/user-programs` - User's enrolled programs
- `GET/POST /api/workout-logs` - Workout session logs (supports `?status=completed|in_progress`)
- `GET /api/workout-logs/:id` - A logged session with its exercises and sets
- `POST /api/exercise-logs` - Exercise logs within workouts
- `POST/PUT/DELETE /api/set-logs` - Individual set logs
- `GET /api/exercise-history` - Sets logged the last time each exercise was performed

## Deployment

The app is configured for Netlify deployment:

```bash
# Deploy to Netlify
netlify deploy --prod
```

## License

MIT
