const nextConfig = {
  async redirects() {
    return [
      { source: "/", destination: "/skylounge-rooftop", permanent: false },
      // The past Tampa event must not stay purchasable on this deployment.
      { source: "/all-white-party/:path*", destination: "/skylounge-rooftop", permanent: false },
    ];
  },
};

export default nextConfig;
