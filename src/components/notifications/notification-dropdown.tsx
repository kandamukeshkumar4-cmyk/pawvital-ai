"use client";

import Link from "next/link";
import { CheckCheck, Loader2 } from "lucide-react";
import type { Notification } from "@/hooks/useNotifications";
import { NotificationItem } from "./notification-item";

interface Props {
  notifications: Notification[];
  loading: boolean;
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
}

export function NotificationDropdown({
  notifications,
  loading,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onClose,
}: Props) {
  return (
    <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">
          Notifications
          {unreadCount > 0 && (
            <span className="ml-2 text-xs font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
              {unreadCount} new
            </span>
          )}
        </h3>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
        {loading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-gray-400">No notifications yet</p>
          </div>
        ) : (
          notifications.slice(0, 8).map((n) => (
            <NotificationItem key={n.id} notification={n} onMarkRead={onMarkRead} />
          ))
        )}
      </div>

      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
        <Link
          href="/notifications"
          onClick={onClose}
          className="block text-center text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          View all notifications →
        </Link>
      </div>
    </div>
  );
}
