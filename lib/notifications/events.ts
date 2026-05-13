import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { deliverNotificationToChannels } from './deliver'

/**
 * Domain events emitted by the services in `lib/services/`. Each variant
 * carries the bare facts of what happened — never pre-rendered text — so
 * `render()` below remains the single source of truth for "this is what the
 * system communicates."
 *
 * Adding a new event = adding a variant here, a case in `render()`, and one
 * call site in a service. Nothing else.
 */
export type DomainEvent =
  // Shift lifecycle (always notifies the assignee).
  | { type: 'SHIFT_CREATED'; teamId: string; assigneeUserId: string; assigneeName: string; date: string }
  | { type: 'SHIFT_UPDATED'; teamId: string; assigneeUserId: string; assigneeName: string; date: string }
  | { type: 'SHIFT_DELETED'; teamId: string; assigneeUserId: string; assigneeName: string; date: string }
  // Swap-request flow.
  | { type: 'SWAP_REQUEST_SENT'; teamId: string; toUserId: string; requesterName: string }
  | { type: 'SWAP_ACCEPTED_BY_PARTNER'; teamId: string; requesterUserId: string; partnerName: string }
  | { type: 'SWAP_READY_FOR_LEADER'; teamId: string; requesterName: string; partnerName: string }
  | { type: 'SWAP_DECLINED_BY_PARTNER'; teamId: string; requesterUserId: string; partnerName: string }
  | { type: 'SWAP_APPROVED_BY_LEADER'; teamId: string; requesterUserId: string }
  | { type: 'SWAP_REJECTED_BY_LEADER'; teamId: string; requesterUserId: string }
  | { type: 'SWAP_EXECUTED_FROM'; teamId: string; fromUserId: string; toUserName: string }
  | { type: 'SWAP_EXECUTED_TO'; teamId: string; toUserId: string; fromUserName: string }
  // Holiday/absence requests.
  | { type: 'HOLIDAY_REQUESTED'; teamId: string; submitterName: string; holidayTypeNor: string }
  | { type: 'HOLIDAY_DECIDED'; teamId: string; submitterUserId: string; holidayTypeNor: string; statusNor: string }
  // Notes.
  | { type: 'NOTE_CREATED'; teamId: string; creatorUserId: string; titleOrType: string }
  | { type: 'NOTE_DECIDED'; teamId: string; creatorUserId: string; titleOrType: string; approved: boolean }

/**
 * What `render()` produces for each event: the notification.type string
 * actually written to the `notifications` table (which is also the key
 * `deliverNotificationToChannels` uses to consult user preferences),
 * recipient (null for team-wide rows), title, message, and whether to fan
 * the event out to email/SMS after the transaction commits.
 *
 * `notificationType` mirrors pre-existing DB values so historical rows stay
 * consistent — that is why several distinct domain events render to the
 * same notificationType (e.g. SWAP_REQUEST_SENT and SWAP_READY_FOR_LEADER
 * both store as 'SWAP_REQUESTED').
 */
interface Rendered {
  notificationType: string
  recipientUserId: string | null
  title: string
  message: string
  deliverable: boolean
}

function render(event: DomainEvent): Rendered {
  switch (event.type) {
    case 'SHIFT_CREATED':
      return {
        notificationType: 'SHIFT_CREATED',
        recipientUserId: event.assigneeUserId,
        title: 'Vakt opprettet',
        message: `Ny vakt opprettet for ${event.assigneeName} på ${event.date}`,
        deliverable: true,
      }
    case 'SHIFT_UPDATED':
      return {
        notificationType: 'SHIFT_UPDATED',
        recipientUserId: event.assigneeUserId,
        title: 'Vakt oppdatert',
        message: `Vakt oppdatert for ${event.assigneeName} på ${event.date}`,
        deliverable: true,
      }
    case 'SHIFT_DELETED':
      return {
        notificationType: 'SHIFT_DELETED',
        recipientUserId: event.assigneeUserId,
        title: 'Vakt slettet',
        message: `Vakt slettet for ${event.assigneeName} på ${event.date}`,
        deliverable: true,
      }
    case 'SWAP_REQUEST_SENT':
      return {
        notificationType: 'SWAP_REQUESTED',
        recipientUserId: event.toUserId,
        title: 'Vaktbytteforespørsel',
        message: `${event.requesterName} ønsker å bytte vakt med deg`,
        deliverable: false,
      }
    case 'SWAP_ACCEPTED_BY_PARTNER':
      return {
        notificationType: 'SWAP_ACCEPTED_BY_COLLEAGUE',
        recipientUserId: event.requesterUserId,
        title: 'Kollega godtok vaktbytte',
        message: `${event.partnerName} godtok din vaktbytteforespørsel. Venter nå på leder.`,
        deliverable: false,
      }
    case 'SWAP_READY_FOR_LEADER':
      return {
        notificationType: 'SWAP_REQUESTED',
        recipientUserId: null,
        title: 'Vaktbytte klar for godkjenning',
        message: `${event.requesterName} og ${event.partnerName} er enige om vaktbytte`,
        deliverable: false,
      }
    case 'SWAP_DECLINED_BY_PARTNER':
      return {
        notificationType: 'SWAP_REJECTED',
        recipientUserId: event.requesterUserId,
        title: 'Vaktbytte avslått',
        message: `${event.partnerName} avslo din vaktbytteforespørsel`,
        deliverable: false,
      }
    case 'SWAP_APPROVED_BY_LEADER':
      return {
        notificationType: 'SWAP_APPROVED',
        recipientUserId: event.requesterUserId,
        title: 'Vaktbytteforespørsel godkjent',
        message: 'Din forespørsel om vaktbytte er godkjent',
        deliverable: true,
      }
    case 'SWAP_REJECTED_BY_LEADER':
      return {
        notificationType: 'SWAP_REJECTED',
        recipientUserId: event.requesterUserId,
        title: 'Vaktbytteforespørsel avvist',
        message: 'Din forespørsel om vaktbytte er avvist',
        deliverable: true,
      }
    case 'SWAP_EXECUTED_FROM':
      return {
        notificationType: 'SWAP_EXECUTED',
        recipientUserId: event.fromUserId,
        title: 'Vaktbytte utført',
        message: `Vaktbytte utført: ${event.toUserName} har overtatt vakten`,
        deliverable: true,
      }
    case 'SWAP_EXECUTED_TO':
      return {
        notificationType: 'SWAP_EXECUTED',
        recipientUserId: event.toUserId,
        title: 'Vaktbytte utført',
        message: `Du har overtatt vakten fra ${event.fromUserName}`,
        deliverable: true,
      }
    case 'HOLIDAY_REQUESTED':
      return {
        notificationType: 'HOLIDAY_REQUESTED',
        recipientUserId: null,
        title: 'Ny fraværsforespørsel',
        message: `${event.submitterName} sendte inn en forespørsel om ${event.holidayTypeNor}`,
        deliverable: false,
      }
    case 'HOLIDAY_DECIDED':
      return {
        notificationType: 'HOLIDAY_DECIDED',
        recipientUserId: event.submitterUserId,
        title: `Forespørsel ${event.statusNor}`,
        message: `Din ${event.holidayTypeNor}-forespørsel ble ${event.statusNor.toLowerCase()}`,
        deliverable: false,
      }
    case 'NOTE_CREATED':
      return {
        notificationType: 'NOTE_CREATED',
        recipientUserId: event.creatorUserId,
        title: 'Notat opprettet',
        message: `Nytt notat opprettet: ${event.titleOrType}`,
        deliverable: true,
      }
    case 'NOTE_DECIDED':
      return {
        notificationType: 'NOTE_STATUS_CHANGED',
        recipientUserId: event.creatorUserId,
        title: `Notat ${event.approved ? 'godkjent' : 'avvist'}`,
        message: `Ditt notat "${event.titleOrType}" er ${event.approved ? 'godkjent' : 'avvist'}`,
        deliverable: true,
      }
  }
}

/**
 * Run a domain operation that emits one or more events. The transaction
 * persists each event's notification row alongside the rest of the work, and
 * channel fan-out (email/SMS) happens **after the transaction commits** so
 * we never email people about a write that ultimately rolled back.
 *
 * Usage in a service:
 *
 *   return withEvents(async (tx, emit) => {
 *     const shift = await tx.shift.create({ ... })
 *     await emit({ type: 'SHIFT_CREATED', ... })
 *     return shift
 *   })
 */
export async function withEvents<T>(
  run: (
    tx: Prisma.TransactionClient,
    emit: (event: DomainEvent) => Promise<void>
  ) => Promise<T>
): Promise<T> {
  const collected: DomainEvent[] = []

  const result = await prisma.$transaction(async (tx) => {
    const emit = async (event: DomainEvent) => {
      const r = render(event)
      await tx.notification.create({
        data: {
          teamId: event.teamId,
          userId: r.recipientUserId,
          type: r.notificationType,
          title: r.title,
          message: r.message,
        },
      })
      collected.push(event)
    }
    return run(tx, emit)
  })

  // Tx committed — now fan out to channels. `deliverNotificationToChannels`
  // never throws (it logs failures into `notification_delivery_log`), so a
  // misbehaving channel can't take down the caller.
  for (const event of collected) {
    const r = render(event)
    if (r.deliverable && r.recipientUserId) {
      void deliverNotificationToChannels({
        userId: r.recipientUserId,
        teamId: event.teamId,
        type: r.notificationType,
        title: r.title,
        message: r.message,
      })
    }
  }

  return result
}
