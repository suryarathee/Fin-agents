import yfinance as yf
import pandas as pd
from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(['GET'])
def stock_data(request):
    symbol = request.GET.get('symbol')
    period = request.GET.get('period', '1mo')

    if not symbol:
        return Response({"error": "Missing 'symbol' query parameter"}, status=400)

    try:
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