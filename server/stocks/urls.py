from django.urls import path
from .views import stock_data, market_sentiment

urlpatterns = [
    path('api/stock/', stock_data, name='stock_data'),
    path('api/market-sentiment/', market_sentiment, name='market_sentiment'),
]
