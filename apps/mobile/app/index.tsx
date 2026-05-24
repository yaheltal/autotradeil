import { Redirect } from "expo-router";

import { SplashScreen } from "@/screens/SplashScreen";
import { useAuth } from "@/services/auth";

export default function Index() {
  const { session, ready } = useAuth();
  if (!ready) return <SplashScreen />;
  return <Redirect href={session ? "/(tabs)/dashboard" : "/login"} />;
}
