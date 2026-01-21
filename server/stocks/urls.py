from django.urls import path
from .views import stock_data

urlpatterns = [
    path('api/stock/', stock_data, name='stock_data'),
]
