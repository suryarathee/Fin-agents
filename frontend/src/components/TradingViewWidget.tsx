import React, { useEffect, useRef, memo } from 'react';

export const TradingViewWidget = memo(({ symbol }: { symbol: string }) => {
    const container = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!container.current) return;

        // Clear previous script
        container.current.innerHTML = '';

        const script = document.createElement("script");
        script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
        script.type = "text/javascript";
        script.async = true;
        script.innerHTML = JSON.stringify({
            "autosize": true,
            "symbol": symbol,
            "interval": "D",
            "timezone": "Etc/UTC",
            "theme": "dark",
            "style": "1",
            "locale": "en",
            "enable_publishing": false,
            "allow_symbol_change": true,
            "calendar": false,
            "support_host": "https://www.tradingview.com"
        });

        container.current.appendChild(script);
    }, [symbol]);

    return (
        <div className="tradingview-widget-container" ref={container} style={{ height: "500px", width: "100%" }}>
            <div className="tradingview-widget-container__widget" style={{ height: "calc(100% - 32px)", width: "100%" }}></div>
        </div>
    );
});
