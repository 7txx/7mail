/**
 * 7Mail 临时邮箱系统
 * 作者：傲始网络
 * 官网：www.ao-s.cn
 * 公众号：傲始网络
 */

import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import CheckIcon from './icons/CheckIcon.tsx';
import CopyIcon from './icons/CopyIcon.tsx';

interface CopyButtonProps {
  text: string;
  className?: string;
}

export function CopyButton({ text, className }: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);
  const { t } = useTranslation();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      toast.success(t('Copied to clipboard'));
    } catch (err) {
      console.error('复制文本失败: ', err);
    }
  };

  useEffect(() => {
    if (isCopied) {
      const timer = setTimeout(() => {
        setIsCopied(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isCopied]);

  return (
    <button
      onClick={handleCopy}
      className={clsx(
        "focus:outline-none focus-visible:outline-none",
        className
      )}
      aria-label={t("Copy to clipboard")}
    >
      {isCopied ? (
        <CheckIcon className="h-5 w-5 text-green-500" />
      ) : (
        <CopyIcon className="h-5 w-5 text-gray-400" />
      )}
    </button>
  );
}
