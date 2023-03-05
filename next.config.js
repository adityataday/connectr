/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      "ipfs.infura.io",
      "statics-polygon-lens-staging.s3.eu-west-1.amazonaws.com",
      "statics-mumbai-lens-staging.s3.eu-west-1.amazonaws.com",
      "avatar.tobi.sh",
      "lens.infura-ipfs.io",
      "",
    ],
  },
};

module.exports = nextConfig;
