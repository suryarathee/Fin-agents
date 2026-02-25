
from django.urls import path
from . import views

urlpatterns = [
    # Your existing endpoint to start the chat
    path('chat/', views.chat_endpoint, name='chat_endpoint'),

    # Add this NEW path for checking the status
    path('chat/status/<str:task_id>/', views.chat_status, name='chat_status'),

    # Your existing health check endpoint
    path('health/', views.health_check, name='health_check'),
    
    # Historical Data Endpoint
    path('stock-history/', views.get_stock_history, name='get_stock_history'),
    
    # Search Endpoint
    path('search/', views.search_stocks, name='search_stocks'),
]