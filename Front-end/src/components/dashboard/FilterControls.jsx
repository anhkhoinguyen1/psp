import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter } from "lucide-react";

const RISK_FILTERS = [
  { value: "all", label: "All Patients" },
  { value: "high", label: "High Risk", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  { value: "moderate", label: "Moderate Risk", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "low", label: "Low Risk", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" }
];

export default function FilterControls({ activeFilter, onFilterChange, sortBy, onSortChange }) {
  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by Risk:</span>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {RISK_FILTERS.map(filter => (
          <Badge
            key={filter.value}
            className={`cursor-pointer px-4 py-2 rounded-xl transition-all duration-200 ${
              activeFilter === filter.value
                ? filter.color || "bg-teal-500 text-white"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
            onClick={() => onFilterChange(filter.value)}
          >
            {filter.label}
          </Badge>
        ))}
      </div>

      <div className="ml-auto flex gap-2">
        <Button
          variant={sortBy === "name" ? "default" : "outline"}
          size="sm"
          onClick={() => onSortChange("name")}
          className="rounded-xl"
        >
          Name A-Z
        </Button>
        <Button
          variant={sortBy === "updated" ? "default" : "outline"}
          size="sm"
          onClick={() => onSortChange("updated")}
          className="rounded-xl"
        >
          Recently Updated
        </Button>
        <Button
          variant={sortBy === "room" ? "default" : "outline"}
          size="sm"
          onClick={() => onSortChange("room")}
          className="rounded-xl"
        >
          Room
        </Button>
      </div>
    </div>
  );
}