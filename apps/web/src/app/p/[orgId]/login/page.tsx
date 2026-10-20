import { notFound } from "next/navigation";
import { getWhiteLabelStore } from "@/lib/tenancy/white-label";
import { BrandedLoginForm } from "./branded-login-form";

type Ctx = { params: Promise<{ orgId: string }> };

/**
 * White-label branded login surface.
 * Consumes public brand; never invents activation or payment state.
 */
export default async function BrandedLoginPage({ params }: Ctx) {
  const { orgId } = await params;
  const brand = getWhiteLabelStore().getPublicBrand(orgId);
  if (!brand) {
    notFound();
  }

  const primary = brand.primaryColor || "#0B3D2E";
  const accent = brand.accentColor || "#C4A35A";

  return (
    <main
      className="relative flex min-h-screen flex-col justify-center px-6 py-16"
      style={{
        background: `radial-gradient(ellipse at 20% 0%, ${primary}cc, #061a14 55%, #030a08 100%)`,
        color: "#f5f0e6",
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_80%_20%,rgba(196,163,90,0.25),transparent_45%)]" />
      <div className="relative mx-auto w-full max-w-md">
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt=""
            className="mb-6 h-10 w-auto object-contain"
          />
        ) : null}
        <h1
          className="text-4xl font-semibold tracking-tight"
          style={{ color: accent }}
        >
          {brand.loginHeadline ?? "Sign in"}
        </h1>
        <p className="mt-2 text-sm text-white/70">
          {brand.supportEmail
            ? `Need help? ${brand.supportEmail}`
            : "Use the credentials for this workspace."}
        </p>
        <BrandedLoginForm
          accent={accent}
          primary={primary}
          hideLeadOrbit={brand.hideLeadOrbitBranding}
        />
      </div>
    </main>
  );
}
