const Footer = () => {
  return (
    <footer className="bg-card border-t border-border mt-8">
      <div className="max-w-[1100px] mx-auto px-4 py-8">
        {/* Trust indicators */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="text-center p-3">
            <div className="text-2xl mb-1">⚡</div>
            <div className="text-sm font-bold text-foreground">Instant Results</div>
            <div className="text-[11px] text-muted-foreground">Upload & get reconciled files in seconds</div>
          </div>
          <div className="text-center p-3">
            <div className="text-2xl mb-1">🔒</div>
            <div className="text-sm font-bold text-foreground">100% Secure</div>
            <div className="text-[11px] text-muted-foreground">Files processed in-browser, never stored</div>
          </div>
          <div className="text-center p-3">
            <div className="text-2xl mb-1">🎯</div>
            <div className="text-sm font-bold text-foreground">Smart Matching</div>
            <div className="text-[11px] text-muted-foreground">Auto-detects columns & reconciles intelligently</div>
          </div>
          <div className="text-center p-3">
            <div className="text-2xl mb-1">🎁</div>
            <div className="text-sm font-bold text-foreground">10 Free Exports</div>
            <div className="text-[11px] text-muted-foreground">Try the full tool free before committing</div>
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Brand */}
            <div className="text-center md:text-left">
              <div className="text-sm font-bold text-foreground">
                🧾 GST Reconciliation Tool
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
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
