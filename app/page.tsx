import { redirect } from "next/navigation";
import { getPageUser } from "@/lib/auth-server";

export default async function HomePage() {
  const user = await getPageUser();
  redirect(user ? "/dashboard" : "/signin");
}
