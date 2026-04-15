import {useMatches} from '@remix-run/react';
import {Header} from './Header';
import {Footer} from './Footer';
import {AgeGate} from './AgeGate';

export function Layout({children}: {children: React.ReactNode}) {
  const matches = useMatches();
  const hideHeader = matches.some((m) => (m.handle as any)?.hideHeader);
  const hideFooter = matches.some((m) => (m.handle as any)?.hideFooter);

  return (
    <>
      <AgeGate />
      {!hideHeader && <Header />}
      <main className={hideHeader ? '' : 'pt-20'}>{children}</main>
      {!hideFooter && <Footer />}
    </>
  );
}
