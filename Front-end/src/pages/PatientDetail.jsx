import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Patient, VitalReading } from "@/api/entities";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, RefreshCw, Download, AlertCircle } from "lucide-react";
import { Thermometer, Volume2, Armchair } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { format } from "date-fns";

import VitalCard from "../components/patient/VitalCard";
import PressureMap from "../components/patient/PressureMap";
import PostureAnalysis from "../components/patient/PostureAnalysis";
import VitalsChart from "../components/patient/VitalsChart";

const RISK_COLORS = {
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  moderate: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
};

export default function PatientDetail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const patientId = searchParams.get("id");

  const [patient, setPatient] = useState(null);
  const [vitals, setVitals] = useState([]);
  const [latestVital, setLatestVital] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [timeAgo, setTimeAgo] = useState("");

  const checkAlerts = useCallback(() => {
    if (!latestVital) return;
    
    const newAlerts = [];

    if (latestVital.temperature > 37.5) {
      newAlerts.push({
        type: "warning",
        message: `Temperature elevated at ${latestVital.temperature.toFixed(1)}°C (target: 31-36°C)`
      });
    }

    if (latestVital.volume_level > 85) {
      newAlerts.push({
        type: "warning",
        message: `Volume level high at ${latestVital.volume_level}. Possible snoring detected.`
      });
    }

    if (latestVital.seating_level < 20) {
      newAlerts.push({
        type: "warning",
        message: `Patient in reclined position (${latestVital.seating_level}). Consider repositioning.`
      });
    }

    const highPressure = latestVital.pressure_map.some(v => v > 85);
    if (highPressure) {
      newAlerts.push({
        type: "danger",
        message: "Critical pressure detected on one or more sensors (>85). Immediate repositioning recommended."
      });
    }

    setAlerts(newAlerts);
  }, [latestVital]);

  const loadData = useCallback(async () => {
    const patientData = await Patient.list();
    const currentPatient = patientData.find(p => p.id === patientId);
    
    if (!currentPatient) {
      navigate(createPageUrl("Dashboard"));
      return;
    }

    const vitalsData = await VitalReading.filter({ patient_id: patientId }, "-created_date", 50);
    
    setPatient(currentPatient);
    setVitals(vitalsData);
    setLatestVital(vitalsData[0] || null);
    setIsLoading(false);
  }, [patientId, navigate]);

  useEffect(() => {
    if (!patientId) {
      navigate(createPageUrl("Dashboard"));
      return;
    }
    loadData();
  }, [patientId, navigate, loadData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  useEffect(() => {
    checkAlerts();
  }, [checkAlerts]);

  useEffect(() => {
    if (!latestVital) return;
    
    const updateTimeAgo = () => {
      const time = formatDistanceToNow(new Date(latestVital.timestamp || latestVital.created_date), { 
        addSuffix: false 
      });
      setTimeAgo(time);
    };
    
    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 10000);
    return () => clearInterval(interval);
  }, [latestVital]);

  const handleExport = () => {
    const csv = [
      ["Timestamp", "Temperature", "Volume", "Seating", ...Array(8).fill(0).map((_, i) => `Pressure ${i + 1}`)].join(","),
      ...vitals.map(v => [
        format(new Date(v.timestamp || v.created_date), "yyyy-MM-dd HH:mm:ss"),
        v.temperature,
        v.volume_level,
        v.seating_level,
        ...v.pressure_map
      ].join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patient-${patient.name}-vitals-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const prepareChartData = () => {
    return vitals.slice(0, 30).reverse().map(v => ({
      time: format(new Date(v.timestamp || v.created_date), "HH:mm"),
      temperature: v.temperature,
      volume: v.volume_level,
      seating: v.seating_level,
      pressure1: v.pressure_map[0],
      pressure2: v.pressure_map[1],
      pressure3: v.pressure_map[2],
      pressure4: v.pressure_map[3],
      pressure5: v.pressure_map[4],
      pressure6: v.pressure_map[5],
      pressure7: v.pressure_map[6],
      pressure8: v.pressure_map[7]
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-1/2 rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-52 rounded-3xl" />
          <Skeleton className="h-52 rounded-3xl" />
          <Skeleton className="h-52 rounded-3xl" />
        </div>
        <Skeleton className="h-96 rounded-3xl" />
      </div>
    );
  }

  if (!patient || !latestVital) {
    return (
      <div className="text-center py-20 px-6 rounded-3xl bg-white dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-700">
        <div className="w-20 h-20 rounded-3xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
          <span className="text-4xl">⚠️</span>
        </div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
          Patient data not found
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Unable to load patient information
        </p>
        <Button onClick={() => navigate(createPageUrl("Dashboard"))} className="rounded-xl">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const chartData = prepareChartData();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(createPageUrl("Dashboard"))}
            className="rounded-2xl w-12 h-12 flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
                {patient.name}
              </h1>
              <Badge variant="outline" className="rounded-lg border-2">
                Room {patient.room}
              </Badge>
              <Badge className={`rounded-lg font-bold ${RISK_COLORS[patient.risk_level]}`}>
                {patient.risk_level.toUpperCase()} RISK
              </Badge>
            </div>
            <p className="text-base md:text-lg text-gray-700 dark:text-gray-300 font-medium mb-1">
              {patient.diagnosis}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {patient.age} years • {patient.height}cm • {patient.weight}kg
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-medium">
              Updated {timeAgo} ago
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="rounded-2xl"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? "animate-spin" : ""}`} />
            Auto {autoRefresh ? "On" : "Off"}
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            className="rounded-2xl"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert, index) => (
            <Alert 
              key={index}
              className={`rounded-2xl border-2 ${
                alert.type === "danger" 
                  ? "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-900/50"
                  : "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-900/50"
              }`}
            >
              <AlertCircle className={`h-5 w-5 ${
                alert.type === "danger" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
              }`} />
              <AlertDescription className={`font-medium ${
                alert.type === "danger" 
                  ? "text-red-800 dark:text-red-300"
                  : "text-amber-800 dark:text-amber-300"
              }`}>
                {alert.message}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Vital Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <VitalCard
          title="Temperature"
          value={latestVital.temperature.toFixed(1)}
          unit="°C"
          icon={Thermometer}
          target="Target: 31-36°C"
          gradient="from-blue-500 to-blue-600"
          trend={latestVital.temperature - 36.5}
          sparklineData={vitals}
          showSparkline={true}
        />
        <VitalCard
          title="Volume Level"
          value={latestVital.volume_level}
          unit="/100"
          icon={Volume2}
          target="Alert if >85"
          gradient="from-purple-500 to-purple-600"
        />
        <VitalCard
          title="Seating Level"
          value={latestVital.seating_level}
          unit="/100"
          icon={Armchair}
          target="0=Reclined, 100=Upright"
          gradient="from-teal-500 to-teal-600"
        />
      </div>

      {/* Pressure Map & Posture */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PressureMap pressureData={latestVital.pressure_map} />
        <PostureAnalysis postureFlags={latestVital.posture_flags} />
      </div>

      {/* Charts */}
      <div className="space-y-6">
        <VitalsChart
          title="Temperature Over Time"
          data={chartData}
          dataKeys={["temperature"]}
          colors={["#3b82f6"]}
          yAxisLabel="Temperature (°C)"
        />
        
        <VitalsChart
          title="Volume & Seating Levels"
          data={chartData}
          dataKeys={["volume", "seating"]}
          colors={["#a855f7", "#14b8a6"]}
          yAxisLabel="Level (0-100)"
        />

        <VitalsChart
          title="Pressure Sensors (All 8 Points)"
          data={chartData}
          dataKeys={["pressure1", "pressure2", "pressure3", "pressure4", "pressure5", "pressure6", "pressure7", "pressure8"]}
          colors={["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"]}
          yAxisLabel="Pressure (0-100)"
        />
      </div>
    </div>
  );
}