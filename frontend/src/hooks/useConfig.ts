/**
 * 7Mail 临时邮箱系统
 * 作者：傲始网络
 * 官网：www.ao-s.cn
 * 公众号：傲始网络
 */

import { createContext, useContext } from "react";

export interface AppConfig {
  emailDomain: string[];
  turnstileKey: string;
  turnstileEnabled: boolean;
  sitePasswordEnabled: boolean;
  apiRateLimitPerMinute: number;
  openApiEnabled: boolean;
  cookiesSecret: string;
  showAff: boolean;
  sendChannel: "" | "resend" | "mailchannels" | "cloudflare";
  senderEmail: string;
  gmailEnabled: boolean;
  gmailSyncAddress?: string;
}

export const ConfigContext = createContext<AppConfig | null>(null);

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig 必须在 ConfigProvider 内部使用");
  }
  return context;
};
