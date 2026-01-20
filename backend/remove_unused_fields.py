import sqlite3
import os

DB_FILE = 'sales_app_v3.db'

def remove_unused_columns():
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
        columns = [info[1] for info in cursor.fetchall()]
        print(f"Columns found: {columns}")

        columns_to_drop = ['last_week_qoq', 'target_16_pct_qoq']
        
        for col in columns_to_drop:
            if col in columns:
                print(f"Dropping column: {col}")
                try:
                    cursor.execute(f"ALTER TABLE sales_reps DROP COLUMN {col}")
                    print(f"Successfully dropped {col}")
                except sqlite3.OperationalError as e:
                    print(f"Error dropping {col}: {e}")
            else:
                print(f"Column {col} not found, skipping.")

        conn.commit()
        print("Migration completed successfully.")

    except Exception as e:
        print(f"An error occurred: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    remove_unused_columns()
