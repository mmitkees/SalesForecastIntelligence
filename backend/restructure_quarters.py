import sqlite3
import os

DB_FILE = 'sales_app_v3.db'

def restructure_quarters():
    if not os.path.exists(DB_FILE):
        print(f"Database file '{DB_FILE}' not found.")
        return

    print(f"Connecting to database: {DB_FILE}")
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    try:
        # Check existing columns
        print("Checking existing columns in 'sales_reps' table...")
        cursor.execute("PRAGMA table_info(sales_reps)")
        columns_info = cursor.fetchall()
        columns = [info[1] for info in columns_info]
        print(f"Columns found: {columns}")

        # 1. DROP old QoQ columns if they exist
        # SQLite doesn't support DROP COLUMN easily in older versions, but recent ones do.
        # We'll try standard ALTER TABLE DROP COLUMN.
        
        drop_cols = ['q1_qoq_pct', 'q2_qoq_pct', 'q3_qoq_pct', 'qoq_plus_fct_pct']
        for col in drop_cols:
            if col in columns:
                try:
                    cursor.execute(f"ALTER TABLE sales_reps DROP COLUMN {col}")
                    print(f"Dropped column: {col}")
                except Exception as e:
                    print(f"Error dropping {col}: {e}")

        # 2. ADD new columns
        new_cols = {
            # Q1
            'q1_add_fct': 'FLOAT DEFAULT 0.0',
            'q1_total_exit_with_fc': 'FLOAT DEFAULT 0.0',
            'q1_add_upside': 'FLOAT DEFAULT 0.0',
            
            # Q2
            'q2_add_fct': 'FLOAT DEFAULT 0.0',
            'q2_total_exit_with_fc': 'FLOAT DEFAULT 0.0',
            'q2_add_upside': 'FLOAT DEFAULT 0.0',
            
            # Q4
            'q4_exit': 'FLOAT DEFAULT 0.0',
            'q4_add_fct': 'FLOAT DEFAULT 0.0',
            'q4_total_exit_with_fc': 'FLOAT DEFAULT 0.0',
            'q4_add_upside': 'FLOAT DEFAULT 0.0'
        }
        
        # Refresh column list after drops
        cursor.execute("PRAGMA table_info(sales_reps)")
        current_columns = [info[1] for info in cursor.fetchall()]

        for col, type_def in new_cols.items():
            if col not in current_columns:
                try:
                    cursor.execute(f"ALTER TABLE sales_reps ADD COLUMN {col} {type_def}")
                    print(f"Added column: {col}")
                except Exception as e:
                    print(f"Error adding {col}: {e}")

        conn.commit()
        print("Migration schema update completed successfully.")

    except Exception as e:
        print(f"An error occurred: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    restructure_quarters()
