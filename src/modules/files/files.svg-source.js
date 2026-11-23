// Strip inert export headers for inspection; the original SVG bytes stay intact.
function svgSource(bytes) {
  let source = bytes.toString('utf8').replace(/^\uFEFF/, '');
  source = source.replace(/^\s*<\?xml\s+version\s*=\s*(["'])1\.[01]\1(?:\s+encoding\s*=\s*(["'])utf-8\2)?(?:\s+standalone\s*=\s*(["'])(?:yes|no)\3)?\s*\?>/i, '');
  return source.replace(/<!--(?:[^-]|-(?!-))*-->/g, '');
}
module.exports = { svgSource };
