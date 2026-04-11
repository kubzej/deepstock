import type { LucideIcon } from 'lucide-react';
import { FeedbackStateFrame } from './FeedbackState';

interface EmptyStateProps {
  /** Icon to display */
  icon: LucideIcon;
  /** Main heading */
  title: string;
  /** Description text */
  description?: string;
  /** Primary action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Secondary action button */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Unified empty state component for consistent UX across the app.
 * Use when a list/table has no items to display.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <FeedbackStateFrame
      icon={Icon}
      title={title}
      description={description}
      action={action}
      secondaryAction={secondaryAction}
    />
  );
}
