#!/bin/bash

# Configuration
PORT=${PORT:-8888}
VENV_PATH="venv"
REQUIREMENTS_FILE="requirements.txt"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Sales App Startup Script ===${NC}"

# 1. Validate and Activate Virtual Environment
echo -e "\n${YELLOW}[1/4] Checking Python Environment...${NC}"

if [ ! -d "$VENV_PATH" ]; then
    # Fallback to .venv if venv doesn't exist
    if [ -d ".venv" ]; then
        VENV_PATH=".venv"
        echo -e "${GREEN}Found existing environment at .venv${NC}"
    else
        echo -e "${YELLOW}No virtual environment found. Creating 'venv'...${NC}"
        python3 -m venv venv
        if [ $? -ne 0 ]; then
            echo -e "${RED}Failed to create virtual environment.${NC}"
            if [ "$(uname)" == "Linux" ]; then
                echo -e "${YELLOW}On Linux, you may need to run: sudo apt-get install python3-venv${NC}"
            fi
            exit 1
        fi
        VENV_PATH="venv"
    fi
else
    echo -e "${GREEN}Found existing environment at $VENV_PATH${NC}"
fi

# Activate
source "$VENV_PATH/bin/activate"
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to activate virtual environment.${NC}"
    exit 1
fi
echo -e "${GREEN}Virtual environment activated.$(python --version)${NC}"


# 2. Install Dependencies
echo -e "\n${YELLOW}[2/4] Checking Dependencies...${NC}"
if [ -f "$REQUIREMENTS_FILE" ]; then
    echo "Installing/Updating requirements from $REQUIREMENTS_FILE..."
    pip install -r "$REQUIREMENTS_FILE"
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to install dependencies.${NC}"
        exit 1
    fi
else
    echo -e "${RED}Error: $REQUIREMENTS_FILE not found!${NC}"
    exit 1
fi


# 3. Stop Previous Processes
echo -e "\n${YELLOW}[3/4] Cleaning up port $PORT...${NC}"
# Find PID listening on the port
PID=$(lsof -ti :$PORT)

if [ ! -z "$PID" ]; then
    echo -e "${YELLOW}Found process $PID running on port $PORT. Stopping it...${NC}"
    kill -9 $PID
    sleep 1 # Wait a moment for it to fully release
    
    # Double check
    RECHECK_PID=$(lsof -ti :$PORT)
    if [ ! -z "$RECHECK_PID" ]; then
        echo -e "${RED}Failed to stop process. Please check manually.${NC}"
        exit 1
    else
        echo -e "${GREEN}Port $PORT is now free.${NC}"
    fi
else
    echo -e "${GREEN}Port $PORT is already free.${NC}"
fi


# 4. Start Application
echo -e "\n${GREEN}[4/4] Starting Application...${NC}"
echo -e "Access the app at: http://localhost:$PORT"
echo -e "Press Ctrl+C to stop."
echo -e "----------------------------------------\n"

export PORT=$PORT
python app.py
