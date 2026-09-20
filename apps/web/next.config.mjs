/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The workspace packages ship TypeScript source, so Next must compile them.
  transpilePackages: ['@nutrisnap/core', '@nutrisnap/ui'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.openfoodfacts.org' },
    ],
  },
};

export default nextConfig;
