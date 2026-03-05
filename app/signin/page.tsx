import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { getPageUser } from "@/lib/auth-server";
import { isGoogleOAuthConfigured } from "@/lib/google-oauth";

export default async function SignInPage() {
  const user = await getPageUser();
  if (user) redirect("/dashboard");

  return <AuthForm mode="signin" googleEnabled={isGoogleOAuthConfigured()} />;
}
