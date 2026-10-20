import { AssistantConsole } from "./assistant-console";

type Props = { params: Promise<{ orgId: string }> };

export default async function AssistantPage({ params }: Props) {
  const { orgId } = await params;
  return <AssistantConsole orgId={orgId} />;
}
