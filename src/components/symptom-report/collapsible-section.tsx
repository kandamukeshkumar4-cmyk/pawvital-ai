"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function CollapsibleSection({
  title,
  icon: Icon,
  iconColor,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${iconColor}`} />
          <h4 className="font-semibold text-gray-900 text-left">{title}</h4>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {open && <div className="p-4 pt-0 bg-white">{children}</div>}
    </div>
  );
}
