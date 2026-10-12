import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { ApprovalBadge, EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '@/components/common/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import type { ApiError } from '@/services/api';
import { roomsApi, usersApi } from '@/services/endpoints';
import type { ApprovalStatus, RoomRow } from '@/types';
import { ROLE_LABEL } from '@/utils/format';

export function PeoplePage() {
  const [role, setRole] = useState<'ASSISTANT' | 'STUDENT' | ''>('');
  const [status, setStatus] = useState<ApprovalStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const params = { role: role || undefined, status: status || undefined, search: search.trim() || undefined, page, pageSize: 12 };
  const query = useQuery({ queryKey: ['users', params], queryFn: () => usersApi.list(params), placeholderData: (prev) => prev });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader title="People" description="Assistants and students registered in your hostel." />
      <Card>
        <div className="grid gap-3 border-b border-border/60 p-4 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" aria-hidden />
            <Input aria-label="Search people" className="pl-9" placeholder="Search name or email" value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
          </div>
          <Select aria-label="Filter by role" value={role} onChange={(e) => reset(setRole)(e.target.value as typeof role)}>
            <option value="">All roles</option>
            <option value="ASSISTANT">Assistants</option>
            <option value="STUDENT">Students</option>
          </Select>
          <Select aria-label="Filter by status" value={status} onChange={(e) => reset(setStatus)(e.target.value as ApprovalStatus | '')}>
            <option value="">All statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="PENDING">Pending</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </div>
        {query.isLoading ? (
          <TableSkeleton />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : query.data!.data.length === 0 ? (
          <EmptyState title="No people match" description="Adjust the filters to see more." />
        ) : (
          <>
            <Table aria-label="People">
              <THead>
                <tr>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Room</Th>
                  <Th>Status</Th>
                </tr>
              </THead>
              <TBody>
                {query.data!.data.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted">{u.email}</p>
                    </Td>
                    <Td>
                      <Badge tone="accent">{ROLE_LABEL[u.role]}</Badge>
                    </Td>
                    <Td>{u.roomNumber ?? '—'}</Td>
                    <Td>
                      <ApprovalBadge status={u.status} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination meta={query.data!.meta} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}

const roomSchema = z.object({
  number: z.string().trim().min(1, 'Room number is required').max(20),
  floor: z.coerce.number<number>().int('Whole number').min(0, 'Min 0').max(100, 'Max 100'),
  capacity: z.coerce.number<number>().int('Whole number').min(1, 'Min 1').max(20, 'Max 20'),
});
type RoomValues = z.infer<typeof roomSchema>;

function RoomDialog({ room, open, onClose }: Readonly<{ room: RoomRow | null; open: boolean; onClose: () => void }>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(roomSchema), values: room ? { number: room.number, floor: room.floor, capacity: room.capacity } : { number: '', floor: 1, capacity: 2 } });

  const mutation = useMutation({
    mutationFn: (v: RoomValues) => (room ? roomsApi.update(room.id, v) : roomsApi.create(v)),
    onSuccess: () => {
      toast.success(room ? 'Room updated' : 'Room added');
      void queryClient.invalidateQueries({ queryKey: ['rooms'] });
      reset();
      onClose();
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={room ? 'Edit room' : 'Add room'}>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v as RoomValues))} noValidate className="space-y-4">
        <Field label="Room number" error={errors.number?.message}>
          <Input {...register('number')} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Floor" error={errors.floor?.message}>
            <Input type="number" {...register('floor')} />
          </Field>
          <Field label="Capacity" error={errors.capacity?.message}>
            <Input type="number" {...register('capacity')} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function RoomsPage() {
  const query = useQuery({ queryKey: ['rooms'], queryFn: roomsApi.list });
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<RoomRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<RoomRow | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => roomsApi.remove(id),
    onSuccess: () => {
      toast.success('Room deleted');
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (err: ApiError) => {
      setRemoving(null);
      toast.error(err.message);
    },
  });

  return (
    <>
      <PageHeader
        title="Rooms"
        description="Manage the rooms available for student registration."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Add room
          </Button>
        }
      />
      <Card>
        {query.isLoading ? (
          <TableSkeleton />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : query.data!.length === 0 ? (
          <EmptyState title="No rooms yet" description="Add rooms so students can pick theirs when registering." />
        ) : (
          <Table aria-label="Rooms">
            <THead>
              <tr>
                <Th>Room</Th>
                <Th>Floor</Th>
                <Th>Capacity</Th>
                <Th>Occupants</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </THead>
            <TBody>
              {query.data!.map((room) => (
                <Tr key={room.id}>
                  <Td className="font-medium">{room.number}</Td>
                  <Td>{room.floor}</Td>
                  <Td>{room.capacity}</Td>
                  <Td>{room.occupants}</Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="icon" aria-label={`Edit room ${room.number}`} onClick={() => setEditing(room)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Delete room ${room.number}`} onClick={() => setRemoving(room)}>
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <RoomDialog room={editing} open={adding || editing !== null} onClose={() => { setAdding(false); setEditing(null); }} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Delete room ${removing?.number ?? ''}?`}
        description="Rooms with residents or issues cannot be deleted."
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </>
  );
}
