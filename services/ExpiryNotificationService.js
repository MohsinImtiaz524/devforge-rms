const db = require('../db/knex');
const preferenceRepository = require('../src/modules/notification-preferences/notification-preferences.repository');
const pushNotificationService = require('./PushNotificationService');
const { getUserPermissions } = require('../authorization/service');
const { MIN_ACTIVE_QUANTITY } = require('../src/modules/inventory/inventory-quantity');

function dateKey(value) {
  if (typeof value === 'string') {
    const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoDate) return isoDate[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

class ExpiryNotificationService {
  // Device subscriptions remain on the server while the PWA is closed. Scan
  // those users independently of notification badge requests.
  async syncSubscribedUsers(permissionLookup = getUserPermissions) {
    const users = await db('push_subscriptions as subscription')
      .join('users as user', 'user.id', 'subscription.user_id')
      .where('subscription.enabled', true)
      .where((query) => query.whereNull('subscription.shop_id').orWhereColumn('subscription.shop_id', 'user.shop_id'))
      .where((query) => query.whereNull('user.status').orWhere('user.status', 'active'))
      .distinct('user.id', 'user.shop_id', 'user.role');
    const usersByShop = new Map();
    for (const user of users) {
      const shopId = Number(user.shop_id);
      if (!Number.isInteger(shopId) || shopId <= 0) continue;
      if (!usersByShop.has(shopId)) usersByShop.set(shopId, []);
      usersByShop.get(shopId).push(user);
    }
    let created = 0;
    for (const [shopId, shopUsers] of usersByShop) {
      try {
        const permissionsByUser = await this.permissionsForShop(shopId, shopUsers, permissionLookup);
        const accessByUser = new Map(shopUsers.map((user) => {
          const permissions = permissionsByUser.get(Number(user.id)) || [];
          return [Number(user.id), {
            permissions,
            canViewIngredients: permissions.includes('raw_stock.view'),
            canViewProducts: permissions.includes('products.view'),
          }];
        }));
        const access = {
          canViewIngredients: [...accessByUser.values()].some((entry) => entry.canViewIngredients),
          canViewProducts: [...accessByUser.values()].some((entry) => entry.canViewProducts),
        };
        if (!access.canViewIngredients && !access.canViewProducts) continue;
        const shopState = await this.loadShopState(shopId, access);
        for (const user of shopUsers) {
          const userAccess = accessByUser.get(Number(user.id));
          try {
            created += await this.syncForUser(user, userAccess.permissions, shopState);
          } catch (error) {
            console.error(`Background inventory notification sync failed for user ${user.id}:`, error.message);
          }
        }
      } catch (error) {
        console.error(`Background inventory notification sync failed for shop ${shopId}:`, error.message);
      }
    }
    return created;
  }

  async permissionsForShop(shopId, users, permissionLookup) {
    if (permissionLookup !== getUserPermissions) {
      const entries = await Promise.all(users.map(async (user) => {
        try {
          return [Number(user.id), await permissionLookup(user)];
        } catch (error) {
          console.error(`Background inventory permission lookup failed for user ${user.id}:`, error.message);
          return [Number(user.id), []];
        }
      }));
      return new Map(entries);
    }
    const rows = await preferenceRepository.userPermissions(shopId);
    const permissionsByUser = new Map();
    for (const row of rows) {
      const userId = Number(row.user_id);
      if (!permissionsByUser.has(userId)) permissionsByUser.set(userId, []);
      permissionsByUser.get(userId).push(row.key);
    }
    // Preserve legacy automatic role assignment without penalizing users that
    // already have normalized role rows.
    for (const user of users) {
      if (!permissionsByUser.has(Number(user.id))) {
        try {
          permissionsByUser.set(Number(user.id), await getUserPermissions(user));
        } catch (error) {
          console.error(`Background inventory permission lookup failed for user ${user.id}:`, error.message);
          permissionsByUser.set(Number(user.id), []);
        }
      }
    }
    return permissionsByUser;
  }

  async loadShopState(shopId, access) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const reportDate = dateKey(today);
    const warningEnd = new Date(today);
    // The previous window used getUTCDate() + 4; alerts begin three days before expiry.
    warningEnd.setUTCDate(warningEnd.getUTCDate() + 3);
    const batchesPromise = access.canViewIngredients
      ? db('raw_stock_batches as b')
        .join('raw_stocks as rs', 'rs.id', 'b.raw_stock_id')
        .where('b.shop_id', shopId).where('rs.shop_id', shopId).where('rs.is_deleted', 0)
        .where('b.quantity', '>=', MIN_ACTIVE_QUANTITY).whereNotNull('b.expiry_date')
        .where('b.expiry_date', '<=', dateKey(warningEnd)).select('b.expiry_date')
      : Promise.resolve([]);
    const ingredientsPromise = access.canViewIngredients
      ? db('raw_stocks').where({ shop_id: shopId, is_deleted: 0 })
        .whereRaw('current_stock <= min_stock_level').select('current_stock')
      : Promise.resolve([]);
    const variantsPromise = access.canViewProducts
      ? db('product_stock_variants as variant').join('products as product', 'product.id', 'variant.product_id')
        .where('variant.shop_id', shopId).where('product.shop_id', shopId)
        .where('product.is_deleted', 0).where('product.product_type', 'stock_based')
        .where('variant.is_active', true).whereRaw('variant.stock <= variant.min_stock_level')
        .select('variant.stock')
      : Promise.resolve([]);
    const [batches, ingredients, variants, settings, recipients] = await Promise.all([
      batchesPromise, ingredientsPromise, variantsPromise,
      preferenceRepository.settings(shopId), preferenceRepository.activeRecipients(shopId),
    ]);
    const configured = new Set(settings.map((row) => row.alert_key));
    const selected = (key) => configured.has(key)
      ? recipients.filter((row) => row.alert_key === key).map((row) => Number(row.user_id))
      : null;
    const nearSelection = selected('inventory.expiry_near');
    const expiredSelection = selected('inventory.expired');
    const lowSelection = selected('inventory.low_stock');
    const outSelection = selected('inventory.out_of_stock');
    const expiryTypes = new Set(batches.flatMap((batch) => {
      const expiryDate = dateKey(batch.expiry_date);
      if (!expiryDate) return [];
      const daysLeft = Math.round((Date.parse(`${expiryDate}T00:00:00Z`) - today.getTime()) / 86400000);
      return [daysLeft < 0 ? 'expired' : 'near'];
    }));
    const stockTypes = (rows, field) => new Set(rows.map((row) => Number(row[field]) <= 0 ? 'out' : 'low'));
    return {
      reportDate,
      expiryTypes,
      ingredientStockTypes: stockTypes(ingredients, 'current_stock'),
      productStockTypes: stockTypes(variants, 'stock'),
      selections: { nearSelection, expiredSelection, lowSelection, outSelection },
    };
  }
  // Item-level expiry-${expired ? 'expired' : 'near'} alerts were replaced by daily summaries.
  async syncForUser(user, permissions = [], shopState = null) {
    const shopId = Number(user?.shop_id);
    const canViewIngredients = permissions.includes('raw_stock.view');
    const canViewProducts = permissions.includes('products.view');
    if (!Number.isInteger(shopId) || shopId <= 0 || (!canViewIngredients && !canViewProducts)) return 0;

    const access = { canViewIngredients, canViewProducts };
    const state = shopState || await this.loadShopState(shopId, access);
    let created = 0;
    if (canViewIngredients) created += await this.syncExpiry(user, shopId, state);
    created += await this.syncOutOfStock(user, shopId, access, state);
    return created;
  }

  async syncExpiry(user, shopId, state) {
    const { reportDate, expiryTypes, selections: { nearSelection, expiredSelection } } = state;
    const alerts = [...expiryTypes].map((type) => type === 'expired' ? {
      alert_key: 'inventory.expired', action_url: `/app/inventory?alert=expiry-expired&report_date=${reportDate}`,
      title: 'Inventory expiry alert', message: 'Check your inventory for expired items.', priority: 'urgent',
    } : {
      alert_key: 'inventory.expiry_near', action_url: `/app/inventory?alert=expiry-near&report_date=${reportDate}`,
      title: 'Inventory expiry warning', message: 'Check your inventory for items near expiry.', priority: 'high',
    });
    const filteredAlerts = alerts.filter((alert) => {
      const selected = alert.alert_key === 'inventory.expired' ? expiredSelection : nearSelection;
      return selected === null || selected.map(Number).includes(Number(user.id));
    });
    return this.reconcile(user, shopId, filteredAlerts, [
      '/app/inventory?alert=expiry-%',
      '/app/inventory?expiry_batch=%',
    ]);
  }

  async syncOutOfStock(user, shopId, access, state) {
    const alertTypes = new Set([
      ...(access.canViewIngredients ? state.ingredientStockTypes : []),
      ...(access.canViewProducts ? state.productStockTypes : []),
    ]);
    const { reportDate, selections: { lowSelection, outSelection } } = state;
    const alerts = [...alertTypes].map((type) => type === 'out' ? {
      alert_key: 'inventory.out_of_stock', action_url: `/app/inventory?alert=out-of-stock&report_date=${reportDate}`,
      title: 'Inventory stock alert', message: 'Check your inventory for out-of-stock items.', priority: 'urgent',
    } : {
      alert_key: 'inventory.low_stock', action_url: `/app/inventory?alert=low-stock&report_date=${reportDate}`,
      title: 'Inventory stock warning', message: 'Check your inventory for items that are near out of stock.', priority: 'high',
    });
    const filteredAlerts = alerts.filter((alert) => {
      const selected = alert.alert_key === 'inventory.out_of_stock' ? outSelection : lowSelection;
      return selected === null || selected.map(Number).includes(Number(user.id));
    });
    return this.reconcile(user, shopId, filteredAlerts, [
      '/app/inventory?alert=out-of-stock%',
      '/app/inventory?alert=low-stock%',
    ]);
  }

  async reconcile(user, shopId, alerts, actionPatterns) {
    const active = await db('notifications')
      .where({ shop_id: shopId, target_user_id: user.id, status: 'active', type: 'inventory' })
      .where(function () {
        actionPatterns.forEach((pattern, index) => {
          if (index === 0) this.where('action_url', 'like', pattern);
          else this.orWhere('action_url', 'like', pattern);
        });
      })
      .select('id', 'action_url');
    const currentUrls = new Set(alerts.map((alert) => alert.action_url));
    const staleIds = active.filter((row) => !currentUrls.has(row.action_url)).map((row) => row.id);
    if (staleIds.length) await db('notifications').whereIn('id', staleIds).update({ status: 'archived', updated_at: db.fn.now() });

    const existingUrls = new Set(active.map((row) => row.action_url));
    const newAlerts = alerts.filter((alert) => !existingUrls.has(alert.action_url));
    const rows = newAlerts.map((alert) => ({
      shop_id: shopId, target_user_id: user.id, created_by_user_id: user.id,
      type: 'inventory', priority: alert.priority || 'high', title: alert.title, message: alert.message,
      action_label: 'Open inventory', action_url: alert.action_url, due_at: alert.due_at || null,
      status: 'active', created_at: db.fn.now(), updated_at: db.fn.now(),
    }));
    if (rows.length) {
      await db('notifications').insert(rows);
      await Promise.all(newAlerts.map((alert) => pushNotificationService.sendToUser(user.id, {
        title: alert.title, body: alert.message, tag: `inventory-${alert.alert_key}-${user.id}-${alert.action_url}`,
        url: alert.action_url,
      }).catch((error) => console.error(`Inventory alert push failed for user ${user.id}:`, error.message))));
    }
    return rows.length;
  }

}

module.exports = new ExpiryNotificationService();
module.exports.dateKey = dateKey;

require('../src/modules/request-monitor/request-monitor.service').monitor.instrumentMethods(module.exports, 'ExpiryNotificationService', ["syncSubscribedUsers","syncForUser","syncExpiry","syncOutOfStock"]);
