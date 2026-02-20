#!/usr/bin/env python3
"""Fetch EIA petroleum status report + energy price history. Outputs JSON to stdout."""
import json
import sys

def main():
    from openbb import obb

    result = {}

    # Petroleum status report
    try:
        r = obb.commodity.petroleum_status_report(provider="eia")
        df = r.to_dataframe().reset_index()
        df.columns = [c.lower() for c in df.columns]
        date_col = 'date' if 'date' in df.columns else df.columns[0]

        records = []
        for _, row in df.tail(52).iterrows():  # last year of weekly data
            record = {}
            for col in df.columns:
                val = row[col]
                if str(val) == 'nan':
                    record[col] = None
                elif isinstance(val, (int, float)):
                    record[col] = round(float(val), 2)
                else:
                    record[col] = str(val)[:10] if col == date_col else str(val)
            records.append(record)
        result["petroleum"] = records
    except Exception as e:
        result["petroleum_error"] = str(e)

    # Energy prices via yfinance
    start = sys.argv[1] if len(sys.argv) > 1 else "2024-01-01"
    energy_symbols = {
        "CL=F": "Crude Oil",
        "NG=F": "Natural Gas",
        "HO=F": "Heating Oil",
        "RB=F": "Gasoline",
    }

    for sym, name in energy_symbols.items():
        try:
            r = obb.equity.price.historical(sym, start_date=start, provider="yfinance")
            df = r.to_dataframe().reset_index()
            df.columns = [c.lower() for c in df.columns]
            date_col = 'date' if 'date' in df.columns else df.columns[0]

            records = []
            for _, row in df.iterrows():
                d = str(row[date_col])[:10]
                records.append({
                    "time": d,
                    "value": round(float(row.get("close", 0)), 4),
                })
            result[sym] = {"name": name, "data": records}
        except Exception as e:
            result[sym] = {"name": name, "error": str(e)}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
