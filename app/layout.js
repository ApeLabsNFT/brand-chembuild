import "./globals.css";

export const metadata = {
  title: "Brand — The Science of Permanence",
  description:
    "Precision engineering at the molecular level. Polymer-modified tile adhesives built for the next century.",
  openGraph: {
    title: "Brand — The Science of Permanence",
    description:
      "Precision engineering at the molecular level. Polymer-modified tile adhesives built for the next century.",
    type: "website",
  },
};

export const viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500&family=JetBrains+Mono:wght@300;400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
