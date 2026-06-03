const MISSING_TABLE_CODE = "PGRST205";

function asErrorRecord(error: unknown) {
  return error && typeof error === "object"
    ? (error as Record<string, unknown>)
    : null;
}

export function isMissingNotificationsTableError(error: unknown) {
  const record = asErrorRecord(error);
  if (record?.code !== MISSING_TABLE_CODE) {
    return false;
  }

  const message =
    typeof record.message === "string" ? record.message.toLowerCase() : "";

  return (
    message.includes("schema cache") &&
    (message.includes("public.notifications") ||
      message.includes("public.notification_preferences"))
  );
}
