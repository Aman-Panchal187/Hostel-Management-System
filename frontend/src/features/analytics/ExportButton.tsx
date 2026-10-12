import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { exportReportPdf } from './pdf';
import type { PdfReport } from './pdf';

/** Captures `getReport().element` and downloads a PDF. Disabled until data has loaded. */
export function ExportPdfButton({ getReport, disabled }: Readonly<{ getReport: () => PdfReport | null; disabled?: boolean }>) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <Button
      variant="outline"
      loading={busy}
      disabled={disabled}
      onClick={async () => {
        const report = getReport();
        if (!report) return;
        setBusy(true);
        try {
          await exportReportPdf(report);
          toast.success('Report downloaded');
        } catch {
          toast.error('Could not generate the PDF report');
        } finally {
          setBusy(false);
        }
      }}
    >
      <FileDown className="h-4 w-4" aria-hidden /> Export PDF
    </Button>
  );
}
