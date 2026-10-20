// Match esbuild's text loader so tests exercise the actual shipped preview stylesheet.
module.exports = {
  process(source) { return { code: `module.exports = ${JSON.stringify(source)};` }; }
};
