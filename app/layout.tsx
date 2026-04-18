import "./globals.css";

export const metadata = {
  title: "🏕️ ForestTime - 숙소 예약 오픈 캘린더",
  description: "자연휴양림 · 국립공원 · 캠핑장 예약 일정 한눈에 보기",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}