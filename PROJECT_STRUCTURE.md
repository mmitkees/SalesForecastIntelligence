# Sales Consumption Intelligence Application

## Project Overview
This application is a Sales Consumption Intelligence Dashboard built with Python (Flask) and a Vanilla JavaScript frontend. It manages sales representative data, workloads, and fiscal year forecasts, providing a dynamic dashboard for viewing quarterly breakdowns (Actuals vs Estimates) and managing forecast workloads.

## Project Structure

```
/
├── app.py                  # Main Flask application entry point. Handles API routes and business logic.
├── models.py               # SQLAlchemy database models (Cluster, SalesRep, Workload, FiscalYear).
├── start_app.sh            # Helper script to set up environment and start the application.
├── sales_app_v3.db         # SQLite database file (Production data).
├── Workload Seeder.xlsx    # CRITICAL: Excel template used for bulk uploading workloads in Admin panel.
├── deployment/             # Deployment scripts and requirements.
├── static/                 # Frontend assets.
│   ├── css/
│   │   └── style.css       # Main stylesheet.
│   ├── js/
│   │   ├── main.js             # Frontend router and initialization.
│   │   ├── api.js              # API client wrapper.
│   │   ├── state.js            # Global state management.
│   │   ├── utils.js            # Formatting utilities.
│   │   └── controllers/        # Logical controllers for views.
│   │       ├── admin.js        # Admin panel logic (Clusters, Reps, Uploads).
│   │       ├── dashboard.js    # Dashboard logic (Quarterly Breakdowns).
│   │       └── workloads.js    # Workload management logic.
│   └── views/              # HTML Partials for Single Page Application.
│       ├── admin.html
│       ├── dashboard.html
│       └── workloads.html
└── venv/                   # Python Virtual Environment (Local).
```

## Automated Deployment (Recommended)
You can use the `deployment/deploy.sh` script to automate set up, validation, and running the application as a native system service.

```bash
./deployment/deploy.sh
```

Follow the interactive prompts to:
1.  Select Database (**Local SQLite** or **Oracle ADB**).
2.  Automatically configure system services (`systemd` for Linux, `launchd` for macOS).

---

## Manual Execution (Legacy)

## How to Run

### Prerequisites
- Python 3.8+
- Pip
- Bash (for start script)

### Local Development
1.  **Run the Start Script**:
    ```bash
    ./start_app.sh
    ```
    This script automatically:
    - Creates a virtual environment (`venv`) if missing.
    - Activates it.
    - Installs dependencies from `requirements.txt`.
    - Starts the Flask server on port 8080.

2.  **Manual Start**:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    pip install -r deployment/requirements.txt
    python app.py
    ```

3.  **Access the App**:
    Open `http://localhost:8080` in your browser.

### Features
- **Dashboard**: View consumption data across Q1-Q4. Columns dynamically adjust based on the current month (Actuals vs Estimates). Simulation and Workload fields update totals in real-time.
- **Workloads**: Add, Edit, and Manage workloads tagged to specific quarters.
- **Admin**: Manage Clusters and Sales Reps. Bulk upload workloads using the **Workload Seeder.xlsx** template.

## Deployment Notes
- For production, use a WSGI server like `gunicorn` instead of the development server.
  ```bash
  pip install gunicorn
  gunicorn -w 4 -b 0.0.0.0:8080 app:app
  ```
- Ensure `sales_app_v3.db` is persistent or switch to a robust DB (PostgreSQL/Oracle) by setting `DATABASE_URL`.
