/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist", "unpdf", "sharp", "tesseract.js"],
  },
};

export default nextConfig;
