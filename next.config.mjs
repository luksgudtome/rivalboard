/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "prisma", "@prisma/adapter-pg", "pg"],
};

export default nextConfig;
