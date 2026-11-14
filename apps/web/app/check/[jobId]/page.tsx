import { LiveReport } from "./LiveReport";

export default async function CheckPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <LiveReport jobId={jobId} />;
}
