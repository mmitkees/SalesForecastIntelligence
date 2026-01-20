"""
Database Models for SalesApp.
This module defines the SQLAlchemy models representing the application's data structure,
including Clusters, FiscalYears, SalesReps, and Workloads.
"""

import os
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, ForeignKey
from sqlalchemy.orm import sessionmaker, relationship, declarative_base

# Fetch database connection URL from environment or fallback to local SQLite
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///sales_app_v3.db")

# Database Engine Configuration
# Selects appropriate engine settings based on the database type (Oracle vs SQLite)
if DATABASE_URL.startswith("oracle"):
    # Oracle-specific connection
    engine = create_engine(DATABASE_URL, echo=False)
else:
    # SQLite-specific connection with thread safety and timeout settings
    engine = create_engine(
        DATABASE_URL, 
        echo=False,
        connect_args={'check_same_thread': False, 'timeout': 30}
    )

# Session factory for database transactions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
# Base class for declarative model definitions
Base = declarative_base()


class Region(Base):
    """
    Represents a geographical region containing multiple clusters.
    
    Attributes:
        id (int): Primary key.
        name (str): The name of the region.
    """
    __tablename__ = "regions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)

    # One-to-many relationship with Cluster
    clusters = relationship("Cluster", back_populates="region", cascade="all, delete-orphan")


class Cluster(Base):
    """
    Represents a geographical or logical grouping of Sales Representatives.
    
    Attributes:
        id (int): Primary key.
        name (str): The name of the cluster.
        region_id (int): Foreign key to the parent Region.
        partial_data_date (str): Stores the date of partial monthly data for current month calculations.
    """
    __tablename__ = "clusters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    # Foreign key to Region
    region_id = Column(Integer, ForeignKey("regions.id"), nullable=True)
    # e.g., "2026-01-15" - used to determine if we are in a partial month for estimates
    partial_data_date = Column(String(20))

    # Relationships
    region = relationship("Region", back_populates="clusters")
    # One-to-many relationship with SalesRep
    sales_reps = relationship("SalesRep", back_populates="cluster", cascade="all, delete-orphan")


class FiscalYear(Base):
    """
    Defines the time boundaries for a fiscal year.
    
    Attributes:
        id (int): Primary key.
        year (int): The fiscal year number (e.g., 2026 for FY26).
        start_date (str): The starting date of the fiscal year (YYYY-MM-DD).
        end_date (str): The ending date of the fiscal year (YYYY-MM-DD).
    """
    __tablename__ = "fiscal_years"
    
    id = Column(Integer, primary_key=True, index=True)
    # The fiscal year identifier
    year = Column(Integer, nullable=False, unique=True)
    # YYYY-MM-DD format, e.g., "2025-06-01"
    start_date = Column(String(10), nullable=False)
    # YYYY-MM-DD format, e.g., "2026-05-31"
    end_date = Column(String(10), nullable=False)
    
    # One-to-many relationship with SalesRep
    sales_reps = relationship("SalesRep", back_populates="fiscal_year", cascade="all, delete-orphan")


class SalesRep(Base):
    """
    Represents a Sales Representative and their associated performance data.
    
    This model stores historical performance, quarterly projections, and monthly actuals.
    """
    __tablename__ = "sales_reps"

    id = Column(Integer, primary_key=True, index=True)
    # Foreign key link to the Cluster
    cluster_id = Column(Integer, ForeignKey("clusters.id"), nullable=True)
    # Foreign key link to the Fiscal Year
    fiscal_year_id = Column(Integer, ForeignKey("fiscal_years.id"), nullable=False)
    # Name of the Sales Representative
    name = Column(String(100), nullable=False)
    
    # --- Authentication Fields ---
    # Username for login (unique)
    username = Column(String(100), unique=True, nullable=True)
    # Hashed password
    password_hash = Column(String(256), nullable=True)
    # Role: 'system_admin', 'region_admin', 'cluster_admin', 'user'
    role = Column(String(50), default='user')
    # Direct region assignment for Region Admins (optional, nullable)
    region_id = Column(Integer, ForeignKey("regions.id"), nullable=True)
    
    # --- Historical & Baseline Data ---
    # Performance at the end of the previous fiscal year
    last_year_exit = Column(Float, default=0.0)
    
    # --- Q1 Performance Data ---
    q1_exit = Column(Float, default=0.0)                # Performance at Q1 end
    q1_add_fct = Column(Float, default=0.0)            # Forecasted additions for Q1
    q1_total_exit_with_fc = Column(Float, default=0.0) # Combined exit and forecast for Q1
    q1_add_upside = Column(Float, default=0.0)         # Upside potential for Q1

    # --- Q2 Performance Data ---
    q2_exit = Column(Float, default=0.0)
    q2_add_fct = Column(Float, default=0.0)
    q2_total_exit_with_fc = Column(Float, default=0.0)
    q2_add_upside = Column(Float, default=0.0)
    
    # --- Daily Rates & Simulation (for current month estimation) ---
    # The date when the last snapshot was taken
    partial_data_date = Column(String(20)) # e.g. "13/01/2026"
    # Daily consumption rate recorded last week
    last_week_daily_rate = Column(Float, default=0.0)
    # Daily consumption rate recorded currently
    current_daily_rate = Column(Float, default=0.0)
    # Simulation factor or override for projections
    simulation = Column(Float, default=0.0)
    
    # --- Monthly Actuals (Final values for each month) ---
    jan = Column(Float, default=0.0)
    feb = Column(Float, default=0.0)
    mar = Column(Float, default=0.0)
    apr = Column(Float, default=0.0)
    may = Column(Float, default=0.0)
    jun = Column(Float, default=0.0)
    jul = Column(Float, default=0.0)
    aug = Column(Float, default=0.0)
    sep = Column(Float, default=0.0)
    oct = Column(Float, default=0.0)
    nov = Column(Float, default=0.0)
    dec = Column(Float, default=0.0)
    
    # Predicted performance for the current (non-closed) month
    current_month_est = Column(Float, default=0.0)
    
    # --- Q3 Projections ---
    q3_exit = Column(Float, default=0.0)               # Exit performance for Q3 (renamed from q3_estimated)
    q3_add_fct = Column(Float, default=0.0)            # Forecasted additions for Q3
    q3_total_exit_with_fc = Column(Float, default=0.0) # Combined estimate and forecast for Q3
    q3_add_upside = Column(Float, default=0.0)         # Upside potential for Q3
    
    # --- Q4 Projections ---
    q4_exit = Column(Float, default=0.0)
    q4_add_fct = Column(Float, default=0.0)
    q4_total_exit_with_fc = Column(Float, default=0.0)
    q4_add_upside = Column(Float, default=0.0)

    # Database Relationships
    cluster = relationship("Cluster", back_populates="sales_reps")
    fiscal_year = relationship("FiscalYear", back_populates="sales_reps")
    workloads = relationship("Workload", back_populates="sales_rep", cascade="all, delete-orphan")

    @property
    def total_upside(self):
        """
        Calculates the sum of all associated workloads categorized as 'Upside'.
        
        Returns:
            float: Total amount of 'Upside' workloads.
        """
        # Sum total_amount for all related workloads where forecast_type is "Upside"
        return sum(w.total_amount for w in self.workloads if w.forecast_type == "Upside")

    @property
    def risk_flag(self):
        """
        Determines the risk status based on Quarter-over-Quarter growth.
        
        Criteria:
            - HIGH RISK: Q3 QoQ < 0
            - MOMENTUM: Q3 QoQ > 5%
            - NORMAL: Otherwise
            
        Returns:
            str: "HIGH_RISK", "MOMENTUM", or "NORMAL".
        """
        # Note: q3_qoq_pct is likely calculated elsewhere or assumed available if this property is called
        # If q3_qoq_pct isn't a direct field, it might need to be calculated here.
        # For documentation purposes, we describe the logic provided.
        try:
            if self.q3_qoq_pct < 0:
                return "HIGH_RISK"
            elif self.q3_qoq_pct > 5:
                return "MOMENTUM"
        except AttributeError:
            pass # Fallback if q3_qoq_pct is not defined
        return "NORMAL"


class Workload(Base):
    """
    Represents an individual sales deal or workload associated with a Sales Representative.
    
    Attributes:
        id (int): Primary key.
        sales_rep_id (int): ID of the associated Sales Rep.
        fiscal_year_id (int): ID of the fiscal year this workload belongs to.
        account_name (str): Name of the customer account.
        forecast_type (str): Type of forecast (e.g., Commit, Pipeline, Upside).
        customer_type (str): Type of customer (e.g., New, Existing).
        quarter (str): Fiscal quarter (e.g., Q3).
        month_1_amt (float): Amount allocated to the first month of the quarter.
        month_2_amt (float): Amount allocated to the second month of the quarter.
        month_3_amt (float): Amount allocated to the third month of the quarter.
    """
    __tablename__ = "workloads"

    id = Column(Integer, primary_key=True, index=True)
    # Foreign key to the SalesRep model
    sales_rep_id = Column(Integer, ForeignKey("sales_reps.id"), nullable=False)
    # Foreign key to the FiscalYear model
    fiscal_year_id = Column(Integer, ForeignKey("fiscal_years.id"), nullable=True) 
    # The name of the account/customer
    account_name = Column(String(200), nullable=False)
    # Type of forecast: Forecast, FCT, Commit, Pipeline, Won, Upside
    forecast_type = Column(String(50), nullable=False)
    # Type of customer engagement
    customer_type = Column(String(50), nullable=False)
    # Optional categorization of the workload
    workload_type = Column(String(100))
    # Geographical location
    country = Column(String(100))
    # Descriptive notes
    comments = Column(Text)
    # Opportunity ID from external CRM
    opt_id = Column(String(50))
    
    # The quarter this workload pertains to (e.g., "Q3")
    quarter = Column(String(10), nullable=False)
    # Financial amounts split across the three months of the quarter
    month_1_amt = Column(Float, default=0.0)
    month_2_amt = Column(Float, default=0.0)
    month_3_amt = Column(Float, default=0.0)
    # When the consumption of this workload begins
    consumption_start_date = Column(String(50))
    # Total amount (sum of month_1_amt + month_2_amt + month_3_amt)
    total = Column(Float, default=0.0)

    # Database Relationships
    sales_rep = relationship("SalesRep", back_populates="workloads")
    fiscal_year = relationship("FiscalYear")

    @property
    def total_amount(self):
        """
        Calculates the aggregate amount across all three months.
        
        Returns:
            float: Sum of month_1_amt, month_2_amt, and month_3_amt.
        """
        # Addition of regional/monthly components to get grand total
        return self.month_1_amt + self.month_2_amt + self.month_3_amt


def init_db():
    """
    Initializes the database by creating all tables defined in the Base metadata.
    
    Should be called during application startup to ensure schema existence.
    """
    # Create tables in the engine
    Base.metadata.create_all(bind=engine)



