# api/views.py

from rest_framework.decorators import api_view
from rest_framework.response import Response

# Keep your existing view
def hello_world(request):
    return Response({'message': 'Hello from the Django API!'})

# Add this new view for the root
@api_view(['GET'])
def api_root(request):
    return Response({
        'message': 'Welcome to the API!',
        'endpoints': {
            'hello': '/api/hello/'
        }
    })