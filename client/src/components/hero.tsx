import { DottedSurface } from "@/components/ui/dotted-surface";
import { Navigate, useNavigate } from "react-router";
import { useGoogleLogin } from "@react-oauth/google";
import { useState } from "react";
import { googleAuth } from "@/utils/api";
import { useUserData } from "@/hooks/user-data";

function Hero() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const storeData = useUserData();
  const userData = storeData?.data;

  const handleGoogleSuccess = async (authResult: any) => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await googleAuth(authResult.code);
      const { token } = result.data;
      localStorage.setItem("user-info", JSON.stringify({ token }));
      navigate("/dashboard/me");
    } catch {
      setError("Failed to authenticate with Google. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const login = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: (error) => {
      console.error("Google login error:", error);
      setError("Google login failed. Please try again.");
      setIsLoading(false);
    },
    flow: "auth-code",
    scope:
      "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/gmail.send",
  });

  if (userData) {
    return <Navigate to="/dashboard/me" replace />;
  }

  return (
    <div className="relative min-h-screen bg-[#0a0a0f] overflow-hidden">
      {/* Dotted surface background */}
      <DottedSurface className="size-full" />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5">
        {/* Top left - Leave Tracker logo */}
        <img src="/logo-dark.png" alt="Leave Tracker" className="h-12 object-contain" />

        {/* Top right - Strideshift branding */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-bold tracking-widest text-white">STRIDESHIFT</p>
            <p className="text-[10px] tracking-[0.25em] text-zinc-500">GLOBAL</p>
          </div>
        </div>
      </header>

      {/* Center - Sign in */}
      <div className="relative z-10 flex items-center justify-center min-h-[calc(100vh-100px)]">
        <div className="flex flex-col items-center gap-6 px-4">
          <p className="text-zinc-400 text-sm">
            Sign in to access your workspace
          </p>

          {error && (
            <div className="w-full max-w-sm bg-red-900/30 border border-red-800 text-red-300 px-3 py-2 rounded text-sm text-center">
              {error}
            </div>
          )}

          <button
            onClick={() => {
              setIsLoading(true);
              setError(null);
              login();
            }}
            disabled={isLoading}
            className="cursor-pointer flex items-center justify-center gap-3 bg-white hover:bg-gray-100 disabled:bg-gray-200 text-gray-800 font-medium rounded-lg px-8 py-3 transition min-w-[280px]"
          >
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              className="h-5 w-5"
              alt="Google"
            />
            {isLoading ? "Signing in..." : "Sign in with Google"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Hero;
