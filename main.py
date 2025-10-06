# main.py
import uuid
import threading
import requests
from fastapi import FastAPI, BackgroundTasks

# ✅ ADK server endpoint (make sure ADK is running with: adk api_server --port 8085)
ADK_AGENT_URL = "http://localhost:8085"

app = FastAPI()
task_results = {}
task_lock = threading.Lock()


def long_running_agent_task(task_id: str, payload: dict):
    print(f"[TASK STARTED] {task_id}")
    try:
        # ✅ Correct ADK endpoint
        response = requests.post(
            f"{ADK_AGENT_URL}/run",
            json=payload,
            timeout=300
        )
        response.raise_for_status()
        result = response.json()

        with task_lock:
            task_results[task_id] = {"status": "SUCCESS", "result": result}
        print(f"[TASK COMPLETED] {task_id}")
    except Exception as e:
        with task_lock:
            task_results[task_id] = {"status": "FAILURE", "result": str(e)}
        print(f"[TASK FAILED] {task_id} → {e}")


@app.post("/run-async")
def start_task(payload: dict, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())

    # Generate a unique session ID if missing
    if "sessionId" not in payload or not payload["sessionId"]:
        payload["sessionId"] = str(uuid.uuid4())

    with task_lock:
        task_results[task_id] = {"status": "PENDING", "result": None}

    background_tasks.add_task(long_running_agent_task, task_id, payload)
    return {"task_id": task_id}


@app.get("/task-status/{task_id}")
def get_task_status(task_id: str):
    with task_lock:
        result = task_results.get(task_id, {"status": "NOT_FOUND", "result": None})
    return result
