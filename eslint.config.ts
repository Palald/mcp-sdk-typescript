import adi from "@the-ihor/adi-eslint-config-typescript";

export default adi({
  // Optional: customize the configuration
  strictMode: false,
  files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
  testFiles: ["**/*.test.{ts,tsx,js,jsx}", "**/*.spec.{ts,tsx,js,jsx}"],
  ignores: [
    "dist/**",
    "build/**", 
    "lib/**",
    "node_modules/**",
    "*.config.js",
    "coverage/**",
  ],
});