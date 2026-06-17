interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export default function Card({ children, className = "", hover = false, onClick, style }: CardProps) {
  return (
    <div
      className={`rounded-2xl border ${
        hover
          ? "cursor-pointer transition-all duration-200 hover:border-white/[0.12] hover:bg-[#1c1c1c]"
          : ""
      } ${className}`}
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
        ...style,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
