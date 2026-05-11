from vnstock import Vnstock
import datetime

today = datetime.date.today()
start_date = (today - datetime.timedelta(days=30)).strftime("%Y-%m-%d")
end_date = today.strftime("%Y-%m-%d")

try:
    stock = Vnstock().stock(symbol="FPT", source="TCBS")
    df = stock.quote.history(start=start_date, end=end_date)
    print(df.tail(2))
except Exception as e:
    print("Error:", e)
