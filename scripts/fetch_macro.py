#!/usr/bin/env python3
"""Fetch key FRED macro indicators. Outputs JSON."""
import json

def safe(v):
    if v is None: return None
    try: return round(float(v), 4)
    except: return None

def main():
    from openbb import obb

    series_map = {
        "DGS10": "10Y Yield", "DGS2": "2Y Yield", "T10Y2Y": "Yield Spread",
        "FEDFUNDS": "Fed Funds", "T10YIE": "Breakeven Infl",
        "DFII10": "Real Rate 10Y", "STLFSI4": "Fin Stress",
        "M2SL": "M2 Supply", "DTWEXBGS": "Dollar Index", "UNRATE": "Unemployment",
    }

    result = {}
    for sid, label in series_map.items():
        try:
            r = obb.economy.fred_series(symbol=sid, provider="fred")
            df = r.to_dataframe().reset_index()
            df.columns = [c.lower() for c in df.columns]
            date_col = 'date' if 'date' in df.columns else df.columns[0]
            val_col = [c for c in df.columns if c != date_col and c != 'index'][0]
            valid = df[df[val_col].notna()]
            if len(valid) > 0:
                last = valid.iloc[-1]
                result[sid] = {"label": label, "value": safe(last[val_col]), "date": str(last[date_col])[:10]}
        except Exception as e:
            result[sid] = {"label": label, "error": str(e)[:80]}

    print(json.dumps(result))

if __name__ == "__main__":
    main()
