/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Top-level in Next 15 (was experimental in 14). String navigation is fine
  // for the demo client; if we re-enable later we'll switch nav strings to
  // typed `Route` casts.
  typedRoutes: false,
};

export default nextConfig;
