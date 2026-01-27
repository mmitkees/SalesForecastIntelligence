# Sales Consumption Intelligence Application

## Project Overview
This application is a Sales Consumption Intelligence Dashboard built with Python (Flask) and a Vanilla JavaScript frontend. It manages sales representative data, workloads, and fiscal year forecasts, providing a dynamic dashboard for viewing quarterly breakdowns (Actuals vs Estimates) and managing forecast workloads.

## Project Structure

```
/
├── backend/                # Flask application
│   ├── app.py              # Main Flask application entry point
│   ├── models.py           # SQLAlchemy database models
│   ├── weekly_export.py    # Weekly workload export logic
│   ├── init_rbac.py        # Initialize Role-Based Access Control
│   ├── rename_fy_fields.py # Utility to rename fiscal year fields
│   ├── restructure_quarters.py # Utility to restructure quarter data
│   ├── remove_unused_fields.py # Helper to clean up database fields
│   └── __init__.py         # Package initializer
├── static/                 # Frontend assets
│   ├── css/
│   │   └── styles.css      # Global application styles
│   ├── js/
│   │   ├── main.js         # Frontend router and initialization
│   │   ├── api.js          # API client wrapper
│   │   ├── state.js        # Global state management
│   │   ├── utils.js        # Formatting and utility functions
│   │   └── controllers/
│   │       ├── dashboard.js # Dashboard view controller
│   │       ├── workloads.js # Workloads view controller
│   │       ├── admin.js     # Admin view controller
│   │       └── analytics.js # Analytics view controller
│   └── views/              # HTML Partials for SPA
│       ├── dashboard.html  # Dashboard view template
│       ├── workloads.html  # Workloads view template
│       ├── admin.html      # Admin view template
│       └── analytics.html  # Analytics view template
│   ├── index.html          # Main SPA entry HTML
│   ├── login.html          # Login page HTML
│   └── favicon.svg         # Site icon
├── deployment/             # Deployment scripts
│   ├── deploy.sh           # Local/Remote deployment script
│   ├── remote_deploy.sh    # Legacy git-based remote deployment
│   ├── remote_deploy_dev.sh # Deployment to Dev Server (129.151.152.53)
│   ├── remote_deploy_prod.sh # Deployment to Prod Server (129.151.159.172)
│   └── requirements.txt    # Python dependencies
├── cron_jobs/              # Scheduled tasks
│   ├── backup_db.sh        # Database backup script
│   ├── run_weekly_export.sh # Weekly export job wrapper
│   └── crontab.txt         # Cron job definitions
├── helper_tools/           # Utility scripts for data management
│   ├── sync_prod_db.sh     # Sync Prod DB to Local or Dev server
│   ├── merge_duplicate_reps.py # Safe merger for duplicate Sales Reps
│   └── Workload Seeder.xlsx # Excel template for bulk workload uploads
├── logs/                   # Application logs (gitignored)
├── db_backups/             # Database backups (gitignored)
├── generated_reports/      # Generated reports (gitignored)
├── sales_app_v3.db         # SQLite database (Production data)
├── .env                    # Environment configuration
├── .env.example            # Environment template
└── server_keys/            # SSH keys for remote access
```

## Deployment

### Remote Deployment (Recommended)
Deploy to your servers using the environment-specific scripts:

**To Development:**
```bash
./deployment/remote_deploy_dev.sh
```

**To Production:**
```bash
./deployment/remote_deploy_prod.sh
```

These scripts:
1. Pull latest code from Git (Dev branch for dev, Prod branch for prod)
2. Preserve existing database data
3. Install dependencies and configure services
4. Restart the application service

### Local Deployment
Run locally for development:

```bash
./deployment/deploy.sh
```

---

## Manual Development

### Prerequisites
- Python 3.9+
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

# Remote IPs
prod_ip=129.151.159.172
Dev_ip=129.151.152.53

# Deployment Config
REMOTE_SERVER_USER=opc
SSH_KEY_PATH=server_keys/ssh-key-2026-01-13.key
REMOTE_APP_DIR=/home/opc/sales-app
GIT_REPO_URL=https://github.com/mmitkees/SalesForecastIntelligence.git
```

---

## Features
- **Dashboard**: View consumption data across Q1-Q4 with real-time updates and simulations.
- **Workloads**: Tabbed interface to manage workloads tagged to specific quarters.
- **Environment Indicators**: Visual "DEV" or "PROD" badges to prevent accidental changes.
- **DB Sync Tool**: Easily pull production data to local or dev environments for testing.
- **Automated Backups**: Daily database backups via cron.
