#!/bin/sh
# ──────────────────────────────────────────────────────────────────────
# Shooter — One-line installer
#
#   curl -fsSL https://raw.githubusercontent.com/juspay/shooter/main/scripts/install.sh | sh
#
# POSIX sh compatible. Tested on macOS and Linux.
# ──────────────────────────────────────────────────────────────────────

set -e

# ── Globals ───────────────────────────────────────────────────────────

SHOOTER_DIR="$HOME/.shooter"
REPO_URL="https://github.com/juspay/shooter.git"
REPO_BRANCH="release"
REQUIRED_NODE_MAJOR=20
DEFAULT_PORT=3000

# ── Color helpers (degrade gracefully if tput is unavailable) ─────────

setup_colors() {
    if [ -t 1 ] && command -v tput >/dev/null 2>&1 && tput colors >/dev/null 2>&1; then
        BOLD="$(tput bold)"
        DIM="$(tput dim)"
        RED="$(tput setaf 1)"
        GREEN="$(tput setaf 2)"
        YELLOW="$(tput setaf 3)"
        BLUE="$(tput setaf 4)"
        CYAN="$(tput setaf 6)"
        RESET="$(tput sgr0)"
    else
        BOLD="" DIM="" RED="" GREEN="" YELLOW="" BLUE="" CYAN="" RESET=""
    fi
}

# ── Output helpers ────────────────────────────────────────────────────

info()    { printf '%s[*]%s %s\n' "$CYAN"   "$RESET" "$1"; }
success() { printf '%s[+]%s %s\n' "$GREEN"  "$RESET" "$1"; }
warn()    { printf '%s[!]%s %s\n' "$YELLOW" "$RESET" "$1"; }
error()   { printf '%s[-]%s %s\n' "$RED"    "$RESET" "$1"; }
step()    { printf '\n%s==>%s %s%s%s\n' "$BLUE" "$RESET" "$BOLD" "$1" "$RESET"; }

# ── Cleanup trap ──────────────────────────────────────────────────────

CLEANUP_CLONED=0

cleanup() {
    exit_code=$?
    if [ "$CLEANUP_CLONED" -eq 1 ] && [ -d "$SHOOTER_DIR" ]; then
        warn "Installation did not complete. Removing $SHOOTER_DIR ..."
        rm -rf "$SHOOTER_DIR"
    fi
    if [ "$exit_code" -ne 0 ]; then
        error "Installation failed. Please check the errors above and try again."
    fi
    exit "$exit_code"
}

trap cleanup EXIT INT TERM

# ── Prompt helper (works in pipe via /dev/tty) ────────────────────────

ask_yes_no() {
    prompt="$1"
    default="${2:-y}"
    if [ "$default" = "y" ]; then
        hint="[Y/n]"
    else
        hint="[y/N]"
    fi

    # If stdin is not a terminal (piped install), use the default.
    if [ ! -t 0 ]; then
        # Try /dev/tty as fallback for curl | sh
        if [ -r /dev/tty ]; then
            printf '%s %s ' "$prompt" "$hint" >/dev/tty
            read -r answer </dev/tty || answer=""
        else
            answer="$default"
        fi
    else
        printf '%s %s ' "$prompt" "$hint"
        read -r answer || answer=""
    fi

    answer="$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')"
    case "$answer" in
        y|yes) return 0 ;;
        n|no)  return 1 ;;
        "")
            if [ "$default" = "y" ]; then return 0; else return 1; fi
            ;;
        *) return 1 ;;
    esac
}

# ── Detect OS ─────────────────────────────────────────────────────────

detect_os() {
    OS="$(uname -s)"
    case "$OS" in
        Darwin) OS="macos" ;;
        Linux)  OS="linux" ;;
        *)      OS="unknown" ;;
    esac
}

# ── Banner ────────────────────────────────────────────────────────────

print_banner() {
    printf '\n'
    printf '%s' "$BOLD$CYAN"
    cat <<'BANNER'
   _____ _                 _
  / ____| |               | |
 | (___ | |__   ___   ___ | |_ ___ _ __
  \___ \| '_ \ / _ \ / _ \| __/ _ \ '__|
  ____) | | | | (_) | (_) | ||  __/ |
 |_____/|_| |_|\___/ \___/ \__\___|_|

BANNER
    printf '%s' "$RESET"
    printf '  %sMobile-first dev notifications & remote terminal%s\n' "$DIM" "$RESET"
    printf '  %shttps://github.com/juspay/shooter%s\n\n' "$DIM" "$RESET"
}

# ── Prerequisite checks ──────────────────────────────────────────────

check_git() {
    step "Checking prerequisites"

    if ! command -v git >/dev/null 2>&1; then
        error "git is not installed."
        printf '  Install it from: https://git-scm.com/downloads\n'
        exit 1
    fi
    success "git $(git --version | sed 's/git version //')"
}

check_node() {
    if ! command -v node >/dev/null 2>&1; then
        error "Node.js is not installed."
        printf '  Install Node.js %d+ from: https://nodejs.org\n' "$REQUIRED_NODE_MAJOR"
        exit 1
    fi

    node_version="$(node --version)"
    node_major="$(printf '%s' "$node_version" | sed 's/^v//' | cut -d. -f1)"

    if [ "$node_major" -lt "$REQUIRED_NODE_MAJOR" ]; then
        error "Node.js $node_version is too old. Version $REQUIRED_NODE_MAJOR+ is required."
        printf '  Update from: https://nodejs.org\n'
        exit 1
    fi
    success "Node.js $node_version"
}

check_pnpm() {
    if ! command -v pnpm >/dev/null 2>&1; then
        warn "pnpm is not installed."
        if ask_yes_no "  Install pnpm via 'npm install -g pnpm'?" "y"; then
            info "Installing pnpm..."
            npm install -g pnpm
            if ! command -v pnpm >/dev/null 2>&1; then
                error "pnpm installation failed. Please install it manually:"
                printf '  npm install -g pnpm\n'
                exit 1
            fi
            success "pnpm $(pnpm --version) (just installed)"
        else
            error "pnpm is required. Install it and try again:"
            printf '  npm install -g pnpm\n'
            exit 1
        fi
    else
        success "pnpm $(pnpm --version)"
    fi
}

# ── Handle existing installation ─────────────────────────────────────

handle_existing() {
    if [ -d "$SHOOTER_DIR" ]; then
        printf '\n'
        warn "$SHOOTER_DIR already exists."
        printf '\n'
        printf '  %s1)%s Update  — pull latest changes and reinstall\n' "$BOLD" "$RESET"
        printf '  %s2)%s Fresh   — remove and clone fresh\n' "$BOLD" "$RESET"
        printf '  %s3)%s Abort   — exit without changes\n' "$BOLD" "$RESET"
        printf '\n'

        # Read choice, handling piped stdin via /dev/tty
        if [ ! -t 0 ] && [ -r /dev/tty ]; then
            printf '  Choice [1/2/3]: ' >/dev/tty
            read -r choice </dev/tty || choice="3"
        elif [ -t 0 ]; then
            printf '  Choice [1/2/3]: '
            read -r choice || choice="3"
        else
            choice="3"
        fi

        case "$choice" in
            1)
                step "Updating existing installation"
                cd "$SHOOTER_DIR"
                git pull --rebase origin "$REPO_BRANCH"
                success "Repository updated."
                return 0
                ;;
            2)
                step "Removing existing installation"
                rm -rf "$SHOOTER_DIR"
                success "Removed $SHOOTER_DIR"
                return 1
                ;;
            *)
                info "Aborted. No changes made."
                # Disable cleanup trap since nothing was cloned
                CLEANUP_CLONED=0
                exit 0
                ;;
        esac
    fi
    return 1
}

# ── Clone ─────────────────────────────────────────────────────────────

clone_repo() {
    step "Cloning Shooter"
    CLEANUP_CLONED=1
    git clone --branch "$REPO_BRANCH" --single-branch "$REPO_URL" "$SHOOTER_DIR"
    CLEANUP_CLONED=0
    success "Cloned to $SHOOTER_DIR"
}

# ── Install dependencies ─────────────────────────────────────────────

install_deps() {
    step "Installing dependencies"
    cd "$SHOOTER_DIR"
    pnpm install
    success "Dependencies installed."
}

# ── Setup wizard ──────────────────────────────────────────────────────

run_setup_wizard() {
    step "Running setup wizard"

    if [ -f "$SHOOTER_DIR/scripts/setup.cjs" ]; then
        cd "$SHOOTER_DIR"
        node scripts/setup.cjs
    else
        warn "Setup wizard (scripts/setup.cjs) not found. Skipping."
        info "Creating .env from template..."
        if [ ! -f "$SHOOTER_DIR/.env" ]; then
            if [ -f "$SHOOTER_DIR/.env.example" ]; then
                cp "$SHOOTER_DIR/.env.example" "$SHOOTER_DIR/.env"
                success "Created .env from .env.example"
                warn "Edit $SHOOTER_DIR/.env to add your credentials."
            else
                warn "No .env.example found. You will need to create .env manually."
            fi
        else
            info ".env already exists. Skipping."
        fi

        info "Building the project..."
        cd "$SHOOTER_DIR"
        pnpm build
        success "Build complete."
    fi
}

# ── Global command ────────────────────────────────────────────────────

offer_global_command() {
    step "Global command"

    if ask_yes_no "  Install 'shooter' as a global command (via npm link)?" "y"; then
        cd "$SHOOTER_DIR"

        # Ensure package.json has a bin entry for the link to work.
        # If there is no bin field we create a thin wrapper.
        if ! grep -q '"bin"' "$SHOOTER_DIR/package.json" 2>/dev/null; then
            info "Creating global launcher script..."
            mkdir -p "$SHOOTER_DIR/bin"
            cat > "$SHOOTER_DIR/bin/shooter" <<'LAUNCHER'
#!/usr/bin/env node

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cmd = process.argv[2] || 'start';

const commands = {
    start:   'pnpm start',
    dev:     'pnpm dev',
    build:   'pnpm build',
    status:  'echo "Shooter root: ' + root + '"',
};

const toRun = commands[cmd] || `pnpm ${cmd}`;
try {
    execSync(toRun, { cwd: root, stdio: 'inherit' });
} catch { process.exit(1); }
LAUNCHER
            chmod +x "$SHOOTER_DIR/bin/shooter"

            # Patch package.json to add bin field via node (avoids jq dependency)
            node -e "
                const fs = require('fs');
                const p = JSON.parse(fs.readFileSync('$SHOOTER_DIR/package.json','utf8'));
                p.bin = { shooter: './bin/shooter' };
                fs.writeFileSync('$SHOOTER_DIR/package.json', JSON.stringify(p, null, 2) + '\n');
            "
        fi

        npm link 2>/dev/null || {
            warn "npm link failed (may need sudo on some systems)."
            warn "You can run it manually: cd $SHOOTER_DIR && sudo npm link"
        }
        success "'shooter' command installed globally."
    else
        info "Skipped. You can always run: cd $SHOOTER_DIR && npm link"
    fi
}

# ── Auto-start (macOS launchd) ────────────────────────────────────────

offer_autostart() {
    if [ "$OS" != "macos" ]; then
        return
    fi

    step "Auto-start (macOS)"

    PLIST_LABEL="com.shooter.server"
    PLIST_DIR="$HOME/Library/LaunchAgents"
    PLIST_FILE="$PLIST_DIR/$PLIST_LABEL.plist"

    if ask_yes_no "  Start Shooter automatically on login?" "n"; then
        mkdir -p "$PLIST_DIR"

        # Resolve paths
        NODE_PATH="$(command -v node)"
        TSX_PATH="$(command -v tsx || printf '%s' "$SHOOTER_DIR/node_modules/.bin/tsx")"
        LOG_DIR="$HOME/Library/Logs/Shooter"
        mkdir -p "$LOG_DIR"

        cat > "$PLIST_FILE" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${TSX_PATH}</string>
        <string>${SHOOTER_DIR}/server.ts</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${SHOOTER_DIR}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$(dirname "$NODE_PATH")</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/stdout.log</string>

    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/stderr.log</string>

    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
PLIST

        launchctl bootout "gui/$(id -u)/$PLIST_LABEL" 2>/dev/null || true
        launchctl bootstrap "gui/$(id -u)" "$PLIST_FILE"

        success "LaunchAgent installed. Shooter will start on login."
        info "  Logs: $LOG_DIR/"
        info "  Stop:    launchctl bootout gui/$(id -u)/$PLIST_LABEL"
        info "  Restart: launchctl kickstart -k gui/$(id -u)/$PLIST_LABEL"
    else
        info "Skipped. To start manually:"
        printf '  cd %s && pnpm start\n' "$SHOOTER_DIR"
        printf '\n'
        info "To set up auto-start later, create a LaunchAgent plist at:"
        printf '  %s\n' "$PLIST_FILE"
    fi
}

# ── Success message ───────────────────────────────────────────────────

print_success() {
    printf '\n'
    printf '%s' "$GREEN$BOLD"
    printf '  ================================================\n'
    printf '      Shooter installed successfully!\n'
    printf '  ================================================\n'
    printf '%s' "$RESET"
    printf '\n'
    printf '  %sInstall directory:%s  %s\n' "$BOLD" "$RESET" "$SHOOTER_DIR"
    printf '  %sServer URL:%s         http://localhost:%s\n' "$BOLD" "$RESET" "$DEFAULT_PORT"
    printf '\n'
    printf '  %sGet started:%s\n' "$BOLD" "$RESET"
    printf '    cd %s\n' "$SHOOTER_DIR"
    printf '    pnpm start              %s# start the server%s\n' "$DIM" "$RESET"
    printf '    pnpm dev                %s# development mode%s\n' "$DIM" "$RESET"
    printf '\n'
    printf '  %sConfigure:%s\n' "$BOLD" "$RESET"
    printf '    Edit %s/.env with your credentials\n' "$SHOOTER_DIR"
    printf '    See  %s/.env.example for reference\n' "$SHOOTER_DIR"
    printf '\n'
    printf '  %sDocs:%s https://github.com/juspay/shooter\n' "$BOLD" "$RESET"
    printf '\n'
}

# ── Main ──────────────────────────────────────────────────────────────

main() {
    setup_colors
    detect_os
    print_banner

    # Prerequisites
    check_git
    check_node
    check_pnpm

    # Clone or update
    already_installed=0
    if handle_existing; then
        already_installed=1
    fi

    if [ "$already_installed" -eq 0 ]; then
        clone_repo
    fi

    # Install & build
    install_deps
    run_setup_wizard

    # Optional extras
    offer_global_command
    offer_autostart

    # Done
    print_success
}

main "$@"
