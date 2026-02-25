import { useEffect, useState } from 'react';
import { Activity, Globe, ShieldCheck, Database, Server } from 'lucide-react';

export default function LoadingScreen({ onComplete }: { onComplete?: () => void }) {
    const [progress, setProgress] = useState(0);
    const [loadingText, setLoadingText] = useState('Initializing Secure Connection...');

    useEffect(() => {
        const texts = [
            'Initializing Secure Connection...',
            'Connecting to Global Exchanges...',
            'Fetching Real-time Market Data...',
            'Calibrating Analytics Engine...',
            'Syncing User Preferences...'
        ];

        let currentTextIndex = 0;

        // Progress interval
        const interval = setInterval(() => {
            setProgress(prev => {
                // drastically increase increment to make it fast
                const increment = Math.random() * 30 + 10;
                const newProgress = Math.min(prev + increment, 100);

                // Update text based on progress
                if (newProgress < 30) currentTextIndex = 0;
                else if (newProgress < 50) currentTextIndex = 1;
                else if (newProgress < 70) currentTextIndex = 2;
                else if (newProgress < 90) currentTextIndex = 3;
                else currentTextIndex = 4;

                setLoadingText(texts[currentTextIndex]);

                if (newProgress >= 100) {
                    clearInterval(interval);
                    setTimeout(() => {
                        if (onComplete) onComplete();
                    }, 100); // reduced from 500
                    return 100;
                }
                return newProgress;
            });
        }, 30); // reduced from 150

        return () => clearInterval(interval);
    }, [onComplete]);

    return (
        <div className="fixed inset-0 bg-[#0B1120] z-[100] flex flex-col items-center justify-center font-sans overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-[#0B1120] to-[#0B1120]"></div>
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>

            <div className="relative z-10 flex flex-col items-center max-w-md w-full px-6">
                {/* Logo Animation */}
                <div className="mb-12 relative">
                    <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20 animate-pulse rounded-full"></div>
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-5 rounded-2xl shadow-2xl relative shadow-blue-500/20 ring-1 ring-white/10">
                        <Globe className="w-12 h-12 text-white animate-spin-slow" />
                    </div>

                    {/* Decorative bits */}
                    <div className="absolute -right-4 -top-4">
                        <Activity className="w-6 h-6 text-blue-400 animate-bounce" style={{ animationDuration: '2s' }} />
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-white to-blue-400 tracking-tight mb-2">
                    Fin-agents
                </h1>


                {/* Progress Bar Container */}
                <div className="w-full bg-gray-800/50 rounded-full h-1.5 mb-4 overflow-hidden ring-1 ring-white/5 backdrop-blur-sm">
                    <div
                        className="h-full bg-gradient-to-r from-blue-600 via-blue-400 to-indigo-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                        style={{ width: `${progress}%` }}
                    >
                        <div className="w-full h-full bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] animate-[progress-bar-stripes_1s_linear_infinite]"></div>
                    </div>
                </div>

                {/* Status Text and Percentage */}
                <div className="flex justify-between w-full text-xs font-mono">
                    <span className="text-blue-400 font-bold">{Math.round(progress)}%</span>
                </div>

                {/* Footer Icons */}
                <div className="mt-16 flex gap-6 opacity-40 grayscale transition-all duration-500 hover:grayscale-0 hover:opacity-80">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-green-400" />
                        <span className="text-[10px] text-gray-400">SECURE</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-purple-400" />
                        <span className="text-[10px] text-gray-400">ENCRYPTED</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-orange-400" />
                        <span className="text-[10px] text-gray-400">CONNECTED</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
