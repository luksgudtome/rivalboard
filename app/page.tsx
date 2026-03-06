import Link from "next/link";
import { redirect } from "next/navigation";
import RivalboardBrand from "@/components/rivalboard-brand";
import { getPageUser } from "@/lib/auth-server";

export default async function HomePage() {
  const user = await getPageUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <div className="landing-shell landing-nav-inner">
          <RivalboardBrand />
          <div className="landing-nav-actions">
            <Link href="/signin" className="ghost-btn as-link landing-nav-btn">
              Sign In
            </Link>
            <Link href="/signup" className="primary-btn as-link landing-nav-btn">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-shell landing-minimal-shell">
          <p className="landing-eyebrow">Rivalboard</p>
          <h1>Simple tournament management for modern organizers.</h1>
          <p className="landing-subtitle">
            Create brackets fast, run matches live, and share a clean public view for players and fans.
          </p>
          <div className="landing-hero-actions">
            <Link href="/signup" className="primary-btn as-link landing-cta-main">
              Create Tournament
            </Link>
            <Link href="/signin" className="ghost-btn as-link landing-cta-alt">
              Sign In
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
