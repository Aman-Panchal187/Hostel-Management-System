import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { ApprovalBadge, EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '@/components/common/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/form';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import type { ApiError } from '@/services/api';
import { approvalsApi } from '@/services/endpoints';
import type { ApprovalItem, ApprovalStatus } from '@/types';
import { APPROVAL_TYPE_LABEL, formatDate } from '@/utils/format';

interface PendingDecision {
  item: ApprovalItem;
  decision: 'APPROVED' | 'REJECTED';
}

export function useApprovalMutation(onDone?: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { id: string; decision: 'APPROVED' | 'REJECTED'; reason?: string }) => approvalsApi.decide(v.id, v.decision, v.reason),
    onSuccess: (_d, v) => {
      toast.success(v.decision === 'APPROVED' ? 'Request approved' : 'Request rejected');
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['hostels'] });
      onDone?.();
    },
    onError: (err: ApiError) => {
      toast.error(err.status === 409 ? 'Someone already decided this request.' : err.message);
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
      onDone?.();
    },
  });
}

/** Approval queue used by both the platform admin (hostels) and hostel admin (assistants/students). */
export function ApprovalsTable({ status, pageSize = 10, paged = true, title }: Readonly<{ status?: ApprovalStatus; pageSize?: number; paged?: boolean; title?: string }>) {
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [reason, setReason] = useState('');
  const mutation = useApprovalMutation(() => setPending(null));
  const query = useQuery({ queryKey: ['approvals', { status, page, pageSize }], queryFn: () => approvalsApi.list({ status, page, pageSize }), placeholderData: (prev) => prev });

  if (query.isLoading) return <TableSkeleton rows={4} />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  const { data, meta } = query.data!;
  if (data.length === 0) return <EmptyState title={status === 'PENDING' ? 'No pending requests' : 'No requests'} description="New registrations will appear here for review." />;

  return (
    <>
      <Table aria-label={title ?? 'Approval requests'}>
        <THead>
          <tr>
            <Th>Applicant</Th>
            <Th>Type</Th>
            <Th>Details</Th>
            <Th>Requested</Th>
            <Th>Status</Th>
            <Th className="text-right">Action</Th>
          </tr>
        </THead>
        <TBody>
          {data.map((item) => (
            <Tr key={item.id} data-testid="approval-row">
              <Td>
                <p className="font-medium">{item.user.name}</p>
                <p className="text-xs text-muted">{item.user.email}</p>
              </Td>
              <Td>
                <Badge tone="accent">{APPROVAL_TYPE_LABEL[item.type]}</Badge>
              </Td>
              <Td className="max-w-[14rem] text-muted">
                {item.type === 'HOSTEL_REGISTRATION' ? `${item.hostel.name} · ${item.hostel.city}` : item.user.roomNumber ? `Room ${item.user.roomNumber}` : '—'}
              </Td>
              <Td className="whitespace-nowrap text-muted">{formatDate(item.createdAt)}</Td>
              <Td>
                <ApprovalBadge status={item.status} />
              </Td>
              <Td className="text-right">
                {item.status === 'PENDING' ? (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="success" aria-label={`Approve ${item.user.name}`} onClick={() => setPending({ item, decision: 'APPROVED' })}>
                      <Check className="h-3.5 w-3.5" aria-hidden /> Approve
                    </Button>
                    <Button size="sm" variant="outline" aria-label={`Reject ${item.user.name}`} onClick={() => { setReason(''); setPending({ item, decision: 'REJECTED' }); }}>
                      <X className="h-3.5 w-3.5" aria-hidden /> Reject
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted">{formatDate(item.decidedAt)}</span>
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      {paged && <Pagination meta={meta} onPage={setPage} />}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.decision === 'APPROVED' ? 'Approve this request?' : 'Reject this request?'}
        description={pending ? `${pending.item.user.name} (${pending.item.user.email}) ${pending.decision === 'APPROVED' ? 'will gain access immediately.' : 'will not be able to sign in.'}` : ''}
        confirmLabel={pending?.decision === 'APPROVED' ? 'Approve' : 'Reject'}
        tone={pending?.decision === 'APPROVED' ? 'success' : 'danger'}
        loading={mutation.isPending}
        onConfirm={() => pending && mutation.mutate({ id: pending.item.id, decision: pending.decision, reason: reason.trim() || undefined })}
      >
        {pending?.decision === 'REJECTED' && <Input aria-label="Reason (optional)" placeholder="Reason (optional)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />}
      </ConfirmDialog>
    </>
  );
}

export default function ApprovalsPage({ scope }: Readonly<{ scope: 'platform' | 'hostel' }>) {
  const [status, setStatus] = useState<ApprovalStatus | ''>('PENDING');
  return (
    <>
      <PageHeader
        title="Approvals"
        description={scope === 'platform' ? 'Review hostel registrations.' : 'Review assistant and student registrations for your hostel.'}
        actions={
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as ApprovalStatus | '')} className="w-40">
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        }
      />
      <Card>
        <ApprovalsTable key={status} status={status || undefined} />
      </Card>
    </>
  );
}
