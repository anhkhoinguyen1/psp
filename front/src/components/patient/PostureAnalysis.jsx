import React from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, User } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const POSTURE_FLAGS = [
  { key: "slouch", label: "Slouch Detected", icon: "🔽" },
  { key: "tilt_left", label: "Tilt Left", icon: "↖️" },
  { key: "tilt_right", label: "Tilt Right", icon: "↗️" },
  { key: "forward_head", label: "Forward Head", icon: "➡️" }
];

export default function PostureAnalysis({ postureFlags }) {
  const activeFlags = POSTURE_FLAGS.filter(flag => postureFlags?.[flag.key]);
  const hasIssues = activeFlags.length > 0;

  return (
    <Card className="rounded-3xl border-gray-200 dark:border-gray-800 shadow-md">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center">
            <User className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Posture Analysis</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Real-time position monitoring</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasIssues ? (
          <>
            <Alert className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-800 dark:text-amber-300">
                Posture concerns detected. Consider repositioning the patient.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-3">
              {POSTURE_FLAGS.map(flag => (
                <Badge
                  key={flag.key}
                  className={`justify-center py-3 px-4 rounded-2xl text-sm font-medium ${
                    postureFlags?.[flag.key]
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                      : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600"
                  }`}
                >
                  <span className="mr-2">{flag.icon}</span>
                  {flag.label}
                </Badge>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-lg font-medium text-gray-900 dark:text-white mb-1">
              Posture Normal
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No concerning posture flags detected
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}