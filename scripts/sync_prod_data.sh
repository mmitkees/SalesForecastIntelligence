#!/bin/bash
# ==============================================================================
# Script: scripts/sync_prod_data.sh
# Purpose: Sync Sales App Data from Production & Restart Local Backend
# Usage: ./scripts/sync_prod_data.sh
# ==============================================================================

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REMOTE_USER="opc"
REMOTE_IP="129.151.159.172"
KEY_PATH="server_keys/ssh-key-2026-01-13.key"
REMOTE_DB="/home/opc/sales-app/sales_app_v3.db"
LOCAL_DB="sales_app_v3.db"

echo -e "${BLUE}=== Sales App Data Sync Tool ===${NC}"

# Check for SSH Key
if [ ! -f "$KEY_PATH" ]; then
    echo -e "${YELLOW}Warning: SSH Key not found at $KEY_PATH${NC}"
    echo "Please ensure you run this script from the project root."
    exit 1
fi

# 1. Download Database
echo -e "\n${YELLOW}[1/3] Downloading Production Database...${NC}"
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_IP:$REMOTE_DB" "$LOCAL_DB"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Database downloaded successfully! size: $(ls -lh $LOCAL_DB | awk '{print $5}')${NC}"
else
    echo -e "${YELLOW}Download failed. Check your VPN or Network connection.${NC}"
    exit 1
fi

# 2. Kill Existing Backend
echo -e "\n${YELLOW}[2/3] Stopping existing backend process...${NC}"
pkill -9 -f "backend/app.py"
sleep 2

# 3. Restart Backend
echo -e "\n${YELLOW}[3/3] Restarting Backend...${NC}"
# Use nohup to detach it, so closing terminal doesn't kill it
# FIX: Disable Flask Debugger to prevent background process hangs
export FLASK_DEBUG=False
nohup python backend/app.py > logs/local_server.log 2>&1 &
NEW_PID=$!

echo -e "${GREEN}Backend restarted! (PID: $NEW_PID)${NC}"
echo -e "Logs are being written to logs/local_server.log"
echo -e "\nYou can now refresh the dashboard."
