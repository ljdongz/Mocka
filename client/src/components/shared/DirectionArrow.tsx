import { ArrowDown, ArrowUp } from 'lucide-react';
import type { RequestRecord } from '../../types';

/** Direction from the client's point of view: ↑ client → server, ↓ server → client. */
export function DirectionArrow({ record }: { record: RequestRecord }) {
  if (record.direction === 'in') return <ArrowUp size={12} strokeWidth={2.5} className="text-text-muted" />;
  if (record.direction === 'out') return <ArrowDown size={12} strokeWidth={2.5} className="text-accent-primary" />;
  return null;
}
