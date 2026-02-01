import streamlit as st
import pandas as pd
from tradingview_screener import Query, Column

# 1. Page Configuration
st.set_page_config(
    page_title="TradingView Screener Dashboard",
    page_icon="📈",
    layout="wide"
)

st.title("📈 Market Scanner (TradingView Data)")
st.markdown("This dashboard fetches live data using the `tradingview-screener` library.")

# 2. Sidebar Configuration
with st.sidebar:
    st.header("⚙️ Scanner Settings")

    # User Inputs
    rows_to_fetch = st.slider("Number of results", 10, 100, 50)

    st.subheader("Filters")
    min_price = st.number_input("Min Price ($)", value=5.0, step=1.0)
    min_volume = st.number_input("Min Volume", value=1_000_000, step=500_000)

    # Sorting option
    sort_option = st.selectbox(
        "Sort By",
        options=['volume', 'change', 'close', 'market_cap_basic'],
        index=0
    )

    sort_order = st.radio("Sort Order", ["Descending", "Ascending"], index=0)
    ascending_bool = True if sort_order == "Ascending" else False

    st.divider()
    if st.button("Run Scanner", type="primary"):
        st.session_state['run_scan'] = True


# 3. Data Fetching Function
@st.cache_data(ttl=60)  # Cache data for 60 seconds to prevent spamming the API
def get_screened_data(limit, min_p, min_v, sort_col, asc_val):
    try:
        # Construct the query
        # We select common fields: Name, Close Price, Volume, % Change, Market Cap
        q = (Query()
             .select('name', 'close', 'volume', 'change', 'market_cap_basic', 'sector')
             .where(
            Column('close') >= min_p,
            Column('volume') >= min_v
        )
             .order_by(sort_col, ascending=asc_val)
             .limit(limit)
             )

        # Fetch data (returns a tuple: (count, dataframe))
        count, df = q.get_scanner_data()
        return df
    except Exception as e:
        st.error(f"Error fetching data: {e}")
        return pd.DataFrame()


# 4. Main App Logic
# Run the scan if button is clicked or if it's the first load
if 'run_scan' not in st.session_state:
    st.session_state['run_scan'] = True

if st.session_state['run_scan']:
    with st.spinner('Scanning the US Market...'):
        df = get_screened_data(rows_to_fetch, min_price, min_volume, sort_option, ascending_bool)

    if not df.empty:
        # --- Metrics Overview ---
        col1, col2, col3 = st.columns(3)
        col1.metric("Top Stock", df.iloc[0]['name'], f"{df.iloc[0]['change']:.2f}%")
        col2.metric("Highest Volume", f"{df.iloc[0]['volume']:,}")
        col3.metric("Total Found", len(df))

        # --- Tabs for different views ---
        tab1, tab2 = st.tabs(["📊 Data Table", "📉 Visualization"])

        with tab1:
            st.dataframe(
                df.style.format({
                    "close": "${:.2f}",
                    "change": "{:.2f}%",
                    "volume": "{:,}",
                    "market_cap_basic": "${:,.0f}"
                }),
                use_container_width=True
            )

        with tab2:
            st.subheader(f"Top {rows_to_fetch} Stocks by {sort_option.title()}")
            # Simple Bar Chart based on user selection
            st.bar_chart(df.set_index('name')[sort_option])

    else:
        st.warning("No stocks found matching your criteria. Try lowering the filters.")

# Footer
st.markdown("---")
st.caption("Data source: TradingView (via tradingview-screener library). This is for educational purposes only.")