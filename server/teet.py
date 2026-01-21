import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from livef1.adapters import RealF1Client
import threading
import asyncio
import time
from collections import deque

# --- CONFIGURATION ---
st.set_page_config(page_title="LiveF1 Stream", layout="wide", page_icon="🏎️")

# We use session state to share data between the background thread and Streamlit
if 'telemetry_buffer' not in st.session_state:
    st.session_state['telemetry_buffer'] = deque(maxlen=200)  # Keep last 200 points
if 'weather' not in st.session_state:
    st.session_state['weather'] = {}


# --- BACKGROUND WORKER: LIVEF1 CLIENT ---
def start_live_client():
    """
    Runs the LiveF1 client in a separate thread/loop so it doesn't block Streamlit.
    """
    # Create a new event loop for this thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    client = RealF1Client(topics=["CarData.z", "Weather.z"])

    @client.callback("CarData.z")
    async def handle_telemetry(records):
        # records is a list of dictionaries directly from the feed
        for record in records:
            # We filter for a specific driver for the demo (e.g., Driver 1 - Max)
            # You would likely want to store all and filter in UI
            if record.get('DriverNo') == 1:
                data_point = {
                    'time': pd.Timestamp.now(),  # Use local arrival time for stream x-axis
                    'speed': record.get('Speed', 0),
                    'rpm': record.get('RPM', 0),
                    'gear': record.get('Gear', 0)
                }
                st.session_state['telemetry_buffer'].append(data_point)

    @client.callback("Weather.z")
    async def handle_weather(records):
        for record in records:
            st.session_state['weather'] = record

    # Run the client
    # Note: In a real app, you need error handling for connection drops
    try:
        client.run()
    except Exception as e:
        print(f"Stream Error: {e}")


# Start the thread only once
if 'thread_started' not in st.session_state:
    t = threading.Thread(target=start_live_client, daemon=True)
    t.start()
    st.session_state['thread_started'] = True

# --- DASHBOARD UI ---
st.title("⚡ LiveF1 Python Library Stream")

col1, col2 = st.columns([3, 1])

# Placeholders for live updates
with col1:
    chart_spot = st.empty()

with col2:
    kpi_spot = st.empty()

st.info("ℹ️ This dashboard connects directly to the F1 signal via the `livef1` library.")

# --- RENDER LOOP ---
# Streamlit will re-run this loop to update the UI
while True:
    # 1. Get Data from Buffer
    data = list(st.session_state['telemetry_buffer'])

    if data:
        df = pd.DataFrame(data)

        # 2. Draw Chart
        fig = px.line(df, x='time', y='speed', title="Live Speed Trace (Max Verstappen)", height=400)
        fig.update_layout(xaxis_title="", yaxis_title="Speed (km/h)")
        chart_spot.plotly_chart(fig, use_container_width=True)

        # 3. Draw KPIs
        latest = data[-1]
        weather = st.session_state['weather']

        with kpi_spot.container():
            st.metric("Speed", f"{latest['speed']} km/h")
            st.metric("RPM", f"{latest['rpm']}")
            st.metric("Gear", f"{latest['gear']}")
            st.divider()
            st.write(f"**Track Temp:** {weather.get('TrackTemp', '--')}°C")
            st.write(f"**Air Temp:** {weather.get('AirTemp', '--')}°C")

    else:
        chart_spot.warning("Waiting for live data stream... (Is a race happening?)")

    time.sleep(0.5)  # Update every 0.5 seconds