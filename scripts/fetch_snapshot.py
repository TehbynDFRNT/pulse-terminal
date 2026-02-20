#!/usr/bin/env python3
"""Single API call that returns everything the dashboard needs.
Prices, ratios, FRED macro, miner fundamentals — one JSON blob.
Usage: fetch_snapshot.py
"""
import json
import sys

def safe(v):
    if v is None:
        return None
    if isinstance(v, float):
        import math
        if math.isnan(v) or math.isinf(v):
            return None
        return round(v, 4)
    if isinstance(v, int):
        return v
    return str(v)

def main():
    import yfinance as yf
    from openbb import obb

    result = {"prices": {}, "macro": {}, "fundamentals": {}, "ratios": {}}

    # === PRICES (yfinance) ===
    price_symbols = {
        "GC=F": "Gold", "SI=F": "Silver", "PL=F": "Platinum",
        "DX-Y.NYB": "DXY", "BTC-USD": "Bitcoin",
        "NST.AX": "Northern Star", "EVN.AX": "Evolution",
        "RMS.AX": "Ramelius", "GOR.AX": "Gold Road",
        "WGX.AX": "Westgold",
        "SPY": "S&P 500", "GLD": "Gold ETF", "SLV": "Silver ETF",
        "HG=F": "Copper", "CL=F": "Crude Oil",
    }

    try:
        tickers = yf.Tickers(" ".join(price_symbols.keys()))
        for sym, name in price_symbols.items():
            try:
                t = tickers.tickers.get(sym.replace("=", "").replace("-", "").replace(".", ""), None)
                if t is None:
                    t = yf.Ticker(sym)
                info = t.info
                price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
                prev = info.get("previousClose") or info.get("regularMarketPreviousClose")
                change = (price - prev) if price and prev else None
                change_pct = (change / prev * 100) if change and prev else None
                result["prices"][sym] = {
                    "name": name,
                    "price": safe(price),
                    "prev_close": safe(prev),
                    "change": safe(change),
                    "change_pct": safe(change_pct),
                    "year_high": safe(info.get("fiftyTwoWeekHigh")),
                    "year_low": safe(info.get("fiftyTwoWeekLow")),
                    "ma_50d": safe(info.get("fiftyDayAverage")),
                    "ma_200d": safe(info.get("twoHundredDayAverage")),
                }
            except Exception as e:
                result["prices"][sym] = {"name": name, "error": str(e)[:80]}
    except Exception as e:
        result["prices_error"] = str(e)[:100]

    # === RATIOS ===
    try:
        gold = result["prices"].get("GC=F", {}).get("price")
        silver = result["prices"].get("SI=F", {}).get("price")
        copper = result["prices"].get("HG=F", {}).get("price")
        if gold and silver:
            result["ratios"]["gold_silver"] = safe(gold / silver)
        if copper and gold:
            result["ratios"]["copper_gold"] = safe(copper / gold * 1000)  # scale for readability
    except:
        pass

    # === FRED MACRO ===
    fred_series = {
        "DGS10": "10Y Yield",
        "DGS2": "2Y Yield",
        "T10Y2Y": "Yield Spread",
        "FEDFUNDS": "Fed Funds",
        "T10YIE": "Breakeven Infl",
        "DFII10": "Real Rate 10Y",
        "STLFSI4": "Fin Stress",
        "M2SL": "M2 Supply",
        "DTWEXBGS": "Dollar Index",
        "UNRATE": "Unemployment",
    }

    for series_id, label in fred_series.items():
        try:
            r = obb.economy.fred_series(symbol=series_id, provider="fred")
            df = r.to_dataframe().reset_index()
            df.columns = [c.lower() for c in df.columns]
            date_col = 'date' if 'date' in df.columns else df.columns[0]
            val_col = [c for c in df.columns if c != date_col and c != 'index'][0]
            # Get last non-NaN value
            valid = df[df[val_col].notna()]
            if len(valid) > 0:
                last = valid.iloc[-1]
                result["macro"][series_id] = {
                    "label": label,
                    "value": safe(float(last[val_col])),
                    "date": str(last[date_col])[:10],
                }
        except Exception as e:
            result["macro"][series_id] = {"label": label, "error": str(e)[:80]}

    # === MINER FUNDAMENTALS (yfinance) ===
    fund_symbols = ["NEM", "AEM", "GOLD", "WPM", "FNV"]
    for sym in fund_symbols:
        try:
            t = yf.Ticker(sym)
            info = t.info
            result["fundamentals"][sym] = {
                "name": info.get("longName") or info.get("shortName"),
                "price": safe(info.get("currentPrice") or info.get("regularMarketPrice")),
                "market_cap": safe(info.get("marketCap")),
                "pe": safe(info.get("trailingPE")),
                "fwd_pe": safe(info.get("forwardPE")),
                "pb": safe(info.get("priceToBook")),
                "ev_ebitda": safe(info.get("enterpriseToEbitda")),
                "div_yield": safe(info.get("dividendYield")),
                "roe": safe(info.get("returnOnEquity")),
                "de": safe(info.get("debtToEquity")),
                "beta": safe(info.get("beta")),
                "fcf": safe(info.get("freeCashflow")),
                "eps": safe(info.get("trailingEps")),
                "fwd_eps": safe(info.get("forwardEps")),
            }
        except Exception as e:
            result["fundamentals"][sym] = {"error": str(e)[:80]}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
