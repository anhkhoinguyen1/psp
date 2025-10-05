import React, { useState, useEffect } from "react";
import { Patient, VitalReading } from "@/api/entities";
import { Skeleton } from "@/components/ui/skeleton";
import RiskAlertRibbon from "../components/dashboard/RiskAlertRibbon";
import PatientCard from "../components/dashboard/PatientCard";
import FilterControls from "../components/dashboard/FilterControls";
import { motion, AnimatePresence } from "framer-motion";

export default function Dashboard() {
  const [patients, setPatients] = useState([]);
  const [vitals, setVitals] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [sortBy, setSortBy] = useState("updated");

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    const fetchedPatients = await Patient.list();
    const fetchedVitals = await VitalReading.list("-created_date");
    
    const vitalsMap = {};
    fetchedVitals.forEach(vital => {
      if (!vitalsMap[vital.patient_id]) {
        vitalsMap[vital.patient_id] = vital;
      }
    });
    
    setPatients(fetchedPatients);
    setVitals(vitalsMap);
    setIsLoading(false);
  };

  const getFilteredAndSortedPatients = () => {
    let filtered = patients;
    
    if (activeFilter !== "all") {
      filtered = filtered.filter(p => p.risk_level === activeFilter);
    }
    
    // Risk-first sorting: Always pin High → Moderate → Low, then apply secondary sort within each risk bucket
    const riskOrder = { high: 0, moderate: 1, low: 2 };
    
    const sorted = [...filtered].sort((a, b) => {
      // First, sort by risk level
      const riskDiff = riskOrder[a.risk_level] - riskOrder[b.risk_level];
      if (riskDiff !== 0) return riskDiff;
      
      // Within same risk level, apply secondary sort
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      } else if (sortBy === "room") {
        return a.room.localeCompare(b.room);
      } else if (sortBy === "updated") {
        const aVital = vitals[a.id];
        const bVital = vitals[b.id];
        if (!aVital && !bVital) return 0;
        if (!aVital) return 1;
        if (!bVital) return -1;
        return new Date(bVital.created_date) - new Date(aVital.created_date);
      }
      return 0;
    });
    
    return sorted;
  };

  const getRiskCounts = () => {
    return {
      high: patients.filter(p => p.risk_level === "high").length,
      moderate: patients.filter(p => p.risk_level === "moderate").length,
      low: patients.filter(p => p.risk_level === "low").length
    };
  };

  const handleViewHighRisk = () => {
    setActiveFilter("high");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const filteredPatients = getFilteredAndSortedPatients();
  const riskCounts = getRiskCounts();

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
          Live Patients
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Monitoring {patients.length} post-operative patients in real-time
        </p>
      </motion.div>

      <RiskAlertRibbon 
        highCount={riskCounts.high}
        moderateCount={riskCounts.moderate}
        lowCount={riskCounts.low}
        onViewHighRisk={handleViewHighRisk}
      />

      <FilterControls
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array(8).fill(0).map((_, i) => (
            <div key={i} className="rounded-3xl border-2 border-gray-200 dark:border-gray-800 p-6">
              <Skeleton className="h-8 w-3/4 mb-4 rounded-xl" />
              <Skeleton className="h-4 w-1/2 mb-2 rounded-lg" />
              <Skeleton className="h-4 w-full mb-6 rounded-lg" />
              <Skeleton className="h-32 w-full mb-4 rounded-2xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : filteredPatients.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-20 px-6 rounded-3xl bg-white dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-700"
        >
          <div className="w-24 h-24 rounded-3xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-6">
            <span className="text-5xl">🏥</span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            No patients found
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-6">
            {activeFilter !== "all" 
              ? `No ${activeFilter} risk patients at this time`
              : "No patients are currently being monitored"
            }
          </p>
          {activeFilter !== "all" && (
            <button
              onClick={() => setActiveFilter("all")}
              className="text-teal-600 dark:text-teal-400 font-medium hover:underline"
            >
              View all patients →
            </button>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredPatients.map(patient => (
              <PatientCard
                key={patient.id}
                patient={patient}
                latestVital={vitals[patient.id]}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}