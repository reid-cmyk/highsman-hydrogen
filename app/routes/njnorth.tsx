import type {MetaFunction} from '@shopify/remix-oxygen';
import {buildNjTerrLoader} from '~/lib/njterr-loader';
import {NjTerrDashboard} from '~/lib/njterr-dashboard';

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'North Jersey · Spark Team Dashboard · Highsman'},
  {name: 'robots', content: 'noindex, nofollow'},
];

export const loader = buildNjTerrLoader('north');

export default NjTerrDashboard;
