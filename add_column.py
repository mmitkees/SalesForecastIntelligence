import sqlite3
import os

DB_FILE = 'sales_app_v3.db'

def add_column():
    if not os.path.exists(DB_FILE):
        print("Database not found, skipping migration (will be created by app).")
        return

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Add to sales_reps
    try:
        print("Attempting to add 'partial_data_date' column to sales_reps...")
        cursor.execute("ALTER TABLE sales_reps ADD COLUMN partial_data_date VARCHAR(20)")
        conn.commit()
        print("Column added to sales_reps.")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e):
            print("Column already exists in sales_reps.")
        else:
            print(f"Error: {e}")

    # Add to clusters
    try:
        print("Attempting to add 'partial_data_date' column to clusters...")
        cursor.execute("ALTER TABLE clusters ADD COLUMN partial_data_date VARCHAR(20)")
        conn.commit()
        print("Column added to clusters.")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e):
            print("Column already exists in clusters.")
        else:
            print(f"Error: {e}")
    
    conn.close()

if __name__ == "__main__":
    add_column()
