import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { getPageUser } from "@/lib/auth-server";
import { isGoogleOAuthConfigured } from "@/lib/google-oauth";

export default async function SignUpPage() {
  const user = await getPageUser();
  if (user) redirect("/dashboard");

  return <AuthForm mode="signup" googleEnabled={isGoogleOAuthConfigured()} />;
}
