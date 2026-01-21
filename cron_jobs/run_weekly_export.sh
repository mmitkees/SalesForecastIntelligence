#!/bin/bash

# Navigate to project root
cd "$(dirname "$0")/.."

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Run the python export script
if [ -d "venv" ]; then
    venv/bin/python backend/weekly_export.py
else
    python3 backend/weekly_export.py
fi
