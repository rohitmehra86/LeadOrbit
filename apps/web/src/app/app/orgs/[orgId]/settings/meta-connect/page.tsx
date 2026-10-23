import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { MetaConnectClient } from "./meta-connect-client";

type Props = {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MetaConnectPage({ params, searchParams }: Props) {
  const { orgId } = await params;
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const step = typeof sp.step === "string" ? sp.step : null;
  const nonce = typeof sp.nonce === "string" ? sp.nonce : null;
  const connected = sp.connected === "1";
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <MetaConnectClient
      orgId={orgId}
      initialStep={step === "pick" ? "pick" : connected ? "done" : "status"}
      nonce={nonce}
      connectedFlash={connected}
      errorFlash={error}
    />
  );
}
