// Shared with the single-file download. Only Node built-ins may be used here.
function clean(value) {
  return String(value ?? '').replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '')
    .replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\u00d7/g, 'x')
    .replace(/[\u2018\u2019\u2032]/g, "'").replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/[\u00b2\u00b3\u00b9\u2070\u2074-\u2079]/g, character => ({
      '\u2070': '0', '\u00b9': '1', '\u00b2': '2', '\u00b3': '3',
      '\u2074': '4', '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9'
    }[character]))
    .replace(/[\u00a0\u202f]/g, ' ').replace(/\u2026/g, '...').replace(/[\u2022\u00b7]/g, '-');
}
function wrap(value, width) {
  return clean(value).split('\n').flatMap(line => {
    const result = [];
    while (line.length > width) {
      const space = line.lastIndexOf(' ', width);
      const end = space > 0 ? space : width;
      result.push(line.slice(0, end)); line = line.slice(end).trimStart();
    }
    return [...result, line];
  });
}
function encode(document, config, columns = 48) {
  if (![32, 48].includes(columns)) throw new Error('Select 58mm or 80mm paper');
  if (document.type === 'CASH_DRAWER') return Buffer.from([0x1b, 0x70, 0, 25, 250]);
  const chunks = [Buffer.from([0x1b, 0x40])];
  const s = config.receipt;
  function text(value, align = 'left', bold = false, large = false) {
    const lines = wrap(value, large ? Math.floor(columns / 2) : columns).join('\n');
    // Never silently corrupt non-Latin text or allow receipt data to inject commands.
    const unsupported = /[^\x20-\x7e\n\r]/u.exec(lines);
    if (unsupported) {
      const code = unsupported[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
      throw new Error(`Native ESC/POS text currently supports ASCII. Unsupported character ${JSON.stringify(unsupported[0])} (U+${code}) in receipt text: ${lines.slice(0, 100)}. Cash drawer pulses are separate jobs. Use the existing agent for other scripts.`);
    }
    chunks.push(Buffer.from([0x1b, 0x61, { left: 0, center: 1, right: 2 }[align] || 0,
      0x1b, 0x45, bold ? 1 : 0, 0x1d, 0x21, large ? 0x11 : 0]));
    const blankLines = config.templates?.formats?.[document.format]?.blankLinesAfterTextLine ?? 0;
    const feed = '\n'.repeat(1 + blankLines);
    chunks.push(Buffer.from(lines.split('\n').join(feed) + feed, 'ascii'));
    chunks.push(Buffer.from([0x1d, 0x21, 0, 0x1b, 0x45, 0]));
  }
  function gap(pixels) {
    const dots = Math.max(0, Math.min(255, Math.round((Number(pixels) || 0) * 203 / 96)));
    if (dots) chunks.push(Buffer.from([0x1b, 0x4a, dots]));
  }
  function rule() { if (s.divider_style !== 'none') text((s.divider_style === 'solid' ? '=' : '-').repeat(columns)); }
  function row(label, value, bold = false) {
    const right = clean(value);
    const left = wrap(label, Math.max(8, columns - Math.min(right.length, columns - 8) - 1));
    left.slice(0, -1).forEach(line => text(line));
    const last = left.at(-1);
    text(last + ' '.repeat(Math.max(1, columns - last.length - right.length)) + right, 'left', bold);
  }
  function tableRow(cells, widths, aligns, bold = false) {
    const lines = cells.map((cell, i) => wrap(cell, widths[i]));
    for (let line = 0; line < Math.max(...lines.map(parts => parts.length)); line++) {
      text(lines.map((parts, i) => {
        const value = parts[line] || '';
        const padding = widths[i] - value.length;
        return aligns[i] === 'right' ? ' '.repeat(padding) + value
          : aligns[i] === 'center' ? ' '.repeat(Math.floor(padding / 2)) + value + ' '.repeat(Math.ceil(padding / 2))
          : value + ' '.repeat(padding);
      }).join(' '), 'left', bold);
    }
  }
  function image(asset) {
    const data = asset.data_by_width?.[columns] || asset.data;
    if (!data) return;
    chunks.push(Buffer.from([0x1b, 0x61, 1]), Buffer.from(data, 'base64'), Buffer.from('\n'));
  }
  function qr(value) {
    const bytes = Buffer.from(String(value), 'utf8');
    if (!bytes.length || bytes.length > 2048) throw new Error('QR link is too long');
    const n = bytes.length + 3;
    chunks.push(Buffer.from([0x1b, 0x61, 1, 0x1d, 0x28, 0x6b, 4, 0, 49, 65, 50, 0,
      0x1d, 0x28, 0x6b, 3, 0, 49, 67, columns === 32 ? 4 : 6,
      0x1d, 0x28, 0x6b, 3, 0, 49, 69, 49,
      0x1d, 0x28, 0x6b, n & 255, n >> 8, 49, 80, 48]), bytes,
    Buffer.from([0x1d, 0x28, 0x6b, 3, 0, 49, 81, 48, 10]));
  }

  validateTemplates(config.templates);
  const template = config.templates.formats[document.format];
  if (!template) throw new Error('RMS receipt template is missing for this document');
  // ESC 3 sets baseline distance in printer dots (normal Font A is 30 dots).
  if (template.lineSpacingMultiplier) chunks.push(Buffer.from([0x1b, 0x33, Math.round(30 * template.lineSpacingMultiplier)]));
  const context = { receipt: config.receipt, data: document.data || {}, assets: config.assets || [] };
  // Cached presentation values always come from the same RMS configuration as the template.
  context.data = { ...context.data, header: s.receipt_header_text || s.name || 'STORE',
    headerBold: s.header_font_weight === 'bold', headerLarge: Number(s.header_font_size) >= 18,
    extendedBold: s.extended_name_font_weight === 'bold', contactAlign: s.contact_align || 'center',
    footerShopName: Boolean(s.name && !s.use_logo_on_receipt),
    logos: s.use_logo_on_receipt ? context.assets.filter(a => a.kind === 'logo') : [],
    promotions: context.assets.filter(a => a.kind === 'promotion') };
  function value(input, scope) {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      if (input.path) return input.path.split('.').reduce((result, key) => result != null && Object.hasOwn(result, key) ? result[key] : undefined, scope);
      return input;
    }
    if (typeof input !== 'string') return input;
    return input.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (_, key) => String(value({ path: key }, scope) ?? ''));
  }
  function run(nodes, scope) {
    for (const node of nodes) {
      if (node.when && !value(node.when, scope)) continue;
      const align = value(node.align, scope) || 'left';
      const bold = Boolean(value(node.bold, scope));
      switch (node.type) {
        case 'text': text(value(node.value, scope), align, bold, Boolean(value(node.large, scope))); break;
        case 'row': row(value(node.label, scope), value(node.value, scope), bold); break;
        case 'divider': rule(); break;
        case 'gap': gap(value(node.value, scope)); break;
        case 'qr': { const content = value(node.value, scope); if (content) qr(content); break; }
        case 'image': { const asset = value(node.value, scope); if (asset) image(asset); break; }
        case 'each': {
          const list = value(node.value, scope);
          if (!Array.isArray(list) || list.length > 2000) throw new Error('Invalid template list');
          for (const entry of list) run(node.nodes, { ...scope, item: entry });
          break;
        }
        case 'table': {
          const widths = node.widths[columns];
          if (!widths || widths.reduce((a,b) => a+b, 0) + widths.length - 1 > columns) throw new Error('Template table exceeds paper width');
          tableRow(node.headers, widths, node.aligns, true);
          if (node.headerGap) gap(node.headerGap);
          if (node.headerDivider) rule();
          const list = value(node.value, scope);
          if (!Array.isArray(list) || list.length > 2000) throw new Error('Invalid template table data');
          for (const entry of list) {
            tableRow(node.cells.map(cell => value(cell, { ...scope, item: entry })), widths, node.aligns, bold);
            if (node.rowGap) gap(node.rowGap);
          }
          break;
        }
      }
    }
  }
  run(template.nodes, context);
  // Feed a fixed distance before cutting; ESC d depends on the current text
  // line spacing and can leave the footer behind the blade on some printers.
  const feedDots = template.feedBeforeCutDots ?? 80;
  chunks.push(Buffer.from([0x1b, 0x4a, feedDots, 0x1d, 0x56, 0]));
  return Buffer.concat(chunks);
}
function validateTemplates(bundle) {
  if (!bundle || bundle.schema !== 1 || typeof bundle.version !== 'string' || !bundle.formats) throw new Error('Unsupported RMS template schema. Download the latest agent.');
  let count = 0;
  function check(nodes, depth = 0) {
    if (!Array.isArray(nodes) || depth > 6) throw new Error('Invalid RMS template structure');
    for (const node of nodes) {
      if (++count > 500 || !node || !['text','row','divider','gap','qr','image','each','table'].includes(node.type)) throw new Error('Unsupported RMS template operation');
      if (node.type === 'each') check(node.nodes, depth + 1);
      if (node.type === 'table') {
        if (!Array.isArray(node.headers) || node.headers.length < 1 || node.headers.length > 8 || !Array.isArray(node.cells) || node.cells.length !== node.headers.length || !Array.isArray(node.aligns) || node.aligns.length !== node.headers.length) throw new Error('Invalid RMS table template');
        for (const columns of [32,48]) {
          const widths = node.widths?.[columns];
          if (!Array.isArray(widths) || widths.length !== node.headers.length || widths.some(n => !Number.isInteger(n) || n < 1) || widths.reduce((a,b)=>a+b,0)+widths.length-1>columns) throw new Error('Invalid RMS table widths');
        }
      }
    }
  }
  for (const format of ['customer','unpaid','kitchen', ...('shift_close' in bundle.formats ? ['shift_close'] : [])]) {
    if (!bundle.formats[format]) throw new Error('Missing RMS receipt template: '+format);
    const spacing = bundle.formats[format].blankLinesAfterTextLine ?? 0;
    if (!Number.isInteger(spacing) || spacing < 0 || spacing > 3) throw new Error('Invalid RMS receipt line spacing');
    const multiplier = bundle.formats[format].lineSpacingMultiplier ?? 1;
    if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 3) throw new Error('Invalid RMS receipt line spacing multiplier');
    const feed = bundle.formats[format].feedBeforeCutDots ?? 80;
    if (!Number.isInteger(feed) || feed < 0 || feed > 255) throw new Error('Invalid RMS receipt cutter feed');
    check(bundle.formats[format].nodes);
  }
  return true;
}
module.exports = { encode, clean, wrap, validateTemplates };
