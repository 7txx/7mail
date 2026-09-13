/**
 * 7Mail 临时邮箱系统
 * 作者：傲始网络
 * 官网：www.ao-s.cn
 * 公众号：傲始网络
 */

import { useTranslation } from "react-i18next";
import { format } from "date-fns/format";

import UserCircleIcon from '../components/icons/UserCircleIcon.tsx';

import type { Email } from '../database_types';

interface MailDetailProps {
  email: Email;
  onClose: () => void;
}

export function MailDetail({ email, onClose }: MailDetailProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col text-white">

      <div className="flex items-start mb-6">
        <div className="flex items-start gap-4 text-sm">
          <div>
            <UserCircleIcon className="w-6 h-6"/>
          </div>
          <div className="grid gap-1">
            <div className="font-semibold">{email.from.name}</div>
            <div className="line-clamp-1 text-xs">{email.subject}</div>
            <div className="line-clamp-1 text-xs">
              <span className="font-medium">{t("Reply-To:")}</span> {email.from.address}
            </div>
          </div>
        </div>
        {email.date && (
          <div className="ml-auto text-xs text-muted-foreground">
            {format(new Date(email.date), "PPpp")}
          </div>
        )}
      </div>

      <div className="flex-1 flex text-sm bg-[#ffffffd6] backdrop-blur-xl rounded-md min-h-0">
        <iframe
            srcDoc={email.html || `<pre>${email.text}</pre>`}
            className="w-full h-[60vh] border-0"
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            title={t("Email Content")}
          />
      </div>
    </div>
  );
}
