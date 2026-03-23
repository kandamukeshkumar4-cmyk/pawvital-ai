interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export default function Card({ children, className = "", hover = false, onClick }: CardProps) {
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-200 shadow-sm ${hover ? "hover:shadow-md hover:border-gray-300 transition-all duration-200 cursor-pointer" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
