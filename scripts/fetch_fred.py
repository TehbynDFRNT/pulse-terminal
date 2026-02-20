#!/usr/bin/env python3
"""Fetch FRED series data. Outputs JSON to stdout.
Usage: fetch_fred.py SERIES1,SERIES2,... [START]
"""
import json
import sys

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: fetch_fred.py SERIES1,SERIES2,... [START]"}))
        sys.exit(1)

    series_list = sys.argv[1].split(",")
    start = sys.argv[2] if len(sys.argv) > 2 else "2020-01-01"

    from openbb import obb

    result = {}
    for series_id in series_list:
        series_id = series_id.strip()
        try:
            r = obb.economy.fred_series(symbol=series_id, start_date=start, provider="fred")
            df = r.to_dataframe().reset_index()
            df.columns = [c.lower() for c in df.columns]
            date_col = 'date' if 'date' in df.columns else df.columns[0]

            records = []
            # Value column could be named 'value', the series id, or first non-date col
            val_col = None
            for c in df.columns:
                if c != date_col and c != 'index':
                    val_col = c
                    break
            if val_col is None:
                val_col = df.columns[-1]

            for _, row in df.iterrows():
                d = str(row[date_col])[:10]
                val = row.get(val_col, None)
                if val is not None and str(val) not in ('nan', '.', 'NaN', ''):
                    try:
                        records.append({"time": d, "value": round(float(val), 4)})
                    except (ValueError, TypeError):
                        pass
            result[series_id] = records
        except Exception as e:
            result[series_id] = {"error": str(e)}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
