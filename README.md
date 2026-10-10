# Lovioa

> An open-source AI image prompt gallery and creative workspace for discovering, generating, remixing, and organizing visual ideas.

Lovioa brings **AI image prompts**, **prompt engineering**, and **image generation** into one full-stack creative workflow. Browse a curated prompt gallery, study the structure behind strong visual results, generate new images through an OpenAI-compatible API, and keep your creative history in one place.

It is built for creators, designers, developers, and teams who want a practical foundation for an AI image generation product rather than a collection of disconnected demos.

## What It Includes

- **AI prompt gallery** for discovering and studying reusable image prompts
- **Text-to-image generation** through server-side OpenAI-compatible APIs
- **Image-to-image editing** with reference uploads and style instructions
- **Prompt discovery** with search, categories, tags, saved items, and related work
- **Creative history** for tracking generated images and previous experiments
- **User accounts** with profiles, likes, saves, uploads, and session-based auth
- **Content moderation** before generation and publication workflows
- **Admin workspace** for users, prompts, jobs, analytics, moderation, and activity logs
- **Optional integrations** for S3-compatible storage, Google Sign-In, email, billing, and LLM-assisted tagging
- **Internationalization** with multiple locales and locale-aware assets
- **SEO foundations** including canonical URLs, Open Graph metadata, JSON-LD, sitemap, and robots rules

## Why Lovioa

Lovioa is designed as a self-hostable and extensible base for AI creative products:

- Keep provider credentials on the server instead of exposing them in frontend builds.
- Swap image, moderation, tagging, email, billing, and object-storage providers through environment configuration.
- Start with SQLite for local development and move generated assets to S3-compatible storage when needed.
- Extend the prompt gallery, generation queue, admin tools, and user workflows without replacing the application shell.

## Tech Stack

- **Frontend:** React, Vite, React Router, Framer Motion, i18next, Lucide React
- **Backend:** Node.js, Express, better-sqlite3, Multer
- **Storage:** SQLite locally, optional S3-compatible object storage or Cloudflare R2
- **Authentication:** Server-side sessions, bcrypt password hashing, optional Google Sign-In
- **Payments:** Optional Stripe and hosted checkout integrations
- **Styling:** CSS variables and component/page styles without Tailwind

## Quick Start

### Requirements

- Node.js 20 or newer
- npm
- An OpenAI-compatible image API for generation features

### Install

```bash
npm install
cd server && npm install && cd ..
cp .env.example .env
cp server/.env.example server/.env
```

### Run Locally

Start the frontend:

```bash
npm run dev
```

Start the backend in a second terminal:

```bash
cd server && npm start
```

The Vite development server proxies API requests to the local backend. Runtime databases, uploads, generated media, logs, browser artifacts, and local environment files are intentionally excluded from version control.

## Configuration

The minimum server-side generation configuration is:

```env
OPENAI_API_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
```

Optional providers and features are documented in:

- `.env.example`
- `server/.env.example`

Keep real credentials in local environment files or a deployment secret manager. Never put private API keys in `VITE_*` variables or frontend source code.

## Project Structure

```text
src/       React frontend and user-facing workflows
server/    Express API, workers, services, and database access
public/    Public static assets
scripts/   Selected local data utilities
```

## Security

Read [SECURITY.md](SECURITY.md) before deploying or opening an issue. Do not commit API keys, access tokens, passwords, databases, uploads, generated media, logs, or local environment files.

## Contributing

Issues and pull requests are welcome. When proposing a change, include the user workflow it improves and keep provider-specific credentials and deployment details out of source code.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
