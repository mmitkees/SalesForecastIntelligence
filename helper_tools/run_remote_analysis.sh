#!/bin/bash
# Script to upload and run duplicate analysis on remote server

set -e

# SSH Configuration
SSH_KEY="server_keys/ssh-key-2026-01-13.key"
REMOTE_SERVER_USER="opc"
REMOTE_SERVER_IP="129.151.159.172"
REMOTE_APP_DIR="/home/opc/sales-app"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"

echo "================================================="
echo "Remote Database Duplicate Analysis"
echo "================================================="

# Fix SSH key permissions
chmod 600 "$SSH_KEY"

# Upload the analysis script
echo "Uploading analysis script to remote server..."
scp $SSH_OPTS helper_tools/analyze_remote_duplicates.py "$REMOTE_SERVER_USER@$REMOTE_SERVER_IP:$REMOTE_APP_DIR/"

# Run the analysis
echo ""
echo "Running duplicate analysis on remote database..."
echo "================================================="
ssh $SSH_OPTS "$REMOTE_SERVER_USER@$REMOTE_SERVER_IP" "cd $REMOTE_APP_DIR && python3 analyze_remote_duplicates.py"

echo ""
echo "================================================="
echo "Analysis complete!"
echo "================================================="
