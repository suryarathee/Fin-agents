import uuid
import requests
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

# ✅ Task Manager server (FastAPI)
TASK_MANAGER_URL = "http://localhost:8082"


@api_view(['POST'])
def chat_endpoint(request):
    try:
        message = request.data.get('message', '').strip()
        session_id = request.data.get('session_id')
        user_id = request.data.get('user_id')

        if not message:
            return Response({'error': 'Message is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Generate IDs if missing
        if not user_id:
            user_id = str(uuid.uuid4())
        if not session_id:
            session_id = str(uuid.uuid4())

        # ✅ Build ADK-compatible payload
        payload = {
            "appName": "financial_coordinator",
            "userId": user_id,
            "sessionId": session_id,
            "newMessage": {
                "role": "user",
                "parts": [{"text": message}]
            },
            "streaming": False
        }

        # Send async task to FastAPI server
        start_response = requests.post(f"{TASK_MANAGER_URL}/run-async", json=payload, timeout=10)
        start_response.raise_for_status()
        task_data = start_response.json()

        return Response({
            "task_id": task_data.get("task_id"),
            "user_id": user_id,
            "session_id": session_id
        }, status=status.HTTP_202_ACCEPTED)

    except requests.exceptions.RequestException as e:
        return Response({'error': f'Agent connection error: {str(e)}'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def chat_status(request, task_id):
    try:
        status_response = requests.get(f"{TASK_MANAGER_URL}/task-status/{task_id}", timeout=10)
        status_response.raise_for_status()
        return Response(status_response.json(), status=status.HTTP_200_OK)
    except requests.exceptions.RequestException as e:
        return Response({'error': f'Agent status check error: {str(e)}'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


@api_view(['GET'])
def health_check(request):
    return Response({'status': 'healthy'}, status=status.HTTP_200_OK)
