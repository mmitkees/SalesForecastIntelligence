#!/bin/bash

# Configuration
DB_FILE="sales_app_v3.db"
BACKUP_DIR="dbbackups"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="${BACKUP_DIR}/sales_app_v3_${TIMESTAMP}.db"
LOG_FILE="${BACKUP_DIR}/backup_log.txt"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Perform Backup
if [ -f "$DB_FILE" ]; then
    cp "$DB_FILE" "$BACKUP_FILE"
    if [ $? -eq 0 ]; then
        echo "[$(date)] SUCCESS: Backup created at $BACKUP_FILE" >> "$LOG_FILE"
        echo "Backup created: $BACKUP_FILE"
    else
        echo "[$(date)] ERROR: Failed to copy database file." >> "$LOG_FILE"
        echo "Backup failed!"
        exit 1
    fi
else
    echo "[$(date)] ERROR: Database file $DB_FILE not found!" >> "$LOG_FILE"
    echo "Database file not found!"
    exit 1
fi

# Cleanup: Delete backups older than 30 days
# Uses find to look for files matching the pattern and modifies time > 30 days
find "$BACKUP_DIR" -name "sales_app_v3_*.db" -type f -mtime +30 -delete
