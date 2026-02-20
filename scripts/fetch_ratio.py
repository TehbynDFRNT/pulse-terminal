#!/usr/bin/env python3
"""Compute ratio of two symbols. Outputs JSON to stdout."""
import json
import sys

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: fetch_ratio.py NUMERATOR DENOMINATOR [START]"}))
        sys.exit(1)

    numerator = sys.argv[1]
    denominator = sys.argv[2]
    start = sys.argv[3] if len(sys.argv) > 3 else "2020-01-01"

    import pandas as pd
    from openbb import obb

    try:
        r1 = obb.equity.price.historical(numerator, start_date=start, provider="yfinance")
        r2 = obb.equity.price.historical(denominator, start_date=start, provider="yfinance")
        df1 = r1.to_dataframe().reset_index()
        df2 = r2.to_dataframe().reset_index()

        df1.columns = [c.lower() for c in df1.columns]
        df2.columns = [c.lower() for c in df2.columns]
        date_col1 = 'date' if 'date' in df1.columns else df1.columns[0]
        date_col2 = 'date' if 'date' in df2.columns else df2.columns[0]

        df1['date_str'] = pd.to_datetime(df1[date_col1]).dt.strftime('%Y-%m-%d')
        df2['date_str'] = pd.to_datetime(df2[date_col2]).dt.strftime('%Y-%m-%d')

        merged = pd.merge(
            df1[['date_str', 'close']].rename(columns={'close': 'num_close'}),
            df2[['date_str', 'close']].rename(columns={'close': 'den_close'}),
            on='date_str'
        )
        merged['ratio'] = merged['num_close'] / merged['den_close']

        records = []
        for _, row in merged.iterrows():
            records.append({
                "time": row['date_str'],
                "value": round(float(row['ratio']), 4),
                "num": round(float(row['num_close']), 2),
                "den": round(float(row['den_close']), 2),
            })
        print(json.dumps(records))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
