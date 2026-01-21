import uuid
import requests
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

# ✅ Task Manager server (FastAPI)

# Ensure your FastAPI server is running: uvicorn main:app --port 8082
TASK_MANAGER_URL = "http://127.0.0.1:8082"
#TASK_MANAGER_URL = "https://agent-middleware-292413134253.asia-northeast1.run.app/"


@api_view(['POST'])
def chat_endpoint(request):
    """
    Send a chat message to the financial coordinator agent via the FastAPI middleware.

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

        # ✅ Build Payload matching FastAPI's AgentRequest model
        payload = {
            "appName": "agent",
            "userId": user_id,
            "sessionId": session_id,
            "newMessage": message
        }

        print(f"[DJANGO] Sending message to FastAPI task manager at {TASK_MANAGER_URL}")
        print(f"[DJANGO] User: {user_id}, Session: {session_id}")

        # Send to the new /chat endpoint
        response = requests.post(
            f"{TASK_MANAGER_URL}/chat",
            json=payload,
            timeout=10
        )
        response.raise_for_status()
        task_data = response.json()

        return Response({
            "task_id": task_data.get("task_id"),
            "user_id": user_id,
            "session_id": session_id,
            "status": task_data.get("status"),
            "message": "Task started successfully"
        }, status=status.HTTP_202_ACCEPTED)

    except requests.exceptions.ConnectionError:
        error_msg = f"Cannot connect to Task Manager at {TASK_MANAGER_URL}. Is the FastAPI server running on port 8082?"
        print(f"[DJANGO ERROR] {error_msg}")
        return Response(
            {'error': error_msg},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
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
        "task_id": "...",
        "status": "PENDING" | "SUCCESS" | "FAILURE" | "TIMEOUT",
        "result": { ... }
    }
    """
    try:
        # Updated endpoint to match main.py: /task/{task_id}
        status_response = requests.get(
            f"{TASK_MANAGER_URL}/task/{task_id}",
            timeout=10
        )

        if status_response.status_code == 404:
            return Response(
                {'status': 'NOT_FOUND', 'error': 'Task ID not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        status_response.raise_for_status()
        return Response(status_response.json(), status=status.HTTP_200_OK)

    except requests.exceptions.ConnectionError:
        return Response(
            {'error': f"Cannot connect to Task Manager at {TASK_MANAGER_URL}"},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
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