
import React from "react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Thermometer, Volume2, Armchair, Grid3x3, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatDistanceToNow } from "date-fns";

const RISK_COLORS = {
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300 dark:border-green-800",
  moderate: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300 dark:border-amber-800",
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-300 dark:border-red-800"
};

const PRESSURE_LABELS = ["Head", "Shoulders", "Upper Back", "Lower Back", "Seat", "Thighs", "Calves", "Heels"];

export default function PatientCard({ patient, latestVital }) {
  const [timeAgo, setTimeAgo] = React.useState("");

  React.useEffect(() => {
    if (!latestVital) return;
    
    const updateTimeAgo = () => {
      const time = formatDistanceToNow(new Date(latestVital.timestamp || latestVital.created_date), { 
        addSuffix: false,
        includeSeconds: true 
      });
      setTimeAgo(time);
    };
    
    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [latestVital]);

  const getTempTrend = () => {
    if (!latestVital) return null;
    if (latestVital.temperature > 37) return <TrendingUp className="w-3 h-3 text-red-500" />;
    if (latestVital.temperature < 35) return <TrendingDown className="w-3 h-3 text-blue-500" />;
    return null;
  };

  const getPressureColor = (value) => {
    if (value >= 85) return "bg-red-500";
    if (value >= 70) return "bg-amber-500";
    return "bg-green-500";
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={`h-full rounded-3xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border-2 ${RISK_COLORS[patient.risk_level]}`}>
        {/* Header */}
        <CardHeader className="pb-4 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                {patient.name}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="rounded-lg text-xs font-medium border-gray-300 dark:border-gray-700 bg-gray-800 text-white dark:bg-gray-700">
                  Room {patient.room}
                </Badge>
                <Badge className={`rounded-lg text-xs font-bold ${RISK_COLORS[patient.risk_level]}`}>
                  {patient.risk_level.toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 font-medium mb-2">
            {patient.diagnosis}
          </p>
          <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400 font-medium">
            <span>{patient.age} years</span>
            <span>•</span>
            <span>{patient.height} cm</span>
            <span>•</span>
            <span>{patient.weight} kg</span>
          </div>
        </CardHeader>

        {/* Vitals */}
        <CardContent className="pt-6 pb-4">
          {latestVital ? (
            <div className="space-y-4">
              {/* Temperature */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Thermometer className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">Temperature</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      {latestVital.temperature.toFixed(1)}°C
                      {getTempTrend()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Volume & Seating */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Volume2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Volume</p>
                  </div>
                  <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                    <div 
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-full transition-all duration-500"
                      style={{ width: `${latestVital.volume_level}%` }}
                    />
                  </div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {latestVital.volume_level}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Armchair className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Seating</p>
                  </div>
                  <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                    <div 
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-teal-500 to-teal-600 rounded-full transition-all duration-500"
                      style={{ width: `${latestVital.seating_level}%` }}
                    />
                  </div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {latestVital.seating_level}
                  </p>
                </div>
              </div>

              {/* Pressure Map Mini */}
              <div className="p-4 rounded-2xl bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/30">
                <div className="flex items-center gap-2 mb-3">
                  <Grid3x3 className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Pressure Map (8 sensors)</p>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {latestVital.pressure_map.map((value, index) => (
                    <div 
                      key={index}
                      className="relative aspect-square rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600"
                      title={`${PRESSURE_LABELS[index]}: ${value}`}
                    >
                      <div 
                        className={`absolute inset-0 transition-all duration-500 ${getPressureColor(value)}`}
                        style={{ opacity: 0.2 + (value / 100) * 0.8 }}
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xs font-bold text-gray-900 dark:text-white mb-0.5">
                          {value}
                        </span>
                        <span className="text-[8px] font-medium text-gray-600 dark:text-gray-400">
                          {index + 1}
                        </span>
                      </div>
                      {/* Threshold indicator */}
                      {value >= 70 && (
                        <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-white shadow-md" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 px-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50">
              <p className="text-sm text-gray-500 dark:text-gray-400">No vital readings available</p>
            </div>
          )}
        </CardContent>

        {/* Footer */}
        <CardFooter className="flex flex-col gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between w-full">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              {latestVital 
                ? `Updated ${timeAgo} ago`
                : "No data"
              }
            </p>
            <Link to={createPageUrl(`PatientDetail?id=${patient.id}`)}>
              <Button 
                size="sm" 
                className="rounded-xl bg-teal-500 hover:bg-teal-600 text-white shadow-md hover:shadow-lg transition-all"
              >
                View Details
              </Button>
            </Link>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 w-full justify-center">
            Tap for live telemetry
            <ArrowRight className="w-3 h-3" />
          </p>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
