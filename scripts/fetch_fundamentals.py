#!/usr/bin/env python3
"""Fetch company fundamentals via yfinance direct (bypasses FMP paywall). Outputs JSON.
Usage: fetch_fundamentals.py SYMBOL1,SYMBOL2,...
"""
import json
import sys

def safe_val(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 4)
    return str(v)

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: fetch_fundamentals.py SYM1,SYM2,..."}))
        sys.exit(1)

    symbols = [s.strip() for s in sys.argv[1].split(",")]

    import yfinance as yf

    results = {}

    for symbol in symbols:
        data = {"symbol": symbol}

        try:
            t = yf.Ticker(symbol)
            info = t.info

            data["profile"] = {
                "name": info.get("longName") or info.get("shortName"),
                "sector": info.get("sector"),
                "industry": info.get("industry"),
                "market_cap": safe_val(info.get("marketCap")),
                "price": safe_val(info.get("currentPrice") or info.get("regularMarketPrice")),
                "beta": safe_val(info.get("beta")),
                "exchange": info.get("exchange"),
                "country": info.get("country"),
                "currency": info.get("currency"),
            }

            data["metrics"] = {
                "pe_ratio": safe_val(info.get("trailingPE")),
                "forward_pe": safe_val(info.get("forwardPE")),
                "pb_ratio": safe_val(info.get("priceToBook")),
                "ps_ratio": safe_val(info.get("priceToSalesTrailing12Months")),
                "ev_ebitda": safe_val(info.get("enterpriseToEbitda")),
                "ev_revenue": safe_val(info.get("enterpriseToRevenue")),
                "dividend_yield": safe_val(info.get("dividendYield")),
                "payout_ratio": safe_val(info.get("payoutRatio")),
                "roe": safe_val(info.get("returnOnEquity")),
                "roa": safe_val(info.get("returnOnAssets")),
                "debt_to_equity": safe_val(info.get("debtToEquity")),
                "current_ratio": safe_val(info.get("currentRatio")),
                "free_cash_flow": safe_val(info.get("freeCashflow")),
                "operating_cash_flow": safe_val(info.get("operatingCashflow")),
                "market_cap": safe_val(info.get("marketCap")),
                "enterprise_value": safe_val(info.get("enterpriseValue")),
                "earnings_yield": safe_val(1.0 / info["trailingPE"] if info.get("trailingPE") and info["trailingPE"] > 0 else None),
                "free_cash_flow_yield": safe_val(info.get("freeCashflow", 0) / info.get("marketCap", 1) if info.get("marketCap") and info.get("freeCashflow") else None),
            }

            data["price_data"] = {
                "year_high": safe_val(info.get("fiftyTwoWeekHigh")),
                "year_low": safe_val(info.get("fiftyTwoWeekLow")),
                "ma_50d": safe_val(info.get("fiftyDayAverage")),
                "ma_200d": safe_val(info.get("twoHundredDayAverage")),
                "avg_volume": safe_val(info.get("averageVolume")),
                "eps_trailing": safe_val(info.get("trailingEps")),
                "eps_forward": safe_val(info.get("forwardEps")),
            }

            # Revenue + income from financials
            try:
                fin = t.financials
                if fin is not None and len(fin.columns) > 0:
                    records = []
                    for col in fin.columns[:2]:  # last 2 periods
                        record = {"date": str(col)[:10]}
                        for idx in fin.index:
                            key = str(idx).lower().replace(' ', '_')
                            val = fin.loc[idx, col]
                            if val is not None and str(val) != 'nan':
                                record[key] = safe_val(float(val))
                        records.append(record)
                    data["income"] = records
            except Exception:
                pass

        except Exception as e:
            data["error"] = str(e)[:200]

        results[symbol] = data

    print(json.dumps(results))


if __name__ == "__main__":
    main()
