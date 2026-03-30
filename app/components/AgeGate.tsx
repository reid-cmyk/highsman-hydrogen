import {useState, useEffect} from 'react';
import {IMAGES} from '~/lib/images';

const COOKIE_NAME = 'highsman_age_verified';

function setCookie(name: string, value: string, days: number) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = name + '=' + value + ';expires=' + expires.toUTCString() + ';path=/';
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

export function AgeGate() {
  const [show, setShow] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!getCookie(COOKIE_NAME)) {
      setShow(true);
    }
  }, []);

  const handleYes = () => {
    setCookie(COOKIE_NAME, 'true', 30);
    setShow(false);
  };

  const handleNo = () => {
    setDenied(true);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-[#131313] flex flex-col items-center justify-center overflow-hidden">

      {/* Faint HIGHSMAN watermark background */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
        <span
          className="font-headline font-black uppercase leading-none tracking-tighter whitespace-nowrap"
          style={{fontSize: '22rem', color: 'rgba(255,255,255,0.04)'}}
        >
          HIGHSMAN
        </span>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center text-center px-8 max-w-md w-full">

        {/* Logo */}
        <img
          src={IMAGES.highsmanLogo}
          alt="Highsman"
          className="h-28 w-auto object-contain mb-10"
        />

        {!denied ? (
          <>
            <h1 className="font-headline text-3xl md:text-4xl font-black uppercase text-white mb-5 tracking-widest">
              CHECK POINT
            </h1>
            <p className="font-body text-white/75 text-base md:text-lg mb-10 leading-relaxed">
              You must be 21 or older to access the website.<br />
              Are you over 21 years of age?
            </p>

            <div className="flex gap-4 w-full max-w-xs">
              <button
                onClick={handleNo}
                className="flex-1 py-4 bg-white text-black font-headline text-xl font-bold uppercase tracking-widest hover:bg-gray-100 transition-colors"
              >
                NO
              </button>
              <button
                onClick={handleYes}
                className="flex-1 py-4 bg-primary text-on-primary font-headline text-xl font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"
              >
                YES
              </button>
            </div>

            <p className="text-white/35 text-xs mt-8 max-w-xs leading-relaxed">
              This site uses cookies and by entering you acknowledge that you have read our{' '}
              <a href="/privacy" className="underline text-white/55 hover:text-white transition-colors">
                Privacy and Cookie Notice
              </a>.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-headline text-3xl font-black uppercase text-white mb-5 tracking-widest">
              ACCESS DENIED
            </h1>
            <p className="font-body text-white/75 text-base">
              Sorry, you must be 21 or older to enter this site.
            </p>
          </>
        )}
      </div>

      {/* Spark Greatness tagline */}
      <div className="absolute bottom-8 text-white/30 font-headline text-xs uppercase tracking-[0.4em]">
        SPARK GREATNESS
      </div>
    </div>
  );
}
