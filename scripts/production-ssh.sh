#!/usr/bin/env bash
set -euo pipefail

# Production connection helper.
# Authentication is intentionally delegated to SSH; no password is stored here.

DEFAULT_KEY="${HOME}/.ssh/lovioa-production"
DEFAULT_HOST="85.189.88.8"
DEFAULT_PORT="2217"
DEFAULT_USER="root"

HOST="${PRODUCTION_HOST:-$DEFAULT_HOST}"
PORT="${PRODUCTION_PORT:-$DEFAULT_PORT}"
USER="${PRODUCTION_USER:-$DEFAULT_USER}"
KEY="${PRODUCTION_SSH_KEY:-}"

if [[ -z "$KEY" && -f "$DEFAULT_KEY" ]]; then
  KEY="$DEFAULT_KEY"
fi

usage() {
  cat <<'EOF'
Usage:
  scripts/production-ssh.sh                         Open a production shell
  scripts/production-ssh.sh --shell                 Open a production shell
  scripts/production-ssh.sh --check                 Check SSH and service status
  scripts/production-ssh.sh --exec "command"        Run one command remotely
  scripts/production-ssh.sh "command"               Legacy command form
  scripts/production-ssh.sh --help                  Show this help

Connection defaults:
  PRODUCTION_HOST       SSH host, default: 85.189.88.8
  PRODUCTION_PORT       SSH port, default: 2217
  PRODUCTION_USER       SSH user, default: root
  PRODUCTION_SSH_KEY    Private key path; defaults to ~/.ssh/lovioa-production

Examples:
  scripts/production-ssh.sh --check
  scripts/production-ssh.sh --exec "systemctl status promptfolio.service --no-pager"
  PRODUCTION_SSH_KEY="$HOME/.ssh/your-production-key" scripts/production-ssh.sh --shell
EOF
}

MODE="${1:-}"

if [[ "$MODE" == "--help" || "$MODE" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "$MODE" != "" && "$MODE" != "--shell" && "$MODE" != "--check" && "$MODE" != "--exec" ]]; then
  # Keep the original command-string form working for existing callers.
  MODE="--exec"
fi

if [[ "$MODE" == "--exec" && "$#" -lt 2 ]]; then
  echo "error: --exec requires a command string" >&2
  echo "hint: run '$0 --help' for usage" >&2
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "error: ssh command not found" >&2
  exit 1
fi

if [[ -n "$KEY" && ! -f "$KEY" ]]; then
  echo "error: SSH key not found: $KEY" >&2
  exit 1
fi

SSH_ARGS=(
  -p "$PORT"
  -o ConnectTimeout=10
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=3
  -o PreferredAuthentications=publickey,password
  -o PubkeyAuthentication=yes
  -o PasswordAuthentication=yes
)

if [[ -n "$KEY" ]]; then
  SSH_ARGS+=(-i "$KEY" -o IdentitiesOnly=yes)
fi

TARGET="${USER}@${HOST}"

if [[ "$MODE" == "" || "$MODE" == "--shell" ]]; then
  exec ssh -tt "${SSH_ARGS[@]}" "$TARGET"
fi

if [[ "$MODE" == "--check" ]]; then
  exec ssh "${SSH_ARGS[@]}" "$TARGET" \
    'hostname && printf "service=" && systemctl is-active promptfolio.service'
fi

if [[ "$1" == "--exec" ]]; then
  shift
fi

exec ssh "${SSH_ARGS[@]}" "$TARGET" "$*"
