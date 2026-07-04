// Vite resolves static asset imports (e.g. `import url from "./logo.png"`)
// to a URL string at build time. Declare the module so tsc understands the
// import shape without a bundler present.
declare module "*.png" {
  const src: string;
  // biome-ignore lint/style/noDefaultExport: Vite asset imports expose the URL through the default binding.
  export default src;
}

// Side-effect CSS imports (Vite injects the stylesheet); no runtime shape.
declare module "*.css" {}
