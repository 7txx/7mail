// worker/src/utils.ts
/**
 * 使用密钥对 Base64 编码的加密文本进行解密。
 * @param encryptedText 加密后的 Base64 编码字符串。
 * @param secret 解密密钥。
 * @returns 解密后的原始文本。
 */
export function decrypt(encryptedText: string, secret: string): string {
  // 首先对 Base64 编码的字符串进行解码
  const text = atob(encryptedText);
  let result = '';
  for (let i = 0; i < text.length; i++) {
    // 同样进行异或操作来还原原始字符
    result += String.fromCharCode(text.charCodeAt(i) ^ secret.charCodeAt(i % secret.length));
  }
  return result;
}