#!/usr/bin/env python3
"""Fetch multiple symbols, rebase to 100. Outputs JSON to stdout."""
import json
import sys

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: fetch_multi.py SYM1,SYM2,... [START]"}))
        sys.exit(1)

    symbols = sys.argv[1].split(",")
    start = sys.argv[2] if len(sys.argv) > 2 else "2024-01-01"

    import pandas as pd
    from openbb import obb

    all_series = {}

    for sym in symbols:
        sym = sym.strip()
        try:
            r = obb.equity.price.historical(sym, start_date=start, provider="yfinance")
            df = r.to_dataframe().reset_index()
            df.columns = [c.lower() for c in df.columns]
            date_col = 'date' if 'date' in df.columns else df.columns[0]
            df['date_str'] = pd.to_datetime(df[date_col]).dt.strftime('%Y-%m-%d')
            base = float(df['close'].iloc[0])
            if base > 0:
                df['rebased'] = (df['close'] / base) * 100
            else:
                df['rebased'] = 0
            all_series[sym] = [
                {"time": row['date_str'], "value": round(float(row['rebased']), 2)}
                for _, row in df.iterrows()
            ]
        except Exception as e:
            all_series[sym] = {"error": str(e)}

    print(json.dumps(all_series))


if __name__ == "__main__":
    main()
