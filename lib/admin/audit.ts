/** Entity types for audit log. Use these instead of string literals. */
export const AUDIT_ENTITY_TYPE = {
  USER: 'user',
  TEAM: 'team',
  TEAM_MEMBERSHIP: 'team_membership',
  SHIFT: 'shift',
  SHIFT_TYPE: 'shift_type',
  NOTE: 'note',
  WEEK_NOTE: 'week_note',
  SWAP_REQUEST: 'swap_request',
  HOLIDAY_REQUEST: 'holiday_request',
} as const

/** Actions for audit log. Use these instead of string literals. */
export const AUDIT_ACTION = {
  USER_CREATED: 'USER_CREATED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  MEMBER_ADDED: 'MEMBER_ADDED',
  MEMBERSHIP_UPDATED: 'MEMBERSHIP_UPDATED',
  MEMBER_REMOVED: 'MEMBER_REMOVED',
  SHIFT_CREATED: 'SHIFT_CREATED',
  SHIFT_UPDATED: 'SHIFT_UPDATED',
  SHIFT_DELETED: 'SHIFT_DELETED',
  SHIFT_TYPE_CREATED: 'SHIFT_TYPE_CREATED',
  SHIFT_TYPE_UPDATED: 'SHIFT_TYPE_UPDATED',
  SHIFT_TYPE_DELETED: 'SHIFT_TYPE_DELETED',
  TEAM_CREATED: 'TEAM_CREATED',
  TEAM_DELETED: 'TEAM_DELETED',
  NOTE_CREATED: 'NOTE_CREATED',
  NOTE_APPROVED: 'NOTE_APPROVED',
  NOTE_REJECTED: 'NOTE_REJECTED',
  WEEK_NOTE_UPSERTED: 'WEEK_NOTE_UPSERTED',
  WEEK_NOTE_DELETED: 'WEEK_NOTE_DELETED',
  SWAP_REQUESTED: 'SWAP_REQUESTED',
  SWAP_APPROVED: 'SWAP_APPROVED',
  SWAP_REJECTED: 'SWAP_REJECTED',
  SWAP_REVOKED: 'SWAP_REVOKED',
  SWAP_EXECUTED: 'SWAP_EXECUTED',
  HOLIDAY_REQUESTED: 'HOLIDAY_REQUESTED',
  HOLIDAY_APPROVED: 'HOLIDAY_APPROVED',
  HOLIDAY_REJECTED: 'HOLIDAY_REJECTED',
  HOLIDAY_REVOKED: 'HOLIDAY_REVOKED',
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

