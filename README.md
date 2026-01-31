# IntermediAItor - AI-Powered Conflict Resolution

A POC application for multi-participant conflict resolution using AI mediation through structured rounds of fact-finding.

## Features

- **Multi-participant sessions**: Support for 2+ parties in conflict
- **4-round structured mediation**: AI-guided question rounds with progressive context building
- **Dispute marking system**: Participants can dispute responses (when visibility enabled)
- **Flexible visibility modes**: Blind or open response sharing
- **Multi-LLM support**: Compatible with OpenAI, Claude, Gemini, or local LM Studio
- **Final judgment**: AI-generated analysis with fault assignment and reasoning

## Quick Start

### Prerequisites

- Docker and Docker Compose
- LLM API key (Gemini, OpenAI, or Claude) OR LM Studio running locally

### Running with Docker

1. Clone the repository
2. Copy `.env.example` to `.env` and configure your LLM settings
3. Run: `docker-compose up --build`
4. Open browser to `http://localhost:3000`

### Configuration

Edit `.env` file:
- `LLM_PROVIDER`: Choose from `openai`, `claude`, `gemini`, or `lmstudio`
- `LLM_API_KEY`: Your API key (not needed for lmstudio)
- `LLM_BASE_URL`: For LM Studio, set to `http://host.docker.internal:1234/v1`
- `LLM_MODEL`: Model name (e.g., `gpt-4`, `claude-3-sonnet`, `gemini-pro`)

## Architecture

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: React + Socket.io Client
- **Database**: SQLite
- **Deployment**: Docker Compose

## Session Flow

1. Initiator creates session with participant count and visibility setting
2. Each participant receives unique join link
3. Participants join and describe their perspective
4. AI conducts 4 rounds of targeted questions
5. Participants can dispute responses (if visibility enabled)
6. AI generates final judgment with fault analysis

## Development

See individual README files in `/backend` and `/frontend` directories.
