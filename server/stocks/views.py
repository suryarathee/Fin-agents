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
        # 1. Fetch data
        data = yf.download(symbol, period=period, interval='1d', progress=False)

        # 2. Check if data exists
        if data.empty:
            return Response({"error": f"No data found for symbol '{symbol}'"}, status=404)

        # --- CRITICAL FIX START ---
        # Fix for yfinance returning MultiIndex columns (e.g., ('Close', 'AAPL'))
        # We flatten it to just keep the price type (e.g., 'Close')
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = data.columns.get_level_values(0)
        # --- CRITICAL FIX END ---

        # 3. Reset index to make 'Date' a column
        data = data.reset_index()

        # 4. Rename columns to lowercase (matches your Frontend interface)
        data = data.rename(columns={
            'Date': 'date',
            'Open': 'open',
            'High': 'high',
            'Low': 'low',
            'Close': 'close',
            'Volume': 'volume'
        })

        # 5. Format Date to string
        if 'date' in data.columns:
            data['date'] = data['date'].dt.strftime('%Y-%m-%d')

        # 6. Select only existing columns (avoids KeyErrors if a column is missing)
        required_cols = ['date', 'open', 'high', 'low', 'close', 'volume']
        available_cols = [c for c in required_cols if c in data.columns]
        data = data[available_cols]

        # 7. Convert to list of dicts
        prices = data.to_dict('records')

        return Response({"symbol": symbol.upper(), "prices": prices})

    except Exception as e:
        print(f"Error fetching data for {symbol}: {e}")
        return Response({"error": str(e)}, status=500)