import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import showcaseImage from "@/content/showcase.jpg";
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
          <nav className="landing-nav-actions" aria-label="Landing actions">
            <Link href="/signin" className="landing-nav-link">
              Sign In
            </Link>
            <Link href="/signup" className="primary-btn as-link landing-nav-cta">
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-shell landing-hero-grid">
          <div className="landing-copy">
            <h1>Simple Tournament manager for modern organizers</h1>
            <div className="landing-hero-actions">
              <Link href="/signup" className="primary-btn as-link landing-cta-main">
                Create Tournament
              </Link>
              <Link href="/signin" className="ghost-btn as-link landing-cta-alt">
                Sign In
              </Link>
            </div>
          </div>

          <aside className="landing-preview" aria-label="Rivalboard product preview">
            <div className="landing-preview-frame">
              <Image
                src={showcaseImage}
                alt="Rivalboard tournament showcase"
                className="landing-preview-image"
                priority
                sizes="(max-width: 900px) 100vw, 42vw"
              />
            </div>
          </aside>
        </div>
      </section>

      <section className="landing-proof">
        <div className="landing-shell landing-proof-grid">
          <article className="landing-feature-card landing-feature-card-primary">
            <span className="landing-feature-kicker">Build</span>
            <h2>Set up tournaments without admin overhead.</h2>
            <p>Start with players or teams, choose the format, and get a working bracket immediately.</p>
          </article>
          <article className="landing-feature-card landing-feature-card-secondary">
            <span className="landing-feature-kicker">Run</span>
            <h2>Keep match updates simple during real events.</h2>
            <p>Update scores, track stages, and manage bracket progress without burying the operator in forms.</p>
          </article>
          <article className="landing-feature-card landing-feature-card-tertiary">
            <span className="landing-feature-kicker">Share</span>
            <h2>Give viewers a clean public page that holds up on mobile.</h2>
            <p>Expose brackets, participant details, and team or player social links in a layout built for phones.</p>
          </article>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-shell landing-footer-inner">
          <div className="landing-footer-meta">
            <span className="landing-footer-copy">&copy; 2026 Rivalboard</span>
            <span className="landing-footer-separator" aria-hidden="true">
              &bull;
            </span>
            <Link href="/privacy" className="landing-footer-link">
              Privacy
            </Link>
            <span className="landing-footer-separator" aria-hidden="true">
              &bull;
            </span>
            <Link href="/terms" className="landing-footer-link">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
