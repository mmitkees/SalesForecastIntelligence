import sqlite3
import pandas as pd

conn = sqlite3.connect('sales_app_v3.db')
query = "SELECT * FROM fiscal_years"
df = pd.read_sql_query(query, conn)
print(df)
conn.close()
