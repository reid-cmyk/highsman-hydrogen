import type {MetaFunction} from '@shopify/remix-oxygen';
import {IMAGES} from '~/lib/images';

export const meta: MetaFunction = () => {
  return [
    {title: 'HIGHSMAN | New Jersey Retail Digital Assets'},
    {
      name: 'description',
      content:
        'Digital asset pack for Highsman New Jersey retail partners. Download menu images, social media content, brand assets, and merchandising materials.',
    },
  ];
};

/* âââ ASSET DATA âââ */

const SECTIONS = {
  wholesale: {
    title: 'WHOLESALE & SELL SHEETS',
    id: 'wholesale',
    assets: [
      {
        label: 'Wholesale Menu',
        href: 'https://drive.google.com/file/d/1iYh_SSEmkcXrYYWDtYD2GI0TLHCCO4QB/view?usp=drive_link',
        type: 'pdf',
      },
      {
        label: 'Budtender Education Folder',
        href: 'https://drive.google.com/drive/folders/1weSTaAkmb2fxyy-c6xDFdsP5YHtvkgH5?usp=sharing',
        type: 'folder',
      },
    ],
  },
  merchandising: {
    title: 'RETAIL MERCHANDISING',
    id: 'merchandising',
    assets: [
      {
        label: 'Merchandising Look Book',
        href: 'https://drive.google.com/file/d/1yJ91xuVSTQG2EnrnRbymOkVenJVl3wyc/view?usp=sharing',
        type: 'pdf',
      },
      {
        label: 'Product & Strain Descriptions',
        href: 'https://docs.google.com/document/d/1SS3zu28x1J14tSd2o2nAqSHAurtXnqIi7TOBEqW2ITk/edit?tab=t.0',
        type: 'doc',
      },
    ],
  },
  brand: {
    title: 'BRAND ASSETS',
    id: 'brand',
    assets: [
      {
        label: 'Brand Guidelines',
        href: 'https://drive.google.com/file/d/1XC8mjbPNlW7QGTeMYLYYRctyBmegfaGO/view',
        type: 'pdf',
      },
      {
        label: 'Highsman Logos',
        href: 'https://drive.google.com/drive/u/0/folders/1tYZf-Vhfw5Ggw6Kgq9PuAc8Ria4F1iqb',
        type: 'folder',
      },
      {
        label: 'Images of Ricky Williams',
        href: 'https://drive.google.com/drive/u/0/folders/1949HmhQgvSTN5zT1yFNIdNvhupdOjmmf',
        type: 'folder',
      },
    ],
  },
};

interface MenuAsset {
  label: string;
  href: string;
}

const MENU_IMAGES: {product: string; items: MenuAsset[]}[] = [
  {
    product: 'HIT STICKS',
    items: [
      {
        label: 'Hit Sticks Menu Image 1',
        href: 'https://drive.google.com/drive/folders/1gO8Wn96opUMZufw8Wdh_J809dffmI_Yy',
      },
      {
        label: 'Hit Sticks Menu Image 2',
        href: 'https://drive.google.com/drive/folders/1CyDDrt2yrmO8IHe5xyUgY2zDIlNSbBVP',
      },
    ],
  },
  {
    product: 'GROUND GAME',
    items: [
      {
        label: 'Ground Game Menu Image 1',
        href: 'https://drive.google.com/drive/folders/1u2wNcF2bc6msrQogxJblVXuc2a2GKpsK',
      },
      {
        label: 'Ground Game Menu Image 2',
        href: 'https://drive.google.com/drive/folders/1zRtxFKYq-SJ8h5CDfJCbXIJ_hEFtj16X?usp=drive_link',
      },
    ],
  },
  {
    product: 'TRIPLE THREAT',
    items: [
      {
        label: 'Triple Threat Menu Image 1',
        href: 'https://drive.google.com/drive/folders/1k8aJpDi5K2UthE7r0wtAJ0HThJJrOk8A?usp=drive_link',
      },
    ],
  },
];

interface SocialAsset {
  label: string;
  href: string;
  type: 'image' | 'video';
}

const SOCIAL_MEDIA: SocialAsset[] = [
  {label: 'Social Image 1', href: 'https://drive.google.com/file/d/1o9zuRyXodmQsyYjadIeVcsB_0x97cQYB/view?usp=drive_link', type: 'image'},
  {label: 'Social Image 2', href: 'https://drive.google.com/file/d/1JXSdN3KQNThAT29Nhwi-JPXUd1sapMjA/view?usp=drive_link', type: 'image'},
  {label: 'Social Image 3', href: 'https://drive.google.com/file/d/1I47D96Z-Qz_Zq5V41ksmobJczNFK5iyU/view?usp=drive_link', type: 'image'},
  {label: 'Social Image 4', href: 'https://drive.google.com/file/d/14fFpo-cBvdxze9pkZO6UslqImgJ2K7hh/view?usp=drive_link', type: 'image'},
  {label: 'Social Image 5', href: 'https://drive.google.com/file/d/1fuI2nY3S0ezVF_HGRYHhvz5BXada0zeR/view?usp=drive_link', type: 'image'},
  {label: 'Social Video 1', href: 'https://drive.google.com/file/d/1jnHHG-rx0eMdUDQ5kRohkHoseEtRNoty/view?usp=drive_link', type: 'video'},
  {label: 'Social Video 2', href: 'https://drive.google.com/file/d/1BUcibGIb7kQdMeSi_3y4e0U_G6PjAtIC/view?usp=drive_link', type: 'video'},
  {label: 'Social Video 3', href: 'https://drive.google.com/file/d/1bXNbL_edIW0YAbnGYcuZtagAwUzwjMwa/view?usp=drive_link', type: 'video'},
  {label: 'Social Video 4', href: 'https://drive.google.com/file/d/1JXlm4rPCqe1cp_ZmUTB90GGpRPejwxdJ/view?usp=drive_link', type: 'video'},
  {label: 'Social Video 5', href: 'https://drive.google.com/file/d/1a7C2UmJozM-7T6mo36br7aOLr9O2p1SB/view?usp=drive_link', type: 'video'},
  {label: 'Social Image 6', href: 'https://drive.google.com/file/d/1d3J0mLYF0buJjhswtF2sCUu-zJlkM04Z/view?usp=drive_link', type: 'image'},
  {label: 'Social Image 7', href: 'https://drive.google.com/file/d/1Qv0aKps0itoNc6Y4cFGwqpsUYQJAIyMf/view?usp=drive_link', type: 'image'},
  {label: 'Social Image 8', href: 'https://drive.google.com/file/d/1UwVWFl7lnV7hk8oWsUBBldux_00mMer6/view?usp=drive_link', type: 'image'},
  {label: 'Social Image 9', href: 'https://drive.google.com/file/d/1CV8O2hMm8_03WKqE6rRzCBkpRu4tC9-Q/view?usp=drive_link', type: 'image'},
  {label: 'Social Video 6', href: 'https://drive.google.com/file/d/1MvhA1dT60dCmNPFBVgLwic8AzahJWL8m/view?usp=drive_link', type: 'video'},
  {label: 'Social Video 7', href: 'https://drive.google.com/file/d/1j3RVMUkPGcPvWGepUE4I1BQRNZiPpo51/view?usp=drive_link', type: 'video'},
  {label: 'Social Image 10', href: 'https://drive.google.com/file/d/1VBhj8iBzdWzK1vB7y59DWTPl3ibz3zcm/view?usp=drive_link', type: 'image'},
  {label: 'Social Image 11', href: 'https://drive.google.com/file/d/17t02xr19gOxcFi04GrIt_yZ4M64aPZD0/view?usp=drive_link', type: 'image'},
  {label: 'Social Image 12', href: 'https://drive.google.com/file/d/1yN4NEKei_krf6MaRGMbUhL88avQtRzAr/view?usp=drive_link', type: 'image'},
  {label: 'Social Image 13', href: 'https://drive.google.com/file/d/1swm-VEFnmkMURiindvUc2vtgxeun6caE/view?usp=drive_link', type: 'image'},
  {label: 'Social Video 8', href: 'https://drive.google.com/file/d/19RQaUbvTQui-0z9zMYEax2LocDMWZDiz/view?usp=drive_link', type: 'video'},
  {label: 'Social Video 9', href: 'https://drive.google.com/file/d/14znGa24wGCdbaN97dMW3JAUHoHyRLjJY/view?usp=drive_link', type: 'video'},
  {label: 'Social Video 10', href: 'https://drive.google.com/file/d/1BtNzp-fhSTXU8wt-I9u52WOLehHMQcYA/view?usp=drive_link', type: 'video'},
  {label: 'Social Video 11', href: 'https://drive.google.com/file/d/1V6bspKcd9is4KL5m2dOL8BO65cuGvVk8/view?usp=drive_link', type: 'video'},
];

interface DutchieAsset {
  label: string;
  href: string;
}

const DUTCHIE_BANNERS: DutchieAsset[] = [
  {label: 'Dutchie Banner 1', href: 'https://drive.google.com/file/d/17ppg6h50ZVwhOPGcqF75nnL622idh-C_/view?usp=drive_link'},
  {label: 'Dutchie Banner 2', href: 'https://drive.google.com/file/d/13Z27q0AOpi92a00w1xWewJL2WC9Y7FT_/view?usp=drive_link'},
  {label: 'Dutchie Banner 3', href: 'https://drive.google.com/file/d/18WXSBcBVrFPtJsm_L2pLcGqT0ZyhfSP2/view?usp=drive_link'},
  {label: 'Dutchie Banner 4', href: 'https://drive.google.com/file/d/1AMiKK4mgc7k8H6Tgu1BDevLX2kUhk4uL/view?usp=drive_link'},
  {label: 'Dutchie Banner 5', href: 'https://drive.google.com/file/d/1HqLz4tpM8IQB8E13I8zxuBC_U95IA5CO/view?usp=drive_link'},
  {label: 'Dutchie Banner 6', href: 'https://drive.google.com/file/d/1LItcNa1vF5hPL4Vx0nGYdSJ6iDsVRygz/view?usp=drive_link'},
  {label: 'Dutchie Banner 7', href: 'https://drive.google.com/file/d/1UQ4yDsTWgpBYr98bGHg67b4wEf068PCL/view?usp=drive_link'},
  {label: 'Dutchie Banner 8', href: 'https://drive.google.com/file/d/1JCCm6u8ymaJPMSv2LkQS-ttuVfHer8sg/view?usp=drive_link'},
];

const EMAIL_BANNERS: DutchieAsset[] = [
  {label: 'Email Banner 1', href: 'https://drive.google.com/file/d/1Pt5-dAvGbA11LM4Yp0-9H5k5UCVz2ihF/view'},
  {label: 'Email Banner 2', href: 'https://drive.google.com/file/d/1JS3Ix-59umnjR_Ak_jU1xkOdyh2Tob8k/view'},
  {label: 'Email Banner 3', href: 'https://drive.google.com/file/d/167U3Vo03c3qQMNT6hYlWod6WCTQ6LrCt/view'},
  {label: 'Email Banner 4', href: 'https://drive.google.com/file/d/1yeCF-rnSCZlPAVy4pinFjmEWkbc7HteL/view'},
];

interface MenuAdSize {
  size: string;
  items: DutchieAsset[];
}

const DIGITAL_MENU_ADS: MenuAdSize[] = [
  {
    size: '600Ã600',
    items: [
      {label: '600Ã600 Ad 1', href: 'https://drive.google.com/file/d/1Lm6Tuy3guHSMK0KtiiImit5g6BETtz7Z/view'},
      {label: '600Ã600 Ad 2', href: 'https://drive.google.com/file/d/1xgWtIgzo-0LaqdtUCRylxhlkH55pt79x/view'},
      {label: '600Ã600 Ad 3', href: 'https://drive.google.com/file/d/1uj9R7SNFqj-pKyvp4lny6xaSMcM_cv30/view'},
      {label: '600Ã600 Ad 4', href: 'https://drive.google.com/file/d/14HZXszNsPZmD1EfeILja-IJup8IjByHr/view'},
    ],
  },
  {
    size: '1600Ã200',
    items: [
      {label: '1600Ã200 Ad 1', href: 'https://drive.google.com/file/d/1AuFr-y3X32vEq3-JORuaVidnj0fCAxGL/view'},
      {label: '1600Ã200 Ad 2', href: 'https://drive.google.com/file/d/1Gf9EpR1X2bIBaXVFiRgW4ILXxtx2BxQU/view'},
      {label: '1600Ã200 Ad 3', href: 'https://drive.google.com/file/d/151DXuC9pzjmPtZcQssl3xutUvPxu91FP/view'},
      {label: '1600Ã200 Ad 4', href: 'https://drive.google.com/file/d/1ujyXMr-Aepm3mTwwY7BaIvAo13fWqTK-/view'},
    ],
  },
  {
    size: '1800Ã450',
    items: [
      {label: '1800Ã450 Ad 1', href: 'https://drive.google.com/file/d/1-FpOwncyzMmQSdekyCVMZ96T8QExeRB6/view'},
      {label: '1800Ã450 Ad 2', href: 'https://drive.google.com/file/d/1HYoZOdd0-uDAeBBEfIvB9Mv39jYqfkRL/view'},
      {label: '1800Ã450 Ad 3', href: 'https://drive.google.com/file/d/1jZm0N53m9emFPaF_pJnG_snPZLlMsiWT/view'},
      {label: '1800Ã450 Ad 4', href: 'https://drive.google.com/file/d/1e2ky5ZuLHNCOEY1bicajh5EvBIf1zISQ/view'},
    ],
  },
  {
    size: '1800Ã900',
    items: [
      {label: '1800Ã900 Ad 1', href: 'https://drive.google.com/file/d/1jhw_qCRAdtr7mvQWocU5ZY2w1kdQEZfK/view'},
      {label: '1800Ã900 Ad 2', href: 'https://drive.google.com/file/d/1kLWAnN7sNFhNC9v4n7RqiD6TQGF2cY8d/view'},
      {label: '1800Ã900 Ad 3', href: 'https://drive.google.com/file/d/1H5Pk5XFk6_i9pEP2K-IphtH97ACmgLuX/view'},
      {label: '1800Ã900 Ad 4', href: 'https://drive.google.com/file/d/1DwQ0zevmxzugLqIPujlBiQvXTy53abCc/view'},
    ],
  },
];

const NAV_ITEMS = [
  {label: 'WHOLESALE', href: '#wholesale'},
  {label: 'MENU IMAGES', href: '#menu-images'},
  {label: 'MERCHANDISING', href: '#merchandising'},
  {label: 'SOCIAL MEDIA', href: '#social-media'},
  {label: 'DUTCHIE BANNERS', href: '#dutchie-banners'},
  {label: 'EMAIL BANNERS', href: '#email-banners'},
  {label: 'DIGITAL MENU ADS', href: '#digital-menu-ads'},
  {label: 'BRAND ASSETS', href: '#brand'},
];

/* âââ COMPONENTS âââ */

function DownloadCard({
  label,
  href,
  icon,
}: {
  label: string;
  href: string;
  icon: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group bg-surface border border-outline-variant/20 p-6 flex items-center gap-4 hover:border-primary/60 hover:bg-surface-container transition-all"
    >
      <span className="material-symbols-outlined text-3xl text-primary group-hover:scale-110 transition-transform">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <span className="font-headline text-lg uppercase tracking-wide block truncate">
          {label}
        </span>
      </div>
      <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary group-hover:translate-x-1 transition-all">
        open_in_new
      </span>
    </a>
  );
}

function SectionHeader({
  title,
  id,
  subtitle,
}: {
  title: string;
  id: string;
  subtitle?: string;
}) {
  return (
    <div id={id} className="scroll-mt-32 mb-10">
      <h2 className="font-headline text-4xl md:text-6xl font-bold uppercase tracking-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="font-body text-on-surface-variant mt-2 max-w-2xl">
          {subtitle}
        </p>
      )}
      <div className="w-16 h-1 bg-primary mt-4" />
    </div>
  );
}

function AssetGrid({children}: {children: React.ReactNode}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {children}
    </div>
  );
}

/* âââ PAGE âââ */

export default function NewJersey() {
  const socialImages = SOCIAL_MEDIA.filter((a) => a.type === 'image');
  const socialVideos = SOCIAL_MEDIA.filter((a) => a.type === 'video');

  return (
    <>
      {/* ===== HERO ===== */}
      <section className="relative bg-surface overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-[0.03]">
          <div className="absolute inset-0" style={{backgroundImage: 'repeating-linear-gradient(90deg, white 0px, white 1px, transparent 1px, transparent 80px), repeating-linear-gradient(0deg, white 0px, white 1px, transparent 1px, transparent 80px)'}} />
        </div>

        <div className="relative max-w-7xl mx-auto px-8 md:px-16 py-24 md:py-32">
          <div className="flex flex-col md:flex-row items-start md:items-end gap-8 mb-12">
            <div className="flex-1">
              <span className="font-headline text-sm uppercase tracking-[0.4em] text-on-surface-variant/60 block mb-4">
                RETAIL PARTNER RESOURCES
              </span>
              <h1 className="font-headline text-6xl md:text-[100px] leading-[0.85] font-bold uppercase tracking-tighter">
                NEW JERSEY
              </h1>
              <h2 className="font-headline text-3xl md:text-5xl font-bold uppercase text-primary tracking-tight mt-2">
                DIGITAL ASSET PACK
              </h2>
            </div>
            <div className="md:text-right">
              <p className="font-body text-on-surface-variant max-w-sm">
                Everything you need to market, merchandise, and promote Highsman
                products in your New Jersey dispensary.
              </p>
            </div>
          </div>

          {/* Product badges */}
          <div className="flex flex-wrap gap-3 mb-16">
            <span className="bg-primary text-on-primary font-headline text-sm px-4 py-2 tracking-widest uppercase font-bold">
              HIT STICKS
            </span>
            <span className="bg-primary text-on-primary font-headline text-sm px-4 py-2 tracking-widest uppercase font-bold">
              GROUND GAME
            </span>
            <span className="bg-primary text-on-primary font-headline text-sm px-4 py-2 tracking-widest uppercase font-bold">
              TRIPLE THREAT
            </span>
          </div>

          {/* Quick Nav */}
          <div className="border-t border-outline-variant/20 pt-8">
            <span className="font-headline text-xs uppercase tracking-[0.3em] text-on-surface-variant/50 block mb-4">
              JUMP TO SECTION
            </span>
            <div className="flex flex-wrap gap-3">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="border border-outline-variant/30 px-4 py-2 font-headline text-sm uppercase tracking-wider text-on-surface-variant hover:border-primary hover:text-primary transition-all"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== PRODUCT LINEUP ===== */}
      <section className="bg-surface-container-low px-8 md:px-16 py-20">
        <div className="max-w-7xl mx-auto">
          <span className="font-headline text-xs uppercase tracking-[0.3em] text-on-surface-variant/50 block mb-8">
            THE NJ LINEUP
          </span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Hit Sticks */}
            <div className="bg-surface p-8 border-t-4 border-primary">
              <div className="h-48 flex items-center justify-center mb-6 bg-surface-container-lowest overflow-hidden">
                <img
                  alt="Hit Stick product"
                  className="max-h-full w-auto object-contain"
                  src={IMAGES.hitStickProduct}
                />
              </div>
              <h3 className="font-headline text-3xl font-bold uppercase mb-2">
                HIT STICKS
              </h3>
              <span className="font-headline text-sm text-primary uppercase tracking-wider block mb-3">
                0.5G PERSONAL DOSE
              </span>
              <p className="font-body text-on-surface-variant text-sm">
                Portable, disposable, triple-infused. The personal performance
                dose for on-the-go elevation.
              </p>
            </div>

            {/* Ground Game */}
            <div className="bg-surface p-8 border-t-4 border-primary">
              <div className="h-48 flex items-center justify-center mb-6 bg-surface-container-lowest overflow-hidden">
                <img
                  alt="Ground Game product"
                  className="max-h-full w-auto object-contain"
                  src={IMAGES.groundGameProduct}
                />
              </div>
              <h3 className="font-headline text-3xl font-bold uppercase mb-2">
                GROUND GAME
              </h3>
              <span className="font-headline text-sm text-primary uppercase tracking-wider block mb-3">
                7G READY TO ROLL
              </span>
              <p className="font-body text-on-surface-variant text-sm">
                Premium triple-infused flower, pre-ground for convenience. No
                trim, no shake&mdash;best value per gram.
              </p>
            </div>

            {/* Triple Threat */}
            <div className="bg-surface p-8 border-t-4 border-primary">
              <div className="h-48 flex items-center justify-center mb-6 bg-surface-container-lowest overflow-hidden">
                <img
                  alt="Triple Threat product"
                  className="max-h-full w-auto object-contain"
                  src={IMAGES.preRollsProduct}
                />
              </div>
              <h3 className="font-headline text-3xl font-bold uppercase mb-2">
                TRIPLE THREAT
              </h3>
              <span className="font-headline text-sm text-primary uppercase tracking-wider block mb-3">
                1.2G PRE ROLL
              </span>
              <p className="font-body text-on-surface-variant text-sm">
                20% more product than standard 1G, triple-infused. Built for
                the social session.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== WHOLESALE & SELL SHEETS ===== */}
      <section className="bg-surface px-8 md:px-16 py-20">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            title={SECTIONS.wholesale.title}
            id={SECTIONS.wholesale.id}
            subtitle="Wholesale pricing, sell sheets, and budtender training materials."
          />
          <AssetGrid>
            {SECTIONS.wholesale.assets.map((asset) => (
              <DownloadCard
                key={asset.label}
                label={asset.label}
                href={asset.href}
                icon={asset.type === 'folder' ? 'folder_open' : 'description'}
              />
            ))}
          </AssetGrid>
        </div>
      </section>

      {/* ===== MENU IMAGES BY PRODUCT ===== */}
      <section className="bg-surface-container-low px-8 md:px-16 py-20">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            title="RETAIL MENU IMAGES"
            id="menu-images"
            subtitle="Product images sized for Dutchie, iheartjane, and other digital menus. Organized by product."
          />
          <div className="space-y-12">
            {MENU_IMAGES.map((group) => (
              <div key={group.product}>
                <h3 className="font-headline text-2xl font-bold uppercase mb-4 flex items-center gap-3">
                  <span className="w-8 h-1 bg-primary inline-block" />
                  {group.product}
                </h3>
                <AssetGrid>
                  {group.items.map((item) => (
                    <DownloadCard
                      key={item.label}
                      label={item.label}
                      href={item.href}
                      icon="image"
                    />
                  ))}
                </AssetGrid>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== RETAIL MERCHANDISING ===== */}
      <section className="bg-surface px-8 md:px-16 py-20">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            title={SECTIONS.merchandising.title}
            id={SECTIONS.merchandising.id}
            subtitle="In-store merchandising guidelines, look books, and product descriptions for your menu."
          />
          {/* Company description block */}
          <div className="bg-surface-container-low border-l-4 border-primary p-8 mb-8">
            <h3 className="font-headline text-xl uppercase tracking-wider mb-3 text-on-surface-variant">
              HIGHSMAN COMPANY DESCRIPTION
            </h3>
            <p className="font-body text-on-surface-variant leading-relaxed max-w-3xl">
              Positioned at the intersection of sports and cannabis, Highsman is
              the official lifestyle brand of Ricky Williams. Built on the belief
              that cannabis and athletic performance share common ground &mdash;
              discipline, focus, recovery, and ritual &mdash; Highsman delivers
              premium products for people who take both seriously.
            </p>
          </div>
          <AssetGrid>
            {SECTIONS.merchandising.assets.map((asset) => (
              <DownloadCard
                key={asset.label}
                label={asset.label}
                href={asset.href}
                icon={asset.type === 'doc' ? 'article' : 'description'}
              />
            ))}
          </AssetGrid>
        </div>
      </section>

      {/* ===== SOCIAL MEDIA ===== */}
      <section className="bg-surface-container-low px-8 md:px-16 py-20">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            title="SOCIAL MEDIA POSTS"
            id="social-media"
            subtitle="Co-brandable social media content. Tag @highsman and we'll reshare."
          />

          {/* Images */}
          <h3 className="font-headline text-2xl font-bold uppercase mb-4 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">
              photo_library
            </span>
            IMAGES
          </h3>
          <AssetGrid>
            {socialImages.map((asset) => (
              <DownloadCard
                key={asset.label}
                label={asset.label}
                href={asset.href}
                icon="image"
              />
            ))}
          </AssetGrid>

          {/* Videos */}
          <h3 className="font-headline text-2xl font-bold uppercase mb-4 mt-12 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">
              video_library
            </span>
            VIDEOS
          </h3>
          <AssetGrid>
            {socialVideos.map((asset) => (
              <DownloadCard
                key={asset.label}
                label={asset.label}
                href={asset.href}
                icon="videocam"
              />
            ))}
          </AssetGrid>
        </div>
      </section>

      {/* ===== DUTCHIE BANNERS ===== */}
      <section className="bg-surface px-8 md:px-16 py-20">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            title="DUTCHIE BANNERS"
            id="dutchie-banners"
            subtitle="Banner images sized for Dutchie dispensary menus."
          />
          <AssetGrid>
            {DUTCHIE_BANNERS.map((asset) => (
              <DownloadCard
                key={asset.label}
                label={asset.label}
                href={asset.href}
                icon="web"
              />
            ))}
          </AssetGrid>
        </div>
      </section>

      {/* ===== EMAIL BANNERS ===== */}
      <section className="bg-surface-container-low px-8 md:px-16 py-20">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            title="EMAIL BANNERS"
            id="email-banners"
            subtitle="Header images for promotional emails and newsletters."
          />
          <AssetGrid>
            {EMAIL_BANNERS.map((asset) => (
              <DownloadCard
                key={asset.label}
                label={asset.label}
                href={asset.href}
                icon="mail"
              />
            ))}
          </AssetGrid>
        </div>
      </section>

      {/* ===== DIGITAL MENU ADS ===== */}
      <section className="bg-surface px-8 md:px-16 py-20">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            title="DIGITAL MENU ADS"
            id="digital-menu-ads"
            subtitle="Ad creatives in multiple sizes for digital dispensary menus and displays."
          />
          <div className="space-y-12">
            {DIGITAL_MENU_ADS.map((group) => (
              <div key={group.size}>
                <h3 className="font-headline text-2xl font-bold uppercase mb-4 flex items-center gap-3">
                  <span className="bg-surface-container-highest px-3 py-1 font-headline text-sm tracking-wider">
                    {group.size} PX
                  </span>
                </h3>
                <AssetGrid>
                  {group.items.map((item) => (
                    <DownloadCard
                      key={item.label}
                      label={item.label}
                      href={item.href}
                      icon="ad"
                    />
                  ))}
                </AssetGrid>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== BRAND ASSETS ===== */}
      <section className="bg-surface-container-low px-8 md:px-16 py-20">
        <div className="max-w-7xl mx-auto">
          <SectionHeader
            title={SECTIONS.brand.title}
            id={SECTIONS.brand.id}
            subtitle="Official brand guidelines, logos, and approved imagery."
          />
          <AssetGrid>
            {SECTIONS.brand.assets.map((asset) => (
              <DownloadCard
                key={asset.label}
                label={asset.label}
                href={asset.href}
                icon={asset.type === 'folder' ? 'folder_open' : 'description'}
              />
            ))}
          </AssetGrid>
        </div>
      </section>

      {/* ===== CONTACT CTA ===== */}
      <section className="bg-surface py-24 border-t border-outline-variant/10">
        <div className="max-w-3xl mx-auto px-8 text-center">
          <h2 className="font-headline text-5xl md:text-7xl font-bold uppercase mb-6">
            NEED HELP?
          </h2>
          <p className="font-body text-on-surface-variant text-lg mb-10">
            Questions about assets, merchandising support, or co-marketing
            opportunities? Our team is here to help.
          </p>
          <a
            href="mailto:marketing@highsman.com"
            className="bg-primary text-on-primary font-headline text-2xl font-bold uppercase px-12 py-4 hover:bg-primary-container transition-all inline-flex items-center gap-3 group"
          >
            EMAIL US
            <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
              mail
            </span>
          </a>
          <p className="font-headline text-sm uppercase tracking-[0.3em] text-on-surface-variant/50 mt-6">
            marketing@highsman.com
          </p>
        </div>
      </section>
    </>
  );
}
