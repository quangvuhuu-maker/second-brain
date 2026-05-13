from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import feedparser
import datetime
import pandas as pd
import numpy as np
import time
import asyncio
import pytz

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Danh sách Top cổ phiếu thanh khoản cao trên cả 3 sàn (HSX, HNX, UPCOM)
SYMBOLS = [
    # Ngân hàng
    "VCB", "BID", "CTG", "MBB", "TCB", "VPB", "ACB", "STB", "SHB", "HDB", "VIB", "TPB", "LPB", "EIB", "MSB", "OCB", "SSB",
    # Chứng khoán
    "SSI", "VND", "VCI", "HCM", "SHS", "MBS", "VIX", "FTS", "CTS", "BSI", "AGR", "ORS", "VDS",
    # Bất động sản
    "VHM", "VIC", "VRE", "NVL", "PDR", "DIG", "DXG", "CEO", "KDH", "NLG", "HDG", "TCH", "CRE", "HDC", "SCR", "HQC", "ITA",
    # Bất động sản Khu công nghiệp
    "KBC", "IDC", "VGC", "SZC", "PHR", "DPR", "GVR", "SIP", "NTC",
    # Thép
    "HPG", "HSG", "NKG", "SMC", "VGS", "TLH",
    # Dầu khí
    "GAS", "BSR", "PVD", "PVS", "PLX", "OIL", "PVT", "PVC",
    # Xây dựng & Đầu tư công
    "VCG", "HHV", "LCG", "FCN", "C4G", "CTD", "HBC", "HUT", "G36",
    # Bán lẻ & Công nghệ
    "FPT", "MWG", "PNJ", "DGW", "FRT", "PET", "HAX",
    # Thực phẩm & Đồ uống
    "VNM", "SAB", "MSN", "DBC", "BAF", "HAG", "PAN", "TAR", "LTG",
    # Hóa chất & Phân bón
    "DGC", "DPM", "DCM", "BFC", "CSV", "LAS",
    # Cảng biển & Vận tải
    "GMD", "HAH", "VOS", "VSC", "SGP",
    # Thủy sản
    "VHC", "ANV", "IDI", "FMC", "MPC",
    # Dệt may
    "TNG", "TCM", "GIL", "MSH", "VGT",
    # Năng lượng
    "POW", "NT2", "GEG", "PC1", "REE", "QTP", "TV2",
    # Đa ngành & Khác
    "GELEX", "GEX", "BCG", "ASM"
]

market_stocks_cache = {"data": None, "timestamp": 0}

def update_stock_cache():
    global market_stocks_cache
    print("Updating stock cache...")
    now = time.time()
    
    # Thêm hậu tố .VN cho yfinance
    yf_symbols = [f"{sym}.VN" for sym in SYMBOLS]
    
    # Download data
    data = yf.download(yf_symbols, period="3mo", progress=False)
    
    results = []
    
    for symbol in SYMBOLS:
        try:
            yf_sym = f"{symbol}.VN"
            df = data.xs(yf_sym, level=1, axis=1).dropna()
            
            if not df.empty:
                latest = df.iloc[-1]
                
                # Màng lọc Lớp 1: Bỏ qua các cổ phiếu có thanh khoản quá thấp (< 100,000 cổ/ngày)
                if int(latest['Volume']) < 100000:
                    continue
                    
                prev = df.iloc[-2] if len(df) > 1 else latest
                
                ma20 = df['Close'].tail(20).mean() if len(df) >= 20 else df['Close'].mean()
                change_percent = ((latest['Close'] - prev['Close']) / prev['Close']) * 100
                
                if change_percent > 1: trend = "Bullish"
                elif change_percent < -1: trend = "Bearish"
                else: trend = "Sideway"
                
                close_prices = df['Close']
                open_prices = df['Open']
                high_prices = df['High']
                low_prices = df['Low']
                volume_data = df['Volume']
                
                # RSI 14
                delta = close_prices.diff()
                gain = (delta.where(delta > 0, 0)).ewm(alpha=1/14, adjust=False).mean()
                loss = (-delta.where(delta < 0, 0)).ewm(alpha=1/14, adjust=False).mean()
                rs = gain / loss
                rsi_series = 100 - (100 / (1 + rs))
                rsi = round(float(rsi_series.iloc[-1]), 1) if not rsi_series.empty and not pd.isna(rsi_series.iloc[-1]) else 50.0
                
                # MACD
                ema12 = close_prices.ewm(span=12, adjust=False).mean()
                ema26 = close_prices.ewm(span=26, adjust=False).mean()
                macd_line = ema12 - ema26
                signal_line = macd_line.ewm(span=9, adjust=False).mean()
                macd = round(float(macd_line.iloc[-1]), 2) if not macd_line.empty and not pd.isna(macd_line.iloc[-1]) else 0.0
                signal = round(float(signal_line.iloc[-1]), 2) if not signal_line.empty and not pd.isna(signal_line.iloc[-1]) else 0.0
                
                # Bollinger Bands
                bb_ma20 = close_prices.rolling(window=20).mean()
                bb_std20 = close_prices.rolling(window=20).std()
                upper_band = bb_ma20 + (bb_std20 * 2)
                lower_band = bb_ma20 - (bb_std20 * 2)
                bb_width_val = (upper_band.iloc[-1] - lower_band.iloc[-1]) / bb_ma20.iloc[-1] if not bb_ma20.empty and not pd.isna(bb_ma20.iloc[-1]) else 0.0
                bb_width = "Tight" if bb_width_val < 0.1 else "Expanded"
                
                # OBV
                obv_series = (np.sign(close_prices.diff()) * volume_data).fillna(0).cumsum()
                if len(obv_series) > 1:
                    current_obv = obv_series.iloc[-1]
                    prev_obv = obv_series.iloc[-2]
                    obv_trend = "Up" if current_obv > prev_obv else "Down" if current_obv < prev_obv else "Flat"
                else:
                    obv_trend = "Flat"
                    
                # SMC (Smart Money Concept) & Support/Resistance
                # 20-day Swing High / Swing Low
                support_level = round(float(low_prices.tail(20).min()), 2)
                resistance_level = round(float(high_prices.tail(20).max()), 2)
                
                # FVG (Fair Value Gap) on the last 3 candles
                smc_signal = "None"
                if len(df) >= 3:
                    # Bullish FVG: Low of candle 3 > High of candle 1
                    if low_prices.iloc[-1] > high_prices.iloc[-3] and close_prices.iloc[-2] > open_prices.iloc[-2]:
                        smc_signal = "Bullish FVG"
                    # Bearish FVG: High of candle 3 < Low of candle 1
                    elif high_prices.iloc[-1] < low_prices.iloc[-3] and close_prices.iloc[-2] < open_prices.iloc[-2]:
                        smc_signal = "Bearish FVG"
                        
                # BOS/CHoCH proxy: Breakout of 10-day high/low
                if smc_signal == "None" and len(df) >= 10:
                    if close_prices.iloc[-1] > high_prices.iloc[-11:-1].max():
                        smc_signal = "Bullish BOS/CHoCH"
                    elif close_prices.iloc[-1] < low_prices.iloc[-11:-1].min():
                        smc_signal = "Bearish BOS/CHoCH"
                        
                # VSA (Volume Spread Analysis)
                vsa_signal = "None"
                vol_ma20 = volume_data.rolling(20).mean().iloc[-1] if len(volume_data) >= 20 else volume_data.mean()
                if vol_ma20 > 0:
                    current_vol = volume_data.iloc[-1]
                    spread = high_prices.iloc[-1] - low_prices.iloc[-1]
                    avg_spread = (high_prices - low_prices).tail(20).mean()
                    is_high_vol = current_vol > (1.5 * vol_ma20)
                    is_wide_spread = spread > (1.5 * avg_spread)
                    
                    # Spread calculations for pinbars/wicks
                    if spread > 0:
                        upper_wick_pct = (high_prices.iloc[-1] - max(open_prices.iloc[-1], close_prices.iloc[-1])) / spread
                        lower_wick_pct = (min(open_prices.iloc[-1], close_prices.iloc[-1]) - low_prices.iloc[-1]) / spread
                        
                        # SOS (Sign of Strength): High Vol + Long lower wick (Spring) OR High Vol + Wide up spread
                        if is_high_vol and (lower_wick_pct > 0.5 or (is_wide_spread and close_prices.iloc[-1] > open_prices.iloc[-1])):
                            vsa_signal = "SOS (Sign of Strength)"
                        # SOW (Sign of Weakness): High Vol + Long upper wick (Upthrust) OR High Vol + Wide down spread
                        elif is_high_vol and (upper_wick_pct > 0.5 or (is_wide_spread and close_prices.iloc[-1] < open_prices.iloc[-1])):
                            vsa_signal = "SOW (Sign of Weakness)"
                
                results.append({
                    "symbol": symbol,
                    "price": float(latest['Close']),
                    "changePercent": round(float(change_percent), 2),
                    "volume": int(latest['Volume']),
                    "movingAverage20": round(float(ma20), 2),
                    "trend": trend,
                    "rsi": rsi,
                    "macd": f"{macd}/{signal}",
                    "obvTrend": obv_trend,
                    "bbWidth": bb_width,
                    "support": support_level,
                    "resistance": resistance_level,
                    "smcSignal": smc_signal,
                    "vsaSignal": vsa_signal
                })
        except Exception as e:
            print(f"Error processing {symbol}: {e}")
            pass
            
    # Sắp xếp lại theo ABC
    results.sort(key=lambda x: x['symbol'])
    
    market_stocks_cache["data"] = results
    market_stocks_cache["timestamp"] = now
    print("Stock cache updated successfully.")
    return results

async def run_daily_6am():
    vn_tz = pytz.timezone('Asia/Ho_Chi_Minh')
    while True:
        now = datetime.datetime.now(vn_tz)
        target = now.replace(hour=6, minute=0, second=0, microsecond=0)
        
        # Nếu đã qua 6:00 AM hôm nay, hẹn giờ sang 6:00 AM ngày mai
        if now >= target:
            target += datetime.timedelta(days=1)
            
        wait_seconds = (target - now).total_seconds()
        print(f"Scheduled next daily update at {target.strftime('%Y-%m-%d %H:%M:%S')} (in {wait_seconds:.0f} seconds)")
        
        await asyncio.sleep(wait_seconds)
        
        # Tới 6:00 AM, cập nhật dữ liệu
        print("Running daily stock update at 6:00 AM VN...")
        try:
            # Chạy update_stock_cache trong threadpool để không block asyncio loop
            await asyncio.to_thread(update_stock_cache)
        except Exception as e:
            print(f"Error in scheduled task: {e}")

@app.on_event("startup")
async def startup_event():
    # Khởi chạy task chạy ngầm mỗi ngày 6:00 AM
    asyncio.create_task(run_daily_6am())
    # Có thể chạy 1 lần lúc startup luôn (tuỳ chọn)
    # asyncio.create_task(asyncio.to_thread(update_stock_cache))

@app.get("/api/market/stocks")
def get_stocks(refresh: bool = False):
    global market_stocks_cache
    # Nếu có cờ refresh hoặc cache chưa có gì, thì ép cập nhật
    if refresh or not market_stocks_cache["data"]:
        return update_stock_cache()
        
    # Trả về cache vô thời hạn (sẽ tự được làm mới vào 6h sáng hôm sau)
    return market_stocks_cache["data"]

@app.get("/api/market/news")
def get_news():
    url = "https://cafef.vn/trang-chu.rss"
    feed = feedparser.parse(url)
    
    results = []
    for entry in feed.entries[:10]: # Tăng lên 10 tin để AI có nhiều góc nhìn vĩ mô hơn
        results.append({
            "title": entry.title,
            "summary": entry.description[:200] + "..." if len(entry.description) > 200 else entry.description,
            "time": entry.published,
            "impact": "Neutral"
        })
    return results

@app.get("/api/market/historical-prices")
def get_historical_prices(symbols: str, date: str):
    sym_list = [s.strip() for s in symbols.split(",") if s.strip()]
    if not sym_list:
        return {}
    yf_symbols = [f"{sym}.VN" for sym in sym_list]
    
    target_date = datetime.datetime.strptime(date, "%Y-%m-%d")
    start_date = (target_date - datetime.timedelta(days=7)).strftime("%Y-%m-%d")
    end_date = (target_date + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    
    data = yf.download(yf_symbols, start=start_date, end=end_date, progress=False)
    
    results = {}
    if data.empty or 'Close' not in data:
        return {sym: None for sym in sym_list}

    close_data = data['Close']
    is_multi = len(yf_symbols) > 1
    
    for symbol in sym_list:
        try:
            yf_sym = f"{symbol}.VN"
            if is_multi:
                if yf_sym in close_data:
                    series = close_data[yf_sym].dropna()
                else:
                    series = pd.Series()
            else:
                series = close_data.dropna()
                
            if not series.empty:
                series_past = series.loc[:date]
                if not series_past.empty:
                    results[symbol] = float(series_past.iloc[-1])
                else:
                    results[symbol] = None
            else:
                results[symbol] = None
        except Exception as e:
            print(f"Error processing historical for {symbol}: {e}")
            results[symbol] = None
            
    return results

@app.get("/api/market/stock/{symbol}")
def get_single_stock(symbol: str):
    """Lấy dữ liệu kỹ thuật cho 1 mã cổ phiếu bất kỳ (không cần nằm trong danh sách theo dõi)."""
    symbol = symbol.upper().strip()
    yf_sym = f"{symbol}.VN"
    
    try:
        data = yf.download(yf_sym, period="3mo", progress=False)
        
        if data.empty:
            return {"error": f"Không tìm thấy dữ liệu cho mã {symbol}"}
        
        df = data.dropna()
        if df.empty:
            return {"error": f"Dữ liệu rỗng cho mã {symbol}"}
            
        latest = df.iloc[-1]
        prev = df.iloc[-2] if len(df) > 1 else latest
        
        close_prices = df['Close']
        open_prices = df['Open']
        high_prices = df['High']
        low_prices = df['Low']
        volume_data = df['Volume']
        
        ma20 = close_prices.tail(20).mean() if len(df) >= 20 else close_prices.mean()
        change_percent = ((latest['Close'] - prev['Close']) / prev['Close']) * 100
        
        if change_percent > 1: trend = "Bullish"
        elif change_percent < -1: trend = "Bearish"
        else: trend = "Sideway"
        
        # RSI 14
        delta = close_prices.diff()
        gain = (delta.where(delta > 0, 0)).ewm(alpha=1/14, adjust=False).mean()
        loss = (-delta.where(delta < 0, 0)).ewm(alpha=1/14, adjust=False).mean()
        rs = gain / loss
        rsi_series = 100 - (100 / (1 + rs))
        rsi = round(float(rsi_series.iloc[-1]), 1) if not rsi_series.empty and not pd.isna(rsi_series.iloc[-1]) else 50.0
        
        # MACD
        ema12 = close_prices.ewm(span=12, adjust=False).mean()
        ema26 = close_prices.ewm(span=26, adjust=False).mean()
        macd_line = ema12 - ema26
        signal_line = macd_line.ewm(span=9, adjust=False).mean()
        macd = round(float(macd_line.iloc[-1]), 2)
        signal = round(float(signal_line.iloc[-1]), 2)
        
        # Bollinger Bands
        bb_ma20 = close_prices.rolling(window=20).mean()
        bb_std20 = close_prices.rolling(window=20).std()
        upper_band = bb_ma20 + (bb_std20 * 2)
        lower_band = bb_ma20 - (bb_std20 * 2)
        bb_width_val = (upper_band.iloc[-1] - lower_band.iloc[-1]) / bb_ma20.iloc[-1] if not bb_ma20.empty and not pd.isna(bb_ma20.iloc[-1]) else 0.0
        bb_width = "Tight" if bb_width_val < 0.1 else "Expanded"
        
        # OBV
        obv_series = (np.sign(close_prices.diff()) * volume_data).fillna(0).cumsum()
        if len(obv_series) > 1:
            obv_trend = "Up" if obv_series.iloc[-1] > obv_series.iloc[-2] else "Down" if obv_series.iloc[-1] < obv_series.iloc[-2] else "Flat"
        else:
            obv_trend = "Flat"
        
        # SMC
        support_level = round(float(low_prices.tail(20).min()), 2)
        resistance_level = round(float(high_prices.tail(20).max()), 2)
        
        smc_signal = "None"
        if len(df) >= 3:
            if low_prices.iloc[-1] > high_prices.iloc[-3] and close_prices.iloc[-2] > open_prices.iloc[-2]:
                smc_signal = "Bullish FVG"
            elif high_prices.iloc[-1] < low_prices.iloc[-3] and close_prices.iloc[-2] < open_prices.iloc[-2]:
                smc_signal = "Bearish FVG"
        if smc_signal == "None" and len(df) >= 10:
            if close_prices.iloc[-1] > high_prices.iloc[-11:-1].max():
                smc_signal = "Bullish BOS/CHoCH"
            elif close_prices.iloc[-1] < low_prices.iloc[-11:-1].min():
                smc_signal = "Bearish BOS/CHoCH"
        
        # VSA
        vsa_signal = "None"
        vol_ma20 = volume_data.rolling(20).mean().iloc[-1] if len(volume_data) >= 20 else volume_data.mean()
        if vol_ma20 > 0:
            current_vol = volume_data.iloc[-1]
            spread = high_prices.iloc[-1] - low_prices.iloc[-1]
            avg_spread = (high_prices - low_prices).tail(20).mean()
            is_high_vol = current_vol > (1.5 * vol_ma20)
            is_wide_spread = spread > (1.5 * avg_spread)
            if spread > 0:
                upper_wick_pct = (high_prices.iloc[-1] - max(open_prices.iloc[-1], close_prices.iloc[-1])) / spread
                lower_wick_pct = (min(open_prices.iloc[-1], close_prices.iloc[-1]) - low_prices.iloc[-1]) / spread
                if is_high_vol and (lower_wick_pct > 0.5 or (is_wide_spread and close_prices.iloc[-1] > open_prices.iloc[-1])):
                    vsa_signal = "SOS (Sign of Strength)"
                elif is_high_vol and (upper_wick_pct > 0.5 or (is_wide_spread and close_prices.iloc[-1] < open_prices.iloc[-1])):
                    vsa_signal = "SOW (Sign of Weakness)"
        
        return {
            "symbol": symbol,
            "price": float(latest['Close']),
            "changePercent": round(float(change_percent), 2),
            "volume": int(latest['Volume']),
            "movingAverage20": round(float(ma20), 2),
            "trend": trend,
            "rsi": rsi,
            "macd": f"{macd}/{signal}",
            "obvTrend": obv_trend,
            "bbWidth": bb_width,
            "support": support_level,
            "resistance": resistance_level,
            "smcSignal": smc_signal,
            "vsaSignal": vsa_signal
        }
    except Exception as e:
        print(f"Error processing single stock {symbol}: {e}")
        return {"error": f"Lỗi xử lý mã {symbol}: {str(e)}"}
