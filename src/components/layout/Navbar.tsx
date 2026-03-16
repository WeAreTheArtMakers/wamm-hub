import { Link, useLocation } from 'react-router-dom';
import { Search, Menu, X, User, LogOut, Music2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clearSession, getSessionUser } from '@/lib/auth';

const baseLinks = [
  { label: 'Discover', href: '/discover' },
  { label: 'Releases', href: '/releases' },
  { label: 'Artists', href: '/artists' },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const [sessionUser, setSessionUser] = useState(() => getSessionUser());
  const navLinks = useMemo(
    () =>
      sessionUser?.role === 'artist'
        ? [...baseLinks, { label: 'Studio', href: '/studio' }]
        : baseLinks,
    [sessionUser?.role],
  );

  useEffect(() => {
    setSessionUser(getSessionUser());
  }, [location.pathname]);

  const handleLogout = () => {
    clearSession();
    setSessionUser(null);
    setMobileOpen(false);
    window.location.href = '/';
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b razor-border bg-background/95 backdrop-blur-md">
      <div className="h-full max-w-[1400px] mx-auto px-4 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 press-effect">
          <div className="w-7 h-7 bg-accent flex items-center justify-center">
            <span className="text-accent-foreground font-black text-xs">W</span>
          </div>
          <span className="font-display text-sm tracking-tight hidden sm:block">WAMM</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={`font-mono-data transition-colors hover:text-foreground ${
                location.pathname === link.href ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <Link
            to="/search"
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Search className="w-4 h-4" />
          </Link>

          {!sessionUser ? (
            <Link
              to="/login"
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 razor-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors font-mono-data"
            >
              <User className="w-3 h-3" />
              <span>Sign In</span>
            </Link>
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              {sessionUser.role === 'artist' && (
                <Link
                  to="/studio"
                  className="flex items-center gap-2 px-3 py-1.5 razor-border text-muted-foreground hover:text-foreground transition-colors font-mono-data"
                >
                  <Music2 className="w-3 h-3" />
                  <span>Studio</span>
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-1.5 razor-border text-muted-foreground hover:text-foreground transition-colors font-mono-data"
              >
                <LogOut className="w-3 h-3" />
                <span>Logout</span>
              </button>
            </div>
          )}

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-8 h-8 flex items-center justify-center text-muted-foreground"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="md:hidden absolute top-14 left-0 right-0 bg-background border-b razor-border p-4 space-y-3"
          >
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setMobileOpen(false)}
                className="block font-mono-data py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
            {!sessionUser ? (
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="block font-mono-data py-2 text-accent"
              >
                Sign In
              </Link>
            ) : (
              <>
                {sessionUser.role === 'artist' && (
                  <Link
                    to="/studio"
                    onClick={() => setMobileOpen(false)}
                    className="block font-mono-data py-2 text-accent"
                  >
                    Studio
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="block font-mono-data py-2 text-accent"
                >
                  Logout
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
