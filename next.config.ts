import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Включить data/ozhegov.json в serverless bundle для API-роутов.
  // Иначе Next/Vercel не подхватит файл, и fs.readFileSync упадёт ENOENT в проде.
  outputFileTracingIncludes: {
    'app/api/**/*': ['./data/**/*'],
    '/api/**/*':    ['./data/**/*'],
  },
};

export default nextConfig;
