export const NOTIFICATION_LOCALES = ["ar", "en"] as const;
export type NotificationLocale = (typeof NOTIFICATION_LOCALES)[number];
export const NOTIFICATION_CHANNELS = ["IN_APP", "EMAIL", "WHATSAPP"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** These are the only values a template may interpolate. */
export const NOTIFICATION_VARIABLES = [
  "recipientName",
  "organizationName",
  "targetLabel",
  "dueDate",
  "amount",
  "currency",
  "actionUrl",
] as const;
export type NotificationVariable = (typeof NOTIFICATION_VARIABLES)[number];

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
const KEY_PATTERN = /^[a-z][a-z0-9._-]{0,99}$/;

export class NotificationTemplateValidationError extends Error {
  constructor(reason: string) {
    super(`Invalid notification template: ${reason}`);
    this.name = "NotificationTemplateValidationError";
  }
}

export function validateTemplateKey(value: string): void {
  if (typeof value !== "string" || !KEY_PATTERN.test(value))
    throw new NotificationTemplateValidationError("template key is invalid");
}

export function validateLocale(
  value: string,
): asserts value is NotificationLocale {
  if (!NOTIFICATION_LOCALES.includes(value as NotificationLocale))
    throw new NotificationTemplateValidationError("locale must be ar or en");
}

export function validateChannel(
  value: string,
): asserts value is NotificationChannel {
  if (!NOTIFICATION_CHANNELS.includes(value as NotificationChannel))
    throw new NotificationTemplateValidationError("channel is not supported");
}

export function validateTemplateContent(
  subject: string | null | undefined,
  body: string,
): void {
  if (
    typeof body !== "string" ||
    body.trim().length === 0 ||
    body.length > 4000
  )
    throw new NotificationTemplateValidationError(
      "body must be 1..4000 characters",
    );
  if (subject !== null && subject !== undefined && subject.length > 500)
    throw new NotificationTemplateValidationError(
      "subject is at most 500 characters",
    );
  for (const source of [subject ?? "", body]) {
    for (const match of source.matchAll(VARIABLE_PATTERN)) {
      if (
        !(NOTIFICATION_VARIABLES as readonly string[]).includes(
          match[1] as string,
        )
      )
        throw new NotificationTemplateValidationError(
          `placeholder ${match[1]} is not allowlisted`,
        );
    }
  }
}

export function renderTemplate(
  subject: string | null,
  body: string,
  variables: Readonly<Record<string, string>>,
): Readonly<{ subject: string | null; body: string }> {
  validateTemplateContent(subject, body);
  const render = (source: string): string =>
    source.replace(VARIABLE_PATTERN, (_whole, name: string) => {
      const value = variables[name];
      if (value === undefined)
        throw new NotificationTemplateValidationError(
          `missing value for placeholder ${name}`,
        );
      return value;
    });
  return {
    subject: subject === null ? null : render(subject),
    body: render(body),
  };
}

function minutes(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new NotificationTemplateValidationError("quiet hour must be HH:MM");
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

/** Uses the instant's local parts, so DST transitions are evaluated safely. */
export function isWithinQuietHours(input: {
  now: Date;
  timeZone: string;
  quietStart: string;
  quietEnd: string;
}): boolean {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: input.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(input.now);
  } catch {
    throw new NotificationTemplateValidationError(
      "invalid organization timezone",
    );
  }
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const current = hour * 60 + minute;
  const start = minutes(input.quietStart);
  const end = minutes(input.quietEnd);
  if (start === end) return true;
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

export function templateFallback(
  templateKey: string,
  locale: NotificationLocale,
): Readonly<{ subject: string; body: string }> {
  const arabic = locale === "ar";
  switch (templateKey) {
    case "receivable-due-soon":
    case "finance.receivable.due_soon":
      return arabic
        ? {
            subject: "استحقاق ذمة قريب",
            body: "تذكير: توجد ذمة مستحقة قريباً للمتابعة.",
          }
        : {
            subject: "Receivable due soon",
            body: "Reminder: a receivable is due soon.",
          };
    case "receivable-overdue":
    case "finance.receivable.overdue":
      return arabic
        ? {
            subject: "ذمة متأخرة",
            body: "تنبيه: توجد ذمة متأخرة تحتاج إلى متابعة.",
          }
        : {
            subject: "Overdue receivable",
            body: "Alert: an overdue receivable needs follow-up.",
          };
    case "commission-due":
    case "finance.commission.due":
      return arabic
        ? {
            subject: "عمولة مستحقة",
            body: "تذكير: توجد عمولة مستحقة للمراجعة.",
          }
        : {
            subject: "Commission due",
            body: "Reminder: a commission is due for review.",
          };
    default:
      return arabic
        ? { subject: "إشعار EstateFlow", body: "لديك إشعار جديد." }
        : {
            subject: "EstateFlow notification",
            body: "You have a new notification.",
          };
  }
}
