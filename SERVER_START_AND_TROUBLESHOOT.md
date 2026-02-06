# Server Auto-Start & Troubleshooting Guide

## Summary

✅ **The Sales App is configured to start automatically on boot** on the remote production server (`129.151.159.172`).

## Current Status

**Service:** `sales-app.service`  
**Status:** Active and running  
**Auto-start:** Enabled  

## Configuration Details

The systemd service is configured with:
- **Unit File:** `/etc/systemd/system/sales-app.service`
- **Enabled:** Yes (via `systemctl enable`)
- **Target:** `multi-user.target` (starts at system boot)
- **Restart Policy:** `always` (auto-restarts on failure)

## How It Works

When the remote production server boots:
1. Systemd loads all enabled services
2. The `sales-app.service` starts automatically after network is available
3. The app runs continuously and restarts automatically if it crashes

## Service Management Commands

Connect to the remote server and use these commands:

```bash
# Check service status
sudo systemctl status sales-app.service

# Check if enabled for auto-start
systemctl is-enabled sales-app.service

# Restart the service
sudo systemctl restart sales-app.service

# View logs
sudo journalctl -u sales-app.service -f
```

## Deployment Process

The auto-start configuration is automatically created by `deployment/deploy.sh` which:
1. Creates the systemd service file
2. Enables it with `systemctl enable`
3. Starts the service

This is executed automatically when you run `deployment/remote_deploy_prod.sh`.

## SSH Access to Production Server

### Connection Details

**Server IP:** `129.151.159.172`  
**User:** `opc`  
**SSH Key:** `server_keys/ssh-key-2026-01-13.key`

### Connect to Server

From the project root directory:

```bash
# Connect to production server
ssh -i server_keys/ssh-key-2026-01-13.key opc@129.151.159.172

# Or with strict host key checking disabled
ssh -i server_keys/ssh-key-2026-01-13.key -o StrictHostKeyChecking=no opc@129.151.159.172
```

Once connected, navigate to the app directory:

```bash
cd /home/opc/sales-app
```

## Troubleshooting

### Check if Service is Running

```bash
# Check service status
sudo systemctl status sales-app.service

# Check if the app is listening on port 8888
sudo netstat -tlnp | grep 8888
# or
sudo lsof -i :8888
```

### Service Not Starting on Boot

If the service isn't starting automatically:

```bash
# Verify service is enabled
systemctl is-enabled sales-app.service

# If not enabled, enable it
sudo systemctl enable sales-app.service

# Check for errors in service file
sudo systemctl cat sales-app.service

# View systemd logs
sudo journalctl -u sales-app.service -b
```

### View Application Logs

```bash
# Real-time log viewing
sudo journalctl -u sales-app.service -f

# Last 100 lines
sudo journalctl -u sales-app.service -n 100

# Logs since last boot
sudo journalctl -u sales-app.service -b

# Logs from specific time
sudo journalctl -u sales-app.service --since "2026-02-04 10:00:00"
```

### Restart Service Manually

```bash
# Restart the service
sudo systemctl restart sales-app.service

# Stop the service
sudo systemctl stop sales-app.service

# Start the service
sudo systemctl start sales-app.service
```

### Service Keeps Crashing

```bash
# Check recent errors
sudo journalctl -u sales-app.service -p err -n 50

# Check Python process
ps aux | grep python

# Check disk space
df -h

# Check memory usage
free -h

# Verify database exists
ls -lh /home/opc/sales-app/sales_app_v3.db

# Test app manually
cd /home/opc/sales-app
source venv/bin/activate
python backend/app.py
```

### Port Already in Use

```bash
# Find what's using port 8888
sudo lsof -i :8888

# Kill process using port 8888
sudo kill -9 <PID>

# Then restart service
sudo systemctl restart sales-app.service
```

### Verify Auto-Start After Reboot

To test if auto-start works:

```bash
# Reboot the server (use with caution)
sudo reboot

# After reboot, check status
sudo systemctl status sales-app.service
```

### Check Service Dependencies

```bash
# Verify network is available before service starts
sudo systemctl show sales-app.service | grep After
sudo systemctl show sales-app.service | grep Wants
```

> [!IMPORTANT]
> Always check logs first when troubleshooting: `sudo journalctl -u sales-app.service -n 50`

> [!NOTE]
> No additional configuration needed. The app will automatically start whenever the server boots up.
