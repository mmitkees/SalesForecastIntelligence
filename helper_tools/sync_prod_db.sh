#!/bin/bash
# ==============================================================================
# Sales App - Production Database Sync Utility
# ==============================================================================
# This script pulls the production database and allows syncing it to:
# 1) The local development environment
# 2) The remote development server
# ==============================================================================

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROD_IP="129.151.159.172"
DEV_IP="129.151.152.53"
REMOTE_USER="opc"
SSH_KEY="server_keys/ssh-key-2026-01-13.key"
PROD_DB_PATH="/home/opc/sales-app/sales_app_v3.db"
DEV_DB_PATH="/home/opc/sales-app-dev/sales_app_v3.db"
LOCAL_DB_PATH="sales_app_v3.db"

# Ensure SSH key exists and has correct permissions
if [ ! -f "$SSH_KEY" ]; then
    echo -e "${RED}Error: SSH key not found at $SSH_KEY${NC}"
    exit 1
fi
chmod 600 "$SSH_KEY"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          Sales App - Production Database Sync Tool           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

# 1. Pull Database from Production to Temp
TEMP_DB="/tmp/prod_sync_$(date +%Y%m%d_%H%M%S).db"
echo -e "\n${YELLOW}Step 1: Pulling database from PRODUCTION (${PROD_IP})...${NC}"
if scp $SSH_OPTS "$REMOTE_USER@$PROD_IP:$PROD_DB_PATH" "$TEMP_DB"; then
    echo -e "${GREEN}✓ Successfully downloaded production database to $TEMP_DB${NC}"
else
    echo -e "${RED}Error: Failed to download database from production.${NC}"
    exit 1
fi

# 2. Select Destination
echo -e "\n${YELLOW}Step 2: Choose Destination${NC}"
echo "1) Local Environment (Project Root)"
echo "2) Remote Development Server (${DEV_IP})"
echo "3) Cancel"
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        echo -e "\n${YELLOW}Syncing to LOCAL environment...${NC}"
        # Backup local DB
        if [ -f "$LOCAL_DB_PATH" ]; then
            mkdir -p db_backups
            BACKUP_FILE="db_backups/sales_app_v3_local_pre_sync_$(date +%Y%m%d_%H%M%S).db"
            cp "$LOCAL_DB_PATH" "$BACKUP_FILE"
            echo -e "${GREEN}✓ Local backup created: $BACKUP_FILE${NC}"
        fi
        
        # Overwrite local DB
        cp "$TEMP_DB" "$LOCAL_DB_PATH"
        echo -e "${GREEN}✓ Local database updated with production data!${NC}"
        ;;
        
    2)
        echo -e "\n${YELLOW}Syncing to REMOTE DEVELOPMENT server...${NC}"
        read -p "Are you sure you want to overwrite the DEV server database? (y/n): " confirm
        if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
            # Backup Remote Dev DB
            echo "Creating backup on Dev server..."
            ssh $SSH_OPTS "$REMOTE_USER@$DEV_IP" "mkdir -p /home/opc/sales-app-dev/db_backups && cp $DEV_DB_PATH /home/opc/sales-app-dev/db_backups/sales_app_v3_dev_pre_sync_\$(date +%Y%m%d_%H%M%S).db 2>/dev/null || true"
            
            # Upload to Dev
            echo "Uploading production data to Dev server..."
            if scp $SSH_OPTS "$TEMP_DB" "$REMOTE_USER@$DEV_IP:$DEV_DB_PATH"; then
                echo -e "${GREEN}✓ Remote Dev database updated with production data!${NC}"
                
                # Restart dev service
                echo "Restarting dev service..."
                ssh $SSH_OPTS "$REMOTE_USER@$DEV_IP" "sudo systemctl restart sales-app.service"
            else
                echo -e "${RED}Error: Failed to upload database to Dev server.${NC}"
            fi
        else
            echo "Sync cancelled."
        fi
        ;;
        
    3)
        echo "Sync cancelled."
        ;;
    *)
        echo "Invalid choice."
        ;;
esac

# Cleanup
rm -f "$TEMP_DB"
echo -e "\n${BLUE}Done.${NC}"
