"""
Main Application Entry Point for SalesApp.
This module handles API routing, data synchronization, dashboard calculations,
and file upload processing.
"""

import os
from dotenv import load_dotenv

# Load environment variables from .env file if present
load_dotenv()

import contextlib
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory, g, session
import pandas as pd
import io
import hashlib
from sqlalchemy import func
from models import init_db, SessionLocal, Cluster, SalesRep, Workload, FiscalYear, Region

# Initialize Flask application
app = Flask(__name__, static_folder='../static', static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', 'salesapp-secret-key-2026')


def derive_fiscal_info(date_str, db):
    """
    Derives fiscal quarter and fiscal year ID from a given date string.
    
    The fiscal year starts in June.
    FY26: Starts June 2025, Ends May 2026.
    
    Args:
        date_str (str): Date in ISO format (YYYY-MM-DD).
        db: Database session.
        
    Returns:
        tuple: (quarter_name, fiscal_year_id)
    """
    # Retrieve the latest fiscal year as a fallback
    current_fy = db.query(FiscalYear).order_by(FiscalYear.year.desc()).first()
    default_fy_id = current_fy.id if current_fy else None
    
    if not date_str:
        return 'Q3', default_fy_id
        
    try:
        # Parse the input date string
        if isinstance(date_str, str):
            try:
                dt = datetime.fromisoformat(date_str)
            except:
                from dateutil import parser
                dt = parser.parse(date_str)
        else:
            dt = date_str
            
        month = dt.month
        year = dt.year
        
        # Quarter Logic (June Start)
        # Q1: Jun, Jul, Aug
        # Q2: Sep, Oct, Nov
        # Q3: Dec, Jan, Feb
        # Q4: Mar, Apr, May
        if month in [6, 7, 8]: quarter = 'Q1'
        elif month in [9, 10, 11]: quarter = 'Q2'
        elif month in [12, 1, 2]: quarter = 'Q3'
        else: quarter = 'Q4' 
        
        # Fiscal Year Logic: June 2025 onwards belongs to FY26
        fy_year = year + 1 if month >= 6 else year
        
        # Look up the corresponding FiscalYear record
        fy_obj = db.query(FiscalYear).filter(FiscalYear.year == fy_year).first()
        if fy_obj:
            return quarter, fy_obj.id
        return quarter, default_fy_id
        
    except:
        # Fallback to defaults on parsing error
        return 'Q3', default_fy_id


# --- Database connection management ---
def get_db():
    """ Provides a database session within the request context. """
    if 'db' not in g:
        g.db = SessionLocal()
    return g.db

@app.teardown_appcontext
def shutdown_session(exception=None):
    """ Ensures database session is closed after each request. """
    db = g.pop('db', None)
    if db:
        db.close()

# Initialize database on startup
with app.app_context():
    init_db()
    
    # Check and Auto-Create Next Fiscal Year if applicable
    # Logic: On or after March 31st of any year, ensure the fiscal year for (CurrentYear + 1) exists.
    # FY naming convention: FY26 means ending in 2026 (Starts June 2025).
    # So on March 31, 2026, we want to create FY27 (starts June 1, 2026).
    try:
        db = SessionLocal()
        now = datetime.now()
        
        # Check if we are past March 30th
        if (now.month > 3) or (now.month == 3 and now.day >= 31):
            target_year = now.year + 1
            existing = db.query(FiscalYear).filter(FiscalYear.year == target_year).first()
            if not existing:
                start_date = f"{target_year-1}-06-01"
                end_date = f"{target_year}-05-31"
                new_fy = FiscalYear(year=target_year, start_date=start_date, end_date=end_date)
                db.add(new_fy)
                db.commit()
                print(f"Auto-created Fiscal Year {target_year}")
        
        db.close()
    except Exception as e:
        print(f"Error checking fiscal year: {e}")

# --- Global Error Handler ---
@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal Server Error", "details": str(error)}), 500

@app.errorhandler(404)
def not_found_error(error):
    if request.path.startswith('/api/'):
        return jsonify({"error": "Not Found"}), 404
    return "Not Found", 404

# --- Static Files ---
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/views/<path:filename>')
def serve_views(filename):
    # Serve view files from static/views directory
    views_dir = os.path.join(app.static_folder, 'views')
    return send_from_directory(views_dir, filename)


@app.route('/login')
def serve_login():
    return send_from_directory(app.static_folder, 'login.html')

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(app.static_folder, 'favicon.svg', mimetype='image/svg+xml')


# --- API Routes ---

@app.route('/api/fiscal_years', methods=['GET'])
def get_fiscal_years():
    """
    Retrieves all available fiscal years from the database.
    
    Returns:
        JSON: List of fiscal year objects.
    """
    db = get_db()
    # Order by year descending to show latest first
    fys = db.query(FiscalYear).order_by(FiscalYear.year.desc()).all()
    return jsonify([{
        "id": fy.id, 
        "year": fy.year, 
        "start_date": fy.start_date, 
        "end_date": fy.end_date
    } for fy in fys])

@app.route('/api/fiscal_years', methods=['POST'])
def create_fiscal_year():
    """
    Creates a new fiscal year record.
    Automatically calculates start and end dates based on the year.
    
    Returns:
        JSON: The created fiscal year ID and year.
    """
    data = request.json
    year = int(data.get('year'))
    db = get_db()
    
    # Ensure duplicate fiscal years are not created
    if db.query(FiscalYear).filter(FiscalYear.year == year).first():
        return jsonify({"error": f"Fiscal Year {year} already exists"}), 400

    # Business Logic: FY begins June 1st of the previous calendar year
    # Example: FY26 starts 2025-06-01
    start_date = f"{year-1}-06-01"
    end_date = f"{year}-05-31"

    fy = FiscalYear(
        year=year,
        start_date=start_date,
        end_date=end_date
    )
    db.add(fy)
    db.commit()
    return jsonify({"id": fy.id, "year": fy.year}), 201


# --- Authentication API ---

def hash_password(password):
    """Simple password hashing using SHA256."""
    return hashlib.sha256(password.encode()).hexdigest()


@app.route('/api/auth/login', methods=['POST'])
def login():
    """
    Authenticates a user by username and password.
    Sets session user_id on success.
    """
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    
    db = get_db()
    # Case-insensitive username comparison
    user = db.query(SalesRep).filter(func.lower(SalesRep.username) == username.lower()).first()
    
    if not user or user.password_hash != hash_password(password):
        return jsonify({"error": "Invalid credentials"}), 401
    
    session['user_id'] = user.id
    return jsonify({
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "role": user.role,
        "cluster_id": user.cluster_id
    })


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Clears the user session."""
    session.pop('user_id', None)
    return jsonify({"message": "Logged out"})


@app.route('/api/auth/me', methods=['GET'])
def get_current_user():
    """
    Returns the currently logged-in user's info.
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401
    
    db = get_db()
    user = db.query(SalesRep).get(user_id)
    if not user:
        session.pop('user_id', None)
        return jsonify({"error": "User not found"}), 401
    
    # Get region info if available
    region_id = None
    region_name = None
    if user.cluster and user.cluster.region:
        region_id = user.cluster.region.id
        region_name = user.cluster.region.name
    
    return jsonify({
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "role": user.role,
        "cluster_id": user.cluster_id,
        "cluster_name": user.cluster.name if user.cluster else None,
        "region_id": region_id,
        "region_name": region_name
    })


# --- Region API ---

@app.route('/api/regions', methods=['GET'])
def get_regions():
    """
    Retrieves all regions.
    """
    db = get_db()
    regions = db.query(Region).all()
    return jsonify([{
        "id": r.id,
        "name": r.name,
        "cluster_count": len(r.clusters)
    } for r in regions])


@app.route('/api/regions', methods=['POST'])
def create_region():
    """
    Creates a new region.
    """
    data = request.json
    db = get_db()
    region = Region(name=data.get('name', 'New Region'))
    db.add(region)
    db.commit()
    db.refresh(region)
    return jsonify({"id": region.id, "name": region.name}), 201


@app.route('/api/regions/<int:region_id>', methods=['PUT'])
def update_region(region_id):
    """
    Updates a region's name.
    """
    data = request.json
    db = get_db()
    region = db.query(Region).get(region_id)
    if not region:
        return jsonify({"error": "Region not found"}), 404
    
    region.name = data.get('name', region.name)
    db.commit()
    return jsonify({"id": region.id, "name": region.name})


@app.route('/api/regions/<int:region_id>', methods=['DELETE'])
def delete_region(region_id):
    """
    Deletes a region and all its clusters.
    """
    db = get_db()
    region = db.query(Region).get(region_id)
    if not region:
        return jsonify({"error": "Region not found"}), 404
    
    db.delete(region)
    db.commit()
    return jsonify({"message": "Region deleted"})


@app.route('/api/clusters', methods=['GET'])
def get_clusters():
    """
    Retrieves all clusters.
    
    Returns:
        JSON: List of clusters.
    """
    db = get_db()
    clusters = db.query(Cluster).all()
    return jsonify([{
        "id": c.id, 
        "name": c.name,
        "partial_data_date": c.partial_data_date,
        "region_id": c.region_id,
        "region_name": c.region.name if c.region else None
    } for c in clusters])


@app.route('/api/clusters', methods=['POST'])
def create_cluster():
    """
    Creates a new cluster.
    
    Returns:
        JSON: Created cluster data.
    """
    data = request.json
    db = get_db()
    cluster = Cluster(
        name=data.get('name', 'New Cluster'),
        region_id=data.get('region_id')
    )
    db.add(cluster)
    db.commit()
    db.refresh(cluster)
    return jsonify({
        "id": cluster.id, 
        "name": cluster.name, 
        "partial_data_date": cluster.partial_data_date,
        "region_id": cluster.region_id
    }), 201


@app.route('/api/clusters/<int:cluster_id>', methods=['PUT'])
def update_cluster(cluster_id):
    """
    Updates an existing cluster's name or metadata.
    
    Args:
        cluster_id (int): ID of the cluster to update.
        
    Returns:
        JSON: Updated cluster data.
    """
    data = request.json
    db = get_db()
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        return jsonify({"error": "Cluster not found"}), 404
    
    # Update fields if provided in payload
    if 'name' in data:
        cluster.name = data.get('name')
    if 'partial_data_date' in data:
        cluster.partial_data_date = data.get('partial_data_date')
    if 'region_id' in data:
        cluster.region_id = data.get('region_id')
    
    db.commit()
    return jsonify({
        "id": cluster.id, 
        "name": cluster.name,
        "partial_data_date": cluster.partial_data_date
    })


@app.route('/api/dashboard/<int:cluster_id>', methods=['GET'])
def get_dashboard(cluster_id):
    """
    Retrieves the primary dashboard data for a specific cluster.
    Includes KPIs and detailed performance for each Sales Rep.
    
    Args:
        cluster_id (int): Target cluster.
        
    Query Params:
        fiscal_year_id (int, optional): Filter by fiscal year. Defaults to latest.
        
    Returns:
        JSON: Summary statistics and sales rep list.
    """
    db = get_db()
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        return jsonify({"error": "Cluster not found"}), 404

    # Build query for sales reps within the cluster
    sales_reps_query = db.query(SalesRep).filter(SalesRep.cluster_id == cluster_id)
    
    # SECURITY: Role-based filtering
    user_id = session.get('user_id')
    if user_id:
        current_user = db.query(SalesRep).filter(SalesRep.id == user_id).first()
        if current_user and current_user.role == 'user':
            # Force filter to ONLY this user
            sales_reps_query = sales_reps_query.filter(SalesRep.id == user_id)

    # Filter by Fiscal Year (Optional, default to latest)
    fiscal_year_id = request.args.get('fiscal_year_id')
    if fiscal_year_id:
        sales_reps_query = sales_reps_query.filter(SalesRep.fiscal_year_id == int(fiscal_year_id))
    else:
        # Default to the most recent fiscal year if none specified
        latest_fy = db.query(FiscalYear).order_by(FiscalYear.year.desc()).first()
        if latest_fy:
            sales_reps_query = sales_reps_query.filter(SalesRep.fiscal_year_id == latest_fy.id)

    # Exclude admins from the dashboard data (they view but aren't displayed as rows)
    sales_reps_query = sales_reps_query.filter(
        ~SalesRep.role.in_(['system_admin', 'region_admin', 'cluster_admin'])
    ).order_by(SalesRep.name.asc())

    sales_reps = sales_reps_query.all()

    # --- KPI Calculations ---
    
    # Helper to safely get float value
    def safe_float(val):
        return float(val) if val is not None else 0.0

    # Total exit amount across all reps in Q2 (a primary baseline)
    total_q2_exit = sum(safe_float(sr.q2_exit) for sr in sales_reps)
    
    # Calculate Average Quarter-over-Quarter Growth (Q1 Exit vs Previous Year Exit)
    total_q1_qoq = 0
    valid_reps_count = 0
    for sr in sales_reps:
        ly_exit = safe_float(sr.last_year_exit)
        q1_exit = safe_float(sr.q1_exit)
        if ly_exit:
            # Percentage growth calculation
            qoq = ((q1_exit / ly_exit) - 1) * 100
            total_q1_qoq += qoq
            valid_reps_count += 1
    
    avg_qoq_growth = total_q1_qoq / valid_reps_count if valid_reps_count else 0
    # Total potential upside for Q3
    total_upside = sum(safe_float(sr.q3_add_upside) for sr in sales_reps) 
    # Risk factor: How much of our target exit is contingent on deals marked as Upside
    pct_exit_dependent_on_upside = (total_upside / total_q2_exit * 100) if total_q2_exit else 0

    reps_data = []
    for sr in sales_reps:
        # Sequential Quarter-over-Quarter Growth Calculations (On-the-fly)
        
        # Safe values for calculations
        last_year_exit = safe_float(sr.last_year_exit)
        q1_exit = safe_float(sr.q1_exit)
        q1_total = safe_float(sr.q1_total_exit_with_fc)
        q2_exit = safe_float(sr.q2_exit)
        q2_total = safe_float(sr.q2_total_exit_with_fc)
        q3_exit = safe_float(sr.q3_exit)
        q3_total = safe_float(sr.q3_total_exit_with_fc)
        q4_exit = safe_float(sr.q4_exit)
        q4_total = safe_float(sr.q4_total_exit_with_fc)

        # --- Q1 Calculations ---
        q1_qoq = 0.0
        if last_year_exit:
            q1_qoq = ((q1_exit / last_year_exit) - 1) * 100
        # QoQ considering forecasted deals
        q1_qoq_plus = 0.0
        if last_year_exit:
            q1_qoq_plus = ((q1_total / last_year_exit) - 1) * 100

        # --- Q2 Calculations ---
        q2_qoq = 0.0
        if q1_exit:
            q2_qoq = ((q2_exit / q1_exit) - 1) * 100
        q2_qoq_plus = 0.0
        if q1_exit:
            q2_qoq_plus = ((q2_total / q1_exit) - 1) * 100

        # --- Q3 Calculations ---
        q3_qoq = 0.0
        if q2_exit:
            q3_qoq = ((q3_exit / q2_exit) - 1) * 100
        q3_qoq_plus = 0.0
        if q2_exit:
            q3_qoq_plus = ((q3_total / q2_exit) - 1) * 100

        # --- Q4 Calculations ---
        q4_qoq = 0.0
        if q3_exit:
            q4_qoq = ((q4_exit / q3_exit) - 1) * 100
        q4_qoq_plus = 0.0
        if q3_exit:
            q4_qoq_plus = ((q4_total / q3_exit) - 1) * 100

        # Map model fields to serializable dictionary
        reps_data.append({
            "id": sr.id,
            "name": sr.name,
            "username": sr.username,
            "role": sr.role,
            "last_year_exit": last_year_exit,
            
            # Q1 Metrics
            "q1_exit": q1_exit,
            "q1_qoq_pct": q1_qoq,
            "q1_add_fct": safe_float(sr.q1_add_fct),
            "q1_total_exit_with_fc": q1_total,
            "q1_qoq_plus_fct_pct": q1_qoq_plus,
            "q1_add_upside": safe_float(sr.q1_add_upside),
            
            # Q2 Metrics
            "q2_exit": q2_exit,
            "q2_qoq_pct": q2_qoq,
            "q2_add_fct": safe_float(sr.q2_add_fct),
            "q2_total_exit_with_fc": q2_total,
            "q2_qoq_plus_fct_pct": q2_qoq_plus,
            "q2_add_upside": safe_float(sr.q2_add_upside),

            # Monthly Actuals
            "jan": safe_float(sr.jan),
            "feb": safe_float(sr.feb),
            "mar": safe_float(sr.mar),
            "apr": safe_float(sr.apr),
            "may": safe_float(sr.may),
            "jun": safe_float(sr.jun),
            "jul": safe_float(sr.jul),
            "aug": safe_float(sr.aug),
            "sep": safe_float(sr.sep),
            "oct": safe_float(sr.oct),
            "nov": safe_float(sr.nov),
            "dec": safe_float(sr.dec),
            
            # Estimates
            "partial_data_date": sr.partial_data_date,
            "current_month_est": safe_float(sr.current_month_est),
            "last_week_daily_rate": safe_float(sr.last_week_daily_rate),
            "current_daily_rate": safe_float(sr.current_daily_rate),
            "simulation": safe_float(sr.simulation),

            # Q3 Metrics
            "q3_exit": q3_exit,
            "q3_qoq_pct": q3_qoq,
            "q3_add_fct": safe_float(sr.q3_add_fct),
            "q3_total_exit_with_fc": q3_total,
            "qoq_plus_fct_pct": q3_qoq_plus, # Matches frontend expectation for Q3
            "q3_add_upside": safe_float(sr.q3_add_upside),

            # Q4 Metrics
            "q4_exit": q4_exit,
            "q4_qoq_pct": q4_qoq,
            "q4_add_fct": safe_float(sr.q4_add_fct),
            "q4_total_exit_with_fc": q4_total,
            "q4_qoq_plus_fct_pct": q4_qoq_plus,
            "q4_add_upside": safe_float(sr.q4_add_upside)
        })

    return jsonify({
        "cluster_id": cluster.id, 
        "cluster_name": cluster.name,
        "partial_data_date": cluster.partial_data_date,
        "region_id": cluster.region_id,
        "region_name": cluster.region.name if cluster.region else None,
        "kpis": {
            "total_q2_exit": round(total_q2_exit, 2),
            "avg_qoq_growth": round(avg_qoq_growth, 2),
            "total_upside": round(total_upside, 2),
            "pct_exit_dependent_on_upside": round(pct_exit_dependent_on_upside, 2)
        },
        "sales_reps": reps_data
    })


@app.route('/api/sales_reps', methods=['GET'])
def get_sales_reps():
    """
    Retrieves all sales representatives.
    Optionally filters by cluster.
    
    Returns:
        JSON: List of sales reps.
    """
    db = get_db()
    cluster_id = request.args.get('cluster_id')
    if cluster_id:
        reps = db.query(SalesRep).filter(SalesRep.cluster_id == int(cluster_id)).all()
    else:
        reps = db.query(SalesRep).all()
    # Return basic info only
    return jsonify([{
        "id": r.id, 
        "name": r.name, 
        "cluster_id": r.cluster_id,
        "region_id": r.region_id,
        "last_year_exit": r.last_year_exit,
        "q1_exit": r.q1_exit,
        "username": r.username,
        "role": r.role
    } for r in reps])


@app.route('/api/sales_reps', methods=['POST'])
def create_sales_rep():
    """
    Creates a new sales representative.
    
    Returns:
        JSON: Created sales rep info.
    """
    data = request.json
    db = get_db()
    # Default to latest fiscal year if not provided
    fy_id = data.get('fiscal_year_id')
    if not fy_id:
        latest_fy = db.query(FiscalYear).order_by(FiscalYear.year.desc()).first()
        if not latest_fy:
             return jsonify({"error": "No fiscal year defined. Please seed database."}), 400
        fy_id = latest_fy.id

    rep = SalesRep(
        cluster_id=data.get('cluster_id'),  # Now optional
        region_id=data.get('region_id'),    # For Region Admins
        fiscal_year_id=fy_id,
        name=data['name'],
        last_year_exit=data.get('last_year_exit', 0),
        q1_exit=data.get('q1_exit', 0),
        username=data.get('username'),
        role=data.get('role', 'user')
    )
    if 'password' in data:
         rep.password_hash = hash_password(data['password'])

    db.add(rep)
    db.commit()
    db.refresh(rep)
    return jsonify({
        "id": rep.id, 
        "name": rep.name,
        "cluster_id": rep.cluster_id,
        "fiscal_year_id": rep.fiscal_year_id,
        "username": rep.username,
        "role": rep.role
    }), 201


@app.route('/api/sales_reps/<int:rep_id>', methods=['PUT'])
def update_sales_rep(rep_id):
    """
    Updates a Sales Rep's data and triggers a recalculation of all derived metrics.
    
    Order of operations:
    1. Sync workload aggregations (FCT/Upside).
    2. Update editable fields.
    3. Recalculate future monthly estimates based on Daily Rate.
    4. Force a second workload sync to ensure totals remain consistent.
    5. Aggregate Q3 and Q4 totals.
    
    Args:
        rep_id (int): ID of the sales rep.
    """
    data = request.json
    db = get_db()
    rep = db.query(SalesRep).filter(SalesRep.id == rep_id).first()
    if not rep:
        return jsonify({"error": "Sales rep not found"}), 404

    # --- Step 1: Pre-Sync Workloads ---
    # Retrieve current aggregate "Add FCT" and "Add Upside" from individual deals
    update_from_workloads(rep, db)

    # --- Step 2: Update Manual overrides/fields ---
    # --- Step 2: Update Manual overrides/fields ---
    rep.name = data.get('name', rep.name)
    
    # Auth fields
    if 'username' in data:
        rep.username = data['username']
    if 'role' in data:
        rep.role = data['role']
    if 'region_id' in data:
        rep.region_id = data['region_id']
    if 'cluster_id' in data:
        rep.cluster_id = data['cluster_id']
    if 'password' in data and data['password']:
        rep.password_hash = hash_password(data['password'])

    # Helper for safe float conversion
    def safe_float(val):
        if val is None: return 0.0
        try:
            return float(val)
        except (ValueError, TypeError):
            return 0.0

    rep.last_year_exit = safe_float(data.get('last_year_exit', rep.last_year_exit))
    
    # Quarterly Exits (Actuals or Overrides)
    rep.q1_exit = safe_float(data.get('q1_exit', rep.q1_exit))
    rep.q1_add_fct = safe_float(data.get('q1_add_fct', rep.q1_add_fct))
    rep.q1_add_upside = safe_float(data.get('q1_add_upside', rep.q1_add_upside))
    
    rep.q2_exit = safe_float(data.get('q2_exit', rep.q2_exit))
    rep.q2_add_fct = safe_float(data.get('q2_add_fct', rep.q2_add_fct))
    rep.q2_add_upside = safe_float(data.get('q2_add_upside', rep.q2_add_upside))
    
    rep.q4_exit = safe_float(data.get('q4_exit', rep.q4_exit))
    rep.q4_add_fct = safe_float(data.get('q4_add_fct', rep.q4_add_fct))
    rep.q4_add_upside = safe_float(data.get('q4_add_upside', rep.q4_add_upside))
    
    # Calculation Parameters
    rep.last_week_daily_rate = safe_float(data.get('last_week_daily_rate', rep.last_week_daily_rate))
    rep.current_daily_rate = safe_float(data.get('current_daily_rate', rep.current_daily_rate))
    rep.simulation = safe_float(data.get('simulation', rep.simulation))
    
    # Monthly Actuals
    rep.jan = safe_float(data.get('jan', rep.jan))
    rep.feb = safe_float(data.get('feb', rep.feb))
    rep.mar = safe_float(data.get('mar', rep.mar))
    rep.apr = safe_float(data.get('apr', rep.apr))
    rep.may = safe_float(data.get('may', rep.may))
    rep.jun = safe_float(data.get('jun', rep.jun))
    rep.jul = safe_float(data.get('jul', rep.jul))
    rep.aug = safe_float(data.get('aug', rep.aug))
    rep.sep = safe_float(data.get('sep', rep.sep))
    rep.oct = safe_float(data.get('oct', rep.oct))
    rep.nov = safe_float(data.get('nov', rep.nov))
    rep.dec = safe_float(data.get('dec', rep.dec))
    
    rep.current_month_est = safe_float(data.get('current_month_est', rep.current_month_est))
    
    # --- Step 3: Run Estimation Engine ---
    # Fetch cluster context for partial data logic
    cluster = rep.cluster or db.query(Cluster).filter(Cluster.id == rep.cluster_id).first()
    p_date = cluster.partial_data_date if cluster else None
    
    # Projection: Updates individual months based on daily rate
    calculate_future_estimates(rep, p_date)
    
    # Aggregation: Sums monthly fields into quarterly exit values and adds workloads
    update_from_workloads(rep, db)

    db.commit()
    
    return jsonify({
        "id": rep.id, 
        "name": rep.name,
        "current_month_est": rep.current_month_est,
        "q3_exit": rep.q3_exit
    })


@app.route('/api/sales_reps/<int:rep_id>', methods=['DELETE'])
def delete_sales_rep(rep_id):
    """Delete a sales rep"""
    db = get_db()
    rep = db.query(SalesRep).filter(SalesRep.id == rep_id).first()
    if not rep:
        return jsonify({"error": "Sales rep not found"}), 404
    db.delete(rep)
    db.commit()
    return jsonify({"message": "Deleted"})


@app.route('/api/clusters/<int:cluster_id>', methods=['DELETE'])
def delete_cluster(cluster_id):
    """Delete a cluster and all its sales reps"""
    db = get_db()
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        return jsonify({"error": "Cluster not found"}), 404
    db.delete(cluster)
    db.commit()
    return jsonify({"message": "Deleted"})


@app.route('/api/workloads', methods=['GET'])
def get_workloads():
    """
    Retrieves all individual deal workloads.
    Supports filtering by sales_rep_id or cluster_id.
    
    Returns:
        JSON: List of workloads with associated sales rep names.
    """
    db = get_db()
    sales_rep_id = request.args.get('sales_rep_id')
    cluster_id = request.args.get('cluster_id')

    query = db.query(Workload)
    
    # SECURITY: Role-based filtering
    user_id = session.get('user_id')
    if user_id:
        current_user = db.query(SalesRep).filter(SalesRep.id == user_id).first()
        if current_user and current_user.role == 'user':
            # Override any requested sales_rep_id or cluster_id to ONLY show own workloads
            query = query.filter(Workload.sales_rep_id == user_id)
            # Early exit from other logic to avoid accidental exposure
            workloads = query.all()
            return jsonify([{
                "id": w.id,
                "sales_rep_id": w.sales_rep_id,
                "sales_rep_name": w.sales_rep.name if w.sales_rep else None,
                "account_name": w.account_name,
                "forecast_type": w.forecast_type,
                "customer_type": w.customer_type,
                "workload_type": w.workload_type,
                "country": w.country,
                "comments": w.comments,
                "opt_id": w.opt_id,
                "quarter": w.quarter,
                "month_1_amt": w.month_1_amt,
                "month_2_amt": w.month_2_amt,
                "month_3_amt": w.month_3_amt,
                "consumption_start_date": w.consumption_start_date,
                "total_amount": w.total_amount
            } for w in workloads])

    if sales_rep_id:
        query = query.filter(Workload.sales_rep_id == int(sales_rep_id))
    elif cluster_id:
        # Resolve all rep IDs in the cluster to filter workloads
        rep_ids = [r.id for r in db.query(SalesRep).filter(SalesRep.cluster_id == int(cluster_id)).all()]
        query = query.filter(Workload.sales_rep_id.in_(rep_ids))

    workloads = query.all()
    return jsonify([{
        "id": w.id,
        "sales_rep_id": w.sales_rep_id,
        "sales_rep_name": w.sales_rep.name if w.sales_rep else None,
        "account_name": w.account_name,
        "forecast_type": w.forecast_type,
        "customer_type": w.customer_type,
        "workload_type": w.workload_type,
        "country": w.country,
        "comments": w.comments,
        "opt_id": w.opt_id,
        "quarter": w.quarter,
        "month_1_amt": w.month_1_amt,
        "month_2_amt": w.month_2_amt,
        "month_3_amt": w.month_3_amt,
        "consumption_start_date": w.consumption_start_date,
        "total_amount": w.total_amount
    } for w in workloads])


@app.route('/api/workloads', methods=['POST'])
def create_workload():
    """
    Creates a new workload deal.
    Automatically assigns the fiscal quarter/year based on start date.
    Triggers a sync of the Sales Rep's aggregate totals.
    
    Returns:
        JSON: Created workload ID.
    """
    data = request.json
    db = get_db()
    
    start_date = data.get('consumption_start_date')
    # Determine the correct bucket for this deal
    quarter, fy_id = derive_fiscal_info(start_date, db)
    
    month_1 = float(data.get('month_1_amt', 0))
    month_2 = float(data.get('month_2_amt', 0))
    month_3 = float(data.get('month_3_amt', 0))
    
    workload = Workload(
        sales_rep_id=data['sales_rep_id'],
        fiscal_year_id=fy_id,
        account_name=data['account_name'],
        forecast_type=data['forecast_type'],
        customer_type=data['customer_type'],
        workload_type=data.get('workload_type', ''),
        country=data.get('country', ''),
        comments=data.get('comments', ''),
        opt_id=data.get('opt_id', ''),
        quarter=quarter,
        month_1_amt=month_1,
        month_2_amt=month_2,
        month_3_amt=month_3,
        total=month_1 + month_2 + month_3,
        consumption_start_date=start_date
    )
    db.add(workload)
    db.commit()
    db.refresh(workload)
    
    # Sync relevant Sales Rep aggregate fields immediately
    # Explicitly fetch the SalesRep to ensure the relationship is loaded
    rep = db.query(SalesRep).filter(SalesRep.id == data['sales_rep_id']).first()
    if rep:
        update_from_workloads(rep, db)
        db.commit()
        
    return jsonify({"id": workload.id, "account_name": workload.account_name}), 201


@app.route('/api/workloads/<int:workload_id>', methods=['PUT'])
def update_workload(workload_id):
    """
    Updates an existing workload deal.
    If the start date changes, the fiscal quarter and year are recalculated.
    
    Returns:
        JSON: Updated workload info.
    """
    data = request.json
    db = get_db()
    workload = db.query(Workload).filter(Workload.id == workload_id).first()
    if not workload:
        return jsonify({"error": "Workload not found"}), 404

    # Update basic deal information
    workload.account_name = data.get('account_name', workload.account_name)
    workload.forecast_type = data.get('forecast_type', workload.forecast_type)
    workload.customer_type = data.get('customer_type', workload.customer_type)
    workload.workload_type = data.get('workload_type', workload.workload_type)
    workload.country = data.get('country', workload.country)
    workload.comments = data.get('comments', workload.comments)
    workload.opt_id = data.get('opt_id', workload.opt_id)
    workload.month_1_amt = float(data.get('month_1_amt', workload.month_1_amt))
    workload.month_2_amt = float(data.get('month_2_amt', workload.month_2_amt))
    workload.month_3_amt = float(data.get('month_3_amt', workload.month_3_amt))
    # Recalculate total when amounts change
    workload.total = workload.month_1_amt + workload.month_2_amt + workload.month_3_amt
    
    # Check for date shifts which might move the deal to a different fiscal bucket
    new_start_date = data.get('consumption_start_date', workload.consumption_start_date)
    if new_start_date != workload.consumption_start_date:
        workload.consumption_start_date = new_start_date
        quarter, fy_id = derive_fiscal_info(new_start_date, db)
        workload.quarter = quarter
        workload.fiscal_year_id = fy_id

    db.commit()
    
    # Trigger a recalculation of the parent Sales Rep's totals
    # Always recalculate - explicitly fetch the SalesRep to ensure relationship is loaded
    rep = db.query(SalesRep).filter(SalesRep.id == workload.sales_rep_id).first()
    if rep:
        update_from_workloads(rep, db)
        db.commit()
        
    return jsonify({"id": workload.id, "account_name": workload.account_name})


@app.route('/api/workloads/<int:workload_id>', methods=['DELETE'])
def delete_workload(workload_id):
    """
    Deletes a workload deal and updates the Sales Rep's summary totals.
    """
    db = get_db()
    workload = db.query(Workload).filter(Workload.id == workload_id).first()
    if not workload:
        return jsonify({"error": "Workload not found"}), 404
    
    # Capture the sales_rep_id BEFORE deleting the workload
    sales_rep_id = workload.sales_rep_id
    db.delete(workload)
    db.commit()
    
    # Ensure Sales Rep totals are updated to remove this deal's contribution
    # Explicitly fetch the SalesRep to ensure recalculation happens
    rep = db.query(SalesRep).filter(SalesRep.id == sales_rep_id).first()
    if rep:
        update_from_workloads(rep, db)
        db.commit()
        
    return jsonify({"message": "Deleted"})


# --- Helpers ---

def calculate_future_estimates(rep, partial_data_date=None):
    """
    Project future monthly totals based on the Current Daily Rate.
    
    Logic:
    - Past Months: Unchanged (manually entered actuals)
    - Current Month: Use partial_data_date for partial calculation
    - Future Months: Simple calculation = Daily Rate × Days in Month
    """
    import calendar
    from datetime import date
    
    if not rep.current_daily_rate:
        return

    today = date.today()
    
    # Parse partial_data_date for current month calculation
    reference_date = today
    if partial_data_date:
        try:
            from dateutil import parser
            if isinstance(partial_data_date, str):
                reference_date = parser.parse(partial_data_date).date()
            else:
                reference_date = partial_data_date
        except:
            pass
    
    month_map = {
        1: 'jan', 2: 'feb', 3: 'mar', 4: 'apr', 5: 'may', 6: 'jun',
        7: 'jul', 8: 'aug', 9: 'sep', 10: 'oct', 11: 'nov', 12: 'dec'
    }
    
    current_year = today.year
    current_month_idx = today.month
    
    for m_idx, field_name in month_map.items():
        # Align FY months with Calendar Years
        target_year = current_year
        if current_month_idx >= 6:  # First Half of FY (June-Dec)
            if m_idx < 6: target_year += 1
        else:  # Second Half of FY (Jan-May)
            if m_idx >= 6: target_year -= 1
            
        month_start = date(target_year, m_idx, 1)
        days_in_month = calendar.monthrange(target_year, m_idx)[1]
        month_end = date(target_year, m_idx, days_in_month)
        
        # --- FUTURE MONTH: Simple projection ---
        if today < month_start:
            est = rep.current_daily_rate * days_in_month
            setattr(rep, field_name, est)
        
        # --- CURRENT MONTH: Use partial_data_date ---
        elif month_start <= today <= month_end:
            passed_days = reference_date.day
            remaining_days = days_in_month - passed_days + 0.5
            current_actual = getattr(rep, field_name) or 0.0
            est = current_actual + (rep.current_daily_rate * remaining_days)
            setattr(rep, field_name, est)
            rep.current_month_est = est
        
        # --- PAST MONTH: Do nothing (retain manual actuals) ---





def update_from_workloads(rep, db):
    """
    Synchronizes the Sales Rep summary fields with the aggregate data from their Workloads.
    Also automates quarterly Exit values based on monthly fields and simulation logic.
    """
    from datetime import date
    
    # --- 1. Identify Context (Current/Next Quarter) ---
    cluster = rep.cluster or db.query(Cluster).filter(Cluster.id == rep.cluster_id).first()
    p_date = cluster.partial_data_date if cluster else None
    
    reference_date = date.today()
    if p_date:
        try:
            from dateutil import parser
            reference_date = parser.parse(p_date).date()
        except:
            pass
            
    # Derive Current Quarter (June Start)
    m = reference_date.month
    if m in [6, 7, 8]: current_q = 'q1'
    elif m in [9, 10, 11]: current_q = 'q2'
    elif m in [12, 1, 2]: current_q = 'q3'
    else: current_q = 'q4'
    
    # Derive Next Quarter
    q_order = ['q1', 'q2', 'q3', 'q4']
    curr_idx = q_order.index(current_q)
    next_q = q_order[(curr_idx + 1) % 4]

    # --- 2. Aggregate Workloads ---
    sums = {q: {'forecast': 0.0, 'upside': 0.0} for q in q_order}
    for w in rep.workloads:
        q = w.quarter.lower()
        if q not in sums: continue
        ftype = w.forecast_type.lower()
        amount = w.total_amount
        if 'upside' in ftype:
            sums[q]['upside'] += amount
        elif any(keyword in ftype for keyword in ['forecast', 'fct', 'commit', 'pipeline']):
            sums[q]['forecast'] += amount

    # --- 3. Automate Quarterly Exits from Monthly Fields ---
    rep.q1_exit = (rep.jun or 0) + (rep.jul or 0) + (rep.aug or 0)
    rep.q2_exit = (rep.sep or 0) + (rep.oct or 0) + (rep.nov or 0)
    rep.q3_exit = (rep.dec or 0) + (rep.jan or 0) + (rep.feb or 0)
    rep.q4_exit = (rep.mar or 0) + (rep.apr or 0) + (rep.may or 0)
    
    # Apply Simulation to Current and Next Quarter only
    for q in [current_q, next_q]:
        setattr(rep, f"{q}_exit", getattr(rep, f"{q}_exit") + (rep.simulation or 0))

    # --- 4. Persist Workload Totals ---
    for q in q_order:
        setattr(rep, f"{q}_add_fct", sums[q]['forecast'])
        setattr(rep, f"{q}_add_upside", sums[q]['upside'])
    
    # --- 5. Finalize Performance Metrics ---
    rep.q1_total_exit_with_fc = rep.q1_exit + rep.q1_add_fct
    rep.q2_total_exit_with_fc = rep.q2_exit + rep.q2_add_fct
    rep.q3_total_exit_with_fc = rep.q3_exit + rep.q3_add_fct
    rep.q4_total_exit_with_fc = rep.q4_exit + rep.q4_add_fct






@app.route('/api/workloads/upload', methods=['POST'])
def upload_workloads():
    """
    Handles bulk upload of workloads from Excel or CSV files.
    
    Logic:
    1. Parses the uploaded file using Pandas.
    2. Identifies Sales Reps by name (creates them if they don't exist in the cluster).
    3. Infers fiscal quarter and year from the 'Consumption Start Date'.
    4. Upserts workload records based on (Sales Rep, Account Name, Opt ID) uniqueness.
    5. Triggers a full synchronization for all reps in the affected cluster.
    """
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    cluster_id = request.form.get('cluster_id')
    
    if not cluster_id:
        return jsonify({"error": "Missing cluster_id"}), 400

    try:
        # Step 1: File Format Handling
        if file.filename.lower().endswith('.csv'):
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)
        
        db = get_db()
        default_quarter = request.form.get('default_quarter', 'Q3')
        
        # Step 2: DataFrame Normalization
        # Standardize column headers to lowercase and strip whitespace
        df.columns = [str(c).strip().lower() for c in df.columns]
        # Treat NaN values as None for database compatibility
        df = df.where(pd.notnull(df), None)
        
        count_added = 0
        count_updated = 0
        
        # Step 3: Row-by-Row Processing
        for _, row in df.iterrows():
            # Flexible Column Lookup: Supports various naming conventions in Excel
            def get_val(keys, default=None):
                for k in keys:
                    if k in row:
                        val = row[k]
                        if val is not None and str(val).strip() != '':
                            return val
                return default

            # --- Entity: Sales Rep ---
            # Attempt to find rep name in common column headers
            rep_name = get_val(['sales rep name', 'sales rep', 'rep', 'owner'])
            if not rep_name: continue
            
            # Locate or create the Sales Rep within the current cluster context
            rep = db.query(SalesRep).filter(SalesRep.name == str(rep_name).strip(), SalesRep.cluster_id == int(cluster_id)).first()
            if not rep:
                # Critical Fix: Must assign a fiscal_year_id when creating a new rep
                latest_fy = db.query(FiscalYear).order_by(FiscalYear.year.desc()).first()
                if not latest_fy:
                     return jsonify({"error": "No fiscal year found. Please seed database."}), 400
                
                rep = SalesRep(
                    name=str(rep_name).strip(), 
                    cluster_id=int(cluster_id),
                    fiscal_year_id=latest_fy.id
                )
                db.add(rep)
                db.flush() # Ensure rep has an ID before creating workloads
            
            # --- Field: Date Processing ---
            raw_date = get_val(['consumption start date', 'start date', 'date', 'start'])
            parsed_date = ''
            if raw_date and str(raw_date).strip().lower() not in ['nat', 'nan', 'none']:
                try:
                    if hasattr(raw_date, 'strftime'):
                        parsed_date = raw_date.strftime('%Y-%m-%d')
                    else:
                        from dateutil import parser
                        parsed_date = parser.parse(str(raw_date)).strftime('%Y-%m-%d')
                except:
                    parsed_date = '' # Fallback on invalid date strings
            
            # --- Field: Fiscal Assignment ---
            if parsed_date:
                quarter, fy_id = derive_fiscal_info(parsed_date, db)
            else:
                quarter = default_quarter
                latest_fy = db.query(FiscalYear).order_by(FiscalYear.year.desc()).first()
                fy_id = latest_fy.id if latest_fy else None

            # --- Field: Monetary Cleanup ---
            def clean_money(val):
                """ Strips currency symbols and converts string numbers to floats. """
                if isinstance(val, str):
                    val = val.replace('$', '').replace(',', '').replace('"', '').strip()
                    if val == '-' or val == '': return 0.0
                try:
                    return float(val)
                except:
                    return 0.0

            # Map Excel columns to monthly buckets (Updated to include Q2: Sep/Oct/Nov)
            m1 = clean_money(get_val(['month 1', 'dec', 'december', 'mar', 'march', 'june', 'jun', 'sep', 'september'], 0))
            m2 = clean_money(get_val(['month 2', 'jan', 'january', 'apr', 'april', 'july', 'jul', 'oct', 'october'], 0))
            m3 = clean_money(get_val(['month 3', 'feb', 'february', 'may', 'august', 'aug', 'nov', 'november'], 0))

            acct_name = str(get_val(['account name', 'account', 'customer', 'customer name'], 'Unknown'))
            f_type = str(get_val(['forecast type', 'forecast', 'type', 'stage'], 'Forecast'))
            opt_id_val = str(get_val(['opt id', 'opportunity id', 'opt', 'opty id', 'opportunity'], ''))

            # --- Step 4: UPSERT Logic ---
            # Determine uniqueness by (Rep + Account + Opportunity ID)
            existing_wl = db.query(Workload).filter(
                Workload.sales_rep_id == rep.id,
                Workload.account_name == acct_name,
                Workload.opt_id == opt_id_val
            ).first()
            
            # Prepared updated field set
            updated_fields = {
                'sales_rep_id': rep.id,
                'fiscal_year_id': fy_id,
                'account_name': acct_name,
                'forecast_type': f_type,
                'customer_type': str(get_val(['customer type', 'customer_type'], 'Existing')),
                'workload_type': str(get_val(['workload type', 'wl type', 'workload'], '')),
                'country': str(get_val(['country'], '')),
                'comments': str(get_val(['comments', 'comment', 'note', 'notes'], '')),
                'opt_id': opt_id_val,
                'quarter': quarter,
                'month_1_amt': m1,
                'month_2_amt': m2,
                'month_3_amt': m3,
                'total': m1 + m2 + m3,  # Store sum in database
                'consumption_start_date': parsed_date
            }

            if existing_wl:
                # Actual update call
                for key, value in updated_fields.items():
                    setattr(existing_wl, key, value)
                count_updated += 1
            else:
                # Create new record
                wl = Workload(**updated_fields)
                db.add(wl)
                count_added += 1
            
        db.commit()
        
        # --- Step 5: Post-Upload Bulk Synchronization ---
        # Force a calculation update for every rep in the cluster to reflect new deal data
        reps = db.query(SalesRep).filter(SalesRep.cluster_id == int(cluster_id)).all()
        cluster = db.query(Cluster).filter(Cluster.id == int(cluster_id)).first()
        p_date = cluster.partial_data_date if cluster else None
        
        for r in reps:
            update_from_workloads(r, db)
            calculate_future_estimates(r, p_date)
        db.commit()
        
        return jsonify({"message": f"Successfully processed workloads: {count_added} added, {count_updated} updated."}), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/sales_data/upload', methods=['POST'])
def upload_sales_data():
    """
    Uploads core Sales Rep performance data (historic exits, daily rates, monthlies).
    This typically processes the 'FY26 Consumption Numbers' style sheets.
    
    Logic:
    1. Parses the file into a DataFrame.
    2. Maps column names like 'FY25Q4 Exit' to database fields like 'last_year_exit'.
    3. Calculates Q3 Estimates based on a business logic formula:
       (Current Actual Jan + Jan Est + Feb Est + Simulation + Dec Actual)
    4. Upserts Sales Rep records for the latest fiscal year.
    """
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    cluster_id = request.form.get('cluster_id')
    
    if not cluster_id:
        return jsonify({"error": "Missing cluster_id"}), 400

    try:
        # Step 1: Format Handling
        if file.filename.lower().endswith('.csv'):
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)
        
        db = get_db()
        
        # Standardize column headers
        df.columns = [str(c).strip().lower() for c in df.columns]
        
        # Helper: Robust float extraction from messy Excel strings
        def get_float(row, keys, default=0.0):
            for k in keys:
                if k in row:
                    val = row[k]
                    try:
                        if isinstance(val, str):
                            # Remove currency and formatting symbols
                            val = val.replace('$', '').replace(',', '').replace('%', '').strip()
                            if val in ['-', '']: return default
                        return float(val) if pd.notnull(val) else default
                    except:
                        pass
            return default

        # Helper: Robust string extraction
        def get_str(row, keys, default=''):
            for k in keys:
                if k in row and pd.notnull(row[k]):
                    return str(row[k]).strip()
            return default

        count = 0
        # Iterate through sales reps in the sheet
        for _, row in df.iterrows():
            # Identify the target Sales Rep
            rep_name = get_str(row, ['sales rep', 'rep name', 'sales_rep', 'rep_name'], None)
            if not rep_name or rep_name.lower() == 'total': continue

            # --- Step 2: Extract Performance Metrics ---
            last_year_exit = get_float(row, ['fy25q4 exit', 'fy25 q4 exit'])
            q1_exit = get_float(row, ['fy26q1 exit', 'fy26 q1 exit'])
            q2_exit_raw = get_float(row, ['fy26q2 exit', 'fy26 q2 exit'])
            
            last_week_daily_rate = get_float(row, ['last week daily rate'])
            current_daily_rate = get_float(row, ['current daily rate'])
            
            december_actual = get_float(row, ['december actual'])
            current_actual_jan = get_float(row, ['current actual jan'])
            
            # --- Step 3: Complex Business Logic Calculations ---
            # Monthly estimates and quarterly aggregations are now handled by helpers
            
            # --- Step 4: Database Persistence ---
            # Default to the most recently created Fiscal Year
            latest_fy = db.query(FiscalYear).order_by(FiscalYear.year.desc()).first()
            if not latest_fy:
                  return jsonify({"error": "No fiscal year found. Please seed database."}), 400

            # Match by Name within the Cluster and FY
            rep = db.query(SalesRep).filter(
                SalesRep.name == rep_name, 
                SalesRep.cluster_id == int(cluster_id),
                SalesRep.fiscal_year_id == latest_fy.id
            ).first()
            
            if not rep:
                rep = SalesRep(
                    name=rep_name, 
                    cluster_id=int(cluster_id),
                    fiscal_year_id=latest_fy.id
                )
                db.add(rep)
            
            # Update basic input fields
            rep.last_year_exit = last_year_exit
            rep.q1_exit = q1_exit
            rep.q2_exit = q2_exit
            rep.last_week_daily_rate = last_week_daily_rate
            rep.current_daily_rate = current_daily_rate
            rep.simulation = simulation
            
            # Monthly actuals - capture what's in the file
            rep.dec = december_actual
            rep.jan = current_actual_jan
            
            # Trigger centralized projections and aggregations
            cluster_obj = db.query(Cluster).filter(Cluster.id == int(cluster_id)).first()
            p_date = cluster_obj.partial_data_date if cluster_obj else None
            
            # 1. Project future months
            calculate_future_estimates(rep, p_date)
            # 2. Aggregate months into quarters + incorporate workloads
            update_from_workloads(rep, db)
            
            count += 1

        db.commit()
        return jsonify({"message": f"Successfully imported {count} sales reps"}), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/analytics/regions', methods=['GET'])
def get_region_analytics():
    """
    Returns aggregated analytics for a specific region or globally.
    Query Params:
        region_id (int|str): ID of the region, or 'all' for global view.
    """
    try:
        db = get_db()
        region_id_param = request.args.get('region_id', 'all')
        
        # helper
        def safe_float(val):
            return float(val) if val is not None else 0.0

        # 1. Scope Determination
        if region_id_param == 'all':
            clusters = db.query(Cluster).all()
            scope_name = "All Regions"
        else:
            try:
                r_id = int(region_id_param)
                region = db.query(Region).filter(Region.id == r_id).first()
                if not region:
                    return jsonify({"error": "Region not found"}), 404
                clusters = db.query(Cluster).filter(Cluster.region_id == r_id).all()
                scope_name = region.name
            except ValueError:
                 return jsonify({"error": "Invalid region_id"}), 400

        # 2. Aggregation Logic
        # We need to build a list of clusters with their stats, and a global sum.
        
        global_stats = {
            "total_q2_exit": 0.0,
            "total_upside": 0.0,
            "new_logo_count": 0,
            "new_logo_sum": 0.0,
            "existing_count": 0,
            "existing_sum": 0.0,
            "non_reportable_count": 0,
            "non_reportable_sum": 0.0
        }

        clusters_data = []

        for cluster in clusters:
            # Get all reps for this cluster
            reps = db.query(SalesRep).filter(SalesRep.cluster_id == cluster.id).all()
            
            c_stats = {
                "id": cluster.id,
                "name": cluster.name,
                "total_q2_exit": 0.0,
                "total_upside": 0.0,
                "new_logo_count": 0,
                "new_logo_sum": 0.0,
                "existing_count": 0,
                "existing_sum": 0.0,
                "non_reportable_count": 0,
                "non_reportable_sum": 0.0
            }

            for rep in reps:
                # Dashboard Metric: Q2 Exit
                c_stats["total_q2_exit"] += safe_float(rep.q2_exit)
                
                # Dashboard Metric: Upside
                # Add Q3 Upside from Rep model (consistency)
                c_stats["total_upside"] += safe_float(rep.q3_add_upside)
                
                # Workload Analysis
                for wl in rep.workloads:
                    amount = wl.total_amount
                    
                    # Customer Type Analysis
                    ctype = (wl.customer_type or "").lower()
                    if "new logo" in ctype:
                        c_stats["new_logo_count"] += 1
                        c_stats["new_logo_sum"] += amount
                    elif "existing customer" in ctype:
                        c_stats["existing_count"] += 1
                        c_stats["existing_sum"] += amount
                    
                    # Workload Type Analysis
                    wtype = (wl.workload_type or "").lower()
                    if "non-reportable" in wtype:
                        c_stats["non_reportable_count"] += 1
                        c_stats["non_reportable_sum"] += amount

            # Update Global Stats
            global_stats["total_q2_exit"] += c_stats["total_q2_exit"]
            global_stats["total_upside"] += c_stats["total_upside"]
            
            global_stats["new_logo_count"] += c_stats["new_logo_count"]
            global_stats["new_logo_sum"] += c_stats["new_logo_sum"]
            
            global_stats["existing_count"] += c_stats["existing_count"]
            global_stats["existing_sum"] += c_stats["existing_sum"]
            
            global_stats["non_reportable_count"] += c_stats["non_reportable_count"]
            global_stats["non_reportable_sum"] += c_stats["non_reportable_sum"]

            # Formatting for JSON
            c_stats["total_q2_exit"] = round(c_stats["total_q2_exit"], 2)
            c_stats["total_upside"] = round(c_stats["total_upside"], 2)
            c_stats["new_logo_sum"] = round(c_stats["new_logo_sum"], 2)
            c_stats["existing_sum"] = round(c_stats["existing_sum"], 2)
            c_stats["non_reportable_sum"] = round(c_stats["non_reportable_sum"], 2)
            
            clusters_data.append(c_stats)

        # Formatting Global
        global_stats["total_q2_exit"] = round(global_stats["total_q2_exit"], 2)
        global_stats["total_upside"] = round(global_stats["total_upside"], 2)
        global_stats["new_logo_sum"] = round(global_stats["new_logo_sum"], 2)
        global_stats["existing_sum"] = round(global_stats["existing_sum"], 2)
        global_stats["non_reportable_sum"] = round(global_stats["non_reportable_sum"], 2)

        return jsonify({
            "scope_name": scope_name,
            "aggregates": global_stats,
            "clusters": clusters_data
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500




if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
