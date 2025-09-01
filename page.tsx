import Image from "next/image";
import FooterNav from "@/components/FooterNav";

export default function Home() {
  return (
    <div>
      <div className="flex min-h-screen items-center justify-center">
        <h1 className="text-[90px]">アプリ名考えろ</h1>
      </div>
      <FooterNav />
    </div>
  );
}
