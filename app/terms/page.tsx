import type { Metadata } from "next";
import Link from "next/link";
import MarkdownRenderer from "@/components/markdown-renderer";
import RivalboardBrand from "@/components/rivalboard-brand";
import { getLegalDoc } from "@/lib/legal-docs";

export const metadata: Metadata = {
  title: "Terms of Service | Rivalboard",
  description: "Rivalboard terms of service",
};

export default async function TermsPage() {
  const doc = await getLegalDoc("terms");

  return (
    <main className="dashboard legal-main">
      <nav className="top-nav">
        <div className="top-nav-inner">
          <RivalboardBrand />
          <div className="legal-nav-links">
            <Link href="/privacy" className="as-link legal-nav-link">
              Privacy
            </Link>
            <Link href="/terms" className="as-link legal-nav-link legal-nav-link-active">
              Terms
            </Link>
          </div>
        </div>
      </nav>

      <section className="dashboard-main">
        <article className="card legal-card">
          <MarkdownRenderer markdown={doc.content} />
        </article>
      </section>
    </main>
  );
}
