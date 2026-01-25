import uuid
import requests
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

PRIMARY_FASTAPI_URL = "https://deploy-agents-vlgw.onrender.com"
LOCAL_FASTAPI_URL = "http://127.0.0.1:8082"

def request_task_manager(method, endpoint, payload=None, timeout=10):
    """
    Helper function to send requests to the Task Manager (FastAPI).
    It first tries the PRIMARY_FASTAPI_URL (hosted).
    If that fails (connection error), it falls back to LOCAL_FASTAPI_URL.
    """
    urls_to_try = [PRIMARY_FASTAPI_URL, LOCAL_FASTAPI_URL]
    
    last_exception = None

    for base_url in urls_to_try:
        url = f"{base_url}{endpoint}"
        try:
            print(f"[DJANGO] Attempting connection to Task Manager at: {url}")
            if method.upper() == 'POST':
                response = requests.post(url, json=payload, timeout=timeout)
            elif method.upper() == 'GET':
                response = requests.get(url, timeout=timeout)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            # If we get a response, even if it's an error status code (like 404 or 500),
            # we consider the connection successful and return the response.
            # We let the caller handle the status code logic.
            return response

        except requests.exceptions.ConnectionError as e:
            print(f"[DJANGO WARNING] Connection failed to {base_url}. Error: {e}")
            last_exception = e
            continue  # Try the next URL
        except Exception as e:
            # For other errors (like timeout inside the request but connection established), 
            # we might also want to fallback? For now let's treat generic RequestException as fallback-able 
            # if strictly connection related, but here we catch generic Exception to be safe?
            # Actually, standardizing on ConnectionError is safer for "server down" vs "bad request".
            # Let's catch RequestException to cover timeouts too.
            print(f"[DJANGO WARNING] Request failed to {base_url}. Error: {e}")
            last_exception = e
            continue

    # If loop finishes, all attempts failed
    print("[DJANGO ERROR] All Task Manager connection attempts failed.")
    raise last_exception or Exception("Unknown connection error")


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
