
from django.urls import path
from . import views

urlpatterns = [
    # Your existing endpoint to start the chat
    path('chat/', views.chat_endpoint, name='chat_endpoint'),

    # Add this NEW path for checking the status
    path('chat/status/<str:task_id>/', views.chat_status, name='chat_status'),

    # Your existing health check endpoint
    path('health/', views.health_check, name='health_check'),
]