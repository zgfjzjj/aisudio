
import React, { useEffect, useState } from 'react';
import { Activity, Zap } from 'lucide-react';
import { UsageMetadata } from '../types';

interface QuotaMonitorProps {
  requestTimestamps: number[];
  lastUsage: UsageMetadata | null;
}

const QuotaMonitor: React.FC<QuotaMonitorProps> = ({ requestTimestamps, lastUsage }) => {
  const [rpm, setRpm] = useState(0);

  // Update RPM display every second to ensure it drops when requests get older
  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const oneMinuteAgo = now - 60 * 1000;
      const count = requestTimestamps.filter(t => t > oneMinuteAgo).length;
      setRpm(count);
    };
    
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [requestTimestamps]);

  // Determine RPM Color
  // Free tier is roughly 15 RPM. 
  let rpmColor = "text-green-400";
  if (rpm > 10) rpmColor = "text-yellow-400";
  if (rpm >= 15) rpmColor = "text-red-400 animate-pulse";

  return (
    <div className="flex items-center gap-4 bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-700">
      {/* RPM Monitor */}
      <div className="flex flex-col items-end" title="Requests Per Minute (每分钟请求数)">
         <div className="flex items-center gap-1.5 text-[10px] text-gray-400 uppercase tracking-wider font-bold">
            <Activity size={10} /> RPM
         </div>
         <div className={`text-sm font-mono font-bold leading-none ${rpmColor}`}>
            {rpm}<span className="text-[10px] text-gray-500 font-normal">/min</span>
         </div>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-gray-700"></div>

      {/* Token Usage */}
      <div className="flex flex-col items-end" title="Total tokens used in last request">
         <div className="flex items-center gap-1.5 text-[10px] text-gray-400 uppercase tracking-wider font-bold">
            <Zap size={10} /> Tokens
         </div>
         <div className="text-sm font-mono font-bold leading-none text-indigo-300">
            {lastUsage ? lastUsage.totalTokenCount.toLocaleString() : '0'}
         </div>
      </div>
    </div>
  );
};

export default QuotaMonitor;
