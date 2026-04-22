import {Outlet} from '@remix-run/react';

// ─────────────────────────────────────────────────────────────────────────────
// /njmenu — pass-through layout
// ─────────────────────────────────────────────────────────────────────────────
// Remix flat-routes treat `njmenu.tsx` as the parent layout for `njmenu.*`
// children. The leaf at /njmenu lives in `njmenu._index.tsx`; sibling pages
// like /njmenu/login live in `njmenu.login.tsx`. This layout is intentionally
// minimal — header/footer suppression and auth gating happen on the leaf so
// /njmenu/login isn't caught in the auth-redirect loop.
// ─────────────────────────────────────────────────────────────────────────────

export const handle = {hideHeader: true, hideFooter: true};

export default function NJMenuLayout() {
  return <Outlet />;
}
