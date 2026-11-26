export const metadata = {
  title: "All White R&B Night at SkyLounge - Atlanta Pulse",
  description: "Experience an unforgettable night of R&B at SkyLounge at The Glenn Hotel. All-white attire, premium sound, and Atlanta's top DJs.",
  openGraph: {
    title: "All White R&B Night at SkyLounge",
    description: "Atlanta's premier R&B rooftop experience",
    type: "website",
  },
};

export default function SkyloungeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
