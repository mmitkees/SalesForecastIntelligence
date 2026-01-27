#!/bin/bash
# ==============================================================================
# Production Remote Deployment Script for Sales App (Git-Based)
# ==============================================================================

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Script directory and Project Root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      Sales App - PRODUCTION Remote Deployment Script         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

# Setup Logging
mkdir -p "$PROJECT_ROOT/logs"
LOG_FILE="$PROJECT_ROOT/logs/remote_deploy_prod.log"
if [ -f "$LOG_FILE" ]; then
    mv "$LOG_FILE" "$PROJECT_ROOT/logs/remote_deploy_prod_$(date +%Y%m%d_%H%M%S).log"
fi
exec > >(tee -a "$LOG_FILE") 2>&1

echo "Production deployment started at $(date)"

# Load .env
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
fi

# Configuration - Priority to prod_ip from .env
REMOTE_SERVER_IP="${prod_ip:-129.151.159.172}"
REMOTE_SERVER_USER="${REMOTE_SERVER_USER:-opc}"
SSH_KEY_PATH="${SSH_KEY_PATH:-server_keys/ssh-key-2026-01-13.key}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/home/opc/sales-app}"
GIT_REPO_URL="${GIT_REPO_URL:-https://github.com/mmitkees/SalesForecastIntelligence.git}"
GIT_BRANCH="prod" # Enforce prod branch for production

# Resolve SSH key path
if [[ ! "$SSH_KEY_PATH" = /* ]]; then
    SSH_KEY_PATH="$PROJECT_ROOT/$SSH_KEY_PATH"
fi

echo -e "  Server IP:    ${GREEN}$REMOTE_SERVER_IP${NC}"
echo -e "  Git Branch:   ${GREEN}$GIT_BRANCH${NC}"

# Validate SSH Key
if [ ! -f "$SSH_KEY_PATH" ]; then
    echo -e "${RED}Error: SSH key not found at $SSH_KEY_PATH${NC}"
    exit 1
fi
chmod 600 "$SSH_KEY_PATH"
SSH_OPTS="-i $SSH_KEY_PATH -o StrictHostKeyChecking=no -o ConnectTimeout=10"

# Test SSH
echo -e "\n${YELLOW}Testing SSH connection to PRODUCTION...${NC}"
if ssh $SSH_OPTS "$REMOTE_SERVER_USER@$REMOTE_SERVER_IP" "echo 'Connection successful'" 2>/dev/null; then
    echo -e "${GREEN}SSH connection established!${NC}"
else
    echo -e "${RED}Error: Failed to connect to $REMOTE_SERVER_IP${NC}"
    exit 1
fi

# Run deployment logic (Clone/Pull and Execute deploy.sh)
# reusing the logic from remote_deploy.sh but targeted at this IP/Branch
echo -e "\n${YELLOW}Synchronizing code and deploying...${NC}"
ssh -t $SSH_OPTS "$REMOTE_SERVER_USER@$REMOTE_SERVER_IP" << REMOTE_CMD
    set -e
    cd $REMOTE_APP_DIR || (mkdir -p $REMOTE_APP_DIR && cd $REMOTE_APP_DIR)
    
    # Backup DB before git reset
    if [ -f "sales_app_v3.db" ]; then
        cp sales_app_v3.db /tmp/sales_app_v3_preserve.db
    fi

    if [ -d ".git" ]; then
        git fetch origin
        git reset --hard origin/$GIT_BRANCH
        git clean -fd -e "logs/" -e "db_backups/" -e "generated_reports/" -e "venv/" -e "*.db" -e ".env"
    else
        git clone -b $GIT_BRANCH $GIT_REPO_URL .
    fi

    # Restore DB
    if [ -f "/tmp/sales_app_v3_preserve.db" ]; then
        cp /tmp/sales_app_v3_preserve.db sales_app_v3.db
        rm /tmp/sales_app_v3_preserve.db
    fi

    chmod +x deployment/deploy.sh
    export DB_CHOICE=1 AUTO_INSTALL=true INSTALL_CRON=true
    bash deployment/deploy.sh
REMOTE_CMD

echo -e "\n${GREEN}PRODUCTION Deployment Completed!${NC}"
