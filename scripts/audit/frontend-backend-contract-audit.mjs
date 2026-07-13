import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const apiPrefix = '/api/v1';

const frontendCalls = [
  ['GET', '/b2b/accounts'],
  ['GET', '/b2b/accounts/:id'],
  ['POST', '/b2b/accounts'],
  ['POST', '/b2b/accounts/bulk'],
  ['POST', '/b2b/accounts/:accountId/contacts'],
  ['POST', '/b2b/accounts/:accountId/qualify'],
  ['POST', '/b2b/opportunities'],
  ['PATCH', '/b2b/opportunities/:id/stage'],
  ['POST', '/b2b/proposals'],
  ['PATCH', '/b2b/proposals/:proposalId/send'],
  ['PATCH', '/b2b/proposals/:proposalId/accept'],
  ['PATCH', '/b2b/proposals/:proposalId/reject'],
  ['PATCH', '/b2b/proposals/approvals/:id/decision'],
  ['POST', '/b2b/contracts/from-proposal'],
  ['PATCH', '/b2b/contracts/:contractId/sign-and-activate'],
  ['POST', '/b2b/onboarding/cases'],
  ['POST', '/b2b/onboarding/branches'],
  ['POST', '/b2b/onboarding/merchant-users'],
  ['PATCH', '/b2b/onboarding/cases/:onboardingCaseId/checklist'],
  ['PATCH', '/b2b/onboarding/cases/:onboardingCaseId/activate'],
  ['POST', '/b2b/bnpl/purchases'],
  ['POST', '/b2b/billing/invoices'],
  ['POST', '/b2b/billing/merchant-payments'],
  ['POST', '/b2b/coverage/payables'],
  ['PATCH', '/b2b/coverage/payables/:payableId/paid'],
  ['PATCH', '/b2b/coverage/recoveries/:recoveryId/apply-payment'],
  ['POST', '/b2b/reconciliation/runs'],
  ['POST', '/accounting/financial-structure/legal-entities'],
  ['POST', '/accounting/financial-structure/branches'],
  ['POST', '/accounting/financial-structure/fiscal-years'],
  ['POST', '/accounting/financial-structure/periods'],
  ['POST', '/accounting/financial-structure/ledgers'],
  ['POST', '/accounting/financial-structure/charts-of-accounts'],
  ['GET', '/accounting/financial-structure/gl-accounts'],
  ['POST', '/accounting/financial-structure/gl-accounts'],
  ['POST', '/accounting/financial-structure/tax-codes'],
  ['GET', '/accounting/business-partners'],
  ['POST', '/accounting/business-partners'],
  ['POST', '/accounting/business-partners/roles'],
  ['POST', '/accounting/contracts'],
  ['POST', '/accounting/contracts/terms'],
  ['POST', '/accounting/documents'],
  ['POST', '/accounting/documents/bulk'],
  ['GET', '/accounting/documents/:id'],
  ['PATCH', '/accounting/documents/:id/post'],
  ['POST', '/accounting/documents/:id/reverse'],
  ['POST', '/accounting/billing/events'],
  ['POST', '/accounting/billing/ar-invoices'],
  ['POST', '/accounting/receipts'],
  ['POST', '/accounting/closings/periods/close'],
  ['PATCH', '/accounting/closings/periods/reopen'],
  ['GET', '/admin/ads/dashboard'],
  ['GET', '/admin/ads/advertisers'],
  ['POST', '/admin/ads/advertisers'],
  ['POST', '/admin/ads/advertisers/bulk'],
  ['GET', '/admin/ads/advertisers/:advertiserId'],
  ['POST', '/admin/ads/advertisers/:advertiserId/billing-profiles'],
  ['PATCH', '/admin/ads/advertisers/:advertiserId/status'],
  ['GET', '/admin/ads/campaigns'],
  ['GET', '/admin/ads/campaigns/:campaignId'],
  ['PATCH', '/admin/ads/campaigns/:campaignId/status'],
  ['GET', '/admin/ads/moderation/queue'],
  ['POST', '/admin/ads/moderation/:reviewId/decision'],
  ['GET', '/admin/ads/inventory'],
  ['POST', '/admin/ads/inventory'],
  ['GET', '/admin/ads/policies'],
  ['POST', '/admin/ads/policies'],
  ['POST', '/admin/ads/billing/period-close'],
  ['POST', '/admin/ads/invoices/:invoiceId/payments'],
  ['GET', '/admin/ads/delivery-monitor'],
  ['PATCH', '/admin/ads/events/:eventId/billable-status'],
  ['GET', '/admin/ads/audit'],
  ['POST', '/ads/delivery/select'],
  ['POST', '/ads/events'],
  ['POST', '/ads/events/bulk'],
  ['GET', '/audit/business-actions'],
];

function collectControllerFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return collectControllerFiles(path);
    return path.endsWith('controller.ts') ? [path] : [];
  });
}

function normalizeRoute(route) {
  return `/${route
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment.startsWith(':') ? ':' : segment))
    .join('/')}`;
}

function extractBackendRoutes() {
  return collectControllerFiles('src/modules').flatMap((filePath) => {
    const source = readFileSync(filePath, 'utf8');
    const controllerMatch = source.match(/@Controller\(['"]([^'"]*)['"]\)/);
    const basePath = controllerMatch?.[1] ?? '';
    const routeMatches = [...source.matchAll(/@(Get|Post|Patch|Delete|Put)\((?:['"]([^'"]*)['"])?\)/g)];

    return routeMatches.map((match) => {
      const method = match[1].toUpperCase();
      const routePath = [basePath, match[2] ?? ''].map((value) => value.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
      return {
        method,
        route: normalizeRoute(routePath),
        file: relative(process.cwd(), filePath),
      };
    });
  });
}

const backendRoutes = extractBackendRoutes();
const backendRouteSet = new Set(backendRoutes.map((route) => `${route.method} ${route.route}`));
const missing = frontendCalls.filter(([method, route]) => !backendRouteSet.has(`${method} ${normalizeRoute(route)}`));

console.log(`Frontend calls audited: ${frontendCalls.length}`);
console.log(`Backend routes discovered: ${backendRoutes.length}`);

if (missing.length > 0) {
  console.error('Missing backend contracts:');
  missing.forEach(([method, route]) => console.error(`- ${method} ${route}`));
  process.exit(1);
}

console.log('All frontend service calls match an existing backend route.');
