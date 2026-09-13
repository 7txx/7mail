/**
 * 7Mail 临时邮箱系统
 * 作者：傲始网络
 * 官网：www.ao-s.cn
 * 公众号：傲始网络
 */

import { Modal } from './modal';
import Close from './icons/Close';
import React from 'react';

interface InfoModalProps {
  showModal: boolean;
  setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
  title: string;
  children: React.ReactNode;
}

export function InfoModal({ showModal, setShowModal, title, children }: InfoModalProps) {
  return (
    <Modal showModal={showModal} setShowModal={setShowModal} theme="dark">

      <div className="w-full max-h-[80vh] flex flex-col bg-neutral-800/95 backdrop-blur-xl shadow-xl md:max-w-3xl md:rounded-2xl md:border md:border-cyan-50/20">

        <div className="flex-shrink-0 flex items-center justify-center p-4 border-b border-cyan-50/20 relative">
            <h3 className="font-display text-2xl font-bold text-white">{title}</h3>
            <Close
              className="absolute top-4 right-4 h-6 w-6 text-gray-400 hover:text-white cursor-pointer"
              onClick={() => setShowModal(false)}
              onPointerDown={(e) => e.stopPropagation()}
            />
        </div>

        <div className="flex-grow overflow-y-auto text-white p-6">

            <div className="text-white">{children}</div>
        </div>
      </div>
    </Modal>
  );
}
