#!/usr/bin/env python3
"""Fetch insider trading + institutional ownership via FMP. Outputs JSON to stdout.
Usage: fetch_flows.py SYMBOL [LIMIT]
"""
import json
import sys

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: fetch_flows.py SYMBOL [LIMIT]"}))
        sys.exit(1)

    symbol = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 20

    from openbb import obb

    result = {"symbol": symbol, "insider": [], "institutional": []}

    # Insider trading
    try:
        r = obb.equity.ownership.insider_trading(symbol=symbol, limit=limit, provider="fmp")
        df = r.to_dataframe().reset_index()
        df.columns = [c.lower() for c in df.columns]

        for _, row in df.iterrows():
            record = {}
            for col in df.columns:
                val = row[col]
                if str(val) == 'nan' or str(val) == 'NaT':
                    record[col] = None
                else:
                    record[col] = str(val) if not isinstance(val, (int, float)) else val
            result["insider"].append(record)
    except Exception as e:
        result["insider_error"] = str(e)

    # Institutional ownership
    try:
        r = obb.equity.ownership.institutional(symbol=symbol, limit=limit, provider="fmp")
        df = r.to_dataframe().reset_index()
        df.columns = [c.lower() for c in df.columns]

        for _, row in df.iterrows():
            record = {}
            for col in df.columns:
                val = row[col]
                if str(val) == 'nan' or str(val) == 'NaT':
                    record[col] = None
                else:
                    record[col] = str(val) if not isinstance(val, (int, float)) else val
            result["institutional"].append(record)
    except Exception as e:
        result["institutional_error"] = str(e)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
