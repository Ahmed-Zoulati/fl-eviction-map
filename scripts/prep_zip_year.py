import pandas as pd
import numpy as np

src = r'data\fl_evictions_2004_2016.csv'

df = pd.read_csv(src)

# Your columns:
# Tract,week_start,week_end,filing,evict,atrisk,Year,Zip_code,RenterOccupiedUnits

zip_col   = 'Zip_code'
year_col  = 'Year'
filing_col = 'filing'
evict_col  = 'evict'
hh_col     = 'RenterOccupiedUnits'

# Clean types
zip_series = df[zip_col].astype(str).str.extract(r'(\d+)', expand=False).fillna('')
df[zip_col] = zip_series.str.zfill(5).str[:5]
df[year_col] = pd.to_numeric(df[year_col], errors='coerce').astype('Int64')
df[filing_col] = pd.to_numeric(df[filing_col], errors='coerce').fillna(0)
df[evict_col]  = pd.to_numeric(df[evict_col],  errors='coerce').fillna(0)
df[hh_col]     = pd.to_numeric(df[hh_col],     errors='coerce')

# Keep 2004–2016
df = df[(df[year_col] >= 2004) & (df[year_col] <= 2016)]

# Aggregate to ZIP × YEAR
g = df.groupby([zip_col, year_col], dropna=False).agg(
    filings    =(filing_col, 'sum'),
    evict      =(evict_col,  'sum'),
    households =(hh_col,     'mean')
).reset_index().rename(columns={zip_col:'zip', year_col:'year'})

# Rates (%)
g['filing_rate'] = np.where(g['households'] > 0, 100 * g['filings'] / g['households'], np.nan)
g['evict_rate']  = np.where(g['households'] > 0, 100 * g['evict']   / g['households'], np.nan)

out = r'data\fl_zip_year.csv'   # overwrite the original yearly file
g.to_csv(out, index=False)
print(f'Wrote {out} with {len(g)} rows.')
print(g.head())
