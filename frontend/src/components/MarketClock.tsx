import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface MarketInfo {
    id: string;
    name: string;
    shortName: string;
    timezone: string;
    flag: string;
    openHour: number;
    openMinute: number;
    closeHour: number;
    closeMinute: number;
}

const MARKETS: MarketInfo[] = [
    {
        id: 'nyse',
        name: 'New York',
        shortName: 'NYSE',
        timezone: 'America/New_York',
        flag: '🇺🇸',
        openHour: 9,
        openMinute: 30,
        closeHour: 16,
        closeMinute: 0,
    },
    {
        id: 'nse',
        name: 'Mumbai',
        shortName: 'NSE',
        timezone: 'Asia/Kolkata',
        flag: '🇮🇳',
        openHour: 9,
        openMinute: 15,
        closeHour: 15,
        closeMinute: 30,
    },
    {
        id: 'lse',
        name: 'London',
        shortName: 'LSE',
        timezone: 'Europe/London',
        flag: '🇬🇧',
        openHour: 8,
        openMinute: 0,
        closeHour: 16,
        closeMinute: 30,
    },
    {
        id: 'tse',
        name: 'Tokyo',
        shortName: 'TSE',
        timezone: 'Asia/Tokyo',
        flag: '🇯🇵',
        openHour: 9,
        openMinute: 0,
        closeHour: 15,
        closeMinute: 0,
    },
];

const MarketClock: React.FC = () => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const getMarketStatus = (market: MarketInfo, now: Date) => {
        // Create a date object for the specific timezone
        const options: Intl.DateTimeFormatOptions = {
            timeZone: market.timezone,
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: false,
            weekday: 'short'
        };

        // We need to parse the parts to get specific hours/minutes in that timezone
        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(now);
        const part = (type: string) => parts.find(p => p.type === type)?.value;

        const hour = parseInt(part('hour') || '0', 10);
        const minute = parseInt(part('minute') || '0', 10);
        const weekday = part('weekday');

        // Simple weekend check (Sat, Sun)
        if (weekday === 'Sat' || weekday === 'Sun') {
            return { isOpen: false, status: 'Closed', subStatus: 'Weekend' };
        }

        const currentMinutes = hour * 60 + minute;
        const openMinutes = market.openHour * 60 + market.openMinute;
        const closeMinutes = market.closeHour * 60 + market.closeMinute;

        if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
            return { isOpen: true, status: 'Open', subStatus: 'Trading' };
        } else {
            return { isOpen: false, status: 'Closed', subStatus: '' };
        }
    };

    const getMarketSchedule = (market: MarketInfo, now: Date) => {
        const status = getMarketStatus(market, now);

        if (status.isOpen) {
            const closeTime = new Date(now);
            closeTime.setUTCHours(0, 0, 0, 0); // Reset to avoid issues, we need market-relative logic which is complex with just Date
            // Simplification: Display "Open Now" or "Closes at [Time]"
            // For simplicity in this prompt context ("tell me date and time it opens"),
            // if it's already open, we can say "Opened Today at [OpenTime]".
            // We'd need to shift 'now' to market time, set h/m, shift back. 
            // That's tricky without a library like luxon/date-fns-tz.
            // Fallback: Just basic static strings for open/close times in tooltip.
            const openStr = `${market.openHour > 12 ? market.openHour - 12 : market.openHour}:${market.openMinute.toString().padStart(2, '0')} ${market.openHour >= 12 ? 'PM' : 'AM'}`;
            return `Opened Today at ${openStr}`;
        } else {
            // It is closed. When does it open?
            // If Weekday (Mon-Fri) and current time < open time -> Opens Today at ...
            // If Weekday and current time > close time -> Opens Tomorrow at ...
            // If Fri > close time or Sat/Sun -> Opens Monday at ...

            // Getting accurate "Next Open" day without big library:
            // Let's assume standard Mon-Fri logic.
            const marketTimeParts = new Intl.DateTimeFormat('en-US', {
                timeZone: market.timezone,
                weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false
            }).formatToParts(now);

            const getPart = (type: string) => marketTimeParts.find(p => p.type === type)?.value;
            const hour = parseInt(getPart('hour') || '0', 10);
            const minute = parseInt(getPart('minute') || '0', 10);
            const weekday = getPart('weekday');

            const currentMinutes = hour * 60 + minute;
            const openMinutes = market.openHour * 60 + market.openMinute;

            const openTimeStr = `${market.openHour > 12 ? market.openHour - 12 : market.openHour}:${market.openMinute.toString().padStart(2, '0')} ${market.openHour >= 12 ? 'PM' : 'AM'}`;

            if (['Sat', 'Sun'].includes(weekday!)) {
                return `Opens Mon at ${openTimeStr}`;
            }

            if (currentMinutes < openMinutes) {
                return `Opens Today at ${openTimeStr}`;
            }

            // If it's Friday and closed (after hours), opens Monday
            if (weekday === 'Fri' && currentMinutes >= openMinutes) {
                return `Opens Mon at ${openTimeStr}`;
            }

            // Otherwise (Mon-Thu after close), opens Tomorrow
            return `Opens Tomorrow at ${openTimeStr}`;
        }
    };

    return (
        <div className="bg-gray-950 border-b border-gray-800 p-1 md:p-2 shadow-lg sticky top-0 z-50 transition-all duration-300">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-2">
                {MARKETS.map((market) => {
                    const status = getMarketStatus(market, time);
                    const scheduleText = getMarketSchedule(market, time);
                    const timeString = new Intl.DateTimeFormat('en-US', {
                        timeZone: market.timezone,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true
                    }).format(time);

                    const glowClass = status.isOpen ? 'text-green-400 text-shadow-glow-green' : 'text-red-500/80 text-shadow-glow-red';
                    const borderClass = status.isOpen ? 'border-green-500/20 bg-green-950/20' : 'border-red-900/20 bg-red-950/10';

                    return (
                        <div key={market.id} className={`rounded p-1.5 md:p-2 border ${borderClass} flex items-center justify-between relative overflow-visible group transition-all duration-300`}>
                            {/* Tooltip */}
                            <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-200 top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-gray-800 border border-gray-700 text-white text-[10px] rounded shadow-xl whitespace-nowrap z-50 pointer-events-none">
                                {scheduleText}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-1 border-4 border-transparent border-b-gray-800"></div>
                            </div>

                            <div className="flex flex-col">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="text-xs md:text-sm opacity-80">{market.flag}</span>
                                    <span className="text-[10px] md:text-xs font-bold text-gray-400 tracking-wider font-led">{market.shortName}</span>
                                </div>
                                <div className={`text-[9px] md:text-[10px] font-bold uppercase tracking-wider ${status.isOpen ? 'text-green-500' : 'text-red-500'}`}>
                                    {status.status}
                                </div>
                            </div>

                            <div className={`text-sm md:text-lg lg:text-xl font-led font-bold tracking-widest ${glowClass} tabular-nums`}>
                                {timeString}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default MarketClock;
