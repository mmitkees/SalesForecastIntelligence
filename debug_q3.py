import sqlite3
import pandas as pd

pd.set_option('display.max_columns', None)
pd.set_option('display.max_rows', None)

conn = sqlite3.connect('sales_app_v3.db')
query = "SELECT id, name, q2_exit, q3_exit, dec, jan, feb FROM sales_reps"
df = pd.read_sql_query(query, conn)
print(df)
conn.close()
