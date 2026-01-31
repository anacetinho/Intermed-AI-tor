# IntermediAItor - Quick Start Guide

This guide will help you get IntermediAItor running with Docker.

## Prerequisites

1. **Docker Desktop** installed and running
2. **LLM Access** - Choose one:
   - Gemini API key (recommended for POC)
   - OpenAI API key
   - Claude API key
   - LM Studio running locally

## Setup Instructions

### Backend Setup
1. Navigate to the backend directory: `cd backend`
2. Install dependencies: `npm install`
3. Copy environment template: `cp .env.example .env`
4. Update `.env` with your configuration:
   - Set your Gemini API key in `LLM_API_KEY`
   - Configure your LM Studio URL if using local model
   - **Email Configuration**: Set up email delivery by configuring the following fields:
     ```env
     EMAIL_HOST=smtp.example.com
     EMAIL_PORT=587
     EMAIL_SECURE=false
     EMAIL_USER=your-email@example.com
     EMAIL_PASS=your-app-password
     EMAIL_FROM=intermediator@yourdomain.com
     ```
     Note: Use an app password for Gmail or other email providers that require 2FA.
5. Start the server: `npm run dev`

**For Gemini (Recommended):**
```env
LLM_PROVIDER=gemini
LLM_API_KEY=your_gemini_api_key_here
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta
LLM_MODEL=gemini-pro
```

**For OpenAI:**
```env
LLM_PROVIDER=openai
LLM_API_KEY=your_openai_api_key_here
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4
```

**For Claude:**
```env
LLM_PROVIDER=claude
LLM_API_KEY=your_claude_api_key_here
LLM_BASE_URL=https://api.anthropic.com/v1
LLM_MODEL=claude-3-sonnet-20240229
```

**For LM Studio (Local):**
```env
LLM_PROVIDER=lmstudio
LLM_API_KEY=not-needed
LLM_BASE_URL=http://host.docker.internal:1234/v1
LLM_MODEL=local-model
```

### 2. Build and Run with Docker

From the project root directory:

```bash
docker-compose up --build
```

This will:
- Build the backend and frontend containers
- Start the services
- Backend will be available on `http://localhost:5000`
- Frontend will be available on `http://localhost:3000`

### 3. Access the Application

Open your browser to: **http://localhost:3000**

## Using IntermediAItor

### Creating a Session

1. Go to http://localhost:3000
2. Set the number of participants (minimum 2)
3. Choose visibility mode:
   - **Blind Mode**: Responses hidden until final judgment
   - **Open Mode**: Participants can see and dispute responses
4. Optionally add an initial conflict description
5. Click "Create Session"
6. Share the unique participant links with each person involved

### Joining a Session

1. Each participant clicks their unique link
2. Wait for all participants to join
3. The session initiator starts the mediation

### During the Session

1. **4 Rounds of Questions**: AI asks targeted questions to each participant
2. **Answer Questions**: Respond honestly and thoroughly
3. **Dispute Responses** (Open Mode): Mark responses you disagree with
4. **AI Analysis**: After Round 4, AI generates comprehensive judgment

### Final Judgment

The AI provides:
- Overview of the conflict
- Information gathered from each participant
- Detailed analysis
- Fault assessment with percentages
- Reasoning behind the judgment
- Final verdict
- Recommendations

## Stopping the Application

Press `Ctrl+C` in the terminal, then run:
```bash
docker-compose down
```

## Troubleshooting

### Can't connect to LM Studio
- Ensure LM Studio is running
- Make sure a model is loaded
- Check that LM Studio's server is enabled (usually on port 1234)

### Backend crashes
- Check your LLM API key is correct
- View logs: `docker-compose logs backend`

### Frontend can't reach backend
- Ensure both containers are running: `docker-compose ps`
- Check Docker network: `docker network ls`

## Development Mode

To run in development mode with hot reload:

**Backend:**
```bash
cd backend
npm install
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

## Data Persistence

Session data is stored in `./data/intermediator.db` (SQLite database).
This file persists even when containers are stopped.

## Getting API Keys

- **Gemini**: https://makersuite.google.com/app/apikey
- **OpenAI**: https://platform.openai.com/api-keys
- **Claude**: https://console.anthropic.com/

## Support

For issues or questions, check the logs:
```bash
docker-compose logs -f
```
