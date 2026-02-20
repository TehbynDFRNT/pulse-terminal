#!/usr/bin/env python3
"""Fast price snapshot via yfinance. Outputs JSON."""
import json
import math

def safe(v):
    if v is None: return None
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v): return None
        return round(v, 4)
    if isinstance(v, int): return v
    return str(v)

def main():
    import yfinance as yf

    symbols = {
        "GC=F": "Gold", "SI=F": "Silver", "PL=F": "Platinum",
        "DX-Y.NYB": "DXY", "BTC-USD": "Bitcoin",
        "NST.AX": "Northern Star", "EVN.AX": "Evolution",
        "RMS.AX": "Ramelius", "GOR.AX": "Gold Road", "WGX.AX": "Westgold",
        "SPY": "S&P 500", "GLD": "Gold ETF", "SLV": "Silver ETF",
        "HG=F": "Copper", "CL=F": "Crude Oil",
    }

    prices = {}
    ratios = {}

    for sym, name in symbols.items():
        try:
            t = yf.Ticker(sym)
            info = t.fast_info if hasattr(t, 'fast_info') else t.info
            # Try fast_info first (much faster)
            if hasattr(info, 'last_price'):
                price = safe(info.last_price)
                prev = safe(info.previous_close)
                change = safe(price - prev) if price and prev else None
                change_pct = safe((price - prev) / prev * 100) if price and prev else None
                prices[sym] = {
                    "name": name, "price": price, "prev_close": prev,
                    "change": change, "change_pct": change_pct,
                    "year_high": safe(info.year_high), "year_low": safe(info.year_low),
                    "ma_50d": safe(info.fifty_day_average),
                }
            else:
                price = safe(info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose"))
                prev = safe(info.get("previousClose"))
                change = safe(price - prev) if price and prev else None
                change_pct = safe((price - prev) / prev * 100) if price and prev else None
                prices[sym] = {
                    "name": name, "price": price, "prev_close": prev,
                    "change": change, "change_pct": change_pct,
                    "year_high": safe(info.get("fiftyTwoWeekHigh")),
                    "year_low": safe(info.get("fiftyTwoWeekLow")),
                    "ma_50d": safe(info.get("fiftyDayAverage")),
                }
        except Exception as e:
            prices[sym] = {"name": name, "error": str(e)[:80]}

    # Ratios
    gold = prices.get("GC=F", {}).get("price")
    silver = prices.get("SI=F", {}).get("price")
    copper = prices.get("HG=F", {}).get("price")
    if gold and silver: ratios["gold_silver"] = safe(gold / silver)
    if copper and gold: ratios["copper_gold"] = safe(copper / gold * 1000)

    print(json.dumps({"prices": prices, "ratios": ratios}))

if __name__ == "__main__":
    main()
