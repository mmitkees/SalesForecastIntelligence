import pandas as pd
try:
    df = pd.read_excel('Workload Seeder.xlsx')
    print("Columns:", df.columns.tolist())
    print("Rows:", len(df))
    print("First Row Rep:", df.iloc[0].get('Sales Rep') if not df.empty else "None")
    print("First Row Account:", df.iloc[0].get('Account Name') if not df.empty else "None")
except Exception as e:
    print("Error:", e)
