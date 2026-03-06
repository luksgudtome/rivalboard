import Image from "next/image";
import rivalboardLogo from "@/content/rivalboard-logo.png";

export default function RivalboardBrand() {
  return (
    <div className="brand">
      <Image src={rivalboardLogo} alt="Rivalboard" width={32} height={32} className="brand-logo" priority />
      <span className="brand-text">Rivalboard</span>
    </div>
  );
}
