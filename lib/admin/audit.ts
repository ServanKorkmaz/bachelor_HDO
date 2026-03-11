/** Entity types for audit log. Use these instead of string literals. */
export const AUDIT_ENTITY_TYPE = {
  USER: 'user',
  TEAM_MEMBERSHIP: 'team_membership',
  SWAP_REQUEST: 'swap_request',
} as const

/** Actions for audit log. Use these instead of string literals. */
export const AUDIT_ACTION = {
  USER_CREATED: 'USER_CREATED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  MEMBER_ADDED: 'MEMBER_ADDED',
  MEMBERSHIP_UPDATED: 'MEMBERSHIP_UPDATED',
  MEMBER_REMOVED: 'MEMBER_REMOVED',
  SWAP_REQUESTED: 'SWAP_REQUESTED',
  SWAP_APPROVED: 'SWAP_APPROVED',
  SWAP_REJECTED: 'SWAP_REJECTED',
  SWAP_EXECUTED: 'SWAP_EXECUTED',
} as const

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
  tx: { auditLog: { create: (args: { data: AuditEntry }) => Promise<unknown> } },
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

