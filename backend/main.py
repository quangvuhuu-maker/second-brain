from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import feedparser
import datetime
import pandas as pd

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

@app.get("/api/market/stocks")
def get_stocks():
    # Thêm hậu tố .VN cho yfinance
    yf_symbols = [f"{sym}.VN" for sym in SYMBOLS]
    
    # Download data
    data = yf.download(yf_symbols, period="2mo", progress=False)
    
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
                
                results.append({
                    "symbol": symbol,
                    "price": float(latest['Close']),
                    "changePercent": round(float(change_percent), 2),
                    "volume": int(latest['Volume']),
                    "movingAverage20": round(float(ma20), 2),
                    "trend": trend
                })
        except Exception as e:
            print(f"Error processing {symbol}: {e}")
            pass
            
    # Sắp xếp lại theo ABC
    results.sort(key=lambda x: x['symbol'])
    return results

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
