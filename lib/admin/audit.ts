export interface AuditEntry {
  actorUserId: string
  action: string
  entityType: string
  entityId: string
  beforeJson?: string | null
  afterJson?: string | null
}

/** Create one audit log entry. Call inside the same transaction as the data write. */
export async function createAuditLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  entry: AuditEntry
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeJson: entry.beforeJson ?? null,
      afterJson: entry.afterJson ?? null,
    },
  })
}
