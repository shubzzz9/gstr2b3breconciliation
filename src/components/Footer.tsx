const Footer = () => {
  return (
    <footer className="bg-card border-t border-border mt-8">
      <div className="max-w-[1100px] mx-auto px-4 py-8">
        {/* Trust indicators - moved to top as a compact banner */}
        <div className="flex flex-wrap justify-center gap-4 sm:gap-8 mb-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">⚡ Instant Results</span>
          <span className="flex items-center gap-1">🔒 100% Secure — processed in-browser</span>
          <span className="flex items-center gap-1">🎯 Smart Matching</span>
          <span className="flex items-center gap-1"><span className="flex items-center gap-1">🎁 5 Free Exports</span></span>
        </div>

        <nav aria-label="Guides" className="border-t border-border pt-5 pb-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 text-center md:text-left">Guides</p>
          <ul className="flex flex-wrap justify-center md:justify-start gap-x-5 gap-y-2 text-xs">
            <li><a href="/guide/gst-reconciliation/" className="text-foreground/80 hover:text-primary">GST Reconciliation Guide</a></li>
            <li><a href="/guide/gstr-2b-vs-tally/" className="text-foreground/80 hover:text-primary">GSTR-2B vs Tally</a></li>
            <li><a href="/guide/faq/" className="text-foreground/80 hover:text-primary">FAQ</a></li>
            <li><a href="/guide/troubleshooting/" className="text-foreground/80 hover:text-primary">Troubleshooting</a></li>
          </ul>
        </nav>

        <div className="border-t border-border pt-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Brand */}
            <div className="text-center md:text-left">
              <div className="text-xs text-muted-foreground mt-0.5">
                Built by <span className="font-semibold text-warning">TechBharat Studios</span>
              </div>
            </div>

            {/* Contact */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <a href="mailto:techbharatstudios@gmail.com" className="hover:text-foreground transition-colors flex items-center gap-1">
                📧 techbharatstudios@gmail.com
              </a>
              <a href="https://wa.me/918668606224" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors flex items-center gap-1">
                💬 WhatsApp
              </a>
            </div>
          </div>

          <div className="text-center mt-4 text-[10px] text-muted-foreground">
            © {new Date().getFullYear()} TechBharat Studios. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
