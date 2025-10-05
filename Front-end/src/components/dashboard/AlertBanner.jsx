import React from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

export default function AlertBanner({ highRiskCount, moderateRiskCount }) {
  if (highRiskCount === 0 && moderateRiskCount === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 p-6 rounded-3xl bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 border border-red-200 dark:border-red-900/50 shadow-lg"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            {highRiskCount + moderateRiskCount} {highRiskCount + moderateRiskCount === 1 ? 'patient needs' : 'patients need'} attention
          </h3>
          <div className="flex flex-wrap gap-3">
            {highRiskCount > 0 && (
              <Badge className="bg-red-500 text-white px-4 py-1.5 rounded-xl text-sm font-medium">
                {highRiskCount} High Risk
              </Badge>
            )}
            {moderateRiskCount > 0 && (
              <Badge className="bg-amber-500 text-white px-4 py-1.5 rounded-xl text-sm font-medium">
                {moderateRiskCount} Moderate Risk
              </Badge>
            )}
          </div>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            Review vitals and consider immediate interventions for flagged patients.
          </p>
        </div>
      </div>
    </motion.div>
  );
}