import React from "react";

export default function TemperatureSparkline({ data }) {
  const values = data.slice(0, 20).reverse().map(d => d.temperature);
  const min = Math.min(...values, 35);
  const max = Math.max(...values, 38);
  const range = max - min || 1;
  
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 100;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 100 30" className="w-24 h-8" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-blue-500"
      />
    </svg>
  );
}