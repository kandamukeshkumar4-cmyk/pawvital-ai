"use client";

interface HealthScoreCircleProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export default function HealthScoreCircle({ score, size = "md", showLabel = true }: HealthScoreCircleProps) {
  const sizes        = { sm: 80,  md: 140, lg: 200 };
  const strokeWidths = { sm: 6,   md: 10,  lg: 14  };
  const fontSizes    = { sm: "text-lg", md: "text-3xl", lg: "text-5xl" };

  const s           = sizes[size];
  const strokeWidth = strokeWidths[size];
  const radius      = (s - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset      = circumference - (score / 100) * circumference;

  const getColor = (v: number) => {
    if (v >= 80) return "#00c896";
    if (v >= 60) return "#f59e0b";
    if (v >= 40) return "#f97316";
    return "#f43f5e";
  };

  const getLabel = (v: number) => {
    if (v >= 80) return "Excellent";
    if (v >= 60) return "Good";
    if (v >= 40) return "Fair";
    return "Needs Attention";
  };

  const color = getColor(score);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative animate-ring-glow" style={{ width: s, height: s }}>
        {/* Outer glow ring */}
        <div
          className="absolute inset-0 rounded-full opacity-20 blur-md"
          style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}
        />
        <svg width={s} height={s} className="-rotate-90">
          {/* Track */}
          <circle
            cx={s / 2}
            cy={s / 2}
            r={radius}
            stroke="#1f1f1f"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress */}
          <circle
            cx={s / 2}
            cy={s / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-bold ${fontSizes[size]}`} style={{ color }}>
            {score}
          </span>
        </div>
      </div>
      {showLabel && (
        <span className="text-sm font-medium text-gray-400">{getLabel(score)}</span>
      )}
    </div>
  );
}
