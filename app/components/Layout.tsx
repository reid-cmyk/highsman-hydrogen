import {Header} from './Header';
import {Footer} from './Footer';
import {AgeGate} from './AgeGate';

export function Layout({children}: {children: React.ReactNode}) {
  return (
    <>
      <AgeGate />
      <Header />
      <main className="pt-20">{children}</main>
      <Footer />
    </>
  );
}
