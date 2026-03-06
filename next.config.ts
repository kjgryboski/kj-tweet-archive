/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ["pbs.twimg.com", "cdn.sanity.io"],
  },
};

export default nextConfig;
