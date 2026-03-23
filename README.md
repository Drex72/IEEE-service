# IEEE Sponsorship Outreach Platform

Full-stack outreach platform for the IES UNILAG hardware/electrical engineering hackathon. It accepts the sponsorship tracker workbook, researches each company, generates personalized sponsorship emails, stores editable templates in Supabase, and sends through Gmail OAuth.

## Stack

- `apps/web`: Next.js App Router + TypeScript + Tailwind
- `apps/api`: FastAPI + OpenAI research/generation agents + Gmail integration
- `supabase/migrations`: SQL schema for companies, templates, Gmail tokens, and email logs

## What is implemented

- Excel upload and parsing for the provided tracker shape
- Supabase-backed company storage
- Agent pipeline for:
  - company research
  - leadership research
  - context synthesis
  - personalized email generation
- Template fetch, edit, save, and regenerate flows
- Gmail OAuth connection and API-based sending with attachments
- Dashboard, upload flow, company detail editor, and Gmail settings page

## Project structure

```text
.
├── apps
│   ├── api
│   │   ├── app
│   │   │   ├── api/routes
│   │   │   ├── core
│   │   │   ├── models
│   │   │   └── services
│   │   └── tests
│   └── web
│       ├── app
│       ├── components
│       └── lib
└── supabase
    └── migrations
```

## Setup

1. Create a Supabase project and apply [`supabase/migrations/0001_init.sql`](/Users/apple/Documents/IEEE/supabase/migrations/0001_init.sql).
2. Copy [`apps/api/.env.example`](/Users/apple/Documents/IEEE/apps/api/.env.example) to `apps/api/.env` and fill in:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - Gmail OAuth credentials
3. Generate a Fernet key for Gmail token encryption:

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

4. Copy [`apps/web/.env.example`](/Users/apple/Documents/IEEE/apps/web/.env.example) to `apps/web/.env.local`.
5. Install and run the API:

```bash
cd apps/api
uv sync --extra dev
uv run uvicorn app.main:app --reload --port 8000
```

6. Install and run the frontend:

```bash
cd apps/web
npm install
npm run dev
```

## Gmail OAuth notes

- Set the Google OAuth redirect URI to `http://localhost:8000/api/gmail/callback`.
- The backend stores encrypted access and refresh tokens in `gmail_accounts`.
- The frontend uses an `owner_key` header so the app works even before full auth is added.

## OpenAI flow

The API uses four agents in sequence:

1. Company research agent
2. Leadership research agent
3. Context synthesizer
4. Email generation agent

The generated context is saved with the template so the user can review why a message was written the way it was.

## API endpoints

- `POST /api/upload-companies`
- `GET /api/companies`
- `GET /api/companies/{company_id}`
- `POST /api/generate/{company_id}`
- `POST /api/regenerate/{company_id}`
- `GET /api/template/{company_id}`
- `PATCH /api/template/{company_id}`
- `GET /api/gmail/status`
- `GET /api/gmail/auth-url`
- `GET /api/gmail/callback`
- `POST /api/gmail/send`

## Notes

- The Excel parser is tuned to the uploaded `IES_Unilag_Hackathon_Sponsor_Tracker_v2` format, including row-4 headers and the second-sheet instructions.
- The current workspace owner model is `owner_key` based, which makes local testing easy. You can later replace it with Supabase Auth session IDs without changing the table relationships.
- If you want background jobs, the clean next step is to move generation and send actions into a queue worker while keeping the same API contract.

