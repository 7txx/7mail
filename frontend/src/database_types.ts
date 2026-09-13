/**
 * 7Mail 临时邮箱系统
 * 作者：傲始网络
 * 官网：www.ao-s.cn
 * 公众号：傲始网络
 */

export type Header = Record<string, string>;

export type Address = {
  address: string;
  name: string;
};

export type Email = {
    id: string;
    messageFrom: string;
    messageTo: string;
    headers: Header[];
    from: Address;
    sender: Address | null;
    replyTo: Address[] | null;
    deliveredTo: string | null;
    returnPath: string | null;
    to: Address[] | null;
    cc: Address[] | null;
    bcc: Address[] | null;
    subject: string | null;
    messageId: string;
    inReplyTo: string | null;
    references: string | null;
    date: string | null;
    html: string | null;
    text: string | null;
    createdAt: Date;
    updatedAt: Date;
};
