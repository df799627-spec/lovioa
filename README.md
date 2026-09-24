# Lovioa

Lovioa is an AI image prompt gallery and creation workspace built with React, Vite, Express, and SQLite. It supports prompt discovery, image generation, user accounts, history, uploads, moderation, and optional billing integrations.

## Requirements

- Node.js 20 or newer
- npm
- An OpenAI-compatible image API for generation features
- Optional: S3-compatible storage, Google Sign-In, email, and billing provider credentials

## Local Setup

```bash
npm install
cd server && npm install && cd ..
cp .env.example .env
cp server/.env.example server/.env
```

Keep real credentials in local environment files or a deployment secret manager. Never put API keys in `VITE_*` variables or frontend source code.

## Development

Run the frontend:

```bash
npm run dev
```

Run the backend in a second terminal:

```bash
cd server && npm start
```

The frontend uses the local backend proxy at `http://localhost:3001`. Runtime databases, uploads, generated images, logs, browser artifacts, internal planning documents, and deployment helpers are intentionally excluded from the public repository.

## Configuration

The minimum server-side image generation configuration is:

```env
OPENAI_API_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
```

Optional integrations are documented in `.env.example` and `server/.env.example`. Leave them empty or disabled for local development unless you have configured the corresponding provider.

## Project Structure

```text
src/       React frontend
server/    Express API, workers, and database access
public/    Public static assets
scripts/   Local data and maintenance utilities
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
