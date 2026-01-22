
import os
import sys
import datetime
import logging
import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dateutil import parser
from models import Workload, SalesRep, Cluster, FiscalYear

# Setup logging
# Log to the logs directory at the project root
# backend/weekly_export.py -> backend/ -> root/ -> logs/
LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'logs')
os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    filename=os.path.join(LOG_DIR, 'weekly_export_job.log'),
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def get_db_session():
    """Create database session."""
    db_url = os.environ.get("DATABASE_URL", "sqlite:///sales_app_v3.db")
    
    # Handle Oracle TNS
    tns_admin = os.environ.get("TNS_ADMIN")
    if tns_admin and 'oracle' in db_url:
         os.environ["TNS_ADMIN"] = tns_admin

    if db_url.startswith("oracle"):
        engine = create_engine(db_url, echo=False)
    else:
        # If relative path, make it absolute based on backend directory
        if 'sqlite:///' in db_url and not db_url.startswith('sqlite:////'):
             # We are in backend/, db is usually in root
             base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
             db_path = db_url.replace('sqlite:///', '')
             db_url = f"sqlite:///{os.path.join(base_path, db_path)}"
        
        engine = create_engine(
            db_url, 
            echo=False,
            connect_args={'check_same_thread': False, 'timeout': 30}
        )
    
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()

def get_current_quarter_and_fy():
    """
    Derive current quarter and fiscal year from today's date.
    Logic mirrors app.py:derive_fiscal_info
    """
    today = datetime.date.today()
    month = today.month
    year = today.year

    # Quarter Logic (June Start)
    if month in [6, 7, 8]: quarter = 'Q1'
    elif month in [9, 10, 11]: quarter = 'Q2'
    elif month in [12, 1, 2]: quarter = 'Q3'
    else: quarter = 'Q4'

    # Fiscal Year Logic: June starts next FY
    fy_year = year + 1 if month >= 6 else year
    
    return quarter, fy_year

def export_workloads():
    logging.info("Starting weekly workload export.")
    db = get_db_session()
    
    try:
        quarter, fy_year = get_current_quarter_and_fy()
        logging.info(f"Targeting Quarter: {quarter}, Fiscal Year: {fy_year}")

        # Find Fiscal Year ID
        fy_obj = db.query(FiscalYear).filter(FiscalYear.year == fy_year).first()
        if not fy_obj:
            logging.error(f"Fiscal Year {fy_year} not found in database.")
            logging.warning("Fiscal year not found, likely no data. Aborting export.")
            return

        results = db.query(
            Workload.forecast_type,
            Workload.account_name,
            SalesRep.name.label('rep_name'),
            Workload.country,
            Workload.customer_type,
            Workload.workload_type,
            Workload.opt_id,
            Workload.consumption_start_date,
            Workload.month_1_amt,
            Workload.month_2_amt,
            Workload.month_3_amt,
            Workload.total,
            Workload.comments
        ).join(SalesRep, Workload.sales_rep_id == SalesRep.id)\
         .filter(Workload.quarter == quarter)\
         .filter(Workload.fiscal_year_id == fy_obj.id)\
         .all()

        if not results:
            logging.info(f"No workloads found for {quarter} FY{fy_year}. Generating empty report.")
        
        # Prepare Data for DataFrame
        data = []
        for row in results:
            data.append({
                'Forecast': row.forecast_type,
                'Account': row.account_name,
                'Rep': row.rep_name,
                'Country': row.country,
                'Type': row.customer_type,
                'Workload': row.workload_type,
                'Opt-ID': row.opt_id,
                'Start': row.consumption_start_date,
                'Month 1': row.month_1_amt,
                'Month 2': row.month_2_amt,
                'Month 3': row.month_3_amt,
                'Total': row.total,
                'Comments': row.comments
            })

        df = pd.DataFrame(data, columns=[
            'Forecast', 'Account', 'Rep', 'Country', 'Type', 'Workload', 
            'Opt-ID', 'Start', 'Month 1', 'Month 2', 'Month 3', 'Total', 'Workload Details'
        ])
        
        # Generate Filename
        timestamp = datetime.datetime.now().strftime("%Y%m%d")
        report_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'generated_reports')
        os.makedirs(report_dir, exist_ok=True)
        filename = f"All_Clusters_{quarter}_Workloads_{timestamp}.xlsx"
        filepath = os.path.join(report_dir, filename)
        
        # Save to Excel
        sheet_date = datetime.datetime.now().strftime("%d%m")
        df.to_excel(filepath, index=False, sheet_name=sheet_date)
        logging.info(f"Export successful. File saved to: {filepath}")
        
    except Exception as e:
        logging.error(f"Export failed: {e}", exc_info=True)
    finally:
        db.close()

if __name__ == "__main__":
    export_workloads()
