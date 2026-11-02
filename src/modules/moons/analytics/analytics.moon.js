// Registration of an unchanged copy of the existing Analytics panel.
module.exports = Object.freeze({
  key: 'analytics', name: 'Analytics', category: 'insights', sortOrder: 0,
  summary: 'Understand sales and business performance.',
  route: '/app/moons/analytics', legacyRoutes: Object.freeze(['/app/analytics','/dashboard#analytics']),
  apiBase: '/api/analytics', implemented: true, launchReady: true,
  entryPermission: 'analytics.view',
  permissionModules: Object.freeze(['analytics']),
  features: Object.freeze(['Overview','Sales analysis','Inventory analysis','Finance analysis','Staff sales analysis','Channel analysis','Reports','AI insights']),
  sharedCoreApis: Object.freeze(['/api/analytics/dashboard-data']),
});
