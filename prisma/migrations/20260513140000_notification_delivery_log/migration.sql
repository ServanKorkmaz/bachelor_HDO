-- Channel + status enums for delivery attempts
CREATE TYPE "DeliveryChannel" AS ENUM ('EMAIL', 'SMS');
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'FAILED');

-- Audit trail for every email / SMS delivery attempt. Lets admins query
-- recent failures instead of relying on console.error output.
CREATE TABLE "notification_delivery_log" (
  "id"               TEXT NOT NULL,
  "teamId"           TEXT NOT NULL,
  "userId"           TEXT,
  "channel"          "DeliveryChannel" NOT NULL,
  "notificationType" TEXT NOT NULL,
  "recipient"        TEXT NOT NULL,
  "status"           "DeliveryStatus" NOT NULL,
  "errorMessage"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_delivery_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_delivery_log_status_createdAt_idx"
  ON "notification_delivery_log" ("status", "createdAt");
CREATE INDEX "notification_delivery_log_userId_createdAt_idx"
  ON "notification_delivery_log" ("userId", "createdAt");
