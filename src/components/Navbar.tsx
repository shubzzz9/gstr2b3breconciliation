import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import AuthModal from '@/components/AuthModal';

const Navbar = () => {
  const { user, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-[1100px] mx-auto px-4 py-3 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🧾</span>
            <div>
              <h1 className="text-sm font-bold text-primary leading-tight">GST Reconciliation Tool</h1>
              <p className="text-[10px] text-muted-foreground leading-tight">by TechBharat Studios</p>
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
