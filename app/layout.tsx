import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "偶像应援双打 · Idol Call Mix",
  description: "方向键编舞与鼠标应援交替进行的像素风网页音乐游戏 Demo。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
