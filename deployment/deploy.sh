# Configuration
APP_NAME="sales-app"
PORT=8888
SERVICE_NAME="com.salesapp.service"

# Ensure we run from the project root
if [ -d "$(dirname "${BASH_SOURCE[0]}")/.." ]; then
    cd "$(dirname "${BASH_SOURCE[0]}")/.."
fi

WORK_DIR=$(pwd)
ENV_FILE=".env"
# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
echo -e "${GREEN}=== Sales App Automated Deployment ===${NC}"

# Helper: Check and Clean Port
cleanup_port() {
    local p=$1
    
    # Stop systemd service first if it exists to prevent auto-restart fighting
    if command -v systemctl &> /dev/null; then
        if systemctl is-active --quiet $APP_NAME; then
            echo -e "${YELLOW}Stopping $APP_NAME systemd service...${NC}"
            sudo systemctl stop $APP_NAME
            sleep 2
        fi
    fi

    echo -e "${YELLOW}Checking availability of port $p...${NC}"
    PID=$(lsof -ti :$p)
    if [ ! -z "$PID" ]; then
        echo -e "${YELLOW}Port $p is in use by PID $PID. Killing it...${NC}"
        kill -9 $PID 2>/dev/null || sudo kill -9 $PID 2>/dev/null
        sleep 1
        PID_RECHECK=$(lsof -ti :$p)
        if [ ! -z "$PID_RECHECK" ]; then
             echo -e "${RED}Error: Failed to free port $p. It might be owned by another user (e.g., root).${NC}"
             sudo kill -9 $PID_RECHECK 2>/dev/null || true
             sleep 1
             if [ ! -z "$(lsof -ti :$p)" ]; then
                 echo -e "${RED}Critical Error: Could not kill process on port $p.${NC}"
                 exit 1
             fi
        fi
        echo -e "${GREEN}Port $p is now free.${NC}"
    else
        echo -e "${GREEN}Port $p is free.${NC}"
    fi
}

# Helper: Check and Install Dependency
check_install() {
    local cmd=$1
    local name=$2
    
    if ! command -v $cmd &> /dev/null; then
        echo -e "${YELLOW}Warning: $name is not installed.${NC}"
        if [ "$AUTO_INSTALL" == "true" ]; then
            INSTALL_CHOICE="y"
        else
            read -p "Do you want to attempt to install $name? (y/n): " INSTALL_CHOICE
        fi
        
        if [ "$INSTALL_CHOICE" == "y" ]; then
            echo -e "Attempting to install $name..."
            
            if [ "$(uname)" == "Darwin" ]; then
                if ! command -v brew &> /dev/null; then
                    echo -e "${RED}Error: Homebrew not found. Please install Homebrew first.${NC}"
                    return 1
                fi
                brew install $name
            elif [ -f /etc/debian_version ]; then
                sudo apt-get update
                sudo apt-get install -y $name
            elif [ -f /etc/redhat-release ]; then
                sudo yum install -y $name
            else
                echo -e "${RED}Unsupported OS for auto-install. Please install $name manually.${NC}"
                return 1
            fi
            
            if command -v $cmd &> /dev/null; then
                 echo -e "${GREEN}$name installed successfully!${NC}"
            else
                 echo -e "${RED}Failed to install $name.${NC}"
            fi
        fi
    else
        echo -e "${GREEN}Found $name.${NC}"
    fi
}

# 1. Validation Checks
echo -e "\n${YELLOW}[1/4] Validating Environment...${NC}"

check_install python3 python3

# 2. Database Configuration
echo -e "\n${YELLOW}[2/4] Configure Database:${NC}"
if [ -z "$DB_CHOICE" ]; then
    echo "1) Local SQLite (Persistent)"
    echo "2) Oracle Autonomous Database"
    read -p "Enter choice (1/2): " DB_CHOICE
else
    echo "Auto-selected Database: $DB_CHOICE"
fi

# Prepare Environment Variables
if [ "$DB_CHOICE" == "2" ]; then
    echo -e "${YELLOW}Oracle Selected. Please provide details:${NC}"
    if [ -z "$WALLET_PATH" ]; then
        read -p "Enter Wallet Directory Path (absolute path): " WALLET_PATH
        read -p "Enter Database User: " DB_USER
        read -s -p "Enter Database Password: " DB_PASS
        echo ""
        read -p "Enter TNS Alias (e.g., db_high): " DB_ALIAS
    fi
    
    DB_URL="oracle+oracledb://${DB_USER}:${DB_PASS}@${DB_ALIAS}"
    IS_ORACLE=true
    
    # Check Wallet
    if [ ! -d "$WALLET_PATH" ]; then
        echo -e "${RED}Error: Wallet directory '$WALLET_PATH' not found.${NC}"
        exit 1
    fi
else
    DB_URL="sqlite:///sales_app_v3.db"
    IS_ORACLE=false
    WALLET_PATH=""
fi

# Write .env file
echo "DATABASE_URL=$DB_URL" > .env
if [ "$IS_ORACLE" = true ]; then
    echo "TNS_ADMIN=$WALLET_PATH" >> .env
fi
echo "PORT=$PORT" >> .env


# 3. Port Cleanup
cleanup_port $PORT

# 4. Native Service Deployment
echo -e "\n${GREEN}[3/4] Installing Python Dependencies...${NC}"
python3 -m venv venv
source venv/bin/activate
pip install -r deployment/requirements.txt

echo -e "\n${GREEN}[4/4] Creating System Service...${NC}"

OS_TYPE=$(uname)
if [ "$OS_TYPE" == "Darwin" ]; then
    # macOS LaunchAgent
    PLIST_PATH="$HOME/Library/LaunchAgents/$SERVICE_NAME.plist"
    
    cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$SERVICE_NAME</string>
    <key>ProgramArguments</key>
    <array>
        <string>$WORK_DIR/venv/bin/python</string>
        <string>$WORK_DIR/backend/app.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$WORK_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$WORK_DIR/logs/app.log</string>
    <key>StandardErrorPath</key>
    <string>$WORK_DIR/logs/app.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>DATABASE_URL</key>
        <string>$DB_URL</string>
        <key>TNS_ADMIN</key>
        <string>$WALLET_PATH</string>
        <key>PORT</key>
        <string>$PORT</string>
    </dict>
</dict>
</plist>
EOF
    echo -e "Created macOS service at $PLIST_PATH"
    launchctl unload "$PLIST_PATH" 2>/dev/null
    launchctl load "$PLIST_PATH"
    echo -e "${GREEN}Service started via launchctl.${NC}"

elif [ "$OS_TYPE" == "Linux" ]; then
    # Linux Systemd
    SERVICE_PATH="/etc/systemd/system/$APP_NAME.service"
    USER_NAME=$(whoami)
    
    # Handle SELinux (Allow systemd to access /home)
    if command -v getenforce &> /dev/null; then
        if [ "$(getenforce)" == "Enforcing" ]; then
             echo -e "${YELLOW}SELinux is Enforcing. Setting to Permissive to allow systemd access to home dir...${NC}"
             sudo setenforce 0
        fi
    fi
    
    # Create service file in /tmp first (avoids permission issues)
    TMP_SERVICE="/tmp/${APP_NAME}.service"
    cat <<EOF > "$TMP_SERVICE"
[Unit]
Description=Sales App Service
After=network.target

[Service]
User=$USER_NAME
WorkingDirectory=$WORK_DIR
ExecStart=$WORK_DIR/venv/bin/python $WORK_DIR/backend/app.py
Restart=always
Environment="DATABASE_URL=$DB_URL"
Environment="TNS_ADMIN=$WALLET_PATH"
Environment="PORT=$PORT"

[Install]
WantedBy=multi-user.target
EOF
    
    echo -e "${YELLOW}Requesting sudo permissions to install systemd service...${NC}"
    
    # Move service file and set up systemd
    if sudo cp "$TMP_SERVICE" "$SERVICE_PATH"; then
        sudo chmod 644 "$SERVICE_PATH"
        sudo systemctl daemon-reload
        sudo systemctl enable $APP_NAME 2>/dev/null || true
        sudo systemctl restart $APP_NAME
        rm -f "$TMP_SERVICE"
        echo -e "${GREEN}Systemd service installed and started.${NC}"
    else
        echo -e "${RED}Failed to install systemd service. Running manually...${NC}"
        rm -f "$TMP_SERVICE"
        nohup $WORK_DIR/venv/bin/python $WORK_DIR/backend/app.py > $WORK_DIR/logs/app.log 2>&1 &
        echo -e "${GREEN}App running manually with PID $!${NC}"
    fi
    
else
    echo -e "${RED}Unsupported OS for auto-service creation. Running manually in background.${NC}"
    nohup python backend/app.py > logs/app.log 2>&1 &
    echo -e "App running with PID $!"
fi

# ==============================================================================
# Install Cron Jobs (Linux only)
# ==============================================================================
if [ "$OS_TYPE" == "Linux" ] && [ -f "cronjobs/crontab.txt" ]; then
    echo -e "\n${YELLOW}Installing Cron Jobs...${NC}"
    
    # Ensure logs directory exists for cron output
    mkdir -p logs
    
    # Create temp crontab with APP_DIR substituted
    APP_DIR="$WORK_DIR"
    sed "s|\$APP_DIR|$APP_DIR|g" cronjobs/crontab.txt > /tmp/sales_app_crontab.tmp
    
    # Make all scripts in cronjobs executable
    chmod +x cronjobs/*.sh 2>/dev/null || true
    
    # Install crontab (preserves existing non-sales-app cron jobs)
    # Get existing crontab, remove old sales-app entries, add new ones
    (crontab -l 2>/dev/null | grep -v "$APP_DIR/cronjobs" || true; cat /tmp/sales_app_crontab.tmp | grep -v "^#" | grep -v "^$") | crontab -
    
    rm -f /tmp/sales_app_crontab.tmp
    echo -e "${GREEN}Cron jobs installed successfully.${NC}"
    echo -e "View with: crontab -l"
fi

# Get LAN IP
LAN_IP=""
if [ "$(uname)" == "Darwin" ]; then
    LAN_IP=$(ipconfig getifaddr en0)
elif [ "$(uname)" == "Linux" ]; then
    LAN_IP=$(hostname -I | awk '{print $1}')
fi

echo -e "\n${GREEN}Deployment finished successfully!${NC}"
echo -e "Access Locally: http://localhost:$PORT"
if [ ! -z "$LAN_IP" ]; then
    echo -e "Access via Network: http://$LAN_IP:$PORT"
fi
