import type { IssueStatus } from '@prisma/client';
import { AppError } from '../../shared/errors/app-error';

const TRANSITIONS: Record<IssueStatus, readonly IssueStatus[]> = {
  YET_TO_START: ['IN_PROGRESS'],
  IN_PROGRESS: ['DONE'],
  DONE: [],
};

export const canTransition = (from: IssueStatus, to: IssueStatus): boolean => TRANSITIONS[from].includes(to);

export function assertTransition(from: IssueStatus, to: IssueStatus): void {
  if (!canTransition(from, to)) {
    throw AppError.unprocessable(`Cannot move an issue from ${from} to ${to}`, 'INVALID_TRANSITION');
  }
}

export function assertCompletionEvidence(notes: string | undefined | null, resolutionAttachments: number): void {
  if (!notes?.trim()) {
    throw AppError.unprocessable('Resolution notes are required to complete an issue', 'RESOLUTION_NOTES_REQUIRED');
  }
  if (resolutionAttachments < 1) {
    throw AppError.unprocessable('At least one resolution photo or video is required', 'RESOLUTION_EVIDENCE_REQUIRED');
  }
}

export function assertAssignable(status: IssueStatus): void {
  if (status === 'DONE') {
    throw AppError.unprocessable('A completed issue cannot be reassigned', 'ISSUE_ALREADY_DONE');
  }
}

/** Hours between creation and completion; null until the issue is completed. */
export function resolutionHours(createdAt: Date, completedAt: Date | null): number | null {
  if (!completedAt) return null;
  return Math.round(((completedAt.getTime() - createdAt.getTime()) / 3_600_000) * 10) / 10;
}
