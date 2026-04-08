"use client";

import {
  FileText,
  AlertTriangle,
  ClipboardList,
  CreditCard,
  Info,
} from "lucide-react";
import type { Notification } from "@/hooks/useNotifications";

const iconMap = {
  report_ready: <FileText className="w-4 h-4 text-blue-500" />,
  urgency_alert: <AlertTriangle className="w-4 h-4 text-red-500" />,
  outcome_reminder: <ClipboardList className="w-4 h-4 text-amber-500" />,
  subscription: <CreditCard className="w-4 h-4 text-emerald-500" />,
  system: <Info className="w-4 h-4 text-gray-400" />,
};

const ringMap = {
  report_ready: "bg-blue-50",
  urgency_alert: "bg-red-50",
  outcome_reminder: "bg-amber-50",
  subscription: "bg-emerald-50",
  system: "bg-gray-50",
};

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
}

export function NotificationItem({
  notification,
  onMarkRead,
}: NotificationItemProps) {
  const timeAgo = formatTimeAgo(notification.created_at);
  const type = notification.type in iconMap ? notification.type : "system";

  return (
    <button
      type="button"
      onClick={() => !notification.read && onMarkRead(notification.id)}
      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex gap-3 items-start ${
        !notification.read ? "bg-blue-50/40" : ""
      }`}
    >
      <span
        className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${ringMap[type]}`}
      >
        {iconMap[type]}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-snug ${!notification.read ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}
        >
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
            {notification.body}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1">{timeAgo}</p>
      </div>
      {!notification.read && (
        <span className="mt-2 flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full" />
      )}
    </button>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
