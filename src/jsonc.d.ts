// Wildcard ambient module declaration for *.jsonc files.
// Vite transforms these via vite-plugin-jsonc (strips comments → plain JSON export).
declare module '*.jsonc' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value: any;
  export default value;
}
