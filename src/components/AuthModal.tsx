import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface AuthModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const AuthModal = ({ onClose, onSuccess }: AuthModalProps) => {
  const { signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) { setError(error.message); }
        else { onSuccess(); }
      } else {
        if (!fullName.trim()) { setError('Please enter your full name'); setSubmitting(false); return; }
        const { error } = await signUp(email, password, fullName);
        if (error) { setError(error.message); }
        else { setMessage('Account created! Check your email to verify, then log in.'); setIsLogin(true); }
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="gradient-header text-primary-foreground p-5 text-center">
          <div className="text-3xl mb-1">🔐</div>
          <h2 className="text-lg font-bold">Sign up to Download</h2>
          <p className="text-xs opacity-85 mt-1">Create a free account to export your results</p>
        </div>

        <div className="p-6">
          <div className="flex mb-5 rounded-lg overflow-hidden border border-border">
            <button onClick={() => { setIsLogin(true); setError(''); setMessage(''); }}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${isLogin ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
              Login
            </button>
            <button onClick={() => { setIsLogin(false); setError(''); setMessage(''); }}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${!isLogin ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
              Sign Up
            </button>
          </div>

          {error && <div className="alert-box alert-error mb-3">{error}</div>}
          {message && <div className="alert-box alert-success mb-3">{message}</div>}

          <form onSubmit={handleSubmit} className="space-y-3">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Full Name</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Your full name" required={!isLogin} />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="your@email.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Min 6 characters" required minLength={6} />
            </div>
            <button type="submit" disabled={submitting}
              className="btn-tool bg-primary text-primary-foreground hover:opacity-90">
              {submitting ? 'Please wait...' : isLogin ? 'Login & Download' : 'Create Account'}
            </button>
          </form>

          <div className="mt-4 p-2.5 bg-secondary rounded-lg text-xs text-muted-foreground text-center">
            <strong>🎁 Free trial:</strong> Get 10 free exports after signing up!
          </div>

          <button onClick={onClose} className="btn-tool bg-secondary text-foreground border border-border hover:bg-muted w-full mt-3">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
