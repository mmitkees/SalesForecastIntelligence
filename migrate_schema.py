#!/usr/bin/env python3
"""
Database Migration Script: Schema Updates for Jan 2026

This script performs the following migrations:
1. Renames 'q3_estimated' column to 'q3_exit' in sales_reps table
2. Adds 'total' column to workloads table
3. Populates 'total' column with sum of month_1_amt + month_2_amt + month_3_amt

Run this script once to migrate the existing database.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'sales_app_v3.db')

def migrate():
    """Execute all migration steps."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print(f"Migrating database: {DB_PATH}")
    
    # --- Migration 1: Rename q3_estimated to q3_exit in sales_reps ---
    print("\n[1/3] Checking if q3_estimated column exists in sales_reps...")
    cursor.execute("PRAGMA table_info(sales_reps)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'q3_estimated' in columns and 'q3_exit' not in columns:
        print("  -> Renaming q3_estimated to q3_exit...")
        cursor.execute("ALTER TABLE sales_reps RENAME COLUMN q3_estimated TO q3_exit")
        print("  -> Done!")
    elif 'q3_exit' in columns:
        print("  -> q3_exit already exists, skipping rename.")
    else:
        print("  -> q3_estimated not found, checking if fresh schema...")
    
    # --- Migration 2: Add 'total' column to workloads ---
    print("\n[2/3] Checking if 'total' column exists in workloads...")
    cursor.execute("PRAGMA table_info(workloads)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'total' not in columns:
        print("  -> Adding 'total' column to workloads...")
        cursor.execute("ALTER TABLE workloads ADD COLUMN total FLOAT DEFAULT 0.0")
        print("  -> Done!")
    else:
        print("  -> 'total' column already exists, skipping.")
    
    # --- Migration 3: Populate 'total' column with sum of months ---
    print("\n[3/3] Populating 'total' column with sum of month amounts...")
    cursor.execute("""
        UPDATE workloads 
        SET total = COALESCE(month_1_amt, 0) + COALESCE(month_2_amt, 0) + COALESCE(month_3_amt, 0)
        WHERE total IS NULL OR total = 0
    """)
    affected = cursor.rowcount
    print(f"  -> Updated {affected} workload records.")
    
    # Commit all changes
    conn.commit()
    print("\n✅ Migration completed successfully!")
    
    # Verify migrations
    print("\nVerification:")
    cursor.execute("PRAGMA table_info(sales_reps)")
    print("  sales_reps columns:", [col[1] for col in cursor.fetchall() if 'q3' in col[1].lower()])
    
    cursor.execute("SELECT COUNT(*) FROM workloads WHERE total > 0")
    count = cursor.fetchone()[0]
    print(f"  workloads with total > 0: {count}")
    
    conn.close()

if __name__ == "__main__":
    migrate()
