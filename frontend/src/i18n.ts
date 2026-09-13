import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import Backend from "i18next-http-backend";

// 这是一个 i18next 的配置文件
i18n
  // 使用 i18next-http-backend 插件，它允许从公共文件夹加载翻译文件
  .use(Backend)
  // 将 i18n 实例传递给 react-i18next，使其可以在 React 组件中使用
  .use(initReactI18next)
  // 初始化 i18next
  .init({
    // 站点仅提供简体中文，强制使用中文
    lng: "zh",
    fallbackLng: "zh",
    supportedLngs: ["zh"],
    // fix: 显式指定要加载的命名空间为 'common'
    // 修复 i18next 默认请求 translation.json 的问题
    ns: ["common"],
    // 默认的命名空间
    defaultNS: "common",
    // React 已经处理了转义，所以这里不需要
    interpolation: {
      escapeValue: false,
    },
    // 后端插件的配置
    backend: {
      // 翻译文件的加载路径
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
  });

export default i18n;
