// Executable feature ownership belongs in code; catalog metadata cannot add routes.
const REGISTRY = Object.freeze({
  staff: Object.freeze({ key: 'staff', name: 'Staff Management', summary: 'People, employment and team operations.', route: '/app/staff', category: 'people', sortOrder: 10, implemented: true, launchReady: false, permissionModules: ['staff','attendance','leave','payroll','documents','staff_activity'], features: ['Employment profiles','Organization','Attendance','Leave','Payroll','Staff documents'] }),
  analytics: require('./analytics/analytics.moon'),
  website: require('./website/website.moon'),
});
const enabled = () => process.env.MOONS_ENABLED === 'true';
module.exports = { REGISTRY, enabled };
