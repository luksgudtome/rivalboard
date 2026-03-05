import type { Metadata } from "next";
import Link from "next/link";
import MarkdownRenderer from "@/components/markdown-renderer";
import { getLegalDoc } from "@/lib/legal-docs";

export const metadata: Metadata = {
  title: "Privacy Policy | Rivalboard",
  description: "Rivalboard privacy policy",
};

export default async function PrivacyPolicyPage() {
  const doc = await getLegalDoc("privacy");

  return (
    <main className="dashboard legal-main">
      <nav className="top-nav">
        <div className="top-nav-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              R
            </span>
            <span>Rivalboard</span>
          </div>
          <div className="legal-nav-links">
            <Link href="/privacy" className="as-link legal-nav-link legal-nav-link-active">
              Privacy
            </Link>
            <Link href="/terms" className="as-link legal-nav-link">
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
