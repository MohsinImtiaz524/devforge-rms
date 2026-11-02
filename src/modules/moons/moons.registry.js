// Executable feature ownership belongs in code; catalog metadata cannot add routes.
const REGISTRY = Object.freeze({
  staff: Object.freeze({ key: 'staff', name: 'Staff Management', summary: 'People, employment and team operations.', route: '/app/staff', category: 'people', sortOrder: 10, implemented: true, launchReady: false, permissionModules: ['staff','attendance','leave','payroll','documents','staff_activity'], features: ['Employment profiles','Organization','Attendance','Leave','Payroll','Staff documents'] }),
  analytics: require('./analytics/analytics.moon'),
  website: Object.freeze({ key: 'website', name: 'Website Builder & Publisher', summary: 'Build and publish your business website.', route: null, category: 'web', sortOrder: 20, implemented: false, launchReady: false, permissionModules: [], features: ['Website drafts','Preview','Publishing'] }),
});
const enabled = () => process.env.MOONS_ENABLED === 'true';
module.exports = { REGISTRY, enabled };
