# Security Policy

## Reporting a Vulnerability

Please report suspected security issues privately through the repository owner's GitHub security contact rather than opening a public issue.

Do not include API keys, access tokens, passwords, personal data, production URLs, or database files in public reports.

## Development Rules

- Keep secrets in environment variables or a secret manager.
- Do not expose server credentials through `VITE_*` variables.
- Do not commit databases, uploads, generated media, logs, backups, or local environment files.
- Rotate any credential that has appeared in source code, logs, screenshots, or version-control history.
