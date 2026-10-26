/* Local QR generation: only the Maps URL is stored, never a QR image. */
(function (root) {
  const cache = new Map();
  function render(value) {
    if (!value || typeof value !== 'string' || value.length > 2048) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return '';
      if (cache.has(value)) return cache.get(value);
      const qr = root.qrcode(0, 'M');
      qr.addData(value, 'Byte');
      qr.make();
      const svg = qr.createSvgTag({cellSize:3, margin:12, scalable:true});
      const html = '<div style="text-align:center;margin:10px auto;break-inside:avoid"><div style="width:32mm;height:32mm;margin:auto" role="img" aria-label="Google Maps location QR code">' + svg + '</div><div style="font-size:10px;margin-top:4px">Scan for Google Maps</div></div>';
      if (cache.size >= 20) cache.clear();
      cache.set(value, html);
      return html;
    } catch { return ''; }
  }
  root.ShopMapsQr = {render};
})(window);
