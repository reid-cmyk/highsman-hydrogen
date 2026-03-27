import {Link, useLocation} from '@remix-run/react';
import {useState} from 'react';
import {IMAGES} from '~/lib/images';

const NAV_LINKS = [
  {label: 'HOME', href: '/'},
  {label: 'HIT STICKS', href: '/hit-sticks'},
  {label: 'PRE-ROLLS', href: '/pre-rolls'},
  {label: 'GROUND GAME', href: '/ground-game'},
  {label: 'OUR STRAINS', href: '/our-strains'},
  {label: 'APPAREL', href: '/apparel'},
];

export function Header() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="flex justify-between items-center w-full px-8 py-4 bg-[#131313] fixed top-0 z-50">
      {/* Logo */}
      <Link to="/" className="flex items-center">
        <img src={IMAGES.highsmanLogo} alt="Highsman" className="h-8 w-auto object-contain" />
      </Link>

      {/* Desktop Navigation */}
      <nav className="hidden md:flex gap-8 items-center">
        {NAV_LINKS.map((link) => {
          const isActive = location.pathname === link.href;
          return (
            <Link
              key={link.href}
              to={link.href}
              className={`font-headline uppercase tracking-widest font-bold text-xl transition-colors ${
                isActive
                  ? 'text-white border-b-4 border-white pb-1'
                  : 'text-[#C6C6C6] hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Utility Icons */}
      <div className="flex items-center gap-6">
        <button
          className="hover:bg-surface-bright transition-all duration-200 p-2"
          aria-label="Account"
        >
          <span className="material-symbols-outlined text-white">person</span>
        </button>
        <Link
          to="/cart"
          className="hover:bg-surface-bright transition-all duration-200 p-2 relative"
          aria-label="Cart"
        >
          <span className="material-symbols-outlined text-white">
            shopping_cart
          </span>
        </Link>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden hover:bg-surface-bright transition-all duration-200 p-2"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Menu"
        >
          <span className="material-symbols-outlined text-white">
            {mobileMenuOpen ? 'close' : 'menu'}
          </span>
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="absolute top-full left-0 w-full bg-surface-container-low z-50 md:hidden">
          <nav className="flex flex-col py-4">
            {NAV_LINKS.map((link) => {
              const isActive = location.pathname === link.href;
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-8 py-4 font-headline uppercase tracking-widest font-bold text-xl transition-colors ${
                    isActive
                      ? 'text-white bg-surface-container'
                      : 'text-[#C6C6C6] hover:text-white hover:bg-surface-container'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
