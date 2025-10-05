import React from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import TemperatureSparkline from "./TemperatureSparkline";

export default function VitalCard({ title, value, unit, icon: Icon, target, gradient, trend, sparklineData, showSparkline }) {
  const getTrendIcon = () => {
    if (trend > 0) return <TrendingUp className="w-4 h-4 text-red-500" />;
    if (trend < 0) return <TrendingDown className="w-4 h-4 text-blue-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  return (
    <Card className="rounded-3xl border-gray-200 dark:border-gray-800 shadow-md overflow-hidden hover:shadow-xl transition-all duration-300">
      <div className={`h-2 bg-gradient-to-r ${gradient}`} />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} bg-opacity-10 flex items-center justify-center`}>
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{target}</p>
            </div>
          </div>
          {trend !== undefined && getTrendIcon()}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-end justify-between">
          <div className="text-5xl font-bold text-gray-900 dark:text-white">
            {value}
            <span className="text-2xl ml-2 text-gray-500 dark:text-gray-400">{unit}</span>
          </div>
          {showSparkline && sparklineData && sparklineData.length > 0 && (
            <TemperatureSparkline data={sparklineData} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}