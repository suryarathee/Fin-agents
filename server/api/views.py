import uuid
import requests
import os
from datetime import datetime, timezone
from django.utils.dateparse import parse_datetime

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import StockPrice
import time

PRIMARY_FASTAPI_URL = "https://deploy-agents-vlgw.onrender.com"
LOCAL_FASTAPI_URL = "http://localhost:8082"
FASTAPI_URL = "https://deploy-agents-vlgw.onrender.com"
FINNHUB_API_KEY = os.getenv("VITE_FINNHUB_API_KEY")


def request_task_manager(method, endpoint, payload=None, timeout=90):
    """
    Helper function to send requests to the Task Manager (FastAPI).
    Makes a single attempt with a generous timeout. On failure raises
    immediately so the caller can return a 503 — the frontend handles retries.
    (Blocking sleep inside a Gunicorn sync worker kills the process.)
    """
    url = f"{FASTAPI_URL}{endpoint}"
    print(f"[DJANGO] Connecting to Task Manager at: {url}")
    try:
        if method.upper() == 'POST':
            return requests.post(url, json=payload, timeout=timeout)
        elif method.upper() == 'GET':
            return requests.get(url, timeout=timeout)
        else:
            raise ValueError(f"Unsupported method: {method}")
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
        print(f"[DJANGO WARNING] Task Manager unreachable: {e}")
        raise
    except Exception as e:
        print(f"[DJANGO WARNING] Unexpected error: {e}")
        raise


@api_view(['POST'])
def chat_endpoint(request):
    """
    Send a chat message to the financial coordinator agent via the FastAPI middleware.
    Request body:
    {
        "message": "Your message here",
        "session_id": "session-id",
        "user_id": "user-id"
    }
    """
    try:
        message = request.data.get('message', '').strip()
        session_id = request.data.get('session_id')
        user_id = request.data.get('user_id')

        if not message:
            return Response(
                {'error': 'Message is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Generate IDs if missing
        if not user_id:
            user_id = str(uuid.uuid4())
        if not session_id:
            session_id = str(uuid.uuid4())

        payload = {
            "appName": "agent",
            "userId": user_id,
            "sessionId": session_id,
            "newMessage": message
        }

        print(f"[DJANGO] User: {user_id}, Session: {session_id}")

        # Send to the /chat endpoint using fallback logic
        response = request_task_manager('POST', '/chat', payload=payload)

        response.raise_for_status()
        task_data = response.json()

        return Response({
            "task_id": task_data.get("task_id"),
            "user_id": user_id,
            "session_id": session_id,
            "status": task_data.get("status"),
            "message": "Task started successfully"
        }, status=status.HTTP_202_ACCEPTED)

    except requests.exceptions.HTTPError as e:
        # This catches 4xx/5xx responses from the *successful* connection
        print(f"[DJANGO ERROR] Task Manager returned error: {e}")
        return Response(
            {'error': f'Task Manager error: {str(e)}'},
            status=status.HTTP_502_BAD_GATEWAY
        )
    except Exception as e:
        # This handles the case where request_task_manager raises an exception (all connections failed)
        error_msg = f"Cannot connect to Task Manager. Both Primary ({PRIMARY_FASTAPI_URL}) and Local ({LOCAL_FASTAPI_URL}) failed."
        print(f"[DJANGO ERROR] {error_msg} Details: {str(e)}")
        return Response(
            {'error': error_msg},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )


@api_view(['GET'])
def chat_status(request, task_id):
    """
    Check the status of a running task.

    Returns:
    {
        "task_id": "...",
        "status": "PENDING" | "SUCCESS" | "FAILURE" | "TIMEOUT",
        "result": { ... }
    }
    """
    try:
        # Updated endpoint to match main.py: /task/{task_id}
        response = request_task_manager('GET', f"/task/{task_id}")

        if response.status_code == 404:
            return Response(
                {'status': 'NOT_FOUND', 'error': 'Task ID not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        response.raise_for_status()
        return Response(response.json(), status=status.HTTP_200_OK)

    except requests.exceptions.HTTPError as e:
        print(f"[DJANGO ERROR] Task Manager status check returned error: {e}")
        return Response(
            {'error': f'Task Manager error: {str(e)}'},
            status=status.HTTP_502_BAD_GATEWAY
        )
    except Exception as e:
        print(f"[DJANGO ERROR] Status check connection failed: {str(e)}")
        return Response(
            {'error': 'Cannot connect to Task Manager to check status.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )


@api_view(['GET'])
def health_check(request):
    """Simple health check endpoint"""
    return Response({'status': 'healthy'}, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_stock_history(request):
    """
    Get historical stock data (candles).
    Usage: /api/stock-history/?symbol=AAPL&resolution=1
    It checks SQLite first. If data is missing or stale, it fetches from Finnhub,
    saves to SQLite, and returns the combined result.
    """
    symbol = request.query_params.get('symbol')
    if not symbol:
        return Response({'error': 'Symbol is required'}, status=status.HTTP_400_BAD_REQUEST)

    # Clean symbol (allow for 'BINANCE:BTCUSDT')
    clean_symbol = symbol.strip().upper()

    # Default to getting last 24 hours of 1-minute candles if not specified
    # Or common timeframes. For now let's just do "Last 2 days" to fill the chart.
    to_time = int(time.time())
    from_time = to_time - (2 * 24 * 60 * 60) # 2 days ago

    # Check DB first
    # We want ALL candles for this symbol after from_time
    cached_candles = StockPrice.objects.filter(
        symbol=clean_symbol,
        timestamp__gte=datetime.fromtimestamp(from_time, tz=timezone.utc)
    ).order_by('timestamp')

    # If we have a good amount of data (e.g., > 100 points), just return it?
    # Or simpler: always try to fetch latest if the last point is old?
    # For this demo, let's keep it simple:
    # If count is low, fetch from Finnhub to backfill.

    if cached_candles.count() < 10:
        print(f"[DJANGO] Fetching history for {clean_symbol} from yfinance...")
        try:
            import yfinance as yf

            # Map resolution to yfinance interval
            resolution = request.query_params.get('resolution', '1')

            # Default to 1m
            interval = "1m"
            period = "5d"

            if resolution == '5':
                interval = "5m"
                period = "1mo"
            elif resolution == '15':
                interval = "15m"
                period = "1mo"
            elif resolution == '60':
                interval = "1h"
                period = "6mo" # 1h data usually available for ~730 days max, but 6mo is safe
            elif resolution == 'D':
                interval = "1d"
                period = "2y"

            # Ticker fetch
            ticker = yf.Ticker(clean_symbol)
            hist = ticker.history(period=period, interval=interval)

            if not hist.empty:
                print(f"[DJANGO] Got {len(hist)} candles from yfinance")
                new_objects = []
                for index, row in hist.iterrows():
                    ts = index.to_pydatetime()
                    # Ensure timezone
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)

                    new_objects.append(StockPrice(
                        symbol=clean_symbol,
                        timestamp=ts,
                        open=float(row['Open']),
                        high=float(row['High']),
                        low=float(row['Low']),
                        close=float(row['Close']),
                        volume=int(row['Volume'])
                    ))

                # Bulk create, ignoring duplicates
                created = StockPrice.objects.bulk_create(new_objects, ignore_conflicts=True)
                print(f"[DJANGO] Created {len(created)} new candles in DB")
            else:
                print(f"[DJANGO] yfinance returned empty data for {clean_symbol}")

        except Exception as e:
            print(f"[DJANGO ERROR] Failed to fetch stock history from yfinance: {e}")
            import traceback
            traceback.print_exc()

    # Serialize
    result = []
    for c in cached_candles:
        result.append({
            'time': int(c.timestamp.timestamp()), # Frontend wants unix timestamp (seconds)
            'open': c.open,
            'high': c.high,
            'low': c.low,
            'close': c.close,
            'volume': c.volume
        })

    return Response(result, status=status.HTTP_200_OK)


@api_view(['GET'])
def search_stocks(request):
    """
    Search for stocks using Yahoo Finance's Typeahead API.
    Usage: /api/search/?q=Apple
    """
    query = request.query_params.get('q', '').strip()
    if not query:
        return Response({'count': 0, 'result': []}, status=status.HTTP_200_OK)

    try:
        # Yahoo Finance Typeahead API
        # Using a user-agent to avoid strict bot blocking, though usually lenient for typeahead
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        url = f"https://query2.finance.yahoo.com/v1/finance/search?q={query}&quotesCount=10&newsCount=0"

        response = requests.get(url, headers=headers, timeout=5)
        response.raise_for_status()
        data = response.json()

        quotes = data.get('quotes', [])
        formatted_results = []

        for quote in quotes:
            # We mostly care about Equities and ETFs
            # quoteType might be 'EQUITY', 'ETF', 'INDEX', etc.
            formatted_results.append({
                'description': quote.get('longname', quote.get('shortname', '')),
                'displaySymbol': quote.get('symbol'),
                'symbol': quote.get('symbol'),
                'type': quote.get('quoteType', 'Unknown'),
                'exchange': quote.get('exchange', '')
            })

        return Response({
            'count': len(formatted_results),
            'result': formatted_results
        }, status=status.HTTP_200_OK)

    except Exception as e:
        print(f"[DJANGO ERROR] Search failed: {e}")
        return Response(
            {'error': 'Failed to search stocks'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
