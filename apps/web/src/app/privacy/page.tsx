import { redirect } from "next/navigation";

/** Legacy path — Meta / bookmarks should use /privacy-policy. */
export default function PrivacyRedirectPage() {
  redirect("/privacy-policy");
}
