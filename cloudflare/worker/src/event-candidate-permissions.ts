import type { BetterAuthRole } from './better-auth-identity.ts';

// This capability map is intentionally scoped to the Event Candidate module.
// The canonical auditor role is the collaborator (CTV) business role, but it
// receives no implied access to another admin surface merely by working
// candidates.
export type EventCandidateCapability = 'read' | 'analyze' | 'approve' | 'reject';

const CAPABILITIES: Readonly<Record<BetterAuthRole, ReadonlySet<EventCandidateCapability>>> = {
  admin: new Set(['read', 'analyze', 'approve', 'reject']),
  auditor: new Set(['read', 'analyze', 'approve', 'reject']),
  user: new Set(),
};

export const hasEventCandidateCapability = (
  role: BetterAuthRole,
  capability: EventCandidateCapability,
) => CAPABILITIES[role].has(capability);
