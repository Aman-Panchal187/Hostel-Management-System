import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { PageHeader } from '@/components/common/common';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import type { ApiError } from '@/services/api';
import { issuesApi } from '@/services/endpoints';
import type { MediaInput } from '@/types';
import { CATEGORY_LABEL, ISSUE_CATEGORIES, ISSUE_PRIORITIES, PRIORITY_LABEL } from '@/utils/format';
import { MediaUrlList } from './MediaUrlList';

export const createIssueSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150, 'Title is too long'),
  category: z.enum(ISSUE_CATEGORIES, { error: 'Choose a category' }),
  priority: z.enum(ISSUE_PRIORITIES, { error: 'Choose a priority' }),
  description: z.string().trim().min(10, 'Describe the problem in at least 10 characters').max(4000),
});
type Values = z.infer<typeof createIssueSchema>;

export default function CreateIssuePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [media, setMedia] = useState<MediaInput[]>([]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(createIssueSchema), defaultValues: { priority: 'MEDIUM' } });

  const mutation = useMutation({
    mutationFn: (values: Values) => issuesApi.create({ ...values, attachments: media }),
    onSuccess: (issue) => {
      toast.success('Issue reported. Your hostel team has been notified.');
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      navigate(`/issues/${issue.id}`);
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  return (
    <>
      <PageHeader title="Report an issue" description="Tell your hostel team what needs fixing. Photos or videos help them resolve it faster." />
      <Card className="max-w-2xl">
        <CardBody>
          <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="space-y-5">
            <Field label="Title" error={errors.title?.message}>
              <Input placeholder="e.g. Ceiling fan not working" {...register('title')} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Category" error={errors.category?.message}>
                <Select defaultValue="" {...register('category')}>
                  <option value="" disabled>
                    Select category
                  </option>
                  {ISSUE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority" error={errors.priority?.message}>
                <Select {...register('priority')}>
                  {ISSUE_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Description" error={errors.description?.message}>
              <Textarea placeholder="What is wrong, and since when?" {...register('description')} />
            </Field>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                Photos / videos <span className="font-normal text-muted">(optional, HTTPS links)</span>
              </p>
              <MediaUrlList label="Media URL" value={media} onChange={setMedia} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Submit issue
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
