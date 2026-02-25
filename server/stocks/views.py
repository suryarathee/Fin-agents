import yfinance as yf
import pandas as pd
from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(['GET'])
def stock_data(request):
    symbol = request.GET.get('symbol')
    interval = request.GET.get('interval', '1d')

    if not symbol:
        return Response({"error": "Missing 'symbol' query parameter"}, status=400)

    try:
        # HANDLING FOR LIVE 1 MINUTE DATA
        if interval == '1m':
             # Fetch 1 day of minute data (or 5d if requested, but 1d is standard for live view)
             # period defaults to 1d in this branch if not specified
             fetch_period = request.GET.get('period', '1d')
             data_intraday = yf.download(symbol, period=fetch_period, interval="1m", progress=False, prepost=True)
             
             if data_intraday.empty:
                  return Response({"error": f"No minute data found for symbol '{symbol}'"}, status=404)
             
             if isinstance(data_intraday.columns, pd.MultiIndex):
                data_intraday.columns = data_intraday.columns.get_level_values(0)
             
             data_intraday = data_intraday.reset_index()
             
             # Rename columns standard
             data_intraday = data_intraday.rename(columns={
                'Date': 'date', 'Datetime': 'date',
                'Open': 'open', 'High': 'high', 'Low': 'low', 
                'Close': 'close', 'Volume': 'volume'
            })
             
             # Convert Datetime to UNIX timestamp (seconds)
             # Lightweight charts expects seconds for intraday
             prices = []
             for index, row in data_intraday.iterrows():
                 prices.append({
                     'date': int(row['date'].timestamp()), # UNIX timestamp
                     'open': float(row['open']),
                     'high': float(row['high']),
                     'low': float(row['low']),
                     'close': float(row['close']),
                     'volume': int(row['volume']) if 'volume' in row else 0
                 })
                 
             return Response({"symbol": symbol.upper(), "prices": prices})

        # --- ORIGINAL LOGIC FOR DAILY/HISTORICAL DATA ---
        # 1. Fetch daily data (historical)
        # We increase period slightly or just rely on what's requested. 
        # '1mo' is fine.
        data_daily = yf.download(symbol, period=period, interval='1d', progress=False)

        # 2. Fetch intraday data (current day) - get 5 days to be safe for weekends/holidays coverage if needed, 
        # but 1d is usually enough for "live" if market is open. 5d ensures we get the *latest* sesssion.
        data_intraday = yf.download(symbol, period="5d", interval="1m", progress=False, prepost=True)

        # Basic Check
        if data_daily.empty and data_intraday.empty:
            return Response({"error": f"No data found for symbol '{symbol}'"}, status=404)

        # --- Helper to process DataFrame (flatten multi-index, reset index) ---
        def process_data(df):
            if df.empty: return df
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            df = df.reset_index()
            # Normalize column names
            df = df.rename(columns={
                'Date': 'date', 'Datetime': 'date',
                'Open': 'open', 'High': 'high', 'Low': 'low', 
                'Close': 'close', 'Volume': 'volume'
            })
            return df

        data_daily = process_data(data_daily)
        data_intraday = process_data(data_intraday)

        # --- Merge Logic ---
        # We want the daily candles, but the LAST candle might be incomplete or missing today's action.
        # We will use the latest intraday candle to "patch" or "append" the latest state.
        
        # Format dates for consistency
        # Daily data 'date' is usually just date (YYYY-MM-DD). 
        # Intraday 'date' is datetime (YYYY-MM-DD HH:MM:SS...).
        
        if not data_daily.empty:
            data_daily['date_str'] = pd.to_datetime(data_daily['date']).dt.strftime('%Y-%m-%d')
        else:
            data_daily['date_str'] = []

        prices = []
        
        # Convert daily to list of dicts first
        if not data_daily.empty:
            required_cols = ['date', 'open', 'high', 'low', 'close', 'volume']
            available_cols = [c for c in required_cols if c in data_daily.columns]
            # Ensure we have the basic columns to avoid errors
            for col in required_cols:
                if col not in data_daily.columns:
                    data_daily[col] = 0
            
            # We use the formatted date string for the output
            data_daily['date'] = data_daily['date_str']
            prices = data_daily[required_cols].to_dict('records')

        # Now check intraday for the VERY LATEST price info
        if not data_intraday.empty:
            # Get the last row of intraday data
            last_intraday = data_intraday.iloc[-1]
            last_intraday_date = pd.to_datetime(last_intraday['date'])
            last_intraday_date_str = last_intraday_date.strftime('%Y-%m-%d')

            # Prepare the candle object
            latest_candle = {
                'date': last_intraday_date_str,
                'open': float(last_intraday['open']),
                'high': float(last_intraday['high']),
                'low': float(last_intraday['low']),
                'close': float(last_intraday['close']),
                'volume': int(last_intraday['volume']) if 'volume' in last_intraday else 0
            }

            # Check if this date already exists in our prices list
            existing_index = next((i for i, p in enumerate(prices) if p['date'] == last_intraday_date_str), -1)

            if existing_index != -1:
                # Update existing candle (it's the same day)
                # We should update Close, High, Low, Volume.
                # Open should ideally match the daily open, but yfinance 1d vs 1m might differ slightly.
                # We prioritize the LIVE (1m) close, but maybe keep the Daily Open?
                # Actually, 1d data from yfinance for "today" might be lagged/incomplete. 
                # Let's overwrite with the aggregated Intraday data for that day?
                # Aggregating all intraday rows for the current day is safer:
                
                todays_intraday = data_intraday[pd.to_datetime(data_intraday['date']).dt.strftime('%Y-%m-%d') == last_intraday_date_str]
                
                if not todays_intraday.empty:
                    agg_open = float(todays_intraday.iloc[0]['open']) # First minute open
                    agg_close = float(todays_intraday.iloc[-1]['close']) # Last minute close
                    agg_high = float(todays_intraday['high'].max())
                    agg_low = float(todays_intraday['low'].min())
                    agg_vol = int(todays_intraday['volume'].sum())
                    
                    prices[existing_index] = {
                        'date': last_intraday_date_str,
                        'open': agg_open,
                        'high': agg_high,
                        'low': agg_low,
                        'close': agg_close,
                        'volume': agg_vol
                    }
            else:
                # It's a new day! Append it.
                # But wait, if we append a single minute candle, the OHLC will be identical effectively (for that minute).
                # Better to aggregate if we have multiple minutes for today.
                todays_intraday = data_intraday[pd.to_datetime(data_intraday['date']).dt.strftime('%Y-%m-%d') == last_intraday_date_str]
                if not todays_intraday.empty:
                     agg_open = float(todays_intraday.iloc[0]['open'])
                     agg_close = float(todays_intraday.iloc[-1]['close'])
                     agg_high = float(todays_intraday['high'].max())
                     agg_low = float(todays_intraday['low'].min())
                     agg_vol = int(todays_intraday['volume'].sum())
                     
                     prices.append({
                        'date': last_intraday_date_str,
                        'open': agg_open,
                        'high': agg_high,
                        'low': agg_low,
                        'close': agg_close,
                        'volume': agg_vol
                    })

        return Response({"symbol": symbol.upper(), "prices": prices})


    except Exception as e:
        print(f"Error fetching data for {symbol}: {e}")
        return Response({"error": str(e)}, status=500)


@api_view(['GET'])
def market_sentiment(request):
    """
    Returns market sentiment data for major companies.
    Data includes: Symbol, Market Cap (Size), and Price Change % (Sentiment/Color).
    """
    tickers = [
        "AAPL", "NVDA", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "BRK-B", "LLY", "AVGO",
        "JPM", "V", "XOM", "WMT", "UNH", "MA", "PG", "JNJ", "HD", "ORCL", "COST", "ABBV",
        "TRV", "BAC", "KO", "NFLX", "CRM", "CVX", "AMD", "PEP"
    ]
    
    try:
        # Fetching data in bulk is more efficient
        # yfinance allows downloading multiple tickers at once, but 'download' gives history.
        # Tickers module is better for fundamentals like market cap.
        # However, Tickers iterate one by one for info which can be slow.
        # Let's try downloading 1d history for price change and use fast_info for market cap if possible?
        # fast_info is not bulk.
        
        # Strategy:
        # 1. Bulk download last 2 days of data for all tickers to compute % change fast.
        # 2. Market Cap: This is static-ish. We can fetch it, but 30 calls might be slow.
        #    Alternative: detailed download often has 'Close' and 'Open' or Volume.
        #    We really need Market Cap for sizing.
        #    Let's try yf.Tickers and threading or just efficient loop.
        
        # For speed in this demo, let's just get Price Change from bulk History
        # And maybe approximate MarketCap or fetch it.
        # Actually, let's use yfinance Tickers.
        
        data = []
        
        # Bulk download for price action
        hist_data = yf.download(tickers, period="2d", group_by='ticker', progress=False)
        
        # We need market caps. 
        # Getting real-time market cap for 30 stocks might take 5-10s sequentially.
        # We can implement a simple cache or just do it.
        # Let's try to be efficient: use the Ticker object.
        
        t_objects = yf.Tickers(" ".join(tickers))
        
        for p_symbol in tickers:
            try:
                # 1. Calculate Price Change from History (Fastest for live feeling)
                # hist_data is MultiIndex [('AAPL', 'Close'), ...] or plain if 1 ticker.
                # If multiple tickers, it's hierarchical.
                
                # Check if we have data
                # Handle how yfinance formats columns for multiple tickers
                # Structure: Top level = ticker, 2nd level = OHLCV
                
                # Note: yfinance structure changes if 1 vs many.
                if len(tickers) > 1:
                     ticker_df = hist_data[p_symbol]
                else:
                     ticker_df = hist_data # usage if only 1, but we have 30.
                
                if ticker_df.empty:
                    continue

                # Get latest close and previous close
                # Last row is "today" (could be live/incomplete), previous is yesterday.
                # If only 1 row (market just opened?), we might need pre-market?
                # Let's assume we have at least 1 row.
                
                current_price = float(ticker_df['Close'].iloc[-1])
                
                # We need "Previous Close" to calc change.
                # If 2 rows, take iloc[-2]. If 1 row, we need 'Open' or previous close from metadata.
                if len(ticker_df) >= 2:
                    prev_close = float(ticker_df['Close'].iloc[-2])
                    change_pct = ((current_price - prev_close) / prev_close) * 100
                    change_val = current_price - prev_close
                else:
                    # Fallback to Open if we only have 1 candle
                    open_price = float(ticker_df['Open'].iloc[-1])
                    if open_price == 0: open_price = current_price # Avoid div/0
                    change_pct = ((current_price - open_price) / open_price) * 100
                    change_val = current_price - open_price

                # 2. Market Cap using fast_info (Available in newer yfinance, faster than .info)
                # fast_info keys: 'marketCap', 'lastPrice', 'currency', etc.
                mc = t_objects.tickers[p_symbol].fast_info.get('marketCap')
                
                # If fast_info fails or is None, skip or default
                if not mc:
                    # Fallback to info (slower) or skip
                    # mc = t_objects.tickers[p_symbol].info.get('marketCap', 1000000000)
                    mc = 1000000000 # Default to 1B to avoid break
                
                data.append({
                    "symbol": p_symbol,
                    "marketCap": mc,
                    "price": current_price,
                    "changePercent": round(change_pct, 2),
                    "change": round(change_val, 2)
                })
                
            except Exception as inner_e:
                print(f"Error processing {p_symbol}: {inner_e}")
                continue
                
        # Sort by Market Cap desc
        data.sort(key=lambda x: x['marketCap'], reverse=True)
        
        return Response(data)
        
    except Exception as e:
        print(f"Error in market_sentiment: {e}")
        return Response({"error": str(e)}, status=500)
