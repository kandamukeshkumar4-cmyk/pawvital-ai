"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";

export interface Notification {
  id: string;
  type:
    | "report_ready"
    | "urgency_alert"
    | "outcome_reminder"
    | "subscription"
    | "system";
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const notificationsRef = useRef<Notification[]>([]);
  const unreadCountRef = useRef(0);

  useEffect(() => {
    notificationsRef.current = notifications;
    unreadCountRef.current = unreadCount;
  }, [notifications, unreadCount]);

  const fetchNotifications = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const json = await res.json();
      const items: Notification[] = json.data ?? [];
      setNotifications(items);
      setUnreadCount(items.filter((n) => !n.read).length);
    } finally {
      setLoading(false);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    const previousNotifications = notificationsRef.current;
    const previousUnreadCount = unreadCountRef.current;
    const nextNotifications = previousNotifications.map((notification) =>
      notification.id === id ? { ...notification, read: true } : notification
    );

    setNotifications(nextNotifications);
    setUnreadCount(
      nextNotifications.filter((notification) => !notification.read).length
    );

    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });

      if (!response.ok) {
        throw new Error("Failed to mark notification as read");
      }
    } catch {
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const previousNotifications = notificationsRef.current;
    const previousUnreadCount = unreadCountRef.current;
    const nextNotifications = previousNotifications.map((notification) => ({
      ...notification,
      read: true,
    }));

    setNotifications(nextNotifications);
    setUnreadCount(0);

    try {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to mark notifications as read");
      }
    } catch {
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    refetch: fetchNotifications,
  };
}
