import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export interface ArticleSection {
  h2: string;
  body: string[];
}

export interface ArticleData {
  slug: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  sections: ArticleSection[];
  faq?: { q: string; a: string }[];
}

const BASE = "https://gstr2b3breconciliation.lovable.app";

const Article = ({ data }: { data: ArticleData }) => {
  const url = `${BASE}/${data.slug}`;
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: data.h1,
    description: data.description,
    author: { "@type": "Organization", name: "TechBharat Studios" },
    publisher: { "@type": "Organization", name: "TechBharat Studios" },
    mainEntityOfPage: url,
    datePublished: "2026-06-04",
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Helmet>
        <title>{data.title}</title>
        <meta name="description" content={data.description} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={data.title} />
        <meta property="og:description" content={data.description} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="article" />
        <meta name="twitter:title" content={data.title} />
        <meta name="twitter:description" content={data.description} />
        <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>
        {data.faq && (
          <script type="application/ld+json">{JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: data.faq.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          })}</script>
        )}
      </Helmet>

      <Navbar />

      <main className="flex-1 max-w-[820px] w-full mx-auto px-4 py-8">
        <nav className="text-xs text-muted-foreground mb-4">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span className="mx-2">/</span>
          <span>{data.h1}</span>
        </nav>

        <article className="prose prose-sm sm:prose max-w-none">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-primary mb-4 leading-tight">{data.h1}</h1>
          <p className="text-base text-muted-foreground mb-8 leading-relaxed">{data.intro}</p>

          {data.sections.map((s) => (
            <section key={s.h2} className="mb-8">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-3">{s.h2}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="text-foreground/90 leading-relaxed mb-3">{p}</p>
              ))}
            </section>
          ))}

          {data.faq && (
            <section className="mb-8">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-4">Frequently Asked Questions</h2>
              {data.faq.map((f) => (
                <div key={f.q} className="mb-4">
                  <h3 className="font-semibold text-foreground mb-1">{f.q}</h3>
                  <p className="text-foreground/80 leading-relaxed">{f.a}</p>
                </div>
              ))}
            </section>
          )}

          <div className="mt-10 p-5 rounded-lg bg-secondary border border-border">
            <h2 className="text-lg font-bold mb-2">Try the free GST Reconciliation Tool</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Reconcile GSTR-2B with Tally or your Purchase Register in seconds. Processed in your browser — no upload, no signup needed to preview.
            </p>
            <Link to="/" className="inline-block px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90">
              Open Reconciliation Tool →
            </Link>
          </div>

          <nav className="mt-10 pt-6 border-t border-border">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Related Guides</h2>
            <ul className="text-sm space-y-1.5">
              <li><Link to="/guide/gst-reconciliation" className="text-primary hover:underline">Complete Guide to GST Reconciliation</Link></li>
              <li><Link to="/guide/gstr-2b-vs-tally" className="text-primary hover:underline">GSTR-2B vs Tally: How to Match Invoices</Link></li>
              <li><Link to="/guide/faq" className="text-primary hover:underline">GST Reconciliation FAQ</Link></li>
              <li><Link to="/guide/troubleshooting" className="text-primary hover:underline">Troubleshooting Reconciliation Mismatches</Link></li>
            </ul>
          </nav>
        </article>
      </main>

      <Footer />
    </div>
  );
};

export default Article;
