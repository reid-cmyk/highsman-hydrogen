import {Link} from '@remix-run/react';
import {IMAGES} from '~/lib/images';

const FOOTER_LINKS = [
  {label: 'PRIVACY POLICY', href: '/policies/privacy-policy'},
  {label: 'TERMS OF SERVICE', href: '/policies/terms-of-service'},
  {label: 'CONTACT', href: '/contact'},
  {label: 'WHOLESALE', href: '/contact'},
  {label: 'INSTAGRAM', href: 'https://instagram.com/highsman', external: true},
  {label: 'TWITTER', href: 'https://twitter.com/highsman', external: true},
];

export function Footer() {
  return (
    <footer className="flex flex-col md:flex-row justify-between items-center w-full px-4 md:px-12 py-16 gap-8 bg-[#0E0E0E] border-t border-white/10">
      {/* Brand */}
      <div className="flex flex-col gap-4">
        <img src={IMAGES.highsmanLogo} alt="Highsman" className="h-8 w-auto object-contain" />
        <img src={IMAGES.sparkGreatnessLogoWhite} alt="Spark Greatness" className="h-6 w-auto object-contain opacity-90" />
        <p className="font-body text-[10px] tracking-widest uppercase text-white/50">
          &copy; {new Date().getFullYear()} HIGHSMAN. ALL RIGHTS RESERVED.
        </p>
      </div>

      {/* Links */}
      <div className="flex flex-wrap justify-center gap-8">
        {FOOTER_LINKS.map((link) =>
          link.external ? (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-xs tracking-tight uppercase text-[#C6C6C6] hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ) : (
            <Link
              key={link.label}
              to={link.href}
              className="font-body text-xs tracking-tight uppercase text-[#C6C6C6] hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          ),
        )}
      </div>

      {/* Legal Notice */}
      <div className="flex items-center gap-4">
        <p className="font-body text-[10px] tracking-tight uppercase text-white/40 max-w-[200px] text-right">
          Government Warning: Cannabis products for adult use only. Keep out of
          reach of children.
        </p>
      </div>
    </footer>
  );
}
