"use client";

interface HealthScoreCircleProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export default function HealthScoreCircle({ score, size = "md", showLabel = true }: HealthScoreCircleProps) {
  const sizes = { sm: 80, md: 140, lg: 200 };
  const strokeWidths = { sm: 6, md: 10, lg: 14 };
  const fontSizes = { sm: "text-lg", md: "text-3xl", lg: "text-5xl" };

  const s = sizes[size];
  const strokeWidth = strokeWidths[size];
  const radius = (s - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  const getColor = (score: number) => {
    if (score >= 80) return "#10b981";
    if (score >= 60) return "#f59e0b";
    if (score >= 40) return "#f97316";
    return "#ef4444";
  };

  const getLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Needs Attention";
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: s, height: s }}>
        <svg width={s} height={s} className="-rotate-90">
          <circle
            cx={s / 2}
            cy={s / 2}
            r={radius}
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <circle
            cx={s / 2}
            cy={s / 2}
            r={radius}
            stroke={getColor(score)}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-bold ${fontSizes[size]}`} style={{ color: getColor(score) }}>
            {score}
          </span>
        </div>
      </div>
      {showLabel && (
        <span className="text-sm font-medium text-gray-600">{getLabel(score)}</span>
      )}
    </div>
  );
}
