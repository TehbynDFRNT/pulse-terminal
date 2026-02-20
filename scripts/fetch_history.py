#!/usr/bin/env python3
"""Fetch OHLCV historical data via OpenBB. Outputs JSON to stdout."""
import json
import sys

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: fetch_history.py SYMBOL [START] [INTERVAL]"}))
        sys.exit(1)

    symbol = sys.argv[1]
    start = sys.argv[2] if len(sys.argv) > 2 else "2020-01-01"
    interval = sys.argv[3] if len(sys.argv) > 3 else "1d"

    from openbb import obb

    try:
        r = obb.equity.price.historical(symbol, start_date=start, interval=interval, provider="yfinance")
        df = r.to_dataframe().reset_index()
        cols = [c.lower() for c in df.columns]
        df.columns = cols
        date_col = 'date' if 'date' in cols else cols[0]

        records = []
        for _, row in df.iterrows():
            d = str(row[date_col])[:10]
            records.append({
                "time": d,
                "open": float(row.get("open", 0)),
                "high": float(row.get("high", 0)),
                "low": float(row.get("low", 0)),
                "close": float(row.get("close", 0)),
                "volume": float(row.get("volume", 0)) if "volume" in cols else 0,
            })
        print(json.dumps(records))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
