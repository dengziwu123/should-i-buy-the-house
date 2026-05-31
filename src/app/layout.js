import "./globals.css";

export const metadata = {
  title: "Should I Buy The House",
  description: "Screen a US property for investment potential with transparent data confidence."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
