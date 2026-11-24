import { usePaymentOptions } from './usePaymentOptions'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Plus, Minus, Printer, LoaderCircle, AlertCircle, Bell, Trash2, Pencil, Bookmark, Check, ShoppingBasket, CupSoda, House, Milk, Cookie, Orbit, Layers, LayoutGrid, Zap, TableProperties, ChefHat, ChevronDown, ChevronLeft, ChevronRight, Circle, ClipboardList, Image as ImageIcon, PackageOpen, ShoppingCart, Truck, Utensils, X } from 'lucide-react'
import { api, legacyUrl } from '../../api/client'
import { formatShopCurrency as money, getShopCurrency } from '../../currency'
import PosOrdersView from './PosOrdersView'
import PosPaymentModal from './PosPaymentModal'
import PosOrderConfirmation from './PosOrderConfirmation'
import PosTableSelection from './PosTableSelection'
import PosDialog from './PosDialog'
import useOrderWorkload from './useOrderWorkload'
import PosQuickAdd from './PosQuickAdd'
import PosCategoryShortcut from './PosCategoryShortcut'
import PosDeliveryCustomer from './PosDeliveryCustomer'
import { cartItemStock as itemStock, cartSelectionKey as itemSelectionKey, configuredItemName, isRecipeProduct as isRecipe, isRetailOrder, menuStock as productStock, menuVariants, normalizedNote, parseList, saleItemPayload } from './pos.logic'
import { canAssignOrderTaker as mayAssignOrderTaker, orderTakerCandidates, orderTakerId } from './pos.order-taker'
import './pos.generated.css'
import './pos.terminal.css'
import FoodpandaIcon from './FoodpandaIcon'

const emptyForm = { order_source: null, table_id: '', waiter_id: '', rider_id: '', delivery_service_charge: '', delivery_address: '', token_number: '', discount: '', tax_percentage: '', payment_method: 'cash', amount_received: '', customer_name: '', customer_phone: '', customer_id: null, quotation: false, money_received: false, order_note: '' }
const amount = value => money(value, { style: 'decimal' })
const can = (user, key) => user?.role === 'superadmin' || user?.permissions?.includes(key)
const categoryIcon = name => /beverage|drink/i.test(name) ? CupSoda : /house|clean/i.test(name) ? House : /dairy|milk/i.test(name) ? Milk : /snack|biscuit/i.test(name) ? Cookie : /grocer|food/i.test(name) ? ShoppingBasket : PackageOpen
const KITCHEN_NOTES = ['No salt', 'Less spicy', 'Extra spicy', 'No onion', 'No garlic', 'Well done', 'Pack separately']
const ORDER_TYPES = [
  { id: 'walk_in', Icon: ShoppingCart, label: 'Walk-in', description: 'Retail counter order saved before payment' },
  { id: 'dine_in', Icon: Utensils, label: 'Dine-in', description: 'Table, waiter, and kitchen service' },
  { id: 'takeaway', Icon: PackageOpen, label: 'Takeaway', description: 'Counter pickup and token service' },
  { id: 'delivery', Icon: Truck, label: 'Delivery', description: 'Customer address and rider service' },
  { id: 'foodpanda', Icon: FoodpandaIcon, label: 'Foodpanda', description: 'Foodpanda delivery order' }
]

function ProductOptions({ product, close, add, notify }) {
  const variants = menuVariants(product)
  const recipe = isRecipe(product)
  const addons = recipe ? parseList(product.addons) : []
  const defaultVariant = recipe ? variants.find(item => item.is_default) || variants[0] : variants.find(item => item.is_default && Number(item.stock) > 0) || variants.find(item => Number(item.stock) > 0) || null
  const [variant, setVariant] = useState(defaultVariant)
  const [addonQty, setAddonQty] = useState({})
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [componentProducts, setComponentProducts] = useState([])
  const [partValues, setPartValues] = useState({})
  useEffect(() => { if (!parseList(product.components).length) return; api('/api/products').then(rows => setComponentProducts(Array.isArray(rows) ? rows : [])).catch(() => setComponentProducts([])) }, [product])
  const selectedAddons = addons.filter(item => Number(addonQty[item.id || item.addon_id]) > 0).map(item => ({ id: item.id || item.addon_id, name: item.name || item.addon_name, price: Number(item.price || 0), selection_quantity: Number(addonQty[item.id || item.addon_id]) }))
  const unitPrice = Number(variant?.price ?? variant?.selling_price ?? product.selling_price) + selectedAddons.reduce((sum, item) => sum + item.price * item.selection_quantity, 0)
  async function addComponent(component) {
    const child = componentProducts.find(item => Number(item.id) === Number(component.id))
    const quantity = Math.max(1, Number(partValues[component.id]?.quantity || 1))
    const price = Math.max(0, Number(partValues[component.id]?.price ?? component.price ?? child?.selling_price ?? 0))
    const looseStock = Number(child?.stock || 0), needed = quantity - looseStock, perParent = Math.max(1, Number(component.quantity || 1))
    if (needed > 0) {
      const builds = Math.ceil(needed / perParent)
      if (Number(product.stock || 0) < builds) return notify('Not enough bundle stock to harvest this component.', 'error')
      try { await api('/api/products/' + product.id + '/harvest', { method: 'POST', body: { count: builds } }); notify('Component stock harvested from ' + product.name) }
      catch (error) { return notify(error.message, 'error') }
    }
    add({ product: child || component, product_id: child?.id || component.id, parent_id: product.id, name: component.name, quantity, selling_price: price, batch_id: parseList(child?.batches)[0]?.id || null })
  }
  return <PosDialog title={product.name} close={close} className="pos-product-dialog"><div className="pos-config">{parseList(product.components).length > 0 && <fieldset className="components"><legend>Bundle components</legend>{parseList(product.components).map(component => { const child = componentProducts.find(item => Number(item.id) === Number(component.id)); const values = partValues[component.id] || {}; return <div className="component-row" key={component.id}><span><b>{component.name}</b><small>{component.quantity} per bundle ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· {Number(child?.stock || 0)} loose</small></span><input aria-label="Component quantity" type="number" min="1" value={values.quantity || 1} onChange={event => setPartValues(current => ({ ...current, [component.id]: { ...current[component.id], quantity: event.target.value } }))} /><input aria-label="Component price" type="number" min="0" value={values.price ?? component.price ?? child?.selling_price ?? 0} onChange={event => setPartValues(current => ({ ...current, [component.id]: { ...current[component.id], price: event.target.value } }))} /><button type="button" onClick={() => addComponent(component)}>{Number(child?.stock || 0) > 0 ? 'Sell Part' : 'Harvest & Sell'}</button></div> })}</fieldset>}
    {variants.length > 0 && <fieldset><legend>Choose size / variant</legend>{variants.map(item => <label key={item.id || item.name}><input type="radio" checked={Boolean(variant) && String(variant.id ?? variant.name ?? variant.variant_name) === String(item.id ?? item.name ?? item.variant_name)} disabled={!isRecipe(product) && Number(item.stock) <= 0} onChange={() => setVariant(item)} /><span><b>{item.name || item.variant_name}</b><small>{amount(item.price ?? item.selling_price)}{!recipe ? ' - ' + Number(item.stock || 0) + ' left' : ''}</small></span></label>)}</fieldset>}
    {addons.length > 0 && <fieldset><legend>Add-ons</legend>{addons.map(item => { const id = item.id || item.addon_id; return <div className="addon" key={id}><span><b>{item.name || item.addon_name}</b><small>+ {amount(item.price)}</small></span><button onClick={() => setAddonQty(current => ({ ...current, [id]: Math.max(0, Number(current[id] || 0) - 1) }))}>-</button><b>{addonQty[id] || 0}</b><button onClick={() => setAddonQty(current => ({ ...current, [id]: Math.min(99, Number(current[id] || 0) + 1) }))}>+</button></div> })}</fieldset>}
    <label>Kitchen / waiter note<div className="note-suggestions">{KITCHEN_NOTES.map(value => <button type="button" className={note.split(',').map(item => item.trim()).includes(value) ? 'active' : ''} key={value} onClick={() => setNote(current => { const values = current.split(',').map(item => item.trim()).filter(Boolean); const exists = values.includes(value); return (exists ? values.filter(item => item !== value) : [...values, value]).join(', ') })}>{value}</button>)}</div><textarea maxLength="300" value={note} onChange={event => setNote(event.target.value)} /></label>
    <footer><div className="pos-config-quantity"><button type="button" aria-label="Decrease quantity" disabled={Number(quantity) <= 1} onClick={() => setQuantity(Math.max(1, Number(quantity) - 1))}><Minus size={18} /></button><input aria-label="Product quantity" type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value)} onBlur={() => setQuantity(Math.max(1, Math.floor(Number(quantity) || 1)))} /><button type="button" aria-label="Increase quantity" onClick={() => setQuantity((Number(quantity) || 0) + 1)}><Plus size={18} /></button></div><strong>{amount(unitPrice * quantity)}</strong><button disabled={(variants.length > 0 && !variant) || !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1} onClick={() => add({ product, product_id: product.id, name: product.name, quantity: Number(quantity), selling_price: unitPrice, special_instructions: normalizedNote(note) || null, variants: variant ? [{ id: variant.id, name: variant.name || variant.variant_name, price: Number(variant.price ?? variant.selling_price) }] : null, addons: selectedAddons.length ? selectedAddons : null, batch_id: parseList(product.batches)[0]?.id || null, stock_variant_id: !recipe && variant ? Number(variant.id) : null })}>Add to cart</button></footer>
  </div></PosDialog>
}

export default function PosPage() {
  useEffect(() => {
    const preventWheelChange = event => {
      if (event.target instanceof Element && event.target.closest('.pos-page input[type="number"]')) event.preventDefault()
    }
    document.addEventListener('wheel', preventWheelChange, { passive: false })
    return () => document.removeEventListener('wheel', preventWheelChange)
  }, [])
  const [tablesOpen, setTablesOpen] = useState(false)
  const [printing, setPrinting] = useState(null), [assignmentError, setAssignmentError] = useState('')
  const printingRef = useRef(false)
  const [online, setOnline] = useState(navigator.onLine), [unread, setUnread] = useState(null)
  useEffect(() => { const update = () => setOnline(navigator.onLine); addEventListener('online', update); addEventListener('offline', update); return () => { removeEventListener('online', update); removeEventListener('offline', update) } }, [])
  const [user, setUser] = useState(null), [authError, setAuthError] = useState(''), [stage, setStage] = useState('terminal'), [orderType, setOrderType] = useState('')
  usePaymentOptions(user)
  const [products, setProducts] = useState([]), [pagination, setPagination] = useState({ page: 1, page_size: 20, total: 0, total_pages: 1 }), [tables, setTables] = useState([]), [floors, setFloors] = useState([]), [staff, setStaff] = useState([])
  const [categories, setCategories] = useState([])
  const [directVariantSearching, setDirectVariantSearching] = useState(false)
  const [foodpandaEnabled, setFoodpandaEnabled] = useState(false)
  useEffect(() => {
    if (!user) return
    const refresh = () => api('/api/integrations/foodpanda').then(value => setFoodpandaEnabled(value.enabled)).catch(error => { setFoodpandaEnabled(false); console.warn(error.message) })
    refresh(); window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [user])
  const [customerDetailsOpen,setCustomerDetailsOpen]=useState(false)
  const [categoriesCollapsed, setCategoriesCollapsed] = useState(() => !window.matchMedia('(min-width:1024px) and (pointer:fine)').matches || localStorage.getItem('pos_categories_collapsed') === 'true')
  const [layout, setLayout] = useState(() => window.matchMedia('(min-width:1024px) and (pointer:fine)').matches ? 'split' : 'cards'), [checkoutOpen, setCheckoutOpen] = useState(false)
  const [cart, setCart] = useState([]), [form, setForm] = useState(emptyForm), [search, setSearch] = useState(''), [category, setCategory] = useState(''), [config, setConfig] = useState(null)
  const categoryToggleRef = useRef(null), productScrollRef = useRef(null), orderTypesRef = useRef(null), receiptRef = useRef(null), submittingRef = useRef(false), menuRequestRef = useRef(null)
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [toast, setToast] = useState(null), [complete, setComplete] = useState(null), [checkoutPayment, setCheckoutPayment] = useState(null), [editing, setEditing] = useState(null)
  const dismissOrderConfirmation = useCallback(() => setComplete(null), [])
  const showOrderConfirmation = useCallback(result => { setToast(null); setComplete(result) }, [])
  const editSession = useRef(0)
  const discardOrderDraft = useCallback(() => {
    editSession.current++
    setEditing(null); setOrderType(''); setForm(emptyForm); setCart([])
    setConfig(null); setTablesOpen(false); setCustomerDetailsOpen(false); setCheckoutOpen(false); setAssignmentError(''); setError('')
  }, [])
  useEffect(() => () => { editSession.current++ }, [])
  useEffect(() => {
    const leave = () => { editSession.current++; if (editing && !submittingRef.current) discardOrderDraft() }
    window.addEventListener('pagehide', leave)
    return () => window.removeEventListener('pagehide', leave)
  }, [editing, discardOrderDraft])
  useEffect(() => {
    const desktop = window.matchMedia('(min-width:1024px) and (pointer:fine)')
    const update = () => { setLayout(desktop.matches ? 'split' : 'cards'); setCheckoutOpen(false); if (!desktop.matches) setCategoriesCollapsed(true) }
    desktop.addEventListener('change', update)
    return () => desktop.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!user) return
    let active = true
    const update = () => { if (document.hidden) return; api('/api/notifications/unread-count?channel=' + (user.role === 'superadmin' ? 'platform' : 'inbox')).then(result => { if (active) setUnread(Number(result.count) || 0) }).catch(() => { if (active) setUnread(null) }) }
    update(); const timer = setInterval(update, 60000); addEventListener('focus', update)
    return () => { active = false; clearInterval(timer); removeEventListener('focus', update) }
  }, [user])
  const retail = isRetailOrder(user, orderType)
  const saveFirst = retail || user?.shop_type === 'retail_restaurant'
  const directCompletion = user?.shop_type === 'retail'
  const selectedTable = tables.find(item => Number(item.id) === Number(form.table_id))
  const assignedWaiter = [user, ...staff].find(person => Number(person?.id) === Number(form.waiter_id))
  const canAssignOrderTaker = mayAssignOrderTaker(user)
  const workload = useOrderWorkload(Boolean(user && (can(user, 'orders.create') || can(user, 'orders.update'))))
  const orderTakers = orderTakerCandidates(user, staff, orderType)
  const subtotal = cart.reduce((sum, item) => sum + Number(item.quantity) * Number(item.selling_price), 0)
  const discount = Number(form.discount) || 0
  const tax = (subtotal - discount) * (Number(form.tax_percentage) || 0) / 100
  const serviceCharge = orderType === 'delivery' ? Number(form.delivery_service_charge || 0) : orderType === 'foodpanda' && editing ? Number(editing.delivery_service_charge || 0) : 0
  const filtered = products
  const field = (name, value) => setForm(current => ({ ...current, [name]: value }))
  const notify = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3500) }
  const refreshTables = useCallback(() => api('/api/tables').then(rows => setTables(Array.isArray(rows) ? rows : [])).catch(() => {}), [])
  useEffect(() => {
    window.addEventListener('pos:tables-changed', refreshTables)
    return () => window.removeEventListener('pos:tables-changed', refreshTables)
  }, [refreshTables])

  useEffect(() => {
    document.title = 'POS Terminal - ORBIT OS'
    api('/api/auth/me').then(({ user: session }) => {
      if (!can(session, 'orders.create') && !can(session, 'orders.view')) throw new Error('You do not have permission to access POS Terminal.')
      setUser(session)
    }).catch(requestError => requestError.status === 401 ? location.replace(legacyUrl('/')) : setAuthError(requestError.message))
  }, [])
  useEffect(() => {
    if (!user) return
    Promise.all([api('/api/tables'), api('/api/tables/floors'), api('/api/users/assignable'), api('/api/product-categories'), api('/api/shop-settings/pos')])
      .then(([tableRows, floorRows, staffRows, categoryRows, settings]) => { setTables(Array.isArray(tableRows) ? tableRows : []); setFloors(Array.isArray(floorRows) ? floorRows : []); setStaff(Array.isArray(staffRows) ? staffRows : []); setCategories((Array.isArray(categoryRows) ? categoryRows : []).map(item => item.name).filter(Boolean)); const enabled = Boolean(settings?.pos_direct_variant_searching); window.__posDirectVariantSearching = enabled; setDirectVariantSearching(enabled) })
      .catch(requestError => setError(requestError.message))
  }, [user])
  const loadMenu = useCallback((value = search) => {
    const params = new URLSearchParams({ paginate: '1', page: String(pagination.page), page_size: '20', menu_only: '1', exclude_components: '1', search_context: 'pos' })
    params.set('direct_variants', directVariantSearching ? '1' : '0')
    if (value.trim()) params.set('search', value.trim())
    if (category) params.set('category', category)
    const key = params.toString()
    if (menuRequestRef.current?.key === key) return menuRequestRef.current.promise
    const entry = { key, promise: null }
    setLoading(true); setError('')
    entry.promise = api('/api/products?' + params).then(result => {
      if (menuRequestRef.current === entry) {
        const rows = Array.isArray(result?.items) ? result.items : Array.isArray(result) ? result : []
        setProducts(rows)
        setPagination(current => ({ ...result?.pagination || { page: current.page, page_size: 20, total: rows.length, total_pages: 1 }, page: Number(result?.pagination?.page || current.page) }))
      }
      return result
    }).catch(error => { if (menuRequestRef.current === entry) { setError(error.message); menuRequestRef.current = null } throw error }).finally(() => { if (menuRequestRef.current === entry) setLoading(false) })
    menuRequestRef.current = entry
    return entry.promise
  }, [search, category, pagination.page, directVariantSearching])
  useEffect(() => {
    if (!user) return
    const timer = setTimeout(() => { loadMenu().catch(() => { }) }, search ? 180 : 0)
    return () => clearTimeout(timer)
  }, [user, search, loadMenu])

  const baseAllowedTypes = Array.isArray(user?.allowed_order_types) ? user.allowed_order_types : (['retail', 'retail_restaurant'].includes(user?.shop_type) ? ['walk_in', 'dine_in', 'takeaway', 'delivery'] : ['dine_in', 'takeaway', 'delivery'])
  const allowedTypes = [...baseAllowedTypes.filter(type => type !== 'foodpanda'), ...(foodpandaEnabled || editing?.order_type === 'foodpanda' ? ['foodpanda'] : [])]
  const enabledOrderTypes = ORDER_TYPES.filter(({ id }) => allowedTypes.includes(id) && (id !== 'foodpanda' || foodpandaEnabled || form.order_source === 'foodpanda'))
  function toggleCategories(value = !categoriesCollapsed) {
    setCategoriesCollapsed(value)
    localStorage.setItem('pos_categories_collapsed', String(value))
    if (value) categoryToggleRef.current?.focus()
  }
  function chooseCategory(value) {
    setCategory(value); setPagination(current => ({ ...current, page: 1 }))
    if (layout === 'cards') toggleCategories(true)
  }
  function chooseType(value) {
    const source = value === 'foodpanda' ? 'foodpanda' : null
    if (source && !foodpandaEnabled) return notify('Enable Foodpanda in Integrations first.', 'error')

    if (saving || editing || !can(user, 'orders.create') || !allowedTypes.includes(value)) return
    setAssignmentError(''); setOrderType(value)
    setForm(current => ({ ...current, order_source: source, table_id: '', waiter_id: ['waiter','order_taker'].includes(user?.role) ? String(user.id) : '', rider_id: '', delivery_service_charge: '', delivery_address: '', token_number: value === 'takeaway' ? 'TK-' + Date.now() : '' }))
    if (value === 'dine_in') setTablesOpen(true)
  }
  function startNewOrder() { if (submittingRef.current) return; discardOrderDraft(); setStage('terminal') }
  function openOrders() {
    if (submittingRef.current) return
    if (editing) discardOrderDraft()
    else { editSession.current++; setCheckoutOpen(false); setConfig(null); setTablesOpen(false) }
    setStage('orders')
  }
  function clearCart() {
    if (editing && cart.some(item => item.original_quantity) && !can(user, 'orders.remove_items')) return notify('Clearing an existing order requires Remove Order Items access.', 'error')
    setCart([])
  }
  function chooseTable(table) { if (table.status === 'occupied') return notify('This table is currently occupied', 'error'); setOrderType('dine_in'); setForm(current => ({ ...current, table_id: String(table.id), waiter_id: String(table.assigned_waiter_id || (['waiter','order_taker'].includes(user?.role) ? user.id : '')) })); setTablesOpen(false); setCheckoutOpen(true) }
  function addItem(item) {
    const selectionKey = itemSelectionKey(item)
    const existing = cart.find(row => itemSelectionKey(row) === selectionKey)
    const nextQuantity = Number(item.quantity) + Number(existing?.quantity || 0)
    const available = itemStock(item)
    if (Number.isFinite(available) && nextQuantity > available) return notify(`Only ${available} available in stock.`, 'error')
    setCart(current => existing
      ? current.map(row => row.key === existing.key ? { ...row, quantity: nextQuantity, selling_price: item.selling_price } : row)
      : [...current, { ...item, key: crypto.randomUUID?.() || String(Date.now() + Math.random()) }])
    setConfig(null)
  }
  function changeItemQuantity(key, value) {
    const item = cart.find(row => row.key === key)
    if (!item) return
    const quantity = Math.max(1, Number(value) || 1)
    if (editing && quantity < Number(item.original_quantity || 0) && !can(user, 'orders.remove_items')) return notify('Reducing an existing product requires Remove Order Items access.', 'error')
    const available = itemStock(item)
    if (Number.isFinite(available) && quantity > available) return notify(`Only ${available} available in stock.`, 'error')
    setCart(current => current.map(row => row.key === key ? { ...row, quantity } : row))
  }
  async function editOrder(id, previewBill = null) {
    if (!can(user, 'orders.update')) return notify('You do not have permission to edit orders.', 'error')
    const session = ++editSession.current
    try {
      setLoading(true)
      const [details, menu] = await Promise.all([previewBill ? Promise.resolve(previewBill) : api('/api/sales/' + id + '/bill'), api('/api/products')])
      if (session !== editSession.current) return
      if (!details?.sale) throw new Error('Order details not found')
      const productRows = Array.isArray(menu) ? menu : Array.isArray(menu?.items) ? menu.items : []
      const productMap = new Map(productRows.map(product => [Number(product.id), product]))
      setEditing(details.sale)
      setOrderType(details.sale.order_type || 'dine_in')
      setForm({ ...emptyForm, order_source: details.sale.order_type === 'foodpanda' ? 'foodpanda' : null, table_id: String(details.sale.table_id || ''), waiter_id: String(details.sale.waiter_id || ''), rider_id: String(details.sale.rider_id || ''), delivery_service_charge: String(details.sale.delivery_service_charge || ''), delivery_address: details.sale.delivery_address || '', token_number: details.sale.token_number || '', discount: String(details.sale.discount || ''), tax_percentage: String(details.sale.tax_percentage || ''), payment_method: details.sale.payment_method || 'cash', amount_received: String(details.sale.amount_received || ''), customer_name: details.sale.customer_name || '', customer_phone: details.sale.customer_phone || '', customer_id: details.sale.customer_id || null, money_received: Number(details.sale.amount_received || 0) > .01, order_note: details.sale.special_instructions || '' })
      setCart((details.items || []).map(item => ({ product_id: item.product_id, parent_id: item.parent_id || null, name: item.product_name, quantity: Number(item.quantity), original_quantity: Number(item.original_quantity ?? item.quantity), selling_price: Number(item.price_at_sale), special_instructions: item.special_instructions || null, variants: parseList(item.variants_json), addons: parseList(item.addons_json), batch_id: item.batch_id || null, stock_variant_id: item.stock_variant_id || null, product: productMap.get(Number(item.product_id)) || null, key: crypto.randomUUID?.() || String(item.id) })))
      setCheckoutOpen(layout === 'cards')
      setStage('terminal')
      notify('Editing Order #' + (details.sale.order_number || id), 'success')
    } catch (requestError) { notify(requestError.message, 'error') } finally { setLoading(false) }
  }
  function cancelEdit() {
    if (submittingRef.current) return
    if (!confirm('Are you sure you want to cancel editing? Changes will be lost.')) return
    discardOrderDraft(); setStage('orders')
  }
  async function printReceipt(id, format) {
    if (['waiter', 'order_taker'].includes(String(user?.role || '').toLowerCase()) && format !== 'unpaid') { notify('Waiters can only print unpaid bills.', 'error'); return false }
    if (printingRef.current) return false
    printingRef.current = true
    setPrinting(format === 'kitchen' ? 'Sending kitchen ticket to printer...' : format === 'unpaid' ? 'Preparing unpaid bill for printing...' : 'Preparing paid receipt for printing...')
    const browserFallback = format !== 'kitchen'
    try {
      const result = await api('/api/print-jobs/queue', { method: 'POST', body: { sale_id: id, format, shop_id: user.shop_id || null } })
      if (Number(result.queued || 0) > 0) { notify('Print sent to configured printer.'); return true }
      if (browserFallback) { openReceiptWindow(id, format); return true }
      notify('No kitchen printer is assigned for this order', 'error'); return false
    } catch (error) {
      if (browserFallback) { openReceiptWindow(id, format); return true }
      notify(error.message || 'Print failed', 'error'); return false
    } finally { printingRef.current = false; setPrinting(null) }
  }
  function openReceiptWindow(id, format) {
    const params = new URLSearchParams({ format, autoprint: '1' })
    if (user.shop_id) params.set('shop_id', String(user.shop_id))
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timezone) params.set('timezone', timezone)
    params.set('_', String(Date.now()))
    if (receiptRef.current) receiptRef.current.src = '/print/sales/' + encodeURIComponent(id) + '?' + params
  }
  function printTip(id) {
    const params = new URLSearchParams({ autoprint: '1', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
    if (receiptRef.current) receiptRef.current.src = '/print/tips/' + encodeURIComponent(id) + '?' + params + '&_=' + Date.now()
  }
  async function submit(status, openPayment = false) {
    if (submittingRef.current || saving || !cart.length) return
    if (!can(user, editing ? 'orders.update' : 'orders.create')) return notify('You do not have permission to save this order.', 'error')
    if (!allowedTypes.includes(orderType)) { orderTypesRef.current?.focus(); return notify('Please select an order type before placing the order.', 'error') }
    if (form.order_note.trim() && !/^[A-Za-z0-9 ]+$/.test(form.order_note.trim())) return notify('Order Note may contain letters, numbers, and spaces only', 'error')
    if (orderType === 'dine_in' && !form.table_id) return setTablesOpen(true)
    if (orderType === 'delivery' && (!form.customer_name.trim() || !form.customer_phone.trim() || !form.delivery_address.trim())) return setCustomerDetailsOpen(true)
    if (!Number.isFinite(serviceCharge) || serviceCharge < 0 || serviceCharge > 99999999.99 || Math.abs(serviceCharge * 100 - Math.round(serviceCharge * 100)) > .00001) return notify('Enter a valid delivery service charge with at most two decimals.', 'error')
    let selectedOrderTaker
    try { selectedOrderTaker = orderType === 'dine_in' && selectedTable?.assigned_waiter_id && !canAssignOrderTaker ? Number(selectedTable.assigned_waiter_id) : orderTakerId(user, orderTakers, form.waiter_id, orderType); setAssignmentError('') }
    catch (error) { setAssignmentError(error.message); return notify(error.message, 'error') }
    const payload = { delivery_service_charge: serviceCharge, items: cart.map(saleItemPayload), order_note: normalizedNote(form.order_note) || null, discount: Number(form.discount || 0), tax_percentage: Number(form.tax_percentage || 0), payment_method: form.payment_method, amount_received: editing ? Number(editing.amount_received || 0) : 0, customer_name: orderType === 'foodpanda' ? editing?.customer_name || '' : form.customer_name.trim(), customer_phone: orderType === 'foodpanda' ? editing?.customer_phone || '' : form.customer_phone.trim(), customer_id: orderType === 'foodpanda' ? editing?.customer_id || null : form.customer_id || null, delivery_address: orderType === 'foodpanda' ? editing?.delivery_address || '' : form.delivery_address.trim(), order_type: orderType, order_source: form.order_source, table_id: Number(form.table_id) || null, waiter_id: selectedOrderTaker, rider_id: orderType === 'foodpanda' ? null : Number(form.rider_id) || null, kitchen_id: null, guest_count: 1, token_number: orderType === 'takeaway' ? form.token_number.trim() || 'TK-' + Date.now() : null, order_status: status, money_received: false, client_request_id: crypto.randomUUID?.() || 'pos-' + Date.now() }
    try {
      submittingRef.current = true
      setSaving(true)
      setError('')
      const result = await api(editing ? '/api/sales/' + editing.id + '/items' : '/api/sales', { method: editing ? 'PUT' : 'POST', body: payload })
      void refreshTables()
      workload.refresh(true)
      const saleId = result.saleId || editing?.id
      // Match vanilla: Save Order relies on the sales API's category/station jobs.
      // Only the Kitchen action explicitly requests printing when none were queued.
      if (!saveFirst && status === 'pending') {
        if (Number(result.print_jobs_queued) > 0) notify('Kitchen ticket sent to configured printer.')
        else await printReceipt(saleId, 'kitchen')
      }
      setCheckoutOpen(false)
      if (saveFirst) {
        setEditing(null)
        setCart([])
        setForm(emptyForm)
        if (openPayment) {
          setCheckoutPayment({ ...payload, id: saleId, order_number: result.orderNumber || editing?.order_number || saleId, total: Number(result.total || 0), amount_received: 0, tip_amount: 0 })
          notify('Order saved. Complete its payment.')
        } else {
          showOrderConfirmation({id:saleId,number:result.orderNumber||saleId,total:result.total,saved:true,updated:Boolean(editing)})
          setStage('orders')
        }
        return
      }
      showOrderConfirmation({ id: saleId, number: result.orderNumber || editing?.order_number || saleId, total: result.total, token: payload.token_number, updated: Boolean(editing), status })
      discardOrderDraft()
    } catch (requestError) {
      setError(requestError.message)
      notify(requestError.message, 'error')
    } finally {
      submittingRef.current = false
      setSaving(false)
    }
  }

  if (!user && !authError) return <main className="pos-status">Loading POS Terminal...</main>
  if (authError) return <main className="pos-status"><h1>POS Terminal unavailable</h1><p>{authError}</p><a href="/app/lobby">Back to modules</a></main>
  return <div className={`pos-page pos-layout-${layout} ${checkoutOpen ? 'checkout-open' : ''}`}>
    {stage === 'orders' && <PosOrdersView onOrderConfirmed={showOrderConfirmation} user={user} back={startNewOrder} notify={notify} printReceipt={printReceipt} onEdit={editOrder} onNew={startNewOrder} retail={saveFirst} printTip={printTip} />}
    {stage === 'terminal' && <main className="pos-terminal"><section><header className="pos-tools"><button disabled={saving} onClick={() => window.location.assign('/app/lobby')} aria-label="Back to lobby" title="Back to lobby"><ArrowLeft size={18} /></button><div className="pos-heading"><Orbit size={34} /><span className="pos-brand-name"><b>Orbit OS</b></span><span className={'pos-network ' + (online ? 'is-online' : 'is-offline')} role="status" title={online ? 'Online' : 'Offline'}><Circle size={8} fill="currentColor" /><span className="sr-only">{online ? 'Online' : 'Offline'}</span></span></div><PosQuickAdd variantSearch={user?.shop_type==='retail'} configure={setConfig} add={addItem} notify={notify} query={search} loadMenu={loadMenu} onQueryChange={value => { setSearch(value); setPagination(current => ({ ...current, page: 1 })) }} />{can(user, 'orders.view') && <button className="pos-toolbar-action" aria-label="View Orders" title="View Orders" disabled={saving} onClick={openOrders}><ClipboardList size={16} /><span className="pos-toolbar-label">View Orders</span></button>}{allowedTypes.includes('dine_in') && <button className="pos-toolbar-action" aria-label="Tables" title="Tables" onClick={() => setTablesOpen(true)}><TableProperties size={18} /><span className="pos-toolbar-label">Tables</span></button>}<a className="pos-inbox pos-toolbar-action" aria-label="Inbox" href={user.role === 'superadmin' ? '/app/notifications' : '/app/notification-inbox'} target="_blank" rel="noopener noreferrer" title="Open Inbox in a new tab"><Bell size={17} /><span className="pos-toolbar-label">Inbox</span>{unread > 0 && <span className="pos-inbox-count">{unread > 99 ? '99+' : unread}</span>}</a>{layout === 'cards' && <button className="pos-mobile-cart" onClick={() => setCheckoutOpen(true)} aria-label="Open checkout" title="Open cart"><ShoppingCart size={20} /><span className="pos-mobile-cart-count">{cart.reduce((total, item) => total + item.quantity, 0)}</span></button>}</header>{layout === 'cards' && <button className="pos-mobile-categories" type="button" ref={categoryToggleRef} aria-expanded={!categoriesCollapsed} aria-controls="react-pos-category-list" onClick={() => toggleCategories(false)}><Layers size={18} />Categories{category && <span>{category}</span>}<ChevronRight size={16} /></button>}<div className={`pos-catalog-layout ${categoriesCollapsed ? 'is-collapsed' : ''}`}><button className="pos-category-shade" aria-label="Close categories" hidden={categoriesCollapsed} onClick={() => toggleCategories(true)} /><aside className="pos-category-sidebar" aria-label="Product categories"><header><strong>Categories</strong><button type="button" ref={layout === 'split' ? categoryToggleRef : undefined} aria-label={categoriesCollapsed ? 'Expand categories' : 'Collapse categories'} aria-expanded={!categoriesCollapsed} aria-controls="react-pos-category-list" onClick={() => toggleCategories()}>{categoriesCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</button></header><nav className="pos-category-icon-rail" hidden={!categoriesCollapsed} aria-label="Category shortcuts"><PosCategoryShortcut label="All Products" Icon={LayoutGrid} selected={!category} choose={() => chooseCategory('')} />{categories.map(name => <PosCategoryShortcut key={name} label={name} Icon={categoryIcon(name)} selected={category === name} choose={() => chooseCategory(name)} />)}</nav><nav id={layout === 'split' ? 'react-pos-category-list' : undefined} hidden={categoriesCollapsed} aria-label="Categories"><button className={!category ? 'active' : ''} aria-pressed={!category} onClick={() => chooseCategory('')}><LayoutGrid size={20} /> All Products</button>{categories.map(name => { const Icon = categoryIcon(name); return <button className={category === name ? 'active' : ''} aria-pressed={category === name} key={name} onClick={() => chooseCategory(name)}><Icon size={18} />{name}</button> })}</nav><div className="pos-category-help"><Zap size={24} /><div><b>Quick Add</b><p>Select a product or search by barcode to add it to the cart.</p></div></div></aside><div className="pos-catalog-main">{error && <div className="pos-error">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}<div className={layout === 'split' ? 'pos-products pos-products-table' : 'pos-products'} ref={productScrollRef}>{layout === 'split' ? <table><thead><tr><th>SKU</th><th>Product</th><th>Category</th><th>Stock</th><th>Price ({getShopCurrency()})</th></tr></thead><tbody>{loading ? <tr><td colSpan={5}>Loading menu...</td></tr> : filtered.map(product => <tr className={cart.some(item => item.product_id === product.id) ? 'in-cart' : ''} key={product.id} role="button" tabIndex={productStock(product) > 0 && !saving ? 0 : -1} aria-label={'Select ' + product.name} aria-disabled={productStock(product) <= 0 || saving} onClick={() => { if (productStock(product) > 0 && !saving) setConfig(product) }} onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && productStock(product) > 0 && !saving) { event.preventDefault(); setConfig(product) } }}><td>{product.sku || 'N/A'}</td><td><span className="pos-table-product">{product.name}</span></td><td>{product.category_name || product.category || 'Uncategorized'}</td><td><span className={'pos-stock ' + (productStock(product) <= 20 ? 'low' : '')}>{isRecipe(product) ? 'Available' : productStock(product)}</span></td><td>{amount(product.selling_price)}</td></tr>)}</tbody></table> : <>{loading ? <p>Loading menu...</p> : filtered.map(product => <button className="pos-product" disabled={productStock(product) <= 0} onClick={() => setConfig(product)} key={product.id}>{productStock(product) <= 0 && <small className="pos-product-unavailable">Unavailable</small>}<em>{isRecipe(product) ? <ChefHat size={20} /> : productStock(product)}</em><div>{product.image_url ? <img src={product.image_url} alt="" /> : <ImageIcon size={38} />}</div><h3>{product.name}</h3><i />{product.description && <p>{product.description}</p>}<footer><span><small>Price ({getShopCurrency()})</small><b>{amount(product.selling_price)}</b></span></footer></button>)}</>}</div>{pagination.total > 0 && <footer className="pos-pagination"><span>Showing {(pagination.page - 1) * pagination.page_size + 1}-{Math.min(pagination.page * pagination.page_size, pagination.total)} of {pagination.total}</span><div><button disabled={pagination.page <= 1} onClick={() => setPagination(current => ({ ...current, page: current.page - 1 }))}>Previous</button><b>{pagination.page} / {pagination.total_pages}</b><button disabled={pagination.page >= pagination.total_pages} onClick={() => setPagination(current => ({ ...current, page: current.page + 1 }))}>Next</button></div></footer>}</div></div></section>
      <button className="pos-checkout-shade" aria-label="Close checkout" onClick={() => setCheckoutOpen(false)} /><aside className="pos-checkout" aria-label="Checkout">{editing && <div className="pos-edit-banner"><span><Pencil size={14} />Editing #{editing.order_number || editing.id}</span><button type="button" className="pos-cancel-edit" disabled={saving} onClick={cancelEdit}><X size={14} />Cancel Edit</button></div>}<header><fieldset className="pos-order-types" ref={orderTypesRef} tabIndex={-1} aria-required="true"><legend>Order Type <span aria-hidden="true">*</span></legend><div>{enabledOrderTypes.map(({ id, Icon, label }) => <button type="button" key={id} aria-pressed={(orderType) === id} data-order-type={id} className={(orderType) === id ? 'active' : ''} disabled={saving || Boolean(editing) || !can(user, 'orders.create')} onClick={() => chooseType(id)}><Icon size={16} />{label}</button>)}</div></fieldset>{layout === 'cards' && <button aria-label="Close checkout" onClick={() => setCheckoutOpen(false)}><X size={18} /></button>}</header>
        <div className="pos-cart-toolbar"><b className="pos-cart-count" title="Cart items and units">{cart.length} items <small>/ {cart.reduce((sum, item) => sum + Number(item.quantity), 0)} units</small></b><div className="pos-cart-header-actions"><label className={'pos-header-order-taker ' + (assignmentError ? 'has-error' : '')}><span className="sr-only">Order taker</span>{orderType === 'dine_in' && selectedTable?.assigned_waiter_id && !canAssignOrderTaker ? <span title="Assigned by table configuration">{assignedWaiter?.name || assignedWaiter?.username || 'Assigned #' + form.waiter_id} - {workload.label(form.waiter_id)}</span> : canAssignOrderTaker ? <select onFocus={() => workload.refresh()} aria-label="Order taker" aria-invalid={Boolean(assignmentError)} aria-describedby={assignmentError ? 'pos-assignment-error' : undefined} disabled={saving || !orderType || orderType === 'dine_in' && !selectedTable} value={form.waiter_id} onChange={event => { field('waiter_id', event.target.value); setAssignmentError('') }}><option value="">Select order taker</option>{orderTakers.map(person => <option value={person.id} key={person.id}>{person.name || person.username || 'User #' + person.id}{person.id === user.id ? ' (You)' : ''} - {workload.label(person.id)}</option>)}</select> : <span>{assignedWaiter?.name || assignedWaiter?.username || user.name || user.username || 'You'} - {workload.label(form.waiter_id || user.id)}</span>}</label><button aria-label="Clear Cart" title="Clear Cart" disabled={!cart.length || saving} onClick={clearCart}><Trash2 size={14} /><span>Clear</span></button></div></div>
        {workload.error && <div className="pos-workload-note" role="status">Workload unavailable<button type="button" onClick={() => workload.refresh(true)}>Retry</button></div>}
        {assignmentError && <p className="pos-assignment-error" id="pos-assignment-error" role="alert"><AlertCircle size={14} />{assignmentError}</p>}
        {orderType === 'dine_in' && <div className="pos-service pos-table-service"><span className="pos-table-label"><TableProperties size={14} />Table</span><button type="button" className="pos-table-select" aria-label={selectedTable ? 'Change table' : 'Select table'} aria-haspopup="dialog" disabled={saving} onClick={() => setTablesOpen(true)}><span>{selectedTable ? 'Table ' + selectedTable.table_number : 'Select table'}</span><ChevronDown size={14} /></button></div>}
        {orderType === 'foodpanda' && <div className="pos-service">Customer details, delivery and riders are handled by Foodpanda.</div>}
        {orderType === 'delivery' && <div className="pos-service pos-delivery-controls"><label data-filled={Number(form.delivery_service_charge) > 0}><span className="sr-only">Delivery service charge</span><input placeholder="Delivery service charge" aria-label="Delivery service charge" type="number" inputMode="decimal" min="0" max="99999999.99" step="0.01" disabled={saving || Boolean(editing && ['ready','served'].includes(editing.order_status))} value={form.delivery_service_charge} onChange={event=>field('delivery_service_charge',event.target.value)}/></label>{orderType === 'foodpanda' ? <span>Rider: Foodpanda</span> : <label data-filled={Boolean(form.rider_id)}><span className="sr-only">Rider</span><select aria-label="Rider" onFocus={() => workload.refresh()} disabled={saving} value={form.rider_id} onChange={event => field('rider_id', event.target.value)}><option value="">Rider</option>{staff.filter(person => person.role === 'rider').map(person => <option value={person.id} key={person.id}>{person.name || person.username} - {workload.label(person.id, true)}</option>)}</select></label>}<button type="button" className="pos-table-select" data-filled={Boolean(form.customer_name.trim() || form.customer_phone.trim() || form.delivery_address.trim())} aria-haspopup="dialog" disabled={saving} onClick={()=>setCustomerDetailsOpen(true)}><span>Customer details</span><ChevronRight size={14}/></button>{form.customer_name&&<small>{form.customer_name} · {form.customer_phone}</small>}</div>}
        <div className="pos-cart">{cart.length ? cart.map(item => <article key={item.key}><span><span className="pos-cart-product-name">{(!editing || !item.original_quantity || can(user, 'orders.remove_items')) && <button className="pos-cart-delete" aria-label={'Remove ' + configuredItemName(item)} disabled={saving} onClick={() => setCart(current => current.filter(row => row.key !== item.key))}><Trash2 size={14} /></button>}<b>{configuredItemName(item)}</b></span>{item.special_instructions && <small>{item.special_instructions}</small>}</span><b>{amount(item.quantity * item.selling_price)}</b><div><button aria-label={'Decrease ' + configuredItemName(item)} disabled={saving || item.quantity <= Math.max(1, editing && !can(user, 'orders.remove_items') ? Number(item.original_quantity) || 1 : 1)} onClick={() => changeItemQuantity(item.key, item.quantity - 1)}><Minus size={13} /></button><input aria-label={'Quantity of ' + configuredItemName(item)} disabled readOnly tabIndex={-1} type="text" value={item.quantity} /><button aria-label={'Increase ' + configuredItemName(item)} disabled={saving} onClick={() => changeItemQuantity(item.key, item.quantity + 1)}><Plus size={13} /></button></div></article>) : <div className="cart-empty"><ShoppingCart size={34} /><b>Your cart is empty</b><small>Select a product to begin</small></div>}</div>
        <label className="pos-order-note"><Pencil size={15} />Order Note<input aria-label="Order Note" placeholder="Order Note (optional)" value={form.order_note} onChange={event => field('order_note', event.target.value)} maxLength={300} /></label>
        <dl className="pos-terminal-totals">{orderType === 'delivery' && <div><dt>Delivery service charge</dt><dd>{amount(serviceCharge)}</dd></div>}<div className="grand-total"><dt>Grand Total</dt><dd>{money((Math.round((subtotal - discount + tax)*100)+Math.round(serviceCharge*100))/100)}</dd></div></dl>
        <div className={`pos-controls pos-action-only ${directCompletion && can(user, 'orders.take_payment') && can(user, 'orders.complete') ? 'pos-retail-actions' : ''}`}><footer><button className={saveFirst ? 'primary' : 'kitchen'} disabled={saving || !cart.length || !can(user, editing ? 'orders.update' : 'orders.create')} onClick={() => submit(retail ? 'payment_pending' : 'pending')}>{saving ? <LoaderCircle className="pos-spin" size={16} /> : saveFirst ? <Bookmark size={16} /> : <ChefHat size={16} />} {saving ? (printing ? 'Printing kitchen ticket...' : editing ? 'Updating order...' : 'Placing order...') : editing ? (saveFirst ? 'Update Order #' : 'Update Kitchen #') + (editing.order_number || editing.id) : saveFirst ? 'Save Order' : 'Kitchen'}</button>{directCompletion && can(user, 'orders.take_payment') && can(user, 'orders.complete') && <button className="primary" disabled={saving || !cart.length} onClick={() => submit('payment_pending', true)}><Check size={17} /> {saving ? 'Saving order for payment...' : 'Complete Order'}</button>}</footer></div></aside></main>}
    {(printing || saving) && <div className="pos-task-feedback" role="status" aria-live="polite">{printing ? <Printer size={23} /> : <ShoppingCart size={23} />}<div><b>{printing ? 'Printing receipt' : editing ? 'Updating order' : 'Placing order'}</b><small>{printing || 'Saving your items and order details...'}</small></div><LoaderCircle className="pos-spin" size={18} /></div>}
    {layout === 'cards' && !categoriesCollapsed && <PosDialog title="Categories" className="pos-category-dialog" close={() => toggleCategories(true)}><nav id="react-pos-category-list" aria-label="Categories"><button className={!category ? 'active' : ''} aria-pressed={!category} onClick={() => chooseCategory('')}><LayoutGrid size={20} />All Products</button>{categories.map(name => { const Icon = categoryIcon(name); return <button className={category === name ? 'active' : ''} aria-pressed={category === name} key={name} onClick={() => chooseCategory(name)}><Icon size={20} />{name}</button> })}</nav></PosDialog>}
    {customerDetailsOpen&&<PosDeliveryCustomer value={form} close={()=>setCustomerDetailsOpen(false)} save={details=>{setForm(current=>({...current,customer_id:details.customer_id,customer_name:details.customer_name,customer_phone:details.customer_phone,delivery_address:details.delivery_address}));setCustomerDetailsOpen(false)}}/>}
    {tablesOpen && <PosDialog title="Select a Table" className="pos-table-dialog" close={() => setTablesOpen(false)}><PosTableSelection embedded workloadLabel={workload.label} tables={tables} floors={floors} user={user} selectedId={form.table_id} choose={chooseTable} back={() => setTablesOpen(false)} /></PosDialog>}
    {config && <ProductOptions product={config} close={() => setConfig(null)} add={addItem} notify={notify} />}
    {checkoutPayment && <PosPaymentModal user={user} retail={retail} order={checkoutPayment} close={() => setCheckoutPayment(null)} notify={notify} onDone={result => { workload.refresh(true); setCheckoutPayment(null); startNewOrder(); if(result)showOrderConfirmation(result) }} printReceipt={printReceipt} />}
    {complete && <PosOrderConfirmation result={complete} dismiss={dismissOrderConfirmation}/>}
    <iframe ref={receiptRef} title="Receipt print" className="pos-receipt-frame" />
    {toast && <div className={'pos-toast ' + toast.type} role="status"><span>{toast.message}</span><button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification"><X size={16} /></button></div>}
  </div>
}
