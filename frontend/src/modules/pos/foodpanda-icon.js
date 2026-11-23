export function foodpandaIconUrl(rows) {
  if (!Array.isArray(rows)) return null
  const normalized = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const uploaded = rows.filter(row => row.image_url)
  const icon = uploaded.find(row => row.key === 'foodpanda') || uploaded.find(row => normalized(row.key) === 'foodpanda' || normalized(row.label) === 'foodpanda')
  return icon?.image_url || null
}
