import uuid
import requests
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

# ✅ Task Manager server (FastAPI)
TASK_MANAGER_URL = "http://localhost:8001"


@api_view(['POST'])
def chat_endpoint(request):
    """
    Send a chat message to the financial coordinator agent.

    Request body:
    {
        "message": "Your message here",
        "session_id": "optional-session-id",
        "user_id": "optional-user-id"
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

        # ✅ Build ADK-compatible payload (matches AgentRunRequest schema)
        payload = {
            "appName": "agent",
            "userId": user_id,
            "sessionId": session_id,
            "newMessage": {
                "role": "user",
                "parts": [{"text": message}]
            },
            "streaming": False
        }

        print(f"[DJANGO] Sending message to FastAPI task manager")
        print(f"[DJANGO] User: {user_id}, Session: {session_id}")

        # Send async task to FastAPI server
        start_response = requests.post(
            f"{TASK_MANAGER_URL}/run-async",
            json=payload,
            timeout=10
        )
        start_response.raise_for_status()
        task_data = start_response.json()

        return Response({
            "task_id": task_data.get("task_id"),
            "user_id": user_id,
            "session_id": session_id,
            "message": "Task started successfully"
        }, status=status.HTTP_202_ACCEPTED)

    except requests.exceptions.RequestException as e:
        print(f"[DJANGO ERROR] Connection to FastAPI failed: {str(e)}")
        return Response(
            {'error': f'Agent connection error: {str(e)}'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    except Exception as e:
        print(f"[DJANGO ERROR] Unexpected error: {str(e)}")
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def chat_status(request, task_id):
    """
    Check the status of a running task.

    Returns:
    {
        "status": "PENDING" | "SUCCESS" | "FAILURE" | "NOT_FOUND",
        "result": <agent response or error>
    }
    """
    try:
        status_response = requests.get(
            f"{TASK_MANAGER_URL}/task-status/{task_id}",
            timeout=10
        )
        status_response.raise_for_status()
        return Response(status_response.json(), status=status.HTTP_200_OK)
    except requests.exceptions.RequestException as e:
        print(f"[DJANGO ERROR] Status check failed: {str(e)}")
        return Response(
            {'error': f'Agent status check error: {str(e)}'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )


@api_view(['GET'])
def health_check(request):
    """Simple health check endpoint"""
    return Response({'status': 'healthy'}, status=status.HTTP_200_OK)