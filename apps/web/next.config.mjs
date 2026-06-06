/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@pcc/shared-types'],
  typedRoutes: true,
};

export default nextConfig;
