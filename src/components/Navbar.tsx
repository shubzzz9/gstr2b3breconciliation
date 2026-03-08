import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import AuthModal from '@/components/AuthModal';

const Navbar = () => {
  const { user, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="max-w-[1100px] mx-auto px-4 py-4 sm:py-5 flex items-center justify-between">
          {/* Brand - semantic H1 for homepage SEO */}
          <div className="flex items-center gap-3">
            <span className="text-4xl sm:text-5xl leading-none" aria-hidden="true">🧾</span>
            <div>
              <p className="text-sm sm:text-base font-bold tracking-widest uppercase text-muted-foreground" style={{ fontFamily: "'Courier New', Courier, monospace" }}>TechBharat Studios</p>
              <h1 className="text-base sm:text-xl font-extrabold text-primary leading-tight">GST Reconciliation & Audit Tool</h1>
            </div>
          </div>

          {/* Auth section */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {user.email}
                </span>
                <button
                  onClick={() => signOut()}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-secondary transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowAuth(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-secondary transition-colors"
                >
                  Login
                </button>
                <button
                  onClick={() => setShowAuth(true)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-semibold"
                >
                  Sign Up Free
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={() => setShowAuth(false)}
        />
      )}
    </>
  );
};

export default Navbar;