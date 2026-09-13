/**
 * 7Mail 临时邮箱系统
 * 作者：傲始网络
 * 官网：www.ao-s.cn
 * 公众号：傲始网络
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home.tsx";
import { ConfigContext, AppConfig } from "./hooks/useConfig.ts";
import { getUnlockStatus, unlockSite } from "./services/api.ts";
import { SiteUnlock } from "./components/SiteUnlock.tsx";
import { Layout } from "./Layout.tsx";

const queryClient = new QueryClient();

function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  useEffect(() => {
    axios
      .get<AppConfig>("/config")
      .then((res) => {
        setConfig(res.data);
      })
      .catch(() => {
        setConfig({
          emailDomain: ["7mail.dev"],
          turnstileKey: "",
          turnstileEnabled: false,
          sitePasswordEnabled: false,
          apiRateLimitPerMinute: 100,
          openApiEnabled: false,
          cookiesSecret: "dev-secret",
          showAff: false,
          sendChannel: "resend",
          senderEmail: "no-reply@7mail.dev",
          gmailEnabled: false,
        });
      });
  }, []);

  useEffect(() => {
    if (!config) {
      return;
    }

    if (!config.sitePasswordEnabled) {
      setIsUnlocked(true);
      return;
    }

    getUnlockStatus()
      .then((status) => {
        setIsUnlocked(status.unlocked || !status.sitePasswordEnabled);
      })
      .catch(() => {
        setIsUnlocked(false);
      });
  }, [config]);

  const handleUnlock = async (password: string) => {
    setIsUnlocking(true);
    setUnlockError(null);
    try {
      await unlockSite(password);
      setIsUnlocked(true);
    } catch (err: any) {
      setUnlockError(err?.message || "Invalid password");
    } finally {
      setIsUnlocking(false);
    }
  };

  if (!config) {
    return (
      <div className="bg-[#1f2023] text-white w-screen h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!isUnlocked) {
    return (
      <SiteUnlock
        onUnlock={handleUnlock}
        isUnlocking={isUnlocking}
        error={unlockError}
      />
    );
  }

  return (
    <ConfigContext.Provider value={config}>

      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>

            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigContext.Provider>
  );
}

export default App;
