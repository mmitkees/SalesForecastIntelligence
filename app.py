import os
from dotenv import load_dotenv

# Load environment variables from .env file if present
load_dotenv()

import contextlib
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory, g
import pandas as pd
import io
from models import init_db, SessionLocal, Cluster, SalesRep, Workload, FiscalYear

app = Flask(__name__, static_folder='static', static_url_path='')


def derive_fiscal_info(date_str, db):
    """
    Derive fiscal quarter and fiscal_year_id from a date string.
    Returns (quarter, fiscal_year_id).
    """
    # Get default (latest) FY as fallback
    current_fy = db.query(FiscalYear).order_by(FiscalYear.year.desc()).first()
    default_fy_id = current_fy.id if current_fy else None
    
    if not date_str:
        return 'Q3', default_fy_id
        
    try:
        if isinstance(date_str, str):
            # Try parsing various formats if needed, but ISO expected
            # Use dateutil if available or crude parsing
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
        if month in [6, 7, 8]: quarter = 'Q1'
        elif month in [9, 10, 11]: quarter = 'Q2'
        elif month in [12, 1, 2]: quarter = 'Q3'
        else: quarter = 'Q4' # 3, 4, 5
        
        # Fiscal Year Logic
        # June 2025 -> FY26. Jan 2026 -> FY26.
        fy_year = year + 1 if month >= 6 else year
        
        fy_obj = db.query(FiscalYear).filter(FiscalYear.year == fy_year).first()
        if fy_obj:
            return quarter, fy_obj.id
        return quarter, default_fy_id
        
    except:
        return 'Q3', default_fy_id


# --- Database connection management ---
def get_db():
    if 'db' not in g:
        g.db = SessionLocal()
    return g.db

@app.teardown_appcontext
def shutdown_session(exception=None):
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


# --- API Routes ---

@app.route('/api/fiscal_years', methods=['GET'])
def get_fiscal_years():
    """Get all fiscal years"""
    db = get_db()
    fys = db.query(FiscalYear).order_by(FiscalYear.year.desc()).all()
    return jsonify([{
        "id": fy.id, 
        "year": fy.year, 
        "start_date": fy.start_date, 
        "end_date": fy.end_date
    } for fy in fys])

@app.route('/api/fiscal_years', methods=['POST'])
def create_fiscal_year():
    """Create a new fiscal year (auto-calculates dates)"""
    data = request.json
    year = int(data.get('year'))
    db = get_db()
    
    # Validation
    if db.query(FiscalYear).filter(FiscalYear.year == year).first():
        return jsonify({"error": f"Fiscal Year {year} already exists"}), 400

    # Auto-calculate dates (FY26 starts June 1 2025 ends May 31 2026)
    # So start year is year - 1
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


@app.route('/api/clusters', methods=['GET'])
def get_clusters():
    """Get all clusters"""
    db = get_db()
    clusters = db.query(Cluster).all()
    return jsonify([{
        "id": c.id, 
        "name": c.name,
        "partial_data_date": c.partial_data_date
    } for c in clusters])


@app.route('/api/clusters', methods=['POST'])
def create_cluster():
    """Create a new cluster"""
    data = request.json
    db = get_db()
    cluster = Cluster(name=data.get('name', 'New Cluster'))
    db.add(cluster)
    db.commit()
    db.refresh(cluster)
    return jsonify({"id": cluster.id, "name": cluster.name, "partial_data_date": cluster.partial_data_date}), 201


@app.route('/api/clusters/<int:cluster_id>', methods=['PUT'])
def update_cluster(cluster_id):
    """Update cluster (name and/or partial_data_date)"""
    data = request.json
    db = get_db()
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        return jsonify({"error": "Cluster not found"}), 404
    
    if 'name' in data:
        cluster.name = data.get('name')
    if 'partial_data_date' in data:
        cluster.partial_data_date = data.get('partial_data_date')
    
    db.commit()
    return jsonify({
        "id": cluster.id, 
        "name": cluster.name,
        "partial_data_date": cluster.partial_data_date
    })


@app.route('/api/dashboard/<int:cluster_id>', methods=['GET'])
def get_dashboard(cluster_id):
    """Get dashboard data for a cluster"""
    db = get_db()
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        return jsonify({"error": "Cluster not found"}), 404

    sales_reps_query = db.query(SalesRep).filter(SalesRep.cluster_id == cluster_id)
    
    # Filter by Fiscal Year (Optional, default to latest)
    fiscal_year_id = request.args.get('fiscal_year_id')
    if fiscal_year_id:
        sales_reps_query = sales_reps_query.filter(SalesRep.fiscal_year_id == int(fiscal_year_id))
    else:
        # Default to the most recent fiscal year
        latest_fy = db.query(FiscalYear).order_by(FiscalYear.year.desc()).first()
        if latest_fy:
            sales_reps_query = sales_reps_query.filter(SalesRep.fiscal_year_id == latest_fy.id)

    sales_reps = sales_reps_query.all()

    # Calculate KPIs
    # Re-calculate workloads for all reps to ensure consistency? 
    # Or assume they are up to date. Let's assume up to date for GET, but update on PUT/POST.
    
    total_q2_exit = sum(sr.q2_exit for sr in sales_reps)
    # Calculate Avg QoQ Growth (Q1 vs Last Year) - doing it on the fly
    total_q1_qoq = 0
    valid_reps_count = 0
    for sr in sales_reps:
        if sr.last_year_exit:
            qoq = ((sr.q1_exit / sr.last_year_exit) - 1) * 100
            total_q1_qoq += qoq
            valid_reps_count += 1
    
    avg_qoq_growth = total_q1_qoq / valid_reps_count if valid_reps_count else 0
    total_upside = sum(sr.q3_add_upside for sr in sales_reps) # Using new upside column
    pct_exit_dependent_on_upside = (total_upside / total_q2_exit * 100) if total_q2_exit else 0

    reps_data = []
    for sr in sales_reps:
        # QoQ Calculations (Sequential)
        # Q1 QoQ = (Q1 Exit / Last Year Exit) - 1
        q1_qoq = 0.0
        if sr.last_year_exit:
            q1_qoq = ((sr.q1_exit / sr.last_year_exit) - 1) * 100
            
        q1_qoq_plus = 0.0
        if sr.last_year_exit:
            q1_qoq_plus = ((sr.q1_total_exit_with_fc / sr.last_year_exit) - 1) * 100

        # Q2 QoQ = (Q2 Exit / Q1 Exit) - 1
        q2_qoq = 0.0
        if sr.q1_exit:
            q2_qoq = ((sr.q2_exit / sr.q1_exit) - 1) * 100
            
        q2_qoq_plus = 0.0
        if sr.q1_exit:
            q2_qoq_plus = ((sr.q2_total_exit_with_fc / sr.q1_exit) - 1) * 100

        # Q3 QoQ = (Q3 Est / Q2 Exit) - 1
        q3_qoq = 0.0
        if sr.q2_exit:
            q3_qoq = ((sr.q3_estimated / sr.q2_exit) - 1) * 100
            
        q3_qoq_plus = 0.0
        if sr.q2_exit:
            q3_qoq_plus = ((sr.q3_total_exit_with_fc / sr.q2_exit) - 1) * 100

        # Q4 QoQ = (Q4 Exit / Q3 Est) - 1
        q4_qoq = 0.0
        if sr.q3_estimated:
            q4_qoq = ((sr.q4_exit / sr.q3_estimated) - 1) * 100
            
        q4_qoq_plus = 0.0
        if sr.q3_estimated:
            q4_qoq_plus = ((sr.q4_total_exit_with_fc / sr.q3_estimated) - 1) * 100

        reps_data.append({
            "id": sr.id,
            "name": sr.name,
            "last_year_exit": sr.last_year_exit,
            
            # Q1
            "q1_exit": sr.q1_exit,
            "q1_add_fct": sr.q1_add_fct,
            "q1_total_exit_with_fc": sr.q1_total_exit_with_fc,
            "q1_add_upside": sr.q1_add_upside,
            "q1_qoq_pct": round(q1_qoq, 1),
            "q1_qoq_plus_fct_pct": round(q1_qoq_plus, 1),
            
            # Q2
            "q2_exit": sr.q2_exit,
            "q2_add_fct": sr.q2_add_fct,
            "q2_total_exit_with_fc": sr.q2_total_exit_with_fc,
            "q2_add_upside": sr.q2_add_upside,
            "q2_qoq_pct": round(q2_qoq, 1),
            "q2_qoq_plus_fct_pct": round(q2_qoq_plus, 1),
            
            # Daily Rates & Simulation
            "last_week_daily_rate": sr.last_week_daily_rate,
            "current_daily_rate": sr.current_daily_rate,
            "simulation": sr.simulation,
            
            # Monthly Data
            "jan": sr.jan, "feb": sr.feb, "mar": sr.mar, "apr": sr.apr,
            "may": sr.may, "jun": sr.jun, "jul": sr.jul, "aug": sr.aug,
            "sep": sr.sep, "oct": sr.oct, "nov": sr.nov, "dec": sr.dec,
            
            "current_month_est": sr.current_month_est,
            
            # Q3
            "q3_estimated": sr.q3_estimated,
            "q3_add_fct": sr.q3_add_fct,
            "q3_total_exit_with_fc": sr.q3_total_exit_with_fc,
            "q3_add_upside": sr.q3_add_upside,
            "q3_qoq_pct": round(q3_qoq, 1),
            "qoq_plus_fct_pct": round(q3_qoq_plus, 1),
            
            # Q4
            "q4_exit": sr.q4_exit,
            "q4_add_fct": sr.q4_add_fct,
            "q4_total_exit_with_fc": sr.q4_total_exit_with_fc,
            "q4_add_upside": sr.q4_add_upside,
            "q4_qoq_pct": round(q4_qoq, 1),
            "q4_qoq_plus_fct_pct": round(q4_qoq_plus, 1),
            
            "risk_flag": "NORMAL"
        })

    return jsonify({
        "cluster": {
            "id": cluster.id, 
            "name": cluster.name,
            "partial_data_date": cluster.partial_data_date
        },
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
    """Get all sales reps, optionally filtered by cluster"""
    db = get_db()
    cluster_id = request.args.get('cluster_id')
    if cluster_id:
        reps = db.query(SalesRep).filter(SalesRep.cluster_id == int(cluster_id)).all()
    else:
        reps = db.query(SalesRep).all()
    return jsonify([{
        "id": r.id, 
        "name": r.name, 
        "cluster_id": r.cluster_id,
        "last_year_exit": r.last_year_exit,
        "q1_exit": r.q1_exit
    } for r in reps])


@app.route('/api/sales_reps', methods=['POST'])
def create_sales_rep():
    """Create a new sales rep"""
    data = request.json
    db = get_db()
    # Validations & Defaults
    fy_id = data.get('fiscal_year_id')
    if not fy_id:
        latest_fy = db.query(FiscalYear).order_by(FiscalYear.year.desc()).first()
        if not latest_fy:
             return jsonify({"error": "No fiscal year defined. Please seed database."}), 400
        fy_id = latest_fy.id

    rep = SalesRep(
        cluster_id=data['cluster_id'],
        fiscal_year_id=fy_id,
        name=data['name'],
        last_year_exit=data.get('last_year_exit', 0),
        q1_exit=data.get('q1_exit', 0)
    )
    db.add(rep)
    db.commit()
    db.refresh(rep)
    return jsonify({"id": rep.id, "name": rep.name}), 201


@app.route('/api/sales_reps/<int:rep_id>', methods=['PUT'])
def update_sales_rep(rep_id):
    """Update a sales rep and recalculate derived metrics"""
    data = request.json
    db = get_db()
    rep = db.query(SalesRep).filter(SalesRep.id == rep_id).first()
    if not rep:
        return jsonify({"error": "Sales rep not found"}), 404

    # Helper: Sync Workloads first (aggregates "Add FCT" and "Upside" from Workloads)
    update_from_workloads(rep, db)

    # Helper: Calculate Future Estimates (Daily Rate * Days)
    # We need to act on the data dict if we want to preview, but usually this updates the model.
    # The 'data' payload might contain overrides, but usually Daily Rate drives the calc.
    # Let's apply standard logic.
    
    # Update Editable Fields
    rep.name = data.get('name', rep.name)
    rep.last_year_exit = float(data.get('last_year_exit', rep.last_year_exit))
    
    # Q1
    rep.q1_exit = float(data.get('q1_exit', rep.q1_exit))
    rep.q1_add_fct = float(data.get('q1_add_fct', rep.q1_add_fct))
    rep.q1_add_upside = float(data.get('q1_add_upside', rep.q1_add_upside))
    
    # Q2
    rep.q2_exit = float(data.get('q2_exit', rep.q2_exit))
    rep.q2_add_fct = float(data.get('q2_add_fct', rep.q2_add_fct))
    rep.q2_add_upside = float(data.get('q2_add_upside', rep.q2_add_upside))
    
    # Q4
    rep.q4_exit = float(data.get('q4_exit', rep.q4_exit))
    rep.q4_add_fct = float(data.get('q4_add_fct', rep.q4_add_fct))
    rep.q4_add_upside = float(data.get('q4_add_upside', rep.q4_add_upside))
    
    rep.last_week_daily_rate = float(data.get('last_week_daily_rate', rep.last_week_daily_rate))
    rep.current_daily_rate = float(data.get('current_daily_rate', rep.current_daily_rate))
    rep.simulation = float(data.get('simulation', rep.simulation))
    
    # Monthly data (simplified 12 fields)
    rep.jan = float(data.get('jan', rep.jan))
    rep.feb = float(data.get('feb', rep.feb))
    rep.mar = float(data.get('mar', rep.mar))
    rep.apr = float(data.get('apr', rep.apr))
    rep.may = float(data.get('may', rep.may))
    rep.jun = float(data.get('jun', rep.jun))
    rep.jul = float(data.get('jul', rep.jul))
    rep.aug = float(data.get('aug', rep.aug))
    rep.sep = float(data.get('sep', rep.sep))
    rep.oct = float(data.get('oct', rep.oct))
    rep.nov = float(data.get('nov', rep.nov))
    rep.dec = float(data.get('dec', rep.dec))
    
    # Current month estimate
    rep.current_month_est = float(data.get('current_month_est', rep.current_month_est))
    
    # Calculate future estimates based on updated daily rate
    calculate_future_estimates(rep)
    
    # Workload aggregation overwrites "Add FCT" and "Upside" fields if they are workload-driven.
    # However, if the user manually edits them in the dashboard, we might want to allow it?
    # User requirement: "retrieve the forcast and upside for each quarter from workload page"
    # This implies Workloads are the source of truth.
    # We already called update_from_workloads(rep, db) at start, but we should call it again 
    # if we suspect other changes? Actually, update_sales_rep is for manual edits.
    # If the user edits "Add FCT" manually, it might get overwritten by next workload update.
    # We will enforce Workload -> Field data flow.
    update_from_workloads(rep, db)

    # Note: rep.q3_add_fct etc are updated by update_from_workloads
    # If data payload has them, we ignore them in favor of workloads? 
    # Or we allow override if no workloads? logic:
    # If update_from_workloads found 0, maybe we allow manual? 
    # Stick to strict: Workloads drive these fields.
    
    # --- Recalculate Derived Fields ---
    
    # Q3 = Dec + Jan + Feb (using simplified fields)
    rep.q3_estimated = rep.dec + rep.jan + rep.feb + rep.simulation
    
    # Recalculate Totals (Total Exit + Add FCT)
    rep.q1_total_exit_with_fc = rep.q1_exit + rep.q1_add_fct
    rep.q2_total_exit_with_fc = rep.q2_exit + rep.q2_add_fct
    rep.q3_total_exit_with_fc = rep.q3_estimated + rep.q3_add_fct
    rep.q4_total_exit_with_fc = rep.q4_exit + rep.q4_add_fct

    db.commit()
    
    return jsonify({
        "id": rep.id, 
        "name": rep.name,
        "current_month_est": rep.current_month_est,
        "q3_estimated": rep.q3_estimated,
        # No longer return stored QoQ, as it's not stored
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
    """Get all workloads, optionally filtered by sales_rep_id or cluster_id"""
    db = get_db()
    sales_rep_id = request.args.get('sales_rep_id')
    cluster_id = request.args.get('cluster_id')

    query = db.query(Workload)
    if sales_rep_id:
        query = query.filter(Workload.sales_rep_id == int(sales_rep_id))
    elif cluster_id:
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
    """Create a new workload"""
    data = request.json
    db = get_db()
    
    start_date = data.get('consumption_start_date')
    quarter, fy_id = derive_fiscal_info(start_date, db)
    
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
        month_1_amt=float(data.get('month_1_amt', 0)),
        month_2_amt=float(data.get('month_2_amt', 0)),
        month_3_amt=float(data.get('month_3_amt', 0)),
        consumption_start_date=start_date
    )
    db.add(workload)
    db.commit()
    db.refresh(workload)
    
    # Update Sales Rep Totals
    if workload.sales_rep:
        update_from_workloads(workload.sales_rep, db)
        db.commit()
        
    return jsonify({"id": workload.id, "account_name": workload.account_name}), 201


@app.route('/api/workloads/<int:workload_id>', methods=['PUT'])
def update_workload(workload_id):
    """Update an existing workload"""
    data = request.json
    db = get_db()
    workload = db.query(Workload).filter(Workload.id == workload_id).first()
    if not workload:
        return jsonify({"error": "Workload not found"}), 404

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
    
    # If consumption_start_date is updated, recalculate the quarter
    # If consumption_start_date is updated, recalculate the quarter and FY
    new_start_date = data.get('consumption_start_date', workload.consumption_start_date)
    workload.consumption_start_date = new_start_date
    
    quarter, fy_id = derive_fiscal_info(new_start_date, db)
    workload.quarter = quarter
    workload.fiscal_year_id = fy_id

    workload.fiscal_year_id = fy_id
    workload.quarter = quarter

    db.commit()
    
    # Update Sales Rep Totals
    if workload.sales_rep:
        update_from_workloads(workload.sales_rep, db)
        db.commit()
        
    return jsonify({"id": workload.id, "account_name": workload.account_name})

@app.route('/api/workloads/<int:workload_id>', methods=['DELETE'])
def delete_workload(workload_id):
    """Delete a workload"""
    db = get_db()
    workload = db.query(Workload).filter(Workload.id == workload_id).first()
    if not workload:
        return jsonify({"error": "Workload not found"}), 404
        
    rep = workload.sales_rep
    db.delete(workload)
    db.commit()
    
    # Update Sales Rep
    if rep:
        update_from_workloads(rep, db)
        db.commit()
        
    return jsonify({"message": "Deleted"})


# --- Helpers ---

def calculate_future_estimates(rep):
    """
    Update future month columns (Jan..Dec) based on Current Daily Rate 
    and number of days in the month.
    """
    import calendar
    from datetime import date
    
    if not rep.current_daily_rate:
        return

    today = date.today()
    current_month_idx = today.month # 1=Jan, 12=Dec
    
    # Month mapping to fields
    month_map = {
        1: 'jan', 2: 'feb', 3: 'mar', 4: 'apr', 5: 'may', 6: 'jun',
        7: 'jul', 8: 'aug', 9: 'sep', 10: 'oct', 11: 'nov', 12: 'dec'
    }
    
    # Fiscal Year logic? Usually FY is Jun-May.
    # Future months are those AFTER the current month.
    
    for m_idx, field_name in month_map.items():
        # Check if month is in the future relative to today
        # Simple logic: if m_idx > current_month_idx (same year) 
        # OR if we are in Jun (6) and looking at Jan (1) of next year?
        # Better: Iterate next 12 months from now.
        pass

    # New Logic: Iterate 1..12. If it's a future month, calculate.
    # Note: "Future" depends on context. For FY26 (Jun 25 - May 26):
    # If today is Jan 2026. Future = Feb, Mar, Apr, May. 
    # Jun..Dec are past (Actuals). Jan is current.
    
    # Since we store Actuals in the same columns, we must ONLY overwrite IF it is a future month.
    # How do we know? We rely on 'today'.
    
    def is_future(m):
        if today.year == 2026: # Adjust based on real logic or assume system time
            # For simplicity, if m > current_month, it's future in same year.
            # If current is Dec, Jan is next year (future).
            if m > current_month_idx: return True
            if current_month_idx > 6 and m < 6: return True # e.g. Oct -> Jan is future
        return False
        
    # Robust Future Check:
    # 1. Construct date for the 1st of the month in current/next year
    # 2. Compare with today
    
    for m_idx, field_name in month_map.items():
        # Determine year for this month field context
        # FY starts Jun. 
        # If current month is >= 6 (Jun-Dec), then Jan-May are Next Year.
        # If current month is < 6 (Jan-May), then Jun-Dec are Previous Year (Past).
        
        # Simplified: Just overwrite months that are strictly future from *now*.
        # Assuming the columns hold data for the *Current Fiscal Year*.
        
        # Determine year of the month in the current fiscal year
        # We need the fiscal year object or assume logic.
        # Assume rep.fiscal_year.start_date exists? 
        # Let's default to standard logic: 
        # If today is Jan 2026. 
        #   Jan: Current
        #   Feb..May: Future (2026)
        #   Jun..Dec: Past (2025)
        
        target_year = today.year
        if current_month_idx >= 6: # We are in Jun-Dec 2025
            if m_idx < 6: target_year += 1 # Jan-May are 2026
        else: # We are in Jan-May 2026
            if m_idx >= 6: target_year -= 1 # Jun-Dec were 2025
            
        month_date = date(target_year, m_idx, 1)
        
        # If month_date > today (ignoring day), it is future.
        # Actually if month_date.month > today.month etc...
        # safely: if date(target_year, m_idx, 1) > today (approx)
        
        if month_date > today.replace(day=1):
             # Calculate Estimate
             days_in_month = calendar.monthrange(target_year, m_idx)[1]
             est = rep.current_daily_rate * days_in_month
             setattr(rep, field_name, est)


def update_from_workloads(rep, db):
    """
    Aggregate workloads for this rep and update Q1-Q4 Add FCT / Upside / Simulation.
    """
    # Initialize buckets
    sums = {
        'q1': {'forecast': 0.0, 'upside': 0.0},
        'q2': {'forecast': 0.0, 'upside': 0.0},
        'q3': {'forecast': 0.0, 'upside': 0.0},
        'q4': {'forecast': 0.0, 'upside': 0.0}
    }
    
    if not rep.workloads:
        pass # Keep 0
        
    for w in rep.workloads:
        q = w.quarter.lower() # q1, q2...
        if q not in sums: continue
        
        # Type: "Forecast" vs "Upside"
        # We need to normalize forecast_type.
        # Assumption: 'Forecast' adds to FCT, 'Upside' adds to Upside.
        ftype = w.forecast_type.lower()
        amount = w.total_amount
        
        if 'upside' in ftype:
            sums[q]['upside'] += amount
        elif 'forecast' in ftype or 'fct' in ftype or 'commit' in ftype or 'pipeline' in ftype:
            # Strictly map to Forecast
            sums[q]['forecast'] += amount
        else:
            # Skip 'Won' or 'Closed' deals as they should be in the base number already
            pass

    # Assign to Rep
    rep.q1_add_fct = sums['q1']['forecast']
    rep.q1_add_upside = sums['q1']['upside']
    
    rep.q2_add_fct = sums['q2']['forecast']
    rep.q2_add_upside = sums['q2']['upside']
    
    rep.q3_add_fct = sums['q3']['forecast']
    rep.q3_add_upside = sums['q3']['upside']
    
    rep.q4_add_fct = sums['q4']['forecast']
    rep.q4_add_upside = sums['q4']['upside']
    
    # Recalculate Totals
    rep.q1_total_exit_with_fc = rep.q1_exit + rep.q1_add_fct
    rep.q2_total_exit_with_fc = rep.q2_exit + rep.q2_add_fct
    
    # Q3 Est needs Simulation? 
    # Simulation is a field on Rep, usually manual. 
    # "add the simulation to the quarter forcast"
    # Q3 Estimated = Dec + Jan + Feb + Simulation
    rep.q3_estimated = (rep.dec or 0) + (rep.jan or 0) + (rep.feb or 0) + (rep.simulation or 0)
    rep.q3_total_exit_with_fc = rep.q3_estimated + rep.q3_add_fct
    
    rep.q4_total_exit_with_fc = rep.q4_exit + rep.q4_add_fct






@app.route('/api/workloads/upload', methods=['POST'])
def upload_workloads():
    """Upload workloads from an Excel file"""
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    cluster_id = request.form.get('cluster_id')
    
    if not cluster_id:
        return jsonify({"error": "Missing cluster_id"}), 400

    try:
        if file.filename.lower().endswith('.csv'):
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)
        
        db = get_db()
        
        # Get Default Quarter from form
        default_quarter = request.form.get('default_quarter', 'Q3')
        
        # Normalize columns: lower case and stripped
        df.columns = [str(c).strip().lower() for c in df.columns]
        
        # Clean data: Replace NaN with None/0
        df = df.where(pd.notnull(df), None)
        
        count_added = 0
        count_updated = 0
        
        for _, row in df.iterrows():
            # Flexible Column Lookup Helper
            def get_val(keys, default=None):
                for k in keys:
                    if k in row:
                        val = row[k]
                        if val is not None and str(val).strip() != '':
                            return val
                return default

            # Sales Rep
            rep_name = get_val(['sales rep name', 'sales rep', 'rep', 'owner'])
            if not rep_name: continue
            
            # Find or create rep in this cluster
            rep = db.query(SalesRep).filter(SalesRep.name == str(rep_name).strip(), SalesRep.cluster_id == int(cluster_id)).first()
            if not rep:
                rep = SalesRep(name=str(rep_name).strip(), cluster_id=int(cluster_id))
                db.add(rep)
                db.flush()
            
            # Date Parsing
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
                    parsed_date = ''
            
            # Derive fiscal info
            if parsed_date:
                quarter, fy_id = derive_fiscal_info(parsed_date, db)
            else:
                quarter = default_quarter
                # Default to current or latest FY. Assuming latest FY exist.
                # Use helper if possible, or query manually.
                latest_fy = db.query(FiscalYear).order_by(FiscalYear.year.desc()).first()
                fy_id = latest_fy.id if latest_fy else None

            # Check for currency symbols cleanup via helper
            def clean_money(val):
                if isinstance(val, str):
                    val = val.replace('$', '').replace(',', '').replace('"', '').strip()
                    if val == '-' or val == '': return 0.0
                try:
                    return float(val)
                except:
                    return 0.0

            # Amounts
            m1 = clean_money(get_val(['month 1', 'dec', 'december', 'mar', 'march', 'june', 'jun'], 0))
            m2 = clean_money(get_val(['month 2', 'jan', 'january', 'apr', 'april', 'july', 'jul'], 0))
            m3 = clean_money(get_val(['month 3', 'feb', 'february', 'may', 'august', 'aug'], 0))

            # Account
            acct_name = str(get_val(['account name', 'account', 'customer', 'customer name'], 'Unknown'))
            
            # Forecast Type
            f_type = str(get_val(['forecast type', 'forecast', 'type', 'stage'], 'Forecast'))
            
            # Opt ID
            opt_id_val = str(get_val(['opt id', 'opportunity id', 'opt', 'opty id', 'opportunity'], ''))

            # UPSERT LOGIC
            existing_wl = db.query(Workload).filter(
                Workload.sales_rep_id == rep.id,
                Workload.account_name == acct_name,
                Workload.opt_id == opt_id_val
            ).first()
            
            # Fields to update/create
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
                'consumption_start_date': parsed_date
            }

            if existing_wl:
                # Update
                for key, value in updated_fields.items():
                    setattr(existing_wl, key, value)
                count_updated += 1
            else:
                # Create
                wl = Workload(**updated_fields)
                db.add(wl)
                count_added += 1
            
        db.commit()
        
        # Trigger Bulk Sync after upload
        reps = db.query(SalesRep).filter(SalesRep.cluster_id == int(cluster_id)).all()
        for r in reps:
            update_from_workloads(r, db)
            calculate_future_estimates(r)
        db.commit()
        
        return jsonify({"message": f"Successfully processed workloads: {count_added} added, {count_updated} updated."}), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/sales_data/upload', methods=['POST'])
def upload_sales_data():
    """Upload Sales Rep data from the 'FY26 Consumption Numbers' sheet"""
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    cluster_id = request.form.get('cluster_id')
    
    if not cluster_id:
        return jsonify({"error": "Missing cluster_id"}), 400

    try:
        if file.filename.lower().endswith('.csv'):
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)
        
        db = get_db()
        
        # Normalize columns: lower case and stripped
        df.columns = [str(c).strip().lower() for c in df.columns]
        
        # Helper to safely get float values
        def get_float(row, keys, default=0.0):
            for k in keys:
                if k in row:
                    val = row[k]
                    try:
                        if isinstance(val, str):
                            val = val.replace('$', '').replace(',', '').replace('%', '').strip()
                            if val in ['-', '']: return default
                        return float(val) if pd.notnull(val) else default
                    except:
                        pass
            return default

        # Helper to get string values
        def get_str(row, keys, default=''):
            for k in keys:
                if k in row and pd.notnull(row[k]):
                    return str(row[k]).strip()
            return default

        count = 0
        for _, row in df.iterrows():
            # 1. Identify Sales Rep
            rep_name = get_str(row, ['sales rep', 'rep name', 'sales_rep', 'rep_name'], None)
            if not rep_name or rep_name.lower() == 'total': continue

            # 2. Extract Raw Data
            # 2. Extract Raw Data
            last_year_exit = get_float(row, ['fy25q4 exit', 'fy25 q4 exit'])
            q1_exit = get_float(row, ['fy26q1 exit', 'fy26 q1 exit'])
            q2_exit_raw = get_float(row, ['fy26q2 exit', 'fy26 q2 exit'])
            
            last_week_daily_rate = get_float(row, ['last week daily rate'])
            current_daily_rate = get_float(row, ['current daily rate'])
            
            december_actual = get_float(row, ['december actual'])
            current_actual_jan = get_float(row, ['current actual jan'])
            
            # 3. Calculate Derived Fields (if missing or always enforce consistency?)
            # We enforce consistency based on user confirmed logic
            
            # Jan Est = Current Daily Rate * 28.85
            january_estimated = current_daily_rate * 28.85
            
            # Feb Est = Current Daily Rate * 28
            february_estimated = current_daily_rate * 28
            
            # Simulation (User input usually, assume 0 if not present or take from sheet)
            simulation = get_float(row, ['simulation'])
            
            # FY26Q3 Est = Jan Actual + Jan Est + Feb Est + Sim + Dec Actual
            # Note: User plan said Dec Actual is proxy/base.
            q3_estimated = current_actual_jan + january_estimated + february_estimated + simulation + december_actual
            
            # Q1 QoQ = (Q1 Exit - Q4 Exit) / Q4 Exit
            if last_year_exit:
                q1_qoq_pct = ((q1_exit / last_year_exit) - 1) * 100
            else:
                q1_qoq_pct = 0.0

            # Q2 QoQ = (Q2 Exit - Q1 Exit) / Q1 Exit
            # Note: We use the raw Q2 exit from sheet if available, else calc?
            # Sheet usually has Q2 Exit computed. Let's use sheet value if non-zero, else calc?
            # Let's trust sheet value for Q2 Exit as it is historical now (or near closing)
            q2_exit = q2_exit_raw
            
            if q1_exit:
                q2_qoq_pct = ((q2_exit / q1_exit) - 1) * 100
            else:
                q2_qoq_pct = 0.0
                
            # Q3 QoQ = (Q3 Est / Q2 Exit) - 1
            if q2_exit:
                q3_qoq_pct = ((q3_estimated / q2_exit) - 1) * 100
            else:
                q3_qoq_pct = 0.0

            # Extras / Upside
            q3_add_fct = get_float(row, ['fy26q3 add. fct'])
            
            q3_total_exit_with_fc = q3_estimated + q3_add_fct
            
            if q2_exit:
                qoq_plus_fct_pct = ((q3_total_exit_with_fc / q2_exit) - 1) * 100
            else:
                qoq_plus_fct_pct = 0.0
                
            q3_add_upside = get_float(row, ['fy26q3 add upside', 'fy26 q3 add upside'])
            
            # Q4 Data (Extract if available)
            q4_exit = get_float(row, ['fy26q4 exit', 'fy26 q4 exit'])
            q4_add_fct = get_float(row, ['fy26q4 add. fct', 'fy26 q4 add. fct', 'fy26q4 add fct'])
            q4_add_upside = get_float(row, ['fy26q4 add upside', 'fy26 q4 add upside'])
            
            # Calc Q4 Total if not present? (Exit + Add FCT)
            q4_total_exit_with_fc = q4_exit + q4_add_fct

            # 4. Update/Create DB Record
            # Only look for reps in the CURRENT fiscal year (latest)
            latest_fy = db.query(FiscalYear).order_by(FiscalYear.year.desc()).first()
            if not latest_fy:
                  return jsonify({"error": "No fiscal year found. Please seed database."}), 400

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
            
            rep.last_year_exit = last_year_exit
            rep.q1_exit = q1_exit
            rep.q2_exit = q2_exit
            
            rep.last_week_daily_rate = last_week_daily_rate
            rep.current_daily_rate = current_daily_rate
            
            # Monthlies (simplified - assumes model has these columns)
            # rep.december_actual = december_actual  # Check if model has this? Model only has jan..dec.
            # Using jan..dec columns from model
            # For simplicity, just updating Q3 fields as requested
            
            rep.simulation = simulation
            
            rep.q3_estimated = q3_estimated
            
            rep.q3_add_fct = q3_add_fct
            rep.q3_total_exit_with_fc = q3_total_exit_with_fc
            rep.q3_add_upside = q3_add_upside
            
            # Q4
            rep.q4_exit = q4_exit
            rep.q4_add_fct = q4_add_fct
            rep.q4_total_exit_with_fc = q4_total_exit_with_fc
            rep.q4_add_upside = q4_add_upside
            
            count += 1

        db.commit()
        return jsonify({"message": f"Successfully imported {count} sales reps"}), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500




if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
