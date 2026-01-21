# agents.py
from google.adk.agents import Agent

# --- Sub-agents ---
market_data_agent = Agent(
    name="market_data_agent",
    model="gemini-2.5-flash",
    description="Fetches live market data.",
    instruction=(
        "You provide live ticker data with OHLC and indicators like RSI and MACD. "
        "Respond in JSON: {ticker, price, change_percent, rsi, macd, moving_avg_50, moving_avg_200}."
    ),
)

sentiment_agent = Agent(
    name="sentiment_agent",
    model="gemini-2.5-flash",
    description="Analyzes financial sentiment.",
    instruction=(
        "You return sentiment_score (-1 to 1), trend, and key reasons "
        "based on recent news or market chatter."
    ),
)

risk_agent = Agent(
    name="risk_agent",
    model="gemini-2.5-flash",
    description="Calculates portfolio risk and volatility.",
    instruction=(
        "You analyze portfolio exposure and return risk_score (0–1) with a short explanation."
    ),
)

strategy_agent = Agent(
    name="strategy_agent",
    model="gemini-2.5-flash",
    description="Generates trading recommendations.",
    instruction=(
        "Combine market data, sentiment, and risk to give a trading recommendation (BUY, HOLD, SELL)."
    ),
)

dashboard_agent = Agent(
    name="dashboard_agent",
    model="gemini-2.5-flash",
    description="Formats agent results for dashboards.",
    instruction=(
        "Aggregate insights into JSON: "
        "{ticker, price, change, sentiment, risk_score, recommendation, allocation, timestamp}."
    ),
)

# --- Unified Root Agent ---
financial_agent = Agent(
    name="financial_agent",
    model="gemini-2.5-flash",
    description="Unified financial analysis and trading assistant.",
    instruction=(
        "You orchestrate market, sentiment, risk, and strategy sub-agents "
        "and compile their responses into structured JSON summaries for dashboard display."
    ),
    sub_agents=[
        market_data_agent,
        sentiment_agent,
        risk_agent,
        strategy_agent,
        dashboard_agent,
    ],
)
