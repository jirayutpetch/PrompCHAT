/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  experimental: { optimizePackageImports: ['lucide-react', 'motion'] },
};

export default nextConfig;
