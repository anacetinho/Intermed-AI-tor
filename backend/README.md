# Backend - IntermediAItor

Node.js backend server with Express and Socket.io for real-time conflict mediation sessions.

## Setup

```bash
npm install
npm run dev
```

## Environment Variables

See `.env.example` in root directory.

## API Endpoints

- `POST /api/sessions` - Create new mediation session
- `GET /api/sessions/:sessionId` - Get session details
- `GET /api/sessions/:sessionId/join/:token` - Join session with participant token

## Socket Events

- `join-session` - Join a session room
- `submit-response` - Submit answer to AI question
- `mark-dispute` - Mark another participant's response as disputed
- `round-complete` - Broadcast when round completes
- `judgment-ready` - Final AI judgment available
