import Link from "next/link";
import Image from "next/image";
import rivalboardLogo from "@/content/rivalboard-logo.png";

export default function RivalboardBrand() {
  return (
    <Link href="/dashboard" className="brand" aria-label="Go to dashboard">
      <Image src={rivalboardLogo} alt="Rivalboard" width={32} height={32} className="brand-logo" priority />
      <span className="brand-text">Rivalboard</span>
    </Link>
  );
}
