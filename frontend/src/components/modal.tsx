/**
 * 7Mail 临时邮箱系统
 * 作者：傲始网络
 * 官网：www.ao-s.cn
 * 公众号：傲始网络
 */

import { Dispatch, SetStateAction, useCallback, useEffect, useRef } from 'react';
import useWindowSize from '../hooks/use-window-size';
import Leaflet from './leaflet';

export function Modal({
  children,
  showModal,
  setShowModal,
  theme = 'light',
}: {
  children: React.ReactNode;
  showModal: boolean;
  setShowModal: Dispatch<SetStateAction<boolean>>;
  theme?: 'light' | 'dark';
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const { isMobile } = useWindowSize();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setShowModal(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [modalRef, setShowModal]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowModal(false);
      }
    },
    [setShowModal],
  );

  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  if (isMobile) {
    return showModal ? (
      <Leaflet setShow={setShowModal} showBlur={true} theme={theme}>
        {children}
      </Leaflet>
    ) : null;
  }

  return (
    <>
      {showModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center"
          style={{
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            backgroundColor: "rgba(0, 0, 0, 0.4)",
          }}
        >
          <div
            className="relative z-50 w-full max-w-lg"
            ref={modalRef}
          >
            {children}
          </div>
        </div>
      )}
    </>
  );
}
