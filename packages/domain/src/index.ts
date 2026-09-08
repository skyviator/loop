export type AppRole = "super_admin" | "school_admin" | "teacher" | "guardian";

export type FeatureKey =
  | "attendance"
  | "timetable"
  | "meals"
  | "bottle"
  | "water"
  | "sleep"
  | "toilet"
  | "nappy"
  | "mood"
  | "activities"
  | "notes"
  | "photos"
  | "short_video"
  | "messaging"
  | "announcements"
  | "calendar"
  | "incidents";

export const deferredFeatures = new Set<FeatureKey>([
  "photos",
  "short_video",
  "messaging",
  "announcements",
]);

export function availableCoreFeatures(enabled: readonly FeatureKey[]) {
  return enabled.filter((feature) => !deferredFeatures.has(feature));
}

export function routeForRole(role: AppRole | null) {
  switch (role) {
    case "super_admin":
      return "/platform";
    case "school_admin":
      return "/school";
    case "teacher":
      return "/teacher";
    case "guardian":
      return "/parent";
    default:
      return "/access";
  }
}

export type TimetableStatus =
  | "upcoming"
  | "now"
  | "confirmed"
  | "ended_unconfirmed"
  | "absent";

type TimetableStatusInput = {
  now: Date;
  serviceDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  attendance: "expected" | "present" | "absent" | "excused" | null;
  confirmed: boolean;
};

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minute: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function minuteOfDay(time: string) {
  const [hour = "0", minute = "0"] = time.split(":");
  return Number(hour) * 60 + Number(minute);
}

export function deriveTimetableStatus(input: TimetableStatusInput): TimetableStatus {
  if (input.attendance === "absent" || input.attendance === "excused") return "absent";
  if (input.confirmed) return "confirmed";

  const current = zonedParts(input.now, input.timezone);
  if (current.date < input.serviceDate) return "upcoming";
  if (current.date > input.serviceDate) return "ended_unconfirmed";

  const start = minuteOfDay(input.startTime);
  const end = minuteOfDay(input.endTime);
  if (current.minute < start) return "upcoming";
  if (current.minute < end) return "now";
  return "ended_unconfirmed";
}

export type TimelineItem = {
  id: string;
  occurredAt: string;
  kind: "attendance" | "timetable" | "care";
  title: string;
  detail?: string;
  status?: TimetableStatus;
};

export function mergeTimeline(...groups: readonly TimelineItem[][]) {
  return groups.flat().sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

export type BulkCareChild = { id: string; present: boolean };
export type BulkCareDraft<T> = { childId: string; value: T };

export function buildBulkCareDrafts<T>(
  children: readonly BulkCareChild[],
  defaultValue: T,
  exceptions: ReadonlyMap<string, T> = new Map(),
) {
  return children
    .filter((child) => child.present)
    .map((child): BulkCareDraft<T> => ({
      childId: child.id,
      value: exceptions.get(child.id) ?? defaultValue,
    }));
}
