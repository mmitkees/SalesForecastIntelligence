import sqlite3
import os

DB_FILE = 'sales_app_v3.db'

def rename_columns():
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

        # Map: old_name -> new_name
        renames = {
            'fy25_q4_exit': 'last_year_exit',
            'fy26_q1_exit': 'q1_exit',
            'fy26_q2_exit': 'q2_exit',
            'fy26_q3_estimated': 'q3_estimated',
            'fy26_q3_add_fct': 'q3_add_fct',
            'fy26_q3_add_upside': 'q3_add_upside'
        }
        
        for old_col, new_col in renames.items():
            if old_col in columns:
                print(f"Renaming column: {old_col} -> {new_col}")
                try:
                    cursor.execute(f"ALTER TABLE sales_reps RENAME COLUMN {old_col} TO {new_col}")
                    print(f"Successfully renamed {old_col}")
                except sqlite3.OperationalError as e:
                    print(f"Error renaming {old_col}: {e}")
            else:
                print(f"Column {old_col} not found, skipping.")

        conn.commit()
        print("Migration completed successfully.")

    except Exception as e:
        print(f"An error occurred: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    rename_columns()
