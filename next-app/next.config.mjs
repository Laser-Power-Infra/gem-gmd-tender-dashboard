/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_API_URL || 'http://127.0.0.1:6001';

const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
