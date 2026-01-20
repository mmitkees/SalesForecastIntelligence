#!/bin/bash
# ==============================================================================
# Remote Deployment Script for Sales App
# 
# This script:
# 1. Reads server configuration from .env file
# 2. Connects to remote server via SSH
# 3. Uploads project files
# 4. Installs dependencies
# 5. Executes deploy.sh on the remote server
#
# Usage: ./remote_deploy.sh
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
echo -e "${BLUE}║         Sales App - Remote Deployment Script                 ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

# ==============================================================================
# Step 1: Load Environment Configuration
# ==============================================================================
echo -e "\n${YELLOW}[1/6] Loading configuration from .env...${NC}"

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: .env file not found at $ENV_FILE${NC}"
    echo -e "${YELLOW}Please create .env file in project root with the following variables:${NC}"
    echo -e "  REMOTE_SERVER_IP=129.151.159.172"
    echo -e "  REMOTE_SERVER_USER=opc"
    echo -e "  SSH_KEY_PATH=serverkeys/ssh-key-2026-01-13.key"
    echo -e "  REMOTE_APP_DIR=/home/opc/sales-app"
    exit 1
fi

# Load environment variables
source "$ENV_FILE"

# Set defaults if not provided
REMOTE_SERVER_IP="${REMOTE_SERVER_IP:-129.151.159.172}"
REMOTE_SERVER_USER="${REMOTE_SERVER_USER:-opc}"
SSH_KEY_PATH="${SSH_KEY_PATH:-serverkeys/ssh-key-2026-01-13.key}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/home/opc/sales-app}"

# Resolve SSH key path (relative to script directory)
if [[ ! "$SSH_KEY_PATH" = /* ]]; then
    SSH_KEY_PATH="$PROJECT_ROOT/$SSH_KEY_PATH"
fi

echo -e "  Server IP:    ${GREEN}$REMOTE_SERVER_IP${NC}"
echo -e "  User:         ${GREEN}$REMOTE_SERVER_USER${NC}"
echo -e "  SSH Key:      ${GREEN}$SSH_KEY_PATH${NC}"
echo -e "  Remote Dir:   ${GREEN}$REMOTE_APP_DIR${NC}"

# ==============================================================================
# Step 2: Validate SSH Key
# ==============================================================================
echo -e "\n${YELLOW}[2/6] Validating SSH key...${NC}"

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
echo -e "\n${YELLOW}[3/6] Testing SSH connection...${NC}"

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
# Step 4: Prepare Remote Server (Install Dependencies)
# ==============================================================================
echo -e "\n${YELLOW}[4/6] Preparing remote server...${NC}"

ssh $SSH_OPTS "$REMOTE_SERVER_USER@$REMOTE_SERVER_IP" << 'REMOTE_SETUP'
set -e

echo "Updating system packages..."
if command -v yum &> /dev/null; then
    # Oracle Linux / RHEL / CentOS
    sudo yum update -y
    sudo yum install -y python3 python3-pip git unzip lsof
elif command -v apt-get &> /dev/null; then
    # Debian / Ubuntu
    sudo apt-get update
    sudo apt-get install -y python3 python3-pip python3-venv git unzip lsof
fi

# Ensure pip is up to date
python3 -m pip install --upgrade pip 2>/dev/null || true

# Open firewall port 8888 for the app
echo "Configuring firewall to allow port 8888..."
if command -v firewall-cmd &> /dev/null; then
    # RHEL/CentOS/Oracle Linux (firewalld)
    sudo firewall-cmd --permanent --add-port=8888/tcp 2>/dev/null || true
    sudo firewall-cmd --reload 2>/dev/null || true
    echo "Firewall port 8888 opened (firewalld)"
elif command -v ufw &> /dev/null; then
    # Ubuntu/Debian (ufw)
    sudo ufw allow 8888/tcp 2>/dev/null || true
    echo "Firewall port 8888 opened (ufw)"
elif command -v iptables &> /dev/null; then
    # Fallback to iptables
    sudo iptables -A INPUT -p tcp --dport 8888 -j ACCEPT 2>/dev/null || true
    echo "Firewall port 8888 opened (iptables)"
fi

echo "Server dependencies and firewall configured successfully!"
REMOTE_SETUP

echo -e "${GREEN}Remote server dependencies ready.${NC}"

# ==============================================================================
# Step 5: Upload Project Files
# ==============================================================================
echo -e "\n${YELLOW}[5/6] Uploading project files...${NC}"

# Create remote directory
ssh $SSH_OPTS "$REMOTE_SERVER_USER@$REMOTE_SERVER_IP" "mkdir -p $REMOTE_APP_DIR"

# Create a temporary archive excluding unnecessary files
ARCHIVE_NAME="sales-app-deploy.tar.gz"
echo "Creating archive of project files..."

# Files/folders to exclude from upload
EXCLUDE_PATTERNS=(
    "--exclude=.git"
    "--exclude=__pycache__"
    "--exclude=*.pyc"
    "--exclude=venv"
    "--exclude=.venv"
    "--exclude=node_modules"
    "--exclude=*.log"
    # "--exclude=*.db"  <-- Allow DB Upload
    "--exclude=.DS_Store"
    "--exclude=serverkeys"
    "--exclude=$ARCHIVE_NAME"
)

# Create archive from Project Root
tar czf "$SCRIPT_DIR/$ARCHIVE_NAME" "${EXCLUDE_PATTERNS[@]}" -C "$PROJECT_ROOT" .

echo "Uploading archive to server..."
scp $SSH_OPTS "$SCRIPT_DIR/$ARCHIVE_NAME" "$REMOTE_SERVER_USER@$REMOTE_SERVER_IP:$REMOTE_APP_DIR/"

# Extract on remote server (clean old code first, preserve db and venv)
ssh $SSH_OPTS "$REMOTE_SERVER_USER@$REMOTE_SERVER_IP" << REMOTE_EXTRACT
cd $REMOTE_APP_DIR

echo "Cleaning old code files (preserving database, venv, and logs)..."
# Remove old code but keep database, venv, logs, and archive
find . -maxdepth 1 -type f ! -name "*.db" ! -name "*.log" ! -name "$ARCHIVE_NAME" -delete 2>/dev/null || true
rm -rf static templates .agent migrations backend deployment 2>/dev/null || true

echo "Extracting fresh code..."
tar xzf $ARCHIVE_NAME
rm -f $ARCHIVE_NAME
chmod +x deployment/deploy.sh 2>/dev/null || true
echo "Fresh code deployed successfully!"
REMOTE_EXTRACT

# Clean up local archive
rm -f "$SCRIPT_DIR/$ARCHIVE_NAME"

echo -e "${GREEN}Project files uploaded successfully!${NC}"

# ==============================================================================
# Step 6: Execute deploy.sh on Remote Server
# ==============================================================================
echo -e "\n${YELLOW}[6/6] Executing deployment on remote server...${NC}"
echo -e "${YELLOW}Note: This will run deploy.sh non-interactively (Native/SQLite).${NC}"
echo ""

# Run deploy.sh with environment variables for auto-selection
ssh -t $SSH_OPTS "$REMOTE_SERVER_USER@$REMOTE_SERVER_IP" "cd $REMOTE_APP_DIR && export DB_CHOICE=1 AUTO_INSTALL=true && bash deployment/deploy.sh"

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
