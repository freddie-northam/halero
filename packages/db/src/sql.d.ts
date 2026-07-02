// Bun loads .sql imports as text when the import carries
// with { type: "text" }; this teaches TypeScript the same thing.
declare module "*.sql" {
  const contents: string;
  // biome-ignore lint/style/noDefaultExport: Bun text imports expose the file through the default binding.
  export default contents;
}
