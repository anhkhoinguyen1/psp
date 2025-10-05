import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, ChevronRight } from "lucide-react";

export default function RiskAlertRibbon({ highCount, moderateCount, lowCount, onViewHighRisk }) {
  return (
    <div className="sticky top-[88px] z-40 mb-6 p-4 rounded-2xl bg-gradient-to-r from-slate-800 to-slate-900 dark:from-slate-950 dark:to-gray-950 shadow-xl border border-slate-700 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-white/90">Active Patients:</span>
            {highCount > 0 && (
              <Badge className="bg-red-500 text-white px-3 py-1 rounded-lg text-sm font-bold">
                High: {highCount}
              </Badge>
            )}
            <span className="text-white/50">•</span>
            <Badge className="bg-amber-500 text-white px-3 py-1 rounded-lg text-sm font-bold">
              Moderate: {moderateCount}
            </Badge>
            <span className="text-white/50">•</span>
            <Badge className="bg-green-500 text-white px-3 py-1 rounded-lg text-sm font-bold">
              Low: {lowCount}
            </Badge>
          </div>
        </div>
        {highCount > 0 && (
          <Button
            onClick={onViewHighRisk}
            className="bg-red-500 hover:bg-red-600 text-white rounded-xl shadow-lg"
            size="sm"
          >
            View High-risk Patients
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}