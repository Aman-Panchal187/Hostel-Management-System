import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Circle, Clock, PlayCircle } from 'lucide-react';
import { EmptyState, ErrorState, MediaGallery, PriorityBadge, StatusBadge } from '@/components/common/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/AuthContext';
import type { ApiError } from '@/services/api';
import { issuesApi } from '@/services/endpoints';
import type { IssueDetail, IssueHistoryEntry, MediaInput } from '@/types';
import { CATEGORY_LABEL, formatDateTime, formatHours, STATUS_LABEL } from '@/utils/format';
import { AssignControl } from './AssignControl';
import { MediaUrlList } from './MediaUrlList';

const STATUS_ICON = { YET_TO_START: Circle, IN_PROGRESS: PlayCircle, DONE: CheckCircle2 } as const;

export function IssueTimeline({ history }: Readonly<{ history: IssueHistoryEntry[] }>) {
  return (
    <ol className="relative space-y-5 border-l border-border/70 pl-6" aria-label="Issue history">
      {history.map((entry) => {
        const Icon = STATUS_ICON[entry.toStatus];
        return (
          <li key={entry.id} className="relative" data-testid="history-entry">
            <span className="absolute -left-[34px] flex h-5 w-5 items-center justify-center rounded-full bg-background">
              <Icon className={`h-5 w-5 ${entry.toStatus === 'DONE' ? 'text-success' : entry.toStatus === 'IN_PROGRESS' ? 'text-primary' : 'text-warning'}`} aria-hidden />
            </span>
            <p className="text-sm font-medium">{STATUS_LABEL[entry.toStatus]}</p>
            <p className="text-xs text-muted">
              {entry.changedBy.name} · {formatDateTime(entry.createdAt)}
            </p>
            {entry.note && <p className="mt-1 text-sm text-muted">{entry.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function WorkPanel({ issue }: Readonly<{ issue: IssueDetail }>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirmStart, setConfirmStart] = useState(false);
  const [notes, setNotes] = useState('');
  const [media, setMedia] = useState<MediaInput[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const existing = issue.attachments.filter((a) => a.kind === 'RESOLUTION').length;

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof issuesApi.changeStatus>[1]) => issuesApi.changeStatus(issue.id, body),
    onSuccess: (_data, vars) => {
      toast.success(vars.status === 'DONE' ? 'Issue marked as done' : 'Work started');
      setConfirmStart(false);
      void queryClient.invalidateQueries({ queryKey: ['issue', issue.id] });
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (err: ApiError) => {
      setConfirmStart(false);
      setFormError(err.message);
      toast.error(err.message);
    },
  });

  if (issue.status === 'DONE') return null;
  if (issue.status === 'YET_TO_START') {
    return (
      <Card>
        <CardHeader title="Update status" description="Start working on this issue when you are ready." />
        <CardBody>
          <Button onClick={() => setConfirmStart(true)}>
            <PlayCircle className="h-4 w-4" aria-hidden /> Start work
          </Button>
          <ConfirmDialog
            open={confirmStart}
            onOpenChange={setConfirmStart}
            title="Start work on this issue?"
            description="The issue will move to In progress and the student will be able to follow it."
            confirmLabel="Start work"
            loading={mutation.isPending}
            onConfirm={() => mutation.mutate({ status: 'IN_PROGRESS' })}
          />
        </CardBody>
      </Card>
    );
  }

  const submit = () => {
    setFormError(null);
    if (!notes.trim()) return setFormError('Describe what you did to resolve the issue.');
    if (existing + media.length < 1) return setFormError('Add at least one photo or video link as proof.');
    mutation.mutate({ status: 'DONE', resolutionNotes: notes.trim(), attachments: media });
  };

  return (
    <Card>
      <CardHeader title="Resolve this issue" description="Add resolution notes and proof, then mark it as done." />
      <CardBody className="space-y-4">
        {formError && (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {formError}
          </div>
        )}
        <Field label="Resolution notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was wrong and how did you fix it?" maxLength={4000} />
        </Field>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Resolution evidence {existing > 0 && <span className="text-muted">({existing} already attached)</span>}</p>
          <MediaUrlList label="Evidence URL" value={media} onChange={setMedia} />
        </div>
        <Button variant="success" loading={mutation.isPending} onClick={submit}>
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Mark as done
        </Button>
      </CardBody>
    </Card>
  );
}

export default function IssueDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['issue', id], queryFn: () => issuesApi.get(id), retry: false });

  const back = user ? `/${{ PLATFORM_ADMIN: 'platform', HOSTEL_ADMIN: 'hostel/issues', ASSISTANT: 'assistant/issues', STUDENT: 'student/issues' }[user.role]}` : '/';

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (query.isError) {
    const notFound = (query.error as ApiError).status === 404;
    return (
      <Card>
        {notFound ? <EmptyState title="Issue not found" description="It may not exist, or you do not have access to it." action={<Link className="text-accent hover:underline" to={back}>Back to issues</Link>} /> : <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />}
      </Card>
    );
  }

  const issue = query.data!;
  const resolution = issue.attachments.filter((a) => a.kind === 'RESOLUTION');
  const reference = issue.attachments.filter((a) => a.kind === 'REFERENCE');
  const duration = issue.completedAt ? (new Date(issue.completedAt).getTime() - new Date(issue.createdAt).getTime()) / 3_600_000 : null;

  return (
    <div className="space-y-6">
      <Link to={back} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to issues
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="issue-title">
            {issue.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Reported by {issue.reporter.name}
            {issue.room && ` · Room ${issue.room.number}`} · {formatDateTime(issue.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={issue.status} />
          <PriorityBadge priority={issue.priority} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="space-y-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{issue.description}</p>
              <div>
                <h3 className="mb-2 text-sm font-medium">Reference media</h3>
                <MediaGallery items={reference} emptyLabel="No photos or videos were attached." />
              </div>
            </CardBody>
          </Card>

          {issue.status === 'DONE' && (
            <Card className="border-success/30">
              <CardHeader title="Resolution" description={duration !== null ? `Resolved in ${formatHours(duration)}` : undefined} />
              <CardBody className="space-y-4">
                <p className="whitespace-pre-wrap text-sm" data-testid="resolution-notes">
                  {issue.resolutionNotes}
                </p>
                <MediaGallery items={resolution} emptyLabel="No evidence attached." />
              </CardBody>
            </Card>
          )}

          {user?.role === 'ASSISTANT' && <WorkPanel issue={issue} />}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Summary" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Category</dt>
                  <dd>{CATEGORY_LABEL[issue.category]}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Assigned</dt>
                  <dd>{formatDateTime(issue.assignedAt)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Started</dt>
                  <dd>{formatDateTime(issue.startedAt)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Completed</dt>
                  <dd>{formatDateTime(issue.completedAt)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Assignee</dt>
                  <dd data-testid="assignee-name">{issue.assignee?.name ?? 'Unassigned'}</dd>
                </div>
              </dl>
              {user?.role === 'HOSTEL_ADMIN' && issue.status !== 'DONE' && (
                <div className="mt-4 border-t border-border/60 pt-4">
                  <p className="mb-2 flex items-center gap-1 text-xs uppercase tracking-wide text-muted">
                    <Clock className="h-3 w-3" aria-hidden /> Assignment
                  </p>
                  <AssignControl issueId={issue.id} currentAssigneeId={issue.assignee?.id ?? null} />
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Progress" />
            <CardBody>
              <IssueTimeline history={issue.history} />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
