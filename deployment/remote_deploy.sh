#!/bin/bash
# ==============================================================================
# Remote Deployment Script for Sales App (Git-Based)
# 
# This script:
# 1. Reads server configuration from .env file
# 2. Connects to remote server via SSH
# 3. Clones or pulls the latest code from Git
# 4. Executes deploy.sh on the remote server
#
# Usage: ./deployment/remote_deploy.sh
# ==============================================================================

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory and Project Root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      Sales App - Remote Deployment Script (Git-Based)        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

# ==============================================================================
# Step 1: Load Environment Configuration
# ==============================================================================
echo -e "\n${YELLOW}[1/5] Loading configuration from .env...${NC}"

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: .env file not found at $ENV_FILE${NC}"
    echo -e "${YELLOW}Please create .env file in project root with the following variables:${NC}"
    echo -e "  REMOTE_SERVER_IP=129.151.159.172"
    echo -e "  REMOTE_SERVER_USER=opc"
    echo -e "  SSH_KEY_PATH=serverkeys/ssh-key-2026-01-13.key"
    echo -e "  REMOTE_APP_DIR=/home/opc/sales-app"
    echo -e "  GIT_REPO_URL=https://github.com/mmitkees/SalesForecastIntelligence.git"
    echo -e "  GIT_BRANCH=dev"
    exit 1
fi

# Load environment variables
source "$ENV_FILE"

# Set defaults if not provided
REMOTE_SERVER_IP="${REMOTE_SERVER_IP:-129.151.159.172}"
REMOTE_SERVER_USER="${REMOTE_SERVER_USER:-opc}"
SSH_KEY_PATH="${SSH_KEY_PATH:-serverkeys/ssh-key-2026-01-13.key}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/home/opc/sales-app}"
GIT_REPO_URL="${GIT_REPO_URL:-https://github.com/mmitkees/SalesForecastIntelligence.git}"
GIT_BRANCH="${GIT_BRANCH:-dev}"

# Resolve SSH key path (relative to project root)
if [[ ! "$SSH_KEY_PATH" = /* ]]; then
    SSH_KEY_PATH="$PROJECT_ROOT/$SSH_KEY_PATH"
fi

echo -e "  Server IP:    ${GREEN}$REMOTE_SERVER_IP${NC}"
echo -e "  User:         ${GREEN}$REMOTE_SERVER_USER${NC}"
echo -e "  SSH Key:      ${GREEN}$SSH_KEY_PATH${NC}"
echo -e "  Remote Dir:   ${GREEN}$REMOTE_APP_DIR${NC}"
echo -e "  Git Repo:     ${GREEN}$GIT_REPO_URL${NC}"
echo -e "  Git Branch:   ${GREEN}$GIT_BRANCH${NC}"

# ==============================================================================
# Step 2: Validate SSH Key
# ==============================================================================
echo -e "\n${YELLOW}[2/5] Validating SSH key...${NC}"

if [ ! -f "$SSH_KEY_PATH" ]; then
    echo -e "${RED}Error: SSH key not found at $SSH_KEY_PATH${NC}"
    exit 1
fi

# Fix permissions on SSH key (required by SSH)
chmod 600 "$SSH_KEY_PATH"
echo -e "${GREEN}SSH key found and permissions set.${NC}"

# SSH options for all commands
SSH_OPTS="-i $SSH_KEY_PATH -o StrictHostKeyChecking=no -o ConnectTimeout=10"

# ==============================================================================
# Step 3: Test SSH Connection
# ==============================================================================
echo -e "\n${YELLOW}[3/5] Testing SSH connection...${NC}"

if ssh $SSH_OPTS "$REMOTE_SERVER_USER@$REMOTE_SERVER_IP" "echo 'Connection successful'" 2>/dev/null; then
    echo -e "${GREEN}SSH connection established successfully!${NC}"
else
    echo -e "${RED}Error: Failed to connect to $REMOTE_SERVER_USER@$REMOTE_SERVER_IP${NC}"
    echo -e "${YELLOW}Please check:${NC}"
    echo -e "  - Server IP is correct"
    echo -e "  - SSH key has been added to server's authorized_keys"
    echo -e "  - Server firewall allows SSH (port 22)"
    exit 1
fi

# ==============================================================================
# Step 4: Git Clone or Pull on Remote Server
# ==============================================================================
echo -e "\n${YELLOW}[4/5] Syncing code via Git...${NC}"

ssh $SSH_OPTS "$REMOTE_SERVER_USER@$REMOTE_SERVER_IP" << REMOTE_GIT
set -e

# Ensure required directories exist
mkdir -p logs dbbackups "generated reports"

if [ -d "$REMOTE_APP_DIR/.git" ]; then
    # Repository exists - pull latest changes
    echo "Repository found. Pulling latest changes..."
    cd $REMOTE_APP_DIR
    git fetch origin
    git reset --hard origin/$GIT_BRANCH
    git clean -fd -e "logs/" -e "dbbackups/" -e "generated reports/" -e "venv/" -e "*.db" -e ".env"
    echo "Code updated successfully!"
else
    # First time - clone the repository
    echo "Cloning repository for the first time..."
    
    # Backup existing data if any
    if [ -d "$REMOTE_APP_DIR" ]; then
        echo "Backing up existing data..."
        mkdir -p /tmp/sales-app-backup
        cp -r $REMOTE_APP_DIR/logs /tmp/sales-app-backup/ 2>/dev/null || true
        cp -r $REMOTE_APP_DIR/dbbackups /tmp/sales-app-backup/ 2>/dev/null || true
        cp -r "$REMOTE_APP_DIR/generated reports" /tmp/sales-app-backup/ 2>/dev/null || true
        cp $REMOTE_APP_DIR/*.db /tmp/sales-app-backup/ 2>/dev/null || true
        cp $REMOTE_APP_DIR/.env /tmp/sales-app-backup/ 2>/dev/null || true
        rm -rf $REMOTE_APP_DIR
    fi
    
    git clone -b $GIT_BRANCH $GIT_REPO_URL $REMOTE_APP_DIR
    cd $REMOTE_APP_DIR
    
    # Restore backed up data
    if [ -d "/tmp/sales-app-backup" ]; then
        echo "Restoring preserved data..."
        cp -r /tmp/sales-app-backup/* . 2>/dev/null || true
        rm -rf /tmp/sales-app-backup
    fi
    
    echo "Repository cloned successfully!"
fi

# Ensure directories exist after git operations
mkdir -p logs dbbackups "generated reports"
chmod +x deployment/deploy.sh cronjobs/*.sh 2>/dev/null || true
REMOTE_GIT

echo -e "${GREEN}Code synced via Git!${NC}"

# ==============================================================================
# Step 5: Execute deploy.sh on Remote Server
# ==============================================================================
echo -e "\n${YELLOW}[5/5] Executing deployment on remote server...${NC}"
echo -e "${YELLOW}Note: This will run deploy.sh non-interactively (Native/SQLite).${NC}"
echo ""

# Run deploy.sh with environment variables for auto-selection
ssh -t $SSH_OPTS "$REMOTE_SERVER_USER@$REMOTE_SERVER_IP" "cd $REMOTE_APP_DIR && export DB_CHOICE=1 AUTO_INSTALL=true INSTALL_CRON=true && bash deployment/deploy.sh"

# ==============================================================================
# Deployment Complete
# ==============================================================================
echo -e "\n${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            Deployment Completed Successfully!                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Access your application at:"
echo -e "  ${BLUE}http://$REMOTE_SERVER_IP:8888${NC}"
echo ""
echo -e "SSH into server:"
echo -e "  ${BLUE}ssh $SSH_OPTS $REMOTE_SERVER_USER@$REMOTE_SERVER_IP${NC}"
