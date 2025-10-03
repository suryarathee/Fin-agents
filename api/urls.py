from django.urls import path
from .views import hello_world,api_root

urlpatterns = [
    path('', api_root, name='api_root'),
    path('hello/', hello_world, name='hello_world'),
]