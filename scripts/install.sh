#!/bin/sh
# ──────────────────────────────────────────────────────────────────────
# Shooter — One-line installer
#
#   curl -fsSL https://raw.githubusercontent.com/juspay/shooter/release/scripts/install.sh | sh
#
# POSIX sh compatible. Tested on macOS and Linux.
# ──────────────────────────────────────────────────────────────────────

set -e

# ── Globals ───────────────────────────────────────────────────────────

SHOOTER_HOME="$HOME/.shooter"
SHOOTER_REPO="$SHOOTER_HOME/repo"
REPO_URL="https://github.com/juspay/shooter.git"
REPO_BRANCH="release"
REQUIRED_NODE_MAJOR=20
DEFAULT_PORT=54007

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
    if [ "$CLEANUP_CLONED" -eq 1 ] && [ -d "$SHOOTER_REPO" ]; then
        warn "Installation did not complete. Removing $SHOOTER_REPO ..."
        rm -rf "$SHOOTER_REPO"
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

check_xcode_clt() {
    if ! xcode-select -p >/dev/null 2>&1; then
        warn "Xcode Command Line Tools are required for native modules (node-pty, better-sqlite3)."
        if ask_yes_no "  Install Xcode Command Line Tools now?" "y"; then
            info "Running xcode-select --install..."
            xcode-select --install 2>/dev/null
            info "Follow the system dialog to complete installation, then re-run this script."
            exit 0
        else
            error "Cannot continue without Xcode Command Line Tools."
            exit 1
        fi
    fi
    success "Xcode Command Line Tools installed"
}

check_linux_build_tools() {
    missing=""
    for tool in make g++ python3; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            missing="$missing $tool"
        fi
    done

    if [ -n "$missing" ]; then
        warn "Build tools required for native modules:$missing"

        # Detect package manager and suggest install command
        if command -v apt-get >/dev/null 2>&1; then
            install_cmd="sudo apt-get install -y python3 make g++"
        elif command -v dnf >/dev/null 2>&1; then
            install_cmd="sudo dnf install -y python3 make gcc-c++"
        elif command -v yum >/dev/null 2>&1; then
            install_cmd="sudo yum install -y python3 make gcc-c++"
        elif command -v pacman >/dev/null 2>&1; then
            install_cmd="sudo pacman -S python make gcc"
        elif command -v apk >/dev/null 2>&1; then
            install_cmd="sudo apk add python3 make g++"
        else
            install_cmd="(install python3, make, and g++ using your package manager)"
        fi

        if ask_yes_no "  Install build tools now? ($install_cmd)" "y"; then
            info "Installing build tools..."
            $install_cmd
            success "Build tools installed."
        else
            error "Build tools are required for native modules (node-pty, better-sqlite3)."
            error "Install them manually:$missing"
            exit 1
        fi
    else
        success "Build tools available (make, g++, python3)"
    fi
}

# ── Node detection chain ────────────────────────────────────────────

check_node_version() {
    candidate="$1"
    ver="$("$candidate" --version 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
    [ -n "$ver" ] && [ "$ver" -ge "$REQUIRED_NODE_MAJOR" ] 2>/dev/null
}

find_node() {
    # 1. PATH
    candidate="$(command -v node 2>/dev/null)"
    if [ -n "$candidate" ] && check_node_version "$candidate"; then
        printf '%s' "$candidate"
        return 0
    fi

    # 2. nvm
    NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        . "$NVM_DIR/nvm.sh"
        candidate="$(command -v node 2>/dev/null)"
        if [ -n "$candidate" ] && check_node_version "$candidate"; then
            printf '%s' "$candidate"
            return 0
        fi
    fi

    # 3. fnm
    if command -v fnm >/dev/null 2>&1; then
        eval "$(fnm env 2>/dev/null)"
        candidate="$(command -v node 2>/dev/null)"
        if [ -n "$candidate" ] && check_node_version "$candidate"; then
            printf '%s' "$candidate"
            return 0
        fi
    fi

    # 4. volta
    if [ -x "$HOME/.volta/bin/node" ] && check_node_version "$HOME/.volta/bin/node"; then
        printf '%s' "$HOME/.volta/bin/node"
        return 0
    fi

    # 5. Homebrew (installed but not linked)
    for brew_node in /opt/homebrew/bin/node /usr/local/bin/node; do
        if [ -x "$brew_node" ] && check_node_version "$brew_node"; then
            printf '%s' "$brew_node"
            return 0
        fi
    done

    return 1
}

check_node() {
    NODE_BIN="$(find_node)" || true
    if [ -n "$NODE_BIN" ]; then
        node_version="$("$NODE_BIN" --version)"
        success "Node.js $node_version ($NODE_BIN)"
        export PATH="$(dirname "$NODE_BIN"):$PATH"
        return 0
    fi

    # Fallback: install via Homebrew
    if command -v brew >/dev/null 2>&1; then
        warn "Node.js >= $REQUIRED_NODE_MAJOR not found."
        if ask_yes_no "  Install Node.js via Homebrew?" "y"; then
            info "Installing Node.js..."
            brew install node
            NODE_BIN="$(command -v node)"
            if [ -n "$NODE_BIN" ] && check_node_version "$NODE_BIN"; then
                success "Node.js $("$NODE_BIN" --version) (installed via Homebrew)"
                return 0
            fi
        fi
    fi

    error "Node.js >= $REQUIRED_NODE_MAJOR is required."
    printf '  Install from: https://nodejs.org\n'
    exit 1
}

bootstrap_pnpm() {
    # Try corepack first
    if command -v corepack >/dev/null 2>&1; then
        if corepack enable 2>/dev/null; then
            # Pre-download pnpm to avoid interactive prompt during install
            COREPACK_ENABLE_AUTO_PIN=0 corepack prepare pnpm@10.28.2 --activate 2>/dev/null
            if command -v pnpm >/dev/null 2>&1; then
                success "pnpm $(pnpm --version) (via corepack)"
                return 0
            fi
        fi
    fi

    # Try npm install -g pnpm
    if command -v npm >/dev/null 2>&1; then
        info "Installing pnpm via npm..."
        npm install -g pnpm 2>/dev/null
        if command -v pnpm >/dev/null 2>&1; then
            success "pnpm $(pnpm --version) (installed via npm)"
            return 0
        fi
    fi

    # Will use npx pnpm as last resort during install
    warn "pnpm not available globally. Will use npx pnpm."
    return 0
}

# ── Handle existing installation ─────────────────────────────────────

handle_existing() {
    if [ -d "$SHOOTER_REPO" ]; then
        printf '\n'
        warn "$SHOOTER_REPO already exists."
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
                cd "$SHOOTER_REPO"
                git fetch origin "$REPO_BRANCH" && git reset --hard "origin/$REPO_BRANCH"
                success "Repository updated."
                return 0
                ;;
            2)
                step "Removing existing installation"
                rm -rf "$SHOOTER_REPO"
                success "Removed $SHOOTER_REPO"
                return 1
                ;;
            3|abort)
                info "Aborted. No changes made."
                # Disable cleanup trap since nothing was cloned
                CLEANUP_CLONED=0
                exit 0
                ;;
            *)
                error "Invalid choice: $choice"
                exit 1
                ;;
        esac
    fi
    return 1
}

# ── Clone ─────────────────────────────────────────────────────────────

clone_repo() {
    step "Cloning Shooter"
    CLEANUP_CLONED=1
    git clone --branch "$REPO_BRANCH" --single-branch "$REPO_URL" "$SHOOTER_REPO"
    CLEANUP_CLONED=0
    success "Cloned to $SHOOTER_REPO"
}

# ── Install dependencies ─────────────────────────────────────────────

install_deps() {
    step "Installing dependencies"
    cd "$SHOOTER_REPO"
    if command -v pnpm >/dev/null 2>&1; then
        pnpm install
    elif command -v npx >/dev/null 2>&1; then
        npx pnpm install
    else
        error "Neither pnpm nor npx found. Cannot install dependencies."
        exit 1
    fi
    success "Dependencies installed"
}

# ── Setup wizard ──────────────────────────────────────────────────────

run_setup_wizard() {
    step "Running setup wizard"

    if [ -f "$SHOOTER_REPO/scripts/setup.cjs" ]; then
        cd "$SHOOTER_REPO"
        node scripts/setup.cjs --auto
    else
        warn "Setup wizard (scripts/setup.cjs) not found. Skipping."
        info "Creating .env from template..."
        if [ ! -f "$SHOOTER_HOME/.env" ]; then
            if [ -f "$SHOOTER_REPO/.env.example" ]; then
                cp "$SHOOTER_REPO/.env.example" "$SHOOTER_HOME/.env"
                success "Created .env from .env.example"
                warn "Edit $SHOOTER_HOME/.env to add your credentials."
            else
                warn "No .env.example found. You will need to create .env manually."
            fi
        else
            info ".env already exists. Skipping."
        fi

        info "Building the project..."
        cd "$SHOOTER_REPO"
        pnpm build
        success "Build complete."
    fi
}

# ── Cloudflare Tunnel ─────────────────────────────────────────────────

install_cloudflared() {
    step "Remote access (Cloudflare Tunnel)"

    if command -v cloudflared >/dev/null 2>&1; then
        success "cloudflared $(cloudflared --version 2>&1 | head -1 | sed 's/.*version //' | sed 's/ .*//')"
        return 0
    fi

    info "cloudflared enables remote access from your phone."

    if [ "$OS" = "macos" ] && command -v brew >/dev/null 2>&1; then
        if ask_yes_no "  Install cloudflared via Homebrew?" "y"; then
            info "Installing cloudflared..."
            brew install cloudflared 2>/dev/null
            if command -v cloudflared >/dev/null 2>&1; then
                success "cloudflared installed via Homebrew"
                return 0
            fi
        fi
    elif [ "$OS" = "linux" ]; then
        if ask_yes_no "  Install cloudflared?" "y"; then
            info "Downloading cloudflared..."
            arch="$(uname -m)"
            case "$arch" in
                x86_64)  cf_arch="amd64" ;;
                aarch64) cf_arch="arm64" ;;
                armv7l)  cf_arch="arm" ;;
                *)       cf_arch="$arch" ;;
            esac
            cf_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cf_arch}"
            cf_bin="$HOME/.local/bin/cloudflared"
            mkdir -p "$(dirname "$cf_bin")"
            if curl -fsSL -o "$cf_bin" "$cf_url" && chmod +x "$cf_bin"; then
                # Ensure ~/.local/bin is in PATH for subsequent commands
                case ":$PATH:" in
                    *":$HOME/.local/bin:"*) ;;
                    *) export PATH="$HOME/.local/bin:$PATH" ;;
                esac
                success "cloudflared installed to $cf_bin"
                return 0
            else
                warn "Failed to download cloudflared."
            fi
        fi
    fi

    warn "Skipping cloudflared. Shooter will only be accessible on your local network."
    info "Install later: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    return 1
}

# ── Enable autostart ─────────────────────────────────────────────────

enable_autostart() {
    step "Enabling autostart"

    SHOOTER_BIN="$HOME/.local/bin/shooter"
    if [ ! -x "$SHOOTER_BIN" ]; then
        SHOOTER_BIN="$SHOOTER_REPO/bin/shooter.cjs"
    fi

    if [ "$OS" = "macos" ] || [ "$OS" = "linux" ]; then
        "$NODE_BIN" "$SHOOTER_BIN" autostart on 2>/dev/null && return 0
        # Fallback: run node directly
        "$NODE_BIN" "$SHOOTER_REPO/bin/shooter.cjs" autostart on 2>/dev/null && return 0
        warn "Could not enable autostart. Run 'shooter autostart on' manually."
    fi
}

# ── Start server + tunnel ────────────────────────────────────────────

TUNNEL_URL=""

start_server_and_tunnel() {
    step "Starting Shooter"

    cd "$SHOOTER_REPO"
    port="$DEFAULT_PORT"

    # Check if port is already in use
    if command -v lsof >/dev/null 2>&1; then
        if lsof -i ":${port}" -sTCP:LISTEN >/dev/null 2>&1; then
            warn "Port ${port} is already in use."
            info "Stop the existing process or set a different PORT in ~/.shooter/.env"
            return 1
        fi
    fi

    # Start server in daemon mode (detaches from terminal, auto-starts tunnel if cloudflared available)
    SHOOTER_HOME="$SHOOTER_HOME" "$NODE_BIN" bin/shooter.cjs start -d

    # Wait for server to be ready (up to 15s)
    waited=0
    while [ "$waited" -lt 15 ]; do
        if curl -sf "http://localhost:${port}/api/health" >/dev/null 2>&1; then
            break
        fi
        sleep 1
        waited=$((waited + 1))
    done

    # Verify server is up
    if curl -sf "http://localhost:${port}/api/health" >/dev/null 2>&1; then
        success "Server running on http://localhost:${port}"
    else
        warn "Server may still be starting. Check with: shooter status"
    fi

    # Check for tunnel URL (daemon mode starts tunnel automatically)
    if [ -f "$SHOOTER_HOME/.tunnel_url" ]; then
        TUNNEL_URL="$(cat "$SHOOTER_HOME/.tunnel_url")"
        success "Tunnel active: $TUNNEL_URL"
    elif command -v cloudflared >/dev/null 2>&1; then
        # Tunnel may still be starting — wait a few more seconds
        waited=0
        while [ "$waited" -lt 10 ]; do
            if [ -f "$SHOOTER_HOME/.tunnel_url" ]; then
                TUNNEL_URL="$(cat "$SHOOTER_HOME/.tunnel_url")"
                success "Tunnel active: $TUNNEL_URL"
                break
            fi
            sleep 1
            waited=$((waited + 1))
        done
        if [ -z "$TUNNEL_URL" ]; then
            info "Tunnel is starting in the background. Check 'shooter status' shortly."
        fi
    else
        info "No cloudflared found — server accessible on local network only."
    fi
}

# ── Success message ───────────────────────────────────────────────────

print_success() {
    printf '\n'
    printf '%s' "$GREEN$BOLD"
    printf '  ================================================\n'
    printf '      Shooter is ready!\n'
    printf '  ================================================\n'
    printf '%s' "$RESET"
    printf '\n'
    printf '  %sLocal:%s    http://localhost:%s\n' "$BOLD" "$RESET" "$DEFAULT_PORT"
    if [ -n "$TUNNEL_URL" ]; then
        printf '  %sRemote:%s   %s\n' "$BOLD" "$RESET" "$TUNNEL_URL"
    fi
    # Read API key from ~/.shooter/.env for display
    _api_key=""
    if [ -f "$SHOOTER_HOME/.env" ]; then
        _api_key="$(grep -m1 '^API_KEY=' "$SHOOTER_HOME/.env" 2>/dev/null | cut -d= -f2-)"
    fi
    if [ -n "$_api_key" ]; then
        printf '  %sAPI key:%s  (configured in %s/.env)\n' "$BOLD" "$RESET" "$SHOOTER_HOME"
    fi
    printf '  %sStatus:%s   shooter status\n' "$BOLD" "$RESET"
    printf '  %sLogs:%s    shooter logs\n' "$BOLD" "$RESET"
    printf '\n'
    printf '  %sCommands:%s\n' "$BOLD" "$RESET"
    printf '    shooter stop            %s# stop the server%s\n' "$DIM" "$RESET"
    printf '    shooter status          %s# check status%s\n' "$DIM" "$RESET"
    printf '    shooter logs            %s# follow server logs%s\n' "$DIM" "$RESET"
    printf '    shooter setup           %s# reconfigure (push notifications, etc.)%s\n' "$DIM" "$RESET"
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
    if [ "$OS" = "macos" ]; then
        check_xcode_clt
    elif [ "$OS" = "linux" ]; then
        check_linux_build_tools
    fi
    check_node
    bootstrap_pnpm

    # Create data directory
    mkdir -p "$SHOOTER_HOME"

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

    # Optional extras — single prompt instead of 3 separate ones
    step "Optional extras"
    printf '\n'
    printf '  The following are recommended:\n'
    printf '    %s1.%s Global %sshooter%s command (run from anywhere)\n' "$BOLD" "$RESET" "$CYAN" "$RESET"
    printf '    %s2.%s Cloudflare Tunnel (remote access from phone)\n' "$BOLD" "$RESET"
    printf '    %s3.%s Autostart on login\n' "$BOLD" "$RESET"
    printf '\n'

    if ask_yes_no "  Install all recommended extras?" "y"; then
        # Global command
        BIN_DIR="$HOME/.local/bin"
        SHOOTER_BIN="$BIN_DIR/shooter"
        if [ ! -x "$SHOOTER_BIN" ]; then
            mkdir -p "$BIN_DIR"
            if [ -d "$SHOOTER_BIN" ]; then
                error "$SHOOTER_BIN exists as a directory. Remove it and re-run."
                exit 1
            fi
            ln -sf "$SHOOTER_REPO/bin/shooter.cjs" "$SHOOTER_BIN"
            chmod +x "$SHOOTER_BIN"
            success "'shooter' command linked to $SHOOTER_BIN"
            case ":$PATH:" in
                *":$BIN_DIR:"*) ;;
                *)
                    warn "$BIN_DIR is not in your PATH."
                    info "Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
                    info "  export PATH=\"\$HOME/.local/bin:\$PATH\""

                    # Attempt to auto-configure PATH in shell profile
                    SHELL_NAME=$(basename "$SHELL")
                    case "$SHELL_NAME" in
                        bash)
                            RC_FILE="$HOME/.bashrc"
                            [ -f "$HOME/.bash_profile" ] && RC_FILE="$HOME/.bash_profile"
                            ;;
                        zsh)
                            RC_FILE="$HOME/.zshrc"
                            ;;
                        fish)
                            RC_FILE="$HOME/.config/fish/config.fish"
                            ;;
                        *)
                            RC_FILE=""
                            ;;
                    esac

                    if [ -n "$RC_FILE" ] && [ -f "$RC_FILE" ]; then
                        if ! grep -q '\.local/bin' "$RC_FILE" 2>/dev/null; then
                            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$RC_FILE"
                            success "Added ~/.local/bin to $RC_FILE"
                            info "Run 'source $RC_FILE' or start a new terminal to use the 'shooter' command."
                        fi
                    fi
                    ;;
            esac
        else
            success "'shooter' command already linked."
        fi

        # Cloudflare Tunnel
        install_cloudflared

        # Autostart
        enable_autostart
    else
        info "Skipped extras. You can add them later:"
        info "  Global command:   ln -sf $SHOOTER_REPO/bin/shooter.cjs ~/.local/bin/shooter"
        info "  Cloudflare:       brew install cloudflared  (or see docs)"
        info "  Autostart:        shooter autostart on"
    fi

    # Start server + tunnel
    start_server_and_tunnel

    # Done
    print_success
}

main "$@"
