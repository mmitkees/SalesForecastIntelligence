# Sales Consumption Intelligence Application

## Project Overview
This application is a Sales Consumption Intelligence Dashboard built with Python (Flask) and a Vanilla JavaScript frontend. It manages sales representative data, workloads, and fiscal year forecasts, providing a dynamic dashboard for viewing quarterly breakdowns (Actuals vs Estimates) and managing forecast workloads.

## Project Structure

```
/
├── backend/                # Flask application
│   ├── app.py              # Main Flask application entry point
│   ├── models.py           # SQLAlchemy database models
│   └── ...                 # Other backend modules
├── static/                 # Frontend assets
│   ├── css/                # Stylesheets
│   ├── js/                 # JavaScript modules
│   │   ├── main.js         # Frontend router and initialization
│   │   ├── api.js          # API client wrapper
│   │   └── controllers/    # View controllers (dashboard, admin, workloads)
│   └── views/              # HTML Partials for SPA
├── deployment/             # Deployment scripts
│   ├── deploy.sh           # Local/Remote deployment script
│   ├── remote_deploy.sh    # Git-based remote deployment
│   └── requirements.txt    # Python dependencies
├── cronjobs/               # Scheduled tasks
│   ├── backup_db.sh        # Database backup script
│   └── crontab.txt         # Cron job definitions
├── logs/                   # Application logs (gitignored)
├── dbbackups/              # Database backups (gitignored)
├── generated reports/      # Generated reports (gitignored)
├── sales_app_v3.db         # SQLite database (Production data)
├── .env                    # Environment configuration
├── .env.example            # Environment template
└── Workload Seeder.xlsx    # Excel template for bulk workload uploads
```

## Deployment

### Remote Deployment (Recommended)
Deploy to your remote server using git-based deployment:

```bash
./deployment/remote_deploy.sh
```

This script:
1. Creates a full backup of the remote app directory
2. Pulls latest code from Git (preserving local data)
3. Installs dependencies and configures services
4. Installs cron jobs for scheduled backups

### Local Deployment
Run locally for development:

```bash
./deployment/deploy.sh
```

Follow the interactive prompts to:
1. Select Database (**Local SQLite** or **Oracle ADB**)
2. Configure system services (`systemd` for Linux, `launchd` for macOS)

---

## Manual Development

### Prerequisites
- Python 3.8+
- Git

### Quick Start
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r deployment/requirements.txt
python backend/app.py
```

Access the app at: `http://localhost:8888`

---

## Configuration

### Environment Variables (`.env`)
```bash
# Database
DATABASE_URL=sqlite:///sales_app_v3.db
PORT=8888

# Remote Deployment
REMOTE_SERVER_IP=129.151.159.172
REMOTE_SERVER_USER=opc
SSH_KEY_PATH=serverkeys/ssh-key-2026-01-13.key
REMOTE_APP_DIR=/home/opc/sales-app
GIT_REPO_URL=https://github.com/mmitkees/SalesForecastIntelligence.git
GIT_BRANCH=dev
```

---

## Features
- **Dashboard**: View consumption data across Q1-Q4 with real-time updates
- **Workloads**: Add, Edit, and Manage workloads tagged to specific quarters
- **Admin**: Manage Clusters and Sales Reps, bulk upload workloads
- **Automated Backups**: Daily database backups via cron (2 AM)
- **Pre-Deployment Backups**: Full app backup before each deployment
