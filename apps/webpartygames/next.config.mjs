/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingIncludes: {
      "/cards/[...path]": ["./assets/SVG-cards-1.3/**"]
    }
  }
};

export default nextConfig;


