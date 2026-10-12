import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { issuesApi, usersApi } from '@/services/endpoints';
import type { ApiError } from '@/services/api';

export function useAssistants() {
  return useQuery({
    queryKey: ['users', 'assistants-approved'],
    queryFn: () => usersApi.list({ role: 'ASSISTANT', status: 'APPROVED', pageSize: 100 }),
    select: (res) => res.data,
    staleTime: 60_000,
  });
}

interface Props {
  issueId: string;
  currentAssigneeId: string | null;
  disabled?: boolean;
  compact?: boolean;
}

/** Assign / reassign dropdown for hostel admins; invalidates issues and analytics on success. */
export function AssignControl({ issueId, currentAssigneeId, disabled, compact }: Readonly<Props>) {
  const { data: assistants = [], isLoading } = useAssistants();
  const queryClient = useQueryClient();
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: (assigneeId: string) => issuesApi.assign(issueId, assigneeId),
    onSuccess: () => {
      toast.success('Issue assigned');
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      void queryClient.invalidateQueries({ queryKey: ['issue', issueId] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  return (
    <Select
      aria-label={currentAssigneeId ? 'Reassign issue' : 'Assign issue'}
      className={compact ? 'h-8 min-w-[9.5rem] text-xs' : undefined}
      value={currentAssigneeId ?? ''}
      disabled={disabled || isLoading || mutation.isPending}
      onChange={(e) => e.target.value && mutation.mutate(e.target.value)}
    >
      <option value="" disabled>
        {isLoading ? 'Loading…' : 'Assign to…'}
      </option>
      {assistants.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </Select>
  );
}
