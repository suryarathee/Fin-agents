import React, { useState } from 'react';
import { ResponsiveContainer, Treemap, Tooltip } from 'recharts';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface SentimentData {
    symbol: string;
    marketCap: number;
    price: number;
    changePercent: number;
    change: number;
}

const COLORS = {
    brightGreen: '#1e8845ff', // > 2%
    green: '#16a34a',       // 0 - 2%
    red: '#931f1fff',         // -2 - 0%
    brightRed: '#b73a3aff',   // < -2%
    neutral: '#4b5563'       // 0%
};

const getColor = (percent: number) => {
    if (percent > 2) return COLORS.brightGreen;
    if (percent > 0) return COLORS.green;
    if (percent < -2) return COLORS.brightRed;
    if (percent < 0) return COLORS.red;
    return COLORS.neutral;
};

const CustomizedContent = (props: any) => {
    const { root, depth, x, y, width, height, index, payload, colors, rank, name, changePercent } = props;

    return (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                style={{
                    fill: getColor(changePercent),
                    stroke: '#1f2937',
                    strokeWidth: 2 / (depth + 1e-10),
                    strokeOpacity: 1,
                }}
            />
            {width > 30 && height > 30 && (
                <foreignObject x={x} y={y} width={width} height={height}>
                    <div className="h-full w-full flex flex-col items-center justify-center text-white p-1 overflow-hidden">
                        <span className="font-bold text-xs sm:text-sm truncate">{name}</span>
                        <span className="text-[10px] sm:text-xs font-mono">
                            {changePercent > 0 ? '+' : ''}{changePercent}%
                        </span>
                    </div>
                </foreignObject>
            )}
        </g>
    );
};

const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-gray-800 border border-gray-700 p-3 rounded shadow-xl text-xs">
                <p className="font-bold text-white mb-1">{data.symbol}</p>
                <p className="text-gray-400">Price: <span className="text-white">${data.price}</span></p>
                <p className={`flex items-center gap-1 ${data.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {data.changePercent >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                    {data.changePercent}% (${data.change})
                </p>
                <p className="text-gray-500 mt-1">Cap: ${(data.marketCap / 1e9).toFixed(1)}B</p>
            </div>
        );
    }
    return null;
};

interface SentimentTreemapProps {
    data: SentimentData[];
    isLoading: boolean;
}

export default function SentimentTreemap({ data, isLoading }: SentimentTreemapProps) {

    // Recharts Treemap requires a specific structure, usually a root node with children.
    // However, for flat data, we can just pass the array if we structure it right or map it.
    // Actually, Recharts Treemap input: data key should be array of children.

    // Let's wrap our flat list into a root object.
    const treeData = [
        {
            name: 'Market',
            children: data.map(item => ({
                name: item.symbol,
                size: item.marketCap, // Size determines area
                ...item
            }))
        }
    ];

    if (isLoading) {
        return (
            <div className="w-full h-64 bg-gray-800/50 rounded-xl animate-pulse flex items-center justify-center">
                <span className="text-gray-500">Loading Market Map...</span>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="w-full h-64 bg-gray-800/50 rounded-xl flex items-center justify-center">
                <span className="text-gray-500">No data available</span>
            </div>
        );
    }

    return (
        <div className="w-full h-[400px] bg-gray-900 rounded-xl border border-gray-800 p-4 font-sans">
            <h3 className="text-lg font-bold text-white mb-4">Market Sentiment Map</h3>
            <ResponsiveContainer width="100%" height="100%">
                <Treemap
                    data={treeData}
                    dataKey="size"
                    aspectRatio={4 / 3}
                    stroke="#fff"
                    fill="#8884d8"
                    content={<CustomizedContent />}
                >
                    <Tooltip content={<CustomTooltip />} />
                </Treemap>
            </ResponsiveContainer>
        </div>
    );
}
