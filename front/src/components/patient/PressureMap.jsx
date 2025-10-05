import React from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Grid3x3, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PRESSURE_LABELS = [
  "Head", "Shoulders", "Upper Back", "Lower Back",
  "Seat", "Thighs", "Calves", "Heels"
];

export default function PressureMap({ pressureData }) {
  const getIntensityColor = (value) => {
    if (value > 85) return "from-red-500 to-red-600";
    if (value > 70) return "from-amber-500 to-amber-600";
    return "from-green-500 to-green-600";
  };

  const hasHighPressure = pressureData.some(v => v > 85);
  const hasModeratePress = pressureData.some(v => v > 70 && v <= 85);

  return (
    <Card className="rounded-3xl border-gray-200 dark:border-gray-800 shadow-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
              <Grid3x3 className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Pressure Distribution</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Real-time sensor readings (0-100)</p>
            </div>
          </div>
          {hasHighPressure && (
            <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 px-3 py-1.5 rounded-xl border border-red-300">
              <AlertCircle className="w-3 h-3 mr-1" />
              Critical Pressure
            </Badge>
          )}
          {!hasHighPressure && hasModeratePress && (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-3 py-1.5 rounded-xl border border-amber-300">
              <AlertCircle className="w-3 h-3 mr-1" />
              Elevated
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4 mb-6">
          {pressureData.map((value, index) => (
            <div key={index} className="flex flex-col gap-2">
              <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 shadow-lg border-2 border-gray-200 dark:border-gray-700">
                <div 
                  className={`absolute inset-0 bg-gradient-to-br ${getIntensityColor(value)} transition-all duration-700`}
                  style={{ opacity: 0.3 + (value / 100) * 0.7 }}
                />
                {/* Threshold lines */}
                {value >= 70 && (
                  <div className="absolute top-2 right-2 flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-white shadow-md" />
                    {value >= 85 && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white shadow-md" />
                    )}
                  </div>
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white mb-1">
                    {value}
                  </span>
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-400 bg-white/50 dark:bg-black/50 px-2 py-0.5 rounded-full">
                    #{index + 1}
                  </span>
                </div>
              </div>
              <p className="text-xs text-center font-medium text-gray-600 dark:text-gray-400">
                {PRESSURE_LABELS[index]}
              </p>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-950/20">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-green-600 shadow-md" />
            <div className="text-center">
              <p className="text-xs font-bold text-gray-900 dark:text-white">Normal</p>
              <p className="text-[10px] text-gray-600 dark:text-gray-400">≤ 70</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 shadow-md" />
            <div className="text-center">
              <p className="text-xs font-bold text-gray-900 dark:text-white">Elevated</p>
              <p className="text-[10px] text-gray-600 dark:text-gray-400">71-85</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/20">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-600 shadow-md" />
            <div className="text-center">
              <p className="text-xs font-bold text-gray-900 dark:text-white">Critical</p>
              <p className="text-[10px] text-gray-600 dark:text-gray-400">&gt; 85</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}