# app.py
import streamlit as st
import requests
from bs4 import BeautifulSoup
import threading, time, os, json
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
import yfinance as yf
import plotly.express as px
from collections import deque

# ------------------------------
# Configuration / Globals
# ------------------------------
NEWS_SOURCES = ["Yahoo", "Reuters", "MarketWatch", "CNBC"]
SCRAPE_INTERVAL_SECONDS = 60  # poll every 60 seconds
WEIGHTS_PATH = "ensemble_weights.json"
HEADLINES_MEMORY = 5000  # keep last N headlines in memory for training/analysis

# Shared structures protected by lock
news_lock = threading.Lock()
news_store = deque(maxlen=HEADLINES_MEMORY)  # each item: dict with title, url, source, timestamp, ticker(s), sentiment, score
weights_lock = threading.Lock()

# default weights [finbert, keyword, price]
default_weights = np.array([0.5, 0.3, 0.2])

# ------------------------------
# Utilities: load/save weights
# ------------------------------
def load_weights():
    if os.path.exists(WEIGHTS_PATH):
        try:
            with open(WEIGHTS_PATH, "r") as f:
                d = json.load(f)
            w = np.array(d.get("weights", default_weights.tolist()), dtype=float)
            # normalize
            if w.sum() <= 0:
                return default_weights.copy()
            return w / w.sum()
        except Exception:
            return default_weights.copy()
    else:
        return default_weights.copy()

def save_weights(w):
    w = np.array(w, dtype=float)
    if w.sum() == 0:
        w = default_weights.copy()
    w = w / w.sum()
    with open(WEIGHTS_PATH, "w") as f:
        json.dump({"weights": w.tolist(), "updated": datetime.utcnow().isoformat()}, f)

# initialize weights file if not present
if not os.path.exists(WEIGHTS_PATH):
    save_weights(default_weights)

# ------------------------------
# Sentiment models
# ------------------------------
# Try load FinBERT (ProsusAI/finbert). If transformers is not installed or model fails, fall back to rule-based.
use_finbert = False
finbert_pipeline = None
try:
    from transformers import pipeline
    # Attempt to load prosusai/finbert (this may download models the first run)
    try:
        finbert_pipeline = pipeline("sentiment-analysis", model="ProsusAI/finbert")
        use_finbert = True
    except Exception:
        finbert_pipeline = None
        use_finbert = False
except Exception:
    use_finbert = False
    finbert_pipeline = None

finance_positive = ["surge", "profit", "beat", "growth", "upgrade", "gain", "record", "beats", "raise", "soars", "optimis"]
finance_negative = ["loss", "lawsuit", "downgrade", "slump", "drop", "fall", "miss", "missed", "cuts", "warns", "recall", "reuters"]

def rule_based_sentiment(text):
    t = text.lower()
    for p in finance_positive:
        if p in t:
            return "positive", 0.6
    for n in finance_negative:
        if n in t:
            return "negative", 0.6
    # fallback neutral
    return "neutral", 0.5

def finbert_sentiment(text):
    if use_finbert and finbert_pipeline:
        try:
            res = finbert_pipeline(text[:512])[0]
            label = res["label"].lower()
            score = float(res.get("score", 0.5))
            # FinBERT labels may be 'positive'/'neutral'/'negative' or 'POS'/...
            if label.startswith("pos"):
                label = "positive"
            elif label.startswith("neg"):
                label = "negative"
            else:
                label = "neutral"
            return label, float(score)
        except Exception:
            return rule_based_sentiment(text)
    else:
        return rule_based_sentiment(text)

# ------------------------------
# Price sentiment via yfinance
# ------------------------------
def price_sentiment_for_headline(ticker, published_dt=None):
    # published_dt can be None; we'll compare last close vs previous close
    try:
        t = yf.Ticker(ticker)
        df = t.history(period="3d", interval="1d")  # daily closes
        if df.shape[0] < 2:
            return "neutral", 0.5
        prev_close = df["Close"].iloc[-2]
        last_close = df["Close"].iloc[-1]
        delta = (last_close - prev_close) / prev_close
        if delta > 0:
            return "positive", min(0.99, abs(delta))
        elif delta < 0:
            return "negative", min(0.99, abs(delta))
        else:
            return "neutral", 0.5
    except Exception:
        return "neutral", 0.5

# ------------------------------
# Ticker detection (simple)
# ------------------------------
# Useful: you can expand this mapping or use a proper NER/ticker lookup
SAMPLE_COMPANIES = {
    "apple": "AAPL",
    "tesla": "TSLA",
    "microsoft": "MSFT",
    "amazon": "AMZN",
    "google": "GOOG",
    "alphabet": "GOOG",
    "meta": "META",
    "facebook": "META",
    "netflix": "NFLX",
    "nvidia": "NVDA",
    "intel": "INTC",
    "ibm": "IBM",
    "jpmorgan": "JPM",
    "jpm": "JPM",
    "coca-cola": "KO",
    "coca cola": "KO",
}

def detect_tickers(text):
    text_l = text.lower()
    tickers = set()
    for name, ticker in SAMPLE_COMPANIES.items():
        if name in text_l:
            tickers.add(ticker)
    # naive: also detect $TICKER pattern
    import re
    for match in re.findall(r"\$([A-Za-z]{1,5})", text):
        tickers.add(match.upper())
    return list(tickers)[:3]  # limit to 3

# ------------------------------
# Ensemble function
# ------------------------------
def ensemble_sentiment(text, ticker=None, weights=None):
    if weights is None:
        with weights_lock:
            weights = load_weights()
    else:
        weights = np.array(weights, dtype=float)
        if weights.sum() <= 0:
            weights = default_weights.copy()
        weights = weights / weights.sum()

    results = []

    # 1) FinBERT / deep model (weight[0])
    label_f, score_f = finbert_sentiment(text)
    results.append((label_f, score_f, weights[0]))

    # 2) Rule-based lexicon (weight[1])
    label_k, score_k = rule_based_sentiment(text)
    results.append((label_k, score_k, weights[1]))

    # 3) Price reaction (weight[2])
    if ticker:
        # If multiple tickers, use first for quick check
        label_p, score_p = price_sentiment_for_headline(ticker)
        results.append((label_p, score_p, weights[2]))

    # aggregate
    agg = {"positive": 0.0, "negative": 0.0, "neutral": 0.0}
    for label, score, w in results:
        agg[label] += score * w

    final_label = max(agg, key=agg.get)
    final_score = float(agg[final_label])
    return final_label, final_score

# ------------------------------
# Scrapers: simple, best-effort
# ------------------------------
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; SentimentBot/1.0)"}

def scrape_yahoo():
    url = "https://finance.yahoo.com/topic/stock-market-news/"
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        items = []
        for a in soup.select("h3 a"):
            title = a.get_text(strip=True)
            href = a.get("href")
            if href and title:
                if href.startswith("/"):
                    href = "https://finance.yahoo.com" + href
                items.append({"source": "Yahoo", "title": title, "url": href})
        return items
    except Exception:
        return []

def scrape_reuters():
    url = "https://www.reuters.com/business/finance/"
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        items = []
        # Reuters uses article headings in <h3> or <h2>
        for tag in soup.select("article a"):
            title = tag.get_text(strip=True)
            href = tag.get("href")
            if title and href:
                if href.startswith("/"):
                    href = "https://www.reuters.com" + href
                items.append({"source": "Reuters", "title": title, "url": href})
        # dedupe
        unique = { (i['title'], i['url']): i for i in items }
        return list(unique.values())[:40]
    except Exception:
        return []

def scrape_marketwatch():
    url = "https://www.marketwatch.com/"
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        items = []
        for tag in soup.select("a.article__headline"):
            title = tag.get_text(strip=True)
            href = tag.get("href")
            if title and href:
                items.append({"source": "MarketWatch", "title": title, "url": href})
        return items[:40]
    except Exception:
        return []

def scrape_cnbc():
    url = "https://www.cnbc.com/finance/"
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        items = []
        for tag in soup.select("a.Card-title"):
            title = tag.get_text(strip=True)
            href = tag.get("href")
            if title and href:
                items.append({"source": "CNBC", "title": title, "url": href})
        return items[:40]
    except Exception:
        return []

SCRAPER_FUNCS = [scrape_yahoo, scrape_reuters, scrape_marketwatch, scrape_cnbc]

# ------------------------------
# Background scraping loop
# ------------------------------
def scrape_once_and_store():
    scraped_any = False
    for fn in SCRAPER_FUNCS:
        try:
            items = fn()
        except Exception:
            items = []
        for item in items:
            title = item.get("title")
            url = item.get("url")
            source = item.get("source")
            timestamp = datetime.utcnow().isoformat()
            tickers = detect_tickers(title)
            ticker = tickers[0] if tickers else None
            label, score = ensemble_sentiment(title, ticker)
            entry = {
                "title": title,
                "url": url,
                "source": source,
                "timestamp": timestamp,
                "tickers": tickers,
                "main_ticker": ticker,
                "sentiment": label,
                "score": score
            }
            with news_lock:
                # simple dedupe on title + source
                exists = any(e['title']==title and e['source']==source for e in news_store)
                if not exists:
                    news_store.appendleft(entry)
                    scraped_any = True
    return scraped_any

def background_scraper():
    while True:
        try:
            scrape_once_and_store()
        except Exception as e:
            print("Scrape error:", e)
        time.sleep(SCRAPE_INTERVAL_SECONDS)

# Launch background scraper thread (daemon so streamlit process exits cleanly)
scrape_thread = threading.Thread(target=background_scraper, daemon=True)
scrape_thread.start()

# ------------------------------
# Simple daily "reinforcement" trainer at 04:00 (local server time)
# We implement a light-weight hill-climb optimizer that uses last N headlines with tickers
# to find weights that best align sentiment -> next-day price movement.
# ------------------------------
TRAIN_LOOKBACK_DAYS = 7
TRAIN_HEADLINE_SAMPLE = 500
def compute_reward_for_weights(weights, headlines):
    # reward: +1 for correct sign prediction per headline, -1 for wrong, 0 for neutral
    total = 0.0
    count = 0
    for h in headlines:
        t = h.get("title")
        ticker = h.get("main_ticker")
        if not ticker:
            continue
        # get label/score under these weights
        label, score = ensemble_sentiment(t, ticker, weights=weights)
        # compute price move next day (using yfinance intraday/daily)
        try:
            df = yf.Ticker(ticker).history(period="3d", interval="1d")
            if df.shape[0] < 2:
                continue
            prev = df["Close"].iloc[-2]
            latest = df["Close"].iloc[-1]
            move = latest - prev
            sign_move = np.sign(move)
            pred_sign = 0
            if label == "positive":
                pred_sign = 1
            elif label == "negative":
                pred_sign = -1
            else:
                pred_sign = 0
            if pred_sign == 0:
                reward = 0
            elif pred_sign == sign_move:
                reward = 1
            else:
                reward = -1
            total += reward
            count += 1
        except Exception:
            continue
    if count == 0:
        return 0.0
    return total / count  # average reward

def train_weights_hillclimb():
    # collect candidate headlines (last TRAIN_HEADLINE_SAMPLE with tickers)
    with news_lock:
        headlines = [h for h in list(news_store)[:TRAIN_HEADLINE_SAMPLE] if h.get("main_ticker")]
    if not headlines:
        print("Trainer: no headlines with tickers to train on.")
        return
    # starting point
    with weights_lock:
        current = load_weights()
    best = current.copy()
    best_score = compute_reward_for_weights(best, headlines)
    print(f"[Trainer] starting score {best_score:.4f} for weights {best}")
    # hill-climb random search
    rng = np.random.default_rng(int(time.time()) & 0xffffffff)
    for iteration in range(200):  # limited budget
        candidate = best + rng.normal(scale=0.05, size=3)
        candidate = np.clip(candidate, 0.01, 1.0)
        candidate = candidate / candidate.sum()
        score = compute_reward_for_weights(candidate, headlines)
        if score > best_score:
            best = candidate
            best_score = score
            print(f"[Trainer] new best {best_score:.4f} weights {best} iter {iteration}")
    # save best
    save_weights(best)
    print(f"[Trainer] finished. best_score={best_score:.4f}, weights saved: {best}")

# scheduler thread that runs train at 04:00 local each day
def schedule_trainer():
    last_run_date = None
    while True:
        now = datetime.now()
        # run at 04:00 once per day
        if now.hour == 4 and now.minute == 0:
            today = now.date()
            if last_run_date != today:
                print("Triggering daily trainer at", now.isoformat())
                try:
                    train_weights_hillclimb()
                except Exception as e:
                    print("Trainer error:", e)
                last_run_date = today
        time.sleep(30)

trainer_thread = threading.Thread(target=schedule_trainer, daemon=True)
trainer_thread.start()

# ------------------------------
# Streamlit UI
# ------------------------------
st.set_page_config(page_title="Financial News Sentiment (Ensemble + RL)", layout="wide")

st.title("📈 Financial News Sentiment — Ensemble + Daily RL-style Trainer")

# Sidebar controls
st.sidebar.header("Controls")
manual_tickers = st.sidebar.text_input("Tickers (comma-separated, used for per-ticker view)", value="AAPL,TSLA,MSFT")
if st.sidebar.button("Manual scrape now"):
    scraped = scrape_once_and_store()
    st.sidebar.write("Scraped new items?" , scraped)

if st.sidebar.button("Run trainer now (lightweight)"):
    with st.spinner("Running trainer..."):
        train_weights_hillclimb()
    st.sidebar.success("Trainer run finished. Weights updated.")

weights = load_weights()
st.sidebar.write("Current ensemble weights (FinBERT, Keyword, Price):")
st.sidebar.write(weights.tolist())

# Show last updated time for weights
try:
    with open(WEIGHTS_PATH, "r") as f:
        meta = json.load(f)
    updated = meta.get("updated")
    st.sidebar.write("Weights last saved (UTC):", updated)
except Exception:
    pass

# Main area: recent headlines table and treemap
st.header("Live Headlines (latest first)")
with news_lock:
    df_news = pd.DataFrame(list(news_store))

if df_news.empty:
    st.info("No headlines scraped yet — please wait a minute for the scraper to collect items.")
else:
    # allow filter by ticker / source / sentiment
    cols = st.columns([3,1,1,1,1,1])
    with cols[0]:
        q = st.text_input("Filter text", value="")
    with cols[1]:
        src_filter = st.selectbox("Source", options=["All"] + NEWS_SOURCES, index=0)
    with cols[2]:
        senti_filter = st.selectbox("Sentiment", options=["All","positive","negative","neutral"], index=0)
    with cols[3]:
        top_n = st.number_input("Show top N", min_value=10, max_value=1000, value=100, step=10)
    # apply filters
    df_display = df_news.copy()
    if q:
        df_display = df_display[df_display["title"].str.contains(q, case=False, na=False)]
    if src_filter != "All":
        df_display = df_display[df_display["source"] == src_filter]
    if senti_filter != "All":
        df_display = df_display[df_display["sentiment"] == senti_filter]
    # shorten URL displayed
    df_display = df_display.head(top_n)
    display_df = df_display[["timestamp","source","title","main_ticker","sentiment","score","url"]].copy()
    display_df = display_df.rename(columns={"timestamp":"time","main_ticker":"ticker","score":"score (agg)"})
    st.dataframe(display_df, use_container_width=True)

# Treemap: group by ticker or sector
st.header("Sentiment Treemap (by ticker)")

# Build treemap dataset: aggregate by ticker
with news_lock:
    df_for_tree = pd.DataFrame(list(news_store))

if not df_for_tree.empty:
    # keep only rows with tickers
    df_for_tree["ticker"] = df_for_tree["main_ticker"].fillna("UNKNOWN")
    # compute numeric score per record: positive->score, negative->-score, neutral->0
    def signed_score(row):
        if row["sentiment"] == "positive":
            return float(row.get("score", 0.5))
        elif row["sentiment"] == "negative":
            return -float(row.get("score", 0.5))
        else:
            return 0.0
    df_for_tree["signed_score"] = df_for_tree.apply(signed_score, axis=1)
    agg = df_for_tree.groupby("ticker").agg(
        mentions=("title","count"),
        avg_sentiment=("signed_score","mean"),
        total_score=("signed_score","sum")
    ).reset_index()
    # for visualization, create absolute value for size, but keep sign for color
    agg["size"] = agg["mentions"] * (agg["avg_sentiment"].abs() + 0.1)
    # replace UNKNOWN with 'Other'
    agg["ticker"] = agg["ticker"].replace({"UNKNOWN":"Other"})

    fig = px.treemap(
        agg,
        path=["ticker"],
        values="size",
        color="avg_sentiment",
        color_continuous_scale=px.colors.diverging.RdYlGn,
        title="Ticker-level sentiment treemap (size ~ mentions, color ~ avg sentiment)"
    )
    st.plotly_chart(fig, use_container_width=True)
else:
    st.info("No treemap data yet — waiting for scraped headlines.")

# Per-ticker detail
st.header("Per-ticker details")
tickers_input = [t.strip().upper() for t in manual_tickers.split(",") if t.strip()]
cols = st.columns(len(tickers_input) if len(tickers_input)>0 else 1)
for i, ticker in enumerate(tickers_input):
    with cols[i % len(cols)]:
        st.subheader(ticker)
        # recent headlines mentioning ticker
        with news_lock:
            df_t = pd.DataFrame([h for h in news_store if ticker in (h.get("tickers") or [])])
        if df_t.empty:
            st.write("No recent headlines mentioning", ticker)
        else:
            # compute ensemble sentiment per headline (with current weights)
            w = load_weights()
            df_t["ensemble_label"] = df_t["title"].apply(lambda t: ensemble_sentiment(t, ticker, weights=w)[0])
            df_t["ensemble_score"] = df_t["title"].apply(lambda t: ensemble_sentiment(t, ticker, weights=w)[1])
            st.dataframe(df_t[["timestamp","source","title","ensemble_label","ensemble_score"]].head(20), use_container_width=True)
        # quick price chart using yfinance - show last 30 days close in a simple line via plotly (use yfinance)
        try:
            stock = yf.Ticker(ticker)
            hist = stock.history(period="30d")
            if hist.shape[0] > 0:
                fig_price = px.line(hist.reset_index(), x="Date", y="Close", title=f"{ticker} - last 30d close")
                st.plotly_chart(fig_price, use_container_width=True)
        except Exception:
            st.write("Price data not available for", ticker)

# Footer: small diagnostics
st.markdown("---")
st.write("Diagnostics:")
with st.expander("Internal status / diagnostics"):
    st.write("Scraper interval (sec):", SCRAPE_INTERVAL_SECONDS)
    st.write("Stored headlines (count):", len(news_store))
    st.write("Weights (finbert, keyword, price):", load_weights().tolist())
    st.write("FinBERT available:", use_finbert)
    st.write("Last 10 headlines (title + sentiment):")
    with news_lock:
        for i, h in enumerate(list(news_store)[:10]):
            st.write(f"{i+1}. [{h['source']}] {h['title'][:150]} ... → {h['sentiment']} ({h['score']:.3f})")
