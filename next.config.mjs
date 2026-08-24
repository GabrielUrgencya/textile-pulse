/** @type {import('next').NextConfig} */
const nextConfig = {
  // The shared Windows workstation has constrained memory. Limiting build
  // workers prevents parallel page generation from exhausting the host.
  experimental: {
    cpus: 1,
  },
};

export default nextConfig;
