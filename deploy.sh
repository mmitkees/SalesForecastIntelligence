# Configuration
APP_NAME="sales-app"
PORT=8888
SERVICE_NAME="com.salesapp.service"
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
    echo -e "${YELLOW}Checking availability of port $p...${NC}"
    PID=$(lsof -ti :$p)
    if [ ! -z "$PID" ]; then
        echo -e "${YELLOW}Port $p is in use by PID $PID. Killing it...${NC}"
        kill -9 $PID 2>/dev/null
        sleep 1
        # Re-check
        PID_RECHECK=$(lsof -ti :$p)
        if [ ! -z "$PID_RECHECK" ]; then
             echo -e "${RED}Error: Failed to free port $p. It might be owned by another user (e.g., root).${NC}"
             exit 1
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
        read -p "Do you want to attempt to install $name? (y/n): " INSTALL_CHOICE
        if [ "$INSTALL_CHOICE" == "y" ]; then
            echo -e "Attempting to install $name..."
            
            # Detect OS
            if [ "$(uname)" == "Darwin" ]; then
                # macOS
                if ! command -v brew &> /dev/null; then
                    echo -e "${RED}Error: Homebrew not found. Please install Homebrew first.${NC}"
                    return 1
                fi
                
                if [ "$cmd" == "docker" ]; then
                    brew install --cask docker
                else
                    brew install $name
                fi
                
            elif [ -f /etc/debian_version ]; then
                # Debian/Ubuntu
                sudo apt-get update
                sudo apt-get install -y $name
            elif [ -f /etc/redhat-release ]; then
                # RHEL/CentOS
                sudo yum install -y $name
            else
                echo -e "${RED}Unsupported OS for auto-install. Please install $name manually.${NC}"
                return 1
            fi
            
            # Re-check
            if command -v $cmd &> /dev/null; then
                 echo -e "${GREEN}$name installed successfully!${NC}"
                 if [ "$cmd" == "docker" ]; then
                    echo -e "${YELLOW}Note: You may need to start Docker Desktop manually on macOS.${NC}"
                 fi
            else
                 echo -e "${RED}Failed to install $name.${NC}"
            fi
        fi
    else
        echo -e "${GREEN}Found $name.${NC}"
    fi
}

# 1. Validation Checks
echo -e "\n${YELLOW}[1/5] Validating Environment...${NC}"

check_install python3 python3

# Docker check moved to after selection

# 2. Deployment Mode Selection
echo -e "\n${YELLOW}[2/5] Choose Deployment Mode:${NC}"
echo "1) Docker Container (Recommended)"
echo "2) Native Background Service (Systemd/Launchd)"
read -p "Enter choice (1/2): " DEPLOY_MODE

# Check Docker if Mode 1 selected
if [ "$DEPLOY_MODE" == "1" ]; then
    check_install docker docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is required for this mode but is not installed.${NC}"
        echo -e "Falling back to Native deployment selection..."
        DEPLOY_MODE="2"
        # Or exit 1? User asked to ask to install. My check_install does ask.
        # If they say No, or install fails -> command -v fails.
        # So we should probably exit or asking to select native.
        # Let's exit to be safe.
        exit 1
    else
        HAS_DOCKER=true
    fi
fi


# 3. Database Configuration
echo -e "\n${YELLOW}[3/5] Configure Database:${NC}"
echo "1) Local SQLite (Persistent)"
echo "2) Oracle Autonomous Database"
read -p "Enter choice (1/2): " DB_CHOICE

# Prepare Environment Variables
if [ "$DB_CHOICE" == "2" ]; then
    echo -e "${YELLOW}Oracle Selected. Please provide details:${NC}"
    read -p "Enter Wallet Directory Path (absolute path): " WALLET_PATH
    read -p "Enter Database User: " DB_USER
    read -s -p "Enter Database Password: " DB_PASS
    echo ""
    read -p "Enter TNS Alias (e.g., db_high): " DB_ALIAS
    
    DB_URL="oracle+cx_oracle://${DB_USER}:${DB_PASS}@${DB_ALIAS}"
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

# Write .env file for Native mode (Docker uses -e flags or env file)
echo "DATABASE_URL=$DB_URL" > .env
if [ "$IS_ORACLE" = true ]; then
    echo "TNS_ADMIN=$WALLET_PATH" >> .env
fi
echo "PORT=$PORT" >> .env


# 4. Execution Logic
cleanup_port $PORT

if [ "$DEPLOY_MODE" == "1" ]; then
    # --- DOCKER DEPLOYMENT ---
    if [ "$HAS_DOCKER" = false ]; then
        echo -e "${RED}Error: Docker not found. Cannot proceed with container deployment.${NC}"
        exit 1
    fi

    echo -e "\n${GREEN}[4/5] Building Docker Image...${NC}"
    docker build -t $APP_NAME .

    echo -e "${GREEN}[5/5] Running Container...${NC}"
    
    # Stop existing App
    docker stop $APP_NAME 2>/dev/null || true
    docker rm $APP_NAME 2>/dev/null || true

    if [ "$IS_ORACLE" = true ]; then
        docker run -d \
          --name $APP_NAME \
          --restart unless-stopped \
          -p $PORT:$PORT \
          -v "$WALLET_PATH":/app/wallet \
          -e TNS_ADMIN=/app/wallet \
          -e DATABASE_URL="$DB_URL" \
          $APP_NAME
    else
        docker run -d \
          --name $APP_NAME \
          --restart unless-stopped \
          -p $PORT:$PORT \
          -v "$WORK_DIR/sales_app_v3.db":/app/sales_app_v3.db \
          $APP_NAME
    fi
    
    # --- PORTAINER DEPLOYMENT (Auto) ---
    echo -e "\n${YELLOW}Deploying Portainer (Management UI)...${NC}"
    
    docker stop portainer 2>/dev/null || true
    docker rm portainer 2>/dev/null || true
    
    # Create data volume if not exists
    docker volume create portainer_data
    
    docker run -d \
      -p 9000:9000 \
      --name portainer \
      --restart=always \
      -v /var/run/docker.sock:/var/run/docker.sock \
      -v portainer_data:/data \
      portainer/portainer-ce:latest
      
    HAS_PORTAINER=true
    echo -e "${GREEN}Portainer deployed successfully.${NC}"

    echo -e "${GREEN}Deployment Complete! App running on port $PORT.${NC}"

else
    # --- NATIVE SERVICE DEPLOYMENT ---
    echo -e "\n${GREEN}[4/5] Installing Python Dependencies...${NC}"
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt

    echo -e "\n${GREEN}[5/5] Creating System Service...${NC}"
    
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
        <string>$WORK_DIR/app.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$WORK_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$WORK_DIR/app.log</string>
    <key>StandardErrorPath</key>
    <string>$WORK_DIR/app.err</string>
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
        
        # We need sudo for this. Create file locally first.
        cat <<EOF > "${APP_NAME}.service"
[Unit]
Description=Sales App Service
After=network.target

[Service]
User=$USER_NAME
WorkingDirectory=$WORK_DIR
ExecStart=$WORK_DIR/venv/bin/python $WORK_DIR/app.py
Restart=always
Environment="DATABASE_URL=$DB_URL"
Environment="TNS_ADMIN=$WALLET_PATH"
Environment="PORT=$PORT"

[Install]
WantedBy=multi-user.target
EOF
        
        echo -e "${YELLOW}Requesting sudo permissions to install systemd service...${NC}"
        sudo mv "${APP_NAME}.service" "$SERVICE_PATH"
        sudo systemctl daemon-reload
        sudo systemctl enable $APP_NAME
        sudo systemctl restart $APP_NAME
        echo -e "${GREEN}Systemd service installed and started.${NC}"
        
    else
        echo -e "${RED}Unsupported OS for auto-service creation. Running manually in background.${NC}"
        nohup python app.py > app.log 2>&1 &
        echo -e "App running with PID $!"
    fi
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

if [ "$HAS_PORTAINER" = true ]; then
    echo -e "\n${YELLOW}Portainer Management:${NC}"
    echo -e "Access Locally: http://localhost:9000"
    if [ ! -z "$LAN_IP" ]; then
        echo -e "Access via Network: http://$LAN_IP:9000"
    fi
fi
