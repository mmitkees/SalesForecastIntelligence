import sqlite3
import pandas as pd

conn = sqlite3.connect('sales_app_v3.db')
query = "SELECT id, name, cluster_id FROM sales_reps"
df = pd.read_sql_query(query, conn)
print(df)
conn.close()
