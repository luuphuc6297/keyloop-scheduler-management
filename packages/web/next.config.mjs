/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // typedRoutes disabled — string literal navigation is fine for the demo client.
  // If we want to re-enable, switch all router.push/replace calls to use `as Route`
  // or import the typed route helpers from 'next/link' types.
  experimental: { typedRoutes: false },
};

export default nextConfig;
