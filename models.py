import os
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, ForeignKey
from sqlalchemy.orm import sessionmaker, relationship, declarative_base

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///sales_app_v3.db")

# Handle Oracle connection string format
if DATABASE_URL.startswith("oracle"):
    engine = create_engine(DATABASE_URL, echo=False)
else:
    engine = create_engine(
        DATABASE_URL, 
        echo=False,
        connect_args={'check_same_thread': False, 'timeout': 30}
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Cluster(Base):
    __tablename__ = "clusters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    partial_data_date = Column(String(20))  # e.g., "2026-01-15" - for current month est calculation

    sales_reps = relationship("SalesRep", back_populates="cluster", cascade="all, delete-orphan")


class FiscalYear(Base):
    __tablename__ = "fiscal_years"
    
    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False, unique=True)  # e.g., 2026 for FY26
    start_date = Column(String(10), nullable=False)  # YYYY-MM-DD format, e.g., "2025-06-01"
    end_date = Column(String(10), nullable=False)  # YYYY-MM-DD format, e.g., "2026-05-31"
    
    sales_reps = relationship("SalesRep", back_populates="fiscal_year", cascade="all, delete-orphan")


class SalesRep(Base):
    __tablename__ = "sales_reps"

    id = Column(Integer, primary_key=True, index=True)
    cluster_id = Column(Integer, ForeignKey("clusters.id"), nullable=False)
    fiscal_year_id = Column(Integer, ForeignKey("fiscal_years.id"), nullable=False)
    name = Column(String(100), nullable=False)
    
    # Historical & Baseline
    # Historical & Baseline
    last_year_exit = Column(Float, default=0.0)
    
    # Q1
    q1_exit = Column(Float, default=0.0)
    q1_add_fct = Column(Float, default=0.0)
    q1_total_exit_with_fc = Column(Float, default=0.0)
    q1_add_upside = Column(Float, default=0.0)

    # Q2
    q2_exit = Column(Float, default=0.0)
    q2_add_fct = Column(Float, default=0.0)
    q2_total_exit_with_fc = Column(Float, default=0.0)
    q2_add_upside = Column(Float, default=0.0)
    
    # Daily Rates & Simulation
    partial_data_date = Column(String(20)) # e.g. "13/01/2026"
    last_week_daily_rate = Column(Float, default=0.0)
    current_daily_rate = Column(Float, default=0.0)
    simulation = Column(Float, default=0.0)
    
    # Monthly Data (12 fields - stores final/actual value for each month)
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
    
    # Current month estimate (used for "Est" column of current month only)
    current_month_est = Column(Float, default=0.0)
    
    # Q3 Projections (Keeping 'estimated' name as requested)
    q3_estimated = Column(Float, default=0.0)
    q3_add_fct = Column(Float, default=0.0)
    q3_total_exit_with_fc = Column(Float, default=0.0)
    q3_add_upside = Column(Float, default=0.0)
    
    # Q4
    q4_exit = Column(Float, default=0.0)
    q4_add_fct = Column(Float, default=0.0)
    q4_total_exit_with_fc = Column(Float, default=0.0)
    q4_add_upside = Column(Float, default=0.0)

    cluster = relationship("Cluster", back_populates="sales_reps")
    fiscal_year = relationship("FiscalYear", back_populates="sales_reps")
    workloads = relationship("Workload", back_populates="sales_rep", cascade="all, delete-orphan")

    @property
    def total_upside(self):
        """Sum of all Upside workloads"""
        return sum(w.total_amount for w in self.workloads if w.forecast_type == "Upside")

    # Legacy properties for upsides removed as they are not used in new logic directly
    # Can be re-added if specific dashboard parts need them, but new logic focuses on "Add FCT" and "Add Upside" columns.

    @property
    def risk_flag(self):
        """
        HIGH RISK if: Q3 QoQ < 0
        MOMENTUM if: Q3 QoQ > 5%
        """
        if self.q3_qoq_pct < 0:
            return "HIGH_RISK"
        elif self.q3_qoq_pct > 5:
            return "MOMENTUM"
        return "NORMAL"




class Workload(Base):
    __tablename__ = "workloads"

    id = Column(Integer, primary_key=True, index=True)
    sales_rep_id = Column(Integer, ForeignKey("sales_reps.id"), nullable=False)
    fiscal_year_id = Column(Integer, ForeignKey("fiscal_years.id"), nullable=True) # Allow null for now or migration
    account_name = Column(String(200), nullable=False)
    forecast_type = Column(String(50), nullable=False)
    customer_type = Column(String(50), nullable=False)
    workload_type = Column(String(100))
    country = Column(String(100))
    comments = Column(Text)
    opt_id = Column(String(50))
    
    quarter = Column(String(10), nullable=False)
    month_1_amt = Column(Float, default=0.0)
    month_2_amt = Column(Float, default=0.0)
    month_3_amt = Column(Float, default=0.0)
    consumption_start_date = Column(String(50))

    sales_rep = relationship("SalesRep", back_populates="workloads")
    fiscal_year = relationship("FiscalYear")

    @property
    def total_amount(self):
        return self.month_1_amt + self.month_2_amt + self.month_3_amt


def init_db():
    """Create all tables"""
    Base.metadata.create_all(bind=engine)



